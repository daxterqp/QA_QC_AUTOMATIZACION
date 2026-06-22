/**
 * i18n (web) — Cadenas EXCLUSIVAS de los componentes numéricos web
 * (components/numeric/NumericTable.tsx y MatricesModal.tsx) que NO tienen
 * equivalente en el catálogo espejo del móvil.
 * Las claves con equivalente en el móvil se REUSAN vía `numericTable.*` /
 * `common.*` directamente desde los componentes (NO se duplican aquí).
 * Namespace `webCNumeric.*`. Se fusiona en `index.tsx` (ALL_STRINGS).
 */
export const STRINGS_WEB_CNUMERIC: Record<string, { es: string; en: string; pt: string }> = {
  // ── Barra superior: tooltips y toggles ──
  'webCNumeric.startFillTip': {
    es: 'Saltar al primer campo vacío. Presiona Enter para avanzar al siguiente.',
    en: 'Jump to the first empty field. Press Enter to move to the next one.',
    pt: 'Saltar para o primeiro campo vazio. Pressione Enter para avançar ao próximo.',
  },
  'webCNumeric.showFormulas': { es: 'Mostrar fórmulas', en: 'Show formulas', pt: 'Mostrar fórmulas' },
  'webCNumeric.hideFormulas': { es: 'Ocultar fórmulas', en: 'Hide formulas', pt: 'Ocultar fórmulas' },
  'webCNumeric.showFormulasTip': {
    es: 'Mostrar las fórmulas sobre cada celda calculada',
    en: 'Show the formulas above each calculated cell',
    pt: 'Mostrar as fórmulas sobre cada célula calculada',
  },
  'webCNumeric.hideFormulasTip': {
    es: 'Ocultar fórmulas de las celdas',
    en: 'Hide cell formulas',
    pt: 'Ocultar fórmulas das células',
  },
  'webCNumeric.viewTablesTip': {
    es: 'Ver las tablas auxiliares (catálogos) del protocolo',
    en: 'View the auxiliary tables (catalogs) of the protocol',
    pt: 'Ver as tabelas auxiliares (catálogos) do protocolo',
  },

  // ── Gráfico ──
  'webCNumeric.reloadChartTip': {
    es: 'Recargar / recalcular gráfico',
    en: 'Reload / recalculate chart',
    pt: 'Recarregar / recalcular gráfico',
  },

  // ── Tooltips de fórmulas por fila ──
  'webCNumeric.showRowFormulas': {
    es: 'Ver fórmulas de esta fila',
    en: 'View formulas of this row',
    pt: 'Ver fórmulas desta linha',
  },
  'webCNumeric.hideRowFormulas': {
    es: 'Ocultar fórmulas de esta fila',
    en: 'Hide formulas of this row',
    pt: 'Ocultar fórmulas desta linha',
  },

  // ── Etiquetas de tipo bajo la celda (rangeBelow) ──
  'webCNumeric.cellType.list': { es: 'lista', en: 'list', pt: 'lista' },
  'webCNumeric.cellType.comment': { es: 'coment.', en: 'comment', pt: 'coment.' },
  'webCNumeric.cellType.bool': { es: 'sí/no', en: 'yes/no', pt: 'sim/não' },
  'webCNumeric.cellType.equipment': { es: 'equipo: {type}', en: 'equipment: {type}', pt: 'equipamento: {type}' },

  // ── MatricesModal ──
  'webCNumeric.matrices.title': {
    es: 'Tablas auxiliares del protocolo',
    en: 'Protocol auxiliary tables',
    pt: 'Tabelas auxiliares do protocolo',
  },
  'webCNumeric.matrices.matrixLabel.one': {
    es: 'Matriz {id} · {count} fila',
    en: 'Matrix {id} · {count} row',
    pt: 'Matriz {id} · {count} linha',
  },
  'webCNumeric.matrices.matrixLabel.other': {
    es: 'Matriz {id} · {count} filas',
    en: 'Matrix {id} · {count} rows',
    pt: 'Matriz {id} · {count} linhas',
  },
  'webCNumeric.matrices.empty': { es: 'Sin matrices.', en: 'No matrices.', pt: 'Sem matrizes.' },
};
