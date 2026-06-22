/**
 * traceabilityAggregates (móvil) — funciones puras para las vistas analíticas
 * de Trazabilidad operacional. Espejo de
 * `flow-qaqc-web/lib/traceabilityAggregates.ts`. Cero dependencias de WMDB.
 *
 * Convenciones:
 *  - "Duración efectiva" = sum(intervals WHERE kind='active'). En ms.
 *  - "Duración pausada" = sum(intervals WHERE kind='paused'). En ms.
 *  - Intervals abiertos (endedAt=null) usan `now` como fin.
 */

import { effectiveDurationMs as _eff, pausedDurationMs as _pau } from '@services/WorkSessionService';

export { _eff as effectiveDurationMs, _pau as pausedDurationMs };

/** Shape duck-typed — válido para records de WMDB con `.kind, .startedAt, .endedAt`. */
export interface IntervalLike {
  kind: 'active' | 'paused';
  startedAt: number;
  endedAt: number | null;
}

export interface SessionLike {
  id: string;
  equipmentId: string;
  activityId: string;
  sectorId: string | null;
  shiftId: string | null;
  userId: string;
  startedAt: number;
  endedAt: number | null;
  status: 'ACTIVE' | 'PAUSED' | 'CLOSED';
}

export interface SessionWithIntervals {
  session: SessionLike;
  intervals: IntervalLike[];
}

export interface GroupedByKey<T extends string | number> {
  key: T;
  durationMs: number;
  count: number;
}

export function groupBy<K extends string | number>(
  items: SessionWithIntervals[],
  keyOf: (s: SessionLike) => K | null | undefined,
  now?: number,
): GroupedByKey<K>[] {
  const map = new Map<K, GroupedByKey<K>>();
  for (const x of items) {
    const k = keyOf(x.session);
    if (k == null) continue;
    const dur = _eff(x.intervals as any, now);
    const prev = map.get(k);
    if (!prev) map.set(k, { key: k, durationMs: dur, count: 1 });
    else { prev.durationMs += dur; prev.count++; }
  }
  return Array.from(map.values()).sort((a, b) => b.durationMs - a.durationMs);
}

export function groupByEquipmentActivity(
  items: SessionWithIntervals[],
  now?: number,
): Array<{ equipmentId: string; activityId: string; durationMs: number; count: number }> {
  const map = new Map<string, { equipmentId: string; activityId: string; durationMs: number; count: number }>();
  for (const x of items) {
    const k = `${x.session.equipmentId}::${x.session.activityId}`;
    const dur = _eff(x.intervals as any, now);
    const prev = map.get(k);
    if (!prev) map.set(k, { equipmentId: x.session.equipmentId, activityId: x.session.activityId, durationMs: dur, count: 1 });
    else { prev.durationMs += dur; prev.count++; }
  }
  return Array.from(map.values()).sort((a, b) => b.durationMs - a.durationMs);
}

export interface EquipmentMetrics {
  productiveMs: number;
  maintenanceMs: number;
  transportMs: number;
  otherMs: number;
  pausedMs: number;
  totalActiveMs: number;
  utilizationRatio: number;       // productive / totalActive
  operationalAvailability: number; // (totalActive - maintenance) / totalActive
}

export function computeEquipmentMetrics(
  items: SessionWithIntervals[],
  activitiesById: Map<string, { kind: 'productive' | 'maintenance' | 'transport' | 'other' }>,
  now?: number,
): EquipmentMetrics {
  let p = 0, m = 0, t = 0, o = 0, pa = 0;
  for (const x of items) {
    const eff = _eff(x.intervals as any, now);
    pa += _pau(x.intervals as any, now);
    const act = activitiesById.get(x.session.activityId);
    const kind = act?.kind ?? 'other';
    if (kind === 'productive') p += eff;
    else if (kind === 'maintenance') m += eff;
    else if (kind === 'transport') t += eff;
    else o += eff;
  }
  const total = p + m + t + o;
  return {
    productiveMs: p, maintenanceMs: m, transportMs: t, otherMs: o,
    pausedMs: pa, totalActiveMs: total,
    utilizationRatio: total === 0 ? 0 : p / total,
    operationalAvailability: total === 0 ? 0 : (total - m) / total,
  };
}

/** Métricas por usuario: equipos/sectores distintos + horas totales. */
export function computePersonnelMetrics(
  items: SessionWithIntervals[],
  now?: number,
): Array<{ userId: string; sessions: number; equipos: number; sectores: number; durationMs: number }> {
  const map = new Map<string, { userId: string; sessions: number; equipSet: Set<string>; sectorSet: Set<string>; durationMs: number }>();
  for (const x of items) {
    const u = x.session.userId;
    const prev = map.get(u) ?? { userId: u, sessions: 0, equipSet: new Set(), sectorSet: new Set(), durationMs: 0 };
    prev.sessions++;
    prev.equipSet.add(x.session.equipmentId);
    if (x.session.sectorId) prev.sectorSet.add(x.session.sectorId);
    prev.durationMs += _eff(x.intervals as any, now);
    map.set(u, prev);
  }
  return Array.from(map.values())
    .map(r => ({ userId: r.userId, sessions: r.sessions, equipos: r.equipSet.size, sectores: r.sectorSet.size, durationMs: r.durationMs }))
    .sort((a, b) => b.durationMs - a.durationMs);
}

