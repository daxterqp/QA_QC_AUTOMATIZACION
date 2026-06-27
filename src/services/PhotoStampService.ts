/**
 * PhotoStampService
 *
 * Agrega texto (nombre del proyecto + comentario, comentario por-foto, fecha/hora y
 * coordenadas GPS) y logo sobre los bytes de la imagen (nativo, sin pantalla).
 *
 * Bloque superior-izquierdo (una línea por dato, en orden):
 *   1. "Nombre del proyecto - Comentario"  (ej. "Proyecto Modelo - Fase I")
 *   2. Comentario por-foto                   (el que se ingresa en la cámara, opcional)
 *   3. Fecha / hora
 *   4. Coordenadas GPS                        (opcional, según el flag "Datos GPS")
 * Logo: inferior derecha. El TAMAÑO (letra + logo) se controla con `size`.
 *
 * IMPORTANTE — react-native-image-marker en Android:
 *   1. El URI DEBE tener prefijo file:// para que Coil lo cargue como archivo local.
 *   2. El resultado de markText/markImage es una ruta absoluta SIN file://.
 *   3. Los colores van en RGBA hex (#RRGGBBAA). Ej: blanco 50% = #FFFFFF80.
 */

import Marker, {
  Position,
  ImageFormat,
  TextBackgroundType,
} from 'react-native-image-marker';
import type { StampSize } from '@services/ProjectSettings';

function formatTimestamp(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}  ` +
    `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  );
}

/** Garantiza que el URI tenga prefijo file:// (necesario para Coil en Android) */
function ensureFileUri(uri: string): string {
  return uri.startsWith('file://') ? uri : `file://${uri}`;
}

/** Presets de tamaño: fontSize (px) + escala del logo (fracción del ancho). */
const SIZE_PRESETS: Record<StampSize, { fontSize: number; logoScale: number }> = {
  normal: { fontSize: 30, logoScale: 0.13 },
  compact: { fontSize: 22, logoScale: 0.10 },
  very_compact: { fontSize: 16, logoScale: 0.075 },
};

export interface StampInput {
  imageUri: string;
  logoUri: string | null;
  /** Comentario configurado del proyecto (va junto al nombre en la 1ª línea). */
  comment?: string | null;
  /** Nombre del proyecto (1ª línea, junto al comentario). */
  projectName?: string | null;
  /** Comentario POR FOTO (ingresado en la cámara) — va en la 2ª línea, debajo del nombre. */
  photoComment?: string | null;
  /** Coordenadas GPS crudas (WGS84). Solo se estampan si se pasan (el caller decide
   *  según el flag "Datos GPS"). */
  coords?: { lat: number; lng: number } | null;
  /** Tamaño del estampado (letra + logo). Default 'normal'. */
  size?: StampSize;
}

export async function applyPhotoStamps(input: StampInput): Promise<string> {
  const { imageUri, logoUri, comment, projectName, photoComment, coords, size = 'normal' } = input;
  const preset = SIZE_PRESETS[size] ?? SIZE_PRESETS.normal;
  const timestamp = formatTimestamp(new Date());

  // ── Paso 1: bloque superior-izquierdo, una línea por dato ──
  const lines: string[] = [];
  const header = [projectName?.trim(), comment?.trim()].filter(Boolean).join(' - ');
  if (header) lines.push(header);
  if (photoComment?.trim()) lines.push(photoComment.trim());
  lines.push(timestamp);
  if (coords && Number.isFinite(coords.lat) && Number.isFinite(coords.lng)) {
    lines.push(`${coords.lat.toFixed(6)}, ${coords.lng.toFixed(6)}`);
  }
  const labelText = lines.join('\n');

  const withText: string = await Marker.markText({
    backgroundImage: { src: ensureFileUri(imageUri) },
    watermarkTexts: [
      {
        text: labelText,
        positionOptions: { position: Position.topLeft },
        style: {
          color: '#000000',
          fontSize: preset.fontSize,
          textBackgroundStyle: {
            paddingX: Math.round(preset.fontSize * 0.53),
            paddingY: Math.round(preset.fontSize * 0.33),
            type: TextBackgroundType.none,
            color: '#FFFFFF80',
          },
        },
      },
    ],
    saveFormat: ImageFormat.jpg,
    quality: 88,
  });

  // ── Paso 2: logo del proyecto (inferior derecha) ───────────
  if (logoUri) {
    const withLogo: string = await Marker.markImage({
      backgroundImage: { src: ensureFileUri(withText) },
      watermarkImages: [
        {
          src: ensureFileUri(logoUri),
          scale: preset.logoScale,
          alpha: 0.7,
          position: { position: Position.bottomRight },
        },
      ],
      saveFormat: ImageFormat.jpg,
      quality: 88,
    });
    return ensureFileUri(withLogo);
  }

  return ensureFileUri(withText);
}
