/**
 * traceabilityAggregates — funciones puras para cálculos de las vistas
 * analíticas de trazabilidad. Cero dependencias de Supabase / WMDB → unit-test
 * friendly.
 *
 * Convenciones:
 *  - "Duración efectiva" = sum(intervals WHERE kind='active'). En ms.
 *  - "Duración pausada" = sum(intervals WHERE kind='paused'). En ms.
 *  - Intervals abiertos (ended_at=null) usan `now` como fin.
 */

import type {
  WorkSession, WorkSessionInterval, Activity, Equipment as _Eq,
  WorkSessionGpsPoint,
} from '@/types';

export interface SessionWithIntervals {
  session: WorkSession;
  intervals: WorkSessionInterval[];
}

export function effectiveDurationMs(intervals: WorkSessionInterval[], now: number = Date.now()): number {
  let total = 0;
  for (const it of intervals) {
    if (it.kind !== 'active') continue;
    total += Math.max(0, (it.ended_at ?? now) - it.started_at);
  }
  return total;
}

export function pausedDurationMs(intervals: WorkSessionInterval[], now: number = Date.now()): number {
  let total = 0;
  for (const it of intervals) {
    if (it.kind !== 'paused') continue;
    total += Math.max(0, (it.ended_at ?? now) - it.started_at);
  }
  return total;
}

/** Sum de duración efectiva de un grupo de sesiones (intervals precargados). */
export function sumEffective(items: SessionWithIntervals[], now?: number): number {
  return items.reduce((acc, x) => acc + effectiveDurationMs(x.intervals, now), 0);
}

export interface GroupedByKey<T extends string | number> {
  key: T;
  durationMs: number;
  count: number;
}

export function groupBy<K extends string | number>(
  items: SessionWithIntervals[],
  keyOf: (s: WorkSession) => K | null | undefined,
  now?: number,
): GroupedByKey<K>[] {
  const map = new Map<K, GroupedByKey<K>>();
  for (const x of items) {
    const k = keyOf(x.session);
    if (k == null) continue;
    const dur = effectiveDurationMs(x.intervals, now);
    const prev = map.get(k);
    if (!prev) map.set(k, { key: k, durationMs: dur, count: 1 });
    else { prev.durationMs += dur; prev.count++; }
  }
  return Array.from(map.values()).sort((a, b) => b.durationMs - a.durationMs);
}

/** Group by combinación equipo+actividad — entidad analítica propia (decisión del plan). */
export function groupByEquipmentActivity(
  items: SessionWithIntervals[],
  now?: number,
): Array<{ equipmentId: string; activityId: string; durationMs: number; count: number }> {
  const map = new Map<string, { equipmentId: string; activityId: string; durationMs: number; count: number }>();
  for (const x of items) {
    const k = `${x.session.equipment_id}::${x.session.activity_id}`;
    const dur = effectiveDurationMs(x.intervals, now);
    const prev = map.get(k);
    if (!prev) map.set(k, { equipmentId: x.session.equipment_id, activityId: x.session.activity_id, durationMs: dur, count: 1 });
    else { prev.durationMs += dur; prev.count++; }
  }
  return Array.from(map.values()).sort((a, b) => b.durationMs - a.durationMs);
}

/** Indicadores Vista 4 — Por Equipo. */
export interface EquipmentMetrics {
  productiveMs: number;
  maintenanceMs: number;
  transportMs: number;
  otherMs: number;
  pausedMs: number;
  totalActiveMs: number;
  /** productive / totalActive (0..1). 0 si no hay datos. */
  utilizationRatio: number;
  /** (totalActive - maintenance) / totalActive. */
  operationalAvailability: number;
}

export function computeEquipmentMetrics(
  items: SessionWithIntervals[],
  activitiesById: Map<string, Activity>,
  now?: number,
): EquipmentMetrics {
  let p = 0, m = 0, t = 0, o = 0, pa = 0;
  for (const x of items) {
    const eff = effectiveDurationMs(x.intervals, now);
    const pau = pausedDurationMs(x.intervals, now);
    pa += pau;
    const act = activitiesById.get(x.session.activity_id);
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

/** Formato hh:mm legible. */
export function fmtHm(ms: number): string {
  const totalMin = Math.round(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h === 0) return `${m}m`;
  return `${h}h ${String(m).padStart(2, '0')}m`;
}

/** Decimación simple: si hay >maxPoints, devolver cada N-ésimo manteniendo
 *  endpoints. Para vistas de timeline / mapa que no necesitan precisión metro. */
export function decimateGps(points: WorkSessionGpsPoint[], maxPoints = 2000): WorkSessionGpsPoint[] {
  if (maxPoints <= 1 || points.length <= maxPoints) return points;
  const step = Math.ceil(points.length / maxPoints);
  const out: WorkSessionGpsPoint[] = [];
  for (let i = 0; i < points.length; i += step) out.push(points[i]);
  if (out.length > 0 && out[out.length - 1] !== points[points.length - 1]) {
    out.push(points[points.length - 1]);
  }
  return out;
}
