/**
 * i18n (v46) — Cadenas de la pantalla PlanViewerScreen (visor de planos PDF + anotaciones).
 * Namespace: planViewer. Solo UI visible al usuario (NO toca enum/DSL/datos/AsyncStorage/medición).
 */
const planViewer: Record<string, { es: string; en: string; pt: string }> = {
  // DWG (Alert)
  'planViewer.dwg.errorTitle': { es: 'No se pudo abrir el archivo DWG', en: 'Could not open the DWG file', pt: 'Não foi possível abrir o arquivo DWG' },
  'planViewer.dwg.errorMsg': { es: 'Asegúrate de tener una app compatible instalada.', en: 'Make sure you have a compatible app installed.', pt: 'Certifique-se de ter um aplicativo compatível instalado.' },

  // Descarga del PDF (errores)
  'planViewer.download.cloudError': { es: 'No se pudo descargar el plano desde la nube.', en: 'Could not download the drawing from the cloud.', pt: 'Não foi possível baixar a planta da nuvem.' },
  'planViewer.pdf.loadError': { es: 'No se pudo cargar el PDF.', en: 'Could not load the PDF.', pt: 'Não foi possível carregar o PDF.' },

  // Eliminar viñeta (Alert)
  'planViewer.deleteAnn.title': { es: 'Eliminar viñeta', en: 'Delete pin', pt: 'Excluir marcador' },
  'planViewer.deleteAnn.message': { es: '¿Estás seguro de eliminar la viñeta {n}? Se eliminarán también todos sus comentarios y fotos.', en: 'Are you sure you want to delete pin {n}? All its comments and photos will also be deleted.', pt: 'Tem certeza de que deseja excluir o marcador {n}? Todos os seus comentários e fotos também serão excluídos.' },

  // Eliminar foto (Alert)
  'planViewer.deletePhoto.title': { es: 'Eliminar foto', en: 'Delete photo', pt: 'Excluir foto' },
  'planViewer.deletePhoto.message': { es: '¿Eliminar esta foto?', en: 'Delete this photo?', pt: 'Excluir esta foto?' },

  // Botones comunes
  'planViewer.common.cancel': { es: 'Cancelar', en: 'Cancel', pt: 'Cancelar' },
  'planViewer.common.delete': { es: 'Eliminar', en: 'Delete', pt: 'Excluir' },

  // Selector de plano
  'planViewer.selector.activeLabel': { es: 'PLANO ACTIVO', en: 'ACTIVE DRAWING', pt: 'PLANTA ATIVA' },

  // Barra de herramientas
  'planViewer.toolbar.measure': { es: 'Medición', en: 'Measurement', pt: 'Medição' },
  'planViewer.toolbar.drawing': { es: 'Dibujando', en: 'Drawing', pt: 'Desenhando' },
  'planViewer.toolbar.addObservation': { es: '+ Observación', en: '+ Observation', pt: '+ Observação' },

  // Placeholder / estados del PDF
  'planViewer.pdf.notDownloaded': { es: 'Plano no descargado en este dispositivo.', en: 'Drawing not downloaded on this device.', pt: 'Planta não baixada neste dispositivo.' },
  'planViewer.pdf.noPlan': { es: 'Sin plano cargado', en: 'No drawing loaded', pt: 'Nenhuma planta carregada' },
  'planViewer.pdf.downloadBtn': { es: '⬇ Descargar plano', en: '⬇ Download drawing', pt: '⬇ Baixar planta' },
  'planViewer.pdf.loading': { es: 'Cargando plano...', en: 'Loading drawing...', pt: 'Carregando planta...' },
  'planViewer.pdf.downloading': { es: 'Descargando plano...', en: 'Downloading drawing...', pt: 'Baixando planta...' },
  'planViewer.pdf.hint': { es: 'Activa "Anotar plano": toca un punto o arrastra una zona.', en: 'Enable "Annotate drawing": tap a point or drag an area.', pt: 'Ative "Anotar planta": toque em um ponto ou arraste uma área.' },

  // Navegación de páginas
  'planViewer.page.prev': { es: '◀ Anterior', en: '◀ Previous', pt: '◀ Anterior' },
  'planViewer.page.next': { es: 'Siguiente ▶', en: 'Next ▶', pt: 'Próxima ▶' },
  'planViewer.page.indicator': { es: 'Pág. {current} / {total}', en: 'Page {current} / {total}', pt: 'Pág. {current} / {total}' },

  // Lista de observaciones
  'planViewer.list.empty': { es: 'Sin observaciones en este plano.', en: 'No observations in this drawing.', pt: 'Nenhuma observação nesta planta.' },
  'planViewer.list.sectionPage': { es: 'OBSERVACIONES — PÁG. {page} ({count})', en: 'OBSERVATIONS — PAGE {page} ({count})', pt: 'OBSERVAÇÕES — PÁG. {page} ({count})' },
  'planViewer.list.section': { es: 'OBSERVACIONES ({count})', en: 'OBSERVATIONS ({count})', pt: 'OBSERVAÇÕES ({count})' },
  'planViewer.list.noComment': { es: 'Sin comentario', en: 'No comment', pt: 'Sem comentário' },
  'planViewer.list.closed': { es: 'CERRADO', en: 'CLOSED', pt: 'FECHADO' },
  'planViewer.list.completed': { es: 'Completado', en: 'Completed', pt: 'Concluído' },

  // Hilo de comentarios
  'planViewer.thread.empty': { es: 'Sin comentarios aún.', en: 'No comments yet.', pt: 'Ainda sem comentários.' },
  'planViewer.thread.start': { es: 'INICIO', en: 'START', pt: 'INÍCIO' },
  'planViewer.thread.photosOnly': { es: '(solo fotos)', en: '(photos only)', pt: '(somente fotos)' },
  'planViewer.thread.replyPlaceholder': { es: 'Escribe un comentario...', en: 'Write a comment...', pt: 'Escreva um comentário...' },
  'planViewer.thread.send': { es: 'Enviar', en: 'Send', pt: 'Enviar' },
  'planViewer.thread.reply': { es: '+ Responder', en: '+ Reply', pt: '+ Responder' },

  // Modal de creación de observación
  'planViewer.modal.title': { es: 'Nueva observación', en: 'New observation', pt: 'Nova observação' },
  'planViewer.modal.seqBadge': { es: 'N° {value}', en: 'No. {value}', pt: 'Nº {value}' },
  'planViewer.modal.descPlaceholder': { es: 'Describe la observación (opcional)', en: 'Describe the observation (optional)', pt: 'Descreva a observação (opcional)' },
  'planViewer.modal.attachments': { es: 'Adjuntos', en: 'Attachments', pt: 'Anexos' },
  'planViewer.modal.photo': { es: 'Foto', en: 'Photo', pt: 'Foto' },
  'planViewer.modal.priority': { es: 'Prioridad', en: 'Priority', pt: 'Prioridade' },
  'planViewer.modal.save': { es: 'Guardar', en: 'Save', pt: 'Salvar' },
};

export default planViewer;
