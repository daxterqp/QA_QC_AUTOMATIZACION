'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff } from 'lucide-react';
import { createClient } from '@lib/supabase/client';

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
      // 1. Buscar usuario por nombre en la tabla users
      const { data: users, error: fetchErr } = await supabase
        .from('users')
        .select('id, name, email')
        .ilike('name', name.trim())
        .limit(1);

      if (fetchErr || !users || users.length === 0) {
        setError('No existe un usuario con ese nombre. Contacte al administrador.');
        return;
      }

      const user = users[0];

      // 2. Autenticar con Supabase Auth (email + password)
      const { error: authErr } = await supabase.auth.signInWithPassword({
        email: user.email,
        password,
      });

      if (authErr) {
        setError('Contraseña incorrecta. La primera vez, su contraseña es su nombre.');
        return;
      }

      router.push('/app/projects');
      router.refresh();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-navy flex flex-col">
      {/* Header con logo */}
      <div className="flex flex-col items-center pt-12 pb-0 px-8">
        <div className="flex flex-col items-center gap-2">
          {/* Logotipo textual S-CUA */}
          <div className="text-white text-center">
            <div
              className="font-black tracking-widest text-5xl leading-none"
              style={{ fontFamily: 'Arial Black, Arial, sans-serif' }}
            >
              S<span className="text-secondary">-</span>CUA
            </div>
            <div className="text-light text-xs tracking-[0.3em] uppercase mt-1 font-semibold">
              Sistema de Control de Calidad
            </div>
            <div className="w-12 h-0.5 bg-secondary mx-auto mt-3" />
          </div>
        </div>
      </div>

      {/* Card de login */}
      <div className="flex-1 flex items-start justify-center px-5 pt-8 pb-10">
        <div className="w-full max-w-sm bg-white rounded-xl shadow-modal p-7 flex flex-col gap-5">

          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-primary tracking-[0.2em] uppercase">
              Iniciar Sesión
            </span>
          </div>

          <form onSubmit={handleLogin} className="flex flex-col gap-4">
            {/* Nombre */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-bold text-[#4a5568] tracking-[0.15em] uppercase">
                Nombre
              </label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Ingrese su nombre"
                autoComplete="username"
                className="bg-surface border border-border rounded-md px-3.5 py-3 text-[15px] text-navy placeholder:text-[#8896a5] focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition"
              />
            </div>

            {/* Contraseña */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-bold text-[#4a5568] tracking-[0.15em] uppercase">
                Contraseña
              </label>
              <div className="flex gap-2 items-center">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="Ingrese su contraseña"
                  autoComplete="current-password"
                  className="flex-1 bg-surface border border-border rounded-md px-3.5 py-3 text-[15px] text-navy placeholder:text-[#8896a5] focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(v => !v)}
                  className="border border-border bg-surface rounded-md p-3 text-[#4a5568] hover:bg-[#e8edf4] transition"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {/* Hint */}
            <p className="text-xs text-[#8896a5] italic text-center -mt-1">
              Primera vez: su contraseña es su nombre
            </p>

            {/* Error */}
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-md px-3.5 py-2.5 text-sm text-danger">
                {error}
              </div>
            )}

            {/* Botón */}
            <button
              type="submit"
              disabled={!canSubmit || loading}
              className="bg-primary text-white rounded-md py-4 text-[13px] font-bold tracking-[0.15em] uppercase mt-1 transition hover:bg-navy disabled:bg-light disabled:cursor-not-allowed"
            >
              {loading ? 'Verificando...' : 'Ingresar'}
            </button>
          </form>
        </div>
      </div>

      {/* Footer */}
      <p className="text-center text-light text-xs pb-8 px-6 leading-relaxed">
        Para solicitar acceso, contacte al administrador del sistema.
      </p>
    </div>
  );
}
