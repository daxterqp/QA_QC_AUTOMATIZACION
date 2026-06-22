// qrCodeGenerator.ts — QR codes para protocolos (FASE 7).
//
// Formato del identificador del QR:
//   <id_protocolo>-<external_id>           (protocolo histórico)
//   <id_protocolo>-<uuid_short>            (protocolo creado in-app, sin external_id)
//
// Deep-link embebido:
//   flow://protocol/<identifier>
//
// La app móvil intercepta el esquema `flow://` y abre ProtocolFill (status DRAFT/IN_PROGRESS/REJECTED)
// o ProtocolAudit (SUBMITTED/APPROVED) según corresponda.

import QRCode from 'qrcode';

export const QR_SCHEME = 'flow';

/** Construye el identificador legible de un protocolo. */
export function buildQrIdentifier(args: {
  idProtocolo: string | null;
  externalId: string | null;
  protocolUuid: string;
}): string {
  const base = (args.idProtocolo ?? 'PROTO').trim() || 'PROTO';
  if (args.externalId) return `${base}-${args.externalId}`;
  // Sin external_id: short UUID (primeros 8 chars) — suficiente para unicidad dentro del proyecto.
  const short = args.protocolUuid.replace(/-/g, '').slice(0, 8).toUpperCase();
  return `${base}-${short}`;
}

/** Deep-link estándar `flow://protocol/<identifier>`. */
export function buildDeepLink(identifier: string): string {
  return `${QR_SCHEME}://protocol/${encodeURIComponent(identifier)}`;
}

/** Genera el SVG inline del QR para una URL deep-link.
 *  - `size` controla el viewBox; el SVG escala perfecto a cualquier tamaño.
 *  - `margin` en módulos (1 módulo = 1 "pixel" QR).
 *  Resuelve con un string `<svg ...>...</svg>` listo para `dangerouslySetInnerHTML`
 *  o para insertar en HTML del PDF. */
export async function renderQrSvg(text: string, opts?: { size?: number; margin?: number }): Promise<string> {
  const size = opts?.size ?? 128;
  const margin = opts?.margin ?? 2;
  return QRCode.toString(text, {
    type: 'svg',
    errorCorrectionLevel: 'M',
    margin,
    width: size,
    color: { dark: '#1a1a2e', light: '#ffffff' },
  });
}

/** Helper combinado: identificador + deep-link + SVG. */
export async function generateProtocolQr(args: {
  idProtocolo: string | null;
  externalId: string | null;
  protocolUuid: string;
  size?: number;
}): Promise<{ identifier: string; deepLink: string; svg: string }> {
  const identifier = buildQrIdentifier(args);
  const deepLink = buildDeepLink(identifier);
  const svg = await renderQrSvg(deepLink, { size: args.size });
  return { identifier, deepLink, svg };
}
