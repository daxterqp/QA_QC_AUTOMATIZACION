// Generador de HTML para protocolos NUMÉRICOS en el PDF del dossier (Parte B).
//
// El PDF debe verse IGUAL en estructura al audit page: secciones con banda de
// título, tabla por sección con encabezados `col-[…]`, fila de letras (A, B,
// C…), una columna por celda y ✓/✗ por fila; gráficos numerados a lo ancho.
//
// Espejo ×2 (byte-idéntico): `src/utils/numericPdfHtml.ts` (móvil) y
// `flow-qaqc-web/lib/numericPdfHtml.ts` (web/PDF puppeteer). Solo usa imports
// relativos a sus hermanos espejo — sin React, sin Tailwind: estilos inline.
//
// Devuelve BLOQUES con peso (filas ≈ 1, gráfico ≈ 9) para que cada generador
// pagine: acumula bloques hasta el presupuesto de la página y arranca otra
// repitiendo el header del protocolo. Un bloque nunca se parte por la mitad —
// las secciones largas ya vienen troceadas en sub-tablas que repiten encabezado.

import {
  parseNumericRow, extractMatrices, groupIntoSections, splitRowComments,
  scopeKeyFor, inRange, deriveAxisTitles,
  type NumericRowSpec, type NumericCellSpec, type NumericHeaderSpec,
  type NumericSectionGroup,
} from './numericProtocol';
import { resolveScopeCells, type ScopeCell, type Scope, type XrefValues } from './formulaEval';
import { renderChartSvg } from './chartRenderer';

/** Shape plano de un item de protocolo (snake_case, como la web). El móvil
 *  mapea su modelo WatermelonDB (camelCase) a esto antes de llamar. */
export interface NumericPdfItem {
  id: string;
  item_description: string;
  validation_method: string | null;
  partida_item: string | null;
  comments: string | null;
  section?: string | null;
}

/** Bloque atómico de HTML + peso aproximado en "filas de página". */
export interface NumericPdfBlock {
  html: string;
  weight: number;
  /** v43.4 — Tabla DIVISIBLE: si está, el paginador puede partir sus filas entre
   *  columnas (cuando split_tables está activo), repitiendo el head y agregando la
   *  nota "Continuación de:". `html` es el render completo (fallback sin dividir). */
  table?: { band: string; head: string; rows: string[]; title: string };
}

export interface NumericPdfOptions {
  /** Valores xref pre-resueltos (`@HIS-001.5F`). Solo web; en móvil se omite. */
  xrefValues?: XrefValues;
  /** v41 — Tablas auxiliares del proyecto (taras, moldes…) para recomputar BUSCAR(). */
  auxTables?: import('./formulaEval').AuxTables;
  /** Ancho del gráfico en px (default 640 — ancho útil de página A4). */
  chartWidth?: number;
  /** v31 (Parte E) — código correlativo del protocolo, para celdas `codigo-[]`. */
  protocolCode?: string | null;
  /** v43.4 — Escala de fuente de tablas (compacta). Default 1. */
  fontScale?: number;
  /** v43.4 — Envolver cada bloque para distribución en 2 columnas (break-inside:avoid). */
  twoColumn?: boolean;
  /** v43.4 — Marca las tablas como divisibles (el paginador parte filas entre columnas). */
  splitTables?: boolean;
  /** v43.4 — Color de los encabezados de tabla (configurable por tipo). Default navy. */
  headerColor?: string;
}

// ── Constantes de estilo (paleta del dossier) ───────────────────────────────
const NAVY = '#1a4f7a';
/** Azul navy tradicional de la app (Colors.navy) — fondo de cabecera de tabla. */
const HEADER_NAVY = '#0e213d';
const BORDER = '#d8dee6';
const OK_GREEN = '#137333';
const BAD_RED = '#d93025';

/** Máximo de filas de datos por sub-tabla (las secciones largas se trocean
 *  repitiendo encabezados para que la paginación nunca corte una tabla). */
