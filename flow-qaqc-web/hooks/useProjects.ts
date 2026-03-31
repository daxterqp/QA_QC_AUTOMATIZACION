import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@lib/supabase/client';
import type { Project } from '@/types';
import { useAuth } from '@lib/auth-context';

const supabase = createClient();

export function useProjects() {
  const { currentUser } = useAuth();

  return useQuery({
    queryKey: ['projects', currentUser?.id],
    queryFn: async (): Promise<Project[]> => {
      if (!currentUser) return [];

      // CREATOR ve todos los proyectos; los demás solo los asignados
      if (currentUser.role === 'CREATOR') {
        const { data, error } = await supabase
          .from('projects')
          .select('*')
          .order('created_at', { ascending: false });
        if (error) throw error;
        return data as Project[];
      }

      // Obtener accesos del usuario
      const { data: access, error: accErr } = await supabase
        .from('user_project_access')
        .select('project_id')
        .eq('user_id', currentUser.id);
      if (accErr) throw accErr;
      if (!access || access.length === 0) return [];

      const ids = access.map((a: { project_id: string }) => a.project_id);
      const { data, error } = await supabase
        .from('projects')
        .select('*')
        .in('id', ids)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as Project[];
    },
    enabled: !!currentUser,
  });
}

export function useCreateProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (name: string) => {
      const { data, error } = await supabase
        .from('projects')
        .insert({ name })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['projects'] }),
  });
}

export function useJoinProject() {
  const qc = useQueryClient();
  const { currentUser } = useAuth();
  return useMutation({
    mutationFn: async (projectId: string) => {
      if (!currentUser) throw new Error('No autenticado');
      const { error } = await supabase
        .from('user_project_access')
        .insert({ user_id: currentUser.id, project_id: projectId });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['projects'] }),
  });
}
