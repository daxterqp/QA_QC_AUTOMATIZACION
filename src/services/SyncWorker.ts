/**
 * SyncWorker — singleton que drena la cola `sync_queue` cuando hay red.
 *
 * Estrategia:
 *  - Tick cada 15s SI está online.
 *  - También dispara on-reconnect via NetInfo (drain inmediato).
 *  - Cada tick: dequeueDue() → ejecuta handler por op_type → markSuccess/markFailure.
 *
 * El worker es resiliente:
 *  - Si una operación falla, no afecta las demás (catch por op).
 *  - Si el batch entero crashea, el próximo tick lo retoma.
 *  - Si la app se cierra mid-drain, la cola persiste y se reintenta al reabrir.
 */

import NetInfo from '@react-native-community/netinfo';
import { dequeueDue, markSuccess, markFailure, markProcessing, cleanupStaleProcessing } from './SyncQueueService';
import {
  pushProtocolItemStrict,
  pushProtocolStatusStrict,
  pushApprovalStrict,
  pushEvidenceStrict,
  pushNonConformityStrict,
  pushProjectSectorStrict,
  deleteProjectSectorStrict,
  deleteProtocolStrict,
  // v27 — Trazabilidad
  pushActivityStrict,
  deleteActivityStrict,
  pushEquipmentActivityStrict,
  deleteEquipmentActivityStrict,
  pushWorkShiftStrict,
  deleteWorkShiftStrict,
  pushSessionFormTemplateStrict,
  pushSessionFormTemplateItemStrict,
  pushWorkSessionFullStrict,
  deleteWorkSessionStrict,
  pushWorkSessionIntervalStrict,
  pushWorkSessionFormItemStrict,
  pushWorkSessionGpsBatchStrict,
  pushSummaryRowStrict,
} from './SupabaseSyncService';
import { uploadEvidencePhoto } from './S3PhotoService';
import { evidencesCollection } from '@db/index';
import type { SyncOpType } from '@db/models/SyncQueueItem';

const TICK_INTERVAL_MS = 15_000;

class _SyncWorker {
  private timer: ReturnType<typeof setInterval> | null = null;
  private bootTimeout: ReturnType<typeof setTimeout> | null = null;
  private reconnectTimeouts: Set<ReturnType<typeof setTimeout>> = new Set();
  private netUnsub: (() => void) | null = null;
  private isDraining = false;
  private getOnline: () => boolean = () => false;
  private onSyncStateChange: ((syncing: boolean) => void) | null = null;

  /** Arranca el worker. Llamar UNA SOLA VEZ en App.tsx tras login.
   *  @param getOnline   Función que devuelve el estado actual de conectividad
   *                     (típicamente del NetworkContext).
   *  @param onChange    Callback opcional para notificar cuándo está activamente
   *                     sincronizando (para mostrar spinner en banner). */
  start(getOnline: () => boolean, onChange?: (syncing: boolean) => void) {
    this.stop();
    this.getOnline = getOnline;
    this.onSyncStateChange = onChange ?? null;

    // v29 — Limpieza al arrancar: cualquier fila PROCESSING quedó zombi de la
    // sesión anterior (worker no terminó). La movemos a PENDING para retry.
    // stallMs=0 → resetea TODAS (no hay worker activo en este momento).
    cleanupStaleProcessing(0).catch(() => {});

    // Tick periódico
    this.timer = setInterval(() => this.tick(), TICK_INTERVAL_MS);

    // Drain inmediato cuando vuelve la red
    this.netUnsub = NetInfo.addEventListener((state) => {
      if (state.isConnected && state.isInternetReachable !== false) {
        // Pequeño delay para evitar disparar en transiciones rápidas
        const t = setTimeout(() => {
          this.reconnectTimeouts.delete(t);
          this.tick();
        }, 500);
        this.reconnectTimeouts.add(t);
      }
    });

    // Primer tick por si arrancamos online y hay cola pendiente — trackeado para
    // que stop() lo cancele (H7: si start() se llama dos veces rápido en hot
    // reload, el primer bootTimeout queda colgado y disparaba un tick fantasma).
    this.bootTimeout = setTimeout(() => {
      this.bootTimeout = null;
      this.tick();
    }, 1_000);
  }

