# Manual de CARGA DIRECTA (Claude + SQL) — crear desde cero

> Complemento operativo de `docs/OPERACIONES_DIRECTAS.md` (aprobar/flags/usuarios/
> codificación/tablas aux — operaciones sobre lo existente) y de
> `docs/FLUJO_EDICION_FICHAS.md` (EDITAR fichas + PDF + volcado). Aquí: **CREAR/
> CARGAR desde cero** (fichas nuevas, ubicaciones, equipos, sectores, planos,
> proyectos). Generado por auditoría multi-agente (19 jul 2026) con las
> afirmaciones de riesgo VERIFICADAS contra el esquema real y el código.

## Reglas universales (valen para TODA receta de este doc)
- **org_id**: se OMITE en los INSERT — todas las tablas tienen DEFAULT
  `11111111-1111-4111-8111-111111111111` (única org). No escribirlo.
- **ids**: TEXT de 16 chars → `substr(md5(random()::text||clock_timestamp()::text),1,16)`.
  El sync móvil solo exige unicidad del id (no valida formato). UUID de 36 también vale.
- **created_at / updated_at**: bigint epoch ms → `(extract(epoch from now())*1000)::bigint`.
  TODA escritura los bumpea (sync LWW del móvil). Operar con la obra sincronizada.

## Hechos de esquema VERIFICADOS (constraints reales, 19 jul 2026)
- `protocol_templates`: **SIN** UNIQUE(project_id, id_protocolo) → la unicidad del
  `id_protocolo` la garantiza SOLO la app; pre-chequear a mano antes de insertar.
- `protocol_template_items`: **SIN** UNIQUE(template_id, partida_item) → nunca
  repetir partida (el upsert móvil colisiona).
- `locations`: **SIN** UNIQUE(project_id, name). `template_ids` guarda los
  **id_protocolo** (códigos humanos "PROY-OP-01,..."), CSV — NO los ids de 16 chars.
  `reference_plan` = nombres de plano (CSV). `location_only`/`specialty` opcionales.
- `project_sectors`: **UNIQUE(project_id, name)** → el nombre del sector debe ser único.
- `equipment`: **UNIQUE(project_id, code)** → el código del equipo debe ser único.
  `category` ∈ {`laboratorio`, `maquinaria_pesada`}; `status` ∈ {`active`,`inactive`,
  `retired`} (≠active bloquea la firma si el módulo de equipos está ON);
  `next_calibration_at` NOT NULL → para maquinaria sin calibración, sentinel
  far-future `Date.UTC(2099,11,31)` (`(extract(epoch from timestamptz
  '2099-12-31 00:00:00+00')*1000)::bigint`).
- `protocol_equipment`: **sin** columna updated_at (solo created_at).
- `plans`: `file_uri` NOT NULL (poner `''` si solo metadata); los BYTES del PDF/DWG
  viven en AWS S3.
- **S3 (logo/ortofoto/planos/certificados/fotos)**: NO puedo subir los bytes —
  solo tengo SQL vía Supabase MCP, sin credenciales AWS. Los archivos los sube el
  usuario por la app; yo cableo la metadata en la DB. Ver §S3 al final.

---
## CREAR UNA FICHA DE ENSAYO NUEVA desde cero (template + items por SQL)

> Complementa `docs/FLUJO_EDICION_FICHAS.md` (que cubre **editar** una ficha ya
> existente) y `Actividadesv1/DOCUMENTO_GUIA_Conversion_Fichas.md` (el DSL del
> "Método de validación"). Aquí se documenta **crear el template completo desde
> cero** — el equivalente exacto a importar un Excel maestro, pero por SQL.
> Todo lo del DSL (celdas, fórmulas, `//`, sufijos `:dec`/`:oblig`/`:oculto`,
> matrices, gráficos, BUSCAR/lookup) NO se repite: se usa tal cual esas guías.

### 0. Qué se crea y qué NO

Una "ficha" = **1 fila en `protocol_templates`** (la cabecera/tipo de ensayo) +
**N filas en `protocol_template_items`** (las partidas/filas de la tabla). Eso es
todo lo que hay que insertar. Es el mismo par de tablas que escribe el importador
de Excel (`src/hooks/useExcelImport.ts:89-159`).

**NO crear al montar la ficha** (los genera después el técnico con el botón `+` /
DevSeed, o el flujo de instancias):
- `protocols` + `protocol_items` (las **instancias** llenables). Copian
  `partida_item/item_description/validation_method/section` del template al
  crearse; el único vínculo es el **valor de `partida_item`**, no hay FK
  (`docs/FLUJO_EDICION_FICHAS.md §1.1`).
- `protocol_summary_rows` (filas de Tablas Resumen — se generan al abrir/aprobar).
- `protocol_code_counters` (secuencias de codificación — arrancan de cero solas).

### 1. `id_protocolo`: la clave de negocio (⚠ unicidad SOLO por app)

`id_protocolo` (TEXT, NOT NULL) es el identificador humano del tipo de ficha
(ej. `PRM`, `DCC`, `PROY-EST-01`). Es la **llave** de:
- **Codificación correlativa** (máscaras `coding_mask_by_type[<id_protocolo>]`).
- **Config de PDF** (`feature_flags.print_configs[<id_protocolo>]`, ver
  `FLUJO_EDICION_FICHAS §6`).
- **Filtros de xref entre fichas** (una ficha llama a otra por su `id_protocolo`;
  `FLUJO_EDICION_FICHAS §7.8`).

⚠ **NO existe constraint UNIQUE en la base sobre `(project_id, id_protocolo)`**
(verificado: los únicos índices únicos son los PK sobre `id`). La unicidad la
garantiza SOLO la app: el importador mapea los templates por `id_protocolo`
(`useExcelImport.ts:54-57` → `templateByIdProtocolo`). Si insertas un
`id_protocolo` duplicado dentro del mismo proyecto, la DB lo acepta en silencio y
el resultado es corrupción funcional (la app agarra "cualquiera" de los dos al
mapear, la codificación y el `print_configs` se comparten/pisan). El **nombre**
(`name`) sí puede repetirse entre tipos (en producción hay 3 templates llamados
"PROTOCOLO EXTRA PRUEBA" con `id_protocolo` distintos) — lo que NO puede repetirse
es el `id_protocolo`.

**Pre-chequeo OBLIGATORIO antes de insertar** (debe devolver 0 filas):
```sql
SELECT id, name FROM protocol_templates
WHERE project_id='⟨PROJECT_ID⟩' AND id_protocolo='⟨ID_PROTOCOLO⟩';
-- 0 filas → seguir. 1+ filas → elegir otro id_protocolo o EDITAR la existente
-- (docs/FLUJO_EDICION_FICHAS.md), NO crear un duplicado.
```

### 2. Numeración de partidas (`partida_item`)

Regla de oro (`Conversion_Fichas §0.2`, `§8.4`): **numerar TODAS las filas con
enteros secuenciales 1,2,3,… en el orden de render deseado** — el render ordena
por `partida_item` (orden natural numérico), NO por el orden de inserción. Incluir
en la numeración los encabezados `col-[...]` y las filas de gráfico.

- **Partidas ENTERAS** = referenciables por fórmula (`#7A`), rangos (`#4A:#7A`),
  gráficos, xref (`@COD.5F`) y Tablas Resumen. El motor solo referencia partidas
  enteras (`RE_CELL /^#(\d+)/`, `FLUJO_EDICION_FICHAS §1.4`). → toda fila que otra
  celda deba referenciar DEBE ser entero.
- **Partidas SINTÉTICAS** para filas que NO se referencian por número (headers,
  matrices, bloques paramétricos). El Excel las autogenera; por SQL hay que
  escribirlas **explícitas** con estos formatos exactos
  (`src/services/ExcelImporter.ts:92-157`):
  - Encabezado de columnas `col-[A][...] // col-[B][...]` → `__hdr1__`, `__hdr2__`,
    `__hdr3__` (máximo 3, uno por sección; `ExcelImporter.ts:99-102`).
  - Matriz `matrix-[Mx] // col-[A][...] // ...` → la fila de la matriz lleva
    `__matrix_Mx__`; cada fila `val-[..] // val-[..]` de esa matriz lleva
    `__matrix_Mx_1__`, `__matrix_Mx_2__`, … (`ExcelImporter.ts:110-131`).
  - Bloque paramétrico `repeat-[grupo:min:max:def]` → `__repeat_<grupo>__`; las
    filas plantilla siguientes → `__template_<grupo>_1__`, `_2__`, …
    (`ExcelImporter.ts:137-157`; solo si `parametric_templates` ON).
- **NUNCA repetir un `partida_item`** dentro de la misma ficha (mayúsc/minúsc y
  espacios se normalizan): el upsert móvil colisiona en la clave
  `templateId|lower(trim(partida))` y las filas se pisan
  (`useExcelImport.ts:68-73`; `Conversion_Fichas §0.3`). El validador (§3) lo
  detecta como error.
- Insertar filas EN MEDIO con partida decimal (`7.5`) ordena bien visualmente
  pero NO es referenciable por fórmula ni entra a rangos — al crear desde cero,
  usar enteros consecutivos y punto.

### 3. VALIDAR con el motor ANTES de insertar (obligatorio)

