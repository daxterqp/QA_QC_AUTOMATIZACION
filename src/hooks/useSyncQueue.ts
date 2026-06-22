/**
 * useSyncQueue — hook reactivo sobre la tabla `sync_queue`.
 *
 * Expone conteos de operaciones pendientes y fallidas (con WatermelonDB
 * observables → refresca solo cuando cambian) y acciones para forzar sync /
 * reintentar fallidos.
 *
 * Uso:
 *   const { pending, failed, syncing, forceSync, retryFailed } = useSyncQueue();
 *
 * Combinar con `useNetwork()` para decidir si mostrar el banner:
 *   const { isOnline } = useNetwork();
 *   if (!isOnline || pending > 0 || syncing) <OfflineBanner ... />
 */

import { useEffect, useState } from 'react';
import { Q } from '@nozbe/watermelondb';
import { syncQueueCollection } from '@db/index';
import { retryAllFailed, pendingCount } from '@services/SyncQueueService';
import { SyncWorker } from '@services/SyncWorker';

export interface SyncQueueState {
  pending: number;
  failed: number;
  syncing: boolean;
  forceSync: () => Promise<void>;
  retryFailed: () => Promise<number>;
}

/** Estado global de sincronización — flag de syncing compartido entre todas
 *  las instancias del hook. El SyncWorker actualiza este flag cuando arranca/
 *  termina un drain. */
let _syncing = false;
const _listeners = new Set<(s: boolean) => void>();
export function _setSyncing(s: boolean) {
  if (_syncing === s) return;
  _syncing = s;
  for (const l of _listeners) l(s);
}

export function useSyncQueue(projectId?: string): SyncQueueState {
  const [pending, setPending] = useState(0);
  const [failed, setFailed] = useState(0);
  const [syncing, setSyncing] = useState(_syncing);

  useEffect(() => {
    // Subscripción al flag global de syncing
    const lst = (s: boolean) => setSyncing(s);
    _listeners.add(lst);
    return () => { _listeners.delete(lst); };
  }, []);

  useEffect(() => {
    // Observable de pending (con filtro opcional de proyecto)
    const filters = [Q.where('status', 'PENDING')];
    if (projectId) filters.push(Q.where('project_id', projectId));
    const pendingObs = syncQueueCollection.query(...filters).observeCount();
    const failedObs = syncQueueCollection.query(Q.where('status', 'FAILED_PERMANENT')).observeCount();

    const subP = pendingObs.subscribe((n) => setPending(n));
    const subF = failedObs.subscribe((n) => setFailed(n));
    return () => {
      subP.unsubscribe();
      subF.unsubscribe();
    };
  }, [projectId]);

  // v30 — Defensa contra chip pegado: si hay pending sin syncing por más de
  // 1.2s, kickeamos el worker.
  // v31 — Además refrescamos el conteo con fetchCount() directo (no observable)
  // porque WatermelonDB observeCount() puede quedar stale tras un destroy
  // rápido durante markProcessing → markSuccess, dejando el chip mostrando 1
  // mientras queueSummary() en el modal reporta 0 ("No hay cambios pendientes").
  useEffect(() => {
    if (pending === 0 || syncing) return;
    const t = setTimeout(async () => {
      try { SyncWorker.forceTick().catch(() => {}); } catch {}
      try {
        const fresh = await pendingCount(projectId);
        // Solo bajamos el valor si la BD realmente confirma 0/menos
        if (fresh < pending) setPending(fresh);
      } catch {}
    }, 1200);
    return () => clearTimeout(t);
  }, [pending, syncing, projectId]);

  return {
    pending,
    failed,
    syncing,
    forceSync: () => SyncWorker.forceTick(),
    retryFailed: () => retryAllFailed(),
  };
}
