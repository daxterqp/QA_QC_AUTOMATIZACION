export type RootStackParamList = {
  RoleSelect: undefined;

  // ── Jefe (RESIDENT) ───────────────────────────────────────────────────────
  ProjectList: undefined;
  ExcelImport: { projectId: string; projectName: string };
  LocationsImport: { projectId: string; projectName: string };
  ProtocolAudit: { protocolId: string };
  NonConformity: { protocolId: string; projectId: string };

  // ── Compartida (todos los roles) ──────────────────────────────────────────
  ProtocolList: { projectId: string; projectName: string };
  ProtocolFill: { protocolId: string };

  // ── Camara ────────────────────────────────────────────────────────────────
  Camera: { protocolItemId: string };
};
