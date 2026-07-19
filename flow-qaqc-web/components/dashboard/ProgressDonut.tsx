'use client';

/**
 * ProgressDonut — Avance de la obra (aprobados location-bound / esperados) como
 * anillo con el % al centro. Arco en el color del bucket de salud (mismo código
 * de color que las burbujas del portafolio); el número va en tinta navy.
 */

import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';
import { useI18n } from '@lib/i18n';
import { progressBucket, PROGRESS_BUCKET_COLORS } from '@lib/dashboardUtils';

export default function ProgressDonut({
  percent, approvedExpectedLabel, totalExpected,
}: {
  percent: number;
  /** "X de Y esperados" ya formateado por el padre (i18n). */
  approvedExpectedLabel: string;
  totalExpected: number;
}) {
  const { t } = useI18n();
  const pct = Math.max(0, Math.min(100, percent));
  const color = PROGRESS_BUCKET_COLORS[progressBucket(pct, totalExpected)];
  const data = [{ v: pct }, { v: 100 - pct }];

  return (
    <div className="bg-white rounded-xl shadow-subtle p-4 flex flex-col gap-1">
      <p className="text-xs font-bold text-gray-700">{t('webDash.donutTitle')}</p>
      <div className="relative h-[150px]">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data} dataKey="v"
              innerRadius="72%" outerRadius="92%"
              startAngle={90} endAngle={-270}
              stroke="none" isAnimationActive={false}
            >
              <Cell fill={totalExpected > 0 ? color : '#e8edf4'} />
              <Cell fill="#e8edf4" />
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <p className="text-3xl font-extrabold text-navy leading-none">
            {totalExpected > 0 ? `${pct}%` : '—'}
          </p>
          <p className="text-[10px] text-gray-400 mt-1 text-center px-4">{approvedExpectedLabel}</p>
        </div>
      </div>
    </div>
  );
}
