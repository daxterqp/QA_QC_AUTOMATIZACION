/**
 * i18n (web) — Cadenas de las páginas Dossier, Trazabilidad e Histórico/Dashboard.
 * Namespace `webDossier.*`. Se fusionan en `index.tsx` (ALL_STRINGS).
 */
export const STRINGS_WEB_DOSSIER: Record<string, { es: string; en: string; pt: string }> = {
  // ── Común a las 3 páginas ──
  'webDossier.crumbProjects': { es: 'Proyectos', en: 'Projects', pt: 'Projetos' },

  // ── Dossier: filtros de estado ──
  'webDossier.statusApproved': { es: 'Aprobados', en: 'Approved', pt: 'Aprovados' },
  'webDossier.statusInReview': { es: 'En revisión', en: 'In review', pt: 'Em revisão' },
  'webDossier.statusRejected': { es: 'Rechazados', en: 'Rejected', pt: 'Rejeitados' },

  // ── Dossier: tarjeta de protocolo ──
  'webDossier.exportProtocolPdf': { es: 'Exportar protocolo como PDF', en: 'Export protocol as PDF', pt: 'Exportar protocolo como PDF' },
  'webDossier.cardLocation': { es: 'Ubicación: {name}', en: 'Location: {name}', pt: 'Localização: {name}' },
  'webDossier.cardSupervisor': { es: 'Supervisor: {name}', en: 'Supervisor: {name}', pt: 'Supervisor: {name}' },
  'webDossier.cardApprovedBy': { es: 'Aprobado por: {name}', en: 'Approved by: {name}', pt: 'Aprovado por: {name}' },
  'webDossier.approve': { es: 'Aprobar', en: 'Approve', pt: 'Aprovar' },
  'webDossier.reject': { es: 'Rechazar', en: 'Reject', pt: 'Rejeitar' },

  // ── Dossier: modal de rechazo ──
  'webDossier.rejectReasonTitle': { es: 'Motivo del rechazo', en: 'Reason for rejection', pt: 'Motivo da rejeição' },
  'webDossier.rejectReasonHelp': { es: 'El supervisor verá este mensaje al abrir el protocolo.', en: 'The supervisor will see this message when opening the protocol.', pt: 'O supervisor verá esta mensagem ao abrir o protocolo.' },
  'webDossier.rejectReasonPlaceholder': { es: 'Describe el motivo del rechazo...', en: 'Describe the reason for rejection...', pt: 'Descreva o motivo da rejeição...' },
  'webDossier.confirmReject': { es: 'Confirmar rechazo', en: 'Confirm rejection', pt: 'Confirmar rejeição' },

  // ── Dossier: cabecera y exportación ──
  'webDossier.dossierTitle': { es: 'Dosier de Protocolos', en: 'Protocol Dossier', pt: 'Dossiê de Protocolos' },
  'webDossier.exportFullPdf': { es: 'Exportar dossier completo como PDF', en: 'Export full dossier as PDF', pt: 'Exportar dossiê completo como PDF' },
  'webDossier.exportPdf': { es: 'Exportar PDF', en: 'Export PDF', pt: 'Exportar PDF' },
  'webDossier.generating': { es: 'Generando...', en: 'Generating...', pt: 'Gerando...' },
  'webDossier.generatingPdf': { es: 'Generando PDF...', en: 'Generating PDF...', pt: 'Gerando PDF...' },
  'webDossier.exportStarting': { es: 'Iniciando...', en: 'Starting...', pt: 'Iniciando...' },

  // ── Dossier: filtros ──
  'webDossier.filters': { es: 'Filtros', en: 'Filters', pt: 'Filtros' },
  'webDossier.clearFilters': { es: 'Limpiar filtros', en: 'Clear filters', pt: 'Limpar filtros' },
  'webDossier.dateFrom': { es: 'Fecha inicial', en: 'Start date', pt: 'Data inicial' },
  'webDossier.dateTo': { es: 'Fecha final', en: 'End date', pt: 'Data final' },
  'webDossier.statusLabel': { es: 'Estado', en: 'Status', pt: 'Estado' },
  'webDossier.testType': { es: 'Tipo de ensayo', en: 'Test type', pt: 'Tipo de ensaio' },
  'webDossier.optionAll': { es: 'Todos', en: 'All', pt: 'Todos' },
  'webDossier.location': { es: 'Ubicación', en: 'Location', pt: 'Localização' },
  'webDossier.optionAllFem': { es: 'Todas', en: 'All', pt: 'Todas' },
  'webDossier.sector': { es: 'Sector', en: 'Sector', pt: 'Setor' },
  'webDossier.countProtocols': { es: '{filtered} de {total} protocolo{plural}', en: '{filtered} of {total} protocol{plural}', pt: '{filtered} de {total} protocolo{plural}' },
  'webDossier.filteredSuffix': { es: ' (filtrado)', en: ' (filtered)', pt: ' (filtrado)' },

  // ── Dossier: estados vacíos ──
  'webDossier.emptyTitle': { es: 'Sin protocolos enviados aún', en: 'No protocols submitted yet', pt: 'Nenhum protocolo enviado ainda' },
  'webDossier.emptyDesc': { es: 'Los protocolos aparecerán aquí cuando un supervisor los envíe a revisión.', en: 'Protocols will appear here once a supervisor submits them for review.', pt: 'Os protocolos aparecerão aqui quando um supervisor os enviar para revisão.' },
  'webDossier.noMatch': { es: 'Ningún protocolo coincide con los filtros', en: 'No protocol matches the filters', pt: 'Nenhum protocolo corresponde aos filtros' },
  'webDossier.protocolsCount': { es: '{n} protocolo{plural}', en: '{n} protocol{plural}', pt: '{n} protocolo{plural}' },

  // ── Trazabilidad: cabecera y módulo ──
  'webDossier.traceTitle': { es: 'Trazabilidad operacional', en: 'Operational traceability', pt: 'Rastreabilidade operacional' },
  'webDossier.moduleDisabledTitle': { es: 'Módulo no activado', en: 'Module not enabled', pt: 'Módulo não ativado' },
  'webDossier.moduleDisabledDescBefore': { es: 'El módulo de Trazabilidad operacional está apagado para este proyecto. Actívalo en', en: 'The Operational traceability module is turned off for this project. Enable it in', pt: 'O módulo de Rastreabilidade operacional está desativado para este projeto. Ative-o em' },
  'webDossier.moduleDisabledConfig': { es: 'Configuración del proyecto', en: 'Project settings', pt: 'Configurações do projeto' },
  'webDossier.moduleDisabledDescAfter': { es: 'y carga los catálogos vía Excel.', en: 'and load the catalogs via Excel.', pt: 'e carregue os catálogos via Excel.' },

  // ── Trazabilidad: tabs ──
  'webDossier.tabBySector': { es: 'Por sector', en: 'By sector', pt: 'Por setor' },
  'webDossier.tabTimeline': { es: 'Línea de tiempo', en: 'Timeline', pt: 'Linha do tempo' },
  'webDossier.tabSummary': { es: 'Resumen consolidado', en: 'Consolidated summary', pt: 'Resumo consolidado' },
  'webDossier.tabByEquipment': { es: 'Por equipo', en: 'By equipment', pt: 'Por equipamento' },
  'webDossier.tabByPersonnel': { es: 'Por personal', en: 'By personnel', pt: 'Por pessoal' },

  // ── Trazabilidad: KPIs ──
  'webDossier.kpiHoursWorked': { es: 'Horas trabajadas', en: 'Hours worked', pt: 'Horas trabalhadas' },
  'webDossier.kpiSessions': { es: 'Sesiones', en: 'Sessions', pt: 'Sessões' },
  'webDossier.kpiEquipmentUsed': { es: 'Equipos usados', en: 'Equipment used', pt: 'Equipamentos usados' },
  'webDossier.kpiSectors': { es: 'Sectores', en: 'Sectors', pt: 'Setores' },

  // ── Trazabilidad: filtros ──
  'webDossier.traceFrom': { es: 'Desde', en: 'From', pt: 'De' },
  'webDossier.traceTo': { es: 'Hasta', en: 'To', pt: 'Até' },
  'webDossier.clearLower': { es: 'limpiar', en: 'clear', pt: 'limpar' },

  // ── Trazabilidad: contenido ──
  'webDossier.loadingEllipsis': { es: 'Cargando…', en: 'Loading…', pt: 'Carregando…' },
  'webDossier.noSessionsRange': { es: 'No hay sesiones en este rango.', en: 'No sessions in this range.', pt: 'Não há sessões neste intervalo.' },

  // ── Trazabilidad: tablas ──
  'webDossier.colEquipment': { es: 'Equipo', en: 'Equipment', pt: 'Equipamento' },
  'webDossier.colActivity': { es: 'Actividad', en: 'Activity', pt: 'Atividade' },
  'webDossier.colTechnician': { es: 'Técnico', en: 'Technician', pt: 'Técnico' },
  'webDossier.colTime': { es: 'Tiempo', en: 'Time', pt: 'Tempo' },
  'webDossier.colSector': { es: 'Sector', en: 'Sector', pt: 'Setor' },
  'webDossier.colSessions': { es: 'Sesiones', en: 'Sessions', pt: 'Sessões' },
  'webDossier.noSector': { es: 'Sin sector', en: 'No sector', pt: 'Sem setor' },
  'webDossier.sessionsCount': { es: '{n} sesiones', en: '{n} sessions', pt: '{n} sessões' },
  'webDossier.autoClosedTooltip': { es: 'Sesion cerrada automaticamente por inactividad — duracion puede ser inexacta', en: 'Session closed automatically due to inactivity — duration may be inaccurate', pt: 'Sessão fechada automaticamente por inatividade — a duração pode ser imprecisa' },
  'webDossier.autoClosedAria': { es: 'Sesion cerrada automaticamente por inactividad', en: 'Session closed automatically due to inactivity', pt: 'Sessão fechada automaticamente por inatividade' },

  // ── Trazabilidad: timeline ──
  'webDossier.timelineTitle': { es: 'Línea de tiempo · {n} técnicos', en: 'Timeline · {n} technicians', pt: 'Linha do tempo · {n} técnicos' },
  'webDossier.legendProductive': { es: 'Productivo', en: 'Productive', pt: 'Produtivo' },
  'webDossier.legendMaintenance': { es: 'Mantenimiento', en: 'Maintenance', pt: 'Manutenção' },
  'webDossier.legendTransport': { es: 'Transporte', en: 'Transport', pt: 'Transporte' },
  'webDossier.legendOther': { es: 'Otro', en: 'Other', pt: 'Outro' },

  // ── Trazabilidad: resumen ──
  'webDossier.summaryByEquipActivity': { es: 'Por Equipo + Actividad', en: 'By Equipment + Activity', pt: 'Por Equipamento + Atividade' },
  'webDossier.summaryBySector': { es: 'Por Sector', en: 'By Sector', pt: 'Por Setor' },

  // ── Trazabilidad: por equipo ──
  'webDossier.autoClosedBanner': { es: '{n} sesiones fueron cerradas automaticamente. Sus duraciones pueden ser inexactas.', en: '{n} sessions were closed automatically. Their durations may be inaccurate.', pt: '{n} sessões foram fechadas automaticamente. Suas durações podem ser imprecisas.' },
  'webDossier.kpiProductive': { es: 'Productivo', en: 'Productive', pt: 'Produtivo' },
  'webDossier.kpiMaintenance': { es: 'Mantenimiento', en: 'Maintenance', pt: 'Manutenção' },
  'webDossier.kpiUtilization': { es: 'Utilización', en: 'Utilization', pt: 'Utilização' },
  'webDossier.kpiAvailability': { es: 'Disponibilidad', en: 'Availability', pt: 'Disponibilidade' },
  'webDossier.whereWorked': { es: 'Dónde trabajó', en: 'Where it worked', pt: 'Onde trabalhou' },

  // ── Trazabilidad: por personal ──
  'webDossier.equipmentCount': { es: '{n} equipos', en: '{n} equipment', pt: '{n} equipamentos' },
  'webDossier.sectorsCount': { es: '{n} sectores', en: '{n} sectors', pt: '{n} setores' },

  // ── Histórico / Dashboard ──
  'webDossier.dashboardTitle': { es: 'Dashboard', en: 'Dashboard', pt: 'Painel' },
  'webDossier.tapForDetail': { es: 'Toca para ver detalle', en: 'Tap to view detail', pt: 'Toque para ver detalhe' },
  'webDossier.noData': { es: 'Sin datos', en: 'No data', pt: 'Sem dados' },

  // ── Dashboard: gráfica semanal ──
  'webDossier.weeklyProgress': { es: 'Avance semanal', en: 'Weekly progress', pt: 'Progresso semanal' },
  'webDossier.completedOf': { es: '{done}/{total} completados', en: '{done}/{total} completed', pt: '{done}/{total} concluídos' },
  'webDossier.allSpecialties': { es: 'Todas', en: 'All', pt: 'Todas' },
  'webDossier.tooltipApproved': { es: 'Aprobados', en: 'Approved', pt: 'Aprovados' },
  'webDossier.weekApprovedProtocols': { es: '{week} — Protocolos aprobados', en: '{week} — Approved protocols', pt: '{week} — Protocolos aprovados' },
  'webDossier.noApprovedThisWeek': { es: 'Sin protocolos aprobados esta semana.', en: 'No approved protocols this week.', pt: 'Nenhum protocolo aprovado esta semana.' },

  // ── Dashboard: gráfica por especialidad ──
  'webDossier.progressBySpecialty': { es: 'Avance por especialidad', en: 'Progress by specialty', pt: 'Progresso por especialidade' },
  'webDossier.legendInProgress': { es: 'En progreso', en: 'In progress', pt: 'Em andamento' },
  'webDossier.legendApproved': { es: 'Aprobados', en: 'Approved', pt: 'Aprovados' },
  'webDossier.legendRejected': { es: 'Rechazados', en: 'Rejected', pt: 'Rejeitados' },
  'webDossier.tapBarForDetail': { es: 'Toca una barra para ver detalle', en: 'Tap a bar to view detail', pt: 'Toque numa barra para ver detalhe' },
  'webDossier.specialtyProtocols': { es: '{name} — Protocolos', en: '{name} — Protocols', pt: '{name} — Protocolos' },
  'webDossier.noProtocolsSpecialty': { es: 'Sin protocolos en esta especialidad.', en: 'No protocols in this specialty.', pt: 'Nenhum protocolo nesta especialidade.' },
  'webDossier.badgeApproved': { es: 'Aprobado', en: 'Approved', pt: 'Aprovado' },
  'webDossier.badgeRejected': { es: 'Rechazado', en: 'Rejected', pt: 'Rejeitado' },

  // ── Dashboard: notas ──
  'webDossier.notes': { es: 'Anotaciones', en: 'Notes', pt: 'Anotações' },
  'webDossier.notePlaceholder': { es: 'Escribe una anotación...', en: 'Write a note...', pt: 'Escreva uma anotação...' },
  'webDossier.save': { es: 'Guardar', en: 'Save', pt: 'Salvar' },
  'webDossier.noNotesYet': { es: 'Sin anotaciones aún.', en: 'No notes yet.', pt: 'Nenhuma anotação ainda.' },
  'webDossier.cancel': { es: 'Cancelar', en: 'Cancel', pt: 'Cancelar' },
  'webDossier.deleteNoteTitle': { es: '¿Eliminar anotación?', en: 'Delete note?', pt: 'Excluir anotação?' },
  'webDossier.deleteNoteWarning': { es: 'Esta acción no se puede deshacer.', en: 'This action cannot be undone.', pt: 'Esta ação não pode ser desfeita.' },
  'webDossier.delete': { es: 'Eliminar', en: 'Delete', pt: 'Excluir' },

  // ── Dashboard: tarjetas de análisis ──
  'webDossier.approvedVsRejected': { es: 'Aprobados vs Rechazados', en: 'Approved vs Rejected', pt: 'Aprovados vs Rejeitados' },
  'webDossier.cardApproved': { es: 'Aprobados', en: 'Approved', pt: 'Aprovados' },
  'webDossier.cardRejected': { es: 'Rechazados', en: 'Rejected', pt: 'Rejeitados' },
  'webDossier.obsOpenVsResolved': { es: 'Obs. Abiertas vs Resueltas', en: 'Open vs Resolved Obs.', pt: 'Obs. Abertas vs Resolvidas' },
  'webDossier.cardOpen': { es: 'Abiertas', en: 'Open', pt: 'Abertas' },
  'webDossier.cardResolved': { es: 'Resueltas', en: 'Resolved', pt: 'Resolvidas' },

  // ── Dashboard: filtros por fecha ──
  'webDossier.dateFilters': { es: 'Filtros por fecha', en: 'Date filters', pt: 'Filtros por data' },
  'webDossier.dateFiltersHelp': { es: 'Afectan: aprobados/rechazados y observaciones', en: 'Affect: approved/rejected and observations', pt: 'Afetam: aprovados/rejeitados e observações' },
  'webDossier.close': { es: 'Cerrar', en: 'Close', pt: 'Fechar' },
};
