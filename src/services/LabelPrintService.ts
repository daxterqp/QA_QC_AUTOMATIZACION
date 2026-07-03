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
  /** Responsable de la realización del ensayo (quien llenó). */
  filledByName?: string | null;
  /** Responsable de la aprobación (quien firmó). */
  approvedByName?: string | null;
  projectName: string;
}

const fmtYmd = (ymd?: string | null): string =>
  ymd && /^\d{4}-\d{2}-\d{2}$/.test(ymd) ? ymd.split('-').reverse().join('/') : (ymd ?? '—');

interface LabelField { k: string; v: string }

/** HTML de la etiqueta 50×50 con diseño de marca:
 *  ┌ marco redondeado ───────────────────────────┐
 *  │ [mark] FLOW · QA · QC           ‹MUESTRA›   │  lockup del logo (sin texto aparte)
 *  │ Nombre completo del                [ QR ]   │  QR SIN marco
 *  │ ensayo (izquierda)                 [ 18mm ] │
 *  │                                    CÓDIGO   │  código DEBAJO del QR
 *  │ campos a TODO lo ancho (fecha, responsables,│
 *  │ proyecto…)                                  │
 *  │ ── FLOW · QA · QC al pie ──                 │
 *  └─────────────────────────────────────────────┘
 *  Todo negro puro (térmica monocroma); tipografía embebida.
 *  NOTA: el logo SVG de marca viene con fill BLANCO (versión para fondos oscuros)
 *  → se fuerza a negro vía CSS. Cuando exista el "logo de etiquetas" por empresa
 *  (subible, formato alargado), el lockup del encabezado se reemplaza por esa
 *  imagen; el pie de marca FLOW · QA · QC se queda siempre.
 *  El frame va POSICIONADO (inset fijo) + overflow hidden en html/body para que
 *  el contenido JAMÁS desborde a una 2ª página del PDF. */
function labelHtml(args: { kind: 'MUESTRA' | 'ENSAYO'; qrSvg: string; code: string; title?: string | null; fields: LabelField[]; projectName: string }): string {
  const rows = args.fields.filter(f => f.v && f.v !== '—').map(f =>
    `<div class="fld"><span class="k">${escapeHtml(f.k)}</span> ${escapeHtml(f.v)}</div>`).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    @font-face { font-family: 'FlowGothic'; src: url(data:font/ttf;base64,${DIDACT_GOTHIC_B64}) format('truetype'); }
    @page { size: ${LABEL_PT}pt ${LABEL_PT}pt; margin: 0; }
    html, body { margin: 0; padding: 0; width: ${LABEL_PT}pt; height: ${LABEL_PT}pt; overflow: hidden; }
    body { font-family: 'Century Gothic', 'FlowGothic', sans-serif; color: #000; -webkit-print-color-adjust: exact; position: relative; }
    .frame { box-sizing: border-box; position: absolute; top: 3pt; left: 3pt; right: 3pt; bottom: 3pt;
             border: 1.4pt solid #000; border-radius: 7pt; padding: 4pt 6pt 3pt; display: flex; flex-direction: column; overflow: hidden; }
    .hdr { display: flex; align-items: center; gap: 4pt; padding-bottom: 2.5pt; flex-shrink: 0;
           border-bottom: 1.5pt solid #000; }
    .mark { width: 12pt; height: 12pt; flex-shrink: 0; }
    .mark svg { width: 12pt; height: 12pt; }
    .mark svg path, .mark svg g { fill: #000 !important; }
    .word { font-size: 6.4pt; font-weight: bold; letter-spacing: 1.6pt; white-space: nowrap; }
    .kind { margin-left: auto; font-size: 5.4pt; letter-spacing: 1.1pt; border: 0.8pt solid #000;
            border-radius: 2.5pt; padding: 1pt 3pt; font-weight: bold; flex-shrink: 0; }
    .mainrow { display: flex; gap: 5pt; padding-top: 3.5pt; flex-shrink: 0; }
    .left { flex: 1; min-width: 0; }
    .title { font-size: 7.4pt; line-height: 1.25; font-weight: bold;
             display: -webkit-box; -webkit-line-clamp: 5; -webkit-box-orient: vertical; overflow: hidden; }
    .right { flex-shrink: 0; width: 50pt; display: flex; flex-direction: column; align-items: center; }
    .right svg { width: 50pt; height: 50pt; display: block; }
    .qrcode { font-size: 6.4pt; font-weight: bold; letter-spacing: 0.3pt; text-align: center;
              margin-top: 1pt; word-break: break-all; line-height: 1.1; }
    .flds { flex: 1; min-height: 0; margin-top: 2.5pt; overflow: hidden; }
    .fld { font-size: 6.4pt; line-height: 1.4; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .fld .k { font-weight: bold; letter-spacing: 0.3pt; }
    .foot { flex-shrink: 0; border-top: 0.9pt solid #000; margin-top: 2pt; padding-top: 2pt; text-align: center;
            font-size: 5.6pt; font-weight: bold; letter-spacing: 1.5pt; white-space: nowrap; overflow: hidden; }
  </style></head><body><div class="frame">
    <div class="hdr">
      <div class="mark">${FLOW_LOGO_SVG}</div>
      <div class="word">FLOW &middot; QA &middot; QC</div>
      <div class="kind">${args.kind}</div>
    </div>
    <div class="mainrow">
      <div class="left">
        ${args.title ? `<div class="title">${escapeHtml(args.title)}</div>` : ''}
      </div>
      <div class="right">
        ${args.qrSvg}
        <div class="qrcode">${escapeHtml(args.code)}</div>
      </div>
    </div>
    <div class="flds">${rows}</div>
    <div class="foot">FLOW &middot; QA &middot; QC</div>
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
    { k: 'Lugar:', v: input.placeName && input.placeName !== '—' ? input.placeName : '—' },
    { k: 'Proyecto:', v: input.projectName },
  ];
  const html = labelHtml({
    kind: 'MUESTRA', qrSvg, code: input.sampleCode,
    // El material (+condición) hace de "título" a la izquierda del QR.
    title: [input.materialType, cond].filter(Boolean).join(' · ') || null,
    fields,
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
    { k: 'Realizó:', v: input.filledByName ?? '—' },
    { k: 'Aprobó:', v: input.approvedByName ?? '—' },
    { k: 'Proyecto:', v: input.projectName },
  ];
  const html = labelHtml({
    kind: 'ENSAYO', qrSvg, code,
    title: input.protocolNumber ?? null,   // nombre COMPLETO del ensayo
    fields, projectName: input.projectName,
  });
  await produceLabel(html, `Etiqueta_${code}`);
}
