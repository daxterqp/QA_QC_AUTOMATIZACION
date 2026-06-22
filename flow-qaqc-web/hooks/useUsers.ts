'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@lib/supabase/client';
import type { User, UserRole } from '@/types';

const supabase = createClient();
const USERS_KEY = ['users'] as const;

/**
 * Invoca la Edge Function `admin-users` (alta/baja/edición de usuarios bajo RLS
 * estricto: INSERT/DELETE directo a `users` está denegado para todos). El JWT del
 * usuario lo adjunta automáticamente `functions.invoke`.
 *
 * Cuando la función responde con un código no-2xx, supabase-js arroja un
 * `FunctionsHttpError` cuyo `.context` es el `Response`; extraemos el `{ error }`
 * del body para propagar un mensaje legible en vez de "Edge Function returned a
 * non-2xx status code".
 */
async function invokeAdminUsers<T = { ok: true; id?: string }>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('admin-users', { body });
  if (error) {
    let message = error.message ?? String(error);
    const ctx = (error as { context?: unknown }).context;
    if (ctx && typeof (ctx as Response).json === 'function') {
      try {
        const parsed = await (ctx as Response).json();
        if (parsed?.error) message = parsed.error;
      } catch { /* body no era JSON; conservamos el mensaje genérico */ }
    }
    throw new Error(message);
  }
  return data as T;
}

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
  /** Login es por EMAIL → obligatorio en el alta. */
  email: string;
  name: string;
  apellido: string | null;
  role: UserRole;
  /** En el alta es la contraseña inicial (obligatoria); en edición, reset opcional. */
  password: string | null;
  /** Accesos a proyectos a crear junto con el usuario (la Edge Function los inserta). */
  projectIds?: string[];
}

export function useCreateUser() {
  const qc = useQueryClient();
  return useMutation({
    // El alta NO es un INSERT directo (denegado por RLS): va por la Edge Function
    // `admin-users` action 'create', que crea la cuenta de Auth + la fila en `users`.
    mutationFn: async (input: UserInput): Promise<{ id: string }> => {
      const res = await invokeAdminUsers<{ ok: true; id: string }>({
        action: 'create',
        email: input.email.trim(),
        password: input.password?.trim() || '',
        name: input.name.trim(),
        apellido: input.apellido?.trim() || null,
        role: input.role,
        projectIds: input.projectIds ?? [],
      });
      return { id: res.id };
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: USERS_KEY }),
  });
}

export function useUpdateUser() {
  const qc = useQueryClient();
  // Edición vía Edge Function `admin-users` action 'update' (consistencia + reset de
  // password/email tocan Supabase Auth, que requiere service_role).
  return useMutation({
    mutationFn: async ({ id, ...input }: { id: string } & Partial<UserInput>) => {
      await invokeAdminUsers({
        action: 'update',
        userId: id,
        ...(input.role !== undefined ? { role: input.role } : {}),
        ...(input.email !== undefined ? { email: input.email?.trim() || undefined } : {}),
        // password vacío = no resetear; solo enviamos si trae valor.
        ...(input.password?.trim() ? { password: input.password.trim() } : {}),
      });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: USERS_KEY }),
  });
}

export function useDeleteUser() {
  const qc = useQueryClient();
  // Baja = soft-delete (is_active=false) vía Edge Function (DELETE directo denegado por RLS).
  return useMutation({
    mutationFn: async (id: string) => {
      await invokeAdminUsers({ action: 'delete', userId: id });
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
