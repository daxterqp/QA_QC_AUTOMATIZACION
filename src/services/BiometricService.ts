/**
 * BiometricService — Ingreso rápido por huella/rostro (expo-local-authentication).
 *
 * La sesión de Supabase ya persiste; la biometría es un GATE de re-entrada: al
 * reabrir la app con sesión guardada, si el usuario lo activó, pedimos huella/rostro
 * antes de mostrar la app. Es por dispositivo (flag en AsyncStorage).
 *
 * `expo-local-authentication` es nativo: si el dev-client no se reconstruyó, el
 * require falla y todo cae a "no disponible" (la app sigue funcionando sin gate).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

const BIO_KEY = '@scua_biometric_enabled';

function lib(): typeof import('expo-local-authentication') | null {
  try { return require('expo-local-authentication'); } catch { return null; }
}

/** ¿El dispositivo tiene hardware biométrico Y huellas/rostro registrados? */
export async function isBiometricAvailable(): Promise<boolean> {
  const LA = lib();
  if (!LA) return false;
  try {
    const [hw, enrolled] = await Promise.all([LA.hasHardwareAsync(), LA.isEnrolledAsync()]);
    return hw && enrolled;
  } catch { return false; }
}

export async function isBiometricEnabled(): Promise<boolean> {
  try { return (await AsyncStorage.getItem(BIO_KEY)) === '1'; } catch { return false; }
}

export async function setBiometricEnabled(on: boolean): Promise<void> {
  try { await AsyncStorage.setItem(BIO_KEY, on ? '1' : '0'); } catch { /* no-op */ }
}

/** Lanza el prompt nativo de huella/rostro. Devuelve true si autenticó. */
export async function authenticateBiometric(promptMessage: string): Promise<boolean> {
  const LA = lib();
  if (!LA) return false;
  try {
    const res = await LA.authenticateAsync({ promptMessage, disableDeviceFallback: false, cancelLabel: undefined });
    return !!res.success;
  } catch { return false; }
}

/** ¿Debe bloquearse al reabrir? (activado por el usuario Y disponible en el equipo). */
export async function shouldLockOnLaunch(): Promise<boolean> {
  if (!(await isBiometricEnabled())) return false;
  return await isBiometricAvailable();
}
