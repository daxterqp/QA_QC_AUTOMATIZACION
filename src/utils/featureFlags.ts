/**
 * Feature flags por proyecto (móvil).
 * Espejo del módulo web en `flow-qaqc-web/types/index.ts`.
 *
 * v29 — Reestructura: solo 3 grupos visibles en UI (Protocolos, Trazabilidad,
 * Geolocalización). Los flags que antes eran configurables pero forman parte
 * del funcionamiento estándar (plans_pdf, normas, phone_contacts, qr_codes,
 * advanced_charts, protocol_linking) quedan @deprecated en el schema y se
 * consideran SIEMPRE true en el código. Se preservan en el JSON persistido
 * para no romper sync con apps viejas.
 */

export type CoordinateSystem = 'WGS84_LATLNG' | 'WGS84_UTM' | 'PSAD56_LATLNG' | 'PSAD56_UTM';

/** v43.4 — Config de impresión PDF por tipo de ensayo (plantilla). Todos los campos
 *  opcionales: lo no definido cae al default vía `getTemplatePrintConfig`. */
export type PrintFontLevel = 'normal' | 'compact' | 'xcompact';
export type PrintGraphSize = 'normal' | 'compact' | 'xcompact';
export interface TemplatePrintConfig {
  /** Distribuye resultados (tablas + gráficos) en 2 columnas. Solo numérico. Default false. */
  two_column?: boolean;
  /** Nivel de letra para compactar tablas (ambos tipos). Default 'normal'. */
  font_level?: PrintFontLevel;
  /** Tamaño del gráfico: normal / compacta / muy compacta. Solo numérico. Default 'normal'. */
  graph_size?: PrintGraphSize;
  /** Incluir paneles fotográficos en el PDF. Default true. */
  show_photos?: boolean;
  /** N° de FILAS del encabezado de "Datos generales": normal=3 / compacta=2 / muy
   *  compacta=1. Los campos elegidos (header_fields) se reparten en esas filas. */
  header_size?: PrintHeaderSize;
  /** Campos (en orden) que se muestran en el encabezado de datos generales. Claves de
   *  PRINT_HEADER_FIELDS. Si no está, usa DEFAULT_HEADER_FIELDS. */
  header_fields?: string[];
  /** Mostrar el QR + su código en el encabezado. Default true. */
  show_qr?: boolean;
  /** Permitir DIVIDIR una tabla entre columnas/secciones (aprovecha el espacio
   *  sobrante; la continuación lleva nota "Continuación de:"). Default false. */
  split_tables?: boolean;
  /** v43.5 — Croquis (mapa con sectores + ensayo ploteado) embebido en el PDF. */
  croquis?: Required<CroquisConfig>;
  /** v43.6 — Presupuesto de altura por COLUMNA (en "filas") para el empaquetado del
   *  PDF numérico. Más alto = más contenido por columna antes de saltar de página.
   *  Editable por tipo de ensayo. Default 39. Se divide por el fontScale al usarse. */
  col_budget?: number;
}
// v43.6 — El croquis fluye como una SECCIÓN (igual que un gráfico), no en página
// dedicada: 'start' (antes del contenido), 'end' (después), 'photos' (dentro del panel
// fotográfico). ('header' quedó obsoleto → se mapea a 'end' al leer.)
export type CroquisPlacement = 'start' | 'end' | 'photos';
// v43.6 — 'none' = sin mapa: fondo blanco, solo los croquis (sectores + ensayo).
export type CroquisMapType = 'satellite' | 'hybrid' | 'standard' | 'terrain' | 'none';
export interface CroquisConfig {
  show?: boolean;                  // default false
  placement?: CroquisPlacement;    // default 'end'
  map_type?: CroquisMapType;       // default 'hybrid'
  show_orthophoto?: boolean;       // default true (si el proyecto tiene ortofoto)
  base_opacity?: number;           // 0.3–1, atenúa la capa base. default 1
  point_size?: number;             // tamaño del ícono del ensayo (px). 8–40, default 14
  /** v100b — "Mapa completo": el mapa ocupa TODO el ancho de su sección y la
   *  leyenda baja debajo (en vez de mapa-izquierda / leyenda-derecha). Default
   *  false (lado a lado, mejor donde hay poco espacio). */
  full_width?: boolean;
}
export const DEFAULT_CROQUIS: Required<CroquisConfig> = {
  show: false, placement: 'end', map_type: 'hybrid', show_orthophoto: true, base_opacity: 1, point_size: 14, full_width: false,
};
/** Capas de mapa disponibles para el croquis (clave + etiqueta UI). */
export const CROQUIS_MAP_TYPES: { value: CroquisMapType; label: string }[] = [
  { value: 'hybrid', label: 'Híbrido' },
  { value: 'satellite', label: 'Satélite' },
  { value: 'standard', label: 'Estándar' },
  { value: 'terrain', label: 'Terreno' },
  { value: 'none', label: 'Ninguno' },
];
/** Ubicaciones del croquis en el PDF (clave + etiqueta UI). */
export const CROQUIS_PLACEMENTS: { value: CroquisPlacement; label: string }[] = [
  { value: 'start', label: 'Al inicio' },
  { value: 'end', label: 'Al final' },
  { value: 'photos', label: 'Panel fotográfico' },
];
export function getCroquisConfig(c: CroquisConfig | undefined): Required<CroquisConfig> {
  // Migra el obsoleto 'header' (y cualquier valor desconocido) a 'end'.
  const pl: CroquisPlacement = (c?.placement === 'start' || c?.placement === 'photos') ? c.placement : 'end';
  return {
    show: c?.show ?? false,
    placement: pl,
    map_type: c?.map_type ?? 'hybrid',
    show_orthophoto: c?.show_orthophoto ?? true,
    base_opacity: typeof c?.base_opacity === 'number' ? Math.max(0.3, Math.min(1, c.base_opacity)) : 1,
    point_size: typeof c?.point_size === 'number' ? Math.max(8, Math.min(40, Math.round(c.point_size))) : 14,
    full_width: c?.full_width ?? false,
  };
}
// ─── v103 — Partes del contrato y firmas del PDF ────────────────────────────
// ESPEJO de flow-qaqc-web/lib/printConfig.ts. Cualquier cambio va en los DOS.

