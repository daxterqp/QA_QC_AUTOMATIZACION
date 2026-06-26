'use client';

/**
 * TopoColumnsEditor — Editor COMPACTO (tabla) de las columnas del módulo topográfico.
 * Columnas de la tabla: Encabezado · Habilitar · Mostrar en ficha · Origen (desplegable,
 * default Manual). Coordenadas/Cota quedan bloqueadas en "Manual"; las custom permiten
 * Fórmula (campo de fórmula) o Área (tolerancia) en una fila de detalle. Las base no se
 * borran; las custom sí.
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
    <div className="flex flex-col gap-2">
      <p className="text-[11px] font-bold text-muted uppercase tracking-wider">Columnas de la carga</p>
      <div className="border border-border rounded-lg overflow-hidden">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-surface text-[11px] font-bold text-muted uppercase tracking-wide">
              <th className="text-left px-3 py-2">Encabezado</th>
              <th className="px-2 py-2 w-16">Habilitar</th>
              <th className="px-2 py-2 w-24">Mostrar en ficha</th>
              <th className="text-left px-2 py-2">Origen</th>
              <th className="w-8" />
            </tr>
          </thead>
          <tbody>
            {cols.map((c) => {
              const lockSource = c.builtin === 'coord1' || c.builtin === 'coord2' || c.builtin === 'cota';
              return (
                <tr key={c.id} className="border-t border-border align-middle">
                  <td className="px-3 py-1.5">
                    {c.builtin ? (
                      <span className="font-semibold text-navy">{c.name}</span>
                    ) : (
                      <input
                        value={c.name}
                        onChange={(e) => update(c.id, { name: e.target.value })}
                        placeholder="Nombre de columna"
                        className="w-full border border-border rounded-md px-2 py-1 text-sm text-navy focus:outline-none focus:ring-2 focus:ring-primary/30"
                      />
                    )}
                  </td>
                  <td className="px-2 py-1.5 text-center">
                    <input type="checkbox" checked={c.enabled} onChange={(e) => update(c.id, { enabled: e.target.checked })} className="accent-primary w-4 h-4" />
                  </td>
                  <td className="px-2 py-1.5 text-center">
                    <input type="checkbox" checked={c.show_in_ficha} onChange={(e) => update(c.id, { show_in_ficha: e.target.checked })} className="accent-primary w-4 h-4" />
                  </td>
                  <td className="px-2 py-1.5">
                    <div className="flex flex-col gap-1">
                      <select
                        value={c.source}
                        onChange={(e) => update(c.id, { source: e.target.value as TopoColumn['source'] })}
                        disabled={lockSource}
                        className="border border-border rounded-md px-2 py-1 text-xs text-navy bg-white disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-primary/30"
                      >
                        {(['manual', 'formula', 'area'] as const).map((s) => (
                          <option key={s} value={s}>{SOURCE_LABELS[s]}</option>
                        ))}
                      </select>
                      {c.source === 'formula' && (
                        <input
                          value={c.formula ?? ''}
                          onChange={(e) => update(c.id, { formula: e.target.value })}
                          placeholder="BUSCAR(tabla, #1A, Columna) * 2"
                          className="border border-border rounded-md px-2 py-1 text-xs font-mono text-navy focus:outline-none focus:ring-2 focus:ring-primary/30"
                        />
                      )}
                      {c.source === 'area' && (
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] text-muted">Sectores · Tol. (m):</span>
                          <input
                            type="number" min={0} step={0.5}
                            value={c.tolerance_m ?? 0}
                            onChange={(e) => update(c.id, { tolerance_m: Number(e.target.value) || 0 })}
                            className="w-16 border border-border rounded-md px-1.5 py-0.5 text-xs text-navy focus:outline-none focus:ring-2 focus:ring-primary/30"
                          />
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="px-1 py-1.5 text-center">
                    {!c.builtin && (
                      <button onClick={() => remove(c.id)} title="Eliminar columna" className="p-1 text-muted hover:text-danger transition"><Trash2 size={14} /></button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <button onClick={add} className="self-start flex items-center gap-1.5 text-xs font-bold text-primary hover:text-navy transition">
        <Plus size={14} /> Agregar columna
      </button>
    </div>
  );
}
