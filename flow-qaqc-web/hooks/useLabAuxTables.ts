'use client';

/**
 * useLabAuxTables — listado y CALIBRACIÓN de las tablas auxiliares de laboratorio
 * (grupos: taras, moldes, fiolas, densidad-agua) a nivel proyecto (v41).
 *
 * El mapa para BUSCAR() vive en useFileUpload.useLabAuxTables; aquí están las
 * versiones para el CATÁLOGO Lab.: lista completa (con calibración) y la mutación
 * de "Calibrar" (actualiza los valores de las columnas + fecha de calibración).
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@lib/supabase/client';
import type { LabAuxTable } from '@/types';

const supabase = createClient();

/** Lista completa de tablas auxiliares del proyecto (con columnas, filas y calibración). */
export function useLabAuxTablesList(projectId: string) {
  return useQuery({
    queryKey: ['lab-aux-tables-list', projectId],
    queryFn: async (): Promise<LabAuxTable[]> => {
      const { data, error } = await supabase
        .from('lab_aux_tables')
        .select('*')
        .eq('project_id', projectId)
        .order('group_key', { ascending: true });
      if (error) throw error;
      return (data ?? []) as LabAuxTable[];
    },
    enabled: !!projectId,
    staleTime: 60 * 1000,
  });
}

/** "Calibrar" un grupo: guarda los nuevos valores (rows) + las fechas de calibración. */
export function useCalibrateLabAuxTable(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; rows: string[][]; lastCalibrationAt: number | null; nextCalibrationAt: number | null }) => {
      const { error } = await supabase
        .from('lab_aux_tables')
        .update({
          rows_json: input.rows,
          last_calibration_at: input.lastCalibrationAt,
          next_calibration_at: input.nextCalibrationAt,
          updated_at: Date.now(),
        })
        .eq('id', input.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['lab-aux-tables-list', projectId] });
      qc.invalidateQueries({ queryKey: ['lab-aux-tables', projectId] }); // mapa de BUSCAR
    },
  });
}
