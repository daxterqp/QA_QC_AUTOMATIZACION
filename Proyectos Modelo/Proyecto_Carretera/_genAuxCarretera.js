/* Tablas auxiliares del Proyecto Carretera (compartidas por Cono DCC, CBR y GRA).
 * capas_pavimento: LLAVE = Capa (texto). Columnas numéricas de criterios por capa:
 *  - GCmin/TolHumedad  → Cono de Arena (DCC)
 *  - CBRmin/PctDMS/ExpMax → CBR (nivel de compactación para interpolar + mínimos)
 *  - LLmax/IPmax       → Límites de Atterberg (GRA)
 * (BUSCAR busca por la 1ª columna, exacto por texto, y devuelve la columna numérica.)
 * Criterios: Base ≥100% GC / CBR≥80% al 100% DMS / LL≤25 / IP≤6;
 *            Subbase ≥98% / CBR≥30% al 95% / LL≤25 / IP≤6;
 *            Subrasante ≥95% / CBR≥6% al 95% / LL≤35 / IP≤11.
 */
let XLSX; for (const p of ['xlsx', './node_modules/xlsx', './flow-qaqc-web/node_modules/xlsx']) { try { XLSX = require(p); break; } catch (e) {} }
if (!XLSX) { console.error('NO_XLSX'); process.exit(1); }
const aux = [
  ['tabla-capas_pavimento', 'Capa', 'Base Granular', 'Subbase Granular', 'Subrasante'],
  ['tabla-capas_pavimento', 'GCmin', 100.0, 98.0, 95.0],
  ['tabla-capas_pavimento', 'TolHumedad', 1.5, 2.0, 2.0],
  ['tabla-capas_pavimento', 'CBRmin', 80.0, 30.0, 6.0],
  ['tabla-capas_pavimento', 'PctDMS', 100.0, 95.0, 95.0],
  ['tabla-capas_pavimento', 'ExpMax', 0.50, 1.00, 2.00],
  ['tabla-capas_pavimento', 'LLmax', 25.0, 25.0, 35.0],
  ['tabla-capas_pavimento', 'IPmax', 6.0, 6.0, 11.0],
];
const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aux), 'Tablas auxiliares');
XLSX.writeFile(wb, 'Proyectos Modelo/Proyecto_Carretera/Carretera_TablasAuxiliares.xlsx');
console.log('OK aux carretera (capas_pavimento: GC/Tol/CBR/PctDMS/Exp/LL/IP)');
