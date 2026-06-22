import { Model } from '@nozbe/watermelondb';
import { field, date, readonly } from '@nozbe/watermelondb/decorators';

export type SyncOpType =
  | 'PUSH_PROTOCOL_ITEM'
  | 'PUSH_PROTOCOL_STATUS'
  /** v32b — Eliminación completa de un ensayo (evidencias + items + approvals + protocolo). */
  | 'DELETE_PROTOCOL'
  | 'PUSH_APPROVAL'
  | 'PUSH_EVIDENCE'
  | 'PUSH_NC'
  | 'UPLOAD_PHOTO'
  // v26 — Módulo GIS
  | 'PUSH_PROJECT_SECTOR'
  | 'DELETE_PROJECT_SECTOR'
  // v27 — Trazabilidad Operacional
  | 'PUSH_ACTIVITY'
  | 'DELETE_ACTIVITY'
  | 'PUSH_EQUIPMENT_ACTIVITY'
  | 'DELETE_EQUIPMENT_ACTIVITY'
  | 'PUSH_WORK_SHIFT'
  | 'DELETE_WORK_SHIFT'
  | 'PUSH_SESSION_FORM_TEMPLATE'
  | 'PUSH_SESSION_FORM_TEMPLATE_ITEM'
  | 'PUSH_WORK_SESSION'
  | 'DELETE_WORK_SESSION'
  | 'PUSH_WORK_SESSION_INTERVAL'
  | 'PUSH_WORK_SESSION_FORM_ITEM'
  | 'PUSH_WORK_SESSION_GPS_BATCH'
  // v42 — Tablas Resumen con reintento (antes era push fire-and-forget sin retry).
  | 'PUSH_SUMMARY_ROW';

export type SyncStatus = 'PENDING' | 'PROCESSING' | 'FAILED_PERMANENT';

/** Fila de la cola de sincronización offline.
 *  Cada fila representa UNA operación pendiente. El SyncWorker drena la cola
 *  cuando hay red, con retry + backoff exponencial. */
export default class SyncQueueItem extends Model {
  static table = 'sync_queue';

  @field('op_type') opType!: SyncOpType;
  @field('entity_id') entityId!: string;
  @field('project_id') projectId!: string;
  /** JSON serializado con params extra del handler (opcional). */
  @field('payload_json') payloadJson!: string | null;
  @field('attempts') attempts!: number;
  @field('next_attempt_at') nextAttemptAt!: number;
  @field('last_error') lastError!: string | null;
  @field('status') status!: SyncStatus;

  @readonly @date('created_at') createdAt!: Date;
  @readonly @date('updated_at') updatedAt!: Date;
}
