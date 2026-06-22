/**
 * SummaryRowService — Escritura PROGRESIVA de las "Tablas Resumen" (Fase 1b).
 *
 * Al guardar/enviar un ensayo se llama a `upsertSummaryRow(protocolId)`: extrae
 * los valores de la ficha (1 entrada por celda reportable) + los datos fijos
 * (fecha/código/proyecto/sector/ubicación) y hace upsert de UNA fila en
 * `summary_rows`. La vista de Tablas Resumen solo lee — nunca recalcula en masa.
 *
 * Los valores se guardan crudos en `values_json` keyed por `${partida}:${letra}`
 * (o `${partida}` si la fila no es multi-celda). El mapeo celda→columna y las
 * agregaciones los resuelve la vista usando la config de la plantilla.
 */
import { Q } from '@nozbe/watermelondb';
import {
  database, summaryRowsCollection, protocolsCollection, protocolItemsCollection,
  projectSectorsCollection, locationsCollection, projectsCollection, usersCollection,
  labAuxTablesCollection,
} from '@db/index';
import { parseNumericRow, extractMatrices, splitRowComments, colLetter, scopeKeyFor } from '@utils/numericProtocol';
import { resolveScopeCells, type ScopeCell, type XrefValues } from '@utils/formulaEval';
import { resolveXrefs } from '@services/XrefResolver';
import { enqueue as enqueueSync } from '@services/SyncQueueService';
import { supabase } from '@config/supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';

/** Versión del esquema de values_json (paridad con web). Subir → backfill rehace filas viejas. */
export const SUMMARY_ROW_VERSION = 3;

/** Construye el mapa de valores de la ficha: ingresados Y calculados (recomputa
 *  el scope de fórmulas/lookups). Antes solo guardaba los ingresados. */
function extractValues(items: { partidaItem: string | null; id: string; validationMethod: string | null; comments: string | null }[], auxTables?: import('@utils/formulaEval').AuxTables, xrefValues?: XrefValues): Record<string, string> {
  const parsed = items.map(it => ({ item: it, spec: parseNumericRow(it.validationMethod) }));
  const { mainRows, matrices } = extractMatrices(parsed);
  // Keyear por item.id (NO por partida): dos filas con el mismo partida_item no
  // deben pisarse las celdas entre sí (igual que buildFrozenComments).
  const commentsByItem = new Map<string, string[]>();
  const scopeCells: ScopeCell[] = [];

  for (const { item, spec } of mainRows) {
    if (!spec || spec.kind !== 'row') continue;
    const partida = (item.partidaItem ?? '').trim();
    const arr = splitRowComments(item.comments, spec.cells.length);
    commentsByItem.set(item.id, arr);
    spec.cells.forEach((c, i) => {
      const key = scopeKeyFor(partida, i);
      if (c.kind === 'manual' || c.kind === 'percent' || c.kind === 'bool' || c.kind === 'free') scopeCells.push({ key, kind: 'manual', raw: arr[i] ?? '' });
      else if (c.kind === 'list' || c.kind === 'date' || c.kind === 'time' || c.kind === 'equipment' || c.kind === 'text') scopeCells.push({ key, kind: 'list', raw: arr[i] ?? '' });
      else if (c.kind === 'val') scopeCells.push({ key, kind: 'manual', raw: (c as any).literal ?? '' });
      else if (c.kind === 'lookup') scopeCells.push({ key, kind: 'lookup', refKey: (c as any).refKey, matrixId: (c as any).matrixId, searchCol: (c as any).searchCol, returnCol: (c as any).returnCol });
      else if (c.kind === 'formula') scopeCells.push({ key, kind: 'formula', expr: (c as any).expr });
    });
  }

  let scope: Record<string, number | null> = {}, textValues: Record<string, string> = {};
  try { const r = resolveScopeCells(scopeCells, matrices, xrefValues, auxTables); scope = r.scope; textValues = r.textValues; } catch { /* sin recompute */ }

  const values: Record<string, string> = {};
  for (const { item, spec } of mainRows) {
    if (!spec || spec.kind !== 'row') continue;
    const partidaRaw = (item.partidaItem ?? '').trim();
    const partida = partidaRaw || item.id;
    const arr = commentsByItem.get(item.id) ?? [];
    spec.cells.forEach((c, i) => {
      if ((c as any).hidden || (c as any).noReport || c.kind === 'blank') return;
      const skey = scopeKeyFor(partidaRaw, i);
      let v = arr[i] ?? '';
      if (v === '' && (c.kind === 'formula' || c.kind === 'lookup')) {
        if (textValues[skey]) v = textValues[skey];
        else if (scope[skey] != null) v = String(scope[skey]);
      }
      if (v !== '') values[`${partida}:${colLetter(i)}`] = v;
    });
  }
  return values;
}

/** Crea/actualiza la fila resumen del protocolo. Silencioso ante errores
 *  (no debe romper el guardado del ensayo). */
