// ─── Tipos centrales de S-CUA Web ────────────────────────────────────────────
// Mapeados 1:1 con las tablas de Supabase (y los modelos WatermelonDB del APK)

export type UserRole = 'CREATOR' | 'RESIDENT' | 'INSPECTOR' | 'VIEWER';

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
  description: string | null;
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

export type ProtocolStatus = 'PENDING' | 'IN_PROGRESS' | 'APPROVED' | 'REJECTED' | 'OBSERVED';

export interface Protocol {
  id: string;
  project_id: string;
  location_id: string | null;
  template_id: string | null;
  protocol_number: string | null;
  status: ProtocolStatus;
  observations: string | null;
  signed_by_id: string | null;
  signed_at: string | null;
  created_by_id: string | null;
  created_at: string;
  updated_at: string;
}

export type ItemStatus = 'PENDING' | 'OK' | 'OBSERVED' | 'NOK';

export interface ProtocolItem {
  id: string;
  protocol_id: string;
  template_item_id: string | null;
  partida_item: string | null;
  item_description: string;
  validation_method: string | null;
  section: string | null;
  status: ItemStatus;
  observations: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface Evidence {
  id: string;
  protocol_item_id: string;
  local_uri: string | null;
  s3_key: string | null;
  file_name: string | null;
  created_at: string;
  updated_at: string;
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
  name: string;
  s3_key: string | null;
  file_type: string | null;
  created_at: string;
  updated_at: string;
}

export interface PlanAnnotation {
  id: string;
  plan_id: string;
  created_by_id: string | null;
  annotation_data: string | null;
  x: number;
  y: number;
  label: string | null;
  color: string | null;
  status: string | null;
  created_at: string;
  updated_at: string;
}

export interface AnnotationComment {
  id: string;
  annotation_id: string;
  user_id: string | null;
  text: string;
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
