/**
 * i18n — Cadenas de la pantalla LocationListScreen (namespace `locList`).
 * export default: Record<clave, { es, en, pt }>. Se agrega en `./index.ts`.
 */
const locList: Record<string, { es: string; en: string; pt: string }> = {
  'locList.referencePlan': {
    es: 'Plano: {plan}',
    en: 'Drawing: {plan}',
    pt: 'Planta: {plan}',
  },
  'locList.complete': {
    es: 'Completo',
    en: 'Complete',
    pt: 'Completo',
  },
  'locList.pending': {
    es: 'Pendientes',
    en: 'Pending',
    pt: 'Pendentes',
  },
  'locList.noProtocols': {
    es: 'Sin protocolos',
    en: 'No protocols',
    pt: 'Sem protocolos',
  },
  'locList.syncing': {
    es: 'Sincronizando...',
    en: 'Syncing...',
    pt: 'Sincronizando...',
  },
  'locList.locationCount_one': {
    es: '{count} ubicación',
    en: '{count} location',
    pt: '{count} localização',
  },
  'locList.locationCount_other': {
    es: '{count} ubicaciones',
    en: '{count} locations',
    pt: '{count} localizações',
  },
  'locList.searchPlaceholder': {
    es: 'Buscar...',
    en: 'Search...',
    pt: 'Buscar...',
  },
  'locList.locationLabel': {
    es: 'Ubicación',
    en: 'Location',
    pt: 'Localização',
  },
  'locList.specialtyLabel': {
    es: 'Especialidad',
    en: 'Specialty',
    pt: 'Especialidade',
  },
  'locList.all': {
    es: 'Todas',
    en: 'All',
    pt: 'Todas',
  },
  'locList.clearFilters_one': {
    es: 'Limpiar {count} filtro',
    en: 'Clear {count} filter',
    pt: 'Limpar {count} filtro',
  },
  'locList.clearFilters_other': {
    es: 'Limpiar {count} filtros',
    en: 'Clear {count} filters',
    pt: 'Limpar {count} filtros',
  },
  'locList.emptyNoLocations': {
    es: 'No hay ubicaciones cargadas.\nImporta el Excel de ubicaciones desde el menú del proyecto.',
    en: 'No locations loaded.\nImport the locations Excel from the project menu.',
    pt: 'Nenhuma localização carregada.\nImporte o Excel de localizações pelo menu do projeto.',
  },
  'locList.emptyNoResults': {
    es: 'No se encontraron resultados.',
    en: 'No results found.',
    pt: 'Nenhum resultado encontrado.',
  },
};

export default locList;
