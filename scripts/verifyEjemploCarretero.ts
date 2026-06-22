// Verificación end-to-end del ejemplo carretero: lee los XLSX generados,
// re-valida y SIMULA el llenado (como NumericTable) con datos de campo reales
// de los Excel base, comprobando los cálculos clave de cada ensayo.
import * as path from 'path';
import { createRequire } from 'module';
import { parseNumericRow, isNumericProtocol, scopeKeyFor, extractMatrices } from '../src/utils/numericProtocol';
import { resolveScopeCells, type ScopeCell } from '../src/utils/formulaEval';
import { validateProtocolSpec } from '../src/utils/protocolValidator';

const req = createRequire(path.join(process.cwd(), 'flow-qaqc-web', 'package.json'));
const XLSX = req('xlsx');

let passed = 0, failed = 0;
const ok = (c: boolean, name: string, d?: string) => {
  if (c) { passed++; console.log(`  ✓ ${name}`); } else { failed++; console.error(`  ✗ ${name} — ${d ?? ''}`); }
};
const near = (a: number | null | undefined, b: number, tol: number) => a != null && Math.abs(a - b) <= tol;

interface It { partida_item: string | null; item_description: string; validation_method: string | null }

// ── Cargar actividades ──────────────────────────────────────────────────────
const wb = XLSX.readFile(path.join('ejemplo_carretero', '01_actividades_carretera.xlsx'));
const rows: string[][] = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '' });
const byProto = new Map<string, It[]>();
for (let i = 1; i < rows.length; i++) {
  const r = rows[i];
  if (!r[0]) continue;
  const arr = byProto.get(String(r[0])) ?? [];
  arr.push({ partida_item: String(r[2] ?? '').trim() || null, item_description: String(r[3] ?? ''), validation_method: String(r[4] ?? '').trim() || null });
  byProto.set(String(r[0]), arr);
}
ok(byProto.size === 3, '3 protocolos en el Excel', String(byProto.size));
for (const [id, items] of byProto) {
  const v = validateProtocolSpec(items);
  ok(v.ok, `${id}: válido tras round-trip`, JSON.stringify(v.issues.filter(i => i.severity === 'error').slice(0, 2)));
  ok(isNumericProtocol(items), `${id}: detectado numérico`);
}

function buildScope(items: It[], userVals: Record<string, string>) {
  const parsed = items.map(it => ({ item: it, spec: parseNumericRow(it.validation_method) }));
  const { matrices } = extractMatrices(parsed);
  const cells: ScopeCell[] = [];
  for (const { item, spec } of parsed) {
    if (spec?.kind !== 'row') continue;
    const partida = (item.partida_item ?? '').trim();
    for (let i = 0; i < spec.cells.length; i++) {
      const cell = spec.cells[i];
      const key = scopeKeyFor(partida, i);
      const raw = userVals[key] ?? '';
      if (cell.kind === 'manual' || cell.kind === 'percent' || cell.kind === 'bool') cells.push({ key, kind: 'manual', raw });
      else if (cell.kind === 'list' || cell.kind === 'date' || cell.kind === 'time' || cell.kind === 'equipment') cells.push({ key, kind: 'list', raw });
      else if (cell.kind === 'lookup') cells.push({ key, kind: 'lookup', refKey: cell.refKey, matrixId: cell.matrixId, searchCol: cell.searchCol, returnCol: cell.returnCol });
      else if (cell.kind === 'formula') cells.push({ key, kind: 'formula', expr: cell.expr });
      else if (cell.kind === 'val') cells.push({ key, kind: 'manual', raw: cell.literal });
    }
  }
  return resolveScopeCells(cells, matrices);
}
type Scoped = { scope: Record<string, number>; errors: Record<string, string> };
const num = (m: Scoped, k: string): number | null => (k in m.scope ? m.scope[k] : null);

// ── PROCTOR (PRC-D698) — 4 puntos realistas ─────────────────────────────────
{
  const it = byProto.get('PRC-D698')!;
  // molde 4111.7 g / 937.4 cm³. 4 puntos con humedad creciente.
  const V: Record<string, string> = {};
  const moldeSuelo = ['5870', '5980', '6010', '5960'];                 // p3 A-D
  const hum  = [['230','215','38'],['245','225','40'],['250','226','42'],['255','228','45']]; // p6,7,8
  ['A','B','C','D'].forEach((c, j) => {
    V[scopeKeyFor('3', j)] = moldeSuelo[j];
    V[scopeKeyFor('6', j)] = hum[j][0];
    V[scopeKeyFor('7', j)] = hum[j][1];
    V[scopeKeyFor('8', j)] = hum[j][2];
  });
  const m = buildScope(it, V);
  const mds = num(m, scopeKeyFor('14', 1));
  const hop = num(m, scopeKeyFor('15', 1));
  ok(mds != null && mds > 1.5 && mds < 2.4, `Proctor MDS en rango (${mds})`);
  ok(hop != null && hop > 5 && hop < 25, `Proctor HOP en rango (${hop})`);
  // densidad seca p1 = (5870-4111.7)/937.4/(1+w/100); w=(230-215)/(215-38)*100=8.47
  const ds1 = num(m, scopeKeyFor('12', 0));
  const w1 = (230 - 215) / (215 - 38) * 100;
  ok(near(ds1, (5870 - 4111.7) / 937.4 / (1 + w1 / 100), 0.002), `Proctor dens. seca p1 (${ds1})`);
}

