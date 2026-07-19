'use client';

/**
 * Carga de datos topográficos (web) — lista de cargas por fecha con código
 * T<ddmmaa>-<seq>. Cada carga muestra nº de filas + pendientes (códigos sin
 * ensayo). Crear/editar (manual + CSV) abre TopoCargaModal; borrar revierte las
 * coordenadas topográficas que la carga escribió en las fichas.
 */
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Mountain, Plus, Trash2, Loader2, Pencil, AlertTriangle, Settings } from 'lucide-react';
import { useProjects, useProjectFlags } from '@hooks/useProjects';
import { useAuth } from '@lib/auth-context';
import { isTopoEnabled, topoColumns } from '@/types';
import {
  useTopoCargas, useCreateTopoCarga, useUpdateTopoCarga, useDeleteTopoCarga,
  type TopoCargaWithMeta,
} from '@hooks/useTopoCargas';
import type { TopoRow } from '@lib/topoBinding';
import { useTopoCoverageItems } from '@hooks/useTopoCoverage';
import { summarizeTopoCoverage } from '@lib/topoVisibility';
import { TopoCoverageBox } from '@components/topo/TopoCoverageBox';
import PageHeader from '@components/PageHeader';
import { usePageRefresh } from '@hooks/usePageRefresh';
import { TopoCargaModal } from '@components/topo/TopoCargaModal';

function fmtDate(iso: string | null): string {
  if (!iso) return '';
  try { return new Date(iso + 'T12:00:00').toLocaleDateString('es-PE', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }); }
  catch { return iso; }
}

