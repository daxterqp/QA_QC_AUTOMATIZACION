# Manual de OPERACIÓN DIRECTA (Claude + SQL Supabase) — v99

> Objetivo: el usuario pide en lenguaje natural ("aprueba tal ensayo", "dale
> acceso a X", "activa la codificación", "crea la tabla de moldes") y Claude lo
> ejecuta directo en la base de datos, con el mismo efecto que la app.
> Complementa: docs/FLUJO_EDICION_FICHAS.md (editar fichas + PDF + volcado) y
> docs/FLAGS_MAPA.md (catálogo completo de feature_flags).
> Regla universal: TODA escritura bumpea `updated_at` (bigint, epoch ms:
> `(extract(epoch from now())*1000)::bigint`) para que el sync LWW del móvil
> la adopte. Operar con la obra sincronizada.

## 1. APROBAR / RECHAZAR un ensayo por SQL

Campos exactos que escribe la app (doApprove del audit móvil / useApproveLevel web):

```sql
-- APROBAR (conforme → approval_reason NULL; con observación → el motivo)
UPDATE protocols SET status='APPROVED', is_locked=true, corrections_allowed=false,
  signed_by_id='⟨USER_ID⟩', signed_at=(extract(epoch from now())*1000)::bigint,
  approval_reason=⟨NULL | 'motivo'⟩, rejection_reason=NULL,
  updated_at=(extract(epoch from now())*1000)::bigint
WHERE id='⟨PROTOCOL_ID⟩' AND status='SUBMITTED';   -- CAS: jamás sin este guard

-- RECHAZAR (motivo SIEMPRE)
UPDATE protocols SET status='REJECTED', corrections_allowed=true,
  rejection_reason='⟨motivo⟩', updated_at=(extract(epoch from now())*1000)::bigint
WHERE id='⟨PROTOCOL_ID⟩' AND status='SUBMITTED';
```

Efectos secundarios que la app dispara y por SQL hay que cubrir a mano:
1. **protocol_approvals** (si el proyecto usa multi-nivel o ya tiene filas):
   aprobar → fila del nivel a `status='APPROVED', signer_id, signed_at,
   approval_reason` (solo si estaba PENDING); rechazar → `REJECTED` +
   `rejection_reason`. En RE-ENVÍO, resetear todas las filas a PENDING
   (signer_id/signed_at/motivos NULL).
2. **protocol_summary_rows**: actualizar `status` y dentro de `values_json`
   las claves `estado`, `aprobado_por` (nombre del firmante) y
   `fecha_aprobacion` — o dejar que el próximo open/approve de la app la
   regenere (upsertSummaryRow).
3. **Notificación push**: NO se puede disparar por SQL (la manda la app).
   Avisar al usuario que el equipo no recibirá el push.
4. La FIRMA del PDF sale de S3 `signatures/⟨signed_by_id⟩/signature.jpg` al
   exportar — verificar que el aprobador la tenga subida.
Preferencia: si no urge, aprobar desde la app (dispara todo solo). Los gates
que la app valida antes de aprobar (v99): conformidad (motivo si no cumple),
equipos vencidos, xrefs frescos, firma registrada.

## 2. FEATURE FLAGS del proyecto (activar módulos / comportamiento)

Viven en `projects.feature_flags` (jsonb). Catálogo completo: docs/FLAGS_MAPA.md.
⚠ SIEMPRE merge — jamás pisar el objeto entero (ver feedback del usuario):

```sql
UPDATE projects SET
  feature_flags = coalesce(feature_flags,'{}'::jsonb) || '⟨{"protocol_codes": true}⟩'::jsonb,
  updated_at=(extract(epoch from now())*1000)::bigint
WHERE id='⟨PROJECT_ID⟩';
```
Los más pedidos: `numeric_protocols`, `protocol_codes` (+ `coding_mask_default`
ej. '{TIPO}-{AA}{SEQ:4}', `coding_mask_by_type`, `coding_seq_reset`:
year|year_sector|year_month), `map_enabled` (+ hijos `gps_capture_subjective`,
`gps_capture_numeric`), `fill_by_sector`, `module_samples` +
`sample_identifier` (columna aparte), `module_summary_tables`,
`traceability_module` + `equipment_catalog`, `multi_level_approval` +
`approval_levels` (1-3; ⚠ el flujo por niveles vive en la WEB — el móvil firma
directo), `dossier_observe_inline`, `deletion_mode`
(last_only|inmutable|flexible), `print_configs` + `print_header_color`
(PDF por ensayo — receta en FLUJO_EDICION_FICHAS §6), `stamp_enabled/gps/size`.

## 3. USUARIOS y ACCESOS

- `users`: id, name, apellido, email, role (`CREATOR` ve todo; `JEFE` aprueba;
  `OPERATOR` técnico; `VIEWER` lectura + demos), password/pin gestionados por la app.
- Dar acceso a un proyecto:
```sql
INSERT INTO user_project_access (id, user_id, project_id, created_at, updated_at)
VALUES (gen_random_uuid()::text, '⟨USER_ID⟩', '⟨PROJECT_ID⟩',
  (extract(epoch from now())*1000)::bigint, (extract(epoch from now())*1000)::bigint);
```
  Quitar acceso: DELETE de esa fila. (La app usa la RPC
  `join_project_with_password` para el alta self-service por contraseña.)

## 4. CODIFICACIÓN CORRELATIVA

- Contadores atómicos en `protocol_code_counters` (project_id + group_key
  `⟨TIPO⟩|⟨AÑO⟩[|SECTOR][|Mn]`) vía RPC `next_protocol_seq` — **no tocar a mano**
  salvo para reset consciente; renumeraciones con la RPC `renumber_protocols`.
- Cambiar máscara = flags (§2). El cambio solo afecta ensayos NUEVOS.

## 5. TABLAS AUXILIARES (BUSCAR / listas)

`lab_aux_tables`: `group_key` (minúsculas, ej. 'capas_pavimento'),
`columns_json` (array de nombres; la 1ª columna es la LLAVE de BUSCAR —
numérica de preferencia) y `rows_json` (array de arrays de STRINGS).
```sql
INSERT INTO lab_aux_tables (id, project_id, group_key, columns_json, rows_json, created_at, updated_at)
VALUES (gen_random_uuid()::text, '⟨PID⟩', 'moldes',
  '["Codigo","Peso","Volumen"]'::jsonb,
  '[["1","5350","2124"],["2","5410","2124"]]'::jsonb,
  (extract(epoch from now())*1000)::bigint, (extract(epoch from now())*1000)::bigint);
```

## 6. SECTORES / UBICACIONES / PROYECTO

- `project_sectors`: name, `points_json` (array `[{lat,lng}]` WGS84, NULL =
  solo-nombre), display_color, sort_order. UNIQUE(project_id, name).
- `locations`: name, location_only, specialty, `template_ids` (CSV de ids de
  template — define los ensayos ESPERADOS de la ubicación: es la base del
  avance % v31).
- `projects`: password (alta por contraseña), status ACTIVE|CLOSED, is_demo,
  sample_identifier, logo_s3_key (archivo real en S3), stamp_*.

## 7. FICHAS, PDF y VOLCADO → ver docs/FLUJO_EDICION_FICHAS.md
Backup SIEMPRE (`ficha_edit_backups`), validador `scripts/fichaValidate.ts`,
recetas §4 (editar), §4.9 (dictámenes en texto), §6 (PDF), §7 (volcado a otro
proyecto — 8 piezas).

## 8. Pendientes conocidos del sistema de aprobaciones (post-auditoría v99)
- Conformidad vs gate de envío: la conformidad exige llenas celdas
  percent/bool/fecha/hora/equipos y NO respeta `:oblig` — más estricta que el
  envío; una ficha con opcionales vacías legítimas pedirá observación.
  (Decisión de diseño pendiente con el usuario.)
- El móvil no implementa multi-nivel (firma directo aunque
  `multi_level_approval` esté activo) — usar la web para cadenas de firmas.
- Web fill en modo edición: el re-congelado corre al "Guardar cambios"; si el
  jefe edita celdas y abandona sin guardar, el snapshot queda desactualizado
  (pendiente re-freeze con debounce).
- BUSCAR recomputa con tablas auxiliares VIVAS al evaluar conformidad: si se
  edita una tabla auxiliar después de enviados, la conformidad puede
  contradecir el valor congelado (regla operativa: no editar tablas aux con
  ensayos SUBMITTED pendientes de aprobar).
