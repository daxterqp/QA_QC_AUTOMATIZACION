'use client';

/**
 * TopoColumnsEditor — Editor de las columnas del módulo topográfico (config web).
 * Cada fila: nombre + campo mixto de ORIGEN (Manual / Fórmula / Evaluar dentro del área)
 * con su detalle (fórmula o tolerancia), y los toggles "Habilitar" + "Mostrar en ficha".
 * Las columnas base (coord1/coord2/cota/sector) no se borran; las custom sí.
 */
import { Plus, Trash2 } from 'lucide-react';
import type { TopoColumn } from '@/types';
import { defaultTopoColumns } from '@/types';

interface Props {
  columns: TopoColumn[] | undefined;
  onChange: (cols: TopoColumn[]) => void;
}

const SOURCE_LABELS: Record<TopoColumn['source'], string> = {
  manual: 'Manual',
  formula: 'Fórmula',
  area: 'Evaluar dentro del área',
};

function genId(): string {
  return `c${Math.random().toString(36).slice(2, 9)}`;
}

export function TopoColumnsEditor({ columns, onChange }: Props) {
  const cols = (columns && columns.length > 0) ? columns : defaultTopoColumns();

  const update = (id: string, patch: Partial<TopoColumn>) =>
    onChange(cols.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  const remove = (id: string) => onChange(cols.filter((c) => c.id !== id));
  const add = () => onChange([...cols, { id: genId(), name: 'Nueva columna', source: 'manual', enabled: true, show_in_ficha: false }]);

  return (
    <div className="flex flex-col gap-2 mt-2">
      <p className="text-[11px] font-bold text-muted uppercase tracking-wider">Columnas de la carga</p>
      <div className="flex flex-col gap-1.5">
        {cols.map((c) => (
          <div key={c.id} className="bg-surface border border-border rounded-lg p-3 flex flex-col gap-2">
            <div className="flex items-center gap-2">
              {c.builtin ? (
                <span className="flex-1 text-sm font-semibold text-navy">{c.name}</span>
              ) : (
                <input
                  value={c.name}
                  onChange={(e) => update(c.id, { name: e.target.value })}
                  placeholder="Nombre de columna"
                  className="flex-1 border border-border rounded-md px-2.5 py-1.5 text-sm text-navy focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              )}
              {/* Origen del dato (campo mixto = dropdown). El sector base es siempre 'area'. */}
              <select
                value={c.source}
                onChange={(e) => update(c.id, { source: e.target.value as TopoColumn['source'] })}
                disabled={c.builtin === 'coord1' || c.builtin === 'coord2' || c.builtin === 'cota'}
                className="border border-border rounded-md px-2 py-1.5 text-xs text-navy bg-white disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-primary/30"
              >
                {(['manual', 'formula', 'area'] as const).map((s) => (
                  <option key={s} value={s}>{SOURCE_LABELS[s]}</option>
                ))}
              </select>
              {!c.builtin && (
                <button onClick={() => remove(c.id)} title="Eliminar columna" className="p-1.5 text-muted hover:text-danger transition"><Trash2 size={14} /></button>
              )}
            </div>

            {/* Detalle según el origen. */}
            {c.source === 'formula' && (
              <input
                value={c.formula ?? ''}
                onChange={(e) => update(c.id, { formula: e.target.value })}
                placeholder="Fórmula, ej: BUSCAR(tabla, #1A, Columna) * 2"
                className="border border-border rounded-md px-2.5 py-1.5 text-xs font-mono text-navy focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            )}
            {c.source === 'area' && (
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-muted">Áreas: sectores del proyecto · Tolerancia (m):</span>
                <input
                  type="number" min={0} step={0.5}
                  value={c.tolerance_m ?? 0}
                  onChange={(e) => update(c.id, { tolerance_m: Number(e.target.value) || 0 })}
                  className="w-20 border border-border rounded-md px-2 py-1 text-xs text-navy focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>
            )}

            <div className="flex items-center gap-4">
              <label className="flex items-center gap-1.5 text-xs text-navy cursor-pointer">
                <input type="checkbox" checked={c.enabled} onChange={(e) => update(c.id, { enabled: e.target.checked })} className="accent-primary" />
                Habilitar
              </label>
              <label className="flex items-center gap-1.5 text-xs text-navy cursor-pointer">
                <input type="checkbox" checked={c.show_in_ficha} onChange={(e) => update(c.id, { show_in_ficha: e.target.checked })} className="accent-primary" />
                Mostrar en ficha
              </label>
            </div>
          </div>
        ))}
      </div>
      <button onClick={add} className="self-start flex items-center gap-1.5 text-xs font-bold text-primary hover:text-navy transition">
        <Plus size={14} /> Agregar columna
      </button>
    </div>
  );
}