/** Cliente / supervisión / contratista. Fijos del proyecto, no del ensayo. */
export interface ProjectParties {
  cliente?: string;
  supervision?: string;
  contratista?: string;
}
/** Orden y etiqueta de las partes (mismo orden en pantalla, PDF y config). */
export const PROJECT_PARTY_FIELDS: { key: keyof ProjectParties; label: string }[] = [
  { key: 'cliente', label: 'Cliente' },
  { key: 'supervision', label: 'Supervisión' },
  { key: 'contratista', label: 'Contratista' },
];
/** Partes con los vacíos ya podados (para no renderizar filas en blanco). */
export function getProjectParties(flags: unknown): ProjectParties {
  const f = (flags && typeof flags === 'object') ? flags as Record<string, any> : {};
  const p = (f.project_parties && typeof f.project_parties === 'object') ? f.project_parties : {};
  const out: ProjectParties = {};
  for (const { key } of PROJECT_PARTY_FIELDS) {
    const v = typeof p[key] === 'string' ? p[key].trim() : '';
    if (v) out[key] = v;
  }
  return out;
}

/** Una casilla de firma del pie del PDF. */
export interface PdfSignatureSlot {
  /** Rótulo bajo la línea (p. ej. "Ing. de Calidad"). */
  role: string;
  /** Nombre impreso bajo el rótulo. Vacío → solo la línea y el rótulo. */
  name?: string;
  /** De dónde sale el nombre: 'fixed' = el texto de `name`; 'approver' = el
   *  usuario que realmente aprobó el ensayo (solo tiene sentido en UNA casilla). */
  source?: 'fixed' | 'approver';
}
/** Casillas por defecto para proyectos que activan las 3 firmas del cliente. */
export const DEFAULT_PDF_SIGNATURES: PdfSignatureSlot[] = [
  { role: 'Ing. de Calidad', source: 'approver' },
  { role: 'Residente de Obra', source: 'fixed' },
  { role: 'Supervisor de Obra', source: 'fixed' },
];
/** Casillas saneadas. Vacío → el PDF usa su firma única de siempre. */
export function getPdfSignatures(flags: unknown): PdfSignatureSlot[] {
  const f = (flags && typeof flags === 'object') ? flags as Record<string, any> : {};
  const raw = Array.isArray(f.pdf_signatures) ? f.pdf_signatures : [];
  return raw
    .map((s: any) => ({
      role: typeof s?.role === 'string' ? s.role.trim() : '',
      name: typeof s?.name === 'string' ? s.name.trim() : '',
      source: s?.source === 'approver' ? 'approver' as const : 'fixed' as const,
    }))
    .filter((s: PdfSignatureSlot) => !!s.role)
    .slice(0, 4);   // más de 4 no entran a lo ancho de la hoja
}

