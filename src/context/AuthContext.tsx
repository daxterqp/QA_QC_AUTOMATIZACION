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
import type { UserRole } from '@models/User';
import { syncAllUsers, pushUserToSupabase } from '@services/SupabaseSyncService';
import { supabase } from '@config/supabase';
import { registerPushToken, unregisterPushToken } from '@services/NotificationService';

const STORAGE_KEY = '@scua_current_user_id';

// Usuarios iniciales del sistema
const SEED_USERS: { name: string; apellido: string; role: UserRole }[] = [
  { name: 'Joseph', apellido: 'Yauri', role: 'CREATOR' },
  { name: 'Angel', apellido: 'Quispe', role: 'CREATOR' },
  { name: 'Pedro', apellido: 'Mantilla', role: 'RESIDENT' },
  { name: 'Pablo', apellido: 'Gutierrez', role: 'SUPERVISOR' },
  { name: 'Ruben', apellido: 'Supervisor', role: 'SUPERVISOR' },
];

interface AuthContextValue {
  currentUser: User | null;
  isLoading: boolean;
  /** Login por nombre + contraseña. Primera vez: contraseña = nombre */
  login: (name: string, password: string) => Promise<'ok' | 'not_found' | 'wrong_password'>;
  logout: () => Promise<void>;
  changePassword: (userId: string, newPassword: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Restaurar sesion y sembrar usuarios iniciales
  useEffect(() => {
    (async () => {
      try {
        // Sembrar usuarios iniciales — agrega los que falten sin tocar los existentes
        const existing = await usersCollection.query().fetch();
        const missing = SEED_USERS.filter(
          (s) => !existing.find((e) => e.name.toLowerCase() === s.name.toLowerCase())
        );
        if (missing.length > 0) {
          await database.write(async () => {
            for (const seed of missing) {
              await usersCollection.create((u) => {
                u.name = seed.name;
                u.apellido = seed.apellido;
                u.role = seed.role;
                u.password = seed.name;
                u.pin = null;
                u.signatureUri = null;
              });
            }
          });
        }

        // Sincronizar usuarios con Supabase (push local + pull remoto)
        try { await syncAllUsers(); } catch { /* sin internet, continuar offline */ }

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

    // 2. Si no existe localmente, buscar en Supabase
    if (!user) {
      try {
        const { data } = await supabase
          .from('users')
          .select('*')
          .ilike('name', name.trim());

        if (data && data.length > 0) {
          const remote = data[0];
          // Verificar contraseña antes de crear localmente
          const remotePassword = remote.password ?? remote.name;
          if (remotePassword !== password) return 'wrong_password';

          // Crear usuario en WatermelonDB local
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
      } catch { /* sin internet, seguir con not_found */ }
      return 'not_found';
    }

    // 3. Usuario encontrado localmente — verificar contraseña
    const storedPassword = user.password ?? user.name;
    if (storedPassword !== password) return 'wrong_password';

    // 4. Subir usuario a Supabase (mantiene cambios de contraseña sincronizados)
    try { await pushUserToSupabase(user.id); } catch { /* offline, ignorar */ }

    await AsyncStorage.setItem(STORAGE_KEY, user.id);
    setCurrentUser(user);
    registerPushToken(user.id).catch(() => {});
    return 'ok';
  }, []);

  const logout = useCallback(async () => {
    const userId = await AsyncStorage.getItem(STORAGE_KEY);
    if (userId) unregisterPushToken(userId).catch(() => {});
    await AsyncStorage.removeItem(STORAGE_KEY);
    setCurrentUser(null);
  }, []);

  const changePassword = useCallback(async (userId: string, newPassword: string) => {
    const user = await usersCollection.find(userId);
    await database.write(async () => {
      await user.update((u) => {
        u.password = newPassword;
      });
    });
  }, []);

  return (
    <AuthContext.Provider value={{ currentUser, isLoading, login, logout, changePassword }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe usarse dentro de AuthProvider');
  return ctx;
}
