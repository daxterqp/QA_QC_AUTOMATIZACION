/**
 * ProtocolInstanceService — creación de instancias de protocolo (v31).
 *
 * Extrae el flujo que vivía en LocationProtocolsScreen (creación por ubicación)
 * y lo generaliza para los modos de llenado nuevos (Parte D): por sector, por
 * tipo y por fecha — con soporte de LOTE (N instancias en un solo write) y
 * codificación correlativa (Parte E) si el proyecto la tiene activa.
 *
 * Invariantes (¡no romper!):
 *  - Este servicio es DUEÑO del `database.write` — el caller no debe anidarlo
 *    en otro writer.
 *  - El enqueue de PUSH_PROTOCOL_STATUS ocurre DESPUÉS del write y por cada
 *    protocolo creado: el outbox drena FIFO, así el protocolo llega a Supabase
 *    ANTES que cualquier PUSH_PROTOCOL_ITEM posterior (FK items→protocols).
 *  - Defaults exactos del flujo original: status DRAFT, isLocked false,
 *    correctionsAllowed false, uploadStatus PENDING, lat/lng null.
 *  - La reconciliación plantilla→instancia NO vive aquí (solo aplica al flujo
 *    "abrir instancia existente" de LocationProtocolsScreen).
 */

import { Q } from '@nozbe/watermelondb';
import {
  protocolsCollection,
  protocolItemsCollection,
  protocolTemplateItemsCollection,
  projectsCollection,
  recycleBinCollection,
  database,
} from '@db/index';
import { expandTemplateItems } from '@utils/parametricExpand';
import { enqueue as enqueueSync } from '@services/SyncQueueService';
import { parseFeatureFlagsJson } from '@utils/featureFlags';
import {
  buildProtocolCode, nextSeq, validateMask, todayEnsayoDate, parseEnsayoDate, pickMask, type SeqResetScope,
} from '@utils/protocolCode';

export interface CreateInstancesArgs {
  projectId: string;
  template: { id: string; name: string; idProtocolo?: string | null };
  /** Cuántas instancias crear (lote). Default 1. */
  count?: number;
  /** Modo por ubicación (flujo clásico). null/undefined en los modos nuevos. */
  locationId?: string | null;
  locationName?: string | null;
  /** Modo por sector. */
  sectorId?: string | null;
  sectorName?: string | null;
  /** Fecha del ensayo YYYY-MM-DD. Default: hoy (en TODOS los modos — el modo
   *  "por fecha" es una vista sobre todo lo creado desde v31). */
  ensayoDate?: string | null;
  /** v32 — Hora de INICIO del ensayo (HH:MM). Default: hora del sistema al
   *  momento de guardar. */
  ensayoTime?: string | null;
  /** v43 — Muestra física a la que se vincula el ensayo (módulo por muestra). */
  sampleId?: string | null;
  /** Expansión paramétrica elegida por el usuario (vacío = defaultN). */
  repeatChoices?: Record<string, number>;
}

export interface CreateInstancesResult {
  ids: string[];
  /** Códigos asignados (paralelo a ids; null si la codificación está off). */
  codes: (string | null)[];
  warnings: string[];
}

