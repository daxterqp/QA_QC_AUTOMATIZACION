import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@lib/supabase/client';
import { pushProtocolApproved, pushProtocolRejected } from '@lib/pushNotification';

const supabase = createClient();

async function getProtocolContext(protocolId: string) {
  const { data: proto } = await supabase.from('protocols').select('project_id, location_id, protocol_number').eq('id', protocolId).single();
  if (!proto) return null;
  let locationOnly: string | null = null;
  let specialty: string | null = null;
  if (proto.location_id) {
    const { data: loc } = await supabase.from('locations').select('location_only, specialty').eq('id', proto.location_id).single();
    if (loc) { locationOnly = loc.location_only; specialty = loc.specialty; }
  }
  return { projectId: proto.project_id, protocolName: proto.protocol_number ?? '', locationOnly, specialty };
}

export function useApproveProtocol(protocolId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (signedById: string) => {
      const { error } = await supabase
        .from('protocols')
        .update({
          status: 'APPROVED',
          signed_by_id: signedById,
          signed_at: Date.now(),
          is_locked: true,
          corrections_allowed: false,
          updated_at: Date.now(),
        })
        .eq('id', protocolId);
      if (error) throw error;
      // Send push notification
      const ctx = await getProtocolContext(protocolId);
      if (ctx) pushProtocolApproved(ctx.projectId, ctx.locationOnly, ctx.specialty, ctx.protocolName, protocolId);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['protocol-fill', protocolId] });
      qc.invalidateQueries({ queryKey: ['location-protocols'] });
      qc.invalidateQueries({ queryKey: ['location-progress'] });
    },
  });
}

export function useRejectProtocol(protocolId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (reason: string) => {
      const { error } = await supabase
        .from('protocols')
        .update({
          status: 'REJECTED',
          rejection_reason: reason,
          updated_at: Date.now(),
        })
        .eq('id', protocolId);
      if (error) throw error;
      // Send push notification
      const ctx = await getProtocolContext(protocolId);
      if (ctx) pushProtocolRejected(ctx.projectId, ctx.locationOnly, ctx.specialty, ctx.protocolName, protocolId);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['protocol-fill', protocolId] });
      qc.invalidateQueries({ queryKey: ['location-protocols'] });
      qc.invalidateQueries({ queryKey: ['location-progress'] });
    },
  });
}
