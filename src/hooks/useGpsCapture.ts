/**
 * useGpsCapture — Hook para captura de coordenadas GPS via expo-location.
 *
 *  - Maneja el permiso de ubicación (pide la primera vez; ofrece Settings si lo denegó).
 *  - `captureNow()` invoca `getCurrentPositionAsync` con high accuracy.
 *  - Estado `isCapturing` para mostrar spinner en UI.
 *  - Devuelve coords en WGS84 lat/lng + accuracy en metros.
 *
 *  El GPS funciona OFFLINE (es hardware del celular). A-GPS (asistencia por red)
 *  acelera el primer fix; sin red, el primer fix puede tardar 30s y los
 *  siguientes son rápidos. La accuracy varía: 5-15m con cielo abierto,
 *  30m+ con edificios/árboles.
 */

import { useCallback, useState } from 'react';
import { Alert, Linking } from 'react-native';
import * as Location from 'expo-location';
import { tx } from '@i18n/index';

export interface GpsResult {
  lat: number;
  lng: number;
  accuracyM: number | null;
  capturedAt: number;
}

export interface UseGpsCaptureReturn {
  isCapturing: boolean;
  lastError: string | null;
  captureNow: () => Promise<GpsResult | null>;
}

/**
 * Garantiza el permiso de ubicación en primer plano, mostrando SIEMPRE el recuadro
 * NATIVO del SO cuando es posible (estado `undetermined` o `canAskAgain=true`). Solo
 * cuando Android ya bloqueó futuros prompts (`canAskAgain=false`, el usuario marcó
 * "No volver a preguntar") cae a un Alert que ofrece abrir Ajustes del sistema — que
 * es el ÚNICO camino que deja el SO para reactivarlo. Compartido por la captura simple
 * (`captureNow`) y por la medición promediada (`startGpsAveraging`) para que ambas
 * pidan el permiso de forma idéntica y robusta.
 */
export async function ensureLocationPermission(): Promise<boolean> {
  const cur = await Location.getForegroundPermissionsAsync();
  if (cur.status === 'granted') return true;

  if (cur.status === 'undetermined' || cur.canAskAgain) {
    const req = await Location.requestForegroundPermissionsAsync();   // recuadro nativo
    if (req.status === 'granted') return true;
    // Denegó esta vez pero el SO aún puede volver a preguntar → no abrumar con Ajustes.
    if (req.canAskAgain) return false;
    // Tras el request el SO ya bloqueó prompts → cae al flujo de Ajustes.
  }

  // canAskAgain=false. El recuadro nativo ya no se puede mostrar; el único camino es
  // Ajustes del sistema. onDismiss evita Promise colgada si cierran con botón Atrás.
  return new Promise<boolean>((resolve) => {
    let resolved = false;
    const safeResolve = (v: boolean) => { if (!resolved) { resolved = true; resolve(v); } };
    Alert.alert(
      tx('alerts.locationPermissionRequiredTitle'),
      tx('alerts.locationPermissionRequiredMsg'),
      [
        { text: tx('alerts.cancel'), style: 'cancel', onPress: () => safeResolve(false) },
        { text: tx('alerts.goToSettings'), onPress: () => { Linking.openSettings(); safeResolve(false); } },
      ],
      { cancelable: true, onDismiss: () => safeResolve(false) },
    );
  });
}

export function useGpsCapture(): UseGpsCaptureReturn {
  const [isCapturing, setIsCapturing] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);

  const ensurePermission = useCallback(() => ensureLocationPermission(), []);

  const captureNow = useCallback(async (): Promise<GpsResult | null> => {
    setLastError(null);
    setIsCapturing(true);
    try {
      const ok = await ensurePermission();
      if (!ok) {
        setLastError(tx('alerts.locationPermissionDenied'));
        return null;
      }
      // Activar GPS si el SO requiere chequeo
      const services = await Location.hasServicesEnabledAsync();
      if (!services) {
        setLastError(tx('alerts.gpsDisabledError'));
        Alert.alert(tx('alerts.gpsDisabledTitle'), tx('alerts.gpsDisabledMsg'));
        return null;
      }
      // v35 — A-GPS: dispara el diálogo de Google "mejorar precisión de ubicación"
      // (usa redes/Wi-Fi/sensores además de satélites). No-op/throw en iOS → ignora.
      try { await Location.enableNetworkProviderAsync(); } catch { /* iOS o cancelado */ }
      // A25/B6 — Carrera contra timeout (45s) usando `watchPositionAsync` para
      // poder LIBERAR el sensor GPS si el fix nunca llega. `getCurrentPositionAsync`
      // no es cancelable y deja requests apiladas que consumen batería.
      const pos = await new Promise<Location.LocationObject>((resolve, reject) => {
        let settled = false;
        let sub: Location.LocationSubscription | null = null;
        const cleanup = () => { try { sub?.remove(); } catch { /* ya removida */ } };
        const timer = setTimeout(() => {
          if (settled) return; settled = true;
          cleanup();
          reject(new Error(tx('alerts.gpsTimeoutError')));
        }, 45000);
        Location.watchPositionAsync(
          { accuracy: Location.Accuracy.BestForNavigation, timeInterval: 1000, distanceInterval: 0 },
          (loc) => {
            if (settled) return; settled = true;
            clearTimeout(timer); cleanup();
            resolve(loc);
          },
        ).then(s => { sub = s; if (settled) cleanup(); }).catch(e => {
          if (settled) return; settled = true;
          clearTimeout(timer); reject(e);
        });
      });
      return {
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        accuracyM: pos.coords.accuracy ?? null,
        capturedAt: Date.now(),
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setLastError(msg);
      console.warn('[useGpsCapture]', msg);
      return null;
    } finally {
      setIsCapturing(false);
    }
  }, [ensurePermission]);

  return { isCapturing, lastError, captureNow };
}

