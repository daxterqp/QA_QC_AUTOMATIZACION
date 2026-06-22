/**
 * BackgroundLocationTask — captura GPS continua aún con la app en background
 * o pantalla bloqueada. Solo se usa cuando flag del proyecto =
 * `traceability_gps_polling === 'background'`.
 *
 * Arquitectura:
 *  - `TaskManager.defineTask` registra el handler una vez al cargar el módulo.
 *  - El handler busca la sesión `ACTIVE` del user actual y persiste el punto
 *    (con dedup compartido) + encola batch sync.
 *  - Si la sesión está `PAUSED`, descarta los puntos pero la task sigue viva
 *    para reanudar rápido.
 *
 *  Persistencia entre crashes: la task la mantiene el SO; al matar la app, el
 *  SO sigue invocando el handler con location updates. WMDB se reabre al
 *  primer write.
 *
 *  Limitación Android 11+: el usuario debe aceptar "Permitir siempre" manual
 *  via Settings tras el WHEN_IN_USE inicial. El flujo de permission lo maneja
 *  el caller (WorkSessionService o screen capture) con Alert + Linking.
 */
import { Platform } from 'react-native';

// Carga lazy de expo-location y expo-task-manager (módulos nativos).
// Si por alguna razón no están disponibles (custom dev client viejo), los
// helpers se vuelven no-ops para no crashear la app.
let TaskManager: typeof import('expo-task-manager') | null = null;
let Location: typeof import('expo-location') | null = null;
try { TaskManager = require('expo-task-manager'); } catch { /* no nativo */ }
try { Location = require('expo-location'); } catch { /* no nativo */ }

import { Q } from '@nozbe/watermelondb';
import {
  database, workSessionsCollection, workSessionGpsPointsCollection,
} from '@db/index';
import { enqueue as enqueueSync } from '@services/SyncQueueService';
import { shouldKeepGpsPoint, type GpsPointLite } from '@utils/gpsDedup';

export const TRACE_BG_TASK = 'flow-traceability-bg-location-v1';

const lastPersistedPerSession = new Map<string, GpsPointLite>();
let counter = 0;
// Fix A3: deviceId del device que arrancó el tracking. El handler de la task
// lo usa para filtrar la sesión activa por device — sin esto, si dos devices
// tienen sesiones en otros equipos y el SO reactiva la task, podríamos
// adjuntar puntos GPS a la sesión equivocada.
let currentDeviceId: string | null = null;

