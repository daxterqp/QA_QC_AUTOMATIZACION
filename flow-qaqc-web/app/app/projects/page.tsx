'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useQueryClient } from '@tanstack/react-query';
import {
  Search, FolderOpen, BookOpen,
  Upload, Phone, Eye, ChevronRight, LayoutGrid, Users as UsersIcon, EyeOff, RefreshCw, Settings,
} from 'lucide-react';
import { useProjects, useProjectFlags, useUpdateProjectFlags } from '@hooks/useProjects';
import { useProjectMetrics } from '@hooks/useProjectMetrics';
import { useAuth } from '@lib/auth-context';
import { cn, formatDate } from '@lib/utils';
import { useI18n } from '@lib/i18n';
import { ProjectConfigModal } from '@components/project/ProjectConfigModal';
import type { Project } from '@/types';

export default function ProjectsPage() {
  const { t } = useI18n();
  const { currentUser } = useAuth();
  const qc = useQueryClient();
  const { data: projects = [], isLoading, isFetching, refetch } = useProjects();
  const [manualRefresh, setManualRefresh] = useState(false);
  const showSkeleton = isLoading || manualRefresh;

  async function handleManualRefresh() {
    if (manualRefresh) return;
    setManualRefresh(true);
    qc.invalidateQueries({ queryKey: ['projects'] });
    qc.invalidateQueries({ queryKey: ['project-metrics'] });
    try { await refetch(); } finally { setManualRefresh(false); }
  }

  const [search, setSearch] = useState('');
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set());
  const [showHidden, setShowHidden] = useState(false);

  const isJefe = currentUser?.role === 'RESIDENT' || currentUser?.role === 'CREATOR';

  // Cargar proyectos ocultos del usuario actual (localStorage, espejo del móvil).
  useEffect(() => {
    if (!currentUser) return;
    try {
      const raw = localStorage.getItem(`hidden_projects_${currentUser.id}`);
      if (raw) setHiddenIds(new Set(JSON.parse(raw)));
    } catch { /* ignore */ }
  }, [currentUser?.id]);

  const toggleHidden = (projectId: string) => {
    if (!currentUser) return;
    const next = new Set(hiddenIds);
    if (next.has(projectId)) next.delete(projectId);
    else next.add(projectId);
    setHiddenIds(next);
    try {
      localStorage.setItem(`hidden_projects_${currentUser.id}`, JSON.stringify(Array.from(next)));
    } catch { /* ignore */ }
  };

  const filtered = projects
    .filter(p => p.name.toLowerCase().includes(search.toLowerCase()))
    .filter(p => showHidden || !hiddenIds.has(p.id));
  const hiddenCount = projects.filter(p => hiddenIds.has(p.id)).length;

  return (
    <div className="min-h-screen bg-surface">
      {/* Header con textura */}
      <div className="px-6 pt-6 pb-5 relative overflow-hidden" style={{ background: 'linear-gradient(to right, #0e213d 60%, #0c3d45 100%)' }}>


        {/* Glow de fondo — aurora radial */}
        <div className="absolute top-0 right-0 w-[70%] h-full" style={{
          background: 'radial-gradient(ellipse 60% 100% at 85% 50%, rgba(0,188,180,0.07) 0%, rgba(79,195,247,0.06) 40%, transparent 70%)',
          animation: 'flowPulseGlow 8s ease-in-out infinite',
        }} />

        {/* Ondas animadas "Flow" */}
        <div className="absolute top-0 right-0 w-[50%] h-full overflow-hidden" style={{ maskImage: 'linear-gradient(to right, transparent 0%, black 40%)', WebkitMaskImage: 'linear-gradient(to right, transparent 0%, black 40%)' }}>
          <svg className="flow-layer flow-a1 absolute inset-0 w-[200%] h-full" viewBox="0 0 800 120" preserveAspectRatio="none" fill="none" style={{ filter: 'blur(3px)' }}>
            <path d="M0,15 Q50,1 100,13 Q150,27 200,17 Q250,3 300,15 Q350,29 400,13 Q450,1 500,17 Q550,31 600,15 Q650,3 700,13 Q750,27 800,17" stroke="rgba(79,195,247,0.06)" strokeWidth="6"/>
          </svg>
          <svg className="flow-layer flow-a2 absolute inset-0 w-[200%] h-full" viewBox="0 0 800 120" preserveAspectRatio="none" fill="none" style={{ filter: 'blur(3px)' }}>
            <path d="M0,50 Q50,34 100,48 Q150,64 200,52 Q250,36 300,50 Q350,66 400,48 Q450,34 500,52 Q550,68 600,50 Q650,36 700,48 Q750,64 800,52" stroke="rgba(0,188,180,0.05)" strokeWidth="7"/>
          </svg>
          <svg className="flow-layer flow-a3 absolute inset-0 w-[200%] h-full" viewBox="0 0 800 120" preserveAspectRatio="none" fill="none" style={{ filter: 'blur(3px)' }}>
            <path d="M0,90 Q50,74 100,88 Q150,104 200,92 Q250,76 300,90 Q350,106 400,88 Q450,74 500,92 Q550,108 600,90 Q650,76 700,88 Q750,104 800,92" stroke="rgba(79,195,247,0.07)" strokeWidth="6"/>
          </svg>
          <svg className="flow-layer flow-b1 absolute inset-0 w-[200%] h-full" viewBox="0 0 800 120" preserveAspectRatio="none" fill="none" style={{ filter: 'blur(3px)' }}>
            <path d="M0,28 Q60,12 120,26 Q180,42 240,30 Q300,14 360,28 Q420,44 480,26 Q540,12 600,30 Q660,46 720,28 Q780,14 800,26" stroke="rgba(0,188,180,0.07)" strokeWidth="6"/>
          </svg>
          <svg className="flow-layer flow-b2 absolute inset-0 w-[200%] h-full" viewBox="0 0 800 120" preserveAspectRatio="none" fill="none" style={{ filter: 'blur(3px)' }}>
            <path d="M0,65 Q60,48 120,62 Q180,78 240,66 Q300,50 360,65 Q420,80 480,62 Q540,48 600,66 Q660,82 720,65 Q780,50 800,62" stroke="rgba(79,195,247,0.06)" strokeWidth="7"/>
          </svg>
          <svg className="flow-layer flow-b3 absolute inset-0 w-[200%] h-full" viewBox="0 0 800 120" preserveAspectRatio="none" fill="none" style={{ filter: 'blur(3px)' }}>
            <path d="M0,105 Q60,88 120,102 Q180,118 240,106 Q300,90 360,105 Q420,120 480,102 Q540,88 600,106 Q660,120 720,105 Q780,90 800,102" stroke="rgba(0,188,180,0.05)" strokeWidth="6"/>
          </svg>
        </div>
        <div className="relative z-10">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h1 className="text-white text-xl font-black tracking-wide">{t('webMisc.myProjects')}</h1>
              <p className="text-light text-xs mt-0.5">
                {t(projects.length !== 1 ? 'webMisc.projectsAvailableMany' : 'webMisc.projectsAvailableOne', { count: projects.length })}
              </p>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <button
                onClick={handleManualRefresh}
                title={t('webMisc.refreshList')}
                disabled={manualRefresh}
                className="p-2 rounded-lg text-white border border-white/20 hover:bg-white/20 transition disabled:opacity-50"
              >
                <RefreshCw size={14} className={manualRefresh ? 'animate-spin' : ''} />
              </button>
              {currentUser?.role === 'CREATOR' && (
                <Link
                  href="/app/users"
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-white/10 text-white border border-white/20 hover:bg-white/20 transition"
                >
                  <UsersIcon size={13} />
                  {t('webMisc.users')}
                </Link>
              )}
              {currentUser && (
                <Link
                  href="/app/me"
                  className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 text-white border border-white/20 flex items-center justify-center text-xs font-black transition"
                  title={t('webMisc.myAccount')}
                >
                  {(currentUser.name?.[0] ?? '') + (currentUser.apellido?.[0] ?? '')}
                </Link>
              )}
            </div>
          </div>

          {/* Buscador */}
          <div className="mt-4 relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8896a5]" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder={t('webMisc.searchProjectPlaceholder')}
              className="w-full bg-white/10 border border-white/20 rounded-md pl-8 pr-3 py-2.5 text-sm text-white placeholder:text-light/60 focus:outline-none focus:bg-white/15 transition"
            />
          </div>
        </div>
      </div>

      {/* Lista */}
      <div className="p-4 flex flex-col gap-3 pb-10">
        {showSkeleton ? (
          [...Array(3)].map((_, i) => (
            <div key={i} className="bg-white rounded-xl shadow-card p-4 flex flex-col gap-3 animate-pulse">
              <div className="flex items-start gap-2">
                <div className="w-9 h-9 rounded-md bg-gray-200" />
                <div className="flex-1 flex flex-col gap-1.5 pt-0.5">
                  <div className="h-4 bg-gray-200 rounded w-3/4" />
                  <div className="h-3 bg-gray-100 rounded w-1/2" />
                </div>
              </div>
              <div className="flex gap-1.5">
                {[...Array(4)].map((_, j) => <div key={j} className="h-8 bg-gray-100 rounded-md w-20" />)}
              </div>
            </div>
          ))
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center py-16 gap-3">
            <FolderOpen size={40} className="text-[#8896a5]" />
            <p className="text-[#8896a5] font-semibold">
              {search ? t('webMisc.noResultsShort') : t('webMisc.noProjectsYet')}
            </p>
          </div>
        ) : (
          <>
            {hiddenCount > 0 && (
              <button
                onClick={() => setShowHidden(v => !v)}
                className="self-end text-[11px] font-bold text-muted hover:text-navy flex items-center gap-1 mb-1"
              >
                {showHidden ? <Eye size={12} /> : <EyeOff size={12} />}
                {showHidden ? t('webMisc.hideHiddenProjects', { count: hiddenCount, plural: hiddenCount !== 1 ? 's' : '' })
                            : t('webMisc.showHiddenProjects', { count: hiddenCount, plural: hiddenCount !== 1 ? 's' : '' })}
              </button>
            )}
            {filtered.map(project => (
              <ProjectCard
                key={project.id}
                project={project}
                isJefe={isJefe}
                isCreator={currentUser?.role === 'CREATOR'}
                isHidden={hiddenIds.has(project.id)}
                onToggleHidden={() => toggleHidden(project.id)}
              />
            ))}
          </>
        )}
      </div>
    </div>
  );
}

