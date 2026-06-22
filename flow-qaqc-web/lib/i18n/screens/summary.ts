/**
 * i18n (v46) — Cadenas de la pantalla "Tablas Resumen" (SummaryTablesScreen).
 * Namespace: summary. Solo UI (ES base + EN/PT). No toca datos/DSL/fórmulas.
 */
const summary: Record<string, { es: string; en: string; pt: string }> = {
  // Cabecera / títulos
  'summary.title': { es: 'Tablas Resumen', en: 'Summary Tables', pt: 'Tabelas Resumo' },

  // Selector de tipo de ensayo
  'summary.emptyNoData': {
    es: 'Aún no hay datos. Las tablas se construyen al guardar/enviar ensayos numéricos.',
    en: 'No data yet. Tables are built when numeric tests are saved/submitted.',
    pt: 'Ainda não há dados. As tabelas são criadas ao salvar/enviar ensaios numéricos.',
  },
  'summary.pickTestType': {
    es: 'Elige un tipo de ensayo para ver su tabla resumen.',
    en: 'Choose a test type to view its summary table.',
    pt: 'Escolha um tipo de ensaio para ver sua tabela resumo.',
  },
  'summary.testTypeFallback': { es: 'Tipo', en: 'Type', pt: 'Tipo' },
  'summary.testCount': {
    es: '{count} ensayo{plural}',
    en: '{count} test{plural}',
    pt: '{count} ensaio{plural}',
  },
  'summary.customConfig': { es: ' · config personalizada', en: ' · custom config', pt: ' · config. personalizada' },
  'summary.autoColumns': { es: ' · columnas automáticas', en: ' · automatic columns', pt: ' · colunas automáticas' },

  // Barra superior
  'summary.types': { es: 'Tipos', en: 'Types', pt: 'Tipos' },
  'summary.chart': { es: 'Gráfico', en: 'Chart', pt: 'Gráfico' },
  'summary.csv': { es: 'CSV', en: 'CSV', pt: 'CSV' },

  // Filtros
  'summary.status': { es: 'Estado', en: 'Status', pt: 'Status' },
  'summary.statusApproved': { es: 'Aprobados', en: 'Approved', pt: 'Aprovados' },
  'summary.statusInReview': { es: 'En revisión', en: 'In review', pt: 'Em revisão' },
  'summary.statusRejected': { es: 'Rechazados', en: 'Rejected', pt: 'Reprovados' },
  'summary.sector': { es: 'Sector', en: 'Sector', pt: 'Setor' },
  'summary.all': { es: 'Todos', en: 'All', pt: 'Todos' },
  'summary.dateRange': { es: 'Rango de fechas', en: 'Date range', pt: 'Intervalo de datas' },
  'summary.dateFrom': { es: 'Fecha inicial', en: 'Start date', pt: 'Data inicial' },
  'summary.dateTo': { es: 'Fecha final', en: 'End date', pt: 'Data final' },
  'summary.firstColLabel': { es: '1ra columna (fija)', en: 'First column (fixed)', pt: '1ª coluna (fixa)' },
  'summary.dateColFallback': { es: 'Fecha', en: 'Date', pt: 'Data' },

  // Sin resultados
  'summary.noneMatch': {
    es: 'Ningún ensayo coincide con los filtros.',
    en: 'No test matches the filters.',
    pt: 'Nenhum ensaio corresponde aos filtros.',
  },

  // Medidas (KPIs)
  'summary.measureAvg': { es: 'Promedio', en: 'Average', pt: 'Média' },
  'summary.measureStd': { es: 'Desv. estándar', en: 'Std. deviation', pt: 'Desvio padrão' },
  'summary.measureMax': { es: 'Máximo', en: 'Maximum', pt: 'Máximo' },
  'summary.measureMin': { es: 'Mínimo', en: 'Minimum', pt: 'Mínimo' },

  // Export CSV
  'summary.exportDialogTitle': { es: 'Exportar resumen CSV', en: 'Export summary CSV', pt: 'Exportar resumo CSV' },
  'summary.csvGenerated': { es: 'CSV generado', en: 'CSV generated', pt: 'CSV gerado' },
  'summary.exportError': {
    es: 'No se pudo exportar el CSV.\n',
    en: 'The CSV could not be exported.\n',
    pt: 'Não foi possível exportar o CSV.\n',
  },

  // Modal calendario
  'summary.from': { es: 'Fecha inicial', en: 'Start date', pt: 'Data inicial' },
  'summary.to': { es: 'Fecha final', en: 'End date', pt: 'Data final' },

  // Modal generar gráfico
  'summary.genScatterTitle': {
    es: 'Generar gráfico de dispersión',
    en: 'Generate scatter chart',
    pt: 'Gerar gráfico de dispersão',
  },
  'summary.axisX': { es: 'Eje X', en: 'X axis', pt: 'Eixo X' },
  'summary.axisXFixed': {
    es: 'Tiempo (Fecha del ensayo)',
    en: 'Time (Test date)',
    pt: 'Tempo (Data do ensaio)',
  },
  'summary.axisYParam': { es: 'Eje Y (parámetro)', en: 'Y axis (parameter)', pt: 'Eixo Y (parâmetro)' },
  'summary.trendLine': { es: 'Línea de tendencia', en: 'Trend line', pt: 'Linha de tendência' },
  'summary.trendLinear': { es: 'Lineal', en: 'Linear', pt: 'Linear' },
  'summary.trendQuad': { es: 'Cuadrática', en: 'Quadratic', pt: 'Quadrática' },
  'summary.trendCubic': { es: 'Cúbica', en: 'Cubic', pt: 'Cúbica' },
  'summary.cancel': { es: 'Cancelar', en: 'Cancel', pt: 'Cancelar' },
  'summary.generate': { es: 'Generar', en: 'Generate', pt: 'Gerar' },

  // Modal con el gráfico generado
  'summary.vsTime': { es: ' vs Tiempo', en: ' vs Time', pt: ' vs Tempo' },
  'summary.value': { es: 'Valor', en: 'Value', pt: 'Valor' },

  // Modal elegir 1ª columna
  'summary.firstColModalTitle': {
    es: 'Primera columna (fija)',
    en: 'First column (fixed)',
    pt: 'Primeira coluna (fixa)',
  },
  'summary.accept': { es: 'Aceptar', en: 'Accept', pt: 'Aceitar' },

  // Gráfico de dispersión (ScatterChartRN)
  'summary.testsLegend': { es: '● Ensayos ({label})', en: '● Tests ({label})', pt: '● Ensaios ({label})' },
  'summary.trendLegend': {
    es: '— Tendencia {kind}',
    en: '— {kind} trend',
    pt: '— Tendência {kind}',
  },
  'summary.trendKindLinear': { es: 'lineal', en: 'linear', pt: 'linear' },
  'summary.trendKindQuad': { es: 'cuadrática', en: 'quadratic', pt: 'quadrática' },
  'summary.trendKindCubic': { es: 'cúbica', en: 'cubic', pt: 'cúbica' },
  'summary.timeAxisLabel': { es: 'Tiempo (Fecha)', en: 'Time (Date)', pt: 'Tempo (Data)' },
};

export default summary;
