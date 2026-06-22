/**
 * csvExport — núcleo PURO de la exportación CSV de ensayos (formato ANCHO).
 *
 * 1 fila = 1 instancia de protocolo. Columnas fijas (external_id, protocolo,
 * ubicación, estado, fechas) + TODAS las celdas visibles del template en su
 * orden (entrada Y calculadas), con encabezado "clave + descripción".
 * Respeta `:oculto` (excluida) y `blank` (excluida); `:dec[n]` formatea.
 *
 * Sin I/O — el hook (useCsvEnsayos) hace las queries y la descarga con BOM.
 */

import {
  parseNumeric, splitRowComments, colLetter, scopeKeyFor,
  type NumericCellSpec,
} from './numericProtocol';
import { resolveScopeCells, type ScopeCell, type AuxTables } from './formulaEval';
import type { TemplateContext } from './historicalImport';
import { toCsv } from './csvEnsayos';

// ───────────────────────────── Columnas ──────────────────────────────────────

export type ExportColumn =
  | { kind: 'fixed'; key: 'external_id' | 'codigo' | 'protocolo' | 'ubicacion' | 'estado' | 'fecha_llenado' | 'fecha_aprobacion'; header: string }
  | { kind: 'cell'; partida: string; colIdx: number; spec: NumericCellSpec; header: string };

const FIXED_COLUMNS: Extract<ExportColumn, { kind: 'fixed' }>[] = [
  { kind: 'fixed', key: 'external_id', header: 'external_id' },
  { kind: 'fixed', key: 'codigo', header: 'codigo' },
  { kind: 'fixed', key: 'protocolo', header: 'protocolo' },
  { kind: 'fixed', key: 'ubicacion', header: 'ubicacion' },
  { kind: 'fixed', key: 'estado', header: 'estado' },
  { kind: 'fixed', key: 'fecha_llenado', header: 'fecha_llenado' },
  { kind: 'fixed', key: 'fecha_aprobacion', header: 'fecha_aprobacion' },
];

/** Columnas del export: fijas + celdas VISIBLES del template en orden. */
export function buildExportColumns(template: TemplateContext): ExportColumn[] {
  const out: ExportColumn[] = [...FIXED_COLUMNS];
  for (const { item, spec } of template.parsedRows) {
    if (!spec || spec.kind !== 'row') continue;
    const partida = (item.partida_item ?? '').trim();
    if (!partida || /^__hdr\d+__$/i.test(partida) || /^__matrix_/i.test(partida)) continue;
    for (let i = 0; i < spec.cells.length; i++) {
      const c = spec.cells[i];
      // :oculto y blanks fuera; `codigo-[]` también — ya va en la columna
      // fija "codigo" (su slot de comments siempre está vacío).
      if (c.hidden || c.kind === 'blank' || c.kind === 'code') continue;
      out.push({
        kind: 'cell',
        partida,
        colIdx: i,
        spec: c,
        header: `${partida}${colLetter(i)} ${item.item_description}`.trim(),
      });
    }
  }
  return out;
}

// ───────────────────────────── Filas ─────────────────────────────────────────

export interface ExportProtocolRow {
  external_id: string | null;
  /** v31 — código correlativo del ensayo (columna fija "codigo"). */
  protocol_code?: string | null;
  protocol_number: string | null;
  location_name: string;
  status: string;
  filled_at: number | null;
  signed_at: number | null;
  /** Items de la instancia indexados por partida_item. */
  itemsByPartida: Map<string, { comments: string | null }>;
}

const STATUS_ES: Record<string, string> = {
  DRAFT: 'Borrador',
  IN_PROGRESS: 'En progreso',
  SUBMITTED: 'En revisión',
  APPROVED: 'Aprobado',
  REJECTED: 'Rechazado',
};

