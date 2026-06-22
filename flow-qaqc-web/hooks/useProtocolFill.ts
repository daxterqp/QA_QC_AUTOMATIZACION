import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@lib/supabase/client';
import type { Protocol, ProtocolItem, Evidence, Location, Project } from '@/types';

const supabase = createClient();

// ── Protocolo completo con items y evidencias ─────────────────────────────────

export interface ProtocolFillData {
  protocol: Protocol;
  items: ProtocolItem[];
  evidenceMap: Record<string, Evidence[]>;
  location: Location | null;
  project: Project | null;
}

export function useProtocolFill(protocolId: string) {
  return useQuery({
    queryKey: ['protocol-fill', protocolId],
    queryFn: async (): Promise<ProtocolFillData> => {
      // 1. Protocolo
      const { data: protocol, error: protoErr } = await supabase
        .from('protocols')
        .select('*')
        .eq('id', protocolId)
        .single();
      if (protoErr) throw protoErr;

      // 2. Items — fetch sin order del servidor; ordenamos cliente-side por partida_item
      //    con sort natural ("1, 2, 10" en vez de "1, 10, 2") y fallback a created_at.
      const { data: itemsRaw, error: itemsErr } = await supabase
        .from('protocol_items')
        .select('*')
        .eq('protocol_id', protocolId);
      if (itemsErr) throw itemsErr;
      const items = [...((itemsRaw ?? []) as ProtocolItem[])].sort((x, y) => {
        const a = String(x.partida_item ?? '').trim();
        const b = String(y.partida_item ?? '').trim();
        const cmp = a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
        if (cmp !== 0) return cmp;
        return Number(x.created_at ?? 0) - Number(y.created_at ?? 0);
      });

      // 3. Evidencias de todos los items
      const itemIds = (items ?? []).map((i: ProtocolItem) => i.id);
      let evidenceMap: Record<string, Evidence[]> = {};
      if (itemIds.length > 0) {
        const { data: evs } = await supabase
          .from('evidences')
          .select('*')
          .in('protocol_item_id', itemIds)
          .order('created_at', { ascending: true });
        for (const ev of (evs ?? [])) {
          if (!evidenceMap[ev.protocol_item_id]) evidenceMap[ev.protocol_item_id] = [];
          evidenceMap[ev.protocol_item_id].push(ev as Evidence);
        }
      }

      // 4. Ubicación
      let location: Location | null = null;
      if (protocol.location_id) {
        const { data: loc } = await supabase
          .from('locations')
          .select('*')
          .eq('id', protocol.location_id)
          .single();
        location = loc as Location ?? null;
      }

      // 5. Proyecto (para nombre → S3 prefix)
      let project: Project | null = null;
      if (protocol.project_id) {
        const { data: proj } = await supabase
          .from('projects')
          .select('*')
          .eq('id', protocol.project_id)
          .single();
        project = proj as Project ?? null;
      }

      return {
        protocol: protocol as Protocol,
        items: (items ?? []) as ProtocolItem[],
        evidenceMap,
        location,
        project,
      };
    },
    enabled: !!protocolId,
  });
}

// ── Guardar respuesta de un item ──────────────────────────────────────────────

export function useSaveItemAnswer(protocolId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      itemId,
      isCompliant,
      isNa,
      comments,
    }: {
      itemId: string;
      isCompliant: boolean | null;
      isNa: boolean;
      comments?: string | null;
    }) => {
      const hasAnswer = isNa || isCompliant !== null;
      const { error } = await supabase
        .from('protocol_items')
        .update({
          is_compliant: isNa ? false : (isCompliant ?? false),
          is_na: isNa,
          has_answer: hasAnswer,
          ...(comments !== undefined ? { comments: comments ?? null } : {}),
          updated_at: Date.now(),
        })
        .eq('id', itemId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['protocol-fill', protocolId] }),
  });
}

// ── Guardar comentario (debounced desde el componente) ────────────────────────

