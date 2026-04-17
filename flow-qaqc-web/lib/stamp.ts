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
  const { imageUrl, logoUrl, comment, quality = 0.7 } = opts;

  const img = await loadImage(imageUrl);

  // Compress: resize to max 1920x1080 (same as APK)
  const MAX_W = 1920;
  const MAX_H = 1080;
  let w = img.naturalWidth;
  let h = img.naturalHeight;
  if (w > MAX_W || h > MAX_H) {
    const ratio = Math.min(MAX_W / w, MAX_H / h);
    w = Math.round(w * ratio);
    h = Math.round(h * ratio);
  }

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;

  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(img, 0, 0, w, h);

  // ── Timestamp + comentario (esquina superior izquierda) ──────────────────
  const timestamp = formatTimestamp(new Date());
  const labelText = comment?.trim() ? `${timestamp}\n${comment.trim()}` : timestamp;
  const lines = labelText.split('\n');

  const FONT_SIZE = Math.max(14, Math.round(w * 0.016));
  ctx.font = `bold ${FONT_SIZE}px sans-serif`;

  const PAD_X = Math.round(FONT_SIZE * 0.5);
  const PAD_Y = Math.round(FONT_SIZE * 0.3);
  const LINE_H = Math.round(FONT_SIZE * 1.2);

  // Measure text to fit background tightly
  const maxLineWidth = Math.max(...lines.map(l => ctx.measureText(l).width));
  const bgW = maxLineWidth + PAD_X * 2;
  const bgH = LINE_H * lines.length + PAD_Y * 2;
  const bgX = 0;
  const bgY = 0;

  // Fondo semitransparente (como APK: #FFFFFF80 = blanco 50%)
  ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
  ctx.fillRect(bgX, bgY, bgW, bgH);

  // Texto negro
  ctx.fillStyle = '#000000';
  ctx.textBaseline = 'top';
  lines.forEach((line, i) => {
    ctx.fillText(line, bgX + PAD_X, bgY + PAD_Y + i * LINE_H);
  });

  // ── Logo (esquina inferior derecha, 70% opacidad) ──────────────────────
  if (logoUrl) {
    try {
      // Fetch as blob first to avoid CORS issues with canvas
      const resp = await fetch(logoUrl);
      const blob = await resp.blob();
      const logoBlobUrl = URL.createObjectURL(blob);
      const logo = await loadImage(logoBlobUrl);

      const logoScale = 0.13;
      const logoW = w * logoScale;
      const logoH = (logoW / logo.naturalWidth) * logo.naturalHeight;
      const MARGIN = Math.round(w * 0.02);
      const x = w - logoW - MARGIN;
      const y = h - logoH - MARGIN;

      ctx.globalAlpha = 0.85;
      ctx.drawImage(logo, x, y, logoW, logoH);
      ctx.globalAlpha = 1;
      URL.revokeObjectURL(logoBlobUrl);
    } catch (e) {
      console.warn('[stamp] Logo failed:', e);
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
