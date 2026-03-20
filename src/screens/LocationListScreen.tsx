import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, TextInput, ScrollView,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@navigation/types';
import { locationsCollection, protocolsCollection } from '@db/index';
import { Q } from '@nozbe/watermelondb';
import type Location from '@models/Location';
import { Colors, Radius, Shadow } from '../theme/colors';

type Props = NativeStackScreenProps<RootStackParamList, 'LocationList'>;

export default function LocationListScreen({ navigation, route }: Props) {
  const { projectId, projectName } = route.params;
  const [locations, setLocations] = useState<Location[]>([]);
  const [search, setSearch] = useState('');
  const [filterLocation, setFilterLocation] = useState('');
  const [filterSpecialty, setFilterSpecialty] = useState('');
  const [expandLocation, setExpandLocation] = useState(false);
  const [expandSpecialty, setExpandSpecialty] = useState(false);
  const [progress, setProgress] = useState<Map<string, { done: number; total: number }>>(new Map());

  useEffect(() => {
    const sub = locationsCollection
      .query(Q.where('project_id', projectId))
      .observe()
      .subscribe((locs) => {
        setLocations(locs);
        loadProgress(locs);
      });
    return () => sub.unsubscribe();
  }, [projectId]);

  const loadProgress = async (locs: Location[]) => {
    const allProtocols = await protocolsCollection
      .query(Q.where('project_id', projectId))
      .fetch();

    const map = new Map<string, { done: number; total: number }>();
    for (const loc of locs) {
      const templateCount = loc.templateIds
        ? loc.templateIds.split(',').filter((s) => s.trim()).length
        : 0;
      const locProtocols = allProtocols.filter((p) => p.locationId === loc.id);
      const approved = locProtocols.filter((p) => p.status === 'APPROVED').length;
      map.set(loc.id, { done: approved, total: templateCount });
    }
    setProgress(map);
  };

  const uniqueLocations = [...new Set(locations.map(l => l.locationOnly).filter(Boolean))] as string[];
  const uniqueSpecialties = [...new Set(locations.map(l => l.specialty).filter(Boolean))] as string[];

  const filtered = locations.filter((l) => {
    const matchSearch = !search || l.name.toLowerCase().includes(search.toLowerCase());
    const matchLoc = !filterLocation || l.locationOnly === filterLocation;
    const matchSpec = !filterSpecialty || l.specialty === filterSpecialty;
    return matchSearch && matchLoc && matchSpec;
  });

  const activeFilters = [filterLocation, filterSpecialty].filter(Boolean).length;

  const renderItem = ({ item }: { item: Location }) => {
    const prog = progress.get(item.id) ?? { done: 0, total: 0 };
    const allDone = prog.total > 0 && prog.done === prog.total;
    const hasTemplates = prog.total > 0;

    return (
      <TouchableOpacity
        style={styles.card}
        onPress={() =>
          navigation.navigate('LocationProtocols', {
            locationId: item.id,
            locationName: item.name,
            projectId,
            projectName,
          })
        }
      >
        <View style={styles.cardLeft}>
          <Text style={styles.locationName}>{item.name}</Text>
          {item.referencePlan ? (
            <Text style={styles.referencePlan}>Plano: {item.referencePlan}</Text>
          ) : null}
        </View>
        <View style={styles.cardRight}>
          {hasTemplates ? (
            <>
              <View style={[styles.progressBadge, allDone && styles.progressBadgeDone]}>
                <Text style={[styles.progressText, allDone && styles.progressTextDone]}>
                  {prog.done}/{prog.total}
                </Text>
              </View>
              <Text style={styles.progressLabel}>
                {allDone ? 'Completo' : 'Pendientes'}
              </Text>
            </>
          ) : (
            <Text style={styles.noTemplates}>Sin protocolos</Text>
          )}
          <Text style={styles.chevron}>›</Text>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backBtnText}>‹ Proyectos</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>{projectName}</Text>
        <Text style={styles.headerSub}>{filtered.length} ubicacion{filtered.length !== 1 ? 'es' : ''}</Text>
      </View>

      {/* Barra de búsqueda */}
      <View style={styles.searchBar}>
        <TextInput
          style={styles.searchInput}
          placeholder="Buscar ubicación..."
          placeholderTextColor={Colors.textMuted}
          value={search}
          onChangeText={setSearch}
        />
      </View>

      {/* Slicers desplegables */}
      <View style={styles.slicersBox}>
        {/* Slicer Ubicación */}
        <TouchableOpacity
          style={[styles.slicerHeader, filterLocation ? styles.slicerHeaderActive : null]}
          onPress={() => { setExpandLocation(v => !v); setExpandSpecialty(false); }}
          activeOpacity={0.8}
        >
          <View style={styles.slicerLeft}>
            <Text style={styles.slicerLabel}>Ubicación</Text>
            {filterLocation ? (
              <Text style={styles.slicerValue}>{filterLocation}</Text>
            ) : (
              <Text style={styles.slicerPlaceholder}>Todas</Text>
            )}
          </View>
          <View style={styles.slicerRight}>
            {filterLocation ? (
              <TouchableOpacity
                onPress={(e) => { e.stopPropagation(); setFilterLocation(''); }}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Text style={styles.clearBtn}>✕</Text>
              </TouchableOpacity>
            ) : null}
            <Text style={[styles.chevronDown, expandLocation && styles.chevronUp]}>▾</Text>
          </View>
        </TouchableOpacity>
        {expandLocation && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
            <TouchableOpacity
              style={[styles.chip, !filterLocation && styles.chipActive]}
              onPress={() => { setFilterLocation(''); setExpandLocation(false); }}
            >
              <Text style={[styles.chipTxt, !filterLocation && styles.chipTxtActive]}>Todas</Text>
            </TouchableOpacity>
            {uniqueLocations.map(val => (
              <TouchableOpacity
                key={val}
                style={[styles.chip, filterLocation === val && styles.chipActive]}
                onPress={() => { setFilterLocation(val); setExpandLocation(false); }}
              >
                <Text style={[styles.chipTxt, filterLocation === val && styles.chipTxtActive]}>{val}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}

        <View style={styles.divider} />

        {/* Slicer Especialidad */}
        <TouchableOpacity
          style={[styles.slicerHeader, filterSpecialty ? styles.slicerHeaderActive : null]}
          onPress={() => { setExpandSpecialty(v => !v); setExpandLocation(false); }}
          activeOpacity={0.8}
        >
          <View style={styles.slicerLeft}>
            <Text style={styles.slicerLabel}>Especialidad</Text>
            {filterSpecialty ? (
              <Text style={styles.slicerValue}>{filterSpecialty}</Text>
            ) : (
              <Text style={styles.slicerPlaceholder}>Todas</Text>
            )}
          </View>
          <View style={styles.slicerRight}>
            {filterSpecialty ? (
              <TouchableOpacity
                onPress={(e) => { e.stopPropagation(); setFilterSpecialty(''); }}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Text style={styles.clearBtn}>✕</Text>
              </TouchableOpacity>
            ) : null}
            <Text style={[styles.chevronDown, expandSpecialty && styles.chevronUp]}>▾</Text>
          </View>
        </TouchableOpacity>
        {expandSpecialty && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
            <TouchableOpacity
              style={[styles.chip, !filterSpecialty && styles.chipActive]}
              onPress={() => { setFilterSpecialty(''); setExpandSpecialty(false); }}
            >
              <Text style={[styles.chipTxt, !filterSpecialty && styles.chipTxtActive]}>Todas</Text>
            </TouchableOpacity>
            {uniqueSpecialties.map(val => (
              <TouchableOpacity
                key={val}
                style={[styles.chip, filterSpecialty === val && styles.chipActive]}
                onPress={() => { setFilterSpecialty(val); setExpandSpecialty(false); }}
              >
                <Text style={[styles.chipTxt, filterSpecialty === val && styles.chipTxtActive]}>{val}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}

        {/* Resumen de filtros activos */}
        {activeFilters > 0 && (
          <TouchableOpacity
            style={styles.clearAllBtn}
            onPress={() => { setFilterLocation(''); setFilterSpecialty(''); }}
          >
            <Text style={styles.clearAllTxt}>Limpiar {activeFilters} filtro{activeFilters > 1 ? 's' : ''}</Text>
          </TouchableOpacity>
        )}
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyText}>
              {locations.length === 0
                ? 'No hay ubicaciones cargadas.\nImporta el Excel de ubicaciones desde el menú del proyecto.'
                : 'No se encontraron resultados.'}
            </Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.surface },

  header: {
    backgroundColor: Colors.navy,
    paddingTop: 52,
    paddingBottom: 16,
    paddingHorizontal: 16,
  },
  backBtn: { marginBottom: 4 },
  backBtnText: { color: Colors.light, fontSize: 13 },
  headerTitle: { fontSize: 18, fontWeight: '700', color: Colors.white },
  headerSub: { fontSize: 11, color: Colors.light, marginTop: 2 },

  searchBar: {
    backgroundColor: Colors.white,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.divider,
  },
  searchInput: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.sm,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
    color: Colors.textPrimary,
    borderWidth: 1,
    borderColor: Colors.border,
  },

  slicersBox: {
    backgroundColor: Colors.white,
    borderBottomWidth: 1,
    borderBottomColor: Colors.divider,
  },
  slicerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  slicerHeaderActive: {
    backgroundColor: '#f0f4ff',
  },
  slicerLeft: { flex: 1 },
  slicerLabel: { fontSize: 10, fontWeight: '700', color: Colors.textMuted, letterSpacing: 1, textTransform: 'uppercase' },
  slicerValue: { fontSize: 13, fontWeight: '700', color: Colors.primary, marginTop: 1 },
  slicerPlaceholder: { fontSize: 13, color: Colors.textSecondary, marginTop: 1 },
  slicerRight: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  clearBtn: { fontSize: 13, color: Colors.danger, fontWeight: '700' },
  chevronDown: { fontSize: 16, color: Colors.textMuted },
  chevronUp: { transform: [{ rotate: '180deg' }] },

  chipRow: { paddingHorizontal: 16, paddingBottom: 10, gap: 8 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  chipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  chipTxt: { fontSize: 12, color: Colors.textSecondary, fontWeight: '500' },
  chipTxtActive: { color: Colors.white, fontWeight: '700' },

  divider: { height: 1, backgroundColor: Colors.divider, marginHorizontal: 16 },

  clearAllBtn: {
    alignSelf: 'flex-end',
    marginHorizontal: 16,
    marginBottom: 8,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  clearAllTxt: { fontSize: 11, color: Colors.primary, fontWeight: '700' },

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
  locationName: { fontSize: 14, fontWeight: '600', color: Colors.navy },
  referencePlan: { fontSize: 11, color: Colors.textMuted, marginTop: 2 },

  cardRight: { alignItems: 'center', flexDirection: 'row', gap: 8 },
  progressBadge: {
    backgroundColor: Colors.light,
    borderRadius: Radius.sm,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  progressBadgeDone: { backgroundColor: Colors.success },
  progressText: { fontSize: 13, fontWeight: '700', color: Colors.primary },
  progressTextDone: { color: Colors.white },
  progressLabel: { fontSize: 10, color: Colors.textMuted },
  noTemplates: { fontSize: 11, color: Colors.textMuted, fontStyle: 'italic' },
  chevron: { fontSize: 22, color: Colors.textMuted, marginLeft: 4 },

  empty: { padding: 40, alignItems: 'center' },
  emptyText: { fontSize: 13, color: Colors.textMuted, textAlign: 'center', lineHeight: 20 },
});
