/**
 * orthophotoServer.ts — Lógica de SERVIDOR (Node) para ortofotos. Corre en la
 * PC (ruta API bajo el `node` que levanta el Electron), NUNCA en el navegador.
 *
 *  1) readGeoTiffGeo(): lee la georreferencia incrustada del GeoTIFF (esquinas +
 *     CRS) SIN decodificar los píxeles → solo la cabecera. Convierte a WGS84.
 *  2) processOrthophoto(): con sharp/libvips reescala el lado largo a `maxDim` y
 *     reencoda a WebP. libvips lee el TIFF de forma secuencial → poca RAM aun
 *     con archivos de varios GB. Escribe la versión liviana en `stagePath`.
 *
 * Solo se sube a S3 la versión liviana resultante.
 */
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { fromFile } from 'geotiff';
import proj4 from 'proj4';
import JSZip from 'jszip';
import { XMLParser } from 'fast-xml-parser';

proj4.defs('EPSG:4326', '+proj=longlat +datum=WGS84 +no_defs');

export type LeafletBounds = [[number, number], [number, number]];

export interface GeoResult {
  /** Bounding box en WGS84: [[southLat,westLng],[northLat,eastLng]]. */
  bounds: LeafletBounds;
  /** Etiqueta legible del CRS de origen (informativo). */
  systemLabel: string;
  epsg: number | null;
}

/** Construye una definición proj4 para los EPSG que sabemos manejar (Perú +
 *  WGS84 global). Devuelve null si el CRS no es reconocido → fallback manual. */
function proj4DefForEpsg(epsg: number): string | null {
  if (epsg === 4326) return 'EPSG:4326';                                   // WGS84 geográfico
  if (epsg >= 32601 && epsg <= 32660) return `+proj=utm +zone=${epsg - 32600} +datum=WGS84 +units=m +no_defs`;        // WGS84 UTM N
  if (epsg >= 32701 && epsg <= 32760) return `+proj=utm +zone=${epsg - 32700} +south +datum=WGS84 +units=m +no_defs`; // WGS84 UTM S
  if (epsg === 4248) return '+proj=longlat +ellps=intl +towgs84=-288,175,-376,0,0,0,0 +no_defs';                      // PSAD56 geográfico
  if (epsg >= 24817 && epsg <= 24820) return `+proj=utm +zone=${epsg - 24800} +ellps=intl +towgs84=-288,175,-376,0,0,0,0 +units=m +no_defs`;         // PSAD56 UTM N (17-19)
  if (epsg >= 24877 && epsg <= 24880) return `+proj=utm +zone=${epsg - 24860} +south +ellps=intl +towgs84=-288,175,-376,0,0,0,0 +units=m +no_defs`;  // PSAD56 UTM S (17-19)
  return null;
}

function labelForEpsg(epsg: number | null): string {
  if (epsg == null) return 'Desconocido';
  if (epsg === 4326) return 'WGS84 (lat/lng)';
  if (epsg >= 32601 && epsg <= 32760) return `WGS84 UTM zona ${epsg % 100}${epsg < 32700 ? 'N' : 'S'}`;
  if (epsg === 4248) return 'PSAD56 (lat/lng)';
  if (epsg >= 24817 && epsg <= 24880) return `PSAD56 UTM (EPSG:${epsg})`;
  return `EPSG:${epsg}`;
}

/** Lee la georreferencia del GeoTIFF (si la tiene) y la devuelve en WGS84.
 *  Devuelve null si el archivo no es GeoTIFF, no trae geo-tags o el CRS no se
 *  reconoce → en ese caso el usuario ingresa las esquinas a mano. */
