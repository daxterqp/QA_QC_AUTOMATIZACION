import { useQuery } from '@tanstack/react-query';
import { createClient } from '@lib/supabase/client';

const supabase = createClient();

/**
 * useRecycleBin (v43) — Papelera de Reciclaje (web).
 *
 * Lee `recycle_bin` (ensayos eliminados) ordenado por fecha de eliminación
 * (desc). Solo lectura; estos datos no interactúan con el resto del sistema.
 */
export interface RecycleBinEntry {
  id: string;
  project_id: string;
  protocol_id: string | null;
  protocol_code: string | null;
  protocol_number: string | null;
  template_id: string | null;
  template_name: string | null;
  location_name: string | null;
  sector_name: string | null;
  status: string | null;
  ensayo_date: string | null;
  snapshot_json: any;
  deleted_at: number;
  deleted_by_id: string | null;
  deleted_by_name: string | null;
}

export function useRecycleBin(projectId: string) {
  return useQuery({
    queryKey: ['recycle-bin', projectId],
    queryFn: async (): Promise<RecycleBinEntry[]> => {
      const { data, error } = await supabase
        .from('recycle_bin')
        .select('*')
        .eq('project_id', projectId)
        .order('deleted_at', { ascending: false });
      if (error) {
        // Tabla aún no migrada → lista vacía en vez de romper la página.
        if (/relation|does not exist|schema cache/i.test(error.message)) return [];
        throw error;
      }
      return (data ?? []) as RecycleBinEntry[];
    },
    enabled: !!projectId,
    staleTime: 30 * 1000,
  });
}
