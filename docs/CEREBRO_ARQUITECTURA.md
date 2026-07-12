# CEREBRO DE CONSTRUCCIÓN DE APPS — Flow QA/QC (S-CUA)

> **Qué es este documento.** El segundo cerebro del dueño del producto: cómo está
> construida Flow QA/QC, TODAS las decisiones de arquitectura tomadas (con su
> contexto, porqué y consecuencias), los patrones reutilizables y la forma de
> trabajar. Está escrito para **arrancar la próxima app** sin redescubrir nada:
> si una decisión de aquí aplica, se copia; si no aplica, este doc explica el
> criterio con el que se tomó para poder decidir distinto con fundamento.
>
> **Cómo mantenerlo.** Cada decisión nueva de arquitectura se agrega a la
> sección 12 (registro de decisiones) con el formato Decisión/Contexto/Porqué/
> Consecuencias. Los docs de `docs/` siguen siendo la fuente de detalle; este
> es el índice maestro y la síntesis.
>
> Estado: generado el 2026-07-12 a partir del código real (móvil v85, DB v71),
> los docs de `docs/` y la memoria de sesiones.

---

## 1. Filosofía de construcción (cómo pienso al construir)

Estos principios no son aspiracionales: cada uno nació de un bug pagado o de
una decisión explícita, y el código los respeta. **Son el ADN de cualquier app
nueva.**

1. **Offline-first de verdad.** El dispositivo es la fuente de verdad de la UI;
   la nube es orquestadora y espejo. Ninguna pantalla espera red para pintar.
   Ninguna acción del usuario se pierde por falta de señal.
2. **La robustez de los datos va antes que todo.** Perder o duplicar un dato de
   campo es el peor bug posible. Operaciones destructivas: atómicas (RPC
   transaccional), acotadas por id, con respaldo previo verificado, idempotentes.
   Jamás borrado masivo inferido de datos parciales.
3. **Nada con historia se borra físicamente.** Papelera con snapshot para
   ensayos, `is_hidden` para catálogos, respaldos en 3 granularidades. Lo
   borrado debe poder "nunca haber existido" para las métricas, pero siempre
   poder volver.
4. **Cada dato tiene UN dueño.** La resolución de conflictos no es global:
   datos de campo = last-write-wins por fila; configuración administrada =
   cloud-wins (y el móvil ni siquiera la sube); trabajo vivo (cronómetros) =
   intocable. Toda tabla nueva se clasifica al nacer.
5. **Fail-safe como postura por defecto.** Entrada inválida degrada con gracia
   (modo clásico, celda "—", gráfico vacío honesto), nunca crashea. Todo lo
   secundario es best-effort con `catch` comentado; nada secundario rompe el
   flujo principal.
6. **La seguridad vive en el servidor.** RLS es la autorización real (el anon
   key puede ser público); el rol del cliente jamás se confía; lo privilegiado
   (service_role, credenciales AWS) vive en la mínima superficie server-side
   posible y re-deriva identidad del JWT.
7. **Paridad multiplataforma por espejo, no por abstracción.** Cuando web y
   móvil deben producir EXACTAMENTE lo mismo (PDF, gráficos, fórmulas), se
   duplican módulos puros byte-casi-idénticos y se verifica por diff. Más
   simple que un monorepo-workspace con dos bundlers.
8. **Todo módulo nace detrás de un feature flag por proyecto.** Un solo binario
   sirve a clientes con configuraciones opuestas; activar capacidad no requiere
   deploy ni migración.
9. **El código es la bitácora.** Docblocks en español con versión (v29, v43.4,
   v85) y el PORQUÉ del cambio, incluyendo el bug que lo motivó. Los archivos
   SQL de migración llevan header con contexto/diseño/orden/rollback.
10. **Trade-offs honestos y escritos.** "Consecuencia honesta: un código
    provisional puede cambiar tras sincronizar". Si una decisión tiene costo,
    el costo queda documentado en el mismo lugar que la decisión.
11. **Verificación cuantificada como cierre.** Nada se declara listo sin
    cifras: `tsc 0 · engineTests 257/257 · next build OK · advisor limpio` +
    verificación funcional con datos reales del dominio.
12. **La IA es parte del equipo, con proceso.** Formatos diseñados para que un
    LLM los genere (DSL declarativo + validador con errores accionables),
    reviews adversariales multi-agente antes de operaciones riesgosas, y
    handoffs que separan lo hecho de lo que solo el dueño puede hacer.
13. **Iteración corta con testers reales.** Feedback → lote de fixes vNN →
    commit descriptivo → probar en dispositivo. Los rebuilds NO son un costo a
    evitar: siempre la solución más limpia aunque exija módulo nativo.
14. **El idioma del dominio es el del usuario.** UI, prompts de IA, funciones
    de fórmula (SI, PROMEDIO, INTERPXLOG), nombres de tools (contar_ensayos) y
    comentarios: en español. El técnico de obra es el centro.

