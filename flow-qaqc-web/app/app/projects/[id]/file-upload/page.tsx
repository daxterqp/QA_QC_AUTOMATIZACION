'use client';

import { useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import {
  Upload, Loader2, CheckCircle, AlertCircle, FileText, MapPin,
  Image, Pen, Trash2, RefreshCw,
} from 'lucide-react';
import PageHeader from '@components/PageHeader';
import { useProjects } from '@hooks/useProjects';
import {
  useTemplates, useLocationsList, usePlans,
  importActivitiesToSupabase, importLocationsToSupabase,
  uploadPlanToS3AndDB, uploadProjectLogo, uploadUserSignature,
} from '@hooks/useFileUpload';
import { parseActivitiesExcel, parseLocationsExcel, ExcelParseError } from '@lib/excelParser';
import { s3Url } from '@lib/pdfGenerator';
import { useAuth } from '@lib/auth-context';
import { cn } from '@lib/utils';

type Tab = 'actividades' | 'ubicaciones' | 'planos' | 'personalizar';

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
        className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-primary text-white text-sm font-bold
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
      const msg = e instanceof ExcelParseError ? e.message : `Error: ${String(e)}`;
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
        <UploadButton
          label="Importar Excel de Actividades"
          accept=".xlsx,.xls"
          loading={status.type === 'loading'}
          onClick={handleFile}
        />
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
              <div key={t.id} className="px-4 py-3 flex items-center gap-3">
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
      const msg = e instanceof ExcelParseError ? e.message : `Error: ${String(e)}`;
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
        <UploadButton
          label="Importar Excel de Ubicaciones"
          accept=".xlsx,.xls"
          loading={status.type === 'loading'}
          onClick={handleFile}
        />
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
              <div key={loc.id} className="px-4 py-3 flex items-center gap-3">
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

// ── Planos tab ────────────────────────────────────────────────────────────────

function PlanosTab({ projectId, projectName }: { projectId: string; projectName: string }) {
  const qc = useQueryClient();
  const { currentUser } = useAuth();
  const { data: plans = [], isLoading } = usePlans(projectId);
  const [status, setStatus] = useState<ImportStatus>({ type: 'idle' });
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function handleFiles(files: FileList) {
    if (!currentUser) return;
    const arr = Array.from(files).filter(f => f.name.toLowerCase().endsWith('.pdf'));
    if (arr.length === 0) { setStatus({ type: 'error', msg: 'Selecciona archivos PDF.' }); return; }
    setStatus({ type: 'loading', msg: `Subiendo ${arr.length} archivo${arr.length !== 1 ? 's' : ''}...` });
    try {
      for (const file of arr) {
        await uploadPlanToS3AndDB(file, projectId, projectName, currentUser.id);
      }
      qc.invalidateQueries({ queryKey: ['plans', projectId] });
      setStatus({ type: 'success', msg: `${arr.length} plano${arr.length !== 1 ? 's' : ''} subido${arr.length !== 1 ? 's' : ''} correctamente` });
    } catch (e) {
      setStatus({ type: 'error', msg: `Error al subir: ${String(e)}` });
    }
  }

  async function handleDelete(planId: string) {
    setDeletingId(planId);
    try {
      await import('@lib/supabase/client').then(m => m.createClient())
        .then(sb => sb.from('plans').delete().eq('id', planId));
      qc.invalidateQueries({ queryKey: ['plans', projectId] });
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="bg-white rounded-xl shadow-subtle p-4 flex flex-col gap-3">
        <p className="text-xs text-gray-500 leading-relaxed">
          Sube planos PDF al proyecto. El nombre del archivo debe coincidir con el
          campo <span className="font-semibold text-gray-700">"PLANO DE REFERENCIA"</span> de cada ubicación para la vinculación automática.
        </p>
        <UploadButton
          label="Subir PDFs"
          accept=".pdf"
          multiple
          loading={status.type === 'loading'}
          onClick={handleFiles}
        />
        <StatusBadge s={status} />
      </div>

      {isLoading ? (
        <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>
      ) : plans.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-12 text-center">
          <FileText className="w-10 h-10 text-gray-200" />
          <p className="text-sm text-gray-400">Sin planos PDF cargados</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-subtle overflow-hidden">
          <div className="px-4 py-3 border-b border-border">
            <p className="text-xs font-bold text-gray-700">Planos cargados ({plans.length})</p>
          </div>
          <div className="divide-y divide-divider">
            {plans.map(plan => (
              <div key={plan.id} className="px-4 py-3 flex items-center gap-3">
                <span className="text-[10px] font-bold bg-red-100 text-danger px-1.5 py-0.5 rounded uppercase tracking-wide">
                  PDF
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-gray-800 truncate">{plan.name}</p>
                  <p className="text-[10px] text-gray-400">
                    {new Date(plan.created_at).toLocaleDateString('es-PE')}
                  </p>
                </div>
                {plan.s3_key && (
                  <a
                    href={s3Url(plan.s3_key)}
                    target="_blank" rel="noopener noreferrer"
                    className="text-primary hover:text-primary/70 transition-colors"
                    title="Ver PDF"
                  >
                    <FileText className="w-4 h-4" />
                  </a>
                )}
                <button
                  onClick={() => handleDelete(plan.id)}
                  disabled={deletingId === plan.id}
                  className="text-gray-400 hover:text-danger transition-colors disabled:opacity-40"
                  title="Eliminar plano"
                >
                  {deletingId === plan.id
                    ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    : <Trash2 className="w-3.5 h-3.5" />}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Personalizar tab ──────────────────────────────────────────────────────────

function PersonalizarTab({ projectId }: { projectId: string }) {
  const qc = useQueryClient();
  const { currentUser } = useAuth();
  const { data: projects = [] } = useProjects();
  const project = projects.find(p => p.id === projectId);

  const [logoStatus,  setLogoStatus]  = useState<ImportStatus>({ type: 'idle' });
  const [signStatus,  setSignStatus]  = useState<ImportStatus>({ type: 'idle' });
  const [logoPreview, setLogoPreview] = useState<string | null>(
    (project as any)?.logo_s3_key ? s3Url((project as any).logo_s3_key) : null
  );
  const [signPreview, setSignPreview] = useState<string | null>(
    currentUser ? s3Url(`signatures/${currentUser.id}/signature.jpg`) : null
  );

  async function handleLogo(files: FileList) {
    const file = files[0];
    setLogoStatus({ type: 'loading', msg: 'Subiendo logo...' });
    try {
      await uploadProjectLogo(file, projectId);
      qc.invalidateQueries({ queryKey: ['projects'] });
      setLogoPreview(URL.createObjectURL(file));
      setLogoStatus({ type: 'success', msg: 'Logo actualizado. Visible para todos los usuarios.' });
    } catch (e) {
      setLogoStatus({ type: 'error', msg: `Error: ${String(e)}` });
    }
  }

  async function handleSignature(files: FileList) {
    if (!currentUser) return;
    const file = files[0];
    setSignStatus({ type: 'loading', msg: 'Subiendo firma...' });
    try {
      await uploadUserSignature(file, currentUser.id);
      setSignPreview(URL.createObjectURL(file));
      setSignStatus({ type: 'success', msg: 'Firma guardada. Se incluirá en los reportes PDF.' });
    } catch (e) {
      setSignStatus({ type: 'error', msg: `Error: ${String(e)}` });
    }
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Logo del proyecto */}
      <div className="bg-white rounded-xl shadow-subtle p-4 flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <Image className="w-4 h-4 text-primary" />
          <p className="text-sm font-bold text-gray-800">Logo del proyecto</p>
        </div>
        <p className="text-xs text-gray-500">
          Aparece en las fotos (esquina inferior derecha, 25% opacidad) y en los reportes PDF.
          Visible para todos los usuarios del proyecto.
        </p>
        {logoPreview && (
          <div className="w-32 h-20 rounded-lg overflow-hidden bg-light border border-border flex items-center justify-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={logoPreview} alt="Logo" className="max-w-full max-h-full object-contain"
              onError={() => setLogoPreview(null)} />
          </div>
        )}
        <UploadButton
          label="Cambiar logo"
          accept="image/jpeg,image/png,image/*"
          loading={logoStatus.type === 'loading'}
          onClick={handleLogo}
        />
        <StatusBadge s={logoStatus} />
      </div>

      {/* Firma del usuario */}
      <div className="bg-white rounded-xl shadow-subtle p-4 flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <Pen className="w-4 h-4 text-primary" />
          <p className="text-sm font-bold text-gray-800">Mi firma digital</p>
        </div>
        <p className="text-xs text-gray-500">
          Tu firma personal aparece en los reportes PDF cuando eres el jefe de calidad que aprueba un protocolo.
          Solo aplica a tu cuenta ({currentUser?.name}).
        </p>
        {signPreview && (
          <div className="w-40 h-16 rounded-lg overflow-hidden bg-light border border-border flex items-center justify-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={signPreview} alt="Firma" className="max-w-full max-h-full object-contain"
              onError={() => setSignPreview(null)} />
          </div>
        )}
        <UploadButton
          label="Cambiar firma"
          accept="image/jpeg,image/png,image/*"
          loading={signStatus.type === 'loading'}
          onClick={handleSignature}
        />
        <StatusBadge s={signStatus} />
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

const TABS: { id: Tab; label: string }[] = [
  { id: 'actividades', label: 'Actividades' },
  { id: 'ubicaciones', label: 'Ubicaciones' },
  { id: 'planos',      label: 'Planos PDF'  },
  { id: 'personalizar', label: 'Personalizar' },
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
                'px-4 py-3 text-xs font-bold whitespace-nowrap border-b-2 transition-colors',
                activeTab === tab.id
                  ? 'border-primary text-primary'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      <div className="flex-1 max-w-2xl w-full mx-auto px-4 py-5">
        {activeTab === 'actividades' && <ActividadesTab projectId={projectId} />}
        {activeTab === 'ubicaciones' && <UbicacionesTab projectId={projectId} />}
        {activeTab === 'planos'      && <PlanosTab projectId={projectId} projectName={project?.name ?? ''} />}
        {activeTab === 'personalizar' && <PersonalizarTab projectId={projectId} />}
      </div>
    </div>
  );
}
