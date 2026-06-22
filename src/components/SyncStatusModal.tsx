/**
 * SyncStatusModal — detalle de la cola de sincronización.
 *
 * Muestra:
 *   - Estado de conexión actual
 *   - Resumen por op_type (cuántos items, fotos, aprobaciones, etc. pendientes)
 *   - Sección "Fallidos permanentes" con last_error truncado
 *   - Botón "Sincronizar ahora" → fuerza tick del worker
 *   - Botón "Reintentar fallidos" → mueve FAILED_PERMANENT a PENDING
 */

import React, { useEffect, useState } from 'react';
import { View, Text, Modal, TouchableOpacity, StyleSheet, ScrollView, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Q } from '@nozbe/watermelondb';
import { syncQueueCollection } from '@db/index';
import { queueSummary, listQueueOps, describeQueueOp, forceDrainAll } from '@services/SyncQueueService';
import { useNetwork } from '@context/NetworkContext';
import { useSyncQueue } from '@hooks/useSyncQueue';
import type { SyncOpType } from '@db/models/SyncQueueItem';
import { Colors } from '../theme/colors';
import { useI18n, tx } from '@i18n/index';

interface Props {
  onClose: () => void;
}

const OP_LABELS: Record<SyncOpType, string> = {
  PUSH_PROTOCOL_ITEM:    tx('syncModal.op.protocolItem'),
  PUSH_PROTOCOL_STATUS:  tx('syncModal.op.protocolStatus'),
  DELETE_PROTOCOL:       tx('syncModal.op.deleteTest'),
  PUSH_APPROVAL:         tx('syncModal.op.approvals'),
  PUSH_EVIDENCE:         tx('syncModal.op.evidence'),
  PUSH_NC:               tx('syncModal.op.nc'),
  UPLOAD_PHOTO:          tx('syncModal.op.photos'),
  PUSH_PROJECT_SECTOR:   tx('syncModal.op.gisSectors'),
  DELETE_PROJECT_SECTOR: tx('syncModal.op.gisSectorsDelete'),
  // v27 — Trazabilidad
  PUSH_ACTIVITY:                   tx('syncModal.op.activities'),
  DELETE_ACTIVITY:                 tx('syncModal.op.activitiesDelete'),
  PUSH_EQUIPMENT_ACTIVITY:         tx('syncModal.op.equipmentActivity'),
  DELETE_EQUIPMENT_ACTIVITY:       tx('syncModal.op.equipmentActivityDelete'),
  PUSH_WORK_SHIFT:                 tx('syncModal.op.workShifts'),
  DELETE_WORK_SHIFT:               tx('syncModal.op.workShiftsDelete'),
  PUSH_SESSION_FORM_TEMPLATE:      tx('syncModal.op.formTemplates'),
  PUSH_SESSION_FORM_TEMPLATE_ITEM: tx('syncModal.op.templateItems'),
  PUSH_WORK_SESSION:               tx('syncModal.op.sessions'),
  DELETE_WORK_SESSION:             tx('syncModal.op.sessionsDelete'),
  PUSH_WORK_SESSION_INTERVAL:      tx('syncModal.op.sessionIntervals'),
  PUSH_WORK_SESSION_FORM_ITEM:     tx('syncModal.op.formAnswers'),
  PUSH_WORK_SESSION_GPS_BATCH:     tx('syncModal.op.sessionGpsBatch'),
  PUSH_SUMMARY_ROW:                tx('syncModal.op.summaryRows'),
};

