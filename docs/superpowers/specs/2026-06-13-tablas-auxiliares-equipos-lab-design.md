# Diseño — Fase 2: Tablas auxiliares como Equipos de Laboratorio + Catálogo de constantes

> Continuación del split de equipos (Fase 1, ya implementada). Define **dónde viven** las tablas
> auxiliares (las que antes se embebían en cada ficha) y **cómo se llaman** desde la ficha por clave.
> **Requiere tu aprobación** porque fija el formato del Excel que vas a autorar.

## Contexto y decisión
Hoy las tablas auxiliares (moldes, taras, fiolas, densidad-agua) se embeben dentro de cada ficha
como filas `matrix-[Mx]` / `col-[…]` / `val-[…]` y se referencian con `lookup-[#1A,M1,A,B]` y
`list-[M1[A]]` (`flow-qaqc-web/lib/numericProtocol.ts` → `extractMatrices`). Eso se repite en cada
ficha y mezcla datos de equipo con la ficha.

**Decisiones tomadas (sesión 2026-06-13):**
1. Las auxiliares **ya no se embeben** en la ficha.
2. Fiola/tara/molde → **Catálogo de equipos de laboratorio** (Fase 1), reutilizable; la ficha las
   llama por **código de equipo** (pongo el N° de fiola/molde y se traen sus datos).
3. Tablas de constantes (densidad-agua vs temperatura, ~160 filas) → **catálogo compartido del
   proyecto**, referenciado por clave.

## Arquitectura propuesta

### A. Valores auxiliares por equipo de laboratorio  ✅ recomendado: `aux_json`
Añadir a `equipment` una columna **`aux_json`** (JSONB en Supabase / TEXT en WatermelonDB) con
pares clave→valor propios del equipo. Ej.: fiola `{ "Pf": 158.2, "Vf": 250.1 }`; molde
`{ "peso": 4111.7, "volumen": 937.4 }`; tara `{ "peso": 269.9 }`.
- **Por qué `aux_json` y no columnas fijas:** cada tipo de equipo de lab tiene campos distintos;
  una columna flexible evita migraciones por tipo y deja que el Excel defina los campos.
- **Excel del catálogo Lab.**: las columnas estándar (Código, Nombre, Tipo, …) se respetan; las
  **columnas extra** se vuelven claves de `aux_json` (ej. una hoja "Fiolas" con `Código, Pf, Vf`).
- **Sync (¡ojo!):** `aux_json` es JSONB en Supabase y string local → en el push del móvil hay que
  `JSON.parse` antes de subir (mismo patrón que ya aplicamos a `points_json`/`summary_config_json`
  en `SupabaseSyncService.ts`). Documentado para no reintroducir el bug de doble-codificación.

### B. Catálogo de constantes del proyecto  ✅ nueva tabla `aux_tables`
Tabla nueva, **a nivel proyecto**, para tablas de constantes/lookup que no son equipos:
```
aux_tables (
  id text PK, project_id text, key text,          -- key: 'AGUA', 'MOLDES', …
  name text, column_titles jsonb, rows jsonb,      -- rows: [["10","0.99973"], …]
  created_at bigint, updated_at bigint,
  UNIQUE(project_id, key)
)
```
RLS permisiva (patrón del proyecto). Cloud-managed (web/escritorio la sube) y se **pullea** al móvil
(cloud-wins). Se sube desde una **nueva sub-sección "Tablas auxiliares"** (en Cargar archivos), una
hoja por tabla o una hoja índice + hojas por clave.

### C. DSL — cómo la ficha "llama" los datos
1. **Valor auxiliar de un equipo** (por código ya ingresado en una celda `equipo-[tipo]`):
   nueva función de fórmula **`EQUIPO(<ref>, "<campo>")`** → toma el código de la celda `<ref>` y
   devuelve `aux_json[campo]` del equipo. Ej.: celda A = `equipo-[fiola]`; luego
   `numerico-fx[EQUIPO(#1A,"Pf")]` trae Pf. (Implementar en `formulaEval.ts` + resolver el catálogo
   de equipos en el scope de evaluación.)
