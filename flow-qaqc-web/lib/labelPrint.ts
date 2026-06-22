/**
 * labelPrint.ts — Generación de etiquetas para impresoras térmicas (FASE 7+).
 *
 * Este módulo PRODUCE el payload estructurado y los strings de comandos para
 * etiquetadoras. NO se ata a un SDK concreto (Brother, Zebra, NIIMBOT, TSC).
 * Cuando elijas un printer, conectas su SDK Bluetooth/WiFi/USB y le pasas el
 * string ZPL o TSPL generado aquí — o, en casos donde solo acepte imagen, el
 * HTML preview rasterizado a PNG.
 *
 * ## Formatos soportados (output)
 *  - HTML: preview en pantalla, también imprimible con `window.print()`.
 *           Compatible con cualquier impresora vía PDF/imagen.
 *  - ZPL:  comandos Zebra Programming Language. Compatible con Zebra (GK420t,
 *           ZD220, etc) y algunas Brother (QL-820NWB con módulo ZPL).
 *  - TSPL: comandos TSC/Phomemo/algunas NIIMBOT. Sintaxis más simple que ZPL.
 *
 * ## Tamaños comunes en mm
 *   40×30   — recomendado para muestras pequeñas (tubos, viales)
 *   50×30   — equilibrio descripción/QR (etiqueta clásica de probeta)
 *   50×40   — más espacio para campos adicionales
 *   60×40   — etiquetas grandes para equipos / contenedores
 *
 * ## DPI (densidad)
 *   203 DPI (8 dots/mm) es el estándar de las impresoras térmicas de etiquetas.
 *   300 DPI existe pero es menos común; basta multiplicar por 11.81 en lugar de 8.
 *
 * ## Flujo recomendado en producción
 *   1. `buildLabelPayload(...)` con datos del protocolo.
 *   2. Escoger formato:
 *      - `toZPL(payload, LABEL_SIZES['50x30'])` → enviar como ASCII raw socket.
 *      - `toTSPL(...)` → mismo flow.
 *      - `toLabelHtml(...)` → render preview / fallback browser print.
 *   3. Enviar al printer via su SDK (puerto 9100 TCP es típico para Zebra WiFi).
 */

import { renderQrSvg } from './qrCodeGenerator';

// ─── Payload ─────────────────────────────────────────────────────────────────

export interface LabelPayload {
  /** Identificador legible que se imprime grande arriba. Suele ser el QR identifier. */
  sampleId: string;
  /** Nombre del protocolo / muestra ("Resistencia compresión RC-001"). */
  protocolName: string;
  /** Proyecto. */
  projectName: string;
  /** Ubicación legible ("Sector 3 — Cimentación"). */
  location: string;
  /** Fecha formateada "dd/mm/yyyy" (la fecha de impresión o de muestreo según contexto). */
  date: string;
  /** Deep-link `flow://protocol/...` — lo que va dentro del QR. */
  qrDeepLink: string;
  /** Campos extra clave-valor que se imprimen como líneas adicionales (opcional). */
  customFields?: { label: string; value: string }[];
}

export interface LabelSize {
  widthMm: number;
  heightMm: number;
  /** Densidad de impresión. Default 203 DPI (8 dots/mm) — estándar térmico. */
  dpi?: number;
}

/** Tamaños presets. Agrega los que use tu impresora. */
export const LABEL_SIZES: Record<string, LabelSize> = {
  '40x30': { widthMm: 40, heightMm: 30 },
  '50x30': { widthMm: 50, heightMm: 30 },
  '50x40': { widthMm: 50, heightMm: 40 },
  '60x40': { widthMm: 60, heightMm: 40 },
  '80x50': { widthMm: 80, heightMm: 50 },
};

/** Densidad por defecto en dots por mm (203 DPI / 25.4). */
const DEFAULT_DOTS_PER_MM = 8;

function dotsPerMm(size: LabelSize): number {
  if (!size.dpi || size.dpi === 203) return DEFAULT_DOTS_PER_MM;
  return size.dpi / 25.4;
}

function mmToDots(mm: number, size: LabelSize): number {
  return Math.round(mm * dotsPerMm(size));
}

// ─── ZPL (Zebra) ─────────────────────────────────────────────────────────────

