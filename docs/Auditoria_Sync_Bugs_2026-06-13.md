# Auditoría de calidad y sincronización — 2026-06-13

Registro de las **6 pasadas sistemáticas de búsqueda de bugs** (3 generales + 3 enfocadas en
push/pull de información) realizadas sobre el monorepo S-CUA, los **bugs corregidos** y los
**hallazgos diferidos** (que requieren tu decisión por implicar cambios de comportamiento o
costo/beneficio que conviene que valides).

---

## A. Bugs CORREGIDOS en esta sesión

### A1. `protocol_summary_rows` con tipos `uuid` → tabla vacía (Tablas Resumen no salían en PC)
- **Causa raíz:** la migración v38 declaró `project_id/protocol_id/template_id` como `uuid`, pero
  todos los ids del sistema son `TEXT` (WatermelonDB no genera UUID válidos). El upsert fallaba en
  silencio (`invalid input syntax for type uuid`). El celular mostraba los ensayos desde su copia
  **local**; la PC, que depende solo de la nube, no mostraba nada.
- **Fix:** `supabase/v38b_fix_summary_rows_types.sql` (ALTER uuid→text + RLS permisiva). Fuente v38
  corregida para instalaciones nuevas.
- **Acción tuya:** correr `v38b` en el SQL Editor.

### A2. Opciones de lista por rango de matriz (`#from:#to`) desalineadas con celdas vacías
- **Causa:** se filtraban las celdas vacías **antes** de recortar el rango, así los índices 1-based
  del usuario dejaban de corresponder a las filas reales de la matriz.
- **Fix:** recortar primero, limpiar vacíos después. Corregido en 3 archivos:
  `src/components/NumericTable.tsx`, `flow-qaqc-web/components/numeric/NumericTable.tsx`,
  `flow-qaqc-web/lib/historicalImport.ts`.

### A3. Cursor incremental de Tablas Resumen no determinista
- **Fix:** se agregó `.order('updated_at', { ascending: true })` al pull incremental (web
  `summarySync.ts` y móvil `SummaryRowService.ts`) → el cursor avanza al máximo realmente leído,
  seguro ante truncamiento.

### A4. Caché local de Tablas Resumen sin validar forma → posible crash
- **Fix:** `summarySync.load()` valida el esquema del JSON parseado (no-array, `rows` objeto,
  `cursor` numérico) antes de usarlo.

### A5. Agregación `count` incluía NaN (celdas vacías/texto)
- **Fix:** `aggregate(...,'count')` ahora cuenta solo valores finitos (web + móvil `summaryTable.ts`).

### A6. RLS de `plan_measurements` basada en `auth.uid()` → 0 filas para cliente anon
- **Causa:** la app usa la **anon key** (sin sesión Supabase Auth); las políticas con
  `auth.uid()::text` no hacían match → las mediciones de planos no se leían/escribían en la nube.
- **Fix:** `supabase/v40_fix_plan_measurements_rls.sql` (política permisiva, alineada con el resto).
- **Acción tuya:** correr `v40`.

### A7. Push masivo del móvil pisaba la configuración del proyecto administrada por la web (CRÍTICO)
- **Causa:** el push del registro `projects` enviaba **toda** la fila sin guardia de frescura,
  incluyendo `feature_flags`, `map_tile_url` y las columnas de ortofoto. Si el CREADOR cambiaba un
  flag en la web, cualquier sync del celular (que ocurre al enfocar pantallas) reescribía el valor
  fresco con su copia vieja. Además corrompía el JSONB (se enviaba como string escalar — la web ya
  tenía un *workaround* defensivo en `useProjects.ts` que confirma que esto pasaba en producción).
- **Fix:** `src/services/SupabaseSyncService.ts` — el push masivo **omite** esas columnas
  (`PROJECT_CLOUD_OWNED_COLS`). El upsert `merge-duplicates` conserva el valor de la nube. La
  escritura legítima desde el móvil sigue por su ruta dedicada (ProjectConfigScreen).

### A8. JSONB doble-codificado: `summary_config_json`
- **Fix:** al subir `protocol_templates`, se `JSON.parse` de `summary_config_json` (igual que ya se
  hacía con `points_json`) para no guardar un string escalar en la columna jsonb.

### A9. Datos creados en campo se perdían al pull si el push previo fallaba
- **Causa:** `plan_annotations`, `annotation_comments`, `annotation_comment_photos` y
  `plan_measurements` usaban *cloud-wins* incondicional. Si el push previo fallaba (sin señal en
  obra), el pull pisaba la anotación/medición recién hecha con la versión vieja del remoto.
