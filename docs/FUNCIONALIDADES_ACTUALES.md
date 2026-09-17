# Flow QA/QC — Inventario de funcionalidades (estado a septiembre 2026)

> **Para qué sirve este documento:** que alguien que llega nuevo entienda **qué hace el
> sistema** hoy, sin leer código. No es un doc de arquitectura interna ni un how-to de
> setup: es el catálogo de funcionalidades, con el archivo donde vive cada una para que
> puedas ir a mirarla.
>
> Rama de referencia: `chore/expo54-16kb` (= `master`), commit `61a4e85`.
> Docs complementarios: [Arquitectura_FLOWQAQC.md](../Arquitectura_FLOWQAQC.md) (stack, algo
> desactualizado — marzo 2026), [FLAGS_MAPA.md](FLAGS_MAPA.md) (los 40 flags por proyecto),
> [MAPEO_CAPACIDADES.md](MAPEO_CAPACIDADES.md) (motor de fichas).

---

## 1. Qué es el producto

Sistema de **control de calidad (QA/QC) para obras de construcción, carreteras y minería**.
Reemplaza los protocolos de ensayo en papel/Excel por una app que se llena en campo (sin
señal), sincroniza a la nube y emite el **dossier de calidad** en PDF listo para entregar al
cliente o a la supervisión.

El flujo base es siempre el mismo:

```
Proyecto → Ubicaciones/Sectores → se asignan plantillas de ensayo
        → el técnico llena el ensayo en campo (offline, con fotos + GPS + firma)
        → supervisor aprueba (1 a 3 niveles) o levanta No Conformidad
        → Dossier: PDF consolidado, filtrable, con croquis y gráficos
```

Dos cosas lo diferencian de un formulario genérico y conviene entenderlas temprano:

1. **Las fichas de ensayo son datos, no código.** Un protocolo (Proctor, Cono de Arena,
   Granulometría, etc.) es una plantilla declarativa guardada en base de datos. Se pueden
   crear/editar fichas nuevas sin compilar ni publicar la app.
2. **Offline-first real.** La app móvil funciona completa sin internet; la nube es un
   espejo al que se empuja y del que se jala.

---

## 2. Plataformas

| Plataforma | Qué es | Dónde está | Estado |
|---|---|---|---|
| **Móvil** (Android, principal) | App de campo, React Native + Expo 54 / RN 0.81. Es donde se llena todo. | `src/` | En producción. AAB v2.3.0 (versionCode 32) compilado, **pendiente de subir a Play**. |
| **Web** | Panel de gestión/oficina, Next.js 14 (App Router). Casi paridad con móvil + lo que solo tiene sentido en PC (dashboards, importaciones masivas, paneles). | `flow-qaqc-web/` | En uso. |
| **Escritorio** | Electron que envuelve la web. | `flow-qaqc-desktop/` | Funciona; se corre en dev. |
| **Backend** | Supabase (Postgres + Auth + RLS + Realtime + Edge Functions) + AWS S3 para fotos/planos. | `supabase/` | Multi-tenant por `org_id`, RLS activa. |

Local en móvil: **WatermelonDB sobre SQLite** (`src/db/schema.ts`, ~40 tablas). La web lee
Supabase directo con caché local.

---

## 3. Conceptos del dominio (glosario mínimo)

Sin estos cinco no se entiende el resto:

- **Proyecto** — la obra. Contiene todo y es la unidad de permisos y de configuración.
- **Ubicación** — el elemento físico a controlar (Zapata Z-12, Losa piso 3, Km 4+200). En
  obra lineal se reemplaza por **sector / tramo / progresiva**.
- **Plantilla de protocolo** (`protocol_templates`) — la *ficha* del ensayo: qué se pregunta,
  qué se calcula, qué gráfico sale. Es dato editable.
- **Protocolo / ensayo** (`protocols`) — una instancia llenada de una plantilla, en una
  ubicación, en una fecha, por un usuario.
- **Muestra** (`samples`) — la muestra física de laboratorio, con su QR; de una muestra
  pueden salir varios ensayos.

---

## 4. Tipos de protocolo (el motor de fichas)

Es el corazón del sistema. Hay tres modos y **conviven en el mismo proyecto**:

