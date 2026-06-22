/**
 * summaryTable.ts — Contrato del módulo "Tablas Resumen" (Fase 1).
 *
 * La CONFIG de cada tabla resumen viene EMBEBIDA en la plantilla Excel del
 * ensayo (hoja/bloque RESUMEN). El importador la lee y la guarda en
 * `protocol_templates.summary_config_json`. Esta config define:
 *   - qué celdas de la ficha se vuelven columnas,
 *   - su agrupación "paraguas" (encabezados combinados),
 *   - las fórmulas de AGREGACIÓN entre ensayos (promedios/ratios/KPIs).
 *
 * Si una plantilla no trae config, se autogenera una por defecto (todas las
 * celdas reportables como columnas, sin grupos ni agregaciones).
 *
 * Mirror: src/utils/summaryTable.ts (mantener idénticos).
 */

/** Una columna de la tabla resumen. */
export interface SummaryColumn {
  /** Clave estable usada en values_json (ej. "peso_molde" o "A:1"). */
  key: string;
  /** Encabezado individual de la columna. */
  label: string;
  /** Grupo "paraguas" al que pertenece (título superior combinado). Opcional. */
  group?: string;
  /** Referencia a la celda de la ficha de donde se extrae el valor:
   *  - "item:<partida>" → el valor de esa fila (1ª celda)
   *  - "cell:<partida>:<letra>" → celda concreta (A,B,C…)
   *  - "field:<clave>" → campo fijo del ensayo (ej. field:protocol_code) */
  from: string;
  /** Tipo de dato (para alinear/formatear y agregar). */
  kind?: 'number' | 'text' | 'date';
  /** Decimales para mostrar (solo number). */
  dec?: number;
}

/** Encabezado combinado: un título que abarca `span` columnas consecutivas. */
export interface SummaryGroup {
  title: string;
  span: number;
}

/** Agregación entre filas (ensayos) — alimenta KPIs/dashboards. */
export interface SummaryAggregation {
  /** Etiqueta visible (ej. "Promedio grado de compactación"). */
  label: string;
  /** Columna sobre la que opera (key de SummaryColumn). */
  column: string;
  /** Operación. */
  op: 'avg' | 'sum' | 'min' | 'max' | 'count' | 'ratio';
  /** Para ratio: numerador/denominador (keys). */
  num?: string;
  den?: string;
}

export interface SummaryConfig {
  columns: SummaryColumn[];
  groups?: SummaryGroup[];
  aggregations?: SummaryAggregation[];
}

/** Columnas FIJAS obligatorias presentes en TODA tabla resumen (orden de salida). */
export const FIXED_SUMMARY_COLUMNS: SummaryColumn[] = [
  { key: 'ensayo_date',     label: 'Fecha',     from: 'field:ensayo_date',     kind: 'date', group: 'Identificación' },
  { key: 'protocol_code',   label: 'Código',    from: 'field:protocol_code',   kind: 'text', group: 'Identificación' },
  { key: 'project_name',    label: 'Proyecto',  from: 'field:project_name',    kind: 'text', group: 'Identificación' },
  { key: 'sector_name',     label: 'Sector',    from: 'field:sector_name',     kind: 'text', group: 'Identificación' },
  { key: 'location_name',   label: 'Ubicación', from: 'field:location_name',   kind: 'text', group: 'Identificación' },
  { key: 'estado',          label: 'Estado',    from: 'field:estado',          kind: 'text', group: 'Identificación' },
  { key: 'realizado_por',   label: 'Realizado por',   from: 'field:realizado_por',   kind: 'text', group: 'Responsables' },
  { key: 'aprobado_por',    label: 'Aprobado por',    from: 'field:aprobado_por',    kind: 'text', group: 'Responsables' },
  { key: 'fecha_aprobacion', label: 'Fecha aprobación', from: 'field:fecha_aprobacion', kind: 'date', group: 'Responsables' },
];

/** Estado del ensayo: etiqueta + color. "En revisión" = AZUL CLARO (no naranja). */
export const SUMMARY_STATUS: Record<string, { label: string; color: string }> = {
  APPROVED:  { label: 'Aprobado',    color: '#1e8e3e' },
  SUBMITTED: { label: 'En revisión', color: '#394e7d' },
  REJECTED:  { label: 'Rechazado',   color: '#d93025' },
};
export const summaryStatus = (s: string | null | undefined) => SUMMARY_STATUS[s ?? ''] ?? { label: s ?? '—', color: '#64748b' };

/** ¿La config es válida y utilizable? */
export function isValidSummaryConfig(c: unknown): c is SummaryConfig {
  return !!c && typeof c === 'object' && Array.isArray((c as SummaryConfig).columns)
    && (c as SummaryConfig).columns.every(col => col && typeof col.key === 'string' && typeof col.from === 'string');
}

/** Parsea el JSON crudo (string u objeto) a SummaryConfig, o null si inválido. */
export function parseSummaryConfig(raw: unknown): SummaryConfig | null {
  let v = raw;
  if (typeof v === 'string') { try { v = JSON.parse(v); } catch { return null; } }
  return isValidSummaryConfig(v) ? v : null;
}

/** Claves "fijas" que NO son columnas de datos de la ficha (van en columnas dedicadas). */
const FIXED_KEYS = new Set(['project_name', 'sector_name', 'location_name', 'protocol_code', 'ensayo_date', 'realizado_por', 'aprobado_por', 'estado', 'fecha_aprobacion', '_sv']);

/** Autogenera columnas a partir de las claves presentes en los values_json de
 *  las filas (cuando la plantilla no trae config RESUMEN). Orden estable. */
export function dynamicColumnsFromRows(rows: { values_json?: Record<string, unknown> | null }[]): SummaryColumn[] {
  const keys: string[] = [];
  const seen = new Set<string>();
  for (const r of rows) {
    for (const k of Object.keys(r.values_json ?? {})) {
      if (FIXED_KEYS.has(k) || seen.has(k)) continue;
      seen.add(k); keys.push(k);
    }
  }
  return keys.map(k => ({ key: k, label: k, from: `key:${k}`, kind: 'number' as const }));
}

/** Aplica una agregación sobre un conjunto de valores (filas filtradas). */
export function aggregate(values: number[], op: SummaryAggregation['op']): number | null {
  const nums = values.filter(n => Number.isFinite(n));
  if (op === 'count') return nums.length; // solo valores reales (no NaN de celdas vacías/texto)
  if (nums.length === 0) return null;
  switch (op) {
    case 'sum': return nums.reduce((a, b) => a + b, 0);
    case 'avg': return nums.reduce((a, b) => a + b, 0) / nums.length;
    case 'min': return Math.min(...nums);
    case 'max': return Math.max(...nums);
    default: return null;
  }
}
