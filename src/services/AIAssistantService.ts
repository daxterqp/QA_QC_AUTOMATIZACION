/**
 * AIAssistantService — Cliente móvil del Asistente de IA (Edge Function `ai-chat`).
 *
 * `supabase.functions.invoke` adjunta SOLO el JWT del usuario — las API keys de
 * IA viven en secretos de Supabase, jamás en este bundle. El modelo lo decide el
 * servidor según `ai_model_tier` del proyecto (selector solo-Creador).
 *
 * HISTORIAL DE SESIONES: 100% LOCAL (AsyncStorage por proyecto) — decisión del
 * usuario para no gastar almacenamiento en servidor. Tope de sesiones con poda
 * de la más antigua.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import * as Location from 'expo-location';
import { supabase } from '@config/supabase';

// ── Ubicación GPS del usuario (v84) ──────────────────────────────────────────
// Viaja con cada request: el server la usa (tool ubicacion_usuario) para saber
// en qué sector está parado el usuario cuando pide algo "aquí"/"donde estoy".
// Best-effort SIEMPRE: sin permiso, sin fix o timeout → null y el chat sigue.

interface UserLocationPayload { lat: number; lng: number; precisionM: number | null }

let locCache: { at: number; loc: UserLocationPayload | null } | null = null;

/** Llamar al ENTRAR al chat (no durante el envío): pide el permiso si hace
 *  falta y precalienta un fix en el cache. Nunca lanza. */
export async function warmUpAILocation(): Promise<void> {
  try {
    let perm = await Location.getForegroundPermissionsAsync();
    if (!perm.granted && perm.canAskAgain) perm = await Location.requestForegroundPermissionsAsync();
    if (perm.granted) await getLocationSafe();
  } catch { /* best-effort */ }
}

async function getLocationSafe(): Promise<UserLocationPayload | null> {
  // Cache 90s: no re-fijar GPS en cada mensaje de la conversación.
  if (locCache && Date.now() - locCache.at < 90_000) return locCache.loc;
  try {
    // SOLO consulta el permiso — pedirlo aquí bloquearía el envío del mensaje
    // hasta que el usuario responda el diálogo (warmUpAILocation lo pide).
    const perm = await Location.getForegroundPermissionsAsync();
    if (!perm.granted) {
      locCache = { at: Date.now(), loc: null };
      return null;
    }
    // Último fix conocido (instantáneo) si es fresco; si no, fix real acotado
    // a 5 s — la respuesta del chat no puede quedar rehén del GPS.
    const known = await Location.getLastKnownPositionAsync({ maxAge: 120_000 }).catch(() => null);
    const pos = known ?? await Promise.race([
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
      new Promise<null>(resolve => setTimeout(() => resolve(null), 5000)),
    ]);
    const loc = pos
      ? {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          precisionM: typeof pos.coords.accuracy === 'number' ? Math.round(pos.coords.accuracy) : null,
        }
      : null;
    locCache = { at: Date.now(), loc };
    return loc;
  } catch {
    locCache = { at: Date.now(), loc: null };
    return null;
  }
}

// ── Chat ─────────────────────────────────────────────────────────────────────

export interface AIChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

/** Acción propuesta por Flo (tarjeta de confirmación en el chat). El backend
 *  la prepara con la tool `preparar_accion`; el móvil la EJECUTA solo cuando el
 *  usuario toca el botón — Flo nunca ejecuta nada directamente. */
