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
  'webDash.summaryTitle': { es: 'Dashboard', en: 'Dashboard', pt: 'Painel' },
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

  // ── Dashboard: header condensado / acciones ──
  'webDash.tutorial': { es: 'Tutorial', en: 'Tutorial', pt: 'Tutorial' },
  'webDash.chartsConfig': { es: 'Configurar gráficos', en: 'Configure charts', pt: 'Configurar gráficos' },
  'webDash.openFilters': { es: 'Filtros', en: 'Filters', pt: 'Filtros' },

  // ── Dashboard: modal de filtros ──
  'webDash.filtersModalTitle': { es: 'Filtros', en: 'Filters', pt: 'Filtros' },
  'webDash.apply': { es: 'Aplicar', en: 'Apply', pt: 'Aplicar' },
  'webDash.close': { es: 'Cerrar', en: 'Close', pt: 'Fechar' },

  // ── Dashboard: carrusel + gestión de gráficos ──
  'webDash.chartsCarouselEmpty': { es: 'Aún no hay gráficos. Abre ⚙ para crear tu dashboard.', en: 'No charts yet. Open ⚙ to build your dashboard.', pt: 'Ainda sem gráficos. Abra ⚙ para criar seu painel.' },
  'webDash.manageCharts': { es: 'Gestión de gráficos', en: 'Manage charts', pt: 'Gerenciar gráficos' },
  'webDash.reorderHint': { es: 'Arrastra para reordenar · el orden se refleja en el carrusel', en: 'Drag to reorder · order reflects in the carousel', pt: 'Arraste para reordenar · a ordem reflete no carrossel' },
  'webDash.addChart': { es: 'Agregar gráfico', en: 'Add chart', pt: 'Adicionar gráfico' },
  'webDash.noChartsYet': { es: 'Sin gráficos. Agrega uno abajo.', en: 'No charts. Add one below.', pt: 'Sem gráficos. Adicione um abaixo.' },
  'webDash.deleteChartTitle': { es: 'Eliminar gráfico', en: 'Delete chart', pt: 'Excluir gráfico' },
  'webDash.done': { es: 'Listo', en: 'Done', pt: 'Pronto' },

  // ── Dashboard rediseñado: KPIs ──
  'webDash.kpiProjects': { es: 'Obras', en: 'Projects', pt: 'Obras' },
  'webDash.kpiTotalTests': { es: 'Ensayos totales', en: 'Total tests', pt: 'Ensaios totais' },
  'webDash.kpiProgress': { es: 'Avance de obra', en: 'Work progress', pt: 'Avanço da obra' },
  'webDash.kpiAvgProgress': { es: 'Avance promedio', en: 'Average progress', pt: 'Avanço médio' },
  'webDash.kpiPendingReview': { es: 'Pend. de revisión', en: 'Pending review', pt: 'Pend. de revisão' },
  'webDash.kpiOpenObs': { es: 'Obs. abiertas', en: 'Open obs.', pt: 'Obs. abertas' },
  'webDash.kpiOfExpected': { es: '{done} de {total} esperados', en: '{done} of {total} expected', pt: '{done} de {total} esperados' },

  // ── Dashboard rediseñado: filtros ──
  'webDash.filterSpecialty': { es: 'Especialidad', en: 'Specialty', pt: 'Especialidade' },
  'webDash.filterStatusHint': { es: 'solo mapa', en: 'map only', pt: 'só mapa' },
  'webDash.statusSubmittedShort': { es: 'En revisión', en: 'In review', pt: 'Em revisão' },
  'webDash.statusDraftShort': { es: 'Borrador', en: 'Draft', pt: 'Rascunho' },

  // ── Dashboard rediseñado: donut / panel ──
  'webDash.donutTitle': { es: 'Avance de obra', en: 'Work progress', pt: 'Avanço da obra' },

  // ── Dashboard rediseñado: mapa ──
  'webDash.mapLoading': { es: 'Cargando mapa…', en: 'Loading map…', pt: 'Carregando mapa…' },
  'webDash.mapLayerTests': { es: 'Ensayos', en: 'Tests', pt: 'Ensaios' },
  'webDash.mapOpenTest': { es: 'Abrir ensayo', en: 'Open test', pt: 'Abrir ensaio' },
  'webDash.mapLegendStatus': { es: 'Estados', en: 'Status', pt: 'Estados' },
  'webDash.mapLegendProgress': { es: 'Avance', en: 'Progress', pt: 'Avanço' },
  'webDash.bucketGood': { es: '≥ 70%', en: '≥ 70%', pt: '≥ 70%' },
  'webDash.bucketMid': { es: '40–69%', en: '40–69%', pt: '40–69%' },
  'webDash.bucketLow': { es: '< 40%', en: '< 40%', pt: '< 40%' },
  'webDash.bucketNone': { es: 'Sin esperados', en: 'No expected', pt: 'Sem esperados' },
  'webDash.mapNoGeoTitle': { es: 'Este proyecto aún no tiene mapa', en: 'This project has no map yet', pt: 'Este projeto ainda não tem mapa' },
  'webDash.mapNoGeoBody': { es: 'Carga sectores, una ortofoto o captura GPS en los ensayos para ver el mapa operativo.', en: 'Upload sectors, an orthophoto or capture GPS on tests to see the operational map.', pt: 'Carregue setores, uma ortofoto ou capture GPS nos ensaios para ver o mapa operativo.' },
  'webDash.mapNoGeoCta': { es: 'Configurar geolocalización', en: 'Set up geolocation', pt: 'Configurar geolocalização' },

  // ── Mapa GL (v94): basemaps + 3D + cine ──
  'webDash.mapBaseDark': { es: 'Oscuro', en: 'Dark', pt: 'Escuro' },
  'webDash.mapBaseSat': { es: 'Satélite', en: 'Satellite', pt: 'Satélite' },
  'webDash.mapBaseLight': { es: 'Claro', en: 'Light', pt: 'Claro' },
  'webDash.map3d': { es: '3D', en: '3D', pt: '3D' },
  'webDash.mapCine': { es: 'Cine', en: 'Cinema', pt: 'Cinema' },
  'webDash.mapWebglMissing': { es: 'El mapa interactivo no está disponible en este equipo (WebGL desactivado). Actualiza los drivers de video o usa otro navegador.', en: 'The interactive map is not available on this device (WebGL disabled). Update your video drivers or use another browser.', pt: 'O mapa interativo não está disponível neste dispositivo (WebGL desativado). Atualize os drivers de vídeo ou use outro navegador.' },

  // ── Dashboard rediseñado: portafolio + drill-down ──
  'webDash.portfolioSubtitle': { es: 'Portafolio de obras', en: 'Works portfolio', pt: 'Portfólio de obras' },
  'webDash.backToPortfolio': { es: 'Portafolio', en: 'Portfolio', pt: 'Portfólio' },
  'webDash.rankingTitle': { es: 'Avance por proyecto', en: 'Progress by project', pt: 'Avanço por projeto' },
  'webDash.rankingHint': { es: 'Toca una obra para ver su dashboard', en: 'Tap a project to open its dashboard', pt: 'Toque numa obra para ver seu painel' },
  'webDash.noLocation': { es: 'Sin ubicación', en: 'No location', pt: 'Sem localização' },
  'webDash.portfolioNoGeoTitle': { es: 'Ninguna obra tiene ubicación aún', en: 'No project has a location yet', pt: 'Nenhuma obra tem localização ainda' },
  'webDash.portfolioNoGeoBody': { es: 'El mapa se activa cuando una obra tiene ortofoto, sectores o ensayos con GPS.', en: 'The map activates when a project has an orthophoto, sectors or GPS-tagged tests.', pt: 'O mapa é ativado quando uma obra tem ortofoto, setores ou ensaios com GPS.' },

  // ── Tablas Resumen: gráfico SVG ──
  'webDash.noDataToPlot': { es: 'Sin datos para graficar.', en: 'No data to plot.', pt: 'Sem dados para plotar.' },
  'webDash.axisTimeDate': { es: 'Tiempo (Fecha)', en: 'Time (Date)', pt: 'Tempo (Data)' },
  'webDash.legendTests': { es: 'Ensayos', en: 'Tests', pt: 'Ensaios' },
  'webDash.legendTrendLinear': { es: 'Tendencia (lineal)', en: 'Trend (linear)', pt: 'Tendência (linear)' },
  'webDash.legendTrendQuad': { es: 'Tendencia (cuadrática)', en: 'Trend (quadratic)', pt: 'Tendência (quadrática)' },
  'webDash.legendTrendCubic': { es: 'Tendencia (cúbica)', en: 'Trend (cubic)', pt: 'Tendência (cúbica)' },
};
