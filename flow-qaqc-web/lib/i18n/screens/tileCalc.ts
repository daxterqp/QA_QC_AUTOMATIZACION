/**
 * i18n (v46) — Cadenas del componente TileCalculatorModal (cálculo de locetas sobre área).
 * Namespace: tileCalc. Solo UI visible al usuario (NO toca cálculo/datos/AsyncStorage).
 */
const tileCalc: Record<string, { es: string; en: string; pt: string }> = {
  // Header
  'tileCalc.title': { es: 'Cálculo de locetas', en: 'Tile calculation', pt: 'Cálculo de ladrilhos' },

  // Área base
  'tileCalc.areaToCover': { es: 'Área a cubrir', en: 'Area to cover', pt: 'Área a cobrir' },

  // Selector de loceta
  'tileCalc.tileSize': { es: 'Tamaño de loceta', en: 'Tile size', pt: 'Tamanho do ladrilho' },
  'tileCalc.addCustom': { es: 'Agregar personalizado', en: 'Add custom', pt: 'Adicionar personalizado' },

  // Formulario de nueva loceta
  'tileCalc.newTile': { es: 'Nueva loceta', en: 'New tile', pt: 'Novo ladrilho' },
  'tileCalc.namePlaceholder': { es: 'Nombre (ej: Porcelanato 80×80)', en: 'Name (e.g.: Porcelain 80×80)', pt: 'Nome (ex: Porcelanato 80×80)' },
  'tileCalc.lengthPlaceholder': { es: 'Largo (cm)', en: 'Length (cm)', pt: 'Comprimento (cm)' },
  'tileCalc.widthPlaceholder': { es: 'Ancho (cm)', en: 'Width (cm)', pt: 'Largura (cm)' },
  'tileCalc.cancel': { es: 'Cancelar', en: 'Cancel', pt: 'Cancelar' },
  'tileCalc.add': { es: 'Agregar', en: 'Add', pt: 'Adicionar' },

  // Junta / desperdicio
  'tileCalc.joint': { es: 'Junta (mm)', en: 'Joint (mm)', pt: 'Junta (mm)' },
  'tileCalc.waste': { es: 'Desperdicio (%)', en: 'Waste (%)', pt: 'Desperdício (%)' },

  // Resultado
  'tileCalc.tilesPerM2': { es: 'Locetas / m²', en: 'Tiles / m²', pt: 'Ladrilhos / m²' },
  'tileCalc.totalWithWaste': { es: 'Total (con {wastePct}% desp.)', en: 'Total (with {wastePct}% waste)', pt: 'Total (com {wastePct}% desp.)' },
  'tileCalc.units': { es: '{count} und', en: '{count} pcs', pt: '{count} und' },

  // Footer
  'tileCalc.close': { es: 'Cerrar', en: 'Close', pt: 'Fechar' },
  'tileCalc.save': { es: 'Guardar', en: 'Save', pt: 'Salvar' },

  // Alerta — sin área válida
  'tileCalc.noArea.title': { es: 'Sin área', en: 'No area', pt: 'Sem área' },
  'tileCalc.noArea.msg': { es: 'El trazo no define un área válida. Cierra el contorno primero.', en: 'The path does not define a valid area. Close the outline first.', pt: 'O traçado não define uma área válida. Feche o contorno primeiro.' },

  // Alerta — datos inválidos al agregar loceta
  'tileCalc.invalid.title': { es: 'Datos inválidos', en: 'Invalid data', pt: 'Dados inválidos' },
  'tileCalc.invalid.msg': { es: 'Completa nombre y dimensiones positivas.', en: 'Fill in a name and positive dimensions.', pt: 'Preencha o nome e dimensões positivas.' },

  // Alerta — eliminar loceta personalizada
  'tileCalc.delete.title': { es: 'Eliminar loceta', en: 'Delete tile', pt: 'Excluir ladrilho' },
  'tileCalc.delete.msg': { es: '¿Eliminar "{name}" de tus locetas personalizadas?', en: 'Delete "{name}" from your custom tiles?', pt: 'Excluir "{name}" dos seus ladrilhos personalizados?' },
  'tileCalc.delete.confirm': { es: 'Eliminar', en: 'Delete', pt: 'Excluir' },
};

export default tileCalc;