---

## 2. El producto en una página

**Flow QA/QC (S-CUA)**: plataforma que reemplaza las planillas Excel de control
de calidad de construcción (ensayos de laboratorio y campo: Proctor, densidad,
CBR, granulometría…) por fichas digitales con cálculos automáticos, evidencia
fotográfica estampada, GPS/GIS, trazabilidad de personal/equipos, muestras,
topografía, dossiers PDF y un asistente de IA conversacional.

- **Usuarios**: ingenieros/técnicos EN CAMPO (celular, a veces sin señal) y
  jefatura/oficina (web + escritorio). Roles: CREATOR, RESIDENT (jefe de obra),
  SUPERVISOR, OPERATOR (técnico), VIEWER.
- **Plataformas**: móvil Android (Expo bare workflow), web (Next.js), escritorio
  (Electron empaquetando la misma web), todo contra el mismo Supabase + S3.
- **El diferencial**: cualquier ensayo nuevo se define en UNA plantilla Excel
  con un DSL declarativo (sin deploy), pensado para que una IA genere las
  fichas; y todo funciona offline con convergencia sin pérdida.

---

## 3. Stack canónico (y por qué cada pieza)

| Capa | Elección | Por qué |
|---|---|---|
| Móvil | Expo 53 bare workflow + RN 0.79 + React 19 + TS 5.8; builds LOCALES (`expo run:android`, Gradle), sin EAS | Control total del binario y de módulos nativos; builds gratis y reproducibles en la máquina del dueño |
| DB local | WatermelonDB 0.27 (SQLite, JSI) | Reactiva (observe), rápida, offline-first real; su generador de ids condiciona TODO el esquema (ids TEXT) |
| Nube | Supabase (Postgres + PostgREST + Auth + Realtime + Edge Functions Deno) | Un solo proveedor para datos/auth/tiempo real/serverless; RLS como autorización central; plan Free viable (el backup diario lo mantiene despierto) |
| Binarios | AWS S3 (presigned URLs 300s) — NO Supabase Storage | Fotos/planos/ortofotos pesados fuera de los límites del plan; S3 es también el destino de backups |
| Web | Next.js 14 App Router **client-first**: páginas 'use client' + React Query 5 directo a Supabase bajo RLS; API routes SOLO para lo privilegiado | La lógica de negocio vive una vez (cliente+RLS); superficie server mínima y auditable |
| Escritorio | Electron empaquetando el build standalone de la MISMA web + caché local de S3 en disco | Una sola base de código para web y desktop |
| Estado servidor web | React Query: staleTime 3 min, retry off, refetch-on-focus off + botón "Actualizar" + Realtime → `invalidateQueries({type:'active'})` | Caché caliente = sensación de velocidad; frescura por 3 vías explícitas, no por polling |
| Gráficos/PDF | SVG y HTML generados A MANO (funciones puras string→string), sin Recharts/puppeteer; PDF en el navegador con `window.print()`; email SVG→PNG con resvg | Portabilidad total (RN/browser/Node/Deno) y paridad visual exacta entre plataformas |
| IA | Edge Function multi-proveedor (Claude SDK / Gemini REST) con tools RLS-passthrough; TTS ElevenLabs; dictado expo-speech-recognition | Cerebro 100% server-side tamper-proof; el móvil es un cliente tonto |
| Cron | GitHub Actions (backup diario pg_dump→S3 keep-15; mailer de reportes horario) | Cron gratis sin servidor propio; scheduling por datos (next_send_at en filas) |
| i18n | Casero (~100 líneas), catálogo plano por pantalla, ES/EN/PT por dispositivo | Cero dependencias nativas; API dual hook + imperativa (`tx()`) para Alerts/servicios |
| Tests | `scripts/engineTests.ts` con tsx (257 casos del motor de fórmulas), sin framework | El motor es lo crítico; un runner de 0 dependencias basta y corre en CI mental (`npx tsx`) |

**Convenciones transversales**: ids TEXT (no UUID — WatermelonDB manda);
timestamps BIGINT epoch-ms; columnas JSON con sufijo `_json` (TEXT local ↔
JSONB nube, coerción en la frontera de sync); alias de imports por capa
(`@db`, `@services`, `@components`…); Ionicons como iconografía única; tokens
de diseño en UN archivo (`src/theme/colors.ts`); fechas de negocio YYYY-MM-DD
en hora de Lima.

---

## 4. La columna vertebral: datos offline-first

El subsistema más valioso del proyecto. Si la próxima app necesita offline,
**copiar esta receta completa**:

### 4.1 Identidad compartida
Un solo id (TEXT, generado por WatermelonDB) es PK en el device Y en Postgres.
Subir = `upsert(onConflict:'id')` idempotente; bajar = crear con
`rec._raw.id = remote.id`. Cero mapeo local↔cloud, las FKs viajan intactas.
Regla: al marcar filas bajadas como synced se toca `_raw._status/_changed` a
mano (con `prepareUpdate` se re-encolarían).