export async function createInstances(args: CreateInstancesArgs): Promise<CreateInstancesResult> {
  const count = Math.max(1, Math.min(50, args.count ?? 1));
  const warnings: string[] = [];

  // 1. Items de la plantilla + expansión paramétrica (defaultN si no hay choices).
  const templateItems = await protocolTemplateItemsCollection
    .query(Q.where('template_id', args.template.id))
    .fetch();
  const tmplForExpand = templateItems.map((ti: any) => ({
    partida_item: ti.partidaItem ?? null,
    item_description: ti.itemDescription,
    validation_method: ti.validationMethod ?? null,
    section: (ti as any).section ?? null,
  }));
  const { items: expanded, warnings: expandWarnings } = expandTemplateItems(tmplForExpand, args.repeatChoices ?? {});
  if (expandWarnings.length > 0) {
    console.warn('[parametric] expansion warnings:', expandWarnings);
    warnings.push(...expandWarnings);
  }

  // 2. Codificación correlativa (Parte E) si el proyecto la tiene activa.
  const ensayoDate = args.ensayoDate ?? todayEnsayoDate();
  let codes: (string | null)[] = new Array(count).fill(null);
  try {
    const project: any = await projectsCollection.find(args.projectId);
    const flags = parseFeatureFlagsJson(project?.featureFlags);
    const tipo0 = (args.template.idProtocolo ?? '').trim() || (args.template.name ?? '').trim();
    // v46.1 — máscara por tipo (si existe) + ámbito de reinicio de secuencia configurable.
    const mask = pickMask(flags.coding_mask_default, flags.coding_mask_by_type, tipo0);
    const resetScope: SeqResetScope = flags.coding_seq_reset === 'year_sector' ? { sector: true }
      : flags.coding_seq_reset === 'year_month' ? { month: true } : {};
    if (flags.protocol_codes && validateMask(mask).length === 0) {
      const tipo = tipo0;
      if (!tipo) throw new Error('plantilla sin id_protocolo ni nombre — código omitido');
      const date = parseEnsayoDate(ensayoDate) ?? new Date();
      // Ámbito tipo+año+proyecto: max de los códigos locales del proyecto
      // (incluye filas creadas offline aún no sincronizadas). Si otro celular
      // generó el mismo seq, el push lo detecta (índice único) y re-secuencia.
      const existing = await protocolsCollection
        .query(Q.where('project_id', args.projectId), Q.where('protocol_code', Q.notEq(null)))
        .fetch();
      // v43.2 — Los correlativos de ensayos ELIMINADOS (papelera) NO deben reutilizarse:
      // si se reusan, al subir el nuevo ensayo colisiona con el viejo aún presente en la
      // nube (carrera con el borrado) → la subida se quedaba atascada. Incluir los códigos
      // de la papelera local hace que el secuencial salte sobre ellos (integridad de códigos).
      const recycled = await recycleBinCollection
        .query(Q.where('project_id', args.projectId), Q.where('protocol_code', Q.notEq(null)))
        .fetch().catch(() => [] as any[]);
      const usedCodes = [...existing.map((p: any) => p.protocolCode), ...recycled.map((r: any) => r.protocolCode)];
      const baseSeq = nextSeq(usedCodes, mask, tipo, date, args.sectorName ?? null, resetScope);
      codes = Array.from({ length: count }, (_, i) =>
        buildProtocolCode(mask, { tipo, date, seq: baseSeq + i, sector: args.sectorName ?? null }));
    }
  } catch (e) {
    console.warn('[createInstances] codificación omitida:', e);
    warnings.push('No se pudo generar el código correlativo (se creó sin código).');
  }

  // 3. UN write atómico para las N instancias + sus items.
  const ids: string[] = [];
  await database.write(async () => {
    for (let i = 0; i < count; i++) {
      const protocol = await protocolsCollection.create((p: any) => {
        p.projectId = args.projectId;
        p.locationId = args.locationId ?? null;
        p.templateId = args.template.id;
        p.protocolNumber = args.template.name;
        p.locationReference = args.locationName ?? args.sectorName ?? '';
        p.status = 'DRAFT';
        p.isLocked = false;
        p.correctionsAllowed = false;
        p.uploadStatus = 'PENDING';
        p.latitude = null;
        p.longitude = null;
        if (args.sectorId) {
          p.sectorId = args.sectorId;
          p.sectorAssignedManually = true;   // asignado por el modo "por sector"
        }
        p.protocolCode = codes[i];
        if (args.sampleId) p.sampleId = args.sampleId;   // v43 — ensayo por muestra
        p.ensayoDate = ensayoDate;
        // v32 — hora de inicio: la elegida en el modal o la del sistema AHORA.
        p.ensayoTime = args.ensayoTime
          ?? `${String(new Date().getHours()).padStart(2, '0')}:${String(new Date().getMinutes()).padStart(2, '0')}`;
      });
      for (const tmplItem of expanded) {
        await protocolItemsCollection.create((item: any) => {
          item.protocolId = protocol.id;
          item.partidaItem = tmplItem.partida_item ?? null;
          item.itemDescription = tmplItem.item_description;
          item.validationMethod = tmplItem.validation_method ?? null;
          item.section = tmplItem.section ?? null;
          item.isCompliant = false;
          item.comments = null;
        });
      }
      ids.push(protocol.id);
    }
  });

  // 4. Encolar push (FIFO: el protocolo viaja antes que cualquier item futuro).
  for (const id of ids) {
    enqueueSync({ opType: 'PUSH_PROTOCOL_STATUS', entityId: id, projectId: args.projectId }).catch(() => {});
  }

  return { ids, codes, warnings };
}
