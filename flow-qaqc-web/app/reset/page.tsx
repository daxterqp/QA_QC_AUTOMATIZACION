'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@lib/supabase/client';

/**
 * /reset — Completar recuperación de contraseña.
 * El enlace del correo de Supabase deja una sesión de recuperación en la URL;
 * el cliente del navegador la detecta (PASSWORD_RECOVERY) y acá seteamos la
 * nueva contraseña con supabase.auth.updateUser. Sirve para móvil y web.
 */
export default function ResetPasswordPage() {
  const supabase = createClient();
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY' || (session && (event === 'SIGNED_IN' || event === 'INITIAL_SESSION'))) {
        setReady(true);
      }
    });
    supabase.auth.getSession().then(({ data }) => { if (data.session) setReady(true); });
    return () => sub.subscription.unsubscribe();
  }, [supabase]);

  const valid = password.length >= 6 && password === confirm;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid || saving) return;
    setSaving(true);
    setError(null);
    const { error: upErr } = await supabase.auth.updateUser({ password });
    setSaving(false);
    if (upErr) { setError('No se pudo actualizar. El enlace pudo expirar; pedí uno nuevo.'); return; }
    setDone(true);
    await supabase.auth.signOut().catch(() => {});
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-navy px-4" style={{ backgroundColor: '#0e213d' }}>
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-xl p-7 flex flex-col gap-4">
        <img src="/logo-login.svg" alt="Flow QC" className="h-16 w-auto self-center" />
        <h1 className="text-lg font-extrabold text-center" style={{ color: '#0e213d' }}>Nueva contraseña</h1>

        {done ? (
          <>
            <p className="text-sm text-gray-600 text-center">Tu contraseña se actualizó. Ya podés iniciar sesión.</p>
            <a href="/login" className="bg-primary text-white rounded-lg py-3 text-center text-sm font-bold" style={{ backgroundColor: '#394e7d' }}>
              Ir a iniciar sesión
            </a>
          </>
        ) : !ready ? (
          <p className="text-sm text-gray-500 text-center">
            Abrí esta página desde el enlace que te llegó por correo. Si ya lo hiciste y no carga, pedí un enlace nuevo.
          </p>
        ) : (
          <form onSubmit={submit} className="flex flex-col gap-3">
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Nueva contraseña (mín. 6)"
              className="border border-gray-300 rounded-lg px-3.5 py-3 text-[15px] focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
            <input
              type="password"
              value={confirm}
              onChange={e => setConfirm(e.target.value)}
              placeholder="Repetir contraseña"
              className="border border-gray-300 rounded-lg px-3.5 py-3 text-[15px] focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
            {confirm.length > 0 && password !== confirm && (
              <span className="text-xs text-red-600">Las contraseñas no coinciden.</span>
            )}
            {error && <span className="text-xs text-red-600">{error}</span>}
            <button
              type="submit"
              disabled={!valid || saving}
              className="text-white rounded-lg py-3 text-sm font-bold tracking-wider uppercase disabled:opacity-40"
              style={{ backgroundColor: '#394e7d' }}
            >
              {saving ? 'Guardando...' : 'Cambiar contraseña'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