// ── Tarjeta de proyecto (versión paridad con móvil) ─────────────────────────
function ProjectCard({ project, isJefe, isCreator, isHidden, onToggleHidden }: {
  project: Project;
  isJefe: boolean;
  isCreator: boolean;
  isHidden: boolean;
  onToggleHidden: () => void;
}) {
  const { t } = useI18n();
  const { data: metrics } = useProjectMetrics(project.id);
  const isActive = (project.status ?? 'ACTIVE') === 'ACTIVE';

  const obs = metrics?.openObservations ?? 0;
  const approved = metrics?.approvedProtocols ?? 0;
  const submitted = metrics?.pendingReview ?? 0;
  const rejected = metrics?.rejectedProtocols ?? 0;

  return (
    <div
      className={cn(
        'bg-white rounded-xl shadow-card overflow-hidden border-t-[3px] hover:shadow-lg transition-shadow',
        isHidden && 'opacity-60',
      )}
      style={{ borderTopColor: 'var(--color-primary, #00bcb4)' }}
    >
      {/* Cabecera: nombre + estado + chevron + toggle hidden */}
      <div className="flex items-center gap-2 px-4 pt-4 pb-2.5">
        <Link
          href={`/app/projects/${project.id}/menu`}
          className="flex-1 min-w-0 flex flex-col gap-1.5 hover:opacity-80 transition"
        >
          <h2 className="text-navy font-bold text-[16px] leading-tight truncate">{project.name}</h2>
          <span
            className={cn(
              'self-start rounded-[3px] px-1.5 py-[2px] text-[9px] font-bold tracking-wider text-white',
              isActive ? 'bg-emerald-500' : 'bg-gray-400',
            )}
          >
            {isActive ? t('webMisc.statusActive') : t('webMisc.statusClosed')}{isHidden && t('webMisc.hiddenSuffix')}
          </span>
          <p className="text-[11px] text-[#8896a5]">{t('webMisc.createdOn', { date: formatDate(project.created_at) })}</p>
        </Link>
        <button
          onClick={onToggleHidden}
          title={isHidden ? t('webMisc.showInMyList') : t('webMisc.hideFromMyList')}
          className="p-2 rounded-lg text-muted hover:text-navy hover:bg-surface transition flex-shrink-0"
        >
          {isHidden ? <Eye size={15} /> : <EyeOff size={15} />}
        </button>
        <ChevronRight size={20} className="text-[#8896a5]" />
      </div>

      {/* Fila de chips de acción (igual que móvil) */}
      <div className="flex items-center gap-1.5 px-3 pb-3 pt-2.5 border-t border-divider">
        {/* Observaciones (con contador rojo si > 0) */}
        <Link
          href={`/app/projects/${project.id}/observations`}
          className="flex items-center gap-1 bg-white border border-border rounded-md px-2.5 py-1.5 text-[11px] font-semibold text-navy hover:border-primary transition"
          title={t('webMisc.observations')}
        >
          <Eye size={13} />
          <span className="text-[10px] font-bold text-gray-500">{t('webMisc.obsShort')}</span>
          {obs > 0 ? (
            <span className="text-[12px] font-black text-danger animate-pulse">{obs}!</span>
          ) : (
            <span className="text-[12px] font-bold text-gray-400">0</span>
          )}
        </Link>

        {/* Dossier (con 3 mini-badges: aprobado / enviado / rechazado) */}
        <Link
          href={`/app/projects/${project.id}/dossier`}
          className="flex items-center gap-1 bg-white border border-border rounded-md px-2.5 py-1.5 text-[11px] font-semibold text-navy hover:border-primary transition"
          title={t('webMisc.dossier')}
        >
          <BookOpen size={13} />
          <span className="text-[10px] font-bold text-gray-500">{t('webMisc.dossierShort')}</span>
          <div className="flex items-center gap-0.5 ml-0.5">
            <span className="bg-emerald-500 text-white text-[9px] font-black rounded-[3px] min-w-[16px] h-[16px] px-1 flex items-center justify-center">{approved}</span>
            <span className="bg-primary text-white text-[9px] font-black rounded-[3px] min-w-[16px] h-[16px] px-1 flex items-center justify-center">{submitted}</span>
            <span className="bg-danger text-white text-[9px] font-black rounded-[3px] min-w-[16px] h-[16px] px-1 flex items-center justify-center">{rejected}</span>
          </div>
        </Link>

        {/* v29 — Cargar archivos y Planos se accedan desde el menú interno del proyecto. */}
        {/* Teléfonos (icono naranja/secondary) */}
        <Link
          href={`/app/projects/${project.id}/contacts`}
          className="flex items-center justify-center bg-secondary border border-secondary rounded-md px-2.5 py-1.5 text-white hover:opacity-90 transition"
          title={t('webMisc.contacts')}
        >
          <Phone size={14} />
        </Link>

        {/* v40 — Configurar módulos: ícono al costado de Contactos. EXCLUSIVO del
            rol CREATOR (ni el Jefe lo ve). Antes vivía dentro de "Cargar archivos". */}
        {isCreator && <ProjectConfigButton project={project} />}
      </div>
    </div>
  );
}

