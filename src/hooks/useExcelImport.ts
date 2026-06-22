import { useCallback, useState } from 'react';
import { Alert } from 'react-native';
import { database, protocolTemplatesCollection, protocolTemplateItemsCollection } from '@db/index';
import {
  importExcelMaestro,
  ExcelImportError,
  type ExcelProtocolGroup,
} from '@services/ExcelImporter';
import { uploadToS3 } from '@services/S3Service';
import { s3ProjectPrefix } from '@config/aws';
import { Q } from '@nozbe/watermelondb';
import { pushProjectToSupabase, seedGroupingPresets } from '@services/SupabaseSyncService';
import type ProtocolTemplate from '@db/models/ProtocolTemplate';
import type ProtocolTemplateItem from '@db/models/ProtocolTemplateItem';
import { useI18n } from '@i18n/index';

export type ImportState =
  | { status: 'idle' }
  | { status: 'picking' }
  | { status: 'importing'; current: number; total: number }
  | { status: 'success'; totalProtocols: number; totalActivities: number; modifiedProtocols: number }
  | { status: 'error'; message: string; missingColumns?: string[] };

/**
 * Hook que importa el Excel maestro y escribe en protocol_templates.
 * Clave compuesta por fila: ID_Protocolo (col A) + PartidaItem (col C).
 * - Si el par existe → actualiza los campos.
 * - Si no existe → inserta.
 * Nunca omite filas.
 */
