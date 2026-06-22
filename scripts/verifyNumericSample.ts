// Verificación end-to-end del paquete generado: lee los XLSX reales, re-valida
// y SIMULA el llenado (como NumericTable) comprobando los cálculos clave.
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

// 1) Leer el xlsx real
const wb = XLSX.readFile(path.join('sample_numerico_v33', '01_protocolos_numericos_v35.xlsx'));
const rows: string[][] = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '' });
const header = rows[0];
ok(JSON.stringify(header.slice(0, 5)) === JSON.stringify(['ID_Protocolo', 'Protocolo', 'PartidaItem', 'Actividad realizada', 'Método de validación']),
  'columnas requeridas presentes', JSON.stringify(header));

interface It { partida_item: string | null; item_description: string; validation_method: string | null }
const byProto = new Map<string, It[]>();
for (let i = 1; i < rows.length; i++) {
  const r = rows[i];
  if (!r[0]) continue;
  const arr = byProto.get(String(r[0])) ?? [];
  arr.push({
    partida_item: String(r[2] ?? '').trim() || null,
    item_description: String(r[3] ?? ''),
    validation_method: String(r[4] ?? '').trim() || null,
  });
  byProto.set(String(r[0]), arr);
}
ok(byProto.size === 7, '7 protocolos en el Excel', String(byProto.size));

// 2) Round-trip: validación + detección desde el archivo
for (const [id, items] of byProto) {
  const v = validateProtocolSpec(items);
  ok(v.ok, `${id}: válido tras round-trip`, JSON.stringify(v.issues.filter(i => i.severity === 'error').slice(0, 2)));
  const numeric = isNumericProtocol(items);
  ok(id === 'VIS-100' ? !numeric : numeric, `${id}: detección ${id === 'VIS-100' ? 'clásico' : 'numérico'}`);
}

// Helper: construye ScopeCells como NumericTable, con valores de usuario por key
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

// 3) GRA-101: llenar % Pasa → D50/P80/conformidad
console.log('\n── GRA-101 (simulación de llenado) ──');
{
  const items = byProto.get('GRA-101')!;
  const pasa = [100, 95, 82, 70, 55, 42, 30, 18, 8, 3];
  const vals: Record<string, string> = {};
  pasa.forEach((v, i) => { vals[`${i + 1}B`] = String(v); });
  const { scope, errors } = buildScope(items, vals);
  ok(Object.keys(errors).length === 0, 'sin errores de evaluación', JSON.stringify(errors));
  ok(near(scope['11A'], 11.36, 0.05), `D50 ≈ 11.36 (got ${scope['11A']})`);
  ok(near(scope['12A'], 24.2, 0.2), `P80 ≈ 24.2 (got ${scope['12A']})`);
  ok(scope['13A'] === 1, `conformidad = 1 (got ${scope['13A']})`);
}

// 4) PES-102: pesos → acumulado + total + % pasa + contar
console.log('\n── PES-102 (acumulador fila-a-fila) ──');
{
  const items = byProto.get('PES-102')!;
  const pesos = [120, 240, 310, 280, 350, 420, 510, 270];   // suma 2500
  const vals: Record<string, string> = {};
  pesos.forEach((v, i) => { vals[`${i + 1}B`] = String(v); });
  const { scope, errors } = buildScope(items, vals);
  ok(Object.keys(errors).length === 0, 'sin errores de evaluación', JSON.stringify(errors));
  ok(scope['8C'] === 2500, `acumulado fila 8 = 2500 (got ${scope['8C']})`);
  ok(scope['9C'] === 2500, `TOTAL (COLUMNA) = 2500 (got ${scope['9C']})`);
  ok(scope['9D'] === 8, `CONTAR = 8 (got ${scope['9D']})`);
  ok(near(scope['1D'], 95.2, 0.05), `% pasa fila 1 = 95.2 (got ${scope['1D']})`);
  ok(near(scope['8D'], 0, 0.05), `% pasa fila 8 = 0 (got ${scope['8D']})`);
}

