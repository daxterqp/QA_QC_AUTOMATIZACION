/**
 * orthophotoCustomGeoref.ts — Georreferenciación de una ortofoto en un SISTEMA
 * PROPIO mediante PUNTOS DE CONTROL.
 *
 * El usuario da N≥2 pares de puntos: (coordenada en el sistema propio) ↔ (WGS84).
 * Ajustamos una transformación 2D de SEMEJANZA (rotación + escala UNIFORME +
 * traslación, "Helmert 2D") por mínimos cuadrados. Es el modelo correcto para la
 * diferencia entre datums/sistemas (sin shear), y se puede representar igual en:
 *   - Web (Leaflet): overlay rotado por 3/4 esquinas.
 *   - Móvil Android (react-native-maps): Overlay con bounds + bearing (rotación).
 *
 * Flujo: el GeoTIFF trae sus 4 esquinas en el sistema PROPIO → se transforman a
 * WGS84 con esta semejanza → se obtiene el rectángulo rotado (centro, lado, rumbo)
 * + las 4 esquinas WGS84 para pintar.
 *
 * También se expone `fitAffine` (6 parámetros, con shear) para usar SOLO en web si
 * algún día se quiere deformación libre; el móvil no lo soporta.
 */

export interface XY { x: number; y: number }            // sistema propio (este/norte u otro)
export interface LngLat { lng: number; lat: number }    // WGS84
export interface ControlPoint { src: XY; dst: LngLat }  // propio ↔ WGS84

/** Semejanza 2D: [lng,lat] = [a·x − b·y + tx,  b·x + a·y + ty]. (a=s·cosθ, b=s·sinθ) */
export interface Similarity { a: number; b: number; tx: number; ty: number }

/** Ajusta una semejanza 2D (rotación + escala + traslación) por mínimos cuadrados.
 *  Requiere ≥2 puntos NO coincidentes. Devuelve null si es degenerado. */
export function fitSimilarity(pts: ControlPoint[]): Similarity | null {
  const n = pts.length;
  if (n < 2) return null;
  let sx = 0, sy = 0, sX = 0, sY = 0;
  for (const p of pts) { sx += p.src.x; sy += p.src.y; sX += p.dst.lng; sY += p.dst.lat; }
  const mx = sx / n, my = sy / n, mX = sX / n, mY = sY / n;
  let Sxx = 0, Sxy = 0, num1 = 0, num2 = 0;
  for (const p of pts) {
    const dx = p.src.x - mx, dy = p.src.y - my;
    const dX = p.dst.lng - mX, dY = p.dst.lat - mY;
    Sxx += dx * dx + dy * dy;
    num1 += dX * dx + dY * dy;   // → a
    num2 += dY * dx - dX * dy;   // → b
  }
  if (!(Sxx > 1e-20)) return null;
  const a = num1 / Sxx;
  const b = num2 / Sxx;
  const tx = mX - (a * mx - b * my);
  const ty = mY - (b * mx + a * my);
  if (![a, b, tx, ty].every(Number.isFinite)) return null;
  return { a, b, tx, ty };
}

export function applySimilarity(T: Similarity, p: XY): LngLat {
  return { lng: T.a * p.x - T.b * p.y + T.tx, lat: T.b * p.x + T.a * p.y + T.ty };
}

/** Error RMS (en grados WGS84) del ajuste sobre sus propios puntos — para mostrar
 *  al usuario qué tan bien encajaron los puntos de control. */
export function similarityRmsError(T: Similarity, pts: ControlPoint[]): number {
  if (pts.length === 0) return 0;
  let s = 0;
  for (const p of pts) {
    const q = applySimilarity(T, p.src);
    s += (q.lng - p.dst.lng) ** 2 + (q.lat - p.dst.lat) ** 2;
  }
  return Math.sqrt(s / pts.length);
}

/** Escala (grados WGS84 por unidad del sistema propio) y rotación (grados) de la
 *  semejanza. La rotación es el rumbo respecto al norte. */
export function similarityScaleRotation(T: Similarity): { scale: number; rotationDeg: number } {
  return { scale: Math.hypot(T.a, T.b), rotationDeg: (Math.atan2(T.b, T.a) * 180) / Math.PI };
}

/** Afín 6-parámetros (con shear) — SOLO para web (móvil no la soporta). Resuelve
 *  por mínimos cuadrados las dos filas [lng; lat] = M·[x;y;1]. Requiere ≥3 puntos. */