Si CUALQUIER celda no parsea, la ficha entera cae a Sí/No/NA clásico
(`Conversion_Fichas §0.5`). Antes de tocar la DB, exportar las filas propuestas a
un JSON y correr el validador headless (mismo motor de la app):
```bash
cd "D:\VxP_QAQC_Automatizado"
npx tsx scripts/fichaValidate.ts <COD>_nuevo.json [aux.json]
```
- `<COD>_nuevo.json` = array `[{partida_item, item_description, validation_method,
  section}, …]` en el orden final.
- `aux.json` (si la ficha usa `BUSCAR`) = las `lab_aux_tables` del proyecto
  (`{ "moldes": {"columns":[...], "rows":[[...]]}, … }`).
- Exige `✓ ficha válida`: `isNumericProtocol` OK + 0 errores de
  `validateProtocolSpec` (refs inexistentes, partidas duplicadas, ciclos, gráficos)
  + smoke test sin fórmulas vacías inesperadas (`scripts/fichaValidate.ts:44-126`).
  Lookups sin `aux.json` y celdas xref quedan legítimamente vacías — no es fallo.

### 4. RECETA SQL — insertar template + items (atómico, ids 16-char, bump)

Un solo statement (CTE data-modifying): crea el template, captura su `id` y con él
inserta todas las partidas. `org_id` se OMITE → toma el default de la única org.
`summary_config_json` va **NULL** (todas las fichas de producción lo tienen NULL y
funcionan; ver risky_claim). `is_hidden=false` para que aparezca en el menú.

```sql
WITH now_ms AS (SELECT (extract(epoch from now())*1000)::bigint AS v),
new_t AS (
  INSERT INTO protocol_templates
    (id, project_id, id_protocolo, name, summary_config_json, is_hidden, created_at, updated_at)
  VALUES (
    substr(md5(random()::text || clock_timestamp()::text), 1, 16),
    '⟨PROJECT_ID⟩', '⟨ID_PROTOCOLO⟩', '⟨NOMBRE DE LA FICHA⟩',
    NULL, false, (SELECT v FROM now_ms), (SELECT v FROM now_ms))
  RETURNING id
),
src AS (
  -- ⟨JSON_ITEMS⟩ = array ordenado; una entrada por fila del template.
  -- Ej: [{"partida_item":"1","item_description":"Encabezado","validation_method":"col-[A][P1] // col-[B][P2]","section":"Densidades"},
  --      {"partida_item":"2","item_description":"Peso molde+suelo (g)","validation_method":"numerico-[]:oblig // numerico-[]:oblig","section":"Densidades"}, ...]
  SELECT e.item, e.ord
  FROM jsonb_array_elements('⟨JSON_ITEMS⟩'::jsonb) WITH ORDINALITY AS e(item, ord)
)
INSERT INTO protocol_template_items
  (id, template_id, partida_item, item_description, validation_method, section, created_at, updated_at)
SELECT
  substr(md5(random()::text || clock_timestamp()::text || s.ord::text), 1, 16),
  (SELECT id FROM new_t),
  NULLIF(s.item->>'partida_item',''),
  s.item->>'item_description',
  NULLIF(s.item->>'validation_method',''),
  NULLIF(s.item->>'section',''),
  (SELECT v FROM now_ms), (SELECT v FROM now_ms)
FROM src s
RETURNING template_id, partida_item;
```
Notas:
- `item_description` es NOT NULL — nunca vacío/omitido (headers y gráficos también
  llevan una descripción, aunque sea corta).
- `validation_method` y `section` son nullables; usar `NULLIF(...,'')` para no
  guardar cadenas vacías.
- No se necesita respaldo en `ficha_edit_backups` (no hay datos previos que
  perder), pero si dudas del `id_protocolo`, guarda el pre-chequeo (§1) en el
  scratchpad.

### 5. Encender los flags para que la ficha se VEA

`numeric_protocols` está **OFF por default**; solo se prende solo en proyectos
creados desde el móvil (`src/utils/featureFlags.ts:318`,
`src/screens/ProjectListScreen.tsx:291`). Una ficha numérica (con fórmulas/tablas)
necesita el flag ON o cae al render Sí/No clásico. Merge (JAMÁS pisar el objeto):
```sql
UPDATE projects SET
  feature_flags = coalesce(feature_flags,'{}'::jsonb) || '{"numeric_protocols": true}'::jsonb,
  updated_at = (extract(epoch from now())*1000)::bigint
WHERE id='⟨PROJECT_ID⟩';
```
- Ficha **clásica** (solo `bool-[]`/`texto-[]`, sin celdas numéricas): funciona con
  `classic_protocols` (ON por default) — no requiere `numeric_protocols`.
- Config de PDF de la ficha: opcional, `feature_flags.print_configs[<id_protocolo>]`
  (receta `FLUJO_EDICION_FICHAS §6`). Sin ella el PDF usa defaults.
- Otros flags que afectan el render de la ficha (encender según necesite):
  `map_enabled`+`gps_capture_numeric` (coordenadas), `equipment_catalog`,
  `protocol_codes`+máscaras (código correlativo). Catálogo: `docs/FLAGS_MAPA.md`.

### 6. Cómo aparece en el menú

`EnsayosScreen` lista TODOS los templates no ocultos del proyecto, ordenados por
`id_protocolo` (o `name`), etiqueta `"<id_protocolo> — <name>"`
(`src/screens/EnsayosScreen.tsx:283-288`). Para **crear instancias**, el técnico
usa el botón `+` (o `+Dev`); el template recién insertado ya está disponible.
- `is_hidden=true` → el tipo NO aparece para crear ensayos nuevos; solo se muestra
  si YA tiene instancias, para no perderlas (`EnsayosScreen.tsx:283,464`;
  `LocationProtocolsScreen.tsx:211`). Útil para deprecar sin borrar.
- Para que la ubicación cuente esta ficha como "ensayo esperado" (avance %),
  añadir su `template_id` al CSV `locations.template_ids`
  (`OPERACIONES_DIRECTAS §6`).

### 7. Verificación post-inserción

```sql
-- Conteo de partidas y que el orden numérico sea el esperado
SELECT partida_item, section, left(item_description,40) AS desc, left(validation_method,50) AS dsl
FROM protocol_template_items
WHERE template_id='⟨TEMPLATE_ID⟩'
ORDER BY (NULLIF(regexp_replace(partida_item,'\D','','g'),''))::numeric NULLS LAST, partida_item;

-- Sin partidas duplicadas (normalizadas)
SELECT lower(trim(partida_item)) k, count(*) FROM protocol_template_items
WHERE template_id='⟨TEMPLATE_ID⟩' GROUP BY 1 HAVING count(*)>1;   -- debe ser vacío
```
Luego: el usuario hace pull en el móvil, entra a Ensayos, crea 1 instancia de
prueba de la ficha, la llena y exporta el PDF para confirmar el render.

---

## 9. CARGAR UBICACIONES desde cero (tabla `locations`)

> Complementa OPERACIONES_DIRECTAS §6 (que solo las lista). Aquí se **crean** por
> SQL con el mismo efecto que "Importar Ubicaciones" de la app. Replica el mapeo
> Excel→DB de `src/services/ExcelLocationsImporter.ts` + `useLocationsImport.ts`
> (móvil) y `flow-qaqc-web/lib/excelParser.ts` (web, espejo exacto).

### 9.1 Esquema real y semántica de cada columna

Verificado contra `information_schema` + `src/db/schema.ts:87-99`:

| Columna | NULL | Default | Excel (header) | Qué es / cómo la usa la app |
|---|---|---|---|---|
| `id` | NO | — | (autogenerado) | TEXT, 16 chars estilo WatermelonDB |
| `project_id` | NO | — | — | proyecto dueño |
| `name` | NO | — | `Ubicación` | nombre COMPLETO ej. `P1-Sector1-Cimiento`. **Llave natural de deduplicación** = `lower(trim(name))` por proyecto |
| `reference_plan` | NO | `''` | `PLANO DE REFERENCIA` | CSV de **nombres de plano** (separador `,` o `;`). Enlaza ubicación→plano por `plans.name` case-insensitive |
| `template_ids` | SÍ | NULL | `ID_Protocolos` | CSV (separador **solo `,`**) de **`id_protocolo`** (código humano, p.ej. `PROY-OP-01`), **NO** el `id` de 16 chars. Define los ensayos ESPERADOS = **denominador del avance %** y del dossier |
| `location_only` | SÍ | NULL | `Ubicación_Sola` | parte de agrupación ej. `P1-Sector1`. Agrupa el dossier por grupo de ubicación |
| `specialty` | SÍ | NULL | `Especialidad_Sola` | ej. `Cimiento`/`ARQ`. Agrupa dossier/FLOW por especialidad |
| `created_at`/`updated_at` | NO | — | — | bigint epoch ms |
| `org_id` | NO | default org | — | **omitir** (toma `'11111111-1111-4111-8111-111111111111'`) |

**No hay coordenadas en `locations`** (sin lat/lng). La geometría vive aparte en
`project_sectors.points_json`; `locations` es puramente textual.

**Semántica CRÍTICA de `template_ids`** (el punto que corrompe datos si se equivoca):
- Guarda `protocol_templates.id_protocolo`, no `protocol_templates.id`. Confirmado
  en `src/screens/LocationProtocolsScreen.tsx:191-192`
  (`templateIdList.includes(t.idProtocolo)`) y en el comentario+lookup de
  `src/services/DossierExportService.ts:1263-1267`
  (*"templateIds uses id_protocolo strings"*). Dato real en DB:
  `"PROY-OP-01,PROY-OP-02"`.
