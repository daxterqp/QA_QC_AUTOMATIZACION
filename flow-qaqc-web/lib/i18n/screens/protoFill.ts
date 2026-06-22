/**
 * i18n — Cadenas de la pantalla ProtocolFillScreen (llenado de protocolo).
 * Namespace: protoFill. Solo UI visible al usuario (NO toca DSL/fórmulas/xref/enum/datos).
 * Cada clave: { es, en, pt }. Interpolación con {var}.
 */
const protoFill: Record<string, { es: string; en: string; pt: string }> = {
  // Cabecera
  'protoFill.header.date': { es: 'Fecha: {date}', en: 'Date: {date}', pt: 'Data: {date}' },

  // Banner de rechazo
  'protoFill.rejection.title': { es: 'Protocolo rechazado', en: 'Protocol rejected', pt: 'Protocolo rejeitado' },

  // Datos generales
  'protoFill.dg.title': { es: 'Datos generales', en: 'General data', pt: 'Dados gerais' },
  'protoFill.dg.project': { es: 'Proyecto', en: 'Project', pt: 'Projeto' },
  'protoFill.dg.code': { es: 'Código', en: 'Code', pt: 'Código' },
  'protoFill.dg.test': { es: 'Ensayo', en: 'Test', pt: 'Ensaio' },
  'protoFill.dg.dateTime': { es: 'Fecha / hora', en: 'Date / time', pt: 'Data / hora' },
  'protoFill.dg.location': { es: 'Ubicación', en: 'Location', pt: 'Local' },

  // Planos
  'protoFill.plans.btn': { es: 'Planos', en: 'Drawings', pt: 'Plantas' },
  'protoFill.plans.searching': { es: 'Buscando plano...', en: 'Searching for drawing...', pt: 'Buscando planta...' },
  'protoFill.plans.searchingAlert.title': { es: 'Buscando plano', en: 'Searching for drawing', pt: 'Buscando planta' },
  'protoFill.plans.searchingAlert.msg': { es: 'Se está buscando el plano en la nube, espera un momento.', en: 'The drawing is being searched in the cloud, please wait a moment.', pt: 'A planta está sendo buscada na nuvem, aguarde um momento.' },
  'protoFill.plans.none.title': { es: 'Sin plano', en: 'No drawing', pt: 'Sem planta' },
  'protoFill.plans.none.msg': { es: 'No hay plano asociado a esta ubicación.', en: 'There is no drawing associated with this location.', pt: 'Não há planta associada a este local.' },

  // Respuestas Sí / No / N/A
  'protoFill.answer.yes': { es: 'Sí', en: 'Yes', pt: 'Sim' },
  'protoFill.answer.no': { es: 'No', en: 'No', pt: 'Não' },
  'protoFill.answer.na': { es: 'N/A', en: 'N/A', pt: 'N/A' },

  // Observación por ítem
  'protoFill.item.commentPlaceholder': { es: 'Observacion (opcional)', en: 'Observation (optional)', pt: 'Observação (opcional)' },

  // Eliminar foto
  'protoFill.photo.delete.title': { es: 'Eliminar foto', en: 'Delete photo', pt: 'Excluir foto' },
  'protoFill.photo.delete.msg': { es: '¿Eliminar esta foto?', en: 'Delete this photo?', pt: 'Excluir esta foto?' },
  'protoFill.photo.deleteExtra.msg': { es: '¿Eliminar esta foto extra?', en: 'Delete this extra photo?', pt: 'Excluir esta foto extra?' },

  // Evidencia fotográfica extra
  'protoFill.extra.attach': { es: 'Adjuntar evidencia fotográfica extra', en: 'Attach extra photo evidence', pt: 'Anexar evidência fotográfica extra' },
  'protoFill.extra.attachFailed.msg': { es: 'No se pudo adjuntar la foto.\n{error}', en: 'The photo could not be attached.\n{error}', pt: 'Não foi possível anexar a foto.\n{error}' },

  // Comentarios generales
  'protoFill.general.label': { es: 'Comentarios generales', en: 'General comments', pt: 'Comentários gerais' },
  'protoFill.general.placeholder': { es: 'Observaciones del ensayo, condiciones del laboratorio, etc.', en: 'Test observations, laboratory conditions, etc.', pt: 'Observações do ensaio, condições do laboratório, etc.' },

  // Envío / estado de solo lectura
  'protoFill.submit.btn': { es: 'Enviar para aprobacion', en: 'Submit for approval', pt: 'Enviar para aprovação' },
  'protoFill.readOnly.approved': { es: 'Protocolo aprobado y bloqueado', en: 'Protocol approved and locked', pt: 'Protocolo aprovado e bloqueado' },
  'protoFill.readOnly.inReview': { es: 'En revision por el Jefe', en: 'Under review by the Lead', pt: 'Em revisão pelo Líder' },

  // Alerts de envío
  'protoFill.alert.incomplete.title': { es: 'Incompleto', en: 'Incomplete', pt: 'Incompleto' },
  'protoFill.alert.incomplete.msg': { es: 'Debes responder Sí, No o N/A en todos los ítems.', en: 'You must answer Yes, No or N/A on all items.', pt: 'Você deve responder Sim, Não ou N/A em todos os itens.' },
  'protoFill.alert.locked.title': { es: 'Bloqueado', en: 'Locked', pt: 'Bloqueado' },
  'protoFill.alert.locked.msg': { es: 'Este protocolo ya fue aprobado y no puede modificarse.', en: 'This protocol has already been approved and cannot be modified.', pt: 'Este protocolo já foi aprovado e não pode ser modificado.' },
  'protoFill.alert.sent.title': { es: 'Enviado', en: 'Submitted', pt: 'Enviado' },
  'protoFill.alert.sent.msg': { es: 'El protocolo fue enviado para revisión del Jefe.', en: 'The protocol was submitted for the Lead’s review.', pt: 'O protocolo foi enviado para revisão do Líder.' },
  'protoFill.alert.sendFailed.title': { es: 'Error al enviar', en: 'Submission error', pt: 'Erro ao enviar' },
  'protoFill.alert.sendFailed.msg': { es: 'No se pudo enviar el protocolo.\n{error}', en: 'The protocol could not be submitted.\n{error}', pt: 'Não foi possível enviar o protocolo.\n{error}' },

  // Genéricos
  'protoFill.error': { es: 'Error', en: 'Error', pt: 'Erro' },
  'protoFill.ok': { es: 'OK', en: 'OK', pt: 'OK' },
  'protoFill.cancel': { es: 'Cancelar', en: 'Cancel', pt: 'Cancelar' },
  'protoFill.delete': { es: 'Eliminar', en: 'Delete', pt: 'Excluir' },
};

export default protoFill;
