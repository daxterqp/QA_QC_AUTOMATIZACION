/**
 * i18n — Cadenas de la pantalla "Cargar Excel Maestro" (ExcelImportScreen).
 * Una entrada por cada string visible al usuario que se reemplaza en la pantalla.
 */
const excelImport: Record<string, { es: string; en: string; pt: string }> = {
  'excelImport.title': {
    es: 'Cargar Excel Maestro',
    en: 'Load Master Excel',
    pt: 'Carregar Excel Mestre',
  },
  'excelImport.projectLabel': {
    es: 'Proyecto',
    en: 'Project',
    pt: 'Projeto',
  },
  'excelImport.requiredColumnsTitle': {
    es: 'Columnas requeridas en el Excel',
    en: 'Required columns in the Excel',
    pt: 'Colunas obrigatórias no Excel',
  },
  'excelImport.protocolHint': {
    es: 'La columna "Protocolo" agrupa las actividades. Cada valor unico genera un protocolo independiente en el sistema.',
    en: 'The "Protocolo" column groups the activities. Each unique value generates a separate protocol in the system.',
    pt: 'A coluna "Protocolo" agrupa as atividades. Cada valor único gera um protocolo independente no sistema.',
  },
  'excelImport.pickingFile': {
    es: 'Seleccionando archivo...',
    en: 'Selecting file...',
    pt: 'Selecionando arquivo...',
  },
  'excelImport.importingProgress': {
    es: 'Importando protocolo {current} de {total}...',
    en: 'Importing protocol {current} of {total}...',
    pt: 'Importando protocolo {current} de {total}...',
  },
  'excelImport.successTitle': {
    es: 'Importacion exitosa',
    en: 'Import successful',
    pt: 'Importação bem-sucedida',
  },
  'excelImport.protocolsCount': {
    es: '{count} protocolos',
    en: '{count} protocols',
    pt: '{count} protocolos',
  },
  'excelImport.protocolsCount_one': {
    es: '{count} protocolo',
    en: '{count} protocol',
    pt: '{count} protocolo',
  },
  'excelImport.activitiesCount': {
    es: '{count} actividades',
    en: '{count} activities',
    pt: '{count} atividades',
  },
  'excelImport.activitiesCount_one': {
    es: '{count} actividad',
    en: '{count} activity',
    pt: '{count} atividade',
  },
  'excelImport.viewProtocols': {
    es: 'Ver protocolos',
    en: 'View protocols',
    pt: 'Ver protocolos',
  },
  'excelImport.loadAnotherFile': {
    es: 'Cargar otro archivo',
    en: 'Load another file',
    pt: 'Carregar outro arquivo',
  },
  'excelImport.errorTitle': {
    es: 'Error al importar',
    en: 'Import error',
    pt: 'Erro ao importar',
  },
  'excelImport.missingColumnsLabel': {
    es: 'Columnas faltantes:',
    en: 'Missing columns:',
    pt: 'Colunas ausentes:',
  },
  'excelImport.tryAgain': {
    es: 'Intentar de nuevo',
    en: 'Try again',
    pt: 'Tentar novamente',
  },
  'excelImport.selectExcelFile': {
    es: 'Seleccionar archivo Excel',
    en: 'Select Excel file',
    pt: 'Selecionar arquivo Excel',
  },
};

export default excelImport;