/** Genera comandos ZPL para imprimir UNA etiqueta. Enviar este string ASCII al
 *  printer (TCP 9100, Bluetooth SPP, USB) — funciona idéntico en Zebra GK/GX/ZD.
 *
 *  Comandos clave usados:
 *   - `^XA` / `^XZ`           — inicio/fin del format
 *   - `^PW<width>`            — ancho de la etiqueta en dots
 *   - `^LL<length>`           — largo en dots
 *   - `^CI28`                 — encoding UTF-8 (acentos)
 *   - `^FO<x>,<y>`            — posición del siguiente field (top-left)
 *   - `^A0N,<h>,<w>`          — fuente escalable scalable
 *   - `^FD<texto>^FS`         — el texto a imprimir
 *   - `^BQN,2,<magnify>`      — QR Code, error correction M, factor de escala
 *   - `^FDLA,<data>^FS`       — payload del QR (LA = modo alfanumérico)
 */
export function toZPL(payload: LabelPayload, size: LabelSize = LABEL_SIZES['50x30']): string {
  const PW = mmToDots(size.widthMm, size);
  const LL = mmToDots(size.heightMm, size);

  // Layout: texto a la izquierda, QR a la derecha.
  // QR ocupa ~heightMm-4 mm cuadrados; el factor de magnify lo regula.
  const qrSizeMm = Math.min(size.heightMm - 4, 24);
  const qrMag = Math.max(2, Math.round(qrSizeMm / 5)); // ~5mm por nivel de magnify en QR
  const qrX = PW - mmToDots(qrSizeMm + 2, size);
  const qrY = mmToDots(2, size);

  const textX = mmToDots(2, size);
  let cursorY = mmToDots(2, size);
  const lineHeight = mmToDots(4, size);

  const lines: string[] = [];
  // Sample ID (grande, bold)
  lines.push(`^FO${textX},${cursorY}^A0N,${mmToDots(4, size)},${mmToDots(4, size)}^FD${zplEscape(payload.sampleId)}^FS`);
  cursorY += lineHeight + 2;
  // Fecha
  lines.push(`^FO${textX},${cursorY}^A0N,${mmToDots(3, size)},${mmToDots(3, size)}^FD${zplEscape(payload.date)}^FS`);
  cursorY += lineHeight;
  // Ubicación (truncar si excede)
  lines.push(`^FO${textX},${cursorY}^A0N,${mmToDots(3, size)},${mmToDots(3, size)}^FD${zplEscape(truncate(payload.location, 30))}^FS`);
  cursorY += lineHeight;
  // Campos custom (hasta caber)
  for (const f of payload.customFields ?? []) {
    if (cursorY > LL - lineHeight) break;
    lines.push(`^FO${textX},${cursorY}^A0N,${mmToDots(2.5, size)},${mmToDots(2.5, size)}^FD${zplEscape(f.label + ': ' + truncate(f.value, 20))}^FS`);
    cursorY += lineHeight - 1;
  }

  // QR
  lines.push(`^FO${qrX},${qrY}^BQN,2,${qrMag}^FDLA,${zplEscape(payload.qrDeepLink)}^FS`);

  return [
    '^XA',
    '^CI28',          // UTF-8
    `^PW${PW}`,
    `^LL${LL}`,
    ...lines,
    '^XZ',
  ].join('\n');
}

/** ZPL escape: caracteres `^` y `~` son comando — escaparlos con `\5E` / `\7E` */
function zplEscape(s: string): string {
  return s.replace(/\^/g, '\\5E').replace(/~/g, '\\7E');
}

// ─── TSPL (TSC, Phomemo, NIIMBOT compat) ─────────────────────────────────────

/** Genera comandos TSPL para imprimir UNA etiqueta. Sintaxis más simple que ZPL.
 *
 *  Comandos clave:
 *   - `SIZE <w> mm,<h> mm`     — tamaño del label
 *   - `GAP 2 mm,0 mm`          — separación entre etiquetas (gap-mode)
 *   - `CLS`                    — clear buffer
 *   - `TEXT x,y,"font",rot,xscale,yscale,"texto"`
 *   - `QRCODE x,y,ECC,cell,mode,rotation,"data"`
 *   - `PRINT 1`                — imprimir 1 copia
 */
