/**
 * gpsAveraging — Promediado de waypoints para captura GPS de máxima precisión
 * desde el celular (sin hardware extra). Funciones PURAS y testeables sin RN.
 *
 * Idea: una sola lectura tiene error aleatorio (~3-8 m, peor con multipath). Al
 * tomar muchas muestras de alta precisión sobre el MISMO punto, filtrarlas y
 * promediarlas con peso por exactitud, el error aleatorio se cancela y la
 * posición final baja a ~1-3 m.
 *
 * Pipeline por muestra: warm-up (descartar los primeros segundos) → gate de
 * exactitud (descartar accuracy mala) → centroide ponderado (1/accuracy²) →
 * rechazo de outliers (multipath) → precisión = dispersión RMS al centroide.
 *
 * Además `detectDeparture`: si el usuario se ALEJA del punto sin guardar (olvidó
 * el botón), detecta el movimiento sostenido (con confianza, no por jitter) para
 * cortar la medición y descartar las lecturas de la "huida".
 */

import { haversineMeters } from './gpsDedup';

// ── Parámetros (exportados para tuning/tests) ───────────────────────────────
export const WARMUP_MS = 4000;          // ignora los primeros ~4 s (fix en frío)
export const ACCURACY_GATE_M = 25;      // descarta muestras con accuracy peor a esto
export const ACCURACY_FLOOR_M = 1;      // suelo del peso (no sobre-confiar en accuracy<1m)
export const OUTLIER_SIGMA = 2;         // descarta muestras a > 2σ del centroide
export const OUTLIER_FLOOR_M = 4;       // pero nunca por debajo de 4 m (evita borrar todo)
export const CONVERGE_THRESHOLD_M = 3;  // precisión objetivo para "convergido"
export const CONVERGE_MIN_SAMPLES = 20; // mínimo de muestras aceptadas para convergir
// Detección de alejamiento (ventana con tendencia monótona — robusta a falsos
// positivos: el jitter al estar parado NO es monótono; alejarse SÍ).
export const DEP_WINDOW = 6;            // ventana de muestras recientes a analizar
export const DEP_MIN_STABLE = 18;       // necesita un centroide estable antes de evaluar
export const DEP_FLOOR_M = 8;           // radio mínimo de salida
export const DEP_SIGMA_MULT = 5;        // radio de salida = max(FLOOR, MULT × dispersión)
export const DEP_NET_DELTA_M = 6;       // incremento neto de distancia en la ventana
export const DEP_DIP_TOL_M = 1.5;       // tolerancia de bajada puntual
export const DEP_MAX_DIPS = 1;          // bajadas permitidas dentro de la ventana

export interface GpsSample {
  lat: number;
  lng: number;
  accuracyM: number | null;
  t: number; // capturedAt (ms epoch)
}

export interface AveragingState {
  /** Todas las muestras recibidas, en orden (para indexar la corrida de huida). */
  all: GpsSample[];
}

export const PRECISION_FLOOR_M = 0.5;   // no reportar precisión irrealmente buena

export interface AveragingStats {
  centroid: { lat: number; lng: number } | null;
  /** Precisión del punto PROMEDIADO = error estándar de la media
   *  (dispersión/√N, con suelo). Es lo que se muestra/guarda y converge. */
  precisionM: number | null;
  /** Dispersión RMS de la nube de muestras (1σ del scatter) — usada para el
   *  radio de detección de alejamiento, NO como precisión del promedio. */
  dispersionM: number | null;
  meanAccuracyM: number | null;
  bestAccuracyM: number | null;
  sampleCount: number;         // muestras ACEPTADAS (post warm-up/gate/outliers)
}

export interface GpsAveragedResult {
  lat: number;
  lng: number;
  accuracyM: number | null;    // = precisionM (nuestra confianza real)
  capturedAt: number;
  method: 'averaged';
  sampleCount: number;
  precisionM: number;
  bestAccuracyM: number | null;
}

export const emptyState = (): AveragingState => ({ all: [] });
export const addSample = (state: AveragingState, s: GpsSample): AveragingState => ({ all: [...state.all, s] });