- Es el **denominador del avance v31**: `LocationListScreen.tsx:116-121` hace
  `total = template_ids.split(',').length` y `done = ensayos APPROVED de esa
  ubicación`. Mismo denominador para el dossier
  (`DossierExportService.ts:1277-1280`) y para los totales por especialidad
  (`:234`). Un `id_protocolo` mal escrito **infla el denominador** y ese "slot"
  nunca se completa (el avance se queda por debajo de 100% para siempre).
- El separador es **coma**. En `reference_plan` la app además tolera `;`
  (`FileUploadScreen.tsx:158`); en `template_ids` es solo `,`.

### 9.2 Insertar UNA ubicación (parametrizado)

```sql
INSERT INTO locations (id, project_id, name, location_only, specialty,
                       reference_plan, template_ids, created_at, updated_at)
VALUES (
  substr(md5(random()::text || clock_timestamp()::text), 1, 16),
  '⟨PROJECT_ID⟩',
  '⟨P1-Sector1-Cimiento⟩',          -- name (obligatorio)
  ⟨'P1-Sector1' | NULL⟩,            -- location_only (opcional)
  ⟨'Cimiento'  | NULL⟩,             -- specialty (opcional)
  '⟨CIM,DetalleCimientos⟩',         -- reference_plan (nombres de plano; '' si no aplica)
  '⟨PROY-OP-01,PROY-OP-02⟩',        -- template_ids = id_protocolo, CSV coma
  (extract(epoch from now())*1000)::bigint,
  (extract(epoch from now())*1000)::bigint
);
```

### 9.3 Carga masiva — 5 ubicaciones con distintos `template_ids`

Cada fila autogenera su `id` de 16 chars y bumpea timestamps. `org_id` omitido.

```sql
WITH nueva AS (
  SELECT * FROM (VALUES
    -- (name,                  location_only, specialty,  reference_plan,        template_ids)
    ('P1-Sector1-Cimiento',   'P1-Sector1',  'Cimiento', 'CIM,DetalleCimientos','PROY-OP-01,PROY-OP-02'),
    ('P1-Sector2-Cimiento',   'P1-Sector2',  'Cimiento', 'CIM,DetalleCimientos','PROY-OP-01,PROY-OP-02'),
    ('P1-Sector1-ARQ',        'P1-Sector1',  'ARQ',      'ARQ-P1',              'PROY-ARQ-01,PROY-ARQ-02,PROY-ARQ-03'),
    ('P1-Sector1-Estructura', 'P1-Sector1',  'EST',      'EST-P1',              'PROY-EST-01,PROY-EST-02,PROY-EST-03,PROY-EST-04'),
    ('P1-Sector1-Vaciado',    'P1-Sector1',  'EST',      'EST-P1',              'PROY-EST-05')
  ) AS v(name, location_only, specialty, reference_plan, template_ids)
)
INSERT INTO locations (id, project_id, name, location_only, specialty,
                       reference_plan, template_ids, created_at, updated_at)
SELECT substr(md5(random()::text || clock_timestamp()::text || n.name), 1, 16),
       '⟨PROJECT_ID⟩', n.name, n.location_only, n.specialty,
       n.reference_plan, n.template_ids,
       (extract(epoch from now())*1000)::bigint,
       (extract(epoch from now())*1000)::bigint
FROM nueva n;
```

### 9.4 Carga IDEMPOTENTE (re-ejecutable, como la re-importación de la app)

No hay UNIQUE en `(project_id, name)` en la DB — la deduplicación la hace el
**código** por `lower(trim(name))` (`useLocationsImport.ts:44-57`). Por eso un
INSERT crudo repetido **duplica** filas. Para replicar el "duplicados omitidos",
insertar solo lo que no existe:

```sql
WITH nueva AS (
  SELECT * FROM (VALUES
    ('P1-Sector2-ARQ', 'P1-Sector2', 'ARQ', 'ARQ-P1', 'PROY-ARQ-01,PROY-ARQ-02,PROY-ARQ-03')
  ) AS v(name, location_only, specialty, reference_plan, template_ids)
)
INSERT INTO locations (id, project_id, name, location_only, specialty,
                       reference_plan, template_ids, created_at, updated_at)
SELECT substr(md5(random()::text || clock_timestamp()::text || n.name), 1, 16),
       '⟨PROJECT_ID⟩', n.name, n.location_only, n.specialty,
       n.reference_plan, n.template_ids,
       (extract(epoch from now())*1000)::bigint,
       (extract(epoch from now())*1000)::bigint
FROM nueva n
WHERE NOT EXISTS (
  SELECT 1 FROM locations l
  WHERE l.project_id = '⟨PROJECT_ID⟩'
    AND lower(trim(l.name)) = lower(trim(n.name))
);
```

Para **actualizar** una existente (el otro brazo del import, `useLocationsImport.ts:65-73`):
```sql
UPDATE locations SET
  location_only = ⟨'P1-Sector2' | NULL⟩, specialty = ⟨'ARQ' | NULL⟩,
  reference_plan = '⟨ARQ-P1⟩', template_ids = '⟨PROY-ARQ-01,PROY-ARQ-02⟩',
  updated_at = (extract(epoch from now())*1000)::bigint
WHERE project_id='⟨PROJECT_ID⟩' AND lower(trim(name))=lower(trim('⟨P1-Sector2-ARQ⟩'));
```

### 9.5 Validación OBLIGATORIA después de cargar

**a) `template_ids` apuntan a plantillas reales** (si no, el avance % nunca llega a 100):
```sql
-- Lista id_protocolo referenciados en locations que NO existen como plantilla
WITH refs AS (
  SELECT l.id, l.name, trim(t) AS id_protocolo
  FROM locations l,
       LATERAL unnest(string_to_array(coalesce(l.template_ids,''), ',')) AS t
  WHERE l.project_id='⟨PROJECT_ID⟩' AND trim(t) <> ''
)
SELECT r.name, r.id_protocolo
FROM refs r
LEFT JOIN protocol_templates pt
  ON pt.project_id='⟨PROJECT_ID⟩' AND pt.id_protocolo = r.id_protocolo
WHERE pt.id IS NULL;   -- filas devueltas = referencias rotas que inflan el avance
```

**b) `reference_plan` enlaza a planos existentes** (opcional; solo afecta el visor/vínculo, no el avance):
```sql
WITH refs AS (
  SELECT l.name, trim(both from p) AS plan_name
  FROM locations l,
       LATERAL unnest(string_to_array(coalesce(l.reference_plan,''), ',')) AS p
  WHERE l.project_id='⟨PROJECT_ID⟩' AND trim(p) <> ''
)
SELECT r.name, r.plan_name
FROM refs r
LEFT JOIN plans pl
  ON pl.project_id='⟨PROJECT_ID⟩' AND lower(trim(pl.name)) = lower(r.plan_name)
WHERE pl.id IS NULL;   -- planos nombrados que aún no se han subido a S3/plans
```

### 9.6 Notas operativas

- **Push a la nube**: escribir en Supabase ya es "la nube". Los dispositivos con la
  obra sincronizada adoptan las ubicaciones por LWW gracias al `updated_at`
  bumpeado. No hay S3 involucrado para `locations` (el Excel original se sube a
  S3 solo como respaldo en el flujo de la app, `useLocationsImport.ts:99-105`; es
  prescindible al cargar por SQL).
- **`location_only`/`specialty` NO son obligatorios para el avance** — el avance
  usa solo `template_ids`. Se recomiendan igual porque agrupan el dossier y los
  filtros/totales por especialidad (`LocationListScreen.tsx:126-127`,
  `DossierExportService.ts:232-236`); sin ellos esas ubicaciones no suman a los
  totales por especialidad ni aparecen agrupadas.
- **`reference_plan` puede ir `''`** (default) si la ubicación no enlaza plano.
- El orden de aparición (por `created_at`) determina el orden del dossier
  (`DossierExportService.ts:1233-1234`): cargar en el orden deseado o espaciar los
  `created_at` si importa el orden exacto.


---

## 9. CARGAR EQUIPOS de laboratorio y maquinaria pesada (`equipment` + trazabilidad)

> Complementa OPERACIONES_DIRECTAS §1 (el gate de equipos vencidos que bloquea la
> firma) y FLAGS_MAPA (`traceability_module`, `equipment_catalog`). Aquí se
> **crean desde cero** equipos y su cadena de trazabilidad (actividades,
> plantillas de formulario, vínculos con protocolos). No duplica la EDICIÓN de
> fichas.

### 9.0 Modelo mental (dos categorías, un solo `equipment`)

Todo equipo vive en la tabla `equipment` con una columna `category` que lo parte en dos mundos (`src/db/models/Equipment.ts:4-12`):

| category | Para qué | `type` válidos | Calibración |
|---|---|---|---|
| `laboratorio` | Equipos QA/QC (calibrables). Se enlazan a protocolos y **su vencimiento bloquea la firma**. | `balanza`, `prensa`, `horno`, `tamiz`, `termometro` | Real (`next_calibration_at` < hoy = vencido) |
| `maquinaria_pesada` | Excavadoras, rodillos, etc. Usados por el módulo de **Trazabilidad operacional** (sesiones de trabajo). No se calibran. | `excavadora`, `compactador`, `motoniveladora`, `retroexcavadora`, `cargador_frontal`, `volquete`, `cisterna`, `rodillo`, `otros` | Sentinel lejano (no aplica) |

