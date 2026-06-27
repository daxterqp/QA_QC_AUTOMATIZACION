/**
 * StampContext — carga COMPLETA y verificada de los datos de estampado de un proyecto
 * (logo + nombre del proyecto + comentario) ANTES de plotear sobre una foto de evidencia.
 *
 * Motivación: el logo del proyecto vive en S3; si una foto se estampaba mientras el logo
 * AÚN NO se había descargado (o nunca se cacheó), salía SIN la marca configurada — grave
 * para evidencia. Esta función garantiza que el logo esté descargado y verificado (tamaño
 * > 0) antes de devolver el contexto, y cachea la promesa por proyecto para que varias
 * fotos seguidas no re-descarguen. Si el logo no se pudo obtener (offline), NO cachea el
 * resultado → la siguiente foto reintenta la descarga.
 *
 * El logo se guarda en documentDirectory (PERSISTENTE), no en cacheDirectory (que el SO
 * puede vaciar), para que el estampado funcione aunque el usuario esté offline luego.
 */
import * as FileSystem from 'expo-file-system';
import { database } from '@db/index';
import { getProjectSettings, type StampSize } from '@services/ProjectSettings';
import { downloadFromS3, s3FileExists } from '@services/S3Service';

export interface StampContext {
  stampEnabled: boolean;
  /** URI local del logo (file://...), ya descargado y verificado. null si no aplica. */
  logoUri: string | null;
  comment: string | null;
  projectName: string | null;
  /** Si plotear las coordenadas GPS. */
  stampGps: boolean;
  /** Tamaño del estampado (letra + logo). */
  stampSize: StampSize;
}

const EMPTY: StampContext = { stampEnabled: false, logoUri: null, comment: null, projectName: null, stampGps: false, stampSize: 'normal' };

const inFlight = new Map<string, Promise<StampContext>>();

function logoLocalUri(projectId: string): string {
  return `${FileSystem.documentDirectory}project_logo_${projectId}.jpg`;
}

async function resolveLogo(projectId: string): Promise<string | null> {
  const localUri = logoLocalUri(projectId);
  const s3Key = `logos/project_${projectId}/logo.jpg`;
  // 1) Intentar SIEMPRE bajar el más reciente de S3 (la promesa se cachea por sesión, así
  //    que es 1 descarga por sesión). Esto evita servir un logo VIEJO si lo cambiaron en
  //    otro dispositivo (la key de S3 es fija; antes nos quedábamos con el archivo local).
  try {
    if (await s3FileExists(s3Key)) {
      await downloadFromS3(s3Key, localUri); // sobreescribe el local
      const dl = await FileSystem.getInfoAsync(localUri);
      if (dl.exists && ((dl as any).size ?? 1) > 0) return localUri;
    }
  } catch { /* offline o sin red → caemos al local */ }
  // 2) Fallback: archivo local previo (offline, o S3 sin logo pero ya teníamos uno).
  try {
    const info = await FileSystem.getInfoAsync(localUri);
    if (info.exists && ((info as any).size ?? 1) > 0) return localUri;
  } catch { /* sin local → null */ }
  return null;
}

/**
 * Devuelve el contexto de estampado COMPLETO (logo ya descargado). Pensado para
 * `await`-earse JUSTO antes de estampar, así nunca se plotea una foto sin la marca por
 * un problema de carga. Cachea la promesa por proyecto (salvo `force`).
 */
export async function loadStampContext(
  projectId: string | null | undefined,
  opts?: { force?: boolean },
): Promise<StampContext> {
  if (!projectId) return EMPTY;
  if (!opts?.force) {
    const cached = inFlight.get(projectId);
    if (cached) return cached;
  }

  const p = (async (): Promise<StampContext> => {
    const s = await getProjectSettings(projectId);
    let comment = s.stampComment;
    let projectName: string | null = null;
    try {
      const proj = await database.get<any>('projects').find(projectId);
      if (proj?.stampComment) comment = proj.stampComment;
      if (proj?.name) projectName = proj.name;
    } catch { /* fallback a settings locales */ }

    // Logo: si está activo el estampado y no hay uri local en settings, resolverlo
    // (cache persistente → S3). Verificado (existe + tamaño > 0).
    let logoUri = s.stampPhotoUri;
    if (s.stampEnabled && !logoUri) logoUri = await resolveLogo(projectId);

    return { stampEnabled: s.stampEnabled, logoUri, comment, projectName, stampGps: s.stampGps, stampSize: s.stampSize };
  })();

  inFlight.set(projectId, p);
  // Si falla, o si el logo quedó sin resolver (offline) estando el estampado activo,
  // NO conservar la promesa → la próxima foto reintenta la descarga del logo.
  p.then((ctx) => { if (ctx.stampEnabled && !ctx.logoUri) inFlight.delete(projectId); })
    .catch(() => inFlight.delete(projectId));
  return p;
}

/** Invalida el contexto cacheado (p. ej. tras cambiar el logo del proyecto). */
export function invalidateStampContext(projectId: string): void {
  inFlight.delete(projectId);
}
