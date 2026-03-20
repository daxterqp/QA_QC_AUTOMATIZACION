export type RootStackParamList = {
  // ── Auth ──────────────────────────────────────────────────────────────────
  Login: undefined;

  // ── Compartida (todos los roles) ──────────────────────────────────────────
  ProjectList: undefined;
  LocationList: { projectId: string; projectName: string };
  LocationProtocols: { locationId: string; locationName: string; projectId: string; projectName: string };
  ProtocolList: { projectId: string; projectName: string };
  ProtocolFill: { protocolId: string };
  Historical: { projectId?: string };
  ChangePassword: undefined;

  // ── Camara ────────────────────────────────────────────────────────────────
  Camera: { protocolItemId?: string; annotationCommentId?: string };

  // ── Jefe (RESIDENT) + Creador ──────────────────────────────────────────────
  ExcelImport: { projectId: string; projectName: string };
  LocationsImport: { projectId: string; projectName: string };
  ProtocolAudit: { protocolId: string };
  NonConformity: { protocolId: string; projectId: string };
  Dossier: { projectId: string; projectName: string };
  PlansManagement: { projectId: string; projectName: string };
  PlanViewer: { planId: string; planName: string; protocolId?: string; annotationId?: string; locationId?: string };
  AnnotationComments: { projectId: string; projectName: string };

  // ── Creador ────────────────────────────────────────────────────────────────
  UserManagement: undefined;
};
