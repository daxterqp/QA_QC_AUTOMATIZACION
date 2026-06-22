/**
 * i18n (web) — Cadenas del tab "Históricos / CSV" de file-upload y sus modales.
 * Componentes: HistoricosTab, CsvImportSection, CsvExportSection,
 * UserResolutionModal, ImportSummaryModal.
 * ES base; EN/PT traducidos. Namespace `webCHist.*` para claves NUEVAS.
 * Se fusiona en `index.tsx` (ALL_STRINGS).
 */
export const STRINGS_WEB_CHIST: Record<string, { es: string; en: string; pt: string }> = {
  // ── Común a las secciones ──
  'webCHist.selectProtocolFirst': { es: 'Selecciona un protocolo primero', en: 'Select a protocol first', pt: 'Selecione um protocolo primeiro' },
  'webCHist.chooseProtocol': { es: '— Elige un protocolo —', en: '— Choose a protocol —', pt: '— Escolha um protocolo —' },
  'webCHist.validating': { es: 'Validando…', en: 'Validating…', pt: 'Validando…' },
  'webCHist.importing': { es: 'Importando…', en: 'Importing…', pt: 'Importando…' },
  'webCHist.download': { es: 'Descargar', en: 'Download', pt: 'Baixar' },

  // ── HistoricosTab: aviso flag desactivado ──
  'webCHist.disabledNotice': {
    es: 'La importación de históricos/CSV está desactivada en este proyecto (flag {flag} en Configuración). La exportación CSV sigue disponible abajo.',
    en: 'Historical/CSV import is disabled in this project (flag {flag} in Settings). CSV export is still available below.',
    pt: 'A importação de históricos/CSV está desativada neste projeto (flag {flag} em Configurações). A exportação CSV continua disponível abaixo.',
  },

  // ── HistoricosTab: cabecera ──
  'webCHist.headerTitle': { es: 'Importación de protocolos históricos', en: 'Historical protocol import', pt: 'Importação de protocolos históricos' },
  'webCHist.headerDesc': {
    es: 'Carga protocolos que fueron llenados y firmados en el pasado (papel u otro sistema). Entran como {status} y son inmutables. Las plantillas y ubicaciones deben existir antes.',
    en: 'Upload protocols that were filled out and signed in the past (paper or another system). They enter as {status} and are immutable. Templates and locations must exist beforehand.',
    pt: 'Carregue protocolos que foram preenchidos e assinados no passado (papel ou outro sistema). Entram como {status} e são imutáveis. Os modelos e localizações devem existir antes.',
  },
  'webCHist.headerStatusEmphasis': { es: 'APPROVED + bloqueados', en: 'APPROVED + locked', pt: 'APPROVED + bloqueados' },

  // ── HistoricosTab: Sección 1 — Descargar plantilla ──
  'webCHist.step1Title': { es: '1. Descargar plantilla', en: '1. Download template', pt: '1. Baixar modelo' },
  'webCHist.step1Desc': {
    es: 'Elige el protocolo. Se genera un Excel pre-formateado con las columnas que el usuario debe llenar. Las fórmulas, lookups y gráficos se completan automáticamente al importar.',
    en: 'Choose the protocol. A pre-formatted Excel is generated with the columns the user must fill in. Formulas, lookups and charts are completed automatically on import.',
    pt: 'Escolha o protocolo. Um Excel pré-formatado é gerado com as colunas que o usuário deve preencher. Fórmulas, lookups e gráficos são preenchidos automaticamente na importação.',
  },
  'webCHist.templateDownloaded': { es: 'Plantilla "{name}" descargada.', en: 'Template "{name}" downloaded.', pt: 'Modelo "{name}" baixado.' },

  // ── HistoricosTab: Sección 2 — Subir Excel ──
  'webCHist.step2Title': { es: '2. Subir Excel histórico llenado', en: '2. Upload filled historical Excel', pt: '2. Enviar Excel histórico preenchido' },
  'webCHist.uploadXlsx': { es: 'Click para subir archivo .xlsx', en: 'Click to upload .xlsx file', pt: 'Clique para enviar arquivo .xlsx' },
  'webCHist.loginToImport': { es: 'Debes iniciar sesión para importar protocolos históricos.', en: 'You must sign in to import historical protocols.', pt: 'Você deve fazer login para importar protocolos históricos.' },

  // ── CsvImportSection: Sección 3 — Importar CSV ──
  'webCHist.step3Title': { es: '3. Importar CSV de ensayos', en: '3. Import test CSV', pt: '3. Importar CSV de ensaios' },
  'webCHist.step3Desc': {
    es: 'Formato simple: {format}, con columnas {cols} y una columna por celda del ensayo (ej: {example}). Acepta CSV de Excel en español ({sep} y coma decimal). Los ensayos entran como {status} (bloqueados); las fórmulas se calculan solas.',
    en: 'Simple format: {format}, with columns {cols} and one column per test cell (e.g.: {example}). Accepts Excel CSV in Spanish ({sep} and decimal comma). Tests enter as {status} (locked); formulas are computed automatically.',
    pt: 'Formato simples: {format}, com colunas {cols} e uma coluna por célula do ensaio (ex.: {example}). Aceita CSV do Excel em espanhol ({sep} e vírgula decimal). Os ensaios entram como {status} (bloqueados); as fórmulas são calculadas sozinhas.',
  },
  'webCHist.step3FormatEmphasis': { es: '1 fila = 1 ensayo', en: '1 row = 1 test', pt: '1 linha = 1 ensaio' },
  'webCHist.step3StatusEmphasis': { es: 'históricos aprobados', en: 'approved historical', pt: 'históricos aprovados' },
  'webCHist.csvTemplateDownloaded': { es: 'Plantilla CSV de "{name}" descargada.', en: 'CSV template for "{name}" downloaded.', pt: 'Modelo CSV de "{name}" baixado.' },
  'webCHist.chooseCsvProtocol': { es: '— Elige el protocolo del CSV —', en: '— Choose the CSV protocol —', pt: '— Escolha o protocolo do CSV —' },
  'webCHist.csvTemplateBtn': { es: 'Plantilla CSV', en: 'CSV template', pt: 'Modelo CSV' },
  'webCHist.loginToImportTests': { es: 'Debes iniciar sesión para importar ensayos.', en: 'You must sign in to import tests.', pt: 'Você deve fazer login para importar ensaios.' },
  'webCHist.selectCsvProtocolFirst': { es: 'Selecciona el protocolo del CSV antes de subirlo.', en: 'Select the CSV protocol before uploading it.', pt: 'Selecione o protocolo do CSV antes de enviá-lo.' },
  'webCHist.uploadCsv': { es: 'Click para subir archivo .csv', en: 'Click to upload .csv file', pt: 'Clique para enviar arquivo .csv' },
  'webCHist.chooseProtocolFirst': { es: 'Elige primero el protocolo', en: 'Choose the protocol first', pt: 'Escolha primeiro o protocolo' },
  'webCHist.defaultUser': { es: 'Usuario', en: 'User', pt: 'Usuário' },

  // ── CsvExportSection: Sección 4 — Exportar CSV ──
  'webCHist.step4Title': { es: '4. Exportar CSV de datos', en: '4. Export data CSV', pt: '4. Exportar CSV de dados' },
  'webCHist.step4Desc': {
    es: 'Descarga TODOS los ensayos del protocolo elegido como resumen: {emphasis} con sus valores de entrada y calculados, ubicación, estado y fechas. Abre directo en Excel.',
    en: 'Download ALL tests of the chosen protocol as a summary: {emphasis} with their input and calculated values, location, status and dates. Opens directly in Excel.',
    pt: 'Baixe TODOS os ensaios do protocolo escolhido como resumo: {emphasis} com seus valores de entrada e calculados, localização, status e datas. Abre direto no Excel.',
  },
  'webCHist.step4Emphasis': { es: '1 fila por ensayo', en: '1 row per test', pt: '1 linha por ensaio' },
  'webCHist.exporting': { es: 'Exportando…', en: 'Exporting…', pt: 'Exportando…' },
  'webCHist.noTestsForExport': { es: 'No hay ensayos de "{name}" en este proyecto.', en: 'There are no tests for "{name}" in this project.', pt: 'Não há ensaios de "{name}" neste projeto.' },
  'webCHist.csvDownloaded': { es: 'CSV descargado: {count} ensayos de "{name}".', en: 'CSV downloaded: {count} tests for "{name}".', pt: 'CSV baixado: {count} ensaios de "{name}".' },
  'webCHist.csvDownloaded_one': { es: 'CSV descargado: {count} ensayo de "{name}".', en: 'CSV downloaded: {count} test for "{name}".', pt: 'CSV baixado: {count} ensaio de "{name}".' },

  // ── UserResolutionModal ──
  'webCHist.usersNotFound': { es: 'Usuarios no encontrados ({count})', en: 'Users not found ({count})', pt: 'Usuários não encontrados ({count})' },
  'webCHist.cancelImportTitle': { es: 'Cancelar import', en: 'Cancel import', pt: 'Cancelar importação' },
  'webCHist.usersNotFoundDesc': {
    es: 'Estos nombres aparecen en el Excel pero no existen en el sistema. Decide qué hacer con cada uno antes de continuar.',
    en: 'These names appear in the Excel but do not exist in the system. Decide what to do with each one before continuing.',
    pt: 'Estes nomes aparecem no Excel mas não existem no sistema. Decida o que fazer com cada um antes de continuar.',
  },
  'webCHist.actionCreate': { es: 'Crear', en: 'Create', pt: 'Criar' },
  'webCHist.actionMap': { es: 'Mapear', en: 'Map', pt: 'Mapear' },
  'webCHist.actionSkip': { es: 'Saltar', en: 'Skip', pt: 'Ignorar' },
  'webCHist.roleLabel': { es: 'Rol:', en: 'Role:', pt: 'Função:' },
  'webCHist.userLabel': { es: 'Usuario:', en: 'User:', pt: 'Usuário:' },
  'webCHist.chooseOption': { es: '— elegir —', en: '— choose —', pt: '— escolher —' },
  'webCHist.skipWarning': {
    es: '⚠ Las instancias con este usuario quedarán sin FK; el nombre se anotará en el comentario general.',
    en: '⚠ Instances with this user will have no FK; the name will be noted in the general comment.',
    pt: '⚠ As instâncias com este usuário ficarão sem FK; o nome será anotado no comentário geral.',
  },
  'webCHist.cancelImportBtn': { es: 'Cancelar import', en: 'Cancel import', pt: 'Cancelar importação' },
  'webCHist.continueImport': { es: 'Continuar importación', en: 'Continue import', pt: 'Continuar importação' },

  // ── ImportSummaryModal ──
  'webCHist.importResult': { es: 'Resultado de la importación', en: 'Import result', pt: 'Resultado da importação' },
  'webCHist.statCreated': { es: 'creadas', en: 'created', pt: 'criadas' },
  'webCHist.statSkipped': { es: 'omitidas (dup)', en: 'skipped (dup)', pt: 'ignoradas (dup)' },
  'webCHist.statWarnings': { es: 'advertencias', en: 'warnings', pt: 'avisos' },
  'webCHist.errorsTitle': { es: 'Errores ({count})', en: 'Errors ({count})', pt: 'Erros ({count})' },
  'webCHist.lineLabel': { es: 'Línea {n}: ', en: 'Line {n}: ', pt: 'Linha {n}: ' },
  'webCHist.moreItems': { es: '…{count} más (descarga el reporte completo)', en: '…{count} more (download the full report)', pt: '…{count} mais (baixe o relatório completo)' },
  'webCHist.warningsTitle': { es: 'Advertencias ({count})', en: 'Warnings ({count})', pt: 'Avisos ({count})' },
  'webCHist.completedNoWarnings': { es: '✓ Importación completada sin advertencias.', en: '✓ Import completed with no warnings.', pt: '✓ Importação concluída sem avisos.' },
  'webCHist.downloadReportCsv': { es: 'Descargar reporte CSV', en: 'Download CSV report', pt: 'Baixar relatório CSV' },
};
