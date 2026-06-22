# ESCANEO DEL MÓDULO NUMÉRICO — Protocolos (Parser · Motor · Render · Integración)

**Proyecto:** VxP_QAQC_Automatizado · **Fecha:** 2026-06-15 · **Alcance:** móvil (`src/`) ↔ web (`flow-qaqc-web/`)
**Método:** auditoría exhaustiva en 4 capas (parser DSL, motor de fórmulas, render de tabla/gráficos, integración congelar/resumen/audit/PDF), contrastada contra el código fuente real (rutas y líneas verificadas), más verificación con `scripts/engineTests.ts` (162 casos) y re-validación de la ficha PRV5.

> **Para qué sirve este documento:** (1) entender cómo funciona el módulo numérico de punta a punta para futuras mejoras, y (2) tener el inventario de errores encontrados, cuáles ya se corrigieron y cuáles quedan pendientes con su fix exacto.

---

## 0. RESUMEN EJECUTIVO

- **0 CRITICAL** · **5 HIGH** · 11 MEDIUM · 10 LOW · 4 INFO.
- **Estado actual: TODO corregido excepto H1** (que el usuario verá después). Verificado: `engineTests.ts` **182/182** (incl. 20 casos nuevos de robustez), PRV5 **0 errores**, `tsc --noEmit` **0 errores** en móvil y web.
- **Pasada 1 (HIGH + M6):** H2 (NaN/±Infinity no se congelan como texto), H3 (parser rechaza tokens sobrantes), H4 (Audit móvil no bloquea aprobar con `@código`), H5 (PDF de APROBADO no re-resuelve xref en vivo), M6 (banner fantasma de celdas ocultas). Detalle en §2.
- **Pasada 2 (v42e — todos los MEDIUM/LOW/INFO menos H1):** M1, M2, M3, M4, M5, M7, M8, M9, L1, L2, L3, L4, L5, L6, L7, L8, I1, I2, I3, I4, I5. Detalle en §2bis.
- **Único pendiente: H1** (namespace de scope por fila) — invasivo, toca muchos consumidores y NO afecta a las fichas actuales (todas usan partidas únicas secuenciales). Fix exacto en §3.
- **Nota M10(b):** la acción web "Actualizar llamados" es una *feature* del plan de xrefs (Fase 3 frescura) para fichas con `@código` (aún inexistentes), no un bug; M10(a) ya está protegido por `isConforming` del Audit. Ver §2bis.

---

## 1. MAPA DEL MÓDULO (cómo funciona)

El módulo convierte el DSL de cada item de protocolo (`validation_method`) en una **tabla viva** con fórmulas tipo-Excel, valida rangos, y al aprobar **congela** los valores como histórico inmutable que alimenta Audit, Resumen y PDF. Cuatro capas:

### 1.1 Parser del DSL — `numericProtocol.ts` (móvil `src/utils/`, web `flow-qaqc-web/lib/`)

Convierte `validation_method` en una `NumericRowSpec`. Si **todos** los items con método no vacío parsean (`isNumericProtocol` → `.every`, ~líneas 799-810), la UI conmuta a tabla numérica; si **uno solo** falla, cae al flujo clásico Sí/No/NA (fail-safe).

- **`parseNumericRow`** (~487-610), orden estricto: `repeat-[g:min:max:def]` → `matrix-[Mx] // col-[...]` (matrix-header) → todos `val-[...]` (matrix-data) → `col-[...]` (header) → `numerico-grN[...]` (graph) → resto split por `//` a `parseCellSegment`.
- **`parseCellSegment`** (~326-477): pela sufijos `:norma[]`, `:dec[n]`, `:oculto`, `:nopdf` (regex ancladas a `$`), luego prueba kinds en orden: free/text → manual → fx → bool/date/time/code → percent → equip → list-matrix → list-inline → lookup → comment → val. No-match → `null`.
- **Post-parse:**
  - `extractMatrices` (~740-797): acumula filas main hasta el primer `matrix-header`; **un `val-only` ANTES de cualquier `matrix-[]` se reinterpreta como fila normal `row` con celdas val** (~751-761) — dato fijo al scope. (Raíz de la divergencia M5.)
  - `groupIntoSections` (~689-734): header o cambio de `section` inicia sección; `maxCols` = máx(celdas de filas, `sp.to+1` de headers).
  - `mergeHeaderSpecs` (~637-655): fusiona headers disjuntos en un nivel, solapados en niveles distintos; **cap duro de 3 niveles** (`slice(0,3)`, ~654).
