/**
 * serverAuth.ts — Verificación de identidad/rol en el SERVIDOR (web, v44).
 *
 * La web usa login propio por cookie (`scua_user_id`), no Supabase Auth. Las
 * rutas de borrado NO deben confiar en el rol del cliente ni en la identidad que
 * venga en el body (falsificable). Acá re-derivamos el usuario desde la cookie y
 * consultamos su rol real en `users`, para enforcement server-side.
 *
 * Nota: el modelo de auth global (cookie sin firmar) es parte del endurecimiento
 * de seguridad diferido; esto cierra el hueco de "cualquiera llama al endpoint y
 * borra" exigiendo que la cookie corresponda a un usuario con rol Jefe/Creador.
 */
import { cookies } from 'next/headers';
import { createClient } from '@lib/supabase/server';

const COOKIE_KEY = 'scua_user_id';

export interface ServerUser {
  id: string;
  name: string | null;
  role: string | null;
}

/** Devuelve el usuario de la cookie (id, name, role) o null si no hay sesión. */
export async function getServerUser(): Promise<ServerUser | null> {
  const store = await cookies();
  const userId = store.get(COOKIE_KEY)?.value;
  if (!userId) return null;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('users')
    .select('id, name, role')
    .eq('id', userId)
    .maybeSingle();
  if (error || !data) return null;
  return { id: data.id, name: (data as any).name ?? null, role: (data as any).role ?? null };
}

/** ¿El usuario puede eliminar ensayos? Solo Jefe (RESIDENT) o Creador. */
export function canDeleteEnsayos(user: ServerUser | null): boolean {
  return user?.role === 'RESIDENT' || user?.role === 'CREATOR';
}