export function toTSPL(payload: LabelPayload, size: LabelSize = LABEL_SIZES['50x30']): string {
  const W = size.widthMm;
  const H = size.heightMm;

  // En TSPL el origen (0,0) es top-left; X/Y se especifican en dots si NO usas
  // SET UNIT, pero con SIZE en mm la mayoría de impresoras aceptan TEXT/QRCODE
  // en dots — usamos dots (8/mm) para precisión.
  const dpm = DEFAULT_DOTS_PER_MM;
  const Wd = Math.round(W * dpm);
  const Hd = Math.round(H * dpm);

  const qrSizeMm = Math.min(H - 4, 24);
  const qrCell = Math.max(3, Math.round(qrSizeMm / 5));
  const qrX = Wd - Math.round((qrSizeMm + 2) * dpm);
  const qrY = Math.round(2 * dpm);

  const textX = Math.round(2 * dpm);
  let cursorY = Math.round(2 * dpm);
  const lineHeight = Math.round(4 * dpm);

  const lines: string[] = [];
  lines.push(`TEXT ${textX},${cursorY},"3",0,1,1,"${tsplEscape(payload.sampleId)}"`);
  cursorY += lineHeight + 4;
  lines.push(`TEXT ${textX},${cursorY},"2",0,1,1,"${tsplEscape(payload.date)}"`);
  cursorY += lineHeight;
  lines.push(`TEXT ${textX},${cursorY},"2",0,1,1,"${tsplEscape(truncate(payload.location, 30))}"`);
  cursorY += lineHeight;
  for (const f of payload.customFields ?? []) {
    if (cursorY > Hd - lineHeight) break;
    lines.push(`TEXT ${textX},${cursorY},"1",0,1,1,"${tsplEscape(f.label + ': ' + truncate(f.value, 20))}"`);
    cursorY += lineHeight - 4;
  }

  lines.push(`QRCODE ${qrX},${qrY},M,${qrCell},A,0,"${tsplEscape(payload.qrDeepLink)}"`);

  return [
    `SIZE ${W} mm,${H} mm`,
    'GAP 2 mm,0 mm',
    'DENSITY 8',
    'SPEED 4',
    'CLS',
    ...lines,
    'PRINT 1',
  ].join('\n');
}

/** TSPL escape: comillas dobles deben escaparse o cambiarse por ' */
function tsplEscape(s: string): string {
  return s.replace(/"/g, '\\"');
}

// ─── HTML preview / fallback browser print ──────────────────────────────────

/** HTML self-contained para preview en pantalla o impresión vía browser.
 *  Incluye el QR como SVG inline. Si la impresora no acepta ZPL/TSPL, se puede
 *  usar window.print() y elegir la impresora como "imprimir imagen". */
export async function toLabelHtml(payload: LabelPayload, size: LabelSize = LABEL_SIZES['50x30']): Promise<string> {
  const qrSvg = await renderQrSvg(payload.qrDeepLink, { size: Math.round(size.heightMm * 4), margin: 1 });
  const extras = (payload.customFields ?? [])
    .map(f => `<div class="extra"><b>${escHtml(f.label)}:</b> ${escHtml(f.value)}</div>`)
    .join('');
  return `<!doctype html><html><head><meta charset="utf-8"><title>Etiqueta ${escHtml(payload.sampleId)}</title>
  <style>
    @page { size: ${size.widthMm}mm ${size.heightMm}mm; margin: 0; }
    html, body { margin: 0; padding: 0; }
    .label {
      width: ${size.widthMm}mm; height: ${size.heightMm}mm;
      padding: 2mm; box-sizing: border-box;
      display: flex; gap: 2mm; align-items: stretch;
      font-family: -apple-system, system-ui, sans-serif;
      color: #000;
    }
    .text { flex: 1; display: flex; flex-direction: column; min-width: 0; }
    .id { font-size: 11pt; font-weight: 800; line-height: 1.1; word-break: break-all; }
    .date { font-size: 9pt; margin-top: 1mm; }
    .loc { font-size: 8pt; color: #333; }
    .extra { font-size: 7pt; color: #444; margin-top: 0.5mm; }
    .qr { display: flex; align-items: center; }
    .qr svg { width: ${Math.min(size.heightMm - 4, 24)}mm; height: ${Math.min(size.heightMm - 4, 24)}mm; }
  </style></head><body>
    <div class="label">
      <div class="text">
        <div class="id">${escHtml(payload.sampleId)}</div>
        <div class="date">${escHtml(payload.date)}</div>
        <div class="loc">${escHtml(payload.location)}</div>
        ${extras}
      </div>
      <div class="qr">${qrSvg}</div>
    </div>
    <script>window.onload = () => setTimeout(() => window.print(), 100);</script>
  </body></html>`;
}

function escHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ─── Utils ───────────────────────────────────────────────────────────────────

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1) + '…';
}

/** Construye un LabelPayload desde los datos de un protocolo. */
export function buildLabelPayload(args: {
  qrIdentifier: string;
  qrDeepLink: string;
  protocolName: string;
  projectName: string;
  locationName: string | null;
  specialty: string | null;
  date?: string;
  customFields?: { label: string; value: string }[];
}): LabelPayload {
  const d = args.date ?? formatToday();
  const location = [args.locationName, args.specialty].filter(Boolean).join(' — ') || '—';
  return {
    sampleId: args.qrIdentifier,
    protocolName: args.protocolName,
    projectName: args.projectName,
    location,
    date: d,
    qrDeepLink: args.qrDeepLink,
    customFields: args.customFields,
  };
}

function formatToday(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}
