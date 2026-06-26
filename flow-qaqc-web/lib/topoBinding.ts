/**
 * topoBinding.ts (web) — Espejo EXACTO de src/utils/topoBinding.ts. Enlace
 * diferido de filas topográficas (por CÓDIGO de ensayo) a protocolos existentes.
 */

export interface TopoRow {
  /** Código del ensayo (col 1). */
  code: string;
  /** Coordenada 1 (Este/X). */
  c1?: number | string | null;
  /** Coordenada 2 (Norte/Y). */
  c2?: number | string | null;
  /** Cota/Z. */
  cota?: number | string | null;
  /** Columnas custom (manual): { colId: value }. */
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

/**
 * Enlaza filas (por código) a protocolos. `protocolsByCode` mapea código
 * NORMALIZADO (normalizeCode) → protocolId — el caller DEBE normalizar las claves
 * (indexando protocol_code / external_id). Idempotente; dedup por código
 * normalizado (la primera fila de cada código gana). Códigos sin ensayo → pending.
 */
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