export type PrintHeaderSize = 'normal' | 'compact' | 'xcompact';
/** Paleta de colores sugeridos para encabezados de ficha. */
export const PRINT_HEADER_COLORS: { label: string; value: string }[] = [
  { label: 'Navy', value: '#0e213d' },
  { label: 'Azul', value: '#1a4f7a' },
  { label: 'Azul cielo', value: '#2563eb' },
  { label: 'Verde', value: '#15803d' },
  { label: 'Teal', value: '#0f766e' },
  { label: 'Naranja', value: '#c2410c' },
  { label: 'Rojo', value: '#b91c1c' },
  { label: 'Vino', value: '#7e22ce' },
  { label: 'Gris', value: '#374151' },
];
export const DEFAULT_HEADER_COLOR = '#0e213d';
/** Catálogo de campos disponibles para el encabezado de datos generales (clave + etiqueta). */
export const PRINT_HEADER_FIELDS: { key: string; label: string }[] = [
  { key: 'proyecto', label: 'Proyecto' },
  { key: 'fecha', label: 'Fecha de impresión' },
  { key: 'supervisor', label: 'Supervisor' },
  { key: 'f_realizacion', label: 'Fecha realización' },
  { key: 'f_aprobacion', label: 'Fecha aprobación' },
  { key: 'id_protocolo', label: 'ID Protocolo' },
  { key: 'ubicacion', label: 'Coordenadas / Ubicación' },
  { key: 'especialidad', label: 'Especialidad' },
  // v104 — Elemento físico liberado (Losa, C-1, VA-202). Separado de la
  // especialidad, que ahora es la disciplina.
  { key: 'elemento', label: 'Elemento' },
  // v103 — Partes del contrato. NO entran en DEFAULT_HEADER_FIELDS: solo salen si
  // el proyecto las llenó Y el usuario las eligió (si no, ocuparían ancho en vano).
  { key: 'cliente', label: 'Cliente' },
  { key: 'supervision', label: 'Supervisión' },
  { key: 'contratista', label: 'Contratista' },
];
// Especialidad va seleccionada por defecto; al renderizar solo aparece en
// protocolos CLÁSICOS (en numéricos se ignora), por lo que es seguro incluirla.
export const DEFAULT_HEADER_FIELDS = ['proyecto', 'supervisor', 'f_realizacion', 'f_aprobacion', 'id_protocolo', 'ubicacion', 'especialidad'];
/** Filas del encabezado por nivel. */
export const PRINT_HEADER_ROWS: Record<PrintHeaderSize, number> = { normal: 3, compact: 2, xcompact: 1 };
/** Factor de escala de fuente por nivel (compacta las tablas). */
export const PRINT_FONT_SCALE: Record<PrintFontLevel, number> = { normal: 1, compact: 0.85, xcompact: 0.72 };
/** Factor de escala del ancho del gráfico por nivel. */
export const PRINT_GRAPH_SCALE: Record<PrintGraphSize, number> = { normal: 1, compact: 0.72, xcompact: 0.52 };
/** Lee la config de un tipo con TODOS los campos resueltos a su default. */
export function getTemplatePrintConfig(flags: ProjectFeatureFlags, idProtocolo: string | null | undefined): Required<TemplatePrintConfig> {
  const c = (idProtocolo && flags.print_configs) ? (flags.print_configs[idProtocolo] ?? {}) : {};
  return {
    two_column: c.two_column ?? false,
    font_level: c.font_level ?? 'normal',
    graph_size: c.graph_size ?? 'normal',
    show_photos: c.show_photos ?? true,
    header_size: c.header_size ?? 'compact', // 2 filas por defecto (clásicos y numéricos)
    header_fields: (Array.isArray(c.header_fields) && c.header_fields.length > 0) ? c.header_fields : DEFAULT_HEADER_FIELDS,
    show_qr: c.show_qr ?? true,
    split_tables: c.split_tables ?? false,
    croquis: getCroquisConfig(c.croquis),
    col_budget: (typeof c.col_budget === 'number' && Number.isFinite(c.col_budget)) ? Math.max(12, Math.min(80, Math.round(c.col_budget))) : 39,
  };
}
/** v43.4 — Color de encabezados de ficha: GLOBAL del proyecto (uno para TODOS los
 *  ensayos), no por tipo. Lo edita el Creador desde la tuerca del Dosier. */