export async function saveItemComment(itemId: string, text: string): Promise<void> {
  await supabase
    .from('protocol_items')
    .update({ comments: text.trim() || null, updated_at: Date.now() })
    .eq('id', itemId);
}

// ── Guardar evidencia (foto) ──────────────────────────────────────────────────

export function useSaveEvidence(protocolId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      itemId,
      s3Key,
    }: {
      itemId: string;
      s3Key: string;
    }): Promise<Evidence> => {
      const now = Date.now();
      const { data, error } = await supabase
        .from('evidences')
        .insert({
          id: crypto.randomUUID(),
          protocol_item_id: itemId,
          s3_url_placeholder: s3Key,
          local_uri: '',
          upload_status: 'SYNCED',
          created_at: now,
          updated_at: now,
        })
        .select()
        .single();
      if (error) throw error;
      return data as Evidence;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['protocol-fill', protocolId] }),
  });
}

// ── Eliminar evidencia ────────────────────────────────────────────────────────

export function useDeleteEvidence(protocolId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (evidenceId: string) => {
      const { error } = await supabase.from('evidences').delete().eq('id', evidenceId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['protocol-fill', protocolId] }),
  });
}

/** v41 — Congela en `comments` los valores computados (fórmula/lookup/BUSCAR) del
 *  protocolo, para que el Audit/PDF muestren lo que vio el usuario sin recalcular.
 *  Se llama al ENVIAR/RE-ENVIAR. Best-effort: si falla, el submit continúa. */
export async function freezeProtocolItems(protocolId: string): Promise<import('@lib/formulaEval').XrefValues> {
  try {
    const { data: proto } = await supabase.from('protocols').select('project_id').eq('id', protocolId).single();
    const projectId = (proto as { project_id?: string } | null)?.project_id;
    const [{ data: items }, auxRes] = await Promise.all([
      supabase.from('protocol_items').select('id, partida_item, validation_method, comments').eq('protocol_id', protocolId),
      projectId
        ? supabase.from('lab_aux_tables').select('group_key, columns_json, rows_json').eq('project_id', projectId)
        : Promise.resolve({ data: [] as any[] }),
    ]);
    const auxTables: import('@lib/formulaEval').AuxTables = {};
    for (const t of ((auxRes as any).data ?? []) as { group_key: string; columns_json: unknown; rows_json: unknown }[]) {
      auxTables[String(t.group_key).toLowerCase()] = {
        columns: Array.isArray(t.columns_json) ? (t.columns_json as string[]) : [],
        rows: Array.isArray(t.rows_json) ? (t.rows_json as string[][]) : [],
      };
    }
    const list = (items ?? []) as { id: string; partida_item: string | null; validation_method: string | null; comments: string | null }[];
    // v42 — Resolver los llamados entre ensayos `@código.celda` (degrada solo).
    let xrefVals: import('@lib/formulaEval').XrefValues = {};
    let xrefMeta: Record<string, unknown> = {};
    if (projectId) {
      try {
        const { fetchXrefResolution } = await import('@hooks/useXrefs');
        const r = await fetchXrefResolution(projectId, list);
        xrefVals = r.values; xrefMeta = r.meta;
      } catch { /* sin xrefs */ }
    }
    const { buildFrozenComments } = await import('@lib/freezeSnapshot');
    const frozen = buildFrozenComments(list, auxTables, xrefVals);
    for (const it of list) {
      const next = frozen.get(it.id);
      if (next != null && next !== (it.comments ?? '')) {
        await supabase.from('protocol_items').update({ comments: next, updated_at: Date.now() }).eq('id', it.id);
      }
    }
    // v42 — guardar el snapshot de los llamados (doble check + frescura). Solo
    // tocamos la columna cuando HAY llamados → los ensayos sin @código no dependen
    // de v45 (la columna jsonb) para enviarse. (Misma lección que is_hidden.)
    if (Object.keys(xrefMeta).length > 0) {
      await supabase.from('protocols')
        .update({ xref_snapshot_json: xrefMeta, updated_at: Date.now() })
        .eq('id', protocolId);
    }
    return xrefVals;
  } catch (e) {
    console.warn('[freezeProtocolItems] no se pudo congelar el snapshot:', e);
    return {};
  }
}