// ─── v27 — Tracking continuo para módulo de Trazabilidad ────────────────────

import { shouldKeepGpsPoint, type GpsPointLite } from '@utils/gpsDedup';

export interface TrackingOptions {
  intervalSeconds: number;
  /** Callback por CADA punto que pasa el dedup. Si retorna Promise, no se
   *  espera (best-effort para no bloquear el watcher). */
  onPoint: (point: GpsResult) => void;
  /** Distancia mínima entre puntos guardados (default 3m). */
  dedupThresholdM?: number;
}

export interface TrackingHandle {
  /** Detener watcher + liberar GPS. Idempotente. */
  stop: () => void;
}

/** Inicia un watcher continuo de GPS en foreground. El caller debe asegurar
 *  permisos previamente (idealmente vía `captureNow()` antes para activar el
 *  flujo de permission). Devuelve handle para detener.
 *
 *  NO dispara `onPoint` para puntos que fallan el dedup por proximidad. */
export async function startGpsTracking(opts: TrackingOptions): Promise<TrackingHandle> {
  const { intervalSeconds, onPoint, dedupThresholdM = 3 } = opts;
  let lastSaved: GpsPointLite | null = null;
  let stopped = false;
  let sub: Location.LocationSubscription | null = null;

  try {
    sub = await Location.watchPositionAsync(
      {
        accuracy: Location.Accuracy.High,
        timeInterval: Math.max(1000, intervalSeconds * 1000),
        distanceInterval: 0, // dedup lo hacemos nosotros explícitamente
      },
      (loc) => {
        if (stopped) return;
        const next: GpsPointLite = {
          lat: loc.coords.latitude,
          lng: loc.coords.longitude,
          accuracyM: loc.coords.accuracy ?? null,
        };
        if (!shouldKeepGpsPoint(lastSaved, next, dedupThresholdM)) return;
        lastSaved = next;
        const result: GpsResult = { ...next, capturedAt: Date.now() };
        try { onPoint(result); } catch (e) { console.warn('[startGpsTracking] onPoint err:', e); }
      },
    );
  } catch (e) {
    console.warn('[startGpsTracking] watchPositionAsync falló:', e);
  }

  return {
    stop: () => {
      stopped = true;
      try { sub?.remove(); } catch { /* ya removida */ }
      sub = null;
    },
  };
}

// ─── v35 — Stream de muestras para PROMEDIADO de waypoints ───────────────────

export interface AveragingStreamOptions {
  /** Cada muestra cruda de alta precisión (el caller acumula con gpsAveraging). */
  onSample: (s: { lat: number; lng: number; accuracyM: number | null; t: number }) => void;
  /** Error de permiso/GPS antes de poder transmitir. */
  onError?: (msg: string) => void;
}

/** Inicia un stream continuo de fixes con la MÁXIMA precisión (BestForNavigation
 *  + A-GPS) para promediar. Maneja permiso + servicios + liberación del sensor.
 *  El promedio/filtrado lo hace `@utils/gpsAveraging` en el caller. */
export async function startGpsAveraging(opts: AveragingStreamOptions): Promise<TrackingHandle> {
  const { onSample, onError } = opts;
  let stopped = false;
  let sub: Location.LocationSubscription | null = null;
  const handle: TrackingHandle = {
    stop: () => { stopped = true; try { sub?.remove(); } catch { /* ya removida */ } sub = null; },
  };

  try {
    // Permiso unificado: recuadro NATIVO si se puede, o Ajustes del sistema si Android
    // ya lo bloqueó (mismo flujo robusto que captureNow).
    const granted = await ensureLocationPermission();
    if (!granted) { onError?.(tx('alerts.locationPermissionDenied')); return handle; }

    const services = await Location.hasServicesEnabledAsync();
    if (!services) { onError?.(tx('alerts.gpsDisabledError')); return handle; }

    // A-GPS (Android): redes/Wi-Fi/sensores + satélites. No-op/throw en iOS.
    try { await Location.enableNetworkProviderAsync(); } catch { /* iOS o cancelado */ }

    sub = await Location.watchPositionAsync(
      { accuracy: Location.Accuracy.BestForNavigation, timeInterval: 1000, distanceInterval: 0 },
      (loc) => {
        if (stopped) return;
        onSample({
          lat: loc.coords.latitude,
          lng: loc.coords.longitude,
          accuracyM: loc.coords.accuracy ?? null,
          t: Date.now(),
        });
      },
    );
    if (stopped) handle.stop();
  } catch (e) {
    onError?.(e instanceof Error ? e.message : String(e));
  }
  return handle;
}
