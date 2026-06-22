'use client';

import { ArrowDownCircle, MinusCircle, AlertCircle, Check, X } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { Priority } from '@/types';
import { cn } from '@/lib/utils';
import { useI18n } from '@lib/i18n';

// v46.1 — `labelKey` (i18n) en vez de texto fijo: la etiqueta se resuelve con t() al
// renderizar, así cambia con el idioma. El `key`/identidad de prioridad sigue estable.
export const PRIORITY_META: Record<
  Priority,
  { labelKey: string; color: string; bg: string; Icon: LucideIcon }
> = {
  low:    { labelKey: 'priority.low',    color: '#ffffff', bg: '#1976d2', Icon: ArrowDownCircle },
  medium: { labelKey: 'priority.medium', color: '#ffffff', bg: '#e67e22', Icon: MinusCircle },
  high:   { labelKey: 'priority.high',   color: '#ffffff', bg: '#c0392b', Icon: AlertCircle },
};

export function isPriority(v: unknown): v is Priority {
  return v === 'low' || v === 'medium' || v === 'high';
}

/** Chip compacto de prioridad. Si value es null/undefined muestra "Sin prioridad" tenue. */
export function PriorityChip({
  value,
  size = 'md',
  className,
}: {
  value: Priority | null | undefined;
  size?: 'sm' | 'md';
  className?: string;
}) {
  const { t } = useI18n();
  const small = size === 'sm';
  if (!value || !isPriority(value)) {
    return (
      <span
        className={cn(
          'inline-flex items-center gap-1 rounded-md font-bold tracking-wide',
          small ? 'px-2 py-0.5 text-[10px]' : 'px-2.5 py-1 text-[11px]',
          'bg-[#e6ebf4] text-[#6b7a8c]',
          className
        )}
      >
        {t('priority.none')}
      </span>
    );
  }
  const { labelKey, color, bg, Icon } = PRIORITY_META[value];
  const label = t(labelKey);
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-md font-bold tracking-wide',
        small ? 'px-2 py-0.5 text-[10px]' : 'px-2.5 py-1 text-[11px]',
        className
      )}
      style={{ backgroundColor: bg, color }}
    >
      <Icon size={small ? 11 : 13} />
      {label}
    </span>
  );
}

/** Selector horizontal de 3 botones (+ limpiar). Versión compacta ocupa ancho completo. */
export function PrioritySelector({
  value,
  onChange,
  allowClear = true,
  compact = false,
}: {
  value: Priority | null | undefined;
  onChange: (p: Priority | null) => void;
  allowClear?: boolean;
  compact?: boolean;
}) {
  const { t } = useI18n();
  const options: Priority[] = ['low', 'medium', 'high'];
  return (
    <div className={cn('flex gap-1.5', compact ? 'flex-nowrap' : 'flex-wrap gap-1.5')}>
      {options.map((p) => {
        const meta = PRIORITY_META[p];
        const active = value === p;
        return (
          <button
            key={p}
            type="button"
            onClick={() => onChange(p)}
            className={cn(
              'inline-flex items-center justify-center rounded-md border-[1.5px] font-bold tracking-wide transition',
              compact ? 'flex-1 px-1 py-1 gap-1 text-[11px]' : 'px-3 py-1.5 gap-1.5 text-xs',
            )}
            style={{
              borderColor: meta.bg,
              backgroundColor: active ? meta.bg : 'transparent',
              color: active ? meta.color : meta.bg,
            }}
          >
            <meta.Icon size={compact ? 12 : 14} />
            {t(meta.labelKey)}
          </button>
        );
      })}
      {allowClear && value ? (
        <button
          type="button"
          onClick={() => onChange(null)}
          className={cn(
            'flex items-center justify-center rounded-full border border-[#d4dde8] text-[#6b7a8c] hover:bg-slate-50',
            compact ? 'w-6 h-6' : 'w-7 h-7'
          )}
          aria-label={t('priority.remove')}
        >
          <X size={compact ? 14 : 16} />
        </button>
      ) : null}
    </div>
  );
}

/** Modal bottom-sheet con las 3 prioridades + "Sin prioridad". Se abre con long-press o botón dedicado. */
export function PriorityPickerModal({
  open,
  value,
  onSelect,
  onClose,
  title,
}: {
  open: boolean;
  value: Priority | null | undefined;
  onSelect: (p: Priority | null) => void;
  onClose: () => void;
  title?: string;
}) {
  const { t } = useI18n();
  if (!open) return null;

  const options: Priority[] = ['low', 'medium', 'high'];
  return (
    <div
      className="fixed inset-0 z-50 bg-[rgba(14,33,61,0.45)] flex items-end sm:items-center justify-center"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full sm:max-w-md bg-white rounded-t-2xl sm:rounded-2xl px-5 pt-2 pb-6 shadow-xl"
      >
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-[#d4dde8]" />
        <h3 className="text-base font-extrabold text-[#0e213d] tracking-wide">{title ?? t('priority.modalTitle')}</h3>
        <p className="text-xs text-[#6b7a8c] mt-0.5 mb-3.5">{t('priority.modalSubtitle')}</p>

        <div className="flex flex-col gap-2">
          {options.map((p) => {
            const meta = PRIORITY_META[p];
            const active = value === p;
            return (
              <button
                key={p}
                type="button"
                onClick={() => {
                  onSelect(p);
                  onClose();
                }}
                className="flex items-center gap-2.5 px-3.5 py-3 rounded-xl border-[1.5px] font-bold text-sm tracking-wide transition"
                style={{
                  borderColor: meta.bg,
                  backgroundColor: active ? meta.bg : 'transparent',
                  color: active ? meta.color : meta.bg,
                }}
              >
                <meta.Icon size={20} />
                <span className="flex-1 text-left">{t(meta.labelKey)}</span>
                {active ? <Check size={18} /> : null}
              </button>
            );
          })}

          <button
            type="button"
            onClick={() => {
              onSelect(null);
              onClose();
            }}
            className="flex items-center gap-2.5 px-3.5 py-3 rounded-xl border border-[#d4dde8] text-sm font-semibold text-[#6b7a8c] hover:bg-slate-50"
          >
            <X size={18} />
            <span className="flex-1 text-left">{t('priority.none')}</span>
          </button>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="mt-3.5 w-full py-3 rounded-xl bg-slate-100 text-sm font-bold text-[#0e213d] tracking-wide hover:bg-slate-200"
        >
          {t('common.cancel')}
        </button>
      </div>
    </div>
  );
}
