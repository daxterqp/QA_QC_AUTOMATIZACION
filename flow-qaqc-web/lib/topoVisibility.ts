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
