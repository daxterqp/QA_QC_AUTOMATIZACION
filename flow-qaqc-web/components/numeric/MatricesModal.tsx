'use client';

import { useState } from 'react';
import { X } from 'lucide-react';
import { cn } from '@lib/utils';
import { useI18n } from '@lib/i18n';
import type { MatrixData } from '@lib/numericProtocol';

interface Props {
  matrices: MatrixData[];
  onClose: () => void;
}

/** Modal que muestra las tablas auxiliares (catálogos) de un protocolo numérico.
 *  Si hay varias matrices, las muestra como pestañas a la izquierda. */
export function MatricesModal({ matrices, onClose }: Props) {
  const { t } = useI18n();
  const [activeIdx, setActiveIdx] = useState(0);
  const active = matrices[activeIdx];

  return (
    <div
      className="fixed inset-0 z-50 bg-navy/50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl w-full max-w-4xl max-h-[80vh] flex flex-col shadow-modal overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header del modal */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-navy text-white">
          <h3 className="text-sm font-bold tracking-wide uppercase">{t('webCNumeric.matrices.title')}</h3>
          <button onClick={onClose} className="p-1 rounded hover:bg-white/10 transition" title={t('common.close')}>
            <X size={16} />
          </button>
        </div>

        <div className="flex flex-1 min-h-0">
          {/* Sidebar pestañas si hay >1 matriz */}
          {matrices.length > 1 && (
            <div className="w-32 border-r border-border bg-surface overflow-y-auto">
              {matrices.map((m, i) => (
                <button
                  key={m.id}
                  onClick={() => setActiveIdx(i)}
                  className={cn(
                    'w-full text-left px-3 py-2 text-xs font-bold border-b border-divider transition',
                    i === activeIdx
                      ? 'bg-white text-primary border-l-2 border-l-primary'
                      : 'text-textSecondary hover:bg-white',
                  )}
                >
                  {m.id}
                </button>
              ))}
            </div>
          )}

          {/* Tabla de la matriz activa */}
          <div className="flex-1 overflow-auto p-3">
            {active ? (
              <div>
                <p className="text-[11px] font-bold text-muted tracking-wider uppercase mb-2">
                  {t(active.rows.length === 1 ? 'webCNumeric.matrices.matrixLabel.one' : 'webCNumeric.matrices.matrixLabel.other', { id: active.id, count: active.rows.length })}
                </p>
                <table className="w-full border-collapse text-xs">
                  <thead>
                    <tr className="bg-navy text-white">
                      <th className="px-2 py-1.5 border border-navy text-[10px] font-extrabold uppercase tracking-wider">#</th>
                      {active.columnTitles.map((title, i) => (
                        <th
                          key={i}
                          className="px-2 py-1.5 border border-navy text-[10px] font-extrabold uppercase tracking-wider text-left"
                        >
                          {String.fromCharCode(65 + i)}
                          {title && <span className="block text-[9px] font-bold text-white/80 normal-case mt-0.5">{title}</span>}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {active.rows.map((row, rIdx) => (
                      <tr key={rIdx} className={cn('hover:bg-surface', rIdx % 2 === 1 && 'bg-[#fafbfd]')}>
                        <td className="px-2 py-1.5 border border-divider text-center text-primary font-bold">{rIdx + 1}</td>
                        {active.columnTitles.map((_, cIdx) => (
                          <td key={cIdx} className="px-2 py-1.5 border border-divider text-textPrimary">
                            {row[cIdx] ?? ''}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-sm text-muted text-center mt-8">{t('webCNumeric.matrices.empty')}</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
