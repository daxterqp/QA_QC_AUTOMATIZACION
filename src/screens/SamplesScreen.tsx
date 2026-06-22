/**
 * SamplesScreen (v43.1) — Módulo "Ensayos por muestra".
 *
 * Lista de muestras (tarjetas compactas con línea superior, estilo "ensayos por fecha"),
 * filtros inline estilizados (rango de correlativo + fecha + sector), botón "Añadir
 * muestra" full-width tipo ghost, y un botón de configuración (engranaje, solo
 * creador/jefe) que define qué filas del formulario se muestran (se guarda por proyecto
 * en feature_flags). El alta abre un modal que solo muestra las filas configuradas; la
 * captura de coordenadas + sector reutiliza la MISMA lógica de convergencia del ensayo
 * numérico (GpsCaptureModal). Código de muestra: M-{proyecto}-{ddmmyy}-{seq:4}.
 */
import React, { useCallback, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Modal,
  ActivityIndicator, Alert, FlatList,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Q } from '@nozbe/watermelondb';
import AppHeader from '@components/AppHeader';
import { Colors, Radius, Shadow } from '../theme/colors';
import type { RootStackParamList } from '@navigation/types';
import {
  samplesCollection, projectsCollection, projectSectorsCollection,
  locationsCollection, protocolsCollection, database,
} from '@db/index';
import type SampleModel from '@db/models/Sample';
import { useAuth } from '@context/AuthContext';
import { buildSampleCode, nextSampleSeq, todaySampleDate } from '@utils/sampleCode';
import { parseFeatureFlagsJson, type CoordinateSystem } from '@utils/featureFlags';
import { wgs84ToUtm, wgs84ToPsad56Utm, wgs84ToPsad56LatLng, findSectorByPoint } from '@utils/CoordinateSystem';
import { pushSample, pullSamples, mergeAndSaveFeatureFlags } from '@services/SupabaseSyncService';
import { exportSampleDossierPdf } from '@services/DossierExportService';
import { buildSampleCroquisSpec } from '@services/CroquisService';
import { useCroquisCapture } from '@context/CroquisCaptureContext';
import { GpsCaptureModal } from '@components/GpsCaptureModal';
import { DateRangePicker } from '@components/DateRangePicker';
import type { GpsAveragedResult } from '@utils/gpsAveraging';
import { useI18n } from '@i18n/index';

type Props = NativeStackScreenProps<RootStackParamList, 'Samples'>;
interface Lite { id: string; name: string }
type RowKey = 'material' | 'condition' | 'depth' | 'coords' | 'layers';
const ROW_LABELS: Record<RowKey, string> = {
  material: 'Tipo de material', condition: 'Condición (alterada/inalterada)',
  depth: 'Profundidad', coords: 'Ubicación (coordenadas + sector)', layers: 'Información de capa',
};
const ROW_I18N: Record<RowKey, string> = {
  material: 'samples.rowMaterial', condition: 'samples.rowCondition',
  depth: 'samples.rowDepth', coords: 'samples.rowCoords', layers: 'samples.rowLayers',
};
const DEFAULT_ROWS: Record<RowKey, boolean> = { material: true, condition: true, depth: false, coords: true, layers: false };

const SYSTEM_LABELS: Record<CoordinateSystem, string> = {
  WGS84_UTM: 'WGS84 UTM', PSAD56_UTM: 'PSAD56 UTM', WGS84_LATLNG: 'WGS84 Lat/Lng', PSAD56_LATLNG: 'PSAD56 Lat/Lng',
};
function computeEastNorth(lat: number, lng: number, system: CoordinateSystem): { east: number; north: number } {
  if (system === 'WGS84_UTM') { const u = wgs84ToUtm(lat, lng); return { east: u.easting, north: u.northing }; }
  if (system === 'PSAD56_UTM') { const u = wgs84ToPsad56Utm(lat, lng); return { east: u.easting, north: u.northing }; }
  if (system === 'PSAD56_LATLNG') { const p = wgs84ToPsad56LatLng(lat, lng); return { east: p.lng, north: p.lat }; }
  return { east: lng, north: lat };
}

