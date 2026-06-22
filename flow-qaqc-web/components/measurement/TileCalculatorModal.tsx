'use client';

import { useEffect, useState } from 'react';
import { X, Check, Plus } from 'lucide-react';
import { calcTilesForFloor, getAllTiles, addCustomTile, type TileCalcState } from '@lib/MetradosService';
import { DEFAULT_TILE_JOINT_MM, DEFAULT_TILE_WASTE_PCT, type TilePreset } from '@lib/config/tiles';
import { useI18n } from '@lib/i18n';

interface Props {
  open: boolean;
  area: number;       // m² (solo polígono)
  initialState?: TileCalcState;
  onSave: (state: TileCalcState) => void;
  onClose: () => void;
}

export function TileCalculatorModal({ open, area, initialState, onSave, onClose }: Props) {
  const { t } = useI18n();
  const [tiles, setTiles] = useState<TilePreset[]>([]);
  const [tileId, setTileId] = useState<string>(initialState?.tileId ?? 'c4545');
  const [jointMm, setJointMm] = useState<string>(String(initialState?.jointMm ?? DEFAULT_TILE_JOINT_MM));
  const [wastePct, setWastePct] = useState<string>(String(initialState?.wastePct ?? DEFAULT_TILE_WASTE_PCT));
  const [showCustom, setShowCustom] = useState(false);
  const [customName, setCustomName] = useState('');
  const [customL, setCustomL] = useState('');
  const [customW, setCustomW] = useState('');

  useEffect(() => { if (open) setTiles(getAllTiles()); }, [open]);

  if (!open) return null;

  const tile = tiles.find(t => t.id === tileId) ?? tiles[0];
  const j = Number(jointMm) || 0;
  const w = Number(wastePct) || 0;
  const calc = tile ? calcTilesForFloor({ floorArea: area, tile, jointMm: j, wastePct: w }) : null;

  const handleSave = () => {
    if (!tile || !calc) return;
    const state: TileCalcState = {
      tileId: tile.id,
      jointMm: j,
      wastePct: w,
      floorArea: area,
      totalTiles: calc.totalTiles,
      perM2: calc.perM2,
      savedAt: Date.now(),
    };
    onSave(state);
  };

  const handleAddCustom = () => {
    const L = Number(customL), W = Number(customW);
    if (!customName.trim() || !L || !W) return;
    const created = addCustomTile({ name: customName.trim(), length: L, width: W, wastePctDefault: 8 });
    setTiles(getAllTiles());
    setTileId(created.id);
    setShowCustom(false);
    setCustomName(''); setCustomL(''); setCustomW('');
  };

  return (
    <div className="fixed inset-0 z-[300] bg-black/50 flex items-end sm:items-center justify-center" onClick={onClose}>
      <div onClick={e => e.stopPropagation()} className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl p-5 flex flex-col gap-3 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h3 className="font-extrabold text-navy text-base">{t('webCMeasure.tile.title')}</h3>
          <button onClick={onClose} className="text-muted hover:text-navy"><X size={18} /></button>
        </div>

        <div>
          <label className="text-[10px] font-bold text-muted uppercase tracking-wider">{t('webCMeasure.tile.label')}</label>
          <select value={tileId} onChange={e => {
            if (e.target.value === '__add__') { setShowCustom(true); return; }
            setTileId(e.target.value);
          }} className="w-full mt-1 border border-border rounded-lg px-3 py-2 text-sm">
            {tiles.map(t => (
              <option key={t.id} value={t.id}>{t.name}{t.isCustom ? ' · custom' : ''}</option>
            ))}
            <option value="__add__">{t('webCMeasure.tile.addCustomOption')}</option>
          </select>
        </div>

        {showCustom && (
          <div className="border border-border rounded-lg p-3 flex flex-col gap-2 bg-surface">
            <p className="text-xs font-bold text-navy">{t('webCMeasure.tile.newCustom')}</p>
            <input value={customName} onChange={e => setCustomName(e.target.value)} placeholder={t('webCMeasure.placeholder.name')} className="border border-border rounded px-2 py-1 text-xs" />
            <div className="grid grid-cols-2 gap-2">
              <input value={customL} onChange={e => setCustomL(e.target.value)} placeholder={t('webCMeasure.placeholder.lengthCm')} className="border border-border rounded px-2 py-1 text-xs" />
              <input value={customW} onChange={e => setCustomW(e.target.value)} placeholder={t('webCMeasure.placeholder.widthCm')} className="border border-border rounded px-2 py-1 text-xs" />
            </div>
            <div className="flex gap-2">
              <button onClick={() => setShowCustom(false)} className="flex-1 py-1.5 rounded border border-border text-xs font-semibold text-muted">{t('common.cancel')}</button>
              <button onClick={handleAddCustom} className="flex-1 py-1.5 rounded bg-primary text-white text-xs font-bold flex items-center justify-center gap-1"><Plus size={11} />{t('tileCalc.add')}</button>
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-[10px] font-bold text-muted uppercase tracking-wider">{t('tileCalc.joint')}</label>
            <input type="number" step="0.5" value={jointMm} onChange={e => setJointMm(e.target.value)} className="w-full mt-1 border border-border rounded-lg px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="text-[10px] font-bold text-muted uppercase tracking-wider">{t('tileCalc.waste')}</label>
            <input type="number" step="1" value={wastePct} onChange={e => setWastePct(e.target.value)} className="w-full mt-1 border border-border rounded-lg px-3 py-2 text-sm" />
          </div>
        </div>

        {calc && (
          <div className="bg-navy text-white rounded-lg p-3 flex flex-col gap-1">
            <p className="text-[10px] font-bold opacity-80 uppercase tracking-wider">{t('webCMeasure.result')}</p>
            <p className="text-xs">{t('webCMeasure.tile.resultArea')} <strong>{area.toFixed(2)} m²</strong></p>
            <p className="text-xs">{t('webCMeasure.tile.resultPerM2')} <strong>{calc.perM2.toFixed(1)}</strong></p>
            <p className="text-lg font-black">{t('webCMeasure.tile.resultTotal', { count: calc.totalTiles.toLocaleString('es-PE') })}</p>
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
