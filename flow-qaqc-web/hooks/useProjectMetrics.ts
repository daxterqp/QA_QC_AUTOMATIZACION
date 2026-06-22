import { useQuery } from '@tanstack/react-query';
import { createClient } from '@lib/supabase/client';

const supabase = createClient();

export interface ProjectMetrics {
  openObservations: number;
  pendingReview: number;
  approvedProtocols: number;
  rejectedProtocols: number;
  totalExpected: number;      // location × template combinations
  progressPercent: number;    // approved / totalExpected * 100
}

export function useProjectMetrics(projectId: string) {
  return useQuery({
    queryKey: ['project-metrics', projectId],
    queryFn: async (): Promise<ProjectMetrics> => {
      const [protocolsRes, plansRes, locationsRes] = await Promise.all([
        supabase
          .from('protocols')
          .select('status, location_id')
          .eq('project_id', projectId),
        supabase
          .from('plans')
          .select('id')
          .eq('project_id', projectId),
        supabase
          .from('locations')
          .select('template_ids')
          .eq('project_id', projectId),
      ]);

      const protocols = protocolsRes.data ?? [];
      const planIds = (plansRes.data ?? []).map((p: { id: string }) => p.id);
      const locations = locationsRes.data ?? [];

      // Open observations
      let openObservations = 0;
      if (planIds.length > 0) {
        const { count } = await supabase
          .from('plan_annotations')
          .select('id', { count: 'exact', head: true })
          .in('plan_id', planIds)
          .eq('status', 'OPEN');
        openObservations = count ?? 0;
      }

      // Total expected = sum of template_ids per location (same as dashboard)
      const totalExpected = locations.reduce((sum, loc: { template_ids: string | null }) => {
        const n = loc.template_ids ? loc.template_ids.split(',').filter((s: string) => s.trim()).length : 0;
        return sum + n;
      }, 0);

      const approvedProtocols = protocols.filter((p: { status: string }) => p.status === 'APPROVED').length;
      const pendingReview = protocols.filter((p: { status: string }) => p.status === 'SUBMITTED').length;
      const rejectedProtocols = protocols.filter((p: { status: string }) => p.status === 'REJECTED').length;
      // v31 — totalExpected sale de template_ids POR UBICACIÓN: las instancias
      // de los modos nuevos (sector/tipo/fecha, location_id null) no cuentan
      // contra ese esperado o el progreso superaría el 100%.
      const approvedLocationBound = protocols.filter(
        (p: { status: string; location_id: string | null }) => p.status === 'APPROVED' && p.location_id != null,
      ).length;
      const progressPercent = totalExpected > 0 ? Math.round((approvedLocationBound / totalExpected) * 100) : 0;

      return {
        openObservations,
        pendingReview,
        approvedProtocols,
        rejectedProtocols,
        totalExpected,
        progressPercent,
      };
    },
    enabled: !!projectId,
    staleTime: 30 * 1000,
  });
}
