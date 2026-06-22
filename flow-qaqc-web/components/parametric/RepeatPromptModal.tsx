'use client';

import { useEffect, useState } from 'react';
import type { RepeatDirective } from '@lib/parametricExpand';
import { useI18n } from '@lib/i18n';

interface Props {
  directives: RepeatDirective[];
  onCancel: () => void;
  onConfirm: (choices: Record<string, number>) => void;
}

/** Modal mostrado al crear una instancia de plantilla paramétrica.
 *  Para cada directiva `repeat-[grupo:min:max:default]` pide N entre [min, max]. */
export function RepeatPromptModal({ directives, onCancel, onConfirm }: Props) {
  const { t } = useI18n();
  const [values, setValues] = useState<Record<string, number>>(() => {
    const v: Record<string, number> = {};
    for (const d of directives) v[d.groupId] = d.defaultN;
    return v;
  });

  // Si cambian las directivas (caso raro), resincronizamos defaults.
  useEffect(() => {
    setValues(prev => {
      const next = { ...prev };
      let changed = false;
      for (const d of directives) {
        if (next[d.groupId] == null) { next[d.groupId] = d.defaultN; changed = true; }
      }
      return changed ? next : prev;
    });
  }, [directives]);

  function setOne(groupId: string, raw: string, dir: RepeatDirective) {
    const n = parseInt(raw, 10);
    if (isNaN(n)) return;
    const clamped = Math.min(Math.max(n, dir.min), dir.max);
    setValues(prev => ({ ...prev, [groupId]: clamped }));
  }

  return (
    <div className="fixed inset-0 z-50 bg-navy/50 flex items-end sm:items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-md p-6 flex flex-col gap-4 shadow-modal">
        <div>
          <h3 className="text-base font-bold text-navy">{t('webCMisc.repeat.title')}</h3>
          <p className="text-xs text-textSecondary mt-1">
            {t('webCMisc.repeat.desc')}
          </p>
        </div>

        <div className="flex flex-col gap-3">
          {directives.map(d => (
            <div key={d.groupId} className="flex flex-col gap-1.5">
              <label className="text-[11px] font-extrabold tracking-wider uppercase text-textSecondary">
                {d.groupId}
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  value={values[d.groupId] ?? d.defaultN}
                  min={d.min}
                  max={d.max}
                  step={1}
                  onChange={e => setOne(d.groupId, e.target.value, d)}
                  className="w-24 border border-border rounded-md px-3 py-1.5 text-sm font-bold text-textPrimary focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                />
                <span className="text-xs text-textSecondary">
                  {t('webCMisc.repeat.range', { min: d.min, max: d.max, def: d.defaultN })}
                </span>
              </div>
            </div>
          ))}
        </div>

        <div className="flex gap-3 justify-end pt-2">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm text-textSecondary font-semibold hover:text-textPrimary"
          >
            {t('common.cancel')}
          </button>
          <button
            onClick={() => onConfirm(values)}
            className="px-4 py-2 text-sm font-bold rounded-lg bg-primary text-white hover:bg-primary/90"
          >
            {t('webCMisc.repeat.create')}
          </button>
        </div>
      </div>
    </div>
  );
}
