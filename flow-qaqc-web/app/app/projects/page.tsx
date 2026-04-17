'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  Search, FolderOpen, ClipboardList, BookOpen,
  Upload, Phone, Eye, AlertCircle, CheckCircle2, TrendingUp,
} from 'lucide-react';
import { useProjects } from '@hooks/useProjects';
import { useProjectMetrics, type ProjectMetrics } from '@hooks/useProjectMetrics';
import { useAuth } from '@lib/auth-context';
import { cn, formatDate } from '@lib/utils';
import type { Project } from '@/types';

export default function ProjectsPage() {
  const { currentUser } = useAuth();
  const { data: projects = [], isLoading } = useProjects();

  const [search, setSearch] = useState('');

  const isJefe = currentUser?.role === 'RESIDENT' || currentUser?.role === 'CREATOR';

  const filtered = projects.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase())
  );

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
          <h1 className="text-white text-xl font-black tracking-wide">Mis Proyectos</h1>
          <p className="text-light text-xs mt-0.5">
            {projects.length} proyecto{projects.length !== 1 ? 's' : ''} disponible{projects.length !== 1 ? 's' : ''}
          </p>

          {/* Buscador */}
          <div className="mt-4 relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8896a5]" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar proyecto..."
              className="w-full bg-white/10 border border-white/20 rounded-md pl-8 pr-3 py-2.5 text-sm text-white placeholder:text-light/60 focus:outline-none focus:bg-white/15 transition"
            />
          </div>
        </div>
      </div>

      {/* Lista */}
      <div className="p-4 flex flex-col gap-3 pb-10">
        {isLoading ? (
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
              {search ? 'Sin resultados' : 'Sin proyectos aún'}
            </p>
          </div>
        ) : (
          filtered.map(project => (
            <ProjectCard key={project.id} project={project} isJefe={isJefe} />
          ))
        )}
      </div>
    </div>
  );
}

// ── Barra de avance ─────────────────────────────────────────────────────────
function ProgressBar({ projectId }: { projectId: string }) {
  const { data: metrics, isLoading } = useProjectMetrics(projectId);

  if (isLoading || !metrics) {
    return <div className="w-40 h-5 bg-gray-100 rounded-lg animate-pulse" />;
  }

  const pct = metrics.progressPercent;
  const barColor = pct >= 100 ? 'bg-emerald-500' : pct >= 50 ? 'bg-primary' : 'bg-amber-400';
  const textColor = pct >= 100 ? 'text-emerald-600' : pct >= 50 ? 'text-primary' : 'text-gray-500';

  return (
    <div className="flex items-center gap-2 flex-shrink-0">
      <TrendingUp size={13} className={textColor} />
      <span className={cn('text-[10px] font-medium text-gray-400')}>Avance</span>
      <span className={cn('font-bold text-[13px]', textColor)}>{pct}%</span>
      <div className="w-20 h-1.5 bg-gray-200 rounded-full overflow-hidden">
        <div
          className={cn('h-full rounded-full transition-all duration-500', barColor)}
          style={{ width: `${Math.min(pct, 100)}%` }}
        />
      </div>
      <span className="text-[10px] text-gray-400 font-semibold">{metrics.approvedProtocols}/{metrics.totalExpected}</span>
    </div>
  );
}