/** Sub-detalle de un sector: por equipo (cuánto trabajó cada equipo allí). */
export function sectorBreakdownByEquipment(
  items: SessionWithIntervals[],
  sectorId: string,
  now?: number,
): Array<{ equipmentId: string; activityId: string; durationMs: number; sessions: number }> {
  const filtered = items.filter(x => x.session.sectorId === sectorId);
  const map = new Map<string, { equipmentId: string; activityId: string; durationMs: number; sessions: number }>();
  for (const x of filtered) {
    const k = `${x.session.equipmentId}::${x.session.activityId}`;
    const dur = _eff(x.intervals as any, now);
    const prev = map.get(k);
    if (!prev) map.set(k, { equipmentId: x.session.equipmentId, activityId: x.session.activityId, durationMs: dur, sessions: 1 });
    else { prev.durationMs += dur; prev.sessions++; }
  }
  return Array.from(map.values()).sort((a, b) => b.durationMs - a.durationMs);
}

/** Sub-detalle de un equipo: por sector (dónde trabajó). */
export function equipmentBreakdownBySector(
  items: SessionWithIntervals[],
  equipmentId: string,
  now?: number,
): Array<{ sectorId: string; durationMs: number; sessions: number }> {
  const filtered = items.filter(x => x.session.equipmentId === equipmentId && !!x.session.sectorId);
  const map = new Map<string, { sectorId: string; durationMs: number; sessions: number }>();
  for (const x of filtered) {
    const sid = x.session.sectorId!;
    const dur = _eff(x.intervals as any, now);
    const prev = map.get(sid);
    if (!prev) map.set(sid, { sectorId: sid, durationMs: dur, sessions: 1 });
    else { prev.durationMs += dur; prev.sessions++; }
  }
  return Array.from(map.values()).sort((a, b) => b.durationMs - a.durationMs);
}

/** Formato hh:mm legible. */
export function fmtHm(ms: number): string {
  const totalMin = Math.round(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h === 0) return `${m}m`;
  return `${h}h ${String(m).padStart(2, '0')}m`;
}

/** Fusiona pausas cortas (< thresholdMs) con el active adyacente para suavizar
 *  el análisis. Una pausa breve (típicamente por error del operador) NO se
 *  considera detención real — se incorpora al tiempo productivo y desaparece
 *  como gap visual en la línea de tiempo.
 *
 *  Convención: si la pausa corta queda entre dos active contiguos, todo se
 *  fusiona en un único active. Si está al inicio sin active previo, se convierte
 *  en active (no rompe la continuidad visual).
 *
 *  Devuelve un nuevo array (no muta el input). */
export function mergeShortPauses(
  intervals: IntervalLike[],
  thresholdMs: number = 5 * 60 * 1000,
  now: number = Date.now(),
): IntervalLike[] {
  if (intervals.length === 0) return intervals;
  // Orden cronológico defensivo.
  const sorted = [...intervals].sort((a, b) => a.startedAt - b.startedAt);
  const out: IntervalLike[] = [];
  for (const raw of sorted) {
    const dur = (raw.endedAt ?? now) - raw.startedAt;
    // Pausa corta: absorber.
    if (raw.kind === 'paused' && dur < thresholdMs) {
      const prev = out[out.length - 1];
      if (prev && prev.kind === 'active') {
        prev.endedAt = raw.endedAt ?? prev.endedAt;
        continue;
      }
      // Sin active previo: tratar como active para no romper el inicio.
      out.push({ kind: 'active', startedAt: raw.startedAt, endedAt: raw.endedAt });
      continue;
    }
    // Active contiguo con active previo (después de un merge): unir.
    if (raw.kind === 'active' && out.length > 0) {
      const prev = out[out.length - 1];
      if (prev.kind === 'active' && prev.endedAt != null && raw.startedAt <= prev.endedAt + 100) {
        prev.endedAt = raw.endedAt ?? prev.endedAt;
        continue;
      }
    }
    out.push({ kind: raw.kind, startedAt: raw.startedAt, endedAt: raw.endedAt });
  }
  return out;
}

/** Filtro de sesiones por rango de fechas (inclusivo en ambos extremos). */
export function filterByDateRange(
  items: SessionWithIntervals[],
  fromMs: number | null,
  toMs: number | null,
): SessionWithIntervals[] {
  if (fromMs == null && toMs == null) return items;
  return items.filter(x => {
    const s = x.session.startedAt;
    if (fromMs != null && s < fromMs) return false;
    if (toMs != null && s > toMs) return false;
    return true;
  });
}
