'use client';

/**
 * TopoCargaModal — Ingreso de una carga de datos topográficos (web).
 *  - Manual: grilla editable (columna Código + las columnas habilitadas de config).
 *  - CSV: primera fila = encabezados, resto = datos (mapeo por nombre + fallback por orden).
 * Las columnas calculadas ('formula'/'area') NO se ingresan a mano (se omiten en la grilla).
 */
import { useMemo, useRef, useState } from 'react';
import { X, Plus, Trash2, Upload, Loader2 } from 'lucide-react';
import type { TopoColumn } from '@/types';
import type { TopoRow } from '@lib/topoBinding';

interface Props {
  columns: TopoColumn[];
  initialRows: TopoRow[];
  title: string;
  busy?: boolean;
  onSave: (rows: TopoRow[]) => void;
  onCancel: () => void;
}

/** Columnas que se INGRESAN a mano: las coordenadas + cota + custom manuales habilitadas. */
function inputColumns(columns: TopoColumn[]): TopoColumn[] {
  return columns.filter((c) =>
    c.enabled && (c.builtin === 'coord1' || c.builtin === 'coord2' || c.builtin === 'cota' || c.source === 'manual'),
  );
}

type GridRow = Record<string, string>; // claves: 'code' + column.id

function topoRowToGrid(r: TopoRow): GridRow {
  const g: GridRow = { code: r.code ?? '' };
  if (r.c1 != null) g.coord1 = String(r.c1);
  if (r.c2 != null) g.coord2 = String(r.c2);
  if (r.cota != null) g.cota = String(r.cota);
  if (r.custom) for (const [k, v] of Object.entries(r.custom)) if (v != null) g[k] = String(v);
  return g;
}

function gridToTopoRow(g: GridRow, cols: TopoColumn[]): TopoRow {
  const row: TopoRow = { code: (g.code ?? '').trim() };
  const custom: Record<string, string> = {};
  for (const c of cols) {
    const v = (g[c.id] ?? '').trim();
    if (v === '') continue;
    if (c.builtin === 'coord1') row.c1 = v;
    else if (c.builtin === 'coord2') row.c2 = v;
    else if (c.builtin === 'cota') row.cota = v;
    else custom[c.id] = v;
  }
  if (Object.keys(custom).length > 0) row.custom = custom;
  return row;
}

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();

/** Parser CSV minimalista (comillas básicas). */
function parseCsv(text: string): string[][] {
  const out: string[][] = [];
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  for (const line of lines) {
    if (line.trim() === '') continue;
    const cells: string[] = [];
    let cur = '', inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQ) {
        if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
        else if (ch === '"') inQ = false;
        else cur += ch;
      } else if (ch === '"') inQ = true;
      else if (ch === ',' || ch === ';' || ch === '\t') { cells.push(cur); cur = ''; }
      else cur += ch;
    }
    cells.push(cur);
    out.push(cells.map((c) => c.trim()));
  }
  return out;
}

const CODE_ALIASES = ['codigo', 'code', 'ensayo', 'protocolo'];
const C1_ALIASES = ['este', 'x', 'coordenada 1', 'coord1', 'easting', 'e'];
const C2_ALIASES = ['norte', 'y', 'coordenada 2', 'coord2', 'northing', 'n'];
const COTA_ALIASES = ['cota', 'z', 'elevacion', 'altitud', 'elevation'];

