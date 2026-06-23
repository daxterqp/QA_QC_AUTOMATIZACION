# 🏗️ Flow_PM — Blueprint Maestro de Construcción + Ecosistema Flow

Documento maestro para levantar **Flow_PM** (Producción, Personal/Equipos, Costos y
Presupuestos) heredando la "esencia" técnica de **Flow_QA/QC**, y dejar QA/QC listo
para comunicarse con él. Flow_PM es un **proyecto nuevo e independiente** (otra carpeta/
repo, su propio Supabase y su propio bucket S3).

**Decisiones tomadas:** Flow_PM = **Móvil + Web** · **`org_id`-ready desde el día 1** ·
regla "calidad liberada" = **todos los protocolos APROBADOS** (la API la expone siempre;
un flag en PM decide si la exige).

> 📦 El esqueleto reutilizable ya está empaquetado en la carpeta **`flow-pm-starter/`**
> (web + móvil + este blueprint + README). Subila como base del repo nuevo.

---

## 0. Resumen ejecutivo (decisiones de arquitectura)

| Decisión | Recomendación | Por qué (corto) |
|---|---|---|
| ¿Apps comparten BBDD? | **NO. Un Supabase project por app** (Flow_PM = proyecto nuevo) | Independencia real, blast-radius aislado, migraciones/escala separadas |
| Aislamiento de tenants | **Pooled: 1 DB por app + `org_id` en todo + RLS por org** | Estándar SaaS, barato y mantenible |
| Comunicación inter-app | **Edge Functions (request/response) con API key M2M** + eventos opcionales | Verdad síncrona para los "guardas"; eventos para UX |
| Stack Flow_PM | **Idéntico a QA/QC** | Reuso máximo, cero curva nueva |
| Repos | **Repo nuevo separado** `flow-pm` | "Completamente independiente" |
| S3 | **Bucket separado** `flow-pm-files` | Aislamiento de archivos por app |

---

## FASE 1 — Arquitectura y Estrategia de Base de Datos (SaaS)

### 1.1 ¿Misma BBDD o separadas? → **SEPARADAS (un Supabase project por app)**
Flow_QA/QC mantiene su proyecto; **Flow_PM crea uno nuevo**. Cada app es dueña de su
esquema, migraciones, RLS, límites y backups. No compartir porque los dominios son
enormes y distintos (Calidad: protocolos/ensayos/planos; PM: partidas/avances/costos):
compartir DB acopla migraciones, mezcla RLS y una caída afecta a ambas. La comunicación
que sí se necesita se resuelve con una **API delgada** (§1.3). Trade-off aceptado: no hay
JOINs cross-app → se consultan por API (correcto para multi-app).

### 1.2 Multi-tenant: **RLS por `org_id` (pooled)** — NO schemas, NO DB-por-tenant
- Una sola base por app, con **`org_id uuid` en TODAS las tablas de datos** + RLS por org.
- **No "schema por tenant":** N empresas = N copias del esquema → cada migración se
  multiplica y el pooling sufre. **No "DB por tenant":** caro de operar (N proyectos).
- Esquema de identidad/tenant:
  ```sql
  organizations (id uuid pk, name text, slug text unique, created_at timestamptz default now());
  -- cada usuario pertenece a UNA org (membership table si en el futuro 1 user ∈ N orgs):
  alter table users add column org_id uuid references organizations(id);
  -- denormalizar org_id en TODA tabla de datos para RLS simple y rápido:
  -- projects, locations, <toda_tabla_hija> ... add column org_id uuid not null;
  ```
- Helper RLS (espejo de `app_user_id`/`can_access_project` de QA/QC):
  ```sql
  create or replace function public.auth_org() returns uuid
  language sql stable security definer set search_path = public as $$
    select org_id from public.users where auth_id = auth.uid()
  $$;
  ```
  Política por tabla: `using (org_id = auth_org()) with check (org_id = auth_org())`,
  combinada con el acceso por proyecto (`can_access_project`). Índices `(org_id)` y
  `(org_id, project_id)` en tablas grandes.
- **Identidad entre apps:** misma empresa ⇒ **mismo `org_id` (UUID)** en ambas DBs (hoy se
  siembra idéntico; a escala, una autoridad de identidad/SSO compartida).
