/**
 * SyncQueueService — outbox de operaciones offline (v25).
 *
 * Cada operación pendiente vive como una fila de `sync_queue`. El
 * `SyncWorker` (en otro archivo) drena la cola cuando hay red.
 *
 * Patrón típico de uso:
 *   await persistarLocal(...);              // siempre primero
 *   await enqueue({
 *     opType: 'PUSH_PROTOCOL_ITEM',
 *     entityId: item.id,
 *     projectId: protocol.projectId,
 *   });
 *
 * Si la app está online en ese momento, el worker drena la cola en su próximo
 * tick (≤ 15s). Si está offline, queda guardada hasta que vuelva la red.
 *
 * Dedup: `enqueue` hace upsert por `(opType, entityId)`. Si ya existe una op
 * pendiente para esa entidad, se RESETEA el conteo de intentos y el
 * `next_attempt_at` a `now` — así varias escrituras seguidas del mismo item
 * solo cuestan una sincronización efectiva. */

import { Q } from '@nozbe/watermelondb';
import { database, syncQueueCollection, protocolItemsCollection, protocolsCollection } from '@db/index';
import type { SyncOpType } from '@db/models/SyncQueueItem';

const MAX_ATTEMPTS = 10;

export interface EnqueueArgs {
  opType: SyncOpType;
  entityId: string;
  projectId: string;
  /** Params opcionales del handler. Se serializan como JSON. */
  payload?: Record<string, unknown>;
}

/** Backoff exponencial con jitter ±20%. attempt=1 → ~5s, attempt=10 → 10min. */
function backoffMs(attempts: number): number {
  const base = Math.min(Math.pow(2, attempts) * 5_000, 10 * 60_000);
  const jitter = base * (0.8 + Math.random() * 0.4);
  return Math.round(jitter);
}

/** Agrega una operación a la cola (upsert por op_type + entity_id).
 *  - Si NO hay fila existente o solo hay PROCESSING: crea nueva PENDING.
 *  - Si existe fila PENDING/FAILED_PERMANENT: resetea attempts a 0 para que se
 *    reintente con los datos más recientes (la edición pisa la espera).
 *  - Si existe fila PROCESSING (el worker la está procesando): crea nueva PENDING
 *    en paralelo (H2: el worker terminará y destruirá la PROCESSING; la nueva
 *    PENDING queda con los datos frescos). Esto evita que la nueva edición se
 *    pierda cuando el worker llama markSuccess() sobre la fila vieja. */
export async function enqueue(args: EnqueueArgs): Promise<void> {
  const now = Date.now();
  const payloadStr = args.payload ? JSON.stringify(args.payload) : null;

  await database.write(async () => {
    const existing = await syncQueueCollection
      .query(
        Q.where('op_type', args.opType),
        Q.where('entity_id', args.entityId),
      )
      .fetch();

    // Buscar una fila reutilizable (NO PROCESSING — esa pertenece al worker).
    const reusable = existing.find((r: any) => r.status !== 'PROCESSING');

    if (reusable) {
      const row = reusable as any;
      // D2: Si la fila ya falló al menos una vez (attempts > 0), preservamos
      // el backoff exponencial — resetearlo permitiría que una fila con 9
      // intentos fallidos quede inmediatamente retriable, anulando la espera.
      // Solo refrescamos el payload/projectId para que el worker use datos
      // frescos cuando llegue el momento programado.
      const preserveBackoff = row.attempts > 0;
      await row.update((r: any) => {
        if (!preserveBackoff) {
          r.attempts = 0;
          r.nextAttemptAt = now;
          r.lastError = null;
        }
        r.status = 'PENDING';
        r.payloadJson = payloadStr;
        r.projectId = args.projectId;
      });
    } else {
      // O no existe nada, o todo está PROCESSING → crear nueva fila PENDING.
      await syncQueueCollection.create((r: any) => {
        r.opType = args.opType;
        r.entityId = args.entityId;
        r.projectId = args.projectId;
        r.payloadJson = payloadStr;
        r.attempts = 0;
        r.nextAttemptAt = now;
        r.lastError = null;
        r.status = 'PENDING';
      });
    }
  });
}

