/**
 * projectAccess.ts — Autorización horizontal para rutas S3.
 *
 * Las rutas S3 (delete/list/sign/image) exigen sesión, pero eso NO basta:
 * un usuario logueado no debe poder leer/listar/BORRAR objetos de un proyecto
 * al que no tiene acceso. Las keys de S3 tienen el formato
 * `projects/<sanitizedProjectName>/...` (ver `lib/s3-upload.ts`).
 *
 * Acá derivamos el segmento de proyecto de la key/prefix y lo comparamos contra
 * el nombre saneado (MISMA función `sanitizeSegment` que usa el upload) de los
 * proyectos accesibles del usuario. La lista de proyectos accesibles se obtiene
 * con el server client AUTENTICADO de Supabase, cuyo RLS ya filtra `projects`
 * por acceso: `select id,name from projects` SOLO devuelve los proyectos del
 * usuario.
 */
import { createClient } from '@lib/supabase/server';
import { sanitizeSegment } from '@lib/s3-upload';

const PROJECTS_PREFIX = 'projects/';

/**
 * Extrae el segmento de proyecto de una key/prefix con formato
 * `projects/<seg>/...`. Devuelve null si no empieza por `projects/` o si el
 * segmento está vacío.
 */
export function projectSegmentFromKey(key: string): string | null {
  if (!key.startsWith(PROJECTS_PREFIX)) return null;
  const rest = key.slice(PROJECTS_PREFIX.length);
  const seg = rest.split('/')[0];
  if (!seg) return null;
  return seg;
}

/**
 * Trae los nombres saneados de los proyectos accesibles por el usuario actual.
 * Usa el server client autenticado (RLS filtra por acceso).
 */
export async function accessibleProjectSegments(): Promise<Set<string>> {
  const supabase = await createClient();
  const { data, error } = await supabase.from('projects').select('id, name');
  const segments = new Set<string>();
  if (error || !data) return segments;
  for (const row of data as Array<{ name: string | null }>) {
    if (row?.name) segments.add(sanitizeSegment(row.name));
  }
  return segments;
}

/**
 * ¿La key/prefix pertenece a un proyecto accesible por el usuario?
 *
 * - Si la key NO empieza con `projects/` (assets globales: logos, etc.) →
 *   se permite (allowGlobal=true por defecto). Las rutas de lectura aceptan
 *   estos assets para un usuario autenticado; pasá allowGlobal=false en rutas
 *   destructivas (s3-delete) para exigir `projects/<accesible>/...`.
 * - Si empieza con `projects/<seg>/` → el `<seg>` debe coincidir con el nombre
 *   saneado de un proyecto accesible.
 */
export async function keyBelongsToAccessibleProject(
  key: string,
  opts: { allowGlobal?: boolean } = {}
): Promise<boolean> {
  const { allowGlobal = true } = opts;
  const seg = projectSegmentFromKey(key);
  if (seg === null) return allowGlobal;
  const segments = await accessibleProjectSegments();
  return segments.has(seg);
}