export async function readGeoTiffGeo(srcPath: string): Promise<GeoResult | null> {
  let tiff: any = null;
  try {
    tiff = await fromFile(srcPath);
    const image = await tiff.getImage();          // lee la IFD/cabecera, NO los píxeles
    const bbox = image.getBoundingBox();          // [minX, minY, maxX, maxY] en el CRS del archivo
    if (!bbox || bbox.some((n: number) => !isFinite(n))) return null;
    const keys = image.getGeoKeys?.() ?? {};
    const epsg: number | null = keys.ProjectedCSTypeGeoKey ?? keys.GeographicTypeGeoKey ?? null;
    if (epsg == null) return null;
    const def = proj4DefForEpsg(epsg);
    if (!def) return null;

    const [minX, minY, maxX, maxY] = bbox;
    // Convierte las 4 esquinas a WGS84 y toma el envolvente (robusto a UTM).
    const corners: [number, number][] = [[minX, minY], [maxX, minY], [maxX, maxY], [minX, maxY]];
    const lls = corners.map(([x, y]) => {
      if (def === 'EPSG:4326') return { lng: x, lat: y };
      const [lng, lat] = proj4(def, 'EPSG:4326', [x, y]);
      return { lng, lat };
    });
    const lats = lls.map(p => p.lat), lngs = lls.map(p => p.lng);
    const bounds: LeafletBounds = [
      [Math.min(...lats), Math.min(...lngs)],
      [Math.max(...lats), Math.max(...lngs)],
    ];
    // Sanity: coords plausibles (-90..90 / -180..180)
    if (Math.abs(bounds[0][0]) > 90 || Math.abs(bounds[1][0]) > 90 || Math.abs(bounds[0][1]) > 180 || Math.abs(bounds[1][1]) > 180) return null;
    return { bounds, systemLabel: labelForEpsg(epsg), epsg };
  } catch {
    return null; // no es GeoTIFF válido / sin geo-tags → fallback manual
  } finally {
    // C2 — cerrar el handle del archivo SIEMPRE (fromFile abre un fd). Sin esto
    // cada procesamiento filtra un descriptor contra el server Next de larga vida.
    try { await tiff?.close?.(); } catch { /* ignore */ }
  }
}

// ── KML / KMZ (GroundOverlay) ───────────────────────────────────────────────
export interface KmlOverlay {
  bounds: LeafletBounds;   // [[south,west],[north,east]] en WGS84
  imagePath: string;       // ruta local de la imagen a procesar
  /** true si la imagen es un temporal extraído del KMZ (borrar tras procesar). */
  isTemp: boolean;
  systemLabel: string;
}

/** Busca recursivamente el primer nodo `GroundOverlay` en el objeto KML parseado. */
function findGroundOverlay(node: any): any | null {
  if (!node || typeof node !== 'object') return null;
  if (node.GroundOverlay) return Array.isArray(node.GroundOverlay) ? node.GroundOverlay[0] : node.GroundOverlay;
  for (const k of Object.keys(node)) {
    const found = findGroundOverlay(node[k]);
    if (found) return found;
  }
  return null;
}

/**
 * Lee un KML/KMZ con un GroundOverlay (ortofoto georreferenciada de Google Earth
 * / software de dron): saca el bounding box (LatLonBox, ya en WGS84) y la imagen
 * referenciada. Devuelve la ruta de la imagen a procesar con sharp.
 * Más liviano y simple que el GeoTIFF: las coords ya vienen listas.
 */
