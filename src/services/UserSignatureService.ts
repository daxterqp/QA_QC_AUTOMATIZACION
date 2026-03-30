/**
 * UserSignatureService
 *
 * Almacena la firma de cada usuario de forma independiente al proyecto.
 * Cada jefe guarda su firma una sola vez y se reutiliza en todos los PDFs.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system';

const KEY = (userId: string) => `user_signature_uri_${userId}`;

/**
 * Copia el archivo de firma al directorio del documento y registra la ruta en AsyncStorage.
 * @returns URI local del archivo guardado.
 */
export async function saveUserSignature(userId: string, sourceUri: string): Promise<string> {
  const destUri = `${FileSystem.documentDirectory}user_sig_${userId}.jpg`;
  try { await FileSystem.deleteAsync(destUri, { idempotent: true }); } catch { /* ignorar */ }
  await FileSystem.copyAsync({ from: sourceUri, to: destUri });
  await AsyncStorage.setItem(KEY(userId), destUri);
  return destUri;
}

/**
 * Devuelve la URI local de la firma del usuario, o null si no existe.
 */
export async function getUserSignatureUri(userId: string): Promise<string | null> {
  try {
    const uri = await AsyncStorage.getItem(KEY(userId));
    if (!uri) return null;
    const info = await FileSystem.getInfoAsync(uri);
    return info.exists ? uri : null;
  } catch {
    return null;
  }
}

const S3_KEY = (userId: string) => `user_signature_s3key_${userId}`;

export async function saveUserSignatureS3Key(userId: string, s3Key: string): Promise<void> {
  await AsyncStorage.setItem(S3_KEY(userId), s3Key);
}

export async function getUserSignatureS3Key(userId: string): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(S3_KEY(userId));
  } catch {
    return null;
  }
}
