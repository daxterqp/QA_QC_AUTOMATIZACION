import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { readGeoTiffGeo, processOrthophotoTiles, readKmlGroundOverlay } from '@lib/orthophotoServer';
import { getServerUser } from '@lib/serverAuth';

// Procesa la ortofoto EN LA PC: lee la georreferencia del GeoTIFF (si la trae),
// reescala + recomprime a WebP con sharp (libvips, poca RAM) y deja la versión
// liviana en staging local. NO sube nada todavía — devuelve pesos + preview +
// coordenadas + un `stageToken` para que el commit suba EXACTAMENTE este resultado.
//
// Recibe SOLO la ruta local del archivo (string) — el archivo de varios GB se
// lee del disco; nunca viaja por HTTP.

export const runtime = 'nodejs';
export const maxDuration = 600;

const LOCAL_BASE = process.env.LOCAL_PLANS_CACHE ?? 'D:\\Flow-QAQC';

function sanitize(text: string): string {
  return text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9._-]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '').slice(0, 60);
}

export async function POST(req: NextRequest) {
  const user = await getServerUser();
  if (!user) return new Response('Unauthorized', { status: 401 });

  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'JSON inválido' }, { status: 400 }); }
  const srcPath: string = body?.srcPath;
  const projectName: string = body?.projectName;
  const maxDim: number = Math.min(16383, Math.max(1024, Number(body?.maxDim) || 8192));
  const quality: number = Math.min(100, Math.max(40, Number(body?.quality) || 80));
  const grid: number = Math.min(3, Math.max(1, Number(body?.grid) || 1)); // 1=simple, 2=2×2, 3=3×3

  if (!srcPath || !projectName) return NextResponse.json({ error: 'Faltan parámetros' }, { status: 400 });
  let isFile = false;
  try { isFile = fs.statSync(srcPath).isFile(); } catch { /* no existe */ }
  if (!isFile) return NextResponse.json({ error: `No existe el archivo: ${srcPath}` }, { status: 400 });

  const stageDir = path.join(LOCAL_BASE, sanitize(projectName), 'orthophoto');
  try { fs.mkdirSync(stageDir, { recursive: true }); } catch { /* ignore */ }

  // M1 — staging con token único (evita carrera entre dos "procesar" y que el
  // commit suba un staging viejo/abandonado). Limpiamos stagings previos.
  try {
    for (const f of fs.readdirSync(stageDir)) {
      if (/^_staging-.*\.webp$/.test(f)) { try { fs.unlinkSync(path.join(stageDir, f)); } catch { /* ignore */ } }
    }
  } catch { /* ignore */ }
  const stageToken = randomUUID();

  let srcBytes = 0;
  try { srcBytes = fs.statSync(srcPath).size; } catch { /* ignore */ }

  const ext = path.extname(srcPath).toLowerCase();
  let tempToCleanup: string | null = null;
  try {
    let geo: { bounds: any; systemLabel: string; epsg: number | null } | null = null;
    let imageToProcess = srcPath;

    if (ext === '.kml' || ext === '.kmz') {
      // KML/KMZ: la georreferencia (LatLonBox) y la imagen vienen en el archivo.
      const kml = await readKmlGroundOverlay(srcPath, stageDir);
      geo = { bounds: kml.bounds, systemLabel: kml.systemLabel, epsg: 4326 };
      imageToProcess = kml.imagePath;
      if (kml.isTemp) tempToCleanup = kml.imagePath;
    } else {
      geo = await readGeoTiffGeo(srcPath); // null si el TIFF no trae georreferencia
    }

    const proc = await processOrthophotoTiles(imageToProcess, stageDir, stageToken, grid, maxDim, quality);
    return NextResponse.json({
      ok: true,
      srcBytes,
      stageToken,
      grid,
      geo,                       // { bounds, systemLabel, epsg } | null
      ...proc,                   // tiles[], srcWidth, srcHeight, outBytesTotal, previewDataUrl
    });
  } catch (e) {
    return NextResponse.json({ error: `No se pudo procesar la imagen: ${(e as Error).message}` }, { status: 500 });
  } finally {
    if (tempToCleanup) { try { fs.unlinkSync(tempToCleanup); } catch { /* ignore */ } }
  }
}
