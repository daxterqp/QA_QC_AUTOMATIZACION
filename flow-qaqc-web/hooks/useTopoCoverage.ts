'use client';

/**
 * useTopoCoverage — baja los ensayos del proyecto con las señales de coordenadas
 * (topo / GPS) para el recuadro de cobertura y la pantalla de detalle. Devuelve los
 * TopoCoverageItem; el caller los resume con summarizeTopoCoverage(items, flags).
 */
import { useQuery } from '@tanstack/react-query';
import { createClient } from '@lib/supabase/client';
import { hasTopoData, type TopoCoverageItem } from '@lib/topoVisibility';

const supabase = createClient();

export function useTopoCoverageItems(projectId: string) {
  return useQuery({
    queryKey: ['topo-coverage-items', projectId],
    queryFn: async (): Promise<TopoCoverageItem[]> => {
      const { data } = await supabase
        .from('protocols')
        .select('id, protocol_code, external_id, topo_coord_east, topo_coord_north, topo_coord_elevation, topo_values_json, latitude, longitude')
        .eq('project_id', projectId);
      return ((data ?? []) as Record<string, unknown>[]).map((p) => ({
        id: String(p.id),
        code: String(p.protocol_code ?? p.external_id ?? p.id),
        hasTopo: hasTopoData({
          east: p.topo_coord_east as number | null,
          north: p.topo_coord_north as number | null,
          elevation: p.topo_coord_elevation as number | null,
          valuesJson: p.topo_values_json == null ? null : JSON.stringify(p.topo_values_json),
        }),
        hasGps: p.latitude != null && p.longitude != null,
      }));
    },
    enabled: !!projectId,
    staleTime: 30 * 1000,
  });
}
