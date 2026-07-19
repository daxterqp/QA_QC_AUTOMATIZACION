# Flujo de EDICIÓN DIRECTA de fichas de ensayo (v95)

> Runbook para que Claude edite plantillas de ensayo (fichas numéricas)
> **directamente en Supabase** — sin pasar por Excel — con respaldo SIEMPRE,
> migración de datos ya ingresados y verificación con el motor real.
> Complementa `Actividadesv1/DOCUMENTO_GUIA_Conversion_Fichas.md` (el DSL).
> Creado: 2026-07-19. Infra: tabla `ficha_edit_backups` (migración v95).

---

## 1. Invariantes del modelo (POR QUÉ de cada regla)

1. **Instancias = copias sueltas.** `protocol_items` de una instancia copian
   `partida_item / item_description / validation_method / section` del template
   al crearse. NO hay FK al template_item: el único vínculo es el **valor de
   `partida_item`**. Editar el template NO propaga solo — la propagación la
   hacemos nosotros por partida.
2. **Valores POSICIONALES.** Los valores viven en `protocol_items.comments`,
   celdas unidas por `//` en el MISMO orden que las celdas del DSL de ESE item.
   → Cambiar el Nº o el ORDEN de celdas de una fila exige REMAPEAR comments.
3. **Direcciones = partida + letra.** Fórmulas (`#7A`), rangos (`#4A:#7A`),
   gráficos, xref (`@COD.5F` → busca `partida_item='5'` en la instancia fuente)
   y **Tablas Resumen** (`values_json` keyed `"partida:letra"`; columnas de
   `summary_config_json` con refs `key:p:L` / `item:p` / `cell:p:L`) usan el
   NÚMERO de partida. → Renombrar DESCRIPCIONES es gratis; renumerar PARTIDAS
   rompe todo lo anterior.
4. **Fórmulas solo referencian partidas ENTERAS** (`RE_CELL /^#(\d+)/`) y los
   rangos verticales expanden por enteros consecutivos. → Una fila nueva con
   partida decimal (`7.5`) ordena bien visualmente, pero NO es referenciable
   por fórmula NI entra en rangos `#4A:#8A`.
5. **Congelado (frozen).** Al SUBMIT las celdas calculadas se hornean a valores
   en `comments` y el render (Audit/PDF/Resumen) ya no recalcula. → Cambiar una
   FÓRMULA no altera enviados/aprobados; cambiar la ESTRUCTURA de celdas sí los
   desalinea (invariante 2).
6. **Sync móvil = last-write-wins por `updated_at` (bigint, epoch ms).** Toda
   edición en nube DEBE setear `updated_at = (extract(epoch from now())*1000)::bigint`
   para que los dispositivos la adopten al pull. Si un dispositivo tiene una
   edición local MÁS nueva sin subir, la pisa — **editar con la obra sincronizada**.
7. **Re-import de Excel = upsert por `(template_id, partida)`**; no borra filas
   ni toca instancias. Nuestro flujo es un superconjunto de eso.
8. **La tabla `ficha_edit_backups` tiene RLS sin políticas**: solo el service
   role (MCP) la ve. Las apps ni la sincronizan ni la conocen.

## 2. Matriz de seguridad de operaciones

| Operación | Datos existentes | Resumen/serie | Fórmulas/xref | Nivel |
|---|---|---|---|---|
| Renombrar descripción | intactos | serie sigue (label cambia) | intactos | 🟢 |
| Editar sufijos/rangos/`:ej`/`:oblig` (misma estructura) | intactos | intacta | intactos | 🟢 |
| Cambiar fórmula de celda calculada (misma estructura) | frozen intactos; DRAFT recalcula | congelada intacta | revisar refs | 🟡 |
| Añadir fila al FINAL de sección (partida entera nueva) | intactos | columna nueva | nada roto | 🟢 |
| Añadir fila EN MEDIO con partida decimal | intactos | ok | ⚠ no referenciable ni entra a rangos | 🟡 |
| Añadir/quitar CELDAS (`//`) de una fila | ⚠ remapear comments de TODAS las instancias | keys por letra pueden correrse | refs por letra pueden correrse | 🟠 |
| Quitar fila | valores de esa fila se pierden (quedan en backup) | serie de esa partida muere | verificar que nadie la referencia | 🟠 |
| Renumerar partidas | intactos si se migran | **migrar values_json + config** | **reescribir TODAS las refs** | 🔴 solo con análisis completo |

