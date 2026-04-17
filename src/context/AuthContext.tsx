import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { database, usersCollection } from '@db/index';
import type User from '@models/User';
import { pushUserToSupabase } from '@services/SupabaseSyncService';
import { supabase } from '@config/supabase';
import { registerPushToken, unregisterPushToken } from '@services/NotificationService';

const STORAGE_KEY = '@scua_current_user_id';

interface AuthContextValue {
  currentUser: User | null;
  isLoading: boolean;
  isDemo: boolean;
  login: (name: string, password: string) => Promise<'ok' | 'not_found' | 'wrong_password'>;
  loginDemo: () => void;
  logout: () => Promise<void>;
  changePassword: (userId: string, newPassword: string) => Promise<void>;
  deleteAccount: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isDemo, setIsDemo] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        // Sincronizar usuarios desde Supabase (fuente de verdad)
        try {
          const { data: remoteUsers } = await supabase.from('users').select('*').order('created_at', { ascending: true });
          const remoteList = remoteUsers ?? [];

          // Deduplicar: si hay dos usuarios con mismo name+apellido, quedarse con el más antiguo
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
          // Borrar duplicados de Supabase
          if (duplicateIds.length > 0) {
            await supabase.from('users').delete().in('id', duplicateIds);
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

        // Restaurar sesión guardada
        const userId = await AsyncStorage.getItem(STORAGE_KEY);
        if (userId) {
          try {
            const user = await usersCollection.find(userId);
            setCurrentUser(user);
            registerPushToken(userId).catch(() => {});
          } catch {
            await AsyncStorage.removeItem(STORAGE_KEY);
          }
        }
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  const login = useCallback(async (
    name: string,
    password: string
  ): Promise<'ok' | 'not_found' | 'wrong_password'> => {
    // 1. Buscar localmente
    const all = await usersCollection.query().fetch();
    let user: User | null = all.find(
      (u) => u.name.toLowerCase() === name.trim().toLowerCase()
    ) ?? null;

    // 2. Si no existe localmente, buscar en Supabase (puede que aún no se haya sincronizado)
    if (!user) {
      try {
        const { data } = await supabase
          .from('users')
          .select('*')
          .ilike('name', name.trim())
          .order('created_at', { ascending: true })
          .limit(1);

        if (data && data.length > 0) {
          const remote = data[0];
          const remotePassword = remote.password ?? remote.name;
          if (remotePassword !== password) return 'wrong_password';

          await database.write(async () => {
            await usersCollection.create((u) => {
              (u as any)._raw.id = remote.id;
              Object.assign((u as any)._raw, remote);
            });
          });
          user = await usersCollection.find(remote.id);
          await AsyncStorage.setItem(STORAGE_KEY, user.id);
          setCurrentUser(user);
          registerPushToken(user.id).catch(() => {});
          return 'ok';
        }
      } catch { /* sin internet */ }
      return 'not_found';
    }

    // 3. Verificar contraseña
    const storedPassword = user.password ?? user.name;
    if (storedPassword !== password) return 'wrong_password';

    // 4. Sincronizar cambios de contraseña a Supabase
    try { await pushUserToSupabase(user.id); } catch { /* offline */ }

    await AsyncStorage.setItem(STORAGE_KEY, user.id);
    setCurrentUser(user);
    registerPushToken(user.id).catch(() => {});
    return 'ok';
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
    if (isDemo) {
      setCurrentUser(null);
      setIsDemo(false);
      return;
    }
    const userId = await AsyncStorage.getItem(STORAGE_KEY);
    if (userId) unregisterPushToken(userId).catch(() => {});
    await AsyncStorage.removeItem(STORAGE_KEY);
    setCurrentUser(null);
  }, [isDemo]);

  const changePassword = useCallback(async (userId: string, newPassword: string) => {
    const user = await usersCollection.find(userId);
    await database.write(async () => {
      await user.update((u) => {
        u.password = newPassword;
      });
    });
  }, []);

  const deleteAccount = useCallback(async () => {
    if (!currentUser || isDemo) return;
    const userId = currentUser.id;
    // 1. Remove push token
    unregisterPushToken(userId).catch(() => {});
    // 2. Delete from Supabase: user_project_access, push_tokens, user record
    await supabase.from('push_tokens').delete().eq('user_id', userId);
    await supabase.from('user_project_access').delete().eq('user_id', userId);
    await supabase.from('users').delete().eq('id', userId);
    // 3. Delete local user record
    try {
      const user = await usersCollection.find(userId);
      await database.write(async () => { await user.destroyPermanently(); });
    } catch { /* already gone */ }
    // 4. Clear session
    await AsyncStorage.removeItem(STORAGE_KEY);
    setCurrentUser(null);
  }, [currentUser, isDemo]);

  return (
    <AuthContext.Provider value={{ currentUser, isLoading, isDemo, login, loginDemo, logout, changePassword, deleteAccount }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe usarse dentro de AuthProvider');
  return ctx;
}
