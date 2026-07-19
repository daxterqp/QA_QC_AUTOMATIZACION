'use client';

/**
 * GLMap — Motor de mapa PROFESIONAL del dashboard (v94): MapLibre GL +
 * basemap oscuro CARTO (look GeOD-Lima), animaciones fluidas (flyTo
 * cinematográfico, burbujas con pulso), modo 3D (pitch + terreno AWS +
 * extrusión de sectores) y modo Cine (órbita lenta para presentaciones).
 *
 * MISMA API de datos que components/sectors/SectorMap (Leaflet) para swap 1:1
 * desde OperationalMap/PortfolioDashboard. SectoresTab sigue usando Leaflet.
 *
 * ⚠ Convención de coordenadas: nuestros datos son [lat,lng] (Leaflet);
 * MapLibre usa [lng,lat]. TODA conversión pasa por toLngLat / toGlBounds —
 * no convertir en ningún otro lugar.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Map, {
  Source, Layer, Marker, Popup, NavigationControl,
  type MapRef, type MapLayerMouseEvent,
} from 'react-map-gl/maplibre';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useI18n } from '@lib/i18n';
import { DASH_COLORS, PROGRESS_BUCKET_COLORS } from '@lib/dashboardUtils';
import { normalizeBounds, type LeafletBounds } from '@lib/orthophoto';
// Type-only (se borra al compilar): no arrastra Leaflet a este bundle.
import type { MapSector, MapOrthophoto, MapMarker, MapBubble } from '@components/sectors/SectorMap';
import { BASEMAPS, TERRAIN_SOURCE, type BasemapId } from './basemaps';

const finiteCoord = (lat: number, lng: number) =>
  Number.isFinite(lat) && Number.isFinite(lng) && !(lat === 0 && lng === 0);

/** [lat,lng] (nuestros datos) → [lng,lat] (MapLibre). ÚNICO punto de conversión. */
const toLngLat = (lat: number, lng: number): [number, number] => [lng, lat];
/** LeafletBounds [[s,w],[n,e]] → LngLatBounds [[w,s],[e,n]]. */
const toGlBounds = (b: LeafletBounds): [[number, number], [number, number]] =>
  [[b[0][1], b[0][0]], [b[1][1], b[1][0]]];

