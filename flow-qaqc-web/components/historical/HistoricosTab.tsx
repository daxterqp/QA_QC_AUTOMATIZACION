'use client';

import { useState, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Upload, Download, History, Loader2, AlertCircle } from 'lucide-react';
import { cn } from '@lib/utils';
import { useI18n } from '@lib/i18n';
import { useAuth } from '@lib/auth-context';
import { createClient } from '@lib/supabase/client';
import { useHistoricalImport, downloadHistoricalTemplate, type UserResolution, type ImportSummary, type ParseAndValidateResult } from '@hooks/useHistoricalImport';
import { UserResolutionModal } from './UserResolutionModal';
import { ImportSummaryModal } from './ImportSummaryModal';
import CsvImportSection from './CsvImportSection';
import CsvExportSection from './CsvExportSection';

const supabase = createClient();

interface Props {
  projectId: string;
  /** Si el flag `historical_import` está activo. Las secciones de IMPORTACIÓN
   *  (Excel histórico + CSV de ensayos) se gatean; el export CSV es read-only
   *  y queda siempre visible. */
  importEnabled?: boolean;
}

interface TemplateOption {
  id: string;
  id_protocolo: string;
  name: string;
}

/** Tab "Históricos" del file-upload page. Orquesta:
 *   1. Descarga de plantilla por template_id_protocolo.
 *   2. Subida de Excel histórico → parse + valid.
 *   3. Modal resolución de users desconocidos.
 *   4. Insert real + modal de summary. */
