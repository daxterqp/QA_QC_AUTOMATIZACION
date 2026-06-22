import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@lib/supabase/client';
import type { PlanMeasurement } from '@/types';
import type { CalcState } from '@lib/MetradosService';

const supabase = createClient();

export type MeasurementType = 'line' | 'calibration' | 'polygon' | 'polyline';

/** Datos serializados dentro del campo `data` de plan_measurements. */
export interface MeasurementData {
  points: { x: number; y: number }[];
  totalPx?: number;
  totalReal?: number;
  areaPx?: number;
  areaReal?: number;
  perimPx?: number;
  perimReal?: number;
  smooth?: boolean;
  closed?: boolean;
  calcState?: CalcState;
}

export interface MeasurementWithData extends PlanMeasurement {
  parsed: MeasurementData;
}

function parseMeasurement(m: PlanMeasurement): MeasurementWithData {
  let parsed: MeasurementData = { points: [] };
  try { parsed = JSON.parse(m.data) as MeasurementData; } catch { /* ignore */ }
  return { ...m, parsed };
}

export function useMeasurements(planId: string) {
  return useQuery({
    queryKey: ['measurements', planId],
    queryFn: async (): Promise<MeasurementWithData[]> => {
      const { data, error } = await supabase
        .from('plan_measurements')
        .select('*')
        .eq('plan_id', planId)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return ((data ?? []) as PlanMeasurement[]).map(parseMeasurement);
    },
    enabled: !!planId,
  });
}

export function useCreateMeasurement(planId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      type: MeasurementType;
      data: MeasurementData;
      calibrationScale: number;
      page: number;
    }) => {
      const now = Date.now();
      const { data, error } = await supabase.from('plan_measurements').insert({
        id: crypto.randomUUID(),
        plan_id: planId,
        type: input.type,
        data: JSON.stringify(input.data),
        calibration_scale: input.calibrationScale,
        page: input.page,
        created_at: now,
        updated_at: now,
      }).select().single();
      if (error) throw error;
      return data as PlanMeasurement;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['measurements', planId] }),
  });
}

export function useUpdateMeasurement(planId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: MeasurementData }) => {
      const { error } = await supabase
        .from('plan_measurements')
        .update({ data: JSON.stringify(data), updated_at: Date.now() })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['measurements', planId] }),
  });
}

export function useDeleteMeasurement(planId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('plan_measurements').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['measurements', planId] }),
  });
}