export default function SamplesScreen({ route, navigation }: Props) {
  const { t } = useI18n();
  const { projectId, projectName } = route.params;
  const { currentUser } = useAuth();
  const canConfig = currentUser?.role === 'CREATOR' || currentUser?.role === 'RESIDENT';

  const [loading, setLoading] = useState(true);
  const [samples, setSamples] = useState<SampleModel[]>([]);
  const [sectors, setSectors] = useState<{ id: string; name: string; points: { lat: number; lng: number }[] | null }[]>([]);
  const [locations, setLocations] = useState<Lite[]>([]);
  const [usesSectors, setUsesSectors] = useState(false);
  const [sampleIdentifier, setSampleIdentifier] = useState('');
  const [projCoordSystem, setProjCoordSystem] = useState<CoordinateSystem>('WGS84_LATLNG');
  const [formRows, setFormRows] = useState<Record<RowKey, boolean>>(DEFAULT_ROWS);
  const [materials, setMaterials] = useState<string[]>([]);
  const [countBySample, setCountBySample] = useState<Record<string, number>>({});

  // v43.5 — Selección múltiple para exportar dossier de muestra(s).
  const { captureMany } = useCroquisCapture();
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [exportingDossier, setExportingDossier] = useState(false);
  const toggleSelected = (id: string) => setSelectedIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  // Filtro (oculto tras toggle, como el Dosier; calendarios + modales como los otros módulos)
  const [showFilters, setShowFilters] = useState(false);
  const [search, setSearch] = useState('');
  const [fromSeq, setFromSeq] = useState('');
  const [toSeq, setToSeq] = useState('');
  const [filterFromMs, setFilterFromMs] = useState<number | null>(null);
  const [filterToMs, setFilterToMs] = useState<number | null>(null);
  const [filterSectorId, setFilterSectorId] = useState<string | null>(null);
  const [filterLayer, setFilterLayer] = useState('');
  const [showFilterSector, setShowFilterSector] = useState(false);
  const [showRangeModal, setShowRangeModal] = useState(false);
  const [showLayerModal, setShowLayerModal] = useState(false);

  // Alta de muestra
  const [showAdd, setShowAdd] = useState(false);
  const [saving, setSaving] = useState(false);
  const [fDate, setFDate] = useState(todaySampleDate());
  const [fMaterial, setFMaterial] = useState('');
  const [fCondition, setFCondition] = useState<'ALTERADA' | 'INALTERADA' | null>(null);
  const [fDepthFrom, setFDepthFrom] = useState('');
  const [fDepthTo, setFDepthTo] = useState('');
  const [fEast, setFEast] = useState('');
  const [fNorth, setFNorth] = useState('');
  const [fElev, setFElev] = useState('');
  const [fLat, setFLat] = useState<number | null>(null);
  const [fLng, setFLng] = useState<number | null>(null);
  const [fAcc, setFAcc] = useState<number | null>(null);
  const [fSectorId, setFSectorId] = useState<string | null>(null);
  const [fLocationId, setFLocationId] = useState<string | null>(null);
  const [fLayer, setFLayer] = useState('');

  // Modales auxiliares
  const [showGps, setShowGps] = useState(false);
  const [showMaterialPicker, setShowMaterialPicker] = useState(false);
  const [showSectorPicker, setShowSectorPicker] = useState(false);
  const [showFormConfig, setShowFormConfig] = useState(false);
  const [materialEdit, setMaterialEdit] = useState<{ index: number; text: string } | null>(null);

  const loadData = useCallback(async () => {
    try {
      const [proj, secs, locs, smps, protos] = await Promise.all([
        projectsCollection.find(projectId).catch(() => null),
        projectSectorsCollection.query(Q.where('project_id', projectId)).fetch().catch(() => [] as any[]),
        locationsCollection.query(Q.where('project_id', projectId)).fetch().catch(() => [] as any[]),
        samplesCollection.query(Q.where('project_id', projectId)).fetch().catch(() => [] as any[]),
        protocolsCollection.query(Q.where('project_id', projectId)).fetch().catch(() => [] as any[]),
      ]);
      const flags = parseFeatureFlagsJson((proj as any)?.featureFlags);
      // v43.3 FIX — Las muestras usan sectores si el proyecto TIENE sectores definidos,
      // independientemente del modo "ensayos por sector" (fill_by_sector). Antes el filtro
      // y el campo de sector no aparecían aunque las muestras sí tuvieran sector asignado.
      setUsesSectors(secs.length > 0);
      setProjCoordSystem(flags.coordinate_system);
      setSampleIdentifier(((proj as any)?.sampleIdentifier ?? '').trim());
      setFormRows({ ...DEFAULT_ROWS, ...(flags.sample_form_rows ?? {}) });
      setMaterials(Array.isArray(flags.sample_materials) ? flags.sample_materials : []);
      setSectors(secs.map((s: any) => {
        let points: { lat: number; lng: number }[] | null = null;
        try { points = s.pointsJson ? JSON.parse(s.pointsJson) : null; } catch { points = null; }
        return { id: s.id, name: s.name, points };
      }));
      setLocations(locs.map((l: any) => ({ id: l.id, name: l.name })));
      setSamples([...smps].sort((a: any, b: any) => (b.seq ?? 0) - (a.seq ?? 0)));
      const counts: Record<string, number> = {};
      for (const p of protos as any[]) if (p.sampleId) counts[p.sampleId] = (counts[p.sampleId] ?? 0) + 1;
      setCountBySample(counts);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useFocusEffect(useCallback(() => {
    let active = true;
    setLoading(true);
    pullSamples(projectId).catch(() => {}).finally(() => { if (active) loadData(); });
    return () => { active = false; };
  }, [projectId, loadData]));

  const sectorName = (id: string | null) => sectors.find(s => s.id === id)?.name ?? '—';
  const locationName = (id: string | null) => locations.find(l => l.id === id)?.name ?? '—';

  const exitSelectMode = () => { setSelectMode(false); setSelectedIds(new Set()); };

  /** v43.5 — Captura croquis (un mapa por muestra con TODOS sus ensayos) + exporta el dossier. */
  const handleExportSampleDossier = async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0 || !currentUser) return;
    setExportingDossier(true);
    try {
      const proj = await projectsCollection.find(projectId).catch(() => null);
      const flags = parseFeatureFlagsJson((proj as any)?.featureFlags);
      // Ensayos (coords) por muestra → un spec de croquis por muestra.
      const specs = [];
      for (const sid of ids) {
        const ps = await protocolsCollection.query(Q.where('sample_id', sid), Q.where('status', Q.notEq('DRAFT'))).fetch().catch(() => [] as any[]);
        const ensayos = (ps as any[])
          .filter(p => p.latitude != null && p.longitude != null)
          .map(p => ({ lat: p.latitude as number, lng: p.longitude as number, label: p.protocolCode ?? p.protocolNumber ?? undefined }));
        const spec = await buildSampleCroquisSpec(projectId, sid, ensayos, flags);
        if (spec) specs.push(spec);
      }
      const croquisBySample = specs.length > 0 ? await captureMany(specs) : {};
      const uri = await exportSampleDossierPdf(ids, projectId, projectName, currentUser.id, croquisBySample);
      exitSelectMode();
      navigation.navigate('DossierPreview' as any, { pdfUri: uri, projectName });
    } catch (e: any) {
      Alert.alert(t('samples.error'), t('samples.dossierError', { detail: e?.message ?? String(e) }));
    } finally {
      setExportingDossier(false);
    }
  };

  const resetForm = () => {
    setFDate(todaySampleDate()); setFMaterial(''); setFCondition(null);
    setFDepthFrom(''); setFDepthTo(''); setFEast(''); setFNorth(''); setFElev('');
    setFLat(null); setFLng(null); setFAcc(null); setFSectorId(null); setFLocationId(null); setFLayer('');
  };

  // Captura por convergencia (misma lógica del ensayo numérico) + sector automático.
  const onGpsSaved = (r: GpsAveragedResult) => {
    setShowGps(false);
    setFLat(r.lat); setFLng(r.lng); setFAcc(r.accuracyM ?? null);
    const en = computeEastNorth(r.lat, r.lng, projCoordSystem);
    const isLatLng = projCoordSystem.endsWith('LATLNG');
    const round = (v: number) => isLatLng ? Math.round(v * 1e6) / 1e6 : Math.round(v * 100) / 100;
    setFEast(String(round(en.east))); setFNorth(String(round(en.north)));
    // Sector automático por punto-en-polígono (igual que protocolos).
    if (usesSectors) {
      const hit = findSectorByPoint({ lat: r.lat, lng: r.lng }, sectors);
      if (hit) setFSectorId(hit.id);
    }
  };

  const createSample = async () => {
    if (saving) return;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fDate.trim())) { Alert.alert(t('samples.invalidDateTitle'), t('samples.invalidDateMsg')); return; }
    setSaving(true);
    try {
      const existing = await samplesCollection.query(Q.where('project_id', projectId)).fetch();
      const seq = nextSampleSeq(existing.map((s: any) => s.seq));
      const code = buildSampleCode(sampleIdentifier, fDate.trim(), seq);
      const num = (s: string) => { const n = Number(s.replace(',', '.')); return s.trim() && isFinite(n) ? n : null; };
      const created = await database.write(async () => samplesCollection.create((s: any) => {
        s.projectId = projectId;
        s.sampleCode = code;
        s.seq = seq;
        s.sampleDate = fDate.trim();
        if (formRows.coords) {
          if (usesSectors) s.sectorId = fSectorId; else s.locationId = fLocationId;
          s.coordSystem = projCoordSystem;
          s.coordEast = num(fEast); s.coordNorth = num(fNorth); s.coordElevation = num(fElev);
          s.latitude = fLat; s.longitude = fLng; s.coordAccuracyM = fAcc;
          if (fLat != null) s.coordCapturedAt = Date.now();
        }
        if (formRows.material) s.materialType = fMaterial.trim() || null;
        if (formRows.condition) s.condition = fCondition;
        if (formRows.depth) { s.depthFrom = num(fDepthFrom); s.depthTo = num(fDepthTo); }
        if (formRows.layers && fLayer.trim()) s.layerInfoJson = JSON.stringify({ capa: fLayer.trim() });
        s.createdById = currentUser?.id ?? null;
        s.uploadStatus = 'PENDING';
      }));
      pushSample(created).catch(() => {});
      setShowAdd(false); resetForm();
      await loadData();
      navigation.navigate('SampleDetail', { projectId, projectName, sampleId: (created as any).id });
    } catch (e: any) {
      Alert.alert(t('samples.error'), e?.message ?? t('samples.createError'));
    } finally { setSaving(false); }
  };

  // ── Config del formulario (por proyecto) ──
  const toggleFormRow = async (k: RowKey) => {
    const next = { ...formRows, [k]: !formRows[k] };
    setFormRows(next);
    await mergeAndSaveFeatureFlags(projectId, { sample_form_rows: next });
  };
  // ── Catálogo de materiales ──
  const saveMaterials = async (next: string[]) => { setMaterials(next); await mergeAndSaveFeatureFlags(projectId, { sample_materials: next }); };
  const addMaterial = (name: string) => { const n = name.trim(); if (!n || materials.includes(n)) return; saveMaterials([...materials, n]); };
  const editMaterial = (index: number, name: string) => {
    const n = name.trim(); if (!n) return;
    const next = materials.slice(); const old = next[index]; next[index] = n; saveMaterials(next);
    if (fMaterial === old) setFMaterial(n);
  };

  const layerOf = (s: any): string => { try { return String(JSON.parse(s.layerInfoJson ?? '{}')?.capa ?? '').trim(); } catch { return ''; } };
  const showLayerFilter = !!formRows.layers;
  const dateMs = (s: any): number | null => {
    const d = s.sampleDate; if (typeof d !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(d)) return null;
    const [y, m, dd] = d.split('-').map(Number); return new Date(y, m - 1, dd).getTime();
  };
  const filtered = useMemo(() => samples.filter((s: any) => {
    // Rango por correlativo: el usuario ingresa solo los últimos dígitos (1 = 0001, 25 = 0025).
    const f = parseInt(fromSeq, 10), t = parseInt(toSeq, 10);
    if (!isNaN(f) && (s.seq ?? 0) < f) return false;
    if (!isNaN(t) && (s.seq ?? 0) > t) return false;
    if (filterSectorId && s.sectorId !== filterSectorId) return false;
    if (filterFromMs != null || filterToMs != null) {
      const ms = dateMs(s); if (ms == null) return false;
      if (filterFromMs != null && ms < filterFromMs) return false;
      if (filterToMs != null && ms > filterToMs) return false;
    }
    if (showLayerFilter && filterLayer.trim() && layerOf(s) !== filterLayer.trim()) return false;
    const q = search.trim().toLowerCase();
    if (q) {
      const hay = `${s.sampleCode ?? ''} ${s.materialType ?? ''}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  }), [samples, search, fromSeq, toSeq, filterSectorId, filterFromMs, filterToMs, filterLayer, showLayerFilter]);
  const hasActiveFilter = !!(search || fromSeq || toSeq || filterSectorId || filterFromMs != null || filterToMs != null || filterLayer);
  const clearFilters = () => { setSearch(''); setFromSeq(''); setToSeq(''); setFilterFromMs(null); setFilterToMs(null); setFilterSectorId(null); setFilterLayer(''); };
  const previewCode = buildSampleCode(sampleIdentifier, fDate.trim() || todaySampleDate(), nextSampleSeq(samples.map((s: any) => s.seq)));

  const ListHeader = (
    <View style={styles.listHeader}>
      {/* Toggle: oculta/revela TODOS los filtros (mismo patrón del Dosier) */}
      <TouchableOpacity style={[styles.filterToggle, hasActiveFilter && styles.filterToggleActive]} onPress={() => setShowFilters(v => !v)} activeOpacity={0.8}>
        <Ionicons name={hasActiveFilter ? 'funnel' : 'funnel-outline'} size={15} color={hasActiveFilter ? Colors.primary : Colors.textSecondary} />
        <Text style={[styles.filterToggleText, hasActiveFilter && { color: Colors.primary }]}>{hasActiveFilter ? t('samples.filtersActive') : t('samples.filters')}</Text>
        <View style={{ flex: 1 }} />
        {hasActiveFilter ? <TouchableOpacity onPress={clearFilters} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}><Text style={styles.clearFilter}>{t('samples.clear')}</Text></TouchableOpacity> : null}
        <Ionicons name={showFilters ? 'chevron-up' : 'chevron-down'} size={16} color={Colors.textMuted} style={{ marginLeft: 10 }} />
      </TouchableOpacity>

      {showFilters ? (
        <View style={{ gap: 8 }}>
          {/* Buscador de texto (busca MUESTRAS por código/material) */}
          <View style={styles.searchRow}>
            <Ionicons name="search" size={15} color={Colors.textMuted} />
            <TextInput style={styles.searchInput} value={search} onChangeText={setSearch} placeholder={t('samples.searchPlaceholder')} placeholderTextColor={Colors.textMuted} autoCapitalize="none" />
            {search !== '' && <TouchableOpacity onPress={() => setSearch('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}><Ionicons name="close-circle" size={16} color={Colors.textMuted} /></TouchableOpacity>}
          </View>

          {/* Calendario inicio/fin (mismo componente que ensayos por tipo) */}
          <DateRangePicker fromMs={filterFromMs} toMs={filterToMs} onChange={(from, to) => { setFilterFromMs(from); setFilterToMs(to); }} />

          {/* Chips de filtros cruzados (sector + rango de muestra + capa) → MODALES */}
          <View style={styles.chipsRow}>
            {usesSectors && sectors.length > 0 ? (
              <TouchableOpacity style={[styles.filterChip, filterSectorId && styles.filterChipActive]} onPress={() => setShowFilterSector(true)}>
                <Ionicons name="grid-outline" size={13} color={filterSectorId ? Colors.primary : Colors.textSecondary} />
                <Text style={[styles.filterChipText, filterSectorId && styles.filterChipTextActive]} numberOfLines={1}>{filterSectorId ? sectorName(filterSectorId) : t('samples.sector')}</Text>
                {filterSectorId && <TouchableOpacity onPress={() => setFilterSectorId(null)} hitSlop={{ top: 8, bottom: 8, left: 4, right: 8 }}><Ionicons name="close-circle" size={14} color={Colors.primary} /></TouchableOpacity>}
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity style={[styles.filterChip, (fromSeq || toSeq) && styles.filterChipActive]} onPress={() => setShowRangeModal(true)}>
              <Ionicons name="cube-outline" size={13} color={(fromSeq || toSeq) ? Colors.primary : Colors.textSecondary} />
              <Text style={[styles.filterChipText, (fromSeq || toSeq) && styles.filterChipTextActive]} numberOfLines={1}>{(fromSeq || toSeq) ? t('samples.sampleRangeValue', { from: fromSeq || '1', to: toSeq || '∞' }) : t('samples.sampleRange')}</Text>
              {(fromSeq || toSeq) && <TouchableOpacity onPress={() => { setFromSeq(''); setToSeq(''); }} hitSlop={{ top: 8, bottom: 8, left: 4, right: 8 }}><Ionicons name="close-circle" size={14} color={Colors.primary} /></TouchableOpacity>}
            </TouchableOpacity>
            {showLayerFilter ? (
              <TouchableOpacity style={[styles.filterChip, filterLayer && styles.filterChipActive]} onPress={() => setShowLayerModal(true)}>
                <Ionicons name="layers-outline" size={13} color={filterLayer ? Colors.primary : Colors.textSecondary} />
                <Text style={[styles.filterChipText, filterLayer && styles.filterChipTextActive]} numberOfLines={1}>{filterLayer ? t('samples.layerValue', { layer: filterLayer }) : t('samples.layer')}</Text>
                {filterLayer ? <TouchableOpacity onPress={() => setFilterLayer('')} hitSlop={{ top: 8, bottom: 8, left: 4, right: 8 }}><Ionicons name="close-circle" size={14} color={Colors.primary} /></TouchableOpacity> : null}
              </TouchableOpacity>
            ) : null}
          </View>
        </View>
      ) : null}

      {/* Botón añadir muestra: full-width tipo ghost */}
      <TouchableOpacity style={styles.ghostBtn} onPress={() => { resetForm(); setShowAdd(true); }} activeOpacity={0.7}>
        <Ionicons name="add-circle-outline" size={18} color={Colors.primary} />
        <Text style={styles.ghostBtnText}>{t('samples.addSample')}</Text>
      </TouchableOpacity>
      {!sampleIdentifier ? <Text style={styles.warnText}>{t('samples.identifierWarning')}</Text> : null}
    </View>
  );

  return (
    <View style={styles.container}>
      <AppHeader
        title={t('samples.title')}
        subtitle={projectName}
        onBack={() => navigation.goBack()}
        rightContent={canConfig ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
            <TouchableOpacity onPress={() => { if (selectMode) exitSelectMode(); else setSelectMode(true); }} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name={selectMode ? 'close' : 'checkbox-outline'} size={20} color={Colors.white} />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setShowFormConfig(true)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="settings-outline" size={20} color={Colors.white} />
            </TouchableOpacity>
          </View>
        ) : undefined}
      />

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={Colors.primary} /></View>
      ) : (
        <>
        {/* Filtros + botón añadir FUERA del FlatList (fijos): si fueran ListHeaderComponent
            inline, se recrearían en cada tecla y los TextInput del filtro perderían el foco. */}
        <View style={{ paddingHorizontal: 12, paddingTop: 12 }}>{ListHeader}</View>
        <FlatList
          data={filtered}
          keyExtractor={(s: any) => s.id}
          contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: 40 }}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={<View style={styles.empty}><Ionicons name="cube-outline" size={40} color={Colors.light} /><Text style={styles.emptyText}>{t('samples.empty')}</Text></View>}
          renderItem={({ item }: { item: any }) => {
            const sel = selectedIds.has(item.id);
            return (
            <TouchableOpacity style={[styles.dateCard, selectMode && sel && styles.dateCardSel]} activeOpacity={0.85}
              onPress={() => selectMode ? toggleSelected(item.id) : navigation.navigate('SampleDetail', { projectId, projectName, sampleId: item.id })}>
              {selectMode ? (
                <Ionicons name={sel ? 'checkbox' : 'square-outline'} size={22} color={sel ? Colors.primary : Colors.textMuted} style={{ marginRight: 10 }} />
              ) : null}
              <View style={{ flex: 1 }}>
                <Text style={styles.dateCardCode}>{item.sampleCode}</Text>
                <Text style={styles.dateCardSub} numberOfLines={1}>
                  {item.sampleDate ?? '—'}{item.materialType ? ` · ${item.materialType}` : ''}{item.sectorId ? ` · ${sectorName(item.sectorId)}` : ''}
                </Text>
              </View>
              <View style={styles.countBadge}><Text style={styles.countText}>{countBySample[item.id] ?? 0}</Text><Text style={styles.countLabel}>{t('samples.testsLabel')}</Text></View>
              {!selectMode ? <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} /> : null}
            </TouchableOpacity>
            );
          }}
        />
        {selectMode ? (
          <View style={styles.exportBar}>
            <Text style={styles.exportBarText}>{t('samples.selectedCount', { count: selectedIds.size })}</Text>
            <TouchableOpacity
              style={[styles.exportBarBtn, (selectedIds.size === 0 || exportingDossier) && styles.exportBarBtnOff]}
              disabled={selectedIds.size === 0 || exportingDossier}
              onPress={handleExportSampleDossier} activeOpacity={0.85}>
              {exportingDossier ? <ActivityIndicator color={Colors.white} /> : <Ionicons name="document-text-outline" size={18} color={Colors.white} />}
              <Text style={styles.exportBarBtnText}>{exportingDossier ? t('samples.generating') : t('samples.exportDossier')}</Text>
            </TouchableOpacity>
          </View>
        ) : null}
        </>
      )}

      {/* ── Modal: añadir muestra (solo filas configuradas) ── */}
      <Modal visible={showAdd} animationType="slide" transparent onRequestClose={() => setShowAdd(false)}>
        <View style={styles.modalBg}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{t('samples.newSample')}</Text>
              <TouchableOpacity onPress={() => setShowAdd(false)}><Ionicons name="close" size={22} color={Colors.white} /></TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={{ padding: 14, gap: 12 }}>
              <Text style={styles.previewCode}>{previewCode}</Text>

              <View style={styles.fieldRow}>
                <Text style={styles.fieldLabel}>{t('samples.sampleDate')}</Text>
                <TextInput style={styles.input} value={fDate} onChangeText={setFDate} placeholder={t('samples.datePlaceholder')} placeholderTextColor="#bbb" autoCapitalize="none" />
              </View>

              {formRows.material && (
                <View style={styles.fieldRow}>
                  <Text style={styles.fieldLabel}>{t('samples.materialType')}</Text>
                  <TouchableOpacity style={styles.selectField} onPress={() => setShowMaterialPicker(true)}>
                    <Text style={[styles.selectValue, !fMaterial && { color: Colors.textMuted }]}>{fMaterial || t('samples.select')}</Text>
                    <Ionicons name="chevron-down" size={16} color={Colors.textMuted} />
                  </TouchableOpacity>
                </View>
              )}

              {formRows.condition && (
                <View style={styles.fieldRow}>
                  <Text style={styles.fieldLabel}>{t('samples.condition')}</Text>
                  <View style={styles.segRow}>
                    {(['ALTERADA', 'INALTERADA'] as const).map(c => (
                      <TouchableOpacity key={c} style={[styles.seg, fCondition === c && styles.segOn]} onPress={() => setFCondition(c)}>
                        <Text style={[styles.segText, fCondition === c && styles.segTextOn]}>{c === 'ALTERADA' ? t('samples.altered') : t('samples.undisturbed')}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              )}

              {formRows.depth && (
                <View style={styles.fieldRow}>
                  <Text style={styles.fieldLabel}>{t('samples.depth')}</Text>
                  <View style={styles.twoCol}>
                    <TextInput style={[styles.input, { flex: 1 }]} value={fDepthFrom} onChangeText={setFDepthFrom} placeholder={t('samples.depthFrom')} keyboardType="decimal-pad" placeholderTextColor="#bbb" />
                    <TextInput style={[styles.input, { flex: 1 }]} value={fDepthTo} onChangeText={setFDepthTo} placeholder={t('samples.depthTo')} keyboardType="decimal-pad" placeholderTextColor="#bbb" />
                  </View>
                </View>
              )}

              {/* Ubicación = coordenadas + sector (el sector va DESPUÉS y se calcula por GPS) */}
              {formRows.coords && (
                <View style={styles.groupBox}>
                  <Text style={styles.groupTitle}>{t('samples.location')}</Text>
                  <Text style={styles.datumHint}>{t('samples.datumHint', { system: SYSTEM_LABELS[projCoordSystem] })}</Text>
                  <View style={styles.twoCol}>
                    <TextInput style={[styles.input, { flex: 1 }]} value={fEast} onChangeText={setFEast} placeholder={t('samples.east')} keyboardType="decimal-pad" placeholderTextColor="#bbb" />
                    <TextInput style={[styles.input, { flex: 1 }]} value={fNorth} onChangeText={setFNorth} placeholder={t('samples.north')} keyboardType="decimal-pad" placeholderTextColor="#bbb" />
                  </View>
                  <TextInput style={styles.input} value={fElev} onChangeText={setFElev} placeholder={t('samples.elevation')} keyboardType="decimal-pad" placeholderTextColor="#bbb" />
                  <TouchableOpacity style={styles.gpsBtn} onPress={() => setShowGps(true)}>
                    <Ionicons name="locate" size={16} color={Colors.white} />
                    <Text style={styles.gpsBtnText}>{t('samples.captureCoords')}</Text>
                  </TouchableOpacity>
                  {fLat != null ? <Text style={styles.gpsHint}>{t('samples.gpsHint', { lat: fLat.toFixed(6), lng: fLng?.toFixed(6) ?? '', acc: fAcc != null ? t('samples.gpsAccuracy', { m: Math.round(fAcc) }) : '' })}</Text> : null}
                  {usesSectors ? (
                    <View style={styles.fieldRow}>
                      <Text style={styles.fieldLabel}>{fLat != null ? t('samples.sectorAuto') : t('samples.sector')}</Text>
                      <TouchableOpacity style={styles.selectField} onPress={() => setShowSectorPicker(true)}>
                        <Text style={[styles.selectValue, !fSectorId && { color: Colors.textMuted }]}>{fSectorId ? sectorName(fSectorId) : t('samples.select')}</Text>
                        <Ionicons name="chevron-down" size={16} color={Colors.textMuted} />
                      </TouchableOpacity>
                    </View>
                  ) : locations.length > 0 ? (
                    <View style={styles.fieldRow}>
                      <Text style={styles.fieldLabel}>{t('samples.location')}</Text>
                      <TouchableOpacity style={styles.selectField} onPress={() => setShowSectorPicker(true)}>
                        <Text style={[styles.selectValue, !fLocationId && { color: Colors.textMuted }]}>{fLocationId ? locationName(fLocationId) : t('samples.select')}</Text>
                        <Ionicons name="chevron-down" size={16} color={Colors.textMuted} />
                      </TouchableOpacity>
                    </View>
                  ) : null}
                </View>
              )}

              {formRows.layers && (
                <View style={styles.fieldRow}>
                  <Text style={styles.fieldLabel}>{t('samples.layerInfo')}</Text>
                  <View style={styles.layerRow}>
                    <Text style={styles.layerPrefix}>{t('samples.layerPrefix')}</Text>
                    <TextInput style={[styles.input, { flex: 1 }]} value={fLayer} onChangeText={setFLayer} placeholder={t('samples.numberPlaceholder')} keyboardType="number-pad" placeholderTextColor="#bbb" />
                  </View>
                </View>
              )}

              <TouchableOpacity style={[styles.ghostBtn, saving && { opacity: 0.5 }]} onPress={createSample} disabled={saving} activeOpacity={0.7}>
                <Ionicons name="checkmark-circle-outline" size={18} color={Colors.primary} />
                <Text style={styles.ghostBtnText}>{saving ? t('samples.creating') : t('samples.createSample')}</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* GPS por convergencia (misma del ensayo numérico) */}
      <GpsCaptureModal visible={showGps} coordSystem={projCoordSystem} onCancel={() => setShowGps(false)} onSave={onGpsSaved} />

      {/* Picker sector/ubicación */}
      <PickerModal visible={showSectorPicker} title={usesSectors ? t('samples.sector') : t('samples.location')}
        options={usesSectors ? sectors.map(s => ({ id: s.id, name: s.name })) : locations}
        onSelect={(id) => { if (usesSectors) setFSectorId(id); else setFLocationId(id); setShowSectorPicker(false); }}
        onClose={() => setShowSectorPicker(false)} />

      {/* Picker de filtro por tramo/sector (con opción "Todos") */}
      <PickerModal visible={showFilterSector} title={t('samples.filterBySector')}
        options={[{ id: '__all__', name: t('samples.allSegments') }, ...sectors.map(s => ({ id: s.id, name: s.name }))]}
        onSelect={(id) => { setFilterSectorId(id === '__all__' ? null : id); setShowFilterSector(false); }}
        onClose={() => setShowFilterSector(false)} />

      {/* Modal: rango de muestras (desde/hasta por correlativo) */}
      <Modal visible={showRangeModal} transparent animationType="fade" onRequestClose={() => setShowRangeModal(false)}>
        <View style={styles.modalBg}>
          <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={() => setShowRangeModal(false)} />
          <View style={styles.filterCard}>
            <Text style={styles.modalTitleDark}>{t('samples.sampleRangeTitle')}</Text>
            <View style={styles.twoCol}>
              <View style={{ flex: 1, gap: 4 }}><Text style={styles.filterFieldLabel}>{t('samples.fromSample')}</Text><TextInput style={styles.input} value={fromSeq} onChangeText={setFromSeq} keyboardType="number-pad" placeholder={t('samples.numberPlaceholder')} placeholderTextColor="#bbb" /></View>
              <View style={{ flex: 1, gap: 4 }}><Text style={styles.filterFieldLabel}>{t('samples.toSample')}</Text><TextInput style={styles.input} value={toSeq} onChangeText={setToSeq} keyboardType="number-pad" placeholder={t('samples.numberPlaceholder')} placeholderTextColor="#bbb" /></View>
            </View>
            <TouchableOpacity style={styles.ghostBtn} onPress={() => setShowRangeModal(false)}><Text style={styles.ghostBtnText}>{t('samples.apply')}</Text></TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Modal: filtro por capa */}
      <Modal visible={showLayerModal} transparent animationType="fade" onRequestClose={() => setShowLayerModal(false)}>
        <View style={styles.modalBg}>
          <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={() => setShowLayerModal(false)} />
          <View style={styles.filterCard}>
            <Text style={styles.modalTitleDark}>{t('samples.filterByLayer')}</Text>
            <View style={styles.layerRow}>
              <Text style={styles.layerPrefix}>{t('samples.layerPrefix')}</Text>
              <TextInput style={[styles.input, { flex: 1 }]} value={filterLayer} onChangeText={setFilterLayer} keyboardType="number-pad" placeholder={t('samples.numberPlaceholder')} placeholderTextColor="#bbb" />
            </View>
            <TouchableOpacity style={styles.ghostBtn} onPress={() => setShowLayerModal(false)}><Text style={styles.ghostBtnText}>{t('samples.apply')}</Text></TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Picker de material con agregar/editar */}
      <Modal visible={showMaterialPicker} transparent animationType="fade" onRequestClose={() => setShowMaterialPicker(false)}>
        <View style={styles.modalBg}>
          <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={() => setShowMaterialPicker(false)} />
          <View style={styles.filterCard}>
            <Text style={styles.modalTitleDark}>{t('samples.materialType')}</Text>
            <ScrollView style={{ maxHeight: 320 }}>
              {materials.length === 0 ? <Text style={styles.emptyText}>{t('samples.noMaterials')}</Text> : materials.map((m, i) => (
                <View key={m + i} style={styles.matRow}>
                  <TouchableOpacity style={{ flex: 1 }} onPress={() => { setFMaterial(m); setShowMaterialPicker(false); }}>
                    <Text style={styles.optionText}>{m}</Text>
                  </TouchableOpacity>
                  {canConfig ? <TouchableOpacity onPress={() => setMaterialEdit({ index: i, text: m })} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}><Ionicons name="create-outline" size={18} color={Colors.primary} /></TouchableOpacity> : null}
                </View>
              ))}
            </ScrollView>
            <View style={styles.addMatRow}>
              <TextInput style={[styles.input, { flex: 1 }]} value={fMaterial} onChangeText={setFMaterial} placeholder={t('samples.newMaterialPlaceholder')} placeholderTextColor="#bbb" />
              <TouchableOpacity style={styles.addMatBtn} onPress={() => { addMaterial(fMaterial); }}>
                <Ionicons name="add" size={20} color={Colors.white} />
              </TouchableOpacity>
            </View>
            <Text style={styles.hint}>{t('samples.materialHint')}</Text>
          </View>
        </View>
      </Modal>

      {/* Editar material */}
      <Modal visible={!!materialEdit} transparent animationType="fade" onRequestClose={() => setMaterialEdit(null)}>
        <View style={styles.modalBg}>
          <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={() => setMaterialEdit(null)} />
          <View style={styles.filterCard}>
            <Text style={styles.modalTitleDark}>{t('samples.editMaterial')}</Text>
            <TextInput style={styles.input} value={materialEdit?.text ?? ''} onChangeText={txt => setMaterialEdit(e => e ? { ...e, text: txt } : e)} autoFocus />
            <TouchableOpacity style={styles.saveBtn} onPress={() => { if (materialEdit) editMaterial(materialEdit.index, materialEdit.text); setMaterialEdit(null); }}>
              <Text style={styles.saveBtnText}>{t('samples.save')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Config del formulario (creador/jefe) */}
      <Modal visible={showFormConfig} transparent animationType="fade" onRequestClose={() => setShowFormConfig(false)}>
        <View style={styles.modalBg}>
          <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={() => setShowFormConfig(false)} />
          <View style={styles.filterCard}>
            <Text style={styles.modalTitleDark}>{t('samples.formFieldsTitle')}</Text>
            <Text style={styles.hint}>{t('samples.formFieldsHint')}</Text>
            {(Object.keys(ROW_LABELS) as RowKey[]).map(k => (
              <TouchableOpacity key={k} style={styles.cfgRow} onPress={() => toggleFormRow(k)}>
                <Ionicons name={formRows[k] ? 'checkbox' : 'square-outline'} size={20} color={formRows[k] ? Colors.primary : Colors.textMuted} />
                <Text style={styles.cfgLabel}>{t(ROW_I18N[k])}</Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity style={styles.ghostBtn} onPress={() => setShowFormConfig(false)} activeOpacity={0.7}><Ionicons name="checkmark-circle-outline" size={18} color={Colors.primary} /><Text style={styles.ghostBtnText}>{t('samples.done')}</Text></TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function PickerModal({ visible, title, options, onSelect, onClose }: { visible: boolean; title: string; options: Lite[]; onSelect: (id: string) => void; onClose: () => void }) {
  const { t } = useI18n();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalBg}>
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={onClose} />
        <View style={styles.filterCard}>
          <Text style={styles.modalTitleDark}>{title}</Text>
          <ScrollView style={{ maxHeight: 320 }}>
            {options.length === 0 ? <Text style={styles.emptyText}>{t('samples.noOptions')}</Text> : options.map(o => (
              <TouchableOpacity key={o.id} style={styles.optionRow} onPress={() => onSelect(o.id)}><Text style={styles.optionText}>{o.name}</Text></TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.surface },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  empty: { alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 40 },
  emptyText: { color: Colors.textSecondary, fontSize: 14, textAlign: 'center' },
  warnText: { color: Colors.warning, fontSize: 12, textAlign: 'center', marginTop: 8 },
  listHeader: { gap: 8, marginBottom: 8 },
  filterToggle: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.md, paddingHorizontal: 12, paddingVertical: 10 },
  filterToggleActive: { borderColor: Colors.primary },
  filterToggleText: { fontSize: 13, fontWeight: '700', color: Colors.textSecondary },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: Colors.white, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border, paddingHorizontal: 10 },
  searchInput: { flex: 1, fontSize: 13, color: Colors.textPrimary, paddingVertical: 9 },
  filterChip: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.border, borderRadius: 16, paddingHorizontal: 10, paddingVertical: 6, maxWidth: 200 },
  filterChipActive: { borderColor: Colors.primary, backgroundColor: Colors.primary + '0A' },
  filterChipText: { fontSize: 11, fontWeight: '700', color: Colors.textSecondary, flexShrink: 1 },
  filterChipTextActive: { color: Colors.primary },
  filterLabel: { fontSize: 11, fontWeight: '800', color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 4 },
  filterNote: { fontSize: 11, color: Colors.textSecondary, fontStyle: 'italic', marginTop: -2 },
  filterSelect: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.sm, paddingHorizontal: 10, paddingVertical: 10, backgroundColor: Colors.white },
  filterSelectVal: { fontSize: 14, color: Colors.textPrimary },
  filterRow: { flexDirection: 'row', gap: 8 },
  filterField: { flex: 1, gap: 3 },
  filterFieldLabel: { fontSize: 10, color: Colors.textMuted, fontWeight: '700' },
  filterInput: { borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.sm, paddingHorizontal: 10, paddingVertical: 8, fontSize: 13, color: Colors.textPrimary, backgroundColor: Colors.white },
  chipsRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  chip: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: 16, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.white },
  chipOn: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  chipText: { fontSize: 12, color: Colors.textSecondary, fontWeight: '600' },
  chipTextOn: { color: Colors.white },
  clearFilter: { color: Colors.primary, fontWeight: '700', fontSize: 13, alignSelf: 'flex-end' },
  ghostBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 13, borderRadius: Radius.md, borderWidth: 1.5, borderColor: Colors.primary, backgroundColor: Colors.white, marginTop: 4 },
  ghostBtnText: { color: Colors.primary, fontWeight: '800', fontSize: 15 },
  // Tarjeta compacta con línea superior (estilo "ensayos por fecha")
  dateCard: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: Colors.white, borderRadius: Radius.md, paddingVertical: 11, paddingHorizontal: 12, borderTopWidth: 3, borderTopColor: Colors.secondary, marginBottom: 8, ...Shadow.subtle },
  dateCardSel: { borderWidth: 1.5, borderColor: Colors.primary, borderTopColor: Colors.primary },
  exportBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingHorizontal: 16, paddingVertical: 12, backgroundColor: Colors.white, borderTopWidth: 1, borderTopColor: Colors.border },
  exportBarText: { fontSize: 13, fontWeight: '700', color: Colors.textSecondary },
  exportBarBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: Colors.primary, paddingHorizontal: 18, paddingVertical: 11, borderRadius: Radius.md },
  exportBarBtnOff: { opacity: 0.5 },
  exportBarBtnText: { color: Colors.white, fontWeight: '800', fontSize: 14 },
  dateCardCode: { fontSize: 14, fontWeight: '800', color: Colors.navy },
  dateCardSub: { fontSize: 11, color: Colors.textSecondary, marginTop: 2 },
  countBadge: { alignItems: 'center', paddingHorizontal: 6 },
  countText: { fontSize: 15, fontWeight: '900', color: Colors.primary },
  countLabel: { fontSize: 9, color: Colors.textMuted },
  modalBg: { flex: 1, backgroundColor: 'rgba(14,33,61,0.55)', justifyContent: 'center', padding: 14 },
  modalCard: { backgroundColor: Colors.white, borderRadius: Radius.lg, maxHeight: '90%', overflow: 'hidden' },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: Colors.navy, paddingHorizontal: 14, paddingVertical: 12 },
  modalTitle: { color: Colors.white, fontWeight: '800', fontSize: 16 },
  modalTitleDark: { color: Colors.navy, fontWeight: '800', fontSize: 16, marginBottom: 8 },
  previewCode: { fontSize: 16, fontWeight: '900', color: Colors.primary, textAlign: 'center', letterSpacing: 0.5 },
  fieldRow: { gap: 6 },
  fieldLabel: { fontSize: 12, fontWeight: '700', color: Colors.textSecondary },
  input: { borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.sm, paddingHorizontal: 10, paddingVertical: 9, fontSize: 14, color: Colors.textPrimary, backgroundColor: Colors.white },
  twoCol: { flexDirection: 'row', gap: 8 },
  selectField: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.sm, paddingHorizontal: 10, paddingVertical: 10 },
  selectValue: { fontSize: 14, color: Colors.textPrimary },
  segRow: { flexDirection: 'row', gap: 8 },
  seg: { flex: 1, alignItems: 'center', paddingVertical: 9, borderRadius: Radius.sm, borderWidth: 1, borderColor: Colors.border },
  segOn: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  segText: { fontSize: 13, fontWeight: '700', color: Colors.textSecondary },
  segTextOn: { color: Colors.white },
  groupBox: { borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.md, padding: 10, gap: 8, backgroundColor: Colors.surface },
  groupTitle: { fontSize: 13, fontWeight: '800', color: Colors.navy },
  datumHint: { fontSize: 11, color: Colors.textSecondary, fontStyle: 'italic' },
  gpsBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: Colors.primary, paddingVertical: 10, borderRadius: Radius.sm },
  gpsBtnText: { color: Colors.white, fontWeight: '700', fontSize: 13 },
  gpsHint: { fontSize: 11, color: Colors.textMuted, textAlign: 'center' },
  layerRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  layerPrefix: { fontSize: 14, fontWeight: '800', color: Colors.navy },
  saveBtn: { backgroundColor: Colors.success, paddingVertical: 13, borderRadius: Radius.md, alignItems: 'center', marginTop: 8 },
  saveBtnText: { color: Colors.white, fontWeight: '800', fontSize: 15 },
  filterCard: { backgroundColor: Colors.white, borderRadius: Radius.lg, padding: 16, gap: 8 },
  optionRow: { paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: Colors.divider },
  optionText: { fontSize: 14, color: Colors.textPrimary },
  matRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: Colors.divider },
  addMatRow: { flexDirection: 'row', gap: 8, alignItems: 'center', marginTop: 4 },
  addMatBtn: { backgroundColor: Colors.primary, width: 42, height: 42, borderRadius: Radius.sm, alignItems: 'center', justifyContent: 'center' },
  hint: { fontSize: 11, color: Colors.textMuted },
  cfgRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10 },
  cfgLabel: { fontSize: 14, color: Colors.textPrimary },
});