function fmtFecha(ms: number | null): string {
  if (!ms || !Number.isFinite(ms)) return '';
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`;
}

/** Valor presentado de una celda: `:dec[n]` aplica; bool → Sí/No; val → literal. */
function formatCellValue(raw: string, spec: NumericCellSpec): string {
  if (spec.kind === 'val') return spec.literal ?? '';
  if (spec.kind === 'bool') return raw === '1' ? 'Sí' : raw === '0' ? 'No' : '';
  if (spec.decimals != null) {
    const n = parseNumeric(raw);
    if (n != null && isFinite(n)) return n.toFixed(spec.decimals);
  }
  return raw;
}

/** Reconstruye los valores por celda de UNA instancia y emite su fila CSV. */
export function protocolToCsvRow(
  p: ExportProtocolRow,
  template: TemplateContext,
  cols: ExportColumn[],
  auxTables?: AuxTables,
): string[] {
  // 1. Valores crudos por partida desde el snapshot de comments.
  const vals = new Map<string, string[]>();
  for (const { item, spec } of template.parsedRows) {
    if (!spec || spec.kind !== 'row') continue;
    const partida = (item.partida_item ?? '').trim();
    const it = p.itemsByPartida.get(partida);
    vals.set(partida, splitRowComments(it?.comments ?? null, spec.cells.length));
  }

  // 2. Fallback: si quedó algún slot formula/lookup vacío con entradas llenas
  //    (instancias de versiones viejas sin snapshot) → recomputar UNA vez.
  let needsRecompute = false;
  let hasInputs = false;
  for (const { item, spec } of template.parsedRows) {
    if (!spec || spec.kind !== 'row') continue;
    const partida = (item.partida_item ?? '').trim();
    const arr = vals.get(partida) ?? [];
    for (let i = 0; i < spec.cells.length; i++) {
      const c = spec.cells[i];
      if ((c.kind === 'formula' || c.kind === 'lookup') && (arr[i] ?? '') === '') needsRecompute = true;
      if ((c.kind === 'manual' || c.kind === 'percent' || c.kind === 'list') && (arr[i] ?? '') !== '') hasInputs = true;
    }
  }
  if (needsRecompute && hasInputs) {
    try {
      const scopeCells: ScopeCell[] = [];
      for (const { item, spec } of template.parsedRows) {
        if (!spec || spec.kind !== 'row') continue;
        const partida = (item.partida_item ?? '').trim();
        const arr = vals.get(partida) ?? [];
        for (let i = 0; i < spec.cells.length; i++) {
          const c = spec.cells[i];
          const key = scopeKeyFor(partida, i);
          if (c.kind === 'manual' || c.kind === 'percent' || c.kind === 'bool' || c.kind === 'free') scopeCells.push({ key, kind: 'manual', raw: arr[i] ?? '' });
          else if (c.kind === 'list' || c.kind === 'date' || c.kind === 'time' || c.kind === 'equipment' || c.kind === 'text') scopeCells.push({ key, kind: 'list', raw: arr[i] ?? '' });
          else if (c.kind === 'val') scopeCells.push({ key, kind: 'manual', raw: c.literal });
          else if (c.kind === 'lookup') scopeCells.push({ key, kind: 'lookup', refKey: c.refKey, matrixId: c.matrixId, searchCol: c.searchCol, returnCol: c.returnCol });
          else if (c.kind === 'formula') scopeCells.push({ key, kind: 'formula', expr: c.expr });
        }
      }
      const { scope, textValues, errors } = resolveScopeCells(scopeCells, template.matrices, undefined, auxTables);
      for (const { item, spec } of template.parsedRows) {
        if (!spec || spec.kind !== 'row') continue;
        const partida = (item.partida_item ?? '').trim();
        const arr = vals.get(partida) ?? [];
        for (let i = 0; i < spec.cells.length; i++) {
          const c = spec.cells[i];
          if ((c.kind !== 'formula' && c.kind !== 'lookup') || (arr[i] ?? '') !== '') continue;
          const key = scopeKeyFor(partida, i);
          if (errors[key]) continue;
          if (textValues[key]) arr[i] = textValues[key];
          else if (scope[key] != null) arr[i] = String(scope[key]);
        }
      }
    } catch { /* sin recompute: los slots quedan vacíos */ }
  }

  // 3. Emitir la fila en el orden de las columnas.
  return cols.map(col => {
    if (col.kind === 'fixed') {
      switch (col.key) {
        case 'external_id': return p.external_id ?? '';
        case 'codigo': return p.protocol_code ?? '';
        case 'protocolo': return p.protocol_number ?? '';
        case 'ubicacion': return p.location_name;
        case 'estado': return STATUS_ES[p.status] ?? p.status;
        case 'fecha_llenado': return fmtFecha(p.filled_at);
        case 'fecha_aprobacion': return fmtFecha(p.signed_at);
      }
    }
    const arr = vals.get(col.partida) ?? [];
    return formatCellValue(arr[col.colIdx] ?? '', col.spec);
  });
}

/** CSV completo (encabezados + filas). El caller antepone CSV_BOM al descargar. */
export function buildExportCsv(template: TemplateContext, protocols: ExportProtocolRow[], auxTables?: AuxTables): string {
  const cols = buildExportColumns(template);
  const rows: string[][] = [cols.map(c => c.header)];
  for (const p of protocols) rows.push(protocolToCsvRow(p, template, cols, auxTables));
  return toCsv(rows, ',');
}
