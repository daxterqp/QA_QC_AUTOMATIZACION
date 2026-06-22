/**
 * deviceId — UUID persistente del dispositivo, almacenado en AsyncStorage.
 * Se genera la primera vez que se llama y se mantiene mientras la app no se
 * desinstale. Usado para el lock de sesiones (decisión #12 del plan):
 * `work_sessions.started_on_device_id` evita que celular B cierre una sesión
 * iniciada en celular A.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'flow.deviceId.v1';

let cached: string | null = null;

function uuidV4(): string {
  // Implementación simple RFC 4122. Suficiente para identificar dispositivo;
  // no es de uso criptográfico.
  const bytes = new Uint8Array(16);
  for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const h = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export async function getDeviceId(): Promise<string> {
  if (cached) return cached;
  try {
    const stored = await AsyncStorage.getItem(KEY);
    if (stored) { cached = stored; return stored; }
  } catch { /* AsyncStorage no disponible (raro) */ }
  const fresh = uuidV4();
  cached = fresh;
  try { await AsyncStorage.setItem(KEY, fresh); } catch { /* no persistible, vivirá esta sesión */ }
  return fresh;
}
