'use client';

import { useMemo, useCallback, useEffect, useState, useRef, type ReactNode } from 'react';
import { Play, AlertTriangle, FunctionSquare, Table, CheckCircle2, XCircle, RefreshCw } from 'lucide-react';
import { cn } from '@lib/utils';
import { useI18n } from '@lib/i18n';
import {
  parseNumericRow, parseNumeric, inRange,
  splitRowComments, joinRowComments, colLetter, scopeKeyFor, formatComputed,
  extractMatrices, groupIntoSections, formatFormulaExcelStyle,
  isValidDateText, isValidTimeText, deriveAxisTitles,
  type NumericRowSpec, type NumericCellSpec, type NumericHeaderSpec, type MatrixData, type ListSource,
  type NumericSectionGroup,
} from '@lib/numericProtocol';
import { resolveScopeCells, extractRefs, type ScopeCell, type Scope, type AuxTables } from '@lib/formulaEval';
import { NumericChart } from './NumericChart';
import { MatricesModal } from './MatricesModal';
import { useXrefValues } from '@hooks/useXrefs';
import { useLabAuxTables } from '@hooks/useFileUpload';
import type { ProtocolItem } from '@/types';

/** Mapping de clase Tailwind de ancho a px (para spans multi-celda en el header).
 *  Debe mantenerse en sync con el `cellWidthClass` calculado abajo. */
const CELL_WIDTH_PX: Record<string, number> = {
  'w-40': 160,
  'w-32': 128,
  'w-28': 112,
};

/** Kinds de celda que el usuario llena directamente (tienen valor local editable). */
function isUserInputKind(k: NumericCellSpec['kind']): boolean {
  return k === 'manual' || k === 'list' || k === 'comment'
      || k === 'percent' || k === 'bool' || k === 'date' || k === 'time' || k === 'equipment'
      || k === 'free' || k === 'text' || k === 'xref';   // v45 — xref guarda el/los código(s) elegido(s)
}

/** Kinds que se escriben con teclado (<input> con ref enfocable). bool es un
 *  <button> y list/comment son <select> — focusInput() sobre ellos no hace nada
 *  y la navegación Enter/Play se atascaba en silencio. */
function isTypedInputKind(k: NumericCellSpec['kind']): boolean {
  return k === 'manual' || k === 'percent' || k === 'date' || k === 'time' || k === 'equipment'
      || k === 'free' || k === 'text';
}

/** El separador posicional de celdas es `//`. Un valor de usuario que lo
 *  contenga rompería el alineamiento de la fila al deserializar — se colapsa. */
function sanitizeCellText(raw: string): string {
  return raw.includes('//') ? raw.replace(/\/{2,}/g, '/') : raw;
}

/** v34 — Fila 100% oculta (`:oculto` en todas sus celdas no-blank): no se
 *  renderiza en la app ni cuenta en la numeración. Sus fórmulas SÍ computan. */
function isRowHidden(spec: Extract<NumericRowSpec, { kind: 'row' }>): boolean {
  return spec.cells.length > 0
    && spec.cells.some(c => c.hidden)
    && spec.cells.every(c => c.hidden || c.kind === 'blank');
}

/** v35 — Presentación de celdas de entrada con `:dec[n]`: formatea el valor
 *  confirmado (input no enfocado); el crudo tipeado se conserva en comments. */
function fmtInputDisplay(raw: string, decimals?: number): string {
  if (decimals == null || !raw.trim()) return raw;
  const n = parseNumeric(raw);
  return n == null || !isFinite(n) ? raw : n.toFixed(decimals);
}

/** Clase de ancho de celda según el nº de columnas de LA SECCIÓN (v34). */
function cwClassFor(mc: number): string {
  return mc === 1 ? 'w-40' : mc <= 3 ? 'w-32' : 'w-28';
}

/** Renderiza las celdas de una fila de header. Cada span ocupa
 *  `(to-from+1) * cellWidth` px. Columnas no cubiertas quedan en blanco. */
function renderHeaderCells(hr: NumericHeaderSpec, maxCols: number, cellWidthClass: string) {
  const cellPx = CELL_WIDTH_PX[cellWidthClass] ?? 128;
  const out: ReactNode[] = [];
  let i = 0;
  while (i < maxCols) {
    const span = hr.spans.find(s => s.from === i);
    if (span) {
      const realTo = Math.min(span.to, maxCols - 1);  // clip a maxCols
      const colCount = realTo - i + 1;
      out.push(
        <div
          key={i}
          className="text-center text-[10px] font-bold py-1 px-1 border-l border-white/20 whitespace-normal break-words leading-tight flex items-center justify-center"
          style={{ width: `${colCount * cellPx}px` }}
          title={span.title}
        >
          {span.title}
        </div>
      );
      i = realTo + 1;
    } else {
      out.push(<div key={i} className={cn(cellWidthClass, 'border-l border-white/20')} />);
      i++;
    }
  }
  return out;
}

interface Props {
  items: ProtocolItem[];
  readOnly?: boolean;
  /** Llamado al cambiar el valor de una fila. Persiste `comments`, `is_compliant`, `has_answer`. */
  onChangeManual?: (input: { itemId: string; comments: string; isCompliant: boolean | null; hasAnswer: boolean }) => void;
  /** Modo "congelado": para protocolos históricos / bloqueados. */
  frozen?: boolean;
  /** v26 — projectId para resolver xrefs `@<ext>.<key>` desde protocolos APPROVED
   *  del mismo proyecto. Si no se pasa, las xrefs fallan con 'xref-missing'. */
  projectId?: string;
  /** Activa la resolución de xrefs (gate vía feature flag protocol_linking). */
  enableXrefs?: boolean;
  /** v31 (Parte E) — código correlativo del protocolo, para celdas `codigo-[]`. */
  protocolCode?: string | null;
}

/** Tabla unificada para protocolos numéricos. Detecta manual / formula / graph por
 *  `validation_method` y soporta filas multi-celda separadas por `//` (cada celda
 *  se etiqueta posicionalmente con A, B, C, …). */