export async function upsertSummaryRow(protocolId: string, opts?: { xrefValues?: XrefValues }): Promise<void> {
  try {
    const protocol: any = await protocolsCollection.find(protocolId);
    const items: any[] = await protocolItemsCollection.query(Q.where('protocol_id', protocolId)).fetch();

    // Nombres legibles (sector / ubicación / proyecto).
    const [projectArr, sectorArr, locArr] = await Promise.all([
      projectsCollection.query(Q.where('id', protocol.projectId)).fetch().catch(() => []),
      protocol.sectorId ? projectSectorsCollection.query(Q.where('id', protocol.sectorId)).fetch().catch(() => []) : Promise.resolve([]),
      protocol.locationId ? locationsCollection.query(Q.where('id', protocol.locationId)).fetch().catch(() => []) : Promise.resolve([]),
    ]);
    const projectName = (projectArr[0] as any)?.name ?? null;
    const sectorName = (sectorArr[0] as any)?.name ?? null;
    const locationName = (locArr[0] as any)?.name ?? null;

    // Nombres de quién llenó / aprobó (columnas "Realizado por" / "Aprobado por").
    const [filledArr, signedArr] = await Promise.all([
      protocol.filledById ? usersCollection.query(Q.where('id', protocol.filledById)).fetch().catch(() => []) : Promise.resolve([]),
      protocol.signedById ? usersCollection.query(Q.where('id', protocol.signedById)).fetch().catch(() => []) : Promise.resolve([]),
    ]);
    const realizadoPor = (filledArr[0] as any)?.fullName ?? null;
    const aprobadoPor = (signedArr[0] as any)?.fullName ?? null;

    // v41 — Tablas auxiliares del proyecto para que BUSCAR() recompute en el resumen.
    let auxTables: import('@utils/formulaEval').AuxTables = {};
    try {
      const tbls = await labAuxTablesCollection.query(Q.where('project_id', protocol.projectId)).fetch();
      for (const t of tbls as any[]) {
        try { auxTables[String(t.groupKey).toLowerCase()] = { columns: JSON.parse(t.columnsJson ?? '[]'), rows: JSON.parse(t.rowsJson ?? '[]') }; } catch { /* omite tabla corrupta */ }
      }
    } catch { /* sin tablas → BUSCAR vacío en resumen */ }
    // v42 — Resolver llamados entre ensayos `@código.celda` para que NO queden en
    // blanco en el Resumen (degrada solo: pendiente/ambiguo → null, nunca lanza).
    // Si el caller (submit) ya resolvió, reutilizamos su resolución para que el
    // Resumen y el congelado muestren EXACTAMENTE el mismo valor (consistencia).
    let xrefValues: XrefValues = opts?.xrefValues ?? {};
    if (!opts?.xrefValues) {
      try { xrefValues = (await resolveXrefs(protocol.projectId, items)).values; } catch { /* sin xrefs */ }
    }
    const valuesJson = JSON.stringify(extractValues(items, auxTables, xrefValues));
    // Incluimos los datos fijos también dentro de values_json (para que la vista
    // tenga todo en un solo objeto), además de en las columnas dedicadas.
    const enriched = JSON.stringify({
      ...JSON.parse(valuesJson),
      project_name: projectName, sector_name: sectorName, location_name: locationName,
      protocol_code: protocol.protocolCode ?? null, ensayo_date: protocol.ensayoDate ?? null,
      realizado_por: realizadoPor, aprobado_por: aprobadoPor,
      estado: protocol.status ?? null,
      fecha_aprobacion: protocol.signedAt ? new Date(protocol.signedAt).toLocaleDateString('es-PE') : null,
      _sv: SUMMARY_ROW_VERSION,
    });

    const existing = await summaryRowsCollection.query(Q.where('protocol_id', protocolId)).fetch();
    const assign = (r: any) => {
      r.projectId = protocol.projectId;
      r.templateId = protocol.templateId ?? null;
      r.protocolId = protocolId;
      r.protocolCode = protocol.protocolCode ?? null;
      r.protocolNumber = protocol.protocolNumber ?? null;
      r.ensayoDate = protocol.ensayoDate ?? null;
      r.sectorId = protocol.sectorId ?? null;
      r.sectorName = sectorName;
      r.locationId = protocol.locationId ?? null;
      r.locationName = locationName;
      r.status = protocol.status ?? null;
      r.valuesJson = enriched;
    };
    await database.write(async () => {
      if (existing[0]) await (existing[0] as any).update(assign);
      else await summaryRowsCollection.create(assign);
    });

    // Push a Supabase (upsert por protocol_id) para que la web/otros lo vean.
    // Best-effort: si falla (offline/permisos), la fila local ya quedó guardada.
    const now = Date.now();
    supabase.from('protocol_summary_rows').upsert({
      project_id: protocol.projectId,
      template_id: protocol.templateId ?? null,
      protocol_id: protocolId,
      protocol_code: protocol.protocolCode ?? null,
      protocol_number: protocol.protocolNumber ?? null,
      ensayo_date: protocol.ensayoDate ?? null,
      sector_id: protocol.sectorId ?? null,
      sector_name: sectorName,
      location_id: protocol.locationId ?? null,
      location_name: locationName,
      status: protocol.status ?? null,
      values_json: JSON.parse(enriched),
      updated_at: now,
    }, { onConflict: 'protocol_id' }).then(({ error }) => {
      if (error) console.warn('[summary] push Supabase falló (¿corriste v38?):', error.message);
    });
    // v42 — Red de seguridad: encolar PUSH_SUMMARY_ROW (reintento + backoff) por si
    // el push directo de arriba falló (offline/permisos). Idempotente y dedup por
    // (opType, protocolId) → varias ediciones cuestan una sola subida efectiva.
    enqueueSync({ opType: 'PUSH_SUMMARY_ROW', entityId: protocolId, projectId: protocol.projectId }).catch(() => {});
  } catch (e) {
    console.warn('[summary] upsertSummaryRow falló:', e);
  }
}