export type AIAction =
  | { kind: 'abrir_pantalla'; destino: string; etiqueta: string }
  | {
      kind: 'crear_ensayo'; templateId: string; templateNombre: string;
      templateCodigo?: string | null; sectorId?: string | null;
      sectorNombre?: string | null; fecha?: string | null; etiqueta: string;
    }
  | { kind: 'crear_muestra'; etiqueta: string }
  | { kind: 'abrir_ensayo'; protocolId: string; codigo: string | null; estado?: string | null; etiqueta: string }
  | { kind: 'crear_nc'; protocolId: string; codigo: string | null; descripcion: string; etiqueta: string }
  | {
      kind: 'abrir_dossier'; desde?: string | null; hasta?: string | null;
      templateId?: string | null; sectorId?: string | null;
      estado?: string | null; etiqueta: string;
    }
  /** Silenciosa: el móvil la guarda localmente SIN tarjeta (no es destructiva). */
  | { kind: 'recordar_preferencia'; texto: string; etiqueta: string };

/** Ensayo listado por FLOW como chip tocable (abre el ensayo directo). */
export interface AIEnsayoLink {
  codigo: string | null;
  protocolId: string;
  estado?: string | null;
}

export interface AIChatReply {
  reply: string;
  /** SVG del gráfico generado por la tool `generar_grafico` (Fase 2). */
  chartSvg?: string;
  /** Acción propuesta (tarjeta de confirmación). */
  action?: AIAction;
  /** Ensayos listados (chips tocables). */
  links?: AIEnsayoLink[];
  usage?: { input_tokens: number; output_tokens: number; model: string };
}

export async function sendChatMessage(args: {
  projectId: string;
  message: string;
  history: AIChatTurn[];
  isFirstTurn: boolean;
}): Promise<AIChatReply> {
  // Preferencias LOCALES del usuario (E3): viajan en cada request y el server
  // las inyecta al system prompt ("siempre por sector", etc.).
  const [preferencias, ubicacion] = await Promise.all([
    loadPrefs(args.projectId).catch(() => [] as string[]),
    getLocationSafe(),
  ]);
  const { data, error } = await supabase.functions.invoke('ai-chat', {
    body: {
      projectId: args.projectId,
      message: args.message,
      history: args.history.slice(-8),
      isFirstTurn: args.isFirstTurn,
      ...(preferencias.length ? { preferencias } : {}),
      ...(ubicacion ? { ubicacion } : {}),
    },
  });
  if (error) {
    throw new Error(await extractServerError(error, 'No se pudo contactar al asistente. Revise su conexión.'));
  }
  if (!data?.reply) throw new Error(String(data?.error ?? 'Respuesta vacía del asistente.'));
  return data as AIChatReply;
}

/** FunctionsHttpError trae el Response del backend ({ error: '...' }): extraer
 *  el mensaje si existe; si el cuerpo no es JSON, caer al mensaje genérico. */
async function extractServerError(error: unknown, fallback: string): Promise<string> {
  try {
    const ctx = (error as { context?: Response }).context;
    if (ctx) {
      const body = await ctx.json();
      if (body?.error) return String(body.error);
    }
  } catch { /* cuerpo no-JSON: usar fallback */ }
  return fallback;
}

// ── Narración por voz (Fase 3: Edge Function `ai-tts` → ElevenLabs) ─────────

/**
 * Pide la narración de un texto y devuelve un file:// URI local (MP3 en cache)
 * listo para expo-audio. El audio NO se persiste entre sesiones: es cache.
 */
export async function requestNarration(projectId: string, text: string): Promise<string> {
  const { data, error } = await supabase.functions.invoke('ai-tts', {
    body: { projectId, text },
  });
  if (error) {
    throw new Error(await extractServerError(error, 'No se pudo generar la voz. Revise su conexión.'));
  }
  const b64 = data?.audioBase64;
  if (typeof b64 !== 'string' || !b64) throw new Error(String(data?.error ?? 'Audio vacío.'));
  const uri = `${FileSystem.cacheDirectory}ai-tts-${Date.now()}.mp3`;
  await FileSystem.writeAsStringAsync(uri, b64, { encoding: FileSystem.EncodingType.Base64 });
  return uri;
}

/** Borra el MP3 temporal de una narración ya reproducida (best-effort). */
export async function deleteNarrationFile(uri: string): Promise<void> {
  try { await FileSystem.deleteAsync(uri, { idempotent: true }); } catch { /* cache: el SO purga */ }
}

