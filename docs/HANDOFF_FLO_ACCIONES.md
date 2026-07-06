# HANDOFF — Flo: acciones + visual (retomar aquí)

Estado al corte (sesión 2026-07-06). Todo lo listado como HECHO está committeado.

## HECHO (committeado, tsc 0)
- **Lote 1 desplegado** (`ai-chat` redesplegada): datos frescos desde `protocols`,
  cobertura de valores, switch Claude/Gemini (`ai_provider` + selector config +
  `gemini.ts` REST), voz (earpiece fix + isLoaded + timeout), retomar última
  sesión, negritas, personalidad Flo, fixes del review (cobertura exacta, token
  voz re-validado, guards de repair, Gemini props vacías, tier hasOwnProperty,
  sin_fecha).
- **Burbuja flotante**: `src/components/AIQuickBubble.tsx` (arrastrable, snap,
  posición persistida `ai_bubble_pos_v1`, gateada por `module_ai_assistant` +
  `ai_quick_button !== false`); montada en `AppNavigator` (activeRoute vía
  onReady/onStateChange); flag `ai_quick_button` default true (móvil+web) +
  toggle "Botón rápido de Flo" en ProjectConfigScreen.
- **Acciones (backend COMPLETO, sin desplegar aún)**: tool `preparar_accion` en
  `tools.ts` (abrir_pantalla con DESTINOS/DESTINO_LABEL, crear_ensayo con
  resolución de tipo/sector + fecha validada, crear_muestra). `ACTION_KEY =
  '__action'` interceptado en `providers.executeToolCall` → `ChatResult.action`
  → `claude.ts`/`gemini.ts` lo recogen → `index.ts` lo devuelve como `action`.

## PENDIENTE (en orden)

### 1. Móvil: tarjeta de acción en el chat (AIChatScreen + servicio)
- `AIAssistantService.ts`: agregar a `AIChatReply` el campo `action?: AIAction` y
  a `AIChatMessage` `action?: AIAction; actionDone?: boolean`. Tipo:
  ```ts
  export type AIAction =
    | { kind: 'abrir_pantalla'; destino: string; etiqueta: string }
    | { kind: 'crear_ensayo'; templateId: string; templateNombre: string;
        templateCodigo?: string | null; sectorId?: string | null;
        sectorNombre?: string | null; fecha?: string | null; etiqueta: string }
    | { kind: 'crear_muestra'; etiqueta: string };
  ```
- `AIChatScreen.tsx`: al recibir `res.action`, guardarlo en el aiMsg. Render de
  TARJETA bajo el texto de la burbuja: icono por kind (navigate/flask/eyedropper)
  + `etiqueta` + botón primario ("Abrir" / "Crear"); tras ejecutar, marcar
  `actionDone: true` (persistir con saveSession) y mostrar check "Hecho".
- Ejecución al confirmar:
  - `abrir_pantalla` → mapa destino→pantalla:
    ensayos→`Ensayos`{mode:'date'} · dossier→`Dossier` · muestras→`Samples` ·
    mapa→`ProjectMap` · sectores→`ProjectSectors` · trazabilidad→`TraceabilityHome` ·
    tablas_resumen→`SummaryTables` · configuracion→`ProjectConfig` ·
    papelera→`RecycleBin` · topografia→`TopoCargas` · planos→`PlansManagement` ·
    contactos→`PhoneContacts`. Todos con `{ projectId, projectName }`.
  - `crear_ensayo` → **usar el motor existente** `createInstances` de
    `@services/ProtocolInstanceService` (¡él es dueño del database.write, no
    anidar!): `createInstances({ projectId, template: { id: templateId, name:
    templateNombre, idProtocolo: templateCodigo }, sectorId, sectorName:
    sectorNombre, ensayoDate: fecha ?? undefined })` → `navigation.navigate(
    'ProtocolFill', { protocolId: ids[0] })`.
  - `crear_muestra` → `navigation.navigate('Samples', { projectId, projectName })`.
- `prompt.ts`: agregar regla 10: acciones — preguntar lo que falte antes de
  preparar_accion; nunca inventar tipo/sector; tras la tool avisar en UNA frase
  que confirme con el botón.

### 2. Deploy tras terminar el móvil
`cd D:\VxP_QAQC_Automatizado` → `npx supabase functions deploy ai-chat`
(CLI ya logueada+linkeada). NO desplegar antes de que la tarjeta móvil exista
(Flo diría "confirme con el botón" y no habría botón).

### 3. Flo visual (aprobado por el usuario: "Gota viva + agua sutil")
- Avatar gota: reemplazar Ionicons "sparkles" por gota (Ionicons "water" ya se
  usa en la burbuja flotante; para el avatar puede ser "water" también o un SVG
  de gota con carita más adelante — la MASCOTA completa quedó para después).
- Agua GL: montar `WaterRipplesGL` (src/components/WaterRipplesGL.tsx, tiene
  `drop()`/`bigWave()` y `onUnsupported`) DETRÁS del estado vacío del chat
  (pointerEvents none, solo cuando messages.length===0 → se desmonta al
  conversar; batería ok). `bigWave()` al montar.
- Pulso sutil (Animated scale 1→1.06→1) en el avatar del último mensaje al
  llegar respuesta.

### 4. Extras aprobados/pedidos por el usuario (siguiente tanda)
- Puente de gráficos: extender `generar_grafico`/chart.ts con `tipo:
  'linea'|'barras'` espejando lib/reports/chart.ts de la web (mismo spec para
  que futuros tipos de gráfico sirvan a reportes Y a Flo).
- "Insight del día" local en el estado vacío (conteo de ayer/hoy desde
  WatermelonDB, cero tokens).
- Mascota virtual (fase posterior, el usuario la pidió AL FINAL).
- GEMINI_API_KEY: el usuario aún no la configura (aistudio.google.com → Get API
  key → `npx supabase secrets set GEMINI_API_KEY=...`).

## Notas operativas
- Metro corre (PID en 8081) y el dev client SM_A366E conectado por WiFi ADB —
  los cambios móviles solo necesitan reload (r en Metro o agitar el cel).
- Los subagentes/workflows agotaron el límite de sesión (~3:30am Lima reset):
  trabajar en el loop principal.
- Review adversarial del lote 1: 3 confirmados CORREGIDOS + 5 plausibles
  auditados a mano (2 reales corregidos: Gemini props vacías, prototype tier;
  sin_fecha agregado; los demás descartados o mitigados).
