/**
 * i18n — Cadenas de SamplesScreen (módulo "Ensayos por muestra").
 * Una entrada por string visible reemplazado en la pantalla.
 */
const samples: Record<string, { es: string; en: string; pt: string }> = {
  // Header
  'samples.title': { es: 'Ensayos por muestra', en: 'Tests by sample', pt: 'Ensaios por amostra' },

  // Filtros
  'samples.filters': { es: 'Filtros', en: 'Filters', pt: 'Filtros' },
  'samples.filtersActive': { es: 'Filtros · activos', en: 'Filters · active', pt: 'Filtros · ativos' },
  'samples.clear': { es: 'Limpiar', en: 'Clear', pt: 'Limpar' },
  'samples.searchPlaceholder': { es: 'Buscar por código o material…', en: 'Search by code or material…', pt: 'Buscar por código ou material…' },
  'samples.sector': { es: 'Sector', en: 'Sector', pt: 'Setor' },
  'samples.sampleRange': { es: 'Rango de muestra', en: 'Sample range', pt: 'Faixa de amostra' },
  'samples.sampleRangeValue': { es: 'Muestra {from}–{to}', en: 'Sample {from}–{to}', pt: 'Amostra {from}–{to}' },
  'samples.layer': { es: 'Capa', en: 'Layer', pt: 'Camada' },
  'samples.layerValue': { es: 'Capa {layer}', en: 'Layer {layer}', pt: 'Camada {layer}' },

  // Añadir / lista vacía
  'samples.addSample': { es: 'Añadir muestra', en: 'Add sample', pt: 'Adicionar amostra' },
  'samples.identifierWarning': { es: '⚠ Define el identificador de proyecto en Configuración para el código de muestras.', en: '⚠ Set the project identifier in Settings for the sample code.', pt: '⚠ Defina o identificador do projeto em Configurações para o código das amostras.' },
  'samples.empty': { es: 'Sin muestras todavía.', en: 'No samples yet.', pt: 'Nenhuma amostra ainda.' },
  'samples.testsLabel': { es: 'ensayos', en: 'tests', pt: 'ensaios' },

  // Barra de exportación (selección)
  'samples.selectedCount': { es: '{count} seleccionada(s)', en: '{count} selected', pt: '{count} selecionada(s)' },
  'samples.generating': { es: 'Generando…', en: 'Generating…', pt: 'Gerando…' },
  'samples.exportDossier': { es: 'Exportar dossier', en: 'Export dossier', pt: 'Exportar dossiê' },

  // Alertas
  'samples.error': { es: 'Error', en: 'Error', pt: 'Erro' },
  'samples.dossierError': { es: 'No se pudo generar el dossier.\n{detail}', en: 'Could not generate the dossier.\n{detail}', pt: 'Não foi possível gerar o dossiê.\n{detail}' },
  'samples.invalidDateTitle': { es: 'Fecha inválida', en: 'Invalid date', pt: 'Data inválida' },
  'samples.invalidDateMsg': { es: 'Usa AAAA-MM-DD.', en: 'Use YYYY-MM-DD.', pt: 'Use AAAA-MM-DD.' },
  'samples.createError': { es: 'No se pudo crear la muestra.', en: 'Could not create the sample.', pt: 'Não foi possível criar a amostra.' },

  // Modal: nueva muestra
  'samples.newSample': { es: 'Nueva muestra', en: 'New sample', pt: 'Nova amostra' },
  'samples.sampleDate': { es: 'Fecha de la muestra', en: 'Sample date', pt: 'Data da amostra' },
  'samples.datePlaceholder': { es: 'AAAA-MM-DD', en: 'YYYY-MM-DD', pt: 'AAAA-MM-DD' },
  'samples.materialType': { es: 'Tipo de material', en: 'Material type', pt: 'Tipo de material' },
  'samples.select': { es: 'Seleccionar…', en: 'Select…', pt: 'Selecionar…' },
  'samples.condition': { es: 'Condición', en: 'Condition', pt: 'Condição' },
  'samples.altered': { es: 'Alterada', en: 'Disturbed', pt: 'Deformada' },
  'samples.undisturbed': { es: 'Inalterada', en: 'Undisturbed', pt: 'Indeformada' },
  'samples.depth': { es: 'Profundidad (m)', en: 'Depth (m)', pt: 'Profundidade (m)' },
  'samples.depthFrom': { es: 'Inicial', en: 'From', pt: 'Inicial' },
  'samples.depthTo': { es: 'Final', en: 'To', pt: 'Final' },

  // Ubicación
  'samples.location': { es: 'Ubicación', en: 'Location', pt: 'Localização' },
  'samples.datumHint': { es: 'Datum del proyecto: {system}', en: 'Project datum: {system}', pt: 'Datum do projeto: {system}' },
  'samples.east': { es: 'Este', en: 'East', pt: 'Este' },
  'samples.north': { es: 'Norte', en: 'North', pt: 'Norte' },
  'samples.elevation': { es: 'Cota', en: 'Elevation', pt: 'Cota' },
  'samples.captureCoords': { es: 'Capturar coordenadas y sector', en: 'Capture coordinates and sector', pt: 'Capturar coordenadas e setor' },
  'samples.gpsHint': { es: 'GPS: {lat}, {lng} {acc}', en: 'GPS: {lat}, {lng} {acc}', pt: 'GPS: {lat}, {lng} {acc}' },
  'samples.gpsAccuracy': { es: '(±{m} m)', en: '(±{m} m)', pt: '(±{m} m)' },
  'samples.sectorAuto': { es: 'Sector (automático por GPS)', en: 'Sector (auto by GPS)', pt: 'Setor (automático por GPS)' },

  // Capa (formulario)
  'samples.layerInfo': { es: 'Información de capa', en: 'Layer information', pt: 'Informações da camada' },
  'samples.layerPrefix': { es: 'Capa -', en: 'Layer -', pt: 'Camada -' },
  'samples.numberPlaceholder': { es: 'N°', en: 'No.', pt: 'N°' },

  // Crear
  'samples.creating': { es: 'Creando…', en: 'Creating…', pt: 'Criando…' },
  'samples.createSample': { es: 'Crear muestra', en: 'Create sample', pt: 'Criar amostra' },

  // Picker de filtro por sector
  'samples.filterBySector': { es: 'Filtrar por tramo / sector', en: 'Filter by segment / sector', pt: 'Filtrar por trecho / setor' },
  'samples.allSegments': { es: 'Todos los tramos', en: 'All segments', pt: 'Todos os trechos' },

  // Modal rango de muestras
  'samples.sampleRangeTitle': { es: 'Rango de muestras', en: 'Sample range', pt: 'Faixa de amostras' },
  'samples.fromSample': { es: 'Desde muestra', en: 'From sample', pt: 'Da amostra' },
  'samples.toSample': { es: 'Hasta muestra', en: 'To sample', pt: 'Até a amostra' },
  'samples.apply': { es: 'Aplicar', en: 'Apply', pt: 'Aplicar' },

  // Modal filtro por capa
  'samples.filterByLayer': { es: 'Filtrar por capa', en: 'Filter by layer', pt: 'Filtrar por camada' },

  // Picker de material
  'samples.noMaterials': { es: 'Aún no hay materiales. Agrega uno abajo.', en: 'No materials yet. Add one below.', pt: 'Ainda não há materiais. Adicione um abaixo.' },
  'samples.newMaterialPlaceholder': { es: 'Nuevo material…', en: 'New material…', pt: 'Novo material…' },
  'samples.materialHint': { es: 'Escribe y pulsa + para añadirlo al catálogo del proyecto, o tócalo arriba para seleccionarlo.', en: 'Type and tap + to add it to the project catalog, or tap one above to select it.', pt: 'Digite e toque em + para adicioná-lo ao catálogo do projeto, ou toque acima para selecioná-lo.' },

  // Editar material
  'samples.editMaterial': { es: 'Editar material', en: 'Edit material', pt: 'Editar material' },
  'samples.save': { es: 'Guardar', en: 'Save', pt: 'Salvar' },

  // Config del formulario
  'samples.formFieldsTitle': { es: 'Campos del formulario de muestra', en: 'Sample form fields', pt: 'Campos do formulário de amostra' },
  'samples.formFieldsHint': { es: 'Define qué filas aparecen al añadir una muestra. Se guarda para todo el proyecto.', en: 'Choose which rows appear when adding a sample. Saved for the whole project.', pt: 'Defina quais linhas aparecem ao adicionar uma amostra. Salvo para todo o projeto.' },
  'samples.done': { es: 'Listo', en: 'Done', pt: 'Pronto' },

  // Etiquetas de filas configurables (ROW_LABELS)
  'samples.rowMaterial': { es: 'Tipo de material', en: 'Material type', pt: 'Tipo de material' },
  'samples.rowCondition': { es: 'Condición (alterada/inalterada)', en: 'Condition (disturbed/undisturbed)', pt: 'Condição (deformada/indeformada)' },
  'samples.rowDepth': { es: 'Profundidad', en: 'Depth', pt: 'Profundidade' },
  'samples.rowCoords': { es: 'Ubicación (coordenadas + sector)', en: 'Location (coordinates + sector)', pt: 'Localização (coordenadas + setor)' },
  'samples.rowLayers': { es: 'Información de capa', en: 'Layer information', pt: 'Informações da camada' },

  // Sin opciones (PickerModal)
  'samples.noOptions': { es: 'Sin opciones', en: 'No options', pt: 'Sem opções' },
};

export default samples;
