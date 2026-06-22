/**
 * i18n — Cadenas de la pantalla TraceabilityAnalyticsScreen (namespace `traceAnalytics`).
 * export default: Record<clave, { es, en, pt }>. Se agrega en `./index.ts`.
 */
const traceAnalytics: Record<string, { es: string; en: string; pt: string }> = {
  // Tabs (module-scope, usar tx)
  'traceAnalytics.tabSector': {
    es: 'Sector',
    en: 'Sector',
    pt: 'Setor',
  },
  'traceAnalytics.tabEquipo': {
    es: 'Equipo',
    en: 'Equipment',
    pt: 'Equipamento',
  },
  'traceAnalytics.tabChecklists': {
    es: 'Checklists',
    en: 'Checklists',
    pt: 'Checklists',
  },
  'traceAnalytics.tabPdf': {
    es: 'PDF',
    en: 'PDF',
    pt: 'PDF',
  },

  // Header
  'traceAnalytics.title': {
    es: 'Análisis de Trazabilidad',
    en: 'Traceability Analysis',
    pt: 'Análise de Rastreabilidade',
  },

  // KPIs
  'traceAnalytics.kpiMachineHours': {
    es: 'Total horas máquina',
    en: 'Total machine hours',
    pt: 'Total de horas-máquina',
  },
  'traceAnalytics.kpiSessions': {
    es: 'N° de sesiones trabajadas',
    en: 'No. of sessions worked',
    pt: 'N° de sessões trabalhadas',
  },
  'traceAnalytics.kpiActiveEquipment': {
    es: 'Equipos operativos',
    en: 'Operating equipment',
    pt: 'Equipamentos operacionais',
  },
  'traceAnalytics.kpiSectorsWorked': {
    es: 'N° de sectores trabajados',
    en: 'No. of sectors worked',
    pt: 'N° de setores trabalhados',
  },

  // Fallbacks
  'traceAnalytics.equipmentFallback': {
    es: 'Equipo',
    en: 'Equipment',
    pt: 'Equipamento',
  },
  'traceAnalytics.activityFallback': {
    es: 'Actividad',
    en: 'Activity',
    pt: 'Atividade',
  },
  'traceAnalytics.activityShort': {
    es: 'Act.',
    en: 'Act.',
    pt: 'Ativ.',
  },
  'traceAnalytics.sectorFallback': {
    es: 'Sector',
    en: 'Sector',
    pt: 'Setor',
  },
  'traceAnalytics.noSector': {
    es: '(Sin sector)',
    en: '(No sector)',
    pt: '(Sem setor)',
  },
  'traceAnalytics.noSectorAssigned': {
    es: '(Sin sector asignado)',
    en: '(No sector assigned)',
    pt: '(Sem setor atribuído)',
  },
  'traceAnalytics.notWorked': {
    es: 'No trabajado',
    en: 'Not worked',
    pt: 'Não trabalhado',
  },

  // Sector / Equipo card subtitles
  'traceAnalytics.sessionsSummary': {
    es: '{duration} · {count} {sessionWord}',
    en: '{duration} · {count} {sessionWord}',
    pt: '{duration} · {count} {sessionWord}',
  },
  'traceAnalytics.sessionSingular': {
    es: 'sesión',
    en: 'session',
    pt: 'sessão',
  },
  'traceAnalytics.sessionPlural': {
    es: 'sesiones',
    en: 'sessions',
    pt: 'sessões',
  },

  // Chronology button
  'traceAnalytics.viewChronology': {
    es: 'Ver cronología',
    en: 'View chronology',
    pt: 'Ver cronologia',
  },

  // Sector view
  'traceAnalytics.equipmentInSector': {
    es: 'Equipos en este sector',
    en: 'Equipment in this sector',
    pt: 'Equipamentos neste setor',
  },
  'traceAnalytics.emptyNoSectors': {
    es: 'No hay sectores en este proyecto.',
    en: 'There are no sectors in this project.',
    pt: 'Não há setores neste projeto.',
  },

  // Equipo view
  'traceAnalytics.hoursWorked': {
    es: 'Horas trabajadas',
    en: 'Hours worked',
    pt: 'Horas trabalhadas',
  },
  'traceAnalytics.downtime': {
    es: 'Detenciones',
    en: 'Downtime',
    pt: 'Paradas',
  },
  'traceAnalytics.whereAndWhat': {
    es: 'Dónde trabajó y qué hizo',
    en: 'Where it worked and what it did',
    pt: 'Onde trabalhou e o que fez',
  },
  'traceAnalytics.emptyNoSessionsRange': {
    es: 'No hay sesiones en el rango.',
    en: 'There are no sessions in the range.',
    pt: 'Não há sessões no intervalo.',
  },

  // Checklists tab
  'traceAnalytics.generating': {
    es: 'Generando…',
    en: 'Generating…',
    pt: 'Gerando…',
  },
  'traceAnalytics.exportConsolidatedDossier': {
    es: 'Exportar dossier consolidado ({count})',
    en: 'Export consolidated dossier ({count})',
    pt: 'Exportar dossiê consolidado ({count})',
  },
  'traceAnalytics.statusActive': {
    es: 'ACTIVA',
    en: 'ACTIVE',
    pt: 'ATIVA',
  },
  'traceAnalytics.statusPaused': {
    es: 'PAUSADA',
    en: 'PAUSED',
    pt: 'PAUSADA',
  },
  'traceAnalytics.statusClosed': {
    es: 'CERRADA',
    en: 'CLOSED',
    pt: 'FECHADA',
  },
  'traceAnalytics.completionIncomplete': {
    es: 'Incompleto · {answered}/{total}',
    en: 'Incomplete · {answered}/{total}',
    pt: 'Incompleto · {answered}/{total}',
  },
  'traceAnalytics.completionCompliant': {
    es: 'Conforme · {total}/{total}',
    en: 'Compliant · {total}/{total}',
    pt: 'Conforme · {total}/{total}',
  },
  'traceAnalytics.completionWithNo': {
    es: 'Con NO · {ok} sí · {ko} no · {na} N/A',
    en: 'With NO · {ok} yes · {ko} no · {na} N/A',
    pt: 'Com NÃO · {ok} sim · {ko} não · {na} N/A',
  },
  'traceAnalytics.emptyNoChecklistSessions': {
    es: 'No hay sesiones con checklist en el rango.',
    en: 'There are no sessions with checklist in the range.',
    pt: 'Não há sessões com checklist no intervalo.',
  },
  'traceAnalytics.noName': {
    es: 'Sin nombre',
    en: 'No name',
    pt: 'Sem nome',
  },

  // PDF tab
  'traceAnalytics.cannotGeneratePdf': {
    es: 'No se pudo generar PDF',
    en: 'Could not generate PDF',
    pt: 'Não foi possível gerar o PDF',
  },
  'traceAnalytics.pdfSummary': {
    es: 'Resumen del PDF',
    en: 'PDF summary',
    pt: 'Resumo do PDF',
  },
  'traceAnalytics.pdfProject': {
    es: 'Proyecto:',
    en: 'Project:',
    pt: 'Projeto:',
  },
  'traceAnalytics.pdfRange': {
    es: 'Rango:',
    en: 'Range:',
    pt: 'Intervalo:',
  },
  'traceAnalytics.pdfExporter': {
    es: 'Exportador:',
    en: 'Exporter:',
    pt: 'Exportador:',
  },
  'traceAnalytics.pdfSessions': {
    es: 'Sesiones:',
    en: 'Sessions:',
    pt: 'Sessões:',
  },
  'traceAnalytics.pdfInfo': {
    es: 'El PDF incluye KPIs globales, análisis por sector (pie + línea de tiempo + leyenda) y por equipo (KPIs + pie + línea de tiempo + leyenda). Los sectores aparecen en el orden del Excel; los no trabajados se incluyen como "No trabajado".',
    en: 'The PDF includes global KPIs, analysis by sector (pie + timeline + legend) and by equipment (KPIs + pie + timeline + legend). Sectors appear in the Excel order; those not worked are included as "Not worked".',
    pt: 'O PDF inclui KPIs globais, análise por setor (pizza + linha do tempo + legenda) e por equipamento (KPIs + pizza + linha do tempo + legenda). Os setores aparecem na ordem do Excel; os não trabalhados são incluídos como "Não trabalhado".',
  },
  'traceAnalytics.generatePdf': {
    es: 'Generar PDF',
    en: 'Generate PDF',
    pt: 'Gerar PDF',
  },
};

export default traceAnalytics;
