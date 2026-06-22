/**
 * RecentAccountsService — recuerda los correos que iniciaron sesión en ESTE
 * dispositivo (AsyncStorage, por equipo) para ofrecer acceso rápido en el login
 * (tocar el correo → se autocompleta). NO guarda contraseñas ni tokens: es solo
 * comodidad para celulares compartidos por varios usuarios.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = '@scua_recent_emails';
const MAX = 5;

export async function getRecentEmails(): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr.filter((e) => typeof e === 'string') : [];
  } catch { return []; }
}

export async function addRecentEmail(email: string): Promise<void> {
  const e = email.trim().toLowerCase();
  if (!e || !e.includes('@')) return;
  try {
    const cur = await getRecentEmails();
    const next = [e, ...cur.filter((x) => x !== e)].slice(0, MAX);
    await AsyncStorage.setItem(KEY, JSON.stringify(next));
  } catch { /* no-op */ }
}

export async function removeRecentEmail(email: string): Promise<void> {
  try {
    const cur = await getRecentEmails();
    await AsyncStorage.setItem(KEY, JSON.stringify(cur.filter((x) => x !== email.trim().toLowerCase())));
  } catch { /* no-op */ }
}