/** Distancia en metros entre dos puntos {lat,lng} (envuelve haversineMeters, que
 *  exige accuracyM — aquí los centroides no lo tienen). */
const distM = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) =>
  haversineMeters({ lat: a.lat, lng: a.lng, accuracyM: null }, { lat: b.lat, lng: b.lng, accuracyM: null });

const weightOf = (acc: number) => 1 / Math.pow(Math.max(acc, ACCURACY_FLOOR_M), 2);

function weightedCentroid(samples: GpsSample[]): { lat: number; lng: number } {
  let wsum = 0, lat = 0, lng = 0;
  for (const s of samples) {
    const w = weightOf(s.accuracyM ?? ACCURACY_GATE_M);
    wsum += w; lat += w * s.lat; lng += w * s.lng;
  }
  return wsum > 0 ? { lat: lat / wsum, lng: lng / wsum } : { lat: samples[0].lat, lng: samples[0].lng };
}

/** RMS de las distancias (m) de cada muestra al centroide. */
function rmsDispersion(samples: GpsSample[], c: { lat: number; lng: number }): number {
  if (samples.length === 0) return 0;
  let sq = 0;
  for (const s of samples) { const d = distM(c, s); sq += d * d; }
  return Math.sqrt(sq / samples.length);
}

/**
 * Estadística de las muestras recibidas aplicando warm-up + gate + outliers.
 * Si tras el filtro estricto no queda ninguna (p.ej. durante el warm-up), cae a
 * la última muestra cruda para que la UI muestre algo (sampleCount=0).
 */
export function computeStats(all: GpsSample[]): AveragingStats {
  if (all.length === 0) {
    return { centroid: null, precisionM: null, dispersionM: null, meanAccuracyM: null, bestAccuracyM: null, sampleCount: 0 };
  }
  const startMs = all[0].t;
  // Estrictas: pasaron warm-up + gate de exactitud.
  const strict = all.filter(s => s.t - startMs >= WARMUP_MS && s.accuracyM != null && s.accuracyM <= ACCURACY_GATE_M);

  if (strict.length === 0) {
    // Fallback de DISPLAY (no para guardar): mostrar la última lectura cruda.
    const last = all[all.length - 1];
    return {
      centroid: { lat: last.lat, lng: last.lng },
      precisionM: null,
      dispersionM: null,
      meanAccuracyM: last.accuracyM,
      bestAccuracyM: last.accuracyM,
      sampleCount: 0,
    };
  }

  // Centroide ponderado + rechazo de outliers (una pasada).
  let c = weightedCentroid(strict);
  const sigma = rmsDispersion(strict, c);
  const cutoff = Math.max(OUTLIER_SIGMA * sigma, OUTLIER_FLOOR_M);
  const kept = strict.filter(s => distM(c, s) <= cutoff);
  const finalSamples = kept.length >= 1 ? kept : strict;
  c = weightedCentroid(finalSamples);

  const accs = finalSamples.map(s => s.accuracyM!).filter(a => a != null);
  const dispersion = rmsDispersion(finalSamples, c);
  // Precisión del PROMEDIO = error estándar de la media (dispersión/√N), con suelo.
  const precision = Math.max(dispersion / Math.sqrt(finalSamples.length), PRECISION_FLOOR_M);
  return {
    centroid: c,
    precisionM: precision,
    dispersionM: dispersion,
    meanAccuracyM: accs.length ? accs.reduce((a, b) => a + b, 0) / accs.length : null,
    bestAccuracyM: accs.length ? Math.min(...accs) : null,
    sampleCount: finalSamples.length,
  };
}

export const liveStats = (state: AveragingState): AveragingStats => computeStats(state.all);

/** ¿La medición ya es estable y suficientemente precisa para sugerir guardar? */
export function isConverged(
  state: AveragingState,
  opts?: { thresholdM?: number; minSamples?: number },
): boolean {
  const thr = opts?.thresholdM ?? CONVERGE_THRESHOLD_M;
  const min = opts?.minSamples ?? CONVERGE_MIN_SAMPLES;
  const st = computeStats(state.all);
  return st.sampleCount >= min && st.precisionM != null && st.precisionM <= thr;
}

