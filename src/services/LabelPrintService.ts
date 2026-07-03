/**
 * LabelPrintService — Impresión de ETIQUETAS (rollo 50×50 mm) para Muestras y Ensayos.
 *
 * FASE 1 (actual, sin dependencias nuevas): genera la etiqueta como un PDF del
 * TAMAÑO EXACTO del rollo y abre el share sheet para mandarla a la APP NATIVA de
 * la impresora térmica (YHD-9260: Bluetooth + TSPL; su app imprime documentos e
 * imágenes compartidos). Reusa expo-print + expo-sharing + el QR inline
 * (renderQrSvgRaw) ya probado en el PDF de muestra.
 *
 * FASE 2 (si la Fase 1 resulta incómoda en campo): envío DIRECTO por Bluetooth
 * Classic con comandos TSPL (SIZE/GAP/CLS/BITMAP/PRINT) vía
 * react-native-bluetooth-classic — un toque, sin app intermedia. El diseño está
 * en docs/superpowers/specs/2026-07-03-impresion-etiquetas-design.md; esta capa
 * mantiene la MISMA API pública para que el cambio de transporte no toque las
 * pantallas.
 */
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { escapeHtml } from '@utils/htmlEscape';
import {
  buildProtocolDeepLink, buildQrIdentifier, buildSampleDeepLink, renderQrSvgRaw,
} from '@utils/qrCode';

/** Lado de la etiqueta en mm (rollo actual del usuario: 50×50). Parametrizado
 *  para ajustar si cambia el rollo sin rehacer el layout. */
export const LABEL_MM = 50;
/** El PDF se dimensiona en puntos (1 pt = 1/72"). 50 mm ≈ 142 pt. */
const LABEL_PT = Math.round((LABEL_MM / 25.4) * 72);

export interface SampleLabelInput {
  sampleCode: string;
  sampleDate?: string | null;      // YYYY-MM-DD
  materialType?: string | null;
  condition?: string | null;       // ALTERADA | INALTERADA
  placeName?: string | null;       // sector o ubicación
  projectName: string;
}

export interface ProtocolLabelInput {
  protocolCode?: string | null;    // correlativo (ej. PRM-260012)
  protocolNumber?: string | null;  // nombre del ensayo (fallback visual)
  idProtocolo?: string | null;     // tipo de ficha (para el QR y la línea "Tipo")
  externalId?: string | null;
  protocolUuid: string;
  ensayoDate?: string | null;      // YYYY-MM-DD
  ensayoTime?: string | null;      // HH:MM
  projectName: string;
}

const fmtYmd = (ymd?: string | null): string =>
  ymd && /^\d{4}-\d{2}-\d{2}$/.test(ymd) ? ymd.split('-').reverse().join('/') : (ymd ?? '—');

/** HTML de la etiqueta: página EXACTA de LABEL_PT×LABEL_PT. QR arriba-izquierda,
 *  código en grande a la derecha, y hasta 3 líneas de datos abajo. Todo negro
 *  puro (térmica monocroma). */
function labelHtml(qrSvg: string, code: string, lines: string[]): string {
  const rows = lines.filter(Boolean).map(l =>
    `<div class="ln">${escapeHtml(l)}</div>`).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    @page { margin: 0; }
    html, body { margin: 0; padding: 0; width: ${LABEL_PT}pt; height: ${LABEL_PT}pt; }
    body { font-family: Arial, Helvetica, sans-serif; color: #000; }
    .wrap { box-sizing: border-box; width: 100%; height: 100%; padding: 7pt; display: flex; flex-direction: column; }
    .top { display: flex; gap: 6pt; align-items: flex-start; }
    .qr { width: 62pt; height: 62pt; flex-shrink: 0; }
    .qr svg { width: 62pt; height: 62pt; }
    .code { font-size: 13pt; font-weight: 800; line-height: 1.12; word-break: break-word; }
    .meta { margin-top: 4pt; }
    .ln { font-size: 8pt; line-height: 1.32; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .proj { margin-top: auto; font-size: 6.5pt; line-height: 1.2; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  </style></head><body><div class="wrap">
    <div class="top">
      <div class="qr">${qrSvg}</div>
      <div class="code">${escapeHtml(code)}</div>
    </div>
    <div class="meta">${rows}</div>
  </div></body></html>`;
}

/** Genera el PDF-etiqueta y abre el share sheet (el usuario elige la app de la
 *  impresora). Lanza Error con mensaje legible si algo falla. */
async function shareLabel(html: string, dialogTitle: string): Promise<void> {
  const { uri } = await Print.printToFileAsync({ html, width: LABEL_PT, height: LABEL_PT, base64: false });
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle });
  } else {
    throw new Error('No hay apps disponibles para compartir la etiqueta.');
  }
}

export async function printSampleLabel(input: SampleLabelInput): Promise<void> {
  const qrSvg = await renderQrSvgRaw(buildSampleDeepLink(input.sampleCode));
  const cond = input.condition === 'ALTERADA' ? 'Alterada'
    : input.condition === 'INALTERADA' ? 'Inalterada' : null;
  const lines = [
    `Fecha: ${fmtYmd(input.sampleDate)}`,
    input.materialType ? `Material: ${input.materialType}${cond ? ` · ${cond}` : ''}` : (cond ? `Condición: ${cond}` : ''),
    input.placeName && input.placeName !== '—' ? `Lugar: ${input.placeName}` : '',
  ];
  const html = labelHtml(qrSvg, input.sampleCode, lines)
    .replace('</div></body>', `<div class="proj">${escapeHtml(input.projectName)}</div></div></body>`);
  await shareLabel(html, `Etiqueta ${input.sampleCode}`);
}

export async function printProtocolLabel(input: ProtocolLabelInput): Promise<void> {
  const identifier = buildQrIdentifier({
    idProtocolo: input.idProtocolo ?? null,
    externalId: input.externalId ?? null,
    protocolUuid: input.protocolUuid,
  });
  const qrSvg = await renderQrSvgRaw(buildProtocolDeepLink(identifier));
  const code = input.protocolCode ?? identifier;
  const lines = [
    input.idProtocolo ? `Tipo: ${input.idProtocolo}` : (input.protocolNumber ? `Ensayo: ${input.protocolNumber}` : ''),
    `Fecha: ${fmtYmd(input.ensayoDate)}${input.ensayoTime ? ` · ${input.ensayoTime}` : ''}`,
  ];
  const html = labelHtml(qrSvg, code, lines)
    .replace('</div></body>', `<div class="proj">${escapeHtml(input.projectName)}</div></div></body>`);
  await shareLabel(html, `Etiqueta ${code}`);
}
