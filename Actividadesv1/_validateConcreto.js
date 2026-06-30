/* Valida CCD (Concreto compresión demo) con el motor real. */
const fs = require('fs'); const ts = require('typescript');
let XLSX; for (const p of ['xlsx', './node_modules/xlsx', './flow-qaqc-web/node_modules/xlsx']) { try { XLSX = require(p); break; } catch (e) {} }
function load(file) { const js = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: 'CommonJS', target: 'ES2019' } }).outputText; const m = { exports: {} }; new Function('exports', 'require', 'module', js)(m.exports, require, m); return m.exports; }
const np = load('src/utils/numericProtocol.ts');
const fe = load('src/utils/formulaEval.ts');

const aoa = XLSX.utils.sheet_to_json(XLSX.readFile('Actividadesv1/CCD_Concreto_Demo.xlsx').Sheets['Actividades'], { header: 1, raw: false, defval: '' });
const items = aoa.slice(1).filter(r => (r[4] || '').trim()).map(r => ({ partida_item: String(r[2] || '').trim(), validation_method: String(r[4] || '').trim(), section: (String(r[5] || '').trim() || null) }));
console.log('isNumericProtocol:', np.isNumericProtocol(items), '· items:', items.length);

const IN = {
  '4:A': '28', '5:A': '280',
  '6:A': '15.00', '7:A': '15.10', '9:A': '30.00', '10:A': '12.5',
  '14:A': '50000',
  // Curva esfuerzo-deformación (carga A, acortamiento B)
  '19:A': '10000', '19:B': '0.10', '20:A': '20000', '20:B': '0.25', '21:A': '30000', '21:B': '0.45',
  '22:A': '40000', '22:B': '0.75', '23:A': '48000', '23:B': '1.10', '24:A': '50000', '24:B': '1.60',
  // Ganancia de resistencia (edad A, f'c B)
  '27:A': '3', '27:B': '120', '28:A': '7', '28:B': '200', '29:A': '14', '29:B': '250',
  '30:A': '21', '30:B': '270', '31:A': '28', '31:B': '281',
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
    else if (c.kind === 'formula') cells.push({ key, kind: 'formula', expr: c.expr });
  });
}
const { scope, textValues, errors } = fe.resolveScopeCells(cells, matrices, undefined, {});
const v = k => scope[k] != null ? scope[k] : (textValues[k] ?? '(vacío)');
console.log('\nResultados:');
console.log('  Diámetro promedio (8A) =', v('8A'));
console.log('  Área (11A) =', v('11A'));
console.log('  Volumen (12A) =', v('12A'));
console.log('  Peso unitario (13A) =', v('13A'));
console.log("  f'c (15A) =", v('15A'));
console.log('  % diseño (16A) =', v('16A'));
console.log('  Esfuerzo lectura6 (24C) =', v('24C'), ' Def.unit (24D) =', v('24D'));
const ek = Object.keys(errors);
console.log('\nCeldas con error:', ek.length, ek.length ? ek.map(k => k + ':' + errors[k]).join(' | ') : '(ninguna) ✅');
const secs = np.groupIntoSections(mainRows);
console.log('\nSecciones · maxCols:');
for (const s of secs) console.log('  - ' + String(s.title || '(sin)').padEnd(36) + ' maxCols=' + s.maxCols);
