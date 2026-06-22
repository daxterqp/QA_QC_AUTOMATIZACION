import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@lib/supabase/client';
import type { Project, ProjectFeatureFlags } from '@/types';
import { DEFAULT_FEATURE_FLAGS, mergeFeatureFlags } from '@/types';
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
    mutationFn: async ({ name, password, featureFlags }: { name: string; password: string; featureFlags?: ProjectFeatureFlags }) => {
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
          feature_flags: featureFlags ?? DEFAULT_FEATURE_FLAGS,
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

/** Lee los feature flags de un proyecto con merge contra defaults. Devuelve
 *  un set completo, garantizado no-nulo. CREATOR-only writes via useUpdateProjectFlags. */
export function useProjectFlags(projectId: string) {
  return useQuery({
    queryKey: ['project-flags', projectId],
    queryFn: async (): Promise<ProjectFeatureFlags> => {
      if (!projectId) return DEFAULT_FEATURE_FLAGS;
      const { data, error } = await supabase
        .from('projects')
        .select('feature_flags')
        .eq('id', projectId)
        .single();
      if (error || !data) return DEFAULT_FEATURE_FLAGS;
      // Defensivo: `feature_flags` debería llegar como objeto (JSONB), pero si por
      // alguna config llega como string JSON, lo parseamos (si no, el spread de
      // mergeFeatureFlags rompería y ocultaría todos los módulos).
      let raw = data.feature_flags as unknown;
      if (typeof raw === 'string') {
        try { raw = JSON.parse(raw); } catch { raw = null; }
      }
      return mergeFeatureFlags(raw as Partial<ProjectFeatureFlags> | null);
    },
    enabled: !!projectId,
    // La config se edita desde móvil o PC; al entrar a una pantalla SIEMPRE
    // leemos el valor real de Supabase (no la caché de 30s) para que la
    // visibilidad de módulos refleje lo configurado en cualquier plataforma.
    staleTime: 0,
    refetchOnMount: 'always',
  });
}

/** Input al hook. D4 — discriminante explícito con `kind` (no por presencia de
 *  keys, que se rompe si en el futuro algún flag se llama "flags" o "mapTileUrl"). */
export type UpdateProjectFlagsInput =
  | { kind: 'flags-only'; flags: ProjectFeatureFlags }
  | { kind: 'bundled'; flags: ProjectFeatureFlags; mapTileUrl: string | null };

/** Mutation para actualizar los feature flags + map_tile_url (v26). Solo CREATOR.
 *  D3 — `map_tile_url` solo se escribe en modo `bundled`. El modo `flags-only`
 *  jamás toca esa columna (preserva el valor previo). */
export function useUpdateProjectFlags(projectId: string) {
  const qc = useQueryClient();
  const { currentUser } = useAuth();
  return useMutation({
    mutationFn: async (input: UpdateProjectFlagsInput | ProjectFeatureFlags | { flags: ProjectFeatureFlags; mapTileUrl: string | null }) => {
      if (!currentUser) throw new Error('No autenticado');
      if (currentUser.role !== 'CREATOR') throw new Error('Solo el rol CREATOR puede modificar la configuración del proyecto');

      // Compatibilidad con call-sites viejos (sin `kind`).
      let normalized: UpdateProjectFlagsInput;
      if (input && typeof input === 'object' && 'kind' in input) {
        normalized = input as UpdateProjectFlagsInput;
      } else if (input && typeof input === 'object' && 'flags' in input && 'mapTileUrl' in input) {
        normalized = { kind: 'bundled', flags: (input as any).flags, mapTileUrl: (input as any).mapTileUrl };
      } else {
        normalized = { kind: 'flags-only', flags: input as ProjectFeatureFlags };
      }

      const update: Record<string, unknown> = {
        feature_flags: normalized.flags,
        updated_at: Date.now(),
      };
      if (normalized.kind === 'bundled') {
        // D3 — explícito: si mapTileUrl no es undefined, escribir (incluye null para borrar).
        if (normalized.mapTileUrl !== undefined) update.map_tile_url = normalized.mapTileUrl;
      }
      const { data: rows, error } = await supabase.from('projects').update(update).eq('id', projectId).select('id');
      if (error) throw error;
      if (!rows || rows.length === 0) {
        throw new Error('La nube no aceptó el cambio (0 filas actualizadas — revisa permisos/RLS). El móvil no verá esta configuración.');
      }
      // v43 — sample_identifier en update SEPARADO y tolerante (no rompe el guardado
      // de flags si la columna aún no existe; correr v46_samples_module.sql).
      const sampleId = (input as any)?.sampleIdentifier;
      if (sampleId !== undefined) {
        try { await supabase.from('projects').update({ sample_identifier: sampleId }).eq('id', projectId); } catch { /* falta v46 */ }
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['project-flags', projectId] });
      qc.invalidateQueries({ queryKey: ['project', projectId] });
      qc.invalidateQueries({ queryKey: ['projects'] });
    },
  });
}

export function useJoinProject() {
  const qc = useQueryClient();
  const { currentUser } = useAuth();
  return useMutation({
    // Bajo RLS estricto, el self-insert en `user_project_access` está denegado.
    // El alta de acceso se hace vía la RPC SECURITY DEFINER `join_project_with_password`,
    // que busca el proyecto por nombre, valida la contraseña y hace el self-insert.
    // Devuelve el project_id; lanza 'proyecto no encontrado' / 'contraseña incorrecta'.
    mutationFn: async ({ name, password }: { name: string; password: string }) => {
      if (!currentUser) throw new Error('No autenticado');

      const { data, error } = await supabase.rpc('join_project_with_password', {
        p_project_name: name.trim(),
        p_password: password,
      });
      if (error) throw new Error(error.message);
      return data as string; // project_id
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['projects'] }),
  });
}
