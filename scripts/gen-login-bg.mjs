#!/usr/bin/env node
/**
 * gen-login-bg.mjs — Genera el fondo degradado del login MÓVIL (assets/login-bg.png).
 * Evita depender de `expo-linear-gradient` (módulo nativo → requeriría rebuild del
 * dev-client). Rasteriza un SVG (gradiente navy→azul + glows + líneas tipo plano)
 * con sharp. Regenerable: `node scripts/gen-login-bg.mjs`.
 */
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WEB = path.join(ROOT, 'flow-qaqc-web');
const OUT = path.join(ROOT, 'assets', 'login-bg.png');
const W = 1200, H = 2400;

// Líneas diagonales tenues (vibe "plano técnico").
let lines = '';
for (let i = -H; i < W; i += 120) {
  lines += `<line x1="${i}" y1="0" x2="${i + H}" y2="${H}" />`;
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#0b1a30"/>
      <stop offset="0.55" stop-color="#16315a"/>
      <stop offset="1" stop-color="#394e7d"/>
    </linearGradient>
    <radialGradient id="glow1" cx="0.82" cy="0.12" r="0.55">
      <stop offset="0" stop-color="#668abc" stop-opacity="0.45"/>
      <stop offset="1" stop-color="#668abc" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="glow2" cx="0.08" cy="0.92" r="0.6">
      <stop offset="0" stop-color="#0b1a30" stop-opacity="0.55"/>
      <stop offset="1" stop-color="#0b1a30" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#g)"/>
  <g stroke="#ffffff" stroke-opacity="0.035" stroke-width="2">${lines}</g>
  <rect width="${W}" height="${H}" fill="url(#glow1)"/>
  <rect width="${W}" height="${H}" fill="url(#glow2)"/>
</svg>`;

async function resolveSharp() {
  try { return (await import('sharp')).default; } catch {}
  try { return createRequire(path.join(WEB, 'package.json'))('sharp'); } catch { return null; }
}

// Degradado horizontal para el botón "Ingresar" (cara de la app).
const BW = 900, BH = 150;
const btnSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${BW}" height="${BH}" viewBox="0 0 ${BW} ${BH}">
  <defs>
    <linearGradient id="b" x1="0" y1="0" x2="1" y2="0.35">
      <stop offset="0" stop-color="#243a68"/>
      <stop offset="0.5" stop-color="#394e7d"/>
      <stop offset="1" stop-color="#5e82bd"/>
    </linearGradient>
    <linearGradient id="sheen" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#ffffff" stop-opacity="0.18"/>
      <stop offset="0.5" stop-color="#ffffff" stop-opacity="0"/>
    </linearGradient>
  </defs>
  <rect width="${BW}" height="${BH}" fill="url(#b)"/>
  <rect width="${BW}" height="${BH}" fill="url(#sheen)"/>
</svg>`;

const sharp = await resolveSharp();
if (!sharp) { console.error('[gen-login-bg] sharp no disponible'); process.exit(1); }
const png = await sharp(Buffer.from(svg)).png().toBuffer();
await fs.writeFile(OUT, png);
console.log(`[gen-login-bg] ✓ ${path.relative(ROOT, OUT)} (${W}x${H}, ${(png.length / 1024).toFixed(0)} KB)`);

const BTN_OUT = path.join(ROOT, 'assets', 'login-btn.png');
const btnPng = await sharp(Buffer.from(btnSvg)).png().toBuffer();
await fs.writeFile(BTN_OUT, btnPng);
console.log(`[gen-login-bg] ✓ ${path.relative(ROOT, BTN_OUT)} (${BW}x${BH}, ${(btnPng.length / 1024).toFixed(0)} KB)`);
