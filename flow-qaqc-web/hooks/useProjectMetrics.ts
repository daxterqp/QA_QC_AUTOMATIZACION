import { useQuery } from '@tanstack/react-query';
import { createClient } from '@lib/supabase/client';
import { computeTotalExpected } from '@lib/dashboardUtils';

const supabase = createClient();

export interface ProjectMetrics {
  openObservations: number;
  pendingReview: number;
  approvedProtocols: number;
  rejectedProtocols: number;
  totalProtocols: number;
  totalExpected: number;      // location × template combinations
  progressPercent: number;    // approved / totalExpected * 100
}

/** queryFn suelto — lo reusa usePortfolioData (useQueries) con la MISMA
 *  queryKey ['project-metrics', id] para compartir caché con la lista. */
export async function fetchProjectMetrics(projectId: string): Promise<ProjectMetrics> {
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

  // v31 — fórmula compartida (dashboardUtils): template_ids por ubicación.
  const totalExpected = computeTotalExpected(locations as { template_ids: string | null }[]);

  const approvedProtocols = protocols.filter((p: { status: string }) => p.status === 'APPROVED').length;
  const pendingReview = protocols.filter((p: { status: string }) => p.status === 'SUBMITTED').length;
  const rejectedProtocols = protocols.filter((p: { status: string }) => p.status === 'REJECTED').length;
  // v31 — solo instancias location-bound cuentan contra el esperado (las de los
  // modos sector/tipo/fecha tienen location_id null y superarían el 100%).
  const approvedLocationBound = protocols.filter(
    (p: { status: string; location_id: string | null }) => p.status === 'APPROVED' && p.location_id != null,
  ).length;
  const progressPercent = totalExpected > 0 ? Math.round((approvedLocationBound / totalExpected) * 100) : 0;

  return {
    openObservations,
    pendingReview,
    approvedProtocols,
    rejectedProtocols,
    totalProtocols: protocols.length,
    totalExpected,
    progressPercent,
  };
}

export function useProjectMetrics(projectId: string) {
  return useQuery({
    queryKey: ['project-metrics', projectId],
    queryFn: () => fetchProjectMetrics(projectId),
    enabled: !!projectId,
    staleTime: 30 * 1000,
  });
}