export default function TopoCargasPage() {
  const { refreshing, onRefresh } = usePageRefresh();
  const { id: projectId } = useParams<{ id: string }>();
  const { currentUser } = useAuth();
  const { data: projects = [] } = useProjects();
  const project = projects.find((p) => p.id === projectId);
  const { data: flags } = useProjectFlags(projectId);
  const { data: cargas = [], isLoading } = useTopoCargas(projectId);
  const createCarga = useCreateTopoCarga(projectId);
  const updateCarga = useUpdateTopoCarga(projectId);
  const deleteCarga = useDeleteTopoCarga(projectId);

  const canEdit = currentUser?.role === 'CREATOR' || currentUser?.role === 'RESIDENT';
  const cols = useMemo(() => (flags ? topoColumns(flags) : []), [flags]);
  const { data: coverageItems = [] } = useTopoCoverageItems(projectId);
  const coverage = useMemo(() => (flags ? summarizeTopoCoverage(coverageItems, flags) : null), [coverageItems, flags]);

  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<TopoCargaWithMeta | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<TopoCargaWithMeta | null>(null);
  const [busy, setBusy] = useState(false);

  // Agrupar por fecha de carga (desc).
  const groups = useMemo(() => {
    const map = new Map<string, TopoCargaWithMeta[]>();
    for (const c of cargas) {
      const k = c.carga_date ?? '—';
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(c);
    }
    return Array.from(map.entries()).sort((a, b) => (a[0] < b[0] ? 1 : -1));
  }, [cargas]);

  const openNew = () => { setEditing(null); setShowModal(true); };
  const openEdit = (c: TopoCargaWithMeta) => { setEditing(c); setShowModal(true); };

  const onSave = async (rows: TopoRow[]) => {
    setBusy(true);
    try {
      if (editing) await updateCarga.mutateAsync({ cargaId: editing.id, rows });
      else await createCarga.mutateAsync({ rows, inputMethod: 'manual', createdById: currentUser?.id ?? null });
      setShowModal(false); setEditing(null);
    } catch (e) { window.alert((e as Error).message); }
    finally { setBusy(false); }
  };

  const doDelete = async () => {
    if (!confirmDelete) return;
    setBusy(true);
    try { await deleteCarga.mutateAsync(confirmDelete.id); setConfirmDelete(null); }
    catch (e) { window.alert((e as Error).message); }
    finally { setBusy(false); }
  };

  if (flags && !isTopoEnabled(flags)) {
    return (
      <div className="min-h-screen bg-surface flex flex-col">
        <PageHeader title="Carga de datos topográficos" subtitle={project?.name} />
        <div className="flex-1 flex flex-col items-center justify-center gap-3 p-8 text-center">
          <Mountain size={40} className="text-[#8896a5]" />
          <p className="text-muted text-sm max-w-sm">El módulo de Carga de datos topográficos está desactivado. Actívalo en Configurar módulos.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface flex flex-col">
      <PageHeader
        title="Carga de datos topográficos"
        subtitle={project?.name}
        crumbs={[{ label: 'Proyectos', href: '/app/projects' }, { label: project?.name ?? '…' }]}
        syncing={isLoading}
        onRefresh={onRefresh}
        refreshing={refreshing}
        rightContent={currentUser?.role === 'CREATOR' ? (
          <Link href={`/app/projects/${projectId}/topo-config`} title="Configuración del módulo topográfico"
            className="w-9 h-9 rounded-lg flex items-center justify-center text-white border border-white/20 hover:bg-white/15 transition">
            <Settings size={15} />
          </Link>
        ) : undefined}
      />

      <div className="flex-1 p-4 flex flex-col gap-4 pb-24 max-w-screen-2xl mx-auto w-full">
        {coverage && <TopoCoverageBox summary={coverage} detailHref={`/app/projects/${projectId}/topo-coverage`} />}
        {isLoading ? (
          <div className="flex items-center gap-2 text-muted text-sm"><Loader2 size={16} className="animate-spin" /> Cargando…</div>
        ) : cargas.length === 0 ? (
          <div className="flex flex-col items-center py-16 gap-3">
            <Mountain size={36} className="text-[#8896a5]" />
            <p className="text-[#8896a5] text-sm">Aún no hay cargas topográficas.</p>
          </div>
        ) : (
          groups.map(([day, items]) => (
            <div key={day} className="flex flex-col gap-2">
              <p className="text-[11px] font-bold text-muted uppercase tracking-wider">{fmtDate(day)}</p>
              {/* grid en PC (v93) */}
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
              {items.map((c) => (
                <div key={c.id} className="h-full bg-white rounded-xl shadow-subtle border border-transparent hover:border-primary/20 transition flex items-center gap-3 p-4">
                  <button onClick={() => canEdit && openEdit(c)} disabled={!canEdit} className="flex-1 min-w-0 flex items-center gap-3 text-left">
                    <div className="w-9 h-9 rounded-md bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <Mountain size={16} className="text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-navy font-bold text-[14px]">{c.carga_code}</p>
                      <p className="text-[11px] text-muted mt-0.5">
                        {c.rowCount} fila{c.rowCount !== 1 ? 's' : ''}
                        {c.input_method === 'csv' ? ' · CSV' : ' · Manual'}
                      </p>
                    </div>
                  </button>
                  {c.pendingCount > 0 && (
                    <span className="flex items-center gap-1 text-[11px] font-bold text-amber-600 bg-amber-50 border border-amber-200 rounded-md px-2 py-1" title="Códigos sin ensayo (se enlazarán cuando existan)">
                      <AlertTriangle size={12} /> {c.pendingCount} pend.
                    </span>
                  )}
                  {canEdit && (
                    <>
                      <button onClick={() => openEdit(c)} title="Editar" className="p-2 rounded-lg text-muted hover:text-navy hover:bg-surface transition"><Pencil size={15} /></button>
                      <button onClick={() => setConfirmDelete(c)} title="Eliminar" className="p-2 rounded-lg text-danger hover:bg-danger/10 transition"><Trash2 size={15} /></button>
                    </>
                  )}
                </div>
              ))}
              </div>
            </div>
          ))
        )}
      </div>

      {canEdit && (
        <div className="fixed bottom-0 left-56 right-0 p-4 bg-gradient-to-t from-surface via-surface to-transparent">
          <button onClick={openNew} className="w-full max-w-md mx-auto flex items-center justify-center gap-2 bg-primary text-white rounded-xl py-3.5 text-sm font-bold hover:bg-navy transition shadow-card">
            <Plus size={16} /> Nueva carga de datos topográficos
          </button>
        </div>
      )}

      {showModal && (
        <TopoCargaModal
          columns={cols}
          initialRows={editing?.rows_json ?? []}
          title={editing ? `Editar ${editing.carga_code}` : 'Nueva carga de datos topográficos'}
          busy={busy}
          onSave={onSave}
          onCancel={() => { setShowModal(false); setEditing(null); }}
        />
      )}

      {confirmDelete && (
        <div className="fixed inset-0 bg-navy/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-modal w-full max-w-sm p-6 flex flex-col gap-3">
            <h3 className="text-navy font-bold text-base">Eliminar carga {confirmDelete.carga_code}</h3>
            <p className="text-sm text-muted">
              Se revertirán las coordenadas topográficas que esta carga escribió en las fichas
              ({confirmDelete.rowCount} fila{confirmDelete.rowCount !== 1 ? 's' : ''}). Esta acción no se puede deshacer.
            </p>
            <div className="flex gap-2 mt-2">
              <button onClick={() => setConfirmDelete(null)} disabled={busy} className="flex-1 border border-border rounded-md py-3 text-sm font-semibold text-muted hover:bg-surface transition">Cancelar</button>
              <button onClick={doDelete} disabled={busy} className="flex-1 bg-danger text-white rounded-md py-3 text-sm font-bold hover:bg-danger/90 transition flex items-center justify-center gap-2 disabled:opacity-50">
                {busy && <Loader2 size={14} className="animate-spin" />} Eliminar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
