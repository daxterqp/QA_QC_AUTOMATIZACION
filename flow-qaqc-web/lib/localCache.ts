/**
 * localCache.ts — Caché local de archivos S3 (server-side, desktop/Next local).
 *
 * Cuando se abre una foto/plano/ortofoto, la ruta `s3-image` baja el objeto de S3
 * y lo deja en disco bajo `LOCAL_PHOTO_CACHE` (por defecto D:\Flow-QAQC) con la
 * MISMA estructura que su key de S3 (menos el prefijo `projects/`). Así el equipo
 * no re-descarga lo ya visto.
 *
 * Este módulo centraliza ese mapeo (antes vivía suelto en `s3-image/route.ts`) para
 * que tanto la ruta de imágenes como el export de proyecto (projectBackup) usen UNA
 * sola fuente — sin divergencias y con el mismo guard anti path-traversal.
 */
import fs from 'fs';
import { mkdir, writeFile } from 'fs/promises';
import path from 'path';

export const LOCAL_CACHE_BASE = process.env.LOCAL_PHOTO_CACHE ?? 'D:\\Flow-QAQC';

/** ¿La key tiene byte nulo o caracteres de control (U+0000–U+001F)?
 *  Romperían fs.existsSync con un 500; hay que rechazarlos. */
function hasControlChars(s: string): boolean {
  for (let i = 0; i < s.length; i++) {
    if (s.charCodeAt(i) < 0x20) return true;
  }
  return false;
}

/**
 * Mapea una key de S3 → ruta local. Devuelve null si la key es inválida
 * (contiene `..`, byte nulo/control, o tras resolver escapa de LOCAL_CACHE_BASE).
 * El prefijo `projects/` se omite (las keys de proyecto cuelgan directo de la base).
 */
export function s3KeyToLocalPath(s3Key: string): string | null {
  if (s3Key.includes('..')) return null;
  if (hasControlChars(s3Key)) return null;
  const relative = s3Key.startsWith('projects/') ? s3Key.slice('projects/'.length) : s3Key;
  const resolved = path.resolve(LOCAL_CACHE_BASE, ...relative.split('/'));
  const base = path.resolve(LOCAL_CACHE_BASE);
  if (resolved !== base && !resolved.startsWith(base + path.sep)) return null;
  return resolved;
}

/**
 * Lee del caché local los bytes de una key SI existe y su tamaño coincide con el
 * esperado (el que reporta el listado de S3). Devuelve null si no está o difiere
 * (cortado/desactualizado) → el llamador debe bajarlo de S3. El chequeo de tamaño
 * es la garantía de integridad: evita meter un archivo viejo/parcial en el respaldo.
 */
export function readLocalIfFresh(s3Key: string, expectedSize: number): Uint8Array | null {
  const local = s3KeyToLocalPath(s3Key);
  if (!local) return null;
  try {
    const st = fs.statSync(local);
    if (st.size !== expectedSize) return null;
    return new Uint8Array(fs.readFileSync(local));
  } catch {
    return null;
  }
}

/** Write-through: guarda en el caché local lo que se acaba de bajar de S3
 *  (para abaratar futuros exports). Best-effort: si falla, no rompe nada. */
export async function writeLocalCache(s3Key: string, bytes: Uint8Array): Promise<void> {
  const local = s3KeyToLocalPath(s3Key);
  if (!local) return;
  try {
    await mkdir(path.dirname(local), { recursive: true });
    await writeFile(local, bytes);
  } catch {
    /* best-effort */
  }
}