### 4.2 Doble canal de sync
- **Outbox (`sync_queue` + SyncWorker)** para escrituras de campo: persistir
  local PRIMERO, luego `enqueue({opType, entityId, projectId})`. Worker
  singleton drena cada 15 s y on-reconnect (NetInfo), FIFO por created_at
  (causalidad padre→hijo), backoff exponencial con jitter (5s→10min, 10
  intentos → FAILED_PERMANENT con retry manual), dedup por (opType, entityId),
  limpieza de PROCESSING zombis. Cada entidad tiene push `*Strict` (relee la
  fila al drenar, lanza para reintentar) y push best-effort (post-guardado).
- **Push/pull masivo por proyecto** para convergencia al abrir pantallas:
  push en lotes de 200 filtrado por frescura (`updated_at` remoto) → pull que
  descarga TODO por red FUERA del write-lock y aplica en UN `database.write`
  con batch de prepares (si el batch falla, limpiar `_preparedState` o la DB
  en memoria queda envenenada). Dedup de pulls concurrentes por
  `Map<projectId, Promise>`.

### 4.3 Conflictos por dominio (no global)
| Dominio | Regla | Mecanismo |
|---|---|---|
| Datos de campo (protocolos, items, evidencias, anotaciones) | Last-write-wins POR FILA | `prepareFreshOverride` compara updated_at |
| Configuración administrada (feature_flags, ortofoto, papelera) | Cloud-wins; el móvil NI LAS SUBE | `PROJECT_CLOUD_OWNED_COLS` excluidas del push |
| Trabajo vivo (work_sessions ACTIVE/PAUSED) | Intocable | el pull no las pisa |
| Ediciones concurrentes del mismo registro | Merge a nivel columna | push parcial de `_raw._changed` (solo columnas modificadas) |

### 4.4 Guardarraíles del pull
- Anti-zombie: excluir del remoto los ids con DELETE_* pendiente en la cola.
- Anti-masacre: si el fetch de una tabla falló (`fetchFailed`), NO limpiar sus
  huérfanos locales.
- Anti-resurrección: `skipDeletedOnRemote` para lo borrado en web.
- Coerción defensiva en la frontera: null → OMITIR columna (aplica DEFAULT y
  no pisa la nube); `filterToLocalSchema` al bajar (schemas desfasados entre
  réplicas viejas y nuevas no se rompen mutuamente).

### 4.5 Correlativo distribuido (códigos de ensayo)
Híbrido: cálculo local del próximo seq (incluye pendientes offline Y papelera)
+ RPC `next_protocol_seq` que reserva bloques atómicos
(`INSERT…ON CONFLICT DO UPDATE SET last_seq = greatest(actual, cliente-1)+count`)
+ índice único parcial como árbitro final + re-secuenciación automática al
chocar (23505), serializada con mutex de promise-chain. `release_protocol_seq`
baja el contador solo si el seq era el tope y el delete realmente ocurrió.
**Consecuencia asumida y documentada**: un código provisional puede cambiar al
sincronizar → las referencias entre entidades van SIEMPRE por id, nunca por
código.

### 4.6 Binarios
Las filas solo llevan `s3_key`. Subida por op de cola (estados
PENDING/UPLOADING/SYNCED + detección de upload colgado >5 min); descarga lazy
con anti-bucle por ETag (s3_etag vs local_etag). El estampado de evidencia
(logo + proyecto + comentario + fecha + GPS) es bloqueante-garantizado: nunca
se plotea sin `await` del StampContext (logo verificado en disco persistente).

---

## 5. Seguridad y multi-tenant (retrofit sin reescribir)

Aplicado en producción sobre una app viva — el orden y los mecanismos son
reutilizables tal cual:

1. **Auth de dos capas**: Supabase Auth (credencial, JWT) + `public.users`
   (perfil/rol de negocio) enlazadas por `auth_id`. La UI consume el mismo
   modelo local de siempre (materialización `resolveAppUserByAuthId`).
2. **RLS con helpers SECURITY DEFINER**: `app_user_id()`,
   `can_access_project(text)`, y helpers por tabla hija que resuelven el
   proyecto vía el padre. Centralizar la regla en UNA función hace que cambios
   de política (org, demo) se propaguen a ~35 tablas tocando un solo lugar.
   **Gotcha pagado**: Postgres da EXECUTE a PUBLIC por defecto → toda función
   nueva lleva su `REVOKE ALL FROM public, anon; GRANT TO authenticated`.
3. **Multi-tenant POOLED por org_id** (no schema-por-tenant, no DB-por-tenant):
   columna `org_id` en todas las tablas + trigger BEFORE INSERT/UPDATE
   `set_org_id` anti-spoof (ignora lo que mande el cliente) + política
   **RESTRICTIVA** `org_guard` que se AND-ea con las permisivas existentes —
   solo puede ACOTAR el acceso, nunca abrirlo → retrofit sin riesgo y rollback
   trivial (drop policy). Los clientes no cambiaron: no conocen org_id.
   **Ojo**: el trigger no distingue service_role → donde hay service_role la
   frontera de org se valida EN EL CÓDIGO de la función.