2. **Tabla de constantes del proyecto:** extender `lookup`/`list` para aceptar `@CLAVE` (proyecto)
   además de `Mx` (matriz local): `lookup-[#1A, @AGUA, A, B]`, `list-[@MOLDES[A]]`. El resolver
   busca primero en matrices locales y luego en `aux_tables` del proyecto.

### D. Compatibilidad
- Las matrices embebidas existentes (`matrix-[Mx]`) **siguen funcionando** (no romper fichas
  actuales). Lo nuevo se autora como equipos Lab. + `@tablas`. Migración opcional, no forzada.

### E. UI
- **Catálogo Lab.** (Fase 1 ya creado): expandir cada equipo para ver/editar sus `aux_json`.
- **Tablas auxiliares del proyecto**: nueva sub-sección para subir/listar las `aux_tables`.
- **Llenado de ficha**: al escribir el código en una celda `equipo-[tipo]`, las fórmulas `EQUIPO()`
  se resuelven solas (igual que hoy se resuelven lookups locales).

## Impacto / archivos (estimado)
- Esquema móvil (bump): `equipment.aux_json` + tabla `aux_tables` (`src/db/schema.ts`,
  `migrations.ts`, modelos). Supabase: `ALTER TABLE equipment ADD aux_json jsonb` + `CREATE TABLE
  aux_tables` + RLS.
- Parsers: `excelParser.ts` (columnas extra → aux_json; hoja de tablas auxiliares), importadores
  (web `useFileUpload.ts`, móvil `EquipmentExcelImporter.ts`).
- DSL: `numericProtocol.ts` (sintaxis `@CLAVE`), `formulaEval.ts` (fn `EQUIPO`), resolución de scope
  con catálogo de equipos + `aux_tables` (`SummaryRowService`/fill).
- Sync: parseo JSONB en push (`SupabaseSyncService.ts`) para `aux_json` y `aux_tables.rows`.
- UI: catálogo Lab. (ver aux), sección Tablas auxiliares (web + móvil).

## Decisiones tomadas (2026-06-13, ronda 2) — REEMPLAZAN el modelo de arriba
El usuario refinó el diseño. El modelo final es **grupos de laboratorio** (no `aux_json` por unidad):

- **Instrumentos sueltos** (balanzas, prensas…) = equipos individuales en `equipment` (hoja 1, formato
  actual). Sin cambios.
- **Tablas** (taras, moldes, fiolas, densidad-agua) = **GRUPOS de laboratorio**, cada uno **un
  registro** con sus columnas + filas + **una fecha de calibración compartida**. Se ven en el catálogo
  Lab. como tarjetas de grupo con botón **"Calibrar"** que solo pide los valores nuevos de las columnas
  y estampa la fecha. (1 registro por grupo → sin choques de código, rápido y limpio.)
- **Hoja 2 del Excel del catálogo Lab.** las define; **un valor por celda** (no CSV):
  `A=tabla-<nombre>` (repetido), `B=<columna>`, `C,D,E…=valores`. **1ª columna (Codigo) = LLAVE.**
- **Llamado desde la ficha:** función de fórmula **`BUSCAR(@<tabla>, <ref|valor>, "<columna>")`**
  (busca el valor en la LLAVE y devuelve la columna pedida) + **`list-[@<tabla>[<columna>]]`** para
  desplegables. Referencia por **nombre de columna** (robusto a reordenar).
- **Defaults confirmados:** densidad-agua **NO precargada** (se sube como una tabla más); **no se
  migran** fichas viejas (las matrices embebidas `matrix-[Mx]` siguen funcionando; lo nuevo usa `@`).

