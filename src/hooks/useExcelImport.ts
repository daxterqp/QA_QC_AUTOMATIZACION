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
import { pushProjectToSupabase } from '@services/SupabaseSyncService';

export type ImportState =
  | { status: 'idle' }
  | { status: 'picking' }
  | { status: 'importing'; current: number; total: number }
  | { status: 'success'; totalProtocols: number; totalActivities: number }
  | { status: 'error'; message: string; missingColumns?: string[] };

/**
 * Hook que importa el Excel maestro y escribe en protocol_templates.
 * Re-importar es seguro: los modelos con el mismo ID_Protocolo se omiten.
 */
export function useExcelImport(projectId: string, projectName: string) {
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

      // Cargar IDs existentes para evitar duplicados en re-importaciones
      const existing = await protocolTemplatesCollection
        .query(Q.where('project_id', projectId))
        .fetch();
      const existingIds = new Set(existing.map((t) => t.idProtocolo));

      let totalActivities = 0;
      let imported = 0;

      await database.write(async () => {
        for (let i = 0; i < protocols.length; i++) {
          const group = protocols[i];
          setImportState({ status: 'importing', current: i + 1, total: protocols.length });

          if (existingIds.has(group.idProtocolo)) continue;

          await importTemplateGroup(group, projectId);
          totalActivities += group.activities.length;
          imported++;
        }
      });

      setImportState({
        status: 'success',
        totalProtocols: imported,
        totalActivities,
      });

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
        Alert.alert('S3 Error', String(e));
      }
    } catch (err) {
      if (err instanceof ExcelImportError) {
        setImportState({
          status: 'error',
          message: err.message,
          missingColumns: err.missingColumns,
        });
      } else {
        setImportState({ status: 'error', message: 'Error inesperado al importar el archivo.' });
        console.error('[useExcelImport]', err);
      }
    }
  }, [projectId]);

  const reset = useCallback(() => setImportState({ status: 'idle' }), []);

  return { importState, startImport, reset };
}

async function importTemplateGroup(
  group: ExcelProtocolGroup,
  projectId: string
): Promise<void> {
  const template = await protocolTemplatesCollection.create((t) => {
    t.projectId = projectId;
    t.idProtocolo = group.idProtocolo;
    t.name = group.protocolName;
  });

  for (const activity of group.activities) {
    await protocolTemplateItemsCollection.create((item) => {
      item.templateId = template.id;
      item.partidaItem = activity.partidaItem || null;
      item.itemDescription = activity.actividadRealizada;
      item.validationMethod = activity.metodoValidacion || null;
      (item as any).section = activity.seccion ?? null;
    });
  }
}
