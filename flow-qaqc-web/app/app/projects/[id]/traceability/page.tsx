'use client';

/**
 * Página de Trazabilidad operacional — 5 vistas en tabs internos:
 *   1. Por Sector
 *   2. Línea de tiempo (Gantt simplificado)
 *   3. Resumen consolidado por Sector
 *   4. Por Equipo (con indicadores: utilización, disponibilidad)
 *   5. Por Personal
 *
 * Cross-links: cada cell de equipo/sector navega a la vista correspondiente
 * mediante query params (?eq=… o ?sec=…).
 *
 * Anonimización: respeta `flags.anonymize_traceability` para todas las vistas
 * (decisión #3) sin distinción de rol.
 */

import { useState, useMemo } from 'react';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import { useProjectFlags, useProjects } from '@hooks/useProjects';
import { useI18n } from '@lib/i18n';
import { useTraceability } from '@hooks/useTraceability';
import { AnonymizeMap } from '@lib/anonymize';
import {
  effectiveDurationMs, pausedDurationMs, sumEffective,
  groupBy, groupByEquipmentActivity, computeEquipmentMetrics, fmtHm,
  type SessionWithIntervals,
} from '@lib/traceabilityAggregates';
import PageHeader from '@components/PageHeader';
import { Activity as ActivityIcon, Clock, MapPin, Wrench, Users, BarChart3, AlertTriangle } from 'lucide-react';
import type { Activity } from '@/types';

type TabKey = 'sector' | 'timeline' | 'summary' | 'equipment' | 'personnel';

const TABS: { key: TabKey; labelKey: string; icon: React.ElementType }[] = [
  { key: 'sector',     labelKey: 'webDossier.tabBySector',    icon: MapPin },
  { key: 'timeline',   labelKey: 'webDossier.tabTimeline',    icon: Clock },
  { key: 'summary',    labelKey: 'webDossier.tabSummary',     icon: BarChart3 },
  { key: 'equipment',  labelKey: 'webDossier.tabByEquipment', icon: Wrench },
  { key: 'personnel',  labelKey: 'webDossier.tabByPersonnel', icon: Users },
];

