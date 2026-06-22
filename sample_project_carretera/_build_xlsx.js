/**
 * Generador de 5_trazabilidad.xlsx — combina los CSVs como 5 hojas.
 * Uso: node sample_project_carretera/_build_xlsx.js
 *
 * Mapeo CSV → hoja del .xlsx (los nombres deben coincidir EXACTO con los
 * que espera parseTraceabilityExcel: 'Equipos', 'Actividades',
 * 'Equipo-Actividad', 'Turnos', 'Plantillas Formulario').
 */
const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

const dir = __dirname;

function parseCsv(filePath) {
  let text = fs.readFileSync(filePath, 'utf8');
  // Strip UTF-8 BOM
  if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
  const lines = text.split(/\r?\n/).filter(l => l.length > 0);
  return lines.map(line => {
    // Simple split por coma (los CSVs no usan comillas porque no tienen comas
    // dentro de campos — los valores con tildes/diacríticos pasan tal cual).
    return line.split(',');
  });
}

const sheets = [
  { name: 'Equipos',                csv: '2_equipos.csv' },
  { name: 'Actividades',            csv: '5a_actividades.csv' },
  { name: 'Equipo-Actividad',       csv: '5b_equipo_actividad.csv' },
  { name: 'Turnos',                 csv: '5c_turnos.csv' },
  { name: 'Plantillas Formulario',  csv: '5d_plantillas_formulario.csv' },
];

const wb = XLSX.utils.book_new();
for (const s of sheets) {
  const fp = path.join(dir, s.csv);
  if (!fs.existsSync(fp)) {
    console.error(`CSV no encontrado: ${fp}`);
    process.exit(1);
  }
  const rows = parseCsv(fp);
  const ws = XLSX.utils.aoa_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, s.name);
}

const out = path.join(dir, '5_trazabilidad.xlsx');
XLSX.writeFile(wb, out);
console.log(`✓ Generado ${out} con ${sheets.length} hojas`);
