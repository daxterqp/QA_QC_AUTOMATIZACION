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

const STORAGE_KEY = '@scua_current_user_id';

interface AuthContextValue {
  currentUser: User | null;
  isLoading: boolean;
  /** Busca usuario por nombre+rol o crea uno nuevo si no existe */
  login: (name: string, role: UserRole) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Restaurar sesion al arrancar la app
  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then(async (userId) => {
        if (!userId) return;
        try {
          const user = await usersCollection.find(userId);
          setCurrentUser(user);
        } catch {
          // Usuario borrado de la BD — limpiar storage
          await AsyncStorage.removeItem(STORAGE_KEY);
        }
      })
      .finally(() => setIsLoading(false));
  }, []);

  const login = useCallback(async (name: string, role: UserRole) => {
    // Buscar si ya existe un usuario con ese nombre y rol
    const existing = await usersCollection.query().fetch();
    let user = existing.find(
      (u) => u.name.toLowerCase() === name.toLowerCase() && u.role === role
    ) ?? null;

    if (!user) {
      // Crear nuevo usuario
      await database.write(async () => {
        user = await usersCollection.create((u) => {
          u.name = name;
          u.role = role;
          u.pin = null;
          u.signatureUri = null;
        });
      });
    }

    if (user) {
      await AsyncStorage.setItem(STORAGE_KEY, user.id);
      setCurrentUser(user);
    }
  }, []);

  const logout = useCallback(async () => {
    await AsyncStorage.removeItem(STORAGE_KEY);
    setCurrentUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ currentUser, isLoading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe usarse dentro de AuthProvider');
  return ctx;
}