- **Fix:** se cambiaron a `prepareFreshOverride` (last-write-wins por fila), el mismo criterio ya
  aplicado al dominio de protocolos.

---

## B. Hallazgos DIFERIDOS (requieren tu decisión — no los toqué para no cambiar el comportamiento de sync sin que lo valides)

### B1. Paginación de lecturas (límite de 1000 filas) — VERIFICAR
- Las lecturas de pull (`fetchAll` móvil y varios hooks web: `useHistorical`, `useDossier`,
  `useLocations`) hacen `.select('*')` sin `.range()`. **Si** tu proyecto Supabase tiene configurado
  `db-max-rows` (PostgREST suele limitar a 1000), proyectos grandes truncarían silenciosamente las
  filas más allá de 1000 — y en el móvil, la limpieza de huérfanos podría **borrar** filas locales
  que solo quedaron "fuera de página".
- **Por defecto Supabase NO impone ese límite**, por eso no lo cambié a ciegas. **Acción:** confirma
  en Supabase → Settings → API el valor de "Max rows". Si está en 1000, implemento paginación por
  rangos en todas las lecturas. Bajo: no impacta hoy si el límite no está puesto.

### B2. Propagación de borrados (resurrección)
- El push es solo upsert. Para tablas sin un helper de borrado estricto (`protocol_items`,
  `evidences`, `non_conformities`, `plan_annotations`, etc.), un borrado **local** no se propaga a la
  nube y la fila "revive" en el siguiente pull. Tablas con helper estricto (protocolos, sectores,
  sesiones, etc.) sí propagan.
- **Opciones:** (a) agregar op `DELETE_*` al outbox por cada entidad borrable, o (b) columna
  `deleted_at` (tombstone) sincronizada. Es un cambio arquitectónico; lo dejo para diseñarlo contigo.

### B3. Re-entrancia push/pull
- `pullProjectFromCloud` deduplica por proyecto, pero `syncProject`/`pushProjectToSupabase` no
  comparten ese guard. Dos sync concurrentes (enfoque de pantalla + guardado) pueden solaparse.
  WatermelonDB serializa los `database.write`, así que el riesgo real es acotado, pero conviene un
  mutex por proyecto. Cambio de bajo riesgo pero transversal — lo propongo aparte.

### B4. Coerción `boolean null → false` en checklist tri-estado
- `filterToLocalSchema` convierte `null → false` para columnas boolean. Para `has_answer` es correcto
  ("no respondido"), pero para columnas opcionales de checklist (`is_compliant`/`is_na` en
  `work_session_form_items`) un `null` legítimo ("desconocido") se vuelve `false`. Recomendación:
  no coercer cuando la columna es `isOptional`. Requiere validar que no rompa el scoring previo.

### B5. Push "fire-and-forget" de resumen y de ocultar-tipo
- `SummaryRowService.upsertSummaryRow` y el toggle `is_hidden` empujan a Supabase sin outbox. Si el
  dispositivo está offline en ese momento, esa escritura puntual no se reintenta. **Mitigación
  existente:** el `backfillSummary` recrea filas faltantes al abrir la vista online, y el push masivo
  reintenta `protocol_templates`. Recomendación: enrutar ambos por el outbox `sync_queue` para
  durabilidad total. Bajo impacto hoy por los backstops.

### B6. Frescura de caché web del Dossier (`useProjectPreload`, staleTime 10 min)
- El preload del dossier cachea items+evidencias 10 min; un cambio recién sincronizado puede tardar
  en reflejarse. Es un *trade-off* rendimiento vs. frescura: bajar el `staleTime` recarga más seguido.
  Lo dejo a tu criterio (puedo ponerlo en 60–120 s + `refetchOnWindowFocus`, o invalidar el preload
  tras cada edición).

---

## C. Estado de verificación
- `npx tsc --noEmit` móvil → **0 errores**.
- `npx tsc --noEmit` web → **0 errores**.
- Build desktop (`npm run build`) → **exit 0**.

## D. SQL pendientes de correr (SQL Editor de Supabase)
1. `supabase/v38b_fix_summary_rows_types.sql` (Tablas Resumen).
2. `supabase/v39_template_hidden_migration.sql` (ocultar tipo de ensayo).
3. `supabase/v40_fix_plan_measurements_rls.sql` (mediciones de planos).
