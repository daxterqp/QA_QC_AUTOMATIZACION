/**
 * PhotoStampService
 *
 * Agrega timestamp y logo sobre los bytes de la imagen (nativo, sin pantalla).
 *
 * - Fecha/hora : superior izquierda, texto negro, fondo blanco 50%
 * - Logo       : inferior derecha, opacidad 25%
 *
 * IMPORTANTE — react-native-image-marker en Android:
 *   1. El URI DEBE tener prefijo file:// para que Coil lo cargue como archivo local.
 *      Sin file://, la librería intenta buscar un drawable de Android → null → crash.
 *   2. El resultado de markText/markImage es una ruta absoluta SIN file://.
 *      Por eso usamos ensureFileUri() antes de cada llamada y al retornar.
 *   3. Los colores van en formato RGBA hex (#RRGGBBAA) — la librería convierte
 *      internamente a ARGB para Android. Ej: blanco 50% = #FFFFFF80.
 */

import Marker, {
  Position,
  ImageFormat,
  TextBackgroundType,
} from 'react-native-image-marker';

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

export async function applyPhotoStamps(
  imageUri: string,
  logoUri: string | null,
  comment?: string | null
): Promise<string> {
  const timestamp = formatTimestamp(new Date());

  // ── Paso 1: timestamp + comentario (mismo estilo, segunda fila) ──────────
  // Se combinan en un único markText para que el comentario quede exactamente
  // debajo del timestamp con el mismo fondo blanco semitransparente.
  const watermarkTexts: any[] = [
    {
      text: timestamp,
      positionOptions: { position: Position.topLeft },
      style: {
        color: '#000000',
        fontSize: 30,
        textBackgroundStyle: {
          paddingX: 16,
          paddingY: 10,
          type: TextBackgroundType.none,
          color: '#FFFFFF80',
        },
      },
    },
  ];

  if (comment?.trim()) {
    watermarkTexts.push({
      text: comment.trim(),
      positionOptions: { position: Position.topLeft, Y: 70 }, // segunda fila debajo del timestamp
      style: {
        color: '#000000',
        fontSize: 30,
        textBackgroundStyle: {
          paddingX: 16,
          paddingY: 10,
          type: TextBackgroundType.none,
          color: '#FFFFFF80',
        },
      },
    });
  }

  const withText: string = await Marker.markText({
    backgroundImage: { src: ensureFileUri(imageUri) },
    watermarkTexts,
    saveFormat: ImageFormat.jpg,
    quality: 88,
  });

  // ── Paso 2: logo del proyecto (inferior derecha, 25% opacidad) ───────────
  if (logoUri) {
    const withLogo: string = await Marker.markImage({
      backgroundImage: { src: ensureFileUri(withText) },
      watermarkImages: [
        {
          src: ensureFileUri(logoUri),
          scale: 0.13,
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
