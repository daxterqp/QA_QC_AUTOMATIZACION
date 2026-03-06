import { useCallback } from 'react';
import { evidencesCollection } from '@db/index';
import { compressImage } from '@services/ImageCompressor';

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

      // PASO 2: Comprimir en segundo plano y actualizar el registro
      // No hacemos await aqui para no bloquear — se resuelve de forma async
      compressImage(localUri)
        .then(({ uri: compressedUri }) => {
          evidencesCollection.database.write(async () => {
            const record = await evidencesCollection.find(evidenceId);
            await record.update((ev) => {
              ev.localUri = compressedUri; // Reemplazar por la version comprimida
            });
          });
        })
        .catch((err) => {
          // La foto original sigue valida aunque falle la compresion
          console.warn('[Evidence] Compresion fallo, se usara imagen original:', err);
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