/** Marca una fila como PROCESSING para que enqueue no la pise. Llamar antes
 *  de invocar el handler remoto. Si falla la marcación, devuelve false (otro
 *  worker ya la tiene). */
export async function markProcessing(itemId: string): Promise<boolean> {
  let acquired = false;
  await database.write(async () => {
    const row = await syncQueueCollection.find(itemId).catch(() => null);
    if (!row) return;
    if ((row as any).status !== 'PENDING') return; // ya cambió
    await (row as any).update((r: any) => {
      r.status = 'PROCESSING';
    });
    acquired = true;
  });
  return acquired;
}

/** Limpieza de filas zombi en estado PROCESSING (por crash del worker o app).
 *  Cualquier fila PROCESSING con updatedAt > stallMs se mueve a PENDING para
 *  reintentar. Llamar en start() del worker y al inicio de cada tick. */
export async function cleanupStaleProcessing(stallMs: number = 60_000): Promise<number> {
  const cutoff = Date.now() - stallMs;
  const stale = await syncQueueCollection
    .query(Q.where('status', 'PROCESSING'))
    .fetch();
  const toReset = (stale as any[]).filter(r => {
    const u = r._raw?.updated_at ?? 0;
    return u <= cutoff;
  });
  if (toReset.length === 0) return 0;
  await database.write(async () => {
    for (const row of toReset) {
      await (row as any).update((u: any) => {
        u.status = 'PENDING';
        u.nextAttemptAt = Date.now();
      });
    }
  });
  return toReset.length;
}

/** Devuelve hasta `limit` filas elegibles (PENDING + nextAttemptAt <= now). */
export async function dequeueDue(limit = 20): Promise<any[]> {
  const now = Date.now();
  return syncQueueCollection
    .query(
      Q.where('status', 'PENDING'),
      Q.where('next_attempt_at', Q.lte(now)),
      // D6: orden FIFO explícito por created_at. Sin esto, SQLite devuelve
      // las filas en orden arbitrario y se rompe la dependencia causal
      // entre ops del mismo agregado (ej. PUSH_WORK_SESSION_INTERVAL antes
      // que PUSH_WORK_SESSION del mismo sessionId → FK violation).
      Q.sortBy('created_at', Q.asc),
      Q.take(limit),
    )
    .fetch();
}

/** Marca una op como exitosa y la elimina permanentemente. */
export async function markSuccess(itemId: string): Promise<void> {
  await database.write(async () => {
    const row = await syncQueueCollection.find(itemId).catch(() => null);
    if (row) await (row as any).destroyPermanently();
  });
}

/** Incrementa intentos + setea next_attempt con backoff. Si supera MAX_ATTEMPTS,
 *  pasa a FAILED_PERMANENT (visible en UI para retry manual; NO se descarta).
 *  Restablece status a PENDING (sale del estado PROCESSING). */
export async function markFailure(itemId: string, error: Error | unknown): Promise<void> {
  const msg = error instanceof Error ? error.message : String(error);
  await database.write(async () => {
    const row = await syncQueueCollection.find(itemId).catch(() => null);
    if (!row) return;
    const r = row as any;
    const newAttempts = r.attempts + 1;
    const isPermanent = newAttempts >= MAX_ATTEMPTS;
    await r.update((u: any) => {
      u.attempts = newAttempts;
      u.lastError = msg.slice(0, 500);
      u.status = isPermanent ? 'FAILED_PERMANENT' : 'PENDING';
      u.nextAttemptAt = Date.now() + backoffMs(newAttempts);
    });
  });
}

/** Cuenta operaciones pendientes (opcionalmente por proyecto). Útil para badge UI. */
export async function pendingCount(projectId?: string): Promise<number> {
  const filters: Q.Clause[] = [Q.where('status', 'PENDING')];
  if (projectId) filters.push(Q.where('project_id', projectId));
  return syncQueueCollection.query(...filters).fetchCount();
}

export async function failedCount(): Promise<number> {
  return syncQueueCollection.query(Q.where('status', 'FAILED_PERMANENT')).fetchCount();
}

