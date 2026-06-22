/**
 * i18n — Cadenas de TraceabilityChecklistScreen (checklist intermedio entre el
 * wizard de Nueva sesión y el cronómetro de trazabilidad).
 * Una entrada por string visible reemplazado en la pantalla.
 */
const traceChecklist: Record<string, { es: string; en: string; pt: string }> = {
  // Header
  'traceChecklist.title': { es: 'Checklist', en: 'Checklist', pt: 'Checklist' },
  'traceChecklist.titleWithName': { es: 'Checklist — {name}', en: 'Checklist — {name}', pt: 'Checklist — {name}' },
  'traceChecklist.subtitle': { es: '{answered} / {total} respondidos', en: '{answered} / {total} answered', pt: '{answered} / {total} respondidos' },

  // Banner
  'traceChecklist.banner': {
    es: 'Completa los items antes de iniciar. El cronómetro de la sesión arranca al confirmar.',
    en: 'Complete the items before starting. The session timer begins when you confirm.',
    pt: 'Complete os itens antes de iniciar. O cronômetro da sessão começa ao confirmar.',
  },

  // Item
  'traceChecklist.method': { es: 'Método: {method}', en: 'Method: {method}', pt: 'Método: {method}' },
  'traceChecklist.value': { es: 'Valor', en: 'Value', pt: 'Valor' },
  'traceChecklist.commentsPlaceholder': { es: 'Comentarios (opcional)', en: 'Comments (optional)', pt: 'Comentários (opcional)' },

  // Respuestas Sí/No/N/A
  'traceChecklist.yes': { es: 'Sí', en: 'Yes', pt: 'Sim' },
  'traceChecklist.no': { es: 'No', en: 'No', pt: 'Não' },
  'traceChecklist.na': { es: 'N/A', en: 'N/A', pt: 'N/A' },

  // Footer / slide
  'traceChecklist.starting': { es: 'Iniciando…', en: 'Starting…', pt: 'Iniciando…' },
  'traceChecklist.slideToStart': { es: 'Desliza para iniciar la sesión', en: 'Slide to start the session', pt: 'Deslize para iniciar a sessão' },

  // Toasts
  'traceChecklist.sessionStarted': { es: 'Sesión iniciada', en: 'Session started', pt: 'Sessão iniciada' },
  'traceChecklist.couldNotStart': { es: 'No se pudo iniciar', en: 'Could not start', pt: 'Não foi possível iniciar' },

  // Alerta: items sin responder
  'traceChecklist.unansweredTitle': { es: 'Items sin responder', en: 'Unanswered items', pt: 'Itens não respondidos' },
  'traceChecklist.unansweredMsg': {
    es: 'Hay {count} item(s) sin responder. ¿Iniciar la sesión de todos modos?',
    en: 'There are {count} unanswered item(s). Start the session anyway?',
    pt: 'Há {count} item(ns) não respondido(s). Iniciar a sessão mesmo assim?',
  },
  'traceChecklist.cancel': { es: 'Cancelar', en: 'Cancel', pt: 'Cancelar' },
  'traceChecklist.start': { es: 'Iniciar', en: 'Start', pt: 'Iniciar' },

  // Cámara
  'traceChecklist.cameraNoPermission': { es: 'Cámara sin permisos', en: 'Camera not authorized', pt: 'Câmera sem permissão' },
  'traceChecklist.grantPermission': { es: 'Conceder permiso', en: 'Grant permission', pt: 'Conceder permissão' },
  'traceChecklist.close': { es: 'Cerrar', en: 'Close', pt: 'Fechar' },
  'traceChecklist.noCamera': { es: 'No se encontró cámara', en: 'No camera found', pt: 'Câmera não encontrada' },
  'traceChecklist.itemPhoto': { es: 'Foto del item', en: 'Item photo', pt: 'Foto do item' },
};

export default traceChecklist;
