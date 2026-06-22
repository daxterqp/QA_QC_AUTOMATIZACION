/**
 * i18n (v46) — Cadenas de la pantalla DossierScreen (namespace `dossier`).
 * Export default: Record<clave, { es; en; pt }>. Se agrega en `./index.ts`.
 */
const dossier: Record<string, { es: string; en: string; pt: string }> = {
  // Encabezado
  'dossier.title': { es: 'Dosier de Protocolos', en: 'Protocol Dossier', pt: 'Dossiê de Protocolos' },

  // Genérico
  'dossier.error': { es: 'Error', en: 'Error', pt: 'Erro' },
  'dossier.cancel': { es: 'Cancelar', en: 'Cancel', pt: 'Cancelar' },

  // Errores de exportación / configuración
  'dossier.openPrintConfigError': {
    es: 'No se pudo abrir la configuración de impresión.',
    en: 'Could not open the print settings.',
    pt: 'Não foi possível abrir as configurações de impressão.',
  },
  'dossier.exportPdfError': {
    es: 'No se pudo generar el PDF.\n{error}',
    en: 'Could not generate the PDF.\n{error}',
    pt: 'Não foi possível gerar o PDF.\n{error}',
  },

  // Modo offline
  'dossier.offlineTitle': { es: 'Modo offline', en: 'Offline mode', pt: 'Modo offline' },
  'dossier.offlineMessage': {
    es: 'Estás generando un PDF sin conexión.\n\nLos datos del PDF reflejan lo que está en este dispositivo. Algunas firmas/aprobaciones recientes hechas desde otra app pueden no estar incluidas.\n\nConéctate a internet para garantizar la versión más reciente.',
    en: 'You are generating a PDF while offline.\n\nThe PDF data reflects what is on this device. Some recent signatures/approvals made from another app may not be included.\n\nConnect to the internet to ensure the latest version.',
    pt: 'Você está gerando um PDF sem conexão.\n\nOs dados do PDF refletem o que está neste dispositivo. Algumas assinaturas/aprovações recentes feitas em outro app podem não estar incluídas.\n\nConecte-se à internet para garantir a versão mais recente.',
  },
  'dossier.generateAnyway': { es: 'Generar de todos modos', en: 'Generate anyway', pt: 'Gerar mesmo assim' },

  // Aprobar / Rechazar protocolo
  'dossier.approveTitle': { es: 'Aprobar protocolo', en: 'Approve protocol', pt: 'Aprovar protocolo' },
  'dossier.approveMessage': { es: '¿Aprobar "{number}"?', en: 'Approve "{number}"?', pt: 'Aprovar "{number}"?' },
  'dossier.approve': { es: 'Aprobar', en: 'Approve', pt: 'Aprovar' },
  'dossier.rejectTitle': { es: 'Rechazar protocolo', en: 'Reject protocol', pt: 'Rejeitar protocolo' },
  'dossier.rejectMessage': {
    es: '¿Rechazar "{number}"? El supervisor deberá rehacerlo.',
    en: 'Reject "{number}"? The supervisor will have to redo it.',
    pt: 'Rejeitar "{number}"? O supervisor terá que refazê-lo.',
  },
  'dossier.reject': { es: 'Rechazar', en: 'Reject', pt: 'Rejeitar' },

  // Filtros
  'dossier.filters': { es: 'Filtros', en: 'Filters', pt: 'Filtros' },
  'dossier.filtersActiveSuffix': { es: ' · activos', en: ' · active', pt: ' · ativos' },
  'dossier.clear': { es: 'Limpiar', en: 'Clear', pt: 'Limpar' },
  'dossier.status': { es: 'Estado', en: 'Status', pt: 'Status' },
  'dossier.statusApproved': { es: 'Aprobados', en: 'Approved', pt: 'Aprovados' },
  'dossier.statusInReview': { es: 'En revisión', en: 'In review', pt: 'Em revisão' },
  'dossier.statusRejected': { es: 'Rechazados', en: 'Rejected', pt: 'Rejeitados' },
  'dossier.testType': { es: 'Tipo de ensayo', en: 'Test type', pt: 'Tipo de ensaio' },
  'dossier.allMasc': { es: 'Todos', en: 'All', pt: 'Todos' },
  'dossier.allFem': { es: 'Todas', en: 'All', pt: 'Todas' },
  'dossier.location': { es: 'Ubicación', en: 'Location', pt: 'Localização' },
  'dossier.sector': { es: 'Sector', en: 'Sector', pt: 'Setor' },
  'dossier.dateFrom': { es: 'Desde', en: 'From', pt: 'De' },
  'dossier.dateTo': { es: 'Hasta', en: 'To', pt: 'Até' },
  'dossier.anyDate': { es: 'Cualquiera', en: 'Any', pt: 'Qualquer' },

  // Lista vacía
  'dossier.empty': { es: 'Sin protocolos enviados aun.', en: 'No protocols submitted yet.', pt: 'Nenhum protocolo enviado ainda.' },
  'dossier.emptyHint': {
    es: 'Los protocolos apareceran aqui cuando un supervisor los envie a revision.',
    en: 'Protocols will appear here when a supervisor submits them for review.',
    pt: 'Os protocolos aparecerão aqui quando um supervisor os enviar para revisão.',
  },

  // Sección por día
  'dossier.protocolCount': { es: '{count} protocolo(s)', en: '{count} protocol(s)', pt: '{count} protocolo(s)' },

  // Tarjeta de protocolo
  'dossier.unknownUser': { es: 'Desconocido', en: 'Unknown', pt: 'Desconhecido' },
  'dossier.supervisor': { es: 'Supervisor: {name}', en: 'Supervisor: {name}', pt: 'Supervisor: {name}' },
  'dossier.locationLine': { es: 'Ubicacion: {ref}', en: 'Location: {ref}', pt: 'Localização: {ref}' },
  'dossier.approvedBy': { es: 'Aprobado por: {name}', en: 'Approved by: {name}', pt: 'Aprovado por: {name}' },

  // Modal: configuración de impresión por tipo
  'dossier.printConfigTitle': { es: 'Formato de impresión por tipo', en: 'Print format by type', pt: 'Formato de impressão por tipo' },
  'dossier.printConfigHint': {
    es: 'Configura cómo se imprime cada tipo de ensayo. Se aplica a todos los usuarios.',
    en: 'Set how each test type is printed. Applies to all users.',
    pt: 'Configure como cada tipo de ensaio é impresso. Aplica-se a todos os usuários.',
  },
  'dossier.headerColorLabel': {
    es: 'Color de encabezados (todos los ensayos)',
    en: 'Header color (all tests)',
    pt: 'Cor dos cabeçalhos (todos os ensaios)',
  },
  'dossier.hexColorLabel': { es: 'Código de color (hex)', en: 'Color code (hex)', pt: 'Código de cor (hex)' },
  'dossier.noTestTypes': {
    es: 'No hay tipos de ensayo en este proyecto.',
    en: 'There are no test types in this project.',
    pt: 'Não há tipos de ensaio neste projeto.',
  },
  'dossier.twoColumns': { es: 'Dos columnas (numérico)', en: 'Two columns (numeric)', pt: 'Duas colunas (numérico)' },
  'dossier.tableFont': { es: 'Letra de tablas', en: 'Table font', pt: 'Fonte das tabelas' },
  'dossier.sizeNormal': { es: 'Normal', en: 'Normal', pt: 'Normal' },
  'dossier.sizeCompact': { es: 'Compacta', en: 'Compact', pt: 'Compacta' },
  'dossier.sizeXCompact': { es: 'Muy compacta', en: 'Very compact', pt: 'Muito compacta' },
  'dossier.graphSize': { es: 'Tamaño de gráfico', en: 'Graph size', pt: 'Tamanho do gráfico' },
  'dossier.includePhotoPanels': {
    es: 'Incluir paneles fotográficos',
    en: 'Include photo panels',
    pt: 'Incluir painéis fotográficos',
  },
  'dossier.headerRows': { es: 'Filas del encabezado', en: 'Header rows', pt: 'Linhas do cabeçalho' },
  'dossier.headerRows3': { es: '3 filas', en: '3 rows', pt: '3 linhas' },
  'dossier.headerRows2': { es: '2 filas', en: '2 rows', pt: '2 linhas' },
  'dossier.headerRows1': { es: '1 fila', en: '1 row', pt: '1 linha' },
  'dossier.headerFields': { es: 'Campos del encabezado', en: 'Header fields', pt: 'Campos do cabeçalho' },
  'dossier.showQr': { es: 'Mostrar QR y su código', en: 'Show QR and its code', pt: 'Mostrar QR e seu código' },
  'dossier.splitTables': {
    es: 'Dividir tablas (aprovechar espacio)',
    en: 'Split tables (use space)',
    pt: 'Dividir tabelas (aproveitar espaço)',
  },
  'dossier.colBudgetLabel': { es: 'Presupuesto por columna (alto)', en: 'Budget per column (height)', pt: 'Orçamento por coluna (altura)' },
  'dossier.colBudgetHint': {
    es: 'Más alto = más contenido por hoja. Default 39. Rango 12–80.',
    en: 'Higher = more content per page. Default 39. Range 12–80.',
    pt: 'Maior = mais conteúdo por página. Padrão 39. Faixa 12–80.',
  },

  // Croquis
  'dossier.croquisToggle': { es: 'Croquis (mapa de ubicación)', en: 'Sketch (location map)', pt: 'Croqui (mapa de localização)' },
  'dossier.mapLayer': { es: 'Capa del mapa', en: 'Map layer', pt: 'Camada do mapa' },
  'dossier.pdfPlacement': { es: 'Ubicación en el PDF', en: 'Placement in the PDF', pt: 'Posição no PDF' },
  'dossier.overlayOrthophoto': {
    es: 'Superponer ortofoto (si existe)',
    en: 'Overlay orthophoto (if available)',
    pt: 'Sobrepor ortofoto (se houver)',
  },
  'dossier.dimBaseLayer': { es: 'Atenuar capa base: {pct}%', en: 'Dim base layer: {pct}%', pt: 'Atenuar camada base: {pct}%' },
  'dossier.testIconSize': {
    es: 'Tamaño del ícono del ensayo: {size}px',
    en: 'Test icon size: {size}px',
    pt: 'Tamanho do ícone do ensaio: {size}px',
  },

  // Acciones del modal
  'dossier.save': { es: 'Guardar', en: 'Save', pt: 'Salvar' },
};

export default dossier;