- **Scope / referencias:** `scopeKeyFor(partida, colIdx) = trim(partida) + colLetter(colIdx)` (~942-945). Refs `#<row><col?>` normalizan a `<row><COL>` (`#1`→`1A`). El lexer solo acepta `#<dígitos>`. `splitRowComments`/`joinRowComments` serializan multi-celda con `//`, padeando a `expectedCells` y truncando exceso.

### 1.2 Motor de fórmulas — `formulaEval.ts` (móvil ↔ web)

Pipeline: `tokenize()` → `Parser` (descenso recursivo) → AST → `evalNode(env)` → `number | throw`. `evalFormula()` convierte solo `NullPropagation`→`null`; cualquier otro `FormulaError` se relanza.

- **Lexer** (`tokenize`): números (decimal + notación científica), celda `#<n><L?>`, rango `#a:#b`, xref `@<extId>.<n><L?>`, ids, operadores (`=`→`==`, `<>`→`!=`).
- **Parser**: precedencia cmp < add < mul < pow < unary < call < primary.
- **Evaluación** (`evalNode`): `ref` null → NullPropagation; `xref` sin `xrefValues` → `xref-unsupported`; `/0` → FormulaError. `SI` es lazy. `ESVACIO` atrapa solo NullPropagation. `SIERROR` atrapa FormulaError pero relanza NullPropagation.
- **`BUSCAR`**: `keyEq` = igualdad textual O equivalencia numérica (`Number(replace ',','.')`); primer match gana. **Requiere llaves numéricas** (tablas auxiliares con códigos numéricos).
- **`resolveScopeCells`**: `extractRefs`→deps→topo-sort con detección de ciclos; evalúa en orden topológico. Funciones clave: `PUNTOMAXIMOY/X(xs,ys,3)` (máx por mínimos cuadrados cúbicos → MDS/OCH), `BUSCAR(tabla,#ref,Columna)`, `SI`, `CELDA`, `FILA`, `COLUMNA`, rangos `#a:#b`.

### 1.3 Render — `NumericTable.tsx` (móvil `src/components/`, web `flow-qaqc-web/components/numeric/`)

`items` → `parsedRows` → `extractMatrices` → `groupIntoSections`. **Fix v42b (ancho por sección):** cada sección usa su propio `secStripW`/`secStripPx` con `sec.maxCols` (header y filas comparten ancho → alineación correcta). Celdas input editables (manual/percent/free/text/date/time/equipment/bool/list/comment) vs read-only/calculadas (formula/lookup/val/code/blank). Estado de fila: `failCount>0`→fail; `okCount>0 && pending===0`→ok. **Modo `frozen`:** scope/textValues se leen directo de `comments[i]` sin re-evaluar.

### 1.4 Integración congelar/resumen/audit/PDF

1. **Llenar:** `commitRow` arma `comments` solo con celdas de ingreso; formula/lookup/val → `''`.
2. **Enviar:** resuelve xrefs `@código.celda` (móvil WatermelonDB / web Supabase) → `buildFrozenComments` recomputa scope y reescribe **solo** formula/lookup en `comments` → estado SUBMITTED → `upsertSummaryRow` reusa la misma resolución.
3. **Audit:** lee items en modo frozen; `isConforming` recomputa en vivo para habilitar Aprobar.
4. **PDF:** lee `comments` congelado; los gráficos reconstruyen scope con `resolveScopeCells`.

