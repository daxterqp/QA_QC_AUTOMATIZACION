/**
 * topoVisibility.ts (web) — Espejo EXACTO de src/utils/topoVisibility.ts.
 * Decide qué tarjetas de coordenadas mostrar según los flags del módulo topográfico.
 */
import type { ProjectFeatureFlags } from '@/types';

export interface CoordCardDecision { showGps: boolean; showTopo: boolean }

export function decideCoordCards(
  flags: Pick<ProjectFeatureFlags, 'module_topo' | 'topo_replace_gps' | 'topo_keep_gps_fallback'>,
  hasGps: boolean,
  hasTopo: boolean,
): CoordCardDecision {
  if (!flags.module_topo) return { showGps: true, showTopo: false };

  if (flags.topo_replace_gps) {
    if (flags.topo_keep_gps_fallback) {
      if (hasTopo) return { showGps: false, showTopo: true };
      return hasGps ? { showGps: true, showTopo: false } : { showGps: false, showTopo: true };
    }
    return { showGps: false, showTopo: true };
  }

  return { showGps: hasGps, showTopo: true };
}

/** Predicado CANÓNICO "el ensayo tiene datos topográficos" — espejo del móvil y
 *  de la regla de visibilidad de la ficha. */
export function hasTopoData(p: {
  east?: number | null; north?: number | null; elevation?: number | null;
  valuesJson?: string | null;
}): boolean {
  return p.east != null || p.north != null || p.elevation != null || !!p.valuesJson;
}

export interface TopoCoverageItem { id: string; code: string; hasTopo: boolean; hasGps: boolean }
export interface TopoCoverageSummary {
  withoutTopo: TopoCoverageItem[];
  usingGps: TopoCoverageItem[];
  total: number;
}

/** Resume la cobertura topográfica del proyecto para el recuadro de alerta de la
 *  config: cuántos ensayos quedan sin topo y cuántos caen al GPS. Función PURA. */
export function summarizeTopoCoverage(
  items: TopoCoverageItem[],
  flags: Pick<ProjectFeatureFlags, 'module_topo' | 'topo_replace_gps' | 'topo_keep_gps_fallback'>,
): TopoCoverageSummary {
  const withoutTopo: TopoCoverageItem[] = [];
  const usingGps: TopoCoverageItem[] = [];
  for (const it of items) {
    if (!it.hasTopo) withoutTopo.push(it);
    const dec = decideCoordCards(flags, it.hasGps, it.hasTopo);
    if (dec.showGps && it.hasGps) usingGps.push(it);
  }
  return { withoutTopo, usingGps, total: items.length };
}