// ── Indicadores ─────────────────────────────────────────────────────────────
function MetricsBadges({ projectId }: { projectId: string }) {
  const { data: metrics, isLoading } = useProjectMetrics(projectId);

  if (isLoading || !metrics) {
    return (
      <div className="flex gap-2">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="h-10 w-28 bg-gray-100 rounded-lg animate-pulse" />
        ))}
      </div>
    );
  }

  const items: { icon: typeof AlertCircle; label: string; value: string; color: string; bg: string }[] = [
    {
      icon: AlertCircle,
      label: 'Obs. Pendientes',
      value: String(metrics.openObservations),
      color: metrics.openObservations > 0 ? 'text-amber-600' : 'text-gray-400',
      bg: metrics.openObservations > 0 ? 'bg-amber-50 border-amber-200' : 'bg-gray-50 border-gray-200',
    },
    {
      icon: ClipboardList,
      label: 'Por Revisar',
      value: String(metrics.pendingReview),
      color: metrics.pendingReview > 0 ? 'text-blue-600' : 'text-gray-400',
      bg: metrics.pendingReview > 0 ? 'bg-blue-50 border-blue-200' : 'bg-gray-50 border-gray-200',
    },
    {
      icon: metrics.progressPercent >= 100 ? CheckCircle2 : TrendingUp,
      label: 'Avance',
      value: `${metrics.progressPercent}%`,
      color: metrics.progressPercent >= 100 ? 'text-emerald-600' : metrics.progressPercent >= 50 ? 'text-primary' : 'text-gray-500',
      bg: metrics.progressPercent >= 100 ? 'bg-emerald-50 border-emerald-200' : metrics.progressPercent >= 50 ? 'bg-primary/5 border-primary/20' : 'bg-gray-50 border-gray-200',
    },
  ];

  return (
    <div className="flex items-center gap-3">
      {items.filter(i => i.label !== 'Avance').map(({ icon: Icon, label, value, color, bg }) => (
        <div key={label} className={cn('flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border', bg)}>
          <Icon size={13} className={color} />
          <span className="text-[10px] text-gray-400 font-medium">{label}</span>
          <span className={cn('font-bold text-[13px]', color)}>{value}</span>
        </div>
      ))}

    </div>
  );
}

// ── Tarjeta de proyecto ─────────────────────────────────────────────────────
function ProjectCard({ project, isJefe }: { project: Project; isJefe: boolean }) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  type Chip = { href: string; icon: any; label: string; iconOnly?: boolean };

  const chips: Chip[] = [
    { href: `/app/projects/${project.id}/locations`,    icon: ClipboardList, label: 'Protocolos'    },
    { href: `/app/projects/${project.id}/observations`, icon: Eye,           label: 'Observaciones' },
    { href: `/app/projects/${project.id}/dossier`,      icon: BookOpen,      label: 'Dossier'       },
    { href: `/app/projects/${project.id}/contacts`,     icon: Phone,         label: '',    iconOnly: true },
  ];

  const adminChips: Chip[] = isJefe ? [
    { href: `/app/projects/${project.id}/file-upload`, icon: Upload, label: 'Cargar' },
  ] : [];

  return (
    <div className="bg-white rounded-xl shadow-card border border-border/50 p-4 flex flex-col gap-2.5 hover:shadow-lg transition-shadow">
      {/* Fila 1: nombre (izq) + métricas (der) */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <div className="w-9 h-9 rounded-md bg-primary/10 flex items-center justify-center flex-shrink-0">
            <FolderOpen size={18} className="text-primary" />
          </div>
          <div className="min-w-0">
            <h2 className="text-navy font-bold text-[15px] leading-tight truncate">{project.name}</h2>
            <p className="text-[#8896a5] text-[11px] mt-0.5">
              Creado {formatDate(project.created_at)}
            </p>
          </div>
        </div>
        <MetricsBadges projectId={project.id} />
      </div>

      {/* Fila 2: chips (izq) + barra de avance (der) */}
      <div className="flex items-center gap-3">
        <div className="flex gap-1.5 flex-wrap flex-1">
          {[...chips, ...adminChips].map(chip => (
            <Link
              key={chip.href}
              href={chip.href}
              className={cn(
                'flex items-center gap-1.5 bg-surface border border-border rounded-md py-2 text-[12px] font-semibold text-navy hover:bg-primary hover:text-white hover:border-primary transition',
                chip.iconOnly ? 'px-2.5' : 'px-3'
              )}
            >
              <chip.icon size={13} />
              {chip.label && <span>{chip.label}</span>}
            </Link>
          ))}
        </div>
        <ProgressBar projectId={project.id} />
      </div>
    </div>
  );
}
