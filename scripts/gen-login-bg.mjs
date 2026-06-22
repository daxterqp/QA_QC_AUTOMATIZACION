#!/usr/bin/env node
/**
 * gen-login-bg.mjs — Visuales del login MÓVIL (sin deps nativas):
 *   - assets/login-bg.png   : fondo degradado "pro" (navy → azul) + glows suaves + viñeta.
 *   - assets/login-glow.png  : sprite de glow suave (se anima en LoginScreen para dar vida).
 *   - assets/login-btn.png   : degradado del botón "Ingresar".
 *
 * Para REVERTIR al difuminado anterior: `cp assets/login-bg-classic.png assets/login-bg.png`
 * (el clásico tenía líneas diagonales marcadas; este es más suave/profesional).
 *
 * Regenerable: `node scripts/gen-login-bg.mjs`. Rasteriza SVG con sharp.
 */
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WEB = path.join(ROOT, 'flow-qaqc-web');
const W = 1200, H = 2400;

// Líneas diagonales MUY tenues (textura sutil, ya no marcadas).
let lines = '';
for (let i = -H; i < W; i += 200) {
  lines += `<line x1="${i}" y1="0" x2="${i + H}" y2="${H}" />`;
}

const bgSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="g" x1="0.08" y1="0" x2="0.92" y2="1">
      <stop offset="0" stop-color="#0a1830"/>
      <stop offset="0.5" stop-color="#15294c"/>
      <stop offset="1" stop-color="#2b4474"/>
    </linearGradient>
    <radialGradient id="glowTR" cx="0.82" cy="0.1" r="0.65">
      <stop offset="0" stop-color="#6f93cf" stop-opacity="0.38"/>
      <stop offset="1" stop-color="#6f93cf" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="glowBL" cx="0.08" cy="0.95" r="0.7">
      <stop offset="0" stop-color="#081226" stop-opacity="0.55"/>
      <stop offset="1" stop-color="#081226" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="vig" cx="0.5" cy="0.46" r="0.75">
      <stop offset="0.55" stop-color="#060f20" stop-opacity="0"/>
      <stop offset="1" stop-color="#060f20" stop-opacity="0.42"/>
    </radialGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#g)"/>
  <g stroke="#ffffff" stroke-opacity="0.02" stroke-width="2">${lines}</g>
  <rect width="${W}" height="${H}" fill="url(#glowTR)"/>
  <rect width="${W}" height="${H}" fill="url(#glowBL)"/>
  <rect width="${W}" height="${H}" fill="url(#vig)"/>
</svg>`;

// Sprite de glow suave (se desplaza/late en el login para un difuminado "cambiante").
const GW = 700;
const glowSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${GW}" height="${GW}" viewBox="0 0 ${GW} ${GW}">
  <defs>
    <radialGradient id="r" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0" stop-color="#7ba0dd" stop-opacity="0.5"/>
      <stop offset="0.6" stop-color="#7ba0dd" stop-opacity="0.12"/>
      <stop offset="1" stop-color="#7ba0dd" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${GW}" height="${GW}" fill="url(#r)"/>
</svg>`;

// Degradado horizontal del botón "Ingresar".
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

async function resolveSharp() {
  try { return (await import('sharp')).default; } catch {}
  try { return createRequire(path.join(WEB, 'package.json'))('sharp'); } catch { return null; }
}

const sharp = await resolveSharp();
if (!sharp) { console.error('[gen-login-bg] sharp no disponible'); process.exit(1); }

async function emit(svg, rel, w, h) {
  const png = await sharp(Buffer.from(svg)).png().toBuffer();
  await fs.writeFile(path.join(ROOT, rel), png);
  console.log(`[gen-login-bg] ✓ ${rel} (${w}x${h}, ${(png.length / 1024).toFixed(0)} KB)`);
}

await emit(bgSvg, 'assets/login-bg.png', W, H);
await emit(glowSvg, 'assets/login-glow.png', GW, GW);
await emit(btnSvg, 'assets/login-btn.png', BW, BH);
