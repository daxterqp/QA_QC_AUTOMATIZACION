/**
 * CalibrationReportService — Reporte rápido de calibración (#5b, móvil).
 *
 * Genera un PDF con los equipos de laboratorio y las tablas auxiliares del
 * proyecto, listando su última/próxima calibración y los días restantes
 * (mismo cálculo que el badge de la UI). Es un reporte de solo lectura: no
 * procesa cálculos de ensayos. Espejo de generateCalibrationReportPdf (web).
 */

import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system';

export interface CalibEquipInput {
  code: string | null;
  name: string | null;
  type: string | null;
  brand?: string | null;
  model?: string | null;
  lastCalibrationAt?: number | null;
  nextCalibrationAt?: number | null;
}
export interface CalibTableInput {
  groupKey: string;
  name: string | null;
  columnsCount: number;
  rowsCount: number;
  /** v43 — valores reales de la tabla para incluirlos en el reporte. */
  columns?: string[];
  rows?: string[][];
  lastCalibrationAt?: number | null;
  nextCalibrationAt?: number | null;
}

const pad = (n: number) => String(n).padStart(2, '0');
function fmtDate(ms: number | null | undefined): string {
  if (!ms) return '—';
  const d = new Date(ms);
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}
function fmtDateTime(ms: number): string {
  const d = new Date(ms);
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function esc(s: string | null | undefined): string {
  if (!s) return '';
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function status(ms: number | null | undefined): { text: string; bg: string; fg: string; order: number } {
  if (!ms) return { text: 'Sin fecha', bg: '#eceff3', fg: '#888', order: 3 };
  const days = Math.ceil((ms - Date.now()) / 86400000);
  if (days < 0)   return { text: `Vencida hace ${-days} día${-days === 1 ? '' : 's'}`, bg: '#fdecea', fg: '#d93025', order: 0 };
  if (days === 0) return { text: 'Vence hoy', bg: '#fdf0d5', fg: '#b8860b', order: 1 };
  if (days <= 30) return { text: `Faltan ${days} día${days === 1 ? '' : 's'}`, bg: '#fdf0d5', fg: '#b8860b', order: 2 };
  return { text: `Faltan ${days} días`, bg: '#e7f4ea', fg: '#1e8e3e', order: 4 };
}

function rowsHtml(items: { c1: string; c2: string; c3: string; last: number | null | undefined; next: number | null | undefined }[]): string {
  if (items.length === 0) return `<tr><td colspan="6" style="text-align:center;color:#aaa;font-style:italic;">Sin registros.</td></tr>`;
  const sorted = [...items].sort((a, b) => status(a.next).order - status(b.next).order);
  return sorted.map(it => {
    const st = status(it.next);
    return `<tr>
      <td><strong>${esc(it.c1)}</strong></td>
      <td>${esc(it.c2)}</td>
      <td>${esc(it.c3)}</td>
      <td>${fmtDate(it.last)}</td>
      <td>${fmtDate(it.next)}</td>
      <td><span class="badge" style="background:${st.bg};color:${st.fg};">${st.text}</span></td>
    </tr>`;
  }).join('');
}

export async function exportCalibrationReport(opts: {
  projectName: string;
  equipos: CalibEquipInput[];
  tablas: CalibTableInput[];
}): Promise<void> {
  const { projectName, equipos, tablas } = opts;
  const now = Date.now();
  const generatedAt = fmtDateTime(now);

  const allNext = [...equipos.map(e => e.nextCalibrationAt), ...tablas.map(t => t.nextCalibrationAt)];
  const vencidas = allNext.filter(ms => ms && Math.ceil((ms - Date.now()) / 86400000) < 0).length;
  const porVencer = allNext.filter(ms => { if (!ms) return false; const d = Math.ceil((ms - Date.now()) / 86400000); return d >= 0 && d <= 30; }).length;

  const equipBody = rowsHtml(equipos.map(e => ({
    c1: e.code ?? '—',
    c2: e.name ?? '—',
    c3: [e.type ? String(e.type).replace(/_/g, ' ') : '', e.brand ?? '', e.model ?? ''].filter(Boolean).join(' · ') || '—',
    last: e.lastCalibrationAt,
    next: e.nextCalibrationAt,
  })));
  const tablaBody = rowsHtml(tablas.map(t => ({
    c1: t.groupKey,
    c2: t.name ?? t.groupKey,
    c3: `${t.columnsCount} col · ${t.rowsCount} filas`,
    last: t.lastCalibrationAt,
    next: t.nextCalibrationAt,
  })));

  // v43 — Valores de cada tabla auxiliar (los datos calibrados de cada equipo),
  // manteniendo la estructura del reporte y agregando el detalle debajo.
  const tablaValues = tablas.map(t => {
    const cols = t.columns ?? [];
    const rows = t.rows ?? [];
    if (cols.length === 0 && rows.length === 0) return '';
    const head = `<tr>${cols.map(c => `<th>${esc(c)}</th>`).join('')}</tr>`;
    const body = rows.length === 0
      ? `<tr><td colspan="${Math.max(1, cols.length)}" style="text-align:center;color:#aaa;font-style:italic;">Sin valores.</td></tr>`
      : rows.map(r => `<tr>${(cols.length ? cols.map((_, i) => r[i] ?? '') : r).map(v => `<td>${esc(String(v))}</td>`).join('')}</tr>`).join('');
    return `<div class="sec">${esc(t.name ?? t.groupKey)} — valores (calib. ${fmtDate(t.lastCalibrationAt)})</div>
      <table><thead>${head}</thead><tbody>${body}</tbody></table>`;
  }).join('');

  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Helvetica, Arial, sans-serif; font-size: 11px; color: #1a1a2e; padding: 24px; }
    .title { font-size: 22px; font-weight: 900; color: #0e213d; text-transform: uppercase; letter-spacing: 1px; }
    .sub { font-size: 11px; color: #666; margin-top: 2px; }
    .info { display: flex; flex-wrap: wrap; gap: 8px; margin: 14px 0; }
    .info .cell { flex: 1; min-width: 120px; background: #f4f6f9; border-radius: 6px; padding: 7px 10px; }
    .info .lbl { font-size: 8px; font-weight: 700; color: #888; text-transform: uppercase; letter-spacing: .3px; }
    .info .val { font-size: 13px; font-weight: 700; color: #0e213d; margin-top: 1px; }
    .sec { background: #e8eef5; padding: 6px 10px; font-size: 11px; font-weight: 700; color: #1a4f7a; text-transform: uppercase; letter-spacing: .4px; border-radius: 4px; margin: 18px 0 6px; }
    table { width: 100%; border-collapse: collapse; font-size: 10px; }
    thead th { background: #0e213d; color: #fff; padding: 7px 8px; text-align: left; font-size: 9.5px; }
    tbody td { padding: 6px 8px; border-bottom: 1px solid #e5e8ec; vertical-align: top; }
    tbody tr:nth-child(even) { background: #f4f6f9; }
    .badge { display: inline-block; padding: 2px 7px; border-radius: 4px; font-size: 8.5px; font-weight: 700; white-space: nowrap; }
    .ft { margin-top: 24px; padding-top: 10px; border-top: 1px solid #ddd; text-align: right; font-size: 9px; color: #aaa; }
  </style></head><body>
    <div class="title">Reporte de Calibración</div>
    <div class="sub">${esc(projectName)} · ${esc(generatedAt)}</div>
    <div class="info">
      <div class="cell"><div class="lbl">Equipos de laboratorio</div><div class="val">${equipos.length}</div></div>
      <div class="cell"><div class="lbl">Tablas auxiliares</div><div class="val">${tablas.length}</div></div>
      <div class="cell"><div class="lbl">Vencidas</div><div class="val" style="color:${vencidas ? '#d93025' : '#1e8e3e'}">${vencidas}</div></div>
      <div class="cell"><div class="lbl">Por vencer (≤30 d)</div><div class="val" style="color:${porVencer ? '#b8860b' : '#1e8e3e'}">${porVencer}</div></div>
    </div>
    <div class="sec">Equipos de laboratorio</div>
    <table><thead><tr><th>Código</th><th>Equipo</th><th>Tipo / Marca</th><th>Última calib.</th><th>Próxima calib.</th><th>Estado</th></tr></thead>
    <tbody>${equipBody}</tbody></table>
    <div class="sec">Tablas auxiliares (grupos calibrables)</div>
    <table><thead><tr><th>Llave</th><th>Tabla</th><th>Contenido</th><th>Última calib.</th><th>Próxima calib.</th><th>Estado</th></tr></thead>
    <tbody>${tablaBody}</tbody></table>
    ${tablaValues}
    <div class="ft">Reporte de Calibración · ${esc(projectName)} · Generado el ${esc(generatedAt)}</div>
  </body></html>`;

  const { uri } = await Print.printToFileAsync({ html, base64: false });
  const safeName = projectName.replace(/[^a-zA-Z0-9áéíóúÁÉÍÓÚñÑüÜ\s]/g, '').trim().replace(/\s+/g, '_') || 'proyecto';
  const d = new Date();
  const dateStr = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const targetUri = `${FileSystem.documentDirectory}CALIBRACION-${safeName}-${dateStr}.pdf`;
  try { await FileSystem.deleteAsync(targetUri, { idempotent: true }); } catch { /* noop */ }
  await FileSystem.moveAsync({ from: uri, to: targetUri });

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(targetUri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf' });
  }
}
