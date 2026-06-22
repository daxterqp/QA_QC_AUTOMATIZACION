/**
 * RecycleBinScreen (móvil) — Papelera de Reciclaje (v43).
 *
 * Historial de respaldo SOLO LECTURA de los ensayos eliminados, ordenado por
 * fecha de eliminación (desc). Lee el espejo local `recycle_bin` (poblado por el
 * pull cloud-wins). NO interactúa con el resto del sistema: no recalcula nada, el
 * código puede repetirse y no afecta métricas. Solo sirve como respaldo por si se
 * eliminó un ensayo por error.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, RefreshControl, Modal } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { Q } from '@nozbe/watermelondb';
import AppHeader from '@components/AppHeader';
import NumericTable from '@components/NumericTable';
import { Colors, Radius } from '../theme/colors';
import { recycleBinCollection, labAuxTablesCollection } from '@db/index';
import { pullProjectFromCloud } from '@services/SupabaseSyncService';
import { isNumericProtocol } from '@utils/numericProtocol';
import { useI18n, tx } from '@i18n/index';
import type { AuxTables } from '@utils/formulaEval';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'RecycleBin'>;

interface Entry {
  id: string;
  projectId: string;
  protocolCode: string | null;
  protocolNumber: string | null;
  templateName: string | null;
  locationName: string | null;
  sectorName: string | null;
  status: string | null;
  ensayoDate: string | null;
  deletedAt: number;
  deletedByName: string | null;
  snapshotJson: string;
}

function fmtDateTime(ms: number): string {
  if (!ms) return '—';
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function statusLabel(s: string | null): string {
  switch (s) {
    case 'APPROVED': return tx('recycle.statusApproved');
    case 'SUBMITTED': return tx('recycle.statusSubmitted');
    case 'REJECTED': return tx('recycle.statusRejected');
    case 'DRAFT': return tx('recycle.statusDraft');
    default: return s ?? '—';
  }
}

export default function RecycleBinScreen({ navigation, route }: Props) {
  const { t } = useI18n();
  const { projectId, projectName } = route.params;
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [preview, setPreview] = useState<Entry | null>(null);

  useEffect(() => {
    // v43 — Robustez: además del observe, un fallback de 5s limpia el "cargando"
    // si la suscripción nunca emite (p. ej. tabla recién migrada en un dispositivo).
    const fallback = setTimeout(() => setLoading(false), 5000);
    const sub = recycleBinCollection
      .query(Q.where('project_id', projectId), Q.sortBy('deleted_at', Q.desc))
      .observe()
      .subscribe({
        next: (rows: any[]) => {
          setEntries(rows.map(r => ({
            id: r.id,
            projectId: r.projectId,
            protocolCode: r.protocolCode,
            protocolNumber: r.protocolNumber,
            templateName: r.templateName,
            locationName: r.locationName,
            sectorName: r.sectorName,
            status: r.status,
            ensayoDate: r.ensayoDate,
            deletedAt: r.deletedAt,
            deletedByName: r.deletedByName,
            snapshotJson: r.snapshotJson,
          })));
          setLoading(false);
        },
        error: () => setLoading(false),
      });
    return () => { clearTimeout(fallback); sub.unsubscribe(); };
  }, [projectId]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try { await pullProjectFromCloud(projectId); } catch { /* offline */ }
    finally { setRefreshing(false); }
  }, [projectId]);

  useFocusEffect(useCallback(() => { refresh(); }, [refresh]));

  return (
    <View style={styles.container}>
      <AppHeader title={t('recycle.title')} subtitle={projectName} onBack={() => navigation.goBack()} />
      {loading ? (
        <View style={styles.center}><ActivityIndicator color={Colors.primary} /></View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.scroll}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={Colors.primary} />}
        >
          <View style={styles.banner}>
            <Ionicons name="information-circle-outline" size={16} color={Colors.textSecondary} />
            <Text style={styles.bannerText}>
              {t('recycle.banner')}
            </Text>
          </View>

          {entries.length === 0 ? (
            <View style={styles.center}>
              <Ionicons name="trash-outline" size={40} color={Colors.textMuted} />
              <Text style={styles.empty}>{t('recycle.empty')}</Text>
            </View>
          ) : entries.map(e => (
            <View key={e.id} style={styles.card}>
              <TouchableOpacity style={styles.cardHead} activeOpacity={0.8} onPress={() => setPreview(e)}>
                <View style={styles.iconWrap}>
                  <Ionicons name="document-text-outline" size={18} color={Colors.textSecondary} />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.code} numberOfLines={1}>
                    {e.protocolCode ?? e.protocolNumber ?? t('recycle.testFallback')}
                  </Text>
                  <Text style={styles.meta} numberOfLines={1}>
                    {[e.templateName, e.locationName, e.sectorName].filter(Boolean).join(' · ') || '—'}
                  </Text>
                  <Text style={styles.deleted} numberOfLines={1}>
                    {t('recycle.deletedOn', { date: fmtDateTime(e.deletedAt) })}{e.deletedByName ? t('recycle.deletedBy', { name: e.deletedByName }) : ''}
                  </Text>
                </View>
                <View style={{ alignItems: 'flex-end', gap: 4 }}>
                  <Text style={styles.statusBadge}>{statusLabel(e.status)}</Text>
                  <Ionicons name="eye-outline" size={18} color={Colors.primary} />
                </View>
              </TouchableOpacity>
            </View>
          ))}
        </ScrollView>
      )}

      {/* v43 — Preview de la ficha (solo lectura) desde el snapshot. */}
      <RecyclePreview entry={preview} onClose={() => setPreview(null)} />
    </View>
  );
}