4. **Edge functions RLS-passthrough**: las de datos usan el JWT DEL USUARIO
   (anon key + header Authorization) — heredan RLS y no re-implementan
   autorización. service_role solo en admin/M2M/notificaciones, con la
   validación de org en TS.
5. **Web**: middleware SSR solo redirige; las API routes privilegiadas
   re-derivan usuario/rol del JWT (`getServerUser`) y aplican doble chequeo:
   vertical (rol: `canDeleteProject = CREATOR`) + horizontal (pertenencia del
   recurso: `keyBelongsToAccessibleProject` para keys S3).
6. **Acceso demo emergente**: `is_demo AND is_viewer() AND NOT
   has_real_project_access()` dentro de `can_access_project` — el acceso
   desaparece solo al asignar un proyecto real, sin jobs ni flags por usuario.
7. **Integración entre apps del ecosistema** (Flow_PM ↔ Flow_QA/QC): UNA DB
   por producto, NUNCA compartida; comunicación por Edge Function M2M GET-only
   con API key hasheada (sha256 en tabla con RLS sin políticas) POR
   ORGANIZACIÓN, revocable; respuestas JSON acotadas sin PII. La verdad
   síncrona va por request/response; webhooks/eventos son solo caché de UX.

---

## 6. Paridad multiplataforma: renderers espejo

Cuando dos plataformas deben producir EXACTAMENTE el mismo artefacto (PDF del
dossier, gráficos, cálculo de fórmulas):

- Módulos **puros** (string→HTML/SVG, sin React/Tailwind/deps, imports
  relativos entre hermanos) duplicados literalmente:
  `flow-qaqc-web/lib/*.ts ↔ src/utils/*.ts` (numericPdfHtml, chartRenderer,
  formulaEval, numericProtocol, summaryColumns/Table, protocolValidator).
- Regla dura en el header de cada archivo: **"Espejo ×2 (byte-idéntico)"** —
  todo cambio se replica al gemelo y se verifica con `diff` + engineTests.
- El PDF pagina por **bloques con peso** (fila≈1, gráfico≈9; tablas
  pre-troceadas que repiten encabezado) — el paginador reparte sin cortar.
- El chartRenderer (1072 líneas) hace 5 modos, multi-serie, banda de
  especificación, ajustes lineal/poli/spline, escala "nice numbers" — todo SVG
  a mano escalable por viewBox.
- La IA tiene su gemelo mínimo en Deno (`ai-chat/chart.ts`) con el mismo spec
  (kind+title+points).

**Criterio**: espejo manual gana cuando (a) no hay workspace compartido entre
bundlers, (b) el módulo es puro y estable, (c) la paridad es un requisito de
negocio verificable por diff. Si el módulo muta a diario, ahí sí paquete
compartido.

---

## 7. Configuración y modularidad: feature_flags

- TODA la configuración por proyecto vive en UN JSON (`projects.feature_flags`),
  tipado (`ProjectFeatureFlags`) con ~40 flags catalogados (FLAGS_MAPA.md). No
  solo booleanos: máscaras de codificación, configs de impresión por tipo,
  columnas topo, presets de agrupación, tier de IA.
- **Lectura SIEMPRE** vía `parseFeatureFlagsJson` → `{...DEFAULTS, ...parcial}`
  (+ deprecated forzados). Campos nuevos: opcionales con default → agregar
  capacidad no migra schema ni rompe apps viejas.
- **Escritura SIEMPRE** con fetch-merge-write contra la nube (nunca pisar con
  un JSON local viejo — bug pagado: "la config se desconfigura sola").
- **Padre-hijo evaluado en LECTURA** (`hijo && padre`): apagar el padre anula
  a los hijos sin borrar su valor.
- **Doble gating ortogonal** en menús: flag de proyecto × rol de usuario,
  declarativo (array de opciones + filter). Mientras los flags cargan se
  muestra todo (anti-parpadeo).
- Los "modos de llenado" son **lentes** sobre las mismas instancias (distinto
  WHERE), no duplicación de datos.

---

## 8. El patrón "asistente IA por proyecto" (módulo FLOW)

Receta completa para poner un copiloto conversacional en cualquier app:

1. **Cerebro 100% server-side** (Edge Function): el cliente manda mensaje +
   historial local acotado (8 turnos / 2000 chars) + extras (preferencias, GPS).
   Proveedor y modelo se resuelven server-side de los flags del proyecto
   (tamper-proof; guard `hasOwnProperty` contra tiers basura); keys en secretos.
