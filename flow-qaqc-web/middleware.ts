import { type NextRequest } from 'next/server';
import { updateSession } from '@lib/supabase/middleware';

/**
 * Middleware de auth (Supabase Auth real). Delega en `updateSession`, que:
 *  - refresca la sesión vía createServerClient + supabase.auth.getUser(),
 *  - protege /app/* (redirige a /login si no hay user),
 *  - redirige /login → /app/projects si ya hay sesión.
 */
export async function middleware(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
