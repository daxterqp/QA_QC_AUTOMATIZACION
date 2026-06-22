'use client';

import {
  createContext, useContext, useEffect, useState, type ReactNode,
} from 'react';
import { createClient } from '@lib/supabase/client';
import type { User } from '@/types';

interface AuthContextValue {
  currentUser: User | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  currentUser: null,
  loading: true,
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const supabase = createClient();
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [loading, setLoading]         = useState(true);

  useEffect(() => {
    let active = true;

    // Reconstruye la fila de `users` a partir del auth.uid() del JWT de Supabase.
    const loadUser = async (authId: string | undefined | null) => {
      if (!authId) {
        if (active) setCurrentUser(null);
        return;
      }
      try {
        const { data } = await supabase
          .from('users')
          .select('*')
          .eq('auth_id', authId)
          .single();
        if (active) setCurrentUser(data ? (data as User) : null);
      } catch {
        if (active) setCurrentUser(null);
      }
    };

    // 1) Sesión inicial.
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      await loadUser(session?.user?.id);
      if (active) setLoading(false);
    })();

    // 2) Cambios de sesión (login / logout / refresh de token).
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        void loadUser(session?.user?.id);
      },
    );

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const signOut = async () => {
    await supabase.auth.signOut();
    setCurrentUser(null);
  };

  return (
    <AuthContext.Provider value={{ currentUser, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
