import { useCallback } from 'react';
import { evidencesCollection } from '@db/index';
import { compressImage } from '@services/ImageCompressor';
import { uploadEvidencePhoto } from '@services/S3PhotoService';

export interface SaveEvidenceOptions {
  protocolItemId: string;
  localUri: string;
}

export interface SaveEvidenceResult {
  evidenceId: string;
  compressedUri: string;
  originalUri: string;
}

/**
 * Hook para guardar evidencias fotograficas en WatermelonDB.
 *
 * Flujo:
 * 1. Guarda INMEDIATAMENTE la foto original en BD con upload_status="PENDING"
 *    (el usuario ya puede seguir trabajando).
 * 2. En segundo plano, comprime la imagen y actualiza el registro con la
 *    URI comprimida (sin bloquear el hilo principal).
 */
export function useEvidence() {
  const saveEvidence = useCallback(
    async ({ protocolItemId, localUri }: SaveEvidenceOptions): Promise<SaveEvidenceResult> => {
      let evidenceId = '';

      // PASO 1: Guardar inmediatamente con URI original
      await evidencesCollection.database.write(async () => {
        const record = await evidencesCollection.create((evidence) => {
          evidence.protocolItemId = protocolItemId;
          evidence.localUri = localUri;           // URI original de la foto
          evidence.uploadStatus = 'PENDING';
          evidence.s3UrlPlaceholder = null;
        });
        evidenceId = record.id;
      });

      // PASO 2: Comprimir y subir a S3 en segundo plano (no bloquea la UI)
      compressImage(localUri)
        .then(async ({ uri: compressedUri }) => {
          // 2a. Actualizar localUri con la versión comprimida
          await evidencesCollection.database.write(async () => {
            const record = await evidencesCollection.find(evidenceId);
            await record.update((ev) => {
              ev.localUri = compressedUri;
            });
          });
          // 2b. Subir a S3 con nombre {protocolId}-F001.jpg, F002...
          try {
            await uploadEvidencePhoto(evidenceId, compressedUri);
          } catch (err) {
            console.warn('[Evidence] Upload S3 fallo, foto guardada solo localmente:', err);
          }
        })
        .catch((err) => {
          // Compresión falló: intentar subir con la imagen original
          console.warn('[Evidence] Compresion fallo, intentando subir original:', err);
          uploadEvidencePhoto(evidenceId, localUri).catch(() => {});
        });

      return {
        evidenceId,
        compressedUri: localUri, // Se actualizara async, por ahora retorna original
        originalUri: localUri,
      };
    },
    []
  );

  return { saveEvidence };
}
