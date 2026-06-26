/**
 * topoVisibility.ts — Decide qué tarjetas de coordenadas mostrar en la ficha,
 * según los flags del módulo topográfico y si el ensayo tiene GPS / topo.
 *
 * Reglas (decisión del usuario):
 *  - Módulo OFF → solo GPS (comportamiento original).
 *  - replace_gps OFF → ambas; la GPS se oculta si no hay valores GPS; la topo SIEMPRE
 *    se muestra (aunque esté vacía).
 *  - replace_gps ON, keep_gps OFF → solo topo, nunca GPS.
 *  - replace_gps ON, keep_gps ON → topo si el ensayo tiene topo; si no, GPS (si tiene);
 *    si no tiene ninguna, topo vacía.
 */
import type { ProjectFeatureFlags } from './featureFlags';

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

  // replace OFF → ambas; GPS solo si hay valores; topo siempre (aunque vacía).
  return { showGps: hasGps, showTopo: true };
}
