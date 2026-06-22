# Plan de verificación cruzada móvil ↔ desktop — Flow-QA/QC

## Contexto

El móvil sube datos a Supabase usando `pushProjectToSupabase` desde WatermelonDB, y los baja con `pullProjectFromCloud`. El desktop (Next.js) escribe/lee directamente contra Supabase con hooks de TanStack Query. Ambos comparten la misma base de datos remota, pero usan rutas de código distintas que pueden divergir en *shape* (nombres de columna, generación de id, tipos de fecha, defaults). Este plan inventaria las rutas, lista los bugs ya encontrados, define los arreglos y propone una matriz de pruebas end-to-end para garantizar que un cambio hecho en un lado sea visible en el otro.

---

## 1. Bugs críticos ya detectados (deben arreglarse ANTES de testing)

| # | Tabla | Lado roto | Detalle | Síntoma observable |
|---|---|---|---|---|
| **B1** | `dashboard_notes` | **WEB** | El web inserta `text` + `user_id`; la tabla Supabase tiene `content` + `created_by_id` (igual que móvil). | Crear una nota desde el dashboard web tira error 400 / no aparece nunca. Móvil sí funciona. |
| **B2** | `dashboard_notes` | **WEB** | Tabla tiene `id TEXT PRIMARY KEY` sin DEFAULT; web INSERT no genera `id`. | Insert falla por NOT NULL violation. |
| **B3** | `phone_contacts` | **WEB** | `id TEXT PRIMARY KEY` sin DEFAULT; `useContacts` INSERT no genera `id`. | Crear contacto desde web falla. Móvil OK. |
| **B4** | `plans` | **WEB** | Tres rutas API (`/api/plans/upload`, `sync`, `relink`) insertan sin `id`. | Subir plan desde web falla / lo crea con id null y rompe FK luego. |
| **B5** | `plan_measurements` (mobile delete) | **MÓVIL** | `deleteMeasurementById` usa `destroyPermanently` sin propagar al remoto. | Borrar medición en móvil deja huérfana la fila en Supabase → reaparece al pull o desde web. |
| **B6** | `non_conformities` (mobile push) | **MÓVIL** | `pushProjectToSupabase` no incluye `non_conformities` en su scope (verificar). | NC creada desde móvil podría no subir. |
| **B7** | `projects` (web create) | **WEB** | INSERT no incluye `logo_s3_key`, `stamp_comment`. Si el móvil setea estos campos vía push, el web los borra al sobrescribir. | Bajo — solo si el web crea/edita proyectos (verificar). |

**Acción previa al testing**: aplicar los fixes B1-B4 (web) y B5 (móvil). B6 verificar. B7 dejar para Fase 2 del plan principal (firma + personalización).

---

## 2. Matriz de paridad de shape por tabla

Convención: ✅ alineado, ⚠️ revisar, 🚨 mismatch.

| Tabla | id strategy móvil | id strategy web | Columnas alineadas | Estado |
|---|---|---|---|---|
| `projects` | WatermelonDB | `crypto.randomUUID()` | Web omite `logo_s3_key`, `stamp_comment` | ⚠️ |
| `locations` | WatermelonDB | `crypto.randomUUID()` (file-upload) | igual | ✅ |
| `protocol_templates` | WatermelonDB | `crypto.randomUUID()` (file-upload) | igual | ✅ |
| `protocol_template_items` | WatermelonDB | `crypto.randomUUID()` | igual | ✅ |
| `protocols` | WatermelonDB | — (web no crea, solo update) | OK | ✅ |
| `protocol_items` | WatermelonDB | — (solo update via `useSaveItemAnswer`) | OK | ✅ |
| `evidences` | WatermelonDB | `crypto.randomUUID()` (useSaveEvidence) | verificar `s3_url_placeholder` vs lo que web sube | ⚠️ |
| `non_conformities` | WatermelonDB | `crypto.randomUUID()` (recién añadido) | igual | ✅ |
| `plans` | WatermelonDB | **sin id** (3 API routes) | falta `file_uri`, `uploaded_by_id` desde web | 🚨 B4 |
| `plan_annotations` | WatermelonDB | `crypto.randomUUID()` | igual | ✅ |
| `annotation_comments` | WatermelonDB | `crypto.randomUUID()` | igual | ✅ |
| `annotation_comment_photos` | WatermelonDB | `crypto.randomUUID()` | igual | ✅ |
| `plan_measurements` | WatermelonDB | `crypto.randomUUID()` | igual | ✅ |
| `dashboard_notes` | WatermelonDB | **sin id**, nombres distintos | `text` vs `content`, `user_id` vs `created_by_id` | 🚨 B1+B2 |
| `phone_contacts` | WatermelonDB | **sin id** | igual columnas | 🚨 B3 |
| `user_project_access` | WatermelonDB | `crypto.randomUUID()` | igual | ✅ |
| `users` | WatermelonDB | — (web no crea aún, Fase 3) | — | ⚠️ |