export function getPrintHeaderColor(flags: ProjectFeatureFlags | null | undefined): string {
  const c = (flags as any)?.print_header_color;
  return typeof c === 'string' && c ? c : DEFAULT_HEADER_COLOR;
}

// ── v45.3 — Agrupamientos (presets) de protocolos para el selector de llamadas ──
/** Comparador de un filtro de agrupamiento. `~` = contiene (texto). */
export type GroupingCmp = '=' | '!=' | '<' | '<=' | '>' | '>=' | '~';
/** Cláusula de filtro: `field op value`. `field` = atributo (material, condicion,
 *  sector, fecha, codigo) o `celda:<row><col>` (valor de celda del ensayo fuente). */
export interface GroupingFilterClause { field: string; op: GroupingCmp; value: string }
/** Un preset = selección base + filtros + excepciones. Resuelve a una lista de códigos
 *  (snapshot) que se vuelcan al selector. Documentado en docs/agrupaciones-de-protocolos.md. */
export interface GroupingPreset {
  id: string;
  name: string;
  /** id_protocolo de los ensayos a traer (def: el filtro de tipo de la celda selectora). */
  source_tipo?: string;
  last_n?: number;                 // últimos N
  last_days?: number;              // aprobados en los últimos N días (relativo a hoy)
  date_from?: string;              // YYYY-MM-DD (absoluto)
  date_to?: string;
  same_sector?: boolean;           // relativo al ensayo actual
  same_sample?: boolean;
  same_location?: boolean;
  label?: string;                  // etiqueta/grupo manual (texto en location_reference)
  order?: 'reciente' | 'antiguo';
  filters?: GroupingFilterClause[];
  /** @deprecated v47 — excepciones por CÓDIGO (legacy / sembradas desde Excel). Se siguen
   *  aplicando, pero el grupo se referencia EN VIVO por id; preferir exclude_ids. */
  exclude_codes?: string[];
  /** v47 — EXCEPCIONES por id de ensayo (quitar ensayos específicos del resultado de la regla). */
  exclude_ids?: string[];
  /** v47 — AÑADIDOS por id de ensayo (sumar ensayos específicos aunque la regla no los traiga). */
  include_ids?: string[];
}

/** v44 — Una columna del módulo "Carga de datos topográficos". Define cómo se
 *  obtiene el dato y si se muestra en la ficha. `source`:
 *   - 'manual': se digita/sube directo.
 *   - 'formula': se calcula con el motor (BUSCAR + celdas) — `formula` es la expresión.
 *   - 'area': "Evaluar dentro del área" — asigna sector por polígono con `tolerance_m` (m).
 *  `builtin` marca las columnas base (coord1/coord2/cota/sector); las custom no lo llevan. */
export interface TopoColumn {
  id: string;
  name: string;
  builtin?: 'coord1' | 'coord2' | 'cota' | 'sector';
  source: 'manual' | 'formula' | 'area';
  formula?: string;
  /** Fuente de áreas para 'area' (interino: id de un set de polígonos; def project_sectors). */
  area_table?: string;
  tolerance_m?: number;
  enabled: boolean;
  show_in_ficha: boolean;
}

