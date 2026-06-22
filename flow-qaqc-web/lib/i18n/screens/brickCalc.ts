/**
 * i18n (v46) — Cadenas del componente BrickCalculatorModal (cálculo de ladrillos por muro).
 * Namespace: brickCalc. Solo UI visible al usuario (NO toca DSL/medición/cálculo/AsyncStorage/datos).
 */
const brickCalc: Record<string, { es: string; en: string; pt: string }> = {
  // Encabezado
  'brickCalc.title': { es: 'Cálculo de ladrillos', en: 'Brick calculation', pt: 'Cálculo de tijolos' },

  // Selector de ladrillo
  'brickCalc.brickType': { es: 'Tipo de ladrillo', en: 'Brick type', pt: 'Tipo de tijolo' },
  'brickCalc.addCustom': { es: 'Agregar personalizado', en: 'Add custom', pt: 'Adicionar personalizado' },

  // Tarjeta: nuevo ladrillo personalizado
  'brickCalc.newBrick': { es: 'Nuevo ladrillo', en: 'New brick', pt: 'Novo tijolo' },
  'brickCalc.field.name': { es: 'Nombre', en: 'Name', pt: 'Nome' },
  'brickCalc.field.length': { es: 'L (cm)', en: 'L (cm)', pt: 'C (cm)' },
  'brickCalc.field.width': { es: 'A (cm)', en: 'W (cm)', pt: 'L (cm)' },
  'brickCalc.field.height': { es: 'H (cm)', en: 'H (cm)', pt: 'A (cm)' },
  'brickCalc.cancel': { es: 'Cancelar', en: 'Cancel', pt: 'Cancelar' },
  'brickCalc.add': { es: 'Agregar', en: 'Add', pt: 'Adicionar' },

  // Orientación / colocación del ladrillo
  'brickCalc.placement': { es: 'Colocación del ladrillo', en: 'Brick placement', pt: 'Assentamento do tijolo' },
  'brickCalc.orient.soga.title': { es: 'Soga', en: 'Stretcher', pt: 'Espelho' },
  'brickCalc.orient.soga.sub': { es: 'largo × alto', en: 'length × height', pt: 'comprimento × altura' },
  'brickCalc.orient.cabeza.title': { es: 'Cabeza', en: 'Header', pt: 'Amarração' },
  'brickCalc.orient.cabeza.sub': { es: 'ancho × alto', en: 'width × height', pt: 'largura × altura' },
  'brickCalc.orient.canto.title': { es: 'Canto', en: 'Edge', pt: 'Cutelo' },
  'brickCalc.orient.canto.sub': { es: 'largo × ancho', en: 'length × width', pt: 'comprimento × largura' },

  // Medidas
  'brickCalc.wallHeight': { es: 'Altura pared (m)', en: 'Wall height (m)', pt: 'Altura da parede (m)' },
  'brickCalc.joint': { es: 'Junta (cm)', en: 'Joint (cm)', pt: 'Junta (cm)' },
  'brickCalc.waste': { es: 'Desperdicio (%)', en: 'Waste (%)', pt: 'Desperdício (%)' },

  // Resultado
  'brickCalc.result.wallArea': { es: 'Área muro', en: 'Wall area', pt: 'Área da parede' },
  'brickCalc.result.perM2': { es: 'Ladrillos / m²', en: 'Bricks / m²', pt: 'Tijolos / m²' },
  'brickCalc.result.total': { es: 'Total (con {wastePct}% desp.)', en: 'Total (with {wastePct}% waste)', pt: 'Total (com {wastePct}% desp.)' },
  'brickCalc.result.units': { es: '{count} und', en: '{count} pcs', pt: '{count} und' },

  // Pie (acciones)
  'brickCalc.close': { es: 'Cerrar', en: 'Close', pt: 'Fechar' },
  'brickCalc.save': { es: 'Guardar', en: 'Save', pt: 'Salvar' },

  // Alertas — guardar
  'brickCalc.alert.incompleteTitle': { es: 'Datos incompletos', en: 'Incomplete data', pt: 'Dados incompletos' },
  'brickCalc.alert.incompleteMsg': { es: 'Ingresa una altura válida.', en: 'Enter a valid height.', pt: 'Insira uma altura válida.' },

  // Alertas — agregar ladrillo personalizado
  'brickCalc.alert.invalidTitle': { es: 'Datos inválidos', en: 'Invalid data', pt: 'Dados inválidos' },
  'brickCalc.alert.invalidMsg': { es: 'Completa nombre y dimensiones positivas.', en: 'Complete name and positive dimensions.', pt: 'Preencha o nome e dimensões positivas.' },

  // Alertas — eliminar ladrillo personalizado
  'brickCalc.alert.deleteTitle': { es: 'Eliminar ladrillo', en: 'Delete brick', pt: 'Excluir tijolo' },
  'brickCalc.alert.deleteMsg': { es: '¿Eliminar "{name}" de tus ladrillos personalizados?', en: 'Delete "{name}" from your custom bricks?', pt: 'Excluir "{name}" dos seus tijolos personalizados?' },
  'brickCalc.alert.cancel': { es: 'Cancelar', en: 'Cancel', pt: 'Cancelar' },
  'brickCalc.alert.delete': { es: 'Eliminar', en: 'Delete', pt: 'Excluir' },
};

export default brickCalc;