---

## 3. Fixes (en orden)

### Fix B1 — `dashboard_notes` columnas
**Archivo:** `flow-qaqc-web/hooks/useHistorical.ts`
- INSERT debe usar `content` (no `text`) y `created_by_id` (no `user_id`)
- UPDATE debe usar `content` (no `text`)
- También revisar el SELECT en `useDashboardNotes` (línea ~74) — probablemente lee `text` que no existe y por eso las notas no se ven
- Renombrar el parámetro `text` → `content` en la firma del hook

### Fix B2 — `dashboard_notes.id`
Añadir `id: crypto.randomUUID()` en el INSERT (junto con el fix B1).

### Fix B3 — `phone_contacts.id`
**Archivo:** `flow-qaqc-web/hooks/useContacts.ts`
- INSERT: añadir `id: crypto.randomUUID()`

### Fix B4 — `plans.id` en API routes
**Archivos:** `flow-qaqc-web/app/api/plans/upload/route.ts`, `sync/route.ts`, `relink/route.ts`
- En cada INSERT, añadir `id: crypto.randomUUID()` (en Node SSR usar `randomUUID()` de `crypto` import)
- Añadir `file_uri: ''` y `uploaded_by_id: ''` para no perder los defaults
- Verificar que el `file_type` no exista en la tabla → si no existe, removerlo

### Fix B5 — `plan_measurements` delete del móvil propaga
**Archivo:** `src/screens/MeasurementScreen.tsx::deleteMeasurementById`
- Antes (o en paralelo) del `rec.destroyPermanently()`, hacer `await supabase.from('plan_measurements').delete().eq('id', dbId)` con el cliente de `src/config/supabase`. Si falla por red, dejar el delete local pero loggear.
- Alternativa más limpia: marcar como deleted en WatermelonDB (`markAsDeleted` en lugar de `destroyPermanently`) para que el ciclo de sync lo propague — pero requiere que `SupabaseSyncService` interprete deleted-rows.

### Fix B6 — verificar push de `non_conformities` en móvil
**Archivo:** `src/services/SupabaseSyncService.ts::pushProject`
- `grep` muestra que NC no se incluye en el push (no aparece en el inventario del agente).
- Añadir bloque dentro del scope de proyecto:
  ```ts
  const ncs = await nonConformitiesCollection.query(Q.where('project_id', projectId)).fetch();
  const ncsToUpload = await filterByFreshness('non_conformities', ncs);
  await collect('non_conformities', ncsToUpload.map(r => toRow(r._raw)));
  ```
- También añadir a `pullProject`: `fetchIn('non_conformities', 'project_id', [projectId])` + `prepareOverride(nonConformitiesCollection, ...)`

---

## 4. Matriz de tests end-to-end

Para cada tabla, dos direcciones. Marcar ✓ / ✗ tras correr.

### Setup
- Dispositivo A: móvil real con la app instalada, usuario `userA` (rol CREATOR).
- Dispositivo B: navegador con Electron o Next dev, mismo usuario `userA` (login en cuenta diferente puede usarse para probar visibility por RLS).
- Proyecto de pruebas: crear uno nuevo `"SYNC-TEST-{fecha}"` en móvil.
- Antes de cada test: `pullProjectFromCloud` en móvil; refrescar página web.
- Después de cada acción remota: esperar 5s y refrescar el otro lado.

### Tests por tabla

