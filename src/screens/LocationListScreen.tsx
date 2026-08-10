import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, TextInput, ScrollView,
  ActivityIndicator, Animated,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import AppHeader from '@components/AppHeader';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@navigation/types';
import { locationsCollection, protocolsCollection, protocolTemplatesCollection } from '@db/index';
import { Q } from '@nozbe/watermelondb';
import type Location from '@models/Location';
import { Colors, Radius, Shadow } from '../theme/colors';
import { pullProjectFromCloud } from '@services/SupabaseSyncService';
import { useRealtimeProjectPull } from '@hooks/useRealtimeProjectPull';
import { useTourStep } from '@hooks/useTourStep';
import { useTour } from '@context/TourContext';
import { useI18n } from '@i18n/index';

type Props = NativeStackScreenProps<RootStackParamList, 'LocationList'>;

export default function LocationListScreen({ navigation, route }: Props) {
  const { projectId, projectName } = route.params;

  const { t } = useI18n();



  const insets = useSafeAreaInsets();
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
  const [filterElement, setFilterElement] = useState('');   // v104
  /** v104 — Panel de filtros oculto por defecto (antes ocupaba ~1/4 de pantalla).
   *  `expandKey` = qué slicer está abierto ('' = ninguno); solo uno a la vez. */
  const [showFilters, setShowFilters] = useState(false);
  const [expandKey, setExpandKey] = useState('');
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

  // PERF (feedback QA: "las ubicaciones demoran mucho en cargar") — antes esto
  // corría pullProjectFromCloud (push + pull + descargas) BLOQUEANTE en cada
  // montaje, con skeleton hasta terminar. Ahora: lo LOCAL se pinta al instante
  // (el observe de abajo) y la nube se baja UNA sola vez por sesión de pantalla
  // en SEGUNDO PLANO — mismo patrón que EnsayosScreen/SamplesScreen. `syncing`
  // solo se enciende si aún NO hay datos locales que mostrar (primera vez real).
  const didCloudPullRef = useRef(false);
  useEffect(() => {
    if (didCloudPullRef.current) return;
    didCloudPullRef.current = true;
    let alive = true;
    let pullDone = false; // el fetchCount puede resolver DESPUÉS del pull → no re-encender el skeleton
    locationsCollection.query(Q.where('project_id', projectId)).fetchCount()
      .then(n => { if (alive && !pullDone && n === 0) setSyncing(true); })
      .catch(() => {});
    pullProjectFromCloud(projectId)
      .catch(() => {})
      .finally(() => { pullDone = true; if (alive) setSyncing(false); });
    return () => { alive = false; };
  }, [projectId]);

  // #7B — Pull-to-refresh: re-baja de la nube (la lista se actualiza sola por el observe).
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try { await pullProjectFromCloud(projectId); }
    catch { /* ignore */ }
    finally { setRefreshing(false); }
  }, [projectId]);

  // #7C — Tiempo real: cambios de la nube se bajan solos (el observe refresca la lista).
  useRealtimeProjectPull(projectId);

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
    const [allProtocols, allTemplates] = await Promise.all([
      protocolsCollection.query(Q.where('project_id', projectId)).fetch(),
      protocolTemplatesCollection.query(Q.where('project_id', projectId)).fetch(),
    ]);

    // v104 — El total se cuenta contra las fichas que EXISTEN y están visibles,
    // no contando comas en `template_ids`. Antes un código inválido o una ficha
    // retirada seguía sumando: la tarjeta decía "0/3" y al entrar no había
    // ninguno, que es exactamente la contradicción que se veía en pantalla.
    const visibleCodes = new Set(
      allTemplates.filter(t => !t.isHidden).map(t => t.idProtocolo),
    );

    const map = new Map<string, { done: number; total: number }>();
    for (const loc of locs) {
      const templateCount = loc.templateIds
        ? loc.templateIds.split(',').map(s => s.trim()).filter(c => c && visibleCodes.has(c)).length
        : 0;
      const locProtocols = allProtocols.filter((p) => p.locationId === loc.id);
      const approved = locProtocols.filter((p) => p.status === 'APPROVED').length;
      map.set(loc.id, { done: approved, total: templateCount });
    }
    setProgress(map);
  };

  const uniqueLocations = [...new Set(locations.map(l => l.locationOnly).filter(Boolean))] as string[];
  const uniqueSpecialties = [...new Set(locations.map(l => l.specialty).filter(Boolean))] as string[];
  const uniqueElements = [...new Set(locations.map(l => l.element).filter(Boolean))] as string[];

  const filtered = locations.filter((l) => {
    const matchSearch = !search || l.name.toLowerCase().includes(search.toLowerCase());
    const matchLoc = !filterLocation || l.locationOnly === filterLocation;
    const matchSpec = !filterSpecialty || l.specialty === filterSpecialty;
    const matchElem = !filterElement || l.element === filterElement;
    return matchSearch && matchLoc && matchSpec && matchElem;
  });

  const activeFilters = [filterLocation, filterSpecialty, filterElement].filter(Boolean).length;
  const clearAllFilters = () => { setFilterLocation(''); setFilterSpecialty(''); setFilterElement(''); };

  /** v104 — Los tres slicers son idénticos salvo por sus datos, así que se
   *  declaran como tabla y el JSX los recorre (antes eran 3 bloques calcados).
   *  Un slicer sin opciones se omite: en proyectos sin elementos cargados no
   *  tiene sentido mostrar un filtro que siempre estaría vacío. */
  const SLICERS = ([
    { key: 'loc',  icon: 'layers-outline' as const,    label: t('locList.locationLabel'),   value: filterLocation,  set: setFilterLocation,  options: uniqueLocations },
    { key: 'spec', icon: 'construct-outline' as const, label: t('locList.specialtyLabel'),  value: filterSpecialty, set: setFilterSpecialty, options: uniqueSpecialties },
    { key: 'elem', icon: 'cube-outline' as const,      label: t('locList.elementLabel'),    value: filterElement,   set: setFilterElement,   options: uniqueElements },
  ]).filter(s => s.options.length > 0);

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
            <Text style={styles.referencePlan}>{t('locList.referencePlan', { plan: item.referencePlan })}</Text>
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
                {allDone ? t('locList.complete') : t('locList.pending')}
              </Text>
            </>
          ) : (
            <Text style={styles.noTemplates}>{t('locList.noProtocols')}</Text>
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
        subtitle={syncing ? t('locList.syncing') : t(filtered.length === 1 ? 'locList.locationCount_one' : 'locList.locationCount_other', { count: filtered.length })}
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

      {/* v104 — Barra de búsqueda + botón de filtros en UNA sola fila.
          Antes los slicers siempre desplegados se comían ~1/4 de la pantalla y
          solo entraban 5 tarjetas. Ahora los filtros viven tras este botón: el
          badge con el número de filtros activos evita el riesgo clásico de
          "filtro escondido" (ver pocos resultados sin saber por qué). */}
      <View style={styles.searchBar}>
        <Ionicons name="search-outline" size={16} color={Colors.textMuted} style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder={t('locList.searchPlaceholder')}
          placeholderTextColor={Colors.textMuted}
          value={search}
          onChangeText={setSearch}
        />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => setSearch('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="close-circle" size={16} color={Colors.textMuted} />
          </TouchableOpacity>
        )}
        {/* Sin ejes que filtrar (proyecto sin bloques ni especialidades) el botón
            solo abriría un panel vacío, así que no se muestra. */}
        {SLICERS.length > 0 && (
        <TouchableOpacity
          ref={locationFiltersRef}
          style={[styles.filterBtn, (activeFilters > 0 || showFilters) && styles.filterBtnOn]}
          onPress={() => setShowFilters(v => !v)}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons
            name="options-outline"
            size={17}
            color={activeFilters > 0 || showFilters ? Colors.white : Colors.textSecondary}
          />
          {activeFilters > 0 && (
            <View style={styles.filterBadge}>
              <Text style={styles.filterBadgeTxt}>{activeFilters}</Text>
            </View>
          )}
        </TouchableOpacity>
        )}
      </View>

      {/* v104 — Panel de filtros COLAPSABLE con tres ejes independientes:
            · Ubicación    → el bloque (A / B / C)
            · Especialidad → la disciplina (Estructuras / Sanitarias / Eléctricas)
            · Elemento     → el componente físico (Losa, C-1, VA-202)
          Especialidad y elemento vivían antes en el mismo campo, así que no se
          podía pedir "todo lo eléctrico" ni "todas las losas de la obra". */}
      {showFilters && (
        <View style={styles.slicersBox}>
          {SLICERS.map(({ key, icon, label, value, set, options }, i) => (
            <View key={key}>
              {i > 0 && <View style={styles.divider} />}
              <TouchableOpacity
                style={[styles.slicerHeader, value ? styles.slicerHeaderActive : null]}
                onPress={() => setExpandKey(k => (k === key ? '' : key))}
                activeOpacity={0.8}
              >
                <View style={styles.slicerLeft}>
                  <View style={styles.slicerLabelRow}>
                    <Ionicons name={icon} size={13} color={Colors.textMuted} />
                    <Text style={styles.slicerLabel}>{label}</Text>
                  </View>
                  {value ? (
                    <Text style={styles.slicerValue}>{value}</Text>
                  ) : (
                    <Text style={styles.slicerPlaceholder}>{t('locList.all')}</Text>
                  )}
                </View>
                <View style={styles.slicerRight}>
                  {value ? (
                    <TouchableOpacity
                      onPress={(e) => { e.stopPropagation(); set(''); }}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Ionicons name="close-circle" size={16} color={Colors.danger} />
                    </TouchableOpacity>
                  ) : null}
                  <Ionicons
                    name={expandKey === key ? 'chevron-up' : 'chevron-down'}
                    size={16}
                    color={Colors.textMuted}
                  />
                </View>
              </TouchableOpacity>
              {expandKey === key && (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
                  <TouchableOpacity
                    style={[styles.chip, !value && styles.chipActive]}
                    onPress={() => { set(''); setExpandKey(''); }}
                  >
                    <Text style={[styles.chipTxt, !value && styles.chipTxtActive]}>{t('locList.all')}</Text>
                  </TouchableOpacity>
                  {options.map(opt => (
                    <TouchableOpacity
                      key={opt}
                      style={[styles.chip, value === opt && styles.chipActive]}
                      onPress={() => { set(opt); setExpandKey(''); }}
                    >
                      <Text style={[styles.chipTxt, value === opt && styles.chipTxtActive]}>{opt}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              )}
            </View>
          ))}

          {activeFilters > 0 && (
            <TouchableOpacity style={styles.clearAllBtn} onPress={clearAllFilters}>
              <Ionicons name="filter-circle-outline" size={14} color={Colors.primary} />
              <Text style={styles.clearAllTxt}>
                {t(activeFilters > 1 ? 'locList.clearFilters_other' : 'locList.clearFilters_one', { count: activeFilters })}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      )}

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
          contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 24 }]}
          refreshing={refreshing}
          onRefresh={onRefresh}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyText}>
                {locations.length === 0
                  ? t('locList.emptyNoLocations')
                  : t('locList.emptyNoResults')}
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

  // v104 — Botón que despliega el panel de filtros, dentro de la barra de búsqueda.
  filterBtn: {
    width: 34, height: 34, borderRadius: Radius.sm,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: Colors.border,
    backgroundColor: Colors.surface,
    flexShrink: 0,
  },
  filterBtnOn: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  // Contador de filtros activos: es lo que evita el "filtro fantasma" cuando el
  // panel está cerrado y la lista sale corta sin motivo aparente.
  filterBadge: {
    position: 'absolute', top: -5, right: -5,
    minWidth: 16, height: 16, borderRadius: 8,
    paddingHorizontal: 3,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: Colors.danger,
    borderWidth: 1.5, borderColor: Colors.white,
  },
  filterBadgeTxt: { fontSize: 9, fontWeight: '900', color: Colors.white },

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