// ── v100b — Tipos de proyecto y config de obra lineal ──────────────────────
export type ProjectType = 'edificaciones' | 'obra_lineal' | 'mineria';
/** Longitud de subtramo por defecto (m) cuando el proyecto lineal no la define. */
export const LINEAR_DEFAULT_SUBTRAMO_M = 60;
/** Un ítem del juego de ensayos: tipo (id_protocolo) + cuántos por subtramo. */
export interface LinearTestSetItem { id_protocolo: string; count: number }

export interface ProjectFeatureFlags {
  // ── v100b — Tipo de proyecto ────────────────────────────────────────────
  /** Tipo de obra. Default 'edificaciones' (= comportamiento actual). 'obra_lineal'
   *  activa tramos + subtramos + progresivas; 'mineria' reservado (resúmenes, futuro). */
  project_type?: ProjectType;
  /** Obra lineal: longitud de subtramo en metros (uniforme). Default LINEAR_DEFAULT_SUBTRAMO_M. */
  linear_subtramo_length_m?: number;
  /** Obra lineal: juego de ensayos uniforme por subtramo (tipo + cantidad por subtramo). */
  linear_test_set?: LinearTestSetItem[];

  // ── Configuración de Protocolos ────────────────────────────────────────
  classic_protocols: boolean;
  numeric_protocols: boolean;
  parametric_templates: boolean;
  historical_import: boolean;
  multi_level_approval: boolean;
  approval_levels: 1 | 2 | 3;
  /** Permite "Aprobar con observación" directo desde la LISTA del dossier (sin
   *  abrir el protocolo). Default OFF → un protocolo no conforme debe abrirse
   *  para aprobarlo con observación. El rechazo y la aprobación de conformes
   *  siguen disponibles desde la lista en ambos casos. */
  dossier_observe_inline?: boolean;

  // ── Llenado de protocolos (v31, Partes D+E) — conviven entre sí; el
  //    modo "por ubicación" es el default y SIEMPRE está activo ──────────
  fill_by_sector: boolean;
  fill_by_type: boolean;
  fill_by_date: boolean;
  /** v43 — Ensayos por MUESTRA física (módulo nuevo). Default OFF. */
  fill_by_sample: boolean;
  /** Codificación correlativa de ensayos (PR-260032). */
  protocol_codes: boolean;
  /** Máscara del código: {TIPO} {AA} {AAAA} {MM} {DD} {SEQ:n} {SECTOR}. */
  coding_mask_default: string;
  /** v46.1 — Máscara ESPECÍFICA por tipo de ficha (id_protocolo). Si falta, usa la global. */
  coding_mask_by_type?: Record<string, string>;
  /** v46.1 — Ámbito de reinicio del correlativo (además de tipo+año, siempre): 'year'
   *  (def, comparten mes/día/sector), 'year_sector' (reinicia por sector), 'year_month'. */
  coding_seq_reset?: 'year' | 'year_sector' | 'year_month';
  /** v62 — Modo de eliminación de ensayos/muestras:
   *  'last_only' (def): solo se puede eliminar el ÚLTIMO creado → cero huecos + reuso del código.
   *  'in_list_immutable': borrar cualquiera; los huecos en el correlativo son permanentes.
   *  'in_list_reassignable': borrar cualquiera + botón "Restablecer numeración" (renumera por fecha). */
  deletion_mode?: 'last_only' | 'in_list_immutable' | 'in_list_reassignable';