- **Retrofit de QA/QC (para alinear el ecosistema):** misma receta — `organizations`,
  `users.org_id`, `org_id` en cada tabla (backfill con la org actual), `auth_org()`, y
  `AND org_id = auth_org()` en las políticas. Por fases, no bloquea Flow_PM.

### 1.3 Comunicación inter-app: **Edge Functions M2M (verdad síncrona) + eventos**
1. **Request/response síncrono** vía **Edge Functions** (QA/QC expone, PM consume) con
   **API key M2M**. Es la **fuente de verdad** para los "guardas" (ej. "¿sector liberado?").
2. **Eventos (opcional):** trigger Postgres en `protocols` (→ APPROVED/REJECTED) → webhook a
   Flow_PM, que **cachea** el estado para UX. El cache NUNCA reemplaza la verdad síncrona.

No DB-to-DB directo (FDW/dblink): acopla esquemas, rompe el aislamiento por tenant. No solo
webhooks: el cache puede estar viejo en el instante del guarda → carrera.

---

## FASE 2 — Extracción de la "Esencia" (manual de boilerplate)

### 2.1 Stack EXACTO (Flow_PM usa lo mismo)
- **Web (`flow-pm-web/`):** Next.js **14.2.3** · React 18 · TS 5 · Tailwind 3.3 ·
  `@supabase/ssr` + `@supabase/supabase-js` · `@tanstack/react-query` · `lucide-react` ·
  `jszip` · `@aws-sdk/client-s3` + `s3-request-presigner` · `clsx` + `tailwind-merge`.
  (Recharts/Leaflet/GeoTIFF/three/sharp/xlsx **solo si** PM los necesita.)
- **Móvil (`flow-pm/`):** Expo **~52** · RN **0.76.9** · `@nozbe/watermelondb` ·
  supabase-js · aws-sdk · gesture-handler · reanimated · react-native-svg ·
  expo-local-authentication · async-storage · netinfo. (maps/camera/gl/location si captura en campo.)

### 2.2–2.4 Qué copiar y qué reemplazar
La carpeta **`flow-pm-starter/`** ya trae el esqueleto separado (web + móvil). El detalle
de qué es genérico vs dominio QA/QC está en `flow-pm-starter/README.md`. Resumen:
- **Copiar (genérico):** configs (package.json, tsconfig, tailwind, next.config, babel,
  app.json), auth + providers + middleware, clientes Supabase, i18n core, theme/colores,
  S3 (upload/delete/project + backup), motor de sync (SyncWorker/SyncQueue), componentes UI
  base (PageHeader/AppHeader/Toast/modales/pickers), hooks de infra, utils genéricos, modelos
  base (User/Project/UserProjectAccess), login + cambio de contraseña.
- **Reemplazar por dominio PM:** protocolos/ensayos/dossier/planos/ortofoto/trazabilidad/
  summary → Partida/Tarea · Reporte de avance · Plantilla de costos (APU) · Reporte de
  producción · Tareo de personal/equipos · Frentes.

### 2.5 Motor de SYNC (lo más valioso de heredar)
- **100% reutilizable:** `SyncWorker` (tick 15s, dequeue, paraleliza, drain online),
  `SyncQueueService` (outbox `sync_queue`), `S3PhotoService`.
- **A reescribir:** `SupabaseSyncService.pushProject()/pullProject()` listan ~40 tablas a
  mano. Para PM: cambiar la lista de tablas + los opTypes en `SyncWorker.handle()`.
- **Mejora recomendada:** refactor a **schema-driven** (`syncTables.ts` declarativo) para que
  agregar tablas sea config, no editar 200 líneas.

### 2.6 Renombrado / independencia
- repo `flow-pm`; package name `flow-pm`/`flow-pm-web`; `app.json` scheme `flowpm`, bundle
  `com.vxp.flowpm`. **Nuevo Supabase project** (URL+anon en `config/supabase.ts`+`.env.local`).
  **Nuevo bucket** `flow-pm-files` (config/aws.ts). i18n `STORAGE_KEY → flowpm_language`.
  `schema.ts` a **version 1** con tablas PM; `migrations.ts` vacío. Copiar `backup.yml`
  apuntando al nuevo Supabase + bucket.

