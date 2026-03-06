import { Image } from 'react-native-compressor';

export interface CompressResult {
  uri: string;
  /** Tamano final en bytes */
  sizeBytes: number;
}

/**
 * Comprime una imagen en segundo plano sin bloquear el hilo principal de React.
 *
 * - Objetivo: reducir de ~4 MB a ~400 KB (factor 10x)
 * - La libreria react-native-compressor corre en un hilo nativo separado,
 *   por lo que la UI permanece fluida durante la operacion.
 *
 * @param localUri  URI local obtenida directamente de vision-camera
 * @returns         URI de la imagen comprimida y su tamano en bytes
 */
export async function compressImage(localUri: string): Promise<CompressResult> {
  const compressedUri = await Image.compress(localUri, {
    compressionMethod: 'auto',
    quality: 0.7,          // 70% calidad JPEG — balance entre peso y nitidez
    maxWidth: 1920,        // Full HD maximo para fotos de obra
    maxHeight: 1080,
    output: 'jpg',
    returnableOutputType: 'uri',
  });

  // Obtener tamano del archivo resultante para logging/telemetria
  const response = await fetch(compressedUri);
  const blob = await response.blob();

  return {
    uri: compressedUri,
    sizeBytes: blob.size,
  };
}
