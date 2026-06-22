'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@lib/supabase/client';

const supabase = createClient();

/** Persiste el recuadro de "Comentarios generales" de un protocolo numérico. */
export function useUpdateProtocolGeneralComment(protocolId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (text: string | null) => {
      const { error } = await supabase
        .from('protocols')
        .update({ general_comment: text == null || text.trim() === '' ? null : text.trim(), updated_at: Date.now() })
        .eq('id', protocolId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['protocol-fill', protocolId] }),
  });
}
