/* Valida GRA (Granulometría+Atterberg) y CBR con el MOTOR REAL usando los :ej[] como
 * inputs. El CBR inyecta la DMS del Proctor (part 3 = xref get). Correr desde la raíz:
 *   node "Proyectos Modelo/Proyecto_Carretera/_validateGranCbr.js"
 */
const fs = require('fs'); const ts = require('typescript');
let XLSX; for (const p of ['xlsx', './node_modules/xlsx', './flow-qaqc-web/node_modules/xlsx']) { try { XLSX = require(p); break; } catch (e) {} }
function load(file) { const js = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: 'CommonJS', target: 'ES2019' } }).outputText; const m = { exports: {} }; new Function('exports', 'require', 'module', js)(m.exports, require, m); return m.exports; }
const np = load('src/utils/numericProtocol.ts');
const fe = load('src/utils/formulaEval.ts');
const DIR = 'Proyectos Modelo/Proyecto_Carretera/';
function buildAux(file) {
  const ws = XLSX.readFile(file).Sheets['Tablas auxiliares'];
  const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '' }); const t = {};
  for (const r of aoa) { const key = String(r[0] || '').replace(/^tabla-/, '').trim().toLowerCase(); if (!key) continue; const vals = r.slice(2).filter(v => v !== '' && v != null).map(String); if (!t[key]) t[key] = { columns: [], _c: [] }; t[key].columns.push(String(r[1] || '').trim()); t[key]._c.push(vals); }
  for (const k of Object.keys(t)) { const n = Math.max(...t[k]._c.map(c => c.length)); t[k].rows = []; for (let j = 0; j < n; j++) t[k].rows.push(t[k]._c.map(c => c[j] ?? '')); delete t[k]._c; }
  return t;
}
const auxTables = buildAux(DIR + 'Carretera_TablasAuxiliares.xlsx');

function runFromSamples(label, file, injectXref = {}) {
  const aoa = XLSX.utils.sheet_to_json(XLSX.readFile(file).Sheets['Actividades'], { header: 1, raw: false, defval: '' });
  const items = aoa.slice(1).filter(r => (r[4] || '').trim()).map(r => ({ partida_item: String(r[2] || '').trim(), validation_method: String(r[4] || '').trim(), section: (String(r[5] || '').trim() || null) }));
  console.log(`\n===== ${label} =====`);
  console.log('isNumericProtocol:', np.isNumericProtocol(items), '· items:', items.length);
  const parsed = items.map(it => ({ item: it, spec: np.parseNumericRow(it.validation_method) }));
  const { mainRows, matrices } = np.extractMatrices(parsed);
  const cells = []; let nSamples = 0, nXref = 0;
  for (const { item, spec } of mainRows) {
    if (!spec || spec.kind !== 'row') continue;
    const partida = (item.partida_item || '').trim();
    spec.cells.forEach((c, i) => {
      const key = np.scopeKeyFor(partida, i);
      if (c.sample != null) nSamples++;
      if (c.kind === 'manual' || c.kind === 'percent' || c.kind === 'bool' || c.kind === 'free') cells.push({ key, kind: 'manual', raw: c.sample ?? '' });
      else if (c.kind === 'list' || c.kind === 'date' || c.kind === 'time' || c.kind === 'equipment' || c.kind === 'text') cells.push({ key, kind: 'list', raw: c.sample ?? '' });
      else if (c.kind === 'val') cells.push({ key, kind: 'manual', raw: c.literal ?? '' });
      else if (c.kind === 'lookup') cells.push({ key, kind: 'lookup', refKey: c.refKey, matrixId: c.matrixId, searchCol: c.searchCol, returnCol: c.returnCol });
      else if (c.kind === 'formula') cells.push({ key, kind: 'formula', expr: c.expr });
      else if (c.kind === 'xref') { nXref++; if (injectXref[key] != null) cells.push({ key, kind: 'manual', raw: String(injectXref[key]) }); }
    });
  }
  const { scope, textValues, errors } = fe.resolveScopeCells(cells, matrices, undefined, auxTables);
  const v = k => scope[k] != null ? scope[k] : (textValues[k] ?? '(vacío)');
  const errKeys = Object.keys(errors);
  console.log(`Celdas con :ej[]: ${nSamples} · celdas xref: ${nXref}`);
  console.log('Errores:', errKeys.length ? errKeys.map(k => k + ':' + errors[k]).join(' | ') : '(ninguno) ✅');
  return { v, scope, textValues, errors };
}
function chk(name, got, exp, tol) { const ok = Math.abs(Number(got) - exp) <= tol; console.log(`  ${ok ? '✅' : '❌'} ${name} = ${got}  (~${exp} ±${tol})`); return ok; }