/** Botón "Configurar módulos" + su modal (CREATOR-only). Componente propio para
 *  que los hooks de flags solo se monten cuando el creador ve la tarjeta. */
function ProjectConfigButton({ project }: { project: Project }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const { data: flags } = useProjectFlags(project.id);
  const updateFlags = useUpdateProjectFlags(project.id);
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center justify-center bg-white border border-border rounded-md px-2.5 py-1.5 text-textSecondary hover:border-primary hover:text-primary transition"
        title={t('webMisc.configureModulesHint')}
      >
        <Settings size={14} />
      </button>
      {open && flags && (
        <ProjectConfigModal
          initialFlags={flags}
          initialMapTileUrl={project.map_tile_url ?? null}
          initialSampleIdentifier={(project as { sample_identifier?: string | null }).sample_identifier ?? null}
          title={t('webMisc.configureModulesTitle', { name: project.name })}
          confirmLabel={t('webMisc.saveConfig')}
          onConfirm={async (newFlags, mapTileUrl, sampleIdentifier) => {
            try {
              await updateFlags.mutateAsync({ flags: newFlags, mapTileUrl, sampleIdentifier } as any);
              setOpen(false);
            } catch (e) {
              alert((e as Error).message);
            }
          }}
          onCancel={() => setOpen(false)}
        />
      )}
    </>
  );
}
