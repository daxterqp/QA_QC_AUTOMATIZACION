import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@lib/supabase/client';

const supabase = createClient();

export function useApproveProtocol(protocolId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (signedById: string) => {
      const { error } = await supabase
        .from('protocols')
        .update({
          status: 'APPROVED',
          signed_by_id: signedById,
          signed_at: new Date().toISOString(),
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

export function useRejectProtocol(protocolId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (reason: string) => {
      const { error } = await supabase
        .from('protocols')
        .update({
          status: 'REJECTED',
          observations: reason,
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