export default function HistoricosTab({ projectId, importEnabled = true }: Props) {
  const { t } = useI18n();
  const { currentUser } = useAuth();
  const userId = currentUser?.id ?? '';
  const { parseAndValidate, resolveUsers, executeImport, isParsing, isImporting } = useHistoricalImport(projectId, userId);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [parseResult, setParseResult] = useState<ParseAndValidateResult | null>(null);
  const [showUserModal, setShowUserModal] = useState(false);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [downloadTemplate, setDownloadTemplate] = useState<string>('');

  // Lista de templates para el dropdown de "Descargar plantilla"
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
    if (!downloadTemplate) {
      setError(t('webCHist.selectProtocolFirst'));
      return;
    }
    setError(null);
    try {
      await downloadHistoricalTemplate(projectId, downloadTemplate);
      setStatusMsg(t('webCHist.templateDownloaded', { name: downloadTemplate }));
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const handleFile = async (file: File) => {
    setError(null);
    setStatusMsg(null);
    setParseResult(null);
    if (!userId) {
      setError(t('webCHist.loginToImport'));
      return;
    }
    try {
      const result = await parseAndValidate(file);
      setParseResult(result);
      if (result.unknownUsers.length > 0) {
        setShowUserModal(true);
      } else {
        // No hay users a resolver — saltar al insert directo
        await proceedToImport(result, []);
      }
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const proceedToImport = async (pr: ParseAndValidateResult, resolutions: UserResolution[]) => {
    try {
      const { userMap } = await resolveUsers(resolutions);
      const sum = await executeImport(
        pr.validInstances,
        pr.templates,
        userMap,
        pr.existingExternalIds,
        pr.warnings,
      );
      // Pre-pende errores de parse al summary final
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
    <div className="flex flex-col gap-4">
      {!importEnabled && (
        <div className="bg-white border border-border rounded-md p-3 text-xs text-textMuted italic">
          {t('webCHist.disabledNotice', { flag: 'historical_import' })}
        </div>
      )}
      {importEnabled && (<>
      {/* Header */}
      <div className="flex items-start gap-3 bg-primary/5 border border-primary/20 rounded-md p-3">
        <History size={18} className="text-primary shrink-0 mt-0.5" />
        <div className="flex-1">
          <p className="text-sm font-bold text-textPrimary mb-0.5">{t('webCHist.headerTitle')}</p>
          <p className="text-xs text-textSecondary leading-relaxed">
            {t('webCHist.headerDesc', { status: t('webCHist.headerStatusEmphasis') })}
          </p>
        </div>
      </div>

      {/* Sección 1: Descargar plantilla */}
      <div className="bg-white rounded-md border border-border shadow-subtle p-4 flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <Download size={14} className="text-primary" />
          <p className="text-xs font-bold uppercase tracking-wider text-primary">{t('webCHist.step1Title')}</p>
        </div>
        <p className="text-xs text-textSecondary">
          {t('webCHist.step1Desc')}
        </p>
        <div className="flex items-center gap-2 flex-wrap">
          <select
            value={downloadTemplate}
            onChange={e => setDownloadTemplate(e.target.value)}
            className="flex-1 min-w-[200px] text-xs border border-border rounded px-2 py-1.5 bg-white focus:outline-none focus:border-primary"
          >
            <option value="">{t('webCHist.chooseProtocol')}</option>
            {templates.map(tpl => (
              <option key={tpl.id} value={tpl.id_protocolo}>{tpl.id_protocolo} — {tpl.name}</option>
            ))}
          </select>
          <button
            onClick={handleDownloadTemplate}
            disabled={!downloadTemplate}
            className={cn(
              'flex items-center gap-1.5 px-4 py-1.5 text-xs font-bold rounded transition',
              downloadTemplate ? 'bg-primary text-white hover:bg-primary/90' : 'bg-border text-muted cursor-not-allowed',
            )}
          >
            <Download size={12} /> {t('webCHist.download')}
          </button>
        </div>
      </div>

      {/* Sección 2: Subir Excel */}
      <div className="bg-white rounded-md border border-border shadow-subtle p-4 flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <Upload size={14} className="text-primary" />
          <p className="text-xs font-bold uppercase tracking-wider text-primary">{t('webCHist.step2Title')}</p>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx,.xls"
          className="hidden"
          onChange={e => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
            e.target.value = ''; // permite re-subir el mismo archivo
          }}
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={isParsing || isImporting}
          className={cn(
            'flex items-center justify-center gap-2 py-6 border-2 border-dashed border-border rounded-md transition',
            (isParsing || isImporting) ? 'opacity-50 cursor-not-allowed' : 'hover:border-primary hover:bg-primary/5',
          )}
        >
          {isParsing ? (
            <>
              <Loader2 size={16} className="animate-spin text-primary" />
              <span className="text-xs text-textSecondary">{t('webCHist.validating')}</span>
            </>
          ) : isImporting ? (
            <>
              <Loader2 size={16} className="animate-spin text-primary" />
              <span className="text-xs text-textSecondary">{t('webCHist.importing')}</span>
            </>
          ) : (
            <>
              <Upload size={16} className="text-primary" />
              <span className="text-xs font-bold text-primary">{t('webCHist.uploadXlsx')}</span>
            </>
          )}
        </button>
      </div>

      {/* Sección 3: Importar CSV de ensayos (formato ancho, 1 fila = 1 ensayo) */}
      <CsvImportSection projectId={projectId} />
      </>)}

      {/* Sección 4: Exportar CSV — siempre visible (read-only) */}
      <CsvExportSection projectId={projectId} />

      {/* Mensajes */}
      {error && (
        <div className="bg-red-50 border border-danger/30 rounded-md p-3 flex items-start gap-2 text-xs text-danger">
          <AlertCircle size={14} className="shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}
      {statusMsg && !error && (
        <div className="bg-green-50 border border-success/30 rounded-md p-3 text-xs text-success font-bold">
          ✓ {statusMsg}
        </div>
      )}

      {/* Modales */}
      {showUserModal && parseResult && (
        <UserResolutionModal
          unknownUsers={parseResult.unknownUsers}
          onConfirm={handleUserConfirm}
          onCancel={() => {
            setShowUserModal(false);
            setParseResult(null);
          }}
        />
      )}
      {summary && (
        <ImportSummaryModal summary={summary} onClose={() => { setSummary(null); setParseResult(null); }} />
      )}
    </div>
  );
}
