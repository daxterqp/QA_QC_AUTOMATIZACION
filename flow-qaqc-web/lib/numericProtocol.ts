// Parser y helpers para protocolos numéricos.
//
// Una fila (`validation_method`) puede ser:
//   1. Una sola celda manual:  `numerico-[min:max]`
//   2. Una sola celda fórmula: `numerico-fx[expr]` o `numerico-fx[expr]:[min:max]`
//   3. Multi-celda con `//`:   `numerico-[1:2] // numerico-[1:2] // numerico-fx[#1A-#1B]`
//   4. Gráfico (ocupa fila):   `numerico-gr1[x:#1A,#2A-y:#1B,#2B]`
//                              `numerico-gr2[x:#1A:#4A-y:#1B:#4B]`
//      Formato extendido (v32, secciones con `|`):
//        `numerico-gr5[x:#1A:#10A|y:#1B:#10B|y2:#1C:#10C|t:Título|xt:Eje X|yt:Eje Y
//                      |ly:Serie 1|ly2:Serie 2|bandalo:#1D:#10D|bandahi:#1E:#10E
//                      |ajuste:poli2]`
//        - y2/y3:    series adicionales (mismo eje)
//        - ly/ly2/ly3: etiquetas de leyenda por serie
//        - bandalo/bandahi: banda de especificación (huso) entre dos series de Y
//        - ajuste:   curva ajustada sobre la serie 1 — lineal|poli2|poli3|spline|loglog
//        - alto:     proporción alto/ancho en % (30–150). Ej: alto:80 → gráfico
//                    más cuadrado (curvas granulométricas de informe).
//
// Tipos de celda (v32, además de numerico-/list-/lookup-/comment-/val-):
//   bool-[]                 → casilla Sí/No. Vale 1/0 en fórmulas.
//   fecha-[]                → fecha dd/mm/aaaa (texto validado).
//   hora-[]                 → hora HH:MM (texto validado).
//   porcentaje-[min:max]    → numérico mostrado con sufijo %, validado por rango.
//   equipo-[tipo]           → código de equipo del módulo de Equipos (trazabilidad).
//
// Las celdas dentro de una fila se etiquetan posicionalmente con letras A, B, C, …
// (máx 26 columnas). Una referencia `#1` equivale a `#1A`.
//
// Si TODOS los items de un protocolo matchean uno de los formatos → es un
// protocolo numérico y la UI cambia a tabla. Si alguno no matchea → flujo
// clásico Sí/No/NA.

/** Fuente de opciones para una celda de tipo lista (dropdown). */
export type ListSource =
  | { type: 'inline'; values: string[] }
  | { type: 'matrix-col';   matrixId: string; col: string }
  | { type: 'matrix-range'; matrixId: string; col: string; fromRow: number; toRow: number }
  /** v41 — Columna de una TABLA AUXILIAR del proyecto: `list-[@taras[Codigo]]`.
   *  `column` es el NOMBRE de la columna (no letra). Se resuelve desde auxTables. */
  | { type: 'project-table'; tableKey: string; column: string };

/** Modificadores comunes de celda (v34):
 *  - normaRef:  referencia normativa (`:norma[ASTM D1557]`).
 *  - hidden:    `:oculto` — celda de CÁLCULO invisible (ni app ni PDF). Sigue
 *               computando en el scope para fórmulas intermedias. Implica noReport.
 *               Solo válida en celdas calculadas (formula/val) — el validador
 *               rechaza ocultar celdas de entrada.
 *  - noReport:  `:nopdf` — visible y editable en la app, EXCLUIDA del PDF/reporte
 *               (datos auxiliares del ensayo que no van al informe final). */
export type CellMods = {
  normaRef?: string;
  hidden?: boolean;
  noReport?: boolean;
  /** `:dec[n]` (0–6) — decimales de PRESENTACIÓN de la celda (A3). Aplica a
   *  manual/percent (al confirmar) y formula (valor computado). Sin él, el
   *  formato compacto por defecto se mantiene. */
  decimals?: number;
};

export type NumericCellSpec = CellMods & (
  | { kind: 'manual';  range: { min: number; max: number } }
  | { kind: 'formula'; expr: string; range: { min: number; max: number } | null }
  | { kind: 'list';    source: ListSource }
  | { kind: 'lookup';  refKey: string; matrixId: string; searchCol: string; returnCol: string }
  | { kind: 'comment'; options: string[] }
  /** Celda vacía intencional (`////` o `// //`). Placeholder visual sin input. */
  | { kind: 'blank' }
  /** Valor literal de una celda de matriz. SOLO válido dentro de filas matrix-data. */
  | { kind: 'val';     literal: string }
  // ── v32: tipos de campo nuevos ─────────────────────────────────────────
  /** Casilla Sí/No. Se guarda "1"/"0" y vale 1/0 dentro de fórmulas. */
  | { kind: 'bool' }
  /** Fecha dd/mm/aaaa (texto validado, no entra al scope numérico). */
  | { kind: 'date' }
  /** Hora HH:MM (texto validado, no entra al scope numérico). */
  | { kind: 'time' }
  /** Numérico con sufijo % visible, validado por rango (igual que manual). */
  | { kind: 'percent'; range: { min: number; max: number } }
  /** Código de equipo calibrado (módulo de Equipos) — trazabilidad del ensayo. */
  | { kind: 'equipment'; equipType: string }
  /** v31 (Parte E) — código correlativo del ensayo (protocol_code), read-only.
   *  El render lo toma del protocolo, no de comments; no entra al scope. */
  | { kind: 'code' }
  // ── v33: celdas de ingreso LIBRE (sin validación de intervalo) ───────────
  /** Numérico libre `numerico-[]`: entra al scope como número (usable en
   *  fórmulas) pero NO valida contra ningún rango (nunca ✗ por fuera de rango). */
  | { kind: 'free' }
  /** Texto libre `texto-[]`: cualquier contenido; va a textValues, no al scope
   *  numérico, y no valida. */
  | { kind: 'text' }
  /** v45 — Celda de LLAMADA a otra ficha. Tres modos:
   *  - `select` (`xref-[tipo]`): SELECTOR — el técnico elige un código por
   *    autocompletado (se guarda en comments). No trae valor; otras celdas lo usan.
   *  - `self` (`xref-[tipo].<row><col>`): elige Y trae el valor en la MISMA celda.
   *  - `get` (`xref-[#refSelector].<row><col>`): READ-ONLY — lee el código elegido
   *    en la celda selectora `refSelector` y trae su `targetKey` (sin re-seleccionar).
   *  `filter.tipo` = id_protocolo permitido (acota el autocompletado). El valor en el
   *  scope = `@<código>.<targetKey>` (reusa el motor xref). */
  | { kind: 'xref'; mode: 'select' | 'self' | 'get'; targetKey?: string; sourceRef?: string; multi?: boolean; op?: XrefGetOp; filter: { tipo?: string } }
);