La UI son dos pestañas separadas que fuerzan la categoría al importar (`src/screens/FileUploadScreen.tsx:789-790` → `EquiposTab category="laboratorio" | "maquinaria_pesada"`). Equipos pre-v40 sin categoría se tratan como `laboratorio` (`FileUploadScreen.tsx:1558`).

**Enums verificados** (no hay CHECK constraint en la DB — la validación es solo de la app, así que un valor mal escrito NO da error de SQL pero rompe filtros y UI):
- `category`: **`laboratorio`** | **`maquinaria_pesada`** (NOT `maquinaria`). Default DB = `laboratorio`.
- `status`: **`active`** | **`inactive`** | **`retired`**. Default DB = `active`. El gate de firma trata cualquier `status !== 'active'` como bloqueante (`audit/page.tsx:153`).
- `type`: los de la tabla de arriba según categoría.

**Columnas NOT NULL** (esquema real): `project_id`, `code`, `name`, `type`, `next_calibration_at` (bigint), `status` (default), `category` (default), `created_at`, `updated_at`. Opcionales (nullable): `brand`, `model`, `serial`, `capacity`, `resolution`, `last_calibration_at`, `calibration_certificate_s3`, `notes`. `org_id` se OMITE (toma el default de la única org).

### 9.1 El gate de calibración BLOQUEA la firma (importante para §1)

Confirmado en la auditoría (`flow-qaqc-web/.../audit/page.tsx:150-156` y `:409-410`):

```
expiredLinked = linked.filter(l => calibrationState(l.equipment)==='expired' || l.equipment.status !== 'active')
equipmentBlock = equipmentEnabled && expiredLinked.length > 0
canApprove = !equipmentBlock          // ← el jefe NO puede aprobar si hay equipo vencido/inactivo enlazado
```

`calibrationState` (`flow-qaqc-web/types/index.ts:763-768`): `expired` si `next_calibration_at < now`; `soon` si faltan < 30 días; `ok` si ≥ 30 días. El bloqueo solo aplica si **ambos** flags están ON: `traceability_module` **Y** `equipment_catalog` (`isEquipmentCatalogEnabled`, `types/index.ts:243-245`). Con los flags OFF, la sección de equipos ni aparece y no bloquea nada.

> Regla operativa: si vas a aprobar un ensayo por SQL (§1) en un proyecto con `equipment_catalog` ON, primero verifica que ningún equipo enlazado en `protocol_equipment` esté vencido o inactivo — si no, estarías saltándote una salvaguarda que la app impone. Query de chequeo:
> ```sql
> SELECT e.code, e.name, e.status,
>        to_timestamp(e.next_calibration_at/1000) AS vence,
>        (e.next_calibration_at < (extract(epoch from now())*1000)::bigint) AS vencido
> FROM protocol_equipment pe JOIN equipment e ON e.id=pe.equipment_id
> WHERE pe.protocol_id='⟨PROTOCOL_ID⟩';
> ```

### 9.2 Fechas de calibración (bigint epoch ms)

`last_calibration_at` (nullable) y `next_calibration_at` (**NOT NULL**) son bigint epoch ms. Para una fecha civil concreta:
```sql
(extract(epoch from timestamptz '2027-03-15')*1000)::bigint
```
**Maquinaria pesada** no se calibra, pero la columna es NOT NULL: la app usa un **sentinel a 2099-12-31** para no dispararlo nunca como vencido (`src/services/EquipmentExcelImporter.ts:98-99`: `Date.UTC(2099,11,31)`). En SQL:
```sql
(extract(epoch from timestamptz '2099-12-31 00:00:00+00')*1000)::bigint  -- = Date.UTC(2099,11,31) = 4102272000000 (sentinel far-future; el día exacto no importa, solo que > now)
```

### 9.3 Receta A — Cargar 3 equipos de LABORATORIO

Ids de 16 chars, timestamps bumpeados, `org_id`/`status`/`category` por default (los explicito para claridad):

```sql
INSERT INTO equipment
  (id, project_id, code, name, type, category, brand, model, serial,
   capacity, resolution, last_calibration_at, next_calibration_at,
   status, notes, created_at, updated_at)
VALUES
  (substr(md5(random()::text||clock_timestamp()::text),1,16), '⟨PROJECT_ID⟩',
   '⟨BAL-01⟩', '⟨Balanza analítica⟩', 'balanza', 'laboratorio',
   ⟨'Ohaus'|NULL⟩, ⟨'PX224'|NULL⟩, ⟨'B-2024-01'|NULL⟩,
   ⟨'220 g'|NULL⟩, ⟨'0.1 mg'|NULL⟩,
   ⟨(extract(epoch from timestamptz '2026-03-15')*1000)::bigint | NULL⟩,
   (extract(epoch from timestamptz '2027-03-15')*1000)::bigint,
   'active', ⟨NULL⟩,
   (extract(epoch from now())*1000)::bigint, (extract(epoch from now())*1000)::bigint),

  (substr(md5(random()::text||clock_timestamp()::text||'2'),1,16), '⟨PROJECT_ID⟩',
   '⟨PRE-01⟩', '⟨Prensa de compresión⟩', 'prensa', 'laboratorio',
   NULL, NULL, NULL, ⟨'2000 kN'|NULL⟩, ⟨'1 kN'|NULL⟩,
   NULL, (extract(epoch from timestamptz '2027-01-31')*1000)::bigint,
   'active', NULL,
   (extract(epoch from now())*1000)::bigint, (extract(epoch from now())*1000)::bigint),

  (substr(md5(random()::text||clock_timestamp()::text||'3'),1,16), '⟨PROJECT_ID⟩',
   '⟨HOR-01⟩', '⟨Horno de secado⟩', 'horno', 'laboratorio',
   NULL, NULL, NULL, ⟨'250 °C'|NULL⟩, NULL,
   NULL, (extract(epoch from timestamptz '2027-06-30')*1000)::bigint,
   'active', NULL,
   (extract(epoch from now())*1000)::bigint, (extract(epoch from now())*1000)::bigint);
```

> `code` debe ser único por proyecto (el dedup del importador colapsa códigos repetidos, `EquipmentExcelImporter.ts:47-59`). El certificado de calibración (`calibration_certificate_s3`) es un archivo en S3 (AWS), NO bytes en la DB — se sube por la app; por SQL solo guardas la KEY si ya la subiste (ver subsistema S3). Déjalo NULL si no hay.

### 9.4 Receta B — Cargar 2 equipos de MAQUINARIA PESADA

```sql
INSERT INTO equipment
  (id, project_id, code, name, type, category, brand, model, serial,
   next_calibration_at, status, created_at, updated_at)
VALUES
  (substr(md5(random()::text||clock_timestamp()::text||'m1'),1,16), '⟨PROJECT_ID⟩',
   '⟨EXC-01⟩', '⟨Excavadora CAT 320⟩', 'excavadora', 'maquinaria_pesada',
   ⟨'Caterpillar'|NULL⟩, ⟨'320D'|NULL⟩, ⟨'CAT0320XXX'|NULL⟩,
   (extract(epoch from timestamptz '2099-12-31 00:00:00+00')*1000)::bigint,  -- sentinel: no calibra
   'active',
   (extract(epoch from now())*1000)::bigint, (extract(epoch from now())*1000)::bigint),

  (substr(md5(random()::text||clock_timestamp()::text||'m2'),1,16), '⟨PROJECT_ID⟩',
   '⟨ROD-01⟩', '⟨Rodillo vibratorio⟩', 'rodillo', 'maquinaria_pesada',
   ⟨'Hamm'|NULL⟩, ⟨'3410'|NULL⟩, NULL,
   (extract(epoch from timestamptz '2099-12-31')*1000)::bigint,
   'active',
   (extract(epoch from now())*1000)::bigint, (extract(epoch from now())*1000)::bigint);
```

Para que la pestaña de maquinaria y las sesiones de trabajo aparezcan en la app, activa los flags (merge, ver §2):
```sql
UPDATE projects SET
  feature_flags = coalesce(feature_flags,'{}'::jsonb)
    || '{"traceability_module": true, "equipment_catalog": true}'::jsonb,
  updated_at=(extract(epoch from now())*1000)::bigint
WHERE id='⟨PROJECT_ID⟩';
```

### 9.5 Vincular equipos de LAB a un ensayo (`protocol_equipment`)

Es el enlace "equipos usados en este protocolo" que la app graba desde el AUDIT (`ProtocolEquipment.ts:14-18`). Columnas: `protocol_id`, `equipment_id`, `used_at` (bigint, momento declarado de uso — NOT NULL). No tiene `updated_at` (solo `created_at`):

```sql
INSERT INTO protocol_equipment (id, protocol_id, equipment_id, used_at, created_at)
VALUES (substr(md5(random()::text||clock_timestamp()::text),1,16),
        '⟨PROTOCOL_ID⟩', '⟨EQUIPMENT_ID⟩',
        (extract(epoch from now())*1000)::bigint,
        (extract(epoch from now())*1000)::bigint);
```
Un equipo por fila (repetir para varios). Recuerda el gate §9.1: si enlazas un equipo vencido/inactivo, bloqueas la aprobación en la web.

