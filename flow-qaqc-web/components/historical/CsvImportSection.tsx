'use client';

/**
 * CsvImportSection — importación de ensayos por CSV ANCHO (1 fila = 1 ensayo).
 *
 * Reusa el pipeline histórico completo: los ensayos entran como
 * APPROVED + is_historical + is_locked, con snapshot de fórmulas.
 * Vive dentro del tab "Históricos / CSV" de file-upload.
 */

import { useState, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Upload, Download, FileSpreadsheet, Loader2, AlertCircle } from 'lucide-react';
import { cn } from '@lib/utils';
import { useI18n } from '@lib/i18n';
import { useAuth } from '@lib/auth-context';
import { createClient } from '@lib/supabase/client';
import { useHistoricalImport, type UserResolution, type ImportSummary, type ParseAndValidateResult } from '@hooks/useHistoricalImport';
import { useCsvEnsayos } from '@hooks/useCsvEnsayos';
import { UserResolutionModal } from './UserResolutionModal';
import { ImportSummaryModal } from './ImportSummaryModal';

const supabase = createClient();

interface Props { projectId: string }

interface TemplateOption { id: string; id_protocolo: string; name: string }

export default function CsvImportSection({ projectId }: Props) {
  const { t } = useI18n();
  const { currentUser } = useAuth();
  const userId = currentUser?.id ?? '';
  const { resolveUsers, executeImport, isImporting } = useHistoricalImport(projectId, userId);
  const { parseAndValidateCsv, downloadCsvTemplate, isParsing } = useCsvEnsayos(projectId);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [templateId, setTemplateId] = useState('');
  const [parseResult, setParseResult] = useState<ParseAndValidateResult | null>(null);
  const [showUserModal, setShowUserModal] = useState(false);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
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

  const handleDownloadTemplate = async () => {
    if (!templateId) { setError(t('webCHist.selectProtocolFirst')); return; }
    setError(null);
    try {
      await downloadCsvTemplate(templateId);
      setStatusMsg(t('webCHist.csvTemplateDownloaded', { name: templateId }));
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const handleFile = async (file: File) => {
    setError(null);
    setStatusMsg(null);
    setParseResult(null);
    if (!userId) { setError(t('webCHist.loginToImportTests')); return; }
    if (!templateId) { setError(t('webCHist.selectCsvProtocolFirst')); return; }
    try {
      const result = await parseAndValidateCsv(file, templateId, {
        name: currentUser?.name ?? t('webCHist.defaultUser'),
        apellido: currentUser?.apellido ?? undefined,
      });
      setParseResult(result);
      if (result.unknownUsers.length > 0) setShowUserModal(true);
      else await proceedToImport(result, []);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const proceedToImport = async (pr: ParseAndValidateResult, resolutions: UserResolution[]) => {
    try {
      const { userMap } = await resolveUsers(resolutions);
      const sum = await executeImport(pr.validInstances, pr.templates, userMap, pr.existingExternalIds, pr.warnings);
      sum.errors = [...pr.errors, ...sum.errors];
      setSummary(sum);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const handleUserConfirm = async (resolutions: UserResolution[]) => {
    setShowUserModal(false);
    if (parseResult) await proceedToImport(parseResult, resolutions);
  };

  return (
    <div className="bg-white rounded-md border border-border shadow-subtle p-4 flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <FileSpreadsheet size={14} className="text-primary" />
        <p className="text-xs font-bold uppercase tracking-wider text-primary">{t('webCHist.step3Title')}</p>
      </div>
      <p className="text-xs text-textSecondary leading-relaxed">
        {t('webCHist.step3Desc', {
          format: t('webCHist.step3FormatEmphasis'),
          cols: 'external_id, ubicacion, fecha',
          example: '4A Peso molde + suelo',
          sep: ';',
          status: t('webCHist.step3StatusEmphasis'),
        })}
      </p>

      <div className="flex items-center gap-2 flex-wrap">
        <select
          value={templateId}
          onChange={e => setTemplateId(e.target.value)}
          className="flex-1 min-w-[200px] text-xs border border-border rounded px-2 py-1.5 bg-white focus:outline-none focus:border-primary"
        >
          <option value="">{t('webCHist.chooseCsvProtocol')}</option>
          {templates.map(tpl => (
            <option key={tpl.id} value={tpl.id_protocolo}>{tpl.id_protocolo} — {tpl.name}</option>
          ))}
        </select>
        <button
          onClick={handleDownloadTemplate}
          disabled={!templateId}
          className={cn(
            'flex items-center gap-1.5 px-4 py-1.5 text-xs font-bold rounded transition',
            templateId ? 'bg-primary text-white hover:bg-primary/90' : 'bg-border text-muted cursor-not-allowed',
          )}
        >
          <Download size={12} /> {t('webCHist.csvTemplateBtn')}
        </button>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept=".csv,text/csv"
        className="hidden"
        onChange={e => {
          const f = e.target.files?.[0];
          if (f) handleFile(f);
          e.target.value = '';
        }}
      />
      <button
        onClick={() => fileInputRef.current?.click()}
        disabled={isParsing || isImporting || !templateId}
        className={cn(
          'flex items-center justify-center gap-2 py-5 border-2 border-dashed border-border rounded-md transition',
          (isParsing || isImporting || !templateId) ? 'opacity-50 cursor-not-allowed' : 'hover:border-primary hover:bg-primary/5',
        )}
      >
        {isParsing ? (
          <><Loader2 size={16} className="animate-spin text-primary" /><span className="text-xs text-textSecondary">{t('webCHist.validating')}</span></>
        ) : isImporting ? (
          <><Loader2 size={16} className="animate-spin text-primary" /><span className="text-xs text-textSecondary">{t('webCHist.importing')}</span></>
        ) : (
          <><Upload size={16} className="text-primary" /><span className="text-xs font-bold text-primary">{templateId ? t('webCHist.uploadCsv') : t('webCHist.chooseProtocolFirst')}</span></>
        )}
      </button>

      {error && (
        <div className="bg-red-50 border border-danger/30 rounded-md p-3 flex items-start gap-2 text-xs text-danger">
          <AlertCircle size={14} className="shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}
      {statusMsg && !error && (
        <div className="bg-green-50 border border-success/30 rounded-md p-3 text-xs text-success font-bold">✓ {statusMsg}</div>
      )}

      {showUserModal && parseResult && (
        <UserResolutionModal
          unknownUsers={parseResult.unknownUsers}
          onConfirm={handleUserConfirm}
          onCancel={() => { setShowUserModal(false); setParseResult(null); }}
        />
      )}
      {summary && (
        <ImportSummaryModal summary={summary} onClose={() => { setSummary(null); setParseResult(null); }} />
      )}
    </div>
  );
}
