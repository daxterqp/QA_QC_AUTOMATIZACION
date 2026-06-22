/**
 * gpsDedup — helper para decidir si un nuevo punto GPS debe persistirse o
 * skipearse por proximidad al anterior. Compartido entre captura foreground
 * (useGpsCapture.startTracking) y background (BackgroundLocationTask).
 *
 * Decisión #11 del plan: skip si <3m del último guardado de la misma sesión Y
 * accuracy comparable (±20%). Reduce hasta 90% de filas en equipo parado.
 */

const THRESHOLD_M = 3;
const ACCURACY_RATIO = 0.2;
const EARTH_R = 6371000; // metros

export interface GpsPointLite {
  lat: number;
  lng: number;
  accuracyM: number | null;
}

/** Haversine simple. Para distancias <50m es bastante preciso. */
export function haversineMeters(a: GpsPointLite, b: GpsPointLite): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_R * Math.asin(Math.sqrt(x));
}

/** Decide si guardar el `next` punto. Si `prev` es null (primer punto de la
 *  sesión), siempre se guarda. */
export function shouldKeepGpsPoint(
  prev: GpsPointLite | null,
  next: GpsPointLite,
  thresholdM: number = THRESHOLD_M,
): boolean {
  if (!prev) return true;
  const dist = haversineMeters(prev, next);
  if (dist >= thresholdM) return true;
  // Si la accuracy del nuevo es MUCHO mejor que el anterior, guardar igual
  // (puede ser un fix más confiable del mismo lugar).
  if (prev.accuracyM != null && next.accuracyM != null) {
    if (next.accuracyM < prev.accuracyM * (1 - ACCURACY_RATIO)) return true;
  }
  return false;
}
