// Normalización de especialidades portada desde la app móvil.
// Clave: primeras 3 letras sin acentos en minúsculas.

import type { LucideIcon } from 'lucide-react';
import {
  Hammer, Layers, Building2, Zap, Droplet, Wind, Home, Palette, HardHat, Package, FileText,
} from 'lucide-react';

export const CANONICAL_BY_KEY: Record<string, string> = {
  arq: 'ARQUITECTURA',
  cim: 'CIMENTACIÓN',
  est: 'ESTRUCTURAS',
  iie: 'INSTALACIONES ELÉCTRICAS',
  iis: 'INSTALACIONES SANITARIAS',
  iim: 'INSTALACIONES MECÁNICAS',
  hva: 'HVAC',
  aco: 'ACABADOS',
  pin: 'PINTURA',
  car: 'CARPINTERÍA',
  alb: 'ALBAÑILERÍA',
  rev: 'REVOQUES Y REVESTIMIENTOS',
  pis: 'PISOS',
  vid: 'VIDRIERÍA',
  imp: 'IMPERMEABILIZACIÓN',
  cub: 'CUBIERTAS',
  ase: 'ASEO Y LIMPIEZA',
  seg: 'SEGURIDAD',
  mov: 'MOVIMIENTO DE TIERRAS',
  urb: 'URBANISMO',
};

export const ICON_BY_KEY: Record<string, LucideIcon> = {
  arq: Home,
  cim: Layers,
  est: Building2,
  iie: Zap,
  iis: Droplet,
  iim: Wind,
  hva: Wind,
  aco: Palette,
  pin: Palette,
  car: Hammer,
  alb: HardHat,
  rev: Palette,
  pis: Layers,
  vid: FileText,
  imp: Droplet,
  cub: Home,
  ase: Package,
  seg: HardHat,
  mov: Hammer,
  urb: Building2,
};

/** Normaliza un nombre de especialidad a clave de 3 letras minúsculas sin acentos. */
export function specGroupKey(raw: string | null | undefined): string {
  if (!raw) return '';
  const normalized = raw
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z]/g, '');
  return normalized.slice(0, 3) || '';
}

/** Devuelve el nombre canónico. Si no matchea, usa el primer valor original. */
export function canonicalSpecName(key: string, originals: string[]): string {
  const c = CANONICAL_BY_KEY[key];
  if (c) return c;
  if (originals[0]) return originals[0].trim().toUpperCase();
  return 'SIN ESPECIALIDAD';
}

export function iconForKey(key: string): LucideIcon {
  return ICON_BY_KEY[key] ?? FileText;
}
