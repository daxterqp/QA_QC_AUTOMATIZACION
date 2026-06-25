import { NextResponse } from 'next/server';

/**
 * OAuth callback (Google). Supabase redirige aquí con `?code=...` tras el login de Google.
 * Intercambiamos el code por la sesión (cookies SSR) y vamos a la app. El perfil en public.users
 * lo crea el trigger `on_auth_user_created` (rol VIEWER) — un usuario nuevo entra como Visualizador
 * sin acceso hasta que el Creador le asigne proyectos/rol.
 */
export const runtime = 'nodejs';

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next') ?? '/app/projects';

  if (code) {
    const { createClient } = await import('@lib/supabase/server');
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${origin}${next.startsWith('/') ? next : '/app/projects'}`);
  }
  return NextResponse.redirect(`${origin}/login?error=oauth`);
}