### 9.6 Trazabilidad de MAQUINARIA — actividades y plantillas de formulario

Cadena: **actividad** (catálogo) → **puente equipo↔actividad** (opcionalmente con **plantilla de formulario inicial**) → el técnico levanta **sesiones de trabajo** desde la app. Solo cargas el catálogo por SQL; las sesiones (`work_sessions`, con status `ACTIVE`/`PAUSED`/`CLOSED`) las crea el técnico en campo (`WorkSession.ts:7-15`) — no las siembres a mano salvo demo.

**a) Actividad** (`Activity.ts:4-14`). `kind` NOT NULL default `productive`; valores: `productive` | `maintenance` | `transport` | `other`.
```sql
INSERT INTO activities (id, project_id, name, kind, created_at, updated_at)
VALUES (substr(md5(random()::text||clock_timestamp()::text),1,16), '⟨PROJECT_ID⟩',
        '⟨Excavación de zanja⟩', 'productive',
        (extract(epoch from now())*1000)::bigint, (extract(epoch from now())*1000)::bigint);
```

**b) (Opcional) Plantilla de formulario inicial** (`SessionFormTemplate.ts` + `SessionFormTemplateItem.ts:11-16`). Lo que el técnico llena antes de arrancar la sesión. `validation_method` reusa la MISMA sintaxis de `protocol_template_items` (`numerico-[min:max]`, `list-[a,b,c]`, `comment-[...]`, etc.):
```sql
-- Cabecera
INSERT INTO session_form_templates (id, project_id, name, created_at, updated_at)
VALUES (substr(md5(random()::text||clock_timestamp()::text),1,16), '⟨PROJECT_ID⟩',
        '⟨Chequeo pre-operacional⟩',
        (extract(epoch from now())*1000)::bigint, (extract(epoch from now())*1000)::bigint)
RETURNING id;   -- ⟨TEMPLATE_ID⟩

-- Ítems (partida_item / validation_method / section son nullable; item_description NOT NULL)
INSERT INTO session_form_template_items
  (id, template_id, partida_item, item_description, validation_method, section, created_at, updated_at)
VALUES
  (substr(md5(random()::text||clock_timestamp()::text||'i1'),1,16), '⟨TEMPLATE_ID⟩',
   NULL, '⟨Nivel de combustible (%)⟩', 'numerico-[0:100]', '⟨Inspección⟩',
   (extract(epoch from now())*1000)::bigint, (extract(epoch from now())*1000)::bigint),
  (substr(md5(random()::text||clock_timestamp()::text||'i2'),1,16), '⟨TEMPLATE_ID⟩',
   NULL, '⟨Estado de neumáticos⟩', 'list-[Bueno,Regular,Malo]', '⟨Inspección⟩',
   (extract(epoch from now())*1000)::bigint, (extract(epoch from now())*1000)::bigint);
```

**c) Puente equipo↔actividad** (`EquipmentActivity.ts:10-12`). `form_template_id` nullable (NULL = sin formulario previo):
```sql
INSERT INTO equipment_activities
  (id, equipment_id, activity_id, form_template_id, created_at, updated_at)
VALUES (substr(md5(random()::text||clock_timestamp()::text),1,16),
        '⟨EQUIPMENT_ID (maquinaria)⟩', '⟨ACTIVITY_ID⟩', ⟨'⟨TEMPLATE_ID⟩'|NULL⟩,
        (extract(epoch from now())*1000)::bigint, (extract(epoch from now())*1000)::bigint);
```

### 9.7 Cómo se ve en la app (gates)

- Equipos de **lab** en el AUDIT del ensayo y su bloqueo de firma: requieren `traceability_module` **Y** `equipment_catalog` ON (`isEquipmentCatalogEnabled`). Con eso, aparece la sección "Equipos calibrados" con badges `VENCIDO`/`PRÓXIMO` (`audit/page.tsx:1132-1133`).
- Pestañas de carga (Equipos Lab / Maquinaria, sectores, actividades) y las **sesiones de trabajo** salen bajo el módulo de Trazabilidad (`TraceabilityHomeScreen`/`TraceabilityCaptureScreen`), gateadas por `traceability_module`.
- Tras cualquier INSERT, la obra debe estar sincronizada: el sync LWW del móvil adopta las filas por `updated_at`.


---

## Carga y creación desde cero por SQL (complemento — lo que FALTABA)

> Complementa OPERACIONES_DIRECTAS.md (aprobar/flags/usuarios/aux/codificación),
> FLUJO_EDICION_FICHAS.md (EDITAR fichas + PDF + volcado) y FLAGS_MAPA.md.
> Aquí: **CREAR desde cero** ubicaciones, equipos, **sectores con geometría** y
> **planos** (con el veredicto honesto sobre S3). Reglas universales heredadas:
> ids TEXT de 16 chars (`substr(md5(random()::text||clock_timestamp()::text),1,16)`),
> `created_at`/`updated_at` = `(extract(epoch from now())*1000)::bigint`,
> `org_id` **se omite** (default `11111111-1111-4111-8111-111111111111`, única org).

---

### A. SECTORES (project_sectors) — carga con GEOMETRÍA

Reglas de negocio (fuente: `flow-qaqc-web/lib/sectorParser.ts` + importer
`flow-qaqc-web/hooks/useFileUpload.ts:920-994`):

- **`points_json`** (jsonb): array `[{"lat":..,"lng":..}]` en **WGS84 lat/lng**,
  en **orden de polígono**, **anillo ABIERTO** — el primer vértice NO se repite
  al final; el render (Leaflet/react-native-maps) lo cierra solo (`closeRing`,
  sectorParser.ts:98-105). `NULL` = sector solo-nombre (sin geometría).
- Mínimo **3 puntos** válidos para que cuente como polígono (sectorParser.ts:228).
- Si tus datos vienen en **UTM/PSAD56**, hay que reproyectar a WGS84 ANTES (el
  parser usa proj4; en SQL puro no hay proj4 → **convierte tú los vértices a
  lat/lng WGS84 antes del INSERT**, o pide el archivo y que el usuario lo importe).
- **`display_color`**: hex de la paleta de sectores (distinta de los colores de
  estado) — `#7E57C2 #00897B #C2185B #8D6E63 #5E35B1 #0097A7 #AD1457 #6D4C41`
  (useFileUpload.ts:920), asignada por índice.
- **`source_system`** (text, nullable): etiqueta informativa del CRS de origen
  (ej. `'WGS84_UTM18S'`), no afecta el render.
- **`sort_order`** (int, nullable): orden de despliegue.
- UNIQUE(project_id, name) — el importer hace upsert por nombre (case-insensitive).
- Al crear/editar geometría, la asignación `protocols.sector_id` NO se recalcula
  sola por SQL: la app la recomputa (`recalculateSectorAssignments`, point-in-polygon)
  al abrir el módulo; por SQL habría que replicar el point-in-polygon si urge.

**Receta — 3 sectores (1 solo-nombre + 2 con polígono):**
```sql
WITH now_ms AS (SELECT (extract(epoch from now())*1000)::bigint AS v)
INSERT INTO project_sectors (id, project_id, name, points_json, display_color, source_system, sort_order, created_at, updated_at)
VALUES
  -- (1) solo nombre, sin geometría
  (substr(md5(random()::text||clock_timestamp()::text),1,16), '⟨PID⟩', '⟨Sector A⟩',
   NULL, '#7E57C2', NULL, 0,
   (SELECT v FROM now_ms), (SELECT v FROM now_ms)),
  -- (2) cuadrilátero (4 vértices, anillo ABIERTO — NO repetir el 1º)
  (substr(md5(random()::text||clock_timestamp()::text),1,16), '⟨PID⟩', '⟨Sector B⟩',
   '[{"lat":⟨-12.0461⟩,"lng":⟨-77.0306⟩},{"lat":⟨-12.0461⟩,"lng":⟨-77.0290⟩},{"lat":⟨-12.0475⟩,"lng":⟨-77.0290⟩},{"lat":⟨-12.0475⟩,"lng":⟨-77.0306⟩}]'::jsonb,
   '#00897B', '⟨WGS84_LATLNG⟩', 1,
   (SELECT v FROM now_ms), (SELECT v FROM now_ms)),
  -- (3) triángulo (3 vértices)
  (substr(md5(random()::text||clock_timestamp()::text),1,16), '⟨PID⟩', '⟨Sector C⟩',
   '[{"lat":⟨-12.048⟩,"lng":⟨-77.031⟩},{"lat":⟨-12.048⟩,"lng":⟨-77.029⟩},{"lat":⟨-12.050⟩,"lng":⟨-77.030⟩}]'::jsonb,
   '#C2185B', '⟨WGS84_LATLNG⟩', 2,
   (SELECT v FROM now_ms), (SELECT v FROM now_ms));
```
Verificación: `SELECT name, jsonb_array_length(points_json) AS vertices, display_color FROM project_sectors WHERE project_id='⟨PID⟩';`
Para que se vean, activar `map_enabled` (FLAGS §Geolocalización).

---

### B. PLANOS (plans) — VEREDICTO S3 (crítico y honesto)

**Los BYTES del PDF/DWG viven en AWS S3, NO en la base.** La tabla `plans` solo
guarda **metadatos + puntero** (`s3_key`). Investigación del mecanismo real de
subida:

