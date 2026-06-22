/**
 * i18n (v46) — Cadenas del módulo de sectores (ProjectSectorsContent).
 * export default: Record<clave, { es; en; pt }>. Se agrega en screens/index.ts.
 */
const sectorsContent: Record<string, { es: string; en: string; pt: string }> = {
  // Importar archivo
  'sectorsContent.invalidFormatTitle': { es: 'Formato no válido', en: 'Invalid format', pt: 'Formato inválido' },
  'sectorsContent.invalidFormatMsg': {
    es: 'Selecciona un archivo .csv, .xlsx o .xls',
    en: 'Select a .csv, .xlsx or .xls file',
    pt: 'Selecione um arquivo .csv, .xlsx ou .xls',
  },
  'sectorsContent.readFileError': { es: 'Error al leer archivo', en: 'Error reading file', pt: 'Erro ao ler arquivo' },

  // Confirmar importación
  'sectorsContent.importDoneTitle': { es: 'Importación completada', en: 'Import completed', pt: 'Importação concluída' },
  'sectorsContent.importDoneSectorsProcessed': {
    es: '{count} sectores procesados ({newInfo}).',
    en: '{count} sectors processed ({newInfo}).',
    pt: '{count} setores processados ({newInfo}).',
  },
  'sectorsContent.importDoneNewCount': { es: '{count} nuevos', en: '{count} new', pt: '{count} novos' },
  'sectorsContent.importDoneNewZero': { es: '0 nuevos', en: '0 new', pt: '0 novos' },
  'sectorsContent.importWarnings': {
    es: '\n\n⚠ {count} advertencia(s):\n{list}',
    en: '\n\n⚠ {count} warning(s):\n{list}',
    pt: '\n\n⚠ {count} aviso(s):\n{list}',
  },
  'sectorsContent.errorTitle': { es: 'Error', en: 'Error', pt: 'Erro' },
  'sectorsContent.saveImportError': {
    es: 'No se pudo guardar la importación.',
    en: 'The import could not be saved.',
    pt: 'Não foi possível salvar a importação.',
  },

  // Eliminar sector
  'sectorsContent.deleteTitle': { es: 'Eliminar "{name}"', en: 'Delete "{name}"', pt: 'Excluir "{name}"' },
  'sectorsContent.deleteAssignedMsg': {
    es: '{count} ensayo(s) están asignados a este sector. Quedarán sin sector. ¿Continuar?',
    en: '{count} test(s) are assigned to this sector. They will be left without a sector. Continue?',
    pt: '{count} ensaio(s) estão atribuídos a este setor. Ficarão sem setor. Continuar?',
  },
  'sectorsContent.deleteConfirmMsg': {
    es: '¿Eliminar este sector? Esta acción es definitiva.',
    en: 'Delete this sector? This action is permanent.',
    pt: 'Excluir este setor? Esta ação é definitiva.',
  },
  'sectorsContent.cancel': { es: 'Cancelar', en: 'Cancel', pt: 'Cancelar' },
  'sectorsContent.delete': { es: 'Eliminar', en: 'Delete', pt: 'Excluir' },
  'sectorsContent.deleteError': {
    es: 'No se pudo eliminar.',
    en: 'Could not delete.',
    pt: 'Não foi possível excluir.',
  },

  // Editar sector
  'sectorsContent.nameRequired': { es: 'Nombre requerido', en: 'Name required', pt: 'Nome obrigatório' },
  'sectorsContent.saveError': {
    es: 'No se pudo guardar.',
    en: 'Could not save.',
    pt: 'Não foi possível salvar.',
  },

  // Recalcular
  'sectorsContent.noGeometryTitle': { es: 'Sin geometría', en: 'No geometry', pt: 'Sem geometria' },
  'sectorsContent.noGeometryMsg': {
    es: 'No hay sectores con polígonos para evaluar.',
    en: 'There are no sectors with polygons to evaluate.',
    pt: 'Não há setores com polígonos para avaliar.',
  },
  'sectorsContent.recalcDoneTitle': { es: 'Recálculo completado', en: 'Recalculation completed', pt: 'Recálculo concluído' },
  'sectorsContent.recalcDoneMsg': {
    es: '{updated} ensayo(s) actualizados (de {total} con coords).',
    en: '{updated} test(s) updated (of {total} with coordinates).',
    pt: '{updated} ensaio(s) atualizados (de {total} com coordenadas).',
  },
  'sectorsContent.recalcError': {
    es: 'No se pudo recalcular.',
    en: 'Could not recalculate.',
    pt: 'Não foi possível recalcular.',
  },

  // Lista de sectores (renderItem)
  'sectorsContent.rowGeometryMeta': {
    es: 'Geometría ✓ · {count} vértices · toca para ver croquis',
    en: 'Geometry ✓ · {count} vertices · tap to view sketch',
    pt: 'Geometria ✓ · {count} vértices · toque para ver croqui',
  },
  'sectorsContent.rowNameOnly': {
    es: 'Solo nombre (sin geometría)',
    en: 'Name only (no geometry)',
    pt: 'Apenas nome (sem geometria)',
  },

  // Barra de estadísticas
  'sectorsContent.statTotal': { es: 'Total: ', en: 'Total: ', pt: 'Total: ' },
  'sectorsContent.statWithGeometry': { es: 'Con geometría: ', en: 'With geometry: ', pt: 'Com geometria: ' },
  'sectorsContent.statNamesOnly': { es: 'Solo nombre: ', en: 'Name only: ', pt: 'Apenas nome: ' },

  // Barra de acciones
  'sectorsContent.importExcelCsv': { es: 'Importar Excel/CSV', en: 'Import Excel/CSV', pt: 'Importar Excel/CSV' },
  'sectorsContent.recalculating': { es: 'Recalculando…', en: 'Recalculating…', pt: 'Recalculando…' },
  'sectorsContent.recalcAssignments': {
    es: 'Recalcular asignaciones',
    en: 'Recalculate assignments',
    pt: 'Recalcular atribuições',
  },

  // Lista vacía
  'sectorsContent.emptyText': {
    es: 'Aún no hay sectores en este proyecto.',
    en: 'There are no sectors in this project yet.',
    pt: 'Ainda não há setores neste projeto.',
  },
  'sectorsContent.emptyHint': {
    es: 'Importa un Excel/CSV para empezar.',
    en: 'Import an Excel/CSV to get started.',
    pt: 'Importe um Excel/CSV para começar.',
  },

  // Modal previsualización
  'sectorsContent.previewTitle': {
    es: 'Previsualización de importación',
    en: 'Import preview',
    pt: 'Pré-visualização da importação',
  },
  'sectorsContent.previewFormatDetected': { es: 'Formato detectado: ', en: 'Detected format: ', pt: 'Formato detectado: ' },
  'sectorsContent.previewSectorsToImport': { es: 'Sectores a importar: ', en: 'Sectors to import: ', pt: 'Setores a importar: ' },
  'sectorsContent.previewLinePts': { es: '({count} pts)', en: '({count} pts)', pt: '({count} pts)' },
  'sectorsContent.previewLineNameOnly': { es: '(solo nombre)', en: '(name only)', pt: '(apenas nome)' },
  'sectorsContent.previewMore': { es: '… y {count} más', en: '… and {count} more', pt: '… e mais {count}' },
  'sectorsContent.previewWarningsTitle': {
    es: 'Advertencias ({count}):',
    en: 'Warnings ({count}):',
    pt: 'Avisos ({count}):',
  },
  'sectorsContent.confirmImport': { es: 'Confirmar import', en: 'Confirm import', pt: 'Confirmar importação' },

  // Modal editar
  'sectorsContent.editTitle': { es: 'Editar sector', en: 'Edit sector', pt: 'Editar setor' },
  'sectorsContent.fieldName': { es: 'Nombre', en: 'Name', pt: 'Nome' },
  'sectorsContent.fieldColor': { es: 'Color', en: 'Color', pt: 'Cor' },
  'sectorsContent.save': { es: 'Guardar', en: 'Save', pt: 'Salvar' },

  // formatLabel
  'sectorsContent.formatNamesOnly': {
    es: 'Solo nombres (sin geometría)',
    en: 'Names only (no geometry)',
    pt: 'Apenas nomes (sem geometria)',
  },
  'sectorsContent.formatWgs84Flat': {
    es: 'WGS84 Lat/Lng (polígonos)',
    en: 'WGS84 Lat/Lng (polygons)',
    pt: 'WGS84 Lat/Lng (polígonos)',
  },
  'sectorsContent.formatProjected': {
    es: 'Proyectado (UTM convertido a WGS84)',
    en: 'Projected (UTM converted to WGS84)',
    pt: 'Projetado (UTM convertido para WGS84)',
  },
};

export default sectorsContent;