| Tipo | Cómo se llena | Para qué sirve |
|---|---|---|
| **Clásico** | Lista de preguntas Sí / No / N.A. + comentario + foto por ítem. | Protocolos de verificación y liberación (encofrado, trazo, acero). |
| **Numérico** | Tablas de celdas con **fórmulas**, validación contra especificación, gráficos. | Ensayos de laboratorio (Proctor, granulometría, densidad, CBR). |
| **Híbrido** | Secciones clásicas + secciones numéricas en la misma ficha. | Concreto (verificación + resistencia de probetas). |

Capacidades del motor que conviene conocer:

- **Fórmulas** entre celdas, con funciones tipo `BUSCAR`, y **tablas auxiliares** de
  laboratorio (`flow-qaqc-web/lib/formulaEval.ts`, `lib/topoFormula.ts`).
- **Referencias entre fichas (`xref`)** — una celda de un ensayo puede leer el valor de
  *otro* ensayo (ej.: el DCC/CBR toma la densidad máxima de su Proctor). Se referencia por
  **ID** (sobrevive renumeraciones) y hay **grupos por regla en vivo** que se resuelven por
  fecha y se "hornean" al aprobar. Ver `src/services/XrefResolver.ts`, `XrefRefresh.ts`,
  `docs/fichas-llamadas-entre-fichas.md`.
- **Dictamen automático** — CONFORME / NO CONFORME calculado contra la especificación
  (`flow-qaqc-web/lib/protocolConformance.ts`).
- **Plantillas paramétricas** — una ficha que se expande en N ensayos según parámetros
  (`lib/parametricExpand.ts`).
- **Congelado al aprobar** — al aprobar, los valores calculados y los comentarios se
  congelan para que el PDF nunca cambie retroactivamente (`lib/freezeSnapshot.ts`).
- **Fail-safe**: una fila de ficha que no parsea degrada a clásico, no rompe la app.

Pipeline para crear fichas nuevas a partir del Excel del cliente:
[PIPELINE_CREACION_FICHAS.md](PIPELINE_CREACION_FICHAS.md) y
[FLUJO_EDICION_FICHAS.md](FLUJO_EDICION_FICHAS.md).

---

## 5. Inventario de funcionalidades

Leyenda: **M** = móvil, **W** = web. La columna *Flag* es el feature flag por proyecto que
la enciende (ver §8); vacío = siempre activa.

### 5.1 Núcleo — ensayos y aprobación

| Funcionalidad | Qué hace | M | W | Flag | Código |
|---|---|:-:|:-:|---|---|
| Llenado de ensayos | El formulario de campo: preguntas, celdas, fotos, firma, GPS. | ✅ | ✅ | — | `src/screens/ProtocolFillScreen.tsx` · `flow-qaqc-web/app/app/projects/[id]/protocols/[protocolId]/fill/` |
| Modos de llenado | Navegar los ensayos por **ubicación / sector / tipo / fecha / muestra**. Conviven. | ✅ | ✅ | `fill_by_*` | `src/screens/EnsayosScreen.tsx` · `.../ensayos/[mode]/` |
| Aprobación multinivel | 1 a 3 niveles de firma; aprobar, observar u observar en línea desde la lista. | ✅ | ✅ | `multi_level_approval` | `ProtocolAuditScreen.tsx` · `.../audit/` |
| No Conformidades | Levantar NC sobre un ensayo, con seguimiento y cierre. | ✅ | ✅ | — | `src/screens/NonConformityScreen.tsx` · `.../observations/` |
| Codificación correlativa | Código de ensayo por máscara configurable (`{TIPO}-{AA}{SEQ:4}`, con sector/fecha), con ámbito de reinicio. | ✅ | ✅ | `protocol_codes` | `lib/protocolCode.ts` |
| Papelera + numeración | Borrado recuperable, restaurar al próximo número libre, renumerar, y 3 políticas de borrado (`last_only` / inmutable / flexible). | ✅ | ✅ | — | `RecycleRestoreService.ts`, `RenumberService.ts` · `.../papelera/` |
| Firma y sello personal | Firma manuscrita por usuario, reutilizable. | ✅ | ✅ | — | `SignatureScreen.tsx`, `UserSignatureService.ts` |
| Tour / walkthrough | Onboarding guiado in-app. | ✅ | ✅ | — | `useTourStep.ts` · `app/walkthrough/` |