## 3. Procedimiento estándar (SIEMPRE, en orden)

1. **Localizar** template: `SELECT id, name, id_protocolo FROM protocol_templates WHERE project_id=? AND id_protocolo=?`
   e inventariar instancias: `SELECT id, protocol_code, status FROM protocols WHERE template_id=?`.
2. **Exportar** filas a JSON (query `json_agg(... ORDER BY (partida_item)::numeric)`)
   → guardar como `<COD>_actual.json` en el scratchpad.
3. **Editar el JSON** (la modificación pedida) → `<COD>_nuevo.json`.
4. **Validar con el motor real**:
   `npx tsx scripts/fichaValidate.ts <COD>_nuevo.json [aux.json]`
   → exige `✓ ficha válida` + smoke test con valores coherentes. Si la ficha
   usa BUSCAR, exportar también las `lab_aux_tables` del proyecto al `aux.json`.
5. **Respaldar** (receta §4.1) — SIEMPRE, aunque el cambio sea trivial.
6. **Aplicar** (recetas §4.x): un solo statement/transacción, acotado por ids,
   bumpeando `updated_at` en TODO lo tocado (template, template_items,
   protocol_items y `protocols` de las instancias tocadas — el bump del
   protocolo fuerza al móvil a refrescar la ficha).
7. **Verificar**: re-export y diff; conteos de items por instancia; si tocó
   estructura → releer un comments migrado; probar en app (pull del proyecto).
   Si algo salió mal → **restaurar** (§4.2).

## 4. Recetas SQL (parametrizadas; `⟨⟩` = reemplazar)

### 4.1 BACKUP (antes de TODA edición)
```sql
INSERT INTO ficha_edit_backups (template_id, project_id, label, operation, snapshot)
SELECT t.id, t.project_id, '⟨etiqueta-humana⟩', '⟨op⟩',
  jsonb_build_object(
    'template', to_jsonb(t),
    'template_items', (SELECT coalesce(jsonb_agg(to_jsonb(i)), '[]'::jsonb)
                       FROM protocol_template_items i WHERE i.template_id = t.id),
    'protocols', (SELECT coalesce(jsonb_agg(to_jsonb(p)), '[]'::jsonb)
                  FROM protocols p WHERE p.template_id = t.id),
    'protocol_items', (SELECT coalesce(jsonb_agg(to_jsonb(pi)), '[]'::jsonb)
                       FROM protocol_items pi
                       JOIN protocols p ON p.id = pi.protocol_id
                       WHERE p.template_id = t.id),
    'summary_rows', (SELECT coalesce(jsonb_agg(to_jsonb(s)), '[]'::jsonb)
                     FROM protocol_summary_rows s WHERE s.template_id = t.id))
FROM protocol_templates t WHERE t.id = '⟨TEMPLATE_ID⟩'
RETURNING id, label, created_at;
```

### 4.2 RESTAURAR desde un backup (rollback completo)
```sql
DO $$
DECLARE b jsonb; bid uuid := '⟨BACKUP_ID⟩'; now_ms bigint := (extract(epoch from now())*1000)::bigint;
BEGIN
  SELECT snapshot INTO b FROM ficha_edit_backups WHERE id = bid;
  IF b IS NULL THEN RAISE EXCEPTION 'backup no encontrado'; END IF;

  -- Template (fila completa)
  UPDATE protocol_templates t SET
    name = s.name, id_protocolo = s.id_protocolo,
    summary_config_json = s.summary_config_json, is_hidden = s.is_hidden,
    updated_at = now_ms
  FROM jsonb_to_record(b->'template') AS s(id text, name text, id_protocolo text,
       summary_config_json jsonb, is_hidden boolean)
  WHERE t.id = s.id;

  -- Template items: reemplazo TOTAL (borra actuales, repone snapshot)
  DELETE FROM protocol_template_items WHERE template_id = (b->'template'->>'id');
  INSERT INTO protocol_template_items (id, template_id, partida_item, item_description,
    validation_method, section, created_at, updated_at, org_id)
  SELECT s->>'id', s->>'template_id', s->>'partida_item', s->>'item_description',
    s->>'validation_method', s->>'section', (s->>'created_at')::bigint, now_ms,
    (s->>'org_id')::uuid
  FROM jsonb_array_elements(b->'template_items') s;

  -- Items de instancias: reemplazo total de los protocolos del snapshot
  DELETE FROM protocol_items WHERE protocol_id IN (
    SELECT p->>'id' FROM jsonb_array_elements(b->'protocols') p);
  INSERT INTO protocol_items (id, protocol_id, partida_item, item_description,
    validation_method, section, is_compliant, is_na, has_answer, comments,
    created_at, updated_at, org_id)
  SELECT s->>'id', s->>'protocol_id', s->>'partida_item', s->>'item_description',
    s->>'validation_method', s->>'section', (s->>'is_compliant')::boolean,
    (s->>'is_na')::boolean, (s->>'has_answer')::boolean, s->>'comments',
    (s->>'created_at')::bigint, now_ms, (s->>'org_id')::uuid
  FROM jsonb_array_elements(b->'protocol_items') s;

  -- Bump de los protocolos para que el móvil re-pullee la ficha entera
  UPDATE protocols SET updated_at = now_ms WHERE template_id = (b->'template'->>'id');

  UPDATE ficha_edit_backups SET restored_at = now() WHERE id = bid;
END $$;
```
(Si la edición tocó summary_rows, reponerlas igual desde `b->'summary_rows'`.)