/** v45.1 — Función de reducción de una celda `get` sobre múltiples protocolos. */
export type XrefReduce = 'prom' | 'max' | 'min' | 'suma' | 'cuenta' | 'mediana' | 'desv';
/** Comparadores para filtros/condiciones cruzadas. */
export type XrefCmp = '<' | '<=' | '>' | '>=' | '=' | '!=';
/** Referencia de comparación: una celda de MI ficha (`#1A` → {cell:'1A'}) o un literal. */
export type XrefRef = { cell: string } | { num: number };
/**
 * v45.2 — Operación de una celda `get` sobre el conjunto de fichas seleccionadas:
 *  - `agg`: agrega `targetKey` (prom/max/min/suma/cuenta/mediana/desv), con filtro
 *    opcional relativo a MI ficha (`prom(20A<=#1A)` = solo fichas con 20A ≤ #1A).
 *  - `pick`: elige UNA ficha por comparación y devuelve su `targetKey`:
 *    `cerca`(más cercana abs a ref), `cerca_inf`(≤ref más cercana), `cerca_sup`(≥ref),
 *    `mayor`/`menor` (máx/mín de matchKey). `matchKey` = celda a comparar (def targetKey).
 *  - `interp`: interpola `targetKey` a `ref` usando `matchKey` como eje X sobre el set.
 */
export type XrefGetOp =
  | { kind: 'agg'; fn: XrefReduce; filter?: { matchKey: string; cmp: XrefCmp; ref: XrefRef } }
  | { kind: 'pick'; mode: 'cerca' | 'cerca_inf' | 'cerca_sup' | 'mayor' | 'menor'; matchKey?: string; ref?: XrefRef }
  | { kind: 'interp'; matchKey: string; ref: XrefRef };

export type NumericHeaderSpec = {
  kind: 'header';
  /** Spans contiguos de columnas (0-based) con su título.
   *  `col-[A][X] // col-[C:E][Y]` → `[{from:0,to:0,title:"X"},{from:2,to:4,title:"Y"}]` */
  spans: { from: number; to: number; title: string }[];
};

export type NumericMatrixHeaderSpec = {
  kind: 'matrix-header';
  matrixId: string;
  /** Columnas declaradas con `col-[…]` después del marcador `matrix-[Mx]`. */
  spans: { from: number; to: number; title: string }[];
};

export type NumericMatrixDataSpec = {
  kind: 'matrix-data';
  /** Valores literales en orden de columna. */
  values: string[];
};

/** Directiva paramétrica (v25): solo válida en plantillas. */
export type NumericRepeatDirectiveSpec = {
  kind: 'repeat-directive';
  groupId: string;
  min: number;
  max: number;
  defaultN: number;
};

/** Modos de gráfico (gr1=line, gr2=smooth, gr3=bars, gr5=log-x, gr7=scatter). */
export type NumericGraphMode = 'line' | 'smooth' | 'bars' | 'log-x' | 'scatter';

/** Tipo de curva ajustada superpuesta a la serie 1 de un gráfico (v32). */
export type NumericGraphFit = 'lineal' | 'poli2' | 'poli3' | 'spline' | 'loglog';

export type NumericRowSpec =
  | { kind: 'row';   cells: NumericCellSpec[] }
  | {
      kind: 'graph';
      mode: NumericGraphMode;
      xRefs: string[];
      yRefs: string[];
      title?: string;
      xAxisTitle?: string;
      yAxisTitle?: string;
      // ── v32: extensiones (todas opcionales — sintaxis legacy intacta) ──
      /** Series Y adicionales contra el mismo eje X. */
      y2Refs?: string[];
      y3Refs?: string[];
      /** Etiquetas de leyenda para las series 1..3 (`ly:`, `ly2:`, `ly3:`). */
      seriesLabels?: (string | undefined)[];
      /** Banda de especificación (huso): dos series Y (límite inferior y superior). */
      bandLoRefs?: string[];
      bandHiRefs?: string[];
      /** Curva ajustada sobre la serie 1. */
      fit?: NumericGraphFit;
      /** Proporción alto/ancho en % (30–150). Sin especificar → default del visor. */
      aspectPct?: number;
    }
  | NumericHeaderSpec
  | NumericMatrixHeaderSpec
  | NumericMatrixDataSpec
  | NumericRepeatDirectiveSpec;

/** Datos de una matriz auxiliar resuelta (catálogo). */
export interface MatrixData {
  id: string;
  /** Títulos por columna en orden (col A = índice 0). */
  columnTitles: string[];
  /** Filas de datos (cada fila tiene un valor por columna en orden). */
  rows: string[][];
}

/** Backwards-compat: alias del shape de la primera celda (o graph) de una fila.
 *  Solo manual/formula/graph — para call-sites legacy que aún no conocen list/lookup. */
export type NumericSpec =
  | Extract<NumericCellSpec, { kind: 'manual' }>
  | Extract<NumericCellSpec, { kind: 'formula' }>
  | Extract<NumericRowSpec, { kind: 'graph' }>;

const RE_MANUAL = /^numerico-\[(-?\d+(?:[.,]\d+)?):(-?\d+(?:[.,]\d+)?)\]$/i;
/** v33 — Numérico LIBRE (sin rango): `numerico-[]`. */
const RE_FREE   = /^numerico-\[\]$/i;
/** v33 — Texto LIBRE: `texto-[]`. */
const RE_TEXT   = /^texto-\[\]$/i;
const RE_FX     = /^numerico-fx\[(.+?)\](?::\[(-?\d+(?:[.,]\d+)?):(-?\d+(?:[.,]\d+)?)\])?$/i;
/** Gráfico gr1-gr8 con body parseado aparte. */
const RE_GR     = /^numerico-gr([1-8])\[(.+)\]$/i;
const GR_MODES: Record<string, NumericGraphMode | null> = {
  '1': 'line', '2': 'smooth', '3': 'bars', '4': null,
  '5': 'log-x', '6': null, '7': 'scatter', '8': null,
};
const RE_REF    = /^#?(\d+)([A-Za-z])?$/;
const RE_RANGE  = /^#?(\d+)([A-Za-z])?:#?(\d+)([A-Za-z])?$/;
/** col-[A][titulo] o col-[A:C][titulo]. Título no admite `[`, `]`, `//`. */
const RE_COL    = /^col-\[([A-Za-z])(?::([A-Za-z]))?\]\[([^\[\]]*)\]$/i;
/** matrix-[M1]. Identificador alfanumérico + guiones. */
const RE_MATRIX_HDR  = /^matrix-\[([A-Za-z0-9_-]+)\]$/i;
/** val-[<literal>]. Cualquier contenido salvo `[`, `]`. */
const RE_VAL         = /^val-\[([^\[\]]*)\]$/i;
/** list-[a,b,c] inline. */
const RE_LIST_INLINE = /^list-\[([^\[\]]+)\]$/i;
/** list-[M1[A]] o list-[M1[#1A:#10A]] o list-[@taras[Codigo]] (tabla de proyecto). */
const RE_LIST_MATRIX = /^list-\[(@?[A-Za-z0-9_-]+)\[([^\[\]]+)\]\]$/i;
/** lookup-[#1A, M1, A, B] */
const RE_LOOKUP      = /^lookup-\[\s*([^,\]]+)\s*,\s*([A-Za-z0-9_-]+)\s*,\s*([A-Za-z])\s*,\s*([A-Za-z])\s*\]$/i;
/** comment-[opt1, opt2, opt3]. */
const RE_COMMENT     = /^comment-\[([^\[\]]+)\]$/i;
/** repeat-[grupo:min:max:default] — directiva paramétrica. */
const RE_REPEAT_DIR  = /^repeat-\[\s*([A-Za-z][A-Za-z0-9_-]*)\s*:\s*(\d+)\s*:\s*(\d+)\s*:\s*(\d+)\s*\]$/i;
/** Sufijo opcional `:norma[<ref>]` al final de cualquier celda. */
const RE_NORMA_SUFFIX = /:norma\[([^\[\]]+)\]\s*$/i;
/** Sufijos de visibilidad (v34): `:oculto` (cálculo invisible) / `:nopdf` (no va al reporte). */
const RE_FLAG_SUFFIX = /:(oculto|nopdf)\s*$/i;
/** Sufijo `:dec[n]` — decimales de presentación por celda (A3, 0–6). */
const RE_DEC_SUFFIX = /:dec\[(\d)\]\s*$/i;
// ── v32: tipos de campo nuevos ───────────────────────────────────────────
/** bool-[] — casilla Sí/No. */
const RE_BOOL    = /^bool-\[\]$/i;
/** fecha-[] — fecha dd/mm/aaaa. */
const RE_DATE    = /^fecha-\[\]$/i;
/** hora-[] — hora HH:MM. */
const RE_TIME    = /^hora-\[\]$/i;
/** porcentaje-[min:max] — numérico con sufijo % visible. */
const RE_PERCENT = /^porcentaje-\[(-?\d+(?:[.,]\d+)?):(-?\d+(?:[.,]\d+)?)\]$/i;
/** equipo-[tipo] — código de equipo del módulo de Equipos. */
const RE_EQUIP   = /^equipo-\[([^\[\]]+)\]$/i;
/** codigo-[] (v31, Parte E) — celda read-only que muestra el código correlativo
 *  del ensayo (protocol_code). No entra al scope de fórmulas. */