// ── GRA — Granulometría + Atterberg ──
const gra = runFromSamples('GRA — Granulometría + Atterberg', DIR + 'GRA_GranulometriaAtterberg.xlsx');
// %Pasa por tamiz (partidas 4..10, col E). Esperado: 100/83/56/41/29/15/6.
const pasa = [4, 5, 6, 7, 8, 9, 10].map(pt => Number(gra.v(pt + 'E')));
console.log('  %Pasa por tamiz:', pasa.map(x => x.toFixed(1)).join(' / '));
let okG = true;
[100, 83, 56, 41, 29, 15, 6].forEach((e, i) => { okG &= Math.abs(pasa[i] - e) <= 0.1; });
console.log('  ' + (okG ? '✅' : '❌') + ' curva granulométrica coincide con el patrón');
// LL/LP/IP — partidas: buscamos por descripción no, por posición conocida.
// LL=part 16, LP=part 19, IP=part 20, finos=part 21 (según generador; verificamos dinámico).
const findByDesc = () => { const a = XLSX.utils.sheet_to_json(XLSX.readFile(DIR + 'GRA_GranulometriaAtterberg.xlsx').Sheets['Actividades'], { header: 1, defval: '' }); const map = {}; a.slice(1).forEach(r => { const d = String(r[3] || ''); if (/Límite Líquido — LL/.test(d)) map.LL = r[2]; if (/Límite Plástico — LP/.test(d)) map.LP = r[2]; if (/Índice de Plasticidad — IP/.test(d)) map.IP = r[2]; if (/finos \(pasa/.test(d)) map.FIN = r[2]; }); return map; };
const g = findByDesc();
okG &= chk('LL (%)', gra.v(g.LL + 'A'), 21.5, 0.25);
okG &= chk('LP (%)', gra.v(g.LP + 'A'), 17.5, 0.05);
okG &= chk('IP (%)', gra.v(g.IP + 'A'), 4.0, 0.3);
okG &= chk('% finos N°200', gra.v(g.FIN + 'A'), 6.0, 0.1);
const dictG = XLSX.utils.sheet_to_json(XLSX.readFile(DIR + 'GRA_GranulometriaAtterberg.xlsx').Sheets['Actividades'], { header: 1, defval: '' }).slice(1).find(r => /Dictamen final/.test(String(r[3] || '')));
okG &= chk('Dictamen final', gra.v(dictG[2] + 'A'), 1, 0.001);

// ── CBR — inyectamos DMS del Proctor (part 3 = xref get) ──
const DMS = 2.207;
const cbr = runFromSamples('CBR — California Bearing Ratio', DIR + 'CBR_CaliforniaBearingRatio.xlsx', { '3A': DMS });
console.log(`  CBR molde (17A/B/C)=${cbr.v('17A')} / ${cbr.v('17B')} / ${cbr.v('17C')}  Exp molde(12A)=${cbr.v('12A')}`);
let okB = true;
okB &= chk('Esfuerzo 0.1" molde1 (13A)', cbr.v('13A'), 980.0, 0.1);
okB &= chk('CBR molde1 (17A)', cbr.v('17A'), 98.0, 0.1);
okB &= chk('Expansión molde1 (12A)', cbr.v('12A'), 0.05, 0.002);
okB &= chk('Densidad objetivo (19A)', cbr.v('19A'), 2.207, 0.001);
okB &= chk('CBR de diseño (20A)', cbr.v('20A'), 94.3, 1.0);
okB &= chk('Expansión de diseño (21A)', cbr.v('21A'), 0.053, 0.005);
okB &= chk('CBR mínimo Base (23A)', cbr.v('23A'), 80.0, 0.001);
okB &= chk('Expansión máx Base (24A)', cbr.v('24A'), 0.50, 0.001);
okB &= chk('¿Cumple CBR? (25A)', cbr.v('25A'), 1, 0.001);
okB &= chk('¿Cumple expansión? (26A)', cbr.v('26A'), 1, 0.001);
okB &= chk('Dictamen final (27A)', cbr.v('27A'), 1, 0.001);

console.log('\n' + (okG && okB ? '✅✅ GRA + CBR OK — coherentes y congruentes con el patrón.' : '❌ HAY FALLOS — revisar arriba.'));
