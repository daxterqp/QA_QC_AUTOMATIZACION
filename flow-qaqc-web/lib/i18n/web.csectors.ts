/**
 * i18n (web) — Cadenas EXCLUSIVAS de los componentes web de sectores:
 *  - components/sectors/SectoresTab.tsx
 *  - components/sectors/OrthophotoSection.tsx
 *  - components/sectors/SectorMap.tsx
 * Namespace `webCSectors.*`. Las cadenas que ya existen en el catálogo espejo
 * (sectorsContent.*, common.*) se reutilizan desde los componentes y NO se duplican aquí.
 * Se fusiona en `index.tsx` (ALL_STRINGS).
 */
export const STRINGS_WEB_CSECTORS: Record<string, { es: string; en: string; pt: string }> = {
  // ── SectoresTab ──────────────────────────────────────────────────────────
  'webCSectors.mapLoading': { es: 'Cargando mapa…', en: 'Loading map…', pt: 'Carregando mapa…' },
  'webCSectors.cardTitle': { es: 'Sectores GIS del proyecto', en: 'Project GIS sectors', pt: 'Setores GIS do projeto' },
  'webCSectors.cardDesc': {
    es: 'Sube un Excel/CSV con polígonos. Se detectan 3 formatos: <strong>solo nombres</strong>, <strong>lat/lng WGS84</strong>, o <strong>x/y proyectado</strong> (UTM/PSAD56). Tras subir, usa <strong>Recalcular asignaciones</strong> para reasignar los protocolos con coordenadas a su sector por point-in-polygon.',
    en: 'Upload an Excel/CSV with polygons. 3 formats are detected: <strong>names only</strong>, <strong>lat/lng WGS84</strong>, or <strong>projected x/y</strong> (UTM/PSAD56). After uploading, use <strong>Recalculate assignments</strong> to reassign protocols with coordinates to their sector by point-in-polygon.',
    pt: 'Envie um Excel/CSV com polígonos. São detectados 3 formatos: <strong>apenas nomes</strong>, <strong>lat/lng WGS84</strong>, ou <strong>x/y projetado</strong> (UTM/PSAD56). Após enviar, use <strong>Recalcular atribuições</strong> para reatribuir os protocolos com coordenadas ao seu setor por point-in-polygon.',
  },
  'webCSectors.uploadExcelCsv': { es: 'Subir Excel/CSV', en: 'Upload Excel/CSV', pt: 'Enviar Excel/CSV' },
  'webCSectors.previewTitle': { es: 'Previsualización', en: 'Preview', pt: 'Pré-visualização' },
  'webCSectors.previewFormat': { es: 'Formato:', en: 'Format:', pt: 'Formato:' },
  'webCSectors.previewSectors': { es: 'Sectores:', en: 'Sectors:', pt: 'Setores:' },
  'webCSectors.previewLinePts': { es: '({count} pts)', en: '({count} pts)', pt: '({count} pts)' },
  'webCSectors.previewLineNameOnly': { es: '(solo nombre)', en: '(name only)', pt: '(apenas nome)' },
  'webCSectors.previewMore': { es: '…y {count} más', en: '…and {count} more', pt: '…e mais {count}' },
  'webCSectors.previewWarnMore': { es: '…y {count} más', en: '…and {count} more', pt: '…e mais {count}' },
  'webCSectors.confirmImport': { es: 'Confirmar importación', en: 'Confirm import', pt: 'Confirmar importação' },
  'webCSectors.importSummary': {
    es: '+{added} sector(es) nuevos, {modified} actualizado(s).',
    en: '+{added} new sector(s), {modified} updated.',
    pt: '+{added} setor(es) novos, {modified} atualizado(s).',
  },
  'webCSectors.loadedHeader': {
    es: 'Sectores cargados ({total}) · Con geometría: {withGeom}',
    en: 'Loaded sectors ({total}) · With geometry: {withGeom}',
    pt: 'Setores carregados ({total}) · Com geometria: {withGeom}',
  },
  'webCSectors.emptyText': {
    es: 'Aún no hay sectores. Sube un Excel/CSV para empezar.',
    en: 'There are no sectors yet. Upload an Excel/CSV to get started.',
    pt: 'Ainda não há setores. Envie um Excel/CSV para começar.',
  },
  'webCSectors.rowGeometryMeta': {
    es: 'Geometría ✓ · {count} vértices · clic para ver croquis',
    en: 'Geometry ✓ · {count} vertices · click to view sketch',
    pt: 'Geometria ✓ · {count} vértices · clique para ver croqui',
  },
  'webCSectors.mapHeader': {
    es: 'Mapa GIS · {count} sector(es) con geometría',
    en: 'GIS map · {count} sector(s) with geometry',
    pt: 'Mapa GIS · {count} setor(es) com geometria',
  },
  'webCSectors.mapOrthoActive': { es: ' · ortofoto activa', en: ' · active orthophoto', pt: ' · ortofoto ativa' },
  'webCSectors.mapOrthoTiles': { es: ' ({count} teselas)', en: ' ({count} tiles)', pt: ' ({count} blocos)' },
  'webCSectors.nameRequired': { es: 'El nombre es requerido.', en: 'Name is required.', pt: 'O nome é obrigatório.' },
  'webCSectors.deleteConfirm': {
    es: '¿Eliminar el sector "{name}"? Los protocolos asignados quedarán sin sector.',
    en: 'Delete sector "{name}"? Assigned protocols will be left without a sector.',
    pt: 'Excluir o setor "{name}"? Os protocolos atribuídos ficarão sem setor.',
  },
  'webCSectors.deletedWithUnassigned': {
    es: 'Eliminado. {count} ensayo(s) quedaron sin sector.',
    en: 'Deleted. {count} test(s) were left without a sector.',
    pt: 'Excluído. {count} ensaio(s) ficaram sem setor.',
  },
  'webCSectors.deletedSimple': { es: 'Eliminado.', en: 'Deleted.', pt: 'Excluído.' },
  'webCSectors.recalcResult': {
    es: '{updated} ensayo(s) reasignados (de {total} con coords).',
    en: '{updated} test(s) reassigned (of {total} with coordinates).',
    pt: '{updated} ensaio(s) reatribuídos (de {total} com coordenadas).',
  },
  'webCSectors.recalcErrorPrefix': { es: 'Error: ', en: 'Error: ', pt: 'Erro: ' },
  'webCSectors.fmtWgs84Flat': { es: 'WGS84 Lat/Lng', en: 'WGS84 Lat/Lng', pt: 'WGS84 Lat/Lng' },

  // ── OrthophotoSection ──────────────────────────────────────────────────────
  'webCSectors.orthoTitle': { es: 'Ortofoto georreferenciada', en: 'Georeferenced orthophoto', pt: 'Ortofoto georreferenciada' },
  'webCSectors.orthoDesc': {
    es: 'Selecciona un <strong>GeoTIFF</strong> (hasta varios GB) o un <strong>KML/KMZ</strong> (más liviano; la georreferencia ya viene en el GroundOverlay). Se <strong>procesa en la PC</strong> (se lee su georreferencia y se reduce a una imagen liviana); luego confirmas el peso y se sube <strong>solo la versión ligera</strong> a S3. Si el archivo no trae coordenadas, se piden las 2 esquinas.',
    en: 'Select a <strong>GeoTIFF</strong> (up to several GB) or a <strong>KML/KMZ</strong> (lighter; the georeference already comes in the GroundOverlay). It is <strong>processed on the PC</strong> (its georeference is read and it is reduced to a lightweight image); then you confirm the size and <strong>only the lightweight version</strong> is uploaded to S3. If the file has no coordinates, the 2 corners are requested.',
    pt: 'Selecione um <strong>GeoTIFF</strong> (até vários GB) ou um <strong>KML/KMZ</strong> (mais leve; a georreferência já vem no GroundOverlay). É <strong>processado no PC</strong> (sua georreferência é lida e reduzida a uma imagem leve); depois você confirma o tamanho e <strong>somente a versão leve</strong> é enviada ao S3. Se o arquivo não trouxer coordenadas, são solicitadas as 2 esquinas.',
  },
  'webCSectors.versionsLabel': {
    es: 'Configurar ortofoto — versiones ({count})',
    en: 'Configure orthophoto — versions ({count})',
    pt: 'Configurar ortofoto — versões ({count})',
  },
  'webCSectors.versionsHint': {
    es: 'Seleccionar una versión la <strong>previsualiza</strong>; no cambia la capa del proyecto. Para cambiarla para todos, usa <strong>“Seleccionar como capa de proyecto”</strong> (pide confirmación).',
    en: 'Selecting a version <strong>previews</strong> it; it does not change the project layer. To change it for everyone, use <strong>“Set as project layer”</strong> (asks for confirmation).',
    pt: 'Selecionar uma versão a <strong>pré-visualiza</strong>; não altera a camada do projeto. Para alterá-la para todos, use <strong>“Definir como camada do projeto”</strong> (pede confirmação).',
  },
  'webCSectors.badgeCurrentLayer': {
    es: 'CAPA DE PROYECTO ACTUAL',
    en: 'CURRENT PROJECT LAYER',
    pt: 'CAMADA DE PROJETO ATUAL',
  },
  'webCSectors.previewing': { es: '· previsualizando', en: '· previewing', pt: '· pré-visualizando' },
  'webCSectors.tooltipRename': { es: 'Renombrar', en: 'Rename', pt: 'Renomear' },
  'webCSectors.setAsProjectLayer': {
    es: 'Seleccionar como capa de proyecto',
    en: 'Set as project layer',
    pt: 'Definir como camada do projeto',
  },
  'webCSectors.noOrthos': { es: 'Aún no hay ortofotos cargadas.', en: 'No orthophotos uploaded yet.', pt: 'Ainda não há ortofotos carregadas.' },
  'webCSectors.desktopWarn': {
    es: 'Para procesar ortofotos pesadas, abre el proyecto desde la <strong>app de escritorio S-CUA</strong>.',
    en: 'To process heavy orthophotos, open the project from the <strong>S-CUA desktop app</strong>.',
    pt: 'Para processar ortofotos pesadas, abra o projeto pelo <strong>app de desktop S-CUA</strong>.',
  },
  'webCSectors.loadNewVersion': {
    es: 'Cargar nueva versión de ortofoto',
    en: 'Upload new orthophoto version',
    pt: 'Carregar nova versão de ortofoto',
  },
  'webCSectors.qualMax': { es: 'Máx (16383 px)', en: 'Max (16383 px)', pt: 'Máx (16383 px)' },
  'webCSectors.qualVeryHigh': { es: 'Muy alta (12288 px)', en: 'Very high (12288 px)', pt: 'Muito alta (12288 px)' },
  'webCSectors.qualHigh': { es: 'Alta (8192 px)', en: 'High (8192 px)', pt: 'Alta (8192 px)' },
  'webCSectors.qualMedium': { es: 'Media (4096 px)', en: 'Medium (4096 px)', pt: 'Média (4096 px)' },
  'webCSectors.qualLight': { es: 'Ligera (2048 px)', en: 'Light (2048 px)', pt: 'Leve (2048 px)' },
  'webCSectors.gridSimple': { es: '1 (simple)', en: '1 (simple)', pt: '1 (simples)' },
  'webCSectors.grid2x2': { es: '4 (2×2)', en: '4 (2×2)', pt: '4 (2×2)' },
  'webCSectors.grid3x3': { es: '9 (3×3)', en: '9 (3×3)', pt: '9 (3×3)' },
  'webCSectors.resolutionQuality': { es: 'Resolución / calidad', en: 'Resolution / quality', pt: 'Resolução / qualidade' },
  'webCSectors.tiling': { es: 'Teselado (porciones)', en: 'Tiling (sections)', pt: 'Mosaico (porções)' },
  'webCSectors.tilingHint': {
    es: 'Cada preset capa el lado largo POR pieza. El teselado parte la ortofoto en porciones (cada una su propia textura) → más nitidez sin chocar con el límite de ~8192 px del visor. Ej: <strong>9 (3×3)</strong> con “Alta” ≈ 24576 px de detalle efectivo. Procesa más lento y pesa más (lo confirmas antes de subir).',
    en: 'Each preset caps the long side PER piece. Tiling splits the orthophoto into sections (each with its own texture) → more sharpness without hitting the viewer’s ~8192 px limit. E.g.: <strong>9 (3×3)</strong> with “High” ≈ 24576 px of effective detail. It processes slower and weighs more (you confirm before uploading).',
    pt: 'Cada preset limita o lado longo POR peça. O mosaico divide a ortofoto em porções (cada uma com sua própria textura) → mais nitidez sem atingir o limite de ~8192 px do visualizador. Ex.: <strong>9 (3×3)</strong> com “Alta” ≈ 24576 px de detalhe efetivo. Processa mais lento e pesa mais (você confirma antes de enviar).',
  },
  'webCSectors.pickAndProcess': {
    es: 'Seleccionar y procesar ortofoto',
    en: 'Select and process orthophoto',
    pt: 'Selecionar e processar ortofoto',
  },
  'webCSectors.processing': {
    es: 'Procesando en la PC{detail}… puede tardar.',
    en: 'Processing on the PC{detail}… this may take a while.',
    pt: 'Processando no PC{detail}… pode demorar.',
  },
  'webCSectors.original': { es: 'Original:', en: 'Original:', pt: 'Original:' },
  'webCSectors.willUpload': { es: 'Se subirá a S3: {size}', en: 'Will upload to S3: {size}', pt: 'Será enviado ao S3: {size}' },
  'webCSectors.uploadTilesInfo': {
    es: ' · {count} teselas ({grid}×{grid})',
    en: ' · {count} tiles ({grid}×{grid})',
    pt: ' · {count} blocos ({grid}×{grid})',
  },
  'webCSectors.reduction': { es: 'Reducción ≈ {pct}%', en: 'Reduction ≈ {pct}%', pt: 'Redução ≈ {pct}%' },
  'webCSectors.coordsRead': {
    es: 'Coordenadas leídas del GeoTIFF ({system})',
    en: 'Coordinates read from the GeoTIFF ({system})',
    pt: 'Coordenadas lidas do GeoTIFF ({system})',
  },
  'webCSectors.coordsMissing': {
    es: 'El TIFF no trae coordenadas — ingrésalas abajo.',
    en: 'The TIFF has no coordinates — enter them below.',
    pt: 'O TIFF não traz coordenadas — insira-as abaixo.',
  },
  'webCSectors.coordSystem': { es: 'Sistema de coordenadas', en: 'Coordinate system', pt: 'Sistema de coordenadas' },
  'webCSectors.utmZone': { es: 'Zona UTM', en: 'UTM zone', pt: 'Zona UTM' },
  'webCSectors.hemisphere': { es: 'Hemisferio', en: 'Hemisphere', pt: 'Hemisfério' },
  'webCSectors.hemisphereSouth': { es: 'Sur (S)', en: 'South (S)', pt: 'Sul (S)' },
  'webCSectors.hemisphereNorth': { es: 'Norte (N)', en: 'North (N)', pt: 'Norte (N)' },
  'webCSectors.cornerSW': { es: 'Esquina SUROESTE', en: 'SOUTHWEST corner', pt: 'Esquina SUDOESTE' },
  'webCSectors.cornerNE': { es: 'Esquina NORESTE', en: 'NORTHEAST corner', pt: 'Esquina NORDESTE' },
  'webCSectors.cornerNorthY': { es: 'Norte (Y)', en: 'Northing (Y)', pt: 'Norte (Y)' },
  'webCSectors.cornerEastX': { es: 'Este (X)', en: 'Easting (X)', pt: 'Leste (X)' },
  'webCSectors.cornerLat': { es: 'Latitud', en: 'Latitude', pt: 'Latitude' },
  'webCSectors.cornerLng': { es: 'Longitud', en: 'Longitude', pt: 'Longitude' },
  'webCSectors.confirmAndUpload': { es: 'Confirmar y subir {size}', en: 'Confirm and upload {size}', pt: 'Confirmar e enviar {size}' },
  'webCSectors.changeLayerTitle': { es: 'Cambiar capa del proyecto', en: 'Change project layer', pt: 'Alterar camada do projeto' },
  'webCSectors.changeLayerMsg': {
    es: '¿Estás seguro que deseas poner la ortofoto <strong>“{label}”</strong>{date} como la <strong>capa actual del proyecto</strong>? Se actualizará para todos los usuarios.',
    en: 'Are you sure you want to set the orthophoto <strong>“{label}”</strong>{date} as the <strong>current project layer</strong>? It will be updated for all users.',
    pt: 'Tem certeza de que deseja definir a ortofoto <strong>“{label}”</strong>{date} como a <strong>camada atual do projeto</strong>? Será atualizada para todos os usuários.',
  },
  'webCSectors.confirmActivate': { es: 'Sí, activar', en: 'Yes, activate', pt: 'Sim, ativar' },
  'webCSectors.renamePrompt': { es: 'Nombre de esta ortofoto:', en: 'Name of this orthophoto:', pt: 'Nome desta ortofoto:' },
  'webCSectors.deleteOrthoConfirm': {
    es: '¿Eliminar la ortofoto "{label}"? (la imagen permanece en S3)',
    en: 'Delete orthophoto "{label}"? (the image remains in S3)',
    pt: 'Excluir a ortofoto "{label}"? (a imagem permanece no S3)',
  },
  'webCSectors.errDesktopRequired': {
    es: 'El procesamiento de ortofotos pesadas requiere la app de escritorio S-CUA.',
    en: 'Processing heavy orthophotos requires the S-CUA desktop app.',
    pt: 'O processamento de ortofotos pesadas requer o app de desktop S-CUA.',
  },
  'webCSectors.errProcessFailed': { es: 'No se pudo procesar: {error}', en: 'Could not process: {error}', pt: 'Não foi possível processar: {error}' },
  'webCSectors.errMissingCorners': {
    es: 'Completa las 4 coordenadas de las esquinas (el TIFF no trae georreferencia).',
    en: 'Fill in the 4 corner coordinates (the TIFF has no georeference).',
    pt: 'Preencha as 4 coordenadas das esquinas (o TIFF não traz georreferência).',
  },
  'webCSectors.orthoLoaded': {
    es: 'Ortofoto cargada y activada. Visible en el mapa GIS.',
    en: 'Orthophoto uploaded and activated. Visible on the GIS map.',
    pt: 'Ortofoto carregada e ativada. Visível no mapa GIS.',
  },

  // ── SectorMap ───────────────────────────────────────────────────────────────
  'webCSectors.mapLegendSectors': { es: 'Sectores', en: 'Sectors', pt: 'Setores' },
  'webCSectors.mapBaseSatellite': { es: 'Satélite (Esri)', en: 'Satellite (Esri)', pt: 'Satélite (Esri)' },
  'webCSectors.mapOverlayOrtho': { es: 'Ortofoto', en: 'Orthophoto', pt: 'Ortofoto' },
};
