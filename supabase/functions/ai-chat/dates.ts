/**
 * dates.ts — Utilidades de fecha del Asistente IA (Deno).
 *
 * Mirror de `periodKeyOf`/`periodLabel` (src/screens/EnsayosScreen.tsx) y
 * `daysAgoISO` (src/services/ProtocolGroupingService.ts) — mantener la MISMA
 * semántica para que los conteos del asistente coincidan con lo que el usuario
 * ve en la pantalla de Ensayos. Todas las fechas son YYYY-MM-DD en hora LOCAL
 * de Lima (America/Lima, UTC-5 sin DST).
 */

export type DateUnit = 'dia' | 'semana' | 'mes' | 'total';

const MONTHS_ES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

/** Fecha actual de Lima como YYYY-MM-DD (Deno corre en UTC; Lima = UTC-5 fijo). */
export function todayLimaYmd(): string {
  const now = new Date(Date.now() - 5 * 3600 * 1000);
  return now.toISOString().slice(0, 10);
}

/** Fecha+hora legible de Lima para el system prompt. */
export function nowLimaLabel(): string {
  return new Intl.DateTimeFormat('es-PE', {
    timeZone: 'America/Lima', dateStyle: 'full', timeStyle: 'short',
  }).format(new Date());
}

/** Hora (0-23) actual en Lima — para "buenos días/tardes/noches". */
export function hourLima(): number {
  return Number(new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Lima', hour: 'numeric', hour12: false,
  }).format(new Date()));
}

const fmtDmy = (d: Date) =>
  `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${d.getUTCFullYear()}`;

/** Clave de periodo (mirror EnsayosScreen.periodKeyOf; semana con corte LUNES). */
export function periodKeyOf(ymd: string, unit: DateUnit): string {
  if (unit === 'dia' || unit === 'total') return ymd;
  if (unit === 'mes') return ymd.slice(0, 7);
  // semana (corte lunes = getUTCDay()===1)
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!m) return ymd;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() - 1 + 7) % 7));
  return d.toISOString().slice(0, 10);
}

/** Etiqueta legible del periodo (mirror EnsayosScreen.periodLabel). */
export function periodLabel(key: string, unit: DateUnit): string {
  if (unit === 'dia' || unit === 'total') {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
    return m ? `${m[3]}/${m[2]}/${m[1]}` : key;
  }
  if (unit === 'mes') {
    const [y, mo] = key.split('-');
    return `${MONTHS_ES[+mo - 1] ?? mo} ${y}`;
  }
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!m) return key;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  const e = new Date(d);
  e.setUTCDate(e.getUTCDate() + 6);
  return `Semana del ${fmtDmy(d)} al ${fmtDmy(e)}`;
}

/** Valida un string YYYY-MM-DD (defensa de inputs del modelo). */
export function isYmd(s: unknown): s is string {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

/** Como isYmd pero además exige que la fecha EXISTA ('2026-02-31' no pasa).
 *  Para paths de ESCRITURA (crear ensayo): una fecha imposible no debe viajar. */
export function isRealYmd(s: unknown): s is string {
  if (!isYmd(s)) return false;
  const d = new Date(s + 'T00:00:00Z');
  return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}
