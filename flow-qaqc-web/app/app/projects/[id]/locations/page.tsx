'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useQueryClient } from '@tanstack/react-query';
import {
  Search, MapPin, ChevronRight, X, Layers, Wrench,
  AlertCircle, CheckCircle2, RefreshCw,
} from 'lucide-react';
import PageHeader from '@components/PageHeader';
import { useLocations, useLocationProgress } from '@hooks/useLocations';
import { useProjects } from '@hooks/useProjects';
import { cn } from '@lib/utils';
import { useI18n } from '@lib/i18n';
import type { Location } from '@/types';

export default function LocationsPage() {
  const { t } = useI18n();
  const { id: projectId } = useParams<{ id: string }>();

  const { data: projects = [] } = useProjects();
  const project = projects.find(p => p.id === projectId);

  const qc = useQueryClient();
  const { data: locations = [], isLoading, isFetching, refetch } = useLocations(projectId);
  const [manualRefresh, setManualRefresh] = useState(false);
  const showSkeleton = isLoading || manualRefresh;

  async function handleManualRefresh() {
    if (manualRefresh) return;
    setManualRefresh(true);
    qc.invalidateQueries({ queryKey: ['locations', projectId] });
    qc.invalidateQueries({ queryKey: ['location-progress', projectId] });
    try { await refetch(); } finally { setManualRefresh(false); }
  }
  const { data: progressMap } = useLocationProgress(projectId);
  const [search, setSearch] = useState('');
  const [filterLocation, setFilterLocation] = useState('');
  const [filterSpecialty, setFilterSpecialty] = useState('');
  const [expandLoc, setExpandLoc] = useState(false);
  const [expandSpec, setExpandSpec] = useState(false);

  const uniqueLocations = Array.from(new Set(locations.map(l => l.location_only).filter(Boolean))) as string[];
  const uniqueSpecialties = Array.from(new Set(locations.map(l => l.specialty).filter(Boolean))) as string[];

  const filtered = locations.filter(l => {
    const matchSearch = !search || l.name.toLowerCase().includes(search.toLowerCase());
    const matchLoc = !filterLocation || l.location_only === filterLocation;
    const matchSpec = !filterSpecialty || l.specialty === filterSpecialty;
    return matchSearch && matchLoc && matchSpec;
  });

  const activeFilters = [filterLocation, filterSpecialty].filter(Boolean).length;

  return (
    <div className="min-h-screen bg-surface flex flex-col">
      <PageHeader
        title={project?.name ?? t('webMisc.projectFallback')}
        subtitle={t(filtered.length !== 1 ? 'webMisc.locationsSubtitleMany' : 'webMisc.locationsSubtitleOne', { count: filtered.length })}
        crumbs={[{ label: t('webMisc.crumbProjects'), href: '/app/projects' }, { label: project?.name ?? '...' }]}
        syncing={isLoading}
        rightContent={
          <button
            onClick={handleManualRefresh}
            disabled={manualRefresh}
            title={t('webMisc.refresh')}
            className="p-2 rounded-lg bg-white/15 hover:bg-white/25 text-white transition disabled:opacity-50"
          >
            <RefreshCw size={14} className={manualRefresh ? 'animate-spin' : ''} />
          </button>
        }
      />

      {/* Barra de búsqueda */}
      <div className="bg-white border-b border-divider px-4 py-2.5 flex items-center gap-2">
        <Search size={14} className="text-[#8896a5] flex-shrink-0" />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder={t('webMisc.searchLocationPlaceholder')}
          className="flex-1 bg-surface border border-border rounded-md px-3 py-2 text-sm text-navy placeholder:text-[#8896a5] focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition"
        />
        {search && (
          <button onClick={() => setSearch('')} className="text-[#8896a5] hover:text-navy transition">
            <X size={14} />
          </button>
        )}
      </div>

      {/* Slicers */}
      <div className="bg-white border-b border-divider">
        {/* Slicer Ubicación */}
        <Slicer
          icon={<Layers size={12} />}
          label={t('webMisc.location')}
          value={filterLocation}
          options={uniqueLocations}
          expanded={expandLoc}
          onToggle={() => { setExpandLoc(v => !v); setExpandSpec(false); }}
          onSelect={v => { setFilterLocation(v); setExpandLoc(false); }}
          onClear={() => setFilterLocation('')}
        />
        <div className="h-px bg-divider mx-4" />
        {/* Slicer Especialidad */}
        <Slicer
          icon={<Wrench size={12} />}
          label={t('webMisc.specialty')}
          value={filterSpecialty}
          options={uniqueSpecialties}
          expanded={expandSpec}
          onToggle={() => { setExpandSpec(v => !v); setExpandLoc(false); }}
          onSelect={v => { setFilterSpecialty(v); setExpandSpec(false); }}
          onClear={() => setFilterSpecialty('')}
        />
        {activeFilters > 0 && (
          <div className="flex justify-end px-4 pb-2">
            <button
              onClick={() => { setFilterLocation(''); setFilterSpecialty(''); }}
              className="text-[11px] text-primary font-bold flex items-center gap-1 hover:underline"
            >
              <X size={11} />
              {t('webMisc.clearFilters', { count: activeFilters, plural: activeFilters > 1 ? 's' : '' })}
            </button>
          </div>
        )}
      </div>

      {/* Lista */}
      <div className="flex-1 p-4 flex flex-col gap-2.5">
        {showSkeleton ? (
          [...Array(6)].map((_, i) => (
            <div key={i} className="bg-white rounded-xl h-16 animate-pulse border border-gray-100" />
          ))
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center py-16 gap-3">
            <MapPin size={36} className="text-[#8896a5]" />
            <p className="text-[#8896a5] font-semibold text-sm text-center">
              {locations.length === 0
                ? t('webMisc.noLocations')
                : t('webMisc.noFilterResults')}
            </p>
          </div>
        ) : (
          filtered.map(loc => (
            <LocationCard
              key={loc.id}
              location={loc}
              projectId={projectId}
              progress={progressMap?.get(loc.id)}
            />
          ))
        )}
      </div>
    </div>
  );
}

