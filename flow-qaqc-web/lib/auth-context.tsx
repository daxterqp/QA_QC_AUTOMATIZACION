'use client';

import {
  createContext, useContext, useEffect, useState, type ReactNode,
} from 'react';
import { createClient } from '@lib/supabase/client';
import type { User } from '@/types';

const COOKIE_KEY = 'scua_user_id';

function getCookieUserId(): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(new RegExp('(?:^|; )' + COOKIE_KEY + '=([^;]*)'));
  return match ? decodeURIComponent(match[1]) : null;
}

export function setCookieUserId(userId: string) {
  const maxAge = 60 * 60 * 24 * 30; // 30 días
  document.cookie = `${COOKIE_KEY}=${encodeURIComponent(userId)}; path=/; max-age=${maxAge}; SameSite=Lax`;
}

function clearCookieUserId() {
  document.cookie = `${COOKIE_KEY}=; path=/; max-age=0`;
}

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
    const userId = getCookieUserId();
    if (!userId) {
      setLoading(false);
      return;
    }
    (async () => {
      try {
        const { data } = await supabase
          .from('users')
          .select('*')
          .eq('id', userId)
          .single();
        if (data) setCurrentUser(data as User);
        else clearCookieUserId();
      } catch {
        clearCookieUserId();
      } finally {
        setLoading(false);
      }
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const signOut = async () => {
    clearCookieUserId();
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
