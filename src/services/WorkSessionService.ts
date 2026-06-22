/**
 * WorkSessionService — Lifecycle de una sesión de trabajo (v27).
 *
 * Encapsula start/pause/resume/close + GPS tracking + dedup + sync enqueue.
 * Pensado para ser consumido desde las pantallas de Trazabilidad sin que
 * estas tengan que conocer detalles de WatermelonDB ni de la cola.
 *
 * Transiciones (decisión #9 — tabla work_session_intervals):
 *   - startSession()  → create session + first interval(active)
 *   - pauseSession()  → close active interval + create paused interval; STOP GPS
 *   - resumeSession() → close paused interval + create active interval; START GPS
 *   - closeSession()  → close current interval + status=CLOSED + STOP GPS
 *
 * Cada transición:
 *   - escribe a WMDB en database.write
 *   - encola PUSH_WORK_SESSION + PUSH_WORK_SESSION_INTERVAL para sync diferido
 *   - emite un toast (responsabilidad del caller pasar el message)
 */

import {
  database,
  workSessionsCollection,
  workSessionIntervalsCollection,
  workSessionGpsPointsCollection,
  workSessionFormItemsCollection,
  evidencesCollection,
} from '@db/index';
import { Q } from '@nozbe/watermelondb';
import { enqueue as enqueueSync } from '@services/SyncQueueService';
import { startGpsTracking, type TrackingHandle, type GpsResult } from '@hooks/useGpsCapture';
import { shouldKeepGpsPoint, type GpsPointLite } from '@utils/gpsDedup';
import {
  startBackgroundTracking, stopBackgroundTracking,
} from '@services/BackgroundLocationTask';
import { isEquipmentLocked } from '@services/SupabaseSyncService';
import { getDeviceId } from '@utils/deviceId';
import type WorkSession from '@db/models/WorkSession';
import type WorkSessionInterval from '@db/models/WorkSessionInterval';

