export type RootStackParamList = {
  // ── Auth ──────────────────────────────────────────────────────────────────
  Login: undefined;

  // ── Compartida (todos los roles) ──────────────────────────────────────────
  ProjectList: undefined;
  LocationList: { projectId: string; projectName: string };
  LocationProtocols: { locationId: string; locationName: string; projectId: string; projectName: string };
  /** v31 (Parte D) — modos de llenado adicionales: por sector / tipo / fecha. */
  Ensayos: { projectId: string; projectName: string; mode: 'sector' | 'type' | 'date' };
  SummaryTables: { projectId: string; projectName: string };
  /** v43 — Ensayos por MUESTRA física: lista de muestras y detalle. */
  Samples: { projectId: string; projectName: string };
  SampleDetail: { projectId: string; projectName: string; sampleId: string };
  /** v43 — Papelera de Reciclaje: ensayos eliminados (solo lectura). */
  RecycleBin: { projectId: string; projectName: string };
  ProtocolList: { projectId: string; projectName: string };
  /** v32b — sectorLocked: al entrar desde "Ensayos por sector" el selector de
   *  sector del GPS queda fijo (ya se sabe el sector; no se recalcula). */
  ProtocolFill: { protocolId: string; sectorLocked?: boolean };
  Historical: { projectId?: string };
  ChangePassword: undefined;
  Signature: undefined;
  Info: { kind: 'about' | 'contact' };

  // ── Camara ────────────────────────────────────────────────────────────────
  Camera: { protocolItemId?: string; annotationCommentId?: string; extraPhotoProtocolId?: string; projectId?: string };

  // ── QR Scanner (FASE 7) ───────────────────────────────────────────────────
  QRScanner: undefined;

  // ── Jefe (RESIDENT) + Creador ──────────────────────────────────────────────
  ExcelImport: { projectId: string; projectName: string };
  LocationsImport: { projectId: string; projectName: string };
  ProtocolAudit: { protocolId: string };
  NonConformity: { protocolId: string; projectId: string };
  Dossier: { projectId: string; projectName: string };
  PlansManagement: { projectId: string; projectName: string; mode?: 'viewer' | 'measure' };
  FileUpload: { projectId: string; projectName: string };
  PlanViewer: { planId: string; planName: string; protocolId?: string; annotationId?: string; locationId?: string };
  Measurement: { planId: string; planName: string };
  AnnotationComments: { projectId: string; projectName: string };

  // ── Creador ────────────────────────────────────────────────────────────────
  UserManagement: undefined;
  ProjectConfig: { projectId: string; projectName: string };

  PhoneContacts: { projectId: string; projectName: string };

  // ── PDF Preview ────────────────────────────────────────────────────────────
  DossierPreview: { pdfUri: string; projectName: string };

  // ── v26 — GIS ─────────────────────────────────────────────────────────────
  ProjectMap: { projectId: string; projectName: string };
  ProjectSectors: { projectId: string; projectName: string };

  // ── v27 — Trazabilidad Operacional ────────────────────────────────────────
  TraceabilityHome: { projectId: string; projectName: string };
  TraceabilityCapture: { projectId: string; projectName: string };
  TraceabilityRunning: { sessionId: string };
  WorkSessionDetail: { sessionId: string };
  // v29 — Vistas analíticas (CREATOR/JEFE)
  TraceabilityAnalytics: { projectId: string; projectName: string };
  // v30 — Checklist intermedio antes de iniciar sesión (cuando actividad tiene template)
  TraceabilityChecklist: {
    sessionInput: {
      projectId: string;
      userId: string;
      equipmentId: string;
      activityId: string;
      sectorId: string | null;
      shiftId: string | null;
      deviceId: string;
      gpsPolling: 'off' | 'foreground' | 'background';
      gpsIntervalSeconds: number;
    };
    templateName: string | null;
    items: Array<{
      templateItemId: string | null;
      partidaItem: string | null;
      itemDescription: string;
      validationMethod: string | null;
      section: string | null;
    }>;
  };
  // v30 — Vista read-only del checklist lleno
  ChecklistView: { sessionId: string };
  // v30 — Toma forzada con foto obligatoria del equipo
  ForceTakeoverPhoto: {
    prevSessionId: string;
    newSessionInput: {
      projectId: string;
      userId: string;
      equipmentId: string;
      activityId: string;
      sectorId: string | null;
      shiftId: string | null;
      deviceId: string;
      gpsPolling: 'off' | 'foreground' | 'background';
      gpsIntervalSeconds: number;
    };
  };

  // ── v28 — Menú intermedio del proyecto ────────────────────────────────────
  ProjectMenu: { projectId: string; projectName: string };
};
