import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator,
} from 'react-native';
import AppHeader from '@components/AppHeader';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@navigation/types';
import {
  locationsCollection,
  protocolTemplatesCollection,
  protocolTemplateItemsCollection,
  protocolsCollection,
  protocolItemsCollection,
  database,
} from '@db/index';
import { Q } from '@nozbe/watermelondb';
import { enqueue as enqueueSync } from '@services/SyncQueueService';
import { createInstances } from '@services/ProtocolInstanceService';
import { useAuth } from '@context/AuthContext';
import { useTourStep } from '@hooks/useTourStep';
import { useTour } from '@context/TourContext';
import { Ionicons } from '@expo/vector-icons';
import { useI18n, tx } from '@i18n/index';
import type ProtocolTemplate from '@models/ProtocolTemplate';
import type Protocol from '@models/Protocol';
import type { ProtocolStatus } from '@models/Protocol';
import { Colors, Radius, Shadow } from '../theme/colors';

type Props = NativeStackScreenProps<RootStackParamList, 'LocationProtocols'>;

/**
 * Reconciliación NO destructiva plantilla → instancia.
 *
 * Cuando la plantilla maestra cambia (p.ej. el usuario reimporta el Excel con una
 * fila o columna nueva), las instancias ya creadas NO se actualizaban: sus
 * `protocol_items` se copiaban una sola vez al abrir el protocolo. Resultado: la
 * modificación no se reflejaba (y un protocolo que pasó a numérico seguía
 * detectándose como subjetivo porque sus items quedaban con el método viejo).
 *
 * Esta función empareja por `partida_item` (fallback a descripción) y:
 *   • AGREGA filas nuevas que aparecieron en la plantilla.
 *   • ACTUALIZA campos de estructura (descripción, método de validación, sección)
 *     cuando difieren.
 *   • PRESERVA SIEMPRE las respuestas del usuario (is_compliant/is_na/has_answer/
 *     comments) y nunca borra filas existentes.
 *
 * Seguridad: si la plantilla usa expansión paramétrica (`repeat-[...]`) NO se
 * reconcilia (la instancia ya está expandida y un diff 1:1 la rompería). El caller
 * sólo debe invocarla en protocolos editables (no bloqueados/aprobados).
 *
 * Devuelve los ids de los protocol_items creados/actualizados (vacío si nada
 * cambió) — el caller los encola para push inmediato a la nube.
 */
async function reconcileInstanceItems(instanceId: string, templateId: string): Promise<string[]> {
  const [templateItems, instanceItems] = await Promise.all([
    protocolTemplateItemsCollection.query(Q.where('template_id', templateId)).fetch(),
    protocolItemsCollection.query(Q.where('protocol_id', instanceId)).fetch(),
  ]);
  if (templateItems.length === 0) return [];

  // No tocar protocolos paramétricos: la instancia ya está expandida.
  const isParametric = templateItems.some((ti) => (ti.validationMethod ?? '').includes('repeat-['));
  if (isParametric) return [];

  const keyOf = (partida: string | null | undefined, desc: string): string => {
    const p = (partida ?? '').trim();
    return p !== '' ? `p:${p.toLowerCase()}` : `d:${(desc ?? '').trim().toLowerCase()}`;
  };

  const instanceByKey = new Map<string, any>();
  for (const it of instanceItems) instanceByKey.set(keyOf((it as any).partidaItem, (it as any).itemDescription), it);

  const toCreate: typeof templateItems = [];
  const toUpdate: { item: any; desc: string; vm: string | null; section: string | null }[] = [];

  for (const ti of templateItems) {
    const existing = instanceByKey.get(keyOf(ti.partidaItem, ti.itemDescription));
    const newDesc = ti.itemDescription;
    const newVm = ti.validationMethod ?? null;
    const newSection = ti.section ?? null;
    if (!existing) {
      toCreate.push(ti);
    } else if (
      existing.itemDescription !== newDesc ||
      ((existing.validationMethod ?? null) !== newVm) ||
      (((existing as any).section ?? null) !== newSection)
    ) {
      toUpdate.push({ item: existing, desc: newDesc, vm: newVm, section: newSection });
    }
  }

  if (toCreate.length === 0 && toUpdate.length === 0) return [];

  const changedIds: string[] = [];
  await database.write(async () => {
    for (const ti of toCreate) {
      const created = await protocolItemsCollection.create((item) => {
        item.protocolId = instanceId;
        item.partidaItem = ti.partidaItem ?? null;
        item.itemDescription = ti.itemDescription;
        item.validationMethod = ti.validationMethod ?? null;
        (item as any).section = ti.section ?? null;
        item.isCompliant = false;
        item.isNa = false;
        item.hasAnswer = false;
        item.comments = null;
      });
      changedIds.push(created.id);
    }
    for (const u of toUpdate) {
      await u.item.update((item: any) => {
        item.itemDescription = u.desc;
        item.validationMethod = u.vm;
        item.section = u.section;
        // No se tocan is_compliant / is_na / has_answer / comments: se preservan.
      });
      changedIds.push(u.item.id);
    }
  });
  return changedIds;
}