const RE_CODE    = /^codigo-\[\]$/i;
/** v45 — celda de llamada a otra ficha. `xref-[<contenido>]` con `.<row><col>` opcional.
 *  contenido = tipo (id_protocolo), o `#refSelector` (puller), o vacío.
 *  g1 = contenido, g2 = fila destino (opcional), g3 = columna destino (opcional). */
const RE_XREF_CELL = /^xref(-multi)?-\[([^\[\]]*)\](?:\.(\d+)([A-Za-z])?(?::(.+))?)?$/i;

/** Normaliza una celda destino/comparación `<row><col?>` → `<row><COL>` (col def A). */
function parseXrefKey(s: string): string | null {
  const m = s.trim().match(/^(\d+)([A-Za-z])?$/);
  if (!m) return null;
  const r = parseInt(m[1], 10);
  if (r < 1) return null;   // las partidas empiezan en 1; #0 / .0A → ref muerta (rechazar)
  return `${r}${(m[2] ?? 'A').toUpperCase()}`;
}

/** Parsea una referencia de comparación: `#1A` (celda de MI ficha) o un literal numérico. */
function parseXrefRef(s: string): XrefRef | null {
  const t = s.trim();
  if (t.startsWith('#')) {
    const k = parseXrefKey(t.slice(1));
    return k ? { cell: k } : null;
  }
  const n = Number(t.replace(',', '.'));
  return isFinite(n) ? { num: n } : null;
}

/** Parsea el operador de una celda `get` (lo que va tras `:` en `xref-[#1A].19A:<op>`). */
function parseXrefOp(raw: string): XrefGetOp | null {
  const s = raw.trim();
  // Agregado (con filtro opcional): prom | max | ... [ (matchKey cmp ref) ]
  let m = s.match(/^(prom|max|min|suma|cuenta|mediana|desv)(?:\(\s*(.+?)\s*\))?$/i);
  if (m) {
    const fn = m[1].toLowerCase() as XrefReduce;
    if (!m[2]) return { kind: 'agg', fn };
    const pm = m[2].match(/^(\d+[A-Za-z]?)\s*(<=|>=|!=|<|>|=)\s*(.+)$/);
    if (!pm) return null;
    const matchKey = parseXrefKey(pm[1]); const ref = parseXrefRef(pm[3]);
    if (!matchKey || !ref) return null;
    return { kind: 'agg', fn, filter: { matchKey, cmp: pm[2] as XrefCmp, ref } };
  }
  // Elegir una: cerca|cerca_inf|cerca_sup ( matchKey , ref )
  m = s.match(/^(cerca|cerca_inf|cerca_sup)\(\s*([^,]+?)\s*,\s*(.+?)\s*\)$/i);
  if (m) {
    const matchKey = parseXrefKey(m[2]); const ref = parseXrefRef(m[3]);
    if (!matchKey || !ref) return null;
    return { kind: 'pick', mode: m[1].toLowerCase() as 'cerca' | 'cerca_inf' | 'cerca_sup', matchKey, ref };
  }
  // mayor | menor ( matchKey? )
  m = s.match(/^(mayor|menor)(?:\(\s*(.+?)\s*\))?$/i);
  if (m) {
    const matchKey = m[2] ? parseXrefKey(m[2]) : undefined;
    if (m[2] && !matchKey) return null;
    return { kind: 'pick', mode: m[1].toLowerCase() as 'mayor' | 'menor', ...(matchKey ? { matchKey } : {}) };
  }
  // interp ( matchKey , ref )
  m = s.match(/^interp\(\s*([^,]+?)\s*,\s*(.+?)\s*\)$/i);
  if (m) {
    const matchKey = parseXrefKey(m[1]); const ref = parseXrefRef(m[2]);
    if (!matchKey || !ref) return null;
    return { kind: 'interp', matchKey, ref };
  }
  return null;
}
/** Valores admitidos en `ajuste:` de un gráfico. */
const GRAPH_FITS: ReadonlySet<string> = new Set(['lineal', 'poli2', 'poli3', 'spline', 'loglog']);

function numOf(s: string): number { return Number(s.replace(',', '.')); }

/** Normaliza una referencia a clave de scope `<row><col>` en mayúsculas.
 *  `#1` → `1A`, `#3b` → `3B`, `1` → `1A`. */
export function normalizeRef(ref: string): string {
  const m = ref.trim().match(RE_REF);
  if (!m) throw new Error(`Referencia inválida: ${ref}`);
  // v42e (L4/I2) — normaliza ceros a la izquierda (`#01`→`1A`) vía parseInt y
  // rechaza fila 0 (las partidas empiezan en 1): así un typo `#0` falla con error
  // accionable en vez de generar una key inexistente silenciosa.
  const row = parseInt(m[1], 10);
  if (row < 1) throw new Error(`Referencia inválida (la fila debe ser ≥1): ${ref}`);
  return String(row) + (m[2] ? m[2].toUpperCase() : 'A');
}

/** Expande un rango `#1A:#4A` o referencia simple `#1A` a una lista de keys.
 *  Lanza si el rango varía fila y columna a la vez o si está invertido. */
function expandRefOrRange(token: string): string[] {
  const tr = token.trim();
  const rm = tr.match(RE_RANGE);
  if (rm) {
    const fromRow = parseInt(rm[1], 10);
    const fromCol = (rm[2] ?? 'A').toUpperCase();
    const toRow = parseInt(rm[3], 10);
    const toCol = (rm[4] ?? 'A').toUpperCase();
    if (fromRow < 1 || toRow < 1) throw new Error(`Rango inválido (la fila debe ser ≥1): ${tr}`);   // v42e (L4)
    if (fromRow === toRow && fromCol === toCol) return [`${fromRow}${fromCol}`];
    if (fromRow !== toRow && fromCol !== toCol) {
      throw new Error(`Rango inválido: debe variar solo fila o solo columna (${tr})`);
    }
    if (fromRow === toRow) {
      const a = fromCol.charCodeAt(0), b = toCol.charCodeAt(0);
      if (a > b) throw new Error(`Rango invertido: ${tr}`);
      const out: string[] = [];
      for (let c = a; c <= b; c++) out.push(`${fromRow}${String.fromCharCode(c)}`);
      return out;
    } else {
      if (fromRow > toRow) throw new Error(`Rango invertido: ${tr}`);
      const out: string[] = [];
      for (let r = fromRow; r <= toRow; r++) out.push(`${r}${fromCol}`);
      return out;
    }
  }
  return [normalizeRef(tr)];
}