/** Reintenta todos los FAILED_PERMANENT: los pone PENDING con attempts=0
 *  para que el worker los procese en el próximo tick. */
export async function retryAllFailed(): Promise<number> {
  const failed = await syncQueueCollection.query(Q.where('status', 'FAILED_PERMANENT')).fetch();
  if (failed.length === 0) return 0;
  await database.write(async () => {
    for (const row of failed) {
      await (row as any).update((u: any) => {
        u.status = 'PENDING';
        u.attempts = 0;
        u.nextAttemptAt = Date.now();
        u.lastError = null;
      });
    }
  });
  return failed.length;
}

/** DRENADO MANUAL — resetea TODAS las ops pendientes/fallidas a PENDING con
 *  attempts=0 y next_attempt_at=now, anulando cualquier backoff. Úsalo cuando una
 *  op quedó esperando (backoff largo) o FAILED_PERMANENT y quieres forzar su subida
 *  YA (p.ej. tras corregir la causa del error). Devuelve cuántas reencoló. */
export async function forceDrainAll(): Promise<number> {
  const rows = await syncQueueCollection
    .query(Q.where('status', Q.oneOf(['PENDING', 'FAILED_PERMANENT'])))
    .fetch();
  if (rows.length === 0) return 0;
  await database.write(async () => {
    for (const row of rows) {
      await (row as any).update((u: any) => {
        u.status = 'PENDING';
        u.attempts = 0;
        u.nextAttemptAt = Date.now();
        u.lastError = null;
      });
    }
  });
  return rows.length;
}

/** Lista las ops en cola (PENDING/PROCESSING/FAILED) para el detalle desplegable. */
export async function listQueueOps(): Promise<{ id: string; opType: SyncOpType; entityId: string; status: string; attempts: number; lastError: string | null }[]> {
  const rows = await syncQueueCollection
    .query(Q.where('status', Q.oneOf(['PENDING', 'PROCESSING', 'FAILED_PERMANENT'])), Q.sortBy('created_at', Q.asc))
    .fetch();
  return (rows as any[]).map(r => ({ id: r.id, opType: r.opType, entityId: r.entityId, status: r.status, attempts: r.attempts ?? 0, lastError: r.lastError ?? null }));
}

/** Describe una op para el usuario: qué protocolo y qué casilla/dato se está subiendo. */
export async function describeQueueOp(opType: SyncOpType, entityId: string): Promise<{ title: string; subtitle: string }> {
  try {
    if (opType === 'PUSH_PROTOCOL_ITEM') {
      const it: any = await protocolItemsCollection.find(entityId).catch(() => null);
      if (it) {
        const proto: any = await protocolsCollection.find(it.protocolId).catch(() => null);
        const code = proto?.protocolCode ?? proto?.protocolNumber ?? 'Ensayo';
        const cell = `${it.partidaItem ? `Fila ${it.partidaItem}` : 'Ítem'}${it.itemDescription ? ` · ${it.itemDescription}` : ''}`;
        return { title: code, subtitle: cell };
      }
    } else if (opType === 'PUSH_PROTOCOL_STATUS') {
      const proto: any = await protocolsCollection.find(entityId).catch(() => null);
      if (proto) return { title: proto.protocolCode ?? proto.protocolNumber ?? 'Ensayo', subtitle: `Estado del ensayo: ${proto.status ?? '—'}` };
    }
  } catch { /* sin detalle */ }
  return { title: `${entityId.slice(0, 10)}…`, subtitle: '' };
}

/** Devuelve un resumen agregado por op_type para mostrar en SyncStatusModal. */
export async function queueSummary(): Promise<{ opType: SyncOpType; count: number }[]> {
  const all = await syncQueueCollection.query(Q.where('status', 'PENDING')).fetch();
  const map = new Map<SyncOpType, number>();
  for (const row of all) {
    const t = (row as any).opType as SyncOpType;
    map.set(t, (map.get(t) ?? 0) + 1);
  }
  return Array.from(map.entries()).map(([opType, count]) => ({ opType, count }));
}
