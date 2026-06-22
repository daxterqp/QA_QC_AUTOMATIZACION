/**
 * i18n (v46) — Cadenas de la pantalla MeasurementScreen (modo medición sobre planos PDF).
 * Namespace: measurement. Solo UI visible al usuario (NO toca DSL/medición/canvas/AsyncStorage/datos).
 */
const measurement: Record<string, { es: string; en: string; pt: string }> = {
  // Header
  'measurement.header.title': { es: 'Modo Medición', en: 'Measurement Mode', pt: 'Modo de Medição' },

  // Estados de carga / error
  'measurement.loading': { es: 'Cargando plano...', en: 'Loading drawing...', pt: 'Carregando planta...' },
  'measurement.loadError': { es: 'No se pudo cargar el plano.', en: 'Could not load the drawing.', pt: 'Não foi possível carregar a planta.' },
  'measurement.error.noFile': { es: 'Sin archivo', en: 'No file', pt: 'Sem arquivo' },
  'measurement.error.fileNotFound': { es: 'Archivo no encontrado', en: 'File not found', pt: 'Arquivo não encontrado' },

  // Carrusel informativo del elemento seleccionado
  'measurement.info.measure': { es: 'Medición', en: 'Measurement', pt: 'Medição' },
  'measurement.info.reference': { es: 'Referencia', en: 'Reference', pt: 'Referência' },
  'measurement.info.area': { es: 'Área', en: 'Area', pt: 'Área' },
  'measurement.info.perimeter': { es: 'Perímetro', en: 'Perimeter', pt: 'Perímetro' },
  'measurement.info.path': { es: 'Trazo', en: 'Path', pt: 'Traçado' },
  'measurement.info.bricks': { es: 'Ladrillos', en: 'Bricks', pt: 'Tijolos' },
  'measurement.info.volume': { es: 'Volumen', en: 'Volume', pt: 'Volume' },
  'measurement.info.tiles': { es: 'Locetas', en: 'Tiles', pt: 'Ladrilhos' },
  'measurement.info.units': { es: '{count} und', en: '{count} pcs', pt: '{count} und' },

  // Barra de herramientas (etiquetas)
  'measurement.tool.pan': { es: 'Mover', en: 'Move', pt: 'Mover' },
  'measurement.tool.calibrate': { es: 'Calib.', en: 'Calib.', pt: 'Calib.' },
  'measurement.tool.measure': { es: 'Medir', en: 'Measure', pt: 'Medir' },
  'measurement.tool.path': { es: 'Trazo', en: 'Path', pt: 'Traçado' },
  'measurement.tool.sketch': { es: 'Dibujar', en: 'Draw', pt: 'Desenhar' },
  'measurement.tool.area': { es: 'Área', en: 'Area', pt: 'Área' },
  'measurement.tool.angles': { es: 'Áng.', en: 'Ang.', pt: 'Âng.' },

  // Calibración (entrada de medida real)
  'measurement.cal.realMeasure': { es: 'Medida real:', en: 'Real measurement:', pt: 'Medida real:' },
  'measurement.cal.placeholder': { es: '0.00', en: '0.00', pt: '0.00' },

  // Acciones de polilínea flotantes
  'measurement.polyline.back': { es: 'Atrás', en: 'Back', pt: 'Voltar' },
  'measurement.polyline.done': { es: 'Listo', en: 'Done', pt: 'Pronto' },

  // Barra de instrucciones (por herramienta)
  'measurement.instr.pan': { es: '✋ Arrastra para mover · Pellizca para zoom', en: '✋ Drag to move · Pinch to zoom', pt: '✋ Arraste para mover · Pinça para zoom' },
  'measurement.instr.calibrate': { es: '📏 Arrastra una línea sobre una medida conocida', en: '📏 Drag a line over a known measurement', pt: '📏 Arraste uma linha sobre uma medida conhecida' },
  'measurement.instr.measure': { es: '📐 Arrastra para medir · Toca un segmento para editar', en: '📐 Drag to measure · Tap a segment to edit', pt: '📐 Arraste para medir · Toque em um segmento para editar' },
  'measurement.instr.polyline': { es: '📐 Toca para agregar puntos', en: '📐 Tap to add points', pt: '📐 Toque para adicionar pontos' },
  'measurement.instr.sketch': { es: '✏️ Dibuja con el dedo · Se simplifica al soltar', en: '✏️ Draw with your finger · Simplified on release', pt: '✏️ Desenhe com o dedo · Simplifica ao soltar' },

  // Etiquetas de cálculos recientes (abreviaturas)
  'measurement.recent.bricks': { es: '{count} lad.', en: '{count} brk', pt: '{count} tij.' },
  'measurement.recent.tiles': { es: '{count} loc.', en: '{count} tile', pt: '{count} lad.' },

  // Alertas — exportar / imprimir PDF
  'measurement.print.shareTitle': { es: 'Exportar plano', en: 'Export drawing', pt: 'Exportar planta' },
  'measurement.print.generatedTitle': { es: 'PDF generado', en: 'PDF generated', pt: 'PDF gerado' },
  'measurement.print.errorTitle': { es: 'Error al imprimir', en: 'Print error', pt: 'Erro ao imprimir' },
  'measurement.print.errorMsg': { es: 'No se pudo crear el PDF', en: 'Could not create the PDF', pt: 'Não foi possível criar o PDF' },
  'measurement.export.errorTitle': { es: 'Error al exportar', en: 'Export error', pt: 'Erro ao exportar' },
  'measurement.export.errorMsg': { es: 'No se pudo generar la imagen.', en: 'Could not generate the image.', pt: 'Não foi possível gerar a imagem.' },

  // Alertas — eliminar nodo / trazo
  'measurement.deleteNode.cannotTitle': { es: 'No se puede eliminar', en: 'Cannot delete', pt: 'Não é possível excluir' },
  'measurement.deleteNode.cannotMsg': { es: 'Un trazo necesita al menos 2 vértices. No se puede eliminar este nodo.', en: 'A path needs at least 2 vertices. This node cannot be deleted.', pt: 'Um traçado precisa de pelo menos 2 vértices. Este nó não pode ser excluído.' },
  'measurement.deleteNode.title': { es: 'Eliminar nodo', en: 'Delete node', pt: 'Excluir nó' },
  'measurement.deleteNode.msg': { es: '¿Deseas eliminar este nodo del trazo?', en: 'Do you want to delete this node from the path?', pt: 'Deseja excluir este nó do traçado?' },
  'measurement.deletePath.title': { es: 'Eliminar trazo', en: 'Delete path', pt: 'Excluir traçado' },
  'measurement.deletePath.msg': { es: '¿Estás seguro de que deseas eliminar este trazo?', en: 'Are you sure you want to delete this path?', pt: 'Tem certeza de que deseja excluir este traçado?' },

  // Botones comunes (Alert)
  'measurement.common.cancel': { es: 'Cancelar', en: 'Cancel', pt: 'Cancelar' },
  'measurement.common.delete': { es: 'Eliminar', en: 'Delete', pt: 'Excluir' },

  // Alertas — calibración requerida / valor inválido
  'measurement.noCal.title': { es: 'Sin calibración', en: 'Not calibrated', pt: 'Sem calibração' },
  'measurement.noCal.msg': { es: 'Primero calibra con una medida de referencia.', en: 'First calibrate with a reference measurement.', pt: 'Primeiro calibre com uma medida de referência.' },
  'measurement.invalid.title': { es: 'Valor inválido', en: 'Invalid value', pt: 'Valor inválido' },
  'measurement.invalid.msg': { es: 'Ingresa una medida real positiva.', en: 'Enter a positive real measurement.', pt: 'Insira uma medida real positiva.' },

  // Alertas — FABs de cálculo (selección requerida)
  'measurement.selectFirst.title': { es: 'Selecciona un trazo o área', en: 'Select a path or area', pt: 'Selecione um traçado ou área' },
  'measurement.selectFirst.bricks': { es: 'Primero toca un trazo o área en el plano para calcular ladrillos.', en: 'First tap a path or area on the drawing to calculate bricks.', pt: 'Primeiro toque em um traçado ou área na planta para calcular tijolos.' },
  'measurement.selectFirst.volume': { es: 'Primero toca un trazo o área en el plano para calcular el volumen.', en: 'First tap a path or area on the drawing to calculate the volume.', pt: 'Primeiro toque em um traçado ou área na planta para calcular o volume.' },
  'measurement.selectFirst.tiles': { es: 'Primero toca un trazo o área en el plano para calcular locetas.', en: 'First tap a path or area on the drawing to calculate tiles.', pt: 'Primeiro toque em um traçado ou área na planta para calcular ladrilhos.' },
};

export default measurement;