// ── Muletillas del MODO VOZ (v78) ────────────────────────────────────────────
// Mientras FLOW "piensa" (el LLM responde), se reproduce una muletilla natural
// para que no haya tiempos muertos. Se generan UNA vez con el TTS y quedan
// cacheadas en documentDirectory (no en cache: el SO no debe purgarlas).

const FILLER_TEXTS = [
  'Claro, un segundo… lo estoy revisando en los datos de la obra.',
  'Déjeme verificarlo, un momento por favor.',
  'Entendido, ya lo estoy buscando…',
];

/** MP3 local de una muletilla al azar (null si no hay TTS disponible). */
export async function getFillerAudioUri(projectId: string): Promise<string | null> {
  const idx = Math.floor(Math.random() * FILLER_TEXTS.length);
  const path = `${FileSystem.documentDirectory}flow_filler_${idx}.mp3`;
  try {
    const info = await FileSystem.getInfoAsync(path);
    if (info.exists && (info.size ?? 0) > 1024) return path;
  } catch { /* generar abajo */ }
  try {
    const tmp = await requestNarration(projectId, FILLER_TEXTS[idx]);
    await FileSystem.copyAsync({ from: tmp, to: path });
    deleteNarrationFile(tmp);
    return path;
  } catch {
    return null;
  }
}

// ── Preferencias del usuario (LOCALES, por proyecto) ─────────────────────────
// FLOW las "recuerda" vía la tool recordar_preferencia: el server la intercepta
// como acción silenciosa, el móvil la guarda aquí y la reenvía en cada request.

const MAX_PREFS = 10;
const prefsKey = (projectId: string) => `ai_prefs:${projectId}`;

// Serialización de escrituras (add/remove son read-modify-write: dos llamadas
// concurrentes perderían una de las dos sin este candado).
let prefsLock: Promise<unknown> = Promise.resolve();
function withPrefsLock<T>(fn: () => Promise<T>): Promise<T> {
  const p = prefsLock.then(fn);
  prefsLock = p.catch(() => {});
  return p;
}

export async function loadPrefs(projectId: string): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(prefsKey(projectId));
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr.filter((s): s is string => typeof s === 'string').slice(0, MAX_PREFS) : [];
  } catch {
    return [];
  }
}

export function addPref(projectId: string, texto: string): Promise<string[]> {
  return withPrefsLock(async () => {
    const clean = texto.trim().slice(0, 140);
    if (!clean) return loadPrefs(projectId);
    const prev = await loadPrefs(projectId);
    // Dedup (case-insensitive) + la más nueva al final; tope con poda de la más vieja.
    const next = [...prev.filter(p => p.toLowerCase() !== clean.toLowerCase()), clean].slice(-MAX_PREFS);
    await AsyncStorage.setItem(prefsKey(projectId), JSON.stringify(next)).catch(() => {});
    return next;
  });
}

export function removePref(projectId: string, texto: string): Promise<string[]> {
  return withPrefsLock(async () => {
    const prev = await loadPrefs(projectId);
    const next = prev.filter(p => p !== texto);
    await AsyncStorage.setItem(prefsKey(projectId), JSON.stringify(next)).catch(() => {});
    return next;
  });
}

// ── Historial de sesiones (LOCAL, por proyecto) ──────────────────────────────

export interface AIChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  /** SVG del gráfico embebido (Fase 2). */
  chartSvg?: string;
  /** Tarjeta de acción propuesta (se ejecuta al confirmar con el botón). */
  action?: AIAction;
  /** true una vez ejecutada — la tarjeta pasa a "Hecho" (one-shot). */
  actionDone?: boolean;
  /** Ensayos listados como chips tocables (abren el ensayo). */
  links?: AIEnsayoLink[];
  at: number; // epoch ms
}

