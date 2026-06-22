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
};

export default dossierPrev;
