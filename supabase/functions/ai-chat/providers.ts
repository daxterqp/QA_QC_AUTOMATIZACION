/**
 * providers.ts — Contrato común de los proveedores de IA del asistente
 * (Claude / Gemini) + ejecutor de tools compartido con intercepción del gráfico.
 *
 * El proveedor y el nivel se resuelven SERVER-SIDE desde feature_flags del
 * proyecto (tamper-proof): el celular solo guarda la preferencia, jamás decide
 * el modelo real ni toca las API keys.
 */
import { ACTION_KEY, CHART_SVG_KEY, CHART_TOOL_NAME, type ToolDef } from './tools.ts';

export interface ChatArgs {
  apiKey: string;
  model: string;
  system: string;
  /** Historial saneado (primer mensaje garantizado 'user'). */
  history: { role: 'user' | 'assistant'; content: string }[];
  message: string;
  tools: ToolDef[];
}

export interface ChatResult {
  reply: string;
  chartSvg: string | null;
  /** Acción propuesta (tarjeta de confirmación) — el móvil la ejecuta al confirmar. */
  action: unknown | null;
  inputTokens: number;
  outputTokens: number;
}

export const MAX_TOOL_ITERATIONS = 5;
export const MAX_TOKENS = 700;

export interface ToolExecOutcome {
  /** JSON string listo para devolver al modelo (ya truncado). */
  resultStr: string;
  isError: boolean;
  /** SVG interceptado si la tool fue generar_grafico (no viaja al modelo). */
  chartSvg: string | null;
  /** Acción interceptada si la tool fue preparar_accion (no viaja al modelo). */
  action: unknown | null;
}

/** Ejecuta una tool por nombre, intercepta SVG/acción y acota el tamaño del
 *  resultado. Compartido por los loops de Claude y Gemini. */
export async function executeToolCall(tools: ToolDef[], name: string, input: unknown): Promise<ToolExecOutcome> {
  const def = tools.find(t => t.name === name);
  if (!def) {
    return { resultStr: JSON.stringify({ error: `herramienta desconocida: ${name}` }), isError: true, chartSvg: null, action: null };
  }
  let chartSvg: string | null = null;
  let action: unknown | null = null;
  try {
    let out = await def.execute(input ?? {});
    if (def.name === CHART_TOOL_NAME && out && typeof out === 'object' && CHART_SVG_KEY in out) {
      // deno-lint-ignore no-explicit-any
      const { [CHART_SVG_KEY]: svg, ...rest } = out as any;
      if (typeof svg === 'string' && svg) chartSvg = svg;
      out = { ...rest, nota: 'El gráfico ya se muestra en el chat: NO lo describas visualmente, solo comenta las cifras del resumen.' };
    }
    if (out && typeof out === 'object' && ACTION_KEY in out) {
      // deno-lint-ignore no-explicit-any
      const { [ACTION_KEY]: act, ...rest } = out as any;
      if (act && typeof act === 'object') action = act;
      out = rest;
    }
    let resultStr = JSON.stringify(out ?? null);
    // Defensa de contexto: un resultado gigante se trunca (el modelo puede re-pedir acotado).
    if (resultStr.length > 30000) resultStr = resultStr.slice(0, 30000) + '…(truncado, acota el rango)';
    return { resultStr, isError: false, chartSvg, action };
  } catch (e) {
    return { resultStr: JSON.stringify({ error: String((e as Error)?.message ?? e) }), isError: true, chartSvg: null, action: null };
  }
}
