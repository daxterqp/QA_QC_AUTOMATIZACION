/**
 * TopoCoverageScreen (móvil) — Detalle de cobertura de coordenadas: lista de ensayos
 * con 3 filtros (Con coord. topográficas / Con coordenadas GPS / Sin coordenadas).
 */
import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@navigation/types';
import AppHeader from '@components/AppHeader';
import { Colors, Radius } from '../theme/colors';
import { loadTopoCoverageItems } from '@services/topoCoverage';
import type { TopoCoverageItem } from '@utils/topoVisibility';

type Props = NativeStackScreenProps<RootStackParamList, 'TopoCoverage'>;
type Filter = 'topo' | 'gps' | 'none';

const TABS: { key: Filter; label: string }[] = [
  { key: 'topo', label: 'Con coord. topográficas' },
  { key: 'gps', label: 'Con coordenadas GPS' },
  { key: 'none', label: 'Sin coordenadas' },
];

export default function TopoCoverageScreen({ navigation, route }: Props) {
  const { projectId, projectName } = route.params;
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState<TopoCoverageItem[] | null>(null);
  const [filter, setFilter] = useState<Filter>('topo');

  useFocusEffect(useCallback(() => {
    let active = true;
    loadTopoCoverageItems(projectId).then((r) => { if (active) setItems(r); });
    return () => { active = false; };
  }, [projectId]));

  const buckets = useMemo(() => ({
    topo: (items ?? []).filter((i) => i.hasTopo),
    gps: (items ?? []).filter((i) => !i.hasTopo && i.hasGps),
    none: (items ?? []).filter((i) => !i.hasTopo && !i.hasGps),
  }), [items]);

  const list = buckets[filter];

  return (
    <View style={[styles.container, { paddingBottom: insets.bottom }]}>
      <AppHeader title="Cobertura de coordenadas" subtitle={projectName} onBack={() => navigation.goBack()} />
      <View style={styles.tabs}>
        {TABS.map((tab) => {
          const active = filter === tab.key;
          return (
            <TouchableOpacity key={tab.key} style={[styles.tab, active && styles.tabActive]} onPress={() => setFilter(tab.key)} activeOpacity={0.7}>
              <Text style={[styles.tabText, active && styles.tabTextActive]} numberOfLines={2}>{tab.label}</Text>
              <View style={[styles.badge, active && styles.badgeActive]}><Text style={[styles.badgeText, active && styles.badgeTextActive]}>{buckets[tab.key].length}</Text></View>
            </TouchableOpacity>
          );
        })}
      </View>
      {items == null ? (
        <View style={styles.center}><ActivityIndicator size="large" color={Colors.primary} /></View>
      ) : list.length === 0 ? (
        <View style={styles.center}><Text style={styles.empty}>No hay ensayos en este grupo.</Text></View>
      ) : (
        <FlatList
          data={list}
          keyExtractor={(i) => i.id}
          contentContainerStyle={{ padding: 12, gap: 6 }}
          renderItem={({ item }) => (
            <View style={styles.row}>
              <Text style={styles.code} numberOfLines={1}>{item.code}</Text>
              <View style={styles.tags}>
                {item.hasTopo && <View style={[styles.tag, styles.tagTopo]}><Text style={[styles.tagText, { color: '#047857' }]}>TOPO</Text></View>}
                {item.hasGps && <View style={[styles.tag, styles.tagGps]}><Text style={[styles.tagText, { color: '#B45309' }]}>GPS</Text></View>}
                {!item.hasTopo && !item.hasGps && <View style={[styles.tag, styles.tagNone]}><Text style={[styles.tagText, { color: '#BE123C' }]}>SIN COORD.</Text></View>}
              </View>
            </View>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.surface },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  empty: { fontSize: 13, color: Colors.textMuted },
  tabs: { flexDirection: 'row', gap: 6, padding: 10 },
  tab: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.md, paddingVertical: 8, paddingHorizontal: 6, backgroundColor: Colors.white },
  tabActive: { borderColor: Colors.primary, backgroundColor: Colors.primary + '12' },
  tabText: { fontSize: 11, fontWeight: '700', color: Colors.textSecondary, flexShrink: 1 },
  tabTextActive: { color: Colors.primary },
  badge: { minWidth: 20, paddingHorizontal: 5, paddingVertical: 1, borderRadius: 10, backgroundColor: Colors.surface, alignItems: 'center' },
  badgeActive: { backgroundColor: Colors.white },
  badgeText: { fontSize: 11, fontWeight: '800', color: Colors.textSecondary },
  badgeTextActive: { color: Colors.primary },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, backgroundColor: Colors.white, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border, paddingHorizontal: 12, paddingVertical: 10 },
  code: { fontSize: 13, fontWeight: '700', color: Colors.navy, flex: 1 },
  tags: { flexDirection: 'row', gap: 5 },
  tag: { borderWidth: 1, borderRadius: Radius.sm, paddingHorizontal: 6, paddingVertical: 2 },
  tagTopo: { backgroundColor: '#ECFDF5', borderColor: '#A7F3D0' },
  tagGps: { backgroundColor: '#FFFBEB', borderColor: '#FDE68A' },
  tagNone: { backgroundColor: '#FFF1F2', borderColor: '#FECDD3' },
  tagText: { fontSize: 9, fontWeight: '800' },
});
