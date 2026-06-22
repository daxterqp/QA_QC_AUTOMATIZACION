'use client';

import { useRef, useState, useEffect } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import {
  Upload, Loader2, CheckCircle, AlertCircle, FileText, MapPin,
  Image, Pen, RefreshCw, FileArchive, Settings, Table, Trash2,
  ChevronDown, ChevronUp, Download, BookOpen, History, Wrench, Activity as ActivityIcon,
  Shapes, Zap, Truck, FlaskConical, MoreHorizontal, Eye, EyeOff, Plus,
} from 'lucide-react';
import HistoricosTab from '@components/historical/HistoricosTab';
import { SectoresTab } from '@components/sectors/SectoresTab';
import { useEquipment, useEquipmentActivities, type EquipmentActivityInfo } from '@hooks/useEquipment';
import { useProjectFlags } from '@hooks/useProjects';
import PageHeader from '@components/PageHeader';
import { useProjects } from '@hooks/useProjects';
import {
  useTemplates, useLocationsList, useLocalPlans,
  importActivitiesToSupabase, importLocationsToSupabase,
  uploadProjectLogo, uploadUserSignature, useToggleTemplateHidden,
} from '@hooks/useFileUpload';
import type { LocalPlanFile } from '@hooks/useFileUpload';
import { parseActivitiesExcel, parseLocationsExcel, parseTraceabilityExcel, ExcelParseError, type TraceabilityImportResult } from '@lib/excelParser';
import { validateProtocolSpec } from '@lib/protocolValidator';
import { importTraceabilityToSupabase, type TraceabilityImportSummary } from '@hooks/useFileUpload';
import { useTemplateNorm, useUploadTemplateNorm, useDeleteTemplateNorm } from '@hooks/useTemplateNorm';

import { useAuth } from '@lib/auth-context';
import { useLabAuxTablesList, useCalibrateLabAuxTable } from '@hooks/useLabAuxTables';
import { generateCalibrationReportPdf } from '@lib/pdfGenerator';
import type { LabAuxTable } from '@/types';
import { cn } from '@lib/utils';
import { useI18n } from '@lib/i18n';


type Tab = 'actividades' | 'ubicaciones' | 'planos' | 'configuracion' | 'dwg' | 'normas' | 'historicos' | 'equipos' | 'equipos_lab' | 'sectores';

// ── Status badge ──────────────────────────────────────────────────────────────

type ImportStatus =
  | { type: 'idle' }
  | { type: 'loading'; msg?: string }
  | { type: 'success'; msg: string }
  | { type: 'error'; msg: string };

function StatusBadge({ s }: { s: ImportStatus }) {
  const { t } = useI18n();
  if (s.type === 'idle') return null;
  if (s.type === 'loading')  return (
    <div className="flex items-center gap-2 text-xs text-primary font-medium py-1">
      <Loader2 className="w-3.5 h-3.5 animate-spin" />
      {s.msg ?? t('webUpload.processing')}
    </div>
  );
  if (s.type === 'success')  return (
    <div className="flex items-center gap-2 text-xs text-success font-semibold py-1">
      <CheckCircle className="w-3.5 h-3.5" />
      {s.msg}
    </div>
  );
  return (
    <div className="flex items-center gap-2 text-xs text-danger font-semibold py-1">
      <AlertCircle className="w-3.5 h-3.5" />
      {s.msg}
    </div>
  );
}

// ── File input button ─────────────────────────────────────────────────────────

function UploadButton({
  label, accept, multiple = false, loading, onClick,
}: {
  label: string; accept: string; multiple?: boolean; loading: boolean;
  onClick: (files: FileList) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <>
      <input
        ref={ref} type="file" accept={accept} multiple={multiple}
        className="hidden"
        onChange={e => { if (e.target.files?.length) { onClick(e.target.files); e.target.value = ''; } }}
      />
      <button
        onClick={() => ref.current?.click()}
        disabled={loading}
        className="flex items-center justify-center gap-2 w-full px-4 py-2.5 rounded-lg bg-primary text-white text-sm font-bold
                   hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
        {label}
      </button>
    </>
  );
}

// ── Actividades tab ───────────────────────────────────────────────────────────

