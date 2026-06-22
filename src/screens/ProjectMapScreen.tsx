/**
 * ProjectMapScreen — Visor de mapa del proyecto (v26).
 *
 *  - MapView (Google) con pines de protocolos que tienen coordenadas + croquis
 *    de los sectores con geometría.
 *  - Toggle Google ↔ Ortofoto si `project.map_tile_url` está definido.
 *  - Filtros mínimos por status (DRAFT/IN_PROGRESS/SUBMITTED/APPROVED/REJECTED).
 *  - Tap pin → navega a ProtocolAudit (APPROVED/SUBMITTED) o ProtocolFill (resto).
 *  - Pin coloreado según `displayColor` del sector asignado; default si no.
 *
 * Sin coords iniciales: si el proyecto no tiene ningún protocolo con coords NI
 * ningún sector con geometría, mostramos placeholder pidiendo configurar.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import MapView, { Marker, Polygon, PROVIDER_GOOGLE, UrlTile, Overlay, type MapType } from 'react-native-maps';
import * as Location from 'expo-location';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@navigation/types';
import AppHeader from '@components/AppHeader';
import { useTourStep } from '@hooks/useTourStep';
import { useTour } from '@context/TourContext';
import { Colors, Radius } from '../theme/colors';
import { Q } from '@nozbe/watermelondb';
import {
  projectSectorsCollection, protocolsCollection, projectsCollection,
  protocolTemplatesCollection, workSessionsCollection, workSessionIntervalsCollection,
} from '@db/index';
import type ProjectSector from '@models/ProjectSector';
import type Protocol from '@models/Protocol';
import type ProtocolTemplate from '@models/ProtocolTemplate';
import { pullProjectSectors, pullProjectSettings, diagnoseOrtho } from '@services/SupabaseSyncService';
import { downloadFromS3 } from '@services/S3Service';
import * as FileSystem from 'expo-file-system';
import { effectiveDurationMs } from '@services/WorkSessionService';
import { parseFeatureFlagsJson, isGeolocationEnabled } from '@utils/featureFlags';
import { useI18n, tx } from '@i18n/index';

type Props = NativeStackScreenProps<RootStackParamList, 'ProjectMap'>;

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  DRAFT:       { get label() { return tx('projectMap.status.draft'); },      color: '#9ca3af' },
  IN_PROGRESS: { get label() { return tx('projectMap.status.inProgress'); }, color: '#3b82f6' },
  SUBMITTED:   { get label() { return tx('projectMap.status.submitted'); },  color: '#f59e0b' },
  APPROVED:    { get label() { return tx('projectMap.status.approved'); },   color: '#22c55e' },
  REJECTED:    { get label() { return tx('projectMap.status.rejected'); },   color: '#ef4444' },
};

const ALL_STATUSES = Object.keys(STATUS_LABELS);

// ── Componentes de la barra de filtros/capas (dropdowns) ────────────────────
function FilterBtn({ label, icon, active, dot, onPress }: {
  label: string; icon: any; active: boolean; dot?: boolean; onPress: () => void;
}) {
  return (
    <TouchableOpacity onPress={onPress} style={[styles.fbtn, active && styles.fbtnActive]}>
      <Ionicons name={icon} size={13} color={active ? Colors.white : Colors.textSecondary} />
      <Text style={[styles.fbtnText, active && { color: Colors.white }]}>{label}</Text>
      {dot && <View style={styles.fbtnDot} />}
      <Ionicons name={active ? 'chevron-up' : 'chevron-down'} size={12} color={active ? Colors.white : Colors.textMuted} />
    </TouchableOpacity>
  );
}
function CheckRow({ label, on, onPress, color }: { label: string; on: boolean; onPress: () => void; color?: string }) {
  return (
    <TouchableOpacity onPress={onPress} style={styles.checkRow}>
      <Ionicons name={on ? 'checkbox' : 'square-outline'} size={18} color={on ? Colors.primary : Colors.textMuted} />
      {color && <View style={[styles.checkSwatch, { backgroundColor: color }]} />}
      <Text style={styles.checkLabel} numberOfLines={1}>{label}</Text>
    </TouchableOpacity>
  );
}
function RadioRow({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity onPress={onPress} style={styles.checkRow}>
      <Ionicons name={on ? 'radio-button-on' : 'radio-button-off'} size={18} color={on ? Colors.primary : Colors.textMuted} />
      <Text style={styles.checkLabel}>{label}</Text>
    </TouchableOpacity>
  );
}

export default function ProjectMapScreen({ route, navigation }: Props) {
  const { t } = useI18n();
  const { projectId, projectName } = route.params;
  const insets = useSafeAreaInsets();
  const { jumpToStep, isActive: tourActive, isContextual, dismissTour } = useTour();
  const mapFiltersRef = useTourStep('map_filters');
  const mapViewRef = useTourStep('map_view');
  const mapLayerToggleRef = useTourStep('map_layer_toggle');

  const [sectors, setSectors] = useState<ProjectSector[]>([]);
  const [protocols, setProtocols] = useState<Protocol[]>([]);
  const [mapTileUrl, setMapTileUrl] = useState<string | null>(null);
  const [showOrthophoto, setShowOrthophoto] = useState(false);
  // v34 — Ortofoto liviana georreferenciada (imagen WebP en S3 + bbox WGS84).
  // `orthoActive` = la activa cruda (s3Key+bounds); `orthophoto` = ya con uri LOCAL
  // descargada (el bucket es privado → no sirve la URL pública; se baja a caché).
  type Tile = { s3Key: string; bounds: [[number, number], [number, number]] };
  const [orthoTiles, setOrthoTiles] = useState<Tile[]>([]);
  const [orthoLayers, setOrthoLayers] = useState<{ bounds: [[number, number], [number, number]]; uri: string }[]>([]);
  const [orthoStatus, setOrthoStatus] = useState<'none' | 'loading' | 'ready' | 'error'>('none');
  const [orthoKeyOnly, setOrthoKeyOnly] = useState(false); // referencia recibida
  const [resyncing, setResyncing] = useState(false);
  const [showOrthoImg, setShowOrthoImg] = useState(true);
  const [showLegend, setShowLegend] = useState(false);
  const [showLabels, setShowLabels] = useState(true); // etiquetas (código) sobre cada pin
  const [statusFilter, setStatusFilter] = useState<Set<string>>(new Set(ALL_STATUSES));
  const [loading, setLoading] = useState(true);
  // v35 — capas + filtros profesionales
  const [templates, setTemplates] = useState<ProtocolTemplate[]>([]);
  const [mapType, setMapType] = useState<MapType>('standard');
  const [openPanel, setOpenPanel] = useState<null | 'capa' | 'estado' | 'sector' | 'tipo' | 'fecha'>(null);
  // Filtros multi-selección; `null` = "todos" (por defecto todos prendidos).
  const [sectorFilter, setSectorFilter] = useState<Set<string> | null>(null);
  const [typeFilter, setTypeFilter] = useState<Set<string> | null>(null);
  // Rango de fechas (YYYY-MM-DD). '' = sin límite por ese extremo.
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');
  const [locating, setLocating] = useState(false);
  const mapRef = useRef<MapView | null>(null);

  // v29 — Guard de flag: si map_enabled está OFF, bloqueamos acceso.
  useEffect(() => {
    projectsCollection.find(projectId).then((p: any) => {
      const flags = parseFeatureFlagsJson(p?.featureFlags);
      if (!isGeolocationEnabled(flags)) {
        Alert.alert(
          t('projectMap.guard.title'),
          t('projectMap.guard.message'),
          [{ text: t('projectMap.guard.ok'), onPress: () => navigation.goBack() }],
        );
      }
    }).catch(() => {});
  }, [projectId, navigation]);

  useEffect(() => {
    pullProjectSectors(projectId).catch(() => {});
    // v34 — refresca settings del proyecto (incluye ortofoto) por si cambió en la web.
    pullProjectSettings(projectId).catch(() => {});

    const subS = projectSectorsCollection
      .query(Q.where('project_id', projectId))
      .observe()
      .subscribe(setSectors);
    const subP = protocolsCollection
      .query(Q.where('project_id', projectId))
      .observe()
      .subscribe(setProtocols);
    const subT = protocolTemplatesCollection
      .query(Q.where('project_id', projectId))
      .observe()
      .subscribe(setTemplates);

    // Suscripción reactiva al proyecto: si llega la ortofoto por sync, se refleja.
    const subProj = projectsCollection
      .findAndObserve(projectId)
      .subscribe((proj: any) => {
        setMapTileUrl(proj?.mapTileUrl ?? null);
        const validBounds = (b: any) => Array.isArray(b) && b.length === 2
          && Array.isArray(b[0]) && Array.isArray(b[1])
          && [b[0][0], b[1][0], b[0][1], b[1][1]].every((n: any) => Number.isFinite(n))
          && Math.abs(b[0][0]) <= 90 && Math.abs(b[1][0]) <= 90
          && Math.abs(b[0][1]) <= 180 && Math.abs(b[1][1]) <= 180;
        // v37 — teselas (1 o N). Fallback a la key única antigua.
        const rawTiles = proj?.orthophotoTilesJson;
        const key = proj?.orthophotoS3Key;
        setOrthoKeyOnly(!!rawTiles || !!key);
        let tiles: Tile[] = [];
        try {
          if (rawTiles) {
            const arr = JSON.parse(rawTiles);
            if (Array.isArray(arr)) tiles = arr.filter((t: any) => t?.s3Key && validBounds(t.bounds)).map((t: any) => ({ s3Key: t.s3Key, bounds: t.bounds }));
          }
          if (tiles.length === 0 && key && proj?.orthophotoBoundsJson) {
            const b = JSON.parse(proj.orthophotoBoundsJson);
            if (validBounds(b)) tiles = [{ s3Key: key, bounds: b }];
          }
        } catch { tiles = []; }
        setOrthoTiles(tiles);
        setLoading(false);
      });

    return () => { subS.unsubscribe(); subP.unsubscribe(); subT.unsubscribe(); subProj.unsubscribe(); };
  }, [projectId]);

  // v35 — Descargar la ortofoto activa a caché local (bucket privado → URL pública
  // da 403). Mismo patrón que planos/fotos. El s3Key es único por versión → la
  // caché es estable; solo se baja si falta.
  useEffect(() => {
    let cancelled = false;
    if (orthoTiles.length === 0) { setOrthoLayers([]); setOrthoStatus('none'); return; }
    setOrthoStatus('loading');
    (async () => {
      const dir = `${FileSystem.cacheDirectory}ortho/`;
      await FileSystem.makeDirectoryAsync(dir, { intermediates: true }).catch(() => {});
      const layers: { bounds: [[number, number], [number, number]]; uri: string }[] = [];
      let anyErr = false;
      for (const t of orthoTiles) {
        try {
          const safe = t.s3Key.replace(/[^a-z0-9.]+/gi, '_');
          const localUri = `${dir}${safe}`;
          const info = await FileSystem.getInfoAsync(localUri);
          if (!info.exists) await downloadFromS3(t.s3Key, localUri);
          layers.push({ bounds: t.bounds, uri: localUri });
        } catch (e) {
          console.warn('[ortho] descarga de tesela falló:', e);
          anyErr = true;
        }
      }
      if (!cancelled) {
        setOrthoLayers(layers);
        setOrthoStatus(layers.length === 0 ? 'error' : anyErr ? 'error' : 'ready');
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orthoTiles.map(t => t.s3Key).join('|')]);

  useEffect(() => {
    const unsub = navigation.addListener('blur', () => {
      if (tourActive && isContextual) dismissTour();
    });
    return unsub;
  }, [navigation, tourActive, isContextual, dismissTour]);

  const sectorById = useMemo(() => {
    const m = new Map<string, ProjectSector>();
    for (const s of sectors) m.set(s.id, s);
    return m;
  }, [sectors]);

  // Etiqueta de tipo (template) por id.
  const templateLabelById = useMemo(() => {
    const m = new Map<string, string>();
    for (const tpl of templates) m.set(tpl.id, (tpl as any).idProtocolo || (tpl as any).name || t('projectMap.opt.type'));
    return m;
  }, [templates, t]);

  // Opciones de filtro derivadas de los protocolos con coords (id/label).
  const NONE = '__none__';
  const inSet = (set: Set<string> | null, key: string) => set == null || set.has(key);

  const sectorOptions = useMemo(() => {
    const opts: { key: string; label: string }[] = sectors.map(s => ({ key: s.id, label: s.name }));
    opts.push({ key: NONE, label: t('projectMap.opt.noSector') });
    return opts;
  }, [sectors, t]);

  const typeOptions = useMemo(() => {
    const ids = new Set<string>();
    let hasNone = false;
    for (const p of protocols) {
      const tid = (p as any).templateId;
      if (tid) ids.add(tid); else hasNone = true;
    }
    const opts = Array.from(ids).map(id => ({ key: id, label: templateLabelById.get(id) ?? t('projectMap.opt.type') }))
      .sort((a, b) => a.label.localeCompare(b.label));
    if (hasNone) opts.push({ key: NONE, label: t('projectMap.opt.noType') });
    return opts;
  }, [protocols, templateLabelById, t]);

  const dateOptions = useMemo(() => {
    const set = new Set<string>();
    let hasNone = false;
    for (const p of protocols) {
      const d = (p as any).ensayoDate;
      if (d) set.add(d); else hasNone = true;
    }
    const opts = Array.from(set).sort((a, b) => b.localeCompare(a)).map(d => ({ key: d, label: d }));
    if (hasNone) opts.push({ key: NONE, label: t('projectMap.opt.noDate') });
    return opts;
  }, [protocols, t]);

  const protocolsWithCoords = useMemo(() =>
    protocols.filter(p => {
      const lat = (p as any).latitude, lng = (p as any).longitude;
      if (lat == null || lng == null) return false;
      if (!statusFilter.has((p as any).status)) return false;
      if (!inSet(sectorFilter, (p as any).sectorId ?? NONE)) return false;
      if (!inSet(typeFilter, (p as any).templateId ?? NONE)) return false;
      // Rango de fechas: comparación lexicográfica de YYYY-MM-DD (válida).
      const ed = (p as any).ensayoDate as string | null | undefined;
      if (dateFrom || dateTo) {
        if (!ed) return false;                    // sin fecha → fuera del rango
        if (dateFrom && ed < dateFrom) return false;
        if (dateTo && ed > dateTo) return false;
      }
      return true;
    }),
    [protocols, statusFilter, sectorFilter, typeFilter, dateFrom, dateTo],
  );

  const polygonsWithGeom = useMemo(() =>
    sectors.filter(s => {
      const pts = s.points;
      return pts && pts.length >= 3;
    }),
    [sectors],
  );

  // Región inicial: centroide de TODOS los puntos disponibles (pines + sectores)
  const initialRegion = useMemo(() => {
    const points: { lat: number; lng: number }[] = [];
    for (const p of protocolsWithCoords) points.push({ lat: (p as any).latitude, lng: (p as any).longitude });
    for (const s of polygonsWithGeom) for (const pt of (s.points || [])) points.push(pt);
    // v34 — encuadra también la ortofoto (clave si aún no hay pines ni sectores).
    for (const t of orthoTiles) {
      points.push({ lat: t.bounds[0][0], lng: t.bounds[0][1] });
      points.push({ lat: t.bounds[1][0], lng: t.bounds[1][1] });
    }
    if (points.length === 0) {
      // Default: Lima, Perú (los proyectos del usuario están allí)
      return { latitude: -12.046374, longitude: -77.042793, latitudeDelta: 0.1, longitudeDelta: 0.1 };
    }
    const lats = points.map(p => p.lat), lngs = points.map(p => p.lng);
    const minLat = Math.min(...lats), maxLat = Math.max(...lats);
    const minLng = Math.min(...lngs), maxLng = Math.max(...lngs);
    const centerLat = (minLat + maxLat) / 2, centerLng = (minLng + maxLng) / 2;
    // padding 30% sobre el bbox, mínimo 0.005 (~500m)
    const dLat = Math.max((maxLat - minLat) * 1.3, 0.005);
    const dLng = Math.max((maxLng - minLng) * 1.3, 0.005);
    return { latitude: centerLat, longitude: centerLng, latitudeDelta: dLat, longitudeDelta: dLng };
  }, [protocolsWithCoords, polygonsWithGeom, orthoTiles]);

  const toggleStatus = (s: string) => {
    setStatusFilter(prev => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s); else next.add(s);
      return next;
    });
  };

  // Toggle de un filtro multi-selección con semántica null="todos". Al primer
  // toque se materializa el set completo y se quita el tocado.
  const toggleMulti = (
    cur: Set<string> | null,
    setFn: (v: Set<string> | null) => void,
    allKeys: string[],
    key: string,
  ) => {
    const base = cur == null ? new Set(allKeys) : new Set(cur);
    if (base.has(key)) base.delete(key); else base.add(key);
    // Si quedaron todas seleccionadas, volver a null ("todos") para limpieza.
    setFn(base.size === allKeys.length ? null : base);
  };

  // v35 — Re-sincronizar settings del proyecto (incluida la ortofoto) bajo demanda.
  const handleResyncOrtho = async () => {
    setResyncing(true);
    try {
      const d = await diagnoseOrtho(projectId);
      const line = (ok: boolean) => ok ? t('projectMap.diag.yes') : t('projectMap.diag.no');
      Alert.alert(
        t('projectMap.diag.title'),
        t('projectMap.diag.remoteHeader') + `\n` +
        t('projectMap.diag.remoteKey', { v: line(d.remoteKey) }) + `\n` +
        t('projectMap.diag.remoteBounds', { v: line(d.remoteBounds) }) + `\n\n` +
        t('projectMap.diag.localHeader') + `\n` +
        t('projectMap.diag.localExists', { v: line(d.localExists) }) + `\n` +
        t('projectMap.diag.localKey', { v: line(d.localKey) }) + `\n\n` +
        t('projectMap.diag.v36', { v: line(d.v36) }) +
        (d.err ? `\n` + t('projectMap.diag.err', { error: d.err }) : '') +
        (!d.remoteKey && !d.v36 ? '\n\n' + t('projectMap.diag.fixV36')
          : !d.remoteKey ? '\n\n' + t('projectMap.diag.fixWebSave')
          : !d.localKey ? '\n\n' + t('projectMap.diag.fixLocalSave')
          : '\n\n' + t('projectMap.diag.ok')),
      );
    } catch (e) {
      Alert.alert(t('projectMap.diag.failTitle'), t('projectMap.diag.failMessage', { error: e instanceof Error ? e.message : String(e) }));
    }
    setResyncing(false);
  };

  // v35 — Centrar el mapa en mi ubicación (botón propio, abajo).
  const handleLocate = async () => {
    setLocating(true);
    try {
      const perm = await Location.getForegroundPermissionsAsync();
      let granted = perm.status === 'granted';
      if (!granted && (perm.status === 'undetermined' || perm.canAskAgain)) {
        const r = await Location.requestForegroundPermissionsAsync();
        granted = r.status === 'granted';
      }
      if (!granted) { Alert.alert(t('projectMap.locate.permTitle'), t('projectMap.locate.permMessage')); return; }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      mapRef.current?.animateToRegion({
        latitude: pos.coords.latitude, longitude: pos.coords.longitude,
        latitudeDelta: 0.004, longitudeDelta: 0.004,
      }, 600);
    } catch {
      Alert.alert(t('projectMap.locate.errTitle'), t('projectMap.locate.errMessage'));
    } finally { setLocating(false); }
  };

  const handlePinPress = (p: Protocol) => {
    const status = (p as any).status;
    const target = (status === 'APPROVED' || status === 'SUBMITTED') ? 'ProtocolAudit' : 'ProtocolFill';
    navigation.navigate(target as any, { protocolId: p.id });
  };

  const handleSectorPress = async (s: ProjectSector) => {
    const assigned = protocols.filter(p => (p as any).sectorId === s.id);
    const byStatus = assigned.reduce((acc: Record<string, number>, p: any) => {
      acc[p.status] = (acc[p.status] ?? 0) + 1; return acc;
    }, {});
    const summary = Object.entries(byStatus).map(([k, v]) => t('projectMap.sector.summaryItem', { count: v, label: STATUS_LABELS[k]?.label ?? k })).join(' · ') || t('projectMap.sector.noTests');

    // v27 — Stats de trazabilidad operacional (si el flag está ON)
    let traceabilityLine = '';
    try {
      const sessions = await workSessionsCollection
        .query(Q.where('sector_id', s.id), Q.where('status', 'CLOSED')).fetch();
      if (sessions.length > 0) {
        const equipSet = new Set(sessions.map((x: any) => x.equipmentId));
        let totalMs = 0;
        for (const ws of sessions) {
          const ints = await workSessionIntervalsCollection.query(Q.where('session_id', ws.id)).fetch();
          totalMs += effectiveDurationMs(ints as any);
        }
        const hours = Math.round(totalMs / 3600000 * 10) / 10;
        const equip = t(equipSet.size === 1 ? 'projectMap.sector.equipOne' : 'projectMap.sector.equipMany', { count: equipSet.size });
        const sessionsStr = t(sessions.length === 1 ? 'projectMap.sector.sessionOne' : 'projectMap.sector.sessionMany', { count: sessions.length });
        traceabilityLine = t('projectMap.sector.traceability', { hours, equip, sessions: sessionsStr });
      }
    } catch { /* módulo no activo o sin datos */ }

    Alert.alert(s.name, t('projectMap.sector.alertMessage', { count: assigned.length, summary, traceability: traceabilityLine }));
  };

  if (loading) {
    return (
      <View style={styles.loadingWrap}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  const hasContent = protocolsWithCoords.length > 0 || polygonsWithGeom.length > 0 || orthoTiles.length > 0;

  return (
    <View style={styles.container}>
      <AppHeader
        title={t('projectMap.header.title')}
        subtitle={projectName}
        onBack={() => navigation.goBack()}
        rightContent={
          <TouchableOpacity onPress={() => jumpToStep('map_filters')} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="help-circle-outline" size={22} color={Colors.white} />
          </TouchableOpacity>
        }
      />

      {/* Filtros en 2 filas (flexWrap). Fila 1: Fecha · Estado · Tipo (siempre).
          Fila 2: Capa · Sector (si hay) · Etiquetas. Filtros dinámicos: Sector
          solo si el proyecto trabaja con sectores. */}
      <View ref={mapFiltersRef} style={styles.filterBar}>
        <View style={styles.filterWrap}>
          <FilterBtn label={t('projectMap.filter.date')} icon="calendar-outline" active={openPanel === 'fecha'} dot={!!dateFrom || !!dateTo} onPress={() => setOpenPanel(p => p === 'fecha' ? null : 'fecha')} />
          <FilterBtn label={t('projectMap.filter.status')} icon="ellipse-outline" active={openPanel === 'estado'} dot={statusFilter.size !== ALL_STATUSES.length} onPress={() => setOpenPanel(p => p === 'estado' ? null : 'estado')} />
          <FilterBtn label={t('projectMap.filter.type')} icon="flask-outline" active={openPanel === 'tipo'} dot={typeFilter != null} onPress={() => setOpenPanel(p => p === 'tipo' ? null : 'tipo')} />
          <View ref={mapLayerToggleRef}>
            <FilterBtn label={t('projectMap.filter.layer')} icon="layers-outline" active={openPanel === 'capa'} onPress={() => setOpenPanel(p => p === 'capa' ? null : 'capa')} />
          </View>
          {sectors.length > 0 && (
            <FilterBtn label={t('projectMap.filter.sector')} icon="shapes-outline" active={openPanel === 'sector'} dot={sectorFilter != null} onPress={() => setOpenPanel(p => p === 'sector' ? null : 'sector')} />
          )}
          {/* Toggle de etiquetas: ON = todas visibles (búsqueda rápida); OFF = solo al tocar el pin. */}
          <TouchableOpacity
            onPress={() => setShowLabels(v => !v)}
            style={[styles.fbtn, showLabels && styles.fbtnActive]}
          >
            <Ionicons name={showLabels ? 'pricetags' : 'pricetags-outline'} size={13} color={showLabels ? Colors.white : Colors.textSecondary} />
            <Text style={[styles.fbtnText, showLabels && { color: Colors.white }]}>{showLabels ? t('projectMap.filter.hideLabels') : t('projectMap.filter.showLabels')}</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* v35 — Estado de ortofoto (diagnóstico visible + toca para sincronizar). */}
      <TouchableOpacity style={styles.orthoStatusBar} onPress={handleResyncOrtho} disabled={resyncing} activeOpacity={0.6}>
        {resyncing
          ? <ActivityIndicator size="small" color={Colors.primary} />
          : <Ionicons
              name={orthoStatus === 'ready' ? 'image' : orthoStatus === 'error' ? 'alert-circle' : orthoStatus === 'loading' ? 'cloud-download-outline' : 'sync-outline'}
              size={13}
              color={orthoStatus === 'ready' ? Colors.success : orthoStatus === 'error' ? Colors.danger : Colors.textSecondary}
            />}
        <Text style={styles.orthoStatusText}>
          {resyncing ? t('projectMap.ortho.syncing')
            : orthoStatus === 'loading' ? (orthoTiles.length > 1 ? t('projectMap.ortho.downloadingTiles', { count: orthoTiles.length }) : t('projectMap.ortho.downloadingImage'))
            : orthoStatus === 'ready' ? (showOrthoImg ? (orthoTiles.length > 1 ? t('projectMap.ortho.readyVisibleTiles', { count: orthoTiles.length }) : t('projectMap.ortho.readyVisible')) : t('projectMap.ortho.readyHidden'))
            : orthoStatus === 'error' ? t('projectMap.ortho.error')
            : orthoKeyOnly ? t('projectMap.ortho.noBounds')
            : t('projectMap.ortho.none')}
        </Text>
      </TouchableOpacity>

      <View ref={mapViewRef} style={{ flex: 1 }}>
        <MapView
          ref={mapRef}
          provider={PROVIDER_GOOGLE}
          style={StyleSheet.absoluteFillObject}
          initialRegion={initialRegion}
          mapType={mapType}
          showsUserLocation
          showsMyLocationButton={false}
          onPress={() => setOpenPanel(null)}
        >
          {showOrthophoto && mapTileUrl && (
            <UrlTile urlTemplate={mapTileUrl} maximumZ={20} zIndex={-1} />
          )}

          {/* v34 — Ortofoto liviana como capa base, DEBAJO de sectores y marcadores. */}
          {showOrthoImg && orthoLayers.map((o, i) => (
            <Overlay
              key={i}
              bounds={o.bounds}
              image={{ uri: o.uri }}
              opacity={0.9}
            />
          ))}

          {polygonsWithGeom.map(s => {
            const pts = (s.points || []).map(p => ({ latitude: p.lat, longitude: p.lng }));
            const color = s.displayColor || Colors.primary;
            return (
              <Polygon
                key={s.id}
                coordinates={pts}
                strokeColor={color}
                fillColor={color + '33'}
                strokeWidth={2}
                tappable
                onPress={() => handleSectorPress(s)}
              />
            );
          })}

          {protocolsWithCoords.map(p => {
            const lat = (p as any).latitude, lng = (p as any).longitude;
            const status = (p as any).status;
            const sectorId = (p as any).sectorId;
            const sector = sectorId ? sectorById.get(sectorId) : null;
            // v34 — Marcadores coloreados por ESTADO (paleta propia), NO por el
            // color del sector: antes el pin tomaba el displayColor del sector y
            // se confundía con el polígono. El sector se indica en el callout.
            const color = STATUS_LABELS[status]?.color || Colors.primary;
            const code = (p as any).protocolNumber || (p as any).locationReference || t('projectMap.pin.protocol');
            return (
              <Marker
                key={p.id}
                coordinate={{ latitude: lat, longitude: lng }}
                // Callout (al tocar): código + detalle. La etiqueta persistente
                // muestra SOLO el código (toggle "Mostrar etiquetas").
                title={code}
                description={`${STATUS_LABELS[status]?.label ?? status}${sector ? ' · ' + sector.name : ''}${
                  (p as any).coordPrecisionM != null ? ` · ±${Number((p as any).coordPrecisionM).toFixed(1)}m`
                  : (p as any).coordAccuracyM != null ? ` · ±${Number((p as any).coordAccuracyM).toFixed(0)}m` : ''}`}
                onCalloutPress={() => handlePinPress(p)}
                anchor={{ x: 0.5, y: showLabels ? 1 : 0.5 }}
                tracksViewChanges={false}
              >
                <View style={styles.pinWrap}>
                  {showLabels && (
                    <View style={styles.pinLabel}>
                      <Text style={styles.pinLabelText} numberOfLines={1}>{code}</Text>
                    </View>
                  )}
                  <View style={styles.pinOuter}>
                    <View style={[styles.pinDot, { backgroundColor: color }]} />
                  </View>
                </View>
              </Marker>
            );
          })}
        </MapView>

        {!hasContent && (
          <View style={styles.emptyOverlay}>
            <View style={styles.emptyCard}>
              <Ionicons name="map-outline" size={40} color={Colors.textMuted} />
              <Text style={styles.emptyTitle}>{t('projectMap.empty.title')}</Text>
              <Text style={styles.emptyText}>{t('projectMap.empty.text')}</Text>
            </View>
          </View>
        )}

        {/* v35 — Panel desplegable de capa/filtros (sobre el mapa). */}
        {openPanel && (
          <View style={styles.panel}>
            <ScrollView style={{ maxHeight: 300 }} keyboardShouldPersistTaps="handled">
              {openPanel === 'capa' && (
                <>
                  <Text style={styles.panelTitle}>{t('projectMap.panel.baseMap')}</Text>
                  {([['standard', t('projectMap.panel.baseStandard')], ['satellite', t('projectMap.panel.baseSatellite')], ['hybrid', t('projectMap.panel.baseHybrid')], ['terrain', t('projectMap.panel.baseTerrain')]] as [MapType, string][]).map(([k, l]) => (
                    <RadioRow key={k} label={l} on={mapType === k} onPress={() => setMapType(k)} />
                  ))}
                  {(mapTileUrl || orthoTiles.length > 0) && <View style={styles.legendDivider} />}
                  {mapTileUrl && <CheckRow label={t('projectMap.panel.orthoXyz')} on={showOrthophoto} onPress={() => setShowOrthophoto(v => !v)} />}
                  {orthoTiles.length > 0 && <CheckRow label={t('projectMap.panel.orthoImage')} on={showOrthoImg} onPress={() => setShowOrthoImg(v => !v)} />}
                </>
              )}
              {openPanel === 'estado' && (
                <>
                  <Text style={styles.panelTitle}>{t('projectMap.panel.statusTitle')}</Text>
                  {ALL_STATUSES.map(s => (
                    <CheckRow key={s} color={STATUS_LABELS[s].color} label={STATUS_LABELS[s].label} on={statusFilter.has(s)} onPress={() => toggleStatus(s)} />
                  ))}
                </>
              )}
              {openPanel === 'sector' && (
                <>
                  <Text style={styles.panelTitle}>{t('projectMap.panel.sectorTitle')}</Text>
                  {sectorOptions.map(o => (
                    <CheckRow key={o.key} label={o.label} on={inSet(sectorFilter, o.key)}
                      onPress={() => toggleMulti(sectorFilter, setSectorFilter, sectorOptions.map(x => x.key), o.key)} />
                  ))}
                </>
              )}
              {openPanel === 'tipo' && (
                <>
                  <Text style={styles.panelTitle}>{t('projectMap.panel.typeTitle')}</Text>
                  {typeOptions.length === 0 ? <Text style={styles.panelEmpty}>{t('projectMap.panel.noTypesYet')}</Text> : typeOptions.map(o => (
                    <CheckRow key={o.key} label={o.label} on={inSet(typeFilter, o.key)}
                      onPress={() => toggleMulti(typeFilter, setTypeFilter, typeOptions.map(x => x.key), o.key)} />
                  ))}
                </>
              )}
              {openPanel === 'fecha' && (() => {
                // Solo fechas reales (excluye "Sin fecha") para el rango Desde/Hasta.
                const dates = dateOptions.filter(o => o.key !== NONE).map(o => o.key);
                if (dates.length === 0) return <Text style={styles.panelEmpty}>{t('projectMap.panel.noDatesYet')}</Text>;
                return (
                  <>
                    <View style={styles.dateRangeHeader}>
                      <Text style={styles.panelTitle}>{t('projectMap.panel.dateRange')}</Text>
                      {(dateFrom || dateTo) && (
                        <TouchableOpacity onPress={() => { setDateFrom(''); setDateTo(''); }}>
                          <Text style={styles.dateClear}>{t('projectMap.panel.clear')}</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                    <Text style={styles.dateSubLabel}>{dateFrom ? t('projectMap.panel.dateFromValue', { date: dateFrom }) : t('projectMap.panel.dateFrom')}</Text>
                    <RadioRow label={t('projectMap.panel.anyDate')} on={!dateFrom} onPress={() => setDateFrom('')} />
                    {dates.map(d => (
                      <RadioRow key={`f-${d}`} label={d} on={dateFrom === d} onPress={() => setDateFrom(d)} />
                    ))}
                    <View style={styles.legendDivider} />
                    <Text style={styles.dateSubLabel}>{dateTo ? t('projectMap.panel.dateToValue', { date: dateTo }) : t('projectMap.panel.dateTo')}</Text>
                    <RadioRow label={t('projectMap.panel.anyDate')} on={!dateTo} onPress={() => setDateTo('')} />
                    {dates.map(d => (
                      <RadioRow key={`t-${d}`} label={d} on={dateTo === d} onPress={() => setDateTo(d)} />
                    ))}
                  </>
                );
              })()}
            </ScrollView>
          </View>
        )}

        {/* v35 — Centrar en mi ubicación (abajo a la derecha). */}
        <TouchableOpacity
          style={[styles.locateBtn, { bottom: Math.max(18, insets.bottom + 10) }]}
          onPress={handleLocate}
          disabled={locating}
        >
          {locating ? <ActivityIndicator size="small" color={Colors.primary} /> : <Ionicons name="locate" size={22} color={Colors.primary} />}
        </TouchableOpacity>

        {/* v34 — Leyenda profesional: paleta de ESTADOS (marcadores) + paleta de
            SECTORES (polígonos), claramente separadas. */}
        <TouchableOpacity
          style={[styles.legendBtn, { bottom: Math.max(18, insets.bottom + 10) }]}
          onPress={() => setShowLegend(v => !v)}
        >
          <Ionicons name={showLegend ? 'close' : 'list'} size={16} color={Colors.white} />
          <Text style={styles.layerToggleText}>{showLegend ? t('projectMap.legend.close') : t('projectMap.legend.open')}</Text>
        </TouchableOpacity>

        {showLegend && (
          <View style={[styles.legendCard, { bottom: Math.max(18, insets.bottom + 10) + 46 }]}>
            <Text style={styles.legendTitle}>{t('projectMap.legend.statusTitle')}</Text>
            {ALL_STATUSES.map(s => (
              <View key={s} style={styles.legendRow}>
                <View style={[styles.legendDot, { backgroundColor: STATUS_LABELS[s].color }]} />
                <Text style={styles.legendLabel}>{STATUS_LABELS[s].label}</Text>
              </View>
            ))}
            {polygonsWithGeom.length > 0 && (
              <>
                <View style={styles.legendDivider} />
                <Text style={styles.legendTitle}>{t('projectMap.legend.sectorsTitle')}</Text>
                <View style={{ maxHeight: 160 }}>
                  <ScrollView showsVerticalScrollIndicator>
                    {polygonsWithGeom.map(s => (
                      <View key={s.id} style={styles.legendRow}>
                        <View style={[styles.legendSwatch, { backgroundColor: (s.displayColor || Colors.primary) + '55', borderColor: s.displayColor || Colors.primary }]} />
                        <Text style={styles.legendLabel} numberOfLines={1}>{s.name}</Text>
                      </View>
                    ))}
                  </ScrollView>
                </View>
              </>
            )}
          </View>
        )}

      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.surface },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  filterBar: { paddingVertical: 8, paddingHorizontal: 8, backgroundColor: Colors.white, borderBottomWidth: 1, borderBottomColor: Colors.border, zIndex: 5 },
  filterWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
  dateRangeHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  dateClear: { fontSize: 11, fontWeight: '800', color: Colors.primary },
  dateSubLabel: { fontSize: 11, fontWeight: '800', color: Colors.textPrimary, marginTop: 6, marginBottom: 2 },
  layerToggleText: { color: Colors.white, fontSize: 12, fontWeight: '700' },
  orthoStatusBar: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 5, backgroundColor: '#f1f4f8', borderBottomWidth: 1, borderBottomColor: Colors.border },
  orthoStatusText: { fontSize: 11, fontWeight: '600', color: Colors.textSecondary },
  // Botones de filtro/capa (dropdowns)
  fbtn: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 11, paddingVertical: 7, borderRadius: 16, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.white },
  fbtnActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  fbtnText: { fontSize: 12, fontWeight: '700', color: Colors.textSecondary },
  fbtnDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#f59e0b' },
  // Panel desplegable
  panel: { position: 'absolute', top: 8, left: 8, right: 8, backgroundColor: Colors.white, borderRadius: Radius.md, padding: 10, borderWidth: 1, borderColor: Colors.border, zIndex: 40, elevation: 12, shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 10, shadowOffset: { width: 0, height: 4 } },
  panelTitle: { fontSize: 10, fontWeight: '800', color: Colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 },
  panelEmpty: { fontSize: 12, color: Colors.textMuted, fontStyle: 'italic', padding: 8 },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: 9, paddingVertical: 8, paddingHorizontal: 2 },
  checkSwatch: { width: 12, height: 12, borderRadius: 6 },
  checkLabel: { flex: 1, fontSize: 13, color: Colors.textPrimary },
  // Botón centrar en mí (abajo)
  locateBtn: { position: 'absolute', right: 14, width: 46, height: 46, borderRadius: 23, backgroundColor: Colors.white, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Colors.border, elevation: 5, shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 5, shadowOffset: { width: 0, height: 2 } },
  // Marcador de ensayo: punto circular con color de ESTADO (paleta propia).
  pinWrap: { alignItems: 'center', justifyContent: 'flex-end' },
  pinLabel: { backgroundColor: 'rgba(255,255,255,0.95)', borderRadius: 5, paddingHorizontal: 5, paddingVertical: 1.5, borderWidth: 1, borderColor: Colors.border, marginBottom: 1, maxWidth: 140, elevation: 2, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 2, shadowOffset: { width: 0, height: 1 } },
  pinLabelText: { fontSize: 10, fontWeight: '800', color: Colors.textPrimary },
  pinOuter: { alignItems: 'center', justifyContent: 'center', width: 22, height: 22 },
  pinDot: { width: 16, height: 16, borderRadius: 8, borderWidth: 2.5, borderColor: '#fff', elevation: 3, shadowColor: '#000', shadowOpacity: 0.35, shadowRadius: 2, shadowOffset: { width: 0, height: 1 } },
  // Leyenda
  legendBtn: { position: 'absolute', left: 14, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#1a4f7a', paddingVertical: 8, paddingHorizontal: 12, borderRadius: Radius.md, elevation: 4, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 4, shadowOffset: { width: 0, height: 2 } },
  legendCard: { position: 'absolute', left: 14, backgroundColor: Colors.white, borderRadius: Radius.md, padding: 12, width: 210, borderWidth: 1, borderColor: Colors.border, elevation: 6, shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 8, shadowOffset: { width: 0, height: 3 } },
  legendTitle: { fontSize: 10, fontWeight: '800', color: Colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 3 },
  legendDot: { width: 13, height: 13, borderRadius: 7, borderWidth: 2, borderColor: '#fff', elevation: 1 },
  legendSwatch: { width: 14, height: 12, borderRadius: 3, borderWidth: 1.5 },
  legendLabel: { flex: 1, fontSize: 12, color: Colors.textPrimary },
  legendDivider: { height: 1, backgroundColor: Colors.border, marginVertical: 8 },
  emptyOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: 'rgba(255,255,255,0.85)' },
  emptyCard: { backgroundColor: Colors.white, padding: 20, borderRadius: Radius.lg, alignItems: 'center', gap: 8, borderWidth: 1, borderColor: Colors.border, maxWidth: 360 },
  emptyTitle: { fontSize: 14, fontWeight: '800', color: Colors.textPrimary },
  emptyText: { fontSize: 12, color: Colors.textSecondary, textAlign: 'center', lineHeight: 17 },
});
