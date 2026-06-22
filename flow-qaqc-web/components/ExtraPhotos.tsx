'use client';

import { useEffect, useRef, useState } from 'react';
import { Plus, Trash2, Loader2 } from 'lucide-react';
import { uploadBlobToS3, sanitizeFilename, seq, s3ProjectPrefix } from '@lib/s3-upload';
import { applyStamp } from '@lib/stamp';
import { useI18n } from '@lib/i18n';

interface Props {
  /** Identificador del recurso al que se asocian las fotos extra (ej: protocolId) */
  bucketId: string;
  projectName: string;
  projectId: string;
  /** Logo del proyecto para estampar (S3 key o null) */
  logoKey?: string | null;
  /** Comentario para el estampado */
  stampComment?: string | null;
  /** Sub-segmento del nombre (ej: protocol_number) */
  subSeg: string;
  /** Sub-sub-segmento (ej: location_name) */
  locSeg?: string;
  /** Si false oculta el botón de agregar (modo solo-lectura) */
  canEdit?: boolean;
  onOpenLightbox?: (url: string) => void;
}

/** Galería de "evidencia fotográfica extra" compartida entre fill numérico y audit clásico.
 *  Carga las fotos desde S3 (prefijo `projects/<proj>/photos/<sub>-<loc>-extra-`) y permite
 *  agregar / eliminar. Las fotos se estampan con logo + fecha antes de subir. */
export function ExtraPhotos({
  bucketId, projectName, projectId, logoKey, stampComment, subSeg, locSeg,
  canEdit = true, onOpenLightbox,
}: Props) {
  const { t } = useI18n();
  const [keys, setKeys]         = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const projPrefix  = s3ProjectPrefix(projectName);
  const subSegSan   = sanitizeFilename(subSeg);
  const locSegSan   = locSeg ? sanitizeFilename(locSeg) : 'SIN_UBICACION';
  const extraPrefix = `${projPrefix}/photos/${subSegSan}-${locSegSan}-extra-`;

  useEffect(() => {
    fetch(`/api/s3-list?prefix=${encodeURIComponent(extraPrefix)}`)
      .then(r => r.ok ? r.json() : { keys: [] })
      .then(({ keys }: { keys: string[] }) => setKeys(keys))
      .catch(() => {});
  }, [extraPrefix]);

  async function handleAdd(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    setUploading(true);
    try {
      const blobUrl = URL.createObjectURL(file);
      const finalLogoKey = logoKey ?? (projectId ? `logos/project_${projectId}/logo.jpg` : null);
      const logoUrl = finalLogoKey ? `/api/s3-image-nocache?key=${encodeURIComponent(finalLogoKey)}` : null;
      const stampedBlob = await applyStamp({ imageUrl: blobUrl, logoUrl, comment: stampComment ?? null });
      URL.revokeObjectURL(blobUrl);

      const pos = keys.length + 1;
      const s3Key = `${extraPrefix}F${seq(pos)}.jpg`;
      await uploadBlobToS3(stampedBlob, s3Key, 'image/jpeg');
      setKeys(prev => [...prev, s3Key]);
    } catch (err) {
      alert(t('webCMisc.extra.uploadFailed') + String(err));
    } finally {
      setUploading(false);
    }
  }

  async function handleDelete(key: string) {
    if (!confirm(t('webCMisc.extra.deleteConfirm'))) return;
    try {
      await fetch('/api/s3-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key }),
      });
      setKeys(prev => prev.filter(k => k !== key));
    } catch (err) {
      alert(t('webCMisc.extra.deleteFailed') + String(err));
    }
  }

  return (
    <div className="bg-white rounded-xl shadow-subtle p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-bold text-gray-700">{t('webCMisc.extra.title')}</p>
        {canEdit && (
          <button onClick={() => fileRef.current?.click()} disabled={uploading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border border-primary/30 text-primary hover:bg-primary/5 transition disabled:opacity-50">
            {uploading ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
            {t('webCMisc.extra.addPhoto')}
          </button>
        )}
      </div>
      {keys.length === 0
        ? <p className="text-xs text-gray-400">{t('webCMisc.extra.empty')}</p>
        : (
          <div className="flex flex-wrap gap-2">
            {keys.map(key => {
              const url = `/api/s3-image?key=${encodeURIComponent(key)}`;
              return (
                <div key={key} className="relative group">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={url} alt="extra" onClick={() => onOpenLightbox?.(url)}
                    className="w-20 h-20 object-cover rounded-lg border border-border cursor-pointer hover:opacity-90 transition" />
                  {canEdit && (
                    <button onClick={() => handleDelete(key)}
                      className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-danger text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition shadow">
                      <Trash2 size={10} />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleAdd} />
      {/* bucketId solo se usa como key estable de localidad — no se renderiza */}
      <input type="hidden" value={bucketId} />
    </div>
  );
}