| Vía de subida | Archivo | Fuente | Credencial que exige |
|---|---|---|---|
| Web browser | `uploadBlobToS3` → `PutObjectCommand` | `flow-qaqc-web/lib/s3-upload.ts:33-52` | `NEXT_PUBLIC_AWS_ACCESS_KEY_ID`/`SECRET_ACCESS_KEY` (env) |
| Web API route | `S3Client.send(PutObjectCommand)` | `flow-qaqc-web/app/api/plans/upload/route.ts:63-95` | mismas env AWS del server |
| Móvil | `S3Service` (subir/`downloadFromS3`) | `src/services/S3Service.ts` | keys AWS embebidas en la app |

**No hay Supabase Storage para planos: es AWS S3 puro.** (Ningún `supabase.storage`
en el flujo de planos; todos usan `@aws-sdk/client-s3`.)

**¿Puedo YO (Claude, solo SQL Supabase MCP, sin credenciales AWS) subir el archivo?
→ NO.** El MCP de Supabase (service role de Postgres) no da acceso a S3. Las tres
vías exigen llaves AWS que no tengo. **Un INSERT en `plans` SIN el objeto en S3 deja
un plano ROTO**: aparece en la lista pero al abrirlo el visor falla —
`react-native-pdf` no encuentra el archivo local, la descarga `downloadFromS3`
tira 404 → `pdfError` / botón "Descargar" que no resuelve
(`src/screens/PlanViewerScreen.tsx:339-358, 960-1028`); en web el presigned URL
apunta a un objeto inexistente. **No se puede ver ni anotar útilmente** (las
anotaciones son % sobre la imagen del plano; sin imagen no hay lienzo real).

**Convención de `s3_key`** (upload/route.ts:68-80, S3 prefix s3-upload.ts:91-93):
- PDF: `projects/⟨proyecto_sanitizado⟩/plans/⟨archivo.pdf⟩`
- DWG: `projects/⟨proyecto_sanitizado⟩/plansdwg/⟨archivo.dwg⟩`
- `sanitize` = lowercase → NFD sin diacríticos → `[^a-z0-9._-]`→`_` → colapsa `_`
  → recorta `_` de bordes → 60 chars (s3-upload.ts:65-74). ⚠ **Se sanitiza el
  NOMBRE DE PROYECTO**, no solo el archivo.
- `plans.name` = nombre de archivo **SIN extensión** (`planName`).
- El móvil **reconstruye la ruta por convención** (`s3ProjectPrefix(projectName)/plans/<name>.pdf`,
  PlanViewerScreen.tsx:348) — NO lee la columna `s3_key`; la web SÍ usa `s3_key`
  (`useS3Url`). → Si el archivo real no está en esa ruta exacta, ambos rompen.

**`file_uri` vs `s3_key`**: `file_uri` es **NOT NULL sin default** → hay que
mandar `''` (la app siempre inserta cadena vacía; upload/route.ts:123). `s3_key`
(nullable) es el puntero real a S3. `s3_etag`/`local_etag` (nullable) = control de
versión de caché (se llenan al subir; puedes dejarlos NULL).

**`file_type`**: default `'pdf'`; el file picker móvil **solo acepta `application/pdf`**
(`PlansManagementScreen.tsx:569-570`) para el visor. El DWG existe como tipo
(`file_type='dwg'`, carpeta `plansdwg/`) pero **NO se renderiza in-app**: se abre
en una app externa vía `Sharing`/IntentLauncher (`PlanViewerScreen.tsx:319-335`).
→ Un `plans` con `file_type='dwg'` es solo un adjunto descargable, no un lienzo
anotable.

**CONCLUSIÓN — qué es SQL-drivable por mí y qué NO:**
- ❌ **Subir el PDF/DWG a S3 = NO puedo.** Requiere que el usuario lo suba por la
  app (móvil "Planos" o web pestaña file-upload). Ese paso es **exclusivo del usuario**.
- ✅ Una vez el archivo YA está en S3 (subido por el usuario), SÍ puedo por SQL:
  crear/duplicar la fila `plans` apuntando al `s3_key` correcto, **vincular a
  ubicaciones** (`location_id` o vía `locations.reference_plan`), y **gestionar
  todas las anotaciones** (`plan_annotations` + `annotation_comments`) — son 100%
  SQL, coordenadas en % de imagen.

**Receta — vincular un plano YA subido a una ubicación (metadato puro):**
```sql
-- Solo si ⟨s3_key⟩ ya existe como objeto en S3 (subido por el usuario)
WITH now_ms AS (SELECT (extract(epoch from now())*1000)::bigint AS v)
INSERT INTO plans (id, project_id, location_id, name, file_uri, s3_key, s3_etag,
                   file_type, uploaded_by_id, created_at, updated_at)
VALUES (substr(md5(random()::text||clock_timestamp()::text),1,16), '⟨PID⟩',
        ⟨'LOC_ID' | NULL⟩, '⟨nombre_sin_extension⟩', '',
        'projects/⟨proyecto_sanitizado⟩/plans/⟨archivo.pdf⟩', NULL,
        'pdf', '', (SELECT v FROM now_ms), (SELECT v FROM now_ms));
```
Alternativa de vínculo sin `location_id`: poner el nombre del plano en
`locations.reference_plan` (CSV, ej. `'PLANO-01, PLANO-02'`); la app matchea
plano↔ubicación por ese nombre (upload/route.ts:24-35).

**Receta — anotación sobre un plano existente (SÍ es SQL puro):**
```sql
-- dot = rect_width=0 y rect_height=0; rect = ancho/alto en % de la imagen
WITH now_ms AS (SELECT (extract(epoch from now())*1000)::bigint AS v)
INSERT INTO plan_annotations (id, plan_id, protocol_id, rect_x, rect_y,
   rect_width, rect_height, comment, sequence_number, is_ok, status,
   created_by_id, page, priority, created_at, updated_at)
VALUES (substr(md5(random()::text||clock_timestamp()::text),1,16), '⟨PLAN_ID⟩',
   ⟨'PROTOCOL_ID' | NULL⟩, ⟨0.42⟩, ⟨0.31⟩, ⟨0⟩, ⟨0⟩, '⟨observación⟩',
   ⟨1⟩, false, 'OPEN', '⟨USER_ID⟩', ⟨1⟩, ⟨'high'|NULL⟩,
   (SELECT v FROM now_ms), (SELECT v FROM now_ms));
```
`rect_x/y/width/height` son **coordenadas de IMAGEN en % (0..1), no geográficas**
(usePlanViewer.ts:9-40). `protocol_id` NULL = anotación general del plano;
con id = anotación del contexto de ese ensayo. `priority` ∈ `low|medium|high|NULL`.

---

### C. UBICACIONES (locations) — creación desde cero

Fuente: `importLocationsToSupabase` (useFileUpload.ts:486-542). Columnas NOT NULL:
`name`, `reference_plan` (default `''`), `project_id`. `template_ids` (CSV de ids
de `protocol_templates`) define los ensayos ESPERADOS de la ubicación → base del
avance % (upsert por nombre case-insensitive).
```sql
WITH now_ms AS (SELECT (extract(epoch from now())*1000)::bigint AS v)
INSERT INTO locations (id, project_id, name, reference_plan, template_ids,
                       location_only, specialty, created_at, updated_at)
VALUES (substr(md5(random()::text||clock_timestamp()::text),1,16), '⟨PID⟩',
        '⟨Progresiva 0+100⟩', '⟨PLANO-01⟩', '⟨tid1,tid2⟩', NULL, '⟨Suelos⟩',
        (SELECT v FROM now_ms), (SELECT v FROM now_ms));
```

### D. EQUIPOS (equipment) — Lab. y Maquinaria

Fuente: `importEquipmentToSupabase` (useFileUpload.ts:561-633). NOT NULL: `code`,
`name`, `type`, `next_calibration_at`, `category` (def `'laboratorio'`), `status`
(def `'active'`). `type` válido (si no cae a `'otros'`): laboratorio →
`balanza|prensa|horno|tamiz|termometro`; maquinaria →
`excavadora|compactador|motoniveladora|retroexcavadora|cargador_frontal|volquete|cisterna|rodillo`;
más `otros`. Upsert por (project_id, code).
⚠ **Maquinaria sin calibración**: `next_calibration_at` es NOT NULL → usar el
**sentinel año 2099** `4102358400000` (`Date.UTC(2099,11,31)`, useFileUpload.ts:588);
la UI ignora la calibración cuando `category='maquinaria_pesada'`.
`calibration_certificate_s3` (nullable) referencia un PDF de certificado en S3
(mismo límite que planos: solo el puntero es SQL-drivable, el archivo lo sube el
usuario).
```sql
WITH now_ms AS (SELECT (extract(epoch from now())*1000)::bigint AS v)
INSERT INTO equipment (id, project_id, code, name, type, category, brand, model,
   serial, capacity, resolution, last_calibration_at, next_calibration_at,
   status, notes, created_at, updated_at)
VALUES
  (substr(md5(random()::text||clock_timestamp()::text),1,16), '⟨PID⟩',
   '⟨BAL-001⟩', '⟨Balanza analítica⟩', 'balanza', 'laboratorio', '⟨Ohaus⟩',
   '⟨PA224⟩', '⟨SN123⟩', '⟨220g⟩', '⟨0.1mg⟩',
   ⟨1735689600000⟩, ⟨1767225600000⟩, 'active', NULL,
   (SELECT v FROM now_ms), (SELECT v FROM now_ms)),
  -- Maquinaria sin calibración → sentinel 2099
  (substr(md5(random()::text||clock_timestamp()::text),1,16), '⟨PID⟩',
   '⟨EXC-01⟩', '⟨Excavadora CAT⟩', 'excavadora', 'maquinaria_pesada', '⟨CAT⟩',
   '⟨320D⟩', NULL, NULL, NULL, NULL, 4102358400000, 'active', NULL,
   (SELECT v FROM now_ms), (SELECT v FROM now_ms));
```

