/**
 * stamp.ts — Canvas-based photo stamping (web)
 *
 * Reemplaza react-native-image-marker.
 * Aplica:
 *   - Timestamp (+ comentario opcional) en esquina superior izquierda
 *   - Logo del proyecto en esquina inferior derecha (25% opacidad)
 *
 * Devuelve un Blob JPEG listo para subir a S3.
 */

function formatTimestamp(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}  ` +
    `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  );
}

/**
 * Carga una URL (puede ser blob: o https:) como HTMLImageElement.
 */
function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

export interface StampOptions {
  /** URL de la foto original (blob: URL o URL de S3 con CORS habilitado) */
  imageUrl: string;
  /** URL del logo del proyecto (opcional) */
  logoUrl?: string | null;
  /** Texto adicional bajo el timestamp (opcional) */
  comment?: string | null;
  /** Calidad JPEG 0–1 (default 0.88) */
  quality?: number;
}

/**
 * Aplica el sello sobre la foto y devuelve un Blob JPEG.
 */
export async function applyStamp(opts: StampOptions): Promise<Blob> {
  const { imageUrl, logoUrl, comment, quality = 0.88 } = opts;

  const img = await loadImage(imageUrl);

  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;

  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(img, 0, 0);

  // ── Timestamp + comentario (esquina superior izquierda) ──────────────────
  const timestamp = formatTimestamp(new Date());
  const labelText = comment?.trim() ? `${timestamp}\n${comment.trim()}` : timestamp;
  const lines = labelText.split('\n');

  const FONT_SIZE = Math.max(20, Math.round(img.naturalWidth * 0.025));
  ctx.font = `bold ${FONT_SIZE}px Arial, sans-serif`;

  const PADDING_X = Math.round(FONT_SIZE * 0.6);
  const PADDING_Y = Math.round(FONT_SIZE * 0.4);
  const LINE_H = Math.round(FONT_SIZE * 1.3);

  // Ancho máximo de las líneas
  const maxLineWidth = Math.max(...lines.map(l => ctx.measureText(l).width));
  const bgW = maxLineWidth + PADDING_X * 2;
  const bgH = LINE_H * lines.length + PADDING_Y * 2;

  // Fondo semitransparente blanco
  ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
  ctx.fillRect(PADDING_X / 2, PADDING_Y / 2, bgW, bgH);

  // Texto negro
  ctx.fillStyle = '#000000';
  ctx.textBaseline = 'top';
  lines.forEach((line, i) => {
    ctx.fillText(line, PADDING_X, PADDING_Y + i * LINE_H);
  });

  // ── Logo (esquina inferior derecha, 25% opacidad) ──────────────────────
  if (logoUrl) {
    try {
      const logo = await loadImage(logoUrl);
      const logoScale = 0.13;
      const logoW = img.naturalWidth * logoScale;
      const logoH = (logoW / logo.naturalWidth) * logo.naturalHeight;
      const MARGIN = Math.round(img.naturalWidth * 0.02);
      const x = img.naturalWidth - logoW - MARGIN;
      const y = img.naturalHeight - logoH - MARGIN;

      ctx.globalAlpha = 0.25;
      ctx.drawImage(logo, x, y, logoW, logoH);
      ctx.globalAlpha = 1;
    } catch {
      // Si el logo falla (CORS, etc.) continúa sin él
    }
  }

  // ── Convertir a Blob ──────────────────────────────────────────────────
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => blob ? resolve(blob) : reject(new Error('Canvas toBlob failed')),
      'image/jpeg',
      quality
    );
  });
}