### 2.7 Pasos de scaffolding
1. Copiar `flow-pm-starter/web` → repo web; `flow-pm-starter/mobile` → repo móvil.
2. Crear Supabase project + bucket S3 + secretos; setear envs.
3. Migración inicial: `organizations`, `users(org_id)`, `projects(org_id)`,
   `user_project_access`, `auth_org()` + RLS por org; sembrar la org.
4. Modelar el dominio PM (tablas + RLS + WatermelonDB models).
5. Cablear sync (tablas/opTypes) y navegación.
6. Verificar: `tsc` web+móvil 0, login real, sync push/pull, S3, borrado/restore.

---

## FASE 3 — Flow_QA/QC listo para el ecosistema (YA IMPLEMENTADO en este repo)

> Provider = Flow_QA/QC. Consumer = Flow_PM. Archivos creados en ESTE repo:
> `supabase/v52_eco_api.sql` (3 funciones SQL) + `supabase/functions/eco/index.ts` (Edge
> Function M2M). El cliente de referencia para PM está en `flow-pm-starter/_ecosistema/ecoClient.ts`.

### 3.1 Auth máquina-a-máquina
- Edge Function `eco` con **`verify_jwt = false`** (el caller es una máquina). Autentica por
  `Authorization: Bearer <ECO_API_KEY>` en **tiempo constante** contra el secreto `ECO_API_KEY`.
- Lee con **service role**; las funciones SQL están revocadas a anon/authenticated.
- Escala multi-tenant: tabla `eco_api_keys(org_id, key_hash, scopes, revoked)` → una key por
  empresa + scope por `org_id`. (v1: una key estática global.)

### 3.2 Endpoints
```
GET /eco/protocol-status?protocol_id=...
    → { id, project_id, status, sector_id, sample_id, protocol_code, updated_at }

GET /eco/quality-released?scope=sector|sample&id=...&rule=all_approved
    → { scope, id, rule, total, approved, pending, rejected, released:boolean }
    (rule default 'all_approved' = TODOS aprobados; 'any_approved' disponible)

GET /eco/ensayo-summary?project_id=...
    → { project_id, total, approved, submitted, rejected, in_progress }
```
Todos exigen `Authorization: Bearer <ECO_API_KEY>`. Respuestas solo lectura.

### 3.3 Aplicar / desplegar (lo hace el usuario)
```bash
# 1) Funciones SQL (en Supabase de QA/QC): correr supabase/v52_eco_api.sql
#    (SQL Editor del dashboard, o supabase db push, o psql con el connection string).

# 2) Edge Function (requiere Supabase CLI logueado al proyecto):
cd /d D:\VxP_QAQC_Automatizado
supabase functions deploy eco --no-verify-jwt
supabase secrets set ECO_API_KEY=<una key aleatoria larga>

# 3) Probar:
curl -H "Authorization: Bearer <ECO_API_KEY>" \
  "https://<ref>.functions.supabase.co/eco/ensayo-summary?project_id=<algún projectId>"
```

### 3.4 Eventos (opcional)
Trigger en `protocols` (status → APPROVED/REJECTED) → función que hace webhook (pg_net) a un
endpoint de Flow_PM firmado con HMAC. PM cachea para UX; el guarda real consulta §3.2.

---

## FASE 4 — Cómo usa Flow_PM la API (guarda de ejemplo)

Caso: *"Producción no puede marcar un sector como completado si Calidad no lo liberó."*
```ts
// Flow_PM (server-side): lib/ecoClient.ts  (ver flow-pm-starter/_ecosistema/ecoClient.ts)
const r = await ecoClient.qualityReleased('sector', sectorId);
if (project.flags.require_quality_release && !r.released) {
  throw new Error(`Calidad no liberada: ${r.approved}/${r.total} protocolos aprobados.`);
}
// si require_quality_release está OFF, PM no bloquea (la API igual responde la verdad).
```

---

### Verificación
- Fase 3: `eco_*` creadas · Edge Function 401 sin key / 200 con key / valores correctos
  (1 protocolo APPROVED en un sector → `released:true`).
- Blueprint + `flow-pm-starter/` listos para arrancar `flow-pm` sin re-decidir arquitectura.
