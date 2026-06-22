/**
 * protocolCode — generación y parseo de códigos correlativos de ensayo (v31).
 *
 * Máscara configurable por proyecto (feature_flags.coding_mask_default) con
 * tokens:  {TIPO} {AA} {AAAA} {MM} {DD} {SEQ:n} {SECTOR}
 * Default: `{TIPO}-{AA}{SEQ:4}` → PR-260032 (patrón real de minería).
 *
 * Ámbito del correlativo: TIPO + AÑO + PROYECTO (decisión del usuario). El
 * índice único de Supabase es (project_id, protocol_code) — por eso la máscara
 * DEBE codificar tipo y año, si no, ámbitos distintos colisionarían en el
 * mismo string. `validateMask` lo exige.
 *
 * Espejo ×2 byte-idéntico: `src/utils/protocolCode.ts` (móvil) y
 * `flow-qaqc-web/lib/protocolCode.ts` (web). Puro, sin dependencias.
 */

export interface CodeParts {
  /** id_protocolo de la plantilla (PR, DS, GR…). */
  tipo: string;
  /** Fecha del ensayo (ensayo_date) o de creación — alimenta {AA}/{MM}/{DD}. */
  date: Date;
  /** Correlativo (1-based) dentro del ámbito tipo+año+proyecto. */
  seq: number;
  /** Nombre del sector si aplica (solo modo sector). */
  sector?: string | null;
}

const RE_SEQ = /\{SEQ:(\d{1,2})\}/;

/** Valida la máscara. Devuelve lista de errores (vacía = válida). */
export function validateMask(mask: string): string[] {
  const errors: string[] = [];
  const m = (mask ?? '').trim();
  if (!m) { errors.push('La máscara está vacía'); return errors; }
  const seqMatches = m.match(/\{SEQ:\d{1,2}\}/g) ?? [];
  if (seqMatches.length === 0) errors.push('Falta el token {SEQ:n} (el correlativo). Ej: {SEQ:4}');
  if (seqMatches.length > 1) errors.push('Solo se admite UN token {SEQ:n}');
  if (!m.includes('{TIPO}')) errors.push('Falta {TIPO}: sin el tipo de ensayo, los correlativos de tipos distintos colisionarían');
  if (!m.includes('{AA}') && !m.includes('{AAAA}')) errors.push('Falta el año ({AA} o {AAAA}): sin él, los correlativos de años distintos colisionarían');
  const unknown = m.replace(/\{(TIPO|AA|AAAA|MM|DD|SECTOR)\}/g, '').replace(RE_SEQ, '').match(/\{[^}]*\}/g);
  if (unknown) errors.push(`Tokens desconocidos: ${unknown.join(', ')}`);
  return errors;
}

/** {SECTOR} sanitizado: mayúsculas, sin espacios. '' si no hay sector. */
function sanitizeSector(sector: string | null | undefined): string {
  return (sector ?? '').trim().toUpperCase().replace(/\s+/g, '');
}

const pad2 = (n: number) => String(n).padStart(2, '0');