### E. TABLAS AUXILIARES (lab_aux_tables) desde cero
Cubierto en OPERACIONES_DIRECTAS §5 (crear grupo BUSCAR). Nota extra: la tabla
soporta `last_calibration_at`/`next_calibration_at` (nullable) para tratar
constantes/tablas como calibrables (split Lab); `columns_json`/`rows_json` tienen
default `'[]'`, la 1ª columna es la LLAVE de BUSCAR.

---

# Configuración de Proyecto desde cero (por SQL) + Fundamentos de S3

> Complementa `docs/OPERACIONES_DIRECTAS.md` (§2 flags, §3 accesos, §5 tablas aux, §6 sectores/columnas),
> `docs/FLUJO_EDICION_FICHAS.md` (editar fichas + PDF) y `docs/FLAGS_MAPA.md` (catálogo).
> Aquí: **CREAR/CARGAR desde cero** lo que aún no está documentado (proyecto nuevo, presets de flags,
> sectores/ubicaciones/equipos, logo/ortofoto/stamp) y el **veredicto transversal de S3**.
>
> Reglas universales (ver ambos docs): `org_id` se OMITE (toma el default `11111111-1111-4111-8111-111111111111`,
> única org). Ids TEXT de 16 chars: `substr(md5(random()::text||clock_timestamp()::text),1,16)`
> (UUID de 36 también es válido — el sync solo exige unicidad). `created_at`/`updated_at` = bigint epoch ms:
> `(extract(epoch from now())*1000)::bigint`. TODA escritura los bumpea (LWW del móvil). Operar con la obra sincronizada.

## 1. Crear un PROYECTO nuevo por SQL

Espejo exacto del alta de la web (`flow-qaqc-web/hooks/useProjects.ts:83-92`): inserta `id, name, status:'ACTIVE',
password, created_by_id, feature_flags, created_at, updated_at`. NOT NULL relevantes: `name`, `status` (DEFAULT `'ACTIVE'`),
`feature_flags` (DEFAULT `'{}'`). `feature_flags` es **JSONB** en Supabase (en el móvil se guarda como string y se parsea:
`src/utils/featureFlags.ts:388`).

```sql
INSERT INTO projects (id, name, status, password, created_by_id, feature_flags, created_at, updated_at)
VALUES (
  substr(md5(random()::text||clock_timestamp()::text),1,16),
  '⟨NOMBRE_PROYECTO⟩',
  'ACTIVE',
  '⟨PASSWORD_ALTA⟩',                 -- contraseña para el alta self-service por la app
  '⟨CREATOR_USER_ID⟩',              -- users.id del Creador (rol CREATOR)
  '⟨PRESET_FLAGS_JSON⟩'::jsonb,     -- ver §2 (arranque recomendado, NO '{}')
  (extract(epoch from now())*1000)::bigint,
  (extract(epoch from now())*1000)::bigint
)
RETURNING id;
```

Después del INSERT:
- **Dar acceso al Creador y al equipo**: ver `OPERACIONES_DIRECTAS §3` (INSERT en `user_project_access`, o la RPC
  `join_project_with_password(p_project_name, p_password)` que usa la app para el alta por contraseña —
  `useProjects.ts:199`). El `created_by_id` NO crea acceso solo; hay que insertar la fila de `user_project_access`.
- **Cargar plantillas de ensayo**: si vas a volcar fichas desde otro proyecto, sigue el checklist de 8 piezas de
  `FLUJO_EDICION_FICHAS §7`.

> Recomendación operativa: arrancar `feature_flags` con un **preset** (§2), no con `'{}'`. Con `'{}'` el móvil aplica
> `DEFAULT_FEATURE_FLAGS` en lectura (`mergeFeatureFlags`, `featureFlags.ts:373`) — funcional, pero deja todo OFF salvo
> `classic_protocols` y `module_protocols_by_location`.

## 2. feature_flags: presets de arranque y combos padre-hijo

### 2.1 Reglas de dependencia (encender el PADRE o el hijo se ignora)
Verificado en `src/utils/featureFlags.ts` (helpers `isXEnabled`, líneas 405-443):

| Padre | Hijos (se ignoran si el padre está OFF) |
|---|---|
| `map_enabled` | `gps_capture_numeric`, `gps_capture_subjective`, `coordinate_system` |
| `traceability_module` | `equipment_catalog`, `traceability_gps_polling`, `traceability_gps_interval_seconds` |
| `module_topo` | `topo_replace_gps`, `topo_keep_gps_fallback`, `topo_processing_enabled`, `topo_columns` |
| `protocol_codes` | `coding_mask_default`, `coding_mask_by_type`, `coding_seq_reset` |
| `fill_by_sample` | `sample_form_rows`, `sample_materials` |

Notas de campo que NO son flags:
- **`sample_identifier`** es una **columna de `projects`** (no un flag): id corto del proyecto para el código de muestra
  `M{sample_identifier}{ddmmyy}-{seq}` (`schema.ts:62`). El flag del módulo de muestras es **`fill_by_sample`**
  (NO existe `module_samples`; corregir esa mención de OPERACIONES §2).
- **Equipos**: el catálogo se activa con `traceability_module:true` **+** `equipment_catalog:true`; los equipos viven en
  la tabla `equipment` (§4), no en flags.
- **Tablas auxiliares BUSCAR**: no tienen flag; viven en `lab_aux_tables` (OPERACIONES §5).
- **Codificación**: máscara global `coding_mask_default`; tokens `{TIPO}{AA}{AAAA}{MM}{DD}{SEQ:n}{SECTOR}` (FLAGS_MAPA).
  Reset del correlativo con `coding_seq_reset`: `year` | `year_sector` | `year_month`.

### 2.2 Preset A — Edificación clásica (Sí/No/NA + planos + fotos)
```json
{
  "classic_protocols": true,
  "numeric_protocols": false,
  "module_protocols_by_location": true,
  "module_plans": true,
  "module_contacts": true,
  "protocol_codes": true,
  "coding_mask_default": "{TIPO}-{AA}{SEQ:4}",
  "coding_seq_reset": "year",
  "deletion_mode": "last_only",
  "map_enabled": true,
  "gps_capture_subjective": true,
  "coordinate_system": "WGS84_LATLNG",
  "stamp_enabled": true
}
```

### 2.3 Preset B — Laboratorio de materiales (numérico + resumen + equipos)
```json
{
  "classic_protocols": false,
  "numeric_protocols": true,
  "module_protocols_by_location": true,
  "fill_by_type": true,
  "protocol_codes": true,
  "coding_mask_default": "{TIPO}-{AA}{SEQ:4}",
  "coding_seq_reset": "year",
  "deletion_mode": "in_list_immutable",
  "module_summary_tables": true,
  "traceability_module": true,
  "equipment_catalog": true,
  "map_enabled": true,
  "gps_capture_numeric": true,
  "coordinate_system": "WGS84_UTM",
  "stamp_enabled": true
}
```
(Completar con `lab_aux_tables` para BUSCAR — taras/moldes/fiolas, OPERACIONES §5 — y `print_configs` por tipo,
FLUJO_EDICION_FICHAS §6.)

### 2.4 Preset C — Obra vial (numérico + sectores + topografía + trazabilidad)
```json
{
  "numeric_protocols": true,
  "module_protocols_by_location": true,
  "fill_by_sector": true,
  "protocol_codes": true,
  "coding_mask_default": "{TIPO}-{AA}{SEQ:4}{SECTOR}",
  "coding_seq_reset": "year_sector",
  "deletion_mode": "in_list_immutable",
  "module_summary_tables": true,
  "map_enabled": true,
  "gps_capture_numeric": true,
  "coordinate_system": "WGS84_UTM",
  "module_topo": true,
  "topo_processing_enabled": true,
  "traceability_module": true,
  "equipment_catalog": true,
  "stamp_enabled": true
}
```

### 2.5 Aplicar/mergear flags (siempre MERGE, jamás pisar)
```sql
UPDATE projects SET
  feature_flags = coalesce(feature_flags,'{}'::jsonb) || '⟨{"module_topo": true}⟩'::jsonb,
  updated_at = (extract(epoch from now())*1000)::bigint
WHERE id='⟨PROJECT_ID⟩';
```
Para claves anidadas (`coding_mask_by_type`, `print_configs`) usar `jsonb_set` como en FLUJO_EDICION_FICHAS §6.

## 3. Sectores y Ubicaciones (net-new — base del avance %)