export default function TraceabilityPage() {
  const { id: projectId } = useParams<{ id: string }>();
  const { t } = useI18n();
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialTab = (searchParams.get('tab') as TabKey | null) ?? 'sector';
  const [tab, setTab] = useState<TabKey>(initialTab);
  const [from, setFrom] = useState<string>('');
  const [to, setTo] = useState<string>('');

  const { data: projects = [] } = useProjects();
  const project = projects.find(p => p.id === projectId);
  const { data: flags } = useProjectFlags(projectId);
  // Fix #8.3 — Ambos en hora local del browser (simétricos). Antes `new Date(from)`
  // sin sufijo se interpretaba UTC midnight, mientras `to + 'T23:59:59'` se
  // interpretaba en hora local, generando rangos asimétricos de ±5h en es-PE.
  const fromMs = from ? new Date(from + 'T00:00:00').getTime() : undefined;
  const toMs   = to   ? new Date(to   + 'T23:59:59.999').getTime() : undefined;
  const { data, isLoading } = useTraceability(projectId, { from: fromMs, to: toMs });

  // Disabled flag: rendered as conditional JSX (NO early return) to preserve hook order.
  const moduleDisabled = !!(flags && !flags.traceability_module);

  const sessionsWithIntervals: SessionWithIntervals[] = useMemo(() => {
    if (!data) return [];
    const byId = new Map<string, SessionWithIntervals>();
    for (const s of data.sessions) byId.set(s.id, { session: s, intervals: [] });
    for (const it of data.intervals) {
      const ref = byId.get(it.session_id);
      if (ref) ref.intervals.push(it);
    }
    return Array.from(byId.values());
  }, [data]);

  const anonymize = useMemo(() => new AnonymizeMap({
    enabled: !!flags?.anonymize_traceability,
    sessions: data?.sessions ?? [],
    users: data?.users ?? [],
  }), [flags, data]);

  const equipById = useMemo(() => new Map((data?.equipment ?? []).map(e => [e.id, e])), [data]);
  const actsById = useMemo(() => new Map<string, Activity>((data?.activities ?? []).map(a => [a.id, a])), [data]);
  const sectorsById = useMemo(() => new Map((data?.sectors ?? []).map(s => [s.id, s])), [data]);

  // KPIs globales
  const totalEffective = sumEffective(sessionsWithIntervals);
  const totalSessions = sessionsWithIntervals.length;
  const distinctEquip = new Set(sessionsWithIntervals.map(x => x.session.equipment_id)).size;
  const distinctSectors = new Set(sessionsWithIntervals.map(x => x.session.sector_id).filter(Boolean)).size;

  const goToTab = (k: TabKey, extra?: Record<string, string>) => {
    setTab(k);
    const sp = new URLSearchParams(searchParams.toString());
    sp.set('tab', k);
    Object.entries(extra ?? {}).forEach(([k2, v]) => sp.set(k2, v));
    router.replace(`?${sp.toString()}`);
  };

  if (moduleDisabled) {
    return (
      <div className="flex flex-col min-h-screen bg-surface">
        <PageHeader
          title={t('webDossier.traceTitle')}
          subtitle={project?.name}
          crumbs={[{ label: t('webDossier.crumbProjects'), href: '/app/projects' }, { label: project?.name ?? '…' }]}
        />
        <div className="flex-1 flex items-center justify-center p-8">
          <div className="bg-white p-6 rounded-lg border border-border max-w-md text-center flex flex-col gap-3 items-center">
            <AlertTriangle size={32} className="text-warning" />
            <h2 className="text-base font-bold">{t('webDossier.moduleDisabledTitle')}</h2>
            <p className="text-sm text-textSecondary">
              {t('webDossier.moduleDisabledDescBefore')}
              <strong> {t('webDossier.moduleDisabledConfig')}</strong> {t('webDossier.moduleDisabledDescAfter')}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen bg-surface">
      <PageHeader
        title={t('webDossier.traceTitle')}
        subtitle={project?.name}
        crumbs={[{ label: t('webDossier.crumbProjects'), href: '/app/projects' }, { label: project?.name ?? '…' }]}
      />

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 px-4 py-3">
        <Kpi icon={Clock} label={t('webDossier.kpiHoursWorked')} value={fmtHm(totalEffective)} />
        <Kpi icon={ActivityIcon} label={t('webDossier.kpiSessions')} value={String(totalSessions)} />
        <Kpi icon={Wrench} label={t('webDossier.kpiEquipmentUsed')} value={String(distinctEquip)} />
        <Kpi icon={MapPin} label={t('webDossier.kpiSectors')} value={String(distinctSectors)} />
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-3 px-4 pb-3">
        <label className="text-xs text-textSecondary font-bold uppercase">{t('webDossier.traceFrom')}</label>
        <input type="date" value={from} onChange={e => setFrom(e.target.value)}
          className="border border-border rounded px-2 py-1 text-xs" />
        <label className="text-xs text-textSecondary font-bold uppercase">{t('webDossier.traceTo')}</label>
        <input type="date" value={to} onChange={e => setTo(e.target.value)}
          className="border border-border rounded px-2 py-1 text-xs" />
        {(from || to) && (
          <button onClick={() => { setFrom(''); setTo(''); }} className="text-xs text-primary underline">{t('webDossier.clearLower')}</button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 px-4 border-b border-border overflow-x-auto">
        {TABS.map(tabDef => {
          const Active = tab === tabDef.key;
          const Icon = tabDef.icon;
          return (
            <button key={tabDef.key} onClick={() => goToTab(tabDef.key)}
              className={`flex items-center gap-1 px-3 py-2 text-xs font-bold border-b-2 -mb-px ${Active ? 'border-primary text-primary' : 'border-transparent text-textSecondary hover:text-textPrimary'}`}>
              <Icon size={14} />
              {t(tabDef.labelKey)}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      <div className="flex-1 p-4 overflow-auto">
        {isLoading && <p className="text-sm text-textSecondary">{t('webDossier.loadingEllipsis')}</p>}
        {!isLoading && sessionsWithIntervals.length === 0 && (
          <div className="bg-white border border-border rounded-lg p-8 text-center text-textSecondary">
            {t('webDossier.noSessionsRange')}
          </div>
        )}
        {!isLoading && tab === 'sector'    && <BySectorView swi={sessionsWithIntervals} sectorsById={sectorsById} equipById={equipById} actsById={actsById} anon={anonymize} onDrillEquip={(eqId: string) => goToTab('equipment', { eq: eqId })} />}
        {!isLoading && tab === 'timeline'  && <TimelineView swi={sessionsWithIntervals} equipById={equipById} actsById={actsById} anon={anonymize} />}
        {!isLoading && tab === 'summary'   && <SummaryView swi={sessionsWithIntervals} sectorsById={sectorsById} equipById={equipById} actsById={actsById} onDrillEquip={(eqId: string) => goToTab('equipment', { eq: eqId })} onDrillSector={(secId: string) => goToTab('sector', { sec: secId })} />}
        {!isLoading && tab === 'equipment' && <ByEquipmentView swi={sessionsWithIntervals} equipById={equipById} actsById={actsById} sectorsById={sectorsById} anon={anonymize} initialEq={searchParams.get('eq')} onDrillSector={(secId: string) => goToTab('sector', { sec: secId })} />}
        {!isLoading && tab === 'personnel' && <ByPersonnelView swi={sessionsWithIntervals} equipById={equipById} sectorsById={sectorsById} anon={anonymize} />}
      </div>
    </div>
  );
}

function Kpi({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string }) {
  return (
    <div className="bg-white rounded-lg border border-border p-3 flex items-center gap-3 shadow-subtle">
      <Icon size={24} className="text-primary" />
      <div>
        <p className="text-[10px] text-textMuted uppercase tracking-wider">{label}</p>
        <p className="text-base font-extrabold text-textPrimary">{value}</p>
      </div>
    </div>
  );
}

// ─── Vista 1: Por sector ────────────────────────────────────────────────────
function BySectorView({ swi, sectorsById, equipById, actsById, anon, onDrillEquip }: any) {
  const { t } = useI18n();
  const grouped = useMemo(() => groupBy<string>(swi, (s: any) => s.sector_id ?? '__none__'), [swi]);
  const bySectorMap = useMemo(() => {
    const m = new Map<string, SessionWithIntervals[]>();
    for (const x of swi as SessionWithIntervals[]) {
      const k = x.session.sector_id ?? '__none__';
      let arr = m.get(k);
      if (!arr) { arr = []; m.set(k, arr); }
      arr.push(x);
    }
    return m;
  }, [swi]);
  return (
    <div className="flex flex-col gap-3">
      {grouped.map(g => {
        const sec = g.key === '__none__' ? null : sectorsById.get(g.key);
        const sessionsHere = bySectorMap.get(g.key) ?? [];
        return (
          <div key={g.key} className="bg-white border border-border rounded-lg p-3">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <MapPin size={16} className="text-primary" />
                <h3 className="text-sm font-bold">{sec?.name ?? t('webDossier.noSector')}</h3>
              </div>
              <div className="flex items-center gap-3 text-xs text-textSecondary">
                <span>{t('webDossier.sessionsCount', { n: g.count })}</span>
                <span className="font-bold text-textPrimary">{fmtHm(g.durationMs)}</span>
              </div>
            </div>
            <table className="w-full text-xs">
              <thead className="text-textMuted">
                <tr><th className="text-left py-1">{t('webDossier.colEquipment')}</th><th className="text-left py-1">{t('webDossier.colActivity')}</th><th className="text-left py-1">{t('webDossier.colTechnician')}</th><th className="text-right py-1">{t('webDossier.colTime')}</th></tr>
              </thead>
              <tbody>
                {sessionsHere.slice(0, 50).map((x: SessionWithIntervals) => {
                  const eq = equipById.get(x.session.equipment_id);
                  const act = actsById.get(x.session.activity_id);
                  const isAutoClosed = (x.session as any).auto_closed === true;
                  return (
                    <tr key={x.session.id} className="border-t border-border">
                      <td className="py-1">
                        <div className="flex items-center gap-1">
                          <button className="text-primary hover:underline text-left" onClick={() => onDrillEquip(x.session.equipment_id)}>
                            {eq ? `${eq.code} — ${eq.name}` : '—'}
                          </button>
                          {isAutoClosed && (
                            <span
                              title={t('webDossier.autoClosedTooltip')}
                              className="inline-flex shrink-0"
                              aria-label={t('webDossier.autoClosedAria')}
                            >
                              <AlertTriangle size={12} className="text-warning" />
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-1 text-textSecondary">{act?.name ?? '—'}</td>
                      <td className="py-1 text-textSecondary">{anon.display(x.session.user_id)}</td>
                      <td className="py-1 text-right font-mono">{fmtHm(effectiveDurationMs(x.intervals))}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        );
      })}
    </div>
  );
}

// ─── Vista 2: Timeline ──────────────────────────────────────────────────────
function TimelineView({ swi, equipById, actsById, anon }: any) {
  const { t } = useI18n();
  // Render simple: cada sesión como una barra horizontal por user_id.
  const ordered = [...swi].sort((a: SessionWithIntervals, b: SessionWithIntervals) => a.session.started_at - b.session.started_at);
  if (ordered.length === 0) return null;
  const min = ordered[0].session.started_at;
  // Loop tradicional para evitar stack overflow con miles de sesiones (Math.max(...arr)).
  const nowTs = Date.now();
  let max = -Infinity;
  for (const x of ordered as SessionWithIntervals[]) {
    const e = x.session.ended_at ?? nowTs;
    if (e > max) max = e;
  }
  const span = Math.max(1, max - min);

  // Agrupar por user
  const byUser = new Map<string, SessionWithIntervals[]>();
  for (const x of ordered) {
    const arr = byUser.get(x.session.user_id) ?? [];
    arr.push(x);
    byUser.set(x.session.user_id, arr);
  }

  return (
    <div className="bg-white rounded-lg border border-border p-3 overflow-x-auto">
      <h3 className="text-sm font-bold mb-3">{t('webDossier.timelineTitle', { n: Array.from(byUser.keys()).length })}</h3>
      <div className="flex flex-col gap-2 min-w-[600px]">
        {Array.from(byUser.entries()).map(([uid, sess]) => (
          <div key={uid} className="flex items-center gap-2">
            <span className="text-xs font-bold w-28 truncate">{anon.display(uid)}</span>
            <div className="relative flex-1 h-6 bg-surface rounded">
              {sess.map((x: SessionWithIntervals) => {
                const start = ((x.session.started_at - min) / span) * 100;
                const end = (((x.session.ended_at ?? Date.now()) - min) / span) * 100;
                const safeEnd = Math.max(start, end);
                const w = Math.max(0.4, safeEnd - start);
                const eq = equipById.get(x.session.equipment_id);
                const act = actsById.get(x.session.activity_id);
                const color = act?.kind === 'productive' ? '#2e7d5e' : act?.kind === 'maintenance' ? '#c47d15' : act?.kind === 'transport' ? '#668abc' : '#8896a5';
                return (
                  <div key={x.session.id}
                    title={`${eq?.code ?? ''} · ${act?.name ?? ''} · ${fmtHm(effectiveDurationMs(x.intervals))}`}
                    className="absolute top-0 h-full rounded"
                    style={{ left: `${start}%`, width: `${w}%`, backgroundColor: color, opacity: 0.85 }}
                  />
                );
              })}
            </div>
          </div>
        ))}
      </div>
      <div className="flex gap-3 text-[11px] mt-3 text-textMuted">
        <Legend color="#2e7d5e" label={t('webDossier.legendProductive')} />
        <Legend color="#c47d15" label={t('webDossier.legendMaintenance')} />
        <Legend color="#668abc" label={t('webDossier.legendTransport')} />
        <Legend color="#8896a5" label={t('webDossier.legendOther')} />
      </div>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded" style={{ background: color }} /> {label}</span>;
}

// ─── Vista 3: Resumen ───────────────────────────────────────────────────────
function SummaryView({ swi, sectorsById, equipById, actsById, onDrillEquip, onDrillSector }: any) {
  const { t } = useI18n();
  const eaGroups = useMemo(() => groupByEquipmentActivity(swi), [swi]);
  const sectorGroups = useMemo(() => groupBy<string>(swi, (s: any) => s.sector_id ?? '__none__'), [swi]);
  return (
    <div className="flex flex-col gap-4">
      <div className="bg-white rounded-lg border border-border p-3">
        <h3 className="text-sm font-bold mb-2">{t('webDossier.summaryByEquipActivity')}</h3>
        <table className="w-full text-xs">
          <thead className="text-textMuted">
            <tr><th className="text-left py-1">{t('webDossier.colEquipment')}</th><th className="text-left py-1">{t('webDossier.colActivity')}</th><th className="text-right py-1">{t('webDossier.colSessions')}</th><th className="text-right py-1">{t('webDossier.colTime')}</th></tr>
          </thead>
          <tbody>
            {eaGroups.map(g => {
              const eq = equipById.get(g.equipmentId);
              const act = actsById.get(g.activityId);
              return (
                <tr key={`${g.equipmentId}_${g.activityId}`} className="border-t border-border">
                  <td className="py-1">
                    <button className="text-primary hover:underline" onClick={() => onDrillEquip(g.equipmentId)}>
                      {eq ? `${eq.code} — ${eq.name}` : '—'}
                    </button>
                  </td>
                  <td className="py-1 text-textSecondary">{act?.name ?? '—'} <span className="text-[10px] text-textMuted">[{act?.kind ?? '?'}]</span></td>
                  <td className="py-1 text-right">{g.count}</td>
                  <td className="py-1 text-right font-mono font-bold">{fmtHm(g.durationMs)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="bg-white rounded-lg border border-border p-3">
        <h3 className="text-sm font-bold mb-2">{t('webDossier.summaryBySector')}</h3>
        <table className="w-full text-xs">
          <thead className="text-textMuted">
            <tr><th className="text-left py-1">{t('webDossier.colSector')}</th><th className="text-right py-1">{t('webDossier.colSessions')}</th><th className="text-right py-1">{t('webDossier.colTime')}</th></tr>
          </thead>
          <tbody>
            {sectorGroups.map(g => {
              const sec = g.key === '__none__' ? null : sectorsById.get(g.key);
              return (
                <tr key={g.key} className="border-t border-border">
                  <td className="py-1">
                    <button className="text-primary hover:underline" onClick={() => onDrillSector(g.key)}>
                      {sec?.name ?? t('webDossier.noSector')}
                    </button>
                  </td>
                  <td className="py-1 text-right">{g.count}</td>
                  <td className="py-1 text-right font-mono font-bold">{fmtHm(g.durationMs)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Vista 4: Por equipo ────────────────────────────────────────────────────
function ByEquipmentView({ swi, equipById, actsById, sectorsById, anon, initialEq, onDrillSector }: any) {
  const { t } = useI18n();
  const equipos = useMemo(() => Array.from(equipById.values()) as any[], [equipById]);
  const [selectedId, setSelectedId] = useState<string | null>(initialEq ?? equipos[0]?.id ?? null);
  const { metrics, bySector, autoClosedCount } = useMemo(() => {
    const filtered = swi.filter((x: SessionWithIntervals) => x.session.equipment_id === selectedId);
    return {
      metrics: computeEquipmentMetrics(filtered, actsById),
      bySector: groupBy<string>(filtered, (s: any) => s.sector_id ?? '__none__'),
      autoClosedCount: filtered.filter((x: SessionWithIntervals) => (x.session as any).auto_closed === true).length,
    };
  }, [swi, selectedId, actsById]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        {equipos.map((e: any) => (
          <button key={e.id} onClick={() => setSelectedId(e.id)}
            className={`px-3 py-1.5 text-xs rounded border ${selectedId === e.id ? 'bg-primary text-white border-primary' : 'bg-white border-border text-textSecondary hover:bg-surface'}`}>
            {e.code} — {e.name}
          </button>
        ))}
      </div>
      {selectedId && (
        <>
          {autoClosedCount > 0 && (
            <div className="flex items-center gap-2 bg-yellow-50 border border-yellow-300 text-yellow-900 rounded-lg px-3 py-2 text-xs">
              <AlertTriangle size={14} className="text-warning shrink-0" />
              <span>
                {t('webDossier.autoClosedBanner', { n: autoClosedCount })}
              </span>
            </div>
          )}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Kpi icon={Clock} label={t('webDossier.kpiProductive')} value={fmtHm(metrics.productiveMs)} />
            <Kpi icon={Wrench} label={t('webDossier.kpiMaintenance')} value={fmtHm(metrics.maintenanceMs)} />
            <Kpi icon={ActivityIcon} label={t('webDossier.kpiUtilization')} value={`${Math.round(metrics.utilizationRatio * 100)}%`} />
            <Kpi icon={BarChart3} label={t('webDossier.kpiAvailability')} value={`${Math.round(metrics.operationalAvailability * 100)}%`} />
          </div>
          <div className="bg-white rounded-lg border border-border p-3">
            <h3 className="text-sm font-bold mb-2">{t('webDossier.whereWorked')}</h3>
            <table className="w-full text-xs">
              <thead className="text-textMuted"><tr><th className="text-left py-1">{t('webDossier.colSector')}</th><th className="text-right py-1">{t('webDossier.colSessions')}</th><th className="text-right py-1">{t('webDossier.colTime')}</th></tr></thead>
              <tbody>
                {bySector.map(g => {
                  const sec = g.key === '__none__' ? null : sectorsById.get(g.key);
                  return (
                    <tr key={g.key} className="border-t border-border">
                      <td className="py-1">
                        <button className="text-primary hover:underline" onClick={() => onDrillSector(g.key)}>
                          {sec?.name ?? t('webDossier.noSector')}
                        </button>
                      </td>
                      <td className="py-1 text-right">{g.count}</td>
                      <td className="py-1 text-right font-mono">{fmtHm(g.durationMs)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Vista 5: Por personal ──────────────────────────────────────────────────
function ByPersonnelView({ swi, equipById, sectorsById, anon }: any) {
  const { t } = useI18n();
  const byUser = useMemo(() => {
    const m = new Map<string, SessionWithIntervals[]>();
    for (const x of swi as SessionWithIntervals[]) {
      const arr = m.get(x.session.user_id) ?? [];
      arr.push(x);
      m.set(x.session.user_id, arr);
    }
    return m;
  }, [swi]);
  return (
    <div className="flex flex-col gap-3">
      {Array.from(byUser.entries()).map(([uid, list]) => {
        const total = sumEffective(list);
        const equipSet = new Set(list.map(x => x.session.equipment_id));
        const sectorSet = new Set(list.map(x => x.session.sector_id).filter(Boolean));
        return (
          <div key={uid} className="bg-white rounded-lg border border-border p-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold">{anon.display(uid)}</h3>
              <div className="text-xs text-textSecondary flex gap-4">
                <span>{t('webDossier.sessionsCount', { n: list.length })}</span>
                <span>{t('webDossier.equipmentCount', { n: equipSet.size })}</span>
                <span>{t('webDossier.sectorsCount', { n: sectorSet.size })}</span>
                <span className="font-bold text-textPrimary">{fmtHm(total)}</span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
