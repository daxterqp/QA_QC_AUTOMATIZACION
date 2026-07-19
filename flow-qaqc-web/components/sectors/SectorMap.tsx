'use client';

/**
 * SectorMap — Mapa GIS general (Leaflet + OSM) con TODOS los sectores del
 * proyecto que tengan geometría. Se importa con `dynamic(..., { ssr:false })`
 * desde SectoresTab/OperationalMap/PortfolioDashboard porque Leaflet toca `window`.
 *
 * Capas (todas opcionales):
 *  - Ortofoto georreferenciada (ImageOverlay, axis-aligned o rotada).
 *  - Polígonos de sectores.
 *  - `markers`  — pines de ENSAYOS (CircleMarker canvas, color por estado,
 *    popup con botón "Abrir ensayo"). Dashboard por proyecto.
 *  - `bubbles`  — burbujas de OBRAS (divIcon HTML con % de avance, color por
 *    bucket). Dashboard de portafolio; clic = drill-down.
 *  - `focusBounds` — al cambiar hace flyToBounds animado (el "zoom" del
 *    drill-down) y suspende el autoencuadre.
 */

import { useEffect, useRef } from 'react';
import {
  MapContainer, TileLayer, Polygon, Tooltip, ImageOverlay, LayersControl,
  LayerGroup, useMap, CircleMarker, Marker, Popup,
} from 'react-leaflet';
import L from 'leaflet';
import type { LatLngBoundsExpression, LatLngExpression } from 'leaflet';
import { normalizeBounds } from '@lib/orthophoto';
import { DASH_COLORS, PROGRESS_BUCKET_COLORS, type ProgressBucket } from '@lib/dashboardUtils';
import type { OrthophotoRotation } from '@/types';
import RotatedImageOverlay from './RotatedImageOverlay';
import { useI18n } from '@lib/i18n';
import 'leaflet/dist/leaflet.css';

type Pt = { lat: number; lng: number };
export interface MapSector {
  id: string;
  name: string;
  color: string;
  points: Pt[];
}
export interface MapOrthophoto {
  url: string;
  /** Bounding box WGS84: [[southLat, westLng], [northLat, eastLng]] */
  bounds: LatLngBoundsExpression;
  opacity?: number;
  /** v72 — si está presente, se dibuja ROTADA (Método 2: sistema propio). */
  rotation?: OrthophotoRotation;
}
/** Pin de un ensayo en el dashboard por proyecto. */
export interface MapMarker {
  id: string;
  lat: number;
  lng: number;
  color: string;
  label: string;
  sublabel?: string;
  statusLabel?: string;
  href?: string;
}
/** Burbuja de una obra en el dashboard de portafolio. */
export interface MapBubble {
  id: string;
  lat: number;
  lng: number;
  percent: number;
  bucket: ProgressBucket;
  name: string;
  sub?: string;
}

const finiteCoord = (lat: number, lng: number) =>
  Number.isFinite(lat) && Number.isFinite(lng) && !(lat === 0 && lng === 0);