### 5.2 Dossier y salidas

| Funcionalidad | Qué hace | M | W | Flag | Código |
|---|---|:-:|:-:|---|---|
| Dossier PDF | El entregable: PDF consolidado y filtrable de los ensayos aprobados. | ✅ | ✅ | — | `DossierExportService.ts` · `.../dossier/` |
| PDF numérico | Render de tablas + gráficos + croquis. **Móvil y web son renderers espejo** — si tocás uno, tocá el otro. | ✅ | ✅ | — | `lib/numericPdfHtml.ts`, `lib/chartRenderer.ts` |
| Croquis | Plano/ortofoto con el pin del ensayo, embebido en el PDF. Cacheado por ensayo (JPEG) y pregenerado al guardar coordenadas. | ✅ | ✅ | `map_enabled` | `CroquisService.ts`, `CroquisCacheService.ts`, `lib/croquisHtml.ts` |
| Config de impresión | Tamaños, columnas, qué se muestra; se edita en la tuerca del Dossier. | ✅ | ✅ | `print_configs` | `lib/printConfig.ts` |
| Estampado de fotos | Marca cada foto de evidencia con logo, nombre, comentario, fecha y GPS. Config a nivel proyecto. | ✅ | ✅ | `projects.stamp_enabled` (columna) | `PhotoStampService.ts`, `StampContext.ts`, `lib/stamp.ts` |
| Export CSV / Excel | Salida tabular de ensayos (UTF-8 con BOM). | — | ✅ | — | `lib/csvEnsayos.ts`, `lib/csvExport.ts` |
| Etiquetas / QR | Impresión de etiquetas con QR para muestras. | ✅ | ✅ | — | `LabelPrintService.ts`, `lib/qrCodeGenerator.ts` |
| Reportes por correo | Reportes HTML programados (cron) con gráficos, por SES. Panel solo web. | — | ✅ | `module_email_reports` | `.../report-templates/` · `.github/workflows/report-mailer.yml` |

### 5.3 Geolocalización, GIS y topografía

| Funcionalidad | Qué hace | M | W | Flag | Código |
|---|---|:-:|:-:|---|---|
| Mapa del proyecto | Mapa con sectores GIS y pines de los ensayos; ortofoto propia georreferenciada. | ✅ | ✅ | `map_enabled` | `ProjectMapScreen.tsx` · `lib/orthophoto*.ts` |
| Captura GPS | Coordenada del ensayo al llenarlo, con precisión mínima exigible. | ✅ | — | `gps_capture_*` | `useGpsCapture.ts` |
| Sectores | Polígonos del proyecto; asignación automática de ensayo→sector por coordenada, con tolerancia. | ✅ | ✅ | — | `ProjectSectorsScreen.tsx`, `lib/sectorParser.ts` |
| Juegos de sectores | Varios juegos de sectores con **periodo de vigencia** (el sector correcto según la fecha del ensayo). | ✅ | ✅ | — | `lib/sectorSets.ts` |
| Carga topográfica | Coordenadas en masa (manual o CSV) por código, con **binding diferido** al ensayo que aún no existe. Jerarquía topo > GPS. | ✅ | ✅ | `module_topo` | `TopoCargaService.ts` · `.../topo-cargas/` |
| Cobertura topo/GPS | Alerta de qué ensayos no tienen coordenada. | ✅ | ✅ | `module_topo` | `topoCoverage.ts` · `.../topo-coverage/` |
| Planos y metrados | Visor de planos, anotaciones con prioridad y comentarios, medición sobre plano. | ✅ | ✅ | `module_plans` | `PlanViewerScreen.tsx` · `.../plans/` |

### 5.4 Obra lineal (carreteras) — v100b

Modo alternativo de proyecto (`project_type`: `edificaciones` / `obra_lineal` / `mineria`).
En obra lineal el ensayo **no se ubica por elemento sino por progresiva**: el tramo es el
sector, y progresiva/subtramo se calculan desde las coordenadas con un motor de *chainage*
que orienta por vecinos. El PDF muestra Tramo / Subtramo / Progresiva.
Código: `flow-qaqc-web/lib/linearProgress.ts`, `src/utils/featureFlags.ts`.
**Falta:** el dashboard de avance lineal y el editor de juegos desde la web.

