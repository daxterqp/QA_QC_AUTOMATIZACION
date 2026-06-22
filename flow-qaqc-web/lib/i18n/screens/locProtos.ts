/**
 * i18n (v46) — Cadenas de la pantalla LocationProtocolsScreen (protocolos por ubicación).
 * Namespace: locProtos. Solo UI visible al usuario (NO toca enum/DSL/datos/método de validación).
 */
const locProtos: Record<string, { es: string; en: string; pt: string }> = {
  // Cabecera
  'locProtos.subtitle': { es: 'Protocolos requeridos', en: 'Required protocols', pt: 'Protocolos exigidos' },

  // Estados (etiquetas visibles del status del protocolo)
  'locProtos.status.inProgress': { es: 'En progreso', en: 'In progress', pt: 'Em andamento' },
  'locProtos.status.inReview': { es: 'En revisión', en: 'In review', pt: 'Em revisão' },
  'locProtos.status.approved': { es: 'Aprobado', en: 'Approved', pt: 'Aprovado' },
  'locProtos.status.rejected': { es: 'Rechazado', en: 'Rejected', pt: 'Rejeitado' },
  'locProtos.status.notStarted': { es: 'Sin iniciar', en: 'Not started', pt: 'Não iniciado' },

  // Tarjeta de protocolo
  'locProtos.fillHint': { es: 'Toca para rellenar ›', en: 'Tap to fill in ›', pt: 'Toque para preencher ›' },

  // Lista vacía
  'locProtos.empty': {
    es: 'Esta ubicación no tiene protocolos vinculados.\nRevisa la columna ID_Protocolos en el Excel de ubicaciones.',
    en: 'This location has no linked protocols.\nCheck the ID_Protocolos column in the locations Excel file.',
    pt: 'Este local não possui protocolos vinculados.\nVerifique a coluna ID_Protocolos no Excel de locais.',
  },
};

export default locProtos;