const cursorKey = (projectId: string) => `summary_cursor_${projectId}`;

/** PULL INCREMENTAL: trae de Supabase solo las filas con updated_at > cursor y
 *  las mergea en la caché local `summary_rows`. Así el celular tiene TODOS los
 *  ensayos (propios y de otros) sin descargar toda la tabla cada vez. */
export async function pullSummaryRows(projectId: string): Promise<void> {
  try {
    const cursorRaw = await AsyncStorage.getItem(cursorKey(projectId));
    const cursor = cursorRaw ? Number(cursorRaw) || 0 : 0;
    // Solapamiento de 2 min: cierra huecos por desfase de reloj entre dispositivos.
    const since = Math.max(0, cursor - 120_000);
    const { data, error } = await supabase
      .from('protocol_summary_rows')
      .select('*')
      .eq('project_id', projectId)
      .gt('updated_at', since)
      .order('updated_at', { ascending: true }); // determinista: el cursor avanza al máximo realmente leído
    if (error) { console.warn('[summary] pull falló (¿corriste v38?):', error.message); return; }
    const remote = (data ?? []) as any[];
    if (remote.length === 0) return;

    // Index local existente por protocol_id.
    const localRows: any[] = await summaryRowsCollection.query(Q.where('project_id', projectId)).fetch();
    const byProto = new Map<string, any>(localRows.map(r => [r.protocolId, r]));

    let maxC = cursor;
    await database.write(async () => {
      for (const rr of remote) {
        if (typeof rr.updated_at === 'number' && rr.updated_at > maxC) maxC = rr.updated_at;
        const assign = (r: any) => {
          r.projectId = rr.project_id;
          r.templateId = rr.template_id ?? null;
          r.protocolId = rr.protocol_id;
          r.protocolCode = rr.protocol_code ?? null;
          r.protocolNumber = rr.protocol_number ?? null;
          r.ensayoDate = rr.ensayo_date ?? null;
          r.sectorId = rr.sector_id ?? null;
          r.sectorName = rr.sector_name ?? null;
          r.locationId = rr.location_id ?? null;
          r.locationName = rr.location_name ?? null;
          r.status = rr.status ?? null;
          r.valuesJson = rr.values_json != null ? JSON.stringify(rr.values_json) : null;
        };
        const existing = byProto.get(rr.protocol_id);
        if (existing) {
          // v42e (M9) — no pisar una versión local MÁS NUEVA con una remota más vieja
          // (puede pasar dentro del solapamiento de 120s, p. ej. justo tras un upsert
          // local de este equipo). Si la remota no es más reciente, se omite (reaplicar
          // datos idénticos no aporta y evita el pisado stale).
          const remoteTs = typeof rr.updated_at === 'number' ? rr.updated_at : 0;
          const localTs = existing.updatedAt instanceof Date ? existing.updatedAt.getTime() : 0;
          if (remoteTs >= localTs) await existing.update(assign);
        } else {
          await summaryRowsCollection.create(assign);
        }
      }
    });
    await AsyncStorage.setItem(cursorKey(projectId), String(maxC));
  } catch (e) {
    console.warn('[summary] pullSummaryRows falló:', e);
  }
}

/** BACKFILL local: construye la fila resumen de los protocolos no-DRAFT del
 *  celular que aún no la tengan (datos previos a la feature). Garantiza que no
 *  falte ningún ensayo de origen móvil; también los empuja a la nube. */
export async function backfillLocalSummary(projectId: string): Promise<void> {
  try {
    const protos: any[] = await protocolsCollection
      .query(Q.where('project_id', projectId), Q.where('status', Q.notEq('DRAFT')))
      .fetch();
    const sums: any[] = await summaryRowsCollection.query(Q.where('project_id', projectId)).fetch();
    // Al día = existe Y con la versión actual del esquema.
    const fresh = new Set<string>();
    for (const s of sums) {
      let sv = 0;
      try { sv = (s.valuesJson ? JSON.parse(s.valuesJson)._sv : 0) ?? 0; } catch { sv = 0; }
      if (sv >= SUMMARY_ROW_VERSION) fresh.add(s.protocolId);
    }
    for (const p of protos) {
      if (!fresh.has(p.id)) await upsertSummaryRow(p.id);
    }
  } catch (e) {
    console.warn('[summary] backfillLocalSummary falló:', e);
  }
}
