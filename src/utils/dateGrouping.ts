/**
 * dateGrouping — utils para agrupar items por día calendario.
 *
 * Usado en TraceabilityHomeScreen (historial) y ChronologyModal (eventos).
 * Convierte timestamps en headers visuales: "HOY", "AYER", "01 jun 2026".
 */

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

function startOfDay(ms: number): number {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0).getTime();
}

/** Devuelve el label del header para un timestamp. */
export function formatDateHeader(ms: number, now: number = Date.now()): string {
  const today = startOfDay(now);
  const day = startOfDay(ms);
  const dayDiff = Math.round((today - day) / 86400000);
  if (dayDiff === 0) return 'Hoy';
  if (dayDiff === 1) return 'Ayer';
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getDate())} ${MESES[d.getMonth()]} ${d.getFullYear()}`;
}

/** Agrupa items por día calendario, en el mismo orden de aparición.
 *  Devuelve array de secciones compatibles con SectionList. */
export function groupByDay<T>(
  items: T[],
  getTimestamp: (item: T) => number,
  now: number = Date.now(),
): Array<{ title: string; dayKey: number; data: T[] }> {
  const sections: Array<{ title: string; dayKey: number; data: T[] }> = [];
  const byKey = new Map<number, { title: string; dayKey: number; data: T[] }>();
  for (const it of items) {
    const ts = getTimestamp(it);
    const dayKey = startOfDay(ts);
    let sec = byKey.get(dayKey);
    if (!sec) {
      sec = { title: formatDateHeader(ts, now), dayKey, data: [] };
      byKey.set(dayKey, sec);
      sections.push(sec);
    }
    sec.data.push(it);
  }
  return sections;
}
