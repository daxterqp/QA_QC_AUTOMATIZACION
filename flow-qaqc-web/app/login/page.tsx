'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { Eye, EyeOff } from 'lucide-react';
import { createClient } from '@lib/supabase/client';
import SkylineBackground from '@components/SkylineBackground';

export default function LoginPage() {
  const router = useRouter();
  const supabase = createClient();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const canSubmit = email.trim().length >= 3 && password.length >= 1;

  // Si el callback de Google falló, vuelve con ?error=oauth → mostrar aviso.
  useEffect(() => {
    if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('error') === 'oauth') {
      setError('No se pudo iniciar sesión con Google. Intentá de nuevo.');
    }
  }, []);

  const handleGoogle = async () => {
    setError(null); setNotice(null);
    setGoogleLoading(true);
    try {
      const { error: oErr } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: `${window.location.origin}/auth/callback` },
      });
      // Si arranca bien, el navegador redirige a Google (no vuelve aquí).
      if (oErr) { setError('No se pudo iniciar con Google. Verificá que esté habilitado.'); setGoogleLoading(false); }
    } catch {
      setError('No se pudo iniciar con Google.'); setGoogleLoading(false);
    }
  };

  const handleForgot = async () => {
    setError(null); setNotice(null);
    if (!/\S+@\S+\.\S+/.test(email.trim())) {
      setError('Escribí tu email arriba y volvé a tocar "¿Olvidaste tu contraseña?".');
      return;
    }
    const { error: rErr } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/reset`,
    });
    if (rErr) setError('No se pudo enviar el correo. Intentá de nuevo.');
    else setNotice('Si el correo está registrado, te llegó un enlace para restablecer la contraseña.');
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit || loading) return;
    setLoading(true);
    setError(null);

    try {
      const { error: signInErr } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (signInErr) {
        setError('Email o contraseña incorrectos.');
        return;
      }

      // La sesión queda en cookies (@supabase/ssr). Navegación dura para que
      // el middleware lea las cookies recién escritas.
      window.location.href = '/app/projects';
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen relative overflow-hidden bg-black">
      {/* ── Fondo video ── */}
      <SkylineBackground />

      {/* ── Logo esquina superior derecha ── */}
      <div className="absolute top-6 right-8 z-20 opacity-0 animate-fade-up">
        <img
          src="/logo-login.svg"
          alt="Flow QC"
          className="h-20 w-auto"
        />
      </div>

      {/* ── Contenido a la izquierda ── */}
      <div className="relative z-10 min-h-screen flex flex-col items-start justify-center px-8 lg:px-16 py-10 w-full lg:w-[440px]">

        {/* ── Card de login (glassmorphism oscuro) ── */}
        <div className="w-full max-w-sm bg-black/40 backdrop-blur-xl border border-white/10 rounded-2xl p-7 flex flex-col gap-5 opacity-0 animate-[fadeSlideUp_0.8s_ease-out_0.3s_forwards]">

          <span className="text-[11px] font-bold text-white/60 tracking-[0.2em] uppercase">
            Iniciar Sesión
          </span>

          <form onSubmit={handleLogin} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-semibold text-white/40 tracking-[0.15em] uppercase">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="Ingrese su email"
                autoComplete="email"
                className="bg-white/[0.07] border border-white/10 rounded-lg px-3.5 py-3 text-[15px] text-white placeholder:text-white/25 focus:outline-none focus:ring-2 focus:ring-white/20 focus:border-white/25 transition"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-semibold text-white/40 tracking-[0.15em] uppercase">
                Contraseña
              </label>
              <div className="flex gap-2 items-center">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="Ingrese su contraseña"
                  autoComplete="current-password"
                  className="flex-1 bg-white/[0.07] border border-white/10 rounded-lg px-3.5 py-3 text-[15px] text-white placeholder:text-white/25 focus:outline-none focus:ring-2 focus:ring-white/20 focus:border-white/25 transition"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(v => !v)}
                  className="border border-white/10 bg-white/[0.07] rounded-lg p-3 text-white/40 hover:text-white/70 hover:bg-white/10 transition"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <button
              type="button"
              onClick={handleForgot}
              className="self-end text-[12px] text-white/55 hover:text-white/90 transition"
              tabIndex={-1}
            >
              ¿Olvidaste tu contraseña?
            </button>

            {error && (
              <div className="bg-red-500/15 border border-red-400/30 rounded-lg px-3.5 py-2.5 text-sm text-red-300">
                {error}
              </div>
            )}
            {notice && (
              <div className="bg-emerald-500/15 border border-emerald-400/30 rounded-lg px-3.5 py-2.5 text-sm text-emerald-200">
                {notice}
              </div>
            )}

            <button
              type="submit"
              disabled={!canSubmit || loading}
              className="bg-white/15 border border-white/20 text-white rounded-lg py-4 text-[13px] font-bold tracking-[0.15em] uppercase mt-1 transition-all hover:bg-white/25 hover:shadow-[0_0_20px_rgba(255,255,255,0.08)] disabled:opacity-30 disabled:cursor-not-allowed"
            >
              {loading ? 'Verificando...' : 'Ingresar'}
            </button>
          </form>

          {/* ── Acceso con Google (aditivo, no reemplaza email/contraseña) ── */}
          <div className="flex items-center gap-3">
            <div className="flex-1 h-px bg-white/10" />
            <span className="text-[10px] text-white/30 uppercase tracking-[0.2em]">o</span>
            <div className="flex-1 h-px bg-white/10" />
          </div>
          <button
            type="button"
            onClick={handleGoogle}
            disabled={googleLoading}
            className="flex items-center justify-center gap-2.5 bg-white text-[#1f1f1f] rounded-lg py-3.5 text-[13px] font-semibold hover:bg-white/90 transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <GoogleIcon />
            {googleLoading ? 'Redirigiendo…' : 'Continuar con Google'}
          </button>
        </div>

        {/* ── Footer ── */}
        <p className="text-center text-white/20 text-[11px] mt-8 px-6 leading-relaxed w-full max-w-sm">
          Para solicitar acceso, contacte al administrador del sistema.
        </p>
      </div>

      {/* ── Franja inferior ── */}
      <div className="absolute bottom-0 left-0 right-0 z-20 bg-black/50 backdrop-blur-sm py-2.5">
        <p className="text-center text-white/40 text-[11px] tracking-[0.15em]">
          © 2026 — Desarrollado por <span className="text-white/60 font-semibold">Vastoria</span>
        </p>
      </div>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}
