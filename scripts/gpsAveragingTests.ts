// Tests del promediado GPS (puro, sin RN).
//   npx -y tsx scripts/gpsAveragingTests.ts
import { haversineMeters } from '../src/utils/gpsDedup';
import {
  emptyState, addSample, computeStats, isConverged, detectDeparture, finalizeResult,
  type AveragingState, type GpsSample,
} from '../src/utils/gpsAveraging';

let passed = 0, failed = 0;
const ok = (c: boolean, name: string, d?: string) => {
  if (c) { passed++; console.log(`  ✓ ${name}`); } else { failed++; console.error(`  ✗ ${name} — ${d ?? ''}`); }
};

// Punto verdadero (Arequipa) + helpers de offset en metros y RNG sembrado.
const P = { lat: -16.4000, lng: -71.5400 };
const offset = (east: number, north: number) => ({
  lat: P.lat + north / 111320,
  lng: P.lng + east / (111320 * Math.cos(P.lat * Math.PI / 180)),
});
let seed = 123456789;
const uni = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
const gauss = (sd: number) => { const u1 = Math.max(uni(), 1e-9), u2 = uni(); return sd * Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2); };

const build = (samples: Array<{ east: number; north: number; acc: number }>): AveragingState => {
  let st = emptyState();
  samples.forEach((s, i) => {
    const p = offset(s.east, s.north);
    st = addSample(st, { lat: p.lat, lng: p.lng, accuracyM: s.acc, t: i * 1000 });
  });
  return st;
};

// ── 1) Convergencia: el promedio queda más cerca del punto real que la muestra media
{
  const raw: Array<{ east: number; north: number; acc: number }> = [];
  for (let i = 0; i < 60; i++) raw.push({ east: gauss(5), north: gauss(5), acc: 5 + Math.abs(gauss(2)) });
  const st = build(raw);
  const res = finalizeResult(st)!;
  ok(res != null, 'finalizeResult produce resultado');
  const dCentroid = haversineMeters(P, res);
  // error medio de una sola muestra (post warm-up)
  const singles = raw.slice(4).map(s => haversineMeters(P, offset(s.east, s.north)));
  const meanSingle = singles.reduce((a, b) => a + b, 0) / singles.length;
  ok(dCentroid < meanSingle, `promedio (${dCentroid.toFixed(2)}m) más cerca que muestra media (${meanSingle.toFixed(2)}m)`);
  ok(dCentroid < 2.5, `centroide a < 2.5 m del punto real (${dCentroid.toFixed(2)}m)`);
  ok(res.sampleCount > 40, `usa la mayoría de muestras (${res.sampleCount})`);
  ok(isConverged(st), 'isConverged = true con 60 muestras buenas');
}

// ── 2) Rechazo de outliers (multipath): spikes de 60 m no mueven el centroide
{
  const raw: Array<{ east: number; north: number; acc: number }> = [];
  for (let i = 0; i < 40; i++) raw.push({ east: gauss(3), north: gauss(3), acc: 5 });
  // 3 spikes de multipath
  raw[10] = { east: 60, north: 0, acc: 6 };
  raw[20] = { east: 0, north: -55, acc: 7 };
  raw[30] = { east: 50, north: 50, acc: 6 };
  const res = finalizeResult(build(raw))!;
  ok(haversineMeters(P, res) < 2.5, `outliers descartados, centroide cerca (${haversineMeters(P, res).toFixed(2)}m)`);
}

// ── 3) Gate de exactitud: muestras con accuracy > 25 m no entran
{
  const raw: Array<{ east: number; north: number; acc: number }> = [];
  for (let i = 0; i < 30; i++) raw.push({ east: gauss(3), north: gauss(3), acc: 5 });
  for (let i = 0; i < 10; i++) raw.push({ east: 40 + gauss(5), north: 0, acc: 40 }); // mala accuracy, lejos
  const st = build(raw);
  const stats = computeStats(st.all);
  ok(stats.sampleCount <= 30, `muestras con accuracy>25m excluidas (aceptadas=${stats.sampleCount})`);
  ok(haversineMeters(P, finalizeResult(st)!) < 3, 'centroide no contaminado por las malas');
}

// ── 4) Warm-up: las primeras (en frío, sesgadas) se descartan
{
  const raw: Array<{ east: number; north: number; acc: number }> = [];
  for (let i = 0; i < 4; i++) raw.push({ east: 20, north: 20, acc: 8 });   // primeros 4s, sesgados
  for (let i = 0; i < 30; i++) raw.push({ east: gauss(3), north: gauss(3), acc: 5 });
  const res = finalizeResult(build(raw))!;
  ok(haversineMeters(P, res) < 3, `warm-up descartado, sin sesgo (${haversineMeters(P, res).toFixed(2)}m)`);
}

// ── 5a) Alejamiento real → departed=true, recorta la huida, conserva lo estable
{
  const raw: Array<{ east: number; north: number; acc: number }> = [];
  for (let i = 0; i < 25; i++) raw.push({ east: gauss(2), north: gauss(2), acc: 4 }); // cúmulo estable
  for (let k = 1; k <= 6; k++) raw.push({ east: 8 * k, north: 0, acc: 5 });            // se aleja al Este
  const st = build(raw);
  const dep = detectDeparture(st);
  ok(dep.departed, 'detecta alejamiento sostenido');
  ok(dep.trimFromIndex >= 24 && dep.trimFromIndex <= 28, `trimFromIndex en el borde del cúmulo (${dep.trimFromIndex})`);
  const trimmed = finalizeResult(st, dep.trimFromIndex)!;
  const full = finalizeResult(st)!;
  ok(haversineMeters(P, trimmed) < 5, `resultado recortado cerca del punto (${haversineMeters(P, trimmed).toFixed(2)}m)`);
  ok(haversineMeters(P, trimmed) < haversineMeters(P, full), 'recortado mejor que incluir la huida');
}

// ── 5b) Solo jitter alrededor del punto → NO falso positivo
{
  const raw: Array<{ east: number; north: number; acc: number }> = [];
  for (let i = 0; i < 35; i++) raw.push({ east: gauss(6), north: gauss(6), acc: 6 }); // rebote, sin irse
  ok(!detectDeparture(build(raw)).departed, 'jitter NO dispara alejamiento (sin falso positivo)');
}

// ── 5d) Alejamiento GRADUAL (caminata lenta ~3 m/muestra) → también se detecta
{
  const raw: Array<{ east: number; north: number; acc: number }> = [];
  for (let i = 0; i < 22; i++) raw.push({ east: gauss(2), north: gauss(2), acc: 4 });
  for (let k = 1; k <= 10; k++) raw.push({ east: 3 * k, north: 0, acc: 4 }); // se aleja despacio
  const dep = detectDeparture(build(raw));
  ok(dep.departed, 'detecta alejamiento gradual (caminata lenta)');
}

// ── 5c) Antes de tener cúmulo estable → no evalúa
{
  const raw: Array<{ east: number; north: number; acc: number }> = [];
  for (let i = 0; i < 8; i++) raw.push({ east: gauss(2), north: gauss(2), acc: 4 });
  for (let k = 1; k <= 4; k++) raw.push({ east: 10 * k, north: 0, acc: 5 });
  ok(!detectDeparture(build(raw)).departed, 'no dispara antes de converger (pocas muestras)');
}

console.log(`\n${failed === 0 ? '✅' : '❌'}  ${passed} OK, ${failed} fallos`);
process.exit(failed === 0 ? 0 : 1);
