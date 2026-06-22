/**
 * qrCode (v43) — Generación de QR para protocolos y MUESTRAS (móvil).
 *
 * Espejo de `flow-qaqc-web/lib/qrCodeGenerator.ts`. Genera el SVG del QR (string)
 * que se renderiza con react-native-svg (SvgXml) en el Audit header y se embebe en
 * el HTML del PDF. El esquema de deep-link `flow://` lo resuelve el QRScannerScreen
 * global:
 *   • flow://protocol/<idProtocolo>-<externalId|UUIDshort8>
 *   • flow://sample/<sampleCode>
 */
import QRCode from 'qrcode';

export const QR_SCHEME = 'flow';

/** Identificador legible del protocolo (igual que el reconstruido por el scanner). */
export function buildQrIdentifier(args: { idProtocolo: string | null; externalId: string | null; protocolUuid: string }): string {
  const base = (args.idProtocolo ?? 'PROTO').trim() || 'PROTO';
  if (args.externalId) return `${base}-${args.externalId}`;
  const short = args.protocolUuid.replace(/-/g, '').slice(0, 8).toUpperCase();
  return `${base}-${short}`;
}

export function buildProtocolDeepLink(identifier: string): string {
  return `${QR_SCHEME}://protocol/${encodeURIComponent(identifier)}`;
}

export function buildSampleDeepLink(sampleCode: string): string {
  return `${QR_SCHEME}://sample/${encodeURIComponent(sampleCode)}`;
}

/** SVG string del QR para un texto/deep-link. */
export async function renderQrSvg(text: string, opts?: { size?: number; margin?: number }): Promise<string> {
  return QRCode.toString(text, {
    type: 'svg',
    errorCorrectionLevel: 'M',
    margin: opts?.margin ?? 1,   // quiet zone mínima → el QR ocupa casi todo su recuadro
    width: opts?.size ?? 128,
    color: { dark: '#0e213d', light: '#ffffff' },
  });
}

/** v43.5 — QR como dataURL PNG (para el PDF). Embebido con <img width/height> el motor
 *  de PDF SIEMPRE respeta el tamaño (a diferencia del <svg> inline cuyo width a veces se
 *  ignora). Se genera a alta resolución y se escala en el <img>. */
export async function renderQrPng(text: string, opts?: { size?: number; margin?: number }): Promise<string> {
  return QRCode.toDataURL(text, {
    errorCorrectionLevel: 'M',
    margin: opts?.margin ?? 1,
    width: opts?.size ?? 320,   // alta resolución; el <img> lo baja al tamaño final
    color: { dark: '#0e213d', light: '#ffffff' },
  });
}

/** v43.6 — QR como SVG CRUDO (viewBox, SIN width) para embeber INLINE en el HTML.
 *  Historia del bug del QR:
 *   • `toDataURL` (PNG) → en RN el paquete resuelve a su build `browser` que necesita
 *     canvas del DOM → falla → QR NO aparece.
 *   • `<img src="data:image/svg+xml,…">` → algunos motores de impresión Android no
 *     renderizan SVG por data-URI → QR NO aparece.
 *   • `<svg>` INLINE en el HTML SÍ se renderiza (es parte del DOM, no un recurso). El
 *     antiguo problema de "no se achica" era por un width fijo; aquí el SVG va SIN width
 *     (solo viewBox) y el consumidor le inyecta width/height EXACTOS → aparece y escala. */
export async function renderQrSvgRaw(text: string, opts?: { margin?: number }): Promise<string> {
  return QRCode.toString(text, {
    type: 'svg',
    errorCorrectionLevel: 'M',
    margin: opts?.margin ?? 1,   // sin width → solo viewBox
    color: { dark: '#0e213d', light: '#ffffff' },
  });
}

export async function generateProtocolQrImg(args: { idProtocolo: string | null; externalId: string | null; protocolUuid: string }): Promise<{ identifier: string; deepLink: string; svg: string }> {
  const identifier = buildQrIdentifier(args);
  const deepLink = buildProtocolDeepLink(identifier);
  const svg = await renderQrSvgRaw(deepLink);
  return { identifier, deepLink, svg };
}

export async function generateSampleQrImg(args: { sampleCode: string }): Promise<{ deepLink: string; svg: string }> {
  const deepLink = buildSampleDeepLink(args.sampleCode);
  const svg = await renderQrSvgRaw(deepLink);
  return { deepLink, svg };
}

export async function generateProtocolQrPng(args: { idProtocolo: string | null; externalId: string | null; protocolUuid: string; size?: number }): Promise<{ identifier: string; deepLink: string; png: string }> {
  const identifier = buildQrIdentifier(args);
  const deepLink = buildProtocolDeepLink(identifier);
  const png = await renderQrPng(deepLink, { size: args.size });
  return { identifier, deepLink, png };
}

export async function generateSampleQrPng(args: { sampleCode: string; size?: number }): Promise<{ deepLink: string; png: string }> {
  const deepLink = buildSampleDeepLink(args.sampleCode);
  const png = await renderQrPng(deepLink, { size: args.size });
  return { deepLink, png };
}

export async function generateProtocolQr(args: { idProtocolo: string | null; externalId: string | null; protocolUuid: string; size?: number }): Promise<{ identifier: string; deepLink: string; svg: string }> {
  const identifier = buildQrIdentifier(args);
  const deepLink = buildProtocolDeepLink(identifier);
  const svg = await renderQrSvg(deepLink, { size: args.size });
  return { identifier, deepLink, svg };
}

export async function generateSampleQr(args: { sampleCode: string; size?: number }): Promise<{ deepLink: string; svg: string }> {
  const deepLink = buildSampleDeepLink(args.sampleCode);
  const svg = await renderQrSvg(deepLink, { size: args.size });
  return { deepLink, svg };
}