### 3.1 Sectores (`project_sectors`) — necesarios para `fill_by_sector`, auto-asignación GPS y croquis
`points_json` = array WGS84 `[{lat,lng},...]` (≥3 puntos → participa en auto-asignación por GPS; `NULL` = sector
solo-nombre). NOT NULL: `project_id`, `name`. UNIQUE(project_id, name). Paleta y forma verificadas en
`useFileUpload.ts:956-994`.
```sql
INSERT INTO project_sectors (id, project_id, name, points_json, display_color, sort_order, created_at, updated_at)
VALUES (
  substr(md5(random()::text||clock_timestamp()::text),1,16),
  '⟨PROJECT_ID⟩', '⟨NOMBRE_SECTOR⟩',
  '⟨[{"lat":-12.05,"lng":-77.04},{"lat":-12.05,"lng":-77.03},{"lat":-12.06,"lng":-77.03}] | null⟩'::jsonb,
  '⟨#7E57C2⟩',                         -- opcional; paleta de sectores
  ⟨1⟩,                                  -- sort_order (orden del Excel)
  (extract(epoch from now())*1000)::bigint, (extract(epoch from now())*1000)::bigint
);
```

### 3.2 Ubicaciones (`locations`) — define los ensayos ESPERADOS (avance % v31)
NOT NULL: `project_id`, `name`, `reference_plan` (DEFAULT `''`). `template_ids` = CSV de ids de `protocol_templates`
esperados en esa ubicación (`useFileUpload.ts:508`).
```sql
INSERT INTO locations (id, project_id, name, location_only, specialty, reference_plan, template_ids, created_at, updated_at)
VALUES (
  substr(md5(random()::text||clock_timestamp()::text),1,16),
  '⟨PROJECT_ID⟩', '⟨NOMBRE_UBICACION⟩', '⟨P1-Sector1 | null⟩', '⟨Cimiento | null⟩',
  '⟨PLANO_REF | ''''⟩',
  '⟨tid1,tid2,tid3 | null⟩',
  (extract(epoch from now())*1000)::bigint, (extract(epoch from now())*1000)::bigint
);
```

## 4. Equipos calibrados (`equipment`) — net-new (trazabilidad)

Requiere flags `traceability_module:true` + `equipment_catalog:true` (§2.1). NOT NULL: `project_id`, `code`, `name`,
`type`, `next_calibration_at`; DEFAULT `category='laboratorio'`, `status='active'`. `type` válido
(`useFileUpload.ts:552`): laboratorio `balanza|prensa|horno|tamiz|termometro`; maquinaria
`excavadora|compactador|motoniveladora|retroexcavadora|cargador_frontal|volquete|cisterna|rodillo`; o `otros`.
`category`: `laboratorio | maquinaria_pesada`. Upsert real por `(project_id, code)`.

```sql
INSERT INTO equipment (id, project_id, code, name, type, category, brand, model, serial,
  capacity, resolution, last_calibration_at, next_calibration_at, status, notes, created_at, updated_at)
VALUES (
  substr(md5(random()::text||clock_timestamp()::text),1,16),
  '⟨PROJECT_ID⟩', '⟨BAL-001⟩', '⟨Balanza analítica⟩', '⟨balanza⟩', '⟨laboratorio⟩',
  '⟨marca⟩','⟨modelo⟩','⟨serie⟩','⟨capacidad⟩','⟨resolucion⟩',
  ⟨(extract(epoch from now())*1000)::bigint | null⟩,        -- last_calibration_at (opcional)
  ⟨(extract(epoch from timestamptz '2027-06-30')*1000)::bigint⟩,  -- next_calibration_at NOT NULL
  'active', '⟨notas⟩',
  (extract(epoch from now())*1000)::bigint, (extract(epoch from now())*1000)::bigint
);
```
Maquinaria sin calibración: usar el **sentinel año 2099** que usa la app (`useFileUpload.ts:588`,
`Date.UTC(2099,11,31)` = `4102358400000`) — la UI ignora la calibración cuando `category='maquinaria_pesada'`.
El **certificado** de calibración va a S3 en `equipment.calibration_certificate_s3` (archivo → §6: NO lo subo yo).

## 5. Logo / Ortofoto / Stamp (columnas de `projects`)

Verificado en `schema.ts:54-68` y `useFileUpload.ts`:

| Elemento | Columna(s) DB | ¿Necesita archivo en S3? | Recibo SQL |
|---|---|---|---|
| **Logo** | `logo_s3_key` | **SÍ** — bytes en S3, ruta `logos/project_{projectId}/logo.jpg` (`useFileUpload.ts:674`) | wire del key (abajo) |
| **Ortofoto** | `orthophoto_s3_key` + `orthophoto_bounds_json` (`[[s,w],[n,e]]`) + `orthophoto_system` + `orthophoto_tiles_json` | **SÍ** — WebP/teselas generadas por el pipeline `orthophoto/process→commit` (server) | NO wire a mano (bounds los calcula proj4, `orthophoto.ts`) |
| **Stamp** | `stamp_enabled`, `stamp_gps`, `stamp_size`, `stamp_comment` | **NO** — solo config, sin archivo | 100% por SQL |

Stamp (config pura, sin S3):
```sql
UPDATE projects SET
  stamp_enabled = true, stamp_gps = ⟨true|false⟩, stamp_size = '⟨small|medium|large⟩',
  stamp_comment = '⟨comentario global | null⟩',
  updated_at = (extract(epoch from now())*1000)::bigint
WHERE id='⟨PROJECT_ID⟩';
```
Logo — **solo** cablear el key DESPUÉS de que el archivo exista en S3 (ver §6):
```sql
UPDATE projects SET
  logo_s3_key = 'logos/project_⟨PROJECT_ID⟩/logo.jpg',
  updated_at = (extract(epoch from now())*1000)::bigint
WHERE id='⟨PROJECT_ID⟩';
```

## 6. S3 (transversal) — VEREDICTO de subida de archivos

**Todos los binarios del sistema viven en AWS S3, NO en la base de datos.** La DB solo guarda la **clave** (key)
del objeto. Alcanza a: **logo** (`logos/project_{id}/logo.jpg`), **ortofoto** (`orthophoto_s3_key`/teselas),
**planos** (`plans.s3_key` = `projects/{nombre}/plans/{plan}.pdf`), **certificados de calibración**
(`equipment.calibration_certificate_s3`), **firmas** (`signatures/{userId}/signature.jpg`) y **fotos de evidencia**
(`evidences` + fotos de anotaciones). Rutas verificadas en `flow-qaqc-web/lib/s3-upload.ts` y `useFileUpload.ts`.

### 6.1 ¿Puedo subir archivos a S3 con mis herramientas? — **NO**
Mis herramientas son **SQL sobre Supabase (Postgres) + MCP**. **No tengo credenciales AWS ni tool de S3.**
Puedo escribir la DB (incluidas las columnas `*_s3_key`), pero **no puedo poner los BYTES en el bucket**.
→ Si cableo un `logo_s3_key`/`s3_key`/`calibration_certificate_s3` sin que el objeto exista en S3, la app mostrará
**imagen/plano roto** (404 al pedir la key), no un error de base de datos.

### 6.2 Flujo correcto (usuario sube, yo cableo)
1. **El usuario sube el archivo por la app** (web: pestaña Archivos / logo / planos / certificados; móvil: cámara/adjuntos).
   La app hace las DOS cosas atómicamente: `uploadBlobToS3(...)` **y** setea el key en la DB
   (ej. logo: `useFileUpload.ts:670-683`; plano: `:637-666`; firma: `:1073-1083`).
2. **Yo cableo/relaciono en la DB** lo que NO toca bytes: crear la fila (`plans`, `equipment`), mergear flags, wire de
   keys **cuando el objeto ya existe** en la ruta canónica, o corregir un key mal apuntado.
3. Para **fotos de evidencia** y **ortofoto**: dejar SIEMPRE que la app/pipeline los suba (la ortofoto además genera
   teselas WebP + bounds proj4 en el server, `orthophoto/process→commit`; no reproducible por SQL).

### 6.3 Nota de seguridad conocida (bloqueador de producción)
`Produccion/01_PUBLICAR_WEB.md §B1/B2`: hoy las claves AWS se inyectan en el **bundle del navegador**
(`NEXT_PUBLIC_AWS_ACCESS_KEY_ID`/`SECRET`, usadas por `lib/s3-upload.ts`) → cualquier visitante las extrae con DevTools
y obtiene lectura/escritura/borrado del bucket **completo**, que además guarda los **dumps de la base** en `backups/db/`.
El bucket es efectivamente público (URLs sin firmar, `pdfGenerator.s3Url()`). Antes de publicar hay que: mover las keys
a rutas **server** (presigned PUT vía `/api/s3-upload`), Block Public Access ON, y **rotar la key IAM** (se asume
comprometida). Mientras esto siga así, **no operar el bucket de producción a ciegas** ni asumir que una key pública es segura.

## 7. Orden recomendado para configurar un proyecto desde cero
1. `INSERT projects` con un **preset** de flags (§1 + §2).
2. Acceso del Creador + equipo: `user_project_access` / RPC (OPERACIONES §3).
3. Plantillas de ensayo: volcado de 8 piezas (FLUJO_EDICION_FICHAS §7).
4. `lab_aux_tables` para BUSCAR (OPERACIONES §5) si es laboratorio.
5. `project_sectors` + `locations` (§3) — habilita avance %, croquis y `fill_by_sector`.
6. `equipment` (§4) si hay trazabilidad.
7. `print_configs` por tipo (FLUJO_EDICION_FICHAS §6).
8. Stamp por SQL (§5); **logo / ortofoto / planos / certificados → el usuario los sube por la app** (§6).
9. Pedir al usuario "Sincronizar" en el móvil y verificar en la app.