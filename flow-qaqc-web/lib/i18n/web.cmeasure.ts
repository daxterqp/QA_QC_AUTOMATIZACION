/**
 * i18n (web, v46.1) — Cadenas EXCLUSIVAS de la web para los modales de medición/cálculo
 * (BrickCalculatorModal, TileCalculatorModal, VolumeCalculatorModal, FloatingCalculator).
 * Se fusionan en `index.tsx` (ALL_STRINGS). Namespace `webCMeasure.*`.
 * NOTA: las claves de cálculo de ladrillos/locetas ya existen en el catálogo espejo
 * (brickCalc.*, tileCalc.*, measurement.*, common.*) y se REUTILIZAN desde los .tsx.
 */
export const STRINGS_WEB_CMEASURE: Record<string, { es: string; en: string; pt: string }> = {
  // ── BrickCalculatorModal ──
  'webCMeasure.brick.title': { es: '🧱 Cálculo de ladrillos', en: '🧱 Brick calculation', pt: '🧱 Cálculo de tijolos' },
  'webCMeasure.brick.label': { es: 'Ladrillo', en: 'Brick', pt: 'Tijolo' },
  'webCMeasure.brick.addCustomOption': { es: '+ Agregar personalizado…', en: '+ Add custom…', pt: '+ Adicionar personalizado…' },
  'webCMeasure.brick.newCustom': { es: 'Nuevo ladrillo personalizado', en: 'New custom brick', pt: 'Novo tijolo personalizado' },
  'webCMeasure.orientation': { es: 'Orientación', en: 'Orientation', pt: 'Orientação' },
  'webCMeasure.brick.wallHeight': { es: 'Altura del muro (m)', en: 'Wall height (m)', pt: 'Altura da parede (m)' },
  'webCMeasure.brick.resultWallArea': { es: 'Área de muro:', en: 'Wall area:', pt: 'Área da parede:' },
  'webCMeasure.brick.resultPerM2': { es: 'Ladrillos por m²:', en: 'Bricks per m²:', pt: 'Tijolos por m²:' },
  'webCMeasure.brick.resultTotal': { es: '{count} ladrillos', en: '{count} bricks', pt: '{count} tijolos' },

  // Etiquetas de orientación (botones soga/cabeza/canto)
  'webCMeasure.orient.soga': { es: 'soga', en: 'stretcher', pt: 'espelho' },
  'webCMeasure.orient.cabeza': { es: 'cabeza', en: 'header', pt: 'amarração' },
  'webCMeasure.orient.canto': { es: 'canto', en: 'edge', pt: 'cutelo' },

  // Placeholders de dimensiones (compartidos por ladrillo/loseta)
  'webCMeasure.placeholder.name': { es: 'Nombre', en: 'Name', pt: 'Nome' },
  'webCMeasure.placeholder.lengthCm': { es: 'Largo cm', en: 'Length cm', pt: 'Comprimento cm' },
  'webCMeasure.placeholder.widthCm': { es: 'Ancho cm', en: 'Width cm', pt: 'Largura cm' },
  'webCMeasure.placeholder.heightCm': { es: 'Alto cm', en: 'Height cm', pt: 'Altura cm' },

  // ── TileCalculatorModal ──
  'webCMeasure.tile.title': { es: '🔲 Cálculo de losetas / cerámicos', en: '🔲 Tile / ceramic calculation', pt: '🔲 Cálculo de pisos / cerâmicos' },
  'webCMeasure.tile.label': { es: 'Tipo de loseta', en: 'Tile type', pt: 'Tipo de piso' },
  'webCMeasure.tile.addCustomOption': { es: '+ Agregar personalizada…', en: '+ Add custom…', pt: '+ Adicionar personalizado…' },
  'webCMeasure.tile.newCustom': { es: 'Nueva loseta personalizada', en: 'New custom tile', pt: 'Novo piso personalizado' },
  'webCMeasure.tile.resultArea': { es: 'Área:', en: 'Area:', pt: 'Área:' },
  'webCMeasure.tile.resultPerM2': { es: 'Por m²:', en: 'Per m²:', pt: 'Por m²:' },
  'webCMeasure.tile.resultTotal': { es: '{count} piezas', en: '{count} pieces', pt: '{count} peças' },

  // ── VolumeCalculatorModal ──
  'webCMeasure.volume.title': { es: '📦 Cálculo de volumen', en: '📦 Volume calculation', pt: '📦 Cálculo de volume' },
  'webCMeasure.volume.descPolygon': { es: 'Volumen = área × altura. Útil para losas, zapatas, falsos techos.', en: 'Volume = area × height. Useful for slabs, footings, drop ceilings.', pt: 'Volume = área × altura. Útil para lajes, sapatas, forros falsos.' },
  'webCMeasure.volume.descPolyline': { es: 'Volumen = perímetro × altura × espesor. Útil para sobrecimientos y muros de concreto.', en: 'Volume = perimeter × height × thickness. Useful for grade beams and concrete walls.', pt: 'Volume = perímetro × altura × espessura. Útil para baldrames e muros de concreto.' },
  'webCMeasure.volume.height': { es: 'Altura (m)', en: 'Height (m)', pt: 'Altura (m)' },
  'webCMeasure.volume.thickness': { es: 'Espesor (m)', en: 'Thickness (m)', pt: 'Espessura (m)' },
  'webCMeasure.volume.resultArea': { es: 'Área:', en: 'Area:', pt: 'Área:' },
  'webCMeasure.volume.resultPerimeter': { es: 'Perímetro:', en: 'Perimeter:', pt: 'Perímetro:' },

  // ── FloatingCalculator ──
  'webCMeasure.calc.title': { es: 'Calculadora', en: 'Calculator', pt: 'Calculadora' },
  'webCMeasure.calc.error': { es: 'Error', en: 'Error', pt: 'Erro' },

  // Resultado (encabezado de tarjeta, compartido)
  'webCMeasure.result': { es: 'Resultado', en: 'Result', pt: 'Resultado' },
};
