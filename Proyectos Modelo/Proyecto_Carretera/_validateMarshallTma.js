/* Valida MAR (Marshall) y TMA (Temperatura asfáltica) con el MOTOR REAL usando los :ej[]
 * como inputs. Sin xref ni tablas auxiliares. Correr desde la raíz del repo:
 *   node "Proyectos Modelo/Proyecto_Carretera/_validateMarshallTma.js"
 */
const fs = require('fs'); const ts = require('typescript');
let XLSX; for (const p of ['xlsx', './node_modules/xlsx', './flow-qaqc-web/node_modules/xlsx']) { try { XLSX = require(p); break; } catch (e) {} }
function load(file) { const js = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: 'CommonJS', target: 'ES2019' } }).outputText; const m = { exports: {} }; new Function('exports', 'require', 'module', js)(m.exports, require, m); return m.exports; }
const np = load('src/utils/numericProtocol.ts');
const fe = load('src/utils/formulaEval.ts');
const DIR = 'Proyectos Modelo/Proyecto_Carretera/';

function runFromSamples(label, file) {
  const aoa = XLSX.utils.sheet_to_json(XLSX.readFile(file).Sheets['Actividades'], { header: 1, raw: false, defval: '' });
  const items = aoa.slice(1).filter(r => (r[4] || '').trim()).map(r => ({ partida_item: String(r[2] || '').trim(), validation_method: String(r[4] || '').trim(), section: (String(r[5] || '').trim() || null) }));
  console.log(`\n===== ${label} =====`);
  console.log('isNumericProtocol:', np.isNumericProtocol(items), '· items:', items.length);
  const parsed = items.map(it => ({ item: it, spec: np.parseNumericRow(it.validation_method) }));
  const { mainRows, matrices } = np.extractMatrices(parsed);
  const cells = []; let nSamples = 0;
  for (const { item, spec } of mainRows) {
    if (!spec || spec.kind !== 'row') continue;
    const partida = (item.partida_item || '').trim();
    spec.cells.forEach((c, i) => {
      const key = np.scopeKeyFor(partida, i);
      if (c.sample != null) nSamples++;
      if (c.kind === 'manual' || c.kind === 'percent' || c.kind === 'bool' || c.kind === 'free') cells.push({ key, kind: 'manual', raw: c.sample ?? '' });
      else if (c.kind === 'list' || c.kind === 'date' || c.kind === 'time' || c.kind === 'equipment' || c.kind === 'text') cells.push({ key, kind: 'list', raw: c.sample ?? '' });
      else if (c.kind === 'val') cells.push({ key, kind: 'manual', raw: c.literal ?? '' });
      else if (c.kind === 'formula') cells.push({ key, kind: 'formula', expr: c.expr });
    });
  }
  const { scope, textValues, errors } = fe.resolveScopeCells(cells, matrices, undefined, {});
  const v = k => scope[k] != null ? scope[k] : (textValues[k] ?? '(vacío)');
  const errKeys = Object.keys(errors);
  console.log(`Celdas con :ej[]: ${nSamples}`);
  console.log('Errores:', errKeys.length ? errKeys.map(k => k + ':' + errors[k]).join(' | ') : '(ninguno) ✅');
  return { v };
}
function chk(name, got, exp, tol) { const ok = Math.abs(Number(got) - exp) <= tol; console.log(`  ${ok ? '✅' : '❌'} ${name} = ${got}  (~${exp} ±${tol})`); return ok; }

// ── MAR — Marshall ──
const mar = runFromSamples('MAR — Marshall', DIR + 'MAR_Marshall.xlsx');
let okM = true;
okM &= chk('Estabilidad corregida (7A)', mar.v('7A'), 2444.0, 0.5);
okM &= chk('Vacíos Va % (8A)', mar.v('8A'), 4.0, 0.1);
okM &= chk('¿Estab≥1800? (9A)', mar.v('9A'), 1, 0.001);
okM &= chk('¿Flujo 8-14? (10A)', mar.v('10A'), 1, 0.001);
okM &= chk('¿Va 3-5? (11A)', mar.v('11A'), 1, 0.001);
okM &= chk('Dictamen (12A)', mar.v('12A'), 1, 0.001);

// ── TMA — Temperatura asfáltica ──
const tma = runFromSamples('TMA — Temperatura asfáltica', DIR + 'TMA_TemperaturaAsfaltica.xlsx');
console.log(`  Temps: planta(2B)=${tma.v('2B')} arribo(3B)=${tma.v('3B')} inicio(5B)=${tma.v('5B')} cierre(6B)=${tma.v('6B')}`);
let okT = true;
okT &= chk('ΔT transporte (8A)', tma.v('8A'), 10.0, 0.1);
okT &= chk('ΔT tendido (9A)', tma.v('9A'), 10.0, 0.1);
okT &= chk('Ventana compactación (10A)', tma.v('10A'), 15.0, 0.1);
okT &= chk('Gradiente total (11A)', tma.v('11A'), 40.0, 0.1);
okT &= chk('¿Arribo≥135? (12A)', tma.v('12A'), 1, 0.001);
okT &= chk('¿Inicio 120-140? (13A)', tma.v('13A'), 1, 0.001);
okT &= chk('¿Cierre≥110? (14A)', tma.v('14A'), 1, 0.001);
okT &= chk('Dictamen (15A)', tma.v('15A'), 1, 0.001);

console.log('\n' + (okM && okT ? '✅✅ MAR + TMA OK — coherentes con el patrón.' : '❌ HAY FALLOS — revisar arriba.'));
