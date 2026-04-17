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
          .order('created_at', { ascending: true });
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
        .order('created_at', { ascending: true });
      if (error) throw error;
      return data as Project[];
    },
    enabled: !!currentUser,
  });
}

export function useProject(projectId: string) {
  return useQuery({
    queryKey: ['project', projectId],
    queryFn: async (): Promise<Project | null> => {
      const { data, error } = await supabase
        .from('projects')
        .select('*')
        .eq('id', projectId)
        .single();
      if (error) return null;
      return data as Project;
    },
    enabled: !!projectId,
  });
}

export function useCreateProject() {
  const qc = useQueryClient();
  const { currentUser } = useAuth();
  return useMutation({
    mutationFn: async ({ name, password }: { name: string; password: string }) => {
      if (!currentUser) throw new Error('No autenticado');
      const now = Date.now();
      const { data, error } = await supabase
        .from('projects')
        .insert({
          id: crypto.randomUUID(),
          name,
          status: 'ACTIVE',
          password,
          created_by_id: currentUser.id,
          created_at: now,
          updated_at: now,
        })
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
    mutationFn: async ({ name, password }: { name: string; password: string }) => {
      if (!currentUser) throw new Error('No autenticado');

      // 1. Find project by name (case-insensitive)
      const { data: projects, error: findErr } = await supabase
        .from('projects')
        .select('*')
        .ilike('name', name.trim());
      if (findErr) throw findErr;
      if (!projects || projects.length === 0) throw new Error('No existe un proyecto con ese nombre');

      const project = projects[0];

      // 2. Validate password
      if ((project.password ?? '').toLowerCase().trim() !== password.toLowerCase().trim()) {
        throw new Error('Contraseña incorrecta');
      }

      // 3. Check if already has access
      const { data: existing } = await supabase
        .from('user_project_access')
        .select('id')
        .eq('user_id', currentUser.id)
        .eq('project_id', project.id)
        .maybeSingle();

      if (existing) throw new Error('Ya tienes acceso a este proyecto');

      // 4. Create access record
      const now = Date.now();
      const { error: accessErr } = await supabase
        .from('user_project_access')
        .insert({
          id: crypto.randomUUID(),
          user_id: currentUser.id,
          project_id: project.id,
          created_at: now,
          updated_at: now,
        });
      if (accessErr) throw accessErr;

      return project;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['projects'] }),
  });
}
