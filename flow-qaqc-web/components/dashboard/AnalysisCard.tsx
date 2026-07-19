'use client';

/**
 * AnalysisCard — Tarjeta de proporción A vs B (barra horizontal + leyenda).
 * Extraída del dashboard (antes duplicada en dashboard/page e historical/page).
 */

import { useRouter } from 'next/navigation';
import { useI18n } from '@lib/i18n';
import { cn } from '@lib/utils';

export default function AnalysisCard({
  title, a, b, labelA, labelB, colorA, colorB, href,
}: {
  title: string; a: number; b: number;
  labelA: string; labelB: string; colorA: string; colorB: string;
  href?: string;
}) {
  const router = useRouter();
  const { t } = useI18n();
  const total = a + b;
  const pctA = total > 0 ? Math.round((a / total) * 100) : 0;
  const pctB = 100 - pctA;

  return (
    <div
      className={cn('bg-white rounded-xl shadow-subtle p-4 flex flex-col gap-3', href && 'cursor-pointer hover:shadow-card transition-shadow')}
      onClick={href ? () => router.push(href) : undefined}
    >
      <p className="text-xs font-bold text-gray-700">{title}</p>
      {href && <p className="text-[10px] text-gray-400 -mt-2">{t('webDash.tapForDetail')}</p>}

      {total === 0 ? (
        <p className="text-xs text-gray-400 text-center py-2">{t('webDash.noData')}</p>
      ) : (
        <>
          <div className="flex h-7 rounded-md overflow-hidden w-full">
            <div
              className="flex items-center justify-center text-white text-[11px] font-bold transition-[width,left] duration-300 ease-smooth-in-out"
              style={{ width: `${Math.max(pctA, 1)}%`, backgroundColor: colorA }}
            >
              {pctA >= 15 ? `${pctA}%` : ''}
            </div>
            <div
              className="flex items-center justify-center text-white text-[11px] font-bold transition-[width,left] duration-300 ease-smooth-in-out"
              style={{ width: `${Math.max(pctB, 1)}%`, backgroundColor: colorB }}
            >
              {pctB >= 15 ? `${pctB}%` : ''}
            </div>
          </div>
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
