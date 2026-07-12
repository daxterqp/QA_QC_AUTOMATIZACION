/**
 * providers.ts — Contrato común de los proveedores de IA del asistente
 * (Claude / Gemini) + ejecutor de tools compartido con intercepción del gráfico.
 *
 * El proveedor y el nivel se resuelven SERVER-SIDE desde feature_flags del
 * proyecto (tamper-proof): el celular solo guarda la preferencia, jamás decide
 * el modelo real ni toca las API keys.
 */
import { ACTION_KEY, CHART_SVG_KEY, LINKS_KEY, type ToolDef } from './tools.ts';

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
  /** Ensayos listados como chips tocables (abren el ensayo directo). */
  links: unknown[] | null;
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
  /** Links de ensayos interceptados de listar_ensayos (no viajan al modelo). */
  links: unknown[] | null;
}

/** Estado COMPARTIDO del turno entre todas las tool calls: el chat pinta UN
 *  gráfico y UNA tarjeta por respuesta — si el modelo genera dos, el segundo
 *  reemplaza al primero y la nota devuelta debe decir la VERDAD (antes ambas
 *  llamadas recibían "ya se muestra" y el modelo narraba dos gráficos). */
export interface InterceptState { charts: number; actions: number }

/** Une listas de links de varias llamadas (dedup por protocolId, tope 30). */
export function mergeLinks(prev: unknown[] | null, next: unknown[] | null): unknown[] | null {
  if (!next?.length) return prev;
  if (!prev?.length) return next.slice(0, 30);
  // deno-lint-ignore no-explicit-any
  const idOf = (l: unknown) => String((l as any)?.protocolId ?? '');
  const seen = new Set(prev.map(idOf));
  const merged = [...prev];
  for (const l of next) {
    const id = idOf(l);
    if (!id || !seen.has(id)) { seen.add(id); merged.push(l); }
  }
  return merged.slice(0, 30);
}

/** Ejecuta una tool por nombre, intercepta SVG/acción y acota el tamaño del
 *  resultado. Compartido por los loops de Claude y Gemini. */
export async function executeToolCall(tools: ToolDef[], name: string, input: unknown, state?: InterceptState): Promise<ToolExecOutcome> {
  const def = tools.find(t => t.name === name);
  if (!def) {
    return { resultStr: JSON.stringify({ error: `herramienta desconocida: ${name}` }), isError: true, chartSvg: null, action: null, links: null };
  }
  let chartSvg: string | null = null;
  let action: unknown | null = null;
  let links: unknown[] | null = null;
  try {
    let out = await def.execute(input ?? {});
    // Genérico: CUALQUIER tool puede emitir un gráfico (generar_grafico,
    // comparar_sectores, futuras) — la clave se intercepta igual.
    if (out && typeof out === 'object' && CHART_SVG_KEY in out) {
      // deno-lint-ignore no-explicit-any
      const { [CHART_SVG_KEY]: svg, ...rest } = out as any;
      if (typeof svg === 'string' && svg) {
        chartSvg = svg;
        const reemplaza = (state?.charts ?? 0) > 0;
        if (state) state.charts++;
        out = {
          ...rest,
          nota: reemplaza
            ? 'ATENCIÓN: el chat muestra UN solo gráfico por respuesta y este REEMPLAZÓ al anterior (el anterior NO se ve). Comenta SOLO este gráfico y, si el usuario pidió varios, dile que los pida de a uno.'
            : 'El gráfico ya se muestra en el chat: NO lo describas visualmente, solo comenta las cifras.',
        };
      } else {
        // SVG vacío (datos/fechas inválidas): el modelo NO debe creer que hay gráfico.
        out = { ...rest, grafico_generado: false, nota: 'NO se pudo generar el gráfico (datos insuficientes o fechas inválidas): no digas que se muestra un gráfico; comenta solo las cifras.' };
      }
    }
    if (out && typeof out === 'object' && ACTION_KEY in out) {
      // deno-lint-ignore no-explicit-any
      const { [ACTION_KEY]: act, ...rest } = out as any;
      if (act && typeof act === 'object') {
        action = act;
        const reemplaza = (state?.actions ?? 0) > 0;
        if (state) state.actions++;
        out = reemplaza
          ? { ...rest, nota: 'ATENCIÓN: el chat muestra UNA sola tarjeta por respuesta y esta REEMPLAZÓ a la anterior. Propón las acciones DE A UNA (la anterior ya no existe).' }
          : rest;
      } else {
        out = rest;
      }
    }
    if (out && typeof out === 'object' && LINKS_KEY in out) {
      // deno-lint-ignore no-explicit-any
      const { [LINKS_KEY]: lk, ...rest } = out as any;
      if (Array.isArray(lk) && lk.length > 0) links = lk;
      out = rest;
    }
    let resultStr = JSON.stringify(out ?? null);
    // Defensa de contexto: un resultado gigante se trunca (el modelo puede re-pedir acotado).
    if (resultStr.length > 30000) resultStr = resultStr.slice(0, 30000) + '…(truncado, acota el rango)';
    return { resultStr, isError: false, chartSvg, action, links };
  } catch (e) {
    return { resultStr: JSON.stringify({ error: String((e as Error)?.message ?? e) }), isError: true, chartSvg: null, action: null, links: null };
  }
}
