// ─── Tipos centrales de S-CUA Web ────────────────────────────────────────────
// Mapeados 1:1 con las tablas de Supabase (y los modelos WatermelonDB del APK)

export type UserRole = 'CREATOR' | 'RESIDENT' | 'SUPERVISOR' | 'OPERATOR';

export interface User {
  id: string;
  name: string;
  apellido: string | null;
  role: UserRole;
  password: string | null;
  pin: string | null;
  signature_uri: string | null;
  created_at: number;
  updated_at: number;
}

export type CoordinateSystem = 'WGS84_LATLNG' | 'WGS84_UTM' | 'PSAD56_LATLNG' | 'PSAD56_UTM';

/**
 * v29 — Reestructura: 3 grupos visibles en UI (Protocolos, Trazabilidad,
 * Geolocalización). Los flags que antes eran configurables pero forman parte
 * del funcionamiento estándar quedan @deprecated y se consideran siempre true.
 */
// ── v45.3 — Agrupamientos (presets) de protocolos (espejo de src/utils/featureFlags.ts) ──
export type GroupingCmp = '=' | '!=' | '<' | '<=' | '>' | '>=' | '~';
export interface GroupingFilterClause { field: string; op: GroupingCmp; value: string }
export interface GroupingPreset {
  id: string; name: string;
  source_tipo?: string;
  last_n?: number; last_days?: number; date_from?: string; date_to?: string;
  same_sector?: boolean; same_sample?: boolean; same_location?: boolean;
  label?: string; order?: 'reciente' | 'antiguo';
  filters?: GroupingFilterClause[]; exclude_codes?: string[];
}

export interface ProjectFeatureFlags {
  // ── Configuración de Protocolos ─────────────────────────────────────
  classic_protocols: boolean;
  numeric_protocols: boolean;
  parametric_templates: boolean;
  historical_import: boolean;
  multi_level_approval: boolean;
  approval_levels: 1 | 2 | 3;

  // ── Llenado de protocolos (v31, Partes D+E) — conviven entre sí; el
  //    modo "por ubicación" es el default y SIEMPRE está activo ─────────
  fill_by_sector: boolean;
  fill_by_type: boolean;
  fill_by_date: boolean;
  /** v43 — Ensayos por MUESTRA física (módulo nuevo). */
  fill_by_sample: boolean;
  /** Codificación correlativa de ensayos (PR-260032). */
  protocol_codes: boolean;
  /** Máscara del código: {TIPO} {AA} {AAAA} {MM} {DD} {SEQ:n} {SECTOR}. */
  coding_mask_default: string;
  /** v46.1 — Máscara ESPECÍFICA por tipo de ficha (id_protocolo). Si falta, usa la global. */
  coding_mask_by_type?: Record<string, string>;
  /** v46.1 — Ámbito de reinicio del correlativo: 'year' (def) | 'year_sector' | 'year_month'. */
  coding_seq_reset?: 'year' | 'year_sector' | 'year_month';

  // ── v43 — Módulos opcionales del proyecto (visibilidad en el menú móvil) ──
  module_protocols_by_location: boolean;
  module_plans: boolean;
  module_contacts: boolean;
  module_summary_tables: boolean;

  /** v45.3 — Agrupamientos del selector de llamadas entre fichas, por tipo de ficha. */
  grouping_presets?: Record<string, GroupingPreset[]>;

  // ── Módulo de Trazabilidad (padre + hijos) ──────────────────────────
  traceability_module: boolean;
  equipment_catalog: boolean;
  traceability_gps_polling: 'off' | 'foreground' | 'background';
  traceability_gps_interval_seconds: number;
  anonymize_traceability: boolean;

  // ── Módulo de Geolocalización (padre + hijos) ───────────────────────
  map_enabled: boolean;
  gps_capture_subjective: boolean;
  gps_capture_numeric: boolean;
  coordinate_system: CoordinateSystem;

  // ── @deprecated — siempre considerados true. No mostrar en UI ───────
  /** @deprecated v29 */ plans_pdf?: boolean;
  /** @deprecated v29 */ advanced_charts?: boolean;
  /** @deprecated v29 */ normas?: boolean;
  /** @deprecated v29 */ phone_contacts?: boolean;
  /** @deprecated v29 */ qr_codes?: boolean;
  /** @deprecated v29 */ protocol_linking?: boolean;
}