export default function GLMap({
  sectors,
  orthophotos,
  height = 380,
  markers,
  bubbles,
  onMarkerNavigate,
  onBubbleClick,
  focusBounds,
  onFocusEnd,
}: {
  sectors: MapSector[];
  orthophotos?: MapOrthophoto[] | null;
  height?: number | string;
  markers?: MapMarker[];
  bubbles?: MapBubble[];
  onMarkerNavigate?: (href: string) => void;
  onBubbleClick?: (projectId: string) => void;
  focusBounds?: LeafletBounds | null;
  /** Dispara al terminar el flyTo del drill-down (moveend). */
  onFocusEnd?: () => void;
}) {
  const { t } = useI18n();
  const mapRef = useRef<MapRef>(null);
  const [loaded, setLoaded] = useState(false);
  const [basemap, setBasemap] = useState<BasemapId>('dark');
  const [is3d, setIs3d] = useState(false);
  const [cine, setCine] = useState(false);
  const [selected, setSelected] = useState<MapMarker | null>(null);
  const [bubbleTip, setBubbleTip] = useState<MapBubble | null>(null);
  const [sectorTip, setSectorTip] = useState<{ lng: number; lat: number; name: string } | null>(null);
  const [hoverPin, setHoverPin] = useState(false);

  // ── Guard WebGL (Electron/GPU vieja) ────────────────────────────────────────
  const webglOk = useMemo(() => {
    try {
      const c = document.createElement('canvas');
      return !!(c.getContext('webgl2') || c.getContext('webgl'));
    } catch { return false; }
  }, []);

  // ── Saneo de datos (mismas reglas que SectorMap Leaflet) ────────────────────
  const finitePair = (p: unknown) => Array.isArray(p) && p.length === 2 && Number.isFinite(p[0]) && Number.isFinite(p[1]);
  const orthos = useMemo(() => (orthophotos ?? [])
    .map(o => {
      const b = normalizeBounds(o.bounds);
      if (!b) return null;
      const r = o.rotation;
      const rotOk = !!r && Number.isFinite(r.bearing)
        && finitePair(r.corners?.tl) && finitePair(r.corners?.tr)
        && finitePair(r.corners?.br) && finitePair(r.corners?.bl);
      return { ...o, bounds: b, rotation: rotOk ? r : undefined };
    })
    .filter(Boolean) as (MapOrthophoto & { bounds: LeafletBounds })[]
  // eslint-disable-next-line react-hooks/exhaustive-deps
  , [orthophotos]);

  const geomSectors = useMemo(
    () => sectors.filter(s => s.points && s.points.length >= 3),
    [sectors],
  );
  const validMarkers = useMemo(
    () => (markers ?? []).filter(m => finiteCoord(m.lat, m.lng)),
    [markers],
  );
  const validBubbles = useMemo(
    () => (bubbles ?? []).filter(b => finiteCoord(b.lat, b.lng)),
    [bubbles],
  );

  // ── GeoJSON de capas ────────────────────────────────────────────────────────
  const sectorsGeojson = useMemo(() => ({
    type: 'FeatureCollection' as const,
    features: geomSectors.map(s => {
      const ring = s.points.map(p => toLngLat(p.lat, p.lng));
      ring.push(ring[0]); // anillo cerrado (GeoJSON)
      return {
        type: 'Feature' as const,
        properties: { color: s.color, name: s.name },
        geometry: { type: 'Polygon' as const, coordinates: [ring] },
      };
    }),
  }), [geomSectors]);

  const markersGeojson = useMemo(() => ({
    type: 'FeatureCollection' as const,
    features: validMarkers.map(m => ({
      type: 'Feature' as const,
      properties: { ...m },
      geometry: { type: 'Point' as const, coordinates: toLngLat(m.lat, m.lng) },
    })),
  }), [validMarkers]);

  const markerById = useMemo(() => {
    const map: Record<string, MapMarker> = {};
    validMarkers.forEach(m => { map[m.id] = m; });
    return map;
  }, [validMarkers]);

  // ── Cámara: autoencuadre + drill-down ───────────────────────────────────────
  const contentBounds = useCallback((): LeafletBounds | null => {
    const lats: number[] = [];
    const lngs: number[] = [];
    for (const s of geomSectors) for (const p of s.points) { lats.push(p.lat); lngs.push(p.lng); }
    for (const o of orthos) { lats.push(o.bounds[0][0], o.bounds[1][0]); lngs.push(o.bounds[0][1], o.bounds[1][1]); }
    for (const m of validMarkers) { lats.push(m.lat); lngs.push(m.lng); }
    for (const b of validBubbles) { lats.push(b.lat); lngs.push(b.lng); }
    if (lats.length === 0) return null;
    return [
      [Math.min(...lats), Math.min(...lngs)],
      [Math.max(...lats), Math.max(...lngs)],
    ];
  }, [geomSectors, orthos, validMarkers, validBubbles]);

  const fitAll = useCallback(() => {
    const b = contentBounds();
    if (!b) return;
    mapRef.current?.fitBounds(toGlBounds(b), { padding: 40, maxZoom: 18, duration: 1000 });
  }, [contentBounds]);

  // Re-encuadrar solo cuando cambia la PRESENCIA de pines/burbujas o los
  // sectores/ortos (misma regla que Leaflet: los filtros no marean la cámara).
  const hasMarkers = validMarkers.length > 0;
  const hasBubbles = validBubbles.length > 0;
  useEffect(() => {
    if (!loaded || focusBounds) return;
    fitAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, geomSectors, orthos, hasMarkers, hasBubbles]);

  // Drill-down cinematográfico: zoom + pitch hacia la obra elegida.
  useEffect(() => {
    const map = mapRef.current?.getMap();
    if (!map || !focusBounds) return;
    const cam = map.cameraForBounds(toGlBounds(focusBounds), { padding: 60, maxZoom: 17 });
    if (!cam) { onFocusEnd?.(); return; }
    map.flyTo({ ...cam, pitch: 45, bearing: -12, duration: 1400, curve: 1.42, essential: true });
    const done = () => onFocusEnd?.();
    map.once('moveend', done);
    return () => { map.off('moveend', done); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusBounds]);

  // ── Modo 3D ─────────────────────────────────────────────────────────────────
  const toggle3d = () => {
    const map = mapRef.current?.getMap();
    setIs3d(prev => {
      const next = !prev;
      map?.easeTo(next
        ? { pitch: 55, bearing: -15, duration: 800 }
        : { pitch: 0, bearing: 0, duration: 800 });
      return next;
    });
  };

  // ── Modo Cine (órbita lenta; se detiene con cualquier interacción) ──────────
  const rafRef = useRef<number | null>(null);
  const stopCine = useCallback(() => {
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    setCine(false);
  }, []);
  const startCine = () => {
    const map = mapRef.current?.getMap();
    if (!map) return;
    setCine(true);
    if (map.getPitch() < 20) map.easeTo({ pitch: 50, duration: 800 });
    const spin = () => {
      map.rotateTo(map.getBearing() + 0.35, { duration: 0 });
      rafRef.current = requestAnimationFrame(spin);
    };
    rafRef.current = requestAnimationFrame(spin);
    map.once('mousedown', stopCine);
    map.once('touchstart', stopCine);
    map.once('wheel', stopCine);
  };
  useEffect(() => () => { if (rafRef.current != null) cancelAnimationFrame(rafRef.current); }, []);

  // ── Interacción con capas ───────────────────────────────────────────────────
  const handleClick = (e: MapLayerMouseEvent) => {
    const f = e.features?.[0];
    if (f?.layer.id === 'tests-circles') {
      const m = markerById[String(f.properties?.id)];
      if (m) { setSelected(m); return; }
    }
    setSelected(null);
  };
  const handleMove = (e: MapLayerMouseEvent) => {
    const f = e.features?.[0];
    if (f?.layer.id === 'tests-circles') { setHoverPin(true); setSectorTip(null); return; }
    setHoverPin(false);
    if (f?.layer.id === 'sectors-fill' && f.properties?.name) {
      setSectorTip({ lng: e.lngLat.lng, lat: e.lngLat.lat, name: String(f.properties.name) });
    } else {
      setSectorTip(null);
    }
  };

  const statusLegend = [
    { color: DASH_COLORS.success, label: t('webDash.approved') },
    { color: DASH_COLORS.danger, label: t('webDash.rejected') },
    { color: DASH_COLORS.warning, label: t('webDash.statusSubmittedShort') },
    { color: DASH_COLORS.draft, label: t('webDash.statusDraftShort') },
  ];
  const bucketLegend = [
    { color: PROGRESS_BUCKET_COLORS.good, label: t('webDash.bucketGood') },
    { color: PROGRESS_BUCKET_COLORS.mid, label: t('webDash.bucketMid') },
    { color: PROGRESS_BUCKET_COLORS.low, label: t('webDash.bucketLow') },
    { color: PROGRESS_BUCKET_COLORS.none, label: t('webDash.bucketNone') },
  ];

  if (!webglOk) {
    return (
      <div style={{ height, width: '100%' }}
        className="flex items-center justify-center bg-surface rounded-xl text-xs text-gray-500 text-center p-6">
        {t('webDash.mapWebglMissing')}
      </div>
    );
  }

  // Solo capas EXISTENTES: pasar ids de capas ausentes hace que MapLibre
  // loguee errores en cada mousemove.
  const interactiveIds = [
    ...(validMarkers.length > 0 ? ['tests-circles'] : []),
    ...(geomSectors.length > 0 ? ['sectors-fill'] : []),
  ];

  const pillCls = (active: boolean) =>
    `px-2.5 py-1 rounded-full text-[11px] font-bold shadow transition-colors ${
      active ? 'bg-primary text-white' : 'bg-white/90 text-navy hover:bg-white'
    }`;

  return (
    <div style={{ position: 'relative', height, width: '100%' }}>
      <Map
        ref={mapRef}
        reuseMaps
        mapStyle={BASEMAPS[basemap] as never}
        initialViewState={{ longitude: -77.0428, latitude: -12.0464, zoom: 5 }}
        style={{ width: '100%', height: '100%' }}
        interactiveLayerIds={interactiveIds}
        cursor={hoverPin ? 'pointer' : 'grab'}
        terrain={is3d ? { source: 'terrain-dem', exaggeration: 1.3 } : null!}
        onLoad={() => { setLoaded(true); fitAll(); }}
        onClick={handleClick}
        onMouseMove={handleMove}
        onMouseOut={() => { setHoverPin(false); setSectorTip(null); }}
      >
        <NavigationControl position="top-right" visualizePitch />

        {/* DEM siempre montado (no descarga tiles hasta activar terrain). */}
        <Source id="terrain-dem" {...TERRAIN_SOURCE} />

        {/* Capas custom — key con el basemap: al cambiar de estilo se remontan
            en orden determinista (ortos debajo de polígonos debajo de pines). */}
        {orthos.map((o, i) => {
          const [[s, w], [n, e]] = o.bounds;
          const coords = o.rotation
            ? ([
                toLngLat(o.rotation.corners.tl[0], o.rotation.corners.tl[1]),
                toLngLat(o.rotation.corners.tr[0], o.rotation.corners.tr[1]),
                toLngLat(o.rotation.corners.br[0], o.rotation.corners.br[1]),
                toLngLat(o.rotation.corners.bl[0], o.rotation.corners.bl[1]),
              ] as [[number, number], [number, number], [number, number], [number, number]])
            : ([[w, n], [e, n], [e, s], [w, s]] as [[number, number], [number, number], [number, number], [number, number]]);
          return (
            <Source key={`${basemap}-ortho-${i}`} id={`ortho-${i}`} type="image" url={o.url} coordinates={coords}>
              <Layer id={`ortho-${i}-l`} type="raster"
                paint={{ 'raster-opacity': o.opacity ?? 0.9, 'raster-fade-duration': 300 }} />
            </Source>
          );
        })}

        {geomSectors.length > 0 && (
          <Source key={`${basemap}-sectors`} id="sectors" type="geojson" data={sectorsGeojson}>
            <Layer id="sectors-fill" type="fill"
              layout={{ visibility: is3d ? 'none' : 'visible' }}
              paint={{ 'fill-color': ['get', 'color'], 'fill-opacity': 0.22 }} />
            <Layer id="sectors-extrusion" type="fill-extrusion"
              layout={{ visibility: is3d ? 'visible' : 'none' }}
              paint={{
                'fill-extrusion-color': ['get', 'color'],
                'fill-extrusion-height': 20,
                'fill-extrusion-base': 0,
                'fill-extrusion-opacity': 0.45,
              }} />
            <Layer id="sectors-line" type="line"
              paint={{ 'line-color': ['get', 'color'], 'line-width': 2 }} />
          </Source>
        )}

        {validMarkers.length > 0 && (
          <Source key={`${basemap}-tests`} id="tests" type="geojson" data={markersGeojson}>
            <Layer id="tests-circles" type="circle"
              paint={{
                'circle-radius': 6,
                'circle-color': ['get', 'color'],
                'circle-stroke-color': '#ffffff',
                'circle-stroke-width': 1.5,
                'circle-opacity': 0.9,
              }} />
          </Source>
        )}

        {/* Burbujas de obra (HTML Markers con halo pulsante) */}
        {validBubbles.map(b => {
          const color = PROGRESS_BUCKET_COLORS[b.bucket];
          return (
            <Marker key={b.id} longitude={b.lng} latitude={b.lat} anchor="center">
              <div
                style={{ position: 'relative', width: 46, height: 46, cursor: 'pointer' }}
                onClick={(e) => { e.stopPropagation(); onBubbleClick?.(b.id); }}
                onMouseEnter={() => setBubbleTip(b)}
                onMouseLeave={() => setBubbleTip(null)}
              >
                <div className="gl-bubble-pulse" style={{ color }} />
                <div style={{
                  position: 'absolute', inset: 0, borderRadius: '50%',
                  background: color, border: '3px solid #fff',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: '#fff', fontWeight: 800, fontSize: 12,
                  fontFamily: 'Inter, system-ui, sans-serif',
                }}>
                  {b.bucket === 'none' ? '—' : `${b.percent}%`}
                </div>
              </div>
            </Marker>
          );
        })}

        {/* Tooltip hover de burbuja */}
        {bubbleTip && (
          <Popup longitude={bubbleTip.lng} latitude={bubbleTip.lat} anchor="bottom"
            offset={30} closeButton={false} closeOnClick={false}>
            <div style={{ textAlign: 'center', fontFamily: 'Inter, system-ui, sans-serif' }}>
              <strong style={{ fontSize: 12, color: '#0e213d' }}>{bubbleTip.name}</strong>
              {bubbleTip.sub && <div style={{ fontSize: 11, color: '#64748b' }}>{bubbleTip.sub}</div>}
            </div>
          </Popup>
        )}

        {/* Tooltip hover de sector (sticky al cursor) */}
        {sectorTip && !selected && (
          <Popup longitude={sectorTip.lng} latitude={sectorTip.lat} anchor="bottom"
            offset={12} closeButton={false} closeOnClick={false}>
            <span style={{ fontSize: 11, fontWeight: 700, color: '#0e213d' }}>{sectorTip.name}</span>
          </Popup>
        )}

        {/* Popup de ensayo seleccionado */}
        {selected && (
          <Popup longitude={selected.lng} latitude={selected.lat} anchor="bottom"
            offset={10} onClose={() => setSelected(null)} closeOnClick={false}>
            <div style={{ minWidth: 150, fontFamily: 'Inter, system-ui, sans-serif' }}>
              <p style={{ margin: 0, fontWeight: 700, fontSize: 12, color: '#0e213d' }}>{selected.label}</p>
              {selected.sublabel && <p style={{ margin: '2px 0 0', fontSize: 11, color: '#64748b' }}>{selected.sublabel}</p>}
              {selected.statusLabel && (
                <span style={{
                  display: 'inline-block', marginTop: 5, padding: '2px 8px', borderRadius: 999,
                  background: selected.color, color: '#fff', fontSize: 10, fontWeight: 700,
                }}>{selected.statusLabel}</span>
              )}
              {selected.href && onMarkerNavigate && (
                <button
                  onClick={() => onMarkerNavigate(selected.href!)}
                  style={{
                    display: 'block', marginTop: 8, padding: '5px 10px', borderRadius: 8,
                    background: '#394e7d', color: '#fff', fontSize: 11, fontWeight: 700,
                    border: 'none', cursor: 'pointer', width: '100%',
                  }}
                >
                  {t('webDash.mapOpenTest')}
                </button>
              )}
            </div>
          </Popup>
        )}
      </Map>

      {/* ── Controles overlay: basemap + 3D + Cine ── */}
      <div className="absolute top-2.5 left-2.5 z-10 flex flex-wrap gap-1.5">
        <button onClick={() => setBasemap('dark')} className={pillCls(basemap === 'dark')}>{t('webDash.mapBaseDark')}</button>
        <button onClick={() => setBasemap('satellite')} className={pillCls(basemap === 'satellite')}>{t('webDash.mapBaseSat')}</button>
        <button onClick={() => setBasemap('light')} className={pillCls(basemap === 'light')}>{t('webDash.mapBaseLight')}</button>
        <button onClick={toggle3d} className={pillCls(is3d)}>{t('webDash.map3d')}</button>
        <button onClick={() => (cine ? stopCine() : startCine())} className={pillCls(cine)}>{t('webDash.mapCine')}</button>
      </div>

      {/* ── Leyendas flotantes (mismo diseño que el mapa Leaflet) ── */}
      {(geomSectors.length > 0 || validMarkers.length > 0 || validBubbles.length > 0) && (
        <div style={{
          position: 'absolute', bottom: 24, left: 10, zIndex: 10,
          background: 'rgba(255,255,255,0.95)', border: '1px solid #e2e8f0', borderRadius: 6,
          padding: '8px 10px', maxHeight: 200, overflowY: 'auto', boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
          maxWidth: 200,
        }}>
          {validMarkers.length > 0 && (
            <div style={{ marginBottom: geomSectors.length > 0 ? 8 : 0 }}>
              <div style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.5, color: '#64748b', marginBottom: 5 }}>{t('webDash.mapLegendStatus')}</div>
              {statusLegend.map(({ color, label }) => (
                <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '2px 0' }}>
                  <span style={{ width: 10, height: 10, borderRadius: 999, background: color, border: '1.5px solid #fff', boxShadow: '0 0 0 1px #d4dde8', flexShrink: 0 }} />
                  <span style={{ fontSize: 12, color: '#1e293b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</span>
                </div>
              ))}
            </div>
          )}
          {validBubbles.length > 0 && (
            <div>
              <div style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.5, color: '#64748b', marginBottom: 5 }}>{t('webDash.mapLegendProgress')}</div>
              {bucketLegend.map(({ color, label }) => (
                <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '2px 0' }}>
                  <span style={{ width: 10, height: 10, borderRadius: 999, background: color, flexShrink: 0 }} />
                  <span style={{ fontSize: 12, color: '#1e293b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</span>
                </div>
              ))}
            </div>
          )}
          {geomSectors.length > 0 && (
            <div>
              <div style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.5, color: '#64748b', marginBottom: 5 }}>{t('webCSectors.mapLegendSectors')}</div>
              {geomSectors.map(s => (
                <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '2px 0' }}>
                  <span style={{ width: 13, height: 11, borderRadius: 3, border: `1.5px solid ${s.color}`, background: `${s.color}55`, flexShrink: 0 }} />
                  <span style={{ fontSize: 12, color: '#1e293b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.name}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
