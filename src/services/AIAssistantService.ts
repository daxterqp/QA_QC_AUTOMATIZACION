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

export interface AIChatReply {
  reply: string;
  /** SVG del gráfico generado por la tool `generar_grafico` (Fase 2). */
  chartSvg?: string;
  usage?: { input_tokens: number; output_tokens: number; model: string };
}

export async function sendChatMessage(args: {
  projectId: string;
  message: string;
  history: AIChatTurn[];
  isFirstTurn: boolean;
}): Promise<AIChatReply> {
  const { data, error } = await supabase.functions.invoke('ai-chat', {
    body: {
      projectId: args.projectId,
      message: args.message,
      history: args.history.slice(-8),
      isFirstTurn: args.isFirstTurn,
    },
  });
  if (error) {
    // FunctionsHttpError trae el Response: extraer el mensaje del backend si existe.
    // deno/edge devuelve { error: '...' } con status != 2xx.
    try {
      const ctx = (error as { context?: Response }).context;
      if (ctx) {
        const body = await ctx.json();
        if (body?.error) throw new Error(String(body.error));
      }
    } catch (inner) {
      if (inner instanceof Error && inner.message) throw inner;
    }
    throw new Error('No se pudo contactar al asistente. Revise su conexión.');
  }
  if (!data?.reply) throw new Error(String(data?.error ?? 'Respuesta vacía del asistente.'));
  return data as AIChatReply;
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
    try {
      const ctx = (error as { context?: Response }).context;
      if (ctx) {
        const body = await ctx.json();
        if (body?.error) throw new Error(String(body.error));
      }
    } catch (inner) {
      if (inner instanceof Error && inner.message) throw inner;
    }
    throw new Error('No se pudo generar la voz. Revise su conexión.');
  }
  const b64 = data?.audioBase64;
  if (typeof b64 !== 'string' || !b64) throw new Error(String(data?.error ?? 'Audio vacío.'));
  const uri = `${FileSystem.cacheDirectory}ai-tts-${Date.now()}.mp3`;
  await FileSystem.writeAsStringAsync(uri, b64, { encoding: FileSystem.EncodingType.Base64 });
  return uri;
}

// ── Historial de sesiones (LOCAL, por proyecto) ──────────────────────────────

export interface AIChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  /** SVG del gráfico embebido (Fase 2). */
  chartSvg?: string;
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
const keyFor = (projectId: string) => `ai_chat_sessions:${projectId}`;

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
    // Poda: las más recientes primero, tope MAX_SESSIONS.
    const next = [session, ...rest].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, MAX_SESSIONS);
    await AsyncStorage.setItem(keyFor(projectId), JSON.stringify(next));
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
