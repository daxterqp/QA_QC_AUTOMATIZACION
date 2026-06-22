/**
 * i18n (v46) — Cadenas de la pantalla ProtocolListScreen (lista de protocolos).
 * Namespace: protoList. Solo UI visible al usuario (NO toca enum/DSL/datos).
 */
const protoList: Record<string, { es: string; en: string; pt: string }> = {
  // Estados (etiquetas visibles del status del protocolo)
  'protoList.status.inProgress': { es: 'En progreso', en: 'In progress', pt: 'Em andamento' },
  'protoList.status.inReview': { es: 'En revisión', en: 'In review', pt: 'Em revisão' },
  'protoList.status.approved': { es: 'Aprobado', en: 'Approved', pt: 'Aprovado' },
  'protoList.status.rejected': { es: 'Rechazado', en: 'Rejected', pt: 'Rejeitado' },

  // Cabecera
  'protoList.subtitle.one': { es: '{count} protocolo', en: '{count} protocol', pt: '{count} protocolo' },
  'protoList.subtitle.other': { es: '{count} protocolos', en: '{count} protocols', pt: '{count} protocolos' },

  // Buscador / filtros
  'protoList.searchPlaceholder': { es: 'Buscar por protocolo o ubicacion...', en: 'Search by protocol or location...', pt: 'Buscar por protocolo ou local...' },
  'protoList.filter.all': { es: 'Todos', en: 'All', pt: 'Todos' },

  // Lista
  'protoList.empty': { es: 'No hay protocolos con ese filtro.', en: 'No protocols match this filter.', pt: 'Nenhum protocolo com esse filtro.' },
  'protoList.fillHint': { es: 'Toca para rellenar ›', en: 'Tap to fill in ›', pt: 'Toque para preencher ›' },
};

export default protoList;
