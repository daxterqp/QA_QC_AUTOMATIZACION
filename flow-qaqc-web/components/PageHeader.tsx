'use client';

import { useRouter } from 'next/navigation';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { cn } from '@lib/utils';

interface Crumb { label: string; href?: string }

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  crumbs?: Crumb[];
  syncing?: boolean;
  rightContent?: React.ReactNode;
}

export default function PageHeader({
  title, subtitle, crumbs, syncing, rightContent,
}: PageHeaderProps) {
  const router = useRouter();

  return (
    <div className="bg-navy px-6 pt-5 pb-4 flex flex-col gap-1">
      {/* Breadcrumb */}
      {crumbs && crumbs.length > 0 && (
        <div className="flex items-center gap-1 mb-1">
          <button
            onClick={() => router.back()}
            className="flex items-center gap-1 text-light/70 hover:text-white transition text-[11px] font-semibold"
          >
            <ArrowLeft size={12} />
            Volver
          </button>
          {crumbs.map((c, i) => (
            <span key={i} className="flex items-center gap-1">
              <span className="text-light/40 text-[10px]">/</span>
              {c.href ? (
                <a href={c.href} className="text-light/70 hover:text-white text-[11px] font-semibold transition">
                  {c.label}
                </a>
              ) : (
                <span className="text-light/70 text-[11px] font-semibold">{c.label}</span>
              )}
            </span>
          ))}
        </div>
      )}

      {/* Title row */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex-1 min-w-0">
          <h1 className="text-white text-lg font-black tracking-wide truncate leading-tight">{title}</h1>
          {(subtitle || syncing) && (
            <p className="text-light/80 text-xs mt-0.5 flex items-center gap-1.5">
              {syncing && <Loader2 size={11} className="animate-spin" />}
              {syncing ? 'Sincronizando...' : subtitle}
            </p>
          )}
        </div>
        {rightContent && (
          <div className="flex items-center gap-2 flex-shrink-0">{rightContent}</div>
        )}
      </div>
    </div>
  );
}
