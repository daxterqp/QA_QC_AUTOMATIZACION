/**
 * dashboardUtils — Utilidades compartidas del Dashboard (general y por proyecto).
 * Única fuente de verdad para colores de estado, buckets de avance, semanas y
 * la fórmula v31 de "ensayos esperados" (antes triplicada en dashboard/page,
 * historical/page y useProjectMetrics).
 */

/** Colores de estado/series alineados a los tokens de tailwind.config.ts. */
export const DASH_COLORS = {
  success: '#2e7d5e',    // token success  — aprobado
  danger: '#c0392b',     // token danger   — rechazado
  warning: '#c47d15',    // token warning  — enviado / pendiente de revisión
  primary: '#394e7d',    // token primary  — serie principal
  secondary: '#668abc',  // token secondary
  pending: '#d4dde8',    // token border   — fondo "en progreso"
  draft: '#9ca3af',      // gray-400       — borrador
} as const;

/** Coordenada efectiva de un ensayo: topo (v44) tiene prioridad sobre GPS.
 *  Descarta no-finitos y el (0,0) basura. */
export function protocolCoord(p: {
  topo_latitude?: number | null; topo_longitude?: number | null;
  latitude?: number | null; longitude?: number | null;
}): { lat: number; lng: number } | null {
  const cand: Array<[number | null | undefined, number | null | undefined]> = [
    [p.topo_latitude, p.topo_longitude],
    [p.latitude, p.longitude],
  ];
  for (const [lat, lng] of cand) {
    if (lat != null && lng != null && Number.isFinite(lat) && Number.isFinite(lng) && !(lat === 0 && lng === 0)) {
      return { lat, lng };
    }
  }
  return null;
}

/** Color del pin de un ensayo en el mapa según su estado. */
export function colorForStatus(status: string): string {
  switch (status) {
    case 'APPROVED': return DASH_COLORS.success;
    case 'REJECTED': return DASH_COLORS.danger;
    case 'SUBMITTED': return DASH_COLORS.warning;
    default: return DASH_COLORS.draft;
  }
}

/** Bucket de salud de una obra según su % de avance (aprobados/esperados). */
export type ProgressBucket = 'good' | 'mid' | 'low' | 'none';

export function progressBucket(percent: number, totalExpected: number): ProgressBucket {
  if (totalExpected <= 0) return 'none';
  if (percent >= 70) return 'good';
  if (percent >= 40) return 'mid';
  return 'low';
}

export const PROGRESS_BUCKET_COLORS: Record<ProgressBucket, string> = {
  good: DASH_COLORS.success,
  mid: DASH_COLORS.warning,
  low: DASH_COLORS.danger,
  none: DASH_COLORS.draft,
};

/**
 * v31 — Total de ensayos ESPERADOS: suma de template_ids por ubicación. Las
 * instancias de los modos nuevos (sector/tipo/fecha, location_id null) no
 * cuentan contra este esperado o el progreso superaría el 100%.
 */
export function computeTotalExpected(locations: { template_ids: string | null }[]): number {
  return locations.reduce((sum, loc) => {
    const n = loc.template_ids ? loc.template_ids.split(',').filter(s => s.trim()).length : 0;
    return sum + n;
  }, 0);
}

/** Semanas del proyecto desde su inicio (S1 parcial hasta domingo, luego L-D). */
export function getWeekBoundaries(projectStart: Date): Array<{ start: number; end: number }> {
  const now = Date.now();
  const day = projectStart.getDay();
  const daysToSunday = day === 0 ? 0 : 7 - day;
  const week1End = new Date(projectStart);
  week1End.setDate(projectStart.getDate() + daysToSunday);
  week1End.setHours(23, 59, 59, 999);

  const weeks: Array<{ start: number; end: number }> = [
    { start: projectStart.getTime(), end: week1End.getTime() },
  ];

  let wkStart = new Date(week1End.getTime() + 1);
  wkStart.setHours(0, 0, 0, 0);
  while (wkStart.getTime() <= now) {
    const wkEnd = new Date(wkStart);
    wkEnd.setDate(wkStart.getDate() + 6);
    wkEnd.setHours(23, 59, 59, 999);
    weeks.push({ start: wkStart.getTime(), end: wkEnd.getTime() });
    wkStart = new Date(wkEnd.getTime() + 1);
    wkStart.setHours(0, 0, 0, 0);
  }
  return weeks;
}
