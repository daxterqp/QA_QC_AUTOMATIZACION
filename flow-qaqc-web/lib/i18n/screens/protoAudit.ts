/**
 * i18n (v46) — Cadenas de la pantalla ProtocolAuditScreen (auditoría/aprobación de protocolos).
 * Namespace: protoAudit. Solo UI visible al usuario (NO toca enum/DSL/fórmulas/xref/datos).
 */
const protoAudit: Record<string, { es: string; en: string; pt: string }> = {
  // openNorm — alertas de norma
  'protoAudit.norm.missingTitle': { es: 'Sin norma', en: 'No standard', pt: 'Sem norma' },
  'protoAudit.norm.missingMsg': { es: 'Aún no se subió la norma para este protocolo. Súbela desde la PC en Cargar → Normas.', en: 'The standard for this protocol has not been uploaded yet. Upload it from the PC under Upload → Standards.', pt: 'A norma deste protocolo ainda não foi enviada. Envie-a a partir do PC em Carregar → Normas.' },
  'protoAudit.error': { es: 'Error', en: 'Error', pt: 'Erro' },
  'protoAudit.norm.openError': { es: 'No se pudo abrir la norma:\n{detail}', en: 'Could not open the standard:\n{detail}', pt: 'Não foi possível abrir a norma:\n{detail}' },

  // Estados (etiquetas visibles del status del protocolo)
  'protoAudit.status.inProgress': { es: 'En progreso', en: 'In progress', pt: 'Em andamento' },
  'protoAudit.status.inReview': { es: 'En revisión', en: 'In review', pt: 'Em revisão' },
  'protoAudit.status.approved': { es: 'Aprobado', en: 'Approved', pt: 'Aprovado' },
  'protoAudit.status.rejected': { es: 'Rechazado', en: 'Rejected', pt: 'Rejeitado' },

  // Adjuntar foto extra — alerta
  'protoAudit.photo.attachError': { es: 'No se pudo adjuntar la foto.\n{detail}', en: 'Could not attach the photo.\n{detail}', pt: 'Não foi possível anexar a foto.\n{detail}' },

  // Refrescar llamados entre ensayos (xref) — alerta
  'protoAudit.xref.refreshFailTitle': { es: 'No se actualizó', en: 'Not updated', pt: 'Não atualizado' },
  'protoAudit.xref.refreshFailMsg': { es: 'No se pudieron actualizar los datos llamados.', en: 'Could not refresh the referenced data.', pt: 'Não foi possível atualizar os dados referenciados.' },

  // Aprobación
  'protoAudit.approve.doneTitle': { es: 'Aprobado', en: 'Approved', pt: 'Aprovado' },
  'protoAudit.approve.doneMsg': { es: 'El protocolo fue aprobado y firmado.', en: 'The protocol was approved and signed.', pt: 'O protocolo foi aprovado e assinado.' },
  'protoAudit.ok': { es: 'OK', en: 'OK', pt: 'OK' },
  'protoAudit.reasonRequiredTitle': { es: 'Motivo requerido', en: 'Reason required', pt: 'Motivo obrigatório' },
  'protoAudit.approve.reasonRequiredMsg': { es: 'El ensayo no cumple las restricciones: indica el motivo de la aprobación.', en: 'The test does not meet the constraints: provide the reason for approval.', pt: 'O ensaio não atende às restrições: informe o motivo da aprovação.' },

  // Rechazo
  'protoAudit.reject.reasonRequiredMsg': { es: 'Debes indicar el motivo del rechazo.', en: 'You must provide the reason for the rejection.', pt: 'Você deve informar o motivo da rejeição.' },

  // Encabezado / acciones
  'protoAudit.noLocation': { es: 'Sin ubicacion', en: 'No location', pt: 'Sem local' },
  'protoAudit.edit': { es: 'Editar', en: 'Edit', pt: 'Editar' },
  'protoAudit.viewNorm': { es: 'Ver norma', en: 'View standard', pt: 'Ver norma' },
  'protoAudit.plans': { es: 'Planos', en: 'Drawings', pt: 'Plantas' },

  // Encabezado tipo Dossier — etiquetas del grid
  'protoAudit.field.project': { es: 'Proyecto', en: 'Project', pt: 'Projeto' },
  'protoAudit.field.date': { es: 'Fecha', en: 'Date', pt: 'Data' },
  'protoAudit.field.supervisor': { es: 'Supervisor', en: 'Supervisor', pt: 'Supervisor' },
  'protoAudit.field.filledAt': { es: 'Fecha realización', en: 'Date performed', pt: 'Data de realização' },
  'protoAudit.field.approver': { es: 'Aprobador', en: 'Approver', pt: 'Aprovador' },
  'protoAudit.field.approvedAt': { es: 'Fecha aprobación', en: 'Approval date', pt: 'Data de aprovação' },
  'protoAudit.field.protocolId': { es: 'ID Protocolo', en: 'Protocol ID', pt: 'ID do Protocolo' },
  'protoAudit.field.location': { es: 'Ubicación', en: 'Location', pt: 'Local' },
  'protoAudit.field.specialty': { es: 'Especialidad', en: 'Specialty', pt: 'Especialidade' },
  'protoAudit.rejectionLabel': { es: 'MOTIVO RECHAZO', en: 'REJECTION REASON', pt: 'MOTIVO DA REJEIÇÃO' },

  // Tira de resumen (clásico)
  'protoAudit.stat.compliant': { es: 'Cumple', en: 'Compliant', pt: 'Conforme' },
  'protoAudit.stat.nonCompliant': { es: 'No cumple', en: 'Non-compliant', pt: 'Não conforme' },
  'protoAudit.stat.unanswered': { es: 'Sin responder', en: 'Unanswered', pt: 'Sem resposta' },
  'protoAudit.stat.total': { es: 'Total', en: 'Total', pt: 'Total' },

  // Tarjeta GPS
  'protoAudit.gpsTitle': { es: 'Ubicación GPS', en: 'GPS Location', pt: 'Localização GPS' },

  // Banner xref desactualizado
  'protoAudit.xref.staleTitle': { es: 'Datos llamados desactualizados', en: 'Referenced data out of date', pt: 'Dados referenciados desatualizados' },
  'protoAudit.xref.staleSubChief': { es: 'Un ensayo referenciado (@código) cambió. Actualiza para recongelar el valor.', en: 'A referenced test (@code) changed. Update to re-freeze the value.', pt: 'Um ensaio referenciado (@código) mudou. Atualize para recongelar o valor.' },
  'protoAudit.xref.staleSubOther': { es: 'Un ensayo referenciado (@código) cambió. Pide al Jefe que actualice.', en: 'A referenced test (@code) changed. Ask the Supervisor to update.', pt: 'Um ensaio referenciado (@código) mudou. Peça ao Responsável para atualizar.' },
  'protoAudit.xref.update': { es: 'Actualizar', en: 'Update', pt: 'Atualizar' },

  // Comentarios generales (numérico)
  'protoAudit.generalCommentsTitle': { es: 'Comentarios generales', en: 'General comments', pt: 'Comentários gerais' },

  // Tabla de items (clásico)
  'protoAudit.table.description': { es: 'Descripción', en: 'Description', pt: 'Descrição' },
  'protoAudit.table.compliant': { es: 'Conforme', en: 'Compliant', pt: 'Conforme' },
  'protoAudit.obsLabel': { es: 'Obs.', en: 'Obs.', pt: 'Obs.' },

  // Eliminar foto — alertas
  'protoAudit.deletePhotoTitle': { es: 'Eliminar foto', en: 'Delete photo', pt: 'Excluir foto' },
  'protoAudit.deletePhotoMsg': { es: '¿Eliminar esta foto del protocolo?', en: 'Delete this photo from the protocol?', pt: 'Excluir esta foto do protocolo?' },
  'protoAudit.deleteExtraPhotoMsg': { es: '¿Eliminar esta foto extra?', en: 'Delete this extra photo?', pt: 'Excluir esta foto extra?' },
  'protoAudit.cancel': { es: 'Cancelar', en: 'Cancel', pt: 'Cancelar' },
  'protoAudit.delete': { es: 'Eliminar', en: 'Delete', pt: 'Excluir' },

  // Foto extra
  'protoAudit.attachExtraPhoto': { es: 'Adjuntar evidencia fotográfica extra', en: 'Attach extra photographic evidence', pt: 'Anexar evidência fotográfica extra' },

  // Acciones del Jefe
  'protoAudit.approveWithObservation': { es: 'Aprobar con observación', en: 'Approve with observation', pt: 'Aprovar com observação' },
  'protoAudit.approveAndSign': { es: 'Aprobar y Firmar', en: 'Approve and Sign', pt: 'Aprovar e Assinar' },
  'protoAudit.rejectBtn': { es: 'Rechazar', en: 'Reject', pt: 'Rejeitar' },

  // Banner firmado
  'protoAudit.signedDigitally': { es: 'Firmado digitalmente', en: 'Digitally signed', pt: 'Assinado digitalmente' },
  'protoAudit.approvalReasonOutOfRange': { es: 'Motivo de aprobación (fuera de rango): {reason}', en: 'Approval reason (out of range): {reason}', pt: 'Motivo da aprovação (fora de faixa): {reason}' },

  // Modal de rechazo
  'protoAudit.rejectModal.title': { es: 'Motivo del rechazo', en: 'Rejection reason', pt: 'Motivo da rejeição' },
  'protoAudit.rejectModal.subtitle': { es: 'El supervisor vera este mensaje al abrir el protocolo rechazado.', en: 'The supervisor will see this message when opening the rejected protocol.', pt: 'O supervisor verá esta mensagem ao abrir o protocolo rejeitado.' },
  'protoAudit.rejectModal.placeholder': { es: 'Describe el motivo del rechazo...', en: 'Describe the reason for rejection...', pt: 'Descreva o motivo da rejeição...' },
  'protoAudit.rejectModal.confirm': { es: 'Confirmar rechazo', en: 'Confirm rejection', pt: 'Confirmar rejeição' },

  // Modal de aprobación
  'protoAudit.approveModal.title': { es: 'Aprobar y Firmar', en: 'Approve and Sign', pt: 'Aprovar e Assinar' },
  'protoAudit.approveModal.subtitle': { es: '¿Confirmas la aprobación? El protocolo quedará bloqueado para edición.', en: 'Confirm the approval? The protocol will be locked for editing.', pt: 'Confirmar a aprovação? O protocolo ficará bloqueado para edição.' },
  'protoAudit.approveModal.warn': { es: 'Este ensayo no cumple todas las restricciones (valores fuera de rango o incompletos).', en: 'This test does not meet all constraints (out-of-range or incomplete values).', pt: 'Este ensaio não atende a todas as restrições (valores fora de faixa ou incompletos).' },
  'protoAudit.approveModal.reasonPlaceholder': { es: 'Motivo de la aprobación (obligatorio)…', en: 'Reason for approval (required)…', pt: 'Motivo da aprovação (obrigatório)…' },
};

export default protoAudit;