// 5) PRO-103: puntos → densidad seca + HOP + MDS
console.log('\n── PRO-103 (óptimo Proctor) ──');
{
  const items = byProto.get('PRO-103')!;
  const hum = [8, 10, 12, 14, 16];
  const dh  = [2.009, 2.146, 2.240, 2.205, 2.123];   // → dseca parabólica con pico en 12
  const vals: Record<string, string> = {};
  hum.forEach((v, i) => { vals[`${i + 1}B`] = String(v); });
  dh.forEach((v, i) => { vals[`${i + 1}C`] = String(v); });
  const { scope, errors } = buildScope(items, vals);
  ok(Object.keys(errors).length === 0, 'sin errores de evaluación', JSON.stringify(errors));
  ok(near(scope['3D'], 2.0, 0.001), `dens. seca punto 3 = 2.000 (got ${scope['3D']})`);
  // v34 — la celda OCULTA (#6A) computa el HOP algebraico (poli3) y la visible
  // (#7B) solo la redondea: la cadena oculta→visible debe funcionar.
  ok(scope['6A'] != null && isFinite(scope['6A'] as number), `celda oculta 6A computa (got ${scope['6A']})`);
  ok(near(scope['7B'], Math.round((scope['6A'] as number) * 10) / 10, 1e-9), `HOP visible = oculta redondeada (got ${scope['7B']})`);
  ok(near(scope['7B'], 12, 1.5), `HOP ≈ 12 con poli3 (got ${scope['7B']})`);
  ok(near(scope['8B'], 2.0, 0.05), `MDS ≈ 2.0 con poli3 (got ${scope['8B']})`);
}

// 6) DEN-104: lookup desde catálogo + cadena completa
console.log('\n── DEN-104 (lookup + cadena) ──');
{
  const items = byProto.get('DEN-104')!;
  const vals: Record<string, string> = {
    '2A': 'C-02',        // cono del catálogo → densidad 1.45 por lookup
    '4A': '4350',        // peso arena
    '6A': '6300',        // peso material
    '7A': '8.5',         // humedad %
  };
  const { scope, errors } = buildScope(items, vals);
  ok(Object.keys(errors).length === 0, 'sin errores de evaluación', JSON.stringify(errors));
  ok(near(scope['3A'], 1.45, 1e-9), `lookup densidad arena = 1.45 (got ${scope['3A']})`);
  ok(near(scope['5A'], 3000, 0.1), `volumen del hoyo = 3000 (got ${scope['5A']})`);
  ok(near(scope['8A'], 1.936, 0.001), `densidad seca = 1.936 (got ${scope['8A']})`);
  // 1.935 (ya redondeado a 3 dec) / 2.10 × 100 = 92.1 — cadena de redondeos correcta.
  ok(near(scope['9A'], 92.1, 0.05), `% compactación = 92.1 (fuera de [95:105] → ✗ esperado) (got ${scope['9A']})`);
}

// 7) Ubicaciones xlsx
console.log('\n── 02_ubicaciones.xlsx ──');
{
  const wbU = XLSX.readFile(path.join('sample_numerico_v33', '02_ubicaciones.xlsx'));
  const r: string[][] = XLSX.utils.sheet_to_json(wbU.Sheets[wbU.SheetNames[0]], { header: 1, defval: '' });
  ok(['Ubicación', 'PLANO DE REFERENCIA', 'ID_Protocolos'].every(c => r[0].includes(c)), 'columnas requeridas de ubicaciones');
  const ids = new Set([...byProto.keys()]);
  const refs = r.slice(1).flatMap(row => String(row[4]).split(',').map(s => s.trim()));
  ok(refs.every(id => ids.has(id)), 'todas las ID_Protocolos referenciadas existen en el Excel de actividades', refs.filter(id => !ids.has(id)).join(','));
  ok(r.length - 1 === 4, '4 ubicaciones');
}

console.log(`\n${passed} pasaron, ${failed} fallaron`);
process.exit(failed > 0 ? 1 : 0);
