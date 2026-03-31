'use client';

import { useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
} from 'recharts';
import { Loader2, Pencil, Trash2, Plus } from 'lucide-react';
import PageHeader from '@components/PageHeader';
import { useProjects } from '@hooks/useProjects';
import {
  useHistoricalProtocols,
  useHistoricalLocations,
  useHistoricalAnnotations,
  useDashboardNotes,
  useAddDashboardNote,
  useUpdateDashboardNote,
  useDeleteDashboardNote,
  useUsersMap,
} from '@hooks/useHistorical';
import { useAuth } from '@lib/auth-context';
import { cn } from '@lib/utils';
import type { Protocol, Location, PlanAnnotation, DashboardNote } from '@/types';

// ── Colors ────────────────────────────────────────────────────────────────────
const C = {
  success: '#22a45d',
  danger: '#e53e3e',
  primary: '#394e7d',
  warning: '#e37400',
  secondary: '#536b9e',
  pending: '#c8d0db',
};

// ── Week boundaries ───────────────────────────────────────────────────────────
function getWeekBoundaries(projectStart: Date): Array<{ start: number; end: number }> {
  const now = Date.now();
  const day = projectStart.getDay();
  const daysToSunday = day === 0 ? 0 : 7 - day;
  const week1End = new Date(projectStart);
  week1End.setDate(projectStart.getDate() + daysToSunday);
  week1End.setHours(23, 59, 59, 999);

  const weeks: Array<{ start: number; end: number }> = [
    { start: projectStart.getTime(), end: week1End.getTime() },
  ];

  let wkStart = new Date(week1End.getTime() + 1);
  wkStart.setHours(0, 0, 0, 0);
  while (wkStart.getTime() <= now) {
    const wkEnd = new Date(wkStart);
    wkEnd.setDate(wkStart.getDate() + 6);
    wkEnd.setHours(23, 59, 59, 999);
    weeks.push({ start: wkStart.getTime(), end: wkEnd.getTime() });
    wkStart = new Date(wkEnd.getTime() + 1);
    wkStart.setHours(0, 0, 0, 0);
  }
  return weeks;
}

// ── Proportion bar card ───────────────────────────────────────────────────────
function AnalysisCard({
  title, a, b, labelA, labelB, colorA, colorB, href,
}: {
  title: string; a: number; b: number;
  labelA: string; labelB: string; colorA: string; colorB: string;
  href?: string;
}) {
  const router = useRouter();
  const total = a + b;
  const pctA = total > 0 ? Math.round((a / total) * 100) : 0;
  const pctB = 100 - pctA;

  return (
    <div
      className={cn('bg-white rounded-xl shadow-subtle p-4 flex flex-col gap-3', href && 'cursor-pointer hover:shadow-card transition-shadow')}
      onClick={href ? () => router.push(href) : undefined}
    >
      <p className="text-xs font-bold text-gray-700">{title}</p>
      {href && <p className="text-[10px] text-gray-400 -mt-2">Toca para ver detalle</p>}

      {total === 0 ? (
        <p className="text-xs text-gray-400 text-center py-2">Sin datos</p>
      ) : (
        <>
          {/* proportion bar */}
          <div className="flex h-7 rounded-md overflow-hidden w-full">
            <div
              className="flex items-center justify-center text-white text-[11px] font-bold transition-all"
              style={{ width: `${Math.max(pctA, 1)}%`, backgroundColor: colorA }}
            >
              {pctA >= 15 ? `${pctA}%` : ''}
            </div>
            <div
              className="flex items-center justify-center text-white text-[11px] font-bold transition-all"
              style={{ width: `${Math.max(pctB, 1)}%`, backgroundColor: colorB }}
            >
              {pctB >= 15 ? `${pctB}%` : ''}
            </div>
          </div>
          {/* legend */}
          <div className="flex gap-4">
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: colorA }} />
              <span className="text-xs text-gray-600">{labelA}: <strong>{a}</strong></span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: colorB }} />
              <span className="text-xs text-gray-600">{labelB}: <strong>{b}</strong></span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ── Weekly bar chart ──────────────────────────────────────────────────────────
