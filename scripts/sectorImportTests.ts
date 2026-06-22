// Tests del importador de sectores — fija el fix del "vértice extra".
//   npx -y tsx scripts/sectorImportTests.ts
import { parseSectorFile } from '../src/services/SectorImporter';

let passed = 0, failed = 0;
const ok = (c: boolean, name: string, d?: string) => {
  if (c) { passed++; console.log(`  ✓ ${name}`); } else { failed++; console.error(`  ✗ ${name} — ${d ?? ''}`); }
};

// CSV wgs84-flat: 1 tramo con 4 vértices DISTINTOS → debe quedarse con 4.
const csv4 = [
  'name,lat,lng',
  'Tramo 1,-16.349092,-71.543664',
  'Tramo 1,-16.349236,-71.542558',
  'Tramo 1,-16.350283,-71.542650',
  'Tramo 1,-16.350275,-71.543775',
].join('\n');
const r4 = parseSectorFile(csv4, 'sectores.csv');
ok(r4.format === 'wgs84-flat', 'formato wgs84-flat detectado', r4.format);
ok(r4.sectors.length === 1, '1 sector', String(r4.sectors.length));
ok(r4.sectors[0].points?.length === 4, '4 vértices se mantienen en 4 (no 5)', String(r4.sectors[0].points?.length));

// CSV con el primer vértice REPETIDO al final (cierre explícito) → 5 entradas
// deben normalizarse a 4 (se elimina el duplicado de cierre).
const csv5 = [
  'name,lat,lng',
  'Tramo 2,-16.349092,-71.543664',
  'Tramo 2,-16.349236,-71.542558',
  'Tramo 2,-16.350283,-71.542650',
  'Tramo 2,-16.350275,-71.543775',
  'Tramo 2,-16.349092,-71.543664',
].join('\n');
const r5 = parseSectorFile(csv5, 'sectores.csv');
ok(r5.sectors[0].points?.length === 4, 'anillo cerrado de 5 → 4 vértices', String(r5.sectors[0].points?.length));
// El primer y último punto NO deben ser iguales (anillo abierto).
const p = r5.sectors[0].points!;
const first = p[0], last = p[p.length - 1];
ok(!(Math.abs(first.lat - last.lat) < 1e-9 && Math.abs(first.lng - last.lng) < 1e-9), 'anillo queda ABIERTO (primer ≠ último)');

// 4 tramos × 4 vértices.
const csvMulti = ['name,lat,lng'];
for (const t of ['T1', 'T2', 'T3', 'T4']) {
  csvMulti.push(`${t},-16.35,-71.54`, `${t},-16.35,-71.53`, `${t},-16.36,-71.53`, `${t},-16.36,-71.54`);
}
const rm = parseSectorFile(csvMulti.join('\n'), 'sectores.csv');
ok(rm.sectors.length === 4, '4 tramos', String(rm.sectors.length));
ok(rm.sectors.every(s => s.points?.length === 4), 'cada tramo con 4 vértices', JSON.stringify(rm.sectors.map(s => s.points?.length)));

// C2 — hemisferio UTM: el MISMO easting/northing con 18N vs 18S debe caer en
// hemisferios opuestos (antes se asumía siempre Sur → 18N ~10,000 km al sur).
const utmRows = (sys: string) => [
  'name,x,y,system',
  `T,300000,8500000,${sys}`,
  `T,301000,8500000,${sys}`,
  `T,300500,8501000,${sys}`,
].join('\n');
const rS = parseSectorFile(utmRows('WGS84 UTM 18S'), 's.csv');
const rN = parseSectorFile(utmRows('WGS84 UTM 18N'), 's.csv');
ok(rS.format === 'projected', 'UTM detectado como projected', rS.format);
const latS = rS.sectors[0].points?.[0].lat ?? 0;
const latN = rN.sectors[0].points?.[0].lat ?? 0;
ok(latS < 0, `UTM 18S → latitud Sur (negativa) (${latS.toFixed(3)})`);
ok(latN > 0, `UTM 18N → latitud Norte (positiva) (${latN.toFixed(3)})`);

// C3 — triángulo exportado CERRADO (A,B,C,A) → 3 vértices (no se cae a 2).
const triClosed = [
  'name,lat,lng',
  'Tri,-16.35,-71.54',
  'Tri,-16.35,-71.53',
  'Tri,-16.36,-71.535',
  'Tri,-16.35,-71.54',
].join('\n');
const rTri = parseSectorFile(triClosed, 's.csv');
ok(rTri.sectors.length === 1 && rTri.sectors[0].points?.length === 3, 'triángulo cerrado → 3 vértices', String(rTri.sectors[0]?.points?.length));

console.log(`\n${failed === 0 ? '✅' : '❌'}  ${passed} OK, ${failed} fallos`);
process.exit(failed === 0 ? 0 : 1);
