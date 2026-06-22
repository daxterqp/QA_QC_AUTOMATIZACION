import { Model } from '@nozbe/watermelondb';
import { field, date, readonly, relation, children } from '@nozbe/watermelondb/decorators';
import type Project from './Project';
import type Location from './Location';
import type ProtocolItem from './ProtocolItem';

export type ProtocolStatus = 'DRAFT' | 'IN_PROGRESS' | 'SUBMITTED' | 'APPROVED' | 'REJECTED';
export type UploadStatus = 'PENDING' | 'SYNCED';

export default class Protocol extends Model {
  static table = 'protocols';

  static associations = {
    projects: { type: 'belongs_to' as const, key: 'project_id' },
    locations: { type: 'belongs_to' as const, key: 'location_id' },
    protocol_items: { type: 'has_many' as const, foreignKey: 'protocol_id' },
  };

  @field('project_id') projectId!: string;
  @field('location_id') locationId!: string | null;
  @field('template_id') templateId!: string | null;
  @field('status') status!: ProtocolStatus;
  @field('protocol_number') protocolNumber!: string;
  @field('location_reference') locationReference!: string;
  @field('latitude') latitude!: number | null;
  @field('longitude') longitude!: number | null;
  @field('is_locked') isLocked!: boolean;
  @field('corrections_allowed') correctionsAllowed!: boolean;
  @field('signed_by_id') signedById!: string | null;
  @field('signed_at') signedAt!: number | null;
  @field('filled_by_id') filledById!: string | null;
  @field('filled_at') filledAt!: number | null;
  @field('submitted_at') submittedAt!: number | null;
  @field('rejection_reason') rejectionReason!: string | null;
  @field('general_comment') generalComment!: string | null;
  @field('approval_reason') approvalReason!: string | null; // v33: motivo al aprobar fuera de rango
  // v21 — soporte de carga histórica
  @field('external_id') externalId!: string | null;
  @field('imported_at') importedAt!: number | null;
  @field('imported_by_id') importedById!: string | null;
  @field('is_historical') isHistorical!: boolean;
  @field('upload_status') uploadStatus!: UploadStatus;
  // v26 — Módulo GIS
  @field('coord_captured_at') coordCapturedAt!: number | null;
  @field('coord_captured_by_id') coordCapturedById!: string | null;
  @field('coord_accuracy_m') coordAccuracyM!: number | null;
  // v35 — captura de precisión por promediado de waypoints
  @field('coord_method') coordMethod!: string | null;            // 'single' | 'averaged' | 'rtk'
  @field('coord_sample_count') coordSampleCount!: number | null;
  @field('coord_precision_m') coordPrecisionM!: number | null;
  @field('coord_backup_lat') coordBackupLat!: number | null;
  @field('coord_backup_lng') coordBackupLng!: number | null;
  @field('coord_backup_captured_at') coordBackupCapturedAt!: number | null;
  @field('sector_id') sectorId!: string | null;
  @field('sector_assigned_manually') sectorAssignedManually!: boolean;
  // v31 — modos de llenado + codificación correlativa (Partes D+E)
  /** Código correlativo del ensayo (p.ej. PR-260032). Único por proyecto. */
  @field('protocol_code') protocolCode!: string | null;
  /** Fecha del ENSAYO (YYYY-MM-DD; ≠ fecha de carga) — modo "por fecha". */
  @field('ensayo_date') ensayoDate!: string | null;
  /** v32 — Hora de INICIO del ensayo (HH:MM, editable al crear). */
  @field('ensayo_time') ensayoTime!: string | null;
  /** v43 — Muestra física vinculada (módulo "ensayos por muestra"). */
  @field('sample_id') sampleId!: string | null;
  /** v42 — Snapshot JSON de los llamados entre ensayos (@código.celda) congelado
   *  al ENVIAR: {"código.celda":{sourceId,sourceUpdatedAt,value,status}}. */
  @field('xref_snapshot_json') xrefSnapshotJson!: string | null;

  @readonly @date('created_at') createdAt!: Date;
  @readonly @date('updated_at') updatedAt!: Date;

  @relation('projects', 'project_id') project!: Project;
  @relation('locations', 'location_id') location!: Location;
  @children('protocol_items') items!: ProtocolItem[];
}
