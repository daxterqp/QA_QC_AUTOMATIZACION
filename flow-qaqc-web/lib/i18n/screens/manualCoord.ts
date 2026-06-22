/**
 * i18n (v46) — Cadenas del ManualCoordModal (ingreso manual de coordenadas).
 * Namespace: manualCoord. Solo UI visible al usuario (NO toca conversión/validación/datos).
 */
const manualCoord: Record<string, { es: string; en: string; pt: string }> = {
  // Encabezado
  'manualCoord.title': { es: 'Ingresar coordenadas manualmente', en: 'Enter coordinates manually', pt: 'Inserir coordenadas manualmente' },
  'manualCoord.help': { es: 'Anota la medida tomada con tu GPS. Elige el sistema en que está.', en: 'Record the measurement taken with your GPS. Choose the system it is in.', pt: 'Anote a medida feita com seu GPS. Escolha o sistema em que ela está.' },

  // Etiquetas de campos
  'manualCoord.label.system': { es: 'Sistema de coordenadas', en: 'Coordinate system', pt: 'Sistema de coordenadas' },
  'manualCoord.label.utmZone': { es: 'Zona UTM', en: 'UTM zone', pt: 'Zona UTM' },
  'manualCoord.label.hemisphere': { es: 'Hemisferio', en: 'Hemisphere', pt: 'Hemisfério' },
  'manualCoord.label.accuracy': { es: 'Precisión declarada (m) — opcional', en: 'Declared accuracy (m) — optional', pt: 'Precisão declarada (m) — opcional' },

  // Etiquetas de coordenadas (lat/lng vs UTM)
  'manualCoord.coord.north': { es: 'Norte (Y)', en: 'Northing (Y)', pt: 'Norte (Y)' },
  'manualCoord.coord.east': { es: 'Este (X)', en: 'Easting (X)', pt: 'Leste (X)' },
  'manualCoord.coord.latitude': { es: 'Latitud', en: 'Latitude', pt: 'Latitude' },
  'manualCoord.coord.longitude': { es: 'Longitud', en: 'Longitude', pt: 'Longitude' },

  // Hemisferio
  'manualCoord.hemisphere.south': { es: 'Sur', en: 'South', pt: 'Sul' },
  'manualCoord.hemisphere.north': { es: 'Norte', en: 'North', pt: 'Norte' },

  // Placeholder de precisión
  'manualCoord.accuracy.placeholder': { es: 'ej. 3', en: 'e.g. 3', pt: 'ex. 3' },

  // Botones
  'manualCoord.btn.cancel': { es: 'Cancelar', en: 'Cancel', pt: 'Cancelar' },
  'manualCoord.btn.save': { es: 'Guardar coordenadas', en: 'Save coordinates', pt: 'Salvar coordenadas' },

  // Errores de validación / conversión
  'manualCoord.error.invalidNumbers': { es: 'Ingresa coordenadas numéricas válidas.', en: 'Enter valid numeric coordinates.', pt: 'Insira coordenadas numéricas válidas.' },
  'manualCoord.error.invalidZone': { es: 'Zona UTM inválida (1–60).', en: 'Invalid UTM zone (1–60).', pt: 'Zona UTM inválida (1–60).' },
  'manualCoord.error.convertFailed': { es: 'No se pudo convertir: {detail}', en: 'Could not convert: {detail}', pt: 'Não foi possível converter: {detail}' },
  'manualCoord.error.outOfRange': { es: 'Las coordenadas resultantes están fuera de rango.', en: 'The resulting coordinates are out of range.', pt: 'As coordenadas resultantes estão fora do intervalo.' },
};

export default manualCoord;