export function TopoCargaModal({ columns, initialRows, title, busy, onSave, onCancel }: Props) {
  const cols = useMemo(() => inputColumns(columns), [columns]);
  const [rows, setRows] = useState<GridRow[]>(() => {
    const init = (initialRows ?? []).map(topoRowToGrid);
    return init.length > 0 ? init : [{ code: '' }];
  });
  const fileRef = useRef<HTMLInputElement>(null);
  const [csvError, setCsvError] = useState<string | null>(null);

  const setCell = (ri: number, key: string, val: string) =>
    setRows((prev) => prev.map((r, i) => (i === ri ? { ...r, [key]: val } : r)));
  const addRow = () => setRows((prev) => [...prev, { code: '' }]);
  const removeRow = (ri: number) => setRows((prev) => prev.length > 1 ? prev.filter((_, i) => i !== ri) : prev);

  const headerMatch = (header: string, col: TopoColumn): boolean => {
    const h = norm(header);
    if (col.builtin === 'coord1') return C1_ALIASES.includes(h) || h === norm(col.name);
    if (col.builtin === 'coord2') return C2_ALIASES.includes(h) || h === norm(col.name);
    if (col.builtin === 'cota') return COTA_ALIASES.includes(h) || h === norm(col.name);
    return h === norm(col.name) || h === col.id;
  };

  const onCsv = async (file: File) => {
    setCsvError(null);
    try {
      const text = await file.text();
      const matrix = parseCsv(text);
      if (matrix.length < 2) { setCsvError('El CSV no tiene filas de datos.'); return; }
      const headers = matrix[0];
      // Mapeo: índice de la columna CSV para code + cada col de input.
      const codeIdx = headers.findIndex((h) => CODE_ALIASES.includes(norm(h)));
      const colIdx: Record<string, number> = {};
      for (const c of cols) {
        const idx = headers.findIndex((h) => headerMatch(h, c));
        if (idx >= 0) colIdx[c.id] = idx;
      }
      const effectiveCodeIdx = codeIdx >= 0 ? codeIdx : 0; // fallback: 1ª columna = código
      const parsed: GridRow[] = [];
      for (let r = 1; r < matrix.length; r++) {
        const cells = matrix[r];
        const g: GridRow = { code: (cells[effectiveCodeIdx] ?? '').trim() };
        for (const c of cols) {
          const idx = colIdx[c.id];
          if (idx != null) g[c.id] = (cells[idx] ?? '').trim();
        }
        if (g.code) parsed.push(g);
      }
      if (parsed.length === 0) { setCsvError('No se reconocieron filas con código.'); return; }
      setRows(parsed);
    } catch (e) {
      setCsvError((e as Error).message);
    }
  };

  const handleSave = () => {
    const topoRows = rows.map((g) => gridToTopoRow(g, cols)).filter((r) => r.code);
    onSave(topoRows);
  };

  return (
    <div className="fixed inset-0 bg-navy/60 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-modal w-full max-w-3xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-5 border-b border-border">
          <h3 className="text-navy font-bold text-base">{title}</h3>
          <button onClick={onCancel} className="text-gray-400 hover:text-navy transition"><X size={18} /></button>
        </div>

        <div className="px-5 py-3 border-b border-border flex items-center gap-2">
          <button onClick={() => fileRef.current?.click()} className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold border border-border text-navy hover:bg-surface transition">
            <Upload size={13} /> Subir CSV
          </button>
          <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) onCsv(f); e.target.value = ''; }} />
          <span className="text-[11px] text-muted">Primera fila = encabezados (Código, {cols.map((c) => c.name).join(', ')}).</span>
        </div>
        {csvError && <p className="px-5 py-2 text-xs text-danger">{csvError}</p>}

        <div className="flex-1 overflow-auto p-5">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="text-left">
                <th className="text-[11px] font-bold text-muted uppercase tracking-wider pb-2 pr-2">Código del ensayo</th>
                {cols.map((c) => (
                  <th key={c.id} className="text-[11px] font-bold text-muted uppercase tracking-wider pb-2 px-2">{c.name}</th>
                ))}
                <th className="w-8" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r, ri) => (
                <tr key={ri}>
                  <td className="pr-2 py-1">
                    <input value={r.code ?? ''} onChange={(e) => setCell(ri, 'code', e.target.value)}
                      placeholder="PR-260032"
                      className="w-full border border-border rounded-md px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
                  </td>
                  {cols.map((c) => (
                    <td key={c.id} className="px-2 py-1">
                      <input value={r[c.id] ?? ''} onChange={(e) => setCell(ri, c.id, e.target.value)}
                        className="w-full border border-border rounded-md px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
                    </td>
                  ))}
                  <td className="py-1">
                    <button onClick={() => removeRow(ri)} className="p-1.5 text-muted hover:text-danger transition"><Trash2 size={14} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <button onClick={addRow} className="mt-3 flex items-center gap-1.5 text-xs font-bold text-primary hover:text-navy transition">
            <Plus size={14} /> Agregar fila
          </button>
        </div>

        <div className="flex gap-2 p-5 border-t border-border">
          <button onClick={onCancel} disabled={busy} className="flex-1 border border-border rounded-md py-3 text-sm font-semibold text-muted hover:bg-surface transition">Cancelar</button>
          <button onClick={handleSave} disabled={busy} className="flex-1 bg-primary text-white rounded-md py-3 text-sm font-bold hover:bg-navy transition flex items-center justify-center gap-2 disabled:opacity-50">
            {busy && <Loader2 size={14} className="animate-spin" />} Guardar carga
          </button>
        </div>
      </div>
    </div>
  );
}
