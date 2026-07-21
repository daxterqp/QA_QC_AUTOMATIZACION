/**
 * sectorSets — Juegos de sectores con periodo de vigencia (v102).
 *
 * ⚠ ESPEJO EXACTO: src/utils/sectorSets.ts ↔ flow-qaqc-web/lib/sectorSets.ts
 * (mismo contrato que chartMath: la lógica pura vive duplicada byte a byte).
 *
 * Modelo: cada fila de project_sectors pertenece a un JUEGO (`set_index`, 1 =
 * inicial) y todas las filas de un juego comparten su `valid_from` (fecha en la
 * que el juego ENTRA EN VIGENCIA; null = "desde siempre"). La geometría vieja no
 * queda "mal": coexiste como el juego de su periodo.
 *
 * Resolución: el juego vigente para una fecha D es el de MAYOR set_index cuyo
 * valid_from es null o <= D. Los ensayos usan el juego vigente a su
 * `ensayo_date`; las pantallas de gestión usan el vigente HOY.
 *
 * Sin juegos nuevos cargados (todas las filas set 1 / valid_from null) todo se
 * comporta exactamente como antes de v102.
 */

/** Campos mínimos que necesita la resolución (camelCase móvil o snake_case web). */
export interface SectorSetFields {
  setIndex?: number | null;
  validFrom?: string | null;
  set_index?: number | null;
  valid_from?: string | null;
}

const setOf = (s: SectorSetFields): number => s.setIndex ?? s.set_index ?? 1;
const fromOf = (s: SectorSetFields): string | null => {
  const v = s.validFrom ?? s.valid_from ?? null;
  // Normaliza a YYYY-MM-DD (la nube puede devolver timestamps completos).
  return typeof v === 'string' && v.length >= 10 ? v.slice(0, 10) : null;
};

/** Hoy en ISO local (YYYY-MM-DD). */
export function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Nº del juego VIGENTE para una fecha (ISO YYYY-MM-DD; null/'' = hoy):
 * el mayor set_index cuyo valid_from es null o <= fecha. Si ningún juego
 * aplica todavía (todos con vigencia futura), cae al MENOR set_index para
 * que nunca desaparezcan todos los sectores.
 */
export function activeSetIndex(rows: SectorSetFields[], dateIso?: string | null): number {
  if (!rows.length) return 1;
  const d = (dateIso && dateIso.length >= 10) ? dateIso.slice(0, 10) : todayIso();
  let best: number | null = null;
  let minSet: number | null = null;
  for (const r of rows) {
    const k = setOf(r);
    minSet = minSet == null ? k : Math.min(minSet, k);
    const from = fromOf(r);
    if (from == null || from <= d) best = best == null ? k : Math.max(best, k);
  }
  return best ?? minSet ?? 1;
}

/** Filtra las filas al juego vigente para la fecha dada (null = hoy). */
export function sectorsForDate<T extends SectorSetFields>(rows: T[], dateIso?: string | null): T[] {
  if (!rows.length) return rows;
  const k = activeSetIndex(rows, dateIso);
  return rows.filter(r => setOf(r) === k);
}

/** Nº que corresponde a un juego NUEVO (max existente + 1). */
export function nextSetIndex(rows: SectorSetFields[]): number {
  let max = 0;
  for (const r of rows) max = Math.max(max, setOf(r));
  return max + 1;
}

/** ¿El proyecto tiene más de un juego cargado? (para mostrar u ocultar UI). */
export function hasMultipleSets(rows: SectorSetFields[]): boolean {
  const seen = new Set<number>();
  for (const r of rows) { seen.add(setOf(r)); if (seen.size > 1) return true; }
  return false;
}
