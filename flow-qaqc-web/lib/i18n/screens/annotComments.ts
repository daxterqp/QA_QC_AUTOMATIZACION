/**
 * i18n (v46) — Cadenas de la pantalla AnnotationCommentsScreen (observaciones de planos).
 * Namespace: annotComments. Solo UI visible al usuario (NO toca enum/DSL/datos/claves).
 */
const annotComments: Record<string, { es: string; en: string; pt: string }> = {
  // Cabecera
  'annotComments.title': { es: 'Observaciones', en: 'Observations', pt: 'Observações' },

  // Filtros de estado
  'annotComments.filter.all': { es: 'Todas', en: 'All', pt: 'Todas' },
  'annotComments.filter.open': { es: 'Abiertas', en: 'Open', pt: 'Abertas' },
  'annotComments.filter.closed': { es: 'Cerradas', en: 'Closed', pt: 'Fechadas' },

  // Filtros de prioridad
  'annotComments.priority.none': { es: 'Sin', en: 'None', pt: 'Sem' },

  // Lista vacía
  'annotComments.empty.noAnnotations': { es: 'No hay observaciones en los planos de este proyecto.', en: 'There are no observations on the drawings for this project.', pt: 'Não há observações nas plantas deste projeto.' },
  'annotComments.empty.noMatch': { es: 'Ninguna observación coincide con los filtros.', en: 'No observation matches the filters.', pt: 'Nenhuma observação corresponde aos filtros.' },

  // Tarjeta
  'annotComments.noDescription': { es: '(sin descripción)', en: '(no description)', pt: '(sem descrição)' },
  'annotComments.lastReply': { es: 'Última respuesta:', en: 'Last reply:', pt: 'Última resposta:' },
  'annotComments.completed': { es: 'Completado', en: 'Completed', pt: 'Concluído' },

  // Nombre por defecto del autor
  'annotComments.inspector': { es: 'Inspector', en: 'Inspector', pt: 'Inspetor' },

  // Alerta de eliminación
  'annotComments.delete.title': { es: 'Eliminar observación', en: 'Delete observation', pt: 'Excluir observação' },
  'annotComments.delete.message': { es: '¿Estás seguro de eliminar la viñeta {number}? Se eliminarán también todos sus comentarios y fotos.', en: 'Are you sure you want to delete pin {number}? All its comments and photos will also be deleted.', pt: 'Tem certeza de que deseja excluir o marcador {number}? Todos os seus comentários e fotos também serão excluídos.' },
  'annotComments.delete.cancel': { es: 'Cancelar', en: 'Cancel', pt: 'Cancelar' },
  'annotComments.delete.confirm': { es: 'Eliminar', en: 'Delete', pt: 'Excluir' },
};

export default annotComments;
