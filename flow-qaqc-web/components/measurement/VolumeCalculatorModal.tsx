'use client';

import { useState } from 'react';
import { X, Check } from 'lucide-react';
import { calcVolume, type VolumeCalcState } from '@lib/MetradosService';
import { useI18n } from '@lib/i18n';

interface Props {
  open: boolean;
  kind: 'polyline' | 'polygon';
  perimeter?: number; // m
  area?: number;      // m²
  initialState?: VolumeCalcState;
  onSave: (state: VolumeCalcState) => void;
  onClose: () => void;
}

export function VolumeCalculatorModal({ open, kind, perimeter, area, initialState, onSave, onClose }: Props) {
  const { t } = useI18n();
  const [heightM, setHeightM] = useState<string>(String(initialState?.heightM ?? 0.3));
  const [thicknessM, setThicknessM] = useState<string>(String(initialState?.thicknessM ?? 0.15));

  if (!open) return null;

  const h = Number(heightM) || 0;
  const th = Number(thicknessM) || 0;
  const totalM3 = kind === 'polygon'
    ? calcVolume({ area, height: h })
    : calcVolume({ perimeter, height: h, thickness: th });

  const handleSave = () => {
    const state: VolumeCalcState = {
      heightM: h,
      thicknessM: kind === 'polyline' ? th : undefined,
      totalM3,
      savedAt: Date.now(),
    };
    onSave(state);
  };

  return (
    <div className="fixed inset-0 z-[300] bg-black/50 flex items-end sm:items-center justify-center" onClick={onClose}>
      <div onClick={e => e.stopPropagation()} className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl p-5 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h3 className="font-extrabold text-navy text-base">{t('webCMeasure.volume.title')}</h3>
          <button onClick={onClose} className="text-muted hover:text-navy"><X size={18} /></button>
        </div>

        <p className="text-xs text-muted">
          {kind === 'polygon'
            ? t('webCMeasure.volume.descPolygon')
            : t('webCMeasure.volume.descPolyline')}
        </p>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-[10px] font-bold text-muted uppercase tracking-wider">{t('webCMeasure.volume.height')}</label>
            <input type="number" step="0.01" value={heightM} onChange={e => setHeightM(e.target.value)} className="w-full mt-1 border border-border rounded-lg px-3 py-2 text-sm" />
          </div>
          {kind === 'polyline' && (
            <div>
              <label className="text-[10px] font-bold text-muted uppercase tracking-wider">{t('webCMeasure.volume.thickness')}</label>
              <input type="number" step="0.01" value={thicknessM} onChange={e => setThicknessM(e.target.value)} className="w-full mt-1 border border-border rounded-lg px-3 py-2 text-sm" />
            </div>
          )}
        </div>

        <div className="bg-navy text-white rounded-lg p-3 flex flex-col gap-1">
          <p className="text-[10px] font-bold opacity-80 uppercase tracking-wider">{t('webCMeasure.result')}</p>
          {kind === 'polygon'
            ? <p className="text-xs">{t('webCMeasure.volume.resultArea')} <strong>{(area ?? 0).toFixed(2)} m²</strong> × {h} m</p>
            : <p className="text-xs">{t('webCMeasure.volume.resultPerimeter')} <strong>{(perimeter ?? 0).toFixed(2)} m</strong> × {h} m × {th} m</p>}
          <p className="text-lg font-black">{totalM3.toFixed(2)} m³</p>
        </div>

        <div className="flex gap-2 pt-1">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-border text-sm font-semibold text-muted hover:bg-surface transition">{t('common.close')}</button>
          <button onClick={handleSave} className="flex-1 py-2.5 rounded-xl bg-success text-white text-sm font-bold hover:bg-success/90 transition flex items-center justify-center gap-2"><Check size={14} />{t('common.save')}</button>
        </div>
      </div>
    </div>
  );
}
