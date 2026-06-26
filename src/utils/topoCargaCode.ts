/**
 * topoCargaCode.ts — Código de carga topográfica `T<ddmmaa>-<seq>` (ej. T010526-1
 * = carga #1 del 01/05/26). El seq correlativo del DÍA. El seq atómico se obtiene
 * con el RPC `next_protocol_seq(group_key='TOPO|<ddmmaa>')`; este módulo provee el
 * formato + un fallback local sobre los códigos existentes.
 */

function ddmmaa(date: Date): string {
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const aa = String(date.getFullYear() % 100).padStart(2, '0');
  return `${dd}${mm}${aa}`;
}

/** `T<ddmmaa>-<seq>`. */
export function buildTopoCargaCode(date: Date, seq: number): string {
  return `T${ddmmaa(date)}-${seq}`;
}

/** YYYY-MM-DD local (clave de fecha de la carga). */
export function cargaDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** group_key para el RPC atómico `next_protocol_seq`: `TOPO|<ddmmaa>`. */
export function topoSeqGroupKey(date: Date): string {
  return `TOPO|${ddmmaa(date)}`;
}

/** Fallback local: próximo seq del día según los códigos ya existentes. */
export function nextTopoSeqLocal(existingCodes: string[], date: Date): number {
  const prefix = `T${ddmmaa(date)}-`;
  let max = 0;
  for (const c of existingCodes) {
    if (c && c.startsWith(prefix)) {
      const n = parseInt(c.slice(prefix.length), 10);
      if (Number.isFinite(n) && n > max) max = n;
    }
  }
  return max + 1;
}