2. **Contrato multi-proveedor mínimo**: `ChatArgs → ChatResult`; cada proveedor
   es un archivo (Claude por SDK, Gemini por REST puro con sus gotchas
   documentados: turno model verbatim con thoughtSignature, un functionResponse
   por functionCall ecoando id, sin maxOutputTokens en modelos pensantes).
   Última iteración fuerza texto (tool_choice none / mode NONE). Errores
   429/5xx → mensaje amable, jamás el error crudo.
3. **Tool-belt seguro**: `buildTools(supabaseConJWT, projectId, gps, {rol,flags})`
   — el tenant va en el CLOSURE (no es parámetro del modelo), RLS filtra solo,
   todo input del modelo se valida (fechas reales, ilike neutralizado,
   column_key contra catálogo con candidatas, resultados truncados).
4. **Interceptores de payloads ricos**: la tool devuelve `{__chart_svg}` /
   `{__action}` / `{__links}`; el ejecutor los extrae ANTES de volver al modelo
   (un SVG de 30KB o UUIDs serían ruido/alucinación) y deja una nota honesta
   — incluida la verdad cuando un segundo gráfico REEMPLAZA al primero.
5. **Manos = botones**: la IA nunca ejecuta; `preparar_accion` valida TODO
   server-side (ids contra catálogo, rol, flags espejo del menú) y el móvil
   ejecuta solo al confirmar la tarjeta (guard síncrono por ref anti doble-tap,
   kind desconocido → "actualice la app").