export function NumericTable({ items, readOnly: readOnlyProp, onChangeManual, frozen, projectId, enableXrefs, protocolCode }: Props) {
  const { t } = useI18n();
  // frozen implica readOnly siempre — un histórico nunca debe permitir edición accidental.
  const readOnly = readOnlyProp || frozen;
  // Parsea las specs de cada item una vez (memoizado por items)
  const parsedRows = useMemo(() => items.map(it => ({
    item: it,
    spec: parseNumericRow(it.validation_method),
  })), [items]);

  // v34 — Las matrices se extraen primero; los headers `col-[…]` pueden aparecer
  // al inicio de CADA sección (Mejora 1: columnas variables por sección).
  const { mainRows, matrices } = useMemo(() => extractMatrices(parsedRows), [parsedRows]);
  const sections = useMemo(() => groupIntoSections(mainRows), [mainRows]);
  const allHeaderRows = useMemo(() => sections.flatMap(sec => sec.headerRows), [sections]);

  // v42e (I4) — `maxCols`/`maxStripPx` globales eran residuo de antes de v42b (ancho
  // por sección). Ya no se usan (la densidad y el ancho se calculan con `sec.maxCols`);
  // eliminados para no sugerir falsamente una alineación a ancho global.

  // Numeración visible continua (omite filas ocultas y no-filas).
  const displayIdx = useMemo(() => {
    const m = new Map<string, number>();
    let n = 0;
    for (const sec of sections) {
      for (const r of sec.rows) {
        if (r.spec?.kind === 'row' && isRowHidden(r.spec)) continue;
        if (r.spec?.kind !== 'row' && r.spec?.kind !== 'graph') continue;
        n++;
        m.set(r.item.id, n);
      }
    }
    return m;
  }, [sections]);

  // Editor local de inputs manuales (controlado): key compuesta `<itemId>:<col>`.
  // Sync incremental como antes: preserva celdas en edición durante refetch en
  // segundo plano. Solo inicializa keys nuevas desde server.
  const [localValues, setLocalValues] = useState<Record<string, string>>({});
  // v42c — fuerza el recálculo/re-render de los gráficos (botón "Recargar gráfico").
  const [chartNonce, setChartNonce] = useState(0);

  useEffect(() => {
    setLocalValues(prev => {
      const next: Record<string, string> = {};
      let changed = false;
      for (const { item, spec } of mainRows) {
        if (spec?.kind !== 'row') continue;
        const cellVals = splitRowComments(item.comments, spec.cells.length);
        for (let i = 0; i < spec.cells.length; i++) {
          const ck = spec.cells[i].kind;
          // Inputs que el usuario llena/selecciona (manual, list, comment + tipos v32)
          if (!isUserInputKind(ck)) continue;
          const k = `${item.id}:${colLetter(i)}`;
          if (k in prev) next[k] = prev[k];
          else { next[k] = cellVals[i] ?? ''; changed = true; }
        }
      }
      if (!changed) {
        const prevKeys = Object.keys(prev);
        if (prevKeys.length === Object.keys(next).length) {
          let same = true;
          for (const k of prevKeys) if (next[k] !== prev[k]) { same = false; break; }
          if (same) return prev;
        }
      }
      return next;
    });
  }, [mainRows]);

  // v26 — Preload de valores xref (`@HIS-001.5F`). Solo se hace fetch si el flag
  // está activo y hay referencias detectadas en los items.
  const { data: xrefValues } = useXrefValues(projectId ?? '', items, !!(enableXrefs && projectId));
  // v41 — Tablas auxiliares del proyecto (taras, moldes…) para BUSCAR().
  const { data: auxTables } = useLabAuxTables(projectId ?? '');

  // Construye scope/errores/textValues.
  // Si `frozen`: lee TODO directo de `comments` (snapshot histórico inmutable).
  // Si no: usa resolveScopeCells para evaluar fórmulas + lookups + xrefs live.
  const { scope, errors, textValues } = useMemo(() => {
    if (frozen) {
      // Modo frozen: cada celda lee su valor del snapshot en comments[i].
      // Fórmulas y lookups se tratan como valores ya computados — NO se evalúan.
      const scope: Scope = {};
      const textValues: Record<string, string> = {};
      for (const { item, spec } of mainRows) {
        if (spec?.kind !== 'row') continue;
        const partida = item.partida_item ?? '';
        const cellVals = splitRowComments(item.comments, spec.cells.length);
        for (let i = 0; i < spec.cells.length; i++) {
          const cell = spec.cells[i];
          const key = scopeKeyFor(partida, i);
          // v46.1 — RETENCIÓN de gráficos: las celdas `val` (literales, p. ej. aberturas de
          // tamiz del eje X) NO viven en comments → leer del literal del spec; sin esto el
          // gráfico con eje val desaparecía en el Audit. El resto lee su valor de comments.
          const raw = cell.kind === 'val' ? ((cell as { literal?: string }).literal ?? '') : (cellVals[i] ?? '');
          if (raw !== '') textValues[key] = raw;
          const num = parseNumeric(raw);
          scope[key] = (num != null && isFinite(num)) ? num : null;
        }
      }
      return { scope, errors: {} as Record<string, string>, textValues };
    }
    const cells: ScopeCell[] = [];
    for (const { item, spec } of mainRows) {
      if (spec?.kind !== 'row') continue;
      const partida = item.partida_item ?? '';
      const cellVals = splitRowComments(item.comments, spec.cells.length);
      for (let i = 0; i < spec.cells.length; i++) {
        const cell = spec.cells[i];
        const key = scopeKeyFor(partida, i);
        const localKey = `${item.id}:${colLetter(i)}`;
        if (cell.kind === 'manual' || cell.kind === 'percent' || cell.kind === 'bool' || cell.kind === 'free') {
          // percent es numérico (rango como manual); bool guarda "1"/"0" y vale
          // 1/0 dentro de fórmulas; free es numérico sin rango — todos entran al
          // scope como 'manual' (usables en fórmulas).
          cells.push({ key, kind: 'manual', raw: localValues[localKey] ?? cellVals[i] ?? '' });
        } else if (cell.kind === 'list' || cell.kind === 'date' || cell.kind === 'time' || cell.kind === 'equipment' || cell.kind === 'text') {
          cells.push({ key, kind: 'list', raw: localValues[localKey] ?? cellVals[i] ?? '' });
        } else if (cell.kind === 'comment') {
          // 'comment' no participa del scope numérico — solo persiste el texto.
        } else if (cell.kind === 'lookup') {
          cells.push({ key, kind: 'lookup', refKey: cell.refKey, matrixId: cell.matrixId, searchCol: cell.searchCol, returnCol: cell.returnCol });
        } else if (cell.kind === 'formula') {
          cells.push({ key, kind: 'formula', expr: cell.expr });
        } else if (cell.kind === 'val') {
          // Literal de solo-lectura: entra como 'manual' fijo para que las
          // fórmulas que referencien esta celda (#1A, etc.) lo resuelvan.
          cells.push({ key, kind: 'manual', raw: cell.literal });
        }
      }
    }
    return resolveScopeCells(cells, matrices, xrefValues, auxTables);
  }, [frozen, mainRows, localValues, matrices, xrefValues, auxTables]);

  // Refs por fórmula (para detectar deps llenas)
  const formulaRefsByKey = useMemo(() => {
    const map: Record<string, string[]> = {};
    // allKeys habilita deps exactas de COLUMNA(); currentKey habilita FILA()/CELDA().
    const allKeys: string[] = [];
    for (const { item, spec } of mainRows) {
      if (spec?.kind !== 'row') continue;
      const partida = item.partida_item ?? '';
      for (let i = 0; i < spec.cells.length; i++) {
        const ck = spec.cells[i].kind;
        if (ck === 'comment' || ck === 'blank') continue;
        allKeys.push(scopeKeyFor(partida, i));
      }
    }
    for (const { item, spec } of mainRows) {
      if (spec?.kind !== 'row') continue;
      const partida = item.partida_item ?? '';
      for (let i = 0; i < spec.cells.length; i++) {
        const cell = spec.cells[i];
        if (cell.kind !== 'formula') continue;
        const key = scopeKeyFor(partida, i);
        try { map[key] = extractRefs(cell.expr, { currentKey: key, allKeys }); } catch { /* error de parse */ }
      }
    }
    return map;
  }, [mainRows]);

  const formulaDepsFilled = useCallback((key: string): boolean => {
    const deps = formulaRefsByKey[key];
    if (!deps) return false;
    return deps.every(d => scope[d] != null);
  }, [formulaRefsByKey, scope]);

  // Conteo de CELDAS fuera de rango (no filas)
  const outOfRangeCount = useMemo(() => {
    let n = 0;
    for (const { item, spec } of mainRows) {
      if (spec?.kind !== 'row') continue;
      const partida = item.partida_item ?? '';
      for (let i = 0; i < spec.cells.length; i++) {
        const cell = spec.cells[i];
        // v42e (M6) — celdas ocultas (:oculto) no deben contar en el banner amarillo
        // "N valores fuera de rango": el estado de fila ya las salta, así que contarlas
        // aquí producía un banner sin ninguna fila roja localizable (banner fantasma).
        if (cell.hidden) continue;
        const key = scopeKeyFor(partida, i);
        // Fecha/hora con formato inválido también cuentan en el banner de errores.
        if (cell.kind === 'date' || cell.kind === 'time') {
          const txt = textValues[key];
          if (txt && !(cell.kind === 'date' ? isValidDateText(txt) : isValidTimeText(txt))) n++;
          continue;
        }
        const v = scope[key];
        if (v == null) continue;
        if ((cell.kind === 'manual' || cell.kind === 'percent') && !inRange(v, cell.range)) n++;
        if (cell.kind === 'formula' && cell.range && formulaDepsFilled(key) && !inRange(v, cell.range)) n++;
      }
    }
    return n;
  }, [mainRows, scope, textValues, formulaDepsFilled]);

  // Commit a row: re-serializa todas sus celdas manuales/list y llama onChangeManual
  const commitRow = useCallback((itemId: string, spec: Extract<NumericRowSpec, { kind: 'row' }>, overrideValues?: Record<string, string>) => {
    if (!onChangeManual) return;
    const values = overrideValues ?? localValues;
    const cellVals: string[] = [];
    let hasAnyInput = false;
    let allInputsFilled = true;
    let allInRange = true;
    let anyChecked = false;
    for (let i = 0; i < spec.cells.length; i++) {
      const cell = spec.cells[i];
      const L = colLetter(i);
      if (cell.kind === 'manual' || cell.kind === 'percent') {
        hasAnyInput = true;
        const raw = sanitizeCellText((values[`${itemId}:${L}`] ?? '').trim());
        cellVals.push(raw);
        const v = parseNumeric(raw);
        if (v == null) allInputsFilled = false;
        else {
          anyChecked = true;
          if (!inRange(v, cell.range)) allInRange = false;
        }
      } else if (cell.kind === 'list' || cell.kind === 'bool' || cell.kind === 'equipment') {
        hasAnyInput = true;
        const raw = sanitizeCellText((values[`${itemId}:${L}`] ?? '').trim());
        cellVals.push(raw);
        if (raw === '') allInputsFilled = false;
        else anyChecked = true;
      } else if (cell.kind === 'date' || cell.kind === 'time') {
        // Fecha/hora: cuentan como llenadas solo con formato válido.
        hasAnyInput = true;
        const raw = sanitizeCellText((values[`${itemId}:${L}`] ?? '').trim());
        cellVals.push(raw);
        const valid = cell.kind === 'date' ? isValidDateText(raw) : isValidTimeText(raw);
        if (raw === '') allInputsFilled = false;
        else if (valid) anyChecked = true;
        else { anyChecked = true; allInRange = false; }
      } else if (cell.kind === 'free' || cell.kind === 'text') {
        // Ingreso libre (numérico sin rango / texto): se persiste y cuenta como
        // llenado, pero NO valida rango ni afecta la conformidad (anyChecked).
        hasAnyInput = true;
        const raw = sanitizeCellText((values[`${itemId}:${L}`] ?? '').trim());
        cellVals.push(raw);
        if (raw === '') allInputsFilled = false;
      } else if (cell.kind === 'comment') {
        // Comentario predefinido: se persiste el texto pero NO afecta el estado ok/fail.
        const raw = sanitizeCellText((values[`${itemId}:${L}`] ?? '').trim());
        cellVals.push(raw);
      } else if (cell.kind === 'xref') {
        // v45 — paridad con móvil: NO pisar el código elegido en select/self. `get` se deriva.
        // (Evita corromper una fila xref creada en móvil al editar otra celda de la fila en web.)
        if (cell.mode === 'get') { cellVals.push(''); }
        else {
          hasAnyInput = true;
          const raw = (values[`${itemId}:${L}`] ?? '').trim();   // sin sanitizar: el código lleva guiones
          cellVals.push(raw);
          if (raw === '') allInputsFilled = false;
        }
      } else {
        // formula / lookup / blank → slot vacío (no se rellena por el usuario)
        cellVals.push('');
      }
    }
    const comments = joinRowComments(cellVals);
    const isCompliant: boolean | null = !hasAnyInput || !allInputsFilled
      ? null
      : (anyChecked ? allInRange : null);
    const hasAnswer = hasAnyInput && allInputsFilled;
    onChangeManual({ itemId, comments, isCompliant, hasAnswer });
  }, [onChangeManual, localValues]);

  // ── Refs para inputs + navegación "Play / Enter" ─────────────────────────
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const manualOrder = useMemo(() => {
    const out: { itemId: string; col: string; inputKey: string }[] = [];
    for (const { item, spec } of mainRows) {
      if (spec?.kind !== 'row') continue;
      for (let i = 0; i < spec.cells.length; i++) {
        const ck = spec.cells[i].kind;
        if (!isTypedInputKind(ck)) continue;
        const L = colLetter(i);
        out.push({ itemId: item.id, col: L, inputKey: `${item.id}:${L}` });
      }
    }
    return out;
  }, [mainRows]);

  const nextEmptyInputKey = useCallback((afterKey?: string): string | null => {
    const start = afterKey ? manualOrder.findIndex(c => c.inputKey === afterKey) + 1 : 0;
    for (let i = start; i < manualOrder.length; i++) {
      const k = manualOrder[i].inputKey;
      if (!(localValues[k] ?? '').trim()) return k;
    }
    for (let i = 0; i < start; i++) {
      const k = manualOrder[i].inputKey;
      if (!(localValues[k] ?? '').trim()) return k;
    }
    return null;
  }, [manualOrder, localValues]);

  const focusInput = useCallback((k: string | null) => {
    if (!k) return;
    const el = inputRefs.current[k];
    if (el) { el.focus(); el.select?.(); }
  }, []);

  const startPlay = useCallback(() => focusInput(nextEmptyInputKey()), [focusInput, nextEmptyInputKey]);


  // Toggle Fx: si hay al menos una fórmula, mostrar el botón
  const hasFormulas = useMemo(() => parsedRows.some(r =>
    r.spec?.kind === 'row' && r.spec.cells.some(c => c.kind === 'formula')
  ), [parsedRows]);
  const [showFormulas, setShowFormulas] = useState(false);
  // v33 — Fórmulas expandidas POR FILA (además del toggle global).
  const [rowFormulas, setRowFormulas] = useState<Set<string>>(new Set());
  const toggleRowFormulas = (id: string) => setRowFormulas(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  // Bandas de sección: cuando hay más de una sección visual.
  const showSectionBands = sections.length > 1;

  // Modal "Ver tablas": solo si hay matrices auxiliares
  const matrixList = useMemo(() => Object.values(matrices), [matrices]);
  const [showMatricesModal, setShowMatricesModal] = useState(false);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2 flex-wrap">
        {!readOnly && manualOrder.length > 0 && (
          <button
            onClick={startPlay}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-primary text-white hover:bg-primary/90 transition"
            title={t('webCNumeric.startFillTip')}
          >
            <Play size={12} fill="currentColor" />
            {t('numericTable.startFill')}
          </button>
        )}
        {hasFormulas && (
          <button
            onClick={() => setShowFormulas(v => !v)}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition border',
              showFormulas
                ? 'bg-primary/10 text-primary border-primary/30'
                : 'bg-white text-textSecondary border-border hover:bg-surface',
            )}
            title={showFormulas ? t('webCNumeric.hideFormulasTip') : t('webCNumeric.showFormulasTip')}
          >
            <FunctionSquare size={12} />
            {showFormulas ? t('webCNumeric.hideFormulas') : t('webCNumeric.showFormulas')}
          </button>
        )}
        {matrixList.length > 0 && (
          <button
            onClick={() => setShowMatricesModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition border bg-white text-textSecondary border-border hover:bg-surface"
            title={t('webCNumeric.viewTablesTip')}
          >
            <Table size={12} />
            {t('numericTable.viewTables', { count: matrixList.length })}
          </button>
        )}
      </div>
      {outOfRangeCount > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-md px-3 py-2 text-xs font-bold text-warning flex items-center gap-1.5">
          <AlertTriangle size={14} strokeWidth={2.5} />
          <span>{t(outOfRangeCount === 1 ? 'numericTable.banner.outOfRange.one' : 'numericTable.banner.outOfRange.other', { count: outOfRangeCount })}</span>
        </div>
      )}

      <div className="bg-white rounded-md border border-border shadow-subtle overflow-x-auto">
        {/* Barra superior fija: # / Actividad / (zona de valores) / ✓-✗.
            v34 — Los encabezados de columna viven en CADA sección. */}
        <div className="flex items-stretch text-white text-[10px] font-extrabold tracking-wider uppercase min-w-fit">
          <div className="w-12 bg-navy flex items-center justify-center shrink-0 py-1.5">#</div>
          <div className="flex-1 bg-navy px-1.5 flex items-center min-w-[200px]">{t('numericTable.header.activity')}</div>
          {/* v42b — la barra superior global ya NO reserva la franja ancha; los
              encabezados de columna viven en CADA sección con su propio ancho. */}
          <div className="bg-navy shrink-0" style={{ width: 0 }} />
          <div className="w-12 bg-navy flex items-center justify-center shrink-0">✓/✗</div>
        </div>

        {sections.map((sec, sIdx) => {
          const secCwClass = cwClassFor(sec.maxCols);
          // v42b — Ancho PROPIO de esta sección (no el máximo global): cada
          // procedimiento ocupa solo sus columnas; las de 1 valor no reservan
          // columnas fantasma del bloque más ancho.
          const secStripPx = sec.maxCols * (CELL_WIDTH_PX[secCwClass] ?? 128);
          // A1 — la norma ya NO se muestra (el DSL `:norma[]` sigue parseando por compat).
          const showStrip = sec.headerRows.length > 0 || sec.maxCols > 1;
          return (
          <div key={`sec-${sIdx}`}>
          {showSectionBands && sec.title ? (
            <div className="bg-surface border-b border-border px-3 py-1.5 text-[10px] font-extrabold text-primary uppercase tracking-wider flex items-center justify-between">
              <span>{sec.title}</span>
              <span className="text-muted normal-case tracking-normal font-bold">{sec.maxCols} {t(sec.maxCols === 1 ? 'numericTable.section.cols.one' : 'numericTable.section.cols.other')}</span>
            </div>
          ) : null}
          {showStrip && (
            <div className="flex items-stretch text-white text-[10px] font-extrabold tracking-wider uppercase min-w-fit">
              <div className="w-12 bg-navy shrink-0" />
              <div className="flex-1 bg-navy min-w-[200px]" />
              {/* v42e (I3) — Ancho PROPIO de la sección (secStripPx, v42b); col A
                  alineada a la izquierda (misma x en todas las secciones, como el celular). */}
              <div className="flex flex-col shrink-0 bg-navy" style={{ width: secStripPx }}>
                {sec.headerRows.map((hr, lvl) => (
                  <div
                    key={lvl}
                    className={cn(
                      'flex border-b border-white/10',
                      lvl === 0 ? 'bg-navy text-white'
                      : lvl === 1 ? 'bg-slate-600 text-white'
                      : 'bg-slate-400 text-white',
                    )}
                  >
                    {renderHeaderCells(hr, sec.maxCols, secCwClass)}
                  </div>
                ))}
                {/* Fila de letras (+ norma de la columna, si la hay) */}
                <div className="flex bg-navy">
                  {Array.from({ length: sec.maxCols }, (_, i) => (
                    <div key={i} className={cn(secCwClass, 'text-center py-1 flex flex-col items-center', i > 0 && 'border-l border-white/20')}>
                      <span>{sec.maxCols === 1 ? t('numericTable.header.value') : colLetter(i)}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="w-12 bg-navy shrink-0" />
            </div>
          )}
          {sec.rows.map(({ item: it, spec }) => {
          if (!spec) return null;
          if (spec.kind === 'header' || spec.kind === 'matrix-header' || spec.kind === 'matrix-data' || spec.kind === 'repeat-directive') return null;
          if (spec.kind === 'row' && isRowHidden(spec)) return null;   // v34 — fila de cálculo oculta
          const idx = (displayIdx.get(it.id) ?? 1) - 1;
          const altBg = idx % 2 === 1 ? 'bg-[#fafbfd]' : 'bg-white';
          const partida = it.partida_item ?? '';

          if (spec.kind === 'graph') {
            // v33 — Títulos de eje garantizados: fallback desde encabezados de columna.
            const axisTitles = deriveAxisTitles(spec, allHeaderRows);
            return (
              <div key={it.id}>
              <div className={cn('border-b border-divider last:border-b-0 px-2 py-3', altBg)}>
                <div className="flex items-center gap-2 mb-1">
                  <span className="w-12 text-center text-primary text-[12px] font-bold">{idx + 1}</span>
                  {/* extra — si el chart trae título propio, no duplicarlo en la fila */}
                  {!spec.title && <span className="text-[12px] text-navy">{it.item_description}</span>}
                  {/* v42c — botón Recargar JUNTO al número (no a la derecha). */}
                  <button
                    onClick={() => setChartNonce(n => n + 1)}
                    className="flex items-center gap-1 px-2 py-1 text-[11px] font-bold rounded border border-primary text-primary hover:bg-primary/5"
                    title={t('webCNumeric.reloadChartTip')}
                  >
                    <RefreshCw size={12} /> {t('numericTable.chart.reload')}
                  </button>
                </div>
                <NumericChart
                  key={`${it.id}-${chartNonce}`}
                  mode={spec.mode}
                  xRefs={spec.xRefs}
                  yRefs={spec.yRefs}
                  scope={scope}
                  title={spec.title}
                  xAxisTitle={axisTitles.xAxisTitle}
                  yAxisTitle={axisTitles.yAxisTitle}
                  y2Refs={spec.y2Refs}
                  y3Refs={spec.y3Refs}
                  seriesLabels={spec.seriesLabels}
                  bandLoRefs={spec.bandLoRefs}
                  bandHiRefs={spec.bandHiRefs}
                  fit={spec.fit}
                  aspectPct={spec.aspectPct}
                />
              </div>
              </div>
            );
          }

          // spec.kind === 'row'
          const cellVals = splitRowComments(it.comments, spec.cells.length);

          // Estado ✓/✗ a nivel fila
          const rowStatus = (() => {
            let okCount = 0, failCount = 0, pending = 0;
            for (let i = 0; i < spec.cells.length; i++) {
              const c = spec.cells[i];
              const key = scopeKeyFor(partida, i);
              const v = scope[key];
              const txt = textValues[key];
              if (c.hidden) continue;   // v34 — celdas ocultas no afectan el estado
              if (errors[key]) { failCount++; continue; }
              if (c.kind === 'comment' || c.kind === 'blank' || c.kind === 'free' || c.kind === 'text') {
                // Comentario, blank y libres (free/text): NO afectan el estado ok/fail del row.
                continue;
              }
              if (c.kind === 'list' || c.kind === 'lookup' || c.kind === 'bool' || c.kind === 'equipment') {
                // Lista/lookup/bool/equipo: cuentan ok si tienen valor
                if (txt) okCount++;
                else pending++;
                continue;
              }
              if (c.kind === 'date' || c.kind === 'time') {
                if (!txt) { pending++; continue; }
                const valid = c.kind === 'date' ? isValidDateText(txt) : isValidTimeText(txt);
                valid ? okCount++ : failCount++;
                continue;
              }
              if (v == null) { pending++; continue; }
              if (c.kind === 'manual' || c.kind === 'percent') {
                inRange(v, c.range) ? okCount++ : failCount++;
              } else if (c.kind === 'formula' && c.range) {
                if (formulaDepsFilled(key)) {
                  inRange(v, c.range) ? okCount++ : failCount++;
                } else pending++;
              }
            }
            if (failCount > 0) return 'fail';
            if (okCount > 0 && pending === 0) return 'ok';
            return null;
          })();

          const rowHasFormula = spec.cells.some(c => c.kind === 'formula');
          return (
            <div key={it.id}>
            <div className={cn(
              'flex items-center px-2 py-3 border-b border-divider last:border-b-0 min-w-fit',
              rowStatus === 'fail' ? 'bg-danger/5' : altBg,
            )}>
              <div className="w-12 text-center shrink-0">
                {/* A7 — solo el número visible; la partida interna NO se muestra */}
                <div className={cn('text-[12px] font-bold leading-tight', rowStatus === 'fail' ? 'text-danger' : 'text-primary')}>{idx + 1}</div>
                {rowHasFormula && (
                  <button
                    type="button"
                    onClick={() => toggleRowFormulas(it.id)}
                    title={rowFormulas.has(it.id) ? t('webCNumeric.hideRowFormulas') : t('webCNumeric.showRowFormulas')}
                    className={cn(
                      'mt-0.5 inline-flex items-center justify-center w-5 h-5 rounded border text-[8px] font-bold transition',
                      rowFormulas.has(it.id)
                        ? 'bg-primary text-white border-primary'
                        : 'bg-white text-primary border-border hover:border-primary',
                    )}
                  >
                    fx
                  </button>
                )}
              </div>
              <div className="flex-1 px-1.5 text-[12px] text-textPrimary leading-snug min-w-[200px]">{it.item_description}</div>

              {/* v42e (I3) — Celdas con el ancho PROPIO de la sección (secStripPx, v42b),
                  col A alineada a la izquierda (misma x en todas las secciones). */}
              <div className="flex shrink-0 items-stretch" style={{ width: secStripPx }}>
                {Array.from({ length: sec.maxCols }, (_, i) => {
                  const cell = spec.cells[i];
                  const L = colLetter(i);
                  const cellWidthClass = secCwClass;
                  const inputKey = `${it.id}:${L}`;
                  if (!cell) {
                    return <div key={i} className={cn(cellWidthClass, 'px-1')} />;
                  }
                  if (cell.hidden) {
                    // v34 — celda de cálculo oculta: computa en el scope, no se ve.
                    return <div key={i} className={cn(cellWidthClass, 'px-1')} />;
                  }
                  // Texto opcional encima de la celda (fórmula, estilo Excel: A1 en vez de #1A)
                  const formulaAbove = cell.kind === 'formula' ? formatFormulaExcelStyle(cell.expr) : null;
                  // Texto rango/tipo debajo de la celda
                  const rangeBelow = cell.kind === 'manual'
                    ? `[${cell.range.min} : ${cell.range.max}]`
                    : cell.kind === 'percent'
                      ? `[${cell.range.min} : ${cell.range.max}] %`
                    : cell.kind === 'formula'
                      ? (cell.range ? `[${cell.range.min} : ${cell.range.max}]` : 'fx')
                      : cell.kind === 'list'
                        ? t('webCNumeric.cellType.list')
                        : cell.kind === 'comment'
                          ? t('webCNumeric.cellType.comment')
                          : cell.kind === 'lookup'
                            ? `→${cell.matrixId}.${cell.returnCol}`
                            : cell.kind === 'bool'
                              ? t('webCNumeric.cellType.bool')
                              : cell.kind === 'date'
                                ? t('numericTable.placeholder.date')
                                : cell.kind === 'time'
                                  ? t('numericTable.placeholder.time')
                                  : cell.kind === 'equipment'
                                    ? t('webCNumeric.cellType.equipment', { type: cell.equipType })
                                    : '';
                  // A1 — la norma ya no se muestra (ni celda ni tooltip).
                  const formulasVisible = showFormulas || rowFormulas.has(it.id);
                  return (
                    <div
                      key={i}
                      className={cn(cellWidthClass, 'px-1 flex flex-col items-center justify-between gap-0.5 py-0.5')}
                      title={rangeBelow || undefined}
                    >
                      {formulasVisible && formulaAbove ? (
                        <div className="w-full text-[9px] text-primary font-mono leading-tight break-all text-center min-h-[16px]">
                          {formulaAbove}
                        </div>
                      ) : formulasVisible ? (
                        <div className="min-h-[16px]" />
                      ) : null}
                      <CellRender
                        protocolCode={protocolCode}
                        cell={cell}
                        cellKey={scopeKeyFor(partida, i)}
                        rawValue={localValues[inputKey] ?? cellVals[i] ?? ''}
                        scope={scope}
                        textValues={textValues}
                        errors={errors}
                        formulaDepsFilled={formulaDepsFilled}
                        readOnly={readOnly}
                        compact={sec.maxCols > 1}
                        matrices={matrices}
                        auxTables={auxTables}
                        inputRef={el => { inputRefs.current[inputKey] = el; }}
                        onChange={raw => {
                          setLocalValues(prev => ({ ...prev, [inputKey]: raw }));
                          // Listas, comentarios y casillas Sí/No hacen commit inmediato
                          // al cambiar (no esperan blur — un tap debe persistir).
                          if (cell.kind === 'list' || cell.kind === 'comment' || cell.kind === 'bool') {
                            queueMicrotask(() => commitRow(it.id, spec, { ...localValues, [inputKey]: raw }));
                          }
                        }}
                        onCommit={() => commitRow(it.id, spec)}
                        onEnter={() => {
                          const nextKey = nextEmptyInputKey(inputKey);
                          if (nextKey) focusInput(nextKey);
                        }}
                      />
                      {/* M2 — slot de ALTURA FIJA: la validación nunca desplaza el
                          input; toda la fila queda alineada. La norma vive arriba,
                          en el encabezado de la columna (y en el tooltip). */}
                      <div className="h-3 text-[9px] text-gray-400 leading-3 whitespace-nowrap font-normal">
                        {rangeBelow}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="w-12 flex justify-center shrink-0">
                {rowStatus === 'ok' ? <CheckCircle2 className="w-[18px] h-[18px] text-success" />
                  : rowStatus === 'fail' ? <XCircle className="w-[18px] h-[18px] text-danger" />
                  : null}
              </div>
            </div>
            </div>
          );
          })}
          </div>
          );
        })}
      </div>

      {showMatricesModal && (
        <MatricesModal matrices={matrixList} onClose={() => setShowMatricesModal(false)} />
      )}
    </div>
  );
}

// ── Sub-componente render por celda ─────────────────────────────────────────
function CellRender({ cell, cellKey, rawValue, scope, textValues, errors, formulaDepsFilled, readOnly, compact, matrices, auxTables, inputRef, onChange, onCommit, onEnter, protocolCode }: {
  cell: NumericCellSpec;
  cellKey: string;
  rawValue: string;
  scope: Scope;
  textValues: Record<string, string>;
  errors: Record<string, string>;
  formulaDepsFilled: (key: string) => boolean;
  readOnly?: boolean;
  compact?: boolean;
  matrices: Record<string, MatrixData>;
  auxTables?: AuxTables;
  inputRef: (el: HTMLInputElement | null) => void;
  onChange: (raw: string) => void;
  onCommit: () => void;
  onEnter: () => void;
  protocolCode?: string | null;
}) {
  const { t } = useI18n();
  const v = scope[cellKey];
  const err = errors[cellKey];
  const range = (cell.kind === 'manual' || cell.kind === 'percent' || cell.kind === 'formula') ? cell.range : null;
  const shouldValidate = v != null && (cell.kind === 'manual' || cell.kind === 'percent' || (cell.kind === 'formula' && formulaDepsFilled(cellKey)));
  const ok = shouldValidate && range ? inRange(v as number, range) : null;
  // v35 — `:dec[n]` en celdas de ENTRADA: el valor confirmado se MUESTRA con los
  // decimales fijados (coherente con el PDF) sin alterar el crudo guardado.
  const [focused, setFocused] = useState(false);

  // Manual / porcentaje: input numérico
  if (cell.kind === 'manual' || cell.kind === 'percent') {
    return (
      <input
        ref={inputRef}
        type="text"
        inputMode="decimal"
        value={focused ? rawValue : fmtInputDisplay(rawValue, cell.decimals)}
        disabled={readOnly}
        onChange={e => onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => { setFocused(false); onCommit(); }}
        onKeyDown={e => {
          if (e.key === 'Enter') {
            e.preventDefault();
            onCommit();
            onEnter();
          }
        }}
        className={cn(
          compact ? 'w-full text-center px-1 py-1 text-xs' : 'w-24 text-center px-2 py-1 text-sm',
          'rounded border focus:outline-none focus:ring-2',
          err ? 'border-danger text-danger focus:ring-danger/30'
          : ok === false ? 'border-danger text-danger focus:ring-danger/30'
          : ok === true ? 'border-success text-success focus:ring-success/30'
          : 'border-border text-textPrimary focus:ring-primary/30 focus:border-primary',
        )}
      />
    );
  }

  // v33 — Ingreso libre: numérico sin rango (entra al scope) o texto libre.
  // Sin validación de intervalo → borde siempre neutral.
  if (cell.kind === 'free' || cell.kind === 'text') {
    const isFree = cell.kind === 'free';
    return (
      <input
        ref={inputRef}
        type="text"
        inputMode={isFree ? 'decimal' : undefined}
        value={isFree && !focused ? fmtInputDisplay(rawValue, cell.decimals) : rawValue}
        disabled={readOnly}
        onChange={e => onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => { setFocused(false); onCommit(); }}
        onKeyDown={e => {
          if (e.key === 'Enter') { e.preventDefault(); onCommit(); onEnter(); }
        }}
        className={cn(
          compact
            ? `w-full text-center px-1 py-1 text-xs`
            : `${isFree ? 'w-24' : 'w-36'} text-center px-2 py-1 text-sm`,
          'rounded border focus:outline-none focus:ring-2',
          err ? 'border-danger text-danger focus:ring-danger/30'
              : 'border-border text-textPrimary focus:ring-primary/30 focus:border-primary',
        )}
      />
    );
  }

  // Celda en blanco intencional: placeholder visual sin input, sin validación.
  if (cell.kind === 'blank') {
    return (
      <span
        className={cn(
          compact ? 'inline-block px-1 py-1 text-xs w-full' : 'inline-block px-2 py-1 text-sm w-24',
          'rounded border border-dashed border-border bg-surface/40',
        )}
        style={{ minHeight: '26px' }}
        aria-hidden="true"
      />
    );
  }

  // Comentario predefinido: dropdown que escribe el texto seleccionado en comments.
  // Visualmente neutral (gris cuando vacío, primary cuando lleno) porque no valida ok/fail.
  if (cell.kind === 'comment') {
    return (
      <select
        value={rawValue}
        disabled={readOnly}
        onChange={e => { onChange(e.target.value); }}
        onBlur={onCommit}
        className={cn(
          compact ? 'w-full text-center px-1 py-1 text-xs' : 'w-24 text-center px-2 py-1 text-sm',
          'rounded border bg-white focus:outline-none focus:ring-2',
          rawValue ? 'border-primary/40 text-textPrimary focus:ring-primary/30'
                   : 'border-border text-textSecondary focus:ring-primary/30 focus:border-primary',
        )}
      >
        <option value="">—</option>
        {cell.options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    );
  }

  // Bool: casilla Sí/No (alterna al click)
  if (cell.kind === 'bool') {
    const val = rawValue.trim();
    return (
      <button
        type="button"
        disabled={readOnly}
        onClick={() => onChange(val === '1' ? '0' : '1')}
        onBlur={onCommit}
        className={cn(
          compact ? 'w-full px-1 py-1 text-xs' : 'w-24 px-2 py-1 text-sm',
          'rounded border font-bold focus:outline-none focus:ring-2 focus:ring-primary/30',
          val === '1' ? 'border-success text-success bg-green-50'
          : val === '0' ? 'border-danger text-danger bg-red-50'
          : 'border-border text-textSecondary bg-white',
        )}
      >
        {val === '1' ? t('numericTable.bool.yes') : val === '0' ? t('numericTable.bool.no') : '—'}
      </button>
    );
  }

  // Fecha / hora: input de texto con validación de formato
  if (cell.kind === 'date' || cell.kind === 'time') {
    const txt = rawValue.trim();
    const valid = txt === '' ? null : (cell.kind === 'date' ? isValidDateText(txt) : isValidTimeText(txt));
    return (
      <input
        ref={inputRef}
        type="text"
        value={rawValue}
        disabled={readOnly}
        placeholder={cell.kind === 'date' ? t('numericTable.placeholder.date') : t('numericTable.placeholder.time')}
        onChange={e => onChange(e.target.value)}
        onBlur={onCommit}
        onKeyDown={e => {
          if (e.key === 'Enter') { e.preventDefault(); onCommit(); onEnter(); }
        }}
        className={cn(
          compact ? 'w-full text-center px-1 py-1 text-xs' : 'w-24 text-center px-2 py-1 text-sm',
          'rounded border focus:outline-none focus:ring-2',
          valid === false ? 'border-danger text-danger focus:ring-danger/30'
          : valid === true ? 'border-success text-success focus:ring-success/30'
          : 'border-border text-textPrimary focus:ring-primary/30 focus:border-primary',
        )}
      />
    );
  }

  // Equipo: código de equipo calibrado (texto, trazabilidad)
  if (cell.kind === 'equipment') {
    return (
      <input
        ref={inputRef}
        type="text"
        value={rawValue}
        disabled={readOnly}
        placeholder={cell.equipType}
        onChange={e => onChange(e.target.value.toUpperCase())}
        onBlur={onCommit}
        onKeyDown={e => {
          if (e.key === 'Enter') { e.preventDefault(); onCommit(); onEnter(); }
        }}
        className={cn(
          compact ? 'w-full text-center px-1 py-1 text-xs' : 'w-24 text-center px-2 py-1 text-sm',
          'rounded border focus:outline-none focus:ring-2',
          rawValue.trim() ? 'border-success text-textPrimary focus:ring-success/30'
          : 'border-border text-textPrimary focus:ring-primary/30 focus:border-primary',
        )}
      />
    );
  }

  // v31 (Parte E) — código correlativo del ensayo, read-only.
  if (cell.kind === 'code') {
    return (
      <span
        className={cn(
          compact ? 'inline-block px-1 py-1 text-xs w-full text-center' : 'inline-block px-2 py-1 text-sm w-24 text-center',
          'rounded bg-navy text-white font-extrabold tracking-wide truncate',
        )}
        title={protocolCode ?? undefined}
      >
        {protocolCode || '—'}
      </span>
    );
  }

  // Val: literal de solo-lectura (p.ej. tamiz fijo)
  if (cell.kind === 'val') {
    return (
      <span
        className={cn(
          compact ? 'inline-block px-1 py-1 text-xs w-full text-center' : 'inline-block px-2 py-1 text-sm w-24 text-center',
          'rounded border border-border bg-surface text-textPrimary font-semibold truncate',
        )}
        title={cell.literal}
      >
        {cell.literal || '—'}
      </span>
    );
  }

  // List: dropdown
  if (cell.kind === 'list') {
    const opts = resolveListOptions(cell.source, matrices, auxTables);
    return (
      <select
        value={rawValue}
        disabled={readOnly}
        onChange={e => { onChange(e.target.value); }}
        onBlur={onCommit}
        className={cn(
          compact ? 'w-full text-center px-1 py-1 text-xs' : 'w-24 text-center px-2 py-1 text-sm',
          'rounded border bg-white focus:outline-none focus:ring-2',
          rawValue ? 'border-success text-success focus:ring-success/30'
                   : 'border-border text-textSecondary focus:ring-primary/30 focus:border-primary',
        )}
      >
        <option value="">—</option>
        {opts.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    );
  }

  // Lookup: read-only con el valor resuelto (texto o número)
  if (cell.kind === 'lookup') {
    const text = textValues[cellKey] ?? '';
    return (
      <span
        className={cn(
          compact ? 'inline-block px-1 py-1 text-xs w-full text-center' : 'inline-block px-2 py-1 text-sm w-24 text-center',
          'rounded border truncate',
          err ? 'border-danger text-danger bg-red-50'
              : text ? 'border-primary/30 text-textPrimary bg-primary/5'
                     : 'border-border text-textSecondary bg-surface',
        )}
        title={err || text || '—'}
      >
        {err ? '⚠' : text || '—'}
      </span>
    );
  }

  // Formula: span read-only con el valor calculado
  return (
    <span className={cn(
      compact ? 'inline-block px-1 py-1 text-xs w-full text-center' : 'inline-block px-2 py-1 text-sm w-24 text-center',
      'rounded border',
      err ? 'border-danger text-danger bg-red-50'
      : ok === false ? 'border-danger text-danger bg-red-50'
      : ok === true ? 'border-success text-success bg-green-50'
      : 'border-border text-textSecondary bg-surface',
    )} title={err || ''}>
      {err ? '⚠' : v == null ? '—' : formatComputed(v, cell.decimals)}
    </span>
  );
}

/** Resuelve las opciones de una lista a partir de la spec y las matrices.
 *  Inline → values directos. matrix-col → toda la col. matrix-range → subset. */
function resolveListOptions(source: ListSource, matrices: Record<string, MatrixData>, auxTables?: AuxTables): string[] {
  if (source.type === 'inline') return source.values;
  // v41 — Tabla auxiliar del proyecto: columna por NOMBRE.
  if (source.type === 'project-table') {
    const t = auxTables?.[source.tableKey];
    if (!t) return [];
    const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
    const idx = t.columns.findIndex(c => norm(c) === norm(source.column));
    if (idx < 0) return [];
    return t.rows.map(r => r[idx] ?? '').filter(v => v !== '');
  }
  const matrix = matrices[source.matrixId];
  if (!matrix) return [];
  const colIdx = source.col.charCodeAt(0) - 65;
  const colVals = (rows: typeof matrix.rows) => rows.map(r => r[colIdx] ?? '').filter(v => v !== '');
  if (source.type === 'matrix-col') return colVals(matrix.rows);
  // matrix-range: filas 1-based en source.fromRow..source.toRow sobre las filas
  // ORIGINALES; recortar PRIMERO y luego limpiar vacíos (filtrar antes desalinea
  // el rango si la columna tiene huecos).
  const from = Math.max(0, source.fromRow - 1);
  const to = Math.min(matrix.rows.length, source.toRow);
  return colVals(matrix.rows.slice(from, to));
}