interface TemplateRow {
  template: ProtocolTemplate;
  instance: Protocol | null;
}

const STATUS_COLORS: Record<ProtocolStatus, string> = {
  DRAFT: Colors.warning,
  IN_PROGRESS: Colors.warning,
  SUBMITTED: Colors.primary,
  APPROVED: Colors.success,
  REJECTED: Colors.danger,
};

const STATUS_LABELS: Record<ProtocolStatus, string> = {
  DRAFT: tx('locProtos.status.inProgress'),
  IN_PROGRESS: tx('locProtos.status.inProgress'),
  SUBMITTED: tx('locProtos.status.inReview'),
  APPROVED: tx('locProtos.status.approved'),
  REJECTED: tx('locProtos.status.rejected'),
};

export default function LocationProtocolsScreen({ navigation, route }: Props) {
  const { locationId, locationName, projectId, projectName } = route.params;
  const { currentUser } = useAuth();
  const { t } = useI18n();

  const { jumpToStep, isActive: tourActive, isContextual, dismissTour } = useTour();
  // Tour refs
  const protocolRowRef = useTourStep('protocol_row');

  useEffect(() => {
    const unsub = navigation.addListener('blur', () => {
      if (tourActive && isContextual) dismissTour();
    });
    return unsub;
  }, [navigation, tourActive, isContextual, dismissTour]);

  const [rows, setRows] = useState<TemplateRow[]>([]);
  const [loading, setLoading] = useState(true);

  const isJefe = currentUser?.role === 'RESIDENT';
  const isCreator = currentUser?.role === 'CREATOR';
  const isSupervisor = currentUser?.role === 'SUPERVISOR';

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      // 1. Obtener la ubicación para leer sus templateIds
      const location = await locationsCollection.find(locationId);
      const templateIdList = location.templateIds
        ? location.templateIds.split(',').map((s) => s.trim()).filter(Boolean)
        : [];

      if (templateIdList.length === 0) {
        setRows([]);
        setLoading(false);
        return;
      }

      // 2. Cargar las plantillas del proyecto que coinciden con los IDs
      const allTemplates = await protocolTemplatesCollection
        .query(Q.where('project_id', projectId))
        .fetch();

      const matchingTemplates = allTemplates.filter((t) =>
        templateIdList.includes(t.idProtocolo)
      );

      // 3. Cargar instancias existentes para esta ubicación
      const existingInstances = await protocolsCollection
        .query(
          Q.where('location_id', locationId),
          Q.where('project_id', projectId)
        )
        .fetch();

      // 4. Construir filas: template + su instancia (si existe). v39 — un tipo
      //    oculto solo aparece si YA tiene instancia (para no perder el registro);
      //    si está oculto y sin instancia, no se muestra (no se crea uno nuevo).
      const built: TemplateRow[] = matchingTemplates
        .map((tmpl) => ({
          template: tmpl,
          instance: existingInstances.find((p) => p.templateId === tmpl.id) ?? null,
        }))
        .filter((row) => !(row.template as any).isHidden || row.instance != null);

      setRows(built);
    } finally {
      setLoading(false);
    }
  }, [locationId, projectId]);

  useEffect(() => {
    loadData();
    // Recargar al volver a esta pantalla
    const unsubscribe = navigation.addListener('focus', loadData);
    return unsubscribe;
  }, [loadData, navigation]);

  const handleOpenProtocol = async (row: TemplateRow) => {
    let instanceId = row.instance?.id;

    // Si no existe instancia, crearla copiando la plantilla.
    // v31 — El flujo (expansión paramétrica + write + enqueue FIFO + código
    // correlativo si está activo) vive en ProtocolInstanceService, compartido
    // con los modos de llenado por sector/tipo/fecha.
    if (!instanceId) {
      const { ids } = await createInstances({
        projectId,
        template: { id: row.template.id, name: row.template.name, idProtocolo: (row.template as any).idProtocolo ?? null },
        locationId,
        locationName,
      });
      instanceId = ids[0];
    } else if (row.instance) {
      // La instancia ya existía: reconciliar con la plantilla por si fue modificada
      // (fila/columna nueva, método actualizado). Solo en protocolos editables — no
      // tocamos protocolos bloqueados/enviados/aprobados.
      const st = row.instance.status;
      const editable = !row.instance.isLocked && (st === 'DRAFT' || st === 'IN_PROGRESS' || st === 'REJECTED');
      if (editable) {
        try {
          const changedIds = await reconcileInstanceItems(instanceId!, row.template.id);
          if (changedIds.length > 0) {
            // v32 — Subir la reconciliación a la nube de inmediato (no esperar al
            // próximo sync manual). Ancla de orden: primero el protocolo (no-op si
            // ya está synced; upsert completo si era offline-created), luego items.
            enqueueSync({ opType: 'PUSH_PROTOCOL_STATUS', entityId: instanceId!, projectId }).catch(() => {});
            for (const itemId of changedIds) {
              enqueueSync({ opType: 'PUSH_PROTOCOL_ITEM', entityId: itemId, projectId }).catch(() => {});
            }
          }
        } catch (e) {
          console.warn('[reconcile] fallo al reconciliar instancia con plantilla:', e);
        }
      }
    }

    // Navegar según rol
    const status = row.instance?.status ?? 'DRAFT';
    const correctionsAllowed = (row.instance as any)?.correctionsAllowed ?? false;
    const canFillStatus = status === 'DRAFT' || status === 'IN_PROGRESS' || (status === 'REJECTED' && correctionsAllowed);

    if (isCreator || isSupervisor || isJefe) {
      // CREATOR, SUPERVISOR, RESIDENT: editan DRAFT/REJECTED, auditan SUBMITTED/APPROVED
      if (canFillStatus) {
        navigation.navigate('ProtocolFill', { protocolId: instanceId! });
      } else {
        navigation.navigate('ProtocolAudit', { protocolId: instanceId! });
      }
    } else {
      navigation.navigate('ProtocolFill', { protocolId: instanceId! });
    }
  };

  const renderItem = ({ item, index }: { item: TemplateRow; index: number }) => {
    const status = item.instance?.status;
    const correctionsAllowed = (item.instance as any)?.correctionsAllowed ?? false;
    const canFill = (isCreator || isSupervisor || isJefe) &&
      (!status || status === 'DRAFT' || status === 'IN_PROGRESS' || (status === 'REJECTED' && correctionsAllowed));
    return (
      <TouchableOpacity
        ref={index === 0 ? protocolRowRef : undefined}
        style={styles.card}
        onPress={() => handleOpenProtocol(item)}
      >
        <View style={styles.cardLeft}>
          <Text style={styles.templateName}>{item.template.name}</Text>
          <Text style={styles.templateId}>ID: {item.template.idProtocolo}</Text>
          {canFill && <Text style={styles.fillHint}>{t('locProtos.fillHint')}</Text>}
        </View>
        <View style={styles.cardRight}>
          {status ? (
            <View style={[styles.statusBadge, { backgroundColor: STATUS_COLORS[status] }]}>
              <Text style={styles.statusText}>{STATUS_LABELS[status]}</Text>
            </View>
          ) : (
            <View style={[styles.statusBadge, { backgroundColor: Colors.border }]}>
              <Text style={[styles.statusText, { color: Colors.textMuted }]}>{t('locProtos.status.notStarted')}</Text>
            </View>
          )}
          <Text style={styles.chevron}>›</Text>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <AppHeader
        title={locationName}
        subtitle={t('locProtos.subtitle')}
        onBack={() => navigation.goBack()}
        rightContent={
          <TouchableOpacity onPress={() => jumpToStep('protocol_row')} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="help-circle-outline" size={22} color={Colors.white} />
          </TouchableOpacity>
        }
      />

      {loading ? (
        <View style={styles.loadingBox}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(item) => item.template.id}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyText}>
                {t('locProtos.empty')}
              </Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.surface },

  loadingBox: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  list: { padding: 16, gap: 10 },

  card: {
    backgroundColor: Colors.white,
    borderRadius: Radius.md,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    ...Shadow.subtle,
  },
  cardLeft: { flex: 1, marginRight: 12 },
  templateName: { fontSize: 14, fontWeight: '600', color: Colors.navy },
  templateId: { fontSize: 11, color: Colors.textMuted, marginTop: 2 },
  fillHint: { fontSize: 11, color: Colors.primary, fontWeight: '700', marginTop: 4 },

  cardRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  statusBadge: {
    borderRadius: Radius.sm,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  statusText: { fontSize: 11, fontWeight: '700', color: Colors.white },
  chevron: { fontSize: 22, color: Colors.textMuted },

  empty: { padding: 40, alignItems: 'center' },
  emptyText: { fontSize: 13, color: Colors.textMuted, textAlign: 'center', lineHeight: 20 },
});