function WeeklyBarChart({
  protocols, projectStart, locMap, projectId,
}: {
  protocols: Protocol[];
  projectStart: Date;
  locMap: Record<string, Location>;
  projectId: string;
}) {
  const router = useRouter();
  const [specialty, setSpecialty] = useState('');
  const [weekDetail, setWeekDetail] = useState<{ label: string; items: Protocol[] } | null>(null);

  const specialties = useMemo(() => {
    return Array.from(new Set(Object.values(locMap).map(l => l.specialty).filter(Boolean) as string[]));
  }, [locMap]);

  const filteredLocIds = useMemo(() => {
    if (!specialty) return null;
    return new Set(Object.values(locMap).filter(l => l.specialty === specialty).map(l => l.id));
  }, [locMap, specialty]);

  const filteredProtocols = useMemo(() =>
    filteredLocIds
      ? protocols.filter(p => p.location_id != null && filteredLocIds.has(p.location_id))
      : protocols
  , [protocols, filteredLocIds]);

  const weeks = useMemo(() => getWeekBoundaries(projectStart), [projectStart]);

  const weekData = useMemo(() =>
    weeks.map(({ start, end }, i) => {
      const items = filteredProtocols.filter(p => {
        if (p.status !== 'APPROVED') return false;
        const ts = p.signed_at ? new Date(p.signed_at).getTime() : new Date(p.updated_at).getTime();
        return ts >= start && ts <= end;
      });
      return { name: `S${i + 1}`, count: items.length, items };
    })
  , [filteredProtocols, weeks]);

  const totalLocCount = useMemo(() => {
    const locs = filteredLocIds
      ? Object.values(locMap).filter(l => filteredLocIds.has(l.id))
      : Object.values(locMap);
    return locs.reduce((sum, l) => {
      const n = l.template_ids ? l.template_ids.split(',').filter(s => s.trim()).length : 0;
      return sum + n;
    }, 0);
  }, [locMap, filteredLocIds]);

  const approvedTotal = filteredProtocols.filter(p => p.status === 'APPROVED').length;

  return (
    <div className="bg-white rounded-xl shadow-subtle p-4 flex flex-col gap-3">
      {/* header */}
      <div className="flex items-center justify-between">
        <p className="text-xs font-bold text-gray-700">Avance semanal</p>
        <span className="text-xs font-bold text-primary bg-light px-2.5 py-1 rounded-full">
          {approvedTotal}/{totalLocCount} completados
        </span>
      </div>

      {/* specialty filter */}
      {specialties.length > 0 && (
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => setSpecialty('')}
            className={cn('px-3 py-1 rounded-full text-xs font-semibold border transition-colors',
              !specialty ? 'bg-primary text-white border-primary' : 'bg-white text-gray-600 border-border hover:bg-light')}
          >
            Todas
          </button>
          {specialties.map(sp => (
            <button key={sp} onClick={() => setSpecialty(sp)}
              className={cn('px-3 py-1 rounded-full text-xs font-semibold border transition-colors',
                specialty === sp ? 'bg-primary text-white border-primary' : 'bg-white text-gray-600 border-border hover:bg-light')}
            >
              {sp}
            </button>
          ))}
        </div>
      )}

      {/* chart */}
      <div className="w-full overflow-x-auto">
        <div style={{ minWidth: Math.max(weekData.length * 50, 300) }}>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={weekData} margin={{ top: 10, right: 8, left: -20, bottom: 0 }}
              onClick={(d: any) => {
                if (!d?.activePayload?.[0]) return;
                const entry = d.activePayload[0].payload as { name: string; items: Protocol[] };
                setWeekDetail({ label: entry.name, items: entry.items });
              }}
            >
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#6b7280' }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: '#9ca3af' }} />
              <Tooltip
                contentStyle={{ fontSize: 12, borderRadius: 8 }}
                formatter={(v) => [v, 'Aprobados']}
              />
              <Bar dataKey="count" radius={[4, 4, 0, 0]} cursor="pointer">
                {weekData.map((_, i) => (
                  <Cell key={i} fill={C.primary} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* week detail modal */}
      {weekDetail && (
        <div className="fixed inset-0 z-50 bg-navy/50 flex items-center justify-center p-4"
          onClick={() => setWeekDetail(null)}>
          <div className="bg-white rounded-2xl w-full max-w-sm p-5 flex flex-col gap-3 shadow-modal"
            onClick={e => e.stopPropagation()}>
            <p className="text-sm font-bold text-gray-900">{weekDetail.label} — Protocolos aprobados</p>
            {weekDetail.items.length === 0 ? (
              <p className="text-xs text-gray-400 py-2 text-center">Sin protocolos aprobados esta semana.</p>
            ) : (
              <div className="flex flex-col gap-1 max-h-72 overflow-y-auto">
                {weekDetail.items.map((p, idx) => {
                  const loc = p.location_id ? locMap[p.location_id] : null;
                  const ts = p.signed_at ?? p.updated_at;
                  return (
                    <button key={p.id}
                      className="flex items-center gap-2 py-2 px-1 rounded-lg hover:bg-light text-left transition-colors"
                      onClick={() => { setWeekDetail(null); router.push(`/app/projects/${projectId}/protocols/${p.id}/audit`); }}
                    >
                      <span className="text-xs text-gray-400 w-5 shrink-0">{idx + 1}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold text-primary">{p.protocol_number ?? p.id}</p>
                        {loc && <p className="text-[11px] text-gray-500 truncate">{loc.name}</p>}
                        <p className="text-[11px] text-gray-400">{new Date(ts).toLocaleDateString('es-PE')}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
            <button onClick={() => setWeekDetail(null)}
              className="text-xs font-semibold text-primary hover:underline self-end">
              Cerrar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Specialty bar chart ───────────────────────────────────────────────────────
function SpecialtyBarChart({
  protocols, locations, projectId,
}: {
  protocols: Protocol[];
  locations: Location[];
  projectId: string;
}) {
  const router = useRouter();
  const [specDetail, setSpecDetail] = useState<{ name: string; items: Protocol[] } | null>(null);

  const locSpecMap = useMemo(() => {
    const m: Record<string, string> = {};
    locations.forEach(l => { if (l.specialty) m[l.id] = l.specialty; });
    return m;
  }, [locations]);

  const locNameMap = useMemo(() => {
    const m: Record<string, string> = {};
    locations.forEach(l => { m[l.id] = l.name; });
    return m;
  }, [locations]);

  const specProtocols = useMemo(() => {
    const m: Record<string, Protocol[]> = {};
    protocols.forEach(p => {
      if (!p.location_id) return;
      const sp = locSpecMap[p.location_id];
      if (!sp) return;
      if (!m[sp]) m[sp] = [];
      m[sp].push(p);
    });
    return m;
  }, [protocols, locSpecMap]);

  const data = useMemo(() => {
    const totals: Record<string, number> = {};
    locations.forEach(loc => {
      const sp = loc.specialty?.trim();
      if (!sp) return;
      const n = loc.template_ids ? loc.template_ids.split(',').filter(s => s.trim()).length : 0;
      if (n > 0) totals[sp] = (totals[sp] ?? 0) + n;
    });
    const approved: Record<string, number> = {};
    const rejected: Record<string, number> = {};
    protocols.forEach(p => {
      if (!p.location_id) return;
      const sp = locSpecMap[p.location_id];
      if (!sp) return;
      if (p.status === 'APPROVED') approved[sp] = (approved[sp] ?? 0) + 1;
      if (p.status === 'REJECTED') rejected[sp] = (rejected[sp] ?? 0) + 1;
    });
    return Object.entries(totals)
      .map(([name, total]) => ({ name, total, approved: approved[name] ?? 0, rejected: rejected[name] ?? 0 }))
      .sort((a, b) => b.total - a.total);
  }, [protocols, locations, locSpecMap]);

  if (data.length === 0) return null;

  return (
    <div className="bg-white rounded-xl shadow-subtle p-4 flex flex-col gap-3">
      <p className="text-xs font-bold text-gray-700">Avance por especialidad</p>
      {/* legend */}
      <div className="flex gap-4 flex-wrap">
        {[
          { color: C.pending, label: 'Pendiente' },
          { color: C.success, label: 'Aprobados' },
          { color: C.danger,  label: 'Rechazados' },
        ].map(({ color, label }) => (
          <div key={label} className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: color }} />
            <span className="text-xs text-gray-500">{label}</span>
          </div>
        ))}
      </div>

      {/* rows */}
      {data.map(({ name, total, approved, rejected }) => {
        const appPct = total > 0 ? Math.min((approved / total) * 100, 100) : 0;
        const rejPct = total > 0 ? Math.min((rejected / total) * 100, 100 - appPct) : 0;
        return (
          <button key={name}
            className="flex items-center gap-3 hover:bg-light rounded-lg p-1.5 -mx-1.5 transition-colors text-left w-full"
            onClick={() => setSpecDetail({ name, items: specProtocols[name] ?? [] })}
          >
            <span className="text-xs text-gray-700 w-28 shrink-0 leading-tight">{name}</span>
            <div className="flex-1 relative h-7 rounded overflow-hidden" style={{ backgroundColor: C.pending }}>
              {approved > 0 && (
                <div className="absolute left-0 top-0 bottom-0 transition-all"
                  style={{ width: `${appPct}%`, backgroundColor: C.success }} />
              )}
              {rejected > 0 && (
                <div className="absolute top-0 bottom-0 transition-all"
                  style={{ left: `${appPct}%`, width: `${rejPct}%`, backgroundColor: C.danger }} />
              )}
              <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs font-bold text-white drop-shadow">
                {approved}/{total}
              </span>
            </div>
          </button>
        );
      })}
      <p className="text-[10px] text-gray-400">Toca una barra para ver detalle</p>

      {/* specialty detail modal */}
      {specDetail && (
        <div className="fixed inset-0 z-50 bg-navy/50 flex items-center justify-center p-4"
          onClick={() => setSpecDetail(null)}>
          <div className="bg-white rounded-2xl w-full max-w-sm p-5 flex flex-col gap-3 shadow-modal"
            onClick={e => e.stopPropagation()}>
            <p className="text-sm font-bold text-gray-900">{specDetail.name} — Protocolos</p>
            {specDetail.items.length === 0 ? (
              <p className="text-xs text-gray-400 py-2 text-center">Sin protocolos en esta especialidad.</p>
            ) : (
              <div className="flex flex-col gap-1 max-h-80 overflow-y-auto">
                {[...specDetail.items]
                  .sort((a, b) => {
                    const ord = (s: string) => s === 'APPROVED' ? 0 : s === 'REJECTED' ? 1 : 2;
                    return ord(a.status) - ord(b.status);
                  })
                  .map((p, idx) => {
                    const locName = p.location_id ? locNameMap[p.location_id] : null;
                    return (
                      <button key={p.id}
                        className="flex items-center gap-2 py-2 px-1 rounded-lg hover:bg-light text-left transition-colors w-full"
                        onClick={() => { setSpecDetail(null); router.push(`/app/projects/${projectId}/protocols/${p.id}/audit`); }}
                      >
                        <span className="text-xs text-gray-400 w-5 shrink-0">{idx + 1}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-bold text-primary">{p.protocol_number ?? p.id}</p>
                          {locName && <p className="text-[11px] text-gray-500 truncate">{locName}</p>}
                        </div>
                        {(p.status === 'APPROVED' || p.status === 'REJECTED') && (
                          <span className={cn('text-[10px] font-bold px-2 py-0.5 rounded-full text-white',
                            p.status === 'APPROVED' ? 'bg-success' : 'bg-danger')}>
                            {p.status === 'APPROVED' ? 'Aprobado' : 'Rechazado'}
                          </span>
                        )}
                      </button>
                    );
                  })}
              </div>
            )}
            <button onClick={() => setSpecDetail(null)}
              className="text-xs font-semibold text-primary hover:underline self-end">
              Cerrar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Notes section ─────────────────────────────────────────────────────────────
function NotesSection({ projectId }: { projectId: string }) {
  const { currentUser } = useAuth();
  const { data: notes = [] } = useDashboardNotes(projectId);
  const { data: usersMap = {} } = useUsersMap();
  const addNote = useAddDashboardNote(projectId);
  const updateNote = useUpdateDashboardNote(projectId);
  const deleteNote = useDeleteDashboardNote(projectId);

  const [noteText, setNoteText] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  async function handleAdd() {
    if (!noteText.trim() || !currentUser) return;
    await addNote.mutateAsync({ text: noteText, userId: currentUser.id });
    setNoteText('');
  }

  async function handleUpdate(noteId: string) {
    if (!editingText.trim()) return;
    await updateNote.mutateAsync({ noteId, text: editingText });
    setEditingId(null);
    setEditingText('');
  }

  async function handleDelete(noteId: string) {
    await deleteNote.mutateAsync(noteId);
    setConfirmDeleteId(null);
  }

  return (
    <div className="bg-white rounded-xl shadow-subtle p-4 flex flex-col gap-3">
      <p className="text-xs font-bold text-gray-700">Anotaciones</p>

      {/* input */}
      <div className="flex gap-2 items-end">
        <textarea
          className="flex-1 rounded-lg border border-border bg-surface px-3 py-2 text-sm
                     text-gray-800 placeholder-gray-400 resize-none
                     focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
          rows={2}
          placeholder="Escribe una anotación..."
          value={noteText}
          onChange={e => setNoteText(e.target.value)}
        />
        <button
          disabled={!noteText.trim() || addNote.isPending}
          onClick={handleAdd}
          className="px-3 py-2 rounded-lg bg-primary text-white text-xs font-bold
                     disabled:opacity-40 hover:bg-primary/90 transition-colors flex items-center gap-1"
        >
          {addNote.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
          Guardar
        </button>
      </div>

      {/* list */}
      {notes.length === 0 ? (
        <p className="text-xs text-gray-400 text-center py-2">Sin anotaciones aún.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {notes.map(note => {
            const isOwner = currentUser?.id === note.user_id;
            const isEditing = editingId === note.id;
            return (
              <div key={note.id} className="bg-surface rounded-lg p-3 flex flex-col gap-2">
                {isEditing ? (
                  <>
                    <textarea
                      className="w-full rounded border border-border bg-white px-2.5 py-2 text-sm
                                 text-gray-800 resize-none focus:outline-none focus:ring-1 focus:ring-primary/30"
                      rows={3}
                      value={editingText}
                      onChange={e => setEditingText(e.target.value)}
                      autoFocus
                    />
                    <div className="flex gap-2 justify-end">
                      <button onClick={() => { setEditingId(null); setEditingText(''); }}
                        className="text-xs text-gray-500 hover:text-gray-700 font-semibold">
                        Cancelar
                      </button>
                      <button onClick={() => handleUpdate(note.id)}
                        disabled={!editingText.trim() || updateNote.isPending}
                        className="text-xs text-white bg-primary px-3 py-1.5 rounded-md font-bold
                                   disabled:opacity-40 hover:bg-primary/90 transition-colors">
                        Guardar
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <p className="text-sm text-gray-800 leading-relaxed">{note.text}</p>
                    <div className="flex items-center justify-between">
                      <p className="text-[11px] text-gray-400">
                        {usersMap[note.user_id] ?? '—'} · {new Date(note.created_at).toLocaleString('es-PE')}
                      </p>
                      {isOwner && (
                        <div className="flex gap-3">
                          <button onClick={() => { setEditingId(note.id); setEditingText(note.text); }}
                            className="text-gray-400 hover:text-primary transition-colors">
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => setConfirmDeleteId(note.id)}
                            className="text-gray-400 hover:text-danger transition-colors">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* delete confirm */}
      {confirmDeleteId && (
        <div className="fixed inset-0 z-50 bg-navy/50 flex items-center justify-center p-4"
          onClick={() => setConfirmDeleteId(null)}>
          <div className="bg-white rounded-2xl w-full max-w-xs p-5 flex flex-col gap-4 shadow-modal"
            onClick={e => e.stopPropagation()}>
            <p className="text-sm font-bold text-gray-900">¿Eliminar anotación?</p>
            <p className="text-xs text-gray-500">Esta acción no se puede deshacer.</p>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setConfirmDeleteId(null)}
                className="text-sm text-gray-500 font-semibold">
                Cancelar
              </button>
              <button onClick={() => handleDelete(confirmDeleteId)}
                disabled={deleteNote.isPending}
                className="px-4 py-2 rounded-lg bg-danger text-white text-sm font-bold
                           disabled:opacity-50 hover:bg-red-700 transition-colors">
                Eliminar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function HistoricalPage() {
  const { id: projectId } = useParams<{ id: string }>();

  const { data: projects = [] } = useProjects();
  const { data: protocols = [], isLoading: loadingP } = useHistoricalProtocols(projectId);
  const { data: locations = [], isLoading: loadingL } = useHistoricalLocations(projectId);
  const { data: annotations = [] } = useHistoricalAnnotations(projectId);

  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const project = projects.find(p => p.id === projectId);

  const fromMs = dateFrom ? new Date(dateFrom + 'T00:00:00').getTime() : null;
  const toMs   = dateTo   ? new Date(dateTo   + 'T23:59:59').getTime() : null;

  const filteredProtocols = useMemo(() => {
    if (!fromMs && !toMs) return protocols;
    return protocols.filter(p => {
      const ts = new Date(p.updated_at).getTime();
      if (fromMs && ts < fromMs) return false;
      if (toMs && ts > toMs) return false;
      return true;
    });
  }, [protocols, fromMs, toMs]);

  const filteredAnnotations = useMemo(() => {
    if (!fromMs && !toMs) return annotations;
    return annotations.filter((a: PlanAnnotation) => {
      const ts = new Date(a.created_at).getTime();
      if (fromMs && ts < fromMs) return false;
      if (toMs && ts > toMs) return false;
      return true;
    });
  }, [annotations, fromMs, toMs]);

  const approved  = filteredProtocols.filter(p => p.status === 'APPROVED').length;
  const rejected  = filteredProtocols.filter(p => p.status === 'REJECTED').length;
  const obsOpen   = filteredAnnotations.filter((a: PlanAnnotation) => a.status === 'OPEN').length;
  const obsClosed = filteredAnnotations.filter((a: PlanAnnotation) => a.status === 'CLOSED').length;

  const projectStart = useMemo(() => {
    if (!project) return null;
    const ts = new Date(project.created_at).getTime();
    return ts > 0 ? new Date(ts) : null;
  }, [project]);

  const locMap = useMemo(() => {
    const m: Record<string, Location> = {};
    locations.forEach(l => { m[l.id] = l; });
    return m;
  }, [locations]);

  const isLoading = loadingP || loadingL;

  return (
    <div className="flex flex-col min-h-screen bg-surface">
      <PageHeader
        title="Dashboard"
        subtitle={project?.name}
        crumbs={[
          { label: 'Proyectos', href: '/app/projects' },
          { label: project?.name ?? '…' },
        ]}
        syncing={isLoading}
      />

      <div className="flex-1 max-w-2xl w-full mx-auto px-4 py-5 flex flex-col gap-4">

        {/* ── Date filters ──────────────────────────────────────────────── */}
        <div className="bg-white rounded-xl shadow-subtle p-4 flex flex-col gap-3">
          <p className="text-xs font-bold text-gray-700">Filtros por fecha</p>
          <p className="text-[11px] text-gray-400 -mt-2">Afectan: aprobados/rechazados y observaciones</p>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-xs text-gray-500 font-medium">Fecha inicial</label>
              <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
                className="rounded-lg border border-border bg-surface px-3 py-2 text-sm
                           focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary" />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-gray-500 font-medium">Fecha final</label>
              <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
                className="rounded-lg border border-border bg-surface px-3 py-2 text-sm
                           focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary" />
            </div>
          </div>
          {(dateFrom || dateTo) && (
            <button onClick={() => { setDateFrom(''); setDateTo(''); }}
              className="text-xs text-primary hover:underline self-start font-semibold">
              Limpiar filtros
            </button>
          )}
        </div>

        {/* ── Analysis cards ─────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 gap-3">
          <AnalysisCard
            title="Aprobados vs Rechazados"
            a={approved} b={rejected}
            labelA="Aprobados" labelB="Rechazados"
            colorA={C.success} colorB={C.danger}
            href={`/app/projects/${projectId}/dossier`}
          />
          <AnalysisCard
            title="Obs. Abiertas vs Resueltas"
            a={obsOpen} b={obsClosed}
            labelA="Abiertas" labelB="Resueltas"
            colorA={C.warning} colorB={C.secondary}
          />
        </div>

        {/* ── Weekly bar chart ───────────────────────────────────────────── */}
        {projectStart && (
          <WeeklyBarChart
            protocols={protocols}
            projectStart={projectStart}
            locMap={locMap}
            projectId={projectId}
          />
        )}

        {/* ── Specialty chart ────────────────────────────────────────────── */}
        {locations.length > 0 && (
          <SpecialtyBarChart
            protocols={protocols}
            locations={locations}
            projectId={projectId}
          />
        )}

        {/* ── Notes ─────────────────────────────────────────────────────── */}
        <NotesSection projectId={projectId} />

      </div>
    </div>
  );
}
