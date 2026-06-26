/**
 * TopoCargasScreen (v44) — Lista de cargas de datos topográficos por fecha (código
 * T<ddmmaa>-<seq>). Crear/editar (manual + CSV) vía TopoCargaModal; borrar revierte
 * las coordenadas topográficas que la carga escribió en las fichas.
 */
import React, { useCallback, useState } from 'react';
import {
  View, Text, StyleSheet, SectionList, TouchableOpacity, ActivityIndicator,
  RefreshControl, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Q } from '@nozbe/watermelondb';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@navigation/types';
import AppHeader from '@components/AppHeader';
import { Colors, Radius, Shadow } from '../theme/colors';
import { topoCargasCollection, protocolsCollection, projectsCollection } from '@db/index';
import { useAuth } from '@context/AuthContext';
import { pullTopoCargas, pullProjectFromCloud } from '@services/SupabaseSyncService';
import { createCarga, updateCarga, deleteCargaWithRevert, buildProtocolCodeMap } from '@services/TopoCargaService';
import { bindCargaToProtocols, type TopoRow } from '@utils/topoBinding';
import { groupByDay } from '@utils/dateGrouping';
import { parseFeatureFlagsJson } from '@utils/featureFlags';
import { summarizeTopoCoverage, hasTopoData, type TopoCoverageSummary } from '@utils/topoVisibility';
import { TopoCoverageBox } from '@components/topo/TopoCoverageBox';
import { TopoCargaModal } from '@components/topo/TopoCargaModal';

type Props = NativeStackScreenProps<RootStackParamList, 'TopoCargas'>;

interface CargaCard {
  id: string;
  cargaCode: string;
  cargaDate: string | null;
  inputMethod: string | null;
  createdAtMs: number;
  rows: TopoRow[];
  pendingCount: number;
}