**Invariante buscado:** `congelado == resumen == audit == PDF` (inmutable tras aprobar).

**Guarda advisory:** `protocolValidator.validateProtocolSpec` hace chequeo estático (partidas duplicadas, refs inexistentes, ciclos…) pero el import de Excel (`file-upload/page.tsx:139-156`) **no bloquea** — solo muestra errores e importa igual. **El parser es la última línea de defensa en runtime.**

---

## 2. HALLAZGOS CORREGIDOS EN ESTA PASADA ✅

| # | Sev | Qué pasaba | Fix aplicado (`archivo:línea`) |
|---|-----|-----------|--------------------------------|
| **H2** | HIGH | `RAIZ(-4)`→NaN, `MAX()` de columna vacía→-Infinity: la rama `formula` guardaba el valor sin `isFinite`; el NaN se propagaba sin error y se **congelaba como texto** `'NaN'`/`'-Infinity'` en Audit/PDF/CSV para siempre. | `formulaEval.ts` (móvil + web), `resolveScopeCells`: `const fin = (v!=null && Number.isFinite(v)) ? v : null;` + `errors[k]='Resultado no numérico (NaN/Infinito)'`. |
| **H3** | HIGH | El parser descartaba tokens sobrantes: `#1A #2A`→5 (ignora `#2A`), `#1A2`→lee `#1A`. La dependencia colgada era invisible al topo-sort y al validador; valor erróneo se congelaba. | `formulaEval.ts` (móvil + web): nuevo `Parser.expectEof()` llamado tras `parseExpr()` en `evalFormula` y `extractRefs`. `extractRefs` cae a su fallback por tokens (que SÍ captura ambas refs). |
| **H4** | HIGH | Audit móvil pasaba `xrefValues=undefined` a `resolveScopeCells` → toda fórmula con `@código` lanzaba `xref-unsupported` → `errors[key]` → exigía motivo de override falso en todo ensayo con llamados. | `ProtocolAuditScreen.tsx`: las fórmulas con `@` leen su valor ya **congelado** del `comments` (kind `manual`), como el modo frozen de NumericTable. Las fórmulas sin `@` se recomputan igual (cero cambio para PRV1–5). |
| **H5** | HIGH | El PDF de un protocolo **APROBADO** llamaba `fetchXrefValues` en vivo e inyectaba al scope de celdas/gráficos: si la fuente `@código` se re-aprobaba/reusaba, el PDF firmado mostraba valores distintos a los aprobados (rompe trazabilidad legal). | `pdfGenerator.ts` (2 sitios): `if (full.protocol.status !== 'APPROVED')` antes de `fetchXrefValues`. Para fichas sin `@`, recomputar == congelado (no-op). |
| **M6** | MEDIUM | Una celda `:oculto` fuera de rango incrementaba `outOfRangeCount` (banner amarillo "N valores fuera de rango") aunque el estado de fila la saltaba → banner sin ninguna fila roja localizable. | `NumericTable.tsx` (móvil + web): `if (cell.hidden) continue;` al inicio del bucle interno de `outOfRangeCount`. |

> **Nota de proceso (I1):** `flow-qaqc-web/lib/numericProtocol.ts` y `flow-qaqc-web/lib/formulaEval.ts` están **untracked en git** (espejo 1:1 de `src/utils/`). Los fixes H2/H3 se aplicaron a **ambas copias**. Recomendación: versionar ambos archivos y añadir un test/CI que falle si difieren de `src/utils/`.

---

## 3. HALLAZGOS — ESTADO

> **Pasada 2 (v42e): TODOS los MEDIUM/LOW/INFO de abajo quedaron CORREGIDOS** (la columna "Fix" describe lo que se aplicó, en móvil y web cuando corresponde). Verificado con engineTests 182/182 + PRV5 0 err + tsc 0/0. **Único pendiente: H1.** Excepción: **M10(b)** (acción web "Actualizar llamados") es una *feature* del plan de xrefs, no un bug → ver nota.

