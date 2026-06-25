import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@lib/supabase/client';
import { deleteS3Objects } from '@lib/s3Delete';
import { mergeFeatureFlags } from '@/types';
import { pickMask, nextSeq, buildProtocolCode, parseEnsayoDate } from '@lib/protocolCode';

const supabase = createClient();

/** Claves S3 (evidencias + fotos de comentarios) desde un snapshot de papelera. */
function s3KeysFromSnapshot(snap: any): string[] {
  const keys: string[] = [];
  for (const e of (snap?.evidences ?? [])) { const k = e?.s3_key ?? e?.s3_url_placeholder; if (k) keys.push(k); }
  for (const p of (snap?.annotation_comment_photos ?? [])) { if (p?.storage_path) keys.push(p.storage_path); }
  return keys;
}

/** v62 — "Próximo código libre" para re-codificar un ensayo restaurado cuyo código original ya
 *  fue reusado (espejo de la creación). null → conserva el original. */
async function computeNextFreeCode(snap: any): Promise<string | null> {
  try {
    const proto = snap?.protocol;
    if (!proto?.project_id) return null;
    const { data: project } = await supabase.from('projects').select('feature_flags').eq('id', proto.project_id).single();
    const flags = mergeFeatureFlags(((project as any)?.feature_flags ?? null));
    if (!flags.protocol_codes) return null;
    let tipo: string | null = null;
    if (proto.template_id) {
      const { data: tpl } = await supabase.from('protocol_templates').select('id_protocolo').eq('id', proto.template_id).single();
      tipo = (tpl as any)?.id_protocolo ?? null;
    }
    if (!tipo) return null;
    const date = parseEnsayoDate(proto.ensayo_date) ?? new Date();
    const resetScope = flags.coding_seq_reset === 'year_sector' ? { sector: true }
      : flags.coding_seq_reset === 'year_month' ? { month: true } : {};
    let sectorName: string | null = null;
    if (proto.sector_id) {
      const { data: sec } = await supabase.from('project_sectors').select('name').eq('id', proto.sector_id).single();
      sectorName = (sec as any)?.name ?? null;
    }
    const mask = pickMask(flags.coding_mask_default, flags.coding_mask_by_type, tipo);
    const { data: codeRows } = await supabase.from('protocols').select('protocol_code').eq('project_id', proto.project_id);
    const baseSeq = nextSeq(((codeRows ?? []) as any[]).map(r => r.protocol_code), mask, tipo, date, sectorName, resetScope);
    const sectorPart = resetScope.sector ? `|${(sectorName ?? '').trim().toUpperCase().replace(/\s+/g, '')}` : '';
    const monthPart = resetScope.month ? `|M${date.getMonth() + 1}` : '';
    const groupKey = `${tipo}|${date.getFullYear()}${sectorPart}${monthPart}`;
    const { data: cloudStart } = await supabase.rpc('next_protocol_seq', { p_project_id: proto.project_id, p_group_key: groupKey, p_client_seq: baseSeq, p_count: 1 });
    const seq = (typeof cloudStart === 'number' && cloudStart > 0) ? cloudStart : baseSeq;
    return buildProtocolCode(mask, { tipo, date, seq, sector: sectorName });
  } catch { return null; }
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
    mutationFn: async (entry: RecycleBinEntry) => {
      // v64 — las entradas de MUESTRA usan el RPC de muestras (id 'recycle-sample-…').
      if (entry.id.startsWith('recycle-sample-')) {
        const { data, error } = await supabase.rpc('restore_sample_from_recycle', { p_recycle_id: entry.id, p_new_code: null });
        if (error) {
          if (/23505|duplicate|uniq/i.test(error.message)) throw new Error('code_in_use');
          throw error;
        }
        return data;
      }
      const { data, error } = await supabase.rpc('restore_protocol_from_recycle', { p_recycle_id: entry.id, p_new_code: null });
      if (error) {
        if (/23505|duplicate|uniq/i.test(error.message)) {
          // Código original reusado → recodificar con el próximo libre y reintentar.
          const newCode = await computeNextFreeCode(entry.snapshot_json);
          if (newCode) {
            const retry = await supabase.rpc('restore_protocol_from_recycle', { p_recycle_id: entry.id, p_new_code: newCode });
            if (!retry.error) return retry.data;
          }
          throw new Error('code_in_use');
        }
        throw error;
      }
      return data;
    },
    onSuccess: () => {
      // El restaurado puede ser ensayo O muestra; invalidamos ambas listas + papelera.
      qc.invalidateQueries({ queryKey: ['recycle-bin', projectId] });
      qc.invalidateQueries({ queryKey: ['ensayos-data', projectId] });
      qc.invalidateQueries({ queryKey: ['samples', projectId] });
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
