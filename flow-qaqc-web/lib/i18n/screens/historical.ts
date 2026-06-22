/**
 * i18n (v46) — Cadenas de la pantalla Dashboard histórico (HistoricalScreen).
 * Una entrada por cadena de interfaz reemplazada. ES base; EN/PT traducidos.
 */
const historical: Record<string, { es: string; en: string; pt: string }> = {
  // ── Cabecera ──────────────────────────────────────────────────────────────
  'historical.headerTitle': { es: 'Dashboard', en: 'Dashboard', pt: 'Dashboard' },

  // ── Meses (calendario) ──────────────────────────────────────────────────────
  'historical.monthJanuary': { es: 'Enero', en: 'January', pt: 'Janeiro' },
  'historical.monthFebruary': { es: 'Febrero', en: 'February', pt: 'Fevereiro' },
  'historical.monthMarch': { es: 'Marzo', en: 'March', pt: 'Março' },
  'historical.monthApril': { es: 'Abril', en: 'April', pt: 'Abril' },
  'historical.monthMay': { es: 'Mayo', en: 'May', pt: 'Maio' },
  'historical.monthJune': { es: 'Junio', en: 'June', pt: 'Junho' },
  'historical.monthJuly': { es: 'Julio', en: 'July', pt: 'Julho' },
  'historical.monthAugust': { es: 'Agosto', en: 'August', pt: 'Agosto' },
  'historical.monthSeptember': { es: 'Septiembre', en: 'September', pt: 'Setembro' },
  'historical.monthOctober': { es: 'Octubre', en: 'October', pt: 'Outubro' },
  'historical.monthNovember': { es: 'Noviembre', en: 'November', pt: 'Novembro' },
  'historical.monthDecember': { es: 'Diciembre', en: 'December', pt: 'Dezembro' },

  // ── Días de la semana (abreviados, lunes a domingo) ──────────────────────────
  'historical.dayMon': { es: 'Lu', en: 'Mo', pt: 'Seg' },
  'historical.dayTue': { es: 'Ma', en: 'Tu', pt: 'Ter' },
  'historical.dayWed': { es: 'Mi', en: 'We', pt: 'Qua' },
  'historical.dayThu': { es: 'Ju', en: 'Th', pt: 'Qui' },
  'historical.dayFri': { es: 'Vi', en: 'Fr', pt: 'Sex' },
  'historical.daySat': { es: 'Sa', en: 'Sa', pt: 'Sáb' },
  'historical.daySun': { es: 'Do', en: 'Su', pt: 'Dom' },

  // ── Calendario ──────────────────────────────────────────────────────────────
  'historical.calendarSelect': { es: 'Seleccionar', en: 'Select', pt: 'Selecionar' },
  'historical.calendarClear': { es: 'Limpiar fecha', en: 'Clear date', pt: 'Limpar data' },

  // ── Tarjeta de análisis ───────────────────────────────────────────────────────
  'historical.tapForDetail': { es: 'Toca para ver detalle', en: 'Tap to see detail', pt: 'Toque para ver detalhes' },
  'historical.noData': { es: 'Sin datos', en: 'No data', pt: 'Sem dados' },

  // ── Gráfico semanal ───────────────────────────────────────────────────────────
  'historical.completed': { es: 'completados', en: 'completed', pt: 'concluídos' },
  'historical.weeklyProgress': { es: 'Avance semanal', en: 'Weekly progress', pt: 'Progresso semanal' },
  'historical.allFilter': { es: 'Todas', en: 'All', pt: 'Todas' },
  'historical.weekLabel': { es: 'Semana {n}', en: 'Week {n}', pt: 'Semana {n}' },
  'historical.weekApprovedTitle': { es: '{week} — Protocolos aprobados', en: '{week} — Approved protocols', pt: '{week} — Protocolos aprovados' },
  'historical.weekNoApproved': { es: 'Sin protocolos aprobados esta semana.', en: 'No approved protocols this week.', pt: 'Nenhum protocolo aprovado nesta semana.' },
  'historical.close': { es: 'Cerrar', en: 'Close', pt: 'Fechar' },

  // ── Gráfico por especialidad ─────────────────────────────────────────────────
  'historical.specialtyProgress': { es: 'Avance por especialidad', en: 'Progress by specialty', pt: 'Progresso por especialidade' },
  'historical.legendPending': { es: 'Pendiente', en: 'Pending', pt: 'Pendente' },
  'historical.legendApproved': { es: 'Aprobados', en: 'Approved', pt: 'Aprovados' },
  'historical.legendRejected': { es: 'Rechazados', en: 'Rejected', pt: 'Rejeitados' },
  'historical.specialtyTitle': { es: '{name} — Protocolos', en: '{name} — Protocols', pt: '{name} — Protocolos' },
  'historical.specialtyNoProtocols': { es: 'Sin protocolos en esta especialidad.', en: 'No protocols in this specialty.', pt: 'Nenhum protocolo nesta especialidade.' },
  'historical.statusApproved': { es: 'Aprobado', en: 'Approved', pt: 'Aprovado' },
  'historical.statusRejected': { es: 'Rechazado', en: 'Rejected', pt: 'Rejeitado' },
  'historical.specialtyLongPressHint': { es: 'Mantén presionada una barra para ver detalle', en: 'Long-press a bar to see detail', pt: 'Mantenha pressionada uma barra para ver detalhes' },

  // ── Filtros de fecha ──────────────────────────────────────────────────────────
  'historical.dateFiltersTitle': { es: 'Filtros por fecha', en: 'Date filters', pt: 'Filtros por data' },
  'historical.dateFiltersNote': { es: 'Afectan: aprobados/rechazados y observaciones', en: 'Affect: approved/rejected and observations', pt: 'Afetam: aprovados/rejeitados e observações' },
  'historical.dateFrom': { es: 'Fecha inicial', en: 'Start date', pt: 'Data inicial' },
  'historical.dateTo': { es: 'Fecha final', en: 'End date', pt: 'Data final' },

  // ── Tarjetas de análisis (principal) ─────────────────────────────────────────
  'historical.approvedVsRejected': { es: 'Aprobados vs Rechazados', en: 'Approved vs Rejected', pt: 'Aprovados vs Rejeitados' },
  'historical.labelApproved': { es: 'Aprobados', en: 'Approved', pt: 'Aprovados' },
  'historical.labelRejected': { es: 'Rechazados', en: 'Rejected', pt: 'Rejeitados' },
  'historical.obsOpenVsClosed': { es: 'Obs. Abiertas vs Resueltas', en: 'Open vs Resolved Obs.', pt: 'Obs. Abertas vs Resolvidas' },
  'historical.labelOpen': { es: 'Abiertas', en: 'Open', pt: 'Abertas' },
  'historical.labelResolved': { es: 'Resueltas', en: 'Resolved', pt: 'Resolvidas' },

  // ── Filtro de proyecto ──────────────────────────────────────────────────────
  'historical.allProjects': { es: 'Todos', en: 'All', pt: 'Todos' },

  // ── Anotaciones ───────────────────────────────────────────────────────────────
  'historical.notesTitle': { es: 'Anotaciones', en: 'Notes', pt: 'Anotações' },
  'historical.notePlaceholder': { es: 'Escribe una anotación...', en: 'Write a note...', pt: 'Escreva uma anotação...' },
  'historical.save': { es: 'Guardar', en: 'Save', pt: 'Salvar' },
  'historical.cancel': { es: 'Cancelar', en: 'Cancel', pt: 'Cancelar' },
  'historical.unknownAuthor': { es: '—', en: '—', pt: '—' },
  'historical.notesEmpty': { es: 'Sin anotaciones aún.', en: 'No notes yet.', pt: 'Nenhuma anotação ainda.' },

  // ── Alerta de eliminación de anotación ───────────────────────────────────────
  'historical.deleteNoteTitle': { es: 'Eliminar anotación', en: 'Delete note', pt: 'Excluir anotação' },
  'historical.deleteNoteMsg': { es: '¿Estás seguro de que deseas eliminar esta anotación?', en: 'Are you sure you want to delete this note?', pt: 'Tem certeza de que deseja excluir esta anotação?' },
  'historical.delete': { es: 'Eliminar', en: 'Delete', pt: 'Excluir' },
};

export default historical;
