# Motor de consultas entre fichas (xref engine) — Diseño

Fecha: 2026-06-20 · Plataformas: móvil (`src/`) + web (`flow-qaqc-web/`) · Estado: aprobado, implementando Fase 1.

## Objetivo
Permitir que una ficha (protocolo) **llame a otras fichas** para traer valores y procesarlos.
A largo plazo: un motor de consulta `filtro → extraer → reducir`. Hoy ya existe el primitivo
`@CÓDIGO.celda` (v26/v42); este diseño lo expone con UI de autocompletado y lo generaliza.

## Principios de largo plazo
1. **Una sola abstracción** `ProtocolCall = { filter, select, reduce }`. El caso "1 código,
   identidad" es el `@CÓDIGO.celda` actual. "Últimas 4 Proctor, promedio" es el mismo motor con
   `filter.limit=4` + `reduce=PROMEDIO`. Las fases 2-3 añaden `reduce`/`filter`, no rediseñan.
2. **Reusar el primitivo congelado/auditado**: toda llamada se resuelve, al final, a uno o más
   `@CÓDIGO.celda`. Así heredamos gratis: freeze al enviar (`xref_snapshot_json`), doble-check por
   correlativo (`ok`/`pendiente`/`ambiguo`) y detección de obsolescencia (`compareXrefMeta`).
3. **Consultas a la nube PUNTUALES** (regla del usuario — no gastar flujo):
   - **Móvil**: autocompletado y resolución leen **WatermelonDB local** (ya sincronizado, costo de red 0).
   - **Web**: Supabase con consultas **estrechas** — `eq(project_id)`, `eq(status,APPROVED)`,
     filtro por tipo + prefijo de código, **proyección de columnas mínimas**, `order by fecha desc`,
     `LIMIT 10`. La resolución de valor usa `.in(ids)` solo sobre los ids resueltos (ya implementado).
     Nunca traer tablas completas.

## Arquitectura
### Primitivo existente (no se toca su contrato)
- DSL fórmula: `@CÓDIGO.<fila><col>` (regex `RE_XREF` en `formulaEval.ts`, espejo móvil/web).
- Resolución: `XrefResolver.ts` (móvil, local) / `useXrefs.ts` (web, Supabase estrecho).
- `scanXrefs(items)` extrae refs de los `validation_method` (fórmulas). Devuelve `{code,key}[]`.
- Freeze + `xref_snapshot_json` + `compareXrefMeta` ya operan sobre esos refs.

### Nuevo: celda `xref` (Fase 1 — híbrido)
- **DSL** (plantilla define la FORMA): `xref-[<tipoOpcional>].<key>`
  - `xref-[PR].5B` → casilla que llama a un ensayo **tipo PR** y trae su celda **5B**.
  - `xref-[].5B` → sin filtro de tipo (autocompleta sobre todos los aprobados).
  - Modificadores comunes aplican (`:dec[n]`, `:nopdf`, `:norma[...]`).
- **Spec parseado**: `{ kind:'xref'; targetKey:string; filter:{ tipo?:string } }`.
- **Llenado (técnico resuelve)**: la celda guarda el **código elegido** en `comments`. Su valor en el
  scope numérico = el valor resuelto de `@<código>.<targetKey>`. Internamente equivale a una fórmula
  sintetizada `@<código>.<targetKey>` → reusa todo el motor.
- **Scan extendido**: `scanXrefs` también emite refs desde celdas `xref` rellenas (lee el código de
  `comments` + `targetKey` del spec). Firma extendida para recibir `comments` por item.
- **Scope**: `resolveScopeCells` gana una rama `xref`: si hay código elegido, valor =
  `xrefValues["código.targetKey"]`; si no, `null`. (No entra al topo-sort: la fuente es externa.)
- **UI** (`NumericTable`, espejo móvil/web): input con dropdown de autocompletado (últimos ~10
  aprobados que coinciden por tipo+prefijo). Al elegir, muestra el valor traído (read-only, como
  resultado de fórmula) con su estado (`ok`/`pendiente`/`ambiguo`).
- **Consulta autocompletado**: `searchRecentProtocols(projectId, { tipo?, codePrefix, limit=10 })`
  — móvil sobre WatermelonDB, web sobre Supabase estrecho (columnas: `id, protocol_code,
  protocol_number, ensayo_date`).
- **Freeze/PDF/validación/audit**: la celda `xref` congela su valor resuelto (igual que fórmula);
  el código elegido permanece en `comments` para re-resolución/auditoría; `xref_snapshot_json` ya
  captura el valor para el doble-check.

### Fases siguientes (no en esta entrega)
- **Fase 2** — multi-código + fórmula: varias celdas `xref` + una fórmula que las combina
  (caso minero: densidad de campo vs. promedio de N Proctor). Ya soportado por el motor; solo UI.
- **Fase 3** — motor de filtro dinámico: DSL de consulta `xref-[tipo:PR; ult:4].5B` y `reduce`
  (`PROMEDIO`, `MAX`, rango de fechas `f:1-20/01`). Genera N refs `@code.key` y aplica el reduce.

## Archivos (Fase 1)
- `lib/numericProtocol.ts` + `src/utils/numericProtocol.ts` — `kind:'xref'`, regex `RE_XREF_CELL`, parser.
- `lib/formulaEval.ts` + `src/utils/formulaEval.ts` — rama `xref` en `ScopeCell`/`resolveScopeCells`.
- `hooks/useXrefs.ts` + `src/services/XrefResolver.ts` — `scanXrefs` lee celdas `xref` (firma con comments).
- Nueva consulta `searchRecentProtocols` — móvil (`src/services/`) y web (`hooks/`).
- `components/numeric/NumericTable.tsx` + `src/components/NumericTable.tsx` — render + autocompletado.
- `lib/freezeSnapshot.ts` + espejo móvil, `lib/protocolValidator.ts`, PDF — soportar `kind:'xref'`.

## Verificación
- `npx tsc --noEmit` móvil **0** y web **0**.
- `npx tsx scripts/engineTests.ts` **182/182** (+ nuevos tests del parser/scope `xref`).
- Caso real: plantilla con celda `xref-[PR].5B`; otra ficha elige un Proctor aprobado por
  autocompletado → trae el valor 5B, lo muestra, lo congela al enviar y lo audita si la fuente cambia.

## Notas de paridad
Los motores `formulaEval.ts` y `numericProtocol.ts` son **espejo byte-a-byte** móvil↔web: todo cambio
se aplica idéntico en ambos. `XrefResolver` (local) y `useXrefs` (Supabase) divergen por backend pero
comparten contrato (`scanXrefs`, `XrefMeta`, `XrefResolution`).