### Modelo de datos (final)
Tabla nueva `lab_aux_tables` (a nivel proyecto, cloud-managed + pull a móvil):
```
id text PK, project_id text, group_key text, name text,
columns_json jsonb (["Codigo","Malla","Abertura"]),
rows_json    jsonb ([["1","N1","45"],["2","N2","50"],["3","N3","60"]]),  -- orientado a filas
last_calibration_at bigint null, next_calibration_at bigint null,
created_at bigint, updated_at bigint,
UNIQUE(project_id, group_key)
```
Sync JSONB: `JSON.parse` antes del push del móvil (patrón points_json).

### DSL
- `formulaEval.ts`: nueva fn `BUSCAR(tablaRef, valor, "columna")`; el scope de evaluación recibe un
  mapa `{group_key → {columns, rows}}` de `lab_aux_tables` del proyecto.
- `numericProtocol.ts`: reconocer `@<group_key>` en `list-[@taras[Codigo]]` (y validación).
- Resolver (fill + `SummaryRowService`): cargar las tablas del proyecto y pasarlas al scope.

### UI
- Catálogo Lab.: tarjetas de grupo (taras [3], moldes [3]) con botón **Calibrar** (modal con los
  valores actuales editables + fecha) además de los instrumentos individuales.
- Importación hoja 2 (web `useFileUpload.ts`, móvil importer): upsert por `(project_id, group_key)`.

## Estado de implementación (2026-06-13)
**HECHO y verificado (tsc móvil + web = 0):**
- ✅ Data layer: tabla `lab_aux_tables` — esquema móvil **v40** + modelo `LabAuxTable` + colección en
  `db/index.ts` + migración v40; Supabase `supabase/v41_lab_aux_tables_migration.sql` (TEXT ids +
  JSONB + RLS); tipo web `LabAuxTable` en `types/index.ts`.
- ✅ Parser hoja 2 (web): `parseAuxTablesSheet` en `excelParser.ts` (formato
  `tabla-<nombre> | <columna> | v1 | v2 | …`, un valor por celda) + `auxTables` en
  `TraceabilityImportResult` + integrado en `parseTraceabilityExcel`.
- ✅ Import (web): `importTraceabilityToSupabase` hace upsert a `lab_aux_tables` por
  `(project_id, group_key)`. Como la importación va por la sección Lab. (Fase 1), subir la hoja 2 ahí
  ya crea/actualiza las tablas.

**PENDIENTE (requiere app corriendo para verificar de verdad):**
1. **DSL** — `formulaEval.ts` (web + móvil): función `BUSCAR(@tabla, valor, "columna")`;
   `numericProtocol.ts`: reconocer `@<group_key>` en `list-[@taras[Codigo]]` y en `lookup`.
2. **Resolver** — cargar `lab_aux_tables` del proyecto y pasarlas al scope de evaluación en el
   llenado (`NumericTable`/`useProtocolFill`) y en `SummaryRowService`/`summaryRow.ts`.
3. **Móvil**: espejar el parser de hoja 2 + import en `TraceabilityExcelImporter.ts` /
   `EquipmentExcelImporter.ts` (upsert local en `labAuxTablesCollection`).
4. **Sync**: pull de `lab_aux_tables` (cloud-wins, es config de proyecto) en `SupabaseSyncService.ts`;
   en el push, `JSON.parse` de `columns_json`/`rows_json` (JSONB) como con `points_json`.
5. **UI**: en el catálogo Lab. mostrar las tablas como tarjetas de grupo con botón **Calibrar**
   (modal con valores actuales editables + fecha) — web + móvil.

## 📖 Cómo se llama una tabla desde una ficha (DOCUMENTACIÓN — `BUSCAR`)
Sintaxis en el `Método de validación` de una celda de fórmula:

```
numerico-fx[BUSCAR(<tabla>, <valor>, <columna>)]
```
- `<tabla>`  = identificador de la tabla (el `group_key`, ej. `taras`, `moldes`, `agua`). Literal,
  sin comillas, no distingue mayúsculas.
