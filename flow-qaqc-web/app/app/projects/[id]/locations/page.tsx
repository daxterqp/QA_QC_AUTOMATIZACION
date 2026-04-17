'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  Search, MapPin, ChevronRight, X, Layers, Wrench,
  AlertCircle, CheckCircle2, Trash2, Loader2,
} from 'lucide-react';
import PageHeader from '@components/PageHeader';
import { useLocations, useLocationProgress, useDeleteLocations } from '@hooks/useLocations';
import { useProjects } from '@hooks/useProjects';
import { useAuth } from '@lib/auth-context';
import { cn } from '@lib/utils';
import type { Location } from '@/types';

export default function LocationsPage() {
  const { id: projectId } = useParams<{ id: string }>();

  const { data: projects = [] } = useProjects();
  const project = projects.find(p => p.id === projectId);

  const { currentUser } = useAuth();
  const { data: locations = [], isLoading } = useLocations(projectId);
  const { data: progressMap } = useLocationProgress(projectId);
  const deleteLocations = useDeleteLocations(projectId);

  const isJefe = currentUser?.role === 'RESIDENT' || currentUser?.role === 'CREATOR';

  const [search, setSearch] = useState('');
  const [filterLocation, setFilterLocation] = useState('');
  const [filterSpecialty, setFilterSpecialty] = useState('');
  const [expandLoc, setExpandLoc] = useState(false);
  const [expandSpec, setExpandSpec] = useState(false);

  const [deleteMode, setDeleteMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);

  function toggleSelect(id: string) {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  async function handleDelete() {
    if (selected.size === 0) return;
    setDeleting(true);
    try {
      await deleteLocations.mutateAsync(Array.from(selected));
      setSelected(new Set());
      setDeleteMode(false);
    } catch (e) {
      console.error('[locations/delete] error:', e);
    } finally {
      setDeleting(false);
    }
  }

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
        title={project?.name ?? 'Proyecto'}
        subtitle={`${filtered.length} ubicación${filtered.length !== 1 ? 'es' : ''}`}
        crumbs={[{ label: 'Proyectos', href: '/app/projects' }, { label: project?.name ?? '...' }]}
        syncing={isLoading}
        rightContent={isJefe && !deleteMode ? (
          <button
            onClick={() => { setDeleteMode(true); setSelected(new Set()); }}
            disabled={locations.length === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/15 hover:bg-white/25
                       text-white text-xs font-bold transition-colors disabled:opacity-40"
            title="Eliminar ubicaciones"
          >
            <Trash2 size={14} />
          </button>
        ) : undefined}
      />

      {/* Barra de búsqueda */}
      <div className="bg-white border-b border-divider px-4 py-2.5 flex items-center gap-2">
        <Search size={14} className="text-[#8896a5] flex-shrink-0" />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Buscar ubicación..."
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
          label="Ubicación"
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
          label="Especialidad"
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
              Limpiar {activeFilters} filtro{activeFilters > 1 ? 's' : ''}
            </button>
          </div>
        )}
      </div>

      {/* Barra de eliminación */}
      {deleteMode && (
        <div className="bg-red-50 border-b border-red-200 px-4 py-2.5 flex items-center justify-between">
          <span className="text-sm font-semibold text-danger">
            {selected.size > 0
              ? `${selected.size} ubicación${selected.size !== 1 ? 'es' : ''} seleccionada${selected.size !== 1 ? 's' : ''}`
              : 'Selecciona ubicaciones a eliminar'}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => { setDeleteMode(false); setSelected(new Set()); }}
              className="px-3 py-1.5 rounded-lg text-xs font-bold text-gray-600 hover:bg-gray-100 transition"
            >
              Cancelar
            </button>
            <button
              onClick={handleDelete}
              disabled={selected.size === 0 || deleting}
              className="px-3 py-1.5 rounded-lg bg-danger text-white text-xs font-bold
                         disabled:opacity-40 hover:bg-red-700 transition flex items-center gap-1.5"
            >
              {deleting && <Loader2 size={12} className="animate-spin" />}
              {deleting ? 'Eliminando...' : `Confirmar (${selected.size})`}
            </button>
          </div>
        </div>
      )}

      {/* Lista */}
      <div className="flex-1 p-4 flex flex-col gap-2.5">
        {isLoading ? (
          [...Array(6)].map((_, i) => (
            <div key={i} className="bg-white rounded-xl h-16 animate-pulse border border-gray-100" />
          ))
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center py-16 gap-3">
            <MapPin size={36} className="text-[#8896a5]" />
            <p className="text-[#8896a5] font-semibold text-sm text-center">
              {locations.length === 0
                ? 'No hay ubicaciones.\nImporta el Excel de ubicaciones desde el menú del proyecto.'
                : 'Sin resultados para los filtros aplicados.'}
            </p>
          </div>
        ) : (
          filtered.map(loc => (
            <LocationCard
              key={loc.id}
              location={loc}
              projectId={projectId}
              progress={progressMap?.get(loc.id)}
              deleteMode={deleteMode}
              isSelected={selected.has(loc.id)}
              onToggle={() => toggleSelect(loc.id)}
            />
          ))
        )}
      </div>
    </div>
  );
}

// ── Tarjeta de ubicación ──────────────────────────────────────────────────────
function LocationCard({
  location, projectId, progress, deleteMode, isSelected, onToggle,
}: {
  location: Location;
  projectId: string;
  progress?: { done: number; total: number; submitted?: number };
  deleteMode?: boolean;
  isSelected?: boolean;
  onToggle?: () => void;
}) {
  const allDone     = !!progress && progress.total > 0 && progress.done === progress.total;
  const hasTemplates = !!progress && progress.total > 0;
  const hasPending  = !!progress && (progress.submitted ?? 0) > 0;

  const content = (
    <>
      {deleteMode && (
        <input
          type="checkbox"
          checked={isSelected}
          onChange={onToggle}
          className="w-4 h-4 rounded border-gray-300 text-danger focus:ring-danger/30 flex-shrink-0"
        />
      )}
      <div className="flex-1 min-w-0">
        <p className="text-navy font-semibold text-sm leading-tight truncate group-hover:text-primary transition">
          {location.name}
        </p>
        {location.reference_plan && (
          <p className="text-[#8896a5] text-[11px] mt-0.5 truncate">
            Plano: {location.reference_plan}
          </p>
        )}
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        {hasTemplates ? (
          <>
            {hasPending && !allDone && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-primary/15 text-primary">
                {progress!.submitted} revisión
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
              {allDone ? 'Completo' : 'Pendiente'}
            </span>
          </>
        ) : (
          <span className="text-[11px] text-[#8896a5] italic">Sin protocolos</span>
        )}
        {!deleteMode && <ChevronRight size={16} className="text-[#8896a5]" />}
      </div>
    </>
  );

  const cls = cn(
    'bg-white rounded-xl shadow-subtle p-4 flex items-center justify-between gap-3 border transition group',
    deleteMode && isSelected ? 'ring-2 ring-danger/50 bg-red-50/30 border-danger/20' :
    deleteMode ? 'border-transparent hover:border-danger/20' :
    'hover:shadow-card hover:border-primary/20 border-transparent',
  );

  if (deleteMode) {
    return <div className={cls} onClick={onToggle} style={{ cursor: 'pointer' }}>{content}</div>;
  }
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
            {value || 'Todas'}
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
              {opt || 'Todas'}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
