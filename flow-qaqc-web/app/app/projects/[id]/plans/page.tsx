'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
  FileText, Plus, ExternalLink, ChevronDown, ChevronRight,
  Ruler, Eye, CloudDownload, Loader2,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import PageHeader from '@components/PageHeader';
import { usePlansList } from '@hooks/usePlanViewer';
import { useProject } from '@hooks/useProjects';
import { useLocations } from '@hooks/useLocations';
import { s3Url } from '@lib/pdfGenerator';
import { cn } from '@lib/utils';
import { specGroupKey, canonicalSpecName, iconForKey } from '@lib/specialtyGroups';
import { useI18n } from '@lib/i18n';
import type { Plan, Location } from '@/types';

type Mode = 'viewer' | 'measure';

export default function PlansPage() {
  const { t } = useI18n();
  const { id: projectId } = useParams<{ id: string }>();
  const search = useSearchParams();
  const initialMode: Mode = search?.get('mode') === 'measure' ? 'measure' : 'viewer';
  const { data: project } = useProject(projectId);
  const { data: plans = [], isLoading, refetch: refetchPlans } = usePlansList(projectId);
  const { data: locations = [] } = useLocations(projectId);

  const [mode, setMode] = useState<Mode>(initialMode);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [syncing, setSyncing] = useState(false);

  // ── Agrupación por especialidad ──────────────────────────────────────────
  const groups = useMemo(() => {
    const locById = new Map<string, Location>();
    for (const l of locations) locById.set(l.id, l);
    const byKey = new Map<string, { originals: string[]; plans: Plan[] }>();
    for (const p of plans) {
      const loc = p.location_id ? locById.get(p.location_id) : null;
      const raw = (loc?.specialty ?? '').toString();
      const k = specGroupKey(raw);
      const entry = byKey.get(k);
      if (entry) {
        entry.plans.push(p);
        if (raw && !entry.originals.includes(raw)) entry.originals.push(raw);
      } else {
        byKey.set(k, { originals: raw ? [raw] : [], plans: [p] });
      }
    }
    const keys = Array.from(byKey.keys()).sort((a, b) => {
      if (a === '') return 1;
      if (b === '') return -1;
      return a.localeCompare(b);
    });
    return keys.map(k => {
      const entry = byKey.get(k)!;
      return {
        key: k,
        specialty: canonicalSpecName(k, entry.originals),
        plans: entry.plans,
      };
    });
  }, [plans, locations]);

  // Por defecto: primer grupo abierto
  useEffect(() => {
    setExpanded(prev => {
      if (Object.keys(prev).length > 0 || groups.length === 0) return prev;
      return { [groups[0].specialty]: true };
    });
  }, [groups]);

  const toggle = (spec: string) => setExpanded(p => ({ ...p, [spec]: !p[spec] }));

  // ── Sincronizar planos (pull S3 + revincular) ────────────────────────────
  const handleSync = async () => {
    if (syncing) return;
    setSyncing(true);
    try {
      const res = await fetch(`/api/plans/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, projectName: project?.name, type: 'pdf' }),
      });
      const data = await res.json().catch(() => ({}));
      const msg = data?.message ?? (res.ok ? t('webProto.synced') : t('webProto.syncError'));
      alert(msg);
      await refetchPlans();
    } catch (e) {
      alert(t('webProto.errorWithMsg', { msg: String(e) }));
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="min-h-screen bg-surface flex flex-col">
      <PageHeader
        title={mode === 'measure' ? t('webProto.plansMeasureTitle') : t('webProto.plansViewerTitle')}
        subtitle={project?.name}
        crumbs={[
          { label: t('webProto.projects'), href: '/app/projects' },
          { label: project?.name ?? '…', href: `/app/projects/${projectId}/locations` },
          { label: t('webProto.plans') },
        ]}
        rightContent={
          <div className="flex items-center gap-2">
            <Link
              href={`/app/projects/${projectId}/file-upload`}
              className="flex items-center gap-1.5 text-xs font-semibold text-white/80 hover:text-white"
            >
              <Plus size={14} />
              {t('webProto.uploadPlan')}
            </Link>
          </div>
        }
      />

      <div className="flex-1 p-4 max-w-4xl mx-auto w-full flex flex-col gap-3">
        {/* Toggle modo + sync */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="inline-flex rounded-lg border border-border bg-white p-0.5">
            {([
              { key: 'viewer',  label: t('webProto.modeView'),    Icon: Eye },
              { key: 'measure', label: t('webProto.modeMeasure'), Icon: Ruler },
            ] as { key: Mode; label: string; Icon: LucideIcon }[]).map(opt => (
              <button
                key={opt.key}
                onClick={() => setMode(opt.key)}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-bold transition',
                  mode === opt.key ? 'bg-navy text-white' : 'text-muted hover:text-navy',
                )}
              >
                <opt.Icon size={13} />
                {opt.label}
              </button>
            ))}
          </div>

          {mode === 'measure' && (
            <button
              onClick={handleSync}
              disabled={syncing}
              className="flex items-center gap-2 px-3 py-2 rounded-lg bg-navy text-white text-xs font-bold hover:bg-navy/90 disabled:opacity-60 transition"
              title={t('webProto.syncPlansTitle')}
            >
              {syncing ? <Loader2 size={13} className="animate-spin" /> : <CloudDownload size={13} />}
              {syncing ? t('webProto.syncing') : t('webProto.syncPlans')}
            </button>
          )}
        </div>

        {/* Listado */}
        {isLoading && (
          <div className="flex items-center justify-center py-20 text-muted text-sm">
            {t('webProto.loadingPlans')}
          </div>
        )}

        {!isLoading && plans.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
            <FileText size={48} className="text-muted opacity-40" />
            <p className="text-muted text-sm">{t('webProto.noPlansYet')}</p>
            <Link
              href={`/app/projects/${projectId}/file-upload`}
              className="text-primary text-sm font-semibold hover:underline"
            >
              {t('webProto.goUploadPlan')}
            </Link>
          </div>
        )}

        {!isLoading && plans.length > 0 && (
          <div className="flex flex-col gap-3">
            {groups.map(group => {
              const isOpen = !!expanded[group.specialty];
              const Icon = iconForKey(group.key);
              return (
                <div key={group.specialty} className="bg-white border border-border rounded-xl overflow-hidden">
                  <button
                    onClick={() => toggle(group.specialty)}
                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-surface transition"
                  >
                    <Icon size={22} className="text-navy flex-shrink-0" />
                    <div className="flex-1 text-left">
                      <p className="font-bold text-navy text-sm">{group.specialty}</p>
                      <p className="text-muted text-xs">{group.plans.length} {group.plans.length === 1 ? t('webProto.planCountOne') : t('webProto.planCountMany')}</p>
                    </div>
                    <span className="text-xs font-black text-muted bg-surface rounded-full w-7 h-7 flex items-center justify-center">
                      {group.plans.length}
                    </span>
                    {isOpen ? <ChevronDown size={18} className="text-muted" /> : <ChevronRight size={18} className="text-muted" />}
                  </button>

                  {isOpen && (
                    <div className="border-t border-border">
                      {group.plans.map(plan => (
                        <div
                          key={plan.id}
                          className="flex items-center gap-3 px-4 py-3 border-b border-border last:border-b-0 hover:bg-surface transition"
                        >
                          <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                            <FileText size={18} className="text-primary" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-semibold text-navy text-sm truncate">{plan.name}</p>
                            <p className="text-muted text-xs mt-0.5">
                              {(plan.file_type?.toUpperCase() ?? 'PDF')} ·{' '}
                              {new Date(plan.created_at).toLocaleDateString('es-CL')}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            {plan.s3_key && (
                              <a
                                href={s3Url(plan.s3_key)}
                                target="_blank"
                                rel="noopener noreferrer"
                                title={t('webProto.openPdfNewTab')}
                                className="p-2 rounded-lg text-muted hover:text-primary hover:bg-primary/10 transition"
                              >
                                <ExternalLink size={15} />
                              </a>
                            )}
                            <Link
                              href={
                                mode === 'measure'
                                  ? `/app/projects/${projectId}/plans/${plan.id}/measure`
                                  : `/app/projects/${projectId}/plans/${plan.id}`
                              }
                              className={cn(
                                'px-3.5 py-2 rounded-lg text-xs font-bold transition flex items-center gap-1.5',
                                plan.s3_key
                                  ? 'bg-primary text-white hover:bg-primary/90'
                                  : 'bg-border text-muted cursor-not-allowed pointer-events-none',
                              )}
                            >
                              {mode === 'measure' ? <Ruler size={12} /> : <Eye size={12} />}
                              {mode === 'measure' ? t('webProto.modeMeasure') : t('webProto.modeView')}
                            </Link>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