export const DEFAULT_FEATURE_FLAGS: ProjectFeatureFlags = {
  classic_protocols: true,
  numeric_protocols: false,
  parametric_templates: false,
  historical_import: false,
  multi_level_approval: false,
  approval_levels: 1,

  fill_by_sector: false,
  fill_by_type: false,
  fill_by_date: false,
  fill_by_sample: false,
  protocol_codes: false,
  coding_mask_default: '{TIPO}-{AA}{SEQ:4}',

  // v43 — Módulos opcionales: ubicación ON; resto OFF.
  module_protocols_by_location: true,
  module_plans: false,
  module_contacts: false,
  module_summary_tables: false,

  traceability_module: false,
  equipment_catalog: false,
  traceability_gps_polling: 'off',
  traceability_gps_interval_seconds: 3,
  anonymize_traceability: false,

  map_enabled: false,
  gps_capture_subjective: false,
  gps_capture_numeric: false,
  coordinate_system: 'WGS84_LATLNG',

  // @deprecated — defaults true para que cualquier consumidor reciba true.
  plans_pdf: true,
  advanced_charts: true,
  normas: true,
  phone_contacts: true,
  qr_codes: true,
  protocol_linking: true,
};

/** Merge un set parcial con los defaults — útil al leer projects.feature_flags.
 *  v29 — Los @deprecated SIEMPRE retornan true, sin importar lo persistido. */