  /** Detiene el worker. Llamar en logout o app teardown. */
  stop() {
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
    if (this.netUnsub) { this.netUnsub(); this.netUnsub = null; }
    if (this.bootTimeout) { clearTimeout(this.bootTimeout); this.bootTimeout = null; }
    for (const t of this.reconnectTimeouts) clearTimeout(t);
    this.reconnectTimeouts.clear();
  }

  /** Fuerza un tick inmediato (botón "Sincronizar ahora"). */
  async forceTick(): Promise<void> {
    await this.tick();
  }

  private async tick(): Promise<void> {
    if (this.isDraining) return; // evita ticks concurrentes
    if (!this.getOnline()) return; // no tiene sentido intentar sin red

    // v29 — Limpieza preventiva de filas PROCESSING zombi (crashes anteriores).
    cleanupStaleProcessing(60_000).catch(() => {});

    let batch: any[] = [];
    try {
      batch = await dequeueDue(50);
    } catch (e) {
      console.warn('[SyncWorker] dequeueDue falló:', e);
      return;
    }
    if (batch.length === 0) return;

    this.isDraining = true;
    this.onSyncStateChange?.(true);

    // try/finally garantiza que isDraining y onSyncStateChange siempre se
    // resetean, aunque un handler lance una excepción no capturada. Sin esto,
    // un crash en medio del batch dejaba syncing=true permanentemente y el
    // chip mostraba "subiendo" pegado.
    try {
      // Agrupar por opType: ops del mismo tipo sobre entidades distintas son
      // independientes entre sí, así que las paralelizamos dentro de cada grupo.
      const byType = new Map<string, any[]>();
      for (const row of batch) {
        const arr = byType.get(row.opType) ?? [];
        arr.push(row);
        byType.set(row.opType, arr);
      }
      for (const [, rows] of byType.entries()) {
        await Promise.all(rows.map((row) => this.processSingle(row).catch(() => {})));
      }
    } finally {
      this.isDraining = false;
      this.onSyncStateChange?.(false);
    }

    // v30 — Re-drain inmediato si quedan PENDING due. Cubre la race típica de
    // pauseSession (encola PUSH_WORK_SESSION + PUSH_WORK_SESSION_INTERVAL casi
    // simultáneos; la segunda puede llegar después del dequeueDue del primer
    // tick y quedar atrapada hasta el siguiente tick de 15s → chip "subiendo
    // 1" pegado). Lo metemos en next macrotask para que el observable de
    // observeCount() del hook actualice antes de mostrar transición.
    try {
      const stillDue = await dequeueDue(1);
      if (stillDue.length > 0) {
        setTimeout(() => { this.tick().catch(() => {}); }, 50);
      }
    } catch { /* noop */ }
  }

  /** Procesa una única op de la cola de forma atómica: markProcessing →
   *  handle → markSuccess/markFailure. Self-contained para poder ejecutarse
   *  en paralelo con otras ops del mismo tipo sin race conditions cruzadas. */
  private async processSingle(row: any): Promise<void> {
    const item = row as any;
    // H2: marcar PROCESSING ANTES de invocar el handler para que `enqueue`
    // concurrente no pise esta fila (crearía una nueva PENDING en paralelo).
    const acquired = await markProcessing(item.id);
    if (!acquired) return; // alguien más la tomó o ya no es PENDING
    try {
      await this.handle(item.opType as SyncOpType, item.entityId, item.payloadJson);
      await markSuccess(item.id);
    } catch (e) {
      console.warn(`[SyncWorker] op ${item.opType}/${item.entityId} falló:`, e);
      await markFailure(item.id, e);
    }
  }