export interface AIChatSession {
  id: string;
  /** Título = primer mensaje del usuario, truncado. */
  titulo: string;
  createdAt: number;
  updatedAt: number;
  messages: AIChatMessage[];
}

const MAX_SESSIONS = 20;
/** Tope de mensajes persistidos por sesión (en memoria no se limita). */
const MAX_MSGS_PER_SESSION = 200;
/** Presupuesto de bytes de la clave completa: Android revienta AsyncStorage
 *  (CursorWindow ~2 MB por fila) y el catch de load devolvería [] — un
 *  siguiente save consolidaría el borrado de TODO el historial. */
const MAX_STORE_BYTES = 1_500_000;
const keyFor = (projectId: string) => `ai_chat_sessions:${projectId}`;

/** Quita chartSvg de los mensajes dejando solo los últimos `keep` CON gráfico
 *  (contar mensajes en vez de gráficos despojaba todo si el final era texto). */
function stripCharts(s: AIChatSession, keep: number): AIChatSession {
  let seen = 0;
  const msgs = [...s.messages].reverse().map(m => {
    if (!m.chartSvg) return m;
    seen++;
    return seen <= keep ? m : { ...m, chartSvg: undefined };
  }).reverse();
  return { ...s, messages: msgs };
}

const slimSession = (s: AIChatSession): AIChatSession =>
  s.messages.length > MAX_MSGS_PER_SESSION
    ? { ...s, messages: s.messages.slice(-MAX_MSGS_PER_SESSION) }
    : s;

export async function loadSessions(projectId: string): Promise<AIChatSession[]> {
  try {
    const raw = await AsyncStorage.getItem(keyFor(projectId));
    if (!raw) return [];
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return (arr as AIChatSession[]).sort((a, b) => b.updatedAt - a.updatedAt);
  } catch {
    return [];
  }
}

export async function saveSession(projectId: string, session: AIChatSession): Promise<void> {
  try {
    const all = await loadSessions(projectId);
    const rest = all.filter(s => s.id !== session.id);
    // Poda: las más recientes primero, tope MAX_SESSIONS y tope de mensajes.
    let next = [session, ...rest]
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, MAX_SESSIONS)
      .map(slimSession);
    let payload = JSON.stringify(next);
    // Presupuesto de bytes, del recorte más barato al más caro:
    // 1) Despojar los GRÁFICOS de las sesiones antiguas (texto intacto) — un
    //    SVG pesa 25-30KB; botar la sesión entera era perder conversaciones.
    if (payload.length > MAX_STORE_BYTES && next.length > 1) {
      next = next.map((s2, i) => i === 0 ? s2 : stripCharts(s2, 0));
      payload = JSON.stringify(next);
    }
    // 2) Si aún no cabe: podar sesiones antiguas enteras.
    while (payload.length > MAX_STORE_BYTES && next.length > 1) {
      next = next.slice(0, next.length - 1);
      payload = JSON.stringify(next);
    }
    // 3) Sesión única gigante: conservar solo los últimos 5 gráficos.
    if (payload.length > MAX_STORE_BYTES && next.length === 1) {
      next = [stripCharts(next[0], 5)];
      payload = JSON.stringify(next);
    }
    await AsyncStorage.setItem(keyFor(projectId), payload);
  } catch {
    /* best-effort: el chat sigue funcionando aunque no persista */
  }
}

export async function deleteSession(projectId: string, sessionId: string): Promise<void> {
  try {
    const all = await loadSessions(projectId);
    await AsyncStorage.setItem(keyFor(projectId), JSON.stringify(all.filter(s => s.id !== sessionId)));
  } catch { /* ignore */ }
}

export function newSessionId(): string {
  return `ai-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function sessionTitleFrom(firstUserMessage: string): string {
  const t = firstUserMessage.trim().replace(/\s+/g, ' ');
  return t.length > 46 ? `${t.slice(0, 46)}…` : t;
}