export default function TopoCargasScreen({ navigation, route }: Props) {
  const { projectId, projectName } = route.params;
  const insets = useSafeAreaInsets();
  const { currentUser } = useAuth();
  const canEdit = currentUser?.role === 'CREATOR' || currentUser?.role === 'RESIDENT';

  const [cards, setCards] = useState<CargaCard[]>([]);
  const [coverage, setCoverage] = useState<TopoCoverageSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [modalCarga, setModalCarga] = useState<CargaCard | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);

  const loadData = useCallback(async () => {
    const [cargas, protocols] = await Promise.all([
      topoCargasCollection.query(Q.where('project_id', projectId), Q.sortBy('created_at', Q.desc)).fetch(),
      protocolsCollection.query(Q.where('project_id', projectId)).fetch(),
    ]);
    const codeMap = buildProtocolCodeMap(protocols as any[]);
    const out: CargaCard[] = (cargas as any[]).map((c) => {
      let rows: TopoRow[] = [];
      try { rows = JSON.parse(c.rowsJson || '[]'); } catch { rows = []; }
      const { pending } = bindCargaToProtocols(rows, codeMap);
      return {
        id: c.id, cargaCode: c.cargaCode, cargaDate: c.cargaDate, inputMethod: c.inputMethod,
        createdAtMs: c.createdAt?.getTime?.() ?? 0, rows, pendingCount: pending.length,
      };
    });
    setCards(out);
    // Cobertura de coordenadas (recuadro siempre visible).
    const proj: any = await projectsCollection.find(projectId).catch(() => null);
    const flags = parseFeatureFlagsJson(proj?.featureFlags);
    const items = (protocols as any[]).map((p) => ({
      id: p.id,
      code: (p.protocolCode ?? p.externalId ?? p.id) as string,
      hasTopo: hasTopoData({ east: p.topoCoordEast, north: p.topoCoordNorth, elevation: p.topoCoordElevation, valuesJson: p.topoValuesJson }),
      hasGps: p.latitude != null && p.longitude != null,
    }));
    setCoverage(summarizeTopoCoverage(items, flags));
    setLoading(false);
  }, [projectId]);

  useFocusEffect(useCallback(() => {
    setLoading(true);
    pullTopoCargas(projectId).catch(() => {}).finally(() => loadData());
  }, [projectId, loadData]));

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try { await pullProjectFromCloud(projectId); await pullTopoCargas(projectId); await loadData(); }
    catch { /* ignore */ } finally { setRefreshing(false); }
  }, [projectId, loadData]);

  const openNew = () => { setModalCarga(null); setShowModal(true); };
  const openEdit = (c: CargaCard) => { if (!canEdit) return; setModalCarga(c); setShowModal(true); };

  const onSave = async (rows: TopoRow[]) => {
    setSaving(true);
    try {
      if (modalCarga) await updateCarga(modalCarga.id, rows);
      else await createCarga({ projectId, rows, inputMethod: 'manual', createdById: currentUser?.id ?? null });
      setShowModal(false); setModalCarga(null);
      await loadData();
    } catch (e) { Alert.alert('Error', (e as Error).message); }
    finally { setSaving(false); }
  };

  const onDelete = (c: CargaCard) => {
    Alert.alert(
      `Eliminar ${c.cargaCode}`,
      `Se revertirán las coordenadas topográficas que esta carga escribió en las fichas (${c.rows.length} fila${c.rows.length !== 1 ? 's' : ''}). No se puede deshacer.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Eliminar', style: 'destructive', onPress: async () => {
          try { await deleteCargaWithRevert(c.id); await loadData(); }
          catch (e) { Alert.alert('Error', (e as Error).message); }
        } },
      ],
    );
  };

  const sections = groupByDay(cards, (c) => c.createdAtMs).map((s) => ({ title: s.title, data: s.data }));

  return (
    <View style={styles.container}>
      <AppHeader
        title="Carga topográfica"
        subtitle={projectName}
        onBack={() => navigation.goBack()}
        rightContent={currentUser?.role === 'CREATOR' ? (
          <TouchableOpacity onPress={() => navigation.navigate('TopoConfig', { projectId, projectName })} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="settings-outline" size={22} color={Colors.white} />
          </TouchableOpacity>
        ) : undefined}
      />
      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color={Colors.primary} /></View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(item) => item.id}
          contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 90 }]}
          stickySectionHeadersEnabled={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} colors={[Colors.primary]} />}
          ListHeaderComponent={coverage ? (
            <View style={{ marginBottom: 10 }}>
              <TopoCoverageBox summary={coverage} onDetail={() => navigation.navigate('TopoCoverage', { projectId, projectName })} />
            </View>
          ) : null}
          renderSectionHeader={({ section }) => <Text style={styles.dayHeader}>{section.title}</Text>}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="triangle-outline" size={40} color={Colors.light} />
              <Text style={styles.emptyText}>Aún no hay cargas topográficas.</Text>
            </View>
          }
          renderItem={({ item }) => (
            <TouchableOpacity style={styles.card} activeOpacity={0.85} onPress={() => openEdit(item)} disabled={!canEdit}>
              <View style={styles.cardIcon}><Ionicons name="triangle" size={18} color={Colors.primary} /></View>
              <View style={{ flex: 1 }}>
                <Text style={styles.cardCode}>{item.cargaCode}</Text>
                <Text style={styles.cardMeta}>{item.rows.length} fila{item.rows.length !== 1 ? 's' : ''} · {item.inputMethod === 'csv' ? 'CSV' : 'Manual'}</Text>
              </View>
              {item.pendingCount > 0 && (
                <View style={styles.pendBadge}><Text style={styles.pendText}>{item.pendingCount} pend.</Text></View>
              )}
              {canEdit && (
                <TouchableOpacity onPress={() => onDelete(item)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} style={{ padding: 6 }}>
                  <Ionicons name="trash-outline" size={18} color={Colors.danger} />
                </TouchableOpacity>
              )}
            </TouchableOpacity>
          )}
        />
      )}

      {canEdit && (
        <View style={[styles.fabBar, { paddingBottom: insets.bottom + 12 }]}>
          <TouchableOpacity style={styles.fab} onPress={openNew} activeOpacity={0.9}>
            <Ionicons name="add" size={18} color={Colors.white} />
            <Text style={styles.fabText}>Nueva carga de datos topográficos</Text>
          </TouchableOpacity>
        </View>
      )}

      {showModal && (
        <TopoCargaModal
          projectId={projectId}
          title={modalCarga ? `Editar ${modalCarga.cargaCode}` : 'Nueva carga topográfica'}
          initialRows={modalCarga?.rows ?? []}
          saving={saving}
          onSave={onSave}
          onCancel={() => { setShowModal(false); setModalCarga(null); }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.surface },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list: { padding: 14, gap: 8 },
  dayHeader: { fontSize: 11, fontWeight: '800', color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 10, marginBottom: 4 },
  card: { backgroundColor: Colors.white, borderRadius: Radius.md, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12, ...Shadow.subtle },
  cardIcon: { width: 36, height: 36, borderRadius: Radius.sm, backgroundColor: Colors.primary + '18', alignItems: 'center', justifyContent: 'center' },
  cardCode: { fontSize: 14, fontWeight: '800', color: Colors.navy },
  cardMeta: { fontSize: 11, color: Colors.textMuted, marginTop: 2 },
  pendBadge: { backgroundColor: '#FEF3C7', borderColor: '#FCD34D', borderWidth: 1, borderRadius: Radius.sm, paddingHorizontal: 8, paddingVertical: 3 },
  pendText: { fontSize: 11, fontWeight: '800', color: '#B45309' },
  empty: { alignItems: 'center', paddingVertical: 60, gap: 10 },
  emptyText: { color: Colors.textMuted, fontSize: 13 },
  fabBar: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 14, paddingTop: 8, backgroundColor: 'transparent' },
  fab: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: Colors.primary, borderRadius: Radius.md, paddingVertical: 14, ...Shadow.card },
  fabText: { color: Colors.white, fontSize: 14, fontWeight: '800' },
});