### HIGH — ⏳ ÚNICO PENDIENTE (H1)

| # | Título | Ubicación | Escenario | Fix |
|---|--------|-----------|-----------|-----|
| **H1** | `scopeKeyFor` colisiona claves de scope para items **sin `partida_item`** | `numericProtocol.ts:942-945` (móvil+web); consumido en `NumericTable.tsx`, `freezeSnapshot.ts`, `numericPdfHtml.ts`, `ProtocolAuditScreen.tsx`, `pdfGenerator.ts` | Dos items sin partida → ambos generan clave `'A'`; el 2º **pisa** el valor del 1º en el scope plano → celda muestra/calcula/exporta dato de otra fila, sin error en runtime. El validador lo detecta (`partida-duplicada`) pero el import no bloquea. **No invasivo de aplicar mal → se dejó pendiente.** | Robusto: prefijar el namespace de scope con un id estable por fila (`item.id`) o **forzar `partida_item` único en el loader/parser** antes de entrar a modo numérico. Mínimo viable: al construir el scope en `freezeSnapshot`/`NumericTable`/`numericPdfHtml`, detectar claves repetidas y emitir error visible en runtime en vez de pisar en silencio. |

### MEDIUM — ✅ CORREGIDOS (v42e)

| # | Título | Ubicación | Fix aplicado |
|---|--------|-----------|-----|
| M1 | Literal `val-[...]` con `//` se parte y rompe la fila | `numericProtocol.ts` | ✅ Helper `splitCells()` divide por `//` ignorando los que están dentro de `[...]`; usado en los 4 sitios de split. Mantiene `////` en blanco. Test añadido. |
| M2 | `isNumericProtocol` true sin ninguna fila de datos → se aprueba vacío | `numericProtocol.ts` + `allAnswered` (móvil+web) | ✅ `isNumericProtocol` exige ≥1 spec `row`/`graph`; `allAnswered` (móvil+web) añade guarda `hasAnyInput` (sin cambiar las reglas de completitud existentes). Tests añadidos. |
| M3 | `matrix-data` con ancho ≠ columnas del header se acepta | `numericProtocol.ts` `extractMatrices` | ✅ Valida `spec.values.length === columnTitles.length`; si no, `valid:false`. Test añadido. |
| M4 | `matrix-[Mx]` con id duplicado sobrescribe la matriz anterior | `numericProtocol.ts` `extractMatrices` | ✅ Si `matrices[id]` ya existe → `valid:false`. Test añadido. |
| M5 | Audit móvil: fila `val-[]` pre-matriz no entra al scope de `isConforming` | `ProtocolAuditScreen.tsx` | ✅ `isConforming` itera `extractMatrices(parsedRows).mainRows` (mismo pipeline que el congelado). No-op para PRV5 (sin matrices in-protocol). |
| M7 | `multiline` en inputs desnivela la altura de fila (móvil) | `NumericTable.tsx` `styles.row` | ✅ `styles.row` → `alignItems:'flex-start'`: las cajas comparten borde superior (top-align, convencional en tablas). date/equipment NO pueden ser multiline (su teclado usa Enter para navegar), por eso igualar alturas vía multiline no era opción. |
| M8 | Web: race entre la última celda editada y el freeze | `fill/page.tsx` | ✅ Las escrituras numéricas se guardan en `pendingSaves`; el submit flushea los `commentTimers` con debounce y hace `await Promise.allSettled(...)` ANTES de `submitProtocol` (que re-lee comments). |
| M9 | Resumen móvil: pull pisa fila local con remota más vieja | `SummaryRowService.ts` | ✅ Compara `rr.updated_at` (remoto) vs `existing.updatedAt` local; aplica solo si `remoto >= local` (sin migración de esquema; reaplicar idénticos se omite sin daño). |
| M10 | Celda calculada vacía se congela en blanco; no distingue error/vacío | `freezeSnapshot.ts`, audit | ✅ (a) `isConforming` del Audit ya exige `v!=null` + deps de formula/lookup (líneas 471-476) y ahora corre sobre el scope correcto (M5) → no se aprueba en blanco sin motivo. ⏭️ (b) acción web "Actualizar llamados" = feature del plan de xrefs (Fase 3), solo para fichas `@código` (inexistentes hoy). |

