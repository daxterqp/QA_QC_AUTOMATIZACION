/**
 * LabelPrintService — Impresión de ETIQUETAS (rollo 50×50 mm) para Muestras y Ensayos.
 *
 * FASE 1 (actual, sin dependencias nuevas): genera la etiqueta como un PDF del
 * TAMAÑO EXACTO del rollo con diseño de marca (marco, cabecera con logo Flow QA/QC,
 * tipografía geométrica embebida) y lo GUARDA en una carpeta que el usuario elige
 * UNA sola vez (SAF; p. ej. Descargas). El usuario abre la app de la impresora
 * (YHD-9260: Bluetooth + TSPL) y carga el PDF desde ahí. (El share directo falló
 * en su equipo, por eso se guarda a disco.)
 *
 * Tipografía: el usuario pidió Century Gothic; no existe en Android, así que se
 * embebe Didact Gothic (OFL, geometría gemela) vía @font-face base64 — se ve
 * idéntica en cualquier dispositivo. La térmica es MONOCROMA: todo negro puro.
 *
 * FASE 2 (si este flujo resulta incómodo en campo): envío DIRECTO por Bluetooth
 * Classic con comandos TSPL — misma API pública; ver
 * docs/superpowers/specs/2026-07-03-impresion-etiquetas-design.md.
 */
import { Alert, Platform } from 'react-native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { escapeHtml } from '@utils/htmlEscape';
import {
  buildProtocolDeepLink, buildQrIdentifier, buildSampleDeepLink, renderQrSvgRaw,
} from '@utils/qrCode';
import { FLOW_LOGO_SVG } from '../assets/flowLogoSvg';
import { DIDACT_GOTHIC_B64 } from '../assets/didactGothicFont';

/** Lado de la etiqueta en mm (rollo actual: 50×50). Parametrizado para ajustar
 *  si cambia el rollo sin rehacer el layout. */
export const LABEL_MM = 50;
/** El PDF se dimensiona en puntos (1 pt = 1/72"). 50 mm ≈ 142 pt. */
const LABEL_PT = Math.round((LABEL_MM / 25.4) * 72);

const SAVE_DIR_KEY = 'labels_save_dir_uri';

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
  protocolNumber?: string | null;  // nombre COMPLETO del ensayo
  idProtocolo?: string | null;     // tipo de ficha (para el QR)
  externalId?: string | null;
  protocolUuid: string;
  ensayoDate?: string | null;      // YYYY-MM-DD
  ensayoTime?: string | null;      // HH:MM
  projectName: string;
}

const fmtYmd = (ymd?: string | null): string =>
  ymd && /^\d{4}-\d{2}-\d{2}$/.test(ymd) ? ymd.split('-').reverse().join('/') : (ymd ?? '—');

interface LabelField { k: string; v: string }

/** HTML de la etiqueta 50×50 con diseño de marca:
 *  ┌ marco redondeado ───────────────────────────┐
 *  │ [logo]  FLOW QA/QC              ‹MUESTRA›   │  cabecera con doble filete
 *  │ CÓDIGO (grande, tracking)          [ QR ]   │
 *  │ Nombre completo (2 líneas máx)     [ 19mm ] │
 *  │ campo: valor · campo: valor                 │
 *  │ ── proyecto centrado al pie ──              │
 *  └─────────────────────────────────────────────┘
 *  Todo negro puro (térmica monocroma); tipografía embebida. */
