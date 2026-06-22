/**
 * i18n — Cadenas del componente DateRangePicker (namespace `dateRange`).
 * export default: Record<clave, { es, en, pt }>. Se agrega en `./index.ts`.
 */
const dateRange: Record<string, { es: string; en: string; pt: string }> = {
  // Chip vacío / con valor
  'dateRange.fromEmpty': {
    es: 'Desde …',
    en: 'From …',
    pt: 'De …',
  },
  'dateRange.fromValue': {
    es: 'Desde {date}',
    en: 'From {date}',
    pt: 'De {date}',
  },
  'dateRange.toEmpty': {
    es: 'Hasta …',
    en: 'Until …',
    pt: 'Até …',
  },
  'dateRange.toValue': {
    es: 'Hasta {date}',
    en: 'Until {date}',
    pt: 'Até {date}',
  },

  // Título del modal de calendario
  'dateRange.selectStartDate': {
    es: 'Selecciona fecha inicial',
    en: 'Select start date',
    pt: 'Selecione a data inicial',
  },
  'dateRange.selectEndDate': {
    es: 'Selecciona fecha final',
    en: 'Select end date',
    pt: 'Selecione a data final',
  },
};

export default dateRange;
