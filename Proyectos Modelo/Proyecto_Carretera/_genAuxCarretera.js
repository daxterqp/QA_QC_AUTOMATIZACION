/* Tablas auxiliares del Proyecto Carretera (compartidas por Proctor PRM y Cono DCC).
 * capas_pavimento: la LLAVE es la Capa (texto); GCmin y TolHumedad son numéricas
 * (BUSCAR busca por la 1ª columna, exacto por texto, y devuelve la columna numérica).
 * Criterios: Base ≥100% (OCH±1.5); Subbase ≥98% (±2.0); Subrasante ≥95% (±2.0).
 */
let XLSX; for (const p of ['xlsx', './node_modules/xlsx', './flow-qaqc-web/node_modules/xlsx']) { try { XLSX = require(p); break; } catch (e) {} }
if (!XLSX) { console.error('NO_XLSX'); process.exit(1); }
const aux = [
  ['tabla-capas_pavimento', 'Capa', 'Base Granular', 'Subbase Granular', 'Subrasante'],
  ['tabla-capas_pavimento', 'GCmin', 100.0, 98.0, 95.0],
  ['tabla-capas_pavimento', 'TolHumedad', 1.5, 2.0, 2.0],
];
const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aux), 'Tablas auxiliares');
XLSX.writeFile(wb, 'Proyectos Modelo/Proyecto_Carretera/Carretera_TablasAuxiliares.xlsx');
console.log('OK aux carretera (capas_pavimento)');
