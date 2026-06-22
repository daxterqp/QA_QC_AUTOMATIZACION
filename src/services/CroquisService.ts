/**
 * CroquisService (v43.5) — Construye los `CroquisSpec` (sectores + ensayo(s) ploteados +
 * capa/ortofoto) que el `CroquisCaptureProvider` captura a PNG antes de exportar el PDF.
 *
 * Es PURO datos (sin React): consulta sectores del proyecto y la URL de ortofoto una
 * sola vez, y arma un spec por protocolo/muestra que tenga el croquis activado y
 * coordenadas para plotear. La captura real (MapView→PNG) la hace el provider.
 */
import { Q } from '@nozbe/watermelondb';
import { projectSectorsCollection, projectsCollection } from '@db/index';
import type ProjectSector from '@models/ProjectSector';
import {
  getTemplatePrintConfig,
  type ProjectFeatureFlags,
  type CroquisMapType,
} from '@utils/featureFlags';
import { pointInPolygon } from '@utils/CoordinateSystem';
import type { CroquisSpec } from '../context/CroquisCaptureContext';

const SECTOR_DEFAULT_COLOR = '#1a4f7a';

export interface CroquisProtocolInput {
  id: string;                  // protocolId (clave del croquisByProtocol)
  idProtocolo: string | null;  // tipo de ensayo → su config de croquis
  lat: number | null;
  lng: number | null;
  color?: string;
  label?: string;
  date?: string;               // fecha (dd/mm/aaaa) para el nombre del mapa
}

/** Leyenda del croquis (se dibuja a la DERECHA del mapa en el PDF, como un gráfico). */
export interface CroquisLegend {
  pointLabel: string;                              // "Ensayo" / "Ensayos"
  activeSectors: { name: string; color: string }[]; // sector(es) que contienen el ensayo
  hasOtherSectors: boolean;                        // hay otros sectores (en plomo)
  mapName: string;                                 // "Vista Híbrida: 18/06/2026" u "Ortofoto"
}

export interface CroquisResult { img: string; legend: CroquisLegend }

interface GeomSector { name: string; color: string; points: { lat: number; lng: number }[] }

/** Sectores del proyecto CON geometría (id/name/color/puntos). */
async function loadGeomSectors(projectId: string): Promise<GeomSector[]> {
  const rows = await projectSectorsCollection
    .query(Q.where('project_id', projectId)).fetch() as ProjectSector[];
  const out: GeomSector[] = [];
  for (const s of (rows ?? [])) {
    const pts = s.points;
    if (pts && pts.length >= 3) out.push({ name: s.name, color: s.displayColor || SECTOR_DEFAULT_COLOR, points: pts });
  }
  return out;
}

async function loadMapTileUrl(projectId: string): Promise<string | null> {
  try {
    const arr = await projectsCollection.query(Q.where('id', projectId)).fetch();
    return (arr[0] as any)?.mapTileUrl ?? null;
  } catch { return null; }
}

const VIEW_NAMES: Record<CroquisMapType, string> = {
  hybrid: 'Vista Híbrida', satellite: 'Vista Satélite', standard: 'Vista Estándar', terrain: 'Vista Terreno', none: '',
};
function mapNameFor(mapType: CroquisMapType, showOrtho: boolean, hasTile: boolean, date?: string): string {
  if (mapType === 'none') return '';   // sin mapa → sin nombre de capa
  if (showOrtho && hasTile) return 'Ortofoto';
  return date ? `${VIEW_NAMES[mapType]}: ${date}` : VIEW_NAMES[mapType];
}

/**
 * Specs + leyendas para el dossier por TIPO/ubicación: un croquis por protocolo con
 * croquis activado y coordenadas. Clave = protocolId. Marca como ACTIVO solo el sector
 * que contiene el ensayo (se pinta de su color; el resto, plomo).
 */
export async function buildProtocolCroquisSpecs(
  projectId: string,
  inputs: CroquisProtocolInput[],
  flags: ProjectFeatureFlags,
): Promise<{ specs: CroquisSpec[]; legends: Record<string, CroquisLegend> }> {
  const wanted = inputs.filter(p => {
    const cfg = getTemplatePrintConfig(flags, p.idProtocolo);
    return cfg.croquis.show && p.lat != null && p.lng != null;
  });
  if (wanted.length === 0) return { specs: [], legends: {} };

  const [geom, mapTileUrl] = await Promise.all([loadGeomSectors(projectId), loadMapTileUrl(projectId)]);

  const specs: CroquisSpec[] = [];
  const legends: Record<string, CroquisLegend> = {};
  for (const p of wanted) {
    const cfg = getTemplatePrintConfig(flags, p.idProtocolo);
    const pt = { lat: p.lat as number, lng: p.lng as number };
    // Sector(es) que CONTIENEN el ensayo → activos (a color); el resto, plomo.
    const sectors = geom.map(s => ({ points: s.points, color: s.color, active: pointInPolygon(pt, s.points) }));
    const activeSectors = geom.filter((_, i) => sectors[i].active).map(s => ({ name: s.name, color: s.color }));
    const hasOtherSectors = geom.length > activeSectors.length;
    specs.push({
      id: p.id,
      sectors,
      points: [{ lat: pt.lat, lng: pt.lng, color: p.color, label: p.label }],
      mapType: cfg.croquis.map_type,
      mapTileUrl,
      showOrthophoto: cfg.croquis.show_orthophoto,
      baseOpacity: cfg.croquis.base_opacity,
      pointSize: cfg.croquis.point_size,
      width: 360,
      height: 270,   // 4:3
    } as CroquisSpec);
    legends[p.id] = {
      pointLabel: 'Ensayo',
      activeSectors,
      hasOtherSectors,
      mapName: mapNameFor(cfg.croquis.map_type, cfg.croquis.show_orthophoto, !!mapTileUrl, p.date),
    };
  }
  return { specs, legends };
}

/**
 * Spec para el dossier de MUESTRA: un solo croquis con TODOS los ensayos de la muestra
 * ploteados. Clave = sampleId. `ensayos` son los puntos (lat/lng) de cada protocolo.
 */
export async function buildSampleCroquisSpec(
  projectId: string,
  sampleId: string,
  ensayos: { lat: number; lng: number; color?: string; label?: string }[],
  flags: ProjectFeatureFlags,
): Promise<CroquisSpec | null> {
  const pts = ensayos.filter(e => e.lat != null && e.lng != null);
  if (pts.length === 0) return null;
  const cfg = getTemplatePrintConfig(flags, null);   // config por defecto (muestra no es un "tipo")
  const [geom, mapTileUrl] = await Promise.all([loadGeomSectors(projectId), loadMapTileUrl(projectId)]);
  // Activo = sector que contiene AL MENOS un ensayo de la muestra.
  const sectors = geom.map(s => ({ points: s.points, color: s.color, active: pts.some(pt => pointInPolygon(pt, s.points)) }));
  return {
    id: sampleId,
    sectors,
    points: pts,
    mapType: cfg.croquis.map_type,
    mapTileUrl,
    showOrthophoto: cfg.croquis.show_orthophoto,
    baseOpacity: cfg.croquis.base_opacity,
    pointSize: cfg.croquis.point_size,
    width: 360,
    height: 270,
  };
}