const MAX_ROWS_PER_TABLE_BLOCK = 16;
/** Altura aproximada de una fila compacta en px (unidad de peso de página). */
const ROW_PX = 24;

function escHtml(s: string | null | undefined): string {
  if (!s) return '';
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** v34 — fila 100% oculta (`:oculto` en todas sus celdas no-blank). */
function isRowHidden(spec: Extract<NumericRowSpec, { kind: 'row' }>): boolean {
  return spec.cells.length > 0
    && spec.cells.some(c => c.hidden)
    && spec.cells.every(c => c.hidden || c.kind === 'blank');
}

/** Formato compacto por defecto del PDF (igual al render previo). */
function fmtNum(v: number, decimals?: number): string {
  if (decimals != null) return v.toFixed(decimals);
  return Math.abs(v) >= 100 ? v.toFixed(0) : v.toFixed(2);
}

type ParsedRow = { item: NumericPdfItem; spec: NumericRowSpec | null };

/** Render de UNA celda → contenido del <td> + veredicto de rango (o null). */
function cellInner(
  cell: NumericCellSpec,
  key: string,
  raw: string,
  scope: Scope,
  errors: Record<string, string>,
  protocolCode?: string | null,
): { html: string; ok: boolean | null } {
  // `:oculto` y `:nopdf` no aportan contenido al reporte (celda vacía para
  // preservar la alineación de columnas de la fila).
  if (cell.hidden || cell.noReport) return { html: '', ok: null };
  switch (cell.kind) {
    case 'blank':
      return { html: '', ok: null };
    case 'val':
      return { html: `<b>${escHtml(cell.literal || '—')}</b>`, ok: null };
    case 'code':
      // v31 (Parte E) — código correlativo del ensayo (read-only).
      return { html: `<b style="color:${NAVY};letter-spacing:0.3px;">${escHtml(protocolCode || '—')}</b>`, ok: null };
    case 'bool': {
      const t = raw === '1' ? `<span style="color:${OK_GREEN};font-weight:700;">Sí</span>`
              : raw === '0' ? `<span style="color:${BAD_RED};font-weight:700;">No</span>` : '—';
      return { html: t, ok: null };
    }
    case 'date': case 'time': case 'list': case 'equipment': case 'comment': case 'text':
      return { html: escHtml(raw || '—'), ok: null };
    case 'free': {
      // v33 — numérico libre: muestra el valor (con :dec si aplica) SIN veredicto.
      let v = scope[key];
      if (v == null && raw !== '') { const n = Number(String(raw).replace(',', '.')); if (isFinite(n)) v = n; }
      if (v == null || !isFinite(v)) return { html: escHtml(raw || '—'), ok: null };
      return { html: `<b style="color:#222;">${fmtNum(v, cell.decimals)}</b>`, ok: null };
    }
    case 'lookup': {
      const v = scope[key];
      return { html: v != null && isFinite(v) ? fmtNum(v, cell.decimals) : escHtml(raw || '—'), ok: null };
    }
    case 'manual': case 'percent': case 'formula': {
      const err = cell.kind === 'formula' ? errors[key] : undefined;
      let v = scope[key];
      if (v == null && cell.kind !== 'formula' && raw !== '') {
        const n = Number(String(raw).replace(',', '.'));
        if (isFinite(n)) v = n;
      }
      const range = cell.range;
      if (err) return { html: `<span style="color:${BAD_RED};">⚠</span>`, ok: null };
      if (v == null || !isFinite(v)) {
        return { html: '—', ok: null };
      }
      const pct = cell.kind === 'percent' ? '%' : '';
      const ok = range ? inRange(v, range) : null;
      // v32e — sin check/✗ por celda ni rango [min:max]: solo el valor. La
      // validación se resume en UN único ✓/✗ por fila (columna del extremo
      // derecho); `ok` sigue alimentando ese veredicto.
      return { html: `<b style="color:#222;">${fmtNum(v, cell.decimals)}${pct}</b>`, ok };
    }
    default:
      return { html: '—', ok: null };
  }
}

/** Apertura + cabecera NAVY de la sub-tabla de una sección (v32e).
 *  La cabecera es una franja navy con: `#` · `Actividad` · títulos de columna
 *  (col-[…], con rowspan sobre #/Actividad/✓) · `✓`. SIN la fila de letras
 *  A/B/C/D (eliminada para limpiar el PDF). */
function tableHead(sec: NumericSectionGroup<ParsedRow>, fontScale = 1, headerColor: string = HEADER_NAVY): string {
  const mc = sec.maxCols;
  // v43.4 — Columnas de datos AJUSTADAS al ancho estrictamente necesario (valores
  // numéricos cortos). El sobrante lo absorbe la columna "Actividad" (<col/> sin
  // width fija → en table-layout:fixed toma todo el espacio restante).
  const dw = Math.round((mc === 1 ? 80 : mc <= 3 ? 58 : 48) * fontScale);
  let cols = `<col style="width:24px;"/><col/>`;
  for (let i = 0; i < mc; i++) cols += `<col style="width:${dw}px;"/>`;
  cols += `<col style="width:20px;"/>`;

  // v43.4 — Encabezados: color configurable + letra menor + 1 línea (line-height
  // ajustado) para que etiquetas como "Punto 2" no salten a 2 filas.
  // word-break/overflow-wrap: si una palabra es muy larga (ej. "Acumulado"), se
  // ROMPE dentro de la celda en vez de desbordar a la columna vecina.
  const th = `background:${headerColor};color:#fff;font-weight:700;border:1px solid ${headerColor};padding:2px 3px;font-size:${(8.3 * fontScale).toFixed(2)}px;line-height:1.1;white-space:normal;word-break:break-word;overflow-wrap:anywhere;`;
  const hr = sec.headerRows;
  const nLevels = Math.max(1, hr.length);

  // Celdas de los títulos col-[…] de un nivel de header.
  const spanTds = (h: NumericHeaderSpec): string => {
    let tds = ''; let col = 0;
    const spans = [...h.spans].sort((a, b) => a.from - b.from);
    for (const sp of spans) {
      if (sp.from >= mc) break;
      if (sp.from > col) tds += `<td colspan="${sp.from - col}" style="${th}"></td>`;
      const to = Math.min(sp.to, mc - 1);
      tds += `<td colspan="${to - sp.from + 1}" style="${th}text-align:center;">${escHtml(sp.title)}</td>`;
      col = to + 1;
    }
    if (col < mc) tds += `<td colspan="${mc - col}" style="${th}"></td>`;
    return tds;
  };

  let head: string;
  if (hr.length === 0) {
    // Sección sin col-[…]: una sola fila navy. Columna única → "Valor".
    let valTds = '';
    for (let i = 0; i < mc; i++) valTds += `<td style="${th}text-align:center;">${mc === 1 ? 'Valor' : ''}</td>`;
    head = `<tr>
      <td style="${th}text-align:center;">#</td>
      <td style="${th}text-align:left;">Actividad</td>
      ${valTds}
      <td style="${th}text-align:center;">✓</td>
    </tr>`;
  } else {
    head = `<tr>
      <td rowspan="${nLevels}" style="${th}text-align:center;vertical-align:middle;">#</td>
      <td rowspan="${nLevels}" style="${th}text-align:left;vertical-align:middle;">Actividad</td>
      ${spanTds(hr[0])}
      <td rowspan="${nLevels}" style="${th}text-align:center;vertical-align:middle;">✓</td>
    </tr>`;
    for (let lvl = 1; lvl < hr.length; lvl++) head += `<tr>${spanTds(hr[lvl])}</tr>`;
  }

  return `<table style="width:100%;border-collapse:collapse;font-size:${(9.5 * fontScale).toFixed(2)}px;line-height:1.15;table-layout:fixed;margin-bottom:6px;">${cols}<thead>${head}</thead>`;
}

/** Construye los bloques HTML (con peso) del cuerpo numérico del protocolo.
 *  El caller los pagina y los envuelve en su frame de página (header/footer). */
export function buildNumericProtocolBlocks(
  items: NumericPdfItem[],
  opts: NumericPdfOptions = {},
): NumericPdfBlock[] {
  const chartWidth = opts.chartWidth ?? 640;
  const fontScale = opts.fontScale ?? 1;
  const twoColumn = opts.twoColumn ?? false;
  const headerColor = opts.headerColor || HEADER_NAVY;
  const splitTables = opts.splitTables ?? false;
  // v32e — Orden idéntico al de la pantalla de audit/llenado: natural por
  // partida_item ("1,2,10" no "1,10,2"). El dossier hace `.fetch()` sin ordenar,
  // así que el PDF salía en orden de inserción. `.sort` es estable en
  // Hermes/V8 → los empates conservan el orden de entrada (proxy de created_at).
  const ordered = [...items].sort((x, y) =>
    (x.partida_item ?? '').trim().localeCompare((y.partida_item ?? '').trim(), undefined, { numeric: true, sensitivity: 'base' }));
  const parsedRows: ParsedRow[] = ordered.map(it => ({ item: it, spec: parseNumericRow(it.validation_method) }));
  const { mainRows, matrices, valid } = extractMatrices(parsedRows);
  // Estructura de matriz malformada: mejor el fallback clásico del caller que
  // un PDF con catálogos silenciosamente ausentes.
  if (!valid) throw new Error('estructura de matriz malformada en el protocolo');
  const sections = groupIntoSections(mainRows);
  const allHeaderRows = sections.flatMap(s => s.headerRows);

  // ── Scope: misma lógica que la tabla (valores desde el snapshot comments) ──
  const scopeCells: ScopeCell[] = [];
  for (const { item, spec } of mainRows) {
    if (spec?.kind !== 'row') continue;
    const partida = item.partida_item ?? '';
    const cellVals = splitRowComments(item.comments, spec.cells.length);
    for (let i = 0; i < spec.cells.length; i++) {
      const cell = spec.cells[i];
      const key = scopeKeyFor(partida, i);
      if (cell.kind === 'manual' || cell.kind === 'percent' || cell.kind === 'bool' || cell.kind === 'free') scopeCells.push({ key, kind: 'manual', raw: cellVals[i] ?? '' });
      else if (cell.kind === 'list' || cell.kind === 'date' || cell.kind === 'time' || cell.kind === 'equipment' || cell.kind === 'text') scopeCells.push({ key, kind: 'list', raw: cellVals[i] ?? '' });
      else if (cell.kind === 'val') scopeCells.push({ key, kind: 'manual', raw: cell.literal });
      else if (cell.kind === 'lookup') scopeCells.push({ key, kind: 'lookup', refKey: cell.refKey, matrixId: cell.matrixId, searchCol: cell.searchCol, returnCol: cell.returnCol });
      else if (cell.kind === 'formula') scopeCells.push({ key, kind: 'formula', expr: cell.expr });
    }
  }
  let scope: Scope = {};
  let errors: Record<string, string> = {};
  try {
    const r = resolveScopeCells(scopeCells, matrices, opts.xrefValues, opts.auxTables);
    scope = r.scope; errors = r.errors;
  } catch { /* scope vacío: el PDF muestra '—' en computadas */ }

  const blocks: NumericPdfBlock[] = [];
  let displayN = 0;   // numeración visible continua (omite ocultas)
  let chartSeq = 0;   // numeración de gráficos

  for (const sec of sections) {
    let firstBlockOfSection = true;
    // v32e — Título del procedimiento: SIN franja de fondo. Texto centrado,
    // negrita, subrayado, un punto mayor que el cuerpo, con margen inferior
    // para que respire antes de la tabla.
    const bandHtml = sec.title
      ? `<div style="text-align:center;font-weight:800;text-decoration:underline;font-size:${(12 * fontScale).toFixed(2)}px;color:${headerColor};letter-spacing:0.5px;text-transform:uppercase;margin:${Math.round(14 * fontScale)}px 0 ${Math.round(9 * fontScale)}px 0;">${escHtml(sec.title)}</div>`
      : '';

    // Particiona la sección en runs de filas-tabla y gráficos intercalados.
    let pendingRows: string[] = [];
    const flushRows = () => {
      if (pendingRows.length === 0) return;
      const head = tableHead(sec, fontScale, headerColor);
      if (splitTables) {
        // Tabla DIVISIBLE: un solo bloque estructurado; el paginador parte sus filas
        // entre columnas según el espacio disponible (con nota "Continuación de:").
        const band = firstBlockOfSection ? bandHtml : '';
        firstBlockOfSection = false;
        blocks.push({
          html: `${band}${head}<tbody>${pendingRows.join('')}</tbody></table>`,
          weight: pendingRows.length + 2 + (band ? 1 : 0),
          table: { band, head, rows: [...pendingRows], title: sec.title || '' },
        });
        pendingRows = [];
        return;
      }
      // Trocea en sub-tablas para que un bloque nunca exceda una página.
      for (let i = 0; i < pendingRows.length; i += MAX_ROWS_PER_TABLE_BLOCK) {
        const slice = pendingRows.slice(i, i + MAX_ROWS_PER_TABLE_BLOCK);
        const band = firstBlockOfSection ? bandHtml : '';
        firstBlockOfSection = false;
        blocks.push({
          html: `${band}${tableHead(sec, fontScale, headerColor)}<tbody>${slice.join('')}</tbody></table>`,
          weight: slice.length + 2 + (band ? 1 : 0),
        });
      }
      pendingRows = [];
    };

    for (const r of sec.rows) {
      const spec = r.spec;
      if (!spec) continue;

      if (spec.kind === 'graph') {
        flushRows();
        displayN++;
        chartSeq++;
        const axis = deriveAxisTitles(spec, allHeaderRows);
        let svg = '';
        const legendEntries: { color: string; label: string; dashed?: boolean; point?: boolean }[] = [];
        const gH = Math.round(chartWidth * ((spec.aspectPct ?? 43.75) / 100));
        try {
          svg = renderChartSvg(
            {
              mode: spec.mode, xRefs: spec.xRefs, yRefs: spec.yRefs,
              title: spec.title, xAxisTitle: axis.xAxisTitle, yAxisTitle: axis.yAxisTitle,
              y2Refs: spec.y2Refs, y3Refs: spec.y3Refs, seriesLabels: spec.seriesLabels,
              bandLoRefs: spec.bandLoRefs, bandHiRefs: spec.bandHiRefs, fit: spec.fit,
            },
            scope,
            // noLegend + noTitle: leyenda y título van a la DERECHA en HTML; el SVG
            // queda más bajo y las fuentes/padding escalan con el tamaño (viewBox).
            { width: chartWidth, height: gH, noLegend: true, noTitle: true, legendSink: legendEntries },
          );
        } catch { svg = `<div style="color:${BAD_RED};font-size:9px;">[gráfico no disponible]</div>`; }
        const band = firstBlockOfSection ? bandHtml : '';
        firstBlockOfSection = false;
        // v43.4 — Bloque de gráfico en 2 lados: IZQUIERDA el gráfico, DERECHA el número
        // ("Gráfico N — título") + la leyenda ordenada. Menor alto y padding mínimo con
        // las tablas (margin:1px).
        const legendHtml = legendEntries.map(e => {
          // v46.1 — serie de PUNTOS → marcador circular; resto → línea (sólida/discontinua).
          const swatch = e.point
            ? `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${e.color};flex-shrink:0;"></span>`
            : `<span style="display:inline-block;width:16px;height:0;border-top:2px ${e.dashed ? 'dashed' : 'solid'} ${e.color};flex-shrink:0;"></span>`;
          return `<div style="display:flex;align-items:center;gap:5px;margin-bottom:3px;">${swatch}<span style="font-size:8.5px;color:#333;line-height:1.15;">${escHtml(e.label)}</span></div>`;
        }).join('');
        const caption = `[${displayN}] Gráfico ${chartSeq}${spec.title ? ` — ${escHtml(spec.title)}` : (` — ${escHtml(r.item.item_description)}`)}`;
        blocks.push({
          html: `${band}<div style="display:flex;gap:10px;align-items:center;justify-content:center;margin:8px 0 2px 0;">
  <div style="flex:0 0 ${chartWidth}px;">${svg}</div>
  <div style="flex:0 1 auto;min-width:0;">
    <div style="font-size:9.5px;font-weight:700;color:#6b7280;margin-bottom:6px;">${caption}</div>
    ${legendHtml}
  </div>
</div>`,
          // Peso por el ALTO real del gráfico (ya sin leyenda interna → más bajo).
          weight: Math.max(6, Math.round((gH + 10) / ROW_PX)) + (band ? 1 : 0),
        });
        continue;
      }

      if (spec.kind !== 'row') continue;          // headers ya van en tableOpen
      if (isRowHidden(spec)) continue;            // fila 100% oculta: ni se numera
      // Fila cuyas celdas reportables quedaron vacías por :nopdf → fuera del PDF.
      const reportable = spec.cells.filter(c => !c.hidden && !c.noReport && c.kind !== 'blank');
      const suppressed = spec.cells.some(c => c.hidden || c.noReport);
      if (suppressed && reportable.length === 0) continue;

      displayN++;
      const partida = r.item.partida_item ?? '';
      const cellVals = splitRowComments(r.item.comments, spec.cells.length);
      let oks: (boolean | null)[] = [];
      let tds = '';
      for (let i = 0; i < sec.maxCols; i++) {
        const cell = spec.cells[i];
        if (!cell) { tds += `<td style="border:1px solid ${BORDER};"></td>`; continue; }
        const { html, ok } = cellInner(cell, scopeKeyFor(partida, i), cellVals[i] ?? '', scope, errors, opts.protocolCode);
        oks.push(ok);
        tds += `<td style="border:1px solid ${BORDER};padding:1px 4px;text-align:center;vertical-align:middle;">${html}</td>`;
      }
      const judged = oks.filter(o => o !== null);
      const rowOk = judged.length === 0 ? null : judged.every(o => o === true);
      // v43.4 — Veredicto como SVG de tamaño FIJO (no glifo de texto): no depende de
      // la fuente, tiene caja controlada (no infla la fila) y se centra exacto.
      const verdict = rowOk === true
        ? `<svg width="11" height="11" viewBox="0 0 16 16" style="display:inline-block;vertical-align:middle;"><path d="M4.8 9.8 L6.7 12.3 L13.5 4.5" stroke="${OK_GREEN}" stroke-width="2.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>`
        : rowOk === false
        ? `<svg width="11" height="11" viewBox="0 0 16 16" style="display:inline-block;vertical-align:middle;"><path d="M4 4 L12 12 M12 4 L4 12" stroke="${BAD_RED}" stroke-width="2.6" fill="none" stroke-linecap="round"/></svg>`
        : '';
      // v43.4 — Actividad: máx 2 líneas. Si el texto es largo, auto-reduce la letra
      // de ESA celda (no aumenta la altura de fila) y recorta a 2 líneas como tope.
      const dlen = (r.item.item_description ?? '').length;
      const actScale = dlen > 42 ? 0.78 : dlen > 28 ? 0.88 : 1;
      const actFs = (9.5 * fontScale * actScale).toFixed(2);
      pendingRows.push(`<tr>
  <td style="color:${NAVY};font-weight:700;text-align:center;border:1px solid ${BORDER};padding:1px;vertical-align:middle;">${displayN}</td>
  <td style="border:1px solid ${BORDER};padding:1px 5px;color:#222;font-size:${actFs}px;vertical-align:middle;"><div style="max-height:2.4em;overflow:hidden;line-height:1.18;">${escHtml(r.item.item_description)}</div></td>
  ${tds}
  <td style="text-align:center;border:1px solid ${BORDER};vertical-align:middle;padding:0;line-height:0;">${verdict}</td>
</tr>`);
    }
    flushRows();
  }

  // ── Matrices auxiliares (catálogos `matrix-[…]`): anexo compacto ──────────
  for (const m of Object.values(matrices)) {
    if (!m.rows.length) continue;
    const head = m.columnTitles.map(t => `<th style="border:1px solid ${BORDER};background:#eef2f7;color:${NAVY};padding:2px 5px;font-size:8.5px;text-align:left;">${escHtml(t)}</th>`).join('');
    const body = m.rows.map(row =>
      `<tr>${row.map(v => `<td style="border:1px solid ${BORDER};padding:1px 5px;font-size:8.5px;color:#444;">${escHtml(v)}</td>`).join('')}</tr>`,
    ).join('');
    blocks.push({
      html: `<div style="margin-top:8px;">
  <div style="font-size:9px;font-weight:800;color:#666;letter-spacing:0.5px;text-transform:uppercase;margin-bottom:2px;">Tabla auxiliar ${escHtml(m.id)}</div>
  <table style="border-collapse:collapse;"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>
</div>`,
      weight: Math.min(m.rows.length + 3, 18),
    });
  }

  // v43.4 — En 2 columnas el caller empaca los bloques en columnas explícitas
  // (cada columna = altura de página, bloques atómicos), así que aquí NO se envuelve
  // ni se parte nada. `twoColumn` se mantiene por compatibilidad de firma.
  void twoColumn;
  return blocks;
}

/** Pagina los bloques: cada página acumula hasta `budget` de peso. Un bloque
 *  que solo exceda por poco entra igual si la página está vacía (nunca se
 *  genera una página vacía ni se parte un bloque). */
export function paginateNumericBlocks(blocks: NumericPdfBlock[], budget = 28, splitTables = false): string[] {
  const pages: string[] = [];
  let cur: string[] = [];
  let used = 0;
  const flushPage = () => { if (cur.length > 0) { pages.push(cur.join('\n')); cur = []; used = 0; } };
  // Nota plomo, alineada a la IZQUIERDA, para la continuación de una tabla partida.
  const contNote = (title: string) =>
    `<div style="text-align:left;color:#6b7280;font-size:8.5px;font-weight:700;margin:2px 0 1px 0;">Continuación de:${title ? ` ${escHtml(title)}` : ''}</div>`;

  for (const b of blocks) {
    // v43.4 — Tabla DIVISIBLE: rellena el espacio sobrante de la columna con las filas
    // que entren y continúa el resto en la siguiente, con nota "Continuación de:".
    if (splitTables && b.table && b.table.rows.length > 0) {
      let rows = b.table.rows;
      let first = true;
      while (rows.length > 0) {
        const avail = budget - used;
        // Costo fijo: head (2) + banda/nota (1). Filas que caben en lo que resta.
        const overhead = 2 + (first ? (b.table.band ? 1 : 0) : 1);
        let cap = avail - overhead;
        if (cap < 1) {
          if (cur.length > 0) { flushPage(); continue; }  // hay contenido → nueva columna
          cap = 1;   // columna vacía: forzar ≥1 fila para no perder datos ni hacer bucle
        }
        const take = Math.min(cap, rows.length);
        const slice = rows.slice(0, take);
        rows = rows.slice(take);
        const lead = first ? b.table.band : contNote(b.table.title);
        cur.push(`${lead}${b.table.head}<tbody>${slice.join('')}</tbody></table>`);
        used += take + overhead;
        first = false;
        if (rows.length > 0) flushPage();   // el resto va en la siguiente columna
      }
      continue;
    }
    // Bloque atómico (gráfico, matriz o tabla sin dividir).
    if (cur.length > 0 && used + b.weight > budget) flushPage();
    cur.push(b.html);
    used += b.weight;
  }
  if (cur.length > 0) pages.push(cur.join('\n'));
  if (pages.length === 0) pages.push('');
  return pages;
}
