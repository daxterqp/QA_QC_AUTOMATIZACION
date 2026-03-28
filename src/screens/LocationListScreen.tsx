import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, TextInput, ScrollView,
  ActivityIndicator, Animated,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AppHeader from '@components/AppHeader';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@navigation/types';
import { locationsCollection, protocolsCollection } from '@db/index';
import { Q } from '@nozbe/watermelondb';
import type Location from '@models/Location';
import { Colors, Radius, Shadow } from '../theme/colors';
import { pullProjectFromCloud } from '@services/SupabaseSyncService';
import { useTourStep } from '@hooks/useTourStep';
import { useTour } from '@context/TourContext';

type Props = NativeStackScreenProps<RootStackParamList, 'LocationList'>;

export default function LocationListScreen({ navigation, route }: Props) {
  const { projectId, projectName } = route.params;

  const { jumpToStep, isActive: tourActive, isContextual, dismissTour } = useTour();

  useEffect(() => {
    const unsub = navigation.addListener('blur', () => {
      if (tourActive && isContextual) dismissTour();
    });
    return unsub;
  }, [navigation, tourActive, isContextual, dismissTour]);
  // Tour refs
  const locationItemRef = useTourStep('location_item');
  const locationProgressRef = useTourStep('location_progress_bar');
  const locationFiltersRef = useTourStep('location_filters');

  const [locations, setLocations] = useState<Location[]>([]);
  const [search, setSearch] = useState('');
  const [filterLocation, setFilterLocation] = useState('');
  const [filterSpecialty, setFilterSpecialty] = useState('');
  const [expandLocation, setExpandLocation] = useState(false);
  const [expandSpecialty, setExpandSpecialty] = useState(false);
  const [progress, setProgress] = useState<Map<string, { done: number; total: number }>>(new Map());
  const [syncing, setSyncing] = useState(false);
  const pulseAnim = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 0.4, duration: 700, useNativeDriver: true }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, []);

  // Sincronizar automáticamente al entrar al proyecto
  useEffect(() => {
    setSyncing(true);
    pullProjectFromCloud(projectId)
      .catch(() => {})
      .finally(() => setSyncing(false));
  }, [projectId]);

  useEffect(() => {
    const sub = locationsCollection
      .query(Q.where('project_id', projectId), Q.sortBy('created_at', Q.asc))
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

  const renderItem = ({ item, index }: { item: Location; index: number }) => {
    const prog = progress.get(item.id) ?? { done: 0, total: 0 };
    const allDone = prog.total > 0 && prog.done === prog.total;
    const hasTemplates = prog.total > 0;

    return (
      <TouchableOpacity
        ref={index === 0 ? locationItemRef : undefined}
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
              <View
                ref={index === 0 ? locationProgressRef : undefined}
                style={[styles.progressBadge, allDone && styles.progressBadgeDone]}
              >
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
          <Ionicons name="chevron-forward" size={20} color={Colors.textMuted} />
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <AppHeader
        title={projectName}
        subtitle={syncing ? 'Sincronizando...' : `${filtered.length} ubicacion${filtered.length !== 1 ? 'es' : ''}`}
        onBack={() => navigation.goBack()}
        rightContent={
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            {syncing && <ActivityIndicator size="small" color={Colors.white} />}
            <TouchableOpacity onPress={() => jumpToStep('location_item')} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons name="help-circle-outline" size={22} color={Colors.white} />
            </TouchableOpacity>
          </View>
        }
      />

      {/* Barra de búsqueda */}
      <View style={styles.searchBar}>
        <Ionicons name="search-outline" size={16} color={Colors.textMuted} style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder="Buscar..."
          placeholderTextColor={Colors.textMuted}
          value={search}
          onChangeText={setSearch}
        />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => setSearch('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="close-circle" size={16} color={Colors.textMuted} />
          </TouchableOpacity>
        )}
      </View>

      {/* Slicers desplegables */}
      <View ref={locationFiltersRef} style={styles.slicersBox}>
        {/* Slicer Ubicación */}
        <TouchableOpacity
          style={[styles.slicerHeader, filterLocation ? styles.slicerHeaderActive : null]}
          onPress={() => { setExpandLocation(v => !v); setExpandSpecialty(false); }}
          activeOpacity={0.8}
        >
          <View style={styles.slicerLeft}>
            <View style={styles.slicerLabelRow}>
              <Ionicons name="layers-outline" size={13} color={Colors.textMuted} />
              <Text style={styles.slicerLabel}>Ubicación</Text>
            </View>
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
                <Ionicons name="close-circle" size={16} color={Colors.danger} />
              </TouchableOpacity>
            ) : null}
            <Ionicons
              name={expandLocation ? 'chevron-up' : 'chevron-down'}
              size={16}
              color={Colors.textMuted}
            />
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
            <View style={styles.slicerLabelRow}>
              <Ionicons name="construct-outline" size={13} color={Colors.textMuted} />
              <Text style={styles.slicerLabel}>Especialidad</Text>
            </View>
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
                <Ionicons name="close-circle" size={16} color={Colors.danger} />
              </TouchableOpacity>
            ) : null}
            <Ionicons
              name={expandSpecialty ? 'chevron-up' : 'chevron-down'}
              size={16}
              color={Colors.textMuted}
            />
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
            <Ionicons name="filter-circle-outline" size={14} color={Colors.primary} />
            <Text style={styles.clearAllTxt}>Limpiar {activeFilters} filtro{activeFilters > 1 ? 's' : ''}</Text>
          </TouchableOpacity>
        )}
      </View>

      {syncing && locations.length === 0 ? (
        // Skeleton mientras carga por primera vez
        <View style={styles.list}>
          {[...Array(7)].map((_, i) => (
            <Animated.View key={i} style={[styles.card, styles.skeletonCard, { opacity: pulseAnim }]}>
              <View style={styles.cardLeft}>
                <View style={styles.skeletonLine} />
                <View style={[styles.skeletonLine, { width: '50%', marginTop: 6 }]} />
              </View>
              <View style={styles.skeletonBadge} />
            </Animated.View>
          ))}
        </View>
      ) : (
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
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.surface },

  searchBar: {
    backgroundColor: Colors.white,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.divider,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  searchIcon: { flexShrink: 0 },
  searchInput: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: Radius.sm,
    paddingHorizontal: 10,
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
  slicerLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  slicerLabel: { fontSize: 10, fontWeight: '700', color: Colors.textMuted, letterSpacing: 1, textTransform: 'uppercase' },
  slicerValue: { fontSize: 13, fontWeight: '700', color: Colors.primary, marginTop: 1 },
  slicerPlaceholder: { fontSize: 13, color: Colors.textSecondary, marginTop: 1 },
  slicerRight: { flexDirection: 'row', alignItems: 'center', gap: 10 },

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
    flexDirection: 'row', alignItems: 'center', gap: 4,
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

  empty: { padding: 40, alignItems: 'center' },
  emptyText: { fontSize: 13, color: Colors.textMuted, textAlign: 'center', lineHeight: 20 },

  skeletonCard: { backgroundColor: Colors.white },
  skeletonLine: { width: '70%', height: 14, backgroundColor: Colors.surface, borderRadius: 4 },
  skeletonBadge: { width: 44, height: 36, backgroundColor: Colors.surface, borderRadius: Radius.sm },
});