export async function readKmlGroundOverlay(srcPath: string, stageDir: string): Promise<KmlOverlay> {
  const ext = path.extname(srcPath).toLowerCase();
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' });

  let kmlText: string;
  let zip: JSZip | null = null;
  if (ext === '.kmz') {
    zip = await JSZip.loadAsync(fs.readFileSync(srcPath));
    const kmlEntry = Object.keys(zip.files).find(n => n.toLowerCase().endsWith('.kml'));
    if (!kmlEntry) throw new Error('El KMZ no contiene un .kml.');
    kmlText = await zip.files[kmlEntry].async('text');
  } else {
    kmlText = fs.readFileSync(srcPath, 'utf8');
  }

  const doc = parser.parse(kmlText);
  const go = findGroundOverlay(doc);
  if (!go) throw new Error('El KML/KMZ no tiene un GroundOverlay (ortofoto). ¿Es un KML de vectores?');

  const box = go.LatLonBox ?? go.gx_LatLonQuad;
  if (!go.LatLonBox) throw new Error('El GroundOverlay no tiene LatLonBox (georreferencia rectangular).');
  const north = Number(box.north), south = Number(box.south), east = Number(box.east), west = Number(box.west);
  if (![north, south, east, west].every(n => Number.isFinite(n))) throw new Error('LatLonBox con coordenadas inválidas.');
  const bounds: LeafletBounds = [[Math.min(south, north), Math.min(west, east)], [Math.max(south, north), Math.max(west, east)]];

  const href: string | undefined = go.Icon?.href ?? go.Icon?.['@_href'];
  if (!href) throw new Error('El GroundOverlay no referencia una imagen (Icon/href).');
  if (/^https?:\/\//i.test(href)) throw new Error('La imagen del KML es remota (URL). Usa un KMZ con la imagen embebida.');

  if (zip) {
    // Imagen embebida en el KMZ → extraer a un temporal.
    const entry = zip.files[href] ?? zip.files[Object.keys(zip.files).find(n => n.endsWith(href)) ?? ''];
    if (!entry) throw new Error(`La imagen "${href}" no está dentro del KMZ.`);
    const buf = await entry.async('nodebuffer');
    const tmp = path.join(stageDir, `_kmlimg${path.extname(href) || '.png'}`);
    fs.mkdirSync(stageDir, { recursive: true });
    fs.writeFileSync(tmp, buf);
    return { bounds, imagePath: tmp, isTemp: true, systemLabel: 'KMZ (GroundOverlay · WGS84)' };
  }

  // KML plano: la imagen es un archivo local relativo al .kml.
  const imgPath = path.isAbsolute(href) ? href : path.join(path.dirname(srcPath), href);
  if (!fs.existsSync(imgPath)) throw new Error(`No se encontró la imagen del KML: ${imgPath}`);
  return { bounds, imagePath: imgPath, isTemp: false, systemLabel: 'KML (GroundOverlay · WGS84)' };
}

export interface ProcessResult {
  outWidth: number;
  outHeight: number;
  outBytes: number;
  srcWidth: number | null;
  srcHeight: number | null;
  previewDataUrl: string;
}

// ── Teselado NxN ─────────────────────────────────────────────────────────────
export interface TileOut { r: number; c: number; outBytes: number; width: number; height: number }
export interface TilesResult {
  tiles: TileOut[];
  srcWidth: number | null;
  srcHeight: number | null;
  outBytesTotal: number;
  previewDataUrl: string;
}

/** Subdivide la imagen en una grilla grid×grid: recorta cada porción del origen,
 *  la reescala a `maxDimPerTile` y la guarda como WebP en staging
 *  (`_staging-<token>-<r>-<c>.webp`). Cada tesela usa su propia textura en el
 *  mapa → esquiva el límite de ~8192px del visor y multiplica el detalle. */
export async function processOrthophotoTiles(
  srcPath: string,
  stageDir: string,
  token: string,
  grid: number,
  maxDimPerTile: number,
  quality: number,
): Promise<TilesResult> {
  const meta = await sharp(srcPath, { limitInputPixels: false, failOn: 'none' }).metadata().catch(() => ({} as any));
  const W = meta.width ?? 0, H = meta.height ?? 0;
  const edge = (i: number, n: number, size: number) => Math.round((i * size) / n);
  const tiles: TileOut[] = [];
  let total = 0;

  for (let r = 0; r < grid; r++) {
    for (let c = 0; c < grid; c++) {
      const left = edge(c, grid, W), right = edge(c + 1, grid, W);
      const top = edge(r, grid, H), bottom = edge(r + 1, grid, H);
      const tw = Math.max(1, right - left), th = Math.max(1, bottom - top);
      const out = path.join(stageDir, `_staging-${token}-${r}-${c}.webp`);
      let pipe = sharp(srcPath, { limitInputPixels: false, failOn: 'none' });
      if (grid > 1 && W > 0 && H > 0) pipe = pipe.extract({ left, top, width: tw, height: th });
      await pipe
        .resize({ width: maxDimPerTile, height: maxDimPerTile, fit: 'inside', withoutEnlargement: true })
        .webp({ quality, effort: 4 })
        .toFile(out);
      const om = await sharp(out).metadata();
      const bytes = fs.statSync(out).size;
      total += bytes;
      tiles.push({ r, c, outBytes: bytes, width: om.width ?? 0, height: om.height ?? 0 });
    }
  }

  const previewBuf = await sharp(srcPath, { limitInputPixels: false, failOn: 'none' })
    .resize({ width: 800, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 70 })
    .toBuffer();

  return {
    tiles,
    srcWidth: W || null,
    srcHeight: H || null,
    outBytesTotal: total,
    previewDataUrl: `data:image/webp;base64,${previewBuf.toString('base64')}`,
  };
}

/** Reescala + recomprime a WebP en `stagePath`. libvips lee secuencial (poca RAM). */
export async function processOrthophoto(
  srcPath: string,
  stagePath: string,
  maxDim: number,
  quality: number,
): Promise<ProcessResult> {
  const srcMeta = await sharp(srcPath, { limitInputPixels: false, failOn: 'none' }).metadata().catch(() => ({} as any));

  await sharp(srcPath, { limitInputPixels: false, failOn: 'none' })
    .resize({ width: maxDim, height: maxDim, fit: 'inside', withoutEnlargement: true })
    .webp({ quality, effort: 4 })
    .toFile(stagePath);

  const outMeta = await sharp(stagePath).metadata();
  const outBytes = fs.statSync(stagePath).size;

  // Preview liviano (~800px) para la ventana de confirmación.
  const previewBuf = await sharp(stagePath)
    .resize({ width: 800, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 70 })
    .toBuffer();
  const previewDataUrl = `data:image/webp;base64,${previewBuf.toString('base64')}`;

  return {
    outWidth: outMeta.width ?? 0,
    outHeight: outMeta.height ?? 0,
    outBytes,
    srcWidth: srcMeta.width ?? null,
    srcHeight: srcMeta.height ?? null,
    previewDataUrl,
  };
}
