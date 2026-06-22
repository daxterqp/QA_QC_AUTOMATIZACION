/**
 * i18n — Cadenas de la pantalla TraceabilityHomeScreen (namespace `traceHome`).
 * export default: Record<clave, { es, en, pt }>. Se agrega en `./index.ts`.
 */
const traceHome: Record<string, { es: string; en: string; pt: string }> = {
  'traceHome.moduleUnavailableTitle': {
    es: 'Módulo no disponible',
    en: 'Module unavailable',
    pt: 'Módulo indisponível',
  },
  'traceHome.moduleUnavailableMsg': {
    es: 'El módulo de Trazabilidad no está habilitado en este proyecto. Actívalo desde Configurar módulos.',
    en: 'The Traceability module is not enabled in this project. Enable it from Configure modules.',
    pt: 'O módulo de Rastreabilidade não está habilitado neste projeto. Ative-o em Configurar módulos.',
  },
  'traceHome.ok': {
    es: 'OK',
    en: 'OK',
    pt: 'OK',
  },
  'traceHome.statusActive': {
    es: 'ACTIVA',
    en: 'ACTIVE',
    pt: 'ATIVA',
  },
  'traceHome.statusPaused': {
    es: 'PAUSADA',
    en: 'PAUSED',
    pt: 'PAUSADA',
  },
  'traceHome.statusClosed': {
    es: 'CERRADA',
    en: 'CLOSED',
    pt: 'FECHADA',
  },
  'traceHome.autoClosed': {
    es: 'Auto-cerrada',
    en: 'Auto-closed',
    pt: 'Fechada automaticamente',
  },
  'traceHome.equipmentFallback': {
    es: 'Equipo',
    en: 'Equipment',
    pt: 'Equipamento',
  },
  'traceHome.activityFallback': {
    es: 'Actividad',
    en: 'Activity',
    pt: 'Atividade',
  },
  'traceHome.sectorFallback': {
    es: 'Sector',
    en: 'Sector',
    pt: 'Setor',
  },
  'traceHome.effectiveDuration': {
    es: '{duration} efectivos',
    en: '{duration} effective',
    pt: '{duration} efetivos',
  },
  'traceHome.pausedDuration': {
    es: ' · {duration} pausa',
    en: ' · {duration} paused',
    pt: ' · {duration} pausa',
  },
  'traceHome.title': {
    es: 'Trazabilidad',
    en: 'Traceability',
    pt: 'Rastreabilidade',
  },
  'traceHome.analyticsResults': {
    es: 'Análisis de resultados',
    en: 'Results analysis',
    pt: 'Análise de resultados',
  },
  'traceHome.newActivity': {
    es: 'Nueva actividad',
    en: 'New activity',
    pt: 'Nova atividade',
  },
  'traceHome.currentSession': {
    es: 'SESIÓN ACTUAL',
    en: 'CURRENT SESSION',
    pt: 'SESSÃO ATUAL',
  },
  'traceHome.history': {
    es: 'HISTORIAL',
    en: 'HISTORY',
    pt: 'HISTÓRICO',
  },
  'traceHome.activityInProgressTitle': {
    es: 'Hay una actividad en curso',
    en: 'There is an activity in progress',
    pt: 'Há uma atividade em andamento',
  },
  'traceHome.activityInProgressMsg': {
    es: 'Debes finalizar la actividad actual antes de registrar una nueva.',
    en: 'You must finish the current activity before registering a new one.',
    pt: 'Você deve finalizar a atividade atual antes de registrar uma nova.',
  },
  'traceHome.goToActivity': {
    es: 'Ir a la actividad',
    en: 'Go to activity',
    pt: 'Ir para a atividade',
  },
  'traceHome.emptyTitle': {
    es: 'Aún no has registrado sesiones en este proyecto.',
    en: 'You have not registered any sessions in this project yet.',
    pt: 'Você ainda não registrou sessões neste projeto.',
  },
  'traceHome.emptyHint': {
    es: 'Tap "Nueva actividad" arriba para iniciar la primera.',
    en: 'Tap "New activity" above to start the first one.',
    pt: 'Toque em "Nova atividade" acima para iniciar a primeira.',
  },
};

export default traceHome;