  // ── v43 — Módulos OPCIONALES del proyecto (visibilidad en el menú) ────────
  //    El CREADOR los activa/desactiva; se propagan a todos (feature_flags).
  /** Protocolos por ubicación (modo clásico). Default ON. */
  module_protocols_by_location: boolean;
  /** Módulo de Planos. Default OFF. */
  module_plans: boolean;
  /** Módulo de Contactos del proyecto. Default OFF. */
  module_contacts: boolean;
  /** Módulo de Tablas Resumen. Default OFF. */
  module_summary_tables: boolean;
  /** v67 — Módulo de Reportes por Correo (panel web). Default OFF. */
  module_email_reports?: boolean;
  /** v75 — Módulo Asistente de IA (chat del proyecto, solo móvil por ahora). Default OFF. */
  module_ai_assistant?: boolean;
  /** v87 — Descripción de la obra escrita por el Creador: FLOW la usa como
   *  fuente de verdad del contexto del proyecto (tipo de obra, pisos, tramos).
   *  Vacía → la IA interpreta con cautela desde nombre/ubicaciones/sectores. */
  ai_project_description?: string;
  /** v75 — Nivel de modelo del Asistente IA. El mapeo a modelo real es SERVER-SIDE
   *  (Edge Function) — el cliente nunca envía el nombre del modelo. Editable solo
   *  por el Creador (la pantalla de config ya es solo-CREATOR). Default 'economico'. */
  ai_model_tier?: 'economico' | 'potente' | 'maximo';
  /** v76 — Proveedor de IA del asistente (Claude o Gemini). Igual que el tier:
   *  el mapeo a modelo real es SERVER-SIDE; el cliente solo guarda la preferencia.
   *  Default 'claude'. */
  ai_provider?: 'claude' | 'gemini';
  /** v76 — Burbuja flotante de acceso rápido a Flo en todas las pantallas del
   *  proyecto (arrastrable). Default ON cuando el módulo IA está activo. */
  ai_quick_button?: boolean;
  /** v44 — Módulo "Carga de datos topográficos" (web + móvil). Default OFF. */
  module_topo?: boolean;
  /** v44 — Reemplazar coordenadas GPS: en las fichas se oculta la tarjeta GPS y se
   *  fuerza solo topográficas. Default OFF. */
  topo_replace_gps?: boolean;
  /** v44 — Con `topo_replace_gps` ON: para ensayos SIN topo, permitir usar la tarjeta GPS. */
  topo_keep_gps_fallback?: boolean;
  /** v44 — Enciende el motor de cálculo (fórmulas + áreas) sobre los datos topográficos. */
  topo_processing_enabled?: boolean;
  /** v44 — Columnas configuradas del módulo topográfico. */
  topo_columns?: TopoColumn[];
  /** v43.1 — Filas activas del formulario de muestra (config por proyecto, edita
   *  creador/jefe). Se guarda en feature_flags para propagarse sin migración. */
  sample_form_rows?: { material?: boolean; condition?: boolean; depth?: boolean; coords?: boolean; layers?: boolean };
  /** v43.1 — Catálogo editable de "tipo de material" para muestras (persistente). */
  sample_materials?: string[];
  /** v43.4 — Config de impresión PDF por TIPO de ensayo (clave = idProtocolo).
   *  La edita el Creador desde la tuerca del Dosier; se propaga a todos. */
  print_configs?: Record<string, TemplatePrintConfig>;
  /** v43.4 — Color de encabezados de ficha, GLOBAL (uno para todos los ensayos). */
  print_header_color?: string;
  /** v45.3 — Agrupamientos (presets) del selector de llamadas entre fichas, por TIPO
   *  de ficha que llama (clave = idProtocolo donde aparecen). Se siembran en masa desde
   *  la hoja AGRUPACIONES del Excel maestro y el usuario los puede editar después. */
  grouping_presets?: Record<string, GroupingPreset[]>;
  /** v103 — Partes del contrato (cliente / supervisión / contratista). Son FIJAS a
   *  nivel proyecto: se escriben una vez y salen en el encabezado de TODAS las fichas
   *  (pantalla y PDF). Vacío = el campo no se muestra. */
  project_parties?: ProjectParties;
  /** v103 — Firmas del pie del PDF. Los protocolos del cliente se firman en 3
   *  casillas (calidad / residente / supervisión) aunque el FLUJO DE APROBACIÓN
   *  del sistema siga siendo de un solo nivel: las casillas son formato impreso,
   *  no niveles de aprobación. Vacío = comportamiento anterior (una sola firma). */
  pdf_signatures?: PdfSignatureSlot[];

  // ── Módulo de Trazabilidad (padre + hijos) ────────────────────────────
  traceability_module: boolean;        // padre — si OFF, los hijos se ignoran
  equipment_catalog: boolean;          // hijo — gateado por traceability_module
  traceability_gps_polling: 'off' | 'foreground' | 'background';
  traceability_gps_interval_seconds: number;
  anonymize_traceability: boolean;     // oculto en UI hasta implementación

  // ── Módulo de Geolocalización (padre + hijos) ─────────────────────────
  map_enabled: boolean;                // padre — si OFF, los hijos se ignoran
  gps_capture_subjective: boolean;     // hijo
  gps_capture_numeric: boolean;        // hijo
  coordinate_system: CoordinateSystem;

