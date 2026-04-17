// ─── Tipos centrales de S-CUA Web ────────────────────────────────────────────
// Mapeados 1:1 con las tablas de Supabase (y los modelos WatermelonDB del APK)

export type UserRole = 'CREATOR' | 'RESIDENT' | 'SUPERVISOR' | 'OPERATOR';

export interface User {
  id: string;
  name: string;
  apellido: string | null;
  email: string;
  role: UserRole;
  full_name: string;
  signature_s3_key: string | null;
  created_at: string;
  updated_at: string;
}

export interface Project {
  id: string;
  name: string;
  status: string;
  password: string | null;
  created_by_id: string | null;
  logo_s3_key: string | null;
  stamp_comment: string | null;
  created_at: string;
  updated_at: string;
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
  created_at: string;
  updated_at: string;
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
  signed_by_id: string | null;
  signed_at: string | null;
  filled_by_id: string | null;
  filled_at: string | null;
  submitted_at: string | null;
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
  protocol_id: string;
  description: string;
  status: 'OPEN' | 'CLOSED';
  created_at: string;
  updated_at: string;
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
  created_at: string;
  updated_at: string;
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
  user_id: string;
  text: string;
  created_at: string;
  updated_at: string;
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
