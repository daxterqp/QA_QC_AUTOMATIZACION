'use client';

/**
 * WeeklyBarChart — Barras de protocolos APROBADOS por semana del proyecto.
 * Extraído del dashboard (antes duplicado). Cambios vs la versión embebida:
 *  - Recibe `protocols` YA filtrados por el padre (fecha/especialidad/sector se
 *    controlan en DashboardFilters — los chips internos de especialidad se fueron).
 *  - `totalExpected` viene del padre (fórmula v31 compartida en dashboardUtils).
 *  - `compact` para el panel derecho del layout ancho.
 * El modal clic-en-barra → lista → audit se conserva intacto.
 */

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
} from 'recharts';
import { useI18n } from '@lib/i18n';
import { DASH_COLORS, getWeekBoundaries } from '@lib/dashboardUtils';
import type { Protocol, Location } from '@/types';

export default function WeeklyBarChart({
  protocols, projectStart, locMap, projectId, totalExpected, compact = false,
}: {
  protocols: Protocol[];
  projectStart: Date;
  locMap: Record<string, Location>;
  projectId: string;
  totalExpected: number;
  compact?: boolean;
}) {
  const router = useRouter();
  const { t } = useI18n();
  const [weekDetail, setWeekDetail] = useState<{ label: string; items: Protocol[] } | null>(null);

  const weeks = useMemo(() => getWeekBoundaries(projectStart), [projectStart]);

  const weekData = useMemo(() =>
    weeks.map(({ start, end }, i) => {
      const items = protocols.filter(p => {
        if (p.status !== 'APPROVED') return false;
        const ts = p.signed_at ? new Date(p.signed_at).getTime() : new Date(p.updated_at).getTime();
        return ts >= start && ts <= end;
      });
      return { name: `S${i + 1}`, count: items.length, items };
    })
  , [protocols, weeks]);

  const approvedTotal = protocols.filter(p => p.status === 'APPROVED').length;

  return (
    <div className="bg-white rounded-xl shadow-subtle p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-bold text-gray-700">{t('webDash.weeklyProgress')}</p>
        <span className="text-xs font-bold text-primary bg-light px-2.5 py-1 rounded-full whitespace-nowrap">
          {t('webDash.completedCount', { done: approvedTotal, total: totalExpected })}
        </span>
      </div>

      <div className="w-full overflow-x-auto">
        <div style={{ minWidth: Math.max(weekData.length * (compact ? 40 : 50), compact ? 200 : 300) }}>
          <ResponsiveContainer width="100%" height={compact ? 130 : 160}>
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
                formatter={(v) => [v, t('webDash.approvedTooltip')]}
              />
              <Bar dataKey="count" radius={[4, 4, 0, 0]} cursor="pointer">
                {weekData.map((_, i) => (
                  <Cell key={i} fill={DASH_COLORS.primary} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {weekDetail && (
        <div className="fixed inset-0 z-50 bg-navy/50 flex items-center justify-center p-4"
          onClick={() => setWeekDetail(null)}>
          <div className="bg-white rounded-2xl w-full max-w-sm p-5 flex flex-col gap-3 shadow-modal"
            onClick={e => e.stopPropagation()}>
            <p className="text-sm font-bold text-gray-900">{t('webDash.weekApprovedProtocols', { week: weekDetail.label })}</p>
            {weekDetail.items.length === 0 ? (
              <p className="text-xs text-gray-400 py-2 text-center">{t('webDash.noApprovedThisWeek')}</p>
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
              {t('common.close')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
