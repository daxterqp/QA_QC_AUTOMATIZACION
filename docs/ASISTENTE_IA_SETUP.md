# Asistente de IA — Guía de despliegue

El módulo ya está **code-completo** (Fases 1-3). Para activarlo hacen falta 3 pasos
que requieren tus credenciales: desplegar las Edge Functions, configurar los
secretos y reconstruir el dev client (por el módulo de audio).

## 1. Desplegar las Edge Functions

Requiere la CLI de Supabase logueada (`supabase login` con tu access token).

```bash
cd "D:\VxP_QAQC_Automatizado"
supabase functions deploy ai-chat --project-ref <TU_PROJECT_REF>
supabase functions deploy ai-tts  --project-ref <TU_PROJECT_REF>
```

> Ambas funciones se despliegan con `verify_jwt` activado (default). No usar
> `--no-verify-jwt`.

## 2. Secretos (las API keys JAMÁS van en la app)

```bash
supabase secrets set ANTHROPIC_API_KEY=sk-ant-... --project-ref <TU_PROJECT_REF>
supabase secrets set ELEVENLABS_API_KEY=...       --project-ref <TU_PROJECT_REF>
```

- `ANTHROPIC_API_KEY`: consola de Anthropic (console.anthropic.com → API Keys).
- `ELEVENLABS_API_KEY`: elevenlabs.io → perfil → API Keys. Solo hace falta para
  la narración por voz; el chat funciona sin ella.
- Opcional `ELEVENLABS_VOICE_ID`: cambia la voz sin redesplegar (default: voz
  femenina multilingüe "Sarah", `EXAVITQu4vr4xnSDxMaL`).

### Proveedor Gemini (opcional, con free tier)

El Creador puede cambiar el proveedor de IA del proyecto a **Gemini** en la
configuración (Proveedor de IA: Claude / Gemini). Para que funcione:

```bash
supabase secrets set GEMINI_API_KEY=...   # aistudio.google.com → "Get API key" (gratis, sin tarjeta)
```

Modelos por nivel (sobreescribibles por secreto sin redesplegar):
- Económico → `gemini-2.5-flash` (free tier) — `GEMINI_MODEL_ECONOMICO`
- Potente → `gemini-3.5-flash` — `GEMINI_MODEL_POTENTE`
- Máximo → `gemini-3.1-pro-preview` — `GEMINI_MODEL_MAXIMO`

El mapeo proveedor+nivel → modelo es 100% server-side (tamper-proof), igual que
con Claude. Si el proyecto está en Gemini y falta `GEMINI_API_KEY`, el chat
devuelve un error claro indicándolo.

## 3. Rebuild del dev client (módulo de audio)

`expo-audio` es un módulo NATIVO nuevo — el dev client instalado no lo tiene.
Hasta reconstruir, el chat y los gráficos funcionan; solo el botón de altavoz
muestra un aviso de reinstalar.

```bash
cd "D:\VxP_QAQC_Automatizado"
npx expo run:android
```

## 4. Activar el módulo en un proyecto (como Creador)

1. Proyecto → Configuración → marcar **Asistente de IA**.
2. (Opcional) Elegir el modelo: **Económico** (default, Haiku — costo casi
   despreciable), **Potente** (Sonnet) o **Máximo** (Opus). El selector solo lo
   ve el Creador y el mapeo tier→modelo vive en el servidor (nadie puede forzar
   un modelo caro desde el celular).
3. En el menú del proyecto aparece **Asistente IA**.

## Fuentes de datos (frescura garantizada)

- **Conteos, listas y estados** salen de la tabla `protocols`, que se sincroniza
  con push inmediato + cola con reintentos en cada guardado/envío/aprobación —
  la misma fuente que usa la versión web.
- **Valores numéricos** (series, comparaciones, gráficos) salen de
  `protocol_summary_rows` (derivada). Si a algún ensayo le faltan valores
  sincronizados, el asistente lo ADVIERTE en la respuesta, y al abrir el chat
  el celular repara en segundo plano las filas faltantes con sus datos locales.

## Qué sabe responder

Toda cifra sale de los datos reales del proyecto (RLS con el JWT del usuario —
un usuario sin acceso al proyecto no ve nada):

- Conteos y listados de ensayos por fecha/tipo/sector/estado ("¿cuántos ensayos
  se hicieron ayer en el sector 3?").
- Series y comparaciones de columnas numéricas ("¿mejoró la compactación esta
  semana?").
- **Gráficos** de tendencia embebidos en el chat ("grafícame la compactación").
- Muestras (por material y condición), estado de aprobaciones (+ motivos de
  rechazo), no conformidades, jornadas de trazabilidad.
- "¿Cómo va el proyecto?" → panorama combinado, narrable por voz (botón de
  altavoz en cada respuesta).

## Costos y límites

- Modelo Económico: ~$0.001-0.01 por consulta típica.
- Respuestas cortas (`max_tokens` 700), historial acotado a 8 turnos, máximo 5
  rondas de herramientas por consulta.
- Narración: cobrada por carácter por ElevenLabs; el texto se acota a 1200
  caracteres.
- Historial de conversaciones: 100% local en el dispositivo (no gasta
  almacenamiento del servidor).