function labelHtml(args: { kind: 'MUESTRA' | 'ENSAYO'; qrSvg: string; code: string; title?: string | null; fields: LabelField[]; projectName: string }): string {
  const rows = args.fields.filter(f => f.v && f.v !== '—').map(f =>
    `<div class="fld"><span class="k">${escapeHtml(f.k)}</span> ${escapeHtml(f.v)}</div>`).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    @font-face { font-family: 'FlowGothic'; src: url(data:font/ttf;base64,${DIDACT_GOTHIC_B64}) format('truetype'); }
    @page { margin: 0; }
    html, body { margin: 0; padding: 0; width: ${LABEL_PT}pt; height: ${LABEL_PT}pt; }
    body { font-family: 'Century Gothic', 'FlowGothic', sans-serif; color: #000; -webkit-print-color-adjust: exact; }
    .frame { box-sizing: border-box; width: ${LABEL_PT - 6}pt; height: ${LABEL_PT - 6}pt; margin: 3pt;
             border: 1.4pt solid #000; border-radius: 7pt; padding: 5pt 7pt 4pt; display: flex; flex-direction: column; overflow: hidden; }
    .hdr { display: flex; align-items: center; gap: 4pt; padding-bottom: 3pt;
           border-bottom: 1.6pt solid #000; }
    .hdr .logo { width: 13pt; height: 13pt; flex-shrink: 0; }
    .hdr .logo svg { width: 13pt; height: 13pt; }
    .brand { font-size: 7.5pt; font-weight: bold; letter-spacing: 1.4pt; }
    .kind { margin-left: auto; font-size: 5.6pt; letter-spacing: 1.2pt; border: 0.8pt solid #000;
            border-radius: 2.5pt; padding: 1pt 3.5pt; font-weight: bold; }
    .mainrow { display: flex; gap: 5pt; flex: 1; min-height: 0; padding-top: 4pt; }
    .left { flex: 1; min-width: 0; display: flex; flex-direction: column; }
    .code { font-size: 12.5pt; font-weight: bold; letter-spacing: 0.6pt; line-height: 1.08; word-break: break-word; }
    .title { font-size: 7pt; line-height: 1.25; margin-top: 2.5pt; font-weight: bold;
             display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
    .flds { margin-top: 3pt; }
    .fld { font-size: 6.6pt; line-height: 1.45; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .fld .k { font-weight: bold; letter-spacing: 0.3pt; }
    .qrbox { flex-shrink: 0; align-self: flex-start; border: 0.9pt solid #000; border-radius: 4pt; padding: 2pt; }
    .qrbox svg { width: 52pt; height: 52pt; display: block; }
    .foot { border-top: 0.9pt solid #000; margin-top: 3pt; padding-top: 2.5pt; text-align: center;
            font-size: 6pt; letter-spacing: 0.4pt; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  </style></head><body><div class="frame">
    <div class="hdr">
      <div class="logo">${FLOW_LOGO_SVG}</div>
      <div class="brand">FLOW QA/QC</div>
      <div class="kind">${args.kind}</div>
    </div>
    <div class="mainrow">
      <div class="left">
        <div class="code">${escapeHtml(args.code)}</div>
        ${args.title ? `<div class="title">${escapeHtml(args.title)}</div>` : ''}
        <div class="flds">${rows}</div>
      </div>
      <div class="qrbox">${args.qrSvg}</div>
    </div>
    <div class="foot">${escapeHtml(args.projectName)}</div>
  </div></body></html>`;
}

const sanitizeFileName = (s: string) => s.replace(/[^a-zA-Z0-9._-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 60) || 'etiqueta';

/** Guarda el PDF (base64) en la carpeta elegida por el usuario (SAF). La carpeta
 *  se pide UNA vez y se recuerda; si el permiso fue revocado se vuelve a pedir.
 *  Fallback (iOS / usuario cancela): share sheet. Devuelve un texto de destino. */
async function savePdf(base64: string, fileName: string): Promise<string> {
  if (Platform.OS === 'android') {
    const SAF = FileSystem.StorageAccessFramework;
    let dirUri = await AsyncStorage.getItem(SAVE_DIR_KEY);
    for (let attempt = 0; attempt < 2; attempt++) {
      if (!dirUri) {
        const perm = await SAF.requestDirectoryPermissionsAsync();
        if (!perm.granted) break; // canceló → fallback share
        dirUri = perm.directoryUri;
        await AsyncStorage.setItem(SAVE_DIR_KEY, dirUri);
      }
      try {
        const fileUri = await SAF.createFileAsync(dirUri, fileName, 'application/pdf');
        await FileSystem.writeAsStringAsync(fileUri, base64, { encoding: FileSystem.EncodingType.Base64 });
        const folder = decodeURIComponent(dirUri.split('%3A').pop() ?? '').replace(/^primary:/, '') || 'la carpeta elegida';
        return `${fileName}.pdf guardada en “${folder}”.`;
      } catch {
        // Permiso revocado / carpeta borrada → limpiar y re-pedir UNA vez.
        dirUri = null;
        await AsyncStorage.removeItem(SAVE_DIR_KEY);
      }
    }
  }
  // Fallback: share sheet (iOS o usuario canceló la carpeta).
  const tmp = `${FileSystem.cacheDirectory}${fileName}.pdf`;
  await FileSystem.writeAsStringAsync(tmp, base64, { encoding: FileSystem.EncodingType.Base64 });
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(tmp, { mimeType: 'application/pdf', dialogTitle: fileName });
    return `${fileName}.pdf lista para compartir.`;
  }
  throw new Error('No se pudo guardar ni compartir la etiqueta.');
}

/** Genera el PDF-etiqueta, lo guarda y avisa dónde quedó. */
async function produceLabel(html: string, baseName: string): Promise<void> {
  const { base64 } = await Print.printToFileAsync({ html, width: LABEL_PT, height: LABEL_PT, base64: true });
  if (!base64) throw new Error('No se pudo generar el PDF de la etiqueta.');
  const where = await savePdf(base64, sanitizeFileName(baseName));
  Alert.alert('Etiqueta lista', `${where}\n\nÁbrela desde la app de la impresora para imprimirla (50×50 mm).`);
}

export async function printSampleLabel(input: SampleLabelInput): Promise<void> {
  const qrSvg = await renderQrSvgRaw(buildSampleDeepLink(input.sampleCode));
  const cond = input.condition === 'ALTERADA' ? 'Alterada'
    : input.condition === 'INALTERADA' ? 'Inalterada' : null;
  const fields: LabelField[] = [
    { k: 'Fecha:', v: fmtYmd(input.sampleDate) },
    { k: 'Material:', v: [input.materialType, cond].filter(Boolean).join(' · ') || '—' },
    { k: 'Lugar:', v: input.placeName && input.placeName !== '—' ? input.placeName : '—' },
  ];
  const html = labelHtml({
    kind: 'MUESTRA', qrSvg, code: input.sampleCode, title: null, fields,
    projectName: input.projectName,
  });
  await produceLabel(html, `Etiqueta_${input.sampleCode}`);
}

export async function printProtocolLabel(input: ProtocolLabelInput): Promise<void> {
  const identifier = buildQrIdentifier({
    idProtocolo: input.idProtocolo ?? null,
    externalId: input.externalId ?? null,
    protocolUuid: input.protocolUuid,
  });
  const qrSvg = await renderQrSvgRaw(buildProtocolDeepLink(identifier));
  const code = input.protocolCode ?? identifier;
  const fields: LabelField[] = [
    { k: 'Fecha:', v: `${fmtYmd(input.ensayoDate)}${input.ensayoTime ? ` · ${input.ensayoTime}` : ''}` },
  ];
  const html = labelHtml({
    kind: 'ENSAYO', qrSvg, code,
    title: input.protocolNumber ?? null,   // nombre COMPLETO del ensayo
    fields, projectName: input.projectName,
  });
  await produceLabel(html, `Etiqueta_${code}`);
}