### LOW / INFO — ✅ CORREGIDOS (v42e)

| # | Título | Ubicación | Fix aplicado |
|---|--------|-----------|-----|
| L1 | `lookup-[5,...]` interpreta `5` como ref `5A`, no literal | `numericProtocol.ts` | ✅ El 1er arg de lookup exige `#` (`lookup-[#1A,...]`); número/ref sin `#` → celda inválida. Test añadido. |
| L2 | `mergeHeaderSpecs` descarta niveles >3 en silencio | `numericProtocol.ts:mergeHeaderSpecs` | ✅ `console.warn` cuando se descartan niveles 4+ (antes era silencioso); límite documentado. |
| L3 | Formateo `:dec` de calculadas divergente web↔móvil | `numericProtocol.ts` + ambos NumericTable | ✅ Helper compartido `formatComputed(v, decimals)` (lógica de móvil: 0 dec si \|v\|≥100, 2 si no); usado en móvil y web (la web además ahora honra `:dec` en lookups). |
| L4 | Refs con fila 0 (`#0`) aceptadas | `numericProtocol.ts:normalizeRef`/`expandRefOrRange` + lexer | ✅ `parseInt` + rechazo de fila <1 en `normalizeRef`, rangos y el lexer del motor. Tests añadidos. |
| L5 | `CONTAR(escalar vacío)` propaga null en vez de 0 | `formulaEval.ts` | ✅ Solo CONTAR/CONTARSI toleran escalar nulo (param `tolerateNullScalar`); el resto conserva su semántica. Tests añadidos. |
| L6 | Se aprueba cálculo fuera de rango | audit `isConforming` | ✅ `isConforming` ya valida rango de formula/lookup (líneas 470-476) y con M5 corre sobre el scope correcto → fuera de rango exige motivo. (No se metió en `commitRow` por fila: las fórmulas cross-row no se pueden validar por fila de forma fiable.) |
| L7 | `compareXrefMeta` usa `sourceUpdatedAt` → "desactualizado" falso | `XrefResolver.ts` + web `useXrefs.ts` | ✅ Eliminada la rama `sourceUpdatedAt` en ambos; se confía en `valueChanged` + cambio de status/sourceId. |
| L8 | Submit móvil no congela items ausentes de `itemState` | `ProtocolFillScreen.tsx` | ✅ Congela sobre TODOS los `freshItems` (scope cross-row completo); items sin estado usan su `comments` de DB como base, sin alterar su respuesta. |
| I1 | Espejos web `numericProtocol.ts`/`formulaEval.ts` untracked | `flow-qaqc-web/lib/` | ✅ Versionados (`git add`, quedan en el índice para tu próximo commit). El CI diff-check NO se añadió (un stripper de comentarios ingenuo rompería con el literal `'//'` de `splitCells` → flaky); la paridad queda git-visible. |
| I2 | Ref con cero a la izquierda (`#01A`) no normalizada | `formulaEval.ts:lexer` + `normalizeRef` | ✅ `parseInt` normaliza `#01A`→`1A` en lexer y parser. Tests añadidos. |
| I3 | Comentarios obsoletos "franja máxima global" | web `NumericTable.tsx` | ✅ Comentarios actualizados a "ancho propio de la sección (v42b)". |
| I4 | Variables muertas residuo de v42b | móvil + web `NumericTable.tsx` | ✅ Eliminadas `maxCols`/`maxStripW` (móvil) y `maxCols`/`maxStripPx` (web). |
| I5 | Web aplica `compact` según `maxCols` GLOBAL, no por sección | web `NumericTable.tsx` | ✅ `compact={sec.maxCols > 1}` (densidad por sección, coherente con el ancho por sección). |

