export type BrickPreset = {
  id: string;
  name: string;
  length: number;
  width: number;
  height: number;
  wastePctDefault: number;
  isCustom?: boolean;
};

export const DEFAULT_BRICKS: BrickPreset[] = [
  { id: 'kk18', name: 'King Kong 18 huecos', length: 23, width: 12.5, height: 9, wastePctDefault: 5 },
  { id: 'pandereta', name: 'Pandereta lisa', length: 23, width: 11, height: 9, wastePctDefault: 5 },
  { id: 'caravista', name: 'Caravista', length: 23, width: 9, height: 5.5, wastePctDefault: 5 },
  { id: 'hueco12', name: 'Hueco 12 (techo/tabique)', length: 30, width: 12, height: 30, wastePctDefault: 5 },
  { id: 'hueco15', name: 'Hueco 15', length: 30, width: 15, height: 30, wastePctDefault: 5 },
  { id: 'hueco20', name: 'Hueco 20', length: 30, width: 20, height: 30, wastePctDefault: 5 },
];

export const DEFAULT_MORTAR_JOINT_CM = 1.5;
export const DEFAULT_WASTE_PCT = 5;

export const CUSTOM_BRICKS_STORAGE_KEY = '@scua.customBricks.v1';