// ── Re-enviar protocolo a revisión (tras edición del jefe) ───────────────────

export function useResubmitProtocol(protocolId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('protocols')
        .update({
          status: 'SUBMITTED',
          submitted_at: Date.now(),
          updated_at: Date.now(),
        })
        .eq('id', protocolId);
      if (error) throw error;
      const xv = await freezeProtocolItems(protocolId);   // v41/v42 — congelar snapshot
      // Tablas Resumen — refresca la fila resumen reusando la misma resolución de xrefs.
      const { upsertSummaryRowWeb } = await import('@lib/summaryRow');
      void upsertSummaryRowWeb(protocolId, xv);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['protocol-fill', protocolId] });
      qc.invalidateQueries({ queryKey: ['location-protocols'] });
      qc.invalidateQueries({ queryKey: ['location-progress'] });
    },
  });
}

// ── Enviar protocolo para aprobación ─────────────────────────────────────────

export function useSubmitProtocol(protocolId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (filledById: string) => {
      // Detectar si esto es un RESUBMIT (status era REJECTED y ya hay filled_by_id
      // original). Si lo es, preservar al firmante original — mantiene la
      // trazabilidad de quién llenó por primera vez aunque otro supervisor lo
      // corrija después. Paridad con mobile ProtocolFillScreen wasResubmit.
      const { data: existing } = await supabase
        .from('protocols')
        .select('status, filled_by_id, filled_at')
        .eq('id', protocolId)
        .single();
      const wasResubmit = existing?.status === 'REJECTED' && !!existing.filled_by_id;
      const patch: Record<string, unknown> = {
        status: 'SUBMITTED',
        submitted_at: Date.now(),
        updated_at: Date.now(),
      };
      if (!wasResubmit) {
        patch.filled_by_id = filledById;
        patch.filled_at = Date.now();
      }
      const { error } = await supabase
        .from('protocols')
        .update(patch)
        .eq('id', protocolId);
      if (error) throw error;

      // v23 — Aprobaciones jerárquicas: si el proyecto tiene multi-level activo y
      // levels > 1, crear las filas pendientes de protocol_approvals.
      try {
        const { data: proto } = await supabase
          .from('protocols').select('project_id').eq('id', protocolId).single();
        if (proto?.project_id) {
          const { data: project } = await supabase
            .from('projects').select('feature_flags').eq('id', proto.project_id).single();
          const flags = project?.feature_flags as any;
          if (flags?.multi_level_approval && typeof flags.approval_levels === 'number' && flags.approval_levels > 1) {
            const { ensureApprovalRows } = await import('@hooks/useProtocolAudit');
            await ensureApprovalRows(protocolId, flags.approval_levels as 1 | 2 | 3);
          }
        }
      } catch (e) {
        // No bloquear el submit si falla la creación de filas — el siguiente intento las creará.
        console.warn('[useSubmitProtocol] no se pudieron crear protocol_approvals:', e);
      }

      const xv = await freezeProtocolItems(protocolId);   // v41/v42 — congelar snapshot
      // Tablas Resumen — construcción PROGRESIVA reusando la misma resolución de xrefs.
      const { upsertSummaryRowWeb } = await import('@lib/summaryRow');
      void upsertSummaryRowWeb(protocolId, xv);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['protocol-fill', protocolId] });
      qc.invalidateQueries({ queryKey: ['protocol-approvals', protocolId] });
      qc.invalidateQueries({ queryKey: ['location-protocols'] });
      qc.invalidateQueries({ queryKey: ['location-progress'] });
    },
  });
}
