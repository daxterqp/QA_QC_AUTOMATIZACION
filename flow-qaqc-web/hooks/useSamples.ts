/**
 * useSamples — módulo "Ensayos por muestra" (web). Espejo del flujo móvil
 * (SamplesScreen / SampleDetailScreen): lista de muestras, creación con código
 * correlativo `M-{id}-{ddmmyy}-{seq:4}`, y detalle con sus ensayos vinculados.
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@lib/supabase/client';
import { fetchAllPages } from '@lib/pagedFetch';
import { buildSampleCode, nextSampleSeq, todaySampleDate } from '@lib/sampleCode';
import type { Sample, Protocol } from '@/types';

const supabase = createClient();

export interface SamplesData {
  samples: Sample[];
  /** ensayos vinculados por sample_id. */
  countBySample: Record<string, number>;
}

/** Lista de muestras del proyecto + conteo de ensayos por muestra. */
export function useSamples(projectId: string) {
  return useQuery({
    queryKey: ['samples', projectId],
    queryFn: async (): Promise<SamplesData> => {
      const [smpRes, protoRes] = await Promise.all([
        fetchAllPages((f, t) => supabase.from('samples').select('*').eq('project_id', projectId).order('seq', { ascending: true }).order('id', { ascending: true }).range(f, t)).then(rows => ({ data: rows, error: null })),
        supabase.from('protocols').select('sample_id').eq('project_id', projectId).not('sample_id', 'is', null),
      ]);
      const countBySample: Record<string, number> = {};
      for (const r of (protoRes.data ?? []) as { sample_id: string | null }[]) {
        if (r.sample_id) countBySample[r.sample_id] = (countBySample[r.sample_id] ?? 0) + 1;
      }
      return { samples: (smpRes.data ?? []) as Sample[], countBySample };
    },
    enabled: !!projectId,
  });
}

export interface SampleDetail {
  sample: Sample | null;
  protocols: Protocol[];
}

/** Una muestra + sus ensayos vinculados (para la pantalla de detalle). */
export function useSample(projectId: string, sampleId: string) {
  return useQuery({
    queryKey: ['sample', projectId, sampleId],
    queryFn: async (): Promise<SampleDetail> => {
      const [sRes, pRes] = await Promise.all([
        supabase.from('samples').select('*').eq('id', sampleId).maybeSingle(),
        supabase.from('protocols').select('*').eq('sample_id', sampleId).order('created_at', { ascending: true }),
      ]);
      return { sample: (sRes.data ?? null) as Sample | null, protocols: (pRes.data ?? []) as Protocol[] };
    },
    enabled: !!sampleId,
  });
}

export interface CreateSampleArgs {
  sampleDate?: string | null;
  materialType?: string | null;
  condition?: string | null;       // ALTERADA | INALTERADA
  depthFrom?: number | null;
  depthTo?: number | null;
  sectorId?: string | null;
  locationId?: string | null;
  layer?: string | null;
  notes?: string | null;
  createdById?: string | null;     // autor (paridad con móvil)
}

/** Crea una muestra con código correlativo del proyecto. */
export function useCreateSample(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: CreateSampleArgs): Promise<Sample> => {
      const { data: proj } = await supabase.from('projects').select('sample_identifier').eq('id', projectId).single();
      const sampleIdentifier = (proj as { sample_identifier?: string | null } | null)?.sample_identifier ?? '';
      const date = args.sampleDate ?? todaySampleDate();
      const now = Date.now();
      const layerJson = args.layer && args.layer.trim() ? JSON.stringify({ capa: args.layer.trim() }) : null;
      // Retry ante colisión del índice único samples_code_uniq_per_project (otro
      // dispositivo tomó el seq): re-lee los seqs, re-secuencia y reintenta (máx 5).
      for (let attempt = 0; attempt < 5; attempt++) {
        // v88 — PAGINADO: el próximo seq se calculaba sobre las primeras 1000.
        const existing = await fetchAllPages<{ seq: number | null }>((f, t) => supabase.from('samples').select('seq').eq('project_id', projectId).order('id', { ascending: true }).range(f, t)).catch(() => [] as { seq: number | null }[]);
        const seq = nextSampleSeq(((existing ?? []) as { seq: number | null }[]).map(r => r.seq));
        const row = {
          id: crypto.randomUUID(),
          project_id: projectId,
          sample_code: buildSampleCode(sampleIdentifier, date, seq),
          seq,
          sample_date: date,
          location_id: args.locationId ?? null,
          sector_id: args.sectorId ?? null,
          material_type: args.materialType ?? null,
          condition: args.condition ?? null,
          depth_from: args.depthFrom ?? null,
          depth_to: args.depthTo ?? null,
          layer_info_json: layerJson,
          notes: args.notes ?? null,
          created_by_id: args.createdById ?? null,
          upload_status: 'SYNCED',
          created_at: now,
          updated_at: now,
        };
        const { data, error } = await supabase.from('samples').insert(row).select().single();
        if (!error) return data as Sample;
        if ((error as { code?: string }).code === '23505') continue;  // código duplicado → re-secuenciar
        throw new Error(error.message);
      }
      throw new Error('No se pudo asignar un código de muestra único tras 5 intentos.');
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['samples', projectId] });
    },
  });
}

/** v64 — Borra una muestra → papelera. BLOQUEA si tiene ensayos (la RPC aborta con
 *  `sample_has_protocols:<n>`, que aquí se traduce a Error('has_protocols:<n>')). */
export function useDeleteSample(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { sampleId: string; deletedById?: string | null; deletedByName?: string | null }) => {
      const { error } = await supabase.rpc('delete_sample_to_recycle', {
        p_sample_id: args.sampleId, p_deleted_by_id: args.deletedById ?? null, p_deleted_by_name: args.deletedByName ?? null,
      });
      if (error) {
        const hp = (error.message ?? '').match(/sample_has_protocols:(\d+)/);
        if (hp) throw new Error(`has_protocols:${hp[1]}`);
        throw error;
      }
      return true;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['samples', projectId] });
      qc.invalidateQueries({ queryKey: ['recycle-bin', projectId] });
    },
  });
}