/**
 * Detección de ALEJAMIENTO (anti-falso-positivo). Solo evalúa cuando ya hay un
 * centroide estable (≥ DEP_MIN_STABLE muestras aceptadas, excluyendo la cola).
 * Marca salida cuando las últimas DEP_RUN muestras consecutivas están TODAS más
 * allá del radio de salida, con tendencia creciente, y cada una fuera de su
 * propio radio de accuracy. Devuelve dónde cortar (`trimFromIndex`).
 */
export function detectDeparture(
  state: AveragingState,
  opts?: { window?: number; minStable?: number; floorM?: number; sigmaMult?: number; netDeltaM?: number },
): { departed: boolean; trimFromIndex: number } {
  const window = opts?.window ?? DEP_WINDOW;
  const minStable = opts?.minStable ?? DEP_MIN_STABLE;
  const floorM = opts?.floorM ?? DEP_FLOOR_M;
  const sigmaMult = opts?.sigmaMult ?? DEP_SIGMA_MULT;
  const netDelta = opts?.netDeltaM ?? DEP_NET_DELTA_M;
  const all = state.all;
  if (all.length < minStable + window) return { departed: false, trimFromIndex: all.length };

  // Centroide estable a partir de TODO menos la ventana reciente.
  const base = computeStats(all.slice(0, all.length - window));
  if (!base.centroid || base.dispersionM == null || base.sampleCount < minStable) {
    return { departed: false, trimFromIndex: all.length };
  }
  const c = base.centroid;
  // Radio según la DISPERSIÓN de la nube estable (no el error estándar), para que
  // ambientes ruidosos no disparen falso positivo.
  const radius = Math.max(floorM, sigmaMult * base.dispersionM);

  const win = all.slice(all.length - window);
  const d = win.map(s => distM(c, s));
  // El DISCRIMINADOR clave es la MONOTONÍA sostenida: estar parado produce
  // jitter NO monótono; alejarse produce distancia creciente. Requerimos:
  //  (a) tendencia creciente (≤ DEP_MAX_DIPS bajadas dentro de la tolerancia),
  //  (b) la última muestra claramente fuera del radio,
  //  (c) incremento NETO en la ventana > netDelta,
  //  (d) la última fuera de su propio radio de accuracy (movimiento real).
  let dips = 0;
  for (let i = 1; i < d.length; i++) if (d[i] < d[i - 1] - DEP_DIP_TOL_M) dips++;
  const increasing = dips <= DEP_MAX_DIPS;
  const last = d[d.length - 1];
  const net = d[d.length - 1] - d[0];
  const beyondOwnAcc = (win[win.length - 1].accuracyM ?? 0) < last;
  const departed = increasing && last > radius && net > netDelta && beyondOwnAcc;
  if (!departed) return { departed: false, trimFromIndex: all.length };

  // Inicio real de la huida: retroceder mientras la distancia siga > radio.
  let j = all.length - 1;
  while (j - 1 >= 0 && distM(c, all[j - 1]) > radius) j--;
  return { departed: true, trimFromIndex: j };
}

/**
 * Construye el resultado final a guardar. Si se pasa `trimFromIndex`, descarta
 * las muestras desde ese índice (la corrida de huida). Devuelve null si no hay
 * muestras aceptadas (no se puede guardar).
 */
export function finalizeResult(state: AveragingState, trimFromIndex?: number): GpsAveragedResult | null {
  const used = trimFromIndex != null ? state.all.slice(0, trimFromIndex) : state.all;
  const st = computeStats(used);
  if (!st.centroid || st.sampleCount < 1 || st.precisionM == null) return null;
  const capturedAt = used.length ? used[used.length - 1].t : Date.now();
  return {
    lat: st.centroid.lat,
    lng: st.centroid.lng,
    accuracyM: Math.round(st.precisionM * 100) / 100,
    capturedAt,
    method: 'averaged',
    sampleCount: st.sampleCount,
    precisionM: Math.round(st.precisionM * 100) / 100,
    bestAccuracyM: st.bestAccuracyM,
  };
}
