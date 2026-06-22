// Validador estático de fichas de protocolo numérico (v32).
//
// Valida una ficha COMPLETA (todas las filas con su `validation_method`) ANTES
// de usarla: al importar el Excel, al editar una plantilla, o como contrato de
// salida cuando una IA genera la ficha a partir de un ensayo.
//
// Filosofía: errores ACCIONABLES. Cada issue dice exactamente en qué fila /
// celda está el problema y cómo corregirlo, para que un humano (o la IA que
// generó la ficha) pueda arreglarlo sin adivinar.
//
// Es espejo web/mobile: vive en `src/utils/` y `flow-qaqc-web/lib/` con el
// mismo contenido. Solo usa imports relativos para que la copia sea 1:1.

import {
  parseNumericRow, isNumericProtocol, scopeKeyFor, colLetter,
  extractMatrices, groupIntoSections,
  type NumericRowSpec, type MatrixData,
} from './numericProtocol';
import { extractRefs, extractXrefs, resolveScopeCells, type ScopeCell } from './formulaEval';

export interface ValidationIssue {
  severity: 'error' | 'warning';
  /** Posición del item en la ficha (1-based). */
  index: number;
  /** Partida del item, si la tiene. */
  partida: string | null;
  /** Letra de la celda dentro de la fila (A, B, …), si aplica. */
  cell?: string;
  /** Código estable del problema (para tooling / la IA). */
  code: string;
  /** Mensaje en español listo para mostrar. */
  message: string;
}

export interface ValidationResult {
  /** true si la ficha parsea como protocolo numérico. */
  isNumeric: boolean;
  /** true si no hay issues con severity 'error'. */
  ok: boolean;
  issues: ValidationIssue[];
}

interface ItemIn {
  partida_item: string | null;
  item_description: string;
  validation_method: string | null;
  /** Agrupación visual (v34) — opcional: sin ella, todo es una sola sección. */
  section?: string | null;
}

/** Intenta señalar el segmento exacto que rompe una fila inválida. */
function findBadSegment(method: string): { seg: string; pos: number } | null {
  const segs = method.split('//');
  if (segs.length <= 1) return null;
  for (let i = 0; i < segs.length; i++) {
    const seg = segs[i].trim();
    if (seg === '') continue;                       // blank intencional
    if (parseNumericRow(seg) == null) return { seg, pos: i + 1 };
  }
  return null;
}

/** Valida una ficha completa. Devuelve TODOS los problemas encontrados
 *  (no se detiene en el primero) para que una IA pueda corregir en un solo pase. */