- `<valor>`  = lo que se busca en la **1ª columna (LLAVE)** de la tabla. Suele ser una **referencia a
  otra celda** (`#1A`, donde el usuario ingresó el código/temperatura) o un literal.
- `<columna>` = nombre de la columna a devolver (literal, por **nombre**, robusto a reordenar; ignora
  tildes/mayúsculas).

**Ejemplos** (tabla `taras`: Codigo→Malla→Abertura; el usuario ingresó el código en `#1A`):
```
numerico-fx[BUSCAR(taras, #1A, Abertura)]      → 60 si #1A = 3
numerico-fx[BUSCAR(taras, #1A, Malla)]         → (texto N3 no es número → usar para validar, no calcular)
numerico-fx[BUSCAR(moldes, #2A, Peso)]         → 130 si #2A = 2
numerico-fx[BUSCAR(agua, #5A, Densidad) * #6B] → densidad del agua a la T° #5A, por algo
```
Reglas: devuelve **número** (si la columna trae texto no-numérico, da error de fórmula); si el valor
no está en la llave o la columna no existe → error claro; celda vacía → propaga vacío. Sin tablas
cargadas en el proyecto, una celda con `BUSCAR` queda en error hasta que se suban.

**Futuro (ya soportado para celdas, NO tablas):** el llamado **entre fichas por código** ya existe con
`@<codigo_ficha>.<celda>` (ej. `@CV-PR-001.3B`). El llamado a TABLAS auxiliares (`BUSCAR`) es
independiente y a nivel proyecto. Si más adelante se quiere "BUSCAR en la tabla de otra ficha", se
extenderá la sintaxis (p. ej. `BUSCAR(@codigo:tabla, …)`) — pendiente de definir contigo.

## Estado de implementación — ACTUALIZADO (2026-06-13, ronda 3)
**HECHO y verificado (tsc móvil 0 + web 0):**
- ✅ Data layer (v40 móvil + SQL v41 + tipos).
- ✅ Parser hoja 2 (web) + import upsert por `(project, group_key)`.
- ✅ **DSL `BUSCAR`** en AMBOS motores (`formulaEval.ts` web + móvil): parser + evaluación + threading
  por `resolveScopeCells`/`EvalCtx.auxTables`.
- ✅ **Resolver móvil**: `NumericTable` acepta `auxTables`; `ProtocolFillScreen` carga
  `lab_aux_tables` del proyecto y las pasa → **BUSCAR computa en vivo al llenar en el celular**.
- ✅ **Sync pull (móvil)**: `lab_aux_tables` se trae por `pullProject` (cloud-wins; el móvil solo lee,
  NO se incluye en el push → sin doble-codificación JSONB). `filterToLocalSchema` serializa los JSONB.

**PENDIENTE:**
1. Resolver **web** (fill en PC/escritorio): pasar `auxTables` en `NumericTable` web + en
   audit/PDF/`SummaryRowService`/`summaryRow.ts` (cargar `lab_aux_tables` y pasarlas).
2. **Import móvil** de la hoja 2 (hoy se autora en web y el móvil la pullea; el import nativo es opcional).
3. **UI**: tarjetas de grupo + botón **Calibrar** en el catálogo Lab. (web + móvil).
4. Desplegable `list-[@tabla[Columna]]` (opcional, para elegir códigos).

## Verificación (cuando se implemente)
- `tsc` móvil + web 0 errores; rebuild desktop.
- Subir catálogo Lab. con fiolas/moldes (aux) + una tabla `@AGUA`; crear una ficha que use
  `EQUIPO(#1A,"Pf")` y `lookup-[#1A,@AGUA,A,B]`; verificar que el valor calculado coincide con el Excel.
- Sync: confirmar que `aux_json`/`aux_tables` viajan correctos (objeto JSONB, no string escalar).
- Cerrar el **Proctor PRV1** con este modelo (molde, fiola, densidad-agua).
