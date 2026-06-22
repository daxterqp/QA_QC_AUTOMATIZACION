/**
 * i18n — Cadenas de GPSCaptureBar (barra de captura de coordenadas + sector).
 * Namespace: gpsBar. Solo UI visible al usuario (NO toca enum/DSL/datos/AsyncStorage).
 */
const gpsBar: Record<string, { es: string; en: string; pt: string }> = {
  // Alert — coordenada fuera de sector
  'gpsBar.outOfArea.title': { es: 'Fuera del área de trabajo', en: 'Outside the work area', pt: 'Fora da área de trabalho' },
  'gpsBar.outOfArea.measured': { es: 'La coordenada medida no cae dentro de ningún sector con polígono definido. Puedes elegir un sector manualmente desde el dropdown.', en: 'The measured coordinate does not fall within any sector with a defined polygon. You can choose a sector manually from the dropdown.', pt: 'A coordenada medida não cai dentro de nenhum setor com polígono definido. Você pode escolher um setor manualmente no menu suspenso.' },
  'gpsBar.outOfArea.entered': { es: 'La coordenada ingresada no cae dentro de ningún sector con polígono definido. Puedes elegir un sector manualmente desde el dropdown.', en: 'The entered coordinate does not fall within any sector with a defined polygon. You can choose a sector manually from the dropdown.', pt: 'A coordenada inserida não cai dentro de nenhum setor com polígono definido. Você pode escolher um setor manualmente no menu suspenso.' },

  // Alert — confirmar cambio manual de sector
  'gpsBar.changeSector.title': { es: '¿Cambiar sector manualmente?', en: 'Change sector manually?', pt: 'Alterar setor manualmente?' },
  'gpsBar.changeSector.message': { es: 'El sector actual fue inferido automáticamente del GPS. Si lo cambias, se marcará como asignación manual.', en: 'The current sector was inferred automatically from the GPS. If you change it, it will be marked as a manual assignment.', pt: 'O setor atual foi inferido automaticamente do GPS. Se você o alterar, ele será marcado como atribuição manual.' },
  'gpsBar.changeSector.cancel': { es: 'Cancelar', en: 'Cancel', pt: 'Cancelar' },
  'gpsBar.changeSector.continue': { es: 'Continuar', en: 'Continue', pt: 'Continuar' },

  // Coordenadas / precisión
  'gpsBar.noCoords': { es: 'Sin coordenadas', en: 'No coordinates', pt: 'Sem coordenadas' },
  'gpsBar.samplesSuffix': { es: ' · {count} muestras', en: ' · {count} samples', pt: ' · {count} amostras' },

  // Datum / sistema de coordenadas
  'gpsBar.datum.wgs84LatLng': { es: 'Latitud, Longitud · WGS84', en: 'Latitude, Longitude · WGS84', pt: 'Latitude, Longitude · WGS84' },
  'gpsBar.datum.wgs84Utm': { es: 'Este, Norte (UTM) · WGS84', en: 'Easting, Northing (UTM) · WGS84', pt: 'Este, Norte (UTM) · WGS84' },
  'gpsBar.datum.psad56LatLng': { es: 'Latitud, Longitud · PSAD56', en: 'Latitude, Longitude · PSAD56', pt: 'Latitude, Longitude · PSAD56' },
  'gpsBar.datum.psad56Utm': { es: 'Este, Norte (UTM) · PSAD56', en: 'Easting, Northing (UTM) · PSAD56', pt: 'Este, Norte (UTM) · PSAD56' },

  // Título y botones
  'gpsBar.title': { es: 'Coordenadas', en: 'Coordinates', pt: 'Coordenadas' },
  'gpsBar.btn.recapture': { es: 'Recapturar', en: 'Recapture', pt: 'Recapturar' },
  'gpsBar.btn.measure': { es: 'Medir', en: 'Measure', pt: 'Medir' },
  'gpsBar.btn.manual': { es: 'Manual', en: 'Manual', pt: 'Manual' },

  // Sector
  'gpsBar.sector.label': { es: 'Sector: {name}', en: 'Sector: {name}', pt: 'Setor: {name}' },
  'gpsBar.sector.none': { es: '— Sin sector —', en: '— No sector —', pt: '— Sem setor —' },
  'gpsBar.sector.pickerTitle': { es: 'Seleccionar sector', en: 'Select sector', pt: 'Selecionar setor' },
  'gpsBar.sector.nameOnly': { es: 'solo nombre', en: 'name only', pt: 'apenas nome' },
  'gpsBar.sector.empty': { es: 'No hay sectores definidos en este proyecto.', en: 'There are no sectors defined in this project.', pt: 'Não há setores definidos neste projeto.' },
};

export default gpsBar;