export interface Affine { m: [number, number, number, number, number, number] } // a b tx c d ty
export function fitAffine(pts: ControlPoint[]): Affine | null {
  if (pts.length < 3) return null;
  // Normales 3×3 para cada fila (comparten la misma matriz A^T A).
  const N = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  const r1 = [0, 0, 0], r2 = [0, 0, 0];
  for (const p of pts) {
    const v = [p.src.x, p.src.y, 1];
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) N[i][j] += v[i] * v[j];
      r1[i] += v[i] * p.dst.lng;
      r2[i] += v[i] * p.dst.lat;
    }
  }
  const solve = (A: number[][], y: number[]): number[] | null => {
    const M = A.map((row, i) => [...row, y[i]]);
    for (let c = 0; c < 3; c++) {
      let piv = c;
      for (let r = c + 1; r < 3; r++) if (Math.abs(M[r][c]) > Math.abs(M[piv][c])) piv = r;
      if (Math.abs(M[piv][c]) < 1e-15) return null;
      [M[c], M[piv]] = [M[piv], M[c]];
      for (let r = 0; r < 3; r++) {
        if (r === c) continue;
        const f = M[r][c] / M[c][c];
        for (let k = c; k <= 3; k++) M[r][k] -= f * M[c][k];
      }
    }
    return [M[0][3] / M[0][0], M[1][3] / M[1][1], M[2][3] / M[2][2]];
  };
  const s1 = solve(N.map(r => [...r]), r1);
  const s2 = solve(N.map(r => [...r]), r2);
  if (!s1 || !s2) return null;
  return { m: [s1[0], s1[1], s1[2], s2[0], s2[1], s2[2]] };
}
export function applyAffine(T: Affine, p: XY): LngLat {
  const [a, b, tx, c, d, ty] = T.m;
  return { lng: a * p.x + b * p.y + tx, lat: c * p.x + d * p.y + ty };
}

// ── Georreferencia MÉTRICA por puntos de control → overlay rotado ───────────
// Un grid topográfico propio se relaciona con WGS84 por una semejanza MÉTRICA
// (rotación + escala uniforme + traslación, en metros). Ajustarla en metros (no
// en grados) hace que la imagen sea un RECTÁNGULO real → web (3 esquinas) y
// móvil (bounds + bearing) coinciden exacto, y el RMS sale en metros.
//
// Flujo: control points (customXY ↔ WGS84) → fit métrico → con el bbox del
// GeoTIFF (4 esquinas en sistema propio) producimos el overlay rotado.

export interface RawBbox { minX: number; minY: number; maxX: number; maxY: number }
export interface Corners4 { tl: LngLat; tr: LngLat; br: LngLat; bl: LngLat }
export interface BoundsSWNE { south: number; west: number; north: number; east: number }

/** Semejanza métrica: T mapea customXY → metros locales alrededor de `origin`. */
export interface MetricGeoref { T: Similarity; origin: LngLat }

export interface RotatedOverlay {
  /** 4 esquinas WGS84 del rectángulo rotado (tl=oeste-norte, sentido horario). */
  corners: Corners4;
  /** Centro WGS84 del rectángulo. */
  center: LngLat;
  /** Rumbo de la imagen, grados CW desde el norte (para react-native-maps). */
  bearingDeg: number;
  /** Bounds "north-up" (sin rotar) para el `bounds` de react-native-maps Overlay. */
  northUpBounds: BoundsSWNE;
  /** Envolvente axis-aligned de las 4 esquinas (para encuadre / fallback). */
  envelope: BoundsSWNE;
}

const DEG = Math.PI / 180;
const MPERLAT = 110540;                         // metros por grado de latitud (aprox.)
const mPerLng = (lat: number) => 111320 * Math.cos(lat * DEG); // metros por grado de longitud

/** Ajusta la georreferencia métrica desde ≥2 puntos de control y devuelve el
 *  RMS en metros. `origin` = centroide WGS84 de los puntos (plano local). */
export function fitMetricGeoref(pts: ControlPoint[]): { georef: MetricGeoref; rmsMeters: number } | null {
  if (pts.length < 2) return null;
  let lng0 = 0, lat0 = 0;
  for (const p of pts) { lng0 += p.dst.lng; lat0 += p.dst.lat; }
  lng0 /= pts.length; lat0 /= pts.length;
  const mLng = mPerLng(lat0);
  // Reusa fitSimilarity tratando dst como metros locales (lng→este, lat→norte).
  const metricPts: ControlPoint[] = pts.map(p => ({
    src: p.src,
    dst: { lng: (p.dst.lng - lng0) * mLng, lat: (p.dst.lat - lat0) * MPERLAT },
  }));
  const T = fitSimilarity(metricPts);
  if (!T) return null;
  const georef: MetricGeoref = { T, origin: { lng: lng0, lat: lat0 } };
  return { georef, rmsMeters: metricRmsError(georef, pts) };
}