  // ── @deprecated — siempre considerados true. No mostrar en UI ─────────
  /** @deprecated v29 — Planos PDF siempre activos. */
  plans_pdf?: boolean;
  /** @deprecated v29 — Gráficos avanzados siempre activos. */
  advanced_charts?: boolean;
  /** @deprecated v29 — Normas siempre activas. */
  normas?: boolean;
  /** @deprecated v29 — Contactos del proyecto siempre activos. */
  phone_contacts?: boolean;
  /** @deprecated v29 — Códigos QR siempre activos. */
  qr_codes?: boolean;
  /** @deprecated v29 — Vinculación entre protocolos siempre activa. */
  protocol_linking?: boolean;
}

export const DEFAULT_FEATURE_FLAGS: ProjectFeatureFlags = {
  project_type: 'edificaciones',
  classic_protocols: true,
  numeric_protocols: false,
  parametric_templates: false,
  historical_import: false,
  multi_level_approval: false,
  approval_levels: 1,
  dossier_observe_inline: false,

  fill_by_sector: false,
  fill_by_type: false,
  fill_by_date: false,
  fill_by_sample: false,
  protocol_codes: false,
  coding_mask_default: '{TIPO}-{AA}{SEQ:4}',
  deletion_mode: 'last_only',

  // v43 — Módulos opcionales: ubicación ON por defecto; el resto OFF.
  module_protocols_by_location: true,
  module_plans: false,
  module_contacts: false,
  module_summary_tables: false,
  module_email_reports: false,
  module_ai_assistant: false,
  ai_project_description: '',
  ai_model_tier: 'economico',
  ai_provider: 'claude',
  ai_quick_button: true,
  module_topo: false,
  topo_replace_gps: false,
  topo_keep_gps_fallback: false,
  topo_processing_enabled: false,
  // v43.1 — Formulario de muestra: filas activas por defecto + catálogo de materiales.
  sample_form_rows: { material: true, condition: true, depth: false, coords: true, layers: false },
  sample_materials: [],

  traceability_module: false,
  equipment_catalog: false,
  traceability_gps_polling: 'off',
  traceability_gps_interval_seconds: 3,
  anonymize_traceability: false,

  map_enabled: false,
  gps_capture_subjective: false,
  gps_capture_numeric: false,
  coordinate_system: 'WGS84_LATLNG',

  // @deprecated: defaults a true para que cualquier consumidor que aún los
  // lea reciba siempre true.
  plans_pdf: true,
  advanced_charts: true,
  normas: true,
  phone_contacts: true,
  qr_codes: true,
  protocol_linking: true,
};

export function mergeFeatureFlags(partial: Partial<ProjectFeatureFlags> | null | undefined): ProjectFeatureFlags {
  // v29 — Los @deprecated SIEMPRE retornan true, sin importar lo que diga el
  // JSON persistido. Proyectos legacy podían tener `plans_pdf:false` etc.
  return {
    ...DEFAULT_FEATURE_FLAGS,
    ...(partial ?? {}),
    plans_pdf: true,
    advanced_charts: true,
    normas: true,
    phone_contacts: true,
    qr_codes: true,
    protocol_linking: true,
  };
}

/** Parsea el string JSON guardado en projects.feature_flags (WatermelonDB) → set completo. */
export function parseFeatureFlagsJson(s: string | null | undefined): ProjectFeatureFlags {
  if (!s) return { ...DEFAULT_FEATURE_FLAGS };
  try {
    const obj = JSON.parse(s) as Partial<ProjectFeatureFlags>;
    return mergeFeatureFlags(obj);
  } catch {
    return { ...DEFAULT_FEATURE_FLAGS };
  }
}

// ── Helpers padre-hijo ──────────────────────────────────────────────────
// Devuelven false si el padre está OFF, incluso si el hijo está en true
// (evita estados zombi: "tengo equipment_catalog ON pero traceability OFF").
// Se evalúan EN LECTURA para no perder configuración cuando el usuario
// toggle apaga el padre y vuelve a prenderlo.

export function isTraceabilityEnabled(flags: ProjectFeatureFlags): boolean {
  return !!flags.traceability_module;
}

