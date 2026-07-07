# HANDOFF — Flo v2: estado final (2026-07-06)

TODO lo planificado quedó **code-completo, committeado y desplegado** (`ai-chat`
redesplegada con acciones + barras). Este archivo queda como referencia de
arquitectura; el detalle vivo está en la memoria del proyecto.

## Qué quedó construido
1. **Datos frescos**: conteos/listas/estados desde `protocols` (misma fuente que
   la web); valores numéricos desde `protocol_summary_rows` con verificación de
   cobertura + advertencia; auto-reparación al abrir el chat
   (`repairCloudSummaryOnce`); aprobaciones desde Auditoría ya actualizan la
   fila resumen.
2. **Multi-proveedor**: `ai_provider` claude|gemini por proyecto (selector solo
   Creador), `gemini.ts` REST con function calling (thoughtSignature verbatim,
   1:1 con id, AUTO→NONE al cortar). Secreto `GEMINI_API_KEY` pendiente del
   usuario si quiere Gemini.
3. **Manos**: tool `preparar_accion` → `response.action` → tarjeta de
   confirmación en el chat (one-shot). `crear_ensayo` usa `createInstances`
   (motor oficial) y abre la ficha; `abrir_pantalla` con 12 destinos;
   `crear_muestra` lleva al registro.
4. **Burbuja flotante** (`AIQuickBubble`): overlay global, arrastrable con snap
   y posición persistida, gateada por `module_ai_assistant` + `ai_quick_button`
   (default ON, toggle en configuración).
5. **Flo visual**: bienvenida con agua GL (`WaterRipplesGL` + `bigWave`,
   fallback claro sin GL), avatar gota con pulso, insight del día local.
6. **Puente de gráficos**: `chart.ts` → `renderChartSvg('linea'|'barras')`; la
   tool `generar_grafico` acepta `estilo`. REGLA: al agregar un tipo nuevo,
   mantener paridad con `flow-qaqc-web/lib/reports/chart.ts` (mismo spec
   kind+title+points) para que sirva a reportes Y a Flo.

## Pendientes conocidos
- Probar en dispositivo (solo reload de Metro; el rebuild ya incluyó expo-audio).
- `GEMINI_API_KEY` (aistudio.google.com → Get API key →
  `npx supabase secrets set GEMINI_API_KEY=...`).
- **Mascota virtual de Flo**: fase posterior (decisión del usuario). Base ya
  lista: identidad de gota + motor de agua reutilizable.
- Ideas de personalidad no implementadas aún (brainstorm): saludo por hora con
  variaciones, memoria local de preferencias del usuario (ej. "prefiere ver por
  sector"), narración automática opcional del insight al abrir, ondas al ritmo
  de la voz (drop() periódico durante TTS).
