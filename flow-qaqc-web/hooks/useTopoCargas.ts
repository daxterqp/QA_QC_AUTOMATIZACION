/**
 * useTopoCargas — Módulo "Carga de datos topográficos" (web). Lista de cargas por
 * fecha (código T<ddmmaa>-<seq>), creación/edición (manual + CSV) y borrado con
 * revert. Escribe la capa topo_* en los protocolos vía topoCargaShared.
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@lib/supabase/client';
import { buildTopoCargaCode, topoSeqGroupKey, nextTopoSeqLocal, cargaDateKey } from '@lib/topoCargaCode';
import { bindCargaToProtocols, type TopoRow } from '@lib/topoBinding';
import { applyCargaWeb, revertCargaWeb, buildProtocolCodeMapWeb } from '@lib/topoCargaShared';

const supabase = createClient();

export interface TopoCarga {
  id: string;
  project_id: string;
  carga_code: string;
  seq: number | null;
  carga_date: string | null;
  input_method: string | null;
  created_by_id: string | null;
  upload_status: string | null;
  applied_at: number | null;
  rows_json: TopoRow[];           // jsonb → array directo
  columns_json: unknown | null;
  created_at: number;
  updated_at: number;
}

export interface TopoCargaWithMeta extends TopoCarga {
  pendingCount: number;
  rowCount: number;
}

/** Lista de cargas + cuenta de pendientes (códigos sin ensayo) por carga. */
export function useTopoCargas(projectId: string) {
  return useQuery({
    queryKey: ['topo-cargas', projectId],
    queryFn: async (): Promise<TopoCargaWithMeta[]> => {
      const [cargasRes, protosRes] = await Promise.all([
        supabase.from('topo_cargas').select('*').eq('project_id', projectId).order('created_at', { ascending: false }),
        supabase.from('protocols').select('id, protocol_code, external_id').eq('project_id', projectId),
      ]);
      const codeMap = buildProtocolCodeMapWeb((protosRes.data ?? []) as any[]);
      const cargas = (cargasRes.data ?? []) as TopoCarga[];
      return cargas.map((c) => {
        const rows = Array.isArray(c.rows_json) ? c.rows_json : [];
        const { pending } = bindCargaToProtocols(rows, codeMap);
        return { ...c, rows_json: rows, pendingCount: pending.length, rowCount: rows.length };
      });
    },
    enabled: !!projectId,
  });
}

export interface CreateTopoCargaArgs {
  rows: TopoRow[];
  inputMethod: 'manual' | 'csv';
  createdById?: string | null;
  columns?: unknown;
}

/** Crea una carga (código atómico) y la aplica a los protocolos. */
export function useCreateTopoCarga(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: CreateTopoCargaArgs): Promise<TopoCarga> => {
      const date = new Date();
      const now = Date.now();
      for (let attempt = 0; attempt < 5; attempt++) {
        const { data: existing } = await supabase.from('topo_cargas').select('carga_code').eq('project_id', projectId);
        const codes = ((existing ?? []) as { carga_code: string }[]).map((r) => r.carga_code);
        const baseSeq = nextTopoSeqLocal(codes, date);
        let seq = baseSeq;
        try {
          const { data: cloudSeq, error: seqErr } = await supabase.rpc('next_protocol_seq', {
            p_project_id: projectId, p_group_key: topoSeqGroupKey(date), p_client_seq: baseSeq, p_count: 1,
          });
          if (!seqErr && typeof cloudSeq === 'number' && cloudSeq > 0) seq = cloudSeq;
        } catch { /* usar baseSeq */ }
        const row = {
          id: crypto.randomUUID(),
          project_id: projectId,
          carga_code: buildTopoCargaCode(date, seq),
          seq,
          carga_date: cargaDateKey(date),
          input_method: args.inputMethod,
          created_by_id: args.createdById ?? null,
          upload_status: 'SYNCED',
          applied_at: now,
          rows_json: args.rows ?? [],
          columns_json: args.columns ?? null,
          created_at: now,
          updated_at: now,
        };
        const { data, error } = await supabase.from('topo_cargas').insert(row).select().single();
        if (!error) {
          await applyCargaWeb(supabase, projectId, (data as TopoCarga).id, args.rows ?? []);
          return data as TopoCarga;
        }
        if ((error as { code?: string }).code === '23505') continue; // código duplicado → re-secuenciar
        throw new Error(error.message);
      }
      throw new Error('No se pudo asignar un código de carga único tras 5 intentos.');
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['topo-cargas', projectId] });
    },
  });
}

/** Edita una carga ("chancar"): revierte lo previo, reemplaza filas y re-aplica. */
export function useUpdateTopoCarga(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { cargaId: string; rows: TopoRow[]; columns?: unknown }) => {
      await revertCargaWeb(supabase, projectId, args.cargaId);
      const { error } = await supabase.from('topo_cargas').update({
        rows_json: args.rows ?? [],
        ...(args.columns !== undefined ? { columns_json: args.columns ?? null } : {}),
        applied_at: Date.now(),
        updated_at: Date.now(),
      }).eq('id', args.cargaId);
      if (error) throw new Error(error.message);
      await applyCargaWeb(supabase, projectId, args.cargaId, args.rows ?? []);
      return true;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['topo-cargas', projectId] });
    },
  });
}

/** Borra una carga revirtiendo las columnas topo_* de sus ensayos. */
export function useDeleteTopoCarga(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (cargaId: string) => {
      await revertCargaWeb(supabase, projectId, cargaId);
      const { error } = await supabase.from('topo_cargas').delete().eq('id', cargaId);
      if (error) throw new Error(error.message);
      return true;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['topo-cargas', projectId] });
    },
  });
}