/** Parsea el body de `numerico-gr<N>[…]`. Soporta legacy (`x:…-y:…`) y formato
 *  con `|` (v32: secciones x, y, y2, y3, xt, yt, t, ly, ly2, ly3, bandalo,
 *  bandahi, ajuste). Claves desconocidas → null (fail-safe). */
function parseGraphBody(body: string): {
  x: string; y: string; title?: string; xAxisTitle?: string; yAxisTitle?: string;
  y2?: string; y3?: string; ly?: string; ly2?: string; ly3?: string;
  bandalo?: string; bandahi?: string; ajuste?: string; alto?: number;
} | null {
  if (body.includes('|')) {
    const sections: Record<string, string> = {};
    for (const seg of body.split('|')) {
      // Claves largas primero para que la alternancia no corte (`bandalo` antes que `y`).
      const m = seg.match(/^\s*(bandalo|bandahi|ajuste|alto|ly2|ly3|ly|xt|yt|y2|y3|x|y|t)\s*:(.*)$/i);
      if (!m) return null;
      sections[m[1].toLowerCase()] = m[2].trim();
    }
    if (!sections.x || !sections.y) return null;
    // La banda requiere ambos límites; uno solo es una ficha mal escrita.
    if ((sections.bandalo && !sections.bandahi) || (!sections.bandalo && sections.bandahi)) return null;
    if (sections.ajuste && !GRAPH_FITS.has(sections.ajuste.toLowerCase())) return null;
    // alto: proporción alto/ancho en % — entero entre 30 y 150.
    let alto: number | undefined;
    if (sections.alto) {
      if (!/^\d+$/.test(sections.alto)) return null;
      alto = parseInt(sections.alto, 10);
      if (alto < 30 || alto > 150) return null;
    }
    return {
      x: sections.x,
      y: sections.y,
      xAxisTitle: sections.xt || undefined,
      yAxisTitle: sections.yt || undefined,
      title: sections.t || undefined,
      y2: sections.y2 || undefined,
      y3: sections.y3 || undefined,
      ly: sections.ly || undefined,
      ly2: sections.ly2 || undefined,
      ly3: sections.ly3 || undefined,
      bandalo: sections.bandalo || undefined,
      bandahi: sections.bandahi || undefined,
      ajuste: sections.ajuste ? sections.ajuste.toLowerCase() : undefined,
      alto,
    };
  }
  const m = body.match(/^x:([^-]+)-y:(.+)$/i);
  if (!m) return null;
  return { x: m[1].trim(), y: m[2].trim() };
}

function parseHeaderSegment(seg: string): { from: number; to: number; title: string } | null {
  const m = seg.trim().match(RE_COL);
  if (!m) return null;
  const from = m[1].toUpperCase().charCodeAt(0) - 65;
  const to = m[2] ? m[2].toUpperCase().charCodeAt(0) - 65 : from;
  if (to < from) return null;          // span invertido
  if (to > 25) return null;            // fuera de A-Z
  return { from, to, title: m[3] };
}

