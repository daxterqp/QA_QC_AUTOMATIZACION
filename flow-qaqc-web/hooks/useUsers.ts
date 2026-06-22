'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@lib/supabase/client';
import type { User, UserRole } from '@/types';

const supabase = createClient();
const USERS_KEY = ['users'] as const;

export function useUsers() {
  return useQuery<User[]>({
    queryKey: USERS_KEY,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .order('name', { ascending: true });
      if (error) throw error;
      return (data ?? []) as User[];
    },
    staleTime: 30_000,
  });
}

interface UserInput {
  name: string;
  apellido: string | null;
  role: UserRole;
  password: string | null;
}

export function useCreateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: UserInput): Promise<User> => {
      const now = Date.now();
      const { data, error } = await supabase
        .from('users')
        .insert({
          id: crypto.randomUUID(),
          name: input.name.trim(),
          apellido: input.apellido?.trim() || null,
          role: input.role,
          password: input.password?.trim() || null,
          pin: null,
          signature_uri: null,
          created_at: now,
          updated_at: now,
        })
        .select()
        .single();
      if (error) throw error;
      return data as User;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: USERS_KEY }),
  });
}

export function useUpdateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...input }: { id: string } & Partial<UserInput>) => {
      const patch: Record<string, unknown> = { updated_at: Date.now() };
      if (input.name !== undefined)     patch.name = input.name.trim();
      if (input.apellido !== undefined) patch.apellido = input.apellido?.trim() || null;
      if (input.role !== undefined)     patch.role = input.role;
      if (input.password !== undefined) patch.password = input.password?.trim() || null;
      const { error } = await supabase.from('users').update(patch).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: USERS_KEY }),
  });
}

export function useDeleteUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('users').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: USERS_KEY }),
  });
}

// ── v44: accesos usuario↔proyecto (paridad con móvil) ───────────────────────
const ACCESS_KEY = ['user-access'] as const;

/** Proyectos del sistema + accesos por usuario (Supabase = fuente de verdad). */
export function useProjectAccess() {
  return useQuery<{ projects: { id: string; name: string }[]; byUser: Record<string, string[]> }>({
    queryKey: ACCESS_KEY,
    queryFn: async () => {
      const [acc, proj] = await Promise.all([
        supabase.from('user_project_access').select('user_id, project_id'),
        supabase.from('projects').select('id, name').order('created_at', { ascending: true }),
      ]);
      if (acc.error) throw acc.error;
      if (proj.error) throw proj.error;
      const projects = (proj.data ?? []) as { id: string; name: string }[];
      const byUser: Record<string, string[]> = {};
      for (const a of (acc.data ?? []) as { user_id: string; project_id: string }[]) {
        (byUser[a.user_id] ??= []).push(a.project_id);
      }
      return { projects, byUser };
    },
    staleTime: 30_000,
  });
}

/** Sincroniza el acceso de UN usuario a EXACTAMENTE `projectIds` (agrega faltantes,
 *  revoca sobrantes). Borrado acotado por (user_id, project_id). */
export function useSetUserAccess() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ userId, projectIds }: { userId: string; projectIds: string[] }) => {
      const { data: cur, error: curErr } = await supabase
        .from('user_project_access').select('project_id').eq('user_id', userId);
      if (curErr) throw curErr;
      const current = new Set((cur ?? []).map((r: { project_id: string }) => r.project_id));
      const desired = new Set(projectIds);
      const toAdd = projectIds.filter(p => !current.has(p));
      const toRemove = Array.from(current).filter(p => !desired.has(p));
      const now = Date.now();
      if (toAdd.length > 0) {
        const rows = toAdd.map(pid => ({ id: crypto.randomUUID(), user_id: userId, project_id: pid, created_at: now, updated_at: now }));
        const { error } = await supabase.from('user_project_access').insert(rows);
        if (error) throw error;
      }
      if (toRemove.length > 0) {
        const { error } = await supabase.from('user_project_access').delete().eq('user_id', userId).in('project_id', toRemove);
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ACCESS_KEY }),
  });
}
