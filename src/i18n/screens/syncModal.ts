/**
 * i18n (v46) — Cadenas del SyncStatusModal (detalle de la cola de sincronización).
 * Namespace: syncModal. Solo UI visible al usuario (NO toca op_type/enums/AsyncStorage/console/datos).
 */
const syncModal: Record<string, { es: string; en: string; pt: string }> = {
  // OP_LABELS — resumen por tipo de operación en cola
  'syncModal.op.protocolItem': { es: 'Items de protocolo', en: 'Protocol items', pt: 'Itens de protocolo' },
  'syncModal.op.protocolStatus': { es: 'Estados de protocolo', en: 'Protocol statuses', pt: 'Status de protocolo' },
  'syncModal.op.deleteTest': { es: 'Eliminación de ensayos', en: 'Test deletions', pt: 'Exclusão de ensaios' },
  'syncModal.op.approvals': { es: 'Aprobaciones', en: 'Approvals', pt: 'Aprovações' },
  'syncModal.op.evidence': { es: 'Evidencias (metadata)', en: 'Evidence (metadata)', pt: 'Evidências (metadados)' },
  'syncModal.op.nc': { es: 'No conformidades', en: 'Nonconformities', pt: 'Não conformidades' },
  'syncModal.op.photos': { es: 'Fotos a S3', en: 'Photos to S3', pt: 'Fotos para S3' },
  'syncModal.op.gisSectors': { es: 'Sectores GIS', en: 'GIS sectors', pt: 'Setores GIS' },
  'syncModal.op.gisSectorsDelete': { es: 'Sectores GIS (delete)', en: 'GIS sectors (delete)', pt: 'Setores GIS (delete)' },
  'syncModal.op.activities': { es: 'Actividades', en: 'Activities', pt: 'Atividades' },
  'syncModal.op.activitiesDelete': { es: 'Actividades (delete)', en: 'Activities (delete)', pt: 'Atividades (delete)' },
  'syncModal.op.equipmentActivity': { es: 'Equipo-Actividad', en: 'Equipment-Activity', pt: 'Equipamento-Atividade' },
  'syncModal.op.equipmentActivityDelete': { es: 'Equipo-Actividad (delete)', en: 'Equipment-Activity (delete)', pt: 'Equipamento-Atividade (delete)' },
  'syncModal.op.workShifts': { es: 'Turnos', en: 'Shifts', pt: 'Turnos' },
  'syncModal.op.workShiftsDelete': { es: 'Turnos (delete)', en: 'Shifts (delete)', pt: 'Turnos (delete)' },
  'syncModal.op.formTemplates': { es: 'Plantillas formulario', en: 'Form templates', pt: 'Modelos de formulário' },
  'syncModal.op.templateItems': { es: 'Items plantilla', en: 'Template items', pt: 'Itens de modelo' },
  'syncModal.op.sessions': { es: 'Sesiones', en: 'Sessions', pt: 'Sessões' },
  'syncModal.op.sessionsDelete': { es: 'Sesiones (delete)', en: 'Sessions (delete)', pt: 'Sessões (delete)' },
  'syncModal.op.sessionIntervals': { es: 'Intervalos sesión', en: 'Session intervals', pt: 'Intervalos de sessão' },
  'syncModal.op.formAnswers': { es: 'Respuestas formulario', en: 'Form answers', pt: 'Respostas de formulário' },
  'syncModal.op.sessionGpsBatch': { es: 'GPS sesiones (batch)', en: 'Session GPS (batch)', pt: 'GPS de sessões (batch)' },
  'syncModal.op.summaryRows': { es: 'Tablas Resumen', en: 'Summary tables', pt: 'Tabelas Resumo' },

  // Forzar subida — Alert (drenado manual)
  'syncModal.forceDrain.title': { es: '⚠ Forzar subida (drenado manual)', en: '⚠ Force upload (manual drain)', pt: '⚠ Forçar envio (drenagem manual)' },
  'syncModal.forceDrain.message': {
    es: 'Reintentará AHORA TODAS las operaciones pendientes y las que ya habían fallado, ignorando la espera de reintento.\n\nÚsalo solo si quedaron pegadas (p. ej. tras corregir la causa del error).',
    en: 'It will retry NOW ALL pending operations and those that had already failed, ignoring the retry wait.\n\nUse it only if they got stuck (e.g. after fixing the cause of the error).',
    pt: 'Tentará novamente AGORA TODAS as operações pendentes e as que já haviam falhado, ignorando a espera de nova tentativa.\n\nUse apenas se ficaram travadas (por ex. após corrigir a causa do erro).',
  },
  'syncModal.forceDrain.cancel': { es: 'Cancelar', en: 'Cancel', pt: 'Cancelar' },
  'syncModal.forceDrain.confirm': { es: 'Forzar subida', en: 'Force upload', pt: 'Forçar envio' },
  'syncModal.forceDrain.resultTitle': { es: 'Drenado manual', en: 'Manual drain', pt: 'Drenagem manual' },
  'syncModal.forceDrain.result.one': {
    es: '{n} operación reencolada y forzada. Subiendo…',
    en: '{n} operation requeued and forced. Uploading…',
    pt: '{n} operação reenfileirada e forçada. Enviando…',
  },
  'syncModal.forceDrain.result.other': {
    es: '{n} operaciones reencoladas y forzadas. Subiendo…',
    en: '{n} operations requeued and forced. Uploading…',
    pt: '{n} operações reenfileiradas e forçadas. Enviando…',
  },

  // Modal — header y secciones
  'syncModal.title': { es: 'Estado de sincronización', en: 'Sync status', pt: 'Status de sincronização' },
  'syncModal.section.connection': { es: 'Conexión', en: 'Connection', pt: 'Conexão' },
  'syncModal.connection.online': { es: 'Online ({type})', en: 'Online ({type})', pt: 'Online ({type})' },
  'syncModal.connection.offline': { es: 'Sin conexión', en: 'Offline', pt: 'Sem conexão' },

  // Pendientes
  'syncModal.section.pending': { es: 'Pendientes ({count})', en: 'Pending ({count})', pt: 'Pendentes ({count})' },
  'syncModal.pending.noneButFailed': {
    es: 'No hay pendientes en cola, pero sí cambios fallidos (ver abajo).',
    en: 'No pending items in queue, but there are failed changes (see below).',
    pt: 'Não há pendentes na fila, mas há alterações com falha (veja abaixo).',
  },
  'syncModal.pending.none': { es: 'No hay cambios pendientes.', en: 'No pending changes.', pt: 'Não há alterações pendentes.' },

  // Fallidos permanentes
  'syncModal.section.failed': { es: 'Fallidos permanentes ({count})', en: 'Permanently failed ({count})', pt: 'Falhas permanentes ({count})' },
  'syncModal.failed.noDetail': { es: '(sin detalle)', en: '(no detail)', pt: '(sem detalhe)' },
  'syncModal.failed.more': { es: '…y {count} más.', en: '…and {count} more.', pt: '…e mais {count}.' },

  // Footer — acciones
  'syncModal.action.syncing': { es: 'Sincronizando…', en: 'Syncing…', pt: 'Sincronizando…' },
  'syncModal.action.syncNow': { es: 'Sincronizar ahora', en: 'Sync now', pt: 'Sincronizar agora' },
  'syncModal.action.forceUpload': { es: 'Forzar subida', en: 'Force upload', pt: 'Forçar envio' },
};

export default syncModal;