export function isEquipmentCatalogEnabled(flags: ProjectFeatureFlags): boolean {
  return !!flags.traceability_module && !!flags.equipment_catalog;
}

export function isGeolocationEnabled(flags: ProjectFeatureFlags): boolean {
  return !!flags.map_enabled;
}

export function isGpsCaptureSubjectiveEnabled(flags: ProjectFeatureFlags): boolean {
  return !!flags.map_enabled && !!flags.gps_capture_subjective;
}

export function isGpsCaptureNumericEnabled(flags: ProjectFeatureFlags): boolean {
  return !!flags.map_enabled && !!flags.gps_capture_numeric;
}

// ── v100b — Tipo de proyecto + obra lineal ─────────────────────────────────
/** Tipo de obra, con default seguro para proyectos legacy (sin el flag). */
export function getProjectType(flags: ProjectFeatureFlags | null | undefined): ProjectType {
  const t = (flags as any)?.project_type;
  return (t === 'obra_lineal' || t === 'mineria') ? t : 'edificaciones';
}

/** true si la obra es lineal (carretera/canal/vía) → tramos + subtramos + progresivas. */
export function isLinearProject(flags: ProjectFeatureFlags | null | undefined): boolean {
  return getProjectType(flags) === 'obra_lineal';
}

/** Longitud de subtramo (m) del proyecto lineal, acotada a un rango razonable. */
export function linearSubtramoLength(flags: ProjectFeatureFlags | null | undefined): number {
  const n = (flags as any)?.linear_subtramo_length_m;
  return (typeof n === 'number' && Number.isFinite(n) && n > 0) ? n : LINEAR_DEFAULT_SUBTRAMO_M;
}

/** Juego de ensayos uniforme por subtramo (saneado: cantidades enteras ≥1). */
export function linearTestSet(flags: ProjectFeatureFlags | null | undefined): LinearTestSetItem[] {
  const raw = (flags as any)?.linear_test_set;
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((x: any) => x && typeof x.id_protocolo === 'string' && x.id_protocolo.trim())
    .map((x: any) => ({ id_protocolo: String(x.id_protocolo).trim(), count: Math.max(1, Math.round(Number(x.count) || 1)) }));
}

/** Término de la unidad territorial según el tipo de proyecto: 'Tramo' en obra
 *  lineal, 'Sector' en el resto. Usado para rotular la UI y el PDF. */
export function unitTerm(flags: ProjectFeatureFlags | null | undefined): { sing: string; plur: string; singLower: string; plurLower: string } {
  return isLinearProject(flags)
    ? { sing: 'Tramo', plur: 'Tramos', singLower: 'tramo', plurLower: 'tramos' }
    : { sing: 'Sector', plur: 'Sectores', singLower: 'sector', plurLower: 'sectores' };
}

// ── v44 — Módulo "Carga de datos topográficos" ────────────────────────────
export function isTopoEnabled(flags: ProjectFeatureFlags): boolean {
  return !!flags.module_topo;
}

/** Columnas por defecto al prender el módulo: las 2 coordenadas (habilitadas y
 *  visibles en ficha), la Cota deshabilitada por defecto, y el Sector habilitado. */
export function defaultTopoColumns(): TopoColumn[] {
  return [
    { id: 'coord1', name: 'Coordenada 1 (Este)',  builtin: 'coord1', source: 'manual', enabled: true,  show_in_ficha: true },
    { id: 'coord2', name: 'Coordenada 2 (Norte)', builtin: 'coord2', source: 'manual', enabled: true,  show_in_ficha: true },
    { id: 'cota',   name: 'Cota',                  builtin: 'cota',   source: 'manual', enabled: false, show_in_ficha: false },
    { id: 'sector', name: 'Sector',                builtin: 'sector', source: 'area',   enabled: true,  show_in_ficha: true, tolerance_m: 0 },
  ];
}

/** Devuelve las columnas configuradas; si no hay ninguna, los defaults. */
export function topoColumns(flags: ProjectFeatureFlags): TopoColumn[] {
  return (flags.topo_columns && flags.topo_columns.length > 0) ? flags.topo_columns : defaultTopoColumns();
}
