'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { uploadBlobToS3, sanitizeFilename, s3ProjectPrefix } from '@lib/s3-upload';

/** Construye la key S3 estándar para la norma de un template. */
export function normS3Key(projectName: string, idProtocolo: string): string {
  return `${s3ProjectPrefix(projectName)}/norms/${sanitizeFilename(idProtocolo)}.pdf`;
}

/** Devuelve la URL pública del PDF de la norma si existe, o null si no.
 *  Usa el endpoint /api/s3-list para chequear existencia sin hacer un GET caro. */
export function useTemplateNorm(projectName: string | null | undefined, idProtocolo: string | null | undefined) {
  return useQuery({
    queryKey: ['template-norm', projectName, idProtocolo],
    enabled: !!projectName && !!idProtocolo,
    queryFn: async (): Promise<string | null> => {
      const key = normS3Key(projectName!, idProtocolo!);
      // Listar el prefix exacto: si retorna esa key, existe
      const prefix = key.substring(0, key.lastIndexOf('/') + 1);
      const filename = key.substring(key.lastIndexOf('/') + 1);
      try {
        const res = await fetch(`/api/s3-list?prefix=${encodeURIComponent(prefix)}`);
        if (!res.ok) return null;
        const { keys } = await res.json() as { keys: string[] };
        const exists = keys.some(k => k.endsWith(filename));
        return exists ? `/api/s3-image?key=${encodeURIComponent(key)}` : null;
      } catch { return null; }
    },
    staleTime: 60_000,
  });
}

export function useUploadTemplateNorm() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { projectName: string; idProtocolo: string; file: File }) => {
      const key = normS3Key(input.projectName, input.idProtocolo);
      const blob = new Blob([await input.file.arrayBuffer()], { type: 'application/pdf' });
      await uploadBlobToS3(blob, key, 'application/pdf');
      return key;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['template-norm'] }),
  });
}

export function useDeleteTemplateNorm() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { projectName: string; idProtocolo: string }) => {
      const key = normS3Key(input.projectName, input.idProtocolo);
      await fetch('/api/s3-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key }),
      });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['template-norm'] }),
  });
}
