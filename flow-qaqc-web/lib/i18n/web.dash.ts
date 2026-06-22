/**
 * i18n (web) — Cadenas del Dashboard y Tablas Resumen (web).
 * Namespace `webDash.*`. Se fusionan en `index.tsx` (ALL_STRINGS).
 */
export const STRINGS_WEB_DASH: Record<string, { es: string; en: string; pt: string }> = {
  // ── Dashboard: cabecera / selector ──
  'webDash.title': { es: 'Dashboard', en: 'Dashboard', pt: 'Painel' },
  'webDash.noProjects': { es: 'Sin proyectos disponibles', en: 'No projects available', pt: 'Nenhum projeto disponível' },
  'webDash.selectProject': { es: 'Seleccionar proyecto', en: 'Select project', pt: 'Selecionar projeto' },

  // ── AnalysisCard ──
  'webDash.tapForDetail': { es: 'Toca para ver detalle', en: 'Tap to view detail', pt: 'Toque para ver detalhe' },
  'webDash.noData': { es: 'Sin datos', en: 'No data', pt: 'Sem dados' },

  // ── Filtros por fecha ──
  'webDash.dateFilters': { es: 'Filtros por fecha', en: 'Date filters', pt: 'Filtros por data' },
  'webDash.dateFiltersHint': { es: 'Afectan: aprobados/rechazados y observaciones', en: 'Affects: approved/rejected and observations', pt: 'Afetam: aprovados/reprovados e observações' },
  'webDash.dateFrom': { es: 'Fecha inicial', en: 'Start date', pt: 'Data inicial' },
  'webDash.dateTo': { es: 'Fecha final', en: 'End date', pt: 'Data final' },
  'webDash.clearFilters': { es: 'Limpiar filtros', en: 'Clear filters', pt: 'Limpar filtros' },

  // ── Tarjetas de análisis ──
  'webDash.approvedVsRejected': { es: 'Aprobados vs Rechazados', en: 'Approved vs Rejected', pt: 'Aprovados vs Reprovados' },
  'webDash.approved': { es: 'Aprobados', en: 'Approved', pt: 'Aprovados' },
  'webDash.rejected': { es: 'Rechazados', en: 'Rejected', pt: 'Reprovados' },
  'webDash.obsOpenVsClosed': { es: 'Obs. Abiertas vs Resueltas', en: 'Open vs Resolved Obs.', pt: 'Obs. Abertas vs Resolvidas' },
  'webDash.obsOpen': { es: 'Abiertas', en: 'Open', pt: 'Abertas' },
  'webDash.obsClosed': { es: 'Resueltas', en: 'Resolved', pt: 'Resolvidas' },

  // ── Gráfico semanal ──
  'webDash.weeklyProgress': { es: 'Avance semanal', en: 'Weekly progress', pt: 'Progresso semanal' },
  'webDash.completedCount': { es: '{done}/{total} completados', en: '{done}/{total} completed', pt: '{done}/{total} concluídos' },
  'webDash.all': { es: 'Todas', en: 'All', pt: 'Todas' },
  'webDash.approvedTooltip': { es: 'Aprobados', en: 'Approved', pt: 'Aprovados' },
  'webDash.weekApprovedProtocols': { es: '{week} — Protocolos aprobados', en: '{week} — Approved protocols', pt: '{week} — Protocolos aprovados' },
  'webDash.noApprovedThisWeek': { es: 'Sin protocolos aprobados esta semana.', en: 'No approved protocols this week.', pt: 'Sem protocolos aprovados esta semana.' },

  // ── Gráfico por especialidad ──
  'webDash.progressBySpecialty': { es: 'Avance por especialidad', en: 'Progress by specialty', pt: 'Progresso por especialidade' },
  'webDash.inProgress': { es: 'En progreso', en: 'In progress', pt: 'Em andamento' },
  'webDash.specProtocols': { es: '{spec} — Protocolos', en: '{spec} — Protocols', pt: '{spec} — Protocolos' },
  'webDash.noSpecProtocols': { es: 'Sin protocolos en esta especialidad.', en: 'No protocols in this specialty.', pt: 'Sem protocolos nesta especialidade.' },
  'webDash.tapBarForDetail': { es: 'Toca una barra para ver detalle', en: 'Tap a bar to view detail', pt: 'Toque numa barra para ver detalhe' },
  'webDash.statusApproved': { es: 'Aprobado', en: 'Approved', pt: 'Aprovado' },
  'webDash.statusRejected': { es: 'Rechazado', en: 'Rejected', pt: 'Reprovado' },

  // ── Anotaciones ──
  'webDash.notes': { es: 'Anotaciones', en: 'Notes', pt: 'Anotações' },
  'webDash.notePlaceholder': { es: 'Escribe una anotación...', en: 'Write a note...', pt: 'Escreva uma anotação...' },
  'webDash.noNotesYet': { es: 'Sin anotaciones aún.', en: 'No notes yet.', pt: 'Ainda sem anotações.' },
  'webDash.deleteNoteTitle': { es: '¿Eliminar anotación?', en: 'Delete note?', pt: 'Excluir anotação?' },
  'webDash.deleteNoteWarning': { es: 'Esta acción no se puede deshacer.', en: 'This action cannot be undone.', pt: 'Esta ação não pode ser desfeita.' },

  // ── Tablas Resumen: cabecera / selector de tipo ──
  'webDash.summaryTitle': { es: 'Tablas Resumen', en: 'Summary Tables', pt: 'Tabelas Resumo' },
  'webDash.crumbProjects': { es: 'Proyectos', en: 'Projects', pt: 'Projetos' },
  'webDash.choseTestType': { es: 'Elige un tipo de ensayo para ver su tabla resumen consolidada.', en: 'Choose a test type to view its consolidated summary table.', pt: 'Escolha um tipo de ensaio para ver sua tabela resumo consolidada.' },
  'webDash.noSummaryData': { es: 'Aún no hay datos. Las tablas se construyen al', en: 'No data yet. Tables are built when you', pt: 'Ainda não há dados. As tabelas são criadas ao' },
  'webDash.noSummaryDataBold': { es: 'guardar/enviar ensayos numéricos', en: 'save/submit numeric tests', pt: 'salvar/enviar ensaios numéricos' },
  'webDash.testCountOne': { es: '{n} ensayo', en: '{n} test', pt: '{n} ensaio' },
  'webDash.testCountMany': { es: '{n} ensayos', en: '{n} tests', pt: '{n} ensaios' },
  'webDash.customConfig': { es: ' · config personalizada', en: ' · custom config', pt: ' · config personalizada' },
  'webDash.autoColumns': { es: ' · columnas automáticas', en: ' · automatic columns', pt: ' · colunas automáticas' },

  // ── Tablas Resumen: barra de acciones ──
  'webDash.backToTestTypes': { es: '← Tipos de ensayo', en: '← Test types', pt: '← Tipos de ensaio' },
  'webDash.firstColTitle': { es: 'Elegir la primera columna (fija)', en: 'Choose the first (fixed) column', pt: 'Escolher a primeira coluna (fixa)' },
  'webDash.firstColLabel': { es: '1ra columna: {col}', en: '1st column: {col}', pt: '1ª coluna: {col}' },
  'webDash.colDate': { es: 'Fecha', en: 'Date', pt: 'Data' },
  'webDash.generateChart': { es: 'Generar gráfico', en: 'Generate chart', pt: 'Gerar gráfico' },
  'webDash.exportCsv': { es: 'Exportar CSV', en: 'Export CSV', pt: 'Exportar CSV' },

  // ── Tablas Resumen: filtros ──
  'webDash.filters': { es: 'Filtros', en: 'Filters', pt: 'Filtros' },
  'webDash.filteredOf': { es: '{shown} de {total}', en: '{shown} of {total}', pt: '{shown} de {total}' },
  'webDash.clear': { es: 'Limpiar', en: 'Clear', pt: 'Limpar' },
  'webDash.status': { es: 'Estado', en: 'Status', pt: 'Estado' },
  'webDash.statusInReview': { es: 'En revisión', en: 'In review', pt: 'Em revisão' },
  'webDash.sector': { es: 'Sector', en: 'Sector', pt: 'Setor' },
  'webDash.location': { es: 'Ubicación', en: 'Location', pt: 'Localização' },
  'webDash.allMale': { es: 'Todos', en: 'All', pt: 'Todos' },
  'webDash.allFemale': { es: 'Todas', en: 'All', pt: 'Todas' },

  // ── Tablas Resumen: tabla / estados vacíos ──
  'webDash.noTestMatches': { es: 'Ningún ensayo coincide con los filtros.', en: 'No test matches the filters.', pt: 'Nenhum ensaio corresponde aos filtros.' },

  // ── Tablas Resumen: medidas ──
  'webDash.measureAvg': { es: 'Promedio', en: 'Average', pt: 'Média' },
  'webDash.measureStd': { es: 'Desv. estándar', en: 'Std. deviation', pt: 'Desvio padrão' },
  'webDash.measureMax': { es: 'Máximo', en: 'Maximum', pt: 'Máximo' },
  'webDash.measureMin': { es: 'Mínimo', en: 'Minimum', pt: 'Mínimo' },
  'webDash.chooseMeasure': { es: 'Elige una medida…', en: 'Choose a measure…', pt: 'Escolha uma medida…' },
  'webDash.newMeasure': { es: 'Nueva medida', en: 'New measure', pt: 'Nova medida' },

  // ── Tablas Resumen: gráfico ──
  'webDash.scatterVsTime': { es: 'Dispersión — {param} vs Tiempo', en: 'Scatter — {param} vs Time', pt: 'Dispersão — {param} vs Tempo' },
  'webDash.value': { es: 'Valor', en: 'Value', pt: 'Valor' },
  'webDash.generateScatter': { es: 'Generar gráfico de dispersión', en: 'Generate scatter chart', pt: 'Gerar gráfico de dispersão' },
  'webDash.axisX': { es: 'Eje X', en: 'X axis', pt: 'Eixo X' },
  'webDash.axisXValue': { es: 'Tiempo (Fecha del ensayo)', en: 'Time (Test date)', pt: 'Tempo (Data do ensaio)' },
  'webDash.axisYParam': { es: 'Eje Y (parámetro)', en: 'Y axis (parameter)', pt: 'Eixo Y (parâmetro)' },
  'webDash.chooseColumn': { es: 'Elige una columna…', en: 'Choose a column…', pt: 'Escolha uma coluna…' },
  'webDash.trendLine': { es: 'Línea de tendencia', en: 'Trend line', pt: 'Linha de tendência' },
  'webDash.trendLinear': { es: 'Lineal', en: 'Linear', pt: 'Linear' },
  'webDash.trendQuad': { es: 'Cuadrática', en: 'Quadratic', pt: 'Quadrática' },
  'webDash.trendCubic': { es: 'Cúbica', en: 'Cubic', pt: 'Cúbica' },
  'webDash.generate': { es: 'Generar', en: 'Generate', pt: 'Gerar' },

  // ── Tablas Resumen: modal 1ª columna ──
  'webDash.firstColModalTitle': { es: 'Primera columna (fija)', en: 'First column (fixed)', pt: 'Primeira coluna (fixa)' },
  'webDash.accept': { es: 'Aceptar', en: 'Accept', pt: 'Aceitar' },

  // ── Tablas Resumen: gráfico SVG ──
  'webDash.noDataToPlot': { es: 'Sin datos para graficar.', en: 'No data to plot.', pt: 'Sem dados para plotar.' },
  'webDash.axisTimeDate': { es: 'Tiempo (Fecha)', en: 'Time (Date)', pt: 'Tempo (Data)' },
  'webDash.legendTests': { es: 'Ensayos', en: 'Tests', pt: 'Ensaios' },
  'webDash.legendTrendLinear': { es: 'Tendencia (lineal)', en: 'Trend (linear)', pt: 'Tendência (linear)' },
  'webDash.legendTrendQuad': { es: 'Tendencia (cuadrática)', en: 'Trend (quadratic)', pt: 'Tendência (quadrática)' },
  'webDash.legendTrendCubic': { es: 'Tendencia (cúbica)', en: 'Trend (cubic)', pt: 'Tendência (cúbica)' },
};