function newId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.floor(Math.random() * 1e9).toString(36)}`;
}

// Registrar la task UNA SOLA VEZ al importar este módulo.
if (TaskManager) {
  try {
    TaskManager.defineTask(TRACE_BG_TASK, async (input: any) => {
      const { data, error } = input ?? {};
      if (error) { console.warn('[BackgroundLocationTask] error:', error); return; }
      if (!data || !Array.isArray(data.locations) || data.locations.length === 0) return;
      try {
        // Fix A3: si no tenemos deviceId cargado en módulo, no podemos saber
        // qué sesión es nuestra → abortar el handler con un warn.
        if (!currentDeviceId) {
          console.warn('[BackgroundLocationTask] currentDeviceId no inicializado; descartando batch.');
          return;
        }
        // Detectar sesión activa de ESTE device (filtrada por started_on_device_id)
        // — única por device por construcción del lock + estado activo.
        const active = await workSessionsCollection.query(
          Q.where('started_on_device_id', currentDeviceId),
          Q.or(Q.where('status', 'ACTIVE'), Q.where('status', 'PAUSED')),
          Q.sortBy('started_at', Q.desc),
          Q.take(1),
        ).fetch();
        if (active.length === 0) return;
        const sess: any = active[0];
        const sessionId = sess.id;
        const projectId = sess.projectId;
        if (sess.status !== 'ACTIVE') return; // pausada → descartar puntos

        const ops: any[] = [];
        for (const loc of data.locations as any[]) {
          const next: GpsPointLite = {
            lat: loc.coords.latitude,
            lng: loc.coords.longitude,
            accuracyM: loc.coords.accuracy ?? null,
          };
          const prev = lastPersistedPerSession.get(sessionId) ?? null;
          if (!shouldKeepGpsPoint(prev, next)) continue;
          lastPersistedPerSession.set(sessionId, next);
          ops.push(workSessionGpsPointsCollection.prepareCreate((r: any) => {
            r._raw.id = newId('wsgp-bg');
            r.sessionId = sessionId;
            r.capturedAt = loc.timestamp ?? Date.now();
            r.latitude = next.lat;
            r.longitude = next.lng;
            r.accuracyM = next.accuracyM;
          }));
        }
        if (ops.length === 0) return;
        await database.write(async () => { await database.batch(ops); });
        counter += ops.length;
        // Fix D7: encolar PUSH_WORK_SESSION_GPS_BATCH al final de CADA invocación
        // del handler. El counter global no persiste entre invocaciones del SO
        // (el SO puede matar/respawnear el proceso entre batches → counter
        // siempre arranca en 0, nunca llega a 10, nunca encola, los puntos
        // quedan persistidos localmente sin sincronizar). El dedup del enqueue
        // por (opType, sessionId) evita inundación: si ya hay op PENDING/PROCESSING
        // para esa sesión, se reutiliza. El worker drena cuando haya red.
        enqueueSync({ opType: 'PUSH_WORK_SESSION_GPS_BATCH', entityId: sessionId, projectId }).catch(() => {});
      } catch (e) {
        console.warn('[BackgroundLocationTask] handler crash:', e);
      }
    });
  } catch (e) {
    console.warn('[BackgroundLocationTask] defineTask falló:', e);
  }
}

/** Inicia tracking en background. Requiere permiso BACKGROUND otorgado.
 *  Retorna true si arrancó OK.
 *  Fix A3: requiere `deviceId` para que el handler filtre la sesión activa
 *  por device y no agarre una sesión de otro device en otro equipo. */
export async function startBackgroundTracking(intervalSeconds: number, deviceId: string): Promise<boolean> {
  if (!Location || !TaskManager) {
    console.warn('[BackgroundLocationTask] expo-location o expo-task-manager no disponibles.');
    return false;
  }
  // Guardar deviceId en var de módulo para que el handler lo lea.
  currentDeviceId = deviceId;
  try {
    // SIEMPRE intentar el dialog nativo si el SO aún lo permite
    // (undetermined o canAskAgain=true). Solo retornamos false si tras el
    // request sigue sin granted — el caller decide qué hacer (caer a
    // foreground o mostrar Alert con Settings).
    const fg = await Location.getForegroundPermissionsAsync();
    if (fg.status !== 'granted') {
      if (fg.status === 'undetermined' || fg.canAskAgain) {
        const req = await Location.requestForegroundPermissionsAsync();
        if (req.status !== 'granted') return false;
      } else {
        return false;
      }
    }
    const bg = await Location.getBackgroundPermissionsAsync();
    if (bg.status !== 'granted') {
      if (bg.status === 'undetermined' || bg.canAskAgain) {
        const req = await Location.requestBackgroundPermissionsAsync();
        if (req.status !== 'granted') return false;
      } else {
        return false;
      }
    }
    const already = await Location.hasStartedLocationUpdatesAsync(TRACE_BG_TASK).catch(() => false);
    if (already) return true;
    await Location.startLocationUpdatesAsync(TRACE_BG_TASK, {
      accuracy: Location.Accuracy.High,
      timeInterval: Math.max(1000, intervalSeconds * 1000),
      distanceInterval: 0,
      showsBackgroundLocationIndicator: true, // iOS
      foregroundService: {
        notificationTitle: 'Flow QA/QC — Trazabilidad activa',
        notificationBody: 'Capturando ubicación GPS de la sesión en curso.',
        notificationColor: '#394e7d',
      },
      pausesUpdatesAutomatically: false,
    });
    return true;
  } catch (e) {
    console.warn('[BackgroundLocationTask] startBackgroundTracking falló:', e);
    return false;
  }
}

/** Detiene tracking en background (idempotente). */
export async function stopBackgroundTracking(): Promise<void> {
  if (!Location || !TaskManager) return;
  try {
    const running = await Location.hasStartedLocationUpdatesAsync(TRACE_BG_TASK).catch(() => false);
    if (running) await Location.stopLocationUpdatesAsync(TRACE_BG_TASK);
  } catch (e) {
    console.warn('[BackgroundLocationTask] stop falló:', e);
  }
  lastPersistedPerSession.clear();
  counter = 0;
  currentDeviceId = null;
}

/** Retorna true si la task está activa según el SO. */
export async function isBackgroundTrackingActive(): Promise<boolean> {
  if (!Location) return false;
  try { return await Location.hasStartedLocationUpdatesAsync(TRACE_BG_TASK); }
  catch { return false; }
}

// Compat: log para indicar la plataforma. iOS necesita config plist explícita.
if (__DEV__) console.log(`[BackgroundLocationTask] registrado (platform=${Platform.OS})`);
