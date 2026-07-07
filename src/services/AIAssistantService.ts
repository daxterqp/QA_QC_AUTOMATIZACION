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
import * as FileSystem from 'expo-file-system';
import { supabase } from '@config/supabase';

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
      templateId?: string | null; sectorId?: string | null; etiqueta: string;
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
  const preferencias = await loadPrefs(args.projectId).catch(() => [] as string[]);
  const { data, error } = await supabase.functions.invoke('ai-chat', {
    body: {
      projectId: args.projectId,
      message: args.message,
      history: args.history.slice(-8),
      isFirstTurn: args.isFirstTurn,
      ...(preferencias.length ? { preferencias } : {}),
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
    // Presupuesto de bytes: podar sesiones antiguas hasta caber.
    while (payload.length > MAX_STORE_BYTES && next.length > 1) {
      next = next.slice(0, next.length - 1);
      payload = JSON.stringify(next);
    }
    if (payload.length > MAX_STORE_BYTES && next.length === 1) {
      // Sesión única gigante: despojar los gráficos salvo los 5 más recientes.
      const only = next[0];
      const msgs = only.messages.map((m, i, arr) =>
        m.chartSvg && i < arr.length - 5 ? { ...m, chartSvg: undefined } : m);
      next = [{ ...only, messages: msgs }];
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
