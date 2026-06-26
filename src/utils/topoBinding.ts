/**
 * topoBinding.ts — Enlace DIFERIDO de filas topográficas (por CÓDIGO de ensayo)
 * a los protocolos existentes. La carga guarda las filas por código (fuente de
 * verdad); aquí se resuelven a `protocolId` cuando el ensayo existe. Los códigos
 * sin ensayo quedan "pendientes" (se enlazan después, cuando el ensayo aparece).
 *
 * Función PURA (sin DB) → fácil de testear y espejo exacto en web.
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
  /** Códigos sin ensayo (se mostrarán como "pendientes" en la tarjeta de carga). */
  pending: string[];
}

/** Normaliza un código para comparar (trim + minúsculas). */
export function normalizeCode(code: string | null | undefined): string {
  return (code ?? '').trim().toLowerCase();
}

/**
 * Enlaza filas (por código) a protocolos. `protocolsByCode` mapea código
 * NORMALIZADO → protocolId (el caller lo construye indexando protocol_code /
 * external_id / protocol_number). Idempotente; dedup por código (la primera fila
 * de cada código gana — el caller debe ordenar/colapsar antes si quiere otra regla).
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
