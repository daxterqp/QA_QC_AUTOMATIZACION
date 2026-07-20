/**
 * i18n — Cadenas de la pantalla DossierPreviewScreen (namespace: dossierPrev).
 * Cada clave: { es, en, pt }. Se agrega vía el barril ../screens/index.ts.
 */
const dossierPrev: Record<string, { es: string; en: string; pt: string }> = {
  'dossierPrev.headerTitle': {
    es: 'Vista previa del Dosier',
    en: 'Dossier preview',
    pt: 'Pré-visualização do dossiê',
  },
  'dossierPrev.shareDialogTitle': {
    es: 'Exportar Dosier PDF',
    en: 'Export Dossier PDF',
    pt: 'Exportar dossiê em PDF',
  },
  'dossierPrev.loading': {
    es: 'Cargando PDF...',
    en: 'Loading PDF...',
    pt: 'Carregando PDF...',
  },
  'dossierPrev.errorTitle': {
    es: 'Error',
    en: 'Error',
    pt: 'Erro',
  },
  'dossierPrev.shareError': {
    es: 'No se pudo compartir el PDF.\n{detail}',
    en: 'The PDF could not be shared.\n{detail}',
    pt: 'Não foi possível compartilhar o PDF.\n{detail}',
  },
  'dossierPrev.saveError': {
    es: 'No se pudo guardar el PDF.\n{detail}',
    en: 'The PDF could not be saved.\n{detail}',
    pt: 'Não foi possível salvar o PDF.\n{detail}',
  },
  'dossierPrev.previewError': {
    es: 'No se pudo cargar el PDF para previsualización.',
    en: 'The PDF could not be loaded for preview.',
    pt: 'Não foi possível carregar o PDF para a pré-visualização.',
  },
  'dossierPrev.downloadedTitle': {
    es: 'Descargado',
    en: 'Downloaded',
    pt: 'Baixado',
  },
  'dossierPrev.downloadedMessage': {
    es: 'El PDF fue guardado en la carpeta seleccionada.',
    en: 'The PDF was saved to the selected folder.',
    pt: 'O PDF foi salvo na pasta selecionada.',
  },
  // ── v100 — Panel de configuración del PDF dentro de la vista previa ─────────
  'dossierPrev.cfgTitle': {
    es: 'Configuración del PDF',
    en: 'PDF settings',
    pt: 'Configuração do PDF',
  },
  'dossierPrev.cfgHint': {
    es: 'Ajusta viendo el resultado en vivo. Aplica a TODOS los ensayos de este tipo.',
    en: 'Tune it while seeing the live result. Applies to ALL tests of this type.',
    pt: 'Ajuste vendo o resultado ao vivo. Aplica-se a TODOS os ensaios deste tipo.',
  },
  'dossierPrev.cfgCroquisHint': {
    es: 'La imagen del croquis (mapa) se regenera al re-exportar; aquí ajustas su posición en el PDF.',
    en: 'The croquis (map) image regenerates on re-export; here you adjust its placement in the PDF.',
    pt: 'A imagem do croqui (mapa) é regenerada ao re-exportar; aqui você ajusta sua posição no PDF.',
  },
  'dossierPrev.cfgSave': {
    es: 'Guardar para este tipo',
    en: 'Save for this type',
    pt: 'Salvar para este tipo',
  },
  'dossierPrev.cfgSavedTitle': {
    es: 'Configuración guardada',
    en: 'Settings saved',
    pt: 'Configuração salva',
  },
  'dossierPrev.cfgSavedMsg': {
    es: 'Se aplicará a todos los ensayos de este tipo.',
    en: 'It will apply to all tests of this type.',
    pt: 'Será aplicada a todos os ensaios deste tipo.',
  },
  'dossierPrev.cfgClose': {
    es: 'Cerrar',
    en: 'Close',
    pt: 'Fechar',
  },
  'dossierPrev.regenerating': {
    es: 'Regenerando…',
    en: 'Regenerating…',
    pt: 'Regenerando…',
  },
};

export default dossierPrev;