export function SyncStatusModal({ onClose }: Props) {
  const { t } = useI18n();
  const { isOnline, type, forceRecheck } = useNetwork();
  const { pending, failed, syncing, forceSync } = useSyncQueue();
  const [summary, setSummary] = useState<{ opType: SyncOpType; count: number }[]>([]);
  const [failedItems, setFailedItems] = useState<{ opType: SyncOpType; entityId: string; error: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState<Set<SyncOpType>>(new Set());
  // Detalle por op_type: qué protocolo/casilla se está subiendo.
  const [detail, setDetail] = useState<Record<string, { title: string; subtitle: string; status: string }[]>>({});

  useEffect(() => {
    let cancelled = false;
    const reload = async () => {
      const s = await queueSummary();
      const failedRows = await syncQueueCollection.query(Q.where('status', 'FAILED_PERMANENT')).fetch();
      // Detalle desplegable (acotado para no recargar la BD con colas enormes).
      const ops = await listQueueOps();
      let byType: Record<string, { title: string; subtitle: string; status: string }[]> = {};
      if (ops.length <= 60) {
        const described = await Promise.all(ops.map(async (o) => ({ ...o, ...(await describeQueueOp(o.opType, o.entityId)) })));
        for (const d of described) (byType[d.opType] ??= []).push({ title: d.title, subtitle: d.subtitle, status: d.status });
      }
      if (cancelled) return;
      setSummary(s);
      setDetail(byType);
      setFailedItems(failedRows.map((r: any) => ({
        opType: r.opType,
        entityId: r.entityId,
        error: (r.lastError as string | null) ?? t('syncModal.failed.noDetail'),
      })));
    };
    reload();
    const id = setInterval(reload, 2000); // refresh while modal abierto
    return () => { cancelled = true; clearInterval(id); };
  }, [pending, failed, syncing]);

  const toggle = (t: SyncOpType) => setExpanded((prev) => {
    const next = new Set(prev);
    next.has(t) ? next.delete(t) : next.add(t);
    return next;
  });

  function handleForceDrain() {
    Alert.alert(
      t('syncModal.forceDrain.title'),
      t('syncModal.forceDrain.message'),
      [
        { text: t('syncModal.forceDrain.cancel'), style: 'cancel' },
        {
          text: t('syncModal.forceDrain.confirm'), style: 'destructive', onPress: async () => {
            setBusy(true);
            const n = await forceDrainAll();
            await forceRecheck();
            await forceSync();
            setBusy(false);
            Alert.alert(t('syncModal.forceDrain.resultTitle'), t(n === 1 ? 'syncModal.forceDrain.result.one' : 'syncModal.forceDrain.result.other', { n }));
          },
        },
      ],
    );
  }

  async function handleForceSync() {
    setBusy(true);
    await forceRecheck();
    await forceSync();
    setBusy(false);
  }

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <Text style={styles.title}>{t('syncModal.title')}</Text>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons name="close" size={22} color={Colors.textPrimary} />
            </TouchableOpacity>
          </View>

          <ScrollView style={{ maxHeight: 480 }}>
            {/* Conexión */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>{t('syncModal.section.connection')}</Text>
              <View style={styles.row}>
                <Ionicons
                  name={isOnline ? 'wifi' : 'cloud-offline-outline'}
                  size={16}
                  color={isOnline ? Colors.success : Colors.warning}
                />
                <Text style={styles.rowText}>
                  {isOnline ? t('syncModal.connection.online', { type }) : t('syncModal.connection.offline')}
                </Text>
              </View>
            </View>

            {/* Pendientes */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>{t('syncModal.section.pending', { count: pending })}</Text>
              {summary.length === 0 ? (
                <Text style={styles.muted}>
                  {failedItems.length > 0
                    ? t('syncModal.pending.noneButFailed')
                    : t('syncModal.pending.none')}
                </Text>
              ) : (
                summary.map((s) => {
                  const ops = detail[s.opType] ?? [];
                  const open = expanded.has(s.opType);
                  return (
                    <View key={s.opType}>
                      <TouchableOpacity style={styles.row} activeOpacity={0.7}
                        onPress={() => ops.length > 0 && toggle(s.opType)}>
                        <Ionicons
                          name={ops.length === 0 ? 'ellipse-outline' : open ? 'chevron-down' : 'chevron-forward'}
                          size={14} color={Colors.textMuted}
                        />
                        <Text style={styles.rowText}>{OP_LABELS[s.opType] ?? s.opType}</Text>
                        <Text style={styles.count}>{s.count}</Text>
                      </TouchableOpacity>
                      {open && ops.map((o, i) => (
                        <View key={i} style={styles.detailRow}>
                          <Text style={styles.detailTitle} numberOfLines={1}>
                            {o.title}{o.status === 'FAILED_PERMANENT' ? '  ⚠' : o.status === 'PROCESSING' ? '  ⏳' : ''}
                          </Text>
                          {!!o.subtitle && <Text style={styles.detailSub} numberOfLines={2}>{o.subtitle}</Text>}
                        </View>
                      ))}
                    </View>
                  );
                })
              )}
            </View>

            {/* Fallidos */}
            {failedItems.length > 0 && (
              <View style={styles.section}>
                <Text style={[styles.sectionTitle, { color: Colors.danger }]}>
                  {t('syncModal.section.failed', { count: failedItems.length })}
                </Text>
                {failedItems.slice(0, 8).map((f, i) => (
                  <View key={`${f.opType}-${f.entityId}-${i}`} style={styles.failedRow}>
                    <Text style={styles.failedLabel}>
                      {OP_LABELS[f.opType] ?? f.opType} · {f.entityId.slice(0, 8)}…
                    </Text>
                    <Text style={styles.failedError} numberOfLines={2}>{f.error}</Text>
                  </View>
                ))}
                {failedItems.length > 8 && (
                  <Text style={styles.muted}>{t('syncModal.failed.more', { count: failedItems.length - 8 })}</Text>
                )}
              </View>
            )}
          </ScrollView>

          {/* Footer actions */}
          <View style={styles.footer}>
            <TouchableOpacity
              style={[styles.btn, styles.btnPrimary, (busy || !isOnline) && styles.btnDisabled]}
              onPress={handleForceSync}
              disabled={busy || !isOnline}
            >
              <Ionicons name="sync" size={14} color="#fff" />
              <Text style={styles.btnText}>{busy ? t('syncModal.action.syncing') : t('syncModal.action.syncNow')}</Text>
            </TouchableOpacity>
            {(pending > 0 || failedItems.length > 0) && (
              <TouchableOpacity
                style={[styles.btn, styles.btnSecondary, (busy || !isOnline) && styles.btnDisabled]}
                onPress={handleForceDrain}
                disabled={busy || !isOnline}
              >
                <Ionicons name="alert-circle-outline" size={14} color={Colors.danger} />
                <Text style={[styles.btnText, { color: Colors.danger }]}>{t('syncModal.action.forceUpload')}</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 16, paddingBottom: 28 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  title: { fontSize: 16, fontWeight: '800', color: Colors.textPrimary },
  section: { marginBottom: 16 },
  sectionTitle: { fontSize: 11, fontWeight: '800', color: Colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4, justifyContent: 'space-between' },
  rowText: { fontSize: 13, color: Colors.textPrimary, flex: 1 },
  count: { fontSize: 13, fontWeight: '700', color: Colors.primary },
  detailRow: { paddingLeft: 22, paddingVertical: 3, borderLeftWidth: 2, borderLeftColor: Colors.border, marginLeft: 6, marginBottom: 2 },
  detailTitle: { fontSize: 12, fontWeight: '700', color: Colors.textPrimary },
  detailSub: { fontSize: 11, color: Colors.textSecondary, marginTop: 1 },
  muted: { fontSize: 12, color: Colors.textSecondary, fontStyle: 'italic' },
  failedRow: { borderLeftWidth: 3, borderLeftColor: Colors.danger, paddingLeft: 8, marginBottom: 6 },
  failedLabel: { fontSize: 12, fontWeight: '700', color: Colors.textPrimary },
  failedError: { fontSize: 10, color: Colors.danger, marginTop: 2 },
  footer: { flexDirection: 'row', gap: 8, marginTop: 8 },
  btn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 11, borderRadius: 10 },
  btnPrimary: { backgroundColor: Colors.primary },
  btnSecondary: { backgroundColor: '#fff', borderWidth: 1, borderColor: Colors.primary },
  btnDisabled: { opacity: 0.5 },
  btnText: { fontSize: 13, fontWeight: '800', color: '#fff' },
});
