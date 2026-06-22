'use client';

import { useEffect, useState } from 'react';
import { X, Check, Plus } from 'lucide-react';
import {
  calcBricksForWall, getAllBricks, addCustomBrick, wallAreaFromPerimeter,
  type BrickOrientation, type BrickCalcState,
} from '@lib/MetradosService';
import { DEFAULT_MORTAR_JOINT_CM, DEFAULT_WASTE_PCT, type BrickPreset } from '@lib/config/bricks';
import { useI18n } from '@lib/i18n';

interface Props {
  open: boolean;
  kind: 'polyline' | 'polygon';
  perimeter?: number; // m
  area?: number;      // m²
  initialState?: BrickCalcState;
  onSave: (state: BrickCalcState) => void;
  onClose: () => void;
}

export function BrickCalculatorModal({ open, kind, perimeter, area, initialState, onSave, onClose }: Props) {
  const { t } = useI18n();
  const [bricks, setBricks] = useState<BrickPreset[]>([]);
  const [brickId, setBrickId] = useState<string>(initialState?.brickId ?? 'kk18');
  const [heightM, setHeightM] = useState<string>(String(initialState?.heightM ?? 2.4));
  const [jointCm, setJointCm] = useState<string>(String(initialState?.jointCm ?? DEFAULT_MORTAR_JOINT_CM));
  const [wastePct, setWastePct] = useState<string>(String(initialState?.wastePct ?? DEFAULT_WASTE_PCT));
  const [orientation, setOrientation] = useState<BrickOrientation>(initialState?.orientation ?? 'soga');
  const [showCustom, setShowCustom] = useState(false);
  const [customName, setCustomName] = useState('');
  const [customL, setCustomL] = useState('');
  const [customW, setCustomW] = useState('');
  const [customH, setCustomH] = useState('');

  useEffect(() => { if (open) setBricks(getAllBricks()); }, [open]);

  if (!open) return null;

  const brick = bricks.find(b => b.id === brickId) ?? bricks[0];
  const h = Number(heightM) || 0;
  const j = Number(jointCm) || 0;
  const w = Number(wastePct) || 0;
  const wallArea = kind === 'polyline'
    ? wallAreaFromPerimeter(perimeter ?? 0, h)
    : (area ?? 0);

  const calc = brick ? calcBricksForWall({ wallArea, brick, jointCm: j, wastePct: w, orientation }) : null;

  const handleSave = () => {
    if (!brick || !calc) return;
    const state: BrickCalcState = {
      brickId: brick.id,
      heightM: kind === 'polyline' ? h : undefined,
      jointCm: j,
      wastePct: w,
      orientation,
      totalBricks: calc.totalBricks,
      perM2: calc.perM2,
      wallArea,
      savedAt: Date.now(),
    };
    onSave(state);
  };

  const handleAddCustom = () => {
    const L = Number(customL), W = Number(customW), H = Number(customH);
    if (!customName.trim() || !L || !W || !H) return;
    const created = addCustomBrick({ name: customName.trim(), length: L, width: W, height: H, wastePctDefault: 5 });
    setBricks(getAllBricks());
    setBrickId(created.id);
    setShowCustom(false);
    setCustomName(''); setCustomL(''); setCustomW(''); setCustomH('');
  };

  return (
    <div className="fixed inset-0 z-[300] bg-black/50 flex items-end sm:items-center justify-center" onClick={onClose}>
      <div onClick={e => e.stopPropagation()} className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl p-5 flex flex-col gap-3 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h3 className="font-extrabold text-navy text-base">{t('webCMeasure.brick.title')}</h3>
          <button onClick={onClose} className="text-muted hover:text-navy"><X size={18} /></button>
        </div>

        {/* Selector ladrillo */}
        <div>
          <label className="text-[10px] font-bold text-muted uppercase tracking-wider">{t('webCMeasure.brick.label')}</label>
          <select value={brickId} onChange={e => {
            if (e.target.value === '__add__') { setShowCustom(true); return; }
            setBrickId(e.target.value);
          }} className="w-full mt-1 border border-border rounded-lg px-3 py-2 text-sm">
            {bricks.map(b => (
              <option key={b.id} value={b.id}>
                {b.name} ({b.length}×{b.width}×{b.height} cm){b.isCustom ? ' · custom' : ''}
              </option>
            ))}
            <option value="__add__">{t('webCMeasure.brick.addCustomOption')}</option>
          </select>
        </div>

        {showCustom && (
          <div className="border border-border rounded-lg p-3 flex flex-col gap-2 bg-surface">
            <p className="text-xs font-bold text-navy">{t('webCMeasure.brick.newCustom')}</p>
            <input value={customName} onChange={e => setCustomName(e.target.value)} placeholder={t('webCMeasure.placeholder.name')} className="border border-border rounded px-2 py-1 text-xs" />
            <div className="grid grid-cols-3 gap-2">
              <input value={customL} onChange={e => setCustomL(e.target.value)} placeholder={t('webCMeasure.placeholder.lengthCm')} className="border border-border rounded px-2 py-1 text-xs" />
              <input value={customW} onChange={e => setCustomW(e.target.value)} placeholder={t('webCMeasure.placeholder.widthCm')} className="border border-border rounded px-2 py-1 text-xs" />
              <input value={customH} onChange={e => setCustomH(e.target.value)} placeholder={t('webCMeasure.placeholder.heightCm')} className="border border-border rounded px-2 py-1 text-xs" />
            </div>
            <div className="flex gap-2">
              <button onClick={() => setShowCustom(false)} className="flex-1 py-1.5 rounded border border-border text-xs font-semibold text-muted">{t('common.cancel')}</button>
              <button onClick={handleAddCustom} className="flex-1 py-1.5 rounded bg-primary text-white text-xs font-bold flex items-center justify-center gap-1"><Plus size={11} />{t('brickCalc.add')}</button>
            </div>
          </div>
        )}

        {/* Orientación */}
        <div>
          <label className="text-[10px] font-bold text-muted uppercase tracking-wider">{t('webCMeasure.orientation')}</label>
          <div className="flex gap-1.5 mt-1">
            {(['soga', 'cabeza', 'canto'] as BrickOrientation[]).map(o => (
              <button key={o} onClick={() => setOrientation(o)} className={`flex-1 py-1.5 rounded-md text-xs font-bold border transition ${orientation === o ? 'bg-navy text-white border-navy' : 'border-border text-muted hover:text-navy'}`}>
                {t(`webCMeasure.orient.${o}`)}
              </button>
            ))}
          </div>
        </div>

        {/* Inputs */}
        {kind === 'polyline' && (
          <div>
            <label className="text-[10px] font-bold text-muted uppercase tracking-wider">{t('webCMeasure.brick.wallHeight')}</label>
            <input type="number" step="0.01" value={heightM} onChange={e => setHeightM(e.target.value)} className="w-full mt-1 border border-border rounded-lg px-3 py-2 text-sm" />
          </div>
        )}
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-[10px] font-bold text-muted uppercase tracking-wider">{t('brickCalc.joint')}</label>
            <input type="number" step="0.1" value={jointCm} onChange={e => setJointCm(e.target.value)} className="w-full mt-1 border border-border rounded-lg px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="text-[10px] font-bold text-muted uppercase tracking-wider">{t('brickCalc.waste')}</label>
            <input type="number" step="1" value={wastePct} onChange={e => setWastePct(e.target.value)} className="w-full mt-1 border border-border rounded-lg px-3 py-2 text-sm" />
          </div>
        </div>

        {/* Resultado */}
        {calc && (
          <div className="bg-navy text-white rounded-lg p-3 flex flex-col gap-1">
            <p className="text-[10px] font-bold opacity-80 uppercase tracking-wider">{t('webCMeasure.result')}</p>
            <p className="text-xs">{t('webCMeasure.brick.resultWallArea')} <strong>{wallArea.toFixed(2)} m²</strong></p>
            <p className="text-xs">{t('webCMeasure.brick.resultPerM2')} <strong>{calc.perM2.toFixed(1)}</strong></p>
            <p className="text-lg font-black">{t('webCMeasure.brick.resultTotal', { count: calc.totalBricks.toLocaleString('es-PE') })}</p>
          </div>
        )}

        <div className="flex gap-2 pt-1">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-border text-sm font-semibold text-muted hover:bg-surface transition">{t('common.close')}</button>
          <button onClick={handleSave} className="flex-1 py-2.5 rounded-xl bg-success text-white text-sm font-bold hover:bg-success/90 transition flex items-center justify-center gap-2"><Check size={14} />{t('common.save')}</button>
        </div>
      </div>
    </div>
  );
}