function parseCellSegment(seg: string): NumericCellSpec | null {
  let m = seg.trim();

  // Celda en blanco intencional (`////` o `// //`).
  if (m === '') return { kind: 'blank' };

  // Sufijos opcionales al final, en CUALQUIER orden: `:norma[…]`, `:oculto`,
  // `:nopdf`. Se separan en bucle antes de probar los kinds, así
  // `numerico-fx[x]:[0:100]:nopdf:norma[ASTM]` parsea bien.
  let normaRef: string | undefined;
  let hidden = false;
  let noReport = false;
  let decimals: number | undefined;
  for (let changed = true; changed; ) {
    changed = false;
    const nm = m.match(RE_NORMA_SUFFIX);
    if (nm) { normaRef = nm[1].trim(); m = m.slice(0, nm.index).trim(); changed = true; continue; }
    const dm = m.match(RE_DEC_SUFFIX);
    if (dm) {
      const n = parseInt(dm[1], 10);
      if (n > 6) return null;   // fuera de 0–6 → celda inválida (fail-safe)
      decimals = n;
      m = m.slice(0, dm.index).trim();
      changed = true;
      continue;
    }
    const fl = m.match(RE_FLAG_SUFFIX);
    if (fl) {
      if (/^oculto$/i.test(fl[1])) hidden = true; else noReport = true;
      m = m.slice(0, fl.index).trim();
      changed = true;
    }
  }
  // `:oculto` implica `:nopdf` (lo que no se ve en la app tampoco va al reporte).
  const withNorma = <T extends NumericCellSpec>(spec: T): T => ({
    ...spec,
    ...(normaRef ? { normaRef } : {}),
    ...(hidden ? { hidden: true, noReport: true } : {}),
    ...(noReport ? { noReport: true } : {}),
    ...(decimals != null ? { decimals } : {}),
  });

  // v33 — ingreso libre (probar antes de RE_MANUAL: corchetes vacíos).
  if (RE_FREE.test(m)) return withNorma({ kind: 'free' });
  if (RE_TEXT.test(m)) return withNorma({ kind: 'text' });

  const mt = m.match(RE_MANUAL);
  if (mt) {
    const min = numOf(mt[1]), max = numOf(mt[2]);
    if (isFinite(min) && isFinite(max) && min <= max) return withNorma({ kind: 'manual', range: { min, max } });
    return null;
  }

  const fm = m.match(RE_FX);
  if (fm) {
    const expr = fm[1].trim();
    let range: { min: number; max: number } | null = null;
    if (fm[2] != null && fm[3] != null) {
      const min = numOf(fm[2]), max = numOf(fm[3]);
      if (isFinite(min) && isFinite(max) && min <= max) range = { min, max };
    }
    return withNorma({ kind: 'formula', expr, range });
  }

  // ── v32: tipos de campo nuevos ───────────────────────────────────────
  if (RE_BOOL.test(m)) return withNorma({ kind: 'bool' });
  if (RE_DATE.test(m)) return withNorma({ kind: 'date' });
  if (RE_TIME.test(m)) return withNorma({ kind: 'time' });
  if (RE_CODE.test(m)) return withNorma({ kind: 'code' });   // v31 (Parte E)

  // v45 — celda de llamada a otra ficha (selector / self / get; multi + op).
  const xm = m.match(RE_XREF_CELL);
  if (xm) {
    const multi = !!xm[1];
    const content = xm[2].trim();
    let targetKey: string | undefined;
    if (xm[3] != null) {
      targetKey = parseXrefKey(`${xm[3]}${xm[4] ?? ''}`) ?? undefined;
      if (!targetKey) return null;   // fila/celda destino inválida (p. ej. 0) → celda inválida
    }
    const op = xm[5] ? parseXrefOp(xm[5]) : undefined;
    if (xm[5] && !op) return null;   // operador presente pero inválido → celda inválida (fail-safe)
    if (content.startsWith('#')) {
      // puller: lee el/los código(s) de la celda selectora `content` y opera sobre targetKey.
      if (!targetKey) return null;  // un puller siempre necesita celda destino
      const sourceRef = parseXrefKey(content.slice(1));
      if (!sourceRef) return null;  // celda selectora inválida (p. ej. #0)
      return withNorma({ kind: 'xref', mode: 'get', sourceRef, targetKey, ...(op ? { op } : {}), filter: {} });
    }
    // self / select: un operador aquí no tiene sentido (solo aplica a `get`) → rechazar.
    if (op) return null;
    const tipo = content;
    if (!targetKey) return withNorma({ kind: 'xref', mode: 'select', ...(multi ? { multi: true } : {}), filter: tipo ? { tipo } : {} });
    return withNorma({ kind: 'xref', mode: 'self', targetKey, filter: tipo ? { tipo } : {} });
  }

  const pm = m.match(RE_PERCENT);
  if (pm) {
    const min = numOf(pm[1]), max = numOf(pm[2]);
    if (isFinite(min) && isFinite(max) && min <= max) return withNorma({ kind: 'percent', range: { min, max } });
    return null;
  }

  const em = m.match(RE_EQUIP);
  if (em) {
    const equipType = em[1].trim();
    if (!equipType) return null;
    return withNorma({ kind: 'equipment', equipType });
  }

  // Lista desde matriz: list-[M1[A]] o list-[M1[#1A:#10A]] (probar antes de inline)
  const lmm = m.match(RE_LIST_MATRIX);
  if (lmm) {
    const matrixId = lmm[1];
    const colSpec = lmm[2].trim();
    // v41 — Tabla auxiliar del PROYECTO: `list-[@taras[Codigo]]` (columna por NOMBRE).
    if (matrixId.startsWith('@')) {
      const tableKey = matrixId.slice(1).toLowerCase();
      if (!tableKey || !colSpec) return null;
      return withNorma({ kind: 'list', source: { type: 'project-table', tableKey, column: colSpec } });
    }
    if (/^[A-Za-z]$/.test(colSpec)) {
      return withNorma({ kind: 'list', source: { type: 'matrix-col', matrixId, col: colSpec.toUpperCase() } });
    }
    const rangeMatch = colSpec.match(/^#?(\d+)([A-Za-z])?:#?(\d+)([A-Za-z])?$/);
    if (rangeMatch) {
      const fromRow = parseInt(rangeMatch[1], 10);
      const fromCol = (rangeMatch[2] ?? 'A').toUpperCase();
      const toRow = parseInt(rangeMatch[3], 10);
      const toCol = (rangeMatch[4] ?? 'A').toUpperCase();
      if (fromCol !== toCol || fromRow > toRow) return null;
      return withNorma({ kind: 'list', source: { type: 'matrix-range', matrixId, col: fromCol, fromRow, toRow } });
    }
    return null;
  }

  // Lista inline: list-[a, b, c]
  const lim = m.match(RE_LIST_INLINE);
  if (lim) {
    const values = lim[1].split(',').map(s => s.trim()).filter(s => s.length > 0);
    if (values.length === 0) return null;
    return withNorma({ kind: 'list', source: { type: 'inline', values } });
  }

  // Lookup: lookup-[#1A, M1, A, B]
  const lkm = m.match(RE_LOOKUP);
  if (lkm) {
    const ref = lkm[1].trim();
    // v42e (L1) — el 1er argumento de lookup DEBE ser una referencia de celda con `#`
    // (`lookup-[#1A, M1, A, B]`). Un número pelado (`lookup-[5, ...]`) se interpretaba
    // en silencio como ref a la celda 5A; ahora se rechaza para evitar el lookup erróneo.
    if (!ref.startsWith('#')) return null;
    try {
      const refKey = normalizeRef(ref);
      return withNorma({
        kind: 'lookup',
        refKey,
        matrixId: lkm[2],
        searchCol: lkm[3].toUpperCase(),
        returnCol: lkm[4].toUpperCase(),
      });
    } catch {
      return null;
    }
  }

  // Comentario predefinido: comment-[opt1, opt2, opt3]
  const cm = m.match(RE_COMMENT);
  if (cm) {
    const opts = cm[1].split(',').map(s => s.trim()).filter(s => s.length > 0);
    if (opts.length === 0) return null;
    return withNorma({ kind: 'comment', options: opts });
  }

  // Valor literal de celda dentro de una fila de datos mixta
  // (`val-[50] // numerico-[...] // ...`). Solo-lectura. No confundir con las
  // filas matrix-data (todas-val), que se detectan a nivel de fila más arriba.
  const vm = m.match(RE_VAL);
  if (vm) return withNorma({ kind: 'val', literal: vm[1] });

  return null;
}

/** v42e (M1) — Separa una fila por el delimitador de celdas `//` IGNORANDO los `//`
 *  que estén dentro de corchetes `[...]`. Antes un literal legítimo como
 *  `val-[3//8 pulg]` se partía en dos celdas (o invalidaba toda la ficha). Mantiene
 *  exactamente el mismo resultado que `split('//')` para las celdas en blanco
 *  (`////`, `// //`), que no llevan corchetes. */
function splitCells(s: string): string[] {
  const out: string[] = [];
  let depth = 0, last = 0;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === '[') depth++;
    else if (ch === ']') { if (depth > 0) depth--; }
    else if (ch === '/' && s[i + 1] === '/' && depth === 0) {
      out.push(s.slice(last, i));
      i++;            // saltar la segunda `/`
      last = i + 1;
    }
  }
  out.push(s.slice(last));
  return out;
}

/** Parsea un segmento `val-[<literal>]`. Devuelve null si no matchea. */
function parseValSegment(seg: string): string | null {
  const m = seg.trim().match(RE_VAL);
  return m ? m[1] : null;
}

/** Parser principal de fila: split por `//` y reconoce graph (fila completa) o
 *  fila multi-celda. Devuelve null si algún segmento no matchea (→ no numérico). */
