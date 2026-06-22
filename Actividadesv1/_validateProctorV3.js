/* Valida PRV3: parsea la hoja Actividades, arma el scope con datos de prueba +
 * tablas auxiliares, y evalúa con el motor REAL (transpilado con typescript). */
const fs = require('fs');
const ts = require('typescript');
let XLSX; for (const p of ['xlsx', './node_modules/xlsx', './flow-qaqc-web/node_modules/xlsx']) { try { XLSX = require(p); break; } catch (e) {} }

function load(file) {
  const src = fs.readFileSync(file, 'utf8');
  const js = ts.transpileModule(src, { compilerOptions: { module: 'CommonJS', target: 'ES2019' } }).outputText;
  const m = { exports: {} };
  new Function('exports', 'require', 'module', js)(m.exports, require, m);
  return m.exports;
}
const np = load('src/utils/numericProtocol.ts');
const fe = load('src/utils/formulaEval.ts');

// ── auxTables desde la hoja "Tablas auxiliares" (transpone formato col-por-fila) ──
function buildAux(file) {
  const wb = XLSX.readFile(file);
  const ws = wb.Sheets['Tablas auxiliares'];
  const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '' });
  const tables = {};
  for (const r of aoa) {
    const key = String(r[0] || '').replace(/^tabla-/, '').trim().toLowerCase();
    if (!key) continue;
    const colName = String(r[1] || '').trim();
    const vals = r.slice(2).filter(v => v !== '' && v != null).map(v => String(v));
    if (!tables[key]) tables[key] = { columns: [], _cols: [] };
    tables[key].columns.push(colName);
    tables[key]._cols.push(vals);
  }
  for (const k of Object.keys(tables)) {
    const t = tables[k]; const n = Math.max(...t._cols.map(c => c.length));
    t.rows = []; for (let j = 0; j < n; j++) t.rows.push(t._cols.map(c => c[j] ?? ''));
    delete t._cols;
  }
  return tables;
}
const auxTables = buildAux('Actividadesv1/PRV3_TablasAuxiliares_v3.xlsx');

// ── items de la hoja Actividades ──────────────────────────────────────────────
const wb = XLSX.readFile('Actividadesv1/PRV3_Proctor_v3.xlsx');
const aoa = XLSX.utils.sheet_to_json(wb.Sheets['Actividades'], { header: 1, raw: false, defval: '' });
const items = aoa.slice(1).filter(r => (r[4] || '').trim()).map(r => ({ partida_item: String(r[2] || '').trim(), validation_method: String(r[4] || '').trim() }));

console.log('isNumericProtocol:', np.isNumericProtocol(items));

// ── datos de prueba (raw por "partida:colLetter") ─────────────────────────────
const IN = {
  '1:A': '13',
  '4:A': '0', '4:B': '5900', '4:E': '1', '4:F': '153.2', '4:G': '145.2',
  '5:A': '40', '5:B': '6050', '5:E': '2', '5:F': '157.1', '5:G': '146.1',
  '6:A': '80', '6:B': '6120', '6:E': '3', '6:F': '158.8', '6:G': '144.8',
  '7:A': '120', '7:B': '6100', '7:E': '4', '7:F': '162.9', '7:G': '145.9',
  '11:A': '5', '12:A': '547', '13:A': '520',
  '19:B': '20', '20:B': '50', '21:B': '80', '22:B': '120', '23:B': '150',
  '26:A': '1', '29:A': '21.6', '32:A': '430', '33:A': '25',
};

// ── construir scopeCells como lo hace la app ──────────────────────────────────
const parsed = items.map(it => ({ item: it, spec: np.parseNumericRow(it.validation_method) }));
const { mainRows, matrices } = np.extractMatrices(parsed);
const cells = [];
for (const { item, spec } of mainRows) {
  if (!spec || spec.kind !== 'row') continue;
  const partida = (item.partida_item || '').trim();
  spec.cells.forEach((c, i) => {
    const key = np.scopeKeyFor(partida, i);
    const raw = IN[`${partida}:${np.colLetter(i)}`] ?? '';
    if (c.kind === 'manual' || c.kind === 'percent' || c.kind === 'bool' || c.kind === 'free') cells.push({ key, kind: 'manual', raw });
    else if (c.kind === 'list' || c.kind === 'date' || c.kind === 'time' || c.kind === 'equipment' || c.kind === 'text') cells.push({ key, kind: 'list', raw });
    else if (c.kind === 'val') cells.push({ key, kind: 'manual', raw: c.literal ?? '' });
    else if (c.kind === 'lookup') cells.push({ key, kind: 'lookup', refKey: c.refKey, matrixId: c.matrixId, searchCol: c.searchCol, returnCol: c.returnCol });
    else if (c.kind === 'formula') cells.push({ key, kind: 'formula', expr: c.expr });
  });
}

const { scope, textValues, errors } = fe.resolveScopeCells(cells, matrices, undefined, auxTables);

const show = (k, label) => console.log(`  ${label.padEnd(34)} ${k} =`, scope[k] != null ? scope[k] : (textValues[k] ?? '(vacío)'), errors[k] ? `  ⚠ ${errors[k]}` : '');
console.log('\nResultados calculados:');
show('2A', 'Peso molde (BUSCAR)');
show('3A', 'Volumen molde (BUSCAR)');
show('4L', 'Densidad seca punto 1');
show('5L', 'Densidad seca punto 2');
show('6L', 'Densidad seca punto 3');
show('7L', 'Densidad seca punto 4');
show('8A', 'MDS (PUNTOMAXIMOY g3)');
show('9A', 'OCH (PUNTOMAXIMOX g3)');
show('18A', 'Peso seco total granul.');
show('24B', 'Fondo retenido (residual)');
show('19E', '% Pasa 9.5mm');
show('24E', '% Pasa Fondo');
show('30A', 'Densidad agua (BUSCAR)');
show('34A', 'Gs a T° (Gst)');
show('37A', 'Gs a 20°C (Gs20)');

const errKeys = Object.keys(errors);
console.log('\nCeldas con error:', errKeys.length, errKeys.length ? errKeys.map(k => `${k}:${errors[k]}`).join(' | ') : '(ninguna)');
