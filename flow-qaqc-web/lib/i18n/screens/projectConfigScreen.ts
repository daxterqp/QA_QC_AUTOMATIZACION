const projectConfigScreen: Record<string, { es: string; en: string; pt: string }> = {
  'projectConfig.headerTitle': {
    es: 'Configurar módulos',
    en: 'Configure modules',
    pt: 'Configurar módulos',
  },
  'projectConfig.infoText': {
    es: 'Activa los módulos que tu proyecto necesite. Los módulos padre deben estar habilitados antes de poder configurar sus opciones internas.',
    en: 'Enable the modules your project needs. Parent modules must be enabled before you can configure their internal options.',
    pt: 'Ative os módulos de que seu projeto precisa. Os módulos pai devem estar habilitados antes de poder configurar suas opções internas.',
  },

  // ── Sección 1: Configuración de Protocolos ──
  'projectConfig.sectionProtocols': {
    es: 'Configuración de Protocolos',
    en: 'Protocol Settings',
    pt: 'Configuração de Protocolos',
  },
  'projectConfig.classicLabel': {
    es: 'Protocolos clásicos (Sí / No / N.A.)',
    en: 'Classic protocols (Yes / No / N.A.)',
    pt: 'Protocolos clássicos (Sim / Não / N.A.)',
  },
  'projectConfig.classicDesc': {
    es: 'Subjetivos con observación + foto por ítem.',
    en: 'Subjective, with observation + photo per item.',
    pt: 'Subjetivos com observação + foto por item.',
  },
  'projectConfig.numericLabel': {
    es: 'Protocolos numéricos',
    en: 'Numeric protocols',
    pt: 'Protocolos numéricos',
  },
  'projectConfig.numericDesc': {
    es: 'Mediciones con rango, fórmulas, listas, lookup, matrices.',
    en: 'Measurements with range, formulas, lists, lookup, matrices.',
    pt: 'Medições com intervalo, fórmulas, listas, lookup, matrizes.',
  },
  'projectConfig.parametricLabel': {
    es: 'Plantillas paramétricas',
    en: 'Parametric templates',
    pt: 'Modelos paramétricos',
  },
  'projectConfig.parametricDesc': {
    es: 'Templates con N variable de probetas.',
    en: 'Templates with a variable number of specimens.',
    pt: 'Modelos com N variável de corpos de prova.',
  },
  'projectConfig.historicalLabel': {
    es: 'Carga de históricos',
    en: 'Historical import',
    pt: 'Carga de históricos',
  },
  'projectConfig.historicalDesc': {
    es: 'Importar protocolos llenados en el pasado.',
    en: 'Import protocols filled in the past.',
    pt: 'Importar protocolos preenchidos no passado.',
  },
  'projectConfig.multiLevelLabel': {
    es: 'Aprobación multinivel',
    en: 'Multi-level approval',
    pt: 'Aprovação multinível',
  },
  'projectConfig.multiLevelDesc': {
    es: 'Hasta 3 niveles jerárquicos de firma.',
    en: 'Up to 3 hierarchical signature levels.',
    pt: 'Até 3 níveis hierárquicos de assinatura.',
  },
  'projectConfig.levelsLabel': {
    es: 'Niveles:',
    en: 'Levels:',
    pt: 'Níveis:',
  },

  // ── Módulos del proyecto ──
  'projectConfig.projectModulesLabel': {
    es: 'Módulos del proyecto',
    en: 'Project modules',
    pt: 'Módulos do projeto',
  },
  'projectConfig.projectModulesHelp': {
    es: 'Activa/desactiva los módulos visibles en el menú. Esta configuración se propaga a TODOS los usuarios del proyecto.',
    en: 'Enable/disable the modules visible in the menu. This setting propagates to ALL project users.',
    pt: 'Ative/desative os módulos visíveis no menu. Esta configuração se propaga para TODOS os usuários do projeto.',
  },
  'projectConfig.modulePlansLabel': {
    es: 'Planos',
    en: 'Plans',
    pt: 'Plantas',
  },
  'projectConfig.modulePlansDesc': {
    es: 'Visualizar, anotar y medir sobre planos PDF.',
    en: 'View, annotate and measure on PDF plans.',
    pt: 'Visualizar, anotar e medir sobre plantas PDF.',
  },
  'projectConfig.moduleContactsLabel': {
    es: 'Contactos',
    en: 'Contacts',
    pt: 'Contatos',
  },
  'projectConfig.moduleContactsDesc': {
    es: 'Directorio del equipo del proyecto.',
    en: 'Project team directory.',
    pt: 'Diretório da equipe do projeto.',
  },
  'projectConfig.moduleSummaryLabel': {
    es: 'Tablas Resumen',
    en: 'Summary Tables',
    pt: 'Tabelas Resumo',
  },
  'projectConfig.moduleSummaryDesc': {
    es: 'Consolidado de ensayos por tipo (KPIs, filtros, export).',
    en: 'Consolidated tests by type (KPIs, filters, export).',
    pt: 'Consolidado de ensaios por tipo (KPIs, filtros, exportação).',
  },

  // ── Llenado de protocolos ──
  'projectConfig.fillModeLabel': {
    es: 'Llenado de protocolos',
    en: 'Protocol filling',
    pt: 'Preenchimento de protocolos',
  },
  'projectConfig.fillModeHelp': {
    es: 'Los modos de llenado conviven entre sí y agregan tarjetas al menú del proyecto.',
    en: 'Filling modes coexist and add cards to the project menu.',
    pt: 'Os modos de preenchimento coexistem entre si e adicionam cartões ao menu do projeto.',
  },
  'projectConfig.fillByLocationLabel': {
    es: 'Protocolos por ubicación',
    en: 'Protocols by location',
    pt: 'Protocolos por localização',
  },
  'projectConfig.fillByLocationDesc': {
    es: 'Lista de ubicaciones con sus protocolos (modo clásico).',
    en: 'List of locations with their protocols (classic mode).',
    pt: 'Lista de localizações com seus protocolos (modo clássico).',
  },
  'projectConfig.fillBySampleLabel': {
    es: 'Ensayos por muestra',
    en: 'Tests by sample',
    pt: 'Ensaios por amostra',
  },
  'projectConfig.fillBySampleDesc': {
    es: 'Muestras físicas con sus ensayos, código de muestra y QR.',
    en: 'Physical samples with their tests, sample code and QR.',
    pt: 'Amostras físicas com seus ensaios, código de amostra e QR.',
  },
  'projectConfig.sampleIdentifierLabel': {
    es: 'Identificador del proyecto (código de muestra)',
    en: 'Project identifier (sample code)',
    pt: 'Identificador do projeto (código de amostra)',
  },
  'projectConfig.sampleIdentifierPlaceholder': {
    es: 'ej: 123',
    en: 'e.g. 123',
    pt: 'ex: 123',
  },
  'projectConfig.fillBySectorLabel': {
    es: 'Ensayos por sector',
    en: 'Tests by sector',
    pt: 'Ensaios por setor',
  },
  'projectConfig.fillBySectorDesc': {
    es: 'Sectores como desplegables; adicionar N ensayos dentro de cada sector.',
    en: 'Sectors as dropdowns; add N tests within each sector.',
    pt: 'Setores como menus suspensos; adicionar N ensaios dentro de cada setor.',
  },
  'projectConfig.fillByTypeLabel': {
    es: 'Ensayos por tipo',
    en: 'Tests by type',
    pt: 'Ensaios por tipo',
  },
  'projectConfig.fillByTypeDesc': {
    es: 'Agrupados por tipo de ensayo (plantilla).',
    en: 'Grouped by test type (template).',
    pt: 'Agrupados por tipo de ensaio (modelo).',
  },
  'projectConfig.fillByDateLabel': {
    es: 'Ensayos por fecha',
    en: 'Tests by date',
    pt: 'Ensaios por data',
  },
  'projectConfig.fillByDateDesc': {
    es: 'Agrupados por la fecha del ensayo (editable al crear).',
    en: 'Grouped by the test date (editable on creation).',
    pt: 'Agrupados pela data do ensaio (editável ao criar).',
  },
  'projectConfig.protocolCodesLabel': {
    es: 'Codificación correlativa',
    en: 'Sequential coding',
    pt: 'Codificação correlativa',
  },
  'projectConfig.protocolCodesDesc': {
    es: 'Código automático por ensayo (ej: PR-260032), ámbito tipo + año + proyecto.',
    en: 'Automatic code per test (e.g. PR-260032), scope type + year + project.',
    pt: 'Código automático por ensaio (ex: PR-260032), âmbito tipo + ano + projeto.',
  },
  'projectConfig.maskLabel': {
    es: 'Máscara del código',
    en: 'Code mask',
    pt: 'Máscara do código',
  },
  'projectConfig.tokensHelp': {
    es: 'Tokens: {TIPO} {AA} {AAAA} {MM} {DD} {SEQ:n} {SECTOR}.',
    en: 'Tokens: {TIPO} {AA} {AAAA} {MM} {DD} {SEQ:n} {SECTOR}.',
    pt: 'Tokens: {TIPO} {AA} {AAAA} {MM} {DD} {SEQ:n} {SECTOR}.',
  },

  // ── Sección 2: Trazabilidad ──
  'projectConfig.sectionTraceability': {
    es: 'Módulo de Trazabilidad',
    en: 'Traceability Module',
    pt: 'Módulo de Rastreabilidade',
  },
  'projectConfig.traceabilityLabel': {
    es: 'Habilitar módulo de trazabilidad',
    en: 'Enable traceability module',
    pt: 'Habilitar módulo de rastreabilidade',
  },
  'projectConfig.traceabilityDesc': {
    es: 'Captura Play/Pausa/Stop de actividades por equipo en sectores. Vistas analíticas.',
    en: 'Captures Play/Pausa/Stop of activities per equipment in sectors. Analytical views.',
    pt: 'Captura Play/Pausa/Stop de atividades por equipamento em setores. Visões analíticas.',
  },
  'projectConfig.equipmentCatalogLabel': {
    es: 'Catálogo de equipos',
    en: 'Equipment catalog',
    pt: 'Catálogo de equipamentos',
  },
  'projectConfig.equipmentCatalogDesc': {
    es: 'Balanzas, prensas, calibraciones; vínculo equipo↔actividad.',
    en: 'Scales, presses, calibrations; equipment↔activity link.',
    pt: 'Balanças, prensas, calibrações; vínculo equipamento↔atividade.',
  },
  'projectConfig.gpsTrackingLabel': {
    es: 'Seguimiento GPS automático',
    en: 'Automatic GPS tracking',
    pt: 'Rastreamento GPS automático',
  },
  'projectConfig.gpsBackgroundHelp': {
    es: 'Background requiere permiso del sistema operativo (aceptar en Settings en Android 11+).',
    en: 'Background requires operating system permission (accept in Settings on Android 11+).',
    pt: 'Segundo plano requer permissão do sistema operacional (aceitar em Settings no Android 11+).',
  },
  'projectConfig.gpsIntervalLabel': {
    es: 'Intervalo entre puntos GPS (s)',
    en: 'Interval between GPS points (s)',
    pt: 'Intervalo entre pontos GPS (s)',
  },
  'projectConfig.gpsIntervalHelp': {
    es: 'Default 3s. Dedup <3m elimina puntos casi-idénticos.',
    en: 'Default 3s. Dedup <3m removes near-identical points.',
    pt: 'Padrão 3s. Dedup <3m elimina pontos quase idênticos.',
  },

  // ── Sección 3: Geolocalización ──
  'projectConfig.sectionGeo': {
    es: 'Módulo de Geolocalización',
    en: 'Geolocation Module',
    pt: 'Módulo de Geolocalização',
  },
  'projectConfig.geoLabel': {
    es: 'Habilitar módulo de geolocalización',
    en: 'Enable geolocation module',
    pt: 'Habilitar módulo de geolocalização',
  },
  'projectConfig.geoDesc': {
    es: 'Sectores GIS (polígonos), mapa del proyecto, captura GPS en ensayos.',
    en: 'GIS sectors (polygons), project map, GPS capture in tests.',
    pt: 'Setores GIS (polígonos), mapa do projeto, captura GPS em ensaios.',
  },
  'projectConfig.gpsSubjectiveLabel': {
    es: 'Captura GPS en ensayos subjetivos',
    en: 'GPS capture in subjective tests',
    pt: 'Captura GPS em ensaios subjetivos',
  },
  'projectConfig.gpsSubjectiveDesc': {
    es: 'Botón "Registrar coordenadas" en protocolos clásicos.',
    en: 'A "Record coordinates" button in classic protocols.',
    pt: 'Botão "Registrar coordenadas" em protocolos clássicos.',
  },
  'projectConfig.gpsNumericLabel': {
    es: 'Captura GPS en ensayos numéricos',
    en: 'GPS capture in numeric tests',
    pt: 'Captura GPS em ensaios numéricos',
  },
  'projectConfig.gpsNumericDesc': {
    es: 'Botón "Registrar coordenadas" en protocolos numéricos.',
    en: 'A "Record coordinates" button in numeric protocols.',
    pt: 'Botão "Registrar coordenadas" em protocolos numéricos.',
  },
  'projectConfig.coordSystemLabel': {
    es: 'Sistema de coordenadas (display)',
    en: 'Coordinate system (display)',
    pt: 'Sistema de coordenadas (exibição)',
  },
  'projectConfig.coordSystemHelp': {
    es: 'El almacenamiento siempre es WGS84; este sistema solo afecta cómo se muestran las coordenadas.',
    en: 'Storage is always WGS84; this system only affects how coordinates are displayed.',
    pt: 'O armazenamento é sempre WGS84; este sistema afeta apenas como as coordenadas são exibidas.',
  },
  'projectConfig.orthoUrlLabel': {
    es: 'URL de ortofoto (XYZ tile, opcional)',
    en: 'Orthophoto URL (XYZ tile, optional)',
    pt: 'URL de ortofoto (XYZ tile, opcional)',
  },
  'projectConfig.orthoUrlHelp': {
    es: 'Si se define, el mapa permite alternar entre Google Maps y la ortofoto del cliente.',
    en: 'If set, the map allows toggling between Google Maps and the client orthophoto.',
    pt: 'Se definido, o mapa permite alternar entre Google Maps e a ortofoto do cliente.',
  },

  // ── Footer ──
  'projectConfig.cancel': {
    es: 'Cancelar',
    en: 'Cancel',
    pt: 'Cancelar',
  },
  'projectConfig.save': {
    es: 'Guardar',
    en: 'Save',
    pt: 'Salvar',
  },
  'projectConfig.saving': {
    es: 'Guardando…',
    en: 'Saving…',
    pt: 'Salvando…',
  },
};

export default projectConfigScreen;
