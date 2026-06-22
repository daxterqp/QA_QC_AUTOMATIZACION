'use client';

import { useMemo } from 'react';
import { X, Check, SkipForward, AlertTriangle, Download } from 'lucide-react';
import { cn } from '@lib/utils';
import { useI18n } from '@lib/i18n';
import type { ImportSummary } from '@hooks/useHistoricalImport';

interface Props {
  summary: ImportSummary;
  onClose: () => void;
}

/** Modal final tras la fase de insert. Muestra contadores + lista de warnings/errors
 *  con opción de descargar reporte CSV. */
export function ImportSummaryModal({ summary, onClose }: Props) {
  const { t } = useI18n();
  const csvBlob = useMemo(() => buildReportCsv(summary), [summary]);
  const totalIssues = summary.errors.length + summary.warnings.length;

  const downloadReport = () => {
    const url = URL.createObjectURL(csvBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `historico-reporte-${Date.now()}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 z-50 bg-navy/50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl w-full max-w-2xl max-h-[85vh] flex flex-col shadow-modal overflow-hidden"
           onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-navy text-white">
          <h3 className="text-sm font-bold tracking-wide uppercase">{t('webCHist.importResult')}</h3>
          <button onClick={onClose} className="p-1 rounded hover:bg-white/10 transition">
            <X size={16} />
          </button>
        </div>

        {/* Contadores */}
        <div className="grid grid-cols-3 gap-3 px-4 py-4 bg-surface border-b border-border">
          <Stat icon={<Check size={16} className="text-success" />} value={summary.created} label={t('webCHist.statCreated')} color="text-success" />
          <Stat icon={<SkipForward size={16} className="text-muted" />} value={summary.skipped} label={t('webCHist.statSkipped')} color="text-muted" />
          <Stat icon={<AlertTriangle size={16} className="text-warning" />} value={summary.warnings.length} label={t('webCHist.statWarnings')} color="text-warning" />
        </div>

        {/* Detalle */}
        <div className="flex-1 overflow-y-auto px-4 py-3">
          {summary.errors.length > 0 && (
            <div className="mb-3">
              <p className="text-[11px] font-bold text-danger uppercase tracking-wider mb-1.5">
                {t('webCHist.errorsTitle', { count: summary.errors.length })}
              </p>
              <ul className="text-xs text-textPrimary space-y-1 list-disc pl-4">
                {summary.errors.slice(0, 50).map((e, i) => (
                  <li key={i}>
                    {e.line ? <span className="text-muted">{t('webCHist.lineLabel', { n: e.line })}</span> : null}
                    {e.instance_external_id && <span className="font-mono text-[10px] text-primary">{e.instance_external_id} </span>}
                    {e.reason}
                  </li>
                ))}
                {summary.errors.length > 50 && (
                  <li className="text-muted italic">{t('webCHist.moreItems', { count: summary.errors.length - 50 })}</li>
                )}
              </ul>
            </div>
          )}

          {summary.warnings.length > 0 && (
            <div>
              <p className="text-[11px] font-bold text-warning uppercase tracking-wider mb-1.5">
                {t('webCHist.warningsTitle', { count: summary.warnings.length })}
              </p>
              <ul className="text-xs text-textPrimary space-y-1 list-disc pl-4">
                {summary.warnings.slice(0, 50).map((w, i) => (
                  <li key={i}>
                    <span className="font-mono text-[10px] text-primary">{w.instance_external_id}</span>
                    {w.partida_item && <span className="text-muted"> · #{w.partida_item}{w.col ?? ''}</span>}
                    {' — '}{w.reason}
                  </li>
                ))}
                {summary.warnings.length > 50 && (
                  <li className="text-muted italic">{t('webCHist.moreItems', { count: summary.warnings.length - 50 })}</li>
                )}
              </ul>
            </div>
          )}

          {totalIssues === 0 && summary.created > 0 && (
            <p className="text-sm text-success text-center py-6">
              {t('webCHist.completedNoWarnings')}
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-border bg-surface">
          {totalIssues > 0 && (
            <button
              onClick={downloadReport}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-primary border border-primary/30 rounded hover:bg-primary/5 transition"
            >
              <Download size={12} /> {t('webCHist.downloadReportCsv')}
            </button>
          )}
          <button
            onClick={onClose}
            className={cn(
              'px-4 py-1.5 text-xs font-bold rounded transition',
              'bg-primary text-white hover:bg-primary/90',
            )}
          >
            {t('common.close')}
          </button>
        </div>
      </div>
    </div>
  );
}

function Stat({ icon, value, label, color }: { icon: React.ReactNode; value: number; label: string; color: string }) {
  return (
    <div className="flex flex-col items-center gap-0.5 bg-white rounded-md py-2">
      {icon}
      <span className={cn('text-xl font-black', color)}>{value}</span>
      <span className="text-[9px] text-muted font-bold uppercase tracking-wider">{label}</span>
    </div>
  );
}

function buildReportCsv(summary: { errors: { line?: number; instance_external_id?: string; reason: string }[]; warnings: { instance_external_id: string; partida_item?: string; col?: string; reason: string }[] }): Blob {
  const lines: string[] = ['tipo,external_id,linea,partida,col,detalle'];
  for (const e of summary.errors) {
    lines.push(`error,"${e.instance_external_id ?? ''}",${e.line ?? ''},,,"${e.reason.replace(/"/g, '""')}"`);
  }
  for (const w of summary.warnings) {
    lines.push(`advertencia,"${w.instance_external_id}",,${w.partida_item ?? ''},${w.col ?? ''},"${w.reason.replace(/"/g, '""')}"`);
  }
  return new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
}
