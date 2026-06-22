/* Valida PRV5 con el motor real. */
const fs = require('fs'); const ts = require('typescript');
let XLSX; for (const p of ['xlsx', './node_modules/xlsx', './flow-qaqc-web/node_modules/xlsx']) { try { XLSX = require(p); break; } catch (e) {} }
function load(file) { const js = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: 'CommonJS', target: 'ES2019' } }).outputText; const m = { exports: {} }; new Function('exports', 'require', 'module', js)(m.exports, require, m); return m.exports; }
const np = load('src/utils/numericProtocol.ts');
const fe = load('src/utils/formulaEval.ts');
function buildAux(file) {
  const ws = XLSX.readFile(file).Sheets['Tablas auxiliares'];
  const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '' }); const t = {};
  for (const r of aoa) { const key = String(r[0] || '').replace(/^tabla-/, '').trim().toLowerCase(); if (!key) continue; const vals = r.slice(2).filter(v => v !== '' && v != null).map(String); if (!t[key]) t[key] = { columns: [], _c: [] }; t[key].columns.push(String(r[1] || '').trim()); t[key]._c.push(vals); }
  for (const k of Object.keys(t)) { const n = Math.max(...t[k]._c.map(c => c.length)); t[k].rows = []; for (let j = 0; j < n; j++) t[k].rows.push(t[k]._c.map(c => c[j] ?? '')); delete t[k]._c; }
  return t;
}
const auxTables = buildAux('Actividadesv1/PRV5_TablasAuxiliares_v5.xlsx');
const aoa = XLSX.utils.sheet_to_json(XLSX.readFile('Actividadesv1/PRV5_Proctor_v5.xlsx').Sheets['Actividades'], { header: 1, raw: false, defval: '' });
const items = aoa.slice(1).filter(r => (r[4] || '').trim()).map(r => ({ partida_item: String(r[2] || '').trim(), validation_method: String(r[4] || '').trim(), section: (String(r[5] || '').trim() || null) }));
console.log('isNumericProtocol:', np.isNumericProtocol(items), '· items:', items.length);

const IN = {
  '1:A': '13',
  '5:A': '0', '5:B': '40', '5:C': '80', '5:D': '120',
  '6:A': '5911', '6:B': '5956', '6:C': '5979', '6:D': '5963',
  '11:A': '1', '11:B': '2', '11:C': '3', '11:D': '4',
  '12:A': '668.9', '12:B': '685.7', '12:C': '669.8', '12:D': '605.2',
  '13:A': '622.0', '13:B': '626.0', '13:C': '610.2', '13:D': '560.8',
  '22:A': '33', '23:A': '1160.6', '24:A': '1103.7',
  '33:B': '10', '34:B': '20', '35:B': '30', '36:B': '40', '37:B': '50', '38:B': '60',
  '41:A': '17', '44:A': '21.6', '47:A': '340', '48:A': '25',
};
const parsed = items.map(it => ({ item: it, spec: np.parseNumericRow(it.validation_method) }));
const { mainRows, matrices } = np.extractMatrices(parsed);
const cells = [];
for (const { item, spec } of mainRows) {
  if (!spec || spec.kind !== 'row') continue;
  const partida = (item.partida_item || '').trim();
  spec.cells.forEach((c, i) => {
    const key = np.scopeKeyFor(partida, i); const raw = IN[`${partida}:${np.colLetter(i)}`] ?? '';
    if (c.kind === 'manual' || c.kind === 'percent' || c.kind === 'bool' || c.kind === 'free') cells.push({ key, kind: 'manual', raw });
    else if (c.kind === 'list' || c.kind === 'date' || c.kind === 'time' || c.kind === 'equipment' || c.kind === 'text') cells.push({ key, kind: 'list', raw });
    else if (c.kind === 'val') cells.push({ key, kind: 'manual', raw: c.literal ?? '' });
    else if (c.kind === 'lookup') cells.push({ key, kind: 'lookup', refKey: c.refKey, matrixId: c.matrixId, searchCol: c.searchCol, returnCol: c.returnCol });
    else if (c.kind === 'formula') cells.push({ key, kind: 'formula', expr: c.expr });
  });
}
const { scope, textValues, errors } = fe.resolveScopeCells(cells, matrices, undefined, auxTables);
const v = k => scope[k] != null ? scope[k] : (textValues[k] ?? '(vacío)');
const show = (k, l) => console.log('  ' + l.padEnd(34) + k + ' = ' + v(k) + (errors[k] ? '  ⚠ ' + errors[k] : ''));
console.log('\nResultados:');
show('2A', 'Peso molde (BUSCAR)');
['A', 'B', 'C', 'D'].forEach(c => show('7' + c, 'Peso molde fila pto ' + c));
['A', 'B', 'C', 'D'].forEach(c => show('9' + c, 'Densidad húmeda pto ' + c));
['A', 'B', 'C', 'D'].forEach(c => show('18' + c, 'Densidad seca pto ' + c));
show('19A', 'MDS'); show('20A', 'OCH');
show('25A', 'Peso tara (taras2 BUSCAR)'); show('31A', 'Peso seco total'); show('39B', 'Fondo retenido');
show('33E', '% Pasa 9.5mm'); show('39E', '% Pasa Fondo');
show('45A', 'Densidad agua'); show('49A', 'Gst'); show('52A', 'Gs20°C');
const ek = Object.keys(errors);
console.log('\nCeldas con error:', ek.length, ek.length ? ek.map(k => k + ':' + errors[k]).join(' | ') : '(ninguna)');
const secs = np.groupIntoSections(mainRows);
console.log('\nSecciones · maxCols:');
for (const s of secs) console.log('  - ' + String(s.title || '(sin)').padEnd(42) + ' maxCols=' + s.maxCols);
