/**
 * i18n (web) — Cadenas EXCLUSIVAS de componentes compartidos misceláneos de la web:
 *  ProjectConfigModal, LabelPrintModal, ExtraPhotos, QRCodeBadge, PdfPreview,
 *  PageHeader, RepeatPromptModal.
 * Solo claves NUEVAS sin equivalente exacto en el catálogo espejo (projectConfig.*,
 * common.*, etc.). Prefijo `webCMisc.`. Se fusiona en `index.tsx` (ALL_STRINGS).
 */
export const STRINGS_WEB_CMISC: Record<string, { es: string; en: string; pt: string }> = {
  // ── ProjectConfigModal (variantes web que NO coinciden verbatim con projectConfig.*) ──
  'webCMisc.cfg.title': {
    es: 'Configuración del proyecto',
    en: 'Project settings',
    pt: 'Configuração do projeto',
  },
  'webCMisc.cfg.confirmLabel': {
    es: 'Guardar configuración',
    en: 'Save settings',
    pt: 'Salvar configuração',
  },
  'webCMisc.cfg.gpsPollingOff': {
    es: 'OFF — solo registra el sector seleccionado',
    en: 'OFF — only records the selected sector',
    pt: 'OFF — registra apenas o setor selecionado',
  },
  'webCMisc.cfg.gpsPollingForeground': {
    es: 'Foreground — captura GPS con app abierta',
    en: 'Foreground — captures GPS with the app open',
    pt: 'Foreground — captura GPS com o app aberto',
  },
  'webCMisc.cfg.gpsPollingBackground': {
    es: 'Background — captura aunque la app esté en segundo plano',
    en: 'Background — captures even when the app is in the background',
    pt: 'Background — captura mesmo com o app em segundo plano',
  },
  'webCMisc.cfg.coordWgs84LatLng': {
    es: 'WGS84 — Latitud / Longitud (estándar GPS)',
    en: 'WGS84 — Latitude / Longitude (GPS standard)',
    pt: 'WGS84 — Latitude / Longitude (padrão GPS)',
  },
  'webCMisc.cfg.coordWgs84Utm': {
    es: 'WGS84 — UTM (Este/Norte)',
    en: 'WGS84 — UTM (East/North)',
    pt: 'WGS84 — UTM (Este/Norte)',
  },
  'webCMisc.cfg.coordPsad56LatLng': {
    es: 'PSAD56 — Latitud / Longitud',
    en: 'PSAD56 — Latitude / Longitude',
    pt: 'PSAD56 — Latitude / Longitude',
  },
  'webCMisc.cfg.coordPsad56Utm': {
    es: 'PSAD56 — UTM',
    en: 'PSAD56 — UTM',
    pt: 'PSAD56 — UTM',
  },
  'webCMisc.cfg.infoText': {
    es: 'Activa los módulos que tu proyecto necesite. Los <strong>módulos padre</strong> deben estar habilitados antes de poder configurar sus opciones internas. Esta configuración solo es visible para el rol CREATOR.',
    en: 'Enable the modules your project needs. <strong>Parent modules</strong> must be enabled before you can configure their internal options. This setting is only visible to the CREATOR role.',
    pt: 'Ative os módulos de que seu projeto precisa. Os <strong>módulos pai</strong> devem estar habilitados antes de poder configurar suas opções internas. Esta configuração é visível apenas para a função CREATOR.',
  },
  'webCMisc.cfg.parametricDesc': {
    es: 'Templates con N variable de probetas/muestras.',
    en: 'Templates with a variable number of specimens/samples.',
    pt: 'Modelos com N variável de corpos de prova/amostras.',
  },
  'webCMisc.cfg.historicalDesc': {
    es: 'Importar protocolos llenados en el pasado (Excel).',
    en: 'Import protocols filled in the past (Excel).',
    pt: 'Importar protocolos preenchidos no passado (Excel).',
  },
  'webCMisc.cfg.projectModulesHelp': {
    es: 'Activa/desactiva los módulos del menú. Se propaga a todos los usuarios.',
    en: 'Enable/disable the menu modules. This propagates to all users.',
    pt: 'Ative/desative os módulos do menu. Isso se propaga para todos os usuários.',
  },
  'webCMisc.cfg.sampleHint': {
    es: 'Muestras: M-{id}-{ddmmyy}-0001 (secuencial 4 díg. por proyecto).',
    en: 'Samples: M-{id}-{ddmmyy}-0001 (4-digit sequence per project).',
    pt: 'Amostras: M-{id}-{ddmmyy}-0001 (sequencial 4 díg. por projeto).',
  },
  'webCMisc.cfg.maskPlaceholder': {
    es: '{TIPO}-{AA}{SEQ:4}',
    en: '{TIPO}-{AA}{SEQ:4}',
    pt: '{TIPO}-{AA}{SEQ:4}',
  },
  'webCMisc.cfg.tokensHelp': {
    es: 'Tokens: {tokens} — ej: {example} → PR-260032',
    en: 'Tokens: {tokens} — e.g.: {example} → PR-260032',
    pt: 'Tokens: {tokens} — ex: {example} → PR-260032',
  },
  'webCMisc.cfg.traceabilityDesc': {
    es: 'Captura Play/Pausa/Stop de actividades de equipos en sectores. Vistas analíticas por sector, equipo, cronología y personal.',
    en: 'Captures Play/Pause/Stop of equipment activities in sectors. Analytical views by sector, equipment, timeline and personnel.',
    pt: 'Captura Play/Pausa/Stop de atividades de equipamentos em setores. Visões analíticas por setor, equipamento, cronologia e pessoal.',
  },
  'webCMisc.cfg.equipmentCatalogDesc': {
    es: 'Balanzas, prensas, calibraciones; vinculación equipo↔actividad.',
    en: 'Scales, presses, calibrations; equipment↔activity linking.',
    pt: 'Balanças, prensas, calibrações; vinculação equipamento↔atividade.',
  },
  'webCMisc.cfg.gpsBackgroundHelp': {
    es: 'Background requiere permiso del sistema operativo (el técnico debe aceptarlo manualmente en Android 11+).',
    en: 'Background requires operating system permission (the technician must accept it manually on Android 11+).',
    pt: 'Background requer permissão do sistema operacional (o técnico deve aceitá-la manualmente no Android 11+).',
  },
  'webCMisc.cfg.gpsIntervalLabel': {
    es: 'Intervalo entre puntos GPS (segundos)',
    en: 'Interval between GPS points (seconds)',
    pt: 'Intervalo entre pontos GPS (segundos)',
  },
  'webCMisc.cfg.coordSystemLabel': {
    es: 'Sistema de coordenadas (para display)',
    en: 'Coordinate system (for display)',
    pt: 'Sistema de coordenadas (para exibição)',
  },
  'webCMisc.cfg.coordSystemHelp': {
    es: 'El almacenamiento siempre es WGS84; este sistema solo afecta cómo se MUESTRAN las coordenadas al técnico.',
    en: 'Storage is always WGS84; this system only affects how coordinates are DISPLAYED to the technician.',
    pt: 'O armazenamento é sempre WGS84; este sistema afeta apenas como as coordenadas são EXIBIDAS ao técnico.',
  },
  'webCMisc.cfg.orthoUrlLabel': {
    es: 'URL de ortofoto (XYZ tile server, opcional)',
    en: 'Orthophoto URL (XYZ tile server, optional)',
    pt: 'URL de ortofoto (XYZ tile server, opcional)',
  },

  // ── LabelPrintModal ──
  'webCMisc.label.formatPreview': { es: 'Preview HTML', en: 'HTML preview', pt: 'Preview HTML' },
  'webCMisc.label.formatZpl': { es: 'ZPL (Zebra)', en: 'ZPL (Zebra)', pt: 'ZPL (Zebra)' },
  'webCMisc.label.formatTspl': { es: 'TSPL (TSC / Phomemo)', en: 'TSPL (TSC / Phomemo)', pt: 'TSPL (TSC / Phomemo)' },
  'webCMisc.label.descPreview': {
    es: 'HTML imprimible vía navegador. Compatible con cualquier impresora vía PDF/imagen.',
    en: 'Printable HTML via browser. Compatible with any printer via PDF/image.',
    pt: 'HTML imprimível via navegador. Compatível com qualquer impressora via PDF/imagem.',
  },
  'webCMisc.label.descZpl': {
    es: 'Comandos Zebra. Envía este string ASCII al puerto TCP 9100 o Bluetooth SPP del printer.',
    en: 'Zebra commands. Send this ASCII string to the printer\'s TCP port 9100 or Bluetooth SPP.',
    pt: 'Comandos Zebra. Envie esta string ASCII para a porta TCP 9100 ou Bluetooth SPP da impressora.',
  },
  'webCMisc.label.descTspl': {
    es: 'Comandos TSC. Para impresoras TSC, Phomemo y algunas NIIMBOT.',
    en: 'TSC commands. For TSC, Phomemo and some NIIMBOT printers.',
    pt: 'Comandos TSC. Para impressoras TSC, Phomemo e algumas NIIMBOT.',
  },
  'webCMisc.label.popupBlocked': {
    es: 'Permite las ventanas emergentes para imprimir.',
    en: 'Allow pop-up windows to print.',
    pt: 'Permita janelas pop-up para imprimir.',
  },
  'webCMisc.label.title': { es: 'Imprimir etiqueta', en: 'Print label', pt: 'Imprimir etiqueta' },
  'webCMisc.label.subtitle': {
    es: 'Genera comandos para impresoras térmicas o imprime vía navegador.',
    en: 'Generate commands for thermal printers or print via browser.',
    pt: 'Gere comandos para impressoras térmicas ou imprima via navegador.',
  },
  'webCMisc.label.size': { es: 'Tamaño', en: 'Size', pt: 'Tamanho' },
  'webCMisc.label.format': { es: 'Formato', en: 'Format', pt: 'Formato' },
  'webCMisc.label.generating': { es: '(generando…)', en: '(generating…)', pt: '(gerando…)' },
  'webCMisc.label.identifier': { es: 'Identificador:', en: 'Identifier:', pt: 'Identificador:' },
  'webCMisc.label.copied': { es: 'Copiado', en: 'Copied', pt: 'Copiado' },
  'webCMisc.label.copy': { es: 'Copiar', en: 'Copy', pt: 'Copiar' },
  'webCMisc.label.print': { es: 'Imprimir', en: 'Print', pt: 'Imprimir' },
  'webCMisc.label.previewTitle': { es: 'Preview etiqueta', en: 'Label preview', pt: 'Preview da etiqueta' },
  'webCMisc.label.previewScaled': {
    es: 'Preview ampliado 3× — el tamaño real es {w}×{h} mm.',
    en: 'Preview enlarged 3× — the actual size is {w}×{h} mm.',
    pt: 'Preview ampliado 3× — o tamanho real é {w}×{h} mm.',
  },

  // ── ExtraPhotos ──
  'webCMisc.extra.uploadFailed': {
    es: 'No se pudo subir la foto:\n',
    en: 'The photo could not be uploaded:\n',
    pt: 'Não foi possível enviar a foto:\n',
  },
  'webCMisc.extra.deleteConfirm': {
    es: '¿Eliminar esta foto extra?',
    en: 'Delete this extra photo?',
    pt: 'Excluir esta foto extra?',
  },
  'webCMisc.extra.deleteFailed': {
    es: 'No se pudo eliminar la foto:\n',
    en: 'The photo could not be deleted:\n',
    pt: 'Não foi possível excluir a foto:\n',
  },
  'webCMisc.extra.title': {
    es: 'Evidencia fotográfica extra',
    en: 'Extra photographic evidence',
    pt: 'Evidência fotográfica extra',
  },
  'webCMisc.extra.addPhoto': { es: 'Agregar foto', en: 'Add photo', pt: 'Adicionar foto' },
  'webCMisc.extra.empty': {
    es: 'Sin fotos extra adjuntas.',
    en: 'No extra photos attached.',
    pt: 'Nenhuma foto extra anexada.',
  },

  // ── QRCodeBadge ──
  'webCMisc.qr.popupBlocked': {
    es: 'Permite las ventanas emergentes para imprimir el QR.',
    en: 'Allow pop-up windows to print the QR.',
    pt: 'Permita janelas pop-up para imprimir o QR.',
  },
  'webCMisc.qr.printTitle': {
    es: 'Imprimir QR en hoja A4 vía navegador',
    en: 'Print QR on A4 sheet via browser',
    pt: 'Imprimir QR em folha A4 via navegador',
  },
  'webCMisc.qr.print': { es: 'Imprimir', en: 'Print', pt: 'Imprimir' },
  'webCMisc.qr.labelTitle': {
    es: 'Generar etiqueta térmica (ZPL/TSPL/HTML)',
    en: 'Generate thermal label (ZPL/TSPL/HTML)',
    pt: 'Gerar etiqueta térmica (ZPL/TSPL/HTML)',
  },
  'webCMisc.qr.label': { es: 'Etiqueta', en: 'Label', pt: 'Etiqueta' },

  // ── PdfPreview ──
  'webCMisc.pdf.saving': { es: 'Guardando...', en: 'Saving...', pt: 'Salvando...' },
  'webCMisc.pdf.savePdf': { es: 'Guardar PDF', en: 'Save PDF', pt: 'Salvar PDF' },
  'webCMisc.pdf.openInBrowser': { es: 'Abrir en Navegador', en: 'Open in Browser', pt: 'Abrir no Navegador' },
  'webCMisc.pdf.close': { es: 'Cerrar', en: 'Close', pt: 'Fechar' },
  'webCMisc.pdf.previewTitle': { es: 'Vista previa PDF', en: 'PDF preview', pt: 'Pré-visualização PDF' },

  // ── PageHeader ──
  'webCMisc.header.syncing': { es: 'Sincronizando...', en: 'Syncing...', pt: 'Sincronizando...' },
  'webCMisc.header.back': { es: 'Atrás', en: 'Back', pt: 'Voltar' },
  'webCMisc.header.forward': { es: 'Adelante', en: 'Forward', pt: 'Avançar' },

  // ── RepeatPromptModal ──
  'webCMisc.repeat.title': {
    es: 'Cantidad de elementos',
    en: 'Number of elements',
    pt: 'Quantidade de elementos',
  },
  'webCMisc.repeat.desc': {
    es: 'Esta plantilla tiene bloques repetibles. Elige cuántos se generarán en esta instancia.',
    en: 'This template has repeatable blocks. Choose how many will be generated in this instance.',
    pt: 'Este modelo tem blocos repetíveis. Escolha quantos serão gerados nesta instância.',
  },
  'webCMisc.repeat.range': {
    es: 'Entre {min} y {max} · Recomendado {def}',
    en: 'Between {min} and {max} · Recommended {def}',
    pt: 'Entre {min} e {max} · Recomendado {def}',
  },
  'webCMisc.repeat.create': {
    es: 'Crear instancia',
    en: 'Create instance',
    pt: 'Criar instância',
  },
};
