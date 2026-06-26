'use client';

/**
 * Detalle de cobertura topográfica — lista de ensayos con 3 filtros:
 *   1. Con coordenadas topográficas
 *   2. Con coordenadas GPS (sin topo → usan GPS de respaldo)
 *   3. Sin coordenadas
 */
import { useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { Mountain, Satellite, CircleSlash, Loader2 } from 'lucide-react';
import { useProjects } from '@hooks/useProjects';
import { useTopoCoverageItems } from '@hooks/useTopoCoverage';
import PageHeader from '@components/PageHeader';
import { usePageRefresh } from '@hooks/usePageRefresh';

type Filter = 'topo' | 'gps' | 'none';

export default function TopoCoveragePage() {
  const { refreshing, onRefresh } = usePageRefresh();
  const { id: projectId } = useParams<{ id: string }>();
  const { data: projects = [] } = useProjects();
  const project = projects.find((p) => p.id === projectId);
  const { data: items = [], isLoading } = useTopoCoverageItems(projectId);

  const buckets = useMemo(() => ({
    topo: items.filter((i) => i.hasTopo),
    gps: items.filter((i) => !i.hasTopo && i.hasGps),
    none: items.filter((i) => !i.hasTopo && !i.hasGps),
  }), [items]);

  const [filter, setFilter] = useState<Filter>('topo');

  const TABS: { key: Filter; label: string; icon: React.ReactNode; color: string }[] = [
    { key: 'topo', label: 'Con coord. topográficas', icon: <Mountain size={14} />, color: 'text-emerald-700 border-emerald-300 bg-emerald-50' },
    { key: 'gps', label: 'Con coordenadas GPS', icon: <Satellite size={14} />, color: 'text-amber-700 border-amber-300 bg-amber-50' },
    { key: 'none', label: 'Sin coordenadas', icon: <CircleSlash size={14} />, color: 'text-rose-700 border-rose-300 bg-rose-50' },
  ];

  const list = buckets[filter];

  return (
    <div className="min-h-screen bg-surface flex flex-col">
      <PageHeader
        title="Cobertura de coordenadas"
        subtitle={project?.name}
        crumbs={[{ label: 'Proyectos', href: '/app/projects' }, { label: project?.name ?? '…' }]}
        onRefresh={onRefresh}
        refreshing={refreshing}
      />

      <div className="flex-1 p-4 flex flex-col gap-4 pb-24 max-w-3xl w-full mx-auto">
        {/* Filtros */}
        <div className="flex flex-wrap gap-2">
          {TABS.map((tab) => {
            const active = filter === tab.key;
            return (
              <button key={tab.key} onClick={() => setFilter(tab.key)}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg border text-[12px] font-bold transition ${active ? tab.color : 'bg-white border-border text-muted hover:bg-surface'}`}>
                {tab.icon} {tab.label}
                <span className={`ml-1 px-1.5 py-0.5 rounded-full text-[11px] ${active ? 'bg-white/60' : 'bg-surface'}`}>{buckets[tab.key].length}</span>
              </button>
            );
          })}
        </div>

        {/* Lista */}
        {isLoading ? (
          <div className="flex items-center gap-2 text-muted text-sm"><Loader2 size={16} className="animate-spin" /> Cargando…</div>
        ) : list.length === 0 ? (
          <div className="bg-white rounded-xl shadow-subtle p-8 text-center text-muted text-sm">No hay ensayos en este grupo.</div>
        ) : (
          <div className="bg-white rounded-xl shadow-subtle divide-y divide-border">
            {list.map((it) => (
              <div key={it.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                <span className="text-[13px] font-semibold text-navy truncate">{it.code}</span>
                <div className="flex items-center gap-1.5 shrink-0">
                  {it.hasTopo && <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-1.5 py-0.5">TOPO</span>}
                  {it.hasGps && <span className="text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5">GPS</span>}
                  {!it.hasTopo && !it.hasGps && <span className="text-[10px] font-bold text-rose-700 bg-rose-50 border border-rose-200 rounded px-1.5 py-0.5">SIN COORD.</span>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
