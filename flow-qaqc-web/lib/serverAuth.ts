/**
 * serverAuth.ts — Verificación de identidad/rol en el SERVIDOR (web).
 *
 * La web usa Supabase Auth real (login por email+password). Las rutas de borrado
 * NO deben confiar en el rol del cliente ni en la identidad que venga en el body
 * (falsificable). Acá re-derivamos el usuario desde el JWT de Supabase Auth
 * (`auth.uid()`) y consultamos su fila real en `users` por `auth_id`, para
 * enforcement server-side.
 */
import { createClient } from '@lib/supabase/server';

export interface ServerUser {
  id: string;
  name: string | null;
  role: string | null;
}

/** Devuelve el usuario de la sesión (id, name, role) o null si no hay sesión. */
export async function getServerUser(): Promise<ServerUser | null> {
  const supabase = await createClient();

  const { data: { user: authUser } } = await supabase.auth.getUser();
  if (!authUser) return null;

  const { data, error } = await supabase
    .from('users')
    .select('id, name, role')
    .eq('auth_id', authUser.id)
    .maybeSingle();
  if (error || !data) return null;
  return { id: data.id, name: (data as any).name ?? null, role: (data as any).role ?? null };
}

/** ¿El usuario puede eliminar ensayos? Solo Jefe (RESIDENT) o Creador. */
export function canDeleteEnsayos(user: ServerUser | null): boolean {
  return user?.role === 'RESIDENT' || user?.role === 'CREATOR';
}
