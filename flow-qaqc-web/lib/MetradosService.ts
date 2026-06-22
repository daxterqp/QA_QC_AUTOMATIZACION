import {
  BrickPreset,
  DEFAULT_BRICKS,
  CUSTOM_BRICKS_STORAGE_KEY,
} from './config/bricks';
import {
  TilePreset,
  DEFAULT_TILES,
  CUSTOM_TILES_STORAGE_KEY,
} from './config/tiles';

export type BrickOrientation = 'soga' | 'cabeza' | 'canto';

export function brickFaceDims(b: BrickPreset, o: BrickOrientation): { width: number; height: number } {
  switch (o) {
    case 'cabeza': return { width: b.width,  height: b.height };
    case 'canto':  return { width: b.length, height: b.width  };
    case 'soga':
    default:       return { width: b.length, height: b.height };
  }
}

export function bricksPerSquareMeter(b: BrickPreset, jointCm: number, orientation: BrickOrientation = 'soga'): number {
  const face = brickFaceDims(b, orientation);
  const a = ((face.width + jointCm) * (face.height + jointCm)) / 10000;
  return 1 / a;
}

export function calcBricksForWall(params: {
  wallArea: number;
  brick: BrickPreset;
  jointCm: number;
  wastePct: number;
  orientation?: BrickOrientation;
}) {
  const orientation = params.orientation ?? 'soga';
  const perM2 = bricksPerSquareMeter(params.brick, params.jointCm, orientation);
  const base = params.wallArea * perM2;
  const total = Math.ceil(base * (1 + params.wastePct / 100));
  return { perM2, baseBricks: base, totalBricks: total, orientation };
}

export function wallAreaFromPerimeter(perimeterM: number, heightM: number): number {
  return perimeterM * heightM;
}

export function calcVolume(params: {
  area?: number;
  perimeter?: number;
  height: number;
  thickness?: number;
}): number {
  if (params.area != null) return params.area * params.height;
  if (params.perimeter != null && params.thickness != null) {
    return params.perimeter * params.height * params.thickness;
  }
  return 0;
}

// ── localStorage helpers (web) ───────────────────────────────────────────────
const safeLS = {
  get: (k: string) => (typeof window === 'undefined' ? null : window.localStorage.getItem(k)),
  set: (k: string, v: string) => { if (typeof window !== 'undefined') window.localStorage.setItem(k, v); },
};

export function loadCustomBricks(): BrickPreset[] {
  try {
    const raw = safeLS.get(CUSTOM_BRICKS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as BrickPreset[];
    return parsed.map((b) => ({ ...b, isCustom: true }));
  } catch {
    return [];
  }
}

export function saveCustomBricks(bricks: BrickPreset[]) {
  safeLS.set(CUSTOM_BRICKS_STORAGE_KEY, JSON.stringify(bricks.filter((b) => b.isCustom)));
}

export function addCustomBrick(brick: Omit<BrickPreset, 'id' | 'isCustom'>): BrickPreset {
  const list = loadCustomBricks();
  const id = `custom-${Date.now()}`;
  const newBrick: BrickPreset = { ...brick, id, isCustom: true };
  saveCustomBricks([...list, newBrick]);
  return newBrick;
}

export function removeCustomBrick(id: string) {
  const list = loadCustomBricks();
  saveCustomBricks(list.filter((b) => b.id !== id));
}

export function getAllBricks(): BrickPreset[] {
  return [...DEFAULT_BRICKS, ...loadCustomBricks()];
}

// ── Tiles ────────────────────────────────────────────────────────────────────
export function tilesPerSquareMeter(t: TilePreset, jointMm: number): number {
  const jointCm = jointMm / 10;
  const a = ((t.length + jointCm) * (t.width + jointCm)) / 10000;
  return 1 / a;
}

export function calcTilesForFloor(params: {
  floorArea: number;
  tile: TilePreset;
  jointMm: number;
  wastePct: number;
}) {
  const perM2 = tilesPerSquareMeter(params.tile, params.jointMm);
  const base = params.floorArea * perM2;
  const total = Math.ceil(base * (1 + params.wastePct / 100));
  return { perM2, baseTiles: base, totalTiles: total };
}

export function loadCustomTiles(): TilePreset[] {
  try {
    const raw = safeLS.get(CUSTOM_TILES_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as TilePreset[];
    return parsed.map((t) => ({ ...t, isCustom: true }));
  } catch {
    return [];
  }
}

export function saveCustomTiles(tiles: TilePreset[]) {
  safeLS.set(CUSTOM_TILES_STORAGE_KEY, JSON.stringify(tiles.filter((t) => t.isCustom)));
}

export function addCustomTile(tile: Omit<TilePreset, 'id' | 'isCustom'>): TilePreset {
  const list = loadCustomTiles();
  const id = `custom-${Date.now()}`;
  const newTile: TilePreset = { ...tile, id, isCustom: true };
  saveCustomTiles([...list, newTile]);
  return newTile;
}

export function removeCustomTile(id: string) {
  const list = loadCustomTiles();
  saveCustomTiles(list.filter((t) => t.id !== id));
}

export function getAllTiles(): TilePreset[] {
  return [...DEFAULT_TILES, ...loadCustomTiles()];
}

// ── Tipos de estado persistido ───────────────────────────────────────────────

export type TileCalcState = {
  tileId: string;
  jointMm: number;
  wastePct: number;
  floorArea: number;
  totalTiles: number;
  perM2: number;
  savedAt: number;
};

export type BrickCalcState = {
  brickId: string;
  heightM?: number;
  jointCm: number;
  wastePct: number;
  orientation?: BrickOrientation;
  totalBricks: number;
  perM2: number;
  wallArea: number;
  savedAt: number;
};

export type VolumeCalcState = {
  heightM: number;
  thicknessM?: number;
  totalM3: number;
  savedAt: number;
};

export type CalcState = {
  bricks?: BrickCalcState;
  volume?: VolumeCalcState;
  tiles?: TileCalcState;
};

// ── Evaluador seguro de expresiones ──────────────────────────────────────────
const ALLOWED_EXPR = /^[0-9+\-*/().,\s×÷−]+$/;

export function safeEval(expression: string): number | null {
  const trimmed = expression.trim();
  if (!trimmed) return null;
  if (!ALLOWED_EXPR.test(trimmed)) return null;
  const normalized = trimmed
    .replace(/×/g, '*')
    .replace(/÷/g, '/')
    .replace(/−/g, '-')
    .replace(/,/g, '.');
  try {
    // eslint-disable-next-line no-new-func
    const fn = new Function(`"use strict"; return (${normalized});`);
    const result = fn();
    if (typeof result !== 'number' || !isFinite(result)) return null;
    return result;
  } catch {
    return null;
  }
}
