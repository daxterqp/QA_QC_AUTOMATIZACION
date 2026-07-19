'use client';

/**
 * SpecialtyBarChart — Barras horizontales apiladas (aprobado/rechazado sobre
 * esperado) por especialidad. Extraído del dashboard (antes duplicado).
 * `compact` reduce labels y altura de barra para el panel derecho.
 * El modal clic-en-barra → lista → audit se conserva intacto.
 */

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useI18n } from '@lib/i18n';
import { cn } from '@lib/utils';
import { DASH_COLORS } from '@lib/dashboardUtils';
import type { Protocol, Location } from '@/types';

export default function SpecialtyBarChart({
  protocols, locations, projectId, compact = false,
}: {
  protocols: Protocol[];
  locations: Location[];
  projectId: string;
  compact?: boolean;
}) {
  const router = useRouter();
  const { t } = useI18n();
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
      <p className="text-xs font-bold text-gray-700">{t('webDash.progressBySpecialty')}</p>
      <div className="flex gap-4 flex-wrap">
        {[
          { color: DASH_COLORS.pending, label: t('webDash.inProgress') },
          { color: DASH_COLORS.success, label: t('webDash.approved') },
          { color: DASH_COLORS.danger,  label: t('webDash.rejected') },
        ].map(({ color, label }) => (
          <div key={label} className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: color }} />
            <span className="text-xs text-gray-500">{label}</span>
          </div>
        ))}
      </div>

      {data.map(({ name, total, approved, rejected }) => {
        const appPct = total > 0 ? Math.min((approved / total) * 100, 100) : 0;
        const rejPct = total > 0 ? Math.min((rejected / total) * 100, 100 - appPct) : 0;
        return (
          <button key={name}
            className="flex items-center gap-3 hover:bg-light rounded-lg p-1.5 -mx-1.5 transition-colors text-left w-full"
            onClick={() => setSpecDetail({ name, items: specProtocols[name] ?? [] })}
          >
            <span className={cn('text-xs text-gray-700 shrink-0 leading-tight', compact ? 'w-20' : 'w-28')}>{name}</span>
            <div className={cn('flex-1 relative rounded overflow-hidden', compact ? 'h-5' : 'h-7')} style={{ backgroundColor: DASH_COLORS.pending }}>
              {approved > 0 && (
                <div className="absolute left-0 top-0 bottom-0 transition-[width,left] duration-300 ease-smooth-in-out"
                  style={{ width: `${appPct}%`, backgroundColor: DASH_COLORS.success }} />
              )}
              {rejected > 0 && (
                <div className="absolute top-0 bottom-0 transition-[width,left] duration-300 ease-smooth-in-out"
                  style={{ left: `${appPct}%`, width: `${rejPct}%`, backgroundColor: DASH_COLORS.danger }} />
              )}
              <span className={cn('absolute right-2 top-1/2 -translate-y-1/2 font-bold text-white drop-shadow', compact ? 'text-[10px]' : 'text-xs')}>
                {approved}/{total}
              </span>
            </div>
          </button>
        );
      })}
      <p className="text-[10px] text-gray-400">{t('webDash.tapBarForDetail')}</p>

      {specDetail && (
        <div className="fixed inset-0 z-50 bg-navy/50 flex items-center justify-center p-4"
          onClick={() => setSpecDetail(null)}>
          <div className="bg-white rounded-2xl w-full max-w-sm p-5 flex flex-col gap-3 shadow-modal"
            onClick={e => e.stopPropagation()}>
            <p className="text-sm font-bold text-gray-900">{t('webDash.specProtocols', { spec: specDetail.name })}</p>
            {specDetail.items.length === 0 ? (
              <p className="text-xs text-gray-400 py-2 text-center">{t('webDash.noSpecProtocols')}</p>
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
                            {p.status === 'APPROVED' ? t('webDash.statusApproved') : t('webDash.statusRejected')}
                          </span>
                        )}
                      </button>
                    );
                  })}
              </div>
            )}
            <button onClick={() => setSpecDetail(null)}
              className="text-xs font-semibold text-primary hover:underline self-end">
              {t('common.close')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