### 5.5 Laboratorio y trazabilidad

| Funcionalidad | Qué hace | M | W | Flag | Código |
|---|---|:-:|:-:|---|---|
| Muestras | Muestra física con QR, ciclo de vida y los ensayos que salen de ella. | ✅ | ✅ | `fill_by_sample` | `SamplesScreen.tsx` · `.../samples/` |
| Escaneo QR | Abrir la muestra/ensayo escaneando. | ✅ | — | — | `QRScannerScreen.tsx` |
| Trazabilidad | Sesiones de trabajo con cronómetro y GPS en segundo plano, checklists y analítica (ej. ciclos de acarreo). | ✅ | ✅ | `traceability_module` | `src/screens/Traceability*.tsx` · `.../traceability/` |
| Equipos | Inventario de equipos de laboratorio y maquinaria, con certificados de calibración. | ✅ | ✅ | — | `CalibrationReportService.ts`, `useEquipment.ts` |
| Tablas auxiliares | Tablas de laboratorio usadas por las fórmulas de las fichas. | — | ✅ | — | `useLabAuxTables.ts` |
| Tablas resumen | Consolidado por tipo de ensayo (el "resumen de compactación" clásico). | ✅ | ✅ | `module_summary_tables` | `SummaryRowService.ts` · `.../summary/` |
| Carga histórica | Importar ensayos ya ejecutados antes de usar el sistema. | ✅ | ✅ | `historical_import` | `HistoricalScreen.tsx` · `lib/historicalImport.ts` |

### 5.6 Asistente IA "FLOW" — v85

Chat en lenguaje natural sobre el proyecto: consulta ensayos y avance, genera gráficos,
**ejecuta acciones** (crear ensayo, levantar NC, abrir una ficha, armar un dossier filtrado,
parte diario, detectar fuera de norma), con **voz, dictado por micrófono y modo manos
libres** (los comandos de manos libres respetan rol y flags). Incluye una "radiografía"
del proyecto en el prompt y resolución GPS→sector. También dicta dentro de las fichas.
Código: `src/screens/AIChatScreen.tsx`, `src/services/AIAssistantService.ts`,
Edge Functions `supabase/functions/ai-chat` y `ai-tts`. Setup:
[ASISTENTE_IA_SETUP.md](ASISTENTE_IA_SETUP.md).
**Falta:** prueba en dispositivo real y APK release con esto.

### 5.7 Dashboards y portafolio (v93, solo PC)

Dashboard estilo Power BI: vista de **portafolio** con mapa interactivo y drill-down a
proyecto, dashboard por proyecto con mapa operativo, y 13 pantallas llevadas a grid.
Gráficos con ejes configurables y persistidos por gráfico.
Código: `flow-qaqc-web/app/app/dashboard/`, `hooks/usePortfolioData.ts`,
`hooks/useDashboardData.ts`, `lib/chartMath.ts`.
**Falta:** validación visual del usuario.

### 5.8 Usuarios, accesos y administración

| Funcionalidad | Qué hace | M | W | Código |
|---|---|:-:|:-:|---|
| Roles | **CREATOR** (dueño del proyecto), **SUPERVISOR** (aprueba), **OPERATOR**/Técnico (llena), **VIEWER** (solo lee). | ✅ | ✅ | `src/services/UserAccessService.ts` |
| Accesos por proyecto | `user_project_access`, compartido móvil↔web vía Supabase. | ✅ | ✅ | `UserManagementScreen.tsx` · `.../users/` |
| Multi-tenant | Aislamiento por `org_id` con RLS, verificado con 2 organizaciones. | ✅ | ✅ | `supabase/fix_rls_all_tables.sql` |
| Auth | Email/password + **Google sign-in (web)**, cambio y reset de contraseña, biometría preparada. | ✅ | ✅ | `LoginScreen.tsx`, `BiometricService.ts` · `app/login/` |
| Proyectos DEMO | Un `VIEWER` sin proyecto real ve los proyectos demo; al asignarle uno real, desaparecen. | ✅ | ✅ | flag `projects.is_demo` |
| Import masivo por Excel | Usuarios, ubicaciones, sectores, equipos, trazabilidad y fórmulas topo, todo por Excel. | ✅ | ✅ | `src/services/*Importer.ts` · `lib/excelParser.ts` |
| Contactos | Directorio del equipo del proyecto, con integración a contactos del teléfono. | ✅ | ✅ | `module_contacts` |
| Notificaciones push | Diseñado y documentado. **No implementado todavía.** | — | — | `lib/pushNotification.ts` (parcial) |