/** Construye el código a partir de la máscara y las partes. */
export function buildProtocolCode(mask: string, parts: CodeParts): string {
  const { tipo, date, seq } = parts;
  const yyyy = String(date.getFullYear());
  return mask
    .replace(/\{TIPO\}/g, tipo.trim())
    .replace(/\{AAAA\}/g, yyyy)
    .replace(/\{AA\}/g, yyyy.slice(-2))
    .replace(/\{MM\}/g, pad2(date.getMonth() + 1))
    .replace(/\{DD\}/g, pad2(date.getDate()))
    .replace(/\{SECTOR\}/g, sanitizeSector(parts.sector))
    .replace(RE_SEQ, (_m, n) => String(seq).padStart(Number(n), '0'));
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Regex que matchea códigos del ÁMBITO de esta instancia (tipo+fecha
 *  concretos como literales — un id_protocolo con guiones no rompe el parseo).
 *  Grupo 1 = la secuencia. {SEQ:n} → (\d{n,}): tolera overflow del padding
 *  (el ensayo 10000 con {SEQ:4} sigue parseando). {MM}/{DD}/{SECTOR} matchean
 *  genérico (el ámbito es tipo+año: meses/días/sectores distintos COMPARTEN
 *  correlativo). */
/** v46.1 — Ámbito de REINICIO de la secuencia: además de TIPO+año (siempre literales),
 *  qué tokens entran al ámbito (literales → la secuencia REINICIA al cambiar ese valor).
 *  Por defecto {} → MM/DD/SECTOR son genéricos (comparten correlativo). Con `sector:true`
 *  cada sector reinicia en 1; con `month:true` cada mes; etc. */
export interface SeqResetScope { sector?: boolean; month?: boolean; day?: boolean }

export function maskToRegex(mask: string, tipo: string, date: Date, sector?: string | null, scope: SeqResetScope = {}): RegExp {
  const yyyy = String(date.getFullYear());
  let out = '';
  let rest = mask;
  while (rest.length > 0) {
    const tok = /\{(TIPO|AAAA|AA|MM|DD|SECTOR)\}|\{SEQ:(\d{1,2})\}/.exec(rest);
    if (!tok) { out += escapeRegExp(rest); break; }
    out += escapeRegExp(rest.slice(0, tok.index));
    if (tok[2] != null) out += `(\\d{${Number(tok[2])},})`;
    else if (tok[1] === 'TIPO') out += escapeRegExp(tipo.trim());
    else if (tok[1] === 'AAAA') out += escapeRegExp(yyyy);
    else if (tok[1] === 'AA') out += escapeRegExp(yyyy.slice(-2));
    else if (tok[1] === 'MM') out += scope.month ? escapeRegExp(pad2(date.getMonth() + 1)) : '\\d{2}';
    else if (tok[1] === 'DD') out += scope.day ? escapeRegExp(pad2(date.getDate())) : '\\d{2}';
    else if (tok[1] === 'SECTOR') out += scope.sector ? escapeRegExp(sanitizeSector(sector)) : '[^\\s]*?';
    rest = rest.slice(tok.index + tok[0].length);
  }
  return new RegExp(`^${out}$`);
}

/** v46.1 — Resuelve la máscara para un tipo: usa la específica del tipo si existe,
 *  si no la global. `byType` = feature_flags.coding_mask_by_type. */
export function pickMask(defaultMask: string, byType: Record<string, string> | undefined, tipo: string): string {
  const m = byType?.[tipo]?.trim();
  return m && m.length > 0 ? m : defaultMask;
}

/** Próximo correlativo del ámbito: max(seq parseado de `codes`) + 1.
 *  `codes` = TODOS los protocol_code no nulos del proyecto (local o remoto);
 *  el regex del ámbito filtra los de otro tipo/año/máscara (y sector/mes si el
 *  ámbito de reinicio lo incluye). */
export function nextSeq(codes: (string | null | undefined)[], mask: string, tipo: string, date: Date, sector?: string | null, scope: SeqResetScope = {}): number {
  const re = maskToRegex(mask, tipo, date, sector, scope);
  let max = 0;
  for (const c of codes) {
    if (!c) continue;
    const m = re.exec(c.trim());
    if (!m) continue;
    const n = Number(m[1]);
    if (Number.isFinite(n) && n > max) max = n;
  }
  return max + 1;
}

/** Fecha local YYYY-MM-DD (para ensayo_date). */
export function todayEnsayoDate(now = new Date()): string {
  return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
}

/** Parsea ensayo_date (YYYY-MM-DD) a Date local a mediodía (sin saltos de TZ). */
export function parseEnsayoDate(s: string | null | undefined): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec((s ?? '').trim());
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0);
  if (d.getDate() !== Number(m[3]) || d.getMonth() !== Number(m[2]) - 1) return null;
  return d;
}