// ── CONO DE ARENA (CAR-D1556) — datos del Excel base ────────────────────────
{
  const it = byProto.get('CAR-D1556')!;
  const V: Record<string, string> = {
    [scopeKeyFor('1', 0)]: '51500', [scopeKeyFor('2', 0)]: '26500',
    [scopeKeyFor('4', 0)]: '7827',  [scopeKeyFor('6', 0)]: '1.348',
    [scopeKeyFor('8', 0)]: '29800', [scopeKeyFor('9', 0)]: '10',
    [scopeKeyFor('12', 0)]: '2540', [scopeKeyFor('13', 0)]: '2386',
    [scopeKeyFor('15', 0)]: '1058.4', [scopeKeyFor('19', 0)]: '2.078',
  };
  const m = buildScope(it, V);
  ok(near(num(m, scopeKeyFor('3', 0)), 25000, 0.1), `Cono arena empleada (${num(m, scopeKeyFor('3', 0))})`);
  ok(near(num(m, scopeKeyFor('5', 0)), 17173, 0.1), `Cono arena en hoyo (${num(m, scopeKeyFor('5', 0))})`);
  ok(near(num(m, scopeKeyFor('7', 0)), 12739.6, 0.2), `Cono volumen hoyo (${num(m, scopeKeyFor('7', 0))})`);
  ok(near(num(m, scopeKeyFor('17', 0)), 11.6, 0.05), `Cono humedad % (${num(m, scopeKeyFor('17', 0))})`);
  const dsIn = num(m, scopeKeyFor('18', 0));
  ok(near(dsIn, 2.095, 0.005), `Cono densidad seca in situ (${dsIn})`);
  const grado = num(m, scopeKeyFor('20', 0));
  ok(grado != null && grado >= 98 && grado <= 105, `Cono grado de compactación ≥98% (${grado})`);
}

// ── GRANULOMETRÍA (GRA-D6913) — pesos retenidos ─────────────────────────────
{
  const it = byProto.get('GRA-D6913')!;
  // 10 tamices; pesos retenidos (g) → total 2000 g.
  const pesos = ['0', '150', '250', '300', '350', '200', '300', '250', '150', '50'];
  const V: Record<string, string> = {};
  pesos.forEach((p, i) => { V[scopeKeyFor(String(i + 1), 2)] = p; }); // col C = índice 2
  const m = buildScope(it, V);
  const total = pesos.reduce((a, b) => a + Number(b), 0); // 2000
  ok(near(num(m, scopeKeyFor('11', 1)), total, 0.1), `Granulo masa total (${num(m, scopeKeyFor('11', 1))})`);
  // %pasa del último tamiz (N°200) = 100 - acum total. Acum total = 100 (todo el peso).
  const pasaUlt = num(m, scopeKeyFor('10', 5)); // fila 10, col F = índice 5
  ok(near(pasaUlt, 100 - 100, 0.1) || (pasaUlt != null && pasaUlt >= 0 && pasaUlt <= 5),
    `Granulo %pasa N°200 bajo (${pasaUlt})`);
  // %pasa monótona no creciente con el tamaño decreciente (acum sube)
  const pasaSeq = Array.from({ length: 10 }, (_, i) => num(m, scopeKeyFor(String(i + 1), 5)));
  let monot = true;
  for (let i = 1; i < pasaSeq.length; i++) if ((pasaSeq[i] ?? 0) > (pasaSeq[i - 1] ?? 100) + 0.1) monot = false;
  ok(monot, '%pasa monótona no creciente', JSON.stringify(pasaSeq));
  const d60 = num(m, scopeKeyFor('12', 0)), d10 = num(m, scopeKeyFor('14', 0)), cu = num(m, scopeKeyFor('15', 0));
  ok(d60 != null && d10 != null && d60 > d10, `D60 > D10 (${d60} > ${d10})`);
  ok(cu != null && cu > 1, `Cu > 1 (${cu})`);
}

// ── Sectores ─────────────────────────────────────────────────────────────────
{
  const wbS = XLSX.readFile(path.join('ejemplo_carretero', '03_sectores_carretera.xlsx'));
  const rs: (string | number)[][] = XLSX.utils.sheet_to_json(wbS.Sheets[wbS.SheetNames[0]], { header: 1, defval: '' });
  ok(JSON.stringify(rs[0]) === JSON.stringify(['name', 'lat', 'lng']), 'sectores: encabezados name/lat/lng');
  const data = rs.slice(1).filter(r => r[0]);
  ok(data.length === 16, '4 tramos × 4 vértices = 16 filas', String(data.length));
  const allNeg = data.every(r => Number(r[1]) < 0 && Number(r[2]) < 0);
  ok(allNeg, 'todas las coords negativas (S / Oeste)');
  // Arequipa: lat ~ -16.35, lng ~ -71.54
  const inArequipa = data.every(r => Number(r[1]) > -16.36 && Number(r[1]) < -16.34 && Number(r[2]) > -71.55 && Number(r[2]) < -71.53);
  ok(inArequipa, 'coords dentro del rango esperado (Arequipa)');
}

console.log(`\n${failed === 0 ? '✅' : '❌'}  ${passed} OK, ${failed} fallos`);
process.exit(failed === 0 ? 0 : 1);
