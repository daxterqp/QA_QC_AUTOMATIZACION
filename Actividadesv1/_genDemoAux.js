/* Tablas auxiliares del proyecto DEMO (compartidas por Proctor PRD y Cono CAD).
 * Llaves NUMÉRICAS (requisito de BUSCAR).
 */
let XLSX; for (const p of ['xlsx', './node_modules/xlsx', './flow-qaqc-web/node_modules/xlsx']) { try { XLSX = require(p); break; } catch (e) {} }
if (!XLSX) { console.error('NO_XLSX'); process.exit(1); }
const aux = [
  ['tabla-moldes', 'Codigo', 12, 13, 14],
  ['tabla-moldes', 'Peso', 4118.4, 4111.7, 4285.1],
  ['tabla-moldes', 'Volumen', 938.7, 937.4, 940.8],
  ['tabla-taras', 'Codigo', 1, 2, 3, 4, 5, 6],
  ['tabla-taras', 'Peso', 269.9, 268.5, 269.7, 269.8, 270.1, 271.0],
  // Calibración del cono de arena: peso de la arena del cono + densidad de la arena.
  ['tabla-arena_cono', 'Codigo', 28, 29, 31],
  ['tabla-arena_cono', 'PesoCono', 1807, 1813, 1904],
  ['tabla-arena_cono', 'Densidad', 1.551, 1.551, 1.541],
];
const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aux), 'Tablas auxiliares');
XLSX.writeFile(wb, 'Actividadesv1/DEMO_TablasAuxiliares.xlsx');
console.log('OK aux demo');
