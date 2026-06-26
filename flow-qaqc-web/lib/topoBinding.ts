/**
 * topoBinding.ts (web) — Espejo EXACTO de src/utils/topoBinding.ts. Enlace
 * diferido de filas topográficas (por CÓDIGO de ensayo) a protocolos existentes.
 */

export interface TopoRow {
  code: string;
  c1?: number | string | null;
  c2?: number | string | null;
  cota?: number | string | null;
  custom?: Record<string, string | number | null>;
}

export interface BoundRow {
  protocolId: string;
  code: string;
  row: TopoRow;
}

export interface BindResult {
  applied: BoundRow[];
  pending: string[];
}

export function normalizeCode(code: string | null | undefined): string {
  return (code ?? '').trim().toLowerCase();
}

export function bindCargaToProtocols(
  rows: TopoRow[],
  protocolsByCode: Map<string, string>,
): BindResult {
  const applied: BoundRow[] = [];
  const pending: string[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    const raw = (row.code ?? '').trim();
    if (!raw) continue;
    const key = normalizeCode(raw);
    if (seen.has(key)) continue;
    seen.add(key);
    const protocolId = protocolsByCode.get(key);
    if (protocolId) applied.push({ protocolId, code: raw, row });
    else pending.push(raw);
  }
  return { applied, pending };
}
