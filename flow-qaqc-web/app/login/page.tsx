'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { Eye, EyeOff } from 'lucide-react';
import { createClient } from '@lib/supabase/client';
import { setCookieUserId } from '@lib/auth-context';
import SkylineBackground from '@components/SkylineBackground';

export default function LoginPage() {
  const router = useRouter();
  const supabase = createClient();

  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = name.trim().length >= 2 && password.length >= 1;

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit || loading) return;
    setLoading(true);
    setError(null);

    try {
      const { data: users, error: fetchErr } = await supabase
        .from('users')
        .select('*')
        .ilike('name', name.trim())
        .order('created_at', { ascending: true })
        .limit(1);

      if (fetchErr || !users || users.length === 0) {
        setError('No existe un usuario con ese nombre.');
        return;
      }

      const user = users[0];
      const storedPassword: string = user.password ?? user.name;
      if (storedPassword !== password) {
        setError('Contraseña incorrecta. Si es su primera vez, use su nombre.');
        return;
      }

      setCookieUserId(user.id);
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
                Nombre
              </label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Ingrese su nombre"
                autoComplete="username"
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

            <p className="text-[11px] text-white/25 italic text-center -mt-1">
              Primera vez: su contraseña es su nombre
            </p>

            {error && (
              <div className="bg-red-500/15 border border-red-400/30 rounded-lg px-3.5 py-2.5 text-sm text-red-300">
                {error}
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