/** Vista previa de un ensayo eliminado: reutiliza EXACTAMENTE el mismo visualizador
 *  que un ensayo normal (encabezado tipo Dossier + NumericTable con el MISMO motor de
 *  cálculo), reconstruido desde el snapshot. Diferencia única: SIN código QR (para no
 *  redirigir al ensayo real). El NumericTable va en modo cálculo (readOnly, NO frozen)
 *  + tablas auxiliares del proyecto → las fórmulas/BUSCAR se calculan igual que en vivo. */
function RecyclePreview({ entry, onClose }: { entry: Entry | null; onClose: () => void }) {
  const { t } = useI18n();
  const [auxTables, setAuxTables] = useState<AuxTables>({});
  let snap: any = null;
  if (entry) { try { snap = JSON.parse(entry.snapshotJson); } catch { snap = null; } }
  const projectId: string | null = entry?.projectId ?? snap?.protocol?.project_id ?? null;

  useEffect(() => {
    let active = true;
    (async () => {
      if (!projectId) { setAuxTables({}); return; }
      try {
        const tbls = await labAuxTablesCollection.query(Q.where('project_id', projectId)).fetch();
        const map: AuxTables = {};
        for (const t of tbls as any[]) {
          try { map[String(t.groupKey).toLowerCase()] = { columns: JSON.parse(t.columnsJson ?? '[]'), rows: JSON.parse(t.rowsJson ?? '[]') }; } catch { /* */ }
        }
        if (active) setAuxTables(map);
      } catch { if (active) setAuxTables({}); }
    })();
    return () => { active = false; };
  }, [projectId]);

  const items: any[] = (snap?.items ?? []);
  const numericItems = items.map(it => ({
    id: it.id, partida_item: it.partida_item ?? null,
    item_description: it.item_description ?? '', validation_method: it.validation_method ?? null,
    comments: it.comments ?? null, section: it.section ?? null,
  }));
  const numeric = items.length > 0 && isNumericProtocol(numericItems.map(i => ({ validation_method: i.validation_method })));
  const name = entry?.protocolNumber ?? entry?.templateName ?? t('recycle.testFallback');
  return (
    <Modal visible={!!entry} animationType="slide" onRequestClose={onClose}>
      <View style={styles.container}>
        <AppHeader title={t('recycle.previewTitle')} subtitle={entry?.protocolCode ?? name} onBack={onClose} />
        {!entry ? null : !snap ? (
          <View style={styles.center}><Text style={styles.detailMuted}>{t('recycle.unreadable')}</Text></View>
        ) : (
          <ScrollView contentContainerStyle={{ padding: 12, gap: 12 }}>
            {/* Encabezado tipo Dossier (SIN QR) — mismo diseño del visualizador normal */}
            <View style={styles.dossierHeader}>
              <View style={styles.dossierTopBar}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.dossierName}>{name}</Text>
                  {!!snap?.protocol?.project_name && <Text style={styles.dossierHint}>{snap.protocol.project_name}</Text>}
                  <View style={styles.deletedBadge}><Text style={styles.deletedBadgeText}>{statusLabel(entry.status)} · ELIMINADO</Text></View>
                </View>
              </View>
              <View style={styles.infoGrid}>
                <View style={styles.infoRow}>
                  <View style={styles.infoCell}><Text style={styles.infoLabel}>Código</Text><Text style={styles.infoValue}>{entry.protocolCode ?? '—'}</Text></View>
                  <View style={styles.infoCell}><Text style={styles.infoLabel}>Fecha</Text><Text style={styles.infoValue}>{entry.ensayoDate ?? '—'}</Text></View>
                </View>
                <View style={styles.infoRow}>
                  <View style={styles.infoCell}><Text style={styles.infoLabel}>Ubicación / Sector</Text><Text style={styles.infoValue}>{[entry.locationName, entry.sectorName].filter(Boolean).join(' · ') || '—'}</Text></View>
                  <View style={styles.infoCell}><Text style={styles.infoLabel}>Plantilla</Text><Text style={styles.infoValue}>{entry.templateName ?? '—'}</Text></View>
                </View>
              </View>
            </View>
            {numeric ? (
              <NumericTable items={numericItems} readOnly auxTables={auxTables} protocolCode={entry.protocolCode ?? null} />
            ) : items.length === 0 ? (
              <Text style={styles.detailMuted}>Sin items en el respaldo.</Text>
            ) : (
              items.map((it: any) => (
                <View key={it.id} style={styles.itemRow}>
                  <Text style={styles.itemDesc}>{it.item_description ?? '—'}</Text>
                  <Text style={styles.itemVal}>{it.is_compliant === true ? 'Sí' : it.is_compliant === false ? 'No' : (it.is_na ? 'N/A' : '—')}{it.comments ? ` · ${it.comments}` : ''}</Text>
                </View>
              ))
            )}
            <Text style={styles.detailNote}>Respaldo de la papelera · solo lectura · sin QR (no redirige al ensayo real).</Text>
          </ScrollView>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.surface },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40, gap: 10 },
  // Visualizador tipo Dossier (mismo diseño del ensayo normal, sin QR)
  dossierHeader: { backgroundColor: Colors.white, borderRadius: Radius.md, padding: 14, borderWidth: 1, borderColor: Colors.border, gap: 10 },
  dossierTopBar: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  dossierName: { fontSize: 18, fontWeight: '800', color: Colors.navy, letterSpacing: 0.3 },
  dossierHint: { fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
  deletedBadge: { alignSelf: 'flex-start', backgroundColor: Colors.textMuted, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, marginTop: 6 },
  deletedBadgeText: { color: Colors.white, fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },
  infoGrid: { gap: 5 },
  infoRow: { flexDirection: 'row', gap: 5 },
  infoCell: { flex: 1, minWidth: 120, backgroundColor: '#f4f6f9', borderRadius: 6, paddingHorizontal: 10, paddingVertical: 6 },
  infoLabel: { fontSize: 9, fontWeight: '700', color: '#888', letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 2 },
  infoValue: { fontSize: 13, fontWeight: '600', color: Colors.navy },
  scroll: { padding: 12, gap: 8, paddingBottom: 40 },
  banner: { flexDirection: 'row', gap: 8, alignItems: 'flex-start', backgroundColor: Colors.surface, borderRadius: Radius.sm, padding: 10, marginBottom: 4 },
  bannerText: { flex: 1, fontSize: 11, color: Colors.textSecondary, lineHeight: 16 },
  empty: { fontSize: 13, color: Colors.textMuted },
  card: { backgroundColor: Colors.white, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border, overflow: 'hidden' },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12 },
  iconWrap: { width: 38, height: 38, borderRadius: Radius.sm, backgroundColor: Colors.surface, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Colors.border },
  code: { fontSize: 14, fontWeight: '800', color: Colors.textPrimary },
  meta: { fontSize: 11, color: Colors.textSecondary, marginTop: 1 },
  deleted: { fontSize: 10, color: Colors.textMuted, marginTop: 2 },
  statusBadge: { fontSize: 9, fontWeight: '800', color: Colors.textSecondary, backgroundColor: Colors.surface, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, overflow: 'hidden' },
  detailBox: { borderTopWidth: 1, borderTopColor: Colors.divider, backgroundColor: Colors.surface, paddingHorizontal: 12, paddingVertical: 8, gap: 4 },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between' },
  detailLabel: { fontSize: 12, color: Colors.textSecondary },
  detailVal: { fontSize: 12, fontWeight: '700', color: Colors.textPrimary },
  detailMuted: { fontSize: 12, color: Colors.textMuted, fontStyle: 'italic' },
  detailNote: { fontSize: 10, color: Colors.textMuted, fontStyle: 'italic', marginTop: 4, textAlign: 'center' },
  previewHead: { backgroundColor: Colors.white, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border, padding: 12, gap: 4 },
  previewBadge: { fontSize: 11, fontWeight: '800', color: Colors.textSecondary },
  previewMeta: { fontSize: 12, color: Colors.textSecondary },
  itemRow: { backgroundColor: Colors.white, borderRadius: Radius.sm, borderWidth: 1, borderColor: Colors.border, padding: 10 },
  itemDesc: { fontSize: 13, color: Colors.textPrimary, fontWeight: '600' },
  itemVal: { fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
});
