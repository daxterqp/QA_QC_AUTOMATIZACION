/**
 * printConfig (web) — Resuelve la config de impresión por tipo de ensayo que el
 * CREADOR define desde la app móvil y se guarda en `projects.feature_flags`
 * (JSONB compartido entre móvil y web). El PDF web HONRA esa misma config.
 *
 * Espejo de la parte relevante de `src/utils/featureFlags.ts` (móvil).
 */

export type PrintFontLevel = 'normal' | 'compact' | 'xcompact';
export type PrintGraphSize = 'normal' | 'compact' | 'xcompact';
export type PrintHeaderSize = 'normal' | 'compact' | 'xcompact';

export interface TemplatePrintConfig {
  two_column?: boolean;
  font_level?: PrintFontLevel;
  graph_size?: PrintGraphSize;
  show_photos?: boolean;
  header_size?: PrintHeaderSize;
  header_fields?: string[];
  show_qr?: boolean;
  split_tables?: boolean;
  col_budget?: number;
  croquis?: CroquisConfig;
}

// v43.6 — Croquis (mapa) embebido en el PDF. En web es VECTORIAL sobre la ortofoto
// (o fondo blanco): sectores + ensayo en SVG, sin Google Maps.
export type CroquisPlacement = 'start' | 'end' | 'photos';
export interface CroquisConfig {
  show?: boolean;
  placement?: CroquisPlacement;
  show_orthophoto?: boolean;   // usar la ortofoto del proyecto de fondo
  base_opacity?: number;       // 0.3–1, atenúa la base
  point_size?: number;         // diámetro del ícono del ensayo (px)
  map_type?: string;           // (solo móvil; en web se ignora)
}
export type ResolvedCroquis = Required<Omit<CroquisConfig, 'map_type'>> & { map_type?: string };

export type ResolvedPrintConfig = Required<Omit<TemplatePrintConfig, 'croquis'>> & { croquis: ResolvedCroquis };

export const DEFAULT_HEADER_COLOR = '#0e213d';
export const PRINT_FONT_SCALE: Record<PrintFontLevel, number> = { normal: 1, compact: 0.85, xcompact: 0.72 };
export const PRINT_GRAPH_SCALE: Record<PrintGraphSize, number> = { normal: 1, compact: 0.72, xcompact: 0.52 };
export const PRINT_HEADER_ROWS: Record<PrintHeaderSize, number> = { normal: 3, compact: 2, xcompact: 1 };
export const PRINT_HEADER_FIELDS: { key: string; label: string }[] = [
  { key: 'proyecto', label: 'Proyecto' },
  { key: 'fecha', label: 'Fecha' },
  { key: 'supervisor', label: 'Supervisor' },
  { key: 'f_realizacion', label: 'Fecha realización' },
  { key: 'f_aprobacion', label: 'Fecha aprobación' },
  { key: 'id_protocolo', label: 'ID Protocolo' },
  { key: 'ubicacion', label: 'Coordenadas / Ubicación' },
  { key: 'especialidad', label: 'Especialidad' },
];
export const DEFAULT_HEADER_FIELDS = ['proyecto', 'fecha', 'supervisor', 'f_realizacion', 'f_aprobacion', 'id_protocolo', 'ubicacion'];

export function getCroquisConfig(c: CroquisConfig | undefined): ResolvedCroquis {
  const pl: CroquisPlacement = (c?.placement === 'start' || c?.placement === 'photos') ? c.placement : 'end';
  return {
    show: c?.show ?? false,
    placement: pl,
    show_orthophoto: c?.show_orthophoto ?? true,
    base_opacity: typeof c?.base_opacity === 'number' ? Math.max(0.3, Math.min(1, c.base_opacity)) : 1,
    point_size: typeof c?.point_size === 'number' ? Math.max(8, Math.min(40, Math.round(c.point_size))) : 14,
    map_type: c?.map_type,
  };
}

/** `feature_flags` puede llegar como objeto (JSONB) o string; normaliza a objeto. */
function asFlags(flags: unknown): Record<string, any> {
  if (!flags) return {};
  if (typeof flags === 'string') { try { return JSON.parse(flags) || {}; } catch { return {}; } }
  return flags as Record<string, any>;
}

/** Color GLOBAL de encabezados del proyecto (uno para todos los ensayos). */
export function getPrintHeaderColor(flags: unknown): string {
  const f = asFlags(flags);
  const c = f.print_header_color;
  return typeof c === 'string' && c ? c : DEFAULT_HEADER_COLOR;
}

/** Config de un tipo (idProtocolo) con TODOS los campos resueltos a su default. */
export function getTemplatePrintConfig(flags: unknown, idProtocolo: string | null | undefined): ResolvedPrintConfig {
  const f = asFlags(flags);
  const map = (f.print_configs && typeof f.print_configs === 'object') ? f.print_configs as Record<string, TemplatePrintConfig> : {};
  const c: TemplatePrintConfig = (idProtocolo && map[idProtocolo]) ? map[idProtocolo] : {};
  return {
    two_column: c.two_column ?? false,
    font_level: c.font_level ?? 'normal',
    graph_size: c.graph_size ?? 'normal',
    show_photos: c.show_photos ?? true,
    header_size: c.header_size ?? 'normal',
    header_fields: (Array.isArray(c.header_fields) && c.header_fields.length > 0) ? c.header_fields : DEFAULT_HEADER_FIELDS,
    show_qr: c.show_qr ?? true,
    split_tables: c.split_tables ?? false,
    col_budget: (typeof c.col_budget === 'number' && Number.isFinite(c.col_budget)) ? Math.max(12, Math.min(80, Math.round(c.col_budget))) : 39,
    croquis: getCroquisConfig(c.croquis),
  };
}

/** Ancho del gráfico según 1/2 columnas + escala de tamaño. */
export function chartWidthFor(cfg: ResolvedPrintConfig): number {
  return Math.round((cfg.two_column ? 210 : 440) * PRINT_GRAPH_SCALE[cfg.graph_size]);
}
