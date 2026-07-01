/* Valida PRM (Proctor) y DCC (Cono) con el MOTOR REAL, usando los valores :ej[] de
 * cada ficha como inputs (así prueba a la vez: (a) el parser extrae `sample`, (b) el
 * "Llenado Automático" congruente, y (c) la matemática). Las celdas xref del Cono se
 * INYECTAN con la DMS/OCH del Proctor (simulando la selección en la app).
 * Correr desde la raíz del repo:  node "Proyectos Modelo/Proyecto_Carretera/_validateCarretera.js"
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

/** Corre una ficha usando el `:ej[]` (sample) de cada celda como input. `injectXref`
 *  = { key: value } para las celdas xref get (DMS/OCH heredadas). */
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
      const sample = c.sample;               // ← el :ej[] extraído por el parser
      if (sample != null) nSamples++;
      if (c.kind === 'manual' || c.kind === 'percent' || c.kind === 'bool' || c.kind === 'free') cells.push({ key, kind: 'manual', raw: sample ?? '' });
      else if (c.kind === 'list' || c.kind === 'date' || c.kind === 'time' || c.kind === 'equipment' || c.kind === 'text') cells.push({ key, kind: 'list', raw: sample ?? '' });
      else if (c.kind === 'val') cells.push({ key, kind: 'manual', raw: c.literal ?? '' });
      else if (c.kind === 'lookup') cells.push({ key, kind: 'lookup', refKey: c.refKey, matrixId: c.matrixId, searchCol: c.searchCol, returnCol: c.returnCol });
      else if (c.kind === 'formula') cells.push({ key, kind: 'formula', expr: c.expr });
      else if (c.kind === 'xref') { nXref++; if (injectXref[key] != null) cells.push({ key, kind: 'manual', raw: String(injectXref[key]) }); }
    });
  }
  const { scope, textValues, errors } = fe.resolveScopeCells(cells, matrices, undefined, auxTables);
  const v = k => scope[k] != null ? scope[k] : (textValues[k] ?? '(vacío)');
  const errKeys = Object.keys(errors);
  console.log(`Celdas con :ej[] (autofill congruente): ${nSamples} · celdas xref: ${nXref}`);
  console.log('Errores:', errKeys.length ? errKeys.map(k => k + ':' + errors[k]).join(' | ') : '(ninguno) ✅');
  return { v, scope, textValues, errors };
}

function chk(name, got, exp, tol) { const ok = Math.abs(Number(got) - exp) <= tol; console.log(`  ${ok ? '✅' : '❌'} ${name} = ${got}  (esperado ~${exp} ±${tol})`); return ok; }

// ── PRM (Proctor) ──
const prm = runFromSamples('PRM — Proctor Modificado', DIR + 'PRM_ProctorModificado.xlsx');
console.log('  Puntos (w%, ρd): ' + ['A', 'B', 'C', 'D'].map(c => `(${prm.v('12' + c)}, ${prm.v('13' + c)})`).join('  '));
let okP = true;
okP &= chk('DMS (14A)', prm.v('14A'), 2.207, 0.006);
okP &= chk('OCH (15A)', prm.v('15A'), 6.90, 0.15);
okP &= chk('ρd Punto2 (13B)', prm.v('13B'), 2.210, 0.003);

// ── DCC (Cono) — inyectamos DMS/OCH del Proctor (partidas 3 y 4 = xref get) ──
const DMS = 2.207, OCH = 6.90;
const dcc = runFromSamples('DCC — Cono de Arena', DIR + 'DCC_ConoArena.xlsx', { '3A': DMS, '4A': OCH });
console.log(`  Capa(1A)=${dcc.v('1A')}  vol(13A)=${dcc.v('13A')}  ρh(14A)=${dcc.v('14A')}  ρd(15A)=${dcc.v('15A')}`);
let okC = true;
okC &= chk('Volumen hueco (13A)', dcc.v('13A'), 1600.0, 1.0);
okC &= chk('ρd campo (15A)', dcc.v('15A'), 2.221, 0.003);
okC &= chk('GC (16A)', dcc.v('16A'), 100.5, 0.6);
okC &= chk('GC mínimo capa (17A)', dcc.v('17A'), 100.0, 0.001);
okC &= chk('Tolerancia humedad (18A)', dcc.v('18A'), 1.5, 0.001);
okC &= chk('¿Cumple GC? (20A)', dcc.v('20A'), 1, 0.001);
okC &= chk('¿Cumple humedad? (21A)', dcc.v('21A'), 1, 0.001);
okC &= chk('Dictamen final (22A)', dcc.v('22A'), 1, 0.001);

console.log('\n' + (okP && okC ? '✅✅ TODO OK — fichas coherentes y congruentes con el patrón.' : '❌ HAY FALLOS — revisar arriba.'));
