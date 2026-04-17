'use client';

import { useRef, useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import {
  Upload, Loader2, CheckCircle, AlertCircle, FileText, MapPin,
  Image, Pen, RefreshCw, FileArchive, Settings, Table, Trash2,
  ChevronDown, ChevronUp, Download,
} from 'lucide-react';
import PageHeader from '@components/PageHeader';
import { useProjects } from '@hooks/useProjects';
import {
  useTemplates, useLocationsList, useLocalPlans,
  importActivitiesToSupabase, importLocationsToSupabase,
  uploadProjectLogo, uploadUserSignature,
} from '@hooks/useFileUpload';
import type { LocalPlanFile } from '@hooks/useFileUpload';
import { parseActivitiesExcel, parseLocationsExcel, ExcelParseError } from '@lib/excelParser';

import { useAuth } from '@lib/auth-context';
import { cn } from '@lib/utils';


type Tab = 'actividades' | 'ubicaciones' | 'planos' | 'configuracion' | 'dwg';

// ── Status badge ──────────────────────────────────────────────────────────────

type ImportStatus =
  | { type: 'idle' }
  | { type: 'loading'; msg?: string }
  | { type: 'success'; msg: string }
  | { type: 'error'; msg: string };

function StatusBadge({ s }: { s: ImportStatus }) {
  if (s.type === 'idle') return null;
  if (s.type === 'loading')  return (
    <div className="flex items-center gap-2 text-xs text-primary font-medium py-1">
      <Loader2 className="w-3.5 h-3.5 animate-spin" />
      {s.msg ?? 'Procesando...'}
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
  const qc = useQueryClient();
  const { data: templates = [], isLoading } = useTemplates(projectId);
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
    setStatus({ type: 'loading', msg: 'Leyendo archivo...' });
    try {
      const result = await parseActivitiesExcel(file);
      setStatus({ type: 'loading', msg: `Importando ${result.protocols.length} protocolos...` });
      const summary = await importActivitiesToSupabase(
        projectId, result.protocols,
        (cur, tot) => setStatus({ type: 'loading', msg: `Importando ${cur}/${tot}...` }),
      );
      qc.invalidateQueries({ queryKey: ['templates', projectId] });
      const parts: string[] = [];
      if (summary.added > 0)    parts.push(`${summary.added} nuevo${summary.added !== 1 ? 's' : ''}`);
      if (summary.modified > 0) parts.push(`${summary.modified} modificado${summary.modified !== 1 ? 's' : ''}`);
      setStatus({ type: 'success', msg: parts.length ? `${parts.join(' · ')} protocolo${(summary.added + summary.modified) !== 1 ? 's' : ''}` : 'Sin cambios' });
    } catch (e) {
      const msg = e instanceof ExcelParseError ? e.message : (e instanceof Error ? e.message : (typeof e === 'string' ? e : JSON.stringify(e)));
      setStatus({ type: 'error', msg });
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="bg-white rounded-xl shadow-subtle p-4 flex flex-col gap-3">
        <p className="text-xs text-gray-500 leading-relaxed">
          Importa el Excel maestro de actividades. Las columnas requeridas son:
          <span className="font-mono text-[11px] text-primary"> ID_Protocolo, Protocolo, PartidaItem, Actividad realizada, Método de validación</span>.
          Los protocolos existentes se actualizan; los nuevos se crean.
        </p>
        <div className="flex items-center gap-2">
          <div className="flex-1">
            <UploadButton
              label="Importar Excel de Actividades"
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
              title="Eliminar protocolos">
              <Trash2 className="w-4 h-4" />
            </button>
          ) : (
            <>
              <button onClick={() => { setDeleteMode(false); setSelected(new Set()); }}
                className="px-3 py-2.5 rounded-lg text-xs font-bold text-gray-600 border border-border hover:bg-gray-50 transition shrink-0">
                Cancelar
              </button>
              <button onClick={handleDeleteTemplates}
                disabled={selected.size === 0 || deleting}
                className="px-3 py-2.5 rounded-lg bg-danger text-white text-xs font-bold
                           disabled:opacity-40 hover:bg-red-700 transition flex items-center gap-1 shrink-0">
                {deleting && <Loader2 className="w-3 h-3 animate-spin" />}
                {deleting ? 'Eliminando...' : `Eliminar (${selected.size})`}
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
            <p className="text-xs font-bold text-gray-700">Protocolos cargados ({templates.length})</p>
          </div>
          <div className="divide-y divide-divider max-h-[50vh] overflow-y-auto">
            {templates.map(t => (
              <div key={t.id}
                onClick={deleteMode ? () => toggleSelect(t.id) : undefined}
                className={cn('px-4 py-3 flex items-center gap-3 transition',
                  deleteMode && 'cursor-pointer hover:bg-red-50/50',
                  deleteMode && selected.has(t.id) && 'bg-red-50/50 ring-1 ring-danger/30',
                )}>
                {deleteMode && (
                  <input type="checkbox" checked={selected.has(t.id)} onChange={() => toggleSelect(t.id)}
                    className="w-4 h-4 rounded border-gray-300 text-danger focus:ring-danger/30 shrink-0" />
                )}
                <span className="text-[11px] font-bold text-primary bg-light px-2 py-0.5 rounded shrink-0">
                  {t.id_protocolo}
                </span>
                <p className="flex-1 text-xs text-gray-700 leading-snug min-w-0 truncate">{t.name}</p>
                <p className="text-[10px] text-gray-400 shrink-0">
                  {new Date(t.created_at).toLocaleDateString('es-PE')}
                </p>
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
    setStatus({ type: 'loading', msg: 'Leyendo archivo...' });
    try {
      const result = await parseLocationsExcel(file);
      setStatus({ type: 'loading', msg: `Importando ${result.locations.length} ubicaciones...` });
      const summary = await importLocationsToSupabase(projectId, result.locations);
      qc.invalidateQueries({ queryKey: ['locations-list', projectId] });
      qc.invalidateQueries({ queryKey: ['locations', projectId] });
      const parts: string[] = [];
      if (summary.added > 0)    parts.push(`${summary.added} nueva${summary.added !== 1 ? 's' : ''}`);
      if (summary.modified > 0) parts.push(`${summary.modified} modificada${summary.modified !== 1 ? 's' : ''}`);
      setStatus({ type: 'success', msg: parts.length ? `${parts.join(' · ')} ubicación${(summary.added + summary.modified) !== 1 ? 'es' : ''}` : 'Sin cambios' });
    } catch (e) {
      const msg = e instanceof ExcelParseError ? e.message : (e instanceof Error ? e.message : (typeof e === 'string' ? e : JSON.stringify(e)));
      setStatus({ type: 'error', msg });
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="bg-white rounded-xl shadow-subtle p-4 flex flex-col gap-3">
        <p className="text-xs text-gray-500 leading-relaxed">
          Importa el Excel de ubicaciones. Las columnas requeridas son:
          <span className="font-mono text-[11px] text-primary"> Ubicación, PLANO DE REFERENCIA, ID_Protocolos</span>.
          Opcionales: <span className="font-mono text-[11px] text-primary">Ubicación_Sola, Especialidad_Sola</span>.
        </p>
        <div className="flex items-center gap-2">
          <div className="flex-1">
            <UploadButton
              label="Importar Excel de Ubicaciones"
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
              title="Eliminar ubicaciones">
              <Trash2 className="w-4 h-4" />
            </button>
          ) : (
            <>
              <button onClick={() => { setDeleteMode(false); setSelected(new Set()); }}
                className="px-3 py-2.5 rounded-lg text-xs font-bold text-gray-600 border border-border hover:bg-gray-50 transition shrink-0">
                Cancelar
              </button>
              <button onClick={handleDeleteLocations}
                disabled={selected.size === 0 || deleting}
                className="px-3 py-2.5 rounded-lg bg-danger text-white text-xs font-bold
                           disabled:opacity-40 hover:bg-red-700 transition flex items-center gap-1 shrink-0">
                {deleting && <Loader2 className="w-3 h-3 animate-spin" />}
                {deleting ? 'Eliminando...' : `Eliminar (${selected.size})`}
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
            <p className="text-xs font-bold text-gray-700">Ubicaciones cargadas ({locations.length})</p>
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
            {locCount > 0 ? `${locCount} ${locCount !== 1 ? 'ubicaciones' : 'ubicación'}` : 'Sin ubicación vinculada'}
          </p>
        </div>
        {!selectMode && (
          <>
            <button
              onClick={onRelink}
              disabled={relinking}
              className="text-gray-400 hover:text-primary transition-colors disabled:opacity-40 p-1"
              title="Re-vincular a ubicaciones"
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
              <span className="text-xs text-gray-400">Sin ubicaciones vinculadas</span>
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
  const uploadLabel  = isPdf ? 'Subir PDF'      : 'Subir DWG';
  const reloadLabel  = isPdf ? 'Recargar PDF'   : 'Recargar DWG';
  const deleteLabel  = isPdf ? 'Eliminar PDF'   : 'Eliminar DWG';
  const emptyLabel   = isPdf ? 'Sin planos PDF' : 'Sin planos DWG';

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
    setUploadStatus({ type: 'loading', msg: `Subiendo ${arr.length} archivo${arr.length !== 1 ? 's' : ''}...` });
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
      setUploadStatus({
        type: 'success',
        msg: `${arr.length} plano${arr.length !== 1 ? 's' : ''} subido${arr.length !== 1 ? 's' : ''} · ${linked} vínculo${linked !== 1 ? 's' : ''} creado${linked !== 1 ? 's' : ''}`,
      });
    } catch (e) {
      setUploadStatus({ type: 'error', msg: `Error: ${String(e)}` });
    }
  }

  // ── Sync: Local ↔ S3 (by name only) ────────────────────────────────────────
  async function handleSync() {
    setSyncStatus({ type: 'loading', msg: 'Sincronizando...' });
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
      if (stats.downloaded > 0) parts.push(`↓ ${stats.downloaded} descargado${stats.downloaded !== 1 ? 's' : ''}`);
      if (stats.uploaded > 0)   parts.push(`↑ ${stats.uploaded} subido${stats.uploaded !== 1 ? 's' : ''}`);
      if (stats.updated > 0)    parts.push(`↻ ${stats.updated} actualizado${stats.updated !== 1 ? 's' : ''}`);
      setSyncStatus({
        type: 'success',
        msg: parts.length
          ? parts.join(' · ')
          : `Sincronizado · ${summary.local} local · ${summary.cloud} nube`,
      });
    } catch (e) {
      setSyncStatus({ type: 'error', msg: `Error: ${String(e)}` });
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
              Cancelar
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
              Confirmar ({selected.size})
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
    setStampStatus({ type: 'loading', msg: 'Guardando...' });
    try {
      const { error } = await supabase
        .from('projects')
        .update({ stamp_comment: combined || null, updated_at: Date.now() })
        .eq('id', projectId);
      if (error) throw new Error(error.message);
      qc.invalidateQueries({ queryKey: ['projects'] });
      setStampStatus({ type: 'success', msg: 'Texto guardado. Visible para todos los usuarios.' });
    } catch (e: any) {
      setStampStatus({ type: 'error', msg: e?.message ?? 'Error al guardar' });
    }
  }

  async function handleLogo(files: FileList) {
    const file = files[0];
    setLogoStatus({ type: 'loading', msg: 'Subiendo logo...' });
    try {
      const s3Key = await uploadProjectLogo(file, projectId);
      qc.invalidateQueries({ queryKey: ['projects'] });
      // Invalidate local cache + browser cache with fresh param
      setLogoPreview(`/api/s3-image?key=${encodeURIComponent(s3Key)}&fresh=1&t=${Date.now()}`);
      setLogoStatus({ type: 'success', msg: 'Logo actualizado. Visible para todos los usuarios.' });
    } catch (e: any) {
      setLogoStatus({ type: 'error', msg: e?.message ?? 'Error al subir logo' });
    }
  }

  async function handleSignature(files: FileList) {
    if (!currentUser) return;
    const file = files[0];
    setSignStatus({ type: 'loading', msg: 'Subiendo firma...' });
    try {
      const s3Key = await uploadUserSignature(file, currentUser.id);
      // Invalidate local cache + browser cache
      setSignPreview(`/api/s3-image?key=${encodeURIComponent(s3Key)}&fresh=1&t=${Date.now()}`);
      setSignStatus({ type: 'success', msg: 'Firma guardada. Se incluirá en los reportes PDF.' });
    } catch (e: any) {
      setSignStatus({ type: 'error', msg: e?.message ?? 'Error al subir firma' });
    }
  }

  return (
    <div className="flex flex-col gap-5">
      {/* ── Card: Estampado de fotos (logo + comentario) ─────────────── */}
      <div className="bg-white rounded-xl shadow-subtle p-5 flex flex-col gap-4">
        <p className="text-sm font-bold text-navy">Estampado de fotos</p>
        <p className="text-xs text-gray-400 -mt-2">
          El logo y el texto se aplican a todas las fotos del proyecto.
          Compartido para todos los usuarios.
        </p>

        {/* Logo del proyecto */}
        <div className="flex items-start gap-4">
          <div className="w-20 h-[60px] rounded-lg overflow-hidden bg-surface border border-border flex items-center justify-center flex-shrink-0">
            {logoPreview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoPreview} alt="Logo" className="max-w-full max-h-full object-contain"
                onError={() => setLogoPreview(null)} />
            ) : (
              <Image className="w-6 h-6 text-gray-300" />
            )}
          </div>
          <div className="flex flex-col gap-1.5 flex-1 min-w-0">
            <p className="text-xs font-bold text-gray-700">Logo del proyecto</p>
            <p className="text-[11px] text-gray-400">Aparece en la esquina inferior derecha de cada foto y en los reportes PDF.</p>
            <UploadButton
              label={logoPreview ? 'Cambiar logo' : 'Subir logo'}
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
          <p className="text-xs font-bold text-gray-700">Comentario en fotos</p>
          <p className="text-[11px] text-gray-400">Texto que aparece debajo de la fecha en el sello de cada foto.</p>
          <div className="flex gap-2 items-center">
            <input
              type="text"
              value={stampComment}
              onChange={e => setStampComment(e.target.value)}
              placeholder="Ej: Proyecto Edificio Norte — Fase 2"
              className="flex-1 border border-border rounded-lg px-3 py-2.5 text-sm text-navy focus:outline-none focus:border-primary transition"
            />
            <button
              onClick={handleSaveStamp}
              disabled={stampStatus.type === 'loading'}
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-lg bg-primary text-white text-sm font-bold hover:bg-primary/90 disabled:opacity-50 transition flex-shrink-0"
            >
              {stampStatus.type === 'loading' ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              Guardar
            </button>
          </div>
          <StatusBadge s={stampStatus} />
        </div>
      </div>

      {/* ── Card: Firma del Jefe de Calidad ──────────────────────────── */}
      <div className="bg-white rounded-xl shadow-subtle p-5 flex flex-col gap-4">
        <p className="text-sm font-bold text-navy">Firma del Jefe de Calidad</p>
        <p className="text-xs text-gray-400 -mt-2">
          Aparece al pie de cada protocolo aprobado en el reporte PDF.
          Solo aplica a tu cuenta ({currentUser?.name}).
        </p>

        <div className="flex items-start gap-4">
          <div className="w-40 h-20 rounded-lg overflow-hidden bg-surface border border-border flex items-center justify-center flex-shrink-0">
            {signPreview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={signPreview} alt="Firma" className="max-w-full max-h-full object-contain"
                onError={() => setSignPreview(null)} />
            ) : (
              <Pen className="w-6 h-6 text-gray-300" />
            )}
          </div>
          <div className="flex flex-col gap-1.5 flex-1 min-w-0">
            <p className="text-xs font-bold text-gray-700">Mi firma digital</p>
            <p className="text-[11px] text-gray-400">Sube una imagen de tu firma (fondo blanco, formato JPG o PNG).</p>
            <UploadButton
              label={signPreview ? 'Cambiar firma' : 'Subir firma'}
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

const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: 'actividades',   label: 'Actividades',   icon: Table       },
  { id: 'ubicaciones',   label: 'Ubicaciones',   icon: MapPin      },
  { id: 'planos',        label: 'Planos PDF',    icon: FileText    },
  { id: 'dwg',           label: 'Planos DWG',    icon: FileArchive },
  { id: 'configuracion', label: 'Configuración', icon: Settings    },
];

export default function FileUploadPage() {
  const { id: projectId } = useParams<{ id: string }>();
  const { data: projects = [] } = useProjects();
  const project = projects.find(p => p.id === projectId);
  const [activeTab, setActiveTab] = useState<Tab>('actividades');

  return (
    <div className="flex flex-col min-h-screen bg-surface">
      <PageHeader
        title="Cargar archivos"
        subtitle={project?.name}
        crumbs={[
          { label: 'Proyectos', href: '/app/projects' },
          { label: project?.name ?? '…' },
        ]}
      />

      {/* Tab bar */}
      <div className="bg-white border-b border-border sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 flex gap-0 overflow-x-auto">
          {TABS.map(tab => (
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
              {tab.label}
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
        {activeTab === 'configuracion' && <ConfiguracionTab projectId={projectId} />}
      </div>
    </div>
  );
}