function FitToContent({ sectors, orthos, markers, bubbles, suspend }: {
  sectors: MapSector[];
  orthos?: MapOrthophoto[];
  markers?: MapMarker[];
  bubbles?: MapBubble[];
  suspend?: boolean;
}) {
  const map = useMap();
  // Los markers/bubbles cambian con los FILTROS: re-encuadrar en cada tweak
  // marea. Solo re-encuadramos cuando su PRESENCIA cambia (0 → >0), o cuando
  // cambian sectores/ortos (comportamiento previo).
  const hasMarkers = (markers?.length ?? 0) > 0;
  const hasBubbles = (bubbles?.length ?? 0) > 0;
  useEffect(() => {
    if (suspend) return;
    const lats: number[] = [];
    const lngs: number[] = [];
    for (const s of sectors) for (const p of s.points) { lats.push(p.lat); lngs.push(p.lng); }
    // Incluye las teselas de la ortofoto en el encuadre (clave si aún no hay sectores).
    for (const o of orthos ?? []) {
      const b = o.bounds as [[number, number], [number, number]];
      lats.push(b[0][0], b[1][0]); lngs.push(b[0][1], b[1][1]);
    }
    for (const m of markers ?? []) if (finiteCoord(m.lat, m.lng)) { lats.push(m.lat); lngs.push(m.lng); }
    for (const b of bubbles ?? []) if (finiteCoord(b.lat, b.lng)) { lats.push(b.lat); lngs.push(b.lng); }
    if (lats.length === 0) return;
    const bounds: LatLngBoundsExpression = [
      [Math.min(...lats), Math.min(...lngs)],
      [Math.max(...lats), Math.max(...lngs)],
    ];
    map.fitBounds(bounds, { padding: [30, 30], maxZoom: 18 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sectors, orthos, hasMarkers, hasBubbles, suspend]);
  return null;
}

/** flyToBounds animado cuando cambia focusBounds (el "zoom" del drill-down). */
function FlyToFocus({ focusBounds }: { focusBounds?: LatLngBoundsExpression | null }) {
  const map = useMap();
  useEffect(() => {
    if (!focusBounds) return;
    try {
      map.flyToBounds(focusBounds, { padding: [40, 40], maxZoom: 17, duration: 0.8 });
    } catch { /* bounds corruptos → ignorar */ }
  }, [focusBounds, map]);
  return null;
}

/**
 * En el grid del dashboard el contenedor cambia de tamaño (breakpoints, resize
 * de la ventana Electron). Sin invalidateSize Leaflet deja tiles grises.
 */
function ResizeInvalidator() {
  const map = useMap();
  useEffect(() => {
    const el = map.getContainer();
    let tm: ReturnType<typeof setTimeout> | null = null;
    const ro = new ResizeObserver(() => {
      if (tm) clearTimeout(tm);
      tm = setTimeout(() => map.invalidateSize(), 150);
    });
    ro.observe(el);
    if (el.parentElement) ro.observe(el.parentElement);
    return () => { ro.disconnect(); if (tm) clearTimeout(tm); };
  }, [map]);
  return null;
}

function bubbleIcon(b: MapBubble): L.DivIcon {
  const color = PROGRESS_BUCKET_COLORS[b.bucket];
  const label = b.bucket === 'none' ? '—' : `${b.percent}%`;
  return L.divIcon({
    className: '',
    html: `<div style="
      width:46px;height:46px;border-radius:50%;
      background:${color};border:3px solid #fff;
      box-shadow:0 0 0 4px ${color}33, 0 2px 8px rgba(0,0,0,0.35);
      display:flex;align-items:center;justify-content:center;
      color:#fff;font-weight:800;font-size:12px;font-family:Inter,system-ui,sans-serif;
      cursor:pointer;">${label}</div>`,
    iconSize: [46, 46],
    iconAnchor: [23, 23],
  });
}

export default function SectorMap({
  sectors,
  orthophotos,
  height = 380,
  markers,
  bubbles,
  onMarkerNavigate,
  onBubbleClick,
  focusBounds,
}: {
  sectors: MapSector[];
  orthophotos?: MapOrthophoto[] | null;
  height?: number | string;
  markers?: MapMarker[];
  bubbles?: MapBubble[];
  onMarkerNavigate?: (href: string) => void;
  onBubbleClick?: (projectId: string) => void;
  focusBounds?: LatLngBoundsExpression | null;
}) {
  const { t } = useI18n();
  // Saneamos bounds aquí (no confiar en lo persistido): descarta teselas con
  // bounds corruptos en vez de crashear todo el mapa (RangeError de Leaflet).
  // La rotación (Método 2) se valida aparte: si sus 4 esquinas/bearing no son
  // finitos, se ignora y cae al render axis-aligned (no se pinta torcida).
  const finitePair = (p: any) => Array.isArray(p) && p.length === 2 && Number.isFinite(p[0]) && Number.isFinite(p[1]);
  const orthos = (orthophotos ?? [])
    .map(o => {
      const b = normalizeBounds(o.bounds);
      if (!b) return null;
      const r = o.rotation;
      const rotOk = !!r && Number.isFinite(r.bearing)
        && finitePair(r.corners?.tl) && finitePair(r.corners?.tr)
        && finitePair(r.corners?.br) && finitePair(r.corners?.bl);
      return { ...o, bounds: b as LatLngBoundsExpression, rotation: rotOk ? r : undefined };
    })
    .filter(Boolean) as MapOrthophoto[];
  const geomSectors = sectors.filter(s => s.points && s.points.length >= 3);
  const validMarkers = (markers ?? []).filter(m => finiteCoord(m.lat, m.lng));
  const validBubbles = (bubbles ?? []).filter(b => finiteCoord(b.lat, b.lng));
  const center: LatLngExpression = geomSectors[0]
    ? [geomSectors[0].points[0].lat, geomSectors[0].points[0].lng]
    : validMarkers[0]
    ? [validMarkers[0].lat, validMarkers[0].lng]
    : validBubbles[0]
    ? [validBubbles[0].lat, validBubbles[0].lng]
    : [-12.0464, -77.0428]; // Lima fallback

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

  return (
    <div style={{ position: 'relative', height, width: '100%' }}>
    <MapContainer
      center={center}
      zoom={validBubbles.length > 0 ? 6 : 15}
      style={{ height: '100%', width: '100%', borderRadius: 6 }}
      scrollWheelZoom
      preferCanvas
    >
      <LayersControl position="topright">
        <LayersControl.BaseLayer checked name="OpenStreetMap">
          <TileLayer
            attribution='&copy; OpenStreetMap'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
        </LayersControl.BaseLayer>
        <LayersControl.BaseLayer name={t('webCSectors.mapBaseSatellite')}>
          <TileLayer
            attribution="Tiles &copy; Esri"
            url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
          />
        </LayersControl.BaseLayer>

        {orthos.length > 0 && (
          <LayersControl.Overlay checked name={t('webCSectors.mapOverlayOrtho')}>
            {/* Una capa por TESELA, en tilePane → debajo de los polígonos de sector.
                Con rotación (Método 2) → overlay por 3 esquinas; si no, axis-aligned. */}
            <LayerGroup>
              {orthos.map((o, i) => o.rotation ? (
                <RotatedImageOverlay key={i} url={o.url} opacity={o.opacity ?? 1} paneName="tilePane"
                  topLeft={o.rotation.corners.tl} topRight={o.rotation.corners.tr} bottomLeft={o.rotation.corners.bl} />
              ) : (
                <ImageOverlay key={i} url={o.url} bounds={o.bounds} opacity={o.opacity ?? 1} pane="tilePane" />
              ))}
            </LayerGroup>
          </LayersControl.Overlay>
        )}

        {validMarkers.length > 0 && (
          <LayersControl.Overlay checked name={t('webDash.mapLayerTests')}>
            <LayerGroup>
              {validMarkers.map(m => (
                <CircleMarker
                  key={m.id}
                  center={[m.lat, m.lng]}
                  radius={6}
                  pathOptions={{ color: '#ffffff', weight: 1.5, fillColor: m.color, fillOpacity: 0.9 }}
                >
                  <Popup>
                    <div style={{ minWidth: 150, fontFamily: 'Inter, system-ui, sans-serif' }}>
                      <p style={{ margin: 0, fontWeight: 700, fontSize: 12, color: '#0e213d' }}>{m.label}</p>
                      {m.sublabel && <p style={{ margin: '2px 0 0', fontSize: 11, color: '#64748b' }}>{m.sublabel}</p>}
                      {m.statusLabel && (
                        <span style={{
                          display: 'inline-block', marginTop: 5, padding: '2px 8px', borderRadius: 999,
                          background: m.color, color: '#fff', fontSize: 10, fontWeight: 700,
                        }}>{m.statusLabel}</span>
                      )}
                      {m.href && onMarkerNavigate && (
                        <button
                          onClick={() => onMarkerNavigate(m.href!)}
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
                </CircleMarker>
              ))}
            </LayerGroup>
          </LayersControl.Overlay>
        )}
      </LayersControl>

      {geomSectors.map(s => (
        <Polygon
          key={s.id}
          positions={s.points.map(p => [p.lat, p.lng] as LatLngExpression)}
          pathOptions={{ color: s.color, weight: 2, fillColor: s.color, fillOpacity: 0.22 }}
        >
          <Tooltip sticky>{s.name}</Tooltip>
        </Polygon>
      ))}

      {validBubbles.map(b => (
        <Marker
          key={b.id}
          position={[b.lat, b.lng]}
          icon={bubbleIcon(b)}
          eventHandlers={onBubbleClick ? { click: () => onBubbleClick(b.id) } : undefined}
        >
          <Tooltip direction="top" offset={[0, -26]}>
            <div style={{ textAlign: 'center' }}>
              <strong>{b.name}</strong>
              {b.sub && <><br /><span style={{ fontSize: 11 }}>{b.sub}</span></>}
            </div>
          </Tooltip>
        </Marker>
      ))}

      <FitToContent sectors={geomSectors} orthos={orthos} markers={validMarkers}
        bubbles={validBubbles} suspend={!!focusBounds} />
      <FlyToFocus focusBounds={focusBounds} />
      <ResizeInvalidator />
    </MapContainer>

    {/* Leyendas flotantes (sectores / estados de ensayo / avance de obras). */}
    {(geomSectors.length > 0 || validMarkers.length > 0 || validBubbles.length > 0) && (
      <div style={{
        position: 'absolute', bottom: 10, left: 10, zIndex: 1000,
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
