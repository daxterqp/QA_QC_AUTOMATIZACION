// Prueba funcional del pipeline de ortofotos (corre en Node, en la web).
//   node scripts/orthophotoGeoTest.mjs
import fs from 'fs';
import path from 'path';
import os from 'os';
import sharp from 'sharp';
import { fromArrayBuffer, writeArrayBuffer } from 'geotiff';
import proj4 from 'proj4';
import JSZip from 'jszip';
import { readGeoTiffGeo, processOrthophoto, processOrthophotoTiles, readKmlGroundOverlay } from '../lib/orthophotoServer.ts';

let pass = 0, fail = 0;
const ok = (c, name, d) => { if (c) { pass++; console.log('  ✓', name); } else { fail++; console.error('  ✗', name, '—', d ?? ''); } };
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ortho-'));

// ── 1) Procesamiento con sharp: TIFF plano grande → WebP reducido ────────────
{
  const srcTif = path.join(tmp, 'plain.tif');
  // 4000×3000 gradiente → TIFF (sin geo).
  await sharp({ create: { width: 4000, height: 3000, channels: 3, background: { r: 120, g: 160, b: 90 } } })
    .tiff().toFile(srcTif);
  const stage = path.join(tmp, 'stage.webp');
  const r = await processOrthophoto(srcTif, stage, 2048, 80);
  ok(fs.existsSync(stage) && r.outBytes > 0, 'sharp produce WebP', JSON.stringify({ outBytes: r.outBytes }));
  ok(Math.max(r.outWidth, r.outHeight) <= 2048, 'lado largo capado a 2048', `${r.outWidth}x${r.outHeight}`);
  ok(r.outWidth === 2048 && r.outHeight === 1536, 'mantiene proporción 4:3', `${r.outWidth}x${r.outHeight}`);
  ok(r.previewDataUrl.startsWith('data:image/webp;base64,'), 'genera preview dataURL');
  // TIFF plano sin geo → readGeoTiffGeo null (cae a esquinas manuales)
  const geo = await readGeoTiffGeo(srcTif);
  ok(geo === null, 'TIFF sin geo → null (fallback manual)');
}

// ── 2) Lectura de georreferencia de un GeoTIFF (WGS84 UTM 19S → WGS84) ────────
{
  // Arequipa aprox: lat -16.40, lng -71.54. Convertimos a UTM 19S (EPSG:32719).
  proj4.defs('EPSG:32719', '+proj=utm +zone=19 +south +datum=WGS84 +units=m +no_defs');
  const [originE, originN] = proj4('EPSG:4326', 'EPSG:32719', [-71.54, -16.40]); // esquina sup-izq
  const px = 0.5; // 0.5 m/píxel
  const w = 400, h = 300;
  const values = new Uint8Array(w * h).fill(128);
  const ab = await writeArrayBuffer(values, {
    width: w, height: h,
    ModelPixelScale: [px, px, 0],
    // tiepoint: pixel (0,0) → (originE, originN). En GeoTIFF la fila 0 es el norte.
    ModelTiepoint: [0, 0, 0, originE, originN, 0],
    GeoKeyDirectory: undefined, // geotiff arma las geokeys desde los campos de abajo
    ProjectedCSTypeGeoKey: 32719,
    GTModelTypeGeoKey: 1,        // projected
    GTRasterTypeGeoKey: 1,
    photometricInterpretation: 1,
    BitsPerSample: [8],
    SamplesPerPixel: 1,
  });
  const geoTif = path.join(tmp, 'geo.tif');
  fs.writeFileSync(geoTif, Buffer.from(ab));

  // sanity: geotiff puede releerlo
  const reread = await fromArrayBuffer(ab);
  const img = await reread.getImage();
  ok(img.getWidth() === w, 'GeoTIFF escrito/leído');

  const geo = await readGeoTiffGeo(geoTif);
  ok(geo !== null, 'lee georreferencia del GeoTIFF', JSON.stringify(geo));
  if (geo) {
    const [[sLat, wLng], [nLat, eLng]] = geo.bounds;
    // El área (~200×150 m) debe caer cerca de Arequipa.
    ok(nLat <= -16.39 && sLat >= -16.41, `lat en rango Arequipa (${sLat.toFixed(4)}..${nLat.toFixed(4)})`);
    ok(wLng >= -71.55 && eLng <= -71.53, `lng en rango Arequipa (${wLng.toFixed(4)}..${eLng.toFixed(4)})`);
    ok(geo.epsg === 32719, `EPSG detectado 32719 (${geo.epsg})`);
  }
}

