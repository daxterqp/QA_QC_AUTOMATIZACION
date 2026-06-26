/**
 * topoCargaCode.ts (web) — Espejo EXACTO de src/utils/topoCargaCode.ts.
 * Código de carga `T<ddmmaa>-<seq>`.
 */

function ddmmaa(date: Date): string {
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const aa = String(date.getFullYear() % 100).padStart(2, '0');
  return `${dd}${mm}${aa}`;
}

export function buildTopoCargaCode(date: Date, seq: number): string {
  return `T${ddmmaa(date)}-${seq}`;
}

export function cargaDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function topoSeqGroupKey(date: Date): string {
  return `TOPO|${ddmmaa(date)}`;
}

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
