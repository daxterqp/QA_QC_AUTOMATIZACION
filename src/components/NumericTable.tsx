import React, { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { View, Text, TextInput, StyleSheet, TouchableOpacity, ScrollView, Modal, FlatList, Dimensions } from 'react-native';
import { SvgXml } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { renderChartSvg } from '@utils/chartRenderer';
import { Colors, Radius, Shadow } from '../theme/colors';
import {
  parseNumericRow, parseNumeric, inRange,
  splitRowComments, joinRowComments, colLetter, scopeKeyFor, formatComputed,
  extractMatrices, groupIntoSections, isValidDateText, isValidTimeText, deriveAxisTitles,
  type NumericRowSpec, type NumericCellSpec, type NumericHeaderSpec, type MatrixData, type ListSource,
  type NumericSectionGroup,
} from '@utils/numericProtocol';
import { resolveScopeCells, extractRefs, type ScopeCell, type Scope, type AuxTables, type XrefValues } from '@utils/formulaEval';
import { resolveXrefs, scanXrefs } from '@services/XrefResolver';
import { searchRecentProtocols, type RecentProtocol } from '@services/ProtocolSearchService';
import { resolvePreset, type GroupingContext } from '@services/ProtocolGroupingService';
import type { GroupingPreset } from '@utils/featureFlags';
import { SHOW_DEV_TOOLS } from '../config/devFlags';
import { useI18n, tx } from '@i18n/index';

interface Item {
  id: string;
  partida_item: string | null;
  item_description: string;
  validation_method: string | null;
  comments: string | null;
  /** Agrupación visual: cuando hay ≥2 secciones distintas se pintan bandas. */
  section?: string | null;
}

interface Props {
  items: Item[];
  readOnly?: boolean;
  /** Llamado al cambiar el valor de una fila. Persiste comments + isCompliant + hasAnswer. */
  onChangeManual?: (input: { itemId: string; comments: string; isCompliant: boolean | null; hasAnswer: boolean }) => void;
  /** Modo "congelado" para protocolos históricos/locked. Cuando true:
   *  - No se evalúan fórmulas ni lookups live.
   *  - scope/textValues se leen DIRECTO de `item.comments` celda a celda.
   *  - Implica readOnly automáticamente. */
  frozen?: boolean;
  /** A4 — Avisa al contenedor qué celda tomó el foco (para desplazarla por
   *  encima del teclado). Recibe el ref del TextInput enfocado. */
  onFocusCell?: (el: TextInput | null) => void;
  /** v31 (Parte E) — código correlativo del protocolo, para celdas `codigo-[]`. */
  protocolCode?: string | null;
  /** v41 — Tablas auxiliares del proyecto (taras, moldes…) para `BUSCAR()`. */
  auxTables?: AuxTables;
  /** v42 — Proyecto del ensayo, para resolver llamados entre ensayos `@código.celda`
   *  en VIVO (lee de la base local). En modo `frozen` no se usa (lee de comments). */
  projectId?: string;
  /** v43.1 — Escala del ancho de celdas (zoom). <1 = celdas más angostas → más
   *  columnas visibles usando todo el ancho (zoom out del Audit, sin bordes blancos). */
  cellScale?: number;
  /** v45.3 — Agrupamientos (presets) de este tipo de ficha (aparecen arriba del picker). */
  groupingPresets?: GroupingPreset[];
  /** v45.3 — Contexto del ensayo actual para resolver presets relativos. */
  groupingContext?: GroupingContext;
}

/** Kinds de celda que el usuario llena directamente (tienen valor local editable). */
function isUserInputKind(k: NumericCellSpec['kind']): boolean {
  return k === 'manual' || k === 'list' || k === 'comment'
      || k === 'percent' || k === 'bool' || k === 'date' || k === 'time' || k === 'equipment'
      || k === 'free' || k === 'text' || k === 'xref';   // v45 — xref guarda el/los código(s) elegido(s)
}

/** El separador posicional de celdas es `//`. Un valor de usuario que lo
 *  contenga (p.ej. un código de equipo "A//B") rompería el alineamiento de
 *  TODAS las celdas de la fila al deserializar — se colapsa a un solo `/`. */
function sanitizeCellText(raw: string): string {
  return raw.includes('//') ? raw.replace(/\/{2,}/g, '/') : raw;
}

/** Kinds que se escriben con teclado (participan de la navegación Play/Enter). */
function isTypedInputKind(k: NumericCellSpec['kind']): boolean {
  return k === 'manual' || k === 'percent' || k === 'date' || k === 'time' || k === 'equipment'
      || k === 'free' || k === 'text';
}

/** v34 — Fila 100% oculta (`:oculto` en todas sus celdas no-blank): no se
 *  renderiza en la app ni cuenta en la numeración. Sus fórmulas SÍ computan. */
function isRowHidden(spec: Extract<NumericRowSpec, { kind: 'row' }>): boolean {
  return spec.cells.length > 0
    && spec.cells.some(c => c.hidden)
    && spec.cells.every(c => c.hidden || c.kind === 'blank');
}

/** Ancho de celda según el número de columnas de LA SECCIÓN (v34). */
/** v35 — Presentación de celdas de entrada con `:dec[n]`: formatea el valor
 *  confirmado (input no enfocado); el crudo tipeado se conserva en comments. */
function fmtInputDisplay(raw: string, decimals?: number): string {
  if (decimals == null || !raw.trim()) return raw;
  const n = parseNumeric(raw);
  return n == null || !isFinite(n) ? raw : n.toFixed(decimals);
}

function cwFor(mc: number): number {
  // v46.1 — +10% de ancho base en casillas de ingreso (mejor equilibrio nº/columna).
  return mc === 1 ? 86 : mc <= 3 ? 70 : 62;
}

/** Renderiza las celdas de una fila de header (mobile). Cada span ocupa
 *  `(to-from+1) * cellWidth` px. Columnas no cubiertas quedan en blanco. */
function renderHeaderCellsMobile(hr: NumericHeaderSpec, maxCols: number, cellWidth: number) {
  const out: React.ReactNode[] = [];
  let i = 0;
  while (i < maxCols) {
    const span = hr.spans.find(s => s.from === i);
    if (span) {
      const realTo = Math.min(span.to, maxCols - 1);
      const colCount = realTo - i + 1;
      out.push(
        <View key={i} style={{ width: colCount * cellWidth, paddingVertical: 3, paddingHorizontal: 2, justifyContent: 'center', alignItems: 'center', borderLeftWidth: 1, borderLeftColor: 'rgba(255,255,255,0.2)' }}>
          {/* M3 — texto COMPLETO con word-wrap (sin "…"); la fila crece si hace falta */}
          <Text style={{ color: '#fff', fontSize: 9, fontWeight: '700', textAlign: 'center' }}>{span.title}</Text>
        </View>
      );
      i = realTo + 1;
    } else {
      out.push(<View key={i} style={{ width: cellWidth, borderLeftWidth: 1, borderLeftColor: 'rgba(255,255,255,0.2)' }} />);
      i++;
    }
  }
  return out;
}

/** Tabla unificada para protocolos numéricos en móvil. Soporta filas multi-celda
 *  con `//`, etiquetadas A, B, C, … La tabla scrollea horizontal si hay más de
 *  una columna para mantener la metáfora Excel sin romper la legibilidad. */
export default function NumericTable({ items, readOnly: readOnlyProp, onChangeManual, frozen, onFocusCell, protocolCode, auxTables, projectId, cellScale, groupingPresets, groupingContext }: Props) {
  const { t } = useI18n();
  const readOnly = readOnlyProp || frozen;
  // v43.1 — Escala de ancho de celda (zoom out del Audit ensancha la visibilidad de
  // la tabla mostrando más columnas en el ancho de pantalla, sin bordes blancos).
  const cw = (mc: number) => Math.max(38, Math.round(cwFor(mc) * (cellScale ?? 1)));
  // v46.1 — Al ALEJAR (zoom out, cellScale<1) la LETRA se reduce proporcionalmente para
  // que el número no se amontone en la celda angosta. No se agranda más allá de 1 (el
  // zoom in ensancha la celda, no agranda el texto). Piso 0.6 para que siga legible.
  const fontScale = Math.max(0.6, Math.min(1, cellScale ?? 1));
  const fs = (base: number) => Math.round(base * fontScale * 10) / 10;
  // Estilo de fuente escalado que se aplica a inputs y textos calculados de celda.
  const dynFont = { fontSize: fs(11) };
  // v45.1 — Layout especial para secciones con celdas xref SELECTORAS (select/self):
  //  · columna "Valor" a un ancho MODERADO (~116) — el código (PRV5-260011) cabe centrado
  //    y compacto sin desbordar la pantalla.
  //  · columna "Actividad" un poco más angosta para que el conjunto quepa y la celda de
  //    valor quede centrada/visible (el texto de actividad ajusta en más líneas).
  const sectionHasXrefSel = (sec: { rows: { spec: NumericRowSpec | null }[] }) =>
    sec.rows.some(r => r.spec?.kind === 'row'
      && r.spec.cells.some(c => c.kind === 'xref' && (c as any).mode !== 'get'));
  const secCwOf = (sec: { maxCols: number; rows: { spec: NumericRowSpec | null }[] }) => {
    const base = cw(sec.maxCols);
    return sectionHasXrefSel(sec) ? Math.max(base, Math.round(116 * (cellScale ?? 1))) : base;
  };
  const secActWOf = (sec: { rows: { spec: NumericRowSpec | null }[] }) =>
    sectionHasXrefSel(sec) ? Math.min(actW, Math.round(150 * (cellScale ?? 1))) : actW;

  // v42 — Llamados entre ensayos `@código.celda` resueltos EN VIVO desde la base
  // local (solo cuando NO está congelado; el modo frozen lee de comments). Degrada
  // solo: pendiente/ambiguo → null. No bloquea el render (resuelve async a estado).
  const [xrefValues, setXrefValues] = useState<XrefValues>({});
  // Firma ESTABLE del conjunto de llamados: solo cambia si cambian las fórmulas
  // (no en cada tecleo/commit, que crea un nuevo array `items`). Evita re-consultar
  // la base en cada edición de celda.
  // v45 — incluye `comments`: el scan también detecta el código elegido en celdas
  // `xref`, así la firma cambia (y se re-resuelve) al confirmar un código nuevo.
  const xrefSig = useMemo(
    () => (frozen ? '' : scanXrefs(items.map(it => ({ validation_method: it.validation_method, comments: it.comments, partida_item: it.partida_item }))).map(r => `${r.code}.${r.key}`).sort().join('|')),
    [frozen, items],
  );
  useEffect(() => {
    if (!projectId || xrefSig === '') { setXrefValues({}); return; }
    let cancelled = false;
    // `items` (closure) solo se usa para re-escanear refs (== xrefSig); los valores
    // vienen de la base, así que una referencia "vieja" de items no afecta.
    resolveXrefs(projectId, items.map(it => ({ validation_method: it.validation_method, comments: it.comments, partida_item: it.partida_item })))
      .then(r => { if (!cancelled) setXrefValues(r.values); })
      .catch(() => { if (!cancelled) setXrefValues({}); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, xrefSig]);
  const parsedRows = useMemo(() => items.map(it => ({
    item: it,
    spec: parseNumericRow(it.validation_method),
  })), [items]);

  // v34 — Las matrices se extraen primero; los headers `col-[…]` pueden aparecer
  // al inicio de CADA sección (Mejora 1: columnas variables por sección).
  const { mainRows, matrices } = useMemo(() => extractMatrices(parsedRows), [parsedRows]);
  const sections = useMemo(() => groupIntoSections(mainRows), [mainRows]);
  const allHeaderRows = useMemo(() => sections.flatMap(sec => sec.headerRows), [sections]);
  // v42e (I4) — `maxCols`/`maxStripW` globales eran residuo de antes de v42b (ancho
  // por sección). Estaban computados en cada render y NO se usaban; eliminados para
  // no sugerir falsamente una alineación a ancho global.

  // Ancho de la columna "Actividad": se PEGA al contenido (texto de actividad
  // más largo) cuando es chico, pero con TOPE cuando es largo (no debe robar
  // toda la pantalla; la tabla scrollea si hace falta). Aplica en llenado y audit.
  const actW = useMemo(() => {
    let longest = 8;
    for (const r of mainRows) {
      const len = ((r.item as { item_description?: string })?.item_description ?? '').length;
      if (len > longest) longest = len;
    }
    const contentW = 18 + longest * 7;   // ancho aproximado del texto
    return Math.round(Math.max(110, Math.min(205, contentW)) * (cellScale ?? 1));
  }, [mainRows, cellScale]);

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

  // Sync incremental: solo inicializa keys nuevas, preserva las en edición.
  const [localValues, setLocalValues] = useState<Record<string, string>>({});
  // v42c — fuerza el recálculo/re-render de los gráficos (botón "Recargar gráfico").
  const [chartNonce, setChartNonce] = useState(0);
  // Celda con el teclado activo (para resaltarla con borde primary).
  const [focusedKey, setFocusedKey] = useState<string | null>(null);
  // Bandas de sección: cuando hay más de una sección visual.
  const showSectionBands = sections.length > 1;

  useEffect(() => {
    setLocalValues(prev => {
      const next: Record<string, string> = {};
      let changed = false;
      for (const { item, spec } of mainRows) {
        if (spec?.kind !== 'row') continue;
        const cellVals = splitRowComments(item.comments, spec.cells.length);
        for (let i = 0; i < spec.cells.length; i++) {
          const ck = spec.cells[i].kind;
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

  const { scope, errors, textValues } = useMemo(() => {
    if (frozen) {
      // Modo frozen: cada celda lee su valor directamente del snapshot en comments[i].
      const scope: Scope = {};
      const textValues: Record<string, string> = {};
      for (const { item, spec } of mainRows) {
        if (spec?.kind !== 'row') continue;
        const partida = item.partida_item ?? '';
        const cellVals = splitRowComments(item.comments, spec.cells.length);
        for (let i = 0; i < spec.cells.length; i++) {
          const cell = spec.cells[i];
          const key = scopeKeyFor(partida, i);
          // v46.1 — RETENCIÓN de gráficos: las celdas `val` (literales, p. ej. aberturas
          // de tamiz en el eje X de la curva granulométrica) NO viven en comments → su
          // valor debe leerse del literal del spec. Sin esto, un gráfico con eje val que
          // SÍ se ve en el llenado/PDF desaparecía en el Audit (scope null). El resto lee
          // su valor congelado de comments[i].
          const raw = cell.kind === 'val' ? (cell.literal ?? '') : (cellVals[i] ?? '');
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
          // Texto que no coerce a número → queda solo en textValues (scope null).
          cells.push({ key, kind: 'list', raw: localValues[localKey] ?? cellVals[i] ?? '' });
        } else if (cell.kind === 'lookup') {
          cells.push({ key, kind: 'lookup', refKey: cell.refKey, matrixId: cell.matrixId, searchCol: cell.searchCol, returnCol: cell.returnCol });
        } else if (cell.kind === 'formula') {
          cells.push({ key, kind: 'formula', expr: cell.expr });
        } else if (cell.kind === 'xref') {
          // v45 — llamada a otra ficha. select/self: el `raw` guarda el CÓDIGO elegido.
          // get: el código se toma de la celda selectora (sourceRef) en resolveScopeCells;
          // `op` define la operación (agg/pick/interp).
          cells.push({ key, kind: 'xref', targetKey: cell.targetKey, sourceRef: cell.sourceRef, op: cell.op, raw: localValues[localKey] ?? cellVals[i] ?? '' });
        } else if (cell.kind === 'val') {
          // Literal de solo-lectura: lo exponemos como 'manual' fijo para que
          // las fórmulas que referencien esta celda (#1A, etc.) lo resuelvan.
          cells.push({ key, kind: 'manual', raw: cell.literal });
        }
      }
    }
    return resolveScopeCells(cells, matrices, xrefValues, auxTables);
  }, [frozen, mainRows, localValues, matrices, auxTables, xrefValues]);

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
        try { map[key] = extractRefs(cell.expr, { currentKey: key, allKeys }); } catch { /* ignore */ }
      }
    }
    return map;
  }, [mainRows]);

  const formulaDepsFilled = useCallback((key: string): boolean => {
    const deps = formulaRefsByKey[key];
    if (!deps) return false;
    return deps.every(d => scope[d] != null);
  }, [formulaRefsByKey, scope]);

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
        // Ingreso libre (numérico sin rango / texto): persiste y cuenta como
        // llenado, pero NO valida rango ni afecta la conformidad (anyChecked).
        hasAnyInput = true;
        const raw = sanitizeCellText((values[`${itemId}:${L}`] ?? '').trim());
        cellVals.push(raw);
        if (raw === '') allInputsFilled = false;
      } else if (cell.kind === 'comment') {
        // Comentario predefinido: persiste el texto, NO afecta ok/fail.
        const raw = sanitizeCellText((values[`${itemId}:${L}`] ?? '').trim());
        cellVals.push(raw);
      } else if (cell.kind === 'xref') {
        // v45 — `get` se deriva (no se ingresa) → no persiste ni cuenta como input.
        // select/self: persiste el CÓDIGO elegido TAL CUAL (no sanitizar: lleva guiones
        // y letras, p. ej. "PRV5-260001"). De aquí lo lee scanXrefs para resolver el valor.
        if (cell.mode === 'get') {
          cellVals.push('');
        } else {
          hasAnyInput = true;
          const raw = (values[`${itemId}:${L}`] ?? '').trim();
          cellVals.push(raw);
          if (raw === '') allInputsFilled = false;
        }
      } else {
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

  // ── Navegación Play / Enter ────────────────────────────────────────────
  const inputRefs = useRef<Record<string, TextInput | null>>({});

  // Estado del picker de listas (modal con opciones) y del modal "Ver tablas"
  const [listPicker, setListPicker] = useState<{
    inputKey: string;
    options: string[];
    itemId: string;
    spec: Extract<NumericRowSpec, { kind: 'row' }>;
  } | null>(null);
  const [pickerSearch, setPickerSearch] = useState(''); // v41 — buscador del modal de selección
  // v45 — picker de "llamada a otra ficha" (autocompletado del código).
  const [xrefPicker, setXrefPicker] = useState<{
    inputKey: string;
    itemId: string;
    spec: Extract<NumericRowSpec, { kind: 'row' }>;
    tipo?: string;
    targetKey?: string;
    multi?: boolean;
  } | null>(null);
  const [xrefResults, setXrefResults] = useState<RecentProtocol[]>([]);
  const [xrefSearch, setXrefSearch] = useState('');
  useEffect(() => {
    if (!xrefPicker || !projectId) { setXrefResults([]); return; }
    let cancelled = false;
    searchRecentProtocols(projectId, { tipo: xrefPicker.tipo, codePrefix: xrefSearch, limit: 10 })
      .then(r => { if (!cancelled) setXrefResults(r); })
      .catch(() => { if (!cancelled) setXrefResults([]); });
    return () => { cancelled = true; };
  }, [xrefPicker, projectId, xrefSearch]);
  const matrixList = useMemo(() => Object.values(matrices), [matrices]);
  const [showMatricesModal, setShowMatricesModal] = useState(false);

  const manualOrder = useMemo(() => {
    // SOLO kinds tipeables (TextInput con ref): bool es TouchableOpacity y
    // list/comment abren un picker — focusKey() sobre ellos no hace nada y la
    // navegación Enter/Play se quedaba atascada en silencio.
    const out: { inputKey: string }[] = [];
    for (const { item, spec } of mainRows) {
      if (spec?.kind !== 'row') continue;
      for (let i = 0; i < spec.cells.length; i++) {
        const ck = spec.cells[i].kind;
        if (!isTypedInputKind(ck)) continue;
        out.push({ inputKey: `${item.id}:${colLetter(i)}` });
      }
    }
    return out;
  }, [mainRows]);

  const nextEmptyKey = useCallback((afterKey?: string): string | null => {
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

  const focusKey = useCallback((k: string | null) => {
    if (!k) return;
    inputRefs.current[k]?.focus();
  }, []);

  const startPlay = useCallback(() => focusKey(nextEmptyKey()), [focusKey, nextEmptyKey]);

  // ── Herramienta de desarrollo (solo __DEV__): autollenado ────────────────
  // Rellena TODAS las celdas de ingreso con valores plausibles dentro de su rango
  // (mid-band + ruido), listas/fechas/horas válidas, etc., y commitea cada fila para
  // que las fórmulas/lookup recalculen. Sirve para verificar/debuggear el módulo
  // (PDF, audit, resumen, gráficos) sin teclear un ensayo completo a mano.
  const devAutoFill = useCallback(() => {
    if (!onChangeManual) return;
    const updated: Record<string, string> = { ...localValues };
    for (const { item, spec } of mainRows) {
      if (spec?.kind !== 'row') continue;
      const descNorm = devNorm(item.item_description ?? '');
      for (let i = 0; i < spec.cells.length; i++) {
        const v = devGenCellValue(spec.cells[i], i, descNorm, matrices, auxTables);
        if (v != null) updated[`${item.id}:${colLetter(i)}`] = v;
      }
    }
    setLocalValues(updated);
    for (const { item, spec } of mainRows) {
      if (spec?.kind === 'row') commitRow(item.id, spec, updated);
    }
  }, [onChangeManual, localValues, mainRows, matrices, auxTables, commitRow]);


  // v45.1 — Cierra el picker xref y COMMITEA una sola vez el set seleccionado (lo que
  // hay en localValues). Así el cálculo/resolución corre UNA vez al terminar (al pulsar
  // "Listo" o tocar fuera), no en cada toque. commitRow sin override usa localValues.
  const finishXrefPicker = useCallback(() => {
    if (xrefPicker) commitRow(xrefPicker.itemId, xrefPicker.spec);
    setXrefPicker(null);
    setXrefSearch('');
  }, [xrefPicker, commitRow]);

  // ── Render ─────────────────────────────────────────────────────────────
  // v34 — La tabla se compone por SECCIONES: cada una con su propia fila de
  // encabezados `col-[…]`, su número de columnas y su fila de letras. El ✓ se
  // mantiene alineado a la derecha con un spacer según la sección más ancha.
  const renderSectionHeader = (sec: NumericSectionGroup<(typeof mainRows)[number]>, sIdx: number) => {
    const secCw = secCwOf(sec);
    const actW = secActWOf(sec);   // v45.1 — actividad más angosta en secciones con selector xref
    const stripW = sec.maxCols * secCw;
    // v42b — Cada sección/procedimiento usa SU PROPIO ancho (no se rellena al
    // máximo global). Antes `maxStripW - stripW` propagaba el ancho de la sección
    // más ancha a todas (las de 1 valor reservaban columnas fantasma).
    const spacerW = 0;
    // A1 — la norma ya NO se muestra (el DSL `:norma[]` sigue parseando por compat).
    // v32 — La cabecera "# / Actividad / ✓" ya NO es una barra global: vive en
    // CADA sección (debajo de su título), con "#" y "Actividad" centrados
    // VERTICALMENTE respecto a las filas de encabezados + letras de la derecha.
    return (
      <React.Fragment key={`sh-${sIdx}`}>
        {showSectionBands && sec.title ? (
          <View style={styles.sectionBand}>
            <Text style={styles.sectionBandText}>{sec.title}</Text>
            <Text style={styles.sectionBandCols}>{sec.maxCols} {sec.maxCols !== 1 ? t('numericTable.section.cols.other') : t('numericTable.section.cols.one')}</Text>
          </View>
        ) : null}
        <View style={{ flexDirection: 'row', alignItems: 'stretch' }}>
          <View style={[styles.thCellTall, { width: 32, justifyContent: 'center', alignItems: 'center' }]}>
            <Text style={styles.th}>#</Text>
          </View>
          <View style={[styles.thCellTall, { width: actW, justifyContent: 'center', paddingHorizontal: 4 }]}>
            <Text style={styles.th}>{t('numericTable.header.activity')}</Text>
          </View>
          <View style={{ flexDirection: 'column', width: stripW }}>
            {sec.headerRows.map((hr, lvl) => (
              <View key={lvl} style={{ flexDirection: 'row', backgroundColor: lvl === 0 ? Colors.navy : '#324a6d' }}>
                {renderHeaderCellsMobile(hr, sec.maxCols, secCw)}
              </View>
            ))}
            <View style={{ flexDirection: 'row', backgroundColor: '#6b7280', flexGrow: 1, alignItems: 'center' }}>
              {Array.from({ length: sec.maxCols }, (_, i) => (
                <View key={i} style={{ width: secCw, alignItems: 'center', paddingVertical: 3, borderLeftWidth: i > 0 ? 1 : 0, borderLeftColor: 'rgba(255,255,255,0.25)' }}>
                  <Text style={styles.th}>{sec.maxCols === 1 ? t('numericTable.header.value') : colLetter(i)}</Text>
                </View>
              ))}
            </View>
          </View>
          {spacerW > 0 && <View style={[styles.thCellTall, { width: spacerW }]} />}
          <View style={[styles.thCellTall, { width: 28, justifyContent: 'center', alignItems: 'center' }]}>
            <Text style={styles.th}>✓</Text>
          </View>
        </View>
      </React.Fragment>
    );
  };

  const TableContent = (
    <View style={styles.table}>
      {/* Herramienta de desarrollo: botón de autollenado. Visible en dev (__DEV__) o
          cuando SHOW_DEV_TOOLS está activo (APK de pruebas standalone). */}
      {(__DEV__ || SHOW_DEV_TOOLS) && !readOnly && onChangeManual ? (
        <TouchableOpacity onPress={devAutoFill} style={styles.devFillBtn} activeOpacity={0.7}>
          <Ionicons name="flask-outline" size={14} color="#b45309" />
          <Text style={styles.devFillText}>{t('numericTable.devFill')}</Text>
        </TouchableOpacity>
      ) : null}
      {/* v32 — Sin barra superior global: la cabecera #/Actividad/✓ vive en
          CADA sección (renderSectionHeader), debajo del título de la sección. */}
      {sections.map((sec, sIdx) => {
        const secCw = secCwOf(sec);
        const actW = secActWOf(sec);   // v45.1 — actividad más angosta en secciones con selector xref
        const secStripW = sec.maxCols * secCw;
        const secSpacerW = 0;   // v42b — ancho propio por sección (sin relleno al global)
        return (
          <React.Fragment key={`sec-${sIdx}`}>
            {renderSectionHeader(sec, sIdx)}
            {sec.rows.map(({ item: it, spec }) => {
        if (!spec) return null;
        if (spec.kind === 'header' || spec.kind === 'matrix-header' || spec.kind === 'matrix-data' || spec.kind === 'repeat-directive') return null;
        if (spec.kind === 'row' && isRowHidden(spec)) return null;   // v34 — fila de cálculo oculta
        const idx = (displayIdx.get(it.id) ?? 1) - 1;
        const altBg = idx % 2 === 1 ? { backgroundColor: '#fafbfd' } : null;
        const partida = it.partida_item ?? '';

        if (spec.kind === 'graph') {
          // Gráfico nativo: mismo renderer SVG que la web (chartRenderer), pintado
          // con <SvgXml>. renderChartSvg ya devuelve un placeholder SVG si faltan datos.
          // -48: 12px de padding del contenedor + 12px del wrap, por lado.
          // A10 — el gráfico no debe ensanchar la tabla: tope = ancho de la tabla
          // (32 + 105 + zona de valores + 28) menos el padding del graphRow (16).
          const tableW = 60 + actW + secStripW - 16; // 60 = # (32) + ✓ (28); v42b: ancho de SU sección
          // v32 — márgenes laterales mínimos en el fill numérico: -20 (antes -48)
          const chartW = Math.max(280, Math.min(Dimensions.get('window').width - 20, 520, Math.max(280, tableW)));
          const chartH = Math.round(chartW * ((spec.aspectPct ?? 62) / 100));
          // v33 — Títulos de eje garantizados: si el spec no trae xt:/yt:, se
          // derivan de los encabezados de columna ("Tamaño (mm)", "% Pasa").
          const axisTitles = deriveAxisTitles(spec, allHeaderRows);
          const svg = renderChartSvg(
            {
              mode: spec.mode,
              xRefs: spec.xRefs,
              yRefs: spec.yRefs,
              title: spec.title,
              xAxisTitle: axisTitles.xAxisTitle,
              yAxisTitle: axisTitles.yAxisTitle,
              y2Refs: spec.y2Refs,
              y3Refs: spec.y3Refs,
              seriesLabels: spec.seriesLabels,
              bandLoRefs: spec.bandLoRefs,
              bandHiRefs: spec.bandHiRefs,
              fit: spec.fit,
            },
            scope,
            { width: chartW, height: chartH },
          );
          return (
            <View key={it.id} style={[styles.graphRow, altBg]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'stretch', paddingHorizontal: 8 }}>
                <Text style={styles.graphTitle}>{idx + 1}.{spec.title ? '' : ` ${it.item_description}`}</Text>
                {/* v42c — botón Recargar JUNTO al número (no a la derecha). */}
                <TouchableOpacity onPress={() => setChartNonce(n => n + 1)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 3, paddingHorizontal: 8, borderWidth: 1, borderColor: Colors.primary, borderRadius: Radius.sm }}>
                  <Ionicons name="refresh" size={13} color={Colors.primary} />
                  <Text style={{ color: Colors.primary, fontSize: 11, fontWeight: '700' }}>{t('numericTable.chart.reload')}</Text>
                </TouchableOpacity>
              </View>
              <SvgXml key={`${it.id}-${chartNonce}`} xml={svg} width={chartW} height={chartH} />
            </View>
          );
        }

        const cellVals = splitRowComments(it.comments, spec.cells.length);

        // Estado fila
        let okCount = 0, failCount = 0, pending = 0;
        for (let i = 0; i < spec.cells.length; i++) {
          const c = spec.cells[i];
          const key = scopeKeyFor(partida, i);
          const v = scope[key];
          const txt = textValues[key];
          if (c.hidden) continue;   // v34 — celdas ocultas no afectan el estado
          if (errors[key]) { failCount++; continue; }
          if (c.kind === 'comment' || c.kind === 'blank' || c.kind === 'val' || c.kind === 'free' || c.kind === 'text') continue; // No afectan el estado (libres/auxiliares)
          if (c.kind === 'list' || c.kind === 'lookup' || c.kind === 'bool' || c.kind === 'equipment') {
            if (txt) okCount++; else pending++;
            continue;
          }
          if (c.kind === 'date' || c.kind === 'time') {
            if (!txt) { pending++; continue; }
            const valid = c.kind === 'date' ? isValidDateText(txt) : isValidTimeText(txt);
            valid ? okCount++ : failCount++;
            continue;
          }
          if (c.kind === 'xref') {
            // v45 — selector puro no afecta estado; self/get cuentan ok si traen valor.
            if (c.mode === 'select') continue;
            v != null ? okCount++ : pending++;
            continue;
          }
          if (v == null) { pending++; continue; }
          if (c.kind === 'manual' || c.kind === 'percent') {
            inRange(v, c.range) ? okCount++ : failCount++;
          } else if (c.kind === 'formula' && c.range) {
            if (formulaDepsFilled(key)) inRange(v, c.range) ? okCount++ : failCount++;
            else pending++;
          }
        }
        const rowStatus: 'ok' | 'fail' | null = failCount > 0 ? 'fail' : (okCount > 0 && pending === 0 ? 'ok' : null);

        return (
          <View key={it.id} style={[styles.row, altBg]}>
            <View style={{ width: 32, alignItems: 'center' }}>
              {/* A7 — solo el número visible; la partida interna NO se muestra */}
              <Text style={{ fontSize: 12, color: Colors.primary, fontWeight: '700' }}>{idx + 1}</Text>
            </View>
            <Text style={[styles.td, { width: actW }]}>{it.item_description}</Text>

            {Array.from({ length: sec.maxCols }, (_, i) => {
              const cell = spec.cells[i];
              const L = colLetter(i);
              const cellWidth = secCw;
              if (!cell) return <View key={i} style={{ width: cellWidth }} />;
              if (cell.hidden) return <View key={i} style={{ width: cellWidth }} />;   // v34 — celda de cálculo oculta
              const inputKey = `${it.id}:${L}`;
              const cellKey = scopeKeyFor(partida, i);
              const v = scope[cellKey];
              const err = errors[cellKey];
              const range = (cell.kind === 'manual' || cell.kind === 'percent' || cell.kind === 'formula') ? cell.range : null;
              const shouldValidate = v != null && (cell.kind === 'manual' || cell.kind === 'percent' || (cell.kind === 'formula' && formulaDepsFilled(cellKey)));
              const ok = shouldValidate && range ? inRange(v as number, range) : null;
              // v45.1 — el ancho extra de las celdas selectoras ahora vive en secCw (toda
              // la columna), así encabezado y celdas alinean. La celda usa el ancho de columna.
              const wrapW = cellWidth;
              return (
                <View key={i} style={{ width: wrapW, alignItems: 'center', paddingHorizontal: 2 }}>
                  {cell.kind === 'manual' || cell.kind === 'percent' ? (
                    <TextInput
                      ref={el => { inputRefs.current[inputKey] = el; }}
                      style={[
                        styles.input, dynFont,
                        { width: cellWidth - 8 },
                        focusedKey === inputKey ? styles.inputFocused : null,
                        err || ok === false ? styles.inputBad : ok === true ? styles.inputOk : null,
                      ]}
                      value={focusedKey === inputKey ? (localValues[inputKey] ?? '') : fmtInputDisplay(localValues[inputKey] ?? '', cell.decimals)}
                      onChangeText={t => setLocalValues(prev => ({ ...prev, [inputKey]: t }))}
                      onFocus={() => { setFocusedKey(inputKey); onFocusCell?.(inputRefs.current[inputKey]); }}
                      onBlur={() => { setFocusedKey(null); commitRow(it.id, spec); }}
                      keyboardType="decimal-pad"
                      editable={!readOnly}
                      placeholder="—"
                      placeholderTextColor="#bbb"
                      // v42c — números largos (>5 díg.) continúan en una 2ª línea, igual
                      // que las celdas calculadas. El teclado decimal no tiene Enter, así
                      // que multiline no afecta la navegación (que va por la barra Play).
                      multiline
                      numberOfLines={2}
                    />
                  ) : cell.kind === 'free' || cell.kind === 'text' ? (
                    // v33 — ingreso libre: numérico sin rango / texto. Sin validación → borde neutral.
                    <TextInput
                      ref={el => { inputRefs.current[inputKey] = el; }}
                      style={[
                        styles.input, dynFont,
                        { width: cellWidth - 8, textAlign: 'center' },
                        focusedKey === inputKey ? styles.inputFocused : null,
                      ]}
                      value={cell.kind === 'free' && focusedKey !== inputKey
                        ? fmtInputDisplay(localValues[inputKey] ?? '', cell.decimals)
                        : (localValues[inputKey] ?? '')}
                      onChangeText={t => setLocalValues(prev => ({ ...prev, [inputKey]: t }))}
                      onFocus={() => { setFocusedKey(inputKey); onFocusCell?.(inputRefs.current[inputKey]); }}
                      onBlur={() => { setFocusedKey(null); commitRow(it.id, spec); }}
                      returnKeyType="next"
                      blurOnSubmit={false}
                      onSubmitEditing={() => {
                        commitRow(it.id, spec);
                        const nxt = nextEmptyKey(inputKey);
                        if (nxt) focusKey(nxt);
                      }}
                      keyboardType={cell.kind === 'free' ? 'decimal-pad' : 'default'}
                      editable={!readOnly}
                      placeholder={cell.kind === 'free' ? '—' : t('numericTable.placeholder.text')}
                      placeholderTextColor="#bbb"
                      multiline
                      numberOfLines={2}
                    />
                  ) : cell.kind === 'bool' ? (
                    // Casilla Sí/No: alterna vacío → Sí ("1") → No ("0") → Sí …
                    <TouchableOpacity
                      style={[
                        styles.computed,
                        { width: cellWidth - 8 },
                        (localValues[inputKey] ?? '') === '1' ? { backgroundColor: '#e8f5ee', borderColor: Colors.success }
                          : (localValues[inputKey] ?? '') === '0' ? { backgroundColor: '#fdecea', borderColor: Colors.danger }
                          : { backgroundColor: Colors.white },
                      ]}
                      disabled={readOnly}
                      onPress={() => {
                        const cur = localValues[inputKey] ?? '';
                        const nxt = cur === '1' ? '0' : '1';
                        const updated = { ...localValues, [inputKey]: nxt };
                        setLocalValues(updated);
                        commitRow(it.id, spec, updated);
                      }}
                    >
                      <Text style={[styles.computedText, dynFont, {
                        color: (localValues[inputKey] ?? '') === '1' ? Colors.success
                          : (localValues[inputKey] ?? '') === '0' ? Colors.danger : Colors.textSecondary,
                        fontWeight: '700',
                      }]} numberOfLines={1}>
                        {(localValues[inputKey] ?? '') === '1' ? t('numericTable.bool.yes') : (localValues[inputKey] ?? '') === '0' ? t('numericTable.bool.no') : '—'}
                      </Text>
                    </TouchableOpacity>
                  ) : cell.kind === 'date' || cell.kind === 'time' ? (
                    <TextInput
                      ref={el => { inputRefs.current[inputKey] = el; }}
                      style={[
                        styles.input, dynFont,
                        { width: cellWidth - 8, fontSize: fs(11) },
                        focusedKey === inputKey ? styles.inputFocused : null,
                        (() => {
                          const t = (localValues[inputKey] ?? '').trim();
                          if (!t) return null;
                          const valid = cell.kind === 'date' ? isValidDateText(t) : isValidTimeText(t);
                          return valid ? styles.inputOk : styles.inputBad;
                        })(),
                      ]}
                      value={localValues[inputKey] ?? ''}
                      onChangeText={t => setLocalValues(prev => ({ ...prev, [inputKey]: t }))}
                      onFocus={() => { setFocusedKey(inputKey); onFocusCell?.(inputRefs.current[inputKey]); }}
                      onBlur={() => { setFocusedKey(null); commitRow(it.id, spec); }}
                      returnKeyType="next"
                      blurOnSubmit={false}
                      onSubmitEditing={() => {
                        commitRow(it.id, spec);
                        const nxt = nextEmptyKey(inputKey);
                        if (nxt) focusKey(nxt);
                      }}
                      keyboardType="numbers-and-punctuation"
                      editable={!readOnly}
                      placeholder={cell.kind === 'date' ? t('numericTable.placeholder.date') : t('numericTable.placeholder.time')}
                      placeholderTextColor="#bbb"
                    />
                  ) : cell.kind === 'equipment' ? (
                    <TextInput
                      ref={el => { inputRefs.current[inputKey] = el; }}
                      style={[
                        styles.input, dynFont,
                        { width: cellWidth - 8, fontSize: fs(11) },
                        focusedKey === inputKey ? styles.inputFocused : null,
                        (localValues[inputKey] ?? '').trim() ? styles.inputOk : null,
                      ]}
                      value={localValues[inputKey] ?? ''}
                      onChangeText={t => setLocalValues(prev => ({ ...prev, [inputKey]: t }))}
                      onFocus={() => { setFocusedKey(inputKey); onFocusCell?.(inputRefs.current[inputKey]); }}
                      onBlur={() => { setFocusedKey(null); commitRow(it.id, spec); }}
                      returnKeyType="next"
                      blurOnSubmit={false}
                      onSubmitEditing={() => {
                        commitRow(it.id, spec);
                        const nxt = nextEmptyKey(inputKey);
                        if (nxt) focusKey(nxt);
                      }}
                      autoCapitalize="characters"
                      editable={!readOnly}
                      placeholder={cell.equipType}
                      placeholderTextColor="#bbb"
                    />
                  ) : cell.kind === 'list' ? (
                    <TouchableOpacity
                      style={[styles.computed, { width: cellWidth - 8, backgroundColor: (localValues[inputKey] ?? '') ? '#e8f5ee' : Colors.white }]}
                      disabled={readOnly}
                      onPress={() => { setPickerSearch(''); setListPicker({ inputKey, options: resolveListOptionsMobile(cell.source, matrices, auxTables), itemId: it.id, spec }); }}
                    >
                      <Text style={[styles.computedText, dynFont, { color: (localValues[inputKey] ?? '') ? Colors.success : Colors.textSecondary }]} numberOfLines={1}>
                        {localValues[inputKey] || '—'}
                      </Text>
                    </TouchableOpacity>
                  ) : cell.kind === 'comment' ? (
                    <TouchableOpacity
                      style={[styles.computed, { width: cellWidth - 8, backgroundColor: (localValues[inputKey] ?? '') ? '#eef2fa' : Colors.white }]}
                      disabled={readOnly}
                      onPress={() => { setPickerSearch(''); setListPicker({ inputKey, options: cell.options, itemId: it.id, spec }); }}
                    >
                      <Text style={[styles.computedText, dynFont, { color: (localValues[inputKey] ?? '') ? Colors.textPrimary : Colors.textSecondary }]} numberOfLines={1}>
                        {localValues[inputKey] || '—'}
                      </Text>
                    </TouchableOpacity>
                  ) : cell.kind === 'lookup' ? (
                    <View style={[
                      styles.computed,
                      { width: cellWidth - 8 },
                      err ? styles.computedBad : (textValues[cellKey] ? { backgroundColor: '#eef2fa', borderColor: Colors.primary } : null),
                    ]}>
                      <Text style={[styles.computedText, dynFont, { color: err ? Colors.danger : (textValues[cellKey] ? Colors.textPrimary : Colors.textSecondary) }]} numberOfLines={1}>
                        {err ? '⚠' : (textValues[cellKey] || '—')}
                      </Text>
                    </View>
                  ) : cell.kind === 'blank' ? (
                    // Celda en blanco intencional: placeholder visual sin input.
                    <View
                      style={[
                        styles.computed,
                        { width: cellWidth - 8, backgroundColor: '#f5f6f8', borderStyle: 'dashed', borderColor: Colors.border },
                      ]}
                    />
                  ) : cell.kind === 'val' ? (
                    // Valor literal de solo-lectura (p.ej. progresiva fija).
                    <View style={[styles.computed, { width: cellWidth - 8, backgroundColor: '#eef1f5' }]}>
                      <Text style={[styles.computedText, dynFont, { color: Colors.textPrimary, fontWeight: '600' }]} numberOfLines={1}>
                        {cell.literal || '—'}
                      </Text>
                    </View>
                  ) : cell.kind === 'code' ? (
                    // v31 (Parte E) — código correlativo del ensayo, read-only.
                    <View style={[styles.computed, { width: cellWidth - 8, backgroundColor: Colors.navy }]}>
                      <Text style={[styles.computedText, dynFont, { color: Colors.white, fontWeight: '800' }]} numberOfLines={1}>
                        {protocolCode || '—'}
                      </Text>
                    </View>
                  ) : cell.kind === 'xref' && cell.mode === 'get' ? (
                    // v45 — celda READ-ONLY: trae el valor del ensayo elegido en su
                    // celda selectora (sourceRef). No se toca; se deriva sola.
                    <View style={[
                      styles.computed,
                      { width: cellWidth - 8 },
                      err ? styles.computedBad : v != null ? styles.computedOk : null,
                    ]}>
                      <Text style={[
                        styles.computedText, dynFont,
                        err ? { color: Colors.danger } : v != null ? { color: Colors.success, fontWeight: '700' } : { color: Colors.textSecondary },
                      ]} numberOfLines={1}>
                        {err ? '⚠' : v == null ? '—' : formatComputed(v, cell.decimals)}
                      </Text>
                    </View>
                  ) : cell.kind === 'xref' ? (
                    // v45 — SELECTOR (select/self): toca para elegir el/los código(s) por
                    // autocompletado. Muestra cada código en su línea (alto variable, no se
                    // corta); `self` además muestra el valor traído debajo.
                    <TouchableOpacity
                      style={[
                        styles.computed,
                        { width: wrapW - 8, justifyContent: 'center', paddingVertical: 5 },
                        err ? styles.computedBad : (localValues[inputKey] ?? cellVals[i] ?? '') ? { backgroundColor: '#eef2fa', borderColor: Colors.primary } : null,
                      ]}
                      disabled={readOnly}
                      onPress={() => setXrefPicker({ inputKey, itemId: it.id, spec, tipo: cell.filter.tipo, targetKey: cell.targetKey, multi: cell.mode === 'select' && !!cell.multi })}
                    >
                      {(() => {
                        const chosen = (localValues[inputKey] ?? cellVals[i] ?? '').trim();
                        if (!chosen) {
                          return <Text style={[styles.computedText, dynFont, { color: Colors.primary, fontWeight: '700', fontSize: 10 }]} numberOfLines={1}>{t('numericTable.xref.choose')}</Text>;
                        }
                        const codes = chosen.split(',').map(s => s.trim()).filter(Boolean);
                        return (
                          <View style={{ alignItems: 'center' }}>
                            {codes.map((cd, k) => (
                              <Text key={k} style={[styles.computedText, dynFont, { color: Colors.primary, fontWeight: '700', fontSize: 8.5, lineHeight: 12 }]} numberOfLines={2}>{cd}</Text>
                            ))}
                            {cell.mode === 'self' ? (
                              <Text style={[styles.computedText, dynFont, { color: err ? Colors.danger : v != null ? Colors.success : Colors.textSecondary, fontWeight: '700', fontSize: 10, marginTop: 1 }]} numberOfLines={1}>
                                {err ? '⚠' : v == null ? '…' : formatComputed(v, cell.decimals)}
                              </Text>
                            ) : null}
                          </View>
                        );
                      })()}
                    </TouchableOpacity>
                  ) : (
                    <View style={[
                      styles.computed,
                      { width: cellWidth - 8 },
                      err || ok === false ? styles.computedBad : ok === true ? styles.computedOk : null,
                    ]}>
                      <Text style={[
                        styles.computedText, dynFont,
                        err || ok === false ? { color: Colors.danger } : ok === true ? { color: Colors.success } : { color: Colors.textSecondary },
                      ]}>
                        {err ? '⚠' : v == null ? '—' : formatComputed(v, cell.decimals)}
                      </Text>
                    </View>
                  )}
                  {/* M2 — Slot SIEMPRE presente bajo el recuadro: la validación no
                      desplaza el input; todas las celdas de la fila quedan a la
                      misma altura. La norma vive arriba, en el encabezado. */}
                  <View style={styles.rangeSlot}>
                    {range ? (
                      <Text style={styles.rangeText} numberOfLines={1}>{`[${range.min}:${range.max}]${cell.kind === 'percent' ? ' %' : ''}`}</Text>
                    ) : null}
                  </View>
                </View>
              );
            })}

            {secSpacerW > 0 && <View style={{ width: secSpacerW }} />}
            <View style={{ width: 28, alignItems: 'center' }}>
              {rowStatus ? (
                <View style={[styles.statusBadge, rowStatus === 'ok' ? styles.statusBadgeOk : styles.statusBadgeFail]}>
                  <Text style={[styles.statusBadgeText, { color: rowStatus === 'ok' ? Colors.success : Colors.danger }]}>
                    {rowStatus === 'ok' ? '✓' : '✗'}
                  </Text>
                </View>
              ) : null}
            </View>
          </View>
        );
            })}
          </React.Fragment>
        );
      })}
    </View>
  );

  return (
    <View style={styles.wrap}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        {!readOnly && manualOrder.length > 0 && (
          <TouchableOpacity onPress={startPlay} style={styles.playBtn}>
            <Ionicons name="play" size={12} color={Colors.white} />
            <Text style={styles.playText}>{t('numericTable.startFill')}</Text>
          </TouchableOpacity>
        )}
        {matrixList.length > 0 && (
          <TouchableOpacity onPress={() => setShowMatricesModal(true)} style={styles.matricesBtn}>
            <Ionicons name="grid" size={14} color={Colors.primary} />
            <Text style={styles.matricesBtnText}>{t('numericTable.viewTables', { count: matrixList.length })}</Text>
          </TouchableOpacity>
        )}
      </View>
      {outOfRangeCount > 0 && (
        <View style={styles.banner}>
          <Ionicons name="alert-circle" size={14} color={Colors.warning} />
          <Text style={styles.bannerText}>{outOfRangeCount !== 1 ? t('numericTable.banner.outOfRange.other', { count: outOfRangeCount }) : t('numericTable.banner.outOfRange.one', { count: outOfRangeCount })}</Text>
        </View>
      )}
      {/* Siempre scrolleable en horizontal: aunque haya 1 sola columna de datos,
          la tabla puede ser más ancha que la pantalla (Actividad + Valor + ✓). */}
      <ScrollView horizontal showsHorizontalScrollIndicator={true}>
        {TableContent}
      </ScrollView>

      {/* Modal picker para celdas tipo list */}
      <Modal visible={listPicker !== null} transparent animationType="fade" onRequestClose={() => setListPicker(null)}>
        <TouchableOpacity style={styles.pickerOverlay} activeOpacity={1} onPress={() => setListPicker(null)}>
          <View style={styles.pickerModal} onStartShouldSetResponder={() => true}>
            <Text style={styles.pickerTitle}>{t('numericTable.listPicker.title')}</Text>
            {/* v41 — buscador: filtra opciones por texto (tablas extensas) */}
            <View style={styles.pickerSearchWrap}>
              <Ionicons name="search" size={16} color={Colors.textMuted} />
              <TextInput
                value={pickerSearch}
                onChangeText={setPickerSearch}
                placeholder={t('numericTable.placeholder.search')}
                placeholderTextColor={Colors.textMuted}
                autoCapitalize="none"
                style={styles.pickerSearchInput}
              />
              {pickerSearch !== '' && (
                <TouchableOpacity onPress={() => setPickerSearch('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Ionicons name="close-circle" size={16} color={Colors.textMuted} />
                </TouchableOpacity>
              )}
            </View>
            <FlatList
              data={(listPicker?.options ?? []).filter(o => o.toLowerCase().includes(pickerSearch.trim().toLowerCase()))}
              keyboardShouldPersistTaps="handled"
              keyExtractor={(item, i) => `${i}-${item}`}
              renderItem={({ item }) => {
                const selected = listPicker ? (localValues[listPicker.inputKey] ?? '') === item : false;
                return (
                  <TouchableOpacity
                    style={[styles.pickerOption, selected && styles.pickerOptionSelected]}
                    onPress={() => {
                      if (!listPicker) return;
                      const newVals = { ...localValues, [listPicker.inputKey]: item };
                      setLocalValues(newVals);
                      commitRow(listPicker.itemId, listPicker.spec, newVals);
                      setListPicker(null);
                    }}
                  >
                    <Text style={[styles.pickerOptionText, selected && styles.pickerOptionTextSelected]}>{item}</Text>
                    {selected && <Ionicons name="checkmark" size={16} color={Colors.primary} />}
                  </TouchableOpacity>
                );
              }}
              ListEmptyComponent={<Text style={styles.pickerEmpty}>{t('numericTable.listPicker.empty')}</Text>}
            />
          </View>
        </TouchableOpacity>
      </Modal>

      {/* v45 — Modal de "llamada a otra ficha": autocompletado de código */}
      <Modal visible={xrefPicker !== null} transparent animationType="fade" onRequestClose={finishXrefPicker}>
        <TouchableOpacity style={styles.pickerOverlay} activeOpacity={1} onPress={finishXrefPicker}>
          <View style={styles.pickerModal} onStartShouldSetResponder={() => true}>
            <Text style={styles.pickerTitle}>
              {t('numericTable.xrefPicker.title')}{xrefPicker?.tipo ? t('numericTable.xrefPicker.titleType', { tipo: xrefPicker.tipo }) : ''}
            </Text>
            <Text style={[styles.pickerEmpty, { textAlign: 'left', marginBottom: 6 }]}>
              {xrefPicker?.multi
                ? t('numericTable.xrefPicker.helpMulti')
                : xrefPicker?.targetKey
                  ? t('numericTable.xrefPicker.helpSingleCell', { targetKey: xrefPicker.targetKey })
                  : t('numericTable.xrefPicker.helpSingle')}
            </Text>
            {/* v45.3 — Agrupamientos: presets que seleccionan en bloque (solo multi). */}
            {xrefPicker?.multi && groupingPresets && groupingPresets.length > 0 && groupingContext && (
              <View style={{ marginBottom: 8 }}>
                <Text style={[styles.pickerOptionText, { fontSize: 11, fontWeight: '800', color: Colors.secondary, marginBottom: 4 }]}>{t('numericTable.xrefPicker.groupings')}</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                  {groupingPresets.map(preset => (
                    <TouchableOpacity
                      key={preset.id}
                      style={{ borderWidth: 1.5, borderColor: Colors.primary, borderRadius: 14, paddingHorizontal: 10, paddingVertical: 5, backgroundColor: '#eef2fa' }}
                      onPress={async () => {
                        const ctxPicker = xrefPicker;
                        if (!ctxPicker) return;
                        try {
                          const codes = await resolvePreset(preset, groupingContext, Date.now());
                          // UNIÓN con lo ya marcado (los presets son aditivos, '＋'); y commit
                          // EXPLÍCITO dentro del updater → persiste aunque cierren el modal antes
                          // de que resuelva el preset (evita la carrera tap→Listo).
                          setLocalValues(prev => {
                            const cur = (prev[ctxPicker.inputKey] ?? '').split(',').map(s => s.trim()).filter(Boolean);
                            const union = Array.from(new Set([...cur, ...codes]));
                            const newVals = { ...prev, [ctxPicker.inputKey]: union.join(',') };
                            commitRow(ctxPicker.itemId, ctxPicker.spec, newVals);
                            return newVals;
                          });
                        } catch { /* preset no resolvió → no cambia la selección */ }
                      }}
                    >
                      <Text style={{ fontSize: 11, fontWeight: '700', color: Colors.primary }}>＋ {preset.name}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}
            <View style={styles.pickerSearchWrap}>
              <Ionicons name="search" size={16} color={Colors.textMuted} />
              <TextInput
                value={xrefSearch}
                onChangeText={setXrefSearch}
                placeholder={t('numericTable.placeholder.searchByCode')}
                placeholderTextColor={Colors.textMuted}
                autoCapitalize="characters"
                style={styles.pickerSearchInput}
              />
              {xrefSearch !== '' && (
                <TouchableOpacity onPress={() => setXrefSearch('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Ionicons name="close-circle" size={16} color={Colors.textMuted} />
                </TouchableOpacity>
              )}
            </View>
            <FlatList
              data={xrefResults}
              // v45.1 fix — extraData fuerza re-render de las filas en cada toggle: sin
              // esto la FlatList conserva closures con un `localValues` viejo y el multi
              // solo guardaba el último código (y los ✓ no se actualizaban).
              extraData={xrefPicker ? (localValues[xrefPicker.inputKey] ?? '') : ''}
              keyboardShouldPersistTaps="handled"
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => {
                const curCodes = xrefPicker ? (localValues[xrefPicker.inputKey] ?? '').split(',').map(s => s.trim()).filter(Boolean) : [];
                const selected = curCodes.includes(item.code);
                return (
                  <TouchableOpacity
                    style={[styles.pickerOption, selected && styles.pickerOptionSelected]}
                    onPress={() => {
                      if (!xrefPicker) return;
                      if (xrefPicker.multi) {
                        // multi: alterna el código en el BORRADOR local (sin commit ni
                        // recálculo). El cálculo corre una sola vez al pulsar "Listo".
                        setLocalValues(prev => {
                          const cur = (prev[xrefPicker.inputKey] ?? '').split(',').map(s => s.trim()).filter(Boolean);
                          const next = cur.includes(item.code) ? cur.filter(c => c !== item.code) : [...cur, item.code];
                          return { ...prev, [xrefPicker.inputKey]: next.join(',') };
                        });
                      } else {
                        // single: fija el código y cierra. Commit EXPLÍCITO con el valor
                        // nuevo (setLocalValues es async → no sirve finishXrefPicker aquí).
                        const newVals = { ...localValues, [xrefPicker.inputKey]: item.code };
                        setLocalValues(newVals);
                        commitRow(xrefPicker.itemId, xrefPicker.spec, newVals);
                        setXrefPicker(null); setXrefSearch('');
                      }
                    }}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.pickerOptionText, selected && styles.pickerOptionTextSelected, { fontWeight: '800' }]}>{item.code}</Text>
                      <Text style={[styles.pickerEmpty, { textAlign: 'left', marginVertical: 0 }]} numberOfLines={1}>
                        {item.number}{item.date ? `  ·  ${item.date}` : ''}
                      </Text>
                    </View>
                    {selected && <Ionicons name="checkmark" size={16} color={Colors.primary} />}
                  </TouchableOpacity>
                );
              }}
              ListEmptyComponent={<Text style={styles.pickerEmpty}>{t('numericTable.xrefPicker.empty')}</Text>}
            />
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
              {(localValues[xrefPicker?.inputKey ?? ''] ?? '') !== '' && (
                <TouchableOpacity
                  style={[styles.pickerOption, { flex: 1, justifyContent: 'center' }]}
                  onPress={() => {
                    if (!xrefPicker) return;
                    if (xrefPicker.multi) {
                      // multi: limpia el borrador (sin cerrar; se commitea al "Listo").
                      setLocalValues(prev => ({ ...prev, [xrefPicker.inputKey]: '' }));
                    } else {
                      const newVals = { ...localValues, [xrefPicker.inputKey]: '' };
                      setLocalValues(newVals);
                      commitRow(xrefPicker.itemId, xrefPicker.spec, newVals);
                      setXrefPicker(null); setXrefSearch('');
                    }
                  }}
                >
                  <Text style={[styles.pickerOptionText, { color: Colors.danger }]}>{xrefPicker?.multi ? t('numericTable.xrefPicker.removeAll') : t('numericTable.xrefPicker.removeSelection')}</Text>
                </TouchableOpacity>
              )}
              {xrefPicker?.multi && (
                <TouchableOpacity
                  style={[styles.pickerOption, { flex: 1, justifyContent: 'center', backgroundColor: Colors.primary, borderColor: Colors.primary }]}
                  onPress={finishXrefPicker}
                >
                  <Text style={[styles.pickerOptionText, { color: Colors.white, fontWeight: '800' }]}>
                    {t('numericTable.xrefPicker.done')}{(localValues[xrefPicker?.inputKey ?? ''] ?? '').split(',').filter(Boolean).length ? ` (${(localValues[xrefPicker?.inputKey ?? ''] ?? '').split(',').filter(Boolean).length})` : ''}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Modal "Ver tablas" — matrices auxiliares */}
      <Modal visible={showMatricesModal} transparent animationType="fade" onRequestClose={() => setShowMatricesModal(false)}>
        <MatricesModalMobile matrices={matrixList} onClose={() => setShowMatricesModal(false)} />
      </Modal>
    </View>
  );
}

// ── Herramienta de desarrollo: autollenado (solo __DEV__) ────────────────────
// Perfil del ensayo PROCTOR (PRV5): valores REALES tomados del Excel de ejemplo
// (CV-QC-PR-260101-AB). Cada regla mapea (por descripción de la fila) los valores
// base por columna — para las filas de 4 puntos, un valor por punto (A/B/C/D). El
// autollenado emite `base × (1 ± 0.5%)` para que ensayos sucesivos salgan PARECIDOS
// (pequeñas variaciones, como repeticiones del mismo material). Las listas (molde,
// recipiente, tara, fiola, temperatura) toman el código real EXACTO (sin ruido) para
// que los BUSCAR resuelvan igual que el ensayo real. Filas que no matchean ninguna
// regla (otros ensayos) caen al generador genérico.
const devNorm = (s: string) => (s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();

const PROCTOR_RULES: { match: RegExp; perCol: (number | string | null)[] }[] = [
  // S1 — densidades húmedas (4 puntos)
  { match: /molde \+ suelo/, perCol: [5911, 5956, 5979, 5963] },     // Peso molde + suelo húmedo
  { match: /agua anadida/, perCol: [0, 40, 80, 120] },               // informativo (incremental)
  // S2 — contenido de humedad (4 puntos)
  { match: /suelo humedo \+ recipiente/, perCol: [668.9, 605.2, 685.7, 669.8] },
  { match: /suelo seco \+ recipiente/, perCol: [622, 560.8, 626, 610.2] },
  { match: /suelo humedo \+ tara/, perCol: [1160.6] },               // S4 (1 columna)
  { match: /suelo seco \+ tara/, perCol: [1103.7] },                 // S4
  { match: /recipiente n/, perCol: ['1', '2', '3', '4'] },           // list @taras (pesos 269.9/268.5/269.7/269.8)
  { match: /n. de molde/, perCol: ['13'] },                          // list @moldes (peso 4111.7)
  { match: /n. de tara/, perCol: ['33'] },                           // list @taras2 (peso 721.8)
  // S5 — granulometría (input = col B "Peso retenido"); pasa con curva de arena
  { match: /tamiz 9\.5/, perCol: [null, 0] },
  { match: /tamiz 4\.75/, perCol: [null, 2] },
  { match: /tamiz 2\.0/, perCol: [null, 10] },
  { match: /tamiz 0\.425/, perCol: [null, 90] },
  { match: /tamiz 0\.150/, perCol: [null, 160] },
  { match: /tamiz 0\.075/, perCol: [null, 85] },
  // S6 — gravedad específica (fiola 17 + temp 20 → Gs20 ≈ 2.729, igual al real)
  { match: /picnometro|fiola/, perCol: ['17'] },                     // list @fiola
  { match: /temperatura/, perCol: ['20'] },                          // list @agua
  { match: /frasco \+ agua \+ suelo|pfws/, perCol: [387.6] },        // Pfws
  { match: /pss|suelo seco \(pss\)/, perCol: [100] },                // Pss
];

/** Valor aleatorio dentro de [min,max], banda media, redondeado (fallback genérico). */
function devRandIn(min: number, max: number, decimals: number): string {
  const frac = 0.35 + Math.random() * 0.35;
  return (min + frac * (max - min)).toFixed(Math.max(0, Math.min(6, decimals)));
}

/** Aplica ±0.5% de ruido a un valor base y lo acota al rango de la celda. */
function devNoisy(base: number, range: { min: number; max: number } | null | undefined, decimals: number): string {
  const noisy = base * (1 + (Math.random() - 0.5) * 0.01);
  const v = range ? Math.min(range.max, Math.max(range.min, noisy)) : noisy;
  return v.toFixed(Math.max(0, Math.min(6, decimals)));
}

/** Genera un valor de ingreso para una celda. Para Proctor usa el valor real de la
 *  ficha (por descripción) con ruido pequeño; si no matchea, valores genéricos.
 *  Devuelve null para celdas calculadas/solo-lectura (no se rellenan). */
function devGenCellValue(cell: NumericCellSpec, colIdx: number, descNorm: string, matrices: Record<string, MatrixData>, auxTables?: AuxTables): string | null {
  const rule = PROCTOR_RULES.find(r => r.match.test(descNorm));
  const base = rule ? (rule.perCol[colIdx] ?? rule.perCol[0]) : undefined;
  const dec = (cell as { decimals?: number }).decimals;
  const range = (cell as { range?: { min: number; max: number } }).range;
  switch (cell.kind) {
    case 'manual':
    case 'percent':
      if (typeof base === 'number') return devNoisy(base, range, dec ?? 2);
      return range ? devRandIn(range.min, range.max, dec ?? 2) : (Math.random() * 100).toFixed(dec ?? 2);
    case 'free':
      if (typeof base === 'number') return devNoisy(base, range, dec ?? 1);
      return (10 + Math.random() * 990).toFixed(dec ?? 1);
    case 'list': {
      const opts = resolveListOptionsMobile((cell as { source: ListSource }).source, matrices, auxTables);
      if (base != null) {
        const hit = opts.find(o => String(o) === String(base));
        if (hit != null) return String(hit);   // código real exacto (BUSCAR resuelve igual)
      }
      return opts.length ? String(opts[Math.floor(Math.random() * opts.length)]) : null;
    }
    case 'text':
      return tx('numericTable.devTestValue');
    case 'date': {
      const d = new Date();
      return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
    }
    case 'time': {
      const h = 8 + Math.floor(Math.random() * 8), m = Math.floor(Math.random() * 60);
      return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    }
    case 'bool':
      return '1';
    case 'equipment':
      return 'DEV-001';
    case 'comment': {
      const opts = (cell as { options?: string[] }).options;
      return opts && opts.length ? opts[Math.floor(Math.random() * opts.length)] : null;
    }
    default:
      return null; // formula / lookup / val / code / blank
  }
}

/** Resuelve opciones de una lista a partir de la spec, matrices y tablas auxiliares. */
function resolveListOptionsMobile(source: ListSource, matrices: Record<string, MatrixData>, auxTables?: AuxTables): string[] {
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
  const m = matrices[source.matrixId];
  if (!m) return [];
  const colIdx = source.col.charCodeAt(0) - 65;
  const colVals = (rows: typeof m.rows) => rows.map(r => r[colIdx] ?? '').filter(v => v !== '');
  if (source.type === 'matrix-col') return colVals(m.rows);
  // Rango por fila (#from:#to): los índices 1-based del usuario apuntan a las
  // filas ORIGINALES de la matriz. Recortar PRIMERO y luego limpiar vacíos; si
  // se filtra antes de recortar, los huecos del medio desalinean el rango.
  const from = Math.max(0, source.fromRow - 1);
  const to = Math.min(m.rows.length, source.toRow);
  return colVals(m.rows.slice(from, to));
}

/** Modal RN equivalente al `MatricesModal` web — muestra catálogos como tabla. */
function MatricesModalMobile({ matrices, onClose }: { matrices: MatrixData[]; onClose: () => void }) {
  const { t } = useI18n();
  const [activeIdx, setActiveIdx] = useState(0);
  const active = matrices[activeIdx];
  return (
    <View style={styles.matModalOverlay}>
      <View style={styles.matModalCard}>
        <View style={styles.matModalHeader}>
          <Text style={styles.matModalTitle}>{t('numericTable.matrices.title')}</Text>
          <TouchableOpacity onPress={onClose}><Ionicons name="close" size={20} color={Colors.white} /></TouchableOpacity>
        </View>
        {matrices.length > 1 && (
          <ScrollView horizontal style={styles.matTabs} showsHorizontalScrollIndicator={false}>
            {matrices.map((m, i) => (
              <TouchableOpacity key={m.id} onPress={() => setActiveIdx(i)} style={[styles.matTab, i === activeIdx && styles.matTabActive]}>
                <Text style={[styles.matTabText, i === activeIdx && { color: Colors.primary }]}>{m.id}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}
        <ScrollView horizontal>
          <ScrollView>
            <View style={styles.matTable}>
              <View style={styles.matRowHead}>
                <Text style={[styles.matCellHead, { width: 28 }]}>#</Text>
                {active?.columnTitles.map((t, i) => (
                  <Text key={i} style={[styles.matCellHead, { width: 110 }]}>{String.fromCharCode(65 + i)}{t ? ` · ${t}` : ''}</Text>
                ))}
              </View>
              {active?.rows.map((row, ri) => (
                <View key={ri} style={[styles.matRow, ri % 2 === 1 && { backgroundColor: '#fafbfd' }]}>
                  <Text style={[styles.matCell, { width: 28, color: Colors.primary, fontWeight: '700' }]}>{ri + 1}</Text>
                  {active.columnTitles.map((_, ci) => (
                    <Text key={ci} style={[styles.matCell, { width: 110 }]}>{row[ci] ?? ''}</Text>
                  ))}
                </View>
              ))}
            </View>
          </ScrollView>
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 8 },
  // v32b — verde y compacto (mismo tamaño que el botón "Recapturar" del GPS)
  playBtn: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: Colors.success, paddingVertical: 5, paddingHorizontal: 10, borderRadius: Radius.sm },
  // Herramienta de desarrollo (autollenado) — estilo "dashed naranja" para que NO se
  // confunda con un control de producción. Solo se renderiza en builds __DEV__.
  devFillBtn: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1, borderStyle: 'dashed', borderColor: '#b45309', backgroundColor: '#fff7ed', paddingVertical: 5, paddingHorizontal: 10, borderRadius: Radius.sm, marginBottom: 8 },
  devFillText: { color: '#b45309', fontSize: 11, fontWeight: '800' },
  playText: { color: Colors.white, fontSize: 11, fontWeight: '700' },
  // Banner de errores estilo alerta: borde izquierdo de color (como las alertas
  // del resto de la app), fondo cálido suave derivado de Colors.warning.
  banner: { backgroundColor: '#faf3e6', borderLeftWidth: 4, borderLeftColor: Colors.warning, borderRadius: Radius.sm, paddingVertical: 10, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 8 },
  bannerText: { fontSize: 12, fontWeight: '700', color: Colors.warning, flex: 1, lineHeight: 17 },
  // Banda de sección (cuando los items declaran `section`): chip-banda gris navy.
  sectionBand: { backgroundColor: Colors.surface, borderBottomWidth: 1, borderBottomColor: Colors.border, paddingVertical: 6, paddingHorizontal: 10, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sectionBandText: { fontSize: 10, fontWeight: '800', color: Colors.primary, letterSpacing: 0.8, textTransform: 'uppercase' },
  // Badge circular de estado por fila (✓/✗) — fondo suave, símbolo en color pleno.
  statusBadge: { width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  statusBadgeOk: { backgroundColor: '#e3f1ea' },
  statusBadgeFail: { backgroundColor: '#f9e8e6' },
  statusBadgeText: { fontSize: 11, fontWeight: '900' },
  table: { backgroundColor: Colors.white, borderRadius: Radius.md, overflow: 'hidden', borderWidth: 1, borderColor: Colors.border, ...Shadow.subtle },
  header: { flexDirection: 'row', backgroundColor: Colors.navy, paddingVertical: 6, paddingHorizontal: 6, alignItems: 'center' },
  thCellTall: { backgroundColor: Colors.navy, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 2 },
  th: { color: Colors.white, fontSize: 9, fontWeight: '800', letterSpacing: 0.5 },
  // v42e (M7) — `flex-start` (no `center`): cuando una celda numérica envuelve a 2
  // líneas (números largos, v42c), las cajas de la fila comparten su borde SUPERIOR
  // en vez de centrarse y quedar desniveladas. date/equipment no pueden ser multiline
  // (su teclado usa Enter para navegar), así que igualar alturas no es opción.
  row: { flexDirection: 'row', paddingVertical: 8, paddingHorizontal: 6, borderBottomWidth: 1, borderBottomColor: Colors.divider, alignItems: 'flex-start' },
  td: { fontSize: 12, color: Colors.textPrimary },
  formulaCell: { fontSize: 9, color: Colors.textMuted, fontFamily: 'monospace' as any },
  graphMethod: { fontSize: 9, color: Colors.textMuted, fontFamily: 'monospace' as any, marginVertical: 2 },
  // input (llenado) y computed (val/calculado) comparten dimensiones para que los
  // recuadros se vean idénticos en tamaño; solo cambia el fondo (editable vs solo-lectura).
  // minHeight 42: target táctil cómodo para uso en campo con guantes/apuro.
  input: { paddingVertical: 4, paddingHorizontal: 4, minHeight: 36, fontSize: 11, borderWidth: 1, borderColor: Colors.border, borderRadius: 6, textAlign: 'center', textAlignVertical: 'center', color: Colors.textPrimary, backgroundColor: Colors.white },
  // Celda enfocada: borde primary más grueso + tinte azulado suave (paleta light).
  inputFocused: { borderWidth: 1.5, borderColor: Colors.primary, backgroundColor: '#f5f8fd' },
  inputOk:  { borderColor: Colors.success, color: Colors.success },
  inputBad: { borderColor: Colors.danger,  color: Colors.danger },
  computed: { paddingVertical: 4, paddingHorizontal: 6, minHeight: 36, borderWidth: 1, borderColor: Colors.border, borderRadius: 6, backgroundColor: Colors.surface, alignItems: 'center', justifyContent: 'center' },
  computedOk:  { backgroundColor: '#e8f5ee', borderColor: Colors.success },
  computedBad: { backgroundColor: '#fdecea', borderColor: Colors.danger },
  computedText: { fontSize: 11, fontWeight: '600', textAlign: 'center' },
  rangeText: { fontSize: 8, color: Colors.textMuted },
  // M2 — slot de altura FIJA bajo cada recuadro: con o sin rango, misma altura.
  rangeSlot: { height: 12, justifyContent: 'center', alignItems: 'center' },
  sectionBandCols: { fontSize: 9, fontWeight: '700', color: Colors.textMuted },
  graphRow: { paddingVertical: 12, paddingHorizontal: 8, borderBottomWidth: 1, borderBottomColor: Colors.divider, gap: 4 },
  graphTitle: { fontSize: 12, fontWeight: '700', color: Colors.navy },
  graphSub: { fontSize: 11, color: Colors.textSecondary },
  graphHint: { fontSize: 10, color: Colors.textMuted, fontStyle: 'italic' },
  matricesBtn: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: Colors.white, paddingVertical: 6, paddingHorizontal: 12, borderRadius: Radius.sm, borderWidth: 1, borderColor: Colors.border },
  matricesBtnText: { color: Colors.primary, fontSize: 12, fontWeight: '700' },
  pickerOverlay: { flex: 1, backgroundColor: 'rgba(14,33,61,0.55)', justifyContent: 'center', alignItems: 'center', padding: 16 },
  pickerModal: { backgroundColor: Colors.white, borderRadius: Radius.lg, maxHeight: 420, width: '100%', maxWidth: 320, padding: 16, ...Shadow.card },
  pickerTitle: { fontSize: 12, fontWeight: '800', color: Colors.navy, marginBottom: 10, letterSpacing: 0.5, textTransform: 'uppercase' },
  pickerSearchWrap: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.sm, paddingHorizontal: 8, paddingVertical: 4, marginBottom: 8 },
  pickerSearchInput: { flex: 1, fontSize: 13, color: Colors.textPrimary, paddingVertical: 4 },
  pickerOption: { paddingVertical: 12, paddingHorizontal: 10, borderBottomWidth: 1, borderBottomColor: Colors.divider, borderRadius: Radius.sm, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  pickerOptionSelected: { backgroundColor: '#f5f8fd' },
  pickerOptionText: { fontSize: 14, color: Colors.textPrimary, flex: 1 },
  pickerOptionTextSelected: { color: Colors.primary, fontWeight: '700' },
  pickerEmpty: { fontSize: 12, color: Colors.textMuted, textAlign: 'center', padding: 12 },
  matModalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 12 },
  matModalCard: { backgroundColor: Colors.white, borderRadius: Radius.md, width: '100%', maxWidth: 560, maxHeight: '85%', overflow: 'hidden' },
  matModalHeader: { backgroundColor: Colors.navy, paddingHorizontal: 12, paddingVertical: 10, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  matModalTitle: { color: Colors.white, fontSize: 12, fontWeight: '800', letterSpacing: 0.5, textTransform: 'uppercase' },
  matTabs: { backgroundColor: Colors.surface, borderBottomWidth: 1, borderBottomColor: Colors.border, paddingHorizontal: 4 },
  matTab: { paddingVertical: 8, paddingHorizontal: 12, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  matTabActive: { borderBottomColor: Colors.primary },
  matTabText: { fontSize: 12, fontWeight: '700', color: Colors.textSecondary },
  matTable: { flexDirection: 'column' },
  matRowHead: { flexDirection: 'row', backgroundColor: Colors.navy },
  matCellHead: { color: Colors.white, fontSize: 10, fontWeight: '800', padding: 6, borderLeftWidth: 1, borderLeftColor: 'rgba(255,255,255,0.2)' },
  matRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: Colors.divider },
  matCell: { fontSize: 11, color: Colors.textPrimary, padding: 6, borderLeftWidth: 1, borderLeftColor: Colors.divider },
});
