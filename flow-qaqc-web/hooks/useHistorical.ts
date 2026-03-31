import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@lib/supabase/client';
import type { Protocol, Location, PlanAnnotation, DashboardNote, User } from '@/types';

const supabase = createClient();

// ── Protocols for a project ───────────────────────────────────────────────────

export function useHistoricalProtocols(projectId: string) {
  return useQuery({
    queryKey: ['historical-protocols', projectId],
    queryFn: async (): Promise<Protocol[]> => {
      const { data, error } = await supabase
        .from('protocols')
        .select('*')
        .eq('project_id', projectId)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data ?? []) as Protocol[];
    },
    enabled: !!projectId,
  });
}

// ── Locations for a project ───────────────────────────────────────────────────

export function useHistoricalLocations(projectId: string) {
  return useQuery({
    queryKey: ['historical-locations', projectId],
    queryFn: async (): Promise<Location[]> => {
      const { data, error } = await supabase
        .from('locations')
        .select('*')
        .eq('project_id', projectId)
        .order('name', { ascending: true });
      if (error) throw error;
      return (data ?? []) as Location[];
    },
    enabled: !!projectId,
  });
}

// ── Plan annotations for a project ───────────────────────────────────────────

export function useHistoricalAnnotations(projectId: string) {
  return useQuery({
    queryKey: ['historical-annotations', projectId],
    queryFn: async (): Promise<PlanAnnotation[]> => {
      // Join through plans (plan.project_id = projectId)
      const { data: plans } = await supabase
        .from('plans')
        .select('id')
        .eq('project_id', projectId);
      const planIds = (plans ?? []).map((p: { id: string }) => p.id);
      if (planIds.length === 0) return [];
      const { data, error } = await supabase
        .from('plan_annotations')
        .select('*')
        .in('plan_id', planIds);
      if (error) throw error;
      return (data ?? []) as PlanAnnotation[];
    },
    enabled: !!projectId,
  });
}

// ── Dashboard notes ───────────────────────────────────────────────────────────

export function useDashboardNotes(projectId: string) {
  return useQuery({
    queryKey: ['dashboard-notes', projectId],
    queryFn: async (): Promise<DashboardNote[]> => {
      const { data, error } = await supabase
        .from('dashboard_notes')
        .select('*')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as DashboardNote[];
    },
    enabled: !!projectId,
  });
}

// ── Dashboard note mutations ──────────────────────────────────────────────────

export function useAddDashboardNote(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ text, userId }: { text: string; userId: string }) => {
      const { error } = await supabase.from('dashboard_notes').insert({
        project_id: projectId,
        user_id: userId,
        text: text.trim(),
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['dashboard-notes', projectId] }),
  });
}

export function useUpdateDashboardNote(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ noteId, text }: { noteId: string; text: string }) => {
      const { error } = await supabase
        .from('dashboard_notes')
        .update({ text: text.trim(), updated_at: new Date().toISOString() })
        .eq('id', noteId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['dashboard-notes', projectId] }),
  });
}

export function useDeleteDashboardNote(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (noteId: string) => {
      const { error } = await supabase.from('dashboard_notes').delete().eq('id', noteId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['dashboard-notes', projectId] }),
  });
}

// ── Users (for note author names) ────────────────────────────────────────────

export function useUsersMap() {
  return useQuery({
    queryKey: ['users-map'],
    queryFn: async (): Promise<Record<string, string>> => {
      const { data } = await supabase.from('users').select('id, full_name');
      const map: Record<string, string> = {};
      for (const u of data ?? []) map[u.id] = u.full_name;
      return map;
    },
    staleTime: 5 * 60 * 1000,
  });
}