/** customXY → WGS84 usando la georreferencia métrica. */
export function metricApply(g: MetricGeoref, p: XY): LngLat {
  const m = applySimilarity(g.T, p);            // {lng:este_m, lat:norte_m}
  const mLng = mPerLng(g.origin.lat);
  return { lng: g.origin.lng + m.lng / mLng, lat: g.origin.lat + m.lat / MPERLAT };
}

/** RMS del ajuste, en METROS — para mostrarle al usuario qué tan bien encajó. */
export function metricRmsError(g: MetricGeoref, pts: ControlPoint[]): number {
  if (pts.length === 0) return 0;
  const mLng = mPerLng(g.origin.lat);
  let s = 0;
  for (const p of pts) {
    const q = metricApply(g, p.src);
    const de = (q.lng - p.dst.lng) * mLng, dn = (q.lat - p.dst.lat) * MPERLAT;
    s += de * de + dn * dn;
  }
  return Math.sqrt(s / pts.length);
}

/** Geometría del overlay (centro, rumbo, bounds, envolvente) desde 4 esquinas. */
export function cornersToRotatedOverlay(corners: Corners4): RotatedOverlay {
  const { tl, tr, br, bl } = corners;
  const center: LngLat = {
    lng: (tl.lng + tr.lng + br.lng + bl.lng) / 4,
    lat: (tl.lat + tr.lat + br.lat + bl.lat) / 4,
  };
  const mLng = mPerLng(center.lat);
  const toM = (p: LngLat) => ({ e: (p.lng - center.lng) * mLng, n: (p.lat - center.lat) * MPERLAT });
  const backLng = (e: number) => center.lng + e / mLng;
  const backLat = (n: number) => center.lat + n / MPERLAT;

  // Rumbo: la arista superior (tl→tr) apunta al "este de la imagen"; en una
  // imagen north-up eso es 90°. bearing = rumboArista − 90.
  const mtl = toM(tl), mtr = toM(tr), mbl = toM(bl);
  const topBearing = Math.atan2(mtr.e - mtl.e, mtr.n - mtl.n) / DEG;
  const bearingDeg = ((topBearing - 90) % 360 + 360) % 360;

  const w = Math.hypot(mtr.e - mtl.e, mtr.n - mtl.n);
  const h = Math.hypot(mbl.e - mtl.e, mbl.n - mtl.n);
  const northUpBounds: BoundsSWNE = {
    west: backLng(-w / 2), east: backLng(w / 2),
    south: backLat(-h / 2), north: backLat(h / 2),
  };

  const lats = [tl.lat, tr.lat, br.lat, bl.lat], lngs = [tl.lng, tr.lng, br.lng, bl.lng];
  const envelope: BoundsSWNE = {
    south: Math.min(...lats), north: Math.max(...lats),
    west: Math.min(...lngs), east: Math.max(...lngs),
  };
  return { corners, center, bearingDeg, northUpBounds, envelope };
}

/** GeoTIFF bbox (sistema propio) + georef métrica → overlay rotado WGS84. */
export function metricToRotatedOverlay(g: MetricGeoref, bbox: RawBbox): RotatedOverlay {
  // top-left = (minX, maxY): el GeoTIFF tiene fila 0 = norte.
  return cornersToRotatedOverlay({
    tl: metricApply(g, { x: bbox.minX, y: bbox.maxY }),
    tr: metricApply(g, { x: bbox.maxX, y: bbox.maxY }),
    br: metricApply(g, { x: bbox.maxX, y: bbox.minY }),
    bl: metricApply(g, { x: bbox.minX, y: bbox.minY }),
  });
}

/** Rota un punto (lng/lat) `bearingDeg` grados CW alrededor de `center`, en el
 *  plano métrico local. Para tests y para reconstruir esquinas desde
 *  bounds+bearing si hiciera falta. */
export function rotateAroundCenter(p: LngLat, center: LngLat, bearingDeg: number): LngLat {
  const mLng = mPerLng(center.lat);
  const e = (p.lng - center.lng) * mLng, n = (p.lat - center.lat) * MPERLAT;
  const r = -bearingDeg * DEG; // CW positivo → rotación horaria del punto
  const er = e * Math.cos(r) - n * Math.sin(r);
  const nr = e * Math.sin(r) + n * Math.cos(r);
  return { lng: center.lng + er / mLng, lat: center.lat + nr / MPERLAT };
}