export function useExcelImport(projectId: string, projectName: string) {
  const { t } = useI18n();
  const [importState, setImportState] = useState<ImportState>({ status: 'idle' });

  const startImport = useCallback(async () => {
    setImportState({ status: 'picking' });

    try {
      const result = await importExcelMaestro();

      if (!result) {
        setImportState({ status: 'idle' });
        return;
      }

      const { protocols } = result;
      setImportState({ status: 'importing', current: 0, total: protocols.length });

      // Cargar plantillas existentes del proyecto
      const existingTemplates = await protocolTemplatesCollection
        .query(Q.where('project_id', projectId))
        .fetch() as ProtocolTemplate[];

      // Map de idProtocolo → template
      const templateByIdProtocolo = new Map<string, ProtocolTemplate>(
        existingTemplates.map((t) => [t.idProtocolo, t])
      );

      // Cargar todos los items de esas plantillas de una vez
      const existingTemplateIds = existingTemplates.map((t) => t.id);
      const existingItems: ProtocolTemplateItem[] = existingTemplateIds.length > 0
        ? await protocolTemplateItemsCollection
            .query(Q.where('template_id', Q.oneOf(existingTemplateIds)))
            .fetch() as ProtocolTemplateItem[]
        : [];

      // Map de "templateId|partidaItem" → item (para lookup rápido)
      const itemKey = (templateId: string, partidaItem: string | null) =>
        `${templateId}|${(partidaItem ?? '').toLowerCase().trim()}`;

      const existingItemMap = new Map<string, ProtocolTemplateItem>(
        existingItems.map((item) => [itemKey(item.templateId, item.partidaItem), item])
      );

      let totalActivities = 0;
      let addedProtocols = 0;
      let modifiedProtocols = 0;

      await database.write(async () => {
        for (let i = 0; i < protocols.length; i++) {
          const group = protocols[i];
          setImportState({ status: 'importing', current: i + 1, total: protocols.length });

          let template = templateByIdProtocolo.get(group.idProtocolo);
          let isNew = false;

          if (!template) {
            // Crear nueva plantilla
            template = await protocolTemplatesCollection.create((t) => {
              t.projectId = projectId;
              t.idProtocolo = group.idProtocolo;
              t.name = group.protocolName;
            }) as ProtocolTemplate;
            templateByIdProtocolo.set(group.idProtocolo, template);
            isNew = true;
            addedProtocols++;
          }

          let protocolModified = false;

          // v34 — Auto-asignación de partidas reservadas (paridad con la web):
          // headers `col-[…]` → __hdrN__; matrices `matrix-[Mx]`/val puros →
          // __matrix_Mx_N__. Sin esto, varias filas con partida vacía colisionan
          // en la clave (template|partida) y se pisan entre sí.
          {
            let hdrCounter = 0;
            let currentMatrix: string | null = null;
            let rowCounter = 0;
            for (const activity of group.activities) {
              const m = (activity.metodoValidacion ?? '').trim();
              if (/^col-\[/i.test(m)) {
                hdrCounter++;
                if (!activity.partidaItem) activity.partidaItem = `__hdr${hdrCounter}__`;
                continue;
              }
              const mh = m.match(/^matrix-\[([A-Za-z0-9_-]+)\]/i);
              if (mh) {
                currentMatrix = mh[1];
                rowCounter = 0;
                if (!activity.partidaItem) activity.partidaItem = `__matrix_${currentMatrix}__`;
                continue;
              }
              const isPureValRow = /^val-\[/i.test(m)
                && m.split('//').every(seg => seg.trim() === '' || /^val-\[[^\[\]]*\]$/i.test(seg.trim()));
              if (isPureValRow && currentMatrix && !activity.partidaItem) {
                rowCounter++;
                activity.partidaItem = `__matrix_${currentMatrix}_${rowCounter}__`;
              }
            }
          }

          for (const activity of group.activities) {
            const key = itemKey(template.id, activity.partidaItem ?? null);
            const existingItem = existingItemMap.get(key);

            if (existingItem) {
              // Actualizar si algún campo cambió
              const needsUpdate =
                existingItem.itemDescription !== activity.actividadRealizada ||
                existingItem.validationMethod !== (activity.metodoValidacion || null) ||
                (existingItem as any).section !== (activity.seccion ?? null);

              if (needsUpdate) {
                await existingItem.update((item) => {
                  item.itemDescription = activity.actividadRealizada;
                  item.validationMethod = activity.metodoValidacion || null;
                  (item as any).section = activity.seccion ?? null;
                });
                protocolModified = true;
              }
            } else {
              // Insertar nuevo item
              const newItem = await protocolTemplateItemsCollection.create((item) => {
                item.templateId = template!.id;
                item.partidaItem = activity.partidaItem || null;
                item.itemDescription = activity.actividadRealizada;
                item.validationMethod = activity.metodoValidacion || null;
                (item as any).section = activity.seccion ?? null;
              }) as ProtocolTemplateItem;
              existingItemMap.set(itemKey(template.id, activity.partidaItem ?? null), newItem);
              protocolModified = true;
            }

            totalActivities++;
          }

          if (!isNew && protocolModified) {
            modifiedProtocols++;
          }
        }
      });

      // v45.3 — Sembrar agrupamientos (presets) de la hoja AGRUPACIONES en feature_flags
      // (upsert por nombre; conserva los del usuario). No bloquea si no hay hoja.
      let seededPresets = 0;
      if (result.groupingPresets && Object.keys(result.groupingPresets).length) {
        try { const r = await seedGroupingPresets(projectId, result.groupingPresets); seededPresets = r.seeded; } catch { /* */ }
      }

      setImportState({
        status: 'success',
        totalProtocols: addedProtocols,
        totalActivities,
        modifiedProtocols,
      });
      if (seededPresets > 0) {
        Alert.alert(t('alerts.groupingsTitle'), t('alerts.groupingsSeededMsg', { count: seededPresets }));
      }

      // Push a Supabase (no bloquea si falla)
      pushProjectToSupabase(projectId).catch(() => {});

      // Subir a S3 (no bloquea si falla)
      try {
        await uploadToS3(
          result.fileUri,
          `${s3ProjectPrefix(projectName)}/activities/${result.fileUri.split('/').pop() ?? 'activities.xlsx'}`,
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        );
      } catch (e) {
        Alert.alert(t('alerts.s3ErrorTitle'), String(e));
      }
    } catch (err) {
      if (err instanceof ExcelImportError) {
        setImportState({
          status: 'error',
          message: err.message,
          missingColumns: err.missingColumns,
        });
      } else {
        setImportState({ status: 'error', message: t('alerts.excelImportUnexpectedError') });
        console.error('[useExcelImport]', err);
      }
    }
  }, [projectId, t]);

  const reset = useCallback(() => setImportState({ status: 'idle' }), []);

  return { importState, startImport, reset };
}
