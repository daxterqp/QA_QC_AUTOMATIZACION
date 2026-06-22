import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
  useCallback,
  type ReactNode,
} from 'react';
import { database, usersCollection } from '@db/index';
import type User from '@models/User';
import { supabase } from '@config/supabase';
import { registerPushToken, unregisterPushToken } from '@services/NotificationService';
import { shouldLockOnLaunch, authenticateBiometric } from '@services/BiometricService';

interface AuthContextValue {
  currentUser: User | null;
  isLoading: boolean;
  isDemo: boolean;
  /** true si hay sesión pero está bloqueada esperando huella/rostro (ingreso rápido). */
  biometricLocked: boolean;
  /** Lanza el prompt biométrico; desbloquea si autentica. Devuelve true si OK. */
  unlockBiometric: () => Promise<boolean>;
  login: (email: string, password: string) => Promise<'ok' | 'not_found' | 'wrong_password'>;
  /** Inicia sesión con Google (flujo OAuth de Supabase en el navegador del sistema). */
  loginWithGoogle: () => Promise<'ok' | 'cancelled' | 'error' | 'no_account'>;
  /** Auto-registro por email. El trigger crea la fila como VIEWER sin acceso. */
  signUp: (email: string, password: string, name: string) => Promise<'ok' | 'confirm_email' | 'exists' | 'error'>;
  loginDemo: () => void;
  logout: () => Promise<void>;
  changePassword: (userId: string, newPassword: string) => Promise<void>;
  /** Envía el correo de recuperación de contraseña (self-service). Lanza si falla. */
  resetPassword: (email: string) => Promise<void>;
  deleteAccount: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * Resuelve la fila de la app (`public.users`) a partir del `auth_id` (uid del JWT
 * de Supabase Auth), la materializa en WatermelonDB y devuelve la INSTANCIA del
 * modelo `User` (misma forma que consume el resto de la app: id, name, apellido,
 * role, signatureUri, isActive, fullName, etc.).
 *
 * Devuelve null si no hay fila asociada o si la cuenta está inactiva (is_active=false).
 */
async function resolveAppUserByAuthId(authId: string): Promise<User | null> {
  const { data: remote, error } = await supabase
    .from('users')
    .select('*')
    .eq('auth_id', authId)
    .single();

  if (error || !remote) return null;
  // v43 — cuenta inactiva (soft-delete): sin acceso.
  if (remote.is_active === false) return null;

  // Materializar / actualizar la fila en WatermelonDB para devolver la instancia
  // del modelo con EXACTAMENTE la misma forma de siempre.
  let local: User | null = null;
  try {
    local = await usersCollection.find(remote.id);
  } catch {
    local = null;
  }

  await database.write(async () => {
    if (local) {
      await (local as any).update((u: any) => {
        Object.assign(u._raw, remote);
      });
    } else {
      await usersCollection.create((u) => {
        (u as any)._raw.id = remote.id;
        Object.assign((u as any)._raw, remote);
      });
    }
  });

  return await usersCollection.find(remote.id);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isDemo, setIsDemo] = useState(false);
  const [biometricLocked, setBiometricLocked] = useState(false);
  // Espejo de `isDemo` accesible dentro de callbacks de Auth sin re-suscribir.
  const isDemoRef = useRef(false);
  useEffect(() => { isDemoRef.current = isDemo; }, [isDemo]);