// ── 3) KMZ (GroundOverlay): lee bounds del LatLonBox + imagen embebida ───────
{
  const box = { north: -16.39, south: -16.41, east: -71.53, west: -71.55 };
  const png = await sharp({ create: { width: 300, height: 200, channels: 3, background: { r: 100, g: 140, b: 80 } } }).png().toBuffer();
  const kml = `<?xml version="1.0"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document><GroundOverlay>
    <name>orto</name><Icon><href>overlay.png</href></Icon>
    <LatLonBox><north>${box.north}</north><south>${box.south}</south><east>${box.east}</east><west>${box.west}</west></LatLonBox>
    </GroundOverlay></Document></kml>`;
  const zip = new JSZip();
  zip.file('doc.kml', kml);
  zip.file('overlay.png', png);
  const kmzBuf = await zip.generateAsync({ type: 'nodebuffer' });
  const kmzPath = path.join(tmp, 'orto.kmz');
  fs.writeFileSync(kmzPath, kmzBuf);

  const ov = await readKmlGroundOverlay(kmzPath, tmp);
  ok(ov != null && ov.imagePath && fs.existsSync(ov.imagePath), 'KMZ: extrae imagen embebida', ov?.imagePath);
  const [[s, w], [n, e]] = ov.bounds;
  ok(Math.abs(s - box.south) < 1e-9 && Math.abs(w - box.west) < 1e-9 && Math.abs(n - box.north) < 1e-9 && Math.abs(e - box.east) < 1e-9,
    'KMZ: bounds = LatLonBox', JSON.stringify(ov.bounds));
  // y la imagen extraída se puede procesar a webp
  const out = path.join(tmp, 'kmz-stage.webp');
  const proc = await processOrthophoto(ov.imagePath, out, 1024, 80);
  ok(fs.existsSync(out) && proc.outBytes > 0, 'KMZ: imagen procesable a WebP');
}

// ── 4) Teselado NxN: parte el origen en grilla y produce N×N WebP ────────────
{
  const srcTif = path.join(tmp, 'big.tif');
  await sharp({ create: { width: 4000, height: 3000, channels: 3, background: { r: 90, g: 120, b: 200 } } }).tiff().toFile(srcTif);
  const token = 'tok2x2';
  const res = await processOrthophotoTiles(srcTif, tmp, token, 2, 2048, 85);
  ok(res.tiles.length === 4, '2×2 → 4 teselas', String(res.tiles.length));
  let allExist = true;
  for (const t of res.tiles) {
    const f = path.join(tmp, `_staging-${token}-${t.r}-${t.c}.webp`);
    if (!fs.existsSync(f)) allExist = false;
  }
  ok(allExist, 'las 4 teselas existen en staging');
  // cada tesela ~ mitad del origen (2000×1500), capada a 2048 → ~2000×1500
  ok(res.tiles.every(t => t.width <= 2048 && t.height <= 2048 && t.width > 0), 'teselas dentro del cap por pieza', JSON.stringify(res.tiles.map(t => `${t.width}x${t.height}`)));
  ok(res.outBytesTotal > 0 && res.previewDataUrl.startsWith('data:image/webp'), 'total de bytes + preview');
  // grid 3 → 9 teselas
  const res3 = await processOrthophotoTiles(srcTif, tmp, 'tok3x3', 3, 1024, 85);
  ok(res3.tiles.length === 9, '3×3 → 9 teselas', String(res3.tiles.length));
}

try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* Windows file lock — ignore */ }
console.log(`\n${fail === 0 ? '✅' : '❌'}  ${pass} OK, ${fail} fallos`);
process.exit(fail === 0 ? 0 : 1);
