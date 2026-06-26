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

/** Predicado CANÓNICO "el ensayo tiene datos topográficos" — DEBE coincidir con la
 *  regla que decide la tarjeta en la ficha (ProtocolFillScreen): cualquier señal
 *  topo (este/norte/cota o valores custom/computados). Si esto se desincroniza, el
 *  recuadro de cobertura reporta una realidad distinta a la ficha. */
export function hasTopoData(p: {
  east?: number | null; north?: number | null; elevation?: number | null;
  valuesJson?: string | null;
}): boolean {
  return p.east != null || p.north != null || p.elevation != null || !!p.valuesJson;
}

export interface TopoCoverageItem { id: string; code: string; hasTopo: boolean; hasGps: boolean }
export interface TopoCoverageSummary {
  /** Ensayos con coordenadas topográficas. */
  withTopo: TopoCoverageItem[];
  /** Ensayos sin coordenadas topográficas (la capa topo no los cubre). */
  withoutTopo: TopoCoverageItem[];
  /** De los sin-topo, los que caen al GPS como respaldo (según los flags). */
  usingGps: TopoCoverageItem[];
  /** De los sin-topo, los que quedan SIN ninguna coordenada. */
  noCoords: TopoCoverageItem[];
  total: number;
}

/** Resume la cobertura topográfica del proyecto para el recuadro de alerta.
 *  Partición de los sin-topo en {usan GPS de respaldo, sin ninguna coordenada}
 *  según los flags activos. Función PURA. */
export function summarizeTopoCoverage(
  items: TopoCoverageItem[],
  flags: Pick<ProjectFeatureFlags, 'module_topo' | 'topo_replace_gps' | 'topo_keep_gps_fallback'>,
): TopoCoverageSummary {
  const withTopo: TopoCoverageItem[] = [];
  const withoutTopo: TopoCoverageItem[] = [];
  const usingGps: TopoCoverageItem[] = [];
  const noCoords: TopoCoverageItem[] = [];
  for (const it of items) {
    if (it.hasTopo) { withTopo.push(it); continue; }
    withoutTopo.push(it);
    const dec = decideCoordCards(flags, it.hasGps, false);
    if (dec.showGps && it.hasGps) usingGps.push(it);
    else noCoords.push(it);
  }
  return { withTopo, withoutTopo, usingGps, noCoords, total: items.length };
}
