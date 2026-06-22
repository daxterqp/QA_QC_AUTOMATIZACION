#!/usr/bin/env node
/**
 * sync-brand.mjs — Logo ÚNICO (single source of truth).
 *
 * El usuario mantiene UN solo archivo: `brand/logo-login.svg`.
 * Este script lo propaga a los dos consumidores (que compilan por separado):
 *   - Web  : flow-qaqc-web/public/logo-login.svg  (+ .png)
 *   - Móvil: assets/logo-login.png  (React Native necesita raster)
 *
 * Si `sharp` está disponible (viene con la web), rasteriza el SVG → PNG nítido.
 * Si no, usa `brand/logo-login.png` como raster maestro (exportá uno cuando
 * cambies el SVG). En ambos casos: cambiás el SVG, corrés `npm run sync:logo`,
 * y queda igual en móvil + web.
 */
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WEB = path.join(ROOT, 'flow-qaqc-web');

const MASTER_SVG = path.join(ROOT, 'brand', 'logo-login.svg');
const MASTER_PNG = path.join(ROOT, 'brand', 'logo-login.png');
const WEB_SVG = path.join(WEB, 'public', 'logo-login.svg');
const WEB_PNG = path.join(WEB, 'public', 'logo-login.png');
const MOBILE_PNG = path.join(ROOT, 'assets', 'logo-login.png');

const PNG_SIZE = 512; // suficiente para retina del login

async function exists(p) { try { await fs.access(p); return true; } catch { return false; } }

async function resolveSharp() {
  // sharp no está en la raíz; intentamos resolverlo desde la web.
  try { return (await import('sharp')).default; } catch { /* sigue */ }
  try {
    const webRequire = createRequire(path.join(WEB, 'package.json'));
    return webRequire('sharp');
  } catch { return null; }
}

async function main() {
  if (!(await exists(MASTER_SVG))) {
    console.error(`[sync-brand] Falta el maestro: ${MASTER_SVG}`);
    process.exit(1);
  }

  // 1) SVG → web public (copia directa).
  await fs.copyFile(MASTER_SVG, WEB_SVG);
  console.log(`[sync-brand] SVG → ${path.relative(ROOT, WEB_SVG)}`);

  // 2) PNG para web + móvil.
  const sharp = await resolveSharp();
  if (sharp) {
    const png = await sharp(await fs.readFile(MASTER_SVG), { density: 384 })
      .resize(PNG_SIZE, PNG_SIZE, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toBuffer();
    await fs.writeFile(WEB_PNG, png);
    await fs.writeFile(MOBILE_PNG, png);
    // refrescamos el PNG maestro también, para que el fallback futuro sea correcto.
    await fs.writeFile(MASTER_PNG, png);
    console.log(`[sync-brand] PNG (sharp, ${PNG_SIZE}px) → web + móvil + brand maestro`);
  } else if (await exists(MASTER_PNG)) {
    await fs.copyFile(MASTER_PNG, WEB_PNG);
    await fs.copyFile(MASTER_PNG, MOBILE_PNG);
    console.log('[sync-brand] sharp no disponible → copiado brand/logo-login.png a web + móvil');
    console.log('[sync-brand] (si cambiaste el SVG, exportá un PNG nuevo a brand/logo-login.png)');
  } else {
    console.error('[sync-brand] No hay sharp ni brand/logo-login.png para el raster del móvil.');
    process.exit(1);
  }

  console.log('[sync-brand] ✓ Logo sincronizado.');
}

main().catch((e) => { console.error('[sync-brand] Error:', e); process.exit(1); });