export function mergeFeatureFlags(partial: Partial<ProjectFeatureFlags> | null | undefined): ProjectFeatureFlags {
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

// ── Helpers padre-hijo ──────────────────────────────────────────────────

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

export interface Project {
  id: string;
  name: string;
  status: string;
  password: string | null;
  created_by_id: string | null;
  logo_s3_key: string | null;
  stamp_comment: string | null;
  feature_flags: ProjectFeatureFlags | null;
  /** v26 — URL custom de tile server XYZ para ortofoto (opcional). */
  map_tile_url?: string | null;
  /** v33 — Ortofoto cargada como imagen (ImageOverlay en el mapa GIS). */
  orthophoto_s3_key?: string | null;
  /** Bounding box WGS84 [[southLat,westLng],[northLat,eastLng]]. */
  orthophoto_bounds_json?: [[number, number], [number, number]] | null;
  /** Sistema de coordenadas ORIGINAL en que se georreferenció (informativo). */
  orthophoto_system?: string | null;
  /** v36 — todas las versiones de ortofoto del proyecto. La activa se desnormaliza
   *  en orthophoto_s3_key/bounds/system (lo que lee el mapa). */
  orthophotos_json?: OrthophotoVersion[] | null;
  orthophoto_active_id?: string | null;
  /** v37 — teselas de la versión ACTIVA (1 para simple, N para teselado NxN).
   *  Es lo que renderiza el mapa (una capa por tesela). */
  orthophoto_tiles_json?: OrthophotoTile[] | null;
  created_at: string;
  updated_at: string;
}

/** v37 — Una tesela de ortofoto (porción georreferenciada). */
export interface OrthophotoTile {
  s3Key: string;
  bounds: [[number, number], [number, number]];
}

/** v36 — Una versión de ortofoto cargada (multi-versión por proyecto). */
export interface OrthophotoVersion {
  id: string;
  label: string;
  s3Key: string;
  bounds: [[number, number], [number, number]];
  system: string;
  /** v37 — teselas (1 si simple, N si teselado). El mapa renderiza una capa por tesela. */
  tiles?: OrthophotoTile[];
  grid?: number;
  sourceName?: string;
  outBytes?: number;
  width?: number;
  height?: number;
  createdAt: number;
}

/** v26 — Sector/zona de un proyecto.
 *  Con geometría: participa en auto-asignación por GPS (point-in-polygon).
 *  Sin geometría (points_json=null): solo aparece en dropdown para selección manual. */
export interface ProjectSector {
  id: string;
  project_id: string;
  name: string;
  /** Array `[{lat,lng}, ...]` en WGS84. NULL = sector solo-nombre. */
  points_json: { lat: number; lng: number }[] | null;
  display_color: string | null;
  source_system: string | null;
  created_at: number;
  updated_at: number;
}

// ─── v27 — Módulo Trazabilidad Operacional ───────────────────────────────────

export type ActivityKind = 'productive' | 'maintenance' | 'transport' | 'other';
export type WorkSessionStatus = 'ACTIVE' | 'PAUSED' | 'CLOSED';
export type WorkSessionIntervalKind = 'active' | 'paused';

export interface Activity {
  id: string;
  project_id: string;
  name: string;
  kind: ActivityKind;
  created_at: number;
  updated_at: number;
}

export interface EquipmentActivity {
  id: string;
  equipment_id: string;
  activity_id: string;
  form_template_id: string | null;
  created_at: number;
  updated_at: number;
}

export interface WorkShift {
  id: string;
  project_id: string;
  name: string;
  start_hour: number;
  end_hour: number;
  created_at: number;
  updated_at: number;
}

export interface SessionFormTemplate {
  id: string;
  project_id: string;
  name: string;
  created_at: number;
  updated_at: number;
}

export interface SessionFormTemplateItem {
  id: string;
  template_id: string;
  partida_item: string | null;
  item_description: string;
  validation_method: string | null;
  section: string | null;
  created_at: number;
  updated_at: number;
}

export interface WorkSession {
  id: string;
  project_id: string;
  user_id: string;
  equipment_id: string;
  activity_id: string;
  sector_id: string | null;
  shift_id: string | null;
  started_at: number;
  ended_at: number | null;
  status: WorkSessionStatus;
  started_on_device_id: string | null;
  auto_closed: boolean;
  notes: string | null;
  created_at: number;
  updated_at: number;
}

export interface WorkSessionInterval {
  id: string;
  session_id: string;
  kind: WorkSessionIntervalKind;
  started_at: number;
  ended_at: number | null;
  created_at: number;
}

export interface WorkSessionFormItem {
  id: string;
  session_id: string;
  template_item_id: string | null;
  partida_item: string | null;
  item_description: string;
  validation_method: string | null;
  value_text: string | null;
  value_number: number | null;
  comments: string | null;
  created_at: number;
  updated_at: number;
}

export interface WorkSessionGpsPoint {
  id: string;
  session_id: string;
  captured_at: number;
  latitude: number;
  longitude: number;
  accuracy_m: number | null;
  created_at: number;
}

export interface UserProjectAccess {
  id: string;
  user_id: string;
  project_id: string;
  created_at: string;
}

export interface Location {
  id: string;
  project_id: string;
  name: string;
  location_only: string | null;
  specialty: string | null;
  reference_plan: string;
  template_ids: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProtocolTemplate {
  id: string;
  project_id: string;
  id_protocolo: string;
  name: string;
  /** v39 — tipo de ensayo oculto: no creable, pero sus registros siguen visibles. */
  is_hidden?: boolean | null;
  created_at: string;
  updated_at: string;
}

/** v41 — Tabla auxiliar de laboratorio a nivel proyecto (grupo: taras, moldes…). */
export interface LabAuxTable {
  id: string;
  project_id: string;
  group_key: string;               // identificador, ej. 'taras'
  name: string | null;
  columns_json: string[];          // ["Codigo","Malla","Abertura"]
  rows_json: string[][];           // [["1","N1","45"], ...]
  last_calibration_at: number | null;
  next_calibration_at: number | null;
  created_at: number;
  updated_at: number;
}

export interface ProtocolTemplateItem {
  id: string;
  template_id: string;
  partida_item: string | null;
  item_description: string;
  validation_method: string | null;
  section: string | null;
  created_at: string;
  updated_at: string;
}

export type ProtocolStatus = 'DRAFT' | 'IN_PROGRESS' | 'SUBMITTED' | 'APPROVED' | 'REJECTED';

export interface Protocol {
  id: string;
  project_id: string;
  location_id: string | null;
  template_id: string | null;
  protocol_number: string | null;
  location_reference: string | null;
  status: ProtocolStatus;
  rejection_reason: string | null;
  general_comment: string | null;
  /** v33 — motivo cuando se aprueba un ensayo fuera de rango (override del jefe). */
  approval_reason?: string | null;
  signed_by_id: string | null;
  signed_at: string | null;
  filled_by_id: string | null;
  filled_at: string | null;
  submitted_at: string | null;
  is_locked?: boolean;
  /** Trazabilidad de import histórico (null/false para instancias creadas in-app). */
  external_id?: string | null;
  imported_at?: number | null;
  imported_by_id?: string | null;
  is_historical?: boolean;
  // v26 — Módulo GIS (latitude/longitude ya existían pre-v26 pero ahora sí se usan)
  latitude?: number | null;
  longitude?: number | null;
  coord_captured_at?: number | null;
  coord_captured_by_id?: string | null;
  coord_accuracy_m?: number | null;
  /** v35 — captura de precisión por promediado de waypoints. */
  coord_method?: string | null;
  coord_sample_count?: number | null;
  coord_precision_m?: number | null;
  coord_backup_lat?: number | null;
  coord_backup_lng?: number | null;
  coord_backup_captured_at?: number | null;
  sector_id?: string | null;
  // v31 — modos de llenado + codificación correlativa (Partes D+E)
  /** Código correlativo del ensayo (p.ej. PR-260032). Único por proyecto. */
  protocol_code?: string | null;
  /** Fecha del ENSAYO (YYYY-MM-DD) — agrupador del modo "por fecha". */
  ensayo_date?: string | null;
  /** v32 — Hora de INICIO del ensayo (HH:MM, editable al crear). */
  ensayo_time?: string | null;
  sector_assigned_manually?: boolean;
  created_at: string;
  updated_at: string;
}

export interface ProtocolItem {
  id: string;
  protocol_id: string;
  partida_item: string | null;
  item_description: string;
  validation_method: string | null;
  section: string | null;
  /** true = Sí cumple, false = No cumple, null = sin respuesta */
  is_compliant: boolean | null;
  /** true = No Aplica */
  is_na: boolean;
  /** true = ítem fue respondido */
  has_answer: boolean;
  comments: string | null;
  created_at: string;
  updated_at: string;
}

export interface Evidence {
  id: string;
  protocol_item_id: string;
  local_uri: string;
  s3_key: string | null;
  s3_url_placeholder?: string | null;
  file_name?: string | null;
  upload_status: string;
  created_at: string | number;
  updated_at: string | number;
}

export interface NonConformity {
  id: string;
  project_id: string;
  protocol_id: string;
  description: string;
  status: 'OPEN' | 'RESOLVED';
  raised_by_id: string;
  resolution_notes: string | null;
  created_at: number;
  updated_at: number;
}

export interface Plan {
  id: string;
  project_id: string;
  location_id: string | null;
  name: string;
  s3_key: string | null;
  file_type: string | null;
  s3_etag: string | null;
  created_at: string;
  updated_at: string;
}

export type Priority = 'low' | 'medium' | 'high';

export interface PlanAnnotation {
  id: string;
  plan_id: string;
  protocol_id: string | null;
  created_by_id: string | null;
  rect_x: number;
  rect_y: number;
  rect_width: number;
  rect_height: number;
  comment: string | null;
  sequence_number: number;
  is_ok: boolean;
  status: string | null;
  page: number | null;
  /** Nivel de urgencia: 'low' | 'medium' | 'high' | null (sin prioridad) */
  priority: Priority | null;
  created_at: string;
  updated_at: string;
}

/**
 * Medición sobre un plano (line / calibration / polygon / polyline).
 * Sincroniza con Supabase desde v19.1 (ver supabase/plan_measurements_sync_migration.sql).
 */
export interface PlanMeasurement {
  id: string;
  plan_id: string;
  type: 'line' | 'calibration' | 'polygon' | 'polyline' | string;
  /** JSON stringificado con puntos y resultados calculados */
  data: string;
  /** Píxeles por metro según la calibración vigente cuando se creó */
  calibration_scale: number;
  /** Página del PDF (1-based) */
  page: number;
  created_at: number;
  updated_at: number;
}

export interface AnnotationCommentPhoto {
  id: string;
  annotation_comment_id: string;
  local_uri: string;
  storage_path: string | null;
  created_at: string;
  updated_at: string;
}

export interface AnnotationComment {
  id: string;
  annotation_id: string;
  author_id: string | null;
  content: string | null;
  read_by_creator: boolean;
  photos?: AnnotationCommentPhoto[];
  created_at: string;
  updated_at: string;
}

export interface DashboardNote {
  id: string;
  project_id: string;
  created_by_id: string;
  content: string;
  created_at: number;
  updated_at: number;
}

export interface PhoneContact {
  id: string;
  project_id: string;
  name: string;
  phone: string;
  role: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

// ─── Catálogo de equipos (v24 + v28 categoría) ──────────────────────────────
export type EquipmentType =
  // Laboratorio (calibrables)
  | 'balanza' | 'prensa' | 'horno' | 'tamiz' | 'termometro'
  // Maquinaria pesada (Trazabilidad operacional)
  | 'excavadora' | 'compactador' | 'motoniveladora' | 'retroexcavadora'
  | 'cargador_frontal' | 'volquete' | 'cisterna' | 'rodillo'
  | 'otros';
export type EquipmentStatus = 'active' | 'inactive' | 'retired';
export type EquipmentCategory = 'laboratorio' | 'maquinaria_pesada';

export interface Equipment {
  id: string;
  project_id: string;
  code: string;
  name: string;
  type: EquipmentType;
  /** v28 — laboratorio (default) | maquinaria_pesada */
  category: EquipmentCategory;
  brand: string | null;
  model: string | null;
  serial: string | null;
  capacity: string | null;
  resolution: string | null;
  last_calibration_at: number | null;
  next_calibration_at: number;
  calibration_certificate_s3: string | null;
  status: EquipmentStatus;
  notes: string | null;
  created_at: number;
  updated_at: number;
}

/** Estado de calibración derivado por la UI a partir de next_calibration_at. */
export type CalibrationState = 'ok' | 'soon' | 'expired';

export function calibrationState(eq: Pick<Equipment, 'next_calibration_at'>, nowMs = Date.now()): CalibrationState {
  const days = (eq.next_calibration_at - nowMs) / 86400000;
  if (days < 0) return 'expired';
  if (days < 30) return 'soon';
  return 'ok';
}

export interface ProtocolEquipment {
  id: string;
  protocol_id: string;
  equipment_id: string;
  used_at: number;
  created_at: number;
}