| # | Tabla | Acción móvil | Verificar en web | Acción web | Verificar en móvil |
|---|---|---|---|---|---|
| T1 | `projects` | Crear proyecto | Aparece en `/app/projects` | (web crea) | Aparece en lista móvil tras pull |
| T2 | `locations` | Importar Excel ubicaciones | Aparecen en `/app/projects/[id]/locations` | Importar Excel desde `/file-upload` | Aparecen en móvil tras pull |
| T3 | `protocol_templates` + `_items` | Importar Excel actividades | Plantillas visibles en `/file-upload` | Importar Excel desde web | Plantillas en móvil tras pull |
| T4 | `protocols` | Crear instancia desde LocationProtocolsScreen | Aparece en `/locations/[locId]/protocols` | Crear instancia desde `/locations/[locId]/protocols` | Aparece en móvil tras pull |
| T5 | `protocol_items` (respuestas) | Marcar `Sí/No/N/A` + comentario | Refrescar `audit/` → verificar marca | Editar respuestas desde `/fill` | Refrescar móvil → verificar |
| T6 | `evidences` (fotos) | Tomar foto en cámara nativa | Aparece thumb en `audit/` | Subir foto desde `/fill` | Aparece foto en móvil tras pull |
| T7 | `protocols.status` | Submit + audit aprobar | Estado APPROVED en web + signed_at | Aprobar desde `/audit` web | Estado APPROVED en móvil + el firmante actualizado |
| T8 | `non_conformities` | Crear NC (después de B6) | Aparece en `/nc` web | Crear NC desde `/nc` web | Aparece en lista móvil (cuando se haga UI) |
| T9 | `plans` (PDF upload) | Subir PDF en FileUpload | Aparece en `/plans` web | Subir PDF desde `/file-upload` web | Aparece en móvil tras pull |
| T10 | `plan_annotations` | Crear viñeta + comment | Aparece en `/observations` + viñeta en visor web | Crear viñeta en visor web | Aparece en móvil tras pull |
| T11 | `plan_annotations.priority` | Long-press → cambiar prioridad | Chip de prioridad correcto en web | Right-click → cambiar | Móvil muestra nuevo chip tras pull |
| T12 | `plan_annotations.is_ok` | Marcar resuelta | Aparece como resuelta en web | Toggle desde web | Móvil muestra resuelta |
| T13 | `annotation_comments` | Responder en hilo | Comentario visible en web | Responder desde web | Móvil muestra respuesta |
| T14 | `annotation_comment_photos` | Adjuntar foto a comentario | Foto visible en web | (web aún no soporta — opcional) | — |
| T15 | `plan_measurements` (calibración) | Calibrar plano | Calibración naranja visible en `/measure` web | Calibrar desde web | Móvil muestra calibración tras pull |
| T16 | `plan_measurements` (línea/área) | Crear medición | Aparece en `/measure` web | Crear desde web | Aparece en móvil tras pull |
| T17 | `plan_measurements` DELETE | Borrar medición (después de B5) | Desaparece en web | Borrar en web | Desaparece en móvil tras pull |
| T18 | `dashboard_notes` (después de B1+B2) | Crear nota | Aparece en dashboard web | Crear nota web | Aparece en móvil tras pull |
| T19 | `phone_contacts` (después de B3) | Crear contacto | Aparece en `/contacts` web | Crear contacto web | Aparece en móvil tras pull |
| T20 | `user_project_access` | Compartir proyecto a otro user | Otro user lo ve en web | (web aún sin UI — Fase 3) | — |

### Tests cruzados de update (last-write-wins)
| # | Caso | Esperado |
|---|---|---|
| U1 | Editar comentario de viñeta en móvil A, luego mismo comentario en web 30s después | Gana el web (updated_at más reciente). Al pull en móvil, comentario web prevalece. |
| U2 | Subir foto en móvil (con cámara) y otro en web (file picker) al mismo item | Las dos coexisten (id distinto). |
| U3 | Aprobar protocolo en web, mientras móvil tenía la versión DRAFT abierta sin guardar | Móvil al pull descarga APPROVED. Pendientes locales se pierden (es DRAFT, OK). |

---

## 5. SQL helpers para inspeccionar Supabase

Correr en el SQL Editor de Supabase tras cada acción de test:

