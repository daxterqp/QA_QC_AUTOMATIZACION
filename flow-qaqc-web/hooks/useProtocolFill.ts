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

      // 2. Items (ordenados)
      const { data: items, error: itemsErr } = await supabase
        .from('protocol_items')
        .select('*')
        .eq('protocol_id', protocolId)
        .order('sort_order', { ascending: true });
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
      status,
      observations,
    }: {
      itemId: string;
      status: 'PENDING' | 'OK' | 'OBSERVED' | 'NOK';
      observations?: string | null;
    }) => {
      const { error } = await supabase
        .from('protocol_items')
        .update({ status, observations: observations ?? null, updated_at: new Date().toISOString() })
        .eq('id', itemId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['protocol-fill', protocolId] }),
  });
}

// ── Guardar observación (debounced desde el componente) ───────────────────────

export async function saveItemObservation(itemId: string, text: string): Promise<void> {
  await supabase
    .from('protocol_items')
    .update({ observations: text.trim() || null, updated_at: new Date().toISOString() })
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
      const { data, error } = await supabase
        .from('evidences')
        .insert({
          protocol_item_id: itemId,
          s3_key: s3Key,
          file_name: s3Key.split('/').pop() ?? 'photo.jpg',
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

// ── Enviar protocolo para aprobación ─────────────────────────────────────────

export function useSubmitProtocol(protocolId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (filledById: string) => {
      const { error } = await supabase
        .from('protocols')
        .update({
          status: 'IN_PROGRESS',
          created_by_id: filledById,
          updated_at: new Date().toISOString(),
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
