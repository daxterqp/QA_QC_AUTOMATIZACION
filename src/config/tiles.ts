export type TilePreset = {
  id: string;
  name: string;
  length: number;   // cm
  width: number;    // cm
  wastePctDefault: number;
  isCustom?: boolean;
};

export const DEFAULT_TILES: TilePreset[] = [
  { id: 'c2020', name: '20 × 20 cm',         length: 20, width: 20, wastePctDefault: 8 },
  { id: 'c3030', name: '30 × 30 cm',         length: 30, width: 30, wastePctDefault: 8 },
  { id: 'c3333', name: '33 × 33 cm',         length: 33, width: 33, wastePctDefault: 8 },
  { id: 'c4040', name: '40 × 40 cm',         length: 40, width: 40, wastePctDefault: 8 },
  { id: 'c4545', name: '45 × 45 cm',         length: 45, width: 45, wastePctDefault: 8 },
  { id: 'c6060', name: '60 × 60 cm',         length: 60, width: 60, wastePctDefault: 8 },
  { id: 'c6030', name: '60 × 30 cm (rect.)', length: 60, width: 30, wastePctDefault: 8 },
];

// Junta (separación entre losetas) más común para porcelanato/cerámica: 2 mm
export const DEFAULT_TILE_JOINT_MM = 2;
export const DEFAULT_TILE_WASTE_PCT = 8;

export const CUSTOM_TILES_STORAGE_KEY = '@scua.customTiles.v1';