6. **Radiografía del proyecto en el prompt**: N conteos head en paralelo con
   directrices por cada cero ("no hay sectores: no filtres por sector, ofrece
   el botón a Sectores") usando LOS MISMOS filtros que las tools.
7. **Disciplina de cobertura**: si la tool agrega sobre una tabla derivada,
   compara contra la fuente de verdad y adjunta `advertencia` que el prompt
   obliga a mencionar. Distinguir columna inexistente / truncación / falta de
   sync — tres causas, tres mensajes.
8. **Resolución tolerante de nombres**: exacto → prefijo → contiene; 0 o 2+
   matches → devolver candidatos y PREGUNTAR, nunca elegir por el usuario.
9. **Estado en el cliente, no en el server**: historial y preferencias en
   AsyncStorage con presupuesto de bytes (1.5MB < CursorWindow Android) y
   degradación escalonada (despojar gráficos viejos → podar sesiones → limitar
   la última). Server stateless.
10. **Voz**: TTS por Edge Function (MP3 base64→cache), dictado nativo con
    require diferido, modo manos libres, muletillas pre-cacheadas que solo
    suenan si la respuesta tarda >2.8s, y TODO el loop de voz gobernado por
    refs + token de cancelación (las Edge Functions no se abortan: el
    resultado en vuelo se DESCARTA al llegar si el token cambió).

---

## 9. Operaciones destructivas y respaldos

- **Plantilla de RPC destructivo**: plpgsql SECURITY DEFINER → guardia de id
  vacío → guardia de acceso/rol → `FOR UPDATE` anti-carrera → idempotente
  (si ya está hecho, éxito con flag) → devuelve jsonb con el resultado REAL
  (`{deleted:true}`) para que el cliente solo dispare efectos secundarios
  (liberar correlativo, borrar S3) si la operación ocurrió de verdad.
- **Papelera por snapshot**: hard delete + volcado del agregado completo a UNA
  fila jsonb sin FKs; restore con `jsonb_populate_record` en orden FK-seguro,
  filtrando referencias a padres que ya no existen. S3 se conserva hasta el
  purge definitivo.
- **Borrado de proyecto = 4 llaves**: respaldo .zip local VERIFICADO antes de
  borrar + solo CREATOR server-side + escribir el nombre exacto + resumen de
  impacto con checkbox. La RPC borra ~30 tablas explícitamente (no confiar en
  ON DELETE CASCADE: 4 tablas no tienen FK).
- **Tres respaldos, tres propósitos**: backup diario automático de toda la DB
  (GitHub Actions → S3, keep-15 que solo limpia al crear uno nuevo — "nunca te
  quedás en cero"), export .zip por proyecto restaurable en 1 clic, papelera
  por ensayo. Tras restaurar la nube: pull forzado cloud-wins en los celulares.

---

## 10. Principios de fluidez (UX de velocidad percibida)

- **Pintar local al instante + pull único en background** (`didCloudPullRef`)
  + pull-to-refresh + Realtime por foco con debounce 500ms. Tres vías de
  frescura explícitas; jamás bloquear la lista esperando red.
- **Caché caliente en web**: staleTime alto, refetch automáticos apagados,
  botón "Actualizar" visible (la frescura es una decisión del usuario, no un
  spinner sorpresa).
- **Skeleton anti-flash** con flag `loaded` (nunca mostrar "0/0/0" falso), e
  `InteractionManager.runAfterInteractions` para no congelar la animación de
  back.
- **Preload por lotes anti-N+1** antes de exports pesados (chunks de 50 ids).
- **Guards síncronos por ref** para todo lo duplicable por doble tap.
- **Feedback inmediato**: toasts/alerts amables en español; errores de red
  silenciosos cuando hay fallback local.

---

## 11. Catálogo de patrones reutilizables

Micro-patrones probados, listos para copiar (referencia en el código):

| Patrón | Esencia | Referencia |
|---|---|---|
| Outbox durable | Tabla local + worker con backoff/jitter/dedup | SyncQueueService/SyncWorker |
| Push Strict vs best-effort | Dos sabores por entidad: lanzar para reintentar vs tragar | SupabaseSyncService |
| Pull reconciliador con guardarraíles | fetch fuera del lock → write único → limpieza condicionada | pullProject |
| Mutex por promise-chain | `chain = chain.then(run, run)` para serializar sin deps | resequenceProtocolCode |
| Contador atómico con greatest() | Reserva de bloques que respeta lo creado offline | v60 next_protocol_seq |
| Política RESTRICTIVA de tenant | AND-ea sobre las permisivas: solo acota | v57 org_guard |
| Trigger anti-spoof | El server estampa el tenant, el cliente no lo conoce | set_org_id |
| RPC destructivo 5 pasos | guardias→FOR UPDATE→idempotente→jsonb resultado | delete_protocol_to_recycle |
| Snapshot jsonb autocontenido | papelera sin FKs, restore por populate_record | recycle_bin v43/v62 |
| Acceso emergente | condición computada en el helper central, auto-revocable | proyectos demo v70/71 |
| API M2M por key hasheada | sha256 en tabla solo-service_role, por org, revocable | eco |
| Renderer espejo | funciones puras duplicadas, verificadas por diff | chartRenderer ×2 |
| Paginación por bloques con peso | {html, weight} y el paginador reparte | numericPdfHtml |
| Cron por datos | GitHub Actions pregunta "qué venció" (next_send_at en filas) | report-mailer |
| Email CID inline | MIME multipart/related a mano + estilos inline | lib/reports/generate |
| Caché local espejo de S3 | key→ruta única + anti path-traversal + validación por tamaño | localCache (Electron) |
| Insert optimista + retry 23505 | la DB (índice único) es el árbitro; releer y reintentar | useEnsayos web |
| Flags fetch-merge-write | nunca pisar el JSON compartido con copia local vieja | mergeAndSaveFeatureFlags |
| Gating padre-hijo en lectura | `hijo && padre` al consumir; el valor persiste | featureFlags helpers |
| Menú declarativo doble-gate | array + flagKey + spread por rol + filter | ProjectMenuScreen |
| didCloudPullRef | local al instante, pull 1 vez en background | EnsayosScreen |
| Realtime por foco + debounce | canal único por instancia, invalidación genérica | useRealtimeProjectPull / useRealtimeProject |
| i18n dual | hook reactivo + `tx()` imperativa con variable de módulo | src/i18n |
| Contexto cacheado por promesa | cachear la PROMESA; invalidar si el recurso crítico faltó | StampContext |
| GPS cancelable | watchPosition + Promise.race + cleanup en todos los caminos | useGpsCapture |
| GPS best-effort para features | warmUp al entrar; en uso solo consultar permiso; cache 90s | warmUpAILocation |
| require() diferido de nativos | cargar al usar; null → "reinstale la app"; la pantalla vive | loadSpeech/loadExpoAudio |
| Token de vuelo | contador ref re-validado tras cada await; cancela lo no-abortable | cancelSeqRef |
| Ref-mirror anti-TDZ | funciones usadas antes de declararse se puentean con refs | sendRef etc. |
| Estado global mínimo | variable de módulo + Set de listeners; sin store | useSyncQueue |
| Interceptor de claves __x | payload rico extraído antes de volver al LLM | providers.ts |
| Radiografía en prompt | conteos head con directrices por cero | snapshotSection |
| Resolución tolerante + candidatos | ambigüedad DEVUELTA al modelo/usuario | resolveByName |
| Presupuesto de bytes escalonado | recortes del más barato al más caro | saveSession |
| Burbuja flotante global | overlay 1 vez, ruta+flags, tap-vs-drag por recorrido máx | AIQuickBubble |
| Lentes sobre datos únicos | N vistas = mismo dato, distinto WHERE, cada una tras flag | modos de llenado |
| Import idempotente conservador | upsert por clave estable que nunca borra lo del usuario | agrupaciones |
| Ocultar en vez de borrar | is_hidden para catálogos con historia | protocol_templates v39 |
| DSL + validador accionable | LLM genera → validador da fila/celda/causa → LLM corrige | PROTOCOLOS_NUMERICOS |
| Migración idempotente auto-doc | header contexto/orden/rollback + DO-blocks con guards | supabase/vNN_*.sql |
| Advertencia de cobertura | derivada vs fuente de verdad, el prompt obliga a decirla | valueCoverageNote |

---

## 12. Registro de decisiones de arquitectura (ADR log)

Formato: **Decisión — Contexto → Porqué → Consecuencias.** (Las de detalle fino
están en §4-§10; aquí el registro completo por área.)

### Datos y sync
1. **Mismo id local=nube, upsert idempotente** — bugs de traducción de ids
   eliminados de raíz → las FKs viajan intactas; marcar synced tocando `_raw`.
2. **Outbox + push/pull masivo (doble canal)** — entrega garantizada offline +
   convergencia al abrir → toda escritura nueva enruta por el outbox.
3. **Conflictos por dominio** (LWW campo / cloud-wins config / intocable vivo)
   — un criterio global pierde datos (bugs A7/A9 de la auditoría) → toda tabla
   nueva se clasifica al cablearse.
4. **Push parcial por `_changed`** — merge a nivel columna gratis, sin CRDTs.
5. **Correlativo híbrido con reconciliación** — reservar rangos por dispositivo
   complica más de lo que aporta a ~2200 ensayos/año → código provisional puede
   cambiar; referencias por id.
6. **Coerción defensiva en la frontera** — schemas desfasados no se rompen
   entre sí ("la lección de is_hidden") → null se OMITE, nunca se envía.
7. **ids TEXT y epoch-ms** — el esquema de Postgres se subordina al cliente
   offline (WatermelonDB) → RPCs reciben text; restore fuerza updated_at=now.

### Seguridad
8. **Supabase Auth + users de negocio por auth_id** — migración sin tocar la UI.
9. **RLS por helpers SECURITY DEFINER centralizados** — cambios de política en
   UNA función → REVOKE explícito SIEMPRE (PUBLIC tiene EXECUTE por defecto).
10. **Multi-tenant pooled org_id + restrictiva + trigger** — retrofit que solo
    puede acotar → toda tabla nueva nace con org_id+trigger+guard.
11. **Edge functions con JWT del usuario** — RLS filtra solo; service_role solo
    donde es imprescindible y con frontera de org en TS.
12. **Credenciales AWS en cliente con presigned de vida corta** — trade-off
    consciente del plan Free; key rotada tras leak; pendiente: bucket por org.

### Multiplataforma
13. **Espejos byte-idénticos verificados por diff** (motor de fórmulas, charts,
    PDF) — más simple que workspace compartido entre Metro y webpack.
14. **PDF en el navegador (window.print)** — cero infra de render server-side.
15. **Electron reusa la web** (standalone + caché S3 local) — una base de código.
16. **Web client-first bajo RLS; API routes solo para lo privilegiado** —
    lógica una vez; superficie server auditable con doble chequeo rol+recurso.

### Producto
17. **DSL declarativo en el Excel, diseñado para IA** — cualquier ensayo nuevo
    sin deploy; pipeline generar→validar→corregir; fail-safe a modo clásico.
18. **Todo módulo tras feature flag por proyecto** — un binario, N clientes.
19. **xref entre fichas: solo APROBADAS, valor congelado** — auditabilidad de
    laboratorio; APROBADO es un contrato del dominio.
20. **Nada con historia se borra** — papelera/is_hidden/backups ×3.
21. **Ecosistema multi-app: DB por producto + API M2M** — nunca DB compartida.
22. **IA "manos = botones"** — la IA prepara, valida y GUÍA; solo el humano
    ejecuta, siempre con un botón a la pantalla correcta.
23. **Historial de IA local en el dispositivo** — cero costo de servidor,
    privacidad; no se comparte entre dispositivos (asumido).
24. **Realtime selectivo** (5 tablas con REPLICA IDENTITY FULL) — costo WAL es
    una decisión consciente por tabla.

### Proceso
25. **Migraciones vNN idempotentes auto-documentadas aplicadas a mano** — el
    repo es la fuente de verdad histórica; riesgo de drift asumido y mitigado
    por disciplina.
26. **Numeración vNN compartida** entre schema móvil, SQL y commits — lenguaje
    común entre código, docs y memoria.
27. **Builds locales sin EAS** — control y costo cero; rebuilds libres (la
    solución más limpia gana aunque exija módulo nativo).
28. **Verificación cuantificada** en cada cierre + reviews adversariales
    multi-agente antes de operaciones riesgosas.

---

## 13. Proceso de trabajo (cómo se construye día a día)

- **Iteración vNN**: cada lote de feedback de testers se convierte en una
  versión (v78, v84…) con commit descriptivo en español que narra QUÉ y POR QUÉ.
- **Géneros de documentación** (cada uno con plantilla implícita):
  - **BLUEPRINT** — decisiones para la próxima app: tabla |Decisión|Recomendación|Porqué| + alternativas descartadas + qué copiar vs reemplazar.
  - **HANDOFF** — frontera exacta: lo hecho y verificado (con cifras) vs las N
    tareas que solo el dueño puede hacer (credenciales, consolas), con pasos.
  - **RUNBOOK** — migraciones riesgosas: orden con porqué, verificación SQL
    tras cada paso con resultado esperado, rollback por pieza.
  - **AUDITORÍA** — bugs corregidos (causa raíz + fix) vs hallazgos DIFERIDOS
    que cambian comportamiento y esperan decisión del dueño.
  - **Design doc** — magnitudes reales del dominio, plan por pasos con riesgo,
    y "Preguntas abiertas" numeradas para aprobación; al implementarse se
    estampa "✅ IMPLEMENTADO (vNN)" y muta a registro histórico.
- **Reviews adversariales**: buscadores en paralelo por dimensión → cada
  hallazgo se intenta REFUTAR con el código real → solo lo confirmado se
  corrige. Se usa antes de releases y tras features grandes.
- **Memoria persistente del agente**: decisiones de trabajo (rebuilds libres,
  UTF-8 BOM, rutas absolutas, merge de flags) se guardan como memorias con
  Why/How-to-apply — el agente arranca cada sesión sabiendo cómo trabaja el dueño.
- **Trabajo con el dueño**: comandos siempre con `cd` absoluto adelante;
  archivos entregados con ruta absoluta copiable; CSVs UTF-8 con BOM; español
  siempre.

---

## 14. Checklist para arrancar una app nueva

Día 0 (copiar de aquí):
1. Repo con la MISMA estructura: `src/` móvil (si aplica), `app-web/`,
   `supabase/` (funciones + vNN.sql), `docs/`, `scripts/`.
2. Supabase propio del producto + bucket S3 propio. Org default con UUID fijo
   si se enlazará al ecosistema.
3. Esquema: ids TEXT, epoch-ms, org_id + trigger + org_guard DESDE EL DÍA 1,
   RLS con helpers `can_access_*` centralizados + REVOKE.
4. `feature_flags` JSON por entidad-raíz con DEFAULTS tipados y merge-on-read.
5. Si hay offline: WatermelonDB con el kit completo de §4 (outbox, doble canal,
   conflictos por dominio, guardarraíles del pull).
6. Tokens de diseño en un archivo; AppHeader propio; i18n casero si hace falta.
7. Backup diario por GitHub Actions desde la semana 1 (keep-N que nunca vacía).
8. `docs/` con BLUEPRINT inicial y este CEREBRO como referencia.
9. Motor puro del dominio como funciones sin framework + engineTests con tsx.
10. Si lleva IA: receta completa de §8.

Reglas permanentes:
- Toda tabla nueva: dueño del dato (§4.3) + org_id + clasificar en el pull.
- Toda función SQL nueva: REVOKE/GRANT.
- Todo módulo nuevo: flag + entrada declarativa en el menú.
- Toda operación destructiva: plantilla de §9.
- Todo cierre: verificación cuantificada.

---

## 15. Errores ya pagados (no repetir)

Gotchas concretos que costaron bugs reales:

- `prepareUpdate` para marcar synced re-encola la fila (usar `_raw` directo).
- Un batch de prepares fallido deja `_preparedState` envenenado → limpiar.
- `await` de red dentro de `database.write` bloquea la UI (separar SIEMPRE).
- Upsert de fila completa pisa columnas de otro dispositivo (usar `_changed`).
- Cloud-wins global pierde datos de campo; LWW global desconfigura proyectos.
- Guardar el JSON de flags desde una copia local vieja pisa flags ajenos.
- Null explícito en el push viola NOT NULL e ignora DEFAULT (omitir la columna).
- Columna nueva en la nube rompe el push de apps viejas si no se filtra al
  schema local (y viceversa) — "la lección de is_hidden".
- Postgres: EXECUTE a PUBLIC por defecto en toda función nueva.
- `ON DELETE CASCADE` no cubre tablas sin FK — cascada explícita.
- GitHub Actions desactiva crons tras 60 días sin commits.
- Supabase Free se pausa por inactividad (el backup diario lo mantiene vivo).
- Android CursorWindow ~2MB por fila de AsyncStorage → presupuesto de bytes.
- `getCurrentPositionAsync` no es cancelable (watch + race + cleanup).
- react-native-image-marker: URI con `file://` obligatorio (Coil), resultado
  sin `file://`, colores RGBA hex.
- Import estático de un módulo nativo nuevo revienta dev clients viejos
  (require diferido + degradación).
- Gemini 3.x: 400 sin thoughtSignature verbatim; vacío con functionResponse
  mal apareado; maxOutputTokens se come el presupuesto en thoughts.
- Pedir permisos del SO en medio de una acción bloquea la acción (pedirlos al
  ENTRAR a la pantalla).
- Metro/Gradle en máquinas con poca RAM: `maxWorkers=2` en metro.config.js.
- Excel abre CSV sin BOM como Latin-1 (siempre UTF-8 con BOM).
- RN: fontWeight no sintetiza negrita sobre fuente custom en Android (cambiar
  de familia: Regular/SemiBold/Bold explícitas).