  private async handle(opType: SyncOpType, entityId: string, _payloadJson: string | null): Promise<void> {
    switch (opType) {
      case 'PUSH_PROTOCOL_ITEM':
        return pushProtocolItemStrict(entityId);
      case 'PUSH_PROTOCOL_STATUS':
        return pushProtocolStatusStrict(entityId);
      case 'DELETE_PROTOCOL': {
        // v43 — payload trae quién eliminó, para registrarlo en la papelera.
        let meta: { deletedById?: string | null; deletedByName?: string | null } | null = null;
        try { meta = _payloadJson ? JSON.parse(_payloadJson) : null; } catch { /* sin meta */ }
        return deleteProtocolStrict(entityId, meta);
      }
      case 'PUSH_APPROVAL':
        return pushApprovalStrict(entityId);
      case 'PUSH_EVIDENCE':
        return pushEvidenceStrict(entityId);
      case 'PUSH_NC':
        return pushNonConformityStrict(entityId);
      case 'PUSH_PROJECT_SECTOR':
        return pushProjectSectorStrict(entityId);
      case 'DELETE_PROJECT_SECTOR':
        return deleteProjectSectorStrict(entityId);
      // v27 — Trazabilidad
      case 'PUSH_ACTIVITY':
        return pushActivityStrict(entityId);
      case 'DELETE_ACTIVITY':
        return deleteActivityStrict(entityId);
      case 'PUSH_EQUIPMENT_ACTIVITY':
        return pushEquipmentActivityStrict(entityId);
      case 'DELETE_EQUIPMENT_ACTIVITY':
        return deleteEquipmentActivityStrict(entityId);
      case 'PUSH_WORK_SHIFT':
        return pushWorkShiftStrict(entityId);
      case 'DELETE_WORK_SHIFT':
        return deleteWorkShiftStrict(entityId);
      case 'PUSH_SESSION_FORM_TEMPLATE':
        return pushSessionFormTemplateStrict(entityId);
      case 'PUSH_SESSION_FORM_TEMPLATE_ITEM':
        return pushSessionFormTemplateItemStrict(entityId);
      case 'PUSH_WORK_SESSION':
        return pushWorkSessionFullStrict(entityId);
      case 'DELETE_WORK_SESSION':
        return deleteWorkSessionStrict(entityId);
      case 'PUSH_WORK_SESSION_INTERVAL':
        return pushWorkSessionIntervalStrict(entityId);
      case 'PUSH_WORK_SESSION_FORM_ITEM':
        return pushWorkSessionFormItemStrict(entityId);
      case 'PUSH_WORK_SESSION_GPS_BATCH':
        return pushWorkSessionGpsBatchStrict(entityId);
      case 'PUSH_SUMMARY_ROW':
        return pushSummaryRowStrict(entityId);
      case 'UPLOAD_PHOTO': {
        // El evidence local guarda la URI del archivo en disco. Si ya está
        // SYNCED, marcar éxito silencioso. Si está UPLOADING (H3: otro proceso
        // ya está subiendo, o la app crasheó mid-upload), también skip — la
        // próxima apertura limpia esto manualmente o se intenta de nuevo tras
        // un timeout razonable. Si no existe, también éxito (fue purged).
        const ev = await evidencesCollection.find(entityId).catch(() => null);
        if (!ev) return;
        const status = (ev as any).uploadStatus;
        if (status === 'SYNCED') return;
        if (status === 'UPLOADING') {
          // Si el evidence lleva mucho rato en UPLOADING (>5min), asumimos
          // crash y reintentamos. Si es reciente, dejamos correr al otro.
          const ageMs = Date.now() - ((ev as any).updatedAt?.getTime?.() ?? 0);
          if (ageMs < 5 * 60_000) {
            throw new Error('Otro proceso está subiendo esta foto — reintentando luego');
          }
          // Resetear a PENDING para que la siguiente parte intente normal.
          await evidencesCollection.database.write(async () => {
            await (ev as any).update((u: any) => { u.uploadStatus = 'PENDING'; });
          });
        }
        const localUri = (ev as any).localUri as string | null;
        if (!localUri) {
          throw new Error('Evidence sin localUri — foto no se puede subir');
        }
        await uploadEvidencePhoto(entityId, localUri);
        return;
      }
      default: {
        // Defensa de tipo: si llega un op_type desconocido (data legacy o nueva op no implementada)
        // tratarlo como exitoso para no atascar la cola, pero loggear.
        console.warn(`[SyncWorker] op_type desconocido: ${opType} — descartando`);
        return;
      }
    }
  }
}

export const SyncWorker = new _SyncWorker();