```sql
-- Conteo por tabla del proyecto de prueba
SELECT 'projects' AS t, COUNT(*) FROM projects WHERE name LIKE 'SYNC-TEST-%'
UNION ALL SELECT 'locations', COUNT(*) FROM locations WHERE project_id IN (SELECT id FROM projects WHERE name LIKE 'SYNC-TEST-%')
UNION ALL SELECT 'protocols', COUNT(*) FROM protocols WHERE project_id IN (SELECT id FROM projects WHERE name LIKE 'SYNC-TEST-%')
UNION ALL SELECT 'protocol_items', COUNT(*) FROM protocol_items WHERE protocol_id IN (SELECT id FROM protocols WHERE project_id IN (SELECT id FROM projects WHERE name LIKE 'SYNC-TEST-%'))
UNION ALL SELECT 'evidences', COUNT(*) FROM evidences WHERE protocol_item_id IN (SELECT id FROM protocol_items WHERE protocol_id IN (SELECT id FROM protocols WHERE project_id IN (SELECT id FROM projects WHERE name LIKE 'SYNC-TEST-%')))
UNION ALL SELECT 'plans', COUNT(*) FROM plans WHERE project_id IN (SELECT id FROM projects WHERE name LIKE 'SYNC-TEST-%')
UNION ALL SELECT 'plan_annotations', COUNT(*) FROM plan_annotations WHERE plan_id IN (SELECT id FROM plans WHERE project_id IN (SELECT id FROM projects WHERE name LIKE 'SYNC-TEST-%'))
UNION ALL SELECT 'annotation_comments', COUNT(*) FROM annotation_comments WHERE annotation_id IN (SELECT id FROM plan_annotations WHERE plan_id IN (SELECT id FROM plans WHERE project_id IN (SELECT id FROM projects WHERE name LIKE 'SYNC-TEST-%')))
UNION ALL SELECT 'plan_measurements', COUNT(*) FROM plan_measurements WHERE plan_id IN (SELECT id FROM plans WHERE project_id IN (SELECT id FROM projects WHERE name LIKE 'SYNC-TEST-%'))
UNION ALL SELECT 'non_conformities', COUNT(*) FROM non_conformities WHERE project_id IN (SELECT id FROM projects WHERE name LIKE 'SYNC-TEST-%')
UNION ALL SELECT 'dashboard_notes', COUNT(*) FROM dashboard_notes WHERE project_id IN (SELECT id FROM projects WHERE name LIKE 'SYNC-TEST-%')
UNION ALL SELECT 'phone_contacts', COUNT(*) FROM phone_contacts WHERE project_id IN (SELECT id FROM projects WHERE name LIKE 'SYNC-TEST-%');

-- Ver últimas 10 filas insertadas globalmente
SELECT 'plan_annotations' AS t, id, created_at, updated_at FROM plan_annotations ORDER BY updated_at DESC LIMIT 10;

-- Detectar huérfanos (FK rotas)
SELECT * FROM plan_measurements pm WHERE NOT EXISTS (SELECT 1 FROM plans p WHERE p.id = pm.plan_id);
SELECT * FROM annotation_comments ac WHERE NOT EXISTS (SELECT 1 FROM plan_annotations pa WHERE pa.id = ac.annotation_id);
```

---

## 6. Plan de ejecución

1. **Aplicar fixes B1, B2, B3, B4** (15 min web) → `npx tsc --noEmit` debe pasar.
2. **Aplicar fix B5** (10 min móvil) → compilar el APK debug.
3. **Verificar B6** y aplicar si confirma (30 min móvil).
4. **Ejecutar batería T1-T20** en el orden indicado. Marcar ✓/✗ en una hoja.
5. **Ejecutar tests U1-U3** de last-write-wins.
6. **Correr SQL helpers** para detectar huérfanos o conteos asimétricos.
7. **Documentar** cualquier divergencia restante en un follow-up.

**Estimación**: ~3-4 horas de QA cruzado con un proyecto de prueba dedicado.

---

## 7. Criterios de éxito

- ✅ Todas las acciones T1-T20 cruzan correctamente en ambas direcciones.
- ✅ No quedan filas huérfanas tras una sesión de prueba.
- ✅ El conteo de filas en Supabase coincide con lo creado.
- ✅ Última-escritura-gana se respeta (verificable comparando `updated_at`).
- ✅ Borrar un recurso desde un lado lo borra en el otro lado tras pull.
