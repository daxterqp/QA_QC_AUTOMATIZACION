/**
 * i18n (v46) — Cadenas de la pantalla "Cargar Ubicaciones" (LocationsImportScreen).
 * export default: Record<clave, { es; en; pt }>. Se agrega en screens/index.ts.
 */
const locImport: Record<string, { es: string; en: string; pt: string }> = {
  'locImport.title': { es: 'Cargar Ubicaciones', en: 'Import Locations', pt: 'Importar Locais' },
  'locImport.projectLabel': { es: 'Proyecto', en: 'Project', pt: 'Projeto' },

  'locImport.requiredColumns': { es: 'Columnas requeridas', en: 'Required columns', pt: 'Colunas obrigatórias' },
  'locImport.structureExample': { es: 'Ejemplo de estructura', en: 'Structure example', pt: 'Exemplo de estrutura' },
  'locImport.colLocation': { es: 'Ubicación', en: 'Location', pt: 'Local' },
  'locImport.colReferenceDrawing': { es: 'PLANO DE REFERENCIA', en: 'REFERENCE DRAWING', pt: 'PLANTA DE REFERÊNCIA' },
  'locImport.colProtocolIds': { es: 'ID_Protocolos', en: 'Protocol_IDs', pt: 'IDs_Protocolos' },

  'locImport.protocolIdsHint': {
    es: 'En ID_Protocolos coloca los ID_Protocolo del Excel maestro separados por coma. Cada ubicacion mostrara exactamente los protocolos vinculados.',
    en: 'In Protocol_IDs enter the Protocol_IDs from the master Excel separated by commas. Each location will show exactly the linked protocols.',
    pt: 'Em IDs_Protocolos coloque os IDs de Protocolo da planilha mestre separados por vírgula. Cada local mostrará exatamente os protocolos vinculados.',
  },

  'locImport.picking': { es: 'Seleccionando archivo...', en: 'Selecting file...', pt: 'Selecionando arquivo...' },
  'locImport.importing': { es: 'Importando ubicaciones...', en: 'Importing locations...', pt: 'Importando locais...' },

  'locImport.successTitle': { es: 'Importacion exitosa', en: 'Import successful', pt: 'Importação concluída' },
  'locImport.locationsAddedOne': { es: 'ubicacion agregada', en: 'location added', pt: 'local adicionado' },
  'locImport.locationsAddedMany': { es: 'ubicaciones agregadas', en: 'locations added', pt: 'locais adicionados' },
  'locImport.duplicatesSkipped': {
    es: 'Las duplicadas fueron omitidas automaticamente.',
    en: 'Duplicates were skipped automatically.',
    pt: 'As duplicadas foram ignoradas automaticamente.',
  },
  'locImport.viewLocations': { es: 'Ver ubicaciones', en: 'View locations', pt: 'Ver locais' },
  'locImport.loadAnotherFile': { es: 'Cargar otro archivo', en: 'Load another file', pt: 'Carregar outro arquivo' },

  'locImport.errorTitle': { es: 'Error al importar', en: 'Import error', pt: 'Erro ao importar' },
  'locImport.missingColumnsLabel': { es: 'Columnas faltantes:', en: 'Missing columns:', pt: 'Colunas faltantes:' },
  'locImport.tryAgain': { es: 'Intentar de nuevo', en: 'Try again', pt: 'Tentar novamente' },

  'locImport.selectExcelFile': { es: 'Seleccionar archivo Excel', en: 'Select Excel file', pt: 'Selecionar arquivo Excel' },
};

export default locImport;