export function parseNumericRow(method: string | null | undefined): NumericRowSpec | null {
  if (!method) return null;
  const trimmed = method.trim();
  if (!trimmed) return null;

  // Directiva paramétrica `repeat-[grupo:min:max:default]` (v25).
  if (/^repeat-\[/i.test(trimmed)) {
    if (trimmed.includes('//')) return null;
    const m = trimmed.match(RE_REPEAT_DIR);
    if (!m) return null;
    const min = parseInt(m[2], 10), max = parseInt(m[3], 10), def = parseInt(m[4], 10);
    if (min < 1 || max < min || def < min || def > max) return null;
    return { kind: 'repeat-directive', groupId: m[1], min, max, defaultN: def };
  }

  // Matrix-header: el primer segmento es `matrix-[Mx]`, el resto son `col-[…]`
  // que describen las columnas de la matriz. Reusa el parser de col-header.
  if (/^matrix-\[/i.test(trimmed)) {
    const segs = splitCells(trimmed);
    const first = segs[0].trim();
    const mhMatch = first.match(RE_MATRIX_HDR);
    if (!mhMatch) return null;
    const matrixId = mhMatch[1];
    const spans: { from: number; to: number; title: string }[] = [];
    const seen = new Set<number>();
    for (let i = 1; i < segs.length; i++) {
      const sp = parseHeaderSegment(segs[i]);
      if (!sp) return null;
      for (let c = sp.from; c <= sp.to; c++) {
        if (seen.has(c)) return null;
        seen.add(c);
      }
      spans.push(sp);
    }
    if (spans.length === 0) return null;
    return { kind: 'matrix-header', matrixId, spans };
  }

  // Matrix-data: SOLO si TODOS los segmentos son `val-[…]`. Si la fila empieza
  // con `val-[` pero mezcla otros tipos (`val-[50] // numerico-[...]`), NO es
  // matrix-data: cae al parser de fila regular abajo, que ahora reconoce celdas
  // `val` de solo-lectura.
  if (/^val-\[/i.test(trimmed)) {
    const segs = splitCells(trimmed);
    const parsedVals = segs.map(parseValSegment);
    if (parsedVals.every(v => v !== null)) {
      const values = parsedVals as string[];
      if (values.length > 0) return { kind: 'matrix-data', values };
    }
    // fila mixta → continúa al parser de celdas regular más abajo
  }

  // Header (encabezado de columna). Si la fila empieza con `col-[` interpretamos
  // todos los segmentos como header. Si alguno no matchea o hay solapamiento de
  // spans → devolvemos null y el protocolo cae al clásico (fail-safe).
  if (/^col-\[/i.test(trimmed)) {
    const segs = splitCells(trimmed);
    const spans: { from: number; to: number; title: string }[] = [];
    const seen = new Set<number>();
    for (const seg of segs) {
      const sp = parseHeaderSegment(seg);
      if (!sp) return null;
      for (let c = sp.from; c <= sp.to; c++) {
        if (seen.has(c)) return null;    // solapamiento entre spans
        seen.add(c);
      }
      spans.push(sp);
    }
    if (spans.length === 0) return null;
    return { kind: 'header', spans };
  }

  // Gráfico: debe ser el único segmento de la fila (no admite `//`).
  const gm = trimmed.match(RE_GR);
  if (gm) {
    if (trimmed.includes('//')) return null;
    const mode = GR_MODES[gm[1]];
    if (!mode) return null;
    const body = parseGraphBody(gm[2]);
    if (!body) return null;
    let xRefs: string[];
    let yRefs: string[];
    let y2Refs: string[] | undefined;
    let y3Refs: string[] | undefined;
    let bandLoRefs: string[] | undefined;
    let bandHiRefs: string[] | undefined;
    try {
      const expand = (s: string) => s.split(',').flatMap(x => expandRefOrRange(x));
      xRefs = expand(body.x);
      yRefs = expand(body.y);
      if (body.y2) y2Refs = expand(body.y2);
      if (body.y3) y3Refs = expand(body.y3);
      if (body.bandalo) bandLoRefs = expand(body.bandalo);
      if (body.bandahi) bandHiRefs = expand(body.bandahi);
    } catch {
      return null;
    }
    // y3 sin y2 no tiene sentido (orden de series roto) → fail-safe.
    if (y3Refs && !y2Refs) return null;
    const hasLabels = body.ly || body.ly2 || body.ly3;
    return {
      kind: 'graph', mode, xRefs, yRefs,
      title: body.title, xAxisTitle: body.xAxisTitle, yAxisTitle: body.yAxisTitle,
      y2Refs, y3Refs,
      seriesLabels: hasLabels ? [body.ly, body.ly2, body.ly3] : undefined,
      bandLoRefs, bandHiRefs,
      fit: body.ajuste as NumericGraphFit | undefined,
      aspectPct: body.alto,
    };
  }

  // Si contiene `//` pero algún segmento es gráfico, inválido.
  const segments = splitCells(trimmed);
  const cells: NumericCellSpec[] = [];
  for (const seg of segments) {
    if (RE_GR.test(seg.trim())) return null; // gráfico mezclado con `//`
    const cell = parseCellSegment(seg);
    if (!cell) return null;
    cells.push(cell);
  }
  if (cells.length === 0) return null;
  if (cells.length > 26) return null; // máx A-Z
  return { kind: 'row', cells };
}

/** Backwards-compat: devuelve la spec de la primera celda (o graph) de la fila.
 *  Para llamadas legacy que solo necesitan saber el tipo de la fila. Headers
 *  devuelven null (los consumidores legacy no los conocen). */
export function parseNumericItem(method: string | null | undefined): NumericSpec | null {
  const row = parseNumericRow(method);
  if (!row) return null;
  if (row.kind === 'graph') return row;
  if (row.kind === 'header' || row.kind === 'matrix-header' || row.kind === 'matrix-data' || row.kind === 'repeat-directive') return null;
  const c = row.cells[0];
  if (!c) return null;
  // Solo manual/formula son shapes que el legacy `NumericSpec` conoce.
  if (c.kind === 'manual' || c.kind === 'formula') return c;
  return null;
}

/** Separa las primeras (hasta 3) filas de header del resto. Si después de un
 *  data row aparece otra header → devuelve `valid:false` y el caller debe caer
 *  al flujo clásico. */
/** Fusiona filas de header consecutivas cuyas columnas son DISJUNTAS en un mismo
 *  nivel visual. Cada `col-[…]` llega como un item/fila separado, así que
 *  `col-[A][Tamaño (mm)]` + `col-[B][% Pasa]` se apilaban en dos niveles distintos.
 *  Al no compartir columnas, se combinan en UNA sola fila de títulos lado a lado.
 *  Los headers que SÍ se solapan (jerárquicos, p.ej. "Medidas" A:C encima de
 *  "Ancho/Largo/Alto") quedan en niveles separados, preservando la jerarquía.
 *  Cap defensivo de 3 niveles. */
export function mergeHeaderSpecs(rawHeaders: NumericHeaderSpec[]): NumericHeaderSpec[] {
  const merged: NumericHeaderSpec[] = [];
  let curSpans: { from: number; to: number; title: string }[] = [];
  let curCols = new Set<number>();
  const flush = () => {
    if (curSpans.length) merged.push({ kind: 'header', spans: curSpans.slice().sort((a, b) => a.from - b.from) });
    curSpans = [];
    curCols = new Set();
  };
  for (const h of rawHeaders) {
    const hCols: number[] = [];
    for (const s of h.spans) for (let c = s.from; c <= s.to; c++) hCols.push(c);
    if (!hCols.every((c) => !curCols.has(c))) flush();   // solapa → nuevo nivel
    for (const s of h.spans) curSpans.push(s);
    for (const c of hCols) curCols.add(c);
  }
  flush();
  // v42e (L2) — el DSL soporta como máximo 3 niveles visuales de encabezado.
  // Antes los niveles 4+ se descartaban en SILENCIO (desaparecían de tabla y PDF
  // sin aviso). Ahora se registra una advertencia para que el autor lo note.
  if (merged.length > 3) {
    console.warn(`[numericProtocol] Encabezado con ${merged.length} niveles: solo se muestran 3 (límite del DSL). Niveles 4+ descartados.`);
  }
  return merged.slice(0, 3);
}

export function extractHeaderRows<T extends { spec: NumericRowSpec | null }>(
  parsedRows: T[],
): { headerRows: NumericHeaderSpec[]; dataRows: T[]; valid: boolean } {
  const rawHeaders: NumericHeaderSpec[] = [];
  let i = 0;
  while (i < parsedRows.length && parsedRows[i].spec?.kind === 'header') {
    rawHeaders.push(parsedRows[i].spec as NumericHeaderSpec);
    i++;
  }
  const dataRows = parsedRows.slice(i);
  // v34 — Los headers DESPUÉS de datos ya son válidos: inician una nueva sección
  // con su propio número de columnas (ver groupIntoSections). Esta función solo
  // reporta los headers INICIALES (consumidores legacy / títulos de gráficos).
  return { headerRows: mergeHeaderSpecs(rawHeaders), dataRows, valid: true };
}

/** v34 — Sección visual de la tabla numérica (Mejora 1: columnas variables).
 *  Una fila `col-[…]` (o un cambio del campo `section`) inicia una sección
 *  nueva; el número de columnas de CADA sección es el máximo entre sus propias
 *  filas — así conviven secciones de 1 columna con secciones de 4 sin que las
 *  angostas hereden columnas fantasma. */
export interface NumericSectionGroup<T> {
  /** Título de la banda (campo `section` del primer item de la sección). */
  title: string | null;
  /** Headers `col-[…]` propios de la sección, ya fusionados por niveles. */
  headerRows: NumericHeaderSpec[];
  /** Filas de la sección (kind 'row' y 'graph'; el resto se omite). */
  rows: T[];
  /** Máximo de columnas entre las filas 'row' de la sección (mínimo 1). */
  maxCols: number;
}

export function groupIntoSections<T extends { spec: NumericRowSpec | null; item: { section?: string | null } }>(
  mainRows: T[],
): NumericSectionGroup<T>[] {
  type Acc = { title: string | null; rawHeaders: NumericHeaderSpec[]; rows: T[] };
  const out: Acc[] = [];
  let cur: Acc | null = null;
  const push = () => { if (cur && (cur.rawHeaders.length || cur.rows.length)) out.push(cur); };

  for (const r of mainRows) {
    const kind = r.spec?.kind;
    const sec = (r.item.section ?? '').trim() || null;
    if (kind === 'header') {
      // Un header inicia sección nueva, salvo que la actual aún no tenga datos
      // (headers consecutivos del mismo bloque se acumulan).
      if (!cur || cur.rows.length > 0) { push(); cur = { title: sec, rawHeaders: [], rows: [] }; }
      if (cur.title == null && sec) cur.title = sec;
      cur.rawHeaders.push(r.spec as NumericHeaderSpec);
      continue;
    }
    if (kind !== 'row' && kind !== 'graph') continue;   // matrix/repeat no son visibles
    if (!cur) {
      cur = { title: sec, rawHeaders: [], rows: [] };
    } else if (sec != null && cur.title != null && sec !== cur.title && cur.rows.length > 0) {
      // Cambio de sección sin header propio → sección nueva (hereda 1..n cols propias).
      push();
      cur = { title: sec, rawHeaders: [], rows: [] };
    } else if (cur.title == null && sec != null) {
      cur.title = sec;
    }
    cur.rows.push(r);
  }
  push();

  return out.map((s) => {
    let maxCols = 1;
    for (const r of s.rows) {
      if (r.spec?.kind === 'row') maxCols = Math.max(maxCols, r.spec.cells.length);
    }
    // Los headers también definen columnas (una sección puede declarar 4 cols
    // aunque sus primeras filas tengan menos celdas llenas).
    for (const h of s.rawHeaders) {
      for (const sp of h.spans) maxCols = Math.max(maxCols, sp.to + 1);
    }
    return { title: s.title, headerRows: mergeHeaderSpecs(s.rawHeaders), rows: s.rows, maxCols };
  });
}

/** Separa filas `matrix-header` + `matrix-data` del final del protocolo en
 *  un dict `{matrixId: MatrixData}`. Las main rows (row/graph) quedan separadas.
 *  Una vez encontrado el primer `matrix-header`, todas las filas siguientes deben
 *  ser matrix-header o matrix-data; cualquier otra cosa marca `valid:false`. */
export function extractMatrices<T extends { spec: NumericRowSpec | null }>(
  parsedRows: T[],
): { mainRows: T[]; matrices: Record<string, MatrixData>; valid: boolean } {
  const mainRows: T[] = [];
  const matrices: Record<string, MatrixData> = {};
  let i = 0;
  // Primera fase: acumular filas main (row/graph) hasta encontrar la primera matrix-header
  while (i < parsedRows.length) {
    const k = parsedRows[i].spec?.kind;
    if (k === 'matrix-header') break;
    if (k === 'matrix-data') {
      // v35 — Una fila todo-`val-` ANTES de cualquier `matrix-[…]` no pertenece
      // a una matriz: es una fila de DATOS FIJOS (p.ej. "Peso del molde:
      // val-[4111.7]"). Se reinterpreta como fila normal de celdas val para que
      // sus valores entren al scope y las fórmulas puedan referenciarlos.
      const md = parsedRows[i].spec as NumericMatrixDataSpec;
      const asRow: NumericRowSpec = {
        kind: 'row',
        cells: md.values.map(v => ({ kind: 'val', literal: v })),
      };
      mainRows.push({ ...parsedRows[i], spec: asRow });
      i++;
      continue;
    }
    mainRows.push(parsedRows[i]);
    i++;
  }
  // Segunda fase: procesar bloques de matrices
  let currentId: string | null = null;
  while (i < parsedRows.length) {
    const spec = parsedRows[i].spec;
    if (spec?.kind === 'matrix-header') {
      // v42e (M4) — un id de matriz repetido sobrescribía la matriz anterior
      // (perdía sus títulos/filas) y los lookups consultaban datos equivocados.
      if (matrices[spec.matrixId]) return { mainRows, matrices, valid: false };
      currentId = spec.matrixId;
      // Inicializa la matriz con los títulos de columna (expande spans)
      const columnTitles: string[] = [];
      for (const span of spec.spans) {
        for (let c = span.from; c <= span.to; c++) {
          // span con varias cols repite el título (caso raro pero lo dejamos vacío salvo en la primera)
          columnTitles[c] = c === span.from ? span.title : '';
        }
      }
      // Padea las columnas no cubiertas con vacío
      const maxCol = spec.spans.reduce((m, s) => Math.max(m, s.to), -1);
      for (let c = 0; c <= maxCol; c++) {
        if (columnTitles[c] === undefined) columnTitles[c] = '';
      }
      matrices[currentId] = { id: currentId, columnTitles, rows: [] };
    } else if (spec?.kind === 'matrix-data') {
      if (!currentId) return { mainRows, matrices, valid: false };
      // v42e (M3) — la fila de datos debe tener exactamente tantas columnas como
      // declaró el header; un ancho distinto hacía que list/lookup devolvieran la
      // columna equivocada en silencio.
      if (spec.values.length !== matrices[currentId].columnTitles.length) {
        return { mainRows, matrices, valid: false };
      }
      matrices[currentId].rows.push([...spec.values]);
    } else {
      // Cualquier otra cosa (row/graph/header) en el bloque de matrices → inválido
      return { mainRows, matrices, valid: false };
    }
    i++;
  }
  return { mainRows, matrices, valid: true };
}

export function isNumericProtocol(items: { validation_method: string | null }[]): boolean {
  // v31 — Antes exigíamos que TODOS los items tuvieran validation_method numérico
  // (.every). Resultado: si una plantilla tenía un encabezado de sección o un
  // item sin validation_method (NULL), todo el protocolo se clasificaba como
  // subjetivo aunque la mayoría fueran numéricos. Bug reportado por usuario.
  //
  // Fix: ignorar items sin validation_method y exigir que TODOS los que SÍ tienen
  // matcheen el parser numérico estricto. Requiere ≥1 item con validation_method.
  const withValidation = items.filter(i => i.validation_method != null && String(i.validation_method).trim() !== '');
  if (withValidation.length === 0) return false;
  const specs = withValidation.map(i => parseNumericRow(i.validation_method));
  if (specs.some(s => s === null)) return false;
  // v42e (M2) — además de que todo parsee, exigir ≥1 fila de DATOS (kind 'row') o
  // un gráfico. Sin esto, una plantilla con typos que dejó todas las filas como
  // headers/matrix/repeat entraba a modo numérico mostrando una tabla SIN inputs
  // que luego se podía "aprobar" vacía.
  const hasData = specs.some(s => s?.kind === 'row' || s?.kind === 'graph');
  return hasData;
}

/** Diagnóstico de items inválidos en un protocolo con intención numérica. Si
 *  el usuario probablemente cometió un typo en algún item, necesita saber cuál
 *  para corregirlo. Si TODOS los items son no-numéricos (protocolo clásico real),
 *  esta función devuelve [] y no se muestra banner. */
export function diagnoseInvalidNumericItems(
  items: { partida_item: string | null; validation_method: string | null }[],
): { partidaItem: string | null; method: string | null; idx: number }[] {
  if (items.length === 0) return [];
  // Cuenta cuántos items SÍ son numéricos. Si son 0, es un protocolo clásico real
  // (sin intención de ser numérico) — no hay diagnóstico que mostrar.
  let validNumeric = 0;
  const invalid: { partidaItem: string | null; method: string | null; idx: number }[] = [];
  items.forEach((it, idx) => {
    const spec = parseNumericRow(it.validation_method);
    if (spec) validNumeric++;
    else invalid.push({ partidaItem: it.partida_item, method: it.validation_method, idx: idx + 1 });
  });
  // Solo retornamos diagnóstico si HAY items numéricos válidos — eso prueba que
  // el usuario intentó hacer un protocolo numérico pero unos pocos fallaron.
  return validNumeric > 0 ? invalid : [];
}

export function inRange(v: number, r: { min: number; max: number }): boolean {
  return v >= r.min && v <= r.max;
}

/** Parsea un string a número aceptando coma o punto. Devuelve null si vacío o inválido. */
export function parseNumeric(s: string | null | undefined): number | null {
  if (s == null) return null;
  const trimmed = String(s).trim();
  if (trimmed === '') return null;
  const n = Number(trimmed.replace(',', '.'));
  return isFinite(n) ? n : null;
}

/** v32 — Valida texto de celda `fecha-[]`: dd/mm/aaaa con fecha real. */
export function isValidDateText(s: string): boolean {
  const m = s.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return false;
  const d = parseInt(m[1], 10), mo = parseInt(m[2], 10), y = parseInt(m[3], 10);
  if (mo < 1 || mo > 12 || d < 1) return false;
  const daysInMonth = new Date(y, mo, 0).getDate();
  return d <= daysInMonth;
}

/** v32 — Valida texto de celda `hora-[]`: HH:MM (00-23:00-59). */
export function isValidTimeText(s: string): boolean {
  const m = s.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return false;
  const h = parseInt(m[1], 10), mi = parseInt(m[2], 10);
  return h >= 0 && h <= 23 && mi >= 0 && mi <= 59;
}

/** Divide el `comments` de una fila multi-celda en sus valores posicionales.
 *  Padea con "" hasta `expectedCells`. Si no hay `//` y expectedCells===1,
 *  trata todo el string como una sola celda (backwards compat). */
export function splitRowComments(comments: string | null | undefined, expectedCells: number): string[] {
  const raw = comments ?? '';
  const parts = raw.includes('//') ? raw.split('//') : [raw];
  const out = parts.map(s => s.trim());
  while (out.length < expectedCells) out.push('');
  return out.slice(0, expectedCells);
}

/** Re-une los valores de una fila multi-celda en un solo string. Conserva
 *  trailing empties (`["1.5", ""]` → `"1.5//"`). Si solo hay una celda y
 *  ningún `//` previo, devuelve el valor crudo (sin separador). */
export function joinRowComments(values: string[]): string {
  if (values.length === 0) return '';
  if (values.length === 1) return values[0];
  return values.join('//');
}

/** Letra de columna por índice (0→A, 1→B, …, 25→Z). */
export function colLetter(idx: number): string {
  return String.fromCharCode(65 + idx);
}

/** v33 — Deriva los títulos de eje de un gráfico desde los encabezados de
 *  columna del protocolo cuando el spec no los declara (`xt:`/`yt:`).
 *
 *  Lógica: si TODAS las refs de una serie comparten columna (lo normal:
 *  `x:#3A:#12A` → columna A), el título es el span de `col-[A][Tamaño (mm)]`
 *  que cubre esa columna. Los títulos explícitos del spec SIEMPRE ganan.
 *  Sin encabezado ni título explícito → undefined (no se inventa texto). */
export function deriveAxisTitles(
  graph: Extract<NumericRowSpec, { kind: 'graph' }>,
  headerRows: NumericHeaderSpec[],
): { xAxisTitle?: string; yAxisTitle?: string } {
  const colIdxOf = (refs: string[]): number | null => {
    let col: string | null = null;
    for (const r of refs) {
      const c = r.slice(-1).toUpperCase();
      if (c < 'A' || c > 'Z') return null;
      if (col == null) col = c;
      else if (col !== c) return null;   // refs en columnas mezcladas → sin título
    }
    return col != null ? col.charCodeAt(0) - 65 : null;
  };
  const titleFor = (colIdx: number | null): string | undefined => {
    if (colIdx == null) return undefined;
    for (const hr of headerRows) {
      const span = hr.spans.find(s => colIdx >= s.from && colIdx <= s.to);
      const t = span?.title.trim();
      if (t) return t;
    }
    return undefined;
  };
  return {
    xAxisTitle: graph.xAxisTitle ?? titleFor(colIdxOf(graph.xRefs)),
    yAxisTitle: graph.yAxisTitle ?? titleFor(colIdxOf(graph.yRefs)),
  };
}

/** Convierte refs `#<row><col?>` y rangos `#<r1><c?>:#<r2><c?>` a estilo Excel
 *  (`#1A` → `A1`, `#1F:#3F` → `F1:F3`). Inserta zero-width-spaces (​)
 *  después de operadores, comas y paréntesis: dan al navegador "puntos de
 *  corte permitidos" SOLO ahí, así nunca se rompe una referencia como `A1`
 *  por la mitad cuando la celda es angosta. Solo afecta visualización. */
export function formatFormulaExcelStyle(expr: string): string {
  return expr
    .replace(/#(\d+)([A-Za-z]?)/g, (_, row, col) => (col ? col.toUpperCase() : 'A') + row)
    .replace(/([+\-*/^,)])/g, '$1​');
}

/** v42e (L3) — Formato compartido de una celda CALCULADA (formula/lookup) para que
 *  móvil y web muestren el MISMO número. Con `:dec[n]` usa esos decimales; sin él,
 *  el fallback histórico de móvil: 0 decimales si |v|≥100, 2 decimales si no.
 *  (Antes la web caía siempre a toFixed(2) → el mismo dato se veía distinto.) */
export function formatComputed(v: number, decimals?: number): string {
  if (!Number.isFinite(v)) return '—';
  if (decimals != null) return v.toFixed(decimals);
  return Math.abs(v) >= 100 ? v.toFixed(0) : v.toFixed(2);
}

/** Construye la clave de scope para una celda.
 *  - partida_item numérico (`1`, `2`, …) → `1A`, `1B`, … (admite multi-col)
 *  - partida_item alfanumérico (`PA-1`, etc.) → `PA-1A`, `PA-1B`, … (admite multi-col)
 *  Antes alfanuméricos colisionaban en multi-celda; agregar la letra es seguro
 *  porque el lexer SOLO acepta `#<dígitos>` para refs de fórmula. */
export function scopeKeyFor(partidaItem: string, colIdx: number): string {
  const partida = (partidaItem ?? '').trim();
  return partida + colLetter(colIdx);
}
