import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  BrickPreset,
  DEFAULT_BRICKS,
  CUSTOM_BRICKS_STORAGE_KEY,
} from '@config/bricks';
import {
  TilePreset,
  DEFAULT_TILES,
  CUSTOM_TILES_STORAGE_KEY,
} from '@config/tiles';

export type BrickOrientation = 'soga' | 'cabeza' | 'canto';

/**
 * Devuelve las dimensiones de la cara visible del ladrillo en el muro (cm)
 * según la orientación. width=base horizontal, height=altura vertical.
 * - soga:   cara larga — largo×alto  (ladrillo paralelo al muro)
 * - cabeza: cara corta — ancho×alto  (ladrillo perpendicular al muro)
 * - canto:  cara baja  — largo×ancho (ladrillo sobre su lado más fino)
 */
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

export async function loadCustomBricks(): Promise<BrickPreset[]> {
  try {
    const raw = await AsyncStorage.getItem(CUSTOM_BRICKS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as BrickPreset[];
    return parsed.map((b) => ({ ...b, isCustom: true }));
  } catch {
    return [];
  }
}

export async function saveCustomBricks(bricks: BrickPreset[]): Promise<void> {
  await AsyncStorage.setItem(
    CUSTOM_BRICKS_STORAGE_KEY,
    JSON.stringify(bricks.filter((b) => b.isCustom))
  );
}

export async function addCustomBrick(brick: Omit<BrickPreset, 'id' | 'isCustom'>): Promise<BrickPreset> {
  const list = await loadCustomBricks();
  const id = `custom-${Date.now()}`;
  const newBrick: BrickPreset = { ...brick, id, isCustom: true };
  await saveCustomBricks([...list, newBrick]);
  return newBrick;
}

export async function removeCustomBrick(id: string): Promise<void> {
  const list = await loadCustomBricks();
  await saveCustomBricks(list.filter((b) => b.id !== id));
}

export async function getAllBricks(): Promise<BrickPreset[]> {
  const custom = await loadCustomBricks();
  return [...DEFAULT_BRICKS, ...custom];
}

// ── Tiles (losetas) ──────────────────────────────────────────────────────────
export function tilesPerSquareMeter(t: TilePreset, jointMm: number): number {
  const jointCm = jointMm / 10;
  const a = ((t.length + jointCm) * (t.width + jointCm)) / 10000;
  return 1 / a;
}

export function calcTilesForFloor(params: {
  floorArea: number;  // m²
  tile: TilePreset;
  jointMm: number;
  wastePct: number;
}) {
  const perM2 = tilesPerSquareMeter(params.tile, params.jointMm);
  const base = params.floorArea * perM2;
  const total = Math.ceil(base * (1 + params.wastePct / 100));
  return { perM2, baseTiles: base, totalTiles: total };
}

export async function loadCustomTiles(): Promise<TilePreset[]> {
  try {
    const raw = await AsyncStorage.getItem(CUSTOM_TILES_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as TilePreset[];
    return parsed.map((t) => ({ ...t, isCustom: true }));
  } catch {
    return [];
  }
}

export async function saveCustomTiles(tiles: TilePreset[]): Promise<void> {
  await AsyncStorage.setItem(
    CUSTOM_TILES_STORAGE_KEY,
    JSON.stringify(tiles.filter((t) => t.isCustom))
  );
}

export async function addCustomTile(tile: Omit<TilePreset, 'id' | 'isCustom'>): Promise<TilePreset> {
  const list = await loadCustomTiles();
  const id = `custom-${Date.now()}`;
  const newTile: TilePreset = { ...tile, id, isCustom: true };
  await saveCustomTiles([...list, newTile]);
  return newTile;
}

export async function removeCustomTile(id: string): Promise<void> {
  const list = await loadCustomTiles();
  await saveCustomTiles(list.filter((t) => t.id !== id));
}

export async function getAllTiles(): Promise<TilePreset[]> {
  const custom = await loadCustomTiles();
  return [...DEFAULT_TILES, ...custom];
}

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