### 5.9 Sincronización y datos

- **Offline-first**: todo se escribe local (WatermelonDB) y una cola lo empuja cuando hay
  red. `src/services/SyncQueueService.ts`, `SyncWorker.ts`, `SupabaseSyncService.ts`,
  `useSyncQueue.ts`.
- **Tiempo real** (v70): con la app abierta, los cambios llegan por Supabase Realtime —
  `hooks/useRealtimeProject.ts` (web, montado en el layout del proyecto) y
  `useRealtimeProjectPull.ts` (móvil). Además hay recarga manual: botón en 13 páginas web y
  pull-to-refresh en 8 pantallas móviles.
- **Fotos y planos en S3** (AWS), con descarga y sincronización propias:
  `S3PhotoService.ts`, `S3SyncService.ts`, `S3PhotoDownloader.ts`.
- **Backups**: cron diario en `.github/workflows/backup.yml`; restauración documentada en
  [RESTORE.md](RESTORE.md).
- ⚠️ **Ojo con esto:** todo `UPDATE` manual en Supabase debe escribir un `updated_at`
  **nuevo**; con el mismo timestamp el pull salta la fila y el cambio nunca llega a la app.

---

## 6. Rutas principales del código

```
D:\VxP_QAQC_Automatizado\
├── src/                      → app MÓVIL (React Native)
│   ├── screens/  (46)          pantallas: una por funcionalidad
│   ├── services/ (46)          lógica de negocio: sync, S3, PDF, xref, importadores
│   ├── db/                     WatermelonDB: schema.ts + models + migrations.ts
│   ├── utils/    (33)          featureFlags.ts vive acá (fuente de verdad de flags)
│   ├── components/ (41), hooks/ (10), i18n/, context/, theme/
│   └── navigation/
├── flow-qaqc-web/            → app WEB (Next.js 14, App Router)
│   ├── app/app/projects/[id]/  el panel del proyecto (una carpeta por módulo)
│   ├── app/api/                20 endpoints server-side (S3, borrados, ortofoto, import)
│   ├── lib/      (~60)         espejo de la lógica de móvil (PDF, fórmulas, croquis…)
│   └── hooks/    (33)          un hook por módulo de datos
├── flow-qaqc-desktop/        → Electron que envuelve la web
├── supabase/                 → 58 .sql de migración + 5 Edge Functions
│                               (admin-users, ai-chat, ai-tts, eco, send-notification)
├── docs/                     → 30 documentos (flags, pipelines, runbooks, setups)
├── android/                  → build nativo (Gradle local, no EAS)
└── scripts/                  → utilidades (validador de fichas, seeds, mantenimiento)
```

**Por dónde empezar a leer**, en este orden: `docs/FLAGS_MAPA.md` (te dice qué puede hacer
el sistema, flag por flag) → `src/utils/featureFlags.ts` → `src/screens/ProtocolFillScreen.tsx`
(el llenado, que es el 60% del producto) → `flow-qaqc-web/lib/numericPdfHtml.ts` (la salida).

---

## 7. Cómo se corre

```bash
# Móvil (dev client con hot reload)
cd "D:\VxP_QAQC_Automatizado" && npx expo start --dev-client
cd "D:\VxP_QAQC_Automatizado" && npx expo run:android      # build e instala

# Web
cd "D:\VxP_QAQC_Automatizado\flow-qaqc-web" && npm run dev

# Escritorio (2 terminales: next dev + electron)
cd "D:\VxP_QAQC_Automatizado\flow-qaqc-desktop" && npm start
```

Notas que ahorran horas:

- Dependencias nativas: **siempre** `npx expo install <pkg> -- --legacy-peer-deps`, nunca
  `npm install` directo.