function newId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.floor(Math.random() * 1e9).toString(36)}`;
}

// v30 — Cap automático: ningún active interval continuo puede medir más de 12h.
// Si el operador olvidó pausar/cerrar, al cerrarse se trunca al límite. El
// cálculo en lectura también capea defensivamente para datos legacy.
export const MAX_ACTIVE_INTERVAL_MS = 12 * 60 * 60 * 1000;

function cap12h(startedAt: number, proposedEndedAt: number): number {
  const max = startedAt + MAX_ACTIVE_INTERVAL_MS;
  return Math.min(proposedEndedAt, max);
}

// ─── Mutex per-session (Fix A4) ──────────────────────────────────────────────
// Serializa pause/resume/close para evitar transiciones intercaladas que
// dejarían múltiples intervals abiertos o status inconsistente.
const sessionLocks = new Map<string, Promise<any>>();
export function withSessionLock<T>(sessionId: string, fn: () => Promise<T>): Promise<T> {
  const prev = sessionLocks.get(sessionId) ?? Promise.resolve();
  const next = prev.then(fn, fn).finally(() => {
    // Sólo limpiar si el slot sigue siendo este (otro caller pudo encadenar)
    if (sessionLocks.get(sessionId) === next) sessionLocks.delete(sessionId);
  });
  sessionLocks.set(sessionId, next);
  return next;
}

// ─── In-memory tracker registry ──────────────────────────────────────────────
// Mantiene el handle del watcher GPS para cada sesión activa. Se inicia al
// startSession/resumeSession y se detiene al pauseSession/closeSession.
const activeTrackers = new Map<string, TrackingHandle>();
const lastGpsPerSession = new Map<string, GpsPointLite>();

interface FormItemInput {
  templateItemId: string | null;
  partidaItem: string | null;
  itemDescription: string;
  validationMethod: string | null;
  valueText: string | null;
  valueNumber: number | null;
  comments: string | null;
  // v30 — Checklist Sí/No/N/A.
  isCompliant?: boolean | null;
  isNa?: boolean;
  hasAnswer?: boolean;
}

interface SessionInput {
  projectId: string;
  userId: string;
  equipmentId: string;
  activityId: string;
  sectorId: string | null;
  shiftId: string | null;
  deviceId: string;
  gpsPolling: 'off' | 'foreground' | 'background';
  gpsIntervalSeconds: number;
  /** Items del formulario inicial pre-rellenos (snapshot del template). */
  formItems?: FormItemInput[];
}

/** Crea sesión + primer interval `active` + items del formulario. Inicia GPS
 *  si el flag del proyecto lo pide. */
export async function startSession(input: SessionInput): Promise<WorkSession> {
  const now = Date.now();
  const sessionId = newId('ws');
  const intervalId = newId('wsi');

  // Fix A2: re-validar lock de equipo justo antes del write para cerrar la
  // race con otras sesiones que pudieron arrancarse (local u online) entre
  // el momento que el caller validó y este punto.
  const lock = await isEquipmentLocked(input.equipmentId);
  if (lock.locked) {
    throw new Error('Equipo bloqueado: otra sesión ACTIVE o PAUSED ya existe sobre este equipo.');
  }

  let session!: WorkSession;
  await database.write(async () => {
    const ops: any[] = [];

    session = workSessionsCollection.prepareCreate((r: any) => {
      r._raw.id = sessionId;
      r.projectId = input.projectId;
      r.userId = input.userId;
      r.equipmentId = input.equipmentId;
      r.activityId = input.activityId;
      r.sectorId = input.sectorId;
      r.shiftId = input.shiftId;
      r.startedAt = now;
      r.endedAt = null;
      r.status = 'ACTIVE';
      r.startedOnDeviceId = input.deviceId;
      r.autoClosed = false;
      r.notes = null;
    });
    ops.push(session);

    const firstInterval = workSessionIntervalsCollection.prepareCreate((r: any) => {
      r._raw.id = intervalId;
      r.sessionId = sessionId;
      r.kind = 'active';
      r.startedAt = now;
      r.endedAt = null;
    });
    ops.push(firstInterval);

    // Items del formulario (snapshot)
    if (input.formItems) {
      for (const it of input.formItems) {
        const fi = workSessionFormItemsCollection.prepareCreate((r: any) => {
          r._raw.id = newId('wsfi');
          r.sessionId = sessionId;
          r.templateItemId = it.templateItemId;
          r.partidaItem = it.partidaItem;
          r.itemDescription = it.itemDescription;
          r.validationMethod = it.validationMethod;
          r.valueText = it.valueText;
          r.valueNumber = it.valueNumber;
          r.comments = it.comments;
          r.isCompliant = it.isCompliant ?? null;
          r.isNa = it.isNa ?? false;
          r.hasAnswer = it.hasAnswer ?? false;
        });
        ops.push(fi);
      }
    }
    await database.batch(ops);
  });

  // Sync
  enqueueSync({ opType: 'PUSH_WORK_SESSION', entityId: sessionId, projectId: input.projectId }).catch(() => {});
  enqueueSync({ opType: 'PUSH_WORK_SESSION_INTERVAL', entityId: intervalId, projectId: input.projectId }).catch(() => {});
  if (input.formItems?.length) {
    // Fix B2: query los wsfi recién creados y encolarlos uno a uno
    // (best-effort — si algo falla, el push masivo los recogerá igual).
    try {
      const created = await workSessionFormItemsCollection
        .query(Q.where('session_id', sessionId))
        .fetch();
      for (const fi of created) {
        enqueueSync({
          opType: 'PUSH_WORK_SESSION_FORM_ITEM',
          entityId: (fi as any).id,
          projectId: input.projectId,
        }).catch(() => {});
      }
    } catch (e) {
      console.warn('[WorkSession] no se pudieron encolar form items individualmente:', e);
    }
  }

  // GPS según flag del proyecto.
  if (input.gpsPolling === 'foreground') {
    await startTrackerForSession(sessionId, input.projectId, input.gpsIntervalSeconds);
  } else if (input.gpsPolling === 'background') {
    const ok = await startBackgroundTracking(input.gpsIntervalSeconds, input.deviceId);
    if (!ok) {
      // Fallback a foreground si el user no otorga BG. La sesión sigue válida.
      await startTrackerForSession(sessionId, input.projectId, input.gpsIntervalSeconds);
    }
  }
  return session;
}

/** Inicia el watcher GPS para una sesión y registra el handle. */
async function startTrackerForSession(sessionId: string, projectId: string, intervalSeconds: number): Promise<void> {
  if (activeTrackers.has(sessionId)) return; // ya activo
  // Fix A6: reservar el slot ANTES del await para que un stop()/pause() que
  // llegue mientras startGpsTracking todavía resuelve no cree un tracker
  // huérfano. Si el slot cambió cuando volvemos, abortamos.
  const placeholder: TrackingHandle = { stop: () => {} };
  activeTrackers.set(sessionId, placeholder);
  const tracker = await startGpsTracking({
    intervalSeconds,
    onPoint: (pt: GpsResult) => {
      // El watcher ya dedupe a nivel hook, pero re-aplicamos contra el último
      // PERSISTIDO en esta sesión (no contra el último visto en memoria) para
      // robustez ante hot-reload o re-creación del handle.
      const prev = lastGpsPerSession.get(sessionId) ?? null;
      const next: GpsPointLite = { lat: pt.lat, lng: pt.lng, accuracyM: pt.accuracyM };
      if (!shouldKeepGpsPoint(prev, next)) return;
      lastGpsPerSession.set(sessionId, next);
      // Persistir punto (best-effort, no bloquear el watcher)
      database.write(async () => {
        await workSessionGpsPointsCollection.create((r: any) => {
          r._raw.id = newId('wsgp');
          r.sessionId = sessionId;
          r.capturedAt = pt.capturedAt;
          r.latitude = pt.lat;
          r.longitude = pt.lng;
          r.accuracyM = pt.accuracyM;
        });
      }).catch((e) => console.warn('[WorkSession] punto GPS no persistido:', e));
      // Enqueue batch con debounce simple: encolamos cada 10 puntos o cada 30s.
      maybeEnqueueGpsBatch(sessionId, projectId);
    },
  });
  // Fix A6: si el slot fue limpiado o reemplazado mientras esperábamos,
  // alguien llamó stopTrackerForSession en el ínterin → detener y salir.
  if (activeTrackers.get(sessionId) !== placeholder) {
    try { tracker.stop(); } catch { /* idempotente */ }
    return;
  }
  activeTrackers.set(sessionId, tracker);
}

// Debouncer para encolar batch GPS sin inundar la cola.
const gpsBatchTimers = new Map<string, ReturnType<typeof setTimeout>>();
const gpsCounters = new Map<string, number>();
function maybeEnqueueGpsBatch(sessionId: string, projectId: string) {
  gpsCounters.set(sessionId, (gpsCounters.get(sessionId) ?? 0) + 1);
  if ((gpsCounters.get(sessionId) ?? 0) >= 10) {
    flushGpsBatch(sessionId, projectId);
    return;
  }
  if (gpsBatchTimers.has(sessionId)) return;
  const t = setTimeout(() => flushGpsBatch(sessionId, projectId), 30_000);
  gpsBatchTimers.set(sessionId, t);
}
function flushGpsBatch(sessionId: string, projectId: string) {
  const t = gpsBatchTimers.get(sessionId);
  if (t) { clearTimeout(t); gpsBatchTimers.delete(sessionId); }
  gpsCounters.set(sessionId, 0);
  enqueueSync({ opType: 'PUSH_WORK_SESSION_GPS_BATCH', entityId: sessionId, projectId }).catch(() => {});
}

export async function stopTrackerForSession(sessionId: string, projectId: string): Promise<void> {
  const tracker = activeTrackers.get(sessionId);
  if (tracker) { tracker.stop(); activeTrackers.delete(sessionId); }
  // Background tracking si estaba activo
  try { await stopBackgroundTracking(); } catch { /* idempotente */ }
  // Flush final del batch GPS
  flushGpsBatch(sessionId, projectId);
  // Fix A6: limpiar el último punto GPS recordado para esta sesión.
  lastGpsPerSession.delete(sessionId);
}

/** Pausa: cierra el interval activo, crea uno paused, suspende GPS. */
export async function pauseSession(sessionId: string): Promise<void> {
  return withSessionLock(sessionId, async () => {
    const session = await workSessionsCollection.find(sessionId).catch(() => null);
    if (!session) throw new Error('Sesión no encontrada');
    if ((session as any).status !== 'ACTIVE') return; // ya pausada o cerrada
    const now = Date.now();
    const open = await openIntervalOf(sessionId);
    const projectId = (session as any).projectId;

    await database.write(async () => {
      const ops: any[] = [];
      if (open) {
        const capped = (open as any).kind === 'active'
          ? cap12h((open as any).startedAt, now)
          : now;
        ops.push(open.prepareUpdate((r: any) => { r.endedAt = capped; }));
      }
      const newInterval = workSessionIntervalsCollection.prepareCreate((r: any) => {
        r._raw.id = newId('wsi');
        r.sessionId = sessionId;
        r.kind = 'paused';
        r.startedAt = now;
        r.endedAt = null;
      });
      ops.push(newInterval);
      ops.push((session as any).prepareUpdate((r: any) => { r.status = 'PAUSED'; }));
      await database.batch(ops);
    });

    // Sync
    enqueueSync({ opType: 'PUSH_WORK_SESSION', entityId: sessionId, projectId }).catch(() => {});
    if (open) enqueueSync({ opType: 'PUSH_WORK_SESSION_INTERVAL', entityId: open.id, projectId }).catch(() => {});

    await stopTrackerForSession(sessionId, projectId);
  });
}

/** Reanuda: cierra el interval paused, crea uno active, reactiva GPS. */
export async function resumeSession(
  sessionId: string,
  gpsPolling: 'off' | 'foreground' | 'background',
  gpsIntervalSeconds: number,
  deviceId?: string,
): Promise<void> {
  return withSessionLock(sessionId, async () => {
    const session = await workSessionsCollection.find(sessionId).catch(() => null);
    if (!session) throw new Error('Sesión no encontrada');
    if ((session as any).status !== 'PAUSED') return;
    const now = Date.now();
    const open = await openIntervalOf(sessionId);
    const projectId = (session as any).projectId;

    await database.write(async () => {
      const ops: any[] = [];
      if (open) ops.push(open.prepareUpdate((r: any) => { r.endedAt = now; }));
      const newInterval = workSessionIntervalsCollection.prepareCreate((r: any) => {
        r._raw.id = newId('wsi');
        r.sessionId = sessionId;
        r.kind = 'active';
        r.startedAt = now;
        r.endedAt = null;
      });
      ops.push(newInterval);
      ops.push((session as any).prepareUpdate((r: any) => { r.status = 'ACTIVE'; }));
      await database.batch(ops);
    });
    enqueueSync({ opType: 'PUSH_WORK_SESSION', entityId: sessionId, projectId }).catch(() => {});
    if (open) enqueueSync({ opType: 'PUSH_WORK_SESSION_INTERVAL', entityId: open.id, projectId }).catch(() => {});

    if (gpsPolling === 'foreground') {
      lastGpsPerSession.delete(sessionId);
      await startTrackerForSession(sessionId, projectId, gpsIntervalSeconds);
    } else if (gpsPolling === 'background') {
      lastGpsPerSession.delete(sessionId);
      // Fix A3: filtrar sesión activa por device — usar el deviceId del
      // caller, o el de este dispositivo como fallback.
      const effectiveDeviceId = deviceId ?? await getDeviceId();
      const ok = await startBackgroundTracking(gpsIntervalSeconds, effectiveDeviceId);
      if (!ok) await startTrackerForSession(sessionId, projectId, gpsIntervalSeconds);
    }
  });
}

/** Cierra definitivamente la sesión. notes opcional. */
export async function closeSession(sessionId: string, notes?: string | null): Promise<void> {
  return withSessionLock(sessionId, async () => {
    const session = await workSessionsCollection.find(sessionId).catch(() => null);
    if (!session) throw new Error('Sesión no encontrada');
    if ((session as any).status === 'CLOSED') return;
    const now = Date.now();
    const open = await openIntervalOf(sessionId);
    const projectId = (session as any).projectId;

    await database.write(async () => {
      const ops: any[] = [];
      let effectiveCloseTs = now;
      if (open) {
        const capped = (open as any).kind === 'active'
          ? cap12h((open as any).startedAt, now)
          : now;
        // v30 — Si el active interval queda capeado a startedAt+12h, la sesión
        // también se cierra en ese instante para que duración total = suma de
        // intervals (sin huecos misteriosos al final).
        if ((open as any).kind === 'active') effectiveCloseTs = capped;
        ops.push(open.prepareUpdate((r: any) => { r.endedAt = capped; }));
      }
      ops.push((session as any).prepareUpdate((r: any) => {
        r.status = 'CLOSED';
        r.endedAt = effectiveCloseTs;
        if (notes !== undefined) r.notes = notes;
      }));
      await database.batch(ops);
    });
    enqueueSync({ opType: 'PUSH_WORK_SESSION', entityId: sessionId, projectId }).catch(() => {});
    if (open) enqueueSync({ opType: 'PUSH_WORK_SESSION_INTERVAL', entityId: open.id, projectId }).catch(() => {});

    await stopTrackerForSession(sessionId, projectId);
    lastGpsPerSession.delete(sessionId);
  });
}

/** v30 — Igual que startSession pero devuelve también los IDs de los items
 *  creados en el orden recibido, para que el caller pueda asociar fotos
 *  (evidencias) a items específicos del checklist. */
export async function startSessionWithChecklist(
  input: SessionInput,
): Promise<{ session: WorkSession; formItemIds: string[] }> {
  const now = Date.now();
  const sessionId = newId('ws');
  const intervalId = newId('wsi');

  const lock = await isEquipmentLocked(input.equipmentId);
  if (lock.locked) {
    throw new Error('Equipo bloqueado: otra sesión ACTIVE o PAUSED ya existe sobre este equipo.');
  }

  let session!: WorkSession;
  const formItemIds: string[] = [];

  await database.write(async () => {
    const ops: any[] = [];
    session = workSessionsCollection.prepareCreate((r: any) => {
      r._raw.id = sessionId;
      r.projectId = input.projectId;
      r.userId = input.userId;
      r.equipmentId = input.equipmentId;
      r.activityId = input.activityId;
      r.sectorId = input.sectorId;
      r.shiftId = input.shiftId;
      r.startedAt = now;
      r.endedAt = null;
      r.status = 'ACTIVE';
      r.startedOnDeviceId = input.deviceId;
      r.autoClosed = false;
      r.notes = null;
    });
    ops.push(session);
    ops.push(workSessionIntervalsCollection.prepareCreate((r: any) => {
      r._raw.id = intervalId;
      r.sessionId = sessionId;
      r.kind = 'active';
      r.startedAt = now;
      r.endedAt = null;
    }));
    if (input.formItems) {
      for (const it of input.formItems) {
        const wsfiId = newId('wsfi');
        formItemIds.push(wsfiId);
        ops.push(workSessionFormItemsCollection.prepareCreate((r: any) => {
          r._raw.id = wsfiId;
          r.sessionId = sessionId;
          r.templateItemId = it.templateItemId;
          r.partidaItem = it.partidaItem;
          r.itemDescription = it.itemDescription;
          r.validationMethod = it.validationMethod;
          r.valueText = it.valueText;
          r.valueNumber = it.valueNumber;
          r.comments = it.comments;
          r.isCompliant = it.isCompliant ?? null;
          r.isNa = it.isNa ?? false;
          r.hasAnswer = it.hasAnswer ?? false;
        }));
      }
    }
    await database.batch(ops);
  });

  enqueueSync({ opType: 'PUSH_WORK_SESSION', entityId: sessionId, projectId: input.projectId }).catch(() => {});
  enqueueSync({ opType: 'PUSH_WORK_SESSION_INTERVAL', entityId: intervalId, projectId: input.projectId }).catch(() => {});
  for (const id of formItemIds) {
    enqueueSync({ opType: 'PUSH_WORK_SESSION_FORM_ITEM', entityId: id, projectId: input.projectId }).catch(() => {});
  }

  // GPS según flag.
  if (input.gpsPolling === 'foreground') {
    await startTrackerForSession(sessionId, input.projectId, input.gpsIntervalSeconds);
  } else if (input.gpsPolling === 'background') {
    const ok = await startBackgroundTracking(input.gpsIntervalSeconds, input.deviceId);
    if (!ok) await startTrackerForSession(sessionId, input.projectId, input.gpsIntervalSeconds);
  }

  return { session, formItemIds };
}

/** v30 — Toma forzada: una persona DISTINTA al dueño actual del equipo cierra
 *  la sesión ajena (con cap 12h) y abre una nueva sesión propia. Requiere
 *  evidencia fotográfica del equipo (photoLocalUri).
 *
 *  - `prevSessionId`: la sesión ajena ACTIVE/PAUSED a cerrar.
 *  - `newSessionInput`: mismos campos que startSession().
 *  - `photoLocalUri`: URI local de la foto del equipo. Se persiste como
 *    `evidences` con `kind`-equivalente (asociada vía notes JSON).
 *
 *  La operación NO se puede revertir; el caller debe garantizar la
 *  confirmación previa (ForceOverrideModal). */
export async function forceTakeover(
  prevSessionId: string,
  newSessionInput: SessionInput,
  photoLocalUri: string,
): Promise<WorkSession> {
  // Cerrar la sesión ajena PRIMERO (sin lock cruzado con startSession).
  await withSessionLock(prevSessionId, async () => {
    const prev = await workSessionsCollection.find(prevSessionId).catch(() => null);
    if (!prev) return; // ya no existe (carrera)
    const sAny = prev as any;
    if (sAny.status === 'CLOSED') return;
    const now = Date.now();
    const open = await openIntervalOf(prevSessionId);
    const prevProjectId = sAny.projectId;

    await database.write(async () => {
      const ops: any[] = [];
      let effectiveCloseTs = now;
      if (open) {
        const capped = (open as any).kind === 'active'
          ? cap12h((open as any).startedAt, now)
          : now;
        if ((open as any).kind === 'active') effectiveCloseTs = capped;
        ops.push(open.prepareUpdate((r: any) => { r.endedAt = capped; }));
      }
      ops.push((prev as any).prepareUpdate((r: any) => {
        r.status = 'CLOSED';
        r.endedAt = effectiveCloseTs;
        // Marca interna de toma forzada en notes (JSON merge-safe).
        const prevNotes = sAny.notes ?? '';
        const tag = `\n[force-takeover] cerrada por ${newSessionInput.userId} a las ${new Date(now).toISOString()}`;
        r.notes = `${prevNotes}${tag}`.slice(0, 2000);
        r.autoClosed = true;
      }));
      await database.batch(ops);
    });
    enqueueSync({ opType: 'PUSH_WORK_SESSION', entityId: prevSessionId, projectId: prevProjectId }).catch(() => {});
    if (open) enqueueSync({ opType: 'PUSH_WORK_SESSION_INTERVAL', entityId: open.id, projectId: prevProjectId }).catch(() => {});
    await stopTrackerForSession(prevSessionId, prevProjectId);
  });

  // Crear la nueva sesión bajo el usuario que tomó el equipo. SKIP del lock
  // check porque acabamos de cerrar la sesión ajena (su push remoto puede
  // tardar — si dejamos correr startSession, el isEquipmentLocked todavía
  // vería el remoto con status ACTIVE y rechazaría).
  const newSessionId = newId('ws');
  const newIntervalId = newId('wsi');
  const nowStart = Date.now();
  let session!: WorkSession;
  await database.write(async () => {
    const ops: any[] = [];
    session = workSessionsCollection.prepareCreate((r: any) => {
      r._raw.id = newSessionId;
      r.projectId = newSessionInput.projectId;
      r.userId = newSessionInput.userId;
      r.equipmentId = newSessionInput.equipmentId;
      r.activityId = newSessionInput.activityId;
      r.sectorId = newSessionInput.sectorId;
      r.shiftId = newSessionInput.shiftId;
      r.startedAt = nowStart;
      r.endedAt = null;
      r.status = 'ACTIVE';
      r.startedOnDeviceId = newSessionInput.deviceId;
      r.autoClosed = false;
      r.notes = '[force-takeover-from] ' + prevSessionId;
    });
    ops.push(session);
    const firstInterval = workSessionIntervalsCollection.prepareCreate((r: any) => {
      r._raw.id = newIntervalId;
      r.sessionId = newSessionId;
      r.kind = 'active';
      r.startedAt = nowStart;
      r.endedAt = null;
    });
    ops.push(firstInterval);
    await database.batch(ops);
  });
  enqueueSync({ opType: 'PUSH_WORK_SESSION', entityId: newSessionId, projectId: newSessionInput.projectId }).catch(() => {});
  enqueueSync({ opType: 'PUSH_WORK_SESSION_INTERVAL', entityId: newIntervalId, projectId: newSessionInput.projectId }).catch(() => {});

  // Persistir la foto del equipo como evidencia "force-takeover". Usamos la
  // tabla `evidences` (re-uso de pipeline S3) sin protocolo asociado: si
  // protocol_item_id es null, el push igual la sube y la asocia a notes en
  // server. Best-effort — si falla, la sesión nueva ya está creada y operable.
  try {
    let evidenceId = '';
    await database.write(async () => {
      const ev = await evidencesCollection.create((r: any) => {
        // Para esquema actual, protocol_item_id es required. Marcamos con un
        // valor convencional con prefijo `FORCE-TAKEOVER:` + sessionId para
        // que el reporting pueda filtrar estos casos.
        r.protocolItemId = `FORCE-TAKEOVER:${session.id}`;
        r.localUri = photoLocalUri;
        r.uploadStatus = 'PENDING';
        r.s3UrlPlaceholder = null;
      });
      evidenceId = (ev as any).id;
    });
    enqueueSync({ opType: 'UPLOAD_PHOTO', entityId: evidenceId, projectId: newSessionInput.projectId }).catch(() => {});
  } catch (e) {
    console.warn('[forceTakeover] no se pudo persistir foto evidencia:', e);
  }

  return session;
}

/** v30 — Corrige el endedAt de una sesión CLOSED (uso exclusivo CREATOR/JEFE).
 *  Casos típicos:
 *    - Operador olvidó cerrar y la app la cerró automáticamente con timestamp
 *      muy posterior.
 *    - Se necesita acotar manualmente porque la sesión quedó corriendo en BG.
 *  Recorta el último interval `active` al nuevo endedAt y actualiza el campo
 *  `endedAt` de la sesión. Aplica cap 12h sobre el active interval ajustado.
 *  Encola los pushes correspondientes para sync. */
export async function updateEndedAt(
  sessionId: string,
  newEndedAt: number,
): Promise<void> {
  return withSessionLock(sessionId, async () => {
    const session = await workSessionsCollection.find(sessionId).catch(() => null);
    if (!session) throw new Error('Sesión no encontrada');
    const sAny = session as any;
    if (sAny.status !== 'CLOSED') {
      throw new Error('Solo se puede corregir la hora de cierre de sesiones ya cerradas.');
    }
    if (newEndedAt <= sAny.startedAt) {
      throw new Error('La nueva hora de cierre debe ser posterior al inicio de la sesión.');
    }
    if (newEndedAt > Date.now()) {
      throw new Error('La nueva hora de cierre no puede estar en el futuro.');
    }

    const intervals = await workSessionIntervalsCollection
      .query(Q.where('session_id', sessionId), Q.sortBy('started_at', Q.desc))
      .fetch();
    // Último interval que termina después o no termina aún → recortar.
    const lastClosed = (intervals as any[]).find(it => it.endedAt != null && it.endedAt >= newEndedAt);
    const projectId = sAny.projectId;

    await database.write(async () => {
      const ops: any[] = [];
      if (lastClosed) {
        const capped = lastClosed.kind === 'active'
          ? cap12h(lastClosed.startedAt, newEndedAt)
          : newEndedAt;
        // Si recortando dejara duración negativa, lo dejamos en startedAt.
        const safe = Math.max(lastClosed.startedAt, capped);
        ops.push(lastClosed.prepareUpdate((r: any) => { r.endedAt = safe; }));
      }
      ops.push((session as any).prepareUpdate((r: any) => { r.endedAt = newEndedAt; }));
      await database.batch(ops);
    });

    enqueueSync({ opType: 'PUSH_WORK_SESSION', entityId: sessionId, projectId }).catch(() => {});
    if (lastClosed) {
      enqueueSync({ opType: 'PUSH_WORK_SESSION_INTERVAL', entityId: lastClosed.id, projectId }).catch(() => {});
    }
  });
}

/** Obtiene el interval abierto (ended_at = null) de una sesión, si existe.
 *  Fix B6: si por una race previa hay >1 abiertos, ordena por started_at DESC
 *  y cierra los antiguos con ended_at = started_at (duración 0) para sanar
 *  el estado antes de devolver el más nuevo. */
async function openIntervalOf(sessionId: string): Promise<WorkSessionInterval | null> {
  const open = await workSessionIntervalsCollection
    .query(
      Q.where('session_id', sessionId),
      Q.where('ended_at', Q.eq(null as any)),
      Q.sortBy('started_at', Q.desc),
    )
    .fetch();
  if (open.length === 0) return null;
  if (open.length > 1) {
    // Sanar: cerrar los antiguos (todos menos el primero, que es el más reciente)
    const stale = open.slice(1) as WorkSessionInterval[];
    try {
      await database.write(async () => {
        const ops = stale.map((it) =>
          (it as any).prepareUpdate((r: any) => { r.endedAt = (it as any).startedAt; }),
        );
        await database.batch(ops);
      });
    } catch (e) {
      console.warn('[WorkSession] no se pudieron sanar intervals huérfanos:', e);
    }
  }
  return (open[0] as WorkSessionInterval);
}

/** Calcula duración efectiva (sólo intervals 'active') en ms. v30: capea cada
 *  interval activo continuo a 12h. Defensa para datos legacy o sesiones que
 *  aún no fueron capadas en escritura (rama ACTIVE corriendo en este momento). */
export function effectiveDurationMs(intervals: WorkSessionInterval[], now: number = Date.now()): number {
  let total = 0;
  for (const it of intervals) {
    if ((it as any).kind !== 'active') continue;
    const end = (it as any).endedAt ?? now;
    const dur = Math.max(0, end - (it as any).startedAt);
    total += Math.min(dur, MAX_ACTIVE_INTERVAL_MS);
  }
  return total;
}

/** Calcula tiempo pausado total (sólo intervals 'paused') en ms. */
export function pausedDurationMs(intervals: WorkSessionInterval[], now: number = Date.now()): number {
  let total = 0;
  for (const it of intervals) {
    if ((it as any).kind !== 'paused') continue;
    const end = (it as any).endedAt ?? now;
    total += Math.max(0, end - (it as any).startedAt);
  }
  return total;
}

/** True si la app actualmente está trackeando GPS para esta sesión. */
export function isTracking(sessionId: string): boolean {
  return activeTrackers.has(sessionId);
}

/** Fix #8.1 — Detiene TODOS los trackers GPS activos (foreground + background).
 *  Llamar al hacer logout / deleteAccount para evitar que el GPS siga capturando
 *  puntos después de que el user real ya se desconectó. Idempotente. */
export async function stopAllTrackers(): Promise<void> {
  // Foreground: clonar las entries para no mutar el Map mientras iteramos
  const entries = Array.from(activeTrackers.entries());
  for (const [sessionId, tracker] of entries) {
    try { tracker.stop(); } catch { /* ya detenido */ }
    activeTrackers.delete(sessionId);
    lastGpsPerSession.delete(sessionId);
  }
  // Background (lazy require evita ciclo)
  try {
    const bg = require('./BackgroundLocationTask');
    if (bg?.stopBackgroundTracking) await bg.stopBackgroundTracking();
  } catch { /* módulo no disponible */ }
}
