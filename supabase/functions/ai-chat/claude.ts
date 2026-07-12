/**
 * claude.ts — Loop de tool-use con la API de Anthropic (proveedor 'claude').
 *
 * Sin temperature/top_p/thinking: el mismo request sirve para los 3 tiers
 * (claude-haiku-4-5 / claude-sonnet-5 / claude-opus-4-8) sin ramas.
 */
import Anthropic from 'npm:@anthropic-ai/sdk@0.110.0';
import { type ChatArgs, type ChatResult, executeToolCall, type InterceptState, MAX_TOKENS, MAX_TOOL_ITERATIONS, mergeLinks } from './providers.ts';

export async function runClaudeChat(a: ChatArgs): Promise<ChatResult> {
  // maxRetries: el SDK reintenta solo ante 429/5xx con backoff (feedback QA:
  // "el error por alta demanda no puede haber").
  const anthropic = new Anthropic({ apiKey: a.apiKey, maxRetries: 3 });
  const anthropicTools = a.tools.map(t => ({
    name: t.name, description: t.description, input_schema: t.input_schema,
  }));

  // deno-lint-ignore no-explicit-any
  const messages: any[] = [
    ...a.history.map(m => ({ role: m.role, content: m.content })),
    { role: 'user', content: a.message },
  ];

  let totalIn = 0, totalOut = 0;
  let chartSvg: string | null = null;
  let action: unknown | null = null;
  let links: unknown[] | null = null;
  // deno-lint-ignore no-explicit-any
  let response: any = null;

  const interceptState: InterceptState = { charts: 0, actions: 0 };
  for (let iter = 0; iter <= MAX_TOOL_ITERATIONS; iter++) {
    try {
      response = await anthropic.messages.create({
        model: a.model,
        max_tokens: MAX_TOKENS,
        system: a.system,
        tools: anthropicTools,
        // Última vuelta permitida → sin tools: obliga respuesta en TEXTO
        // (mirror del AUTO→NONE de gemini.ts — sin esto, un stop_reason
        // 'tool_use' en la última iteración dejaría reply vacío).
        ...(iter === MAX_TOOL_ITERATIONS ? { tool_choice: { type: 'none' as const } } : {}),
        messages,
      });
    } catch (e) {
      // Tras agotar los reintentos del SDK: mensaje amable, no el error crudo.
      // deno-lint-ignore no-explicit-any
      const status = (e as any)?.status;
      if (status === 429 || (typeof status === 'number' && status >= 500)) {
        throw new Error('El modelo de IA está saturado en este momento. Vuelva a intentarlo en unos segundos.');
      }
      throw e;
    }
    totalIn += response.usage?.input_tokens ?? 0;
    totalOut += response.usage?.output_tokens ?? 0;

    if (response.stop_reason !== 'tool_use' || iter === MAX_TOOL_ITERATIONS) break;

    // Ejecutar TODAS las tool_use del turno y devolver los resultados juntos.
    // deno-lint-ignore no-explicit-any
    const toolResults: any[] = [];
    for (const block of response.content) {
      if (block.type !== 'tool_use') continue;
      const out = await executeToolCall(a.tools, block.name, block.input, interceptState);
      if (out.chartSvg) chartSvg = out.chartSvg; // si hay varios gana el último — la NOTA se lo dice al modelo
      if (out.action) action = out.action;
      links = mergeLinks(links, out.links);
      toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: out.resultStr, is_error: out.isError });
    }
    messages.push({ role: 'assistant', content: response.content });
    messages.push({ role: 'user', content: toolResults });
  }

  const reply = (response?.content ?? [])
    // deno-lint-ignore no-explicit-any
    .filter((b: any) => b.type === 'text')
    // deno-lint-ignore no-explicit-any
    .map((b: any) => b.text)
    .join('\n')
    .trim();

  return { reply, chartSvg, action, links, inputTokens: totalIn, outputTokens: totalOut };
}
