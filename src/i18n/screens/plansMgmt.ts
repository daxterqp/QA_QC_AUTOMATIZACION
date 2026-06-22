/**
 * i18n (v46) — Cadenas de la pantalla PlansManagementScreen (gestión de planos PDF).
 * Namespace: plansMgmt. Solo UI visible al usuario (NO toca enum/DSL/datos/AsyncStorage).
 */
const plansMgmt: Record<string, { es: string; en: string; pt: string }> = {
  // Cabecera
  'plansMgmt.title.viewer': { es: 'Planos', en: 'Drawings', pt: 'Plantas' },
  'plansMgmt.title.measure': { es: 'Planos · Medición', en: 'Drawings · Measurement', pt: 'Plantas · Medição' },

  // Barra de sincronización (modo medición)
  'plansMgmt.sync.downloading': { es: 'Descargando…', en: 'Downloading…', pt: 'Baixando…' },
  'plansMgmt.sync.linking': { es: 'Vinculando…', en: 'Linking…', pt: 'Vinculando…' },
  'plansMgmt.sync.title': { es: 'Sincronizar planos', en: 'Sync drawings', pt: 'Sincronizar plantas' },
  'plansMgmt.sync.subtitle': { es: 'Descarga PDFs nuevos y revincula a sus ubicaciones', en: 'Downloads new PDFs and relinks them to their locations', pt: 'Baixa novos PDFs e revincula às suas localizações' },

  // Barra de carga (modo visor)
  'plansMgmt.upload.button': { es: 'Subir plano(s) PDF', en: 'Upload PDF drawing(s)', pt: 'Enviar planta(s) PDF' },
  'plansMgmt.pull.button': { es: '⬇ Pull PDFs desde S3', en: '⬇ Pull PDFs from S3', pt: '⬇ Baixar PDFs do S3' },
  'plansMgmt.relink.button': { es: 'Re-vincular planos existentes', en: 'Relink existing drawings', pt: 'Revincular plantas existentes' },
  'plansMgmt.hint': { es: 'El nombre del PDF debe coincidir con el "Plano de referencia" de la ubicación', en: 'The PDF name must match the location\'s "Reference drawing"', pt: 'O nome do PDF deve coincidir com a "Planta de referência" da localização' },

  // Lista agrupada por especialidad
  'plansMgmt.empty.canManage': { es: 'Sube el primer plano con el botón de arriba.', en: 'Upload the first drawing using the button above.', pt: 'Envie a primeira planta com o botão acima.' },
  'plansMgmt.empty.readonly': { es: 'No hay planos disponibles.', en: 'No drawings available.', pt: 'Nenhuma planta disponível.' },
  'plansMgmt.group.countOne': { es: '{count} plano', en: '{count} drawing', pt: '{count} planta' },
  'plansMgmt.group.countOther': { es: '{count} planos', en: '{count} drawings', pt: '{count} plantas' },

  // Tarjeta de plano
  'plansMgmt.card.location': { es: 'Ubicación: {name}', en: 'Location: {name}', pt: 'Localização: {name}' },
  'plansMgmt.card.noLocation': { es: 'Sin ubicación vinculada', en: 'No location linked', pt: 'Sem localização vinculada' },
  'plansMgmt.card.measure': { es: 'Medir ›', en: 'Measure ›', pt: 'Medir ›' },
  'plansMgmt.card.open': { es: 'Abrir ›', en: 'Open ›', pt: 'Abrir ›' },
  'plansMgmt.card.delete': { es: 'Eliminar', en: 'Delete', pt: 'Excluir' },

  // Re-vincular (Alert)
  'plansMgmt.relink.alertTitle': { es: 'Re-vincular', en: 'Relink', pt: 'Revincular' },
  'plansMgmt.relink.linked': { es: 'Vinculados ({count}): {names}', en: 'Linked ({count}): {names}', pt: 'Vinculados ({count}): {names}' },
  'plansMgmt.relink.noMatch': { es: 'Sin coincidencia ({count}): {names}', en: 'No match ({count}): {names}', pt: 'Sem correspondência ({count}): {names}' },
  'plansMgmt.relink.allLinked': { es: 'Todos los planos ya tienen ubicación.', en: 'All drawings already have a location.', pt: 'Todas as plantas já têm localização.' },

  // Sincronizar planos (Alert + resúmenes)
  'plansMgmt.syncAlert.title': { es: 'Sincronizar planos', en: 'Sync drawings', pt: 'Sincronizar plantas' },
  'plansMgmt.syncAlert.downloaded': { es: '{count} descargado(s)', en: '{count} downloaded', pt: '{count} baixado(s)' },
  'plansMgmt.syncAlert.skipped': { es: '{count} ya existía(n)', en: '{count} already existed', pt: '{count} já existia(m)' },
  'plansMgmt.syncAlert.error': { es: 'Error: {error}', en: 'Error: {error}', pt: 'Erro: {error}' },
  'plansMgmt.syncAlert.noNew': { es: 'Sin planos nuevos en S3', en: 'No new drawings in S3', pt: 'Nenhuma planta nova no S3' },
  'plansMgmt.syncAlert.s3Error': { es: 'Error S3: {error}', en: 'S3 error: {error}', pt: 'Erro S3: {error}' },
  'plansMgmt.syncAlert.linkedCount': { es: 'Vinculados: {count}', en: 'Linked: {count}', pt: 'Vinculados: {count}' },
  'plansMgmt.syncAlert.noMatchCount': { es: 'Sin coincidencia: {count}', en: 'No match: {count}', pt: 'Sem correspondência: {count}' },
  'plansMgmt.syncAlert.upToDate': { es: 'Vínculos al día', en: 'Links up to date', pt: 'Vínculos atualizados' },

  // Pull S3 (Alert)
  'plansMgmt.pullAlert.title': { es: 'Pull S3', en: 'Pull S3', pt: 'Baixar S3' },
  'plansMgmt.pullAlert.downloaded': { es: 'Descargados: {count}', en: 'Downloaded: {count}', pt: 'Baixados: {count}' },
  'plansMgmt.pullAlert.skipped': { es: 'Ya existían: {count}', en: 'Already existed: {count}', pt: 'Já existiam: {count}' },
  'plansMgmt.pullAlert.error': { es: 'Error: {error}', en: 'Error: {error}', pt: 'Erro: {error}' },
  'plansMgmt.pullAlert.none': { es: 'No se encontraron planos nuevos en S3.', en: 'No new drawings found in S3.', pt: 'Nenhuma planta nova encontrada no S3.' },

  // Subida (Alerts)
  'plansMgmt.upload.offlineTitle': { es: 'Sin conexión', en: 'No connection', pt: 'Sem conexão' },
  'plansMgmt.upload.offlineMsg': { es: 'Subir planos PDF requiere conexión a internet (sube a S3).\n\nConéctate y vuelve a intentar.', en: 'Uploading PDF drawings requires an internet connection (uploads to S3).\n\nConnect and try again.', pt: 'Enviar plantas PDF requer conexão com a internet (envia para o S3).\n\nConecte-se e tente novamente.' },
  'plansMgmt.upload.loadError': { es: 'No se pudo cargar el plano.', en: 'The drawing could not be loaded.', pt: 'Não foi possível carregar a planta.' },
  'plansMgmt.upload.addedTitle': { es: 'Plano agregado', en: 'Drawing added', pt: 'Planta adicionada' },
  'plansMgmt.upload.addedMsg': { es: 'Total cargados: {count}. ¿Agregar otro plano?', en: 'Total loaded: {count}. Add another drawing?', pt: 'Total carregados: {count}. Adicionar outra planta?' },
  'plansMgmt.upload.finish': { es: 'Terminar', en: 'Finish', pt: 'Concluir' },
  'plansMgmt.upload.addAnother': { es: 'Agregar otro', en: 'Add another', pt: 'Adicionar outra' },
  'plansMgmt.upload.summaryTitle': { es: 'Resumen', en: 'Summary', pt: 'Resumo' },
  'plansMgmt.upload.summaryLinked': { es: 'Vinculados ({count}): {names}', en: 'Linked ({count}): {names}', pt: 'Vinculados ({count}): {names}' },
  'plansMgmt.upload.summaryUnlinked': { es: 'Sin ubicacion ({count}): {names}', en: 'No location ({count}): {names}', pt: 'Sem localização ({count}): {names}' },
  'plansMgmt.upload.summarySkipped': { es: 'Ya existian, omitidos ({count}): {names}', en: 'Already existed, skipped ({count}): {names}', pt: 'Já existiam, omitidos ({count}): {names}' },

  // Eliminar plano (Alert)
  'plansMgmt.delete.title': { es: 'Eliminar plano', en: 'Delete drawing', pt: 'Excluir planta' },
  'plansMgmt.delete.message': { es: '¿Eliminar "{name}"?', en: 'Delete "{name}"?', pt: 'Excluir "{name}"?' },
  'plansMgmt.delete.cancel': { es: 'Cancelar', en: 'Cancel', pt: 'Cancelar' },
  'plansMgmt.delete.confirm': { es: 'Eliminar', en: 'Delete', pt: 'Excluir' },

  // Genérico
  'plansMgmt.errorTitle': { es: 'Error', en: 'Error', pt: 'Erro' },
};

export default plansMgmt;
