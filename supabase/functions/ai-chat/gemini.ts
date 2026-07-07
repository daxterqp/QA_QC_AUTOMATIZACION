/**
 * gemini.ts — Loop de function calling con la API de Google Gemini (proveedor
 * 'gemini'), vía REST puro (fetch, sin SDK — nada que instalar en Deno).
 *
 * Gotchas críticos implementados (docs oficiales, verificados jul 2026):
 *  - El turno `model` con functionCall se reenvía VERBATIM en el historial
 *    (conserva `thoughtSignature` — los modelos 3.x devuelven 400 si falta).
 *  - Un `functionResponse` por CADA functionCall, en el MISMO turno user
 *    inmediatamente después, ecoando `id` y `name` (Gemini 3.5 es estricto:
 *    si se viola, responde VACÍO con finishReason STOP, sin error).
 *  - `additionalProperties` no está soportado en el Schema de parameters —
 *    se limpia recursivamente (minimum/maximum/enum SÍ están soportados).
 *  - Sin temperature/top_p (en 3.x degradan el razonamiento; usar defaults).
 *  - Sin maxOutputTokens: en modelos pensantes un tope bajo puede comerse el
 *    presupuesto en "thoughts" y devolver texto vacío; el largo lo gobierna
 *    el system prompt (3-6 líneas).
 */
import { type ChatArgs, type ChatResult, executeToolCall, MAX_TOOL_ITERATIONS } from './providers.ts';

const BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

// Reintentos ante saturación (feedback QA: "el error por alta demanda no puede
// haber"). 429 = rate limit, 503 = modelo sobrecargado, 500 = transitorio.
const RETRYABLE_STATUS = new Set([429, 500, 503]);
const RETRY_DELAYS_MS = [600, 1500];

async function fetchWithRetry(url: string, init: RequestInit): Promise<Response> {
  for (let i = 0; ; i++) {
    const resp = await fetch(url, init);
    if (resp.ok || !RETRYABLE_STATUS.has(resp.status) || i >= RETRY_DELAYS_MS.length) return resp;
    await new Promise(r => setTimeout(r, RETRY_DELAYS_MS[i]));
  }
}

/** Limpia keywords de JSON Schema que el Schema de Gemini no soporta. */
// deno-lint-ignore no-explicit-any
function toGeminiSchema(schema: any): any {
  if (Array.isArray(schema)) return schema.map(toGeminiSchema);
  if (!schema || typeof schema !== 'object') return schema;
  // deno-lint-ignore no-explicit-any
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(schema)) {
    if (k === 'additionalProperties' || k === '$schema' || k === 'oneOf' || k === 'allOf') continue;
    out[k] = toGeminiSchema(v);
  }
  return out;
}

// deno-lint-ignore no-explicit-any
type GPart = Record<string, any>;
interface GContent { role: 'user' | 'model'; parts: GPart[] }

export async function runGeminiChat(a: ChatArgs): Promise<ChatResult> {
  const url = `${BASE}/${a.model}:generateContent`;
  const functionDeclarations = a.tools.map(t => {
    const params = toGeminiSchema(t.input_schema);
    // Gemini RECHAZA `parameters` tipo OBJECT con properties vacío ("should be
    // non-empty for OBJECT type") — para tools sin argumentos se omite el campo.
    const hasProps = params?.properties && Object.keys(params.properties).length > 0;
    return {
      name: t.name,
      description: t.description,
      ...(hasProps ? { parameters: params } : {}),
    };
  });

  const contents: GContent[] = [
    ...a.history.map<GContent>(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    })),
    { role: 'user', parts: [{ text: a.message }] },
  ];

  let totalIn = 0, totalOut = 0;
  let chartSvg: string | null = null;
  let action: unknown | null = null;
  let reply = '';

  for (let iter = 0; iter <= MAX_TOOL_ITERATIONS; iter++) {
    const resp = await fetchWithRetry(url, {
      method: 'POST',
      headers: { 'x-goog-api-key': a.apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: a.system }] },
        contents,
        tools: [{ functionDeclarations }],
        // Última vuelta permitida → NONE: obliga respuesta en TEXTO (si quedara
        // un functionCall pendiente al cortar, el usuario recibiría vacío).
        toolConfig: { functionCallingConfig: { mode: iter === MAX_TOOL_ITERATIONS ? 'NONE' : 'AUTO' } },
      }),
    });
    if (!resp.ok) {
      if (RETRYABLE_STATUS.has(resp.status)) {
        throw new Error('El modelo de IA está saturado en este momento. Vuelva a intentarlo en unos segundos.');
      }
      const detail = await resp.text().catch(() => '');
      throw new Error(`Gemini ${resp.status}: ${detail.slice(0, 400)}`);
    }
    const data = await resp.json();
    totalIn += data?.usageMetadata?.promptTokenCount ?? 0;
    totalOut += (data?.usageMetadata?.candidatesTokenCount ?? 0) + (data?.usageMetadata?.thoughtsTokenCount ?? 0);

    const content = data?.candidates?.[0]?.content as GContent | undefined;
    const parts: GPart[] = content?.parts ?? [];
    const calls = parts.filter(p => p.functionCall);

    if (calls.length === 0 || iter === MAX_TOOL_ITERATIONS) {
      reply = parts.filter(p => typeof p.text === 'string').map(p => p.text).join('\n').trim();
      break;
    }

    // Turno model VERBATIM (conserva thoughtSignature) + un functionResponse
    // por cada functionCall, ecoando id y name.
    contents.push({ role: 'model', parts });
    const responses: GPart[] = [];
    for (const p of calls) {
      const call = p.functionCall;
      const out = await executeToolCall(a.tools, String(call.name ?? ''), call.args ?? {});
      if (out.chartSvg) chartSvg = out.chartSvg;
      if (out.action) action = out.action;
      // deno-lint-ignore no-explicit-any
      let parsed: any;
      try { parsed = JSON.parse(out.resultStr); } catch { parsed = out.resultStr; }
      responses.push({
        functionResponse: {
          ...(call.id ? { id: call.id } : {}),
          name: call.name,
          response: out.isError ? { error: parsed } : { result: parsed },
        },
      });
    }
    contents.push({ role: 'user', parts: responses });
  }

  return { reply, chartSvg, action, inputTokens: totalIn, outputTokens: totalOut };
}