---

## 4. DIVERGENCIAS WEB ↔ MÓVIL

| Tema | Móvil (`src/`) | Web (`flow-qaqc-web/`) | Estado |
|------|----------------|------------------------|--------|
| Audit / Aprobar con xref | `isConforming` bloqueaba todo ensayo con `@código` (H4) | El audit/aprobación no recae en este recompute roto | **Corregido (móvil, H4)** |
| PDF de protocolos APPROVED | Frozen: lee de `comments`, no re-resuelve xref | Re-resolvía xref **en vivo** (H5) | **Corregido (web, H5)** |
| `outOfRangeCount` con celdas ocultas | Contaba ocultas (M6) | Contaba ocultas (M6) | **Corregido (ambos, M6)** |
| Persistencia antes del freeze | Pasa `itemState` al freeze (consistente) | Race con saves fire-and-forget (M8) | **Corregido (web, M8)**: flush + await antes de freeze |
| "Actualizar llamados" tras aprobar fuente | Existe `refreshProtocolXrefs` (`XrefRefresh.ts`) | No existe (M10b) | ⏭️ Feature del plan de xrefs (Fase 3), no bug |
| Formateo `:dec` calculadas | helper `formatComputed` | helper `formatComputed` | **Corregido (ambos, L3)** |
| Inputs multiline | top-align de fila (M7) | `<input>` single-line | **Corregido (móvil, M7)** |
| Paridad de archivos core | tracked en git | `numericProtocol.ts`/`formulaEval.ts` versionados (I1) | **Corregido (I1)**: ahora tracked |

---

## 5. VERIFICACIÓN

- `npx -y tsx scripts/engineTests.ts` → **182 pasaron, 0 fallaron** (162 previos + 20 nuevos de robustez v42e: M1/M2/M3/M4/L1/L4/L5/I2).
- `node Actividadesv1/_validateProctorV5.js` → PRV5 **0 celdas con error** (MDS=1.724, OCH=14.41, tara33→721.8, Gs20=2.729; secciones maxCols 1/4/4/1/1/5/1/1).
- `npx tsc --noEmit` en móvil (raíz) → **0 errores**.
- `npx tsc --noEmit` en `flow-qaqc-web/` → **0 errores**.

---

### Archivos clave (rutas absolutas)
- `D:\VxP_QAQC_Automatizado\src\utils\numericProtocol.ts` · `D:\VxP_QAQC_Automatizado\flow-qaqc-web\lib\numericProtocol.ts`
- `D:\VxP_QAQC_Automatizado\src\utils\formulaEval.ts` · `D:\VxP_QAQC_Automatizado\flow-qaqc-web\lib\formulaEval.ts`
- `D:\VxP_QAQC_Automatizado\src\components\NumericTable.tsx` · `D:\VxP_QAQC_Automatizado\flow-qaqc-web\components\numeric\NumericTable.tsx`
- `D:\VxP_QAQC_Automatizado\src\utils\freezeSnapshot.ts`
- `D:\VxP_QAQC_Automatizado\src\screens\ProtocolFillScreen.tsx` · `D:\VxP_QAQC_Automatizado\src\screens\ProtocolAuditScreen.tsx`
- `D:\VxP_QAQC_Automatizado\src\services\SummaryRowService.ts` · `XrefResolver.ts` · `XrefRefresh.ts`
- `D:\VxP_QAQC_Automatizado\flow-qaqc-web\hooks\useProtocolFill.ts` · `useXrefs.ts` · `flow-qaqc-web\lib\pdfGenerator.ts` · `summaryRow.ts`
- `D:\VxP_QAQC_Automatizado\scripts\engineTests.ts` (162 casos)
