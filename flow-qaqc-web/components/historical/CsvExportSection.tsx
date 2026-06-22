'use client';

/**
 * CsvExportSection — exportación de datos de ensayos a CSV ANCHO.
 *
 * 1 fila = 1 instancia del protocolo elegido (cualquier estado), con columnas
 * de entrada Y calculadas en el orden de la ficha (estilo "resumen" de
 * laboratorio). Siempre UTF-8 con BOM para que Excel abra bien acentos/ñ.
 * Siempre visible (read-only) — no requiere el flag historical_import.
 */

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Download, Table2, Loader2, AlertCircle } from 'lucide-react';
import { cn } from '@lib/utils';
import { useI18n } from '@lib/i18n';
import { createClient } from '@lib/supabase/client';
import { useCsvEnsayos } from '@hooks/useCsvEnsayos';

const supabase = createClient();

interface Props { projectId: string }

interface TemplateOption { id: string; id_protocolo: string; name: string }

export default function CsvExportSection({ projectId }: Props) {
  const { t } = useI18n();
  const { exportCsv, isExporting } = useCsvEnsayos(projectId);
  const [templateId, setTemplateId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  const { data: templates = [] } = useQuery({
    queryKey: ['templates-historical', projectId],
    queryFn: async (): Promise<TemplateOption[]> => {
      const { data } = await supabase
        .from('protocol_templates')
        .select('id, id_protocolo, name')
        .eq('project_id', projectId)
        .order('name');
      return (data ?? []) as TemplateOption[];
    },
  });

  const handleExport = async () => {
    if (!templateId) { setError(t('webCHist.selectProtocolFirst')); return; }
    setError(null);
    setStatusMsg(null);
    try {
      const { rowCount } = await exportCsv(templateId);
      setStatusMsg(rowCount === 0
        ? t('webCHist.noTestsForExport', { name: templateId })
        : t(rowCount === 1 ? 'webCHist.csvDownloaded_one' : 'webCHist.csvDownloaded', { count: rowCount, name: templateId }));
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <div className="bg-white rounded-md border border-border shadow-subtle p-4 flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <Table2 size={14} className="text-primary" />
        <p className="text-xs font-bold uppercase tracking-wider text-primary">{t('webCHist.step4Title')}</p>
      </div>
      <p className="text-xs text-textSecondary leading-relaxed">
        {t('webCHist.step4Desc', { emphasis: t('webCHist.step4Emphasis') })}
      </p>
      <div className="flex items-center gap-2 flex-wrap">
        <select
          value={templateId}
          onChange={e => setTemplateId(e.target.value)}
          className="flex-1 min-w-[200px] text-xs border border-border rounded px-2 py-1.5 bg-white focus:outline-none focus:border-primary"
        >
          <option value="">{t('webCHist.chooseProtocol')}</option>
          {templates.map(tpl => (
            <option key={tpl.id} value={tpl.id_protocolo}>{tpl.id_protocolo} — {tpl.name}</option>
          ))}
        </select>
        <button
          onClick={handleExport}
          disabled={!templateId || isExporting}
          className={cn(
            'flex items-center gap-1.5 px-4 py-1.5 text-xs font-bold rounded transition',
            templateId && !isExporting ? 'bg-primary text-white hover:bg-primary/90' : 'bg-border text-muted cursor-not-allowed',
          )}
        >
          {isExporting ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />}
          {isExporting ? t('webCHist.exporting') : t('webDash.exportCsv')}
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-danger/30 rounded-md p-3 flex items-start gap-2 text-xs text-danger">
          <AlertCircle size={14} className="shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}
      {statusMsg && !error && (
        <div className="bg-green-50 border border-success/30 rounded-md p-3 text-xs text-success font-bold">✓ {statusMsg}</div>
      )}
    </div>
  );
}
