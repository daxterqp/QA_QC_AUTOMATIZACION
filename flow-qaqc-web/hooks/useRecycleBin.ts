import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@lib/supabase/client';
import { deleteS3Objects } from '@lib/s3Delete';

const supabase = createClient();

/** Claves S3 (evidencias + fotos de comentarios) desde un snapshot de papelera. */
function s3KeysFromSnapshot(snap: any): string[] {
  const keys: string[] = [];
  for (const e of (snap?.evidences ?? [])) { const k = e?.s3_key ?? e?.s3_url_placeholder; if (k) keys.push(k); }
  for (const p of (snap?.annotation_comment_photos ?? [])) { if (p?.storage_path) keys.push(p.storage_path); }
  return keys;
}

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

/** v62 — Restaura un ensayo desde la papelera (RPC, conserva el código original si está libre).
 *  Lanza Error('code_in_use') si el código ya fue reusado. */
export function useRestoreRecycle(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (recycleId: string) => {
      const { data, error } = await supabase.rpc('restore_protocol_from_recycle', { p_recycle_id: recycleId, p_new_code: null });
      if (error) {
        if (/23505|duplicate|uniq/i.test(error.message)) throw new Error('code_in_use');
        throw error;
      }
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['recycle-bin', projectId] });
      qc.invalidateQueries({ predicate: q => Array.isArray(q.queryKey) && q.queryKey[0] === 'ensayos' });
    },
  });
}

/** v62 — Elimina DEFINITIVAMENTE una entrada de papelera (RPC, solo CREATOR) + libera S3.
 *  Lanza Error('forbidden') si no es CREATOR. Irreversible. */
export function usePurgeRecycle(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (entry: RecycleBinEntry) => {
      const { error } = await supabase.rpc('purge_recycle_entry', { p_recycle_id: entry.id });
      if (error) {
        if (/CREATOR|acceso/i.test(error.message)) throw new Error('forbidden');
        throw error;
      }
      try { await deleteS3Objects(s3KeysFromSnapshot(entry.snapshot_json)); } catch { /* best-effort */ }
      return true;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['recycle-bin', projectId] }); },
  });
}