### 4.3 RENOMBRAR descripción de una fila (🟢)
```sql
WITH now_ms AS (SELECT (extract(epoch from now())*1000)::bigint AS v)
, t AS (UPDATE protocol_template_items SET item_description='⟨NUEVO⟩', updated_at=(SELECT v FROM now_ms)
        WHERE template_id='⟨TID⟩' AND partida_item='⟨P⟩' RETURNING 1)
, i AS (UPDATE protocol_items pi SET item_description='⟨NUEVO⟩', updated_at=(SELECT v FROM now_ms)
        FROM protocols p WHERE p.id=pi.protocol_id AND p.template_id='⟨TID⟩'
          AND pi.partida_item='⟨P⟩' RETURNING 1)
, pr AS (UPDATE protocols SET updated_at=(SELECT v FROM now_ms) WHERE template_id='⟨TID⟩' RETURNING 1)
SELECT (SELECT count(*) FROM t) AS template_rows, (SELECT count(*) FROM i) AS instance_rows;
```
Además: si `summary_config_json` trae un `label` hardcodeado para esa columna,
actualizarlo ahí también (revisar con `SELECT summary_config_json FROM protocol_templates WHERE id='⟨TID⟩'`).

### 4.4 EDITAR DSL sin cambiar estructura (🟢/🟡 — sufijos, rangos, :ej, :oblig, fórmulas)
Igual que 4.3 pero sobre `validation_method`. Por defecto propagar a **todas**
las instancias (frozen no se altera: valores ya horneados). Para propagar solo
a borradores añadir `AND p.status IN ('DRAFT','IN_PROGRESS')`.
**Regla**: el nº de celdas `//` del DSL nuevo DEBE ser igual al viejo (verificar
contando ` // ` + 1 en ambos). Si no, es §4.7.

### 4.5 AÑADIR fila (🟢 al final de sección / 🟡 en medio con decimal)
```sql
-- 1) Template
WITH now_ms AS (SELECT (extract(epoch from now())*1000)::bigint AS v)
INSERT INTO protocol_template_items (id, template_id, partida_item, item_description,
  validation_method, section, created_at, updated_at, org_id)
SELECT '⟨ID_NUEVO_16CHARS⟩', '⟨TID⟩', '⟨P_NUEVA⟩', '⟨DESC⟩', '⟨DSL⟩', '⟨SECCION⟩',
  (SELECT v FROM now_ms), (SELECT v FROM now_ms),
  (SELECT org_id FROM protocol_templates WHERE id='⟨TID⟩');

-- 2) Instancias (modo TODAS; para "solo nuevas" OMITIR este paso)
WITH now_ms AS (SELECT (extract(epoch from now())*1000)::bigint AS v)
INSERT INTO protocol_items (id, protocol_id, partida_item, item_description,
  validation_method, section, is_compliant, is_na, has_answer, comments,
  created_at, updated_at, org_id)
SELECT substr(md5(random()::text || p.id), 1, 16), p.id, '⟨P_NUEVA⟩', '⟨DESC⟩',
  '⟨DSL⟩', '⟨SECCION⟩', false, false, false, NULL,
  (SELECT v FROM now_ms), (SELECT v FROM now_ms), p.org_id
FROM protocols p WHERE p.template_id='⟨TID⟩'
  -- Modo por estado (opcional): excluir aprobados si el usuario lo pide:
  -- AND p.status NOT IN ('APPROVED','REJECTED')
;
UPDATE protocols SET updated_at=(extract(epoch from now())*1000)::bigint WHERE template_id='⟨TID⟩';
```
**Elección de partida**: al final de la ficha/sección → siguiente ENTERO libre.
En medio → decimal (`7.5`) SOLO si la fila no necesita ser referenciada por
fórmulas ni entrar en rangos; si lo necesita → renumeración (§4.8).

