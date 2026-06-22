/**
 * i18n — Cadenas del componente NumericTable (tabla de protocolos numéricos / motor xref).
 * Namespace: numericTable. SOLO etiquetas de UI visibles (NO toca DSL/fórmulas/xref/scope/enum/datos
 * ni formateo de valores). Cada clave: { es, en, pt }. Interpolación con {var}.
 */
const numericTable: Record<string, { es: string; en: string; pt: string }> = {
  // Encabezados de tabla
  'numericTable.header.activity': { es: 'Actividad', en: 'Activity', pt: 'Atividade' },
  'numericTable.header.value': { es: 'Valor', en: 'Value', pt: 'Valor' },

  // Banda de sección — sufijo de número de columnas (abreviado)
  'numericTable.section.cols.one': { es: 'col', en: 'col', pt: 'col' },
  'numericTable.section.cols.other': { es: 'cols', en: 'cols', pt: 'cols' },

  // Celda Sí / No (bool)
  'numericTable.bool.yes': { es: 'Sí', en: 'Yes', pt: 'Sim' },
  'numericTable.bool.no': { es: 'No', en: 'No', pt: 'Não' },

  // Placeholders de celdas de entrada
  'numericTable.placeholder.date': { es: 'dd/mm/aaaa', en: 'dd/mm/yyyy', pt: 'dd/mm/aaaa' },
  'numericTable.placeholder.time': { es: 'HH:MM', en: 'HH:MM', pt: 'HH:MM' },
  'numericTable.placeholder.text': { es: 'texto', en: 'text', pt: 'texto' },
  'numericTable.placeholder.search': { es: 'Buscar…', en: 'Search…', pt: 'Buscar…' },
  'numericTable.placeholder.searchByCode': { es: 'Buscar por código…', en: 'Search by code…', pt: 'Buscar por código…' },

  // Selector xref
  'numericTable.xref.choose': { es: '＋ Elegir', en: '＋ Choose', pt: '＋ Escolher' },

  // Botones de la barra superior
  'numericTable.startFill': { es: 'Empezar llenado', en: 'Start filling', pt: 'Iniciar preenchimento' },
  'numericTable.viewTables': { es: 'Ver tablas ({count})', en: 'View tables ({count})', pt: 'Ver tabelas ({count})' },

  // Herramienta de desarrollo (autollenado)
  'numericTable.devFill': { es: 'Autollenar (dev)', en: 'Auto-fill (dev)', pt: 'Autopreencher (dev)' },
  'numericTable.devTestValue': { es: 'Prueba dev', en: 'Dev test', pt: 'Teste dev' },

  // Gráfico
  'numericTable.chart.reload': { es: 'Recargar', en: 'Reload', pt: 'Recarregar' },

  // Banner de fuera de rango
  'numericTable.banner.outOfRange.one': { es: '{count} valor fuera de rango o con formato inválido.', en: '{count} value out of range or with invalid format.', pt: '{count} valor fora do intervalo ou com formato inválido.' },
  'numericTable.banner.outOfRange.other': { es: '{count} valores fuera de rango o con formato inválido.', en: '{count} values out of range or with invalid format.', pt: '{count} valores fora do intervalo ou com formato inválido.' },

  // Modal picker de lista
  'numericTable.listPicker.title': { es: 'Selecciona un valor', en: 'Select a value', pt: 'Selecione um valor' },
  'numericTable.listPicker.empty': { es: 'Sin opciones disponibles.', en: 'No options available.', pt: 'Sem opções disponíveis.' },

  // Modal picker de llamada a otra ficha (xref)
  'numericTable.xrefPicker.title': { es: 'Llamar a otra ficha', en: 'Call another sheet', pt: 'Chamar outra ficha' },
  'numericTable.xrefPicker.titleType': { es: ' · tipo {tipo}', en: ' · type {tipo}', pt: ' · tipo {tipo}' },
  'numericTable.xrefPicker.helpMulti': { es: 'Marca uno o VARIOS ensayos aprobados — las celdas siguientes promediarán sus valores. Toca "Listo" al terminar.', en: 'Select one or SEVERAL approved tests — the following cells will average their values. Tap "Done" when finished.', pt: 'Marque um ou VÁRIOS ensaios aprovados — as células seguintes farão a média de seus valores. Toque em "Pronto" ao terminar.' },
  'numericTable.xrefPicker.helpSingle': { es: 'Elige el ensayo aprobado de origen — las celdas siguientes traerán sus valores.', en: 'Choose the source approved test — the following cells will bring its values.', pt: 'Escolha o ensaio aprovado de origem — as células seguintes trarão seus valores.' },
  'numericTable.xrefPicker.helpSingleCell': { es: 'Elige el ensayo aprobado de origen — se traerá su celda {targetKey}.', en: 'Choose the source approved test — its cell {targetKey} will be brought.', pt: 'Escolha o ensaio aprovado de origem — sua célula {targetKey} será trazida.' },
  'numericTable.xrefPicker.groupings': { es: 'AGRUPAMIENTOS', en: 'GROUPINGS', pt: 'AGRUPAMENTOS' },
  'numericTable.xrefPicker.empty': { es: 'No hay ensayos aprobados que coincidan.', en: 'No matching approved tests.', pt: 'Não há ensaios aprovados correspondentes.' },
  'numericTable.xrefPicker.removeAll': { es: 'Quitar todos', en: 'Remove all', pt: 'Remover todos' },
  'numericTable.xrefPicker.removeSelection': { es: 'Quitar selección', en: 'Remove selection', pt: 'Remover seleção' },
  'numericTable.xrefPicker.done': { es: 'Listo', en: 'Done', pt: 'Pronto' },

  // Modal de tablas auxiliares
  'numericTable.matrices.title': { es: 'Tablas auxiliares', en: 'Auxiliary tables', pt: 'Tabelas auxiliares' },
};

export default numericTable;
