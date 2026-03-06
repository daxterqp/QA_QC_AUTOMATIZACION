// ─── Enums reutilizables ────────────────────────────────────────────────────

export type ProjectStatus = 'ACTIVE' | 'CLOSED';

export type ProtocolStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

/** Estado de subida a S3. Renombrado desde SyncStatus para evitar
 *  conflicto con la propiedad interna syncStatus de WatermelonDB.Model */
export type UploadStatus = 'PENDING' | 'SYNCED';

// ─── Roles de usuario (para integracion con Cognito en Fase 4) ──────────────

export type UserRole = 'OPERATOR' | 'SUPERVISOR' | 'RESIDENT';

// ─── DTOs para sincronizacion con el backend ─────────────────────────────────

export interface SyncProtocolDTO {
  localId: string;
  projectId: string;
  protocolNumber: string;
  locationReference: string;
  latitude: number | null;
  longitude: number | null;
  status: ProtocolStatus;
  items: SyncProtocolItemDTO[];
  createdAt: number;
}

export interface SyncProtocolItemDTO {
  localId: string;
  itemDescription: string;
  isCompliant: boolean;
  comments: string | null;
  evidences: SyncEvidenceDTO[];
}

export interface SyncEvidenceDTO {
  localId: string;
  localUri: string;
  s3Key?: string; // Se llena despues de subir a S3
}

// ─── Respuesta del backend para presigned URLs ────────────────────────────────

export interface PresignedUrlResponse {
  evidenceLocalId: string;
  uploadUrl: string;  // PUT directo a S3
  s3Key: string;
}
