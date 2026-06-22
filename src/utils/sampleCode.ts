/**
 * sampleCode (v43) — Código correlativo de MUESTRAS físicas.
 *
 * Sintaxis: `M-{sample_identifier}-{ddmmyy}-{seq:4}`
 *   • M                 — prefijo fijo de muestra.
 *   • sample_identifier — id del proyecto (editable en config, ej. "123").
 *   • ddmmyy            — fecha de la muestra, 2 díg. día + mes + año.
 *   • seq:4             — correlativo de 4 díg. por PROYECTO, arranca en 0001.
 *
 * Ejemplo: proyecto "123", 17/06/2026, muestra #1 → `M-123-170626-0001`.
 *
 * El secuencial es global por proyecto (no se reinicia por fecha) para que el
 * rango "desde muestra X hasta muestra Y" del filtro sea continuo.
 */

const pad = (n: number, w: number) => String(n).padStart(w, '0');

/** Devuelve ddmmyy de una fecha (YYYY-MM-DD o Date). */
export function sampleDatePart(date: string | Date | null | undefined, now = new Date()): string {
  let d: Date;
  if (date instanceof Date) d = date;
  else if (typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
    const [y, m, dd] = date.split('-').map(Number);
    d = new Date(y, m - 1, dd);
  } else d = now;
  return pad(d.getDate(), 2) + pad(d.getMonth() + 1, 2) + pad(d.getFullYear() % 100, 2);
}

/** Construye el código de muestra: `M-{proyecto}-{ddmmyy}-{seq:4}`. */
export function buildSampleCode(sampleIdentifier: string | null | undefined, date: string | Date | null | undefined, seq: number): string {
  const id = (sampleIdentifier ?? '').trim();
  return `M-${id}-${sampleDatePart(date)}-${pad(seq, 4)}`;
}

/** Siguiente correlativo del proyecto: max(seq existentes) + 1, mínimo 1. */
export function nextSampleSeq(existingSeqs: (number | null | undefined)[]): number {
  let max = 0;
  for (const s of existingSeqs) {
    if (typeof s === 'number' && Number.isFinite(s) && s > max) max = s;
  }
  return max + 1;
}

/** Fecha de hoy en YYYY-MM-DD (local), para el default del formulario. */
export function todaySampleDate(now = new Date()): string {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1, 2)}-${pad(now.getDate(), 2)}`;
}
