'use client';

/**
 * KpiTile — Tarjeta KPI con número protagonista (estilo Power BI). El número
 * SIEMPRE va en tinta de texto (navy) — el tono solo colorea la burbuja del
 * ícono; la identidad la lleva el label, no el color.
 */

import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@lib/utils';

export type KpiTone = 'default' | 'success' | 'danger' | 'warning';

const TONE_CLASSES: Record<KpiTone, string> = {
  default: 'bg-light text-primary',
  success: 'bg-success/10 text-success',
  danger: 'bg-danger/10 text-danger',
  warning: 'bg-warning/10 text-warning',
};

export default function KpiTile({
  label, value, icon: Icon, tone = 'default', sub, href,
}: {
  label: string;
  value: string | number;
  icon: LucideIcon;
  tone?: KpiTone;
  sub?: string;
  href?: string;
}) {
  const card = (
    <div className={cn(
      'bg-white rounded-xl shadow-subtle p-4 flex items-start justify-between gap-2 h-full',
      href && 'hover:shadow-card transition-shadow cursor-pointer',
    )}>
      <div className="min-w-0 flex flex-col">
        <p className="text-[11px] uppercase tracking-wide text-gray-500 font-semibold leading-tight">{label}</p>
        <p className="text-2xl xl:text-3xl font-extrabold text-navy leading-tight mt-1">{value}</p>
        {sub && <p className="text-[11px] text-gray-400 mt-0.5 leading-tight">{sub}</p>}
      </div>
      <div className={cn('w-9 h-9 rounded-full flex items-center justify-center shrink-0', TONE_CLASSES[tone])}>
        <Icon className="w-4 h-4" />
      </div>
    </div>
  );
  return href ? <Link href={href} className="block h-full">{card}</Link> : card;
}