- `react-native-reanimated` está **fijado en 3.19** (arquitectura vieja). Nunca 4.x.
- El build de Android es **local con Gradle**, no EAS. Keystore de release fuera del repo.
- La lentitud "la primera vez" en escritorio es la compilación on-demand de `next dev`, no
  la app: medir performance solo en build de producción.

---

## 8. Configuración por proyecto (feature flags)

Casi todo lo de §5 se enciende o apaga **por proyecto**, no por build. Son **40 flags** en
`projects.feature_flags` (JSON), fuente de verdad `src/utils/featureFlags.ts`
(`ProjectFeatureFlags` + `DEFAULT_FEATURE_FLAGS`), catálogo completo en
[FLAGS_MAPA.md](FLAGS_MAPA.md).

Se editan en móvil con *mantener presionado el proyecto → Configurar módulos*
(`ProjectConfigScreen`) y en web en Configuración del proyecto. Solo el **Creador** los
cambia y se propagan a todos los usuarios del proyecto.

Dos reglas que ya causaron bugs: los guardados **parciales deben mergear contra la nube**
(no pisar con el estado local viejo), y hay flags **hijos** (`gps_capture_*` depende de
`map_enabled`; los `topo_*` de `module_topo`) que no se pueden activar sueltos.

Grupos de flags: protocolos, modos de llenado, codificación, módulos opcionales del menú,
topográfico, GPS, trazabilidad, impresión PDF y muestras.

---

## 9. Estado real: qué está terminado y qué no

**Terminado y en uso:** núcleo de ensayos (clásico/numérico/híbrido), aprobación multinivel,
NC, dossier PDF con croquis y gráficos, estampado de fotos, codificación y papelera, GIS +
ortofoto, módulo topográfico, trazabilidad, muestras con QR, equipos, tablas resumen, carga
histórica, importadores Excel, multi-tenant con RLS, sync offline + tiempo real, backups,
asistente IA v85, dashboards v93, obra lineal v100b.

**Code-completo pero pendiente de una acción externa:**

| Qué | Qué falta |
|---|---|
| Reportes por correo | Setup de AWS SES + secrets de GitHub ([REPORTES_CORREO_SETUP.md](REPORTES_CORREO_SETUP.md)) |
| Release Android | Subir el AAB v2.3.0 (versionCode 32) a Google Play |
| Juegos de sectores v102 | Aplicar el SQL v102 en la nube |
| Dashboards v93 / IA v85 | Validación en dispositivo/pantalla real |

**No implementado todavía:** notificaciones push, dashboard de avance de obra lineal, editor
de juegos de sectores desde la web, modo minería, i18n (la infraestructura ES/EN/PT existe
en `src/i18n/` pero no se completó), backlog de GIS (RTK, pirámide XYZ, clustering) y la
Fase 6 de borrado para muestras.

⚠️ **Antes de generar cualquier AAB/APK:** hay llenados de desarrollo que deben quedar
ocultos (`+Dev`, `Autollenar`, `DevSeedService`). Verificarlo siempre.

---

## 10. Advertencias para quien toque el código

1. **PDF: móvil y web son espejos.** `src/services/DossierExportService.ts` y
   `flow-qaqc-web/lib/numericPdfHtml.ts` deben cambiar juntos o los PDF divergen según
   quién los generó.
2. **`updated_at` siempre nuevo** en cualquier UPDATE manual (ver §5.9).
3. **Borrados destructivos**: atómicos (RPC transaccional), acotados por id, con respaldo
   previo e idempotentes. Nunca borrado masivo derivado de datos parciales del pull.
   Ver [BORRADO_PROYECTO.md](BORRADO_PROYECTO.md) y [OPERACIONES_DIRECTAS.md](OPERACIONES_DIRECTAS.md).
4. **Fichas**: se editan directo en Supabase con backup y rollback, no por Excel. Runbook en
   [FLUJO_EDICION_FICHAS.md](FLUJO_EDICION_FICHAS.md), validador en `scripts/fichaValidate.ts`.
5. **CSV siempre UTF-8 con BOM**, o Excel rompe los acentos.
6. **`col_budget` del PDF numérico**: ser conservador (compact 32-36, normal 38-40); los
   pesos subestiman y arriba de 40 el contenido choca con el pie de página.