export function validateProtocolSpec(items: ItemIn[]): ValidationResult {
  const issues: ValidationIssue[] = [];
  const push = (i: Omit<ValidationIssue, 'partida'> & { partida?: string | null }) =>
    issues.push({ partida: null, ...i });

  const parsedRows = items.map((it, idx) => ({
    item: it,
    idx: idx + 1,
    spec: it.validation_method?.trim() ? parseNumericRow(it.validation_method) : null,
    hasMethod: !!it.validation_method?.trim(),
  }));

  const numeric = isNumericProtocol(items.map(it => ({ validation_method: it.validation_method })));

  // ── 1. Sintaxis por fila ────────────────────────────────────────────────
  const anyValid = parsedRows.some(r => r.spec != null);
  for (const r of parsedRows) {
    if (!r.hasMethod || r.spec != null) continue;
    if (!anyValid) continue;   // ficha clásica real (ninguna fila numérica) → sin diagnóstico
    const bad = findBadSegment(r.item.validation_method!);
    push({
      severity: 'error',
      index: r.idx,
      partida: r.item.partida_item,
      cell: bad ? colLetter(bad.pos - 1) : undefined,
      code: 'sintaxis',
      message: bad
        ? `Fila ${r.idx}: el segmento ${bad.pos} no parsea: "${bad.seg}". Revisa el prefijo (numerico-/list-/lookup-/val-/bool-/fecha-/hora-/porcentaje-/equipo-) y los corchetes.`
        : `Fila ${r.idx}: el método "${r.item.validation_method}" no parsea como fila numérica. Esta fila tumba TODO el protocolo a modo clásico.`,
    });
  }

  if (!numeric) {
    return { isNumeric: false, ok: !issues.some(i => i.severity === 'error'), issues };
  }

  // ── 2. Estructura: matrices y secciones ─────────────────────────────────
  // v34 — Los headers `col-[…]` pueden aparecer al inicio de CADA sección
  // (columnas variables por sección); ya no son error tras los datos.
  const { mainRows, matrices, valid: matricesValid } = extractMatrices(parsedRows);
  const sectionGroups = groupIntoSections(mainRows);
  if (!matricesValid) {
    push({
      severity: 'error', index: 1, code: 'matriz-mal-formada',
      message: 'Bloque de matriz mal formado: tras el primer `matrix-[…]` solo se admiten filas `matrix-[…]`/`col-[…]` o filas de datos `val-[…] // val-[…]`.',
    });
  }

  // ── 3. Celdas: keys, duplicados, columnas vs headers ───────────────────
  const cells: ScopeCell[] = [];
  const keyOwner = new Map<string, number>();   // key → idx de la fila dueña
  let maxCols = 1;
  let codeCellCount = 0;   // v31 — celdas `codigo-[]` (máx 1 por ficha)
  for (const r of mainRows) {
    if (r.spec?.kind !== 'row') continue;
    const partida = (r.item.partida_item ?? '').trim();
    maxCols = Math.max(maxCols, r.spec.cells.length);
    for (let i = 0; i < r.spec.cells.length; i++) {
      const c = r.spec.cells[i];
      const key = scopeKeyFor(partida, i);
      // v31 — `codigo-[]`: read-only (muestra protocol_code), no entra al scope.
      if (c.kind === 'code') {
        codeCellCount++;
        if (codeCellCount > 1) {
          push({
            severity: 'error', index: r.idx, partida: r.item.partida_item, cell: colLetter(i),
            code: 'codigo-duplicado',
            message: `Fila ${r.idx}${colLetter(i)}: solo se admite UNA celda 'codigo-[]' por ficha.`,
          });
        }
        continue;
      }
      // v34 — `:oculto` solo aplica a celdas CALCULADAS (formula/val). Ocultar
      // una celda de entrada dejaría al usuario sin forma de llenarla.
      if (c.hidden && c.kind !== 'formula' && c.kind !== 'val' && c.kind !== 'blank') {
        push({
          severity: 'error', index: r.idx, partida: r.item.partida_item, cell: colLetter(i),
          code: 'oculto-en-entrada',
          message: `Fila ${r.idx}${colLetter(i)}: ':oculto' solo es válido en celdas calculadas (numerico-fx / val-). Una celda de entrada oculta no puede llenarse — usa ':nopdf' si solo quieres excluirla del reporte.`,
        });
      }
      if (c.kind === 'comment' || c.kind === 'blank') continue;
      if (keyOwner.has(key)) {
        push({
          severity: 'error', index: r.idx, partida: r.item.partida_item, cell: colLetter(i),
          code: 'partida-duplicada',
          message: `La celda ${key} ya existe (fila ${keyOwner.get(key)}). Dos items con la misma partida_item rompen las referencias #${key} — usa partidas únicas.`,
        });
        continue;
      }
      keyOwner.set(key, r.idx);
      if (c.kind === 'manual' || c.kind === 'percent') {
        cells.push({ key, kind: 'manual', raw: '' });
      } else if (c.kind === 'val') {
        cells.push({ key, kind: 'manual', raw: c.literal });
      } else if (c.kind === 'bool' || c.kind === 'free') {
        cells.push({ key, kind: 'manual', raw: '' });
      } else if (c.kind === 'list' || c.kind === 'date' || c.kind === 'time' || c.kind === 'equipment' || c.kind === 'text') {
        cells.push({ key, kind: 'list', raw: '' });
      } else if (c.kind === 'lookup') {
        cells.push({ key, kind: 'lookup', refKey: c.refKey, matrixId: c.matrixId, searchCol: c.searchCol, returnCol: c.returnCol });
      } else if (c.kind === 'formula') {
        cells.push({ key, kind: 'formula', expr: c.expr });
      }
    }
  }
  const allKeys = cells.map(c => c.key);
  const keySet = new Set(allKeys);

  // Headers de sección que declaran columnas que ninguna fila de SU sección usa
  for (const sec of sectionGroups) {
    let rowsMax = 0;
    for (const r of sec.rows) {
      if (r.spec?.kind === 'row') rowsMax = Math.max(rowsMax, r.spec.cells.length);
    }
    if (rowsMax === 0) continue;
    for (const hr of sec.headerRows) {
      for (const span of hr.spans) {
        if (span.from >= rowsMax) {
          push({
            severity: 'warning', index: 1, code: 'header-columna-inexistente',
            message: `El encabezado "${span.title}"${sec.title ? ` (sección "${sec.title}")` : ''} cubre la columna ${colLetter(span.from)} pero ninguna fila de su sección tiene tantas celdas (máx ${colLetter(rowsMax - 1)}).`,
          });
        }
      }
    }
  }

  // ── 4. Fórmulas: referencias, CELDA/COLUMNA, xrefs ──────────────────────
  for (const r of mainRows) {
    if (r.spec?.kind !== 'row') continue;
    const partida = (r.item.partida_item ?? '').trim();
    for (let i = 0; i < r.spec.cells.length; i++) {
      const c = r.spec.cells[i];
      if (c.kind !== 'formula') continue;
      const key = scopeKeyFor(partida, i);
      let deps: string[];
      try {
        deps = extractRefs(c.expr, { currentKey: key, allKeys });
      } catch (e) {
        push({
          severity: 'error', index: r.idx, partida: r.item.partida_item, cell: colLetter(i),
          code: 'formula-invalida',
          message: `Fila ${r.idx}${colLetter(i)}: ${(e as Error).message}`,
        });
        continue;
      }
      for (const d of Array.from(new Set(deps))) {
        if (!keySet.has(d)) {
          push({
            severity: 'error', index: r.idx, partida: r.item.partida_item, cell: colLetter(i),
            code: 'ref-desconocida',
            message: `Fila ${r.idx}${colLetter(i)}: la fórmula referencia #${d} pero esa celda no existe en la ficha.`,
          });
        }
      }
      try {
        for (const x of extractXrefs(c.expr)) {
          push({
            severity: 'warning', index: r.idx, partida: r.item.partida_item, cell: colLetter(i),
            code: 'xref',
            message: `Fila ${r.idx}${colLetter(i)}: referencia cruzada @${x.externalId}.${x.key} — requiere que ese protocolo exista y esté APROBADO en el proyecto.`,
          });
        }
      } catch { /* errores de lex ya reportados arriba */ }
      // LOOKUP(…, Matriz, …) dentro de fórmulas: la matriz debe existir.
      const reLookupFn = /LOOKUP\(\s*[^,()]+\s*,\s*([A-Za-z0-9_-]+)/gi;
      let lm: RegExpExecArray | null;
      while ((lm = reLookupFn.exec(c.expr)) != null) {
        if (!matrices[lm[1]]) {
          push({
            severity: 'error', index: r.idx, partida: r.item.partida_item, cell: colLetter(i),
            code: 'matriz-desconocida',
            message: `Fila ${r.idx}${colLetter(i)}: LOOKUP usa la matriz "${lm[1]}" que no está declarada con matrix-[${lm[1]}].`,
          });
        }
      }
    }
  }

  // ── 5. Celdas lookup / list contra matrices declaradas ─────────────────
  const checkMatrixCol = (m: MatrixData, col: string): boolean => {
    const idx = col.charCodeAt(0) - 65;
    const width = Math.max(m.columnTitles.length, ...m.rows.map(rw => rw.length), 0);
    return idx >= 0 && idx < width;
  };
  for (const r of mainRows) {
    if (r.spec?.kind !== 'row') continue;
    for (let i = 0; i < r.spec.cells.length; i++) {
      const c = r.spec.cells[i];
      if (c.kind === 'lookup') {
        const m = matrices[c.matrixId];
        if (!m) {
          push({
            severity: 'error', index: r.idx, partida: r.item.partida_item, cell: colLetter(i),
            code: 'matriz-desconocida',
            message: `Fila ${r.idx}${colLetter(i)}: lookup usa la matriz "${c.matrixId}" que no existe. Declárala con matrix-[${c.matrixId}] // col-[A][…] y filas val-[…].`,
          });
        } else {
          if (!checkMatrixCol(m, c.searchCol)) {
            push({
              severity: 'error', index: r.idx, partida: r.item.partida_item, cell: colLetter(i),
              code: 'matriz-columna',
              message: `Fila ${r.idx}${colLetter(i)}: la matriz "${c.matrixId}" no tiene columna ${c.searchCol} (búsqueda).`,
            });
          }
          if (!checkMatrixCol(m, c.returnCol)) {
            push({
              severity: 'error', index: r.idx, partida: r.item.partida_item, cell: colLetter(i),
              code: 'matriz-columna',
              message: `Fila ${r.idx}${colLetter(i)}: la matriz "${c.matrixId}" no tiene columna ${c.returnCol} (retorno).`,
            });
          }
        }
        if (c.refKey && !keySet.has(c.refKey)) {
          push({
            severity: 'error', index: r.idx, partida: r.item.partida_item, cell: colLetter(i),
            code: 'ref-desconocida',
            message: `Fila ${r.idx}${colLetter(i)}: lookup usa la clave #${c.refKey} pero esa celda no existe.`,
          });
        }
      } else if (c.kind === 'list' && (c.source.type === 'matrix-col' || c.source.type === 'matrix-range')) {
        // v41 — las listas de tabla de PROYECTO (@tabla) no se validan aquí (no hay auxTables).
        const m = matrices[c.source.matrixId];
        if (!m) {
          push({
            severity: 'error', index: r.idx, partida: r.item.partida_item, cell: colLetter(i),
            code: 'matriz-desconocida',
            message: `Fila ${r.idx}${colLetter(i)}: la lista usa la matriz "${c.source.matrixId}" que no existe.`,
          });
        } else if (!checkMatrixCol(m, c.source.col)) {
          push({
            severity: 'error', index: r.idx, partida: r.item.partida_item, cell: colLetter(i),
            code: 'matriz-columna',
            message: `Fila ${r.idx}${colLetter(i)}: la matriz "${c.source.matrixId}" no tiene columna ${c.source.col}.`,
          });
        }
      }
    }
  }

  // ── 6. Gráficos: refs existentes y series coherentes ────────────────────
  for (const r of mainRows) {
    if (r.spec?.kind !== 'graph') continue;
    const g = r.spec;
    const checkRefs = (refs: string[] | undefined, what: string) => {
      if (!refs) return;
      for (const ref of refs) {
        if (!keySet.has(ref)) {
          push({
            severity: 'error', index: r.idx, partida: r.item.partida_item,
            code: 'graf-ref',
            message: `Fila ${r.idx} (gráfico): la serie ${what} referencia #${ref} pero esa celda no existe.`,
          });
        }
      }
    };
    checkRefs(g.xRefs, 'X');
    checkRefs(g.yRefs, 'Y');
    checkRefs(g.y2Refs, 'Y2');
    checkRefs(g.y3Refs, 'Y3');
    checkRefs(g.bandLoRefs, 'banda inferior');
    checkRefs(g.bandHiRefs, 'banda superior');
    const expectLen = (refs: string[] | undefined, what: string) => {
      if (refs && refs.length !== g.xRefs.length) {
        push({
          severity: 'warning', index: r.idx, partida: r.item.partida_item,
          code: 'graf-longitud',
          message: `Fila ${r.idx} (gráfico): la serie ${what} tiene ${refs.length} refs y X tiene ${g.xRefs.length} — los puntos extra se ignoran.`,
        });
      }
    };
    expectLen(g.yRefs, 'Y');
    expectLen(g.y2Refs, 'Y2');
    expectLen(g.y3Refs, 'Y3');
    expectLen(g.bandLoRefs, 'banda inferior');
    expectLen(g.bandHiRefs, 'banda superior');
  }

  // ── 7. Ciclos de dependencia (estructural, sin evaluar valores) ────────
  const { inCycle } = resolveScopeCells(cells, matrices);
  inCycle.forEach(key => {
    const idx = keyOwner.get(key) ?? 1;
    const row = parsedRows[idx - 1];
    push({
      severity: 'error', index: idx, partida: row?.item.partida_item ?? null, cell: key.slice(-1),
      code: 'ciclo',
      message: `Celda ${key}: referencia circular — su fórmula depende (directa o indirectamente) de sí misma.`,
    });
  });

  // ── 8. Directivas paramétricas (solo plantillas) ────────────────────────
  for (const r of parsedRows) {
    if (r.spec?.kind === 'repeat-directive') {
      push({
        severity: 'warning', index: r.idx, partida: r.item.partida_item,
        code: 'repeat',
        message: `Fila ${r.idx}: directiva repeat-[${r.spec.groupId}] — válida solo en plantillas; se expande al crear la instancia.`,
      });
    }
  }

  issues.sort((a, b) => a.index - b.index || (a.severity === 'error' ? -1 : 1));
  return { isNumeric: true, ok: !issues.some(i => i.severity === 'error'), issues };
}