  useEffect(() => {
    (async () => {
      try {
        // Sincronizar usuarios desde Supabase (fuente de verdad)
        try {
          const { data: remoteUsers } = await supabase.from('users').select('*').order('created_at', { ascending: true });
          const remoteList = remoteUsers ?? [];

          // Deduplicar: si hay dos usuarios con mismo name+apellido, quedarse con el más antiguo.
          // Dedupe SOLO local (la lista materializada en WatermelonDB). Ya NO se borra
          // de Supabase: con RLS estricto el DELETE en `users` está denegado y el
          // try/catch lo tragaba (escritura inoperante). Las filas remotas duplicadas
          // las resuelve el CREADOR / la gestión de cuentas, no este sync de arranque.
          const seen = new Map<string, any>();
          const duplicateIds: string[] = [];
          for (const r of remoteList) {
            const key = `${r.name?.toLowerCase()}|${r.apellido?.toLowerCase()}`;
            if (seen.has(key)) {
              duplicateIds.push(r.id);
            } else {
              seen.set(key, r);
            }
          }
          const dedupedList = remoteList.filter((r: any) => !duplicateIds.includes(r.id));
          const remoteIds = new Set(dedupedList.map((r: any) => r.id));

          const localUsers = await usersCollection.query().fetch();
          const toCreate = dedupedList.filter((r: any) => !localUsers.find((e) => e.id === r.id));
          const toDelete = localUsers.filter((e) => !remoteIds.has(e.id));

          if (toCreate.length > 0 || toDelete.length > 0) {
            await database.write(async () => {
              for (const remote of toCreate) {
                await usersCollection.create((u) => {
                  (u as any)._raw.id = remote.id;
                  Object.assign((u as any)._raw, remote);
                });
              }
              for (const u of toDelete) {
                await u.destroyPermanently();
              }
            });
          }
        } catch { /* sin internet, usar caché local */ }

        // Restaurar sesión de Supabase Auth (persistida por supabase-js en
        // AsyncStorage). Si hay sesión, reconstruimos `currentUser` desde
        // `users` por `auth_id`.
        try {
          const { data: { session } } = await supabase.auth.getSession();
          const authId = session?.user?.id;
          if (authId) {
            const user = await resolveAppUserByAuthId(authId);
            if (user) {
              setCurrentUser(user);
              registerPushToken(user.id).catch(() => {});
              // Ingreso rápido: si activó biometría y el equipo la soporta, bloquear
              // hasta que pase la huella/rostro (solo al reabrir con sesión guardada).
              try { if (await shouldLockOnLaunch()) setBiometricLocked(true); } catch { /* sin biometría */ }
            } else {
              // Sesión válida pero sin fila de app activa: cerrar para no dejar
              // un JWT colgado sin usuario.
              await supabase.auth.signOut();
            }
          }
        } catch { /* sin internet: sin sesión restaurada hasta reconectar */ }
      } finally {
        setIsLoading(false);
      }
    })();

    // Mantener `currentUser` en sync con los cambios de sesión de Auth
    // (refresh de token, signOut desde otro punto, expiración, etc.).
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT' || !session) {
        setCurrentUser((prev) => (isDemoRef.current ? prev : null));
      }
    });
    return () => { sub.subscription.unsubscribe(); };
  }, []);

  const login = useCallback(async (
    email: string,
    password: string
  ): Promise<'ok' | 'not_found' | 'wrong_password'> => {
    // 1. Autenticar contra Supabase Auth (email + password). Requiere red la
    //    primera vez; supabase-js persiste la sesión luego.
    const { error: authError } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });

    if (authError) {
      // Supabase devuelve "Invalid login credentials" sin distinguir entre
      // email inexistente y contraseña incorrecta. Mantenemos el contrato del
      // contexto (mismos códigos de error que consume LoginScreen).
      const msg = (authError.message || '').toLowerCase();
      if (msg.includes('invalid') || msg.includes('credentials') || msg.includes('password')) {
        return 'wrong_password';
      }
      return 'not_found';
    }

    // 2. Resolver la fila de la app por `auth_id` (uid del JWT).
    const { data: { user: authUser } } = await supabase.auth.getUser();
    const authId = authUser?.id;
    if (!authId) {
      await supabase.auth.signOut();
      return 'not_found';
    }

    const user = await resolveAppUserByAuthId(authId);
    if (!user) {
      // No hay fila de app asociada o la cuenta está inactiva (is_active=false):
      // pierde el acceso. Cerramos la sesión de Auth para no dejarla colgada.
      await supabase.auth.signOut();
      return 'not_found';
    }

    setCurrentUser(user);
    registerPushToken(user.id).catch(() => {});
    return 'ok';
  }, []);

  const loginWithGoogle = useCallback(async (): Promise<'ok' | 'cancelled' | 'error' | 'no_account'> => {
    try {
      // require diferido: expo-web-browser es nativo; si el dev-client no se reconstruyó
      // todavía, la llamada nativa falla y cae al catch (NO rompe el arranque de la app).
      const WebBrowser = require('expo-web-browser');
      const redirectTo = 'flow://login-callback'; // scheme `flow` (app.json) — registrar en Supabase URL Config
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo, skipBrowserRedirect: true },
      });
      if (error || !data?.url) return 'error';

      const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
      if (result.type !== 'success' || !result.url) return 'cancelled';

      // Extraer el `code` (PKCE) o los tokens del fragment del deep link de retorno.
      const returned = result.url;
      const raw = (returned.split('?')[1] || returned.split('#')[1] || '');
      const params: Record<string, string> = {};
      for (const pair of raw.split('&')) {
        const [k, v] = pair.split('=');
        if (k) params[decodeURIComponent(k)] = decodeURIComponent(v ?? '');
      }

      if (params.code) {
        const { error: exErr } = await supabase.auth.exchangeCodeForSession(params.code);
        if (exErr) return 'error';
      } else if (params.access_token && params.refresh_token) {
        const { error: ssErr } = await supabase.auth.setSession({
          access_token: params.access_token, refresh_token: params.refresh_token,
        });
        if (ssErr) return 'error';
      } else {
        return 'error';
      }

      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) return 'error';
      const appUser = await resolveAppUserByAuthId(authUser.id);
      if (!appUser) return 'no_account'; // el trigger crea la fila VIEWER; si está inactiva → sin acceso
      setCurrentUser(appUser);
      registerPushToken(appUser.id).catch(() => {});
      return 'ok';
    } catch {
      return 'error';
    }
  }, []);

  const signUp = useCallback(async (
    email: string, password: string, name: string,
  ): Promise<'ok' | 'confirm_email' | 'exists' | 'error'> => {
    const { data, error } = await supabase.auth.signUp({
      email: email.trim().toLowerCase(),
      password,
      options: { data: { full_name: name.trim() } },
    });
    if (error) {
      const msg = (error.message || '').toLowerCase();
      if (msg.includes('already') || msg.includes('registered') || msg.includes('exists')) return 'exists';
      return 'error';
    }
    // El trigger handle_new_user crea la fila en `users` como VIEWER (sin acceso).
    if (data.session && data.user) {
      // Auto-confirm activo → entra directo (verá el estado "sin proyectos asignados").
      const user = await resolveAppUserByAuthId(data.user.id);
      if (user) { setCurrentUser(user); registerPushToken(user.id).catch(() => {}); }
      return 'ok';
    }
    // Sin sesión → Supabase requiere confirmación por correo.
    return 'confirm_email';
  }, []);

  const loginDemo = useCallback(() => {
    const demoUser = {
      id: 'demo-user',
      name: 'DemoFlow-QAQC',
      apellido: '',
      role: 'CREATOR',
      password: '2026flow',
    } as unknown as User;
    setCurrentUser(demoUser);
    setIsDemo(true);
  }, []);

  const logout = useCallback(async () => {
    // Fix #8.1 — Detener cualquier tracker GPS activo ANTES de limpiar la
    // sesión, evitando que el GPS siga capturando puntos tras el logout.
    try {
      // lazy require para evitar ciclos de import entre módulos de servicios
      const wss = require('@services/WorkSessionService');
      if (wss?.stopAllTrackers) await wss.stopAllTrackers();
    } catch { /* módulo no disponible */ }
    if (isDemo) {
      setCurrentUser(null);
      setIsDemo(false);
      return;
    }
    const userId = currentUser?.id;
    if (userId) unregisterPushToken(userId).catch(() => {});
    // Cierra la sesión de Auth y borra el token persistido por supabase-js.
    try { await supabase.auth.signOut(); } catch { /* offline */ }
    setBiometricLocked(false);
    setCurrentUser(null);
  }, [isDemo, currentUser]);

  const changePassword = useCallback(async (_userId: string, newPassword: string) => {
    // Migrado a Supabase Auth: la contraseña vive en auth.users, ya NO en la
    // tabla `users`. Cambia la del usuario autenticado (requiere sesión activa).
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) throw error;
  }, []);

  const resetPassword = useCallback(async (email: string) => {
    // Self-service "olvidé mi contraseña": Supabase envía un correo con un link de
    // recuperación. El destino del link se configura en Supabase → Authentication →
    // URL Configuration (Site URL / Redirect URLs): en web cae en la página /reset;
    // en móvil, en el deep link de la app. Acá solo disparamos el envío.
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase());
    if (error) throw error;
  }, []);

  const unlockBiometric = useCallback(async (): Promise<boolean> => {
    const ok = await authenticateBiometric('Desbloqueá Flow QA·QC');
    if (ok) setBiometricLocked(false);
    return ok;
  }, []);

  const deleteAccount = useCallback(async () => {
    if (!currentUser || isDemo) return;
    const userId = currentUser.id;
    // Fix #8.1 — Detener trackers GPS antes de cerrar la cuenta.
    try {
      const wss = require('@services/WorkSessionService');
      if (wss?.stopAllTrackers) await wss.stopAllTrackers();
    } catch { /* módulo no disponible */ }
    // 1. Quitar push token (deja de recibir notificaciones).
    unregisterPushToken(userId).catch(() => {});
    // 2. v43 — SOFT-DELETE: NO se borra de la base. Se marca inactivo (is_active=false).
    //    El usuario pierde el acceso (login bloqueado), pero toda su información, firmas
    //    y aprobaciones se conservan INTACTAS para mantener la trazabilidad.
    try { await supabase.from('users').update({ is_active: false, updated_at: Date.now() }).eq('id', userId); } catch { /* offline / falta columna */ }
    try {
      const user = await usersCollection.find(userId);
      await database.write(async () => { await (user as any).update((u: any) => { u.isActive = false; }); });
    } catch { /* no local */ }
    // 3. Cerrar sesión de Auth (pierde el acceso). El registro permanece, inactivo.
    try { await supabase.auth.signOut(); } catch { /* offline */ }
    setCurrentUser(null);
  }, [currentUser, isDemo]);

  return (
    <AuthContext.Provider value={{ currentUser, isLoading, isDemo, biometricLocked, unlockBiometric, login, loginWithGoogle, signUp, loginDemo, logout, changePassword, resetPassword, deleteAccount }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe usarse dentro de AuthProvider');
  return ctx;
}