function ActividadesTab({ projectId }: { projectId: string }) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const { data: templates = [], isLoading } = useTemplates(projectId);
  const { currentUser } = useAuth();
  const isCreator = currentUser?.role === 'CREATOR';
  const toggleHidden = useToggleTemplateHidden(projectId);
  const [status, setStatus] = useState<ImportStatus>({ type: 'idle' });
  const [deleteMode, setDeleteMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);

  function toggleSelect(id: string) {
    setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }

  async function handleDeleteTemplates() {
    if (selected.size === 0) return;
    setDeleting(true);
    try {
      const res = await fetch('/api/templates/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, templateIds: Array.from(selected) }),
      });
      if (!res.ok) throw new Error(await res.text());
      qc.invalidateQueries({ queryKey: ['templates', projectId] });
      qc.invalidateQueries({ queryKey: ['dossier-protocols', projectId] });
      setSelected(new Set());
      setDeleteMode(false);
    } catch (e) { console.error('[templates/delete] error:', e); }
    finally { setDeleting(false); }
  }

  async function handleFile(files: FileList) {
    const file = files[0];
    setStatus({ type: 'loading', msg: t('webUpload.readingFile') });
    try {
      const result = await parseActivitiesExcel(file);

      // v32 — Validación estática de cada ficha (sintaxis DSL, refs, ciclos,
      // matrices, gráficos). NO bloquea el import: reporta errores accionables
      // para corregir el Excel (o para que la IA que lo generó se auto-corrija).
      const fichaErrors: string[] = [];
      for (const proto of result.protocols) {
        const v = validateProtocolSpec(proto.activities.map(a => ({
          partida_item: a.partidaItem || null,
          item_description: a.itemDescription,
          validation_method: a.validationMethod || null,
        })));
        for (const issue of v.issues) {
          const line = `[${proto.idProtocolo}] ${issue.message}`;
          if (issue.severity === 'error') fichaErrors.push(line);
          console.warn(`[validateProtocolSpec:${issue.severity}]`, line);
        }
      }

      setStatus({ type: 'loading', msg: t('webUpload.importingProtocols', { count: result.protocols.length }) });
      const summary = await importActivitiesToSupabase(
        projectId, result.protocols,
        (cur, tot) => setStatus({ type: 'loading', msg: t('webUpload.importingProgress', { cur, tot }) }),
      );
      qc.invalidateQueries({ queryKey: ['templates', projectId] });
      const parts: string[] = [];
      if (summary.added > 0)    parts.push(t(summary.added !== 1 ? 'webUpload.summaryNewPlural' : 'webUpload.summaryNew', { count: summary.added }));
      if (summary.modified > 0) parts.push(t(summary.modified !== 1 ? 'webUpload.summaryModifiedPlural' : 'webUpload.summaryModified', { count: summary.modified }));
      const okMsg = parts.length
        ? t((summary.added + summary.modified) !== 1 ? 'webUpload.summaryProtocolsSuffixPlural' : 'webUpload.summaryProtocolsSuffix', { parts: parts.join(' · ') })
        : t('webUpload.noChanges');
      if (fichaErrors.length > 0) {
        // Errores estructurales de las fichas: el import se hizo, pero esas
        // fichas van a fallar al llenarse — corregir el Excel y reimportar.
        const detail = `${fichaErrors.slice(0, 2).join(' / ')}${fichaErrors.length > 2 ? t('webUpload.seeConsole') : ''}`;
        setStatus({ type: 'error', msg: t(fichaErrors.length !== 1 ? 'webUpload.fichaErrorsPlural' : 'webUpload.fichaErrors', { okMsg, count: fichaErrors.length, detail }) });
      } else if (summary.warnings.length > 0) {
        // Loguear todos los warnings y avisar al usuario en el banner
        for (const w of summary.warnings) console.warn('[importActivities]', w);
        const detail = `${summary.warnings.slice(0, 2).join(' / ')}${summary.warnings.length > 2 ? ' …' : ''}`;
        setStatus({ type: 'success', msg: t(summary.warnings.length !== 1 ? 'webUpload.warningsPlural' : 'webUpload.warnings', { okMsg, count: summary.warnings.length, detail }) });
      } else {
        setStatus({ type: 'success', msg: okMsg });
      }
    } catch (e) {
      const msg = e instanceof ExcelParseError ? e.message : (e instanceof Error ? e.message : (typeof e === 'string' ? e : JSON.stringify(e)));
      setStatus({ type: 'error', msg });
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="bg-white rounded-xl shadow-subtle p-4 flex flex-col gap-3">
        <p className="text-xs text-gray-500 leading-relaxed">
          {t('webUpload.activitiesIntro1')}
          <span className="font-mono text-[11px] text-primary"> ID_Protocolo, Protocolo, PartidaItem, Actividad realizada, Método de validación</span>.
          {' '}{t('webUpload.activitiesIntro2')}
        </p>
        <div className="flex items-center gap-2">
          <div className="flex-1">
            <UploadButton
              label={t('webUpload.importActivitiesBtn')}
              accept=".xlsx,.xls"
              loading={status.type === 'loading'}
              onClick={handleFile}
            />
          </div>
          {!deleteMode ? (
            <button onClick={() => { setDeleteMode(true); setSelected(new Set()); }}
              disabled={templates.length === 0}
              className="flex items-center justify-center w-10 h-10 rounded-lg bg-danger text-white hover:bg-red-700
                         transition-colors disabled:opacity-40 shrink-0"
              title={t('webUpload.deleteProtocolsTitle')}>
              <Trash2 className="w-4 h-4" />
            </button>
          ) : (
            <>
              <button onClick={() => { setDeleteMode(false); setSelected(new Set()); }}
                className="px-3 py-2.5 rounded-lg text-xs font-bold text-gray-600 border border-border hover:bg-gray-50 transition shrink-0">
                {t('common.cancel')}
              </button>
              <button onClick={handleDeleteTemplates}
                disabled={selected.size === 0 || deleting}
                className="px-3 py-2.5 rounded-lg bg-danger text-white text-xs font-bold
                           disabled:opacity-40 hover:bg-red-700 transition flex items-center gap-1 shrink-0">
                {deleting && <Loader2 className="w-3 h-3 animate-spin" />}
                {deleting ? t('webUpload.deleting') : t('webUpload.deleteCount', { count: selected.size })}
              </button>
            </>
          )}
        </div>
        <StatusBadge s={status} />
      </div>

      {isLoading ? (
        <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>
      ) : templates.length > 0 ? (
        <div className="bg-white rounded-xl shadow-subtle overflow-hidden">
          <div className="px-4 py-3 border-b border-border">
            <p className="text-xs font-bold text-gray-700">{t('webUpload.protocolsLoaded', { count: templates.length })}</p>
          </div>
          <div className="divide-y divide-divider max-h-[50vh] overflow-y-auto">
            {templates.map(tpl => (
              <div key={tpl.id}
                onClick={deleteMode ? () => toggleSelect(tpl.id) : undefined}
                className={cn('px-4 py-3 flex items-center gap-3 transition',
                  deleteMode && 'cursor-pointer hover:bg-red-50/50',
                  deleteMode && selected.has(tpl.id) && 'bg-red-50/50 ring-1 ring-danger/30',
                )}>
                {deleteMode && (
                  <input type="checkbox" checked={selected.has(tpl.id)} onChange={() => toggleSelect(tpl.id)}
                    className="w-4 h-4 rounded border-gray-300 text-danger focus:ring-danger/30 shrink-0" />
                )}
                <span className="text-[11px] font-bold text-primary bg-light px-2 py-0.5 rounded shrink-0">
                  {tpl.id_protocolo}
                </span>
                <p className={cn('flex-1 text-xs leading-snug min-w-0 truncate', tpl.is_hidden ? 'text-gray-400 line-through' : 'text-gray-700')}>{tpl.name}</p>
                {tpl.is_hidden && (
                  <span className="text-[10px] font-bold text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded shrink-0">{t('webUpload.hidden')}</span>
                )}
                <p className="text-[10px] text-gray-400 shrink-0">
                  {new Date(tpl.created_at).toLocaleDateString('es-PE')}
                </p>
                {!deleteMode && isCreator && (
                  <button
                    onClick={(e) => { e.stopPropagation(); toggleHidden.mutate({ id: tpl.id, hidden: !tpl.is_hidden }); }}
                    disabled={toggleHidden.isPending}
                    title={tpl.is_hidden ? t('webUpload.showTestTypeTitle') : t('webUpload.hideTestTypeTitle')}
                    className="flex items-center justify-center w-8 h-8 rounded-lg text-gray-500 hover:bg-gray-100 hover:text-primary transition shrink-0 disabled:opacity-40">
                    {tpl.is_hidden ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

// ── Ubicaciones tab ───────────────────────────────────────────────────────────

function UbicacionesTab({ projectId }: { projectId: string }) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const { data: locations = [], isLoading } = useLocationsList(projectId);
  const [status, setStatus] = useState<ImportStatus>({ type: 'idle' });
  const [deleteMode, setDeleteMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);

  function toggleSelect(id: string) {
    setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }

  async function handleDeleteLocations() {
    if (selected.size === 0) return;
    setDeleting(true);
    try {
      const res = await fetch('/api/locations/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, locationIds: Array.from(selected) }),
      });
      if (!res.ok) throw new Error(await res.text());
      qc.invalidateQueries({ queryKey: ['locations-list', projectId] });
      qc.invalidateQueries({ queryKey: ['locations', projectId] });
      qc.invalidateQueries({ queryKey: ['dossier-protocols', projectId] });
      setSelected(new Set());
      setDeleteMode(false);
    } catch (e) { console.error('[locations/delete] error:', e); }
    finally { setDeleting(false); }
  }

  async function handleFile(files: FileList) {
    const file = files[0];
    setStatus({ type: 'loading', msg: t('webUpload.readingFile') });
    try {
      const result = await parseLocationsExcel(file);
      setStatus({ type: 'loading', msg: t('webUpload.importingLocations', { count: result.locations.length }) });
      const summary = await importLocationsToSupabase(projectId, result.locations);
      qc.invalidateQueries({ queryKey: ['locations-list', projectId] });
      qc.invalidateQueries({ queryKey: ['locations', projectId] });
      const parts: string[] = [];
      if (summary.added > 0)    parts.push(t(summary.added !== 1 ? 'webUpload.summaryNewFemPlural' : 'webUpload.summaryNewFem', { count: summary.added }));
      if (summary.modified > 0) parts.push(t(summary.modified !== 1 ? 'webUpload.summaryModifiedFemPlural' : 'webUpload.summaryModifiedFem', { count: summary.modified }));
      setStatus({ type: 'success', msg: parts.length
        ? t((summary.added + summary.modified) !== 1 ? 'webUpload.summaryLocationsSuffixPlural' : 'webUpload.summaryLocationsSuffix', { parts: parts.join(' · ') })
        : t('webUpload.noChanges') });
    } catch (e) {
      const msg = e instanceof ExcelParseError ? e.message : (e instanceof Error ? e.message : (typeof e === 'string' ? e : JSON.stringify(e)));
      setStatus({ type: 'error', msg });
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="bg-white rounded-xl shadow-subtle p-4 flex flex-col gap-3">
        <p className="text-xs text-gray-500 leading-relaxed">
          {t('webUpload.locationsIntro1')}
          <span className="font-mono text-[11px] text-primary"> Ubicación, PLANO DE REFERENCIA, ID_Protocolos</span>.
          {' '}{t('webUpload.locationsIntroOptional')} <span className="font-mono text-[11px] text-primary">Ubicación_Sola, Especialidad_Sola</span>.
        </p>
        <div className="flex items-center gap-2">
          <div className="flex-1">
            <UploadButton
              label={t('webUpload.importLocationsBtn')}
              accept=".xlsx,.xls"
              loading={status.type === 'loading'}
              onClick={handleFile}
            />
          </div>
          {!deleteMode ? (
            <button onClick={() => { setDeleteMode(true); setSelected(new Set()); }}
              disabled={locations.length === 0}
              className="flex items-center justify-center w-10 h-10 rounded-lg bg-danger text-white hover:bg-red-700
                         transition-colors disabled:opacity-40 shrink-0"
              title={t('webUpload.deleteLocationsTitle')}>
              <Trash2 className="w-4 h-4" />
            </button>
          ) : (
            <>
              <button onClick={() => { setDeleteMode(false); setSelected(new Set()); }}
                className="px-3 py-2.5 rounded-lg text-xs font-bold text-gray-600 border border-border hover:bg-gray-50 transition shrink-0">
                {t('common.cancel')}
              </button>
              <button onClick={handleDeleteLocations}
                disabled={selected.size === 0 || deleting}
                className="px-3 py-2.5 rounded-lg bg-danger text-white text-xs font-bold
                           disabled:opacity-40 hover:bg-red-700 transition flex items-center gap-1 shrink-0">
                {deleting && <Loader2 className="w-3 h-3 animate-spin" />}
                {deleting ? t('webUpload.deleting') : t('webUpload.deleteCount', { count: selected.size })}
              </button>
            </>
          )}
        </div>
        <StatusBadge s={status} />
      </div>

      {isLoading ? (
        <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>
      ) : locations.length > 0 ? (
        <div className="bg-white rounded-xl shadow-subtle overflow-hidden">
          <div className="px-4 py-3 border-b border-border">
            <p className="text-xs font-bold text-gray-700">{t('webUpload.locationsLoaded', { count: locations.length })}</p>
          </div>
          <div className="divide-y divide-divider max-h-[50vh] overflow-y-auto">
            {locations.map(loc => (
              <div key={loc.id}
                onClick={deleteMode ? () => toggleSelect(loc.id) : undefined}
                className={cn('px-4 py-3 flex items-center gap-3 transition',
                  deleteMode && 'cursor-pointer hover:bg-red-50/50',
                  deleteMode && selected.has(loc.id) && 'bg-red-50/50 ring-1 ring-danger/30',
                )}>
                {deleteMode && (
                  <input type="checkbox" checked={selected.has(loc.id)} onChange={() => toggleSelect(loc.id)}
                    className="w-4 h-4 rounded border-gray-300 text-danger focus:ring-danger/30 shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-gray-800 truncate">{loc.name}</p>
                  {loc.specialty && (
                    <p className="text-[11px] text-gray-400 truncate">{loc.specialty}</p>
                  )}
                </div>
                <p className="text-[10px] text-gray-400 shrink-0">
                  {new Date(loc.created_at).toLocaleDateString('es-PE')}
                </p>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

// ── Plan file card (from local filesystem) ────────────────────────────────────

function PlanFileCard({
  file, badge, onRelink, relinking, selectMode, selected, onToggleSelect,
}: {
  file:      LocalPlanFile;
  badge:     string;
  onRelink:  () => void;
  relinking: boolean;
  selectMode: boolean;
  selected:   boolean;
  onToggleSelect: () => void;
}) {
  const { t } = useI18n();
  const [expanded, setExpanded] = useState(false);
  const locCount = file.locations.length;

  return (
    <div className={cn(
      'bg-white rounded-xl shadow-subtle overflow-hidden transition-colors',
      selected && 'ring-2 ring-danger/50 bg-red-50/30',
    )}>
      {/* Header row */}
      <div className="flex items-center gap-3 px-4 py-3">
        {selectMode && (
          <input
            type="checkbox"
            checked={selected}
            onChange={onToggleSelect}
            className="w-4 h-4 rounded border-gray-300 text-danger focus:ring-danger/30 shrink-0 cursor-pointer"
          />
        )}
        <span className="text-[10px] font-bold bg-red-100 text-danger px-1.5 py-0.5 rounded uppercase tracking-wide shrink-0">
          {badge}
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-gray-800 truncate">{file.filename}</p>
          <p className={cn('text-xs', locCount > 0 ? 'text-primary font-medium' : 'text-gray-400')}>
            {locCount > 0 ? t(locCount !== 1 ? 'webUpload.linkedLocations' : 'webUpload.linkedLocation', { count: locCount }) : t('webUpload.noLinkedLocation')}
          </p>
        </div>
        {!selectMode && (
          <>
            <button
              onClick={onRelink}
              disabled={relinking}
              className="text-gray-400 hover:text-primary transition-colors disabled:opacity-40 p-1"
              title={t('webUpload.relinkTitle')}
            >
              {relinking
                ? <Loader2 className="w-4 h-4 animate-spin" />
                : <RefreshCw className="w-4 h-4" />}
            </button>
            <button
              onClick={() => setExpanded(v => !v)}
              className="text-gray-400 hover:text-gray-700 transition-colors p-1"
            >
              {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
          </>
        )}
      </div>

      {/* Location list */}
      {expanded && !selectMode && (
        <div className="border-t border-border divide-y divide-border">
          {file.locations.length === 0 ? (
            <div className="flex items-center gap-2 px-4 py-2.5">
              <span className="text-xs text-gray-400">{t('webUpload.noLinkedLocations')}</span>
            </div>
          ) : (
            file.locations.map(locName => (
              <div key={locName} className="flex items-center gap-2 px-4 py-2.5">
                <MapPin className="w-3.5 h-3.5 text-primary shrink-0" />
                <span className="flex-1 text-xs text-gray-700 truncate">{locName}</span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

// ── Generic plans tab (PDF or DWG) ────────────────────────────────────────────

function PlansTab({
  projectId,
  projectName,
  fileType,
}: {
  projectId:   string;
  projectName: string;
  fileType:    'pdf' | 'dwg';
}) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const { data: files = [], isLoading: plansLoading } = useLocalPlans(projectId, projectName, fileType);
  const [uploadStatus, setUploadStatus] = useState<ImportStatus>({ type: 'idle' });
  const [syncStatus,   setSyncStatus]   = useState<ImportStatus>({ type: 'idle' });
  const [relinkingId, setRelinkingId] = useState<string | null>(null);
  const [deleteMode,  setDeleteMode]  = useState(false);
  const [selected,    setSelected]    = useState<Set<string>>(new Set());
  const [deleting,    setDeleting]    = useState(false);

  const isPdf  = fileType === 'pdf';
  const accept = isPdf ? '.pdf' : '.dwg,application/acad,image/vnd.dwg';
  const badge    = isPdf ? 'PDF' : 'DWG';
  const uploadLabel  = isPdf ? t('webUpload.uploadPdf')   : t('webUpload.uploadDwg');
  const reloadLabel  = isPdf ? t('webUpload.reloadPdf')   : t('webUpload.reloadDwg');
  const deleteLabel  = isPdf ? t('webUpload.deletePdf')   : t('webUpload.deleteDwg');
  const emptyLabel   = isPdf ? t('webUpload.noPdfPlans')  : t('webUpload.noDwgPlans');

  function toggleSelect(filename: string) {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(filename)) next.delete(filename);
      else next.add(filename);
      return next;
    });
  }

  async function handleDelete() {
    if (selected.size === 0) return;
    setDeleting(true);
    try {
      const res = await fetch('/api/plans/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId, projectName,
          filenames: Array.from(selected),
          type: fileType,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      await qc.refetchQueries({ queryKey: ['local-plans', projectId, fileType] });
      setSelected(new Set());
      setDeleteMode(false);
    } catch (e) {
      console.error('[plans/delete] error:', e);
    } finally {
      setDeleting(false);
    }
  }

  // ── Upload: local disk → S3 → DB ──────────────────────────────────────────
  const uploadRef = useRef<HTMLInputElement>(null);

  async function handleUpload(files: FileList) {
    const arr = Array.from(files);
    if (arr.length === 0) return;
    setUploadStatus({ type: 'loading', msg: t(arr.length !== 1 ? 'webUpload.uploadingFilesPlural' : 'webUpload.uploadingFiles', { count: arr.length }) });
    try {
      const fd = new FormData();
      fd.append('projectId',   projectId);
      fd.append('projectName', projectName);
      fd.append('type',        fileType);
      for (const f of arr) fd.append('files', f);

      const res = await fetch('/api/plans/upload', { method: 'POST', body: fd });
      if (!res.ok) throw new Error(await res.text());
      const { results } = await res.json();

      // Trigger sync to ensure full parity (local ↔ S3)
      await fetch('/api/plans/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, projectName, type: fileType }),
      }).catch(() => {});

      await qc.refetchQueries({ queryKey: ['local-plans', projectId, fileType] });
      const linked = results.reduce((acc: number, r: any) => acc + r.matched, 0);
      const plansMsg = t(arr.length !== 1 ? 'webUpload.plansUploadedPlural' : 'webUpload.planUploaded', { count: arr.length });
      const linksMsg = t(linked !== 1 ? 'webUpload.linksCreatedPlural' : 'webUpload.linkCreated', { count: linked });
      setUploadStatus({
        type: 'success',
        msg: t('webUpload.plansUploadedResult', { plans: plansMsg, links: linksMsg }),
      });
    } catch (e) {
      setUploadStatus({ type: 'error', msg: t('webUpload.errorPrefix', { detail: String(e) }) });
    }
  }

  // ── Sync: Local ↔ S3 (by name only) ────────────────────────────────────────
  async function handleSync() {
    setSyncStatus({ type: 'loading', msg: t('webUpload.syncing') });
    try {
      const res = await fetch('/api/plans/sync', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ projectId, projectName, type: fileType }),
      });
      if (!res.ok) throw new Error(await res.text());
      const { stats, summary } = await res.json();
      await qc.refetchQueries({ queryKey: ['local-plans', projectId, fileType] });
      const parts: string[] = [];
      if (stats.downloaded > 0) parts.push(t(stats.downloaded !== 1 ? 'webUpload.downloadedPlural' : 'webUpload.downloaded', { count: stats.downloaded }));
      if (stats.uploaded > 0)   parts.push(t(stats.uploaded !== 1 ? 'webUpload.uploadedPlural' : 'webUpload.uploaded', { count: stats.uploaded }));
      if (stats.updated > 0)    parts.push(t(stats.updated !== 1 ? 'webUpload.updatedPlural' : 'webUpload.updated', { count: stats.updated }));
      setSyncStatus({
        type: 'success',
        msg: parts.length
          ? parts.join(' · ')
          : t('webUpload.syncedSummary', { local: summary.local, cloud: summary.cloud }),
      });
    } catch (e) {
      setSyncStatus({ type: 'error', msg: t('webUpload.errorPrefix', { detail: String(e) }) });
    }
  }

  // ── Relink a file ──────────────────────────────────────────────────────────
  async function handleRelink(file: LocalPlanFile) {
    setRelinkingId(file.filename);
    try {
      const s3Key = file.s3Key ?? `projects/${projectName.toLowerCase().replace(/\s+/g, '_')}/${fileType === 'dwg' ? 'plansdwg' : 'plans'}/${file.filename}`;
      const res = await fetch('/api/plans/relink', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ projectId, planName: file.planName, s3Key, fileType }),
      });
      if (!res.ok) throw new Error(await res.text());
      await qc.refetchQueries({ queryKey: ['local-plans', projectId, fileType] });
    } finally {
      setRelinkingId(null);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Action buttons */}
      <div className="flex gap-2">
        {!deleteMode ? (
          <>
            <input
              ref={uploadRef}
              type="file"
              accept={accept}
              multiple
              className="hidden"
              onChange={e => { if (e.target.files?.length) { handleUpload(e.target.files); e.target.value = ''; } }}
            />
            <button
              onClick={() => uploadRef.current?.click()}
              disabled={uploadStatus.type === 'loading'}
              className="flex-1 flex items-center justify-center gap-2 py-3.5 rounded-xl bg-primary text-white text-sm font-bold
                         hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {uploadStatus.type === 'loading'
                ? <Loader2 className="w-4 h-4 animate-spin" />
                : <Upload className="w-4 h-4" />}
              {uploadLabel}
            </button>
            <button
              onClick={handleSync}
              disabled={syncStatus.type === 'loading'}
              className="flex-1 flex items-center justify-center gap-2 py-3.5 rounded-xl bg-success text-white text-sm font-bold
                         hover:bg-success/90 transition-colors disabled:opacity-50"
            >
              {syncStatus.type === 'loading'
                ? <Loader2 className="w-4 h-4 animate-spin" />
                : <Download className="w-4 h-4" />}
              {reloadLabel}
            </button>
            <button
              onClick={() => { setDeleteMode(true); setSelected(new Set()); }}
              disabled={files.length === 0}
              className="flex items-center justify-center gap-2 px-4 py-3.5 rounded-xl bg-danger text-white text-sm font-bold
                         hover:bg-red-700 transition-colors disabled:opacity-50"
              title={deleteLabel}
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </>
        ) : (
          <>
            <button
              onClick={() => { setDeleteMode(false); setSelected(new Set()); }}
              className="flex-1 flex items-center justify-center gap-2 py-3.5 rounded-xl border-2 border-border text-gray-600 text-sm font-bold
                         hover:bg-surface transition-colors"
            >
              {t('common.cancel')}
            </button>
            <button
              onClick={handleDelete}
              disabled={selected.size === 0 || deleting}
              className="flex-1 flex items-center justify-center gap-2 py-3.5 rounded-xl bg-danger text-white text-sm font-bold
                         hover:bg-red-700 transition-colors disabled:opacity-50"
            >
              {deleting
                ? <Loader2 className="w-4 h-4 animate-spin" />
                : <Trash2 className="w-4 h-4" />}
              {t('webUpload.confirmCount', { count: selected.size })}
            </button>
          </>
        )}
      </div>

      {/* Status feedback */}
      {(uploadStatus.type !== 'idle' || syncStatus.type !== 'idle') && (
        <div className="bg-white rounded-xl shadow-subtle px-4 py-3 flex flex-col gap-1">
          {uploadStatus.type !== 'idle' && <StatusBadge s={uploadStatus} />}
          {syncStatus.type   !== 'idle' && <StatusBadge s={syncStatus}   />}
        </div>
      )}

      {/* Plan files */}
      {plansLoading ? (
        <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>
      ) : files.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-12 text-center">
          <FileText className="w-10 h-10 text-gray-200" />
          <p className="text-sm text-gray-400">{emptyLabel}</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {files.map(file => (
            <PlanFileCard
              key={file.filename}
              file={file}
              badge={badge}
              selectMode={deleteMode}
              selected={selected.has(file.filename)}
              onToggleSelect={() => toggleSelect(file.filename)}
              onRelink={() => handleRelink(file)}
              relinking={relinkingId === file.filename}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Planos tab ────────────────────────────────────────────────────────────────

function PlanosTab({ projectId, projectName }: { projectId: string; projectName: string }) {
  return <PlansTab projectId={projectId} projectName={projectName} fileType="pdf" />;
}

// ── DWG Tab ───────────────────────────────────────────────────────────────────

function DwgTab({ projectId, projectName }: { projectId: string; projectName: string }) {
  return <PlansTab projectId={projectId} projectName={projectName} fileType="dwg" />;
}

// ── Configuración tab ─────────────────────────────────────────────────────────

function ConfiguracionTab({ projectId }: { projectId: string }) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const { currentUser } = useAuth();
  const { data: projects = [] } = useProjects();
  const project = projects.find(p => p.id === projectId);

  const [logoStatus,  setLogoStatus]  = useState<ImportStatus>({ type: 'idle' });
  const [signStatus,  setSignStatus]  = useState<ImportStatus>({ type: 'idle' });
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [signPreview, setSignPreview] = useState<string | null>(null);
  const [stampComment, setStampComment] = useState('');

  // Load previews when project data arrives
  useEffect(() => {
    if (!project) return;
    // Try logo_s3_key from DB, fallback to standard path — always fresh on load
    const logoKey = project.logo_s3_key ?? `logos/project_${project.id}/logo.jpg`;
    setLogoPreview(`/api/s3-image?key=${encodeURIComponent(logoKey)}&fresh=1&t=${Date.now()}`);
    if (project.stamp_comment) {
      setStampComment(project.stamp_comment);
    }
  }, [project?.id, project?.logo_s3_key, project?.stamp_comment]);

  useEffect(() => {
    if (currentUser?.id) {
      setSignPreview(`/api/s3-image?key=${encodeURIComponent(`signatures/${currentUser.id}/signature.jpg`)}&fresh=1&t=${Date.now()}`);
    }
  }, [currentUser?.id]);
  const [stampStatus, setStampStatus] = useState<ImportStatus>({ type: 'idle' });

  async function handleSaveStamp() {
    const supabase = (await import('@lib/supabase/client')).createClient();
    const combined = stampComment.trim();
    setStampStatus({ type: 'loading', msg: t('webUpload.savingStamp') });
    try {
      const { error } = await supabase
        .from('projects')
        .update({ stamp_comment: combined || null, updated_at: Date.now() })
        .eq('id', projectId);
      if (error) throw new Error(error.message);
      qc.invalidateQueries({ queryKey: ['projects'] });
      setStampStatus({ type: 'success', msg: t('webUpload.stampSaved') });
    } catch (e: any) {
      setStampStatus({ type: 'error', msg: e?.message ?? t('webUpload.saveError') });
    }
  }

  async function handleLogo(files: FileList) {
    const file = files[0];
    setLogoStatus({ type: 'loading', msg: t('webUpload.uploadingLogo') });
    try {
      const s3Key = await uploadProjectLogo(file, projectId);
      qc.invalidateQueries({ queryKey: ['projects'] });
      // Invalidate local cache + browser cache with fresh param
      setLogoPreview(`/api/s3-image?key=${encodeURIComponent(s3Key)}&fresh=1&t=${Date.now()}`);
      setLogoStatus({ type: 'success', msg: t('webUpload.logoUpdated') });
    } catch (e: any) {
      setLogoStatus({ type: 'error', msg: e?.message ?? t('webUpload.logoUploadError') });
    }
  }

  async function handleSignature(files: FileList) {
    if (!currentUser) return;
    const file = files[0];
    setSignStatus({ type: 'loading', msg: t('webUpload.uploadingSignature') });
    try {
      const s3Key = await uploadUserSignature(file, currentUser.id);
      // Invalidate local cache + browser cache
      setSignPreview(`/api/s3-image?key=${encodeURIComponent(s3Key)}&fresh=1&t=${Date.now()}`);
      setSignStatus({ type: 'success', msg: t('webUpload.signatureSaved') });
    } catch (e: any) {
      setSignStatus({ type: 'error', msg: e?.message ?? t('webUpload.signatureUploadError') });
    }
  }

  return (
    <div className="flex flex-col gap-5">
      {/* ── Card: Estampado de fotos (logo + comentario) ─────────────── */}
      <div className="bg-white rounded-xl shadow-subtle p-5 flex flex-col gap-4">
        <p className="text-sm font-bold text-navy">{t('webUpload.photoStampTitle')}</p>
        <p className="text-xs text-gray-400 -mt-2">
          {t('webUpload.photoStampDesc')}
        </p>

        {/* Logo del proyecto */}
        <div className="flex items-start gap-4">
          <div className="w-20 h-[60px] rounded-lg overflow-hidden bg-surface border border-border flex items-center justify-center flex-shrink-0">
            {logoPreview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoPreview} alt={t('webUpload.logoAlt')} className="max-w-full max-h-full object-contain"
                onError={() => setLogoPreview(null)} />
            ) : (
              <Image className="w-6 h-6 text-gray-300" />
            )}
          </div>
          <div className="flex flex-col gap-1.5 flex-1 min-w-0">
            <p className="text-xs font-bold text-gray-700">{t('webUpload.projectLogo')}</p>
            <p className="text-[11px] text-gray-400">{t('webUpload.projectLogoDesc')}</p>
            <UploadButton
              label={logoPreview ? t('webUpload.changeLogo') : t('webUpload.uploadLogo')}
              accept="image/jpeg,image/png,image/*"
              loading={logoStatus.type === 'loading'}
              onClick={handleLogo}
            />
            <StatusBadge s={logoStatus} />
          </div>
        </div>

        {/* Separador */}
        <div className="border-t border-border" />

        {/* Comentario en fotos */}
        <div className="flex flex-col gap-2">
          <p className="text-xs font-bold text-gray-700">{t('webUpload.photoComment')}</p>
          <p className="text-[11px] text-gray-400">{t('webUpload.photoCommentDesc')}</p>
          <div className="flex gap-2 items-center">
            <input
              type="text"
              value={stampComment}
              onChange={e => setStampComment(e.target.value)}
              placeholder={t('webUpload.photoCommentPlaceholder')}
              className="flex-1 border border-border rounded-lg px-3 py-2.5 text-sm text-navy focus:outline-none focus:border-primary transition"
            />
            <button
              onClick={handleSaveStamp}
              disabled={stampStatus.type === 'loading'}
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-lg bg-primary text-white text-sm font-bold hover:bg-primary/90 disabled:opacity-50 transition flex-shrink-0"
            >
              {stampStatus.type === 'loading' ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              {t('common.save')}
            </button>
          </div>
          <StatusBadge s={stampStatus} />
        </div>
      </div>

      {/* ── Card: Firma del Jefe de Calidad ──────────────────────────── */}
      <div className="bg-white rounded-xl shadow-subtle p-5 flex flex-col gap-4">
        <p className="text-sm font-bold text-navy">{t('webUpload.qualityManagerSignature')}</p>
        <p className="text-xs text-gray-400 -mt-2">
          {t('webUpload.qualityManagerSignatureDesc', { name: currentUser?.name ?? '' })}
        </p>

        <div className="flex items-start gap-4">
          <div className="w-40 h-20 rounded-lg overflow-hidden bg-surface border border-border flex items-center justify-center flex-shrink-0">
            {signPreview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={signPreview} alt={t('webUpload.signatureAlt')} className="max-w-full max-h-full object-contain"
                onError={() => setSignPreview(null)} />
            ) : (
              <Pen className="w-6 h-6 text-gray-300" />
            )}
          </div>
          <div className="flex flex-col gap-1.5 flex-1 min-w-0">
            <p className="text-xs font-bold text-gray-700">{t('webUpload.mySignature')}</p>
            <p className="text-[11px] text-gray-400">{t('webUpload.mySignatureDesc')}</p>
            <UploadButton
              label={signPreview ? t('webUpload.changeSignature') : t('webUpload.uploadSignature')}
              accept="image/jpeg,image/png,image/*"
              loading={signStatus.type === 'loading'}
              onClick={handleSignature}
            />
            <StatusBadge s={signStatus} />
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

const TABS: { id: Tab; labelKey: string; icon: React.ElementType }[] = [
  { id: 'actividades',   labelKey: 'webUpload.tabActividades',   icon: Table       },
  { id: 'ubicaciones',   labelKey: 'webUpload.tabUbicaciones',   icon: MapPin      },
  // v40 — Equipos separados por categoría: Lab. (calibrables, catálogo de
  // laboratorio) y Maquinaria (pesada, Trazabilidad). Cada sección importa y
  // lista SOLO su categoría.
  { id: 'equipos_lab',   labelKey: 'webUpload.tabLab',           icon: FlaskConical },
  { id: 'equipos',       labelKey: 'webUpload.tabMaquinaria',    icon: Truck       },
  { id: 'sectores',      labelKey: 'webUpload.tabSectores',      icon: Shapes      },
  { id: 'planos',        labelKey: 'webUpload.tabPlanosPdf',     icon: FileText    },
  { id: 'dwg',           labelKey: 'webUpload.tabPlanosDwg',     icon: FileArchive },
  { id: 'normas',        labelKey: 'webUpload.tabNormas',        icon: BookOpen    },
  { id: 'historicos',    labelKey: 'webUpload.tabHistoricos',    icon: History  },
  { id: 'configuracion', labelKey: 'webUpload.tabConfiguracion', icon: Settings    },
];

export default function FileUploadPage() {
  const { t } = useI18n();
  const { id: projectId } = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const { data: projects = [] } = useProjects();
  const project = projects.find(p => p.id === projectId);
  // v29 — Permite preseleccionar tab vía querystring (?tab=sectores). Útil para
  // enlaces desde el menú interno (ej. Geolocalización → tab Sectores).
  const requestedTab = searchParams?.get('tab') as Tab | null;
  const validTabIds = TABS.map(t => t.id);
  const initialTab: Tab = requestedTab && validTabIds.includes(requestedTab) ? requestedTab : 'actividades';
  const [activeTab, setActiveTab] = useState<Tab>(initialTab);
  const { data: flags } = useProjectFlags(projectId);

  // Filtra los tabs visibles. v29 — `plans`, `dwg`, `normas` ya NO se gatean
  // por flag (forman parte del funcionamiento estándar). v35 — `historicos`
  // pasa a ser SIEMPRE visible (contiene el export CSV, que es read-only);
  // el flag `historical_import` gatea solo las secciones de IMPORTACIÓN dentro.
  const visibleTabs = TABS.filter(tab => {
    if (!flags) return tab.id === 'actividades' || tab.id === 'ubicaciones' || tab.id === 'configuracion';
    return true;
  });

  // Si la tab actual ya no es visible (porque se desactivó), saltar a actividades.
  useEffect(() => {
    if (flags && !visibleTabs.some(t => t.id === activeTab)) setActiveTab('actividades');
  }, [flags, activeTab, visibleTabs]);

  return (
    <div className="flex flex-col min-h-screen bg-surface">
      <PageHeader
        title={t('webUpload.pageTitle')}
        subtitle={project?.name}
        crumbs={[
          { label: t('webUpload.crumbProjects'), href: '/app/projects' },
          { label: project?.name ?? '…' },
        ]}
      />

      {/* Tab bar */}
      <div className="bg-white border-b border-border sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 flex gap-0 overflow-x-auto items-center">
          {visibleTabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'flex items-center gap-1.5 px-3 py-2.5 text-xs font-semibold whitespace-nowrap border-b-2 transition-colors',
                activeTab === tab.id
                  ? 'border-primary text-primary'
                  : 'border-transparent text-gray-500 hover:text-gray-800'
              )}
            >
              <tab.icon size={13} />
              {t(tab.labelKey)}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      <div className="flex-1 max-w-2xl w-full mx-auto px-4 py-5">
        {activeTab === 'actividades'   && <ActividadesTab projectId={projectId} />}
        {activeTab === 'ubicaciones'   && <UbicacionesTab projectId={projectId} />}
        {activeTab === 'planos'        && <PlanosTab projectId={projectId} projectName={project?.name ?? ''} />}
        {activeTab === 'dwg'           && <DwgTab projectId={projectId} projectName={project?.name ?? ''} />}
        {activeTab === 'normas'        && <NormasTab projectId={projectId} projectName={project?.name ?? ''} />}
        {activeTab === 'historicos'    && <HistoricosTab projectId={projectId} importEnabled={!flags || !!flags.historical_import} />}
        {activeTab === 'equipos_lab'   && <EquiposTab projectId={projectId} projectName={project?.name ?? ''} category="laboratorio" title={t('webUpload.equipLabTitle')} />}
        {activeTab === 'equipos'       && <EquiposTab projectId={projectId} projectName={project?.name ?? ''} category="maquinaria_pesada" title={t('webUpload.equipMaqTitle')} />}
        {activeTab === 'sectores'      && <SectoresTab projectId={projectId} />}
        {activeTab === 'configuracion' && <ConfiguracionTab projectId={projectId} />}
      </div>

      {/* La configuración de módulos se movió a la tarjeta del proyecto (lista). */}
    </div>
  );
}

// ── Normas Tab ───────────────────────────────────────────────────────────────
function NormasTab({ projectId, projectName }: { projectId: string; projectName: string }) {
  const { t } = useI18n();
  const [templates, setTemplates] = useState<Array<{ id: string; id_protocolo: string; name: string | null }>>([]);
  useEffect(() => {
    (async () => {
      const supabase = (await import('@lib/supabase/client')).createClient();
      const { data } = await supabase
        .from('protocol_templates')
        .select('id, id_protocolo, name')
        .eq('project_id', projectId)
        .order('id_protocolo', { ascending: true });
      setTemplates((data ?? []) as any);
    })();
  }, [projectId]);

  if (templates.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center">
        <BookOpen size={48} className="text-muted opacity-30" />
        <p className="text-muted text-sm font-semibold">
          {t('webUpload.normsEmpty')}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="bg-amber-50 border-l-4 border-amber-300 rounded-md px-3 py-2 text-xs text-amber-900">
        {t('webUpload.normsHint1')} <code>id_protocolo</code>{t('webUpload.normsHint2')}
      </div>
      {templates.map(tpl => (
        <NormRow key={tpl.id} idProtocolo={tpl.id_protocolo} title={tpl.name ?? tpl.id_protocolo} projectName={projectName} />
      ))}
    </div>
  );
}

function NormRow({ idProtocolo, title, projectName }: { idProtocolo: string; title: string; projectName: string }) {
  const { t } = useI18n();
  const { data: url, refetch } = useTemplateNorm(projectName, idProtocolo);
  const upload = useUploadTemplateNorm();
  const remove = useDeleteTemplateNorm();
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    try {
      await upload.mutateAsync({ projectName, idProtocolo, file });
      refetch();
    } catch (err) {
      alert(t('webUpload.normUploadError') + String(err));
    }
  }

  async function handleDelete() {
    if (!confirm(t('webUpload.normDeleteConfirm'))) return;
    try {
      await remove.mutateAsync({ projectName, idProtocolo });
      refetch();
    } catch (err) {
      alert(t('webUpload.normDeleteError') + String(err));
    }
  }

  return (
    <div className="bg-white border border-border rounded-md px-3 py-2 flex items-center gap-2">
      <div className="flex-1 min-w-0">
        <p className="text-xs font-bold text-navy truncate">{idProtocolo}</p>
        <p className="text-[11px] text-muted truncate">{title}</p>
      </div>
      {url && (
        <a href={url} target="_blank" rel="noopener noreferrer"
          className="text-[11px] font-bold text-primary hover:underline">
          {t('webUpload.normView')}
        </a>
      )}
      <button onClick={() => fileRef.current?.click()} disabled={upload.isPending}
        className="text-[11px] font-bold text-primary border border-primary/30 rounded px-2 py-1 hover:bg-primary/5 disabled:opacity-50">
        {upload.isPending ? <Loader2 size={11} className="animate-spin" /> : (url ? t('webUpload.normReplace') : t('webUpload.normUpload'))}
      </button>
      {url && (
        <button onClick={handleDelete} className="text-danger hover:bg-danger/10 rounded p-1">
          <Trash2 size={12} />
        </button>
      )}
      <input ref={fileRef} type="file" accept="application/pdf" className="hidden" onChange={handleSelect} />
    </div>
  );
}

// ── v40 — Tab Equipos por CATEGORÍA ────────────────────────────────────────
// Una instancia por sección: Lab. (laboratorio, calibrables) y Maquinaria
// (maquinaria_pesada, Trazabilidad). Cada una lista e importa SOLO su categoría;
// la importación FUERZA la categoría de la sección (el parser queda como fallback).
function EquiposTab({ projectId, projectName: projName, category, title }: { projectId: string; projectName: string; category: 'laboratorio' | 'maquinaria_pesada'; title: string }) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const isMaq = category === 'maquinaria_pesada';
  const [busy, setBusy] = useState(false);
  const [parsed, setParsed] = useState<TraceabilityImportResult | null>(null);
  const [summary, setSummary] = useState<TraceabilityImportSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const fileRef = useRef<HTMLInputElement>(null);

  const { data: equipos = [] } = useEquipment(projectId);
  const { data: actsByEquip = {} } = useEquipmentActivities(projectId);
  const { data: auxList = [] } = useLabAuxTablesList(isMaq ? '' : projectId); // tablas (solo Lab.)

  // Solo los equipos de ESTA categoría (los previos a v40 sin categoría → laboratorio).
  const filtered = equipos.filter(e => ((e as any).category ?? 'laboratorio') === category);

  const toggleExpand = (id: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handlePick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null); setSummary(null); setParsed(null); setBusy(true);
    try {
      const result = await parseTraceabilityExcel(file);
      // Auto-import: se importa de frente al subir (sin paso de confirmación).
      const s = await importTraceabilityToSupabase(projectId, result, category);
      setSummary(s);
      qc.invalidateQueries({ queryKey: ['equipment', projectId] });
      qc.invalidateQueries({ queryKey: ['equipment-activities-map', projectId] });
      qc.invalidateQueries({ queryKey: ['lab-aux-tables-list', projectId] });
      qc.invalidateQueries({ queryKey: ['lab-aux-tables', projectId] });
    } catch (err) {
      setError(err instanceof ExcelParseError ? err.message : (err as Error).message);
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const handleConfirm = async () => {
    if (!parsed) return;
    setBusy(true); setError(null);
    try {
      const s = await importTraceabilityToSupabase(projectId, parsed, category);
      setSummary(s);
      setParsed(null);
      // Refrescar la lista de equipos y vínculos tras importar
      qc.invalidateQueries({ queryKey: ['equipment', projectId] });
      qc.invalidateQueries({ queryKey: ['equipment-activities-map', projectId] });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const detectedKind = parsed
    ? (parsed.actividades.length + parsed.turnos.length + parsed.plantillas.length + parsed.equipoActividad.length > 0
        ? 'bundle' : 'simple')
    : null;

  return (
    <div className="flex flex-col gap-4">
      <div className="bg-white rounded-md border border-border p-4 flex flex-col gap-3">
        <h3 className="text-sm font-bold tracking-wide uppercase text-textPrimary">{title}</h3>
        <p className="text-xs text-muted leading-relaxed">
          {isMaq ? (
            <>
              {t('webUpload.equipUploadFilePre')} <strong>CSV</strong> {t('webUpload.orConnector')} <strong>Excel</strong> {t('webUpload.equipMaqDesc1')}
              <br />• {t('webUpload.equipMaqDescBullet1')}
              <br />• {t('webUpload.equipMaqDescBullet2Pre')}<strong>{t('webUpload.sheetEquipos')}</strong>, <strong>{t('webUpload.sheetActividades')}</strong>, <strong>{t('webUpload.sheetEquipoActividad')}</strong>, <strong>{t('webUpload.sheetTurnos')}</strong>, <strong>{t('webUpload.sheetPlantillas')}</strong>{t('webUpload.equipMaqDescBullet2Post')}
              <br />{t('webUpload.equipMaqDescMark')} <strong>{t('webUpload.equipMaqDescMarkBold')}</strong>.
            </>
          ) : (
            <>
              {t('webUpload.equipUploadFilePre')} <strong>CSV</strong> {t('webUpload.orConnector')} <strong>Excel</strong> {t('webUpload.equipLabDesc1Pre')}
              <br />{t('webUpload.equipLabDescMark')} <strong>{t('webUpload.equipLabDescMarkBold')}</strong> {t('webUpload.equipLabDescCalibrables')}
            </>
          )}
        </p>
        <div className="flex gap-2">
          <button
            onClick={() => fileRef.current?.click()}
            disabled={busy}
            className="flex items-center gap-2 px-3 py-2 text-xs font-bold rounded bg-primary text-white hover:bg-primary/90 disabled:opacity-50"
          >
            {busy ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
            {t('webUpload.uploadExcelCsv')}
          </button>
          <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handlePick} />
          {!isMaq && (filtered.length > 0 || auxList.length > 0) && (
            <button
              onClick={() => generateCalibrationReportPdf({
                projectName: projName,
                equipos: filtered.map(e => {
                  const x = e as any;
                  return { code: x.code, name: x.name, type: x.type, brand: x.brand, model: x.model, serial: x.serial, last_calibration_at: x.last_calibration_at ?? x.lastCalibrationAt ?? null, next_calibration_at: x.next_calibration_at ?? x.nextCalibrationAt ?? null };
                }),
                tablas: auxList.map(t => ({ group_key: t.group_key, name: t.name, columns_count: (t.columns_json ?? []).length, rows_count: (t.rows_json ?? []).length, last_calibration_at: t.last_calibration_at, next_calibration_at: t.next_calibration_at })),
              })}
              className="flex items-center gap-2 px-3 py-2 text-xs font-bold rounded border border-primary text-primary hover:bg-primary/5"
            >
              <Download size={14} /> {t('webUpload.calibrationReport')}
            </button>
          )}
        </div>
        {error && (
          <div className="flex items-start gap-2 p-2 bg-danger/10 border border-danger/30 rounded text-xs text-danger">
            <AlertCircle size={14} className="shrink-0 mt-0.5" />
            <p>{error}</p>
          </div>
        )}
      </div>

      {parsed && (
        <div className="bg-white rounded-md border border-border p-4 flex flex-col gap-2">
          <h4 className="text-xs font-bold uppercase tracking-wide text-textPrimary">
            {detectedKind === 'bundle'
              ? t('webUpload.detectedBundle')
              : t('webUpload.detectedSimple')}
          </h4>
          <ul className="text-xs text-textSecondary space-y-1">
            <li>• {t('webUpload.detEquipos')} <strong>{parsed.equipos.length}</strong></li>
            {detectedKind === 'bundle' && (
              <>
                <li>• {t('webUpload.detActividades')} <strong>{parsed.actividades.length}</strong></li>
                <li>• {t('webUpload.detVinculos')} <strong>{parsed.equipoActividad.length}</strong></li>
                <li>• {t('webUpload.detTurnos')} <strong>{parsed.turnos.length}</strong></li>
                <li>• {t('webUpload.detTemplateItems')} <strong>{parsed.plantillas.length}</strong> {t('webUpload.detTemplateItemsFrom', { count: new Set(parsed.plantillas.map(p => p.templateName)).size })}</li>
              </>
            )}
          </ul>
          {parsed.warnings.length > 0 && (
            <div className="mt-2 p-2 bg-warning/10 border border-warning/30 rounded text-[11px] text-warning space-y-0.5">
              {parsed.warnings.slice(0, 8).map((w, i) => <p key={i}>⚠ {w}</p>)}
              {parsed.warnings.length > 8 && <p>{t('webUpload.warningsMore', { count: parsed.warnings.length - 8 })}</p>}
            </div>
          )}
          <div className="flex gap-2 mt-3">
            <button onClick={() => setParsed(null)} disabled={busy}
              className="px-3 py-1.5 text-xs font-bold rounded border border-border text-textSecondary hover:bg-surface">
              {t('common.cancel')}
            </button>
            <button onClick={handleConfirm} disabled={busy}
              className="px-3 py-1.5 text-xs font-bold rounded bg-primary text-white hover:bg-primary/90 disabled:opacity-50 flex items-center gap-2">
              {busy && <Loader2 size={12} className="animate-spin" />}
              {t('webUpload.confirmImport')}
            </button>
          </div>
        </div>
      )}

      {summary && (
        <div className="bg-white rounded-md border border-success/30 bg-success/5 p-4 flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <CheckCircle size={16} className="text-success" />
            <h4 className="text-sm font-bold text-success">{t('webUpload.importCompleted')}</h4>
          </div>
          <ul className="text-xs text-textSecondary space-y-1">
            <li>{t('webUpload.sumEquipos', { added: summary.equipment.added, modified: summary.equipment.modified, skipped: summary.equipment.skipped })}</li>
            {(summary.activities.added > 0 || summary.activities.modified > 0) && (
              <li>{t('webUpload.sumActividades', { added: summary.activities.added, modified: summary.activities.modified })}</li>
            )}
            {(summary.links.added > 0 || summary.links.modified > 0 || summary.links.skipped > 0) && (
              <li>{t('webUpload.sumVinculos', { added: summary.links.added, modified: summary.links.modified, skipped: summary.links.skipped })}</li>
            )}
            {(summary.shifts.added > 0 || summary.shifts.modified > 0) && (
              <li>{t('webUpload.sumTurnos', { added: summary.shifts.added, modified: summary.shifts.modified })}</li>
            )}
            {(summary.templates.added > 0 || summary.templates.modified > 0) && (
              <li>{t('webUpload.sumPlantillas', { added: summary.templates.added, modified: summary.templates.modified, items: summary.templateItems.added })}</li>
            )}
          </ul>
          {summary.warnings.length > 0 && (
            <div className="mt-2 p-2 bg-warning/10 border border-warning/30 rounded text-[11px] text-warning space-y-0.5">
              {summary.warnings.slice(0, 8).map((w, i) => <p key={i}>⚠ {w}</p>)}
              {summary.warnings.length > 8 && <p>{t('webUpload.warningsMore', { count: summary.warnings.length - 8 })}</p>}
            </div>
          )}
        </div>
      )}

      {/* Lista de equipos de esta categoría (click para ver actividades) */}
      {filtered.length === 0 && (isMaq || auxList.length === 0) && (
        <p className="text-xs text-muted italic text-center py-2">
          {isMaq ? t('webUpload.noMachineryLoaded') : t('webUpload.noLabLoaded')}
        </p>
      )}

      {/* v41 — Tablas auxiliares (grupos: taras, moldes…) solo en la sección Lab. */}
      {!isMaq && <LabAuxTablesSection projectId={projectId} />}

      {filtered.map(eq => {
        const e = eq as any;
        const acts: EquipmentActivityInfo[] = actsByEquip[eq.id] ?? [];
        const isOpen = expanded.has(eq.id);
        return (
          <div key={eq.id} className="bg-white border border-border rounded-md overflow-hidden">
            <button
              onClick={() => toggleExpand(eq.id)}
              className="w-full flex items-center gap-3 p-3 hover:bg-surface text-left"
            >
              <div className={`w-10 h-10 rounded shrink-0 flex items-center justify-center border ${isMaq ? 'bg-warning/10 border-warning/40 text-warning' : 'bg-primary/10 border-primary/40 text-primary'}`}>
                {isMaq ? <Wrench size={18} /> : <FlaskConical size={18} />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-bold text-muted tracking-wide">{e.code}</span>
                  <span className={`text-[9px] font-extrabold tracking-wider ${isMaq ? 'text-warning' : 'text-primary'}`}>
                    {isMaq ? t('webUpload.labelMaquinaria') : t('webUpload.labelLaboratorio')}
                  </span>
                </div>
                <p className="text-sm font-bold text-textPrimary truncate">{e.name}</p>
                <p className="text-[11px] text-textSecondary truncate">
                  {(e.type as string).replace(/_/g, ' ')}
                  {e.brand ? ` · ${e.brand}` : ''}{e.model ? ` ${e.model}` : ''}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {acts.length > 0 && (
                  <span className="bg-primary/15 text-primary text-[11px] font-extrabold rounded-full px-2 py-0.5 min-w-[22px] text-center">
                    {acts.length}
                  </span>
                )}
                {isOpen ? <ChevronUp size={16} className="text-textMuted" /> : <ChevronDown size={16} className="text-textMuted" />}
              </div>
            </button>
            {isOpen && (
              <div className="border-t border-divider bg-surface px-3 py-2">
                {acts.length === 0 ? (
                  <p className="text-[11px] text-muted italic py-1 text-center">
                    {t('webUpload.noActivitiesLinked')}
                  </p>
                ) : (
                  <ul className="flex flex-col gap-1">
                    {acts.map((a, i) => (
                      <li key={i} className="flex items-center gap-2 py-1.5 px-1">
                        <ActKindIcon kind={a.kind} />
                        <span className="text-sm font-semibold text-textPrimary flex-1 truncate">{a.name}</span>
                        {a.templateName && (
                          <span className="text-[10px] text-primary font-bold bg-primary/10 px-2 py-0.5 rounded">
                            FORM
                          </span>
                        )}
                        <span className={`text-[10px] font-extrabold uppercase tracking-wider ${kindColorClass(a.kind)}`}>
                          {t(kindLabelKey(a.kind))}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── v41 — Tablas auxiliares de laboratorio (grupos) + Calibrar ──────────────
function LabAuxTablesSection({ projectId }: { projectId: string }) {
  const { t } = useI18n();
  const { data: tables = [] } = useLabAuxTablesList(projectId);
  const calibrate = useCalibrateLabAuxTable(projectId);
  const [editing, setEditing] = useState<LabAuxTable | null>(null);
  const [rows, setRows] = useState<string[][]>([]);
  const [nextDate, setNextDate] = useState('');
  const [newRows, setNewRows] = useState<Set<number>>(new Set()); // filas nuevas → llave editable

  const fmtDate = (ms: number | null) => (ms ? new Date(ms).toLocaleDateString('es-PE') : '—');
  // v41 (#5a) — indicador de días para la próxima calibración.
  function calibBadge(ms: number | null): { text: string; cls: string } | null {
    if (!ms) return null;
    const days = Math.ceil((ms - Date.now()) / 86400000);
    if (days < 0)  return { text: t(-days === 1 ? 'webUpload.calibOverdue' : 'webUpload.calibOverduePlural', { days: -days }), cls: 'bg-red-100 text-red-700' };
    if (days === 0) return { text: t('webUpload.calibDueToday'), cls: 'bg-amber-100 text-amber-700' };
    if (days <= 30) return { text: t(days === 1 ? 'webUpload.calibRemaining' : 'webUpload.calibRemainingPlural', { days }), cls: 'bg-amber-100 text-amber-700' };
    return { text: t('webUpload.calibRemainingPlural', { days }), cls: 'bg-green-100 text-green-700' };
  }

  function openCalibrate(t: LabAuxTable) {
    setEditing(t);
    setRows((t.rows_json ?? []).map(r => [...r]));
    setNextDate(t.next_calibration_at ? new Date(t.next_calibration_at).toISOString().slice(0, 10) : '');
    setNewRows(new Set());
  }
  function setCell(ri: number, ci: number, v: string) {
    setRows(prev => prev.map((r, i) => (i === ri ? r.map((c, j) => (j === ci ? v : c)) : r)));
  }
  // v41 (#4) — Adicionar medida: nueva fila con LLAVE única auto-generada (editable).
  function addMeasure() {
    if (!editing) return;
    const ncols = (editing.columns_json ?? []).length || 1;
    const keys = new Set(rows.map(r => (r[0] ?? '').trim()));
    const nums = rows.map(r => Number(String(r[0]).replace(',', '.')));
    let key: string;
    if (rows.length > 0 && nums.every(n => Number.isFinite(n))) {
      key = String(Math.max(...nums) + 1);
    } else {
      let i = 1; while (keys.has(`NUEVO-${i}`)) i++; key = `NUEVO-${i}`;
    }
    const newRow = Array.from({ length: ncols }, (_, ci) => (ci === 0 ? key : ''));
    setRows(prev => { setNewRows(s => new Set(s).add(prev.length)); return [...prev, newRow]; });
  }
  async function save() {
    if (!editing) return;
    // Validar llaves únicas (evita errores graves por duplicados).
    const keys = rows.map(r => (r[0] ?? '').trim());
    if (keys.some((k, i) => k !== '' && keys.indexOf(k) !== i)) {
      alert(t('webUpload.duplicateKeysAlert'));
      return;
    }
    const next = nextDate ? new Date(nextDate + 'T00:00:00').getTime() : null;
    await calibrate.mutateAsync({ id: editing.id, rows: rows.filter(r => (r[0] ?? '').trim() !== ''), lastCalibrationAt: Date.now(), nextCalibrationAt: next });
    setEditing(null);
  }

  if (tables.length === 0) {
    return (
      <div className="bg-white rounded-md border border-border p-3 text-[11px] text-muted italic text-center">
        {t('webUpload.noAuxTables')} <strong>{t('webUpload.noAuxTablesSheet')}</strong> {t('webUpload.noAuxTablesSuffix')}
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      <h4 className="text-xs font-bold uppercase tracking-wide text-textSecondary mt-1">{t('webUpload.auxTablesTitle')}</h4>
      {tables.map(tbl => (
        <div key={tbl.id} className="bg-white border border-border rounded-md p-3 flex items-center gap-3">
          <div className="w-9 h-9 rounded shrink-0 flex items-center justify-center border bg-primary/10 border-primary/40 text-primary">
            <Table size={16} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-textPrimary truncate">{tbl.name || tbl.group_key}</p>
            <p className="text-[11px] text-textSecondary truncate">
              {(tbl.columns_json ?? []).join(' · ')} — {t('webUpload.auxRows', { count: (tbl.rows_json ?? []).length })}
            </p>
            <p className="text-[10px] text-textMuted flex items-center gap-1.5">
              {t('webUpload.nextCalibration')} {fmtDate(tbl.next_calibration_at)}
              {calibBadge(tbl.next_calibration_at) && (
                <span className={cn('text-[9px] font-bold rounded px-1.5 py-0.5', calibBadge(tbl.next_calibration_at)!.cls)}>
                  {calibBadge(tbl.next_calibration_at)!.text}
                </span>
              )}
            </p>
          </div>
          <button onClick={() => openCalibrate(tbl)}
            className="px-3 py-1.5 text-xs font-bold rounded border border-primary text-primary hover:bg-primary/5 shrink-0">
            {t('webUpload.calibrate')}
          </button>
        </div>
      ))}

      {editing && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => setEditing(null)}>
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="px-4 py-3 bg-navy text-white flex items-center justify-between rounded-t-lg">
              <h3 className="text-sm font-extrabold">{t('webUpload.calibrateModalTitle', { name: editing.name || editing.group_key })}</h3>
              <button onClick={() => setEditing(null)} className="text-white/80 hover:text-white text-lg leading-none px-1">✕</button>
            </div>
            <div className="p-4 overflow-auto">
              <table className="text-xs border-collapse w-full">
                <thead>
                  <tr>{(editing.columns_json ?? []).map((c, i) => (
                    <th key={i} className="border border-border bg-surface px-2 py-1 text-left font-bold">{c}{i === 0 ? t('webUpload.columnKey') : ''}</th>
                  ))}</tr>
                </thead>
                <tbody>
                  {rows.map((r, ri) => {
                    const keyEditable = newRows.has(ri); // las filas NUEVAS sí permiten editar la llave
                    return (
                    <tr key={ri}>
                      {(editing.columns_json ?? []).map((_, ci) => (
                        <td key={ci} className="border border-border p-0">
                          <input value={r[ci] ?? ''} disabled={ci === 0 && !keyEditable}
                            onChange={e => setCell(ri, ci, e.target.value)}
                            className={cn('w-full px-2 py-1 text-xs text-center focus:outline-none focus:bg-primary/5', ci === 0 && !keyEditable && 'bg-surface text-textMuted')} />
                        </td>
                      ))}
                    </tr>
                  );})}
                </tbody>
              </table>
              <button onClick={addMeasure}
                className="mt-2 flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded border-[1.5px] border-primary text-primary hover:bg-primary/5">
                <Plus size={13} /> {t('webUpload.addMeasure')}
              </button>
              <p className="text-[10px] text-textMuted mt-2">{t('webUpload.keyHint')}</p>
              <div className="mt-3">
                <label className="text-xs font-bold text-textSecondary">{t('webUpload.nextCalibrationLabel')}</label>
                <input type="date" value={nextDate} onChange={e => setNextDate(e.target.value)}
                  className="mt-1 block text-xs border border-border rounded px-2 py-1.5 focus:outline-none focus:border-primary" />
              </div>
            </div>
            <div className="px-4 py-3 border-t border-border flex justify-end gap-2">
              <button onClick={() => setEditing(null)} className="px-3 py-1.5 text-xs font-bold rounded border border-border text-textSecondary hover:bg-surface">{t('common.cancel')}</button>
              <button onClick={save} disabled={calibrate.isPending}
                className="px-3 py-1.5 text-xs font-bold rounded bg-primary text-white hover:bg-primary/90 disabled:opacity-50 flex items-center gap-2">
                {calibrate.isPending && <Loader2 size={12} className="animate-spin" />} {t('webUpload.saveCalibration')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ActKindIcon({ kind }: { kind: string }) {
  const cls = kindColorClass(kind);
  if (kind === 'productive')  return <Zap size={14} className={cls} />;
  if (kind === 'maintenance') return <Wrench size={14} className={cls} />;
  if (kind === 'transport')   return <Truck size={14} className={cls} />;
  return <MoreHorizontal size={14} className={cls} />;
}
function kindLabelKey(kind: string): string {
  switch (kind) {
    case 'productive':   return 'webUpload.kindProductive';
    case 'maintenance':  return 'webUpload.kindMaintenance';
    case 'transport':    return 'webUpload.kindTransport';
    default:             return 'webUpload.kindOther';
  }
}
function kindColorClass(kind: string): string {
  switch (kind) {
    case 'productive':   return 'text-success';
    case 'maintenance':  return 'text-warning';
    case 'transport':    return 'text-primary';
    default:             return 'text-textMuted';
  }
}
