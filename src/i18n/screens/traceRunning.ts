/**
 * i18n — Cadenas de la pantalla TraceabilityRunningScreen (namespace `traceRunning`).
 * Record<clave, { es, en, pt }>. Se agrega al barril en `./index.ts`.
 */
const traceRunning: Record<string, { es: string; en: string; pt: string }> = {
  // Header
  'traceRunning.title': { es: 'Sesión activa', en: 'Active session', pt: 'Sessão ativa' },

  // Chip de estado
  'traceRunning.status.active': { es: 'ACTIVA', en: 'ACTIVE', pt: 'ATIVA' },
  'traceRunning.status.paused': { es: 'PAUSADA', en: 'PAUSED', pt: 'PAUSADA' },
  'traceRunning.status.closed': { es: 'CERRADA', en: 'CLOSED', pt: 'FECHADA' },

  // Cronómetro
  'traceRunning.effectiveTime': { es: 'tiempo efectivo', en: 'effective time', pt: 'tempo efetivo' },
  'traceRunning.pausedTotal': { es: '{clock} en pausa', en: '{clock} paused', pt: '{clock} em pausa' },

  // GPS
  'traceRunning.gps.active': { es: 'GPS activo', en: 'GPS active', pt: 'GPS ativo' },
  'traceRunning.gps.paused': { es: 'GPS pausado', en: 'GPS paused', pt: 'GPS pausado' },

  // Info
  'traceRunning.info.equipment': { es: 'Equipo', en: 'Equipment', pt: 'Equipamento' },
  'traceRunning.info.activity': { es: 'Actividad', en: 'Activity', pt: 'Atividade' },
  'traceRunning.info.sector': { es: 'Sector', en: 'Sector', pt: 'Setor' },
  'traceRunning.info.start': { es: 'Inicio', en: 'Start', pt: 'Início' },

  // Controles (SlideToConfirm)
  'traceRunning.slide.pause': { es: 'Desliza para pausar', en: 'Slide to pause', pt: 'Deslize para pausar' },
  'traceRunning.slide.resume': { es: 'Desliza para reanudar', en: 'Slide to resume', pt: 'Deslize para retomar' },
  'traceRunning.slide.finish': { es: 'Desliza para finalizar', en: 'Slide to finish', pt: 'Deslize para finalizar' },

  // Banner solo lectura
  'traceRunning.readOnly.otherUser': {
    es: 'Sesión de otro usuario — solo lectura.',
    en: "Another user's session — read only.",
    pt: 'Sessão de outro usuário — somente leitura.',
  },
  'traceRunning.readOnly.otherDevice': {
    es: 'Esta sesión se inició en otro dispositivo. Solo puedes verla.',
    en: 'This session was started on another device. You can only view it.',
    pt: 'Esta sessão foi iniciada em outro dispositivo. Você só pode visualizá-la.',
  },

  // Checklist
  'traceRunning.checklist.view': { es: 'Ver checklist — {name}', en: 'View checklist — {name}', pt: 'Ver checklist — {name}' },

  // Intervalos
  'traceRunning.intervals.title': { es: 'INTERVALOS', en: 'INTERVALS', pt: 'INTERVALOS' },
  'traceRunning.intervals.active': { es: 'Activa', en: 'Active', pt: 'Ativa' },
  'traceRunning.intervals.pause': { es: 'Pausa', en: 'Pause', pt: 'Pausa' },
  'traceRunning.intervals.inProgress': { es: 'en curso', en: 'in progress', pt: 'em andamento' },

  // Toasts
  'traceRunning.toast.paused': { es: 'Sesión pausada', en: 'Session paused', pt: 'Sessão pausada' },
  'traceRunning.toast.pauseError': { es: 'No se pudo pausar', en: 'Could not pause', pt: 'Não foi possível pausar' },
  'traceRunning.toast.resumed': { es: 'Sesión reanudada', en: 'Session resumed', pt: 'Sessão retomada' },
  'traceRunning.toast.resumeError': { es: 'No se pudo reanudar', en: 'Could not resume', pt: 'Não foi possível retomar' },
  'traceRunning.toast.closed': { es: 'Sesión cerrada', en: 'Session closed', pt: 'Sessão fechada' },
  'traceRunning.toast.closeError': { es: 'No se pudo cerrar', en: 'Could not close', pt: 'Não foi possível fechar' },

  // Alert de cierre
  'traceRunning.close.title': {
    es: '¿Cerrar sesión definitivamente?',
    en: 'Close session permanently?',
    pt: 'Fechar a sessão definitivamente?',
  },
  'traceRunning.close.message': {
    es: 'Duración efectiva: {effective}.{paused}\n\nUna vez cerrada, no podrás modificarla. Solo CREATOR/JEFE puede editarla.',
    en: 'Effective duration: {effective}.{paused}\n\nOnce closed, you will not be able to modify it. Only CREATOR/JEFE can edit it.',
    pt: 'Duração efetiva: {effective}.{paused}\n\nUma vez fechada, você não poderá modificá-la. Apenas CREATOR/JEFE pode editá-la.',
  },
  'traceRunning.close.pausedLine': {
    es: '\nTiempo pausado: {paused}.',
    en: '\nPaused time: {paused}.',
    pt: '\nTempo pausado: {paused}.',
  },
  'traceRunning.close.cancel': { es: 'Cancelar', en: 'Cancel', pt: 'Cancelar' },
  'traceRunning.close.confirm': { es: 'Cerrar', en: 'Close', pt: 'Fechar' },
};

export default traceRunning;
