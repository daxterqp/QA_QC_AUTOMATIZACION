# Runbook — Activar multi-tenant `org_id` + eco org-scoped (Flow_QA/QC)

Aplica el backbone multi-empresa que cierra el god-mode cross-empresa, org-scopea el borrado
y la API `eco`. **Data ficticia → riesgo bajo + rollback simple.** Aplicar **en orden**.

> Se puede hacer TODO desde **Supabase Dashboard → SQL Editor** (no hace falta MCP ni CLI).
> Para la Edge Function `eco` sí hace falta el **Supabase CLI** o el deploy por MCP.

> **ORDEN CORRECTO (revisado por panel adversarial — importante):**
> parchear código TS → **desplegar `admin-users` y `eco`** → aplicar **v53** → **verificar org_id NULL = 0
> y que tu CREATOR tenga org** → aplicar **v54** → **v55**. El deploy de `admin-users` va ANTES de v54
> porque cierra un takeover cross-empresa (issue B) que la RLS restrictiva NO tapa (service_role la bypassa).

## 0. Pre-check
- Confirmá que existe la función `app_user_role()` / `app_user_id()` (de v47). Las nuevas se apoyan en ellas.
- Backup: ya hay backup diario; si querés, corré el workflow `Backup Supabase DB` a mano antes.
- **Re-desplegá las Edge Functions** con el código nuevo ANTES de v54:
  `supabase functions deploy admin-users` y `supabase functions deploy eco --no-verify-jwt`.

## 1. Aplicar migraciones (en orden, SQL Editor)
1. **`supabase/v53_org_multitenant.sql`** — crea `organizations` + org default (UUID
   `11111111-1111-4111-8111-111111111111`), agrega `org_id` a todas las tablas (**DEFAULT + NOT NULL**,
   backfill a esa org), trigger `set_org_id` (**fuerza** org de sesión en cada insert/update; anti-spoof),
   `auth_org()` (con COALESCE a la org demo en single-tenant) y `can_access_project` org-scoped.
   - **Verificá inmediatamente (debe dar 0 en ambas):**
     ```sql
     select count(*) from public.users    where org_id is null;   -- = 0
     select count(*) from public.projects where org_id is null;   -- = 0
     select id, name, role, org_id from public.users where role = 'CREATOR';  -- org_id NO null
     ```
     Si tu CREATOR tuviera org_id null, NO sigas con v54 (te bloquearías): revisá el backfill primero.
2. **`supabase/v54_rls_org.sql`** — política **restrictiva** `org_guard` por tabla (acota a la org; no abre nada).
3. **`supabase/v55_eco_org.sql`** — `eco_api_keys` + funciones `eco_*` org-scoped. (Reemplaza v52; si no aplicaste v52, igual aplicá este.)

> Si una corrida falla a mitad, es idempotente (`add column if not exists`, `set default/not null` repetibles,
> `drop policy if exists`): se puede re-correr. Ante la duda, ver Rollback (§5).
>
> **Nota sobre el COALESCE de `auth_org()`:** mientras sos single-tenant, un usuario sin fila en `users`
> cae a la org demo (evita lockout/sync roto). **Al pasar a multi-tenant REAL (clientes), QUITÁ el coalesce**
> (dejá solo el `select org_id from users where auth_id = auth.uid()`) para que un auth.uid() sin fila no
> vea la org demo. La frontera de escritura por service_role la garantiza el código TS (`admin-users`), no la RLS.

## 2. Verificar aislamiento (prueba de 2 empresas — clave)
En el SQL Editor:
```sql
-- a) Sigo viendo mi data (misma org): debe devolver tus proyectos.
select count(*) from projects;   -- ejecutado como tu usuario web/móvil logueado

-- b) Crear una 2ª empresa + verificar que NO se cruza:
insert into organizations(id,name,slug,created_at,updated_at)
values ('22222222-2222-4222-8222-222222222222','Empresa B','empresa-b',
        (extract(epoch from now())*1000)::bigint,(extract(epoch from now())*1000)::bigint);
-- (Opcional) crear un user de prueba en Auth, linkearlo a Empresa B, loguear y confirmar
-- que NO ve proyectos/ensayos/archivos de la Empresa A. can_access_project(<proj A>) debe dar false.
```
- Corré el **advisor de seguridad** (Dashboard → Advisors): no debe haber políticas permisivas nuevas.

## 3. Edge Function `eco` (org-scoped)
- Deploy: `supabase functions deploy eco --no-verify-jwt` (o por MCP `deploy_edge_function`).
- **Ya NO se usa el secreto `ECO_API_KEY`.** En su lugar, registrá una key por empresa (guardamos solo el hash):
```sql
-- Generá una key aleatoria larga (ej. openssl rand -hex 32) y guardá SU HASH:
insert into public.eco_api_keys(org_id, key_hash, label, created_at)
values ('11111111-1111-4111-8111-111111111111',
        encode(digest('<TU_API_KEY_EN_CLARO>','sha256'),'hex'),  -- requiere pgcrypto (lo crea v53)
        'flow-pm', (extract(epoch from now())*1000)::bigint);
```
- Flow_PM consume con `Authorization: Bearer <TU_API_KEY_EN_CLARO>` (el Edge la hashea y resuelve la org).
- Probar: `curl -H "Authorization: Bearer <KEY>" "https://<ref>.functions.supabase.co/eco/ensayo-summary?project_id=<projA>"`
  → datos solo de esa org; sin key / key inválida → 401.

## 4. Código (ya en el repo, va junto a las migraciones)
- `flow-qaqc-web/lib/serverAuth.ts`: `getServerUser()` ahora trae `orgId`.
- `supabase/functions/admin-users/index.ts`: estampa `org_id` del CREATOR en usuarios/accesos creados **y
  rechaza (403) tocar usuarios de otra org** en update/delete + 409 si el CREATOR no tiene org (re-deploy).
- `supabase/functions/eco/index.ts`: org-scoped (re-deploy).
- `supabase/v44_delete_protocol_to_recycle.sql`: el grant ya NO incluye `anon` (era una regresión latente
  en re-deploy/restore). Si re-aplicás v44 alguna vez, ya queda solo `authenticated`.
- **Móvil: SIN cambios.** El `org_id` lo pone el trigger en el server; el pull viene filtrado por RLS; el
  sync schema-driven ignora la columna `org_id` que no tiene local. No rompe push ni pull.

## 5. Rollback (si algo del sync/app se rompe)
- RLS: las políticas `org_guard` son **restrictivas**; para neutralizarlas temporalmente por tabla:
```sql
drop policy if exists org_guard on public.<tabla>;   -- vuelve al comportamiento pre-org en esa tabla
```
- `can_access_project`: si hiciera falta, volver a la versión sin org (creator OR dueño OR miembro).
- Como la data es ficticia, el peor caso se resuelve recreando la base desde el backup diario.

## 6. Pendiente que necesita tu mano (no es de este runbook pero relacionado)
- **Rotar la clave AWS** expuesta (consola IAM) + IAM mínimo por bucket → para la fase S3 (firma server-side).
- El **vaciado de bucket + esquema `orgs/<org>/projects/<id>`** y el **monorepo** quedaron para hacer atendidos.
