/**
 * CroquisCacheService (v101) — Caché LOCAL de croquis por ensayo.
 *
 * Problema que resuelve: el dossier recapturaba TODOS los mapas (MapView→imagen)
 * en cada exportación — lento (~3-5 s por ensayo) y, con ~100 ensayos en PNG
 * base64, el HTML llegaba a ~150-200 MB y `printToFileAsync` moría por
 * OutOfMemory (heap Java 256 MB).
 *
 * Diseño:
 *  - Cada croquis se guarda UNA vez como JPEG en documentDirectory/croquis/
 *    con nombre `<protocolId>_<hash>.jpg`.
 *  - El hash es del SPEC completo (coordenadas del ensayo, geometría/colores de
 *    sectores, capa, ortofoto, opacidad, tamaño de ícono, dimensiones): si algo
 *    de eso cambia, el hash cambia y se regenera solo; si no, se reutiliza.
 *  - `getOrCaptureCroquis` es el único punto de entrada: sirve de caché para el
 *    dossier y para la PREGENERACIÓN al guardar coordenadas (GPSCaptureBar).
 *  - Al guardar un croquis nuevo se borran los archivos viejos de ese ensayo.
 */
import * as FileSystem from 'expo-file-system/legacy';
import type { CroquisSpec } from '../context/CroquisCaptureContext';
import type { CroquisLegend, CroquisResult } from './CroquisService';

const DIR = `${FileSystem.documentDirectory}croquis/`;
/** Subir esta versión invalida TODO el caché (p.ej. si cambia el formato). */
const CACHE_VER = 1;

/** Hash FNV-1a (32 bits, base36) — suficiente para detectar cambios de spec. */
function fnv1a(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36);
}

/** Hash del spec SIN el id (el id va en el nombre del archivo). */
export function croquisSpecHash(spec: CroquisSpec): string {
  const { id: _id, ...rest } = spec as CroquisSpec & { id: string };
  return fnv1a(`v${CACHE_VER}|${JSON.stringify(rest)}`);
}

async function ensureDir(): Promise<void> {
  try {
    const info = await FileSystem.getInfoAsync(DIR);
    if (!info.exists) await FileSystem.makeDirectoryAsync(DIR, { intermediates: true });
  } catch { /* mejor esfuerzo */ }
}

/** Data-URI del prefijo según el formato guardado (siempre JPEG desde v101). */
const DATA_PREFIX = 'data:image/jpeg;base64,';

/** Devuelve el croquis cacheado (data URI) o null si no existe para ese hash. */
export async function getCachedCroquis(protocolId: string, hash: string): Promise<string | null> {
  try {
    const file = `${DIR}${protocolId}_${hash}.jpg`;
    const info = await FileSystem.getInfoAsync(file);
    if (!info.exists) return null;
    const b64 = await FileSystem.readAsStringAsync(file, { encoding: FileSystem.EncodingType.Base64 });
    return b64 ? DATA_PREFIX + b64 : null;
  } catch { return null; }
}

/** Guarda el croquis (data URI JPEG) y borra versiones viejas del mismo ensayo. */
export async function storeCroquis(protocolId: string, hash: string, dataUri: string): Promise<void> {
  try {
    await ensureDir();
    // Borra caches anteriores de este ensayo (hash distinto = quedó obsoleto).
    try {
      const names = await FileSystem.readDirectoryAsync(DIR);
      for (const n of names) {
        if (n.startsWith(`${protocolId}_`) && n !== `${protocolId}_${hash}.jpg`) {
          await FileSystem.deleteAsync(DIR + n, { idempotent: true });
        }
      }
    } catch { /* listado falló → seguir */ }
    const b64 = dataUri.replace(/^data:image\/[a-z]+;base64,/, '');
    await FileSystem.writeAsStringAsync(`${DIR}${protocolId}_${hash}.jpg`, b64, { encoding: FileSystem.EncodingType.Base64 });
  } catch { /* el caché nunca es crítico */ }
}

/** Borra el caché de un ensayo (p.ej. al eliminarlo). */
export async function invalidateCroquis(protocolId: string): Promise<void> {
  try {
    const names = await FileSystem.readDirectoryAsync(DIR);
    for (const n of names) {
      if (n.startsWith(`${protocolId}_`)) await FileSystem.deleteAsync(DIR + n, { idempotent: true });
    }
  } catch { /* dir no existe → nada que borrar */ }
}

/**
 * Punto de entrada ÚNICO: devuelve los croquis de los specs pedidos, usando el
 * caché cuando el spec no cambió y capturando (y cacheando) solo los que faltan.
 * `captureMany` viene del CroquisCaptureProvider (muestra el overlay de progreso
 * SOLO para los que realmente hay que capturar).
 */
export async function getOrCaptureCroquis(
  specs: CroquisSpec[],
  legends: Record<string, CroquisLegend>,
  captureMany: (specs: CroquisSpec[]) => Promise<Record<string, string>>,
): Promise<Record<string, CroquisResult>> {
  const out: Record<string, CroquisResult> = {};
  const misses: { spec: CroquisSpec; hash: string }[] = [];
  for (const spec of specs) {
    const hash = croquisSpecHash(spec);
    const img = await getCachedCroquis(spec.id, hash);
    if (img) out[spec.id] = { img, legend: legends[spec.id] };
    else misses.push({ spec, hash });
  }
  if (misses.length > 0) {
    const imgs = await captureMany(misses.map(m => m.spec));
    for (const m of misses) {
      const img = imgs[m.spec.id];
      if (img) {
        out[m.spec.id] = { img, legend: legends[m.spec.id] };
        storeCroquis(m.spec.id, m.hash, img).catch(() => {});
      }
    }
  }
  return out;
}