### 4.6 QUITAR fila (🟠 — valores quedan solo en el backup)
Verificar ANTES que nadie la referencia: correr el validador con la fila
quitada (detecta refs rotas). Luego DELETE en template + instancias por
`(template_id, partida)` como en 4.3, y bump de protocolos.

### 4.7 CAMBIO ESTRUCTURAL de celdas de una fila (🟠 — remapear comments)
1. Definir el MAPEO viejo→nuevo de posiciones, ej. insertar columna nueva en B
   sobre 4 celdas: `[A,B,C,D] → [A,'',B,C,D]` = mapping `{0:0, 1:2, 2:3, 3:4}`.
2. Template: update del `validation_method` (4.4 sin la regla de igual nº de celdas).
3. Instancias — remap posicional del comments (ejemplo para insertar celda vacía en posición 1):
```sql
WITH now_ms AS (SELECT (extract(epoch from now())*1000)::bigint AS v)
UPDATE protocol_items pi SET
  validation_method = '⟨DSL_NUEVO⟩',
  comments = CASE WHEN pi.comments IS NULL OR pi.comments = '' THEN pi.comments ELSE
    (SELECT string_agg(x, ' // ') FROM unnest(ARRAY[
       a[1], '', a[2], a[3], a[4]        -- ⟨MAPEO: ajustar por caso⟩
     ]) AS x)
  END,
  updated_at = (SELECT v FROM now_ms)
FROM protocols p,
LATERAL (SELECT array_agg(trim(e)) AS a FROM regexp_split_to_array(coalesce(pi.comments,''), '\s*//\s*') AS e) split
WHERE p.id = pi.protocol_id AND p.template_id='⟨TID⟩' AND pi.partida_item='⟨P⟩';
```
   (Adaptar el ARRAY al mapeo; `a[i]` es 1-based; posiciones nuevas = `''`.)
4. ⚠ Si la letra de columnas ya usadas CAMBIA (insertar en medio corre B→C…):
   reescribir también las fórmulas/rangos/summary-config que referencien las
   letras corridas de ESA partida. El validador lo verifica.
5. Bump de protocolos + verificación leyendo un comments migrado.

### 4.8 RENUMERAR partidas (🔴 — último recurso)
Solo cuando una fila nueva DEBE ser referenciable. Pasos: análisis completo de
refs (`#`, rangos, gráficos `x:|y:`, xref entrantes desde OTRAS fichas del
proyecto, summary_config refs, values_json keys) → reescritura total en el JSON
→ validador → backup → aplicar template+instancias con remap de partida_item +
migrar `values_json` de summary_rows (rekey `"vieja:L"` → `"nueva:L"` con
jsonb) → verificación exhaustiva. Documentar el mapeo en el label del backup.

## 5. Reglas de oro

- **NUNCA** editar sin backup previo (aunque sea 1 carácter).
- **NUNCA** cambiar `partida_item` como parte de otra operación — es §4.8.
- Todo statement acotado por `template_id`/ids explícitos — jamás updates anchos.
- `updated_at` SIEMPRE bumpeado (items tocados + protocols del template).
- Validador ANTES de aplicar; re-export y diff DESPUÉS.
- Editar con la obra sincronizada (LWW): pedir al usuario "Sincronizar ahora"
  en el móvil antes de operaciones sobre instancias con datos en curso.
- Después de aplicar: el usuario recarga la app (pull) y revisa la ficha.

## 6. Piezas del flujo

- Respaldo/rollback: tabla `ficha_edit_backups` (Supabase, RLS cerrado).
- Validador headless: `scripts/fichaValidate.ts` (npx tsx; motor real de la app).
- DSL de referencia: `Actividadesv1/DOCUMENTO_GUIA_Conversion_Fichas.md` y
  `docs/PROTOCOLOS_NUMERICOS.md`.
- Acceso: MCP de Supabase (service role) — execute_sql/apply_migration.
