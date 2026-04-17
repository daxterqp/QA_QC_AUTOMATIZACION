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

      // 2. Items (ordenados por created_at como hace el APK)
      const { data: items, error: itemsErr } = await supabase
        .from('protocol_items')
        .select('*')
        .eq('protocol_id', protocolId)
        .order('created_at', { ascending: true });
      if (itemsErr) throw itemsErr;

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
      const { error } = await supabase
        .from('protocols')
        .update({
          status: 'SUBMITTED',
          filled_by_id: filledById,
          filled_at: Date.now(),
          submitted_at: Date.now(),
          updated_at: Date.now(),
        })
        .eq('id', protocolId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['protocol-fill', protocolId] });
      qc.invalidateQueries({ queryKey: ['location-protocols'] });
      qc.invalidateQueries({ queryKey: ['location-progress'] });
    },
  });
}