// ── Tarjeta de ubicación ──────────────────────────────────────────────────────
function LocationCard({
  location, projectId, progress,
}: {
  location: Location;
  projectId: string;
  progress?: { done: number; total: number; submitted?: number };
}) {
  const { t } = useI18n();
  const allDone     = !!progress && progress.total > 0 && progress.done === progress.total;
  const hasTemplates = !!progress && progress.total > 0;
  const hasPending  = !!progress && (progress.submitted ?? 0) > 0;

  const content = (
    <>
      <div className="flex-1 min-w-0">
        <p className="text-navy font-semibold text-sm leading-tight truncate group-hover:text-primary transition">
          {location.name}
        </p>
        {location.reference_plan && (
          <p className="text-[#8896a5] text-[11px] mt-0.5 truncate">
            {t('webMisc.planLabel', { plan: location.reference_plan })}
          </p>
        )}
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        {hasTemplates ? (
          <>
            {hasPending && !allDone && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-primary/15 text-primary">
                {progress!.submitted} {t('webMisc.review')}
              </span>
            )}
            <div className={cn(
              'flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-bold',
              allDone ? 'bg-success text-white' : 'bg-light text-primary'
            )}>
              {allDone ? <CheckCircle2 size={11} /> : <AlertCircle size={11} />}
              {progress!.done}/{progress!.total}
            </div>
            <span className={cn(
              'text-[10px] font-semibold',
              allDone ? 'text-success' : 'text-[#8896a5]'
            )}>
              {allDone ? t('webMisc.complete') : t('webMisc.pending')}
            </span>
          </>
        ) : (
          <span className="text-[11px] text-[#8896a5] italic">{t('webMisc.noProtocols')}</span>
        )}
        <ChevronRight size={16} className="text-[#8896a5]" />
      </div>
    </>
  );

  const cls = cn(
    'bg-white rounded-xl shadow-subtle p-4 flex items-center justify-between gap-3 border transition group',
    'hover:shadow-card hover:border-primary/20 border-transparent',
  );

  return <Link href={`/app/projects/${projectId}/locations/${location.id}/protocols`} className={cls}>{content}</Link>;
}

// ── Componente Slicer ──────────────────────────────────────────────────────────
function Slicer({
  icon, label, value, options, expanded, onToggle, onSelect, onClear,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  options: string[];
  expanded: boolean;
  onToggle: () => void;
  onSelect: (v: string) => void;
  onClear: () => void;
}) {
  const { t } = useI18n();
  return (
    <div>
      <button
        onClick={onToggle}
        className={cn(
          'w-full flex items-center justify-between px-4 py-2.5 transition',
          value ? 'bg-[#f0f4ff]' : 'hover:bg-surface'
        )}
      >
        <div className="flex flex-col items-start gap-0.5">
          <div className="flex items-center gap-1 text-[#8896a5]">
            {icon}
            <span className="text-[10px] font-bold uppercase tracking-wider">{label}</span>
          </div>
          <span className={cn(
            'text-[13px] font-semibold',
            value ? 'text-primary' : 'text-[#4a5568]'
          )}>
            {value || t('webMisc.all')}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {value && (
            <button
              onClick={e => { e.stopPropagation(); onClear(); }}
              className="text-danger hover:text-red-700 transition"
            >
              <X size={14} />
            </button>
          )}
          <ChevronRight
            size={14}
            className={cn('text-[#8896a5] transition-transform', expanded && 'rotate-90')}
          />
        </div>
      </button>

      {expanded && (
        <div className="flex gap-2 overflow-x-auto px-4 pb-3 pt-1 scrollbar-thin">
          {['', ...options].map(opt => (
            <button
              key={opt || '__all__'}
              onClick={() => onSelect(opt)}
              className={cn(
                'flex-shrink-0 px-3.5 py-1.5 rounded-full text-xs font-semibold border transition',
                value === opt
                  ? 'bg-primary border-primary text-white'
                  : 'bg-surface border-border text-[#4a5568] hover:border-primary hover:text-primary'
              )}
            >
              {opt || t('webMisc.all')}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
