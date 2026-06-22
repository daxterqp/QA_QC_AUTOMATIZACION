// Genera SVGs de muestra del renderer profesional para inspección visual.
// Ejecutar:  npx -y tsx scripts/sampleCharts.ts   → escribe scripts/out/*.svg
import * as fs from 'fs';
import * as path from 'path';
import { renderChartSvg } from '../src/utils/chartRenderer';
import type { Scope } from '../src/utils/formulaEval';

const outDir = path.join(__dirname, 'out');
fs.mkdirSync(outDir, { recursive: true });

// ── 1. Curva granulométrica (gr5) con huso de especificación ────────────────
const g: Scope = {};
const sizes = [50.8, 38.1, 25.4, 19, 12.7, 9.5, 4.75, 2, 0.425, 0.075];
const pasa  = [97, 92, 82, 70, 55, 42, 30, 18, 8, 3];
const husoLo = [90, 82, 70, 56, 42, 30, 18, 8, 2, 0];
const husoHi = [100, 100, 95, 85, 72, 58, 45, 30, 15, 8];
sizes.forEach((v, i) => { g[`${i + 1}A`] = v; });
pasa.forEach((v, i) => { g[`${i + 1}B`] = v; });
husoLo.forEach((v, i) => { g[`${i + 1}C`] = v; });
husoHi.forEach((v, i) => { g[`${i + 1}D`] = v; });
const refs = (col: string) => Array.from({ length: 10 }, (_, i) => `${i + 1}${col}`);

fs.writeFileSync(path.join(outDir, 'granulometria.svg'), renderChartSvg({
  mode: 'log-x', xRefs: refs('A'), yRefs: refs('B'),
  bandLoRefs: refs('C'), bandHiRefs: refs('D'),
  seriesLabels: ['Muestra'],
  title: 'Curva Granulométrica', xAxisTitle: 'Tamaño de partícula (mm)', yAxisTitle: '% que pasa',
}, g, { width: 640, height: 400 }));

// ── 2. Curva de compactación Proctor (gr1) con ajuste polinómico ────────────
const p: Scope = {};
[8, 10, 12, 14, 16].forEach((v, i) => { p[`${i + 1}A`] = v; });
[1.86, 1.95, 2.0, 1.97, 1.88].forEach((v, i) => { p[`${i + 1}B`] = v; });
const prefs = (col: string) => Array.from({ length: 5 }, (_, i) => `${i + 1}${col}`);

fs.writeFileSync(path.join(outDir, 'proctor.svg'), renderChartSvg({
  mode: 'line', xRefs: prefs('A'), yRefs: prefs('B'),
  fit: 'poli3', seriesLabels: ['Puntos de ensayo'],
  title: 'Curva de Compactación', xAxisTitle: 'Contenido de humedad (%)', yAxisTitle: 'Densidad seca (g/cm³)',
}, p, { width: 640, height: 400 }));

// ── 3. Barras (gr3) ──────────────────────────────────────────────────────────
const b: Scope = { '1A': 1, '2A': 2, '3A': 3, '4A': 4, '1B': 42, '2B': 75, '3B': 61, '4B': 88 };
fs.writeFileSync(path.join(outDir, 'barras.svg'), renderChartSvg({
  mode: 'bars', xRefs: ['1A', '2A', '3A', '4A'], yRefs: ['1B', '2B', '3B', '4B'],
  title: 'Resultados por punto', xAxisTitle: 'Punto', yAxisTitle: 'Valor (%)',
}, b, { width: 640, height: 380 }));

console.log('SVGs escritos en', outDir);
