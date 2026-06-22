'use client';

/**
 * SectorMap — Mapa GIS general (Leaflet + OSM) con TODOS los sectores del
 * proyecto que tengan geometría. Se importa con `dynamic(..., { ssr:false })`
 * desde SectoresTab porque Leaflet toca `window`.
 *
 * Opcionalmente superpone una ortofoto georreferenciada (ImageOverlay) a partir
 * de su bounding box en WGS84 (ver módulo de ortofotos).
 */

import { useEffect } from 'react';
import { MapContainer, TileLayer, Polygon, Tooltip, ImageOverlay, LayersControl, LayerGroup, useMap } from 'react-leaflet';
import type { LatLngBoundsExpression, LatLngExpression } from 'leaflet';
import { normalizeBounds } from '@lib/orthophoto';
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
}

function FitToSectors({ sectors, orthos }: { sectors: MapSector[]; orthos?: MapOrthophoto[] }) {
  const map = useMap();
  useEffect(() => {
    const lats: number[] = [];
    const lngs: number[] = [];
    for (const s of sectors) for (const p of s.points) { lats.push(p.lat); lngs.push(p.lng); }
    // Incluye las teselas de la ortofoto en el encuadre (clave si aún no hay sectores).
    for (const o of orthos ?? []) {
      const b = o.bounds as [[number, number], [number, number]];
      lats.push(b[0][0], b[1][0]); lngs.push(b[0][1], b[1][1]);
    }
    if (lats.length === 0) return;
    const bounds: LatLngBoundsExpression = [
      [Math.min(...lats), Math.min(...lngs)],
      [Math.max(...lats), Math.max(...lngs)],
    ];
    map.fitBounds(bounds, { padding: [30, 30], maxZoom: 18 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sectors, orthos]);
  return null;
}

export default function SectorMap({
  sectors,
  orthophotos,
  height = 380,
}: {
  sectors: MapSector[];
  orthophotos?: MapOrthophoto[] | null;
  height?: number;
}) {
  const { t } = useI18n();
  // Saneamos bounds aquí (no confiar en lo persistido): descarta teselas con
  // bounds corruptos en vez de crashear todo el mapa (RangeError de Leaflet).
  const orthos = (orthophotos ?? [])
    .map(o => {
      const b = normalizeBounds(o.bounds);
      return b ? { ...o, bounds: b as LatLngBoundsExpression } : null;
    })
    .filter(Boolean) as MapOrthophoto[];
  const geomSectors = sectors.filter(s => s.points && s.points.length >= 3);
  const center: LatLngExpression = geomSectors[0]
    ? [geomSectors[0].points[0].lat, geomSectors[0].points[0].lng]
    : [-12.0464, -77.0428]; // Lima fallback

  return (
    <div style={{ position: 'relative', height, width: '100%' }}>
    <MapContainer
      center={center}
      zoom={15}
      style={{ height: '100%', width: '100%', borderRadius: 6 }}
      scrollWheelZoom
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
            {/* Una capa por TESELA, en tilePane → debajo de los polígonos de sector. */}
            <LayerGroup>
              {orthos.map((o, i) => (
                <ImageOverlay key={i} url={o.url} bounds={o.bounds} opacity={o.opacity ?? 1} pane="tilePane" />
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

      <FitToSectors sectors={geomSectors} orthos={orthos} />
    </MapContainer>

    {/* Leyenda de sectores (sobre el mapa). El estado de ensayos no aplica aquí
        (el mapa web no dibuja marcadores de ensayo). */}
    {geomSectors.length > 0 && (
      <div style={{
        position: 'absolute', bottom: 10, left: 10, zIndex: 1000,
        background: 'rgba(255,255,255,0.95)', border: '1px solid #e2e8f0', borderRadius: 6,
        padding: '8px 10px', maxHeight: 180, overflowY: 'auto', boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
        maxWidth: 200,
      }}>
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
  );
}
