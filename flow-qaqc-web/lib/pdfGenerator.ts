/**
 * pdfGenerator.ts — Web PDF generation
 *
 * Replicates DossierExportService.ts from the APK.
 * Uses the same HTML/CSS approach. Instead of expo-print it:
 *   1. Builds the HTML string (identical structure)
 *   2. Fetches images from S3 and embeds as base64 data URIs
 *   3. Opens a new window with the HTML and triggers window.print()
 *      → user selects "Save as PDF" from the browser print dialog
 */

import { createClient } from '@lib/supabase/client';
import type { DossierProtocolFull, DossierProtocol } from '@hooks/useDossier';
import type { Protocol, Location, ProtocolItem } from '@/types';
import { fetchDossierProtocolFull } from '@hooks/useDossier';

const supabase = createClient();

// ── Helpers ───────────────────────────────────────────────────────────────────

function pad(n: number) { return String(n).padStart(2, '0'); }

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}

function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function escHtml(s: string | null | undefined): string {
  if (!s) return '';
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

export function s3Url(key: string): string {
  const B = process.env.NEXT_PUBLIC_AWS_BUCKET;
  const R = process.env.NEXT_PUBLIC_AWS_REGION;
  return `https://${B}.s3.${R}.amazonaws.com/${key}`;
}

async function fetchToBase64(url: string): Promise<string | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const buf = await res.arrayBuffer();
    const bytes = new Uint8Array(buf);
    let binary = '';
    bytes.forEach(b => { binary += String.fromCharCode(b); });
    const b64 = btoa(binary);
    const ct = res.headers.get('content-type') ?? 'image/jpeg';
    return `data:${ct};base64,${b64}`;
  } catch { return null; }
}

// ── Week boundaries ───────────────────────────────────────────────────────────

function getWeekBoundaries(start: Date): Array<{ start: number; end: number }> {
  const now = Date.now();
  const day = start.getDay();
  const dToSun = day === 0 ? 0 : 7 - day;
  const w1End = new Date(start);
  w1End.setDate(start.getDate() + dToSun);
  w1End.setHours(23, 59, 59, 999);
  const weeks = [{ start: start.getTime(), end: w1End.getTime() }];
  let wkStart = new Date(w1End.getTime() + 1);
  wkStart.setHours(0, 0, 0, 0);
  while (wkStart.getTime() <= now) {
    const wkEnd = new Date(wkStart);
    wkEnd.setDate(wkStart.getDate() + 6);
    wkEnd.setHours(23, 59, 59, 999);
    weeks.push({ start: wkStart.getTime(), end: wkEnd.getTime() });
    wkStart = new Date(wkEnd.getTime() + 1);
    wkStart.setHours(0, 0, 0, 0);
  }
  return weeks;
}

// ── SVG charts ────────────────────────────────────────────────────────────────

function buildWeeklyChartSvg(protocols: Protocol[], projectStart: Date): string {
  const weeks = getWeekBoundaries(projectStart);
  const counts = weeks.map(({ start, end }) =>
    protocols.filter(p => {
      if (p.status !== 'APPROVED') return false;
      const ts = p.signed_at ? new Date(p.signed_at).getTime() : new Date(p.updated_at).getTime();
      return ts >= start && ts <= end;
    }).length
  );
  const display = counts.length > 20 ? counts.slice(-20) : counts;
  const offset  = counts.length > 20 ? counts.length - 20 : 0;
  const maxVal  = Math.max(...display, 1);
  const svgW = 680, svgH = 200, padL = 36, padR = 10, padT = 16, padB = 38;
  const chartW = svgW - padL - padR;
  const chartH = svgH - padT - padB;
  const n = display.length;
  const barW = Math.max(4, Math.floor((chartW / n) * 0.65));
  const gap   = Math.floor(chartW / n);
  let bars = '', xLabels = '';
  display.forEach((cnt, i) => {
    const x = padL + i * gap + Math.floor((gap - barW) / 2);
    const barH = cnt > 0 ? Math.max(4, Math.round((cnt / maxVal) * chartH)) : 2;
    const y = padT + chartH - barH;
    const weekNum = offset + i + 1;
    bars += `<rect x="${x}" y="${y}" width="${barW}" height="${barH}" fill="#1a4f7a" rx="3"/>`;
    if (cnt > 0) bars += `<text x="${x + barW / 2}" y="${y - 4}" text-anchor="middle" font-size="9" fill="#333" font-weight="700">${cnt}</text>`;
    if (n <= 16 || i % 2 === 0) xLabels += `<text x="${x + barW / 2}" y="${padT + chartH + 16}" text-anchor="middle" font-size="9" fill="#666">S${weekNum}</text>`;
  });
  let yLines = '';
  const steps = Math.min(maxVal, 5);
  for (let s = 0; s <= steps; s++) {
    const val = Math.round((maxVal / steps) * s);
    const y = padT + chartH - Math.round((val / maxVal) * chartH);
    yLines += `<line x1="${padL}" y1="${y}" x2="${padL + chartW}" y2="${y}" stroke="#e5e8ec" stroke-width="1"/>`;
    yLines += `<text x="${padL - 4}" y="${y + 3}" text-anchor="end" font-size="9" fill="#999">${val}</text>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${svgW}" height="${svgH}" viewBox="0 0 ${svgW} ${svgH}">
  <rect width="${svgW}" height="${svgH}" fill="white" rx="6"/>${yLines}${bars}${xLabels}
  <text x="${svgW/2}" y="${svgH - 4}" text-anchor="middle" font-size="10" fill="#888">Semana del proyecto</text>
</svg>`;
}

function buildSpecialtySvg(protocols: Protocol[], locations: Location[]): string {
  const locSpecMap: Record<string, string> = {};
  locations.forEach(l => { if (l.specialty) locSpecMap[l.id] = l.specialty; });
  const specTotals: Record<string, number> = {};
  locations.forEach(loc => {
    const sp = loc.specialty?.trim();
    if (!sp) return;
    const count = loc.template_ids ? loc.template_ids.split(',').filter(s => s.trim()).length : 0;
    if (count > 0) specTotals[sp] = (specTotals[sp] ?? 0) + count;
  });
  const specApproved: Record<string, number> = {};
  protocols.forEach(p => {
    if (!p.location_id) return;
    const sp = locSpecMap[p.location_id];
    if (!sp || p.status !== 'APPROVED') return;
    specApproved[sp] = (specApproved[sp] ?? 0) + 1;
  });
  const data = Object.entries(specTotals)
    .map(([name, total]) => ({ name, total, approved: specApproved[name] ?? 0 }))
    .sort((a, b) => b.total - a.total).slice(0, 12);
  if (data.length === 0) return '';
  const rowH = 32, labelW = 130, barAreaW = 480;
  const svgW = labelW + barAreaW + 60;
  const svgH = data.length * rowH + 40;
  const maxTotal = Math.max(...data.map(d => d.total), 1);
  let rows = '';
  data.forEach(({ name, total, approved }, i) => {
    const y = 20 + i * rowH;
    const totalBarW = Math.round((total / maxTotal) * barAreaW);
    const appBarW = total > 0 ? Math.round((approved / total) * totalBarW) : 0;
    const pct = total > 0 ? Math.round((approved / total) * 100) : 0;
    rows += `
<text x="${labelW - 6}" y="${y + 17}" text-anchor="end" font-size="10" fill="#333" font-weight="600">${escHtml(name)}</text>
<rect x="${labelW}" y="${y + 6}" width="${totalBarW}" height="18" fill="#c8d0db" rx="4"/>
${appBarW > 0 ? `<rect x="${labelW}" y="${y + 6}" width="${appBarW}" height="18" fill="#1e8e3e" rx="4"/>` : ''}
<text x="${labelW + totalBarW + 6}" y="${y + 18}" font-size="10" fill="#333" font-weight="700">${approved}/${total} (${pct}%)</text>`;
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${svgW}" height="${svgH}" viewBox="0 0 ${svgW} ${svgH}">
  <rect width="${svgW}" height="${svgH}" fill="white" rx="6"/>${rows}
</svg>`;
}

// ── Status helpers ────────────────────────────────────────────────────────────

function statusLabel(s: string): string {
  if (s === 'APPROVED') return 'APROBADO';
  if (s === 'REJECTED') return 'RECHAZADO';
  if (s === 'IN_PROGRESS') return 'EN REVISIÓN';
  if (s === 'IN_PROGRESS') return 'EN PROGRESO';
  return s;
}
function statusColor(s: string): string {
  if (s === 'APPROVED') return '#1e8e3e';
  if (s === 'REJECTED') return '#d93025';
  if (s === 'IN_PROGRESS') return '#e37400';
  return '#666';
}

// ── CSS ───────────────────────────────────────────────────────────────────────

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Montserrat:wght@400;600;700;900&display=swap');
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: 'Montserrat', Helvetica, Arial, sans-serif; font-size: 10.5px; color: #1a1a2e; background: white; }
h1 { font-size: 28px; font-weight: 900; letter-spacing: 1px; }
h2 { font-size: 16px; font-weight: 700; letter-spacing: 0.5px; margin-bottom: 10px; }
h3 { font-size: 12px; font-weight: 700; letter-spacing: 0.4px; margin-bottom: 6px; }
.page { page-break-before: always; padding: 32px 36px 150px 36px; min-height: 100vh; position: relative; }
.page:first-child { page-break-before: avoid; padding-bottom: 36px; }
.cover { display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 70vh; gap: 14px; text-align: center; }
.cover-logo { max-height: 240px; max-width: 520px; object-fit: contain; margin-bottom: 28px; }
.cover-title { font-size: 34px; font-weight: 900; color: #0e213d; letter-spacing: 2px; text-transform: uppercase; }
.cover-project { font-size: 18px; font-weight: 700; color: #1a4f7a; margin-top: 4px; }
.cover-date { font-size: 11px; color: #666; margin-top: 2px; }
.cover-divider { width: 80px; height: 3px; background: #1a4f7a; margin: 16px auto; border-radius: 2px; }
.cover-ornament { display: flex; align-items: center; gap: 14px; width: 78%; margin: 0 auto; }
.ornament-line { flex: 1; height: 2px; background: linear-gradient(to right, transparent, #1a4f7a 25%, #1a4f7a 75%, transparent); border-radius: 2px; }
.ornament-dots { color: #1a4f7a; font-size: 13px; letter-spacing: 8px; font-weight: 700; }
.cover-info-list { width: 72%; margin: 0 auto; display: flex; flex-direction: column; gap: 0; }
.cover-info-row { display: flex; flex-direction: row; align-items: flex-end; padding: 10px 0; border-bottom: 1px solid #c8d0db; }
.cover-info-label { font-size: 13px; font-weight: 700; color: #0e213d; min-width: 200px; }
.cover-info-value { flex: 1; font-size: 13px; font-weight: 600; color: #1a4f7a; padding-left: 8px; }
.cover-signature-img { max-height: 48px; max-width: 120px; object-fit: contain; display: block; margin: 0 auto; }
.chart-section { margin-bottom: 28px; }
.chart-title { font-size: 12px; font-weight: 700; color: #0e213d; letter-spacing: 0.5px; margin-bottom: 10px; padding-bottom: 6px; border-bottom: 1px solid #e5e8ec; }
.chart-container { background: #f8f9fc; border-radius: 8px; padding: 12px; overflow: hidden; }
.chart-container svg { display: block; max-width: 100%; }
.chart-legend { display: flex; flex-direction: row; gap: 16px; margin-top: 8px; }
.legend-item { display: flex; align-items: center; gap: 6px; font-size: 10px; color: #555; }
.legend-dot { width: 10px; height: 10px; border-radius: 50%; display: inline-block; }
table { width: 100%; border-collapse: collapse; font-size: 10px; }
thead th { background: #0e213d; color: white; padding: 8px 10px; font-weight: 700; text-align: left; font-size: 9.5px; letter-spacing: 0.3px; }
tbody tr:nth-child(even) { background: #f4f6f9; }
tbody td { padding: 7px 10px; border-bottom: 1px solid #e5e8ec; vertical-align: top; line-height: 1.4; }
.status-badge { display: inline-block; padding: 2px 7px; border-radius: 4px; font-size: 8.5px; font-weight: 700; color: white; text-transform: uppercase; letter-spacing: 0.3px; }
.td-compliant { color: #1e8e3e; font-weight: 700; font-size: 12px; }
.td-noncompliant { color: #d93025; font-weight: 700; font-size: 12px; }
.td-noanswer { color: #aaa; }
.proto-header { display: flex; flex-direction: row; align-items: center; margin-bottom: 16px; gap: 12px; border-bottom: 2px solid #0e213d; padding-bottom: 12px; }
.proto-logo { max-height: 56px; max-width: 100px; object-fit: contain; }
.proto-header-center { flex: 1; display: flex; align-items: center; justify-content: center; }
.proto-num { font-size: 10px; font-weight: 700; color: #1a4f7a; text-align: right; min-width: 80px; }
.proto-name { font-size: 18px; font-weight: 900; color: #0e213d; text-transform: uppercase; letter-spacing: 0.5px; text-align: center; }
.section-group-header { background: #e8eef5; padding: 5px 10px; font-size: 10px; font-weight: 700; color: #1a4f7a; text-transform: uppercase; letter-spacing: 0.4px; border-radius: 4px; margin: 8px 0 4px 0; }
.proto-info-grid { display: flex; flex-direction: column; gap: 4px; margin-bottom: 10px; }
.proto-info-row { display: flex; flex-direction: row; gap: 6px; }
.proto-info-cell { flex: 1; background: #f4f6f9; border-radius: 5px; padding: 5px 9px; display: flex; flex-direction: column; }
.proto-info-label { font-size: 8px; font-weight: 700; color: #888; text-transform: uppercase; letter-spacing: 0.3px; }
.proto-info-value { font-size: 10px; font-weight: 600; color: #1a1a2e; margin-top: 1px; }
.proto-divider { border: none; border-top: 2px solid #1a4f7a; margin: 10px 0; }
.proto-footer { position: absolute; bottom: 32px; left: 36px; right: 36px; border-top: 1px solid #ddd; padding-top: 12px; display: flex; flex-direction: row; align-items: flex-end; gap: 16px; }
.signature-block { text-align: center; }
.signature-img { max-height: 60px; max-width: 150px; object-fit: contain; display: block; margin-bottom: 4px; }
.signature-line { width: 160px; border-bottom: 1px solid #333; margin-bottom: 4px; }
.signature-name { font-size: 10px; font-weight: 700; color: #0e213d; }
.signature-role { font-size: 9px; color: #666; }
.footer-right { flex: 1; text-align: right; font-size: 9px; color: #aaa; line-height: 1.6; }
.photo-panel-title { flex: 1; font-size: 13px; font-weight: 900; color: #0e213d; text-transform: uppercase; letter-spacing: 0.5px; text-align: center; }
.photo-page-header { display: flex; flex-direction: row; align-items: center; gap: 12px; margin-bottom: 12px; padding-bottom: 10px; border-bottom: 2px solid #0e213d; }
.photo-grid-v { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 8px; }
.photo-cell-v { width: calc(25% - 6px); aspect-ratio: 3/4; overflow: hidden; border-radius: 4px; background: #f0f0f0; }
.photo-cell-v img { width: 100%; height: 100%; object-fit: cover; }
.photo-grid-h { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 8px; }
.photo-cell-h { width: calc(33.33% - 6px); aspect-ratio: 4/3; overflow: hidden; border-radius: 4px; background: #f0f0f0; }
.photo-cell-h img { width: 100%; height: 100%; object-fit: cover; }
@media print {
  .page { page-break-before: always; }
  .page:first-child { page-break-before: avoid; }
}
`;

// ── Cover page ────────────────────────────────────────────────────────────────

function buildCoverPage(
  projectName: string, logoB64: string | null, approved: number, total: number,
  generatedAt: string, signerName: string, signB64: string | null,
): string {
  const logoHtml = logoB64 ? `<img src="${logoB64}" class="cover-logo" alt="Logo"/>` : '';
  const signatureHtml = signB64
    ? `<img src="${signB64}" class="cover-signature-img" alt="Firma"/>`
    : '<div style="width:120px;border-bottom:1px solid #333;height:1px;"></div>';
  return `<div class="page">
  <div class="cover">
    ${logoHtml}
    <div class="cover-ornament"><span class="ornament-line"></span><span class="ornament-dots">◆ ◇ ◆</span><span class="ornament-line"></span></div>
    <div>
      <div class="cover-title">Dossier de Calidad</div>
      <div class="cover-date">Generado el ${generatedAt}</div>
    </div>
    <div class="cover-ornament"><span class="ornament-line"></span><span class="ornament-dots">◆ ◇ ◆</span><span class="ornament-line"></span></div>
    <div class="cover-divider"></div>
    <div class="cover-info-list">
      <div class="cover-info-row"><span class="cover-info-label">Proyecto</span><span class="cover-info-value">${escHtml(projectName)}</span></div>
      <div class="cover-info-row"><span class="cover-info-label">Total protocolos</span><span class="cover-info-value">${total}</span></div>
      <div class="cover-info-row"><span class="cover-info-label">Protocolos aprobados</span><span class="cover-info-value">${approved}</span></div>
      <div class="cover-info-row"><span class="cover-info-label">Jefe de calidad</span><span class="cover-info-value">${escHtml(signerName)}</span></div>
      <div class="cover-info-row" style="align-items:center;"><span class="cover-info-label">Firma</span><span class="cover-info-value">${signatureHtml}</span></div>
    </div>
  </div>
</div>`;
}

// ── Stats page ────────────────────────────────────────────────────────────────

function buildStatsPage(protocols: Protocol[], locations: Location[], projectStart: Date): string {
  const weeklySvg   = buildWeeklyChartSvg(protocols, projectStart);
  const specialtySvg = buildSpecialtySvg(protocols, locations);
  return `<div class="page">
  <h2 style="color:#0e213d;border-bottom:2px solid #1a4f7a;padding-bottom:8px;margin-bottom:20px;">RESUMEN ESTADÍSTICO</h2>
  <div class="chart-section">
    <div class="chart-title">Protocolos Aprobados por Semana</div>
    <div class="chart-container">${weeklySvg}</div>
    <div class="chart-legend"><div class="legend-item"><span class="legend-dot" style="background:#1a4f7a;"></span>Aprobados</div></div>
  </div>
  ${specialtySvg ? `<div class="chart-section">
    <div class="chart-title">Avance por Especialidad</div>
    <div class="chart-container">${specialtySvg}</div>
    <div class="chart-legend">
      <div class="legend-item"><span class="legend-dot" style="background:#1e8e3e;"></span>Aprobados</div>
      <div class="legend-item"><span class="legend-dot" style="background:#c8d0db;"></span>Pendientes</div>
    </div>
  </div>` : ''}
</div>`;
}

// ── Summary table ─────────────────────────────────────────────────────────────

function buildSummaryTable(protocols: DossierProtocol[]): string {
  const rows = protocols.map(p => `
<tr>
  <td><strong>${escHtml(p.protocol_number)}</strong></td>
  <td>${escHtml(p.location?.name ?? null)}</td>
  <td><span class="status-badge" style="background:${statusColor(p.status)}">${statusLabel(p.status)}</span></td>
  <td>${escHtml(p.filledByName)}</td>
  <td>${fmtDate(p.updated_at)}</td>
  <td>${escHtml(p.signedByName)}</td>
  <td>${fmtDate(p.signed_at)}</td>
</tr>`).join('');
  return `<div class="page">
  <h2 style="color:#0e213d;border-bottom:2px solid #1a4f7a;padding-bottom:8px;margin-bottom:16px;">TABLA RESUMEN DE PROTOCOLOS</h2>
  <table>
    <thead>
      <tr>
        <th>N° Protocolo</th><th>Ubicación</th><th>Estado</th>
        <th>Llenado por</th><th>Fecha realización</th>
        <th>Aprobado por</th><th>Fecha aprobación</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
</div>`;
}

// ── Protocol pages ────────────────────────────────────────────────────────────

const ROWS_PER_PAGE = 20;

function buildProtocolPages(
  full: DossierProtocolFull,
  logoB64: string | null,
  signB64: string | null,
  signerName: string,
  globalPageStart: number,
  totalDocPages: number,
  projectName: string,
): string {
  const { protocol: p, items } = full;
  const loc = p.location;
  const filledName = p.filledByName ?? '—';
  const signedName = p.signedByName ?? signerName;
  const sc = statusColor(p.status);
  const sl = statusLabel(p.status);
  const logoHtml = logoB64 ? `<img src="${logoB64}" class="proto-logo" alt="Logo"/>` : '<div style="min-width:80px;"></div>';
  const signatureHtml = signB64 ? `<img src="${signB64}" class="signature-img" alt="Firma"/>` : '<div class="signature-line"></div>';
  const today = fmtDate(new Date().toISOString());

  const headerHtml = `
  <div class="proto-header">
    ${logoHtml}
    <div class="proto-header-center"><div class="proto-name">${escHtml(p.protocol_number)}</div></div>
    <div class="proto-num"><span class="status-badge" style="background:${sc}">${sl}</span></div>
  </div>
  <div class="proto-info-grid">
    <div class="proto-info-row">
      <div class="proto-info-cell"><span class="proto-info-label">Proyecto</span><span class="proto-info-value">${escHtml(projectName)}</span></div>
      <div class="proto-info-cell"><span class="proto-info-label">Fecha</span><span class="proto-info-value">${today}</span></div>
    </div>
    <div class="proto-info-row">
      <div class="proto-info-cell"><span class="proto-info-label">Supervisor</span><span class="proto-info-value">${escHtml(filledName)}</span></div>
      <div class="proto-info-cell"><span class="proto-info-label">Fecha realización</span><span class="proto-info-value">${fmtDateTime(p.updated_at)}</span></div>
      <div class="proto-info-cell"><span class="proto-info-label">Fecha aprobación</span><span class="proto-info-value">${fmtDateTime(p.signed_at)}</span></div>
    </div>
    <div class="proto-info-row">
      <div class="proto-info-cell"><span class="proto-info-label">N° Protocolo</span><span class="proto-info-value">${escHtml(p.protocol_number)}</span></div>
      <div class="proto-info-cell"><span class="proto-info-label">Ubicación</span><span class="proto-info-value">${escHtml(loc?.name ?? null)}</span></div>
      <div class="proto-info-cell"><span class="proto-info-label">Especialidad</span><span class="proto-info-value">${escHtml(loc?.specialty ?? null)}</span></div>
    </div>
    ${p.observations ? `<div class="proto-info-row"><div class="proto-info-cell" style="background:#fce8e6;flex:1;"><span class="proto-info-label" style="color:#d93025;">Motivo rechazo</span><span class="proto-info-value" style="color:#d93025;">${escHtml(p.observations)}</span></div></div>` : ''}
  </div>
  <hr class="proto-divider"/>`;

  const chunks: ProtocolItem[][] = [];
  for (let i = 0; i < items.length; i += ROWS_PER_PAGE) chunks.push(items.slice(i, i + ROWS_PER_PAGE));
  if (chunks.length === 0) chunks.push([]);

  const hasMultipleSections = new Set(items.map(i => i.section?.trim() || 'General')).size > 1;

  return chunks.map((chunk, pageIdx) => {
    let rowNumber = pageIdx * ROWS_PER_PAGE + 1;
    let lastSection = '';
    let itemsHtml = '';
    for (const item of chunk) {
      const sec = item.section?.trim() || 'General';
      if (hasMultipleSections && sec !== lastSection) {
        lastSection = sec;
        itemsHtml += `<tr><td colspan="5" style="padding:0;"><div class="section-group-header">${escHtml(sec)}</div></td></tr>`;
      }
      let conformeHtml: string;
      if (item.status === 'PENDING') conformeHtml = `<span class="td-noanswer">—</span>`;
      else if (item.status === 'OK') conformeHtml = `<span class="td-compliant">✓</span>`;
      else if (item.status === 'NOK') conformeHtml = `<span class="td-noncompliant">✗</span>`;
      else conformeHtml = `<span style="color:#e37400;font-weight:700;font-size:10px;">OBS</span>`;
      itemsHtml += `<tr>
  <td style="width:36px;color:#1a4f7a;font-weight:700;text-align:center;">${rowNumber++}</td>
  <td>${escHtml(item.item_description)}</td>
  <td style="width:88px;color:#555;">${escHtml(item.validation_method)}</td>
  <td style="width:52px;text-align:center;">${conformeHtml}</td>
  <td style="width:140px;color:#555;font-size:9px;">${escHtml(item.observations)}</td>
</tr>`;
    }
    const continuacion = pageIdx > 0 ? ' <span style="font-size:9px;color:#888;font-weight:400;">(continuación)</span>' : '';
    return `<div class="page">
  ${headerHtml}
  ${pageIdx > 0 ? `<div style="font-size:9px;color:#888;margin-bottom:6px;">— Continuación de lista de ítems${continuacion} —</div>` : ''}
  <table>
    <thead><tr>
      <th style="width:36px;text-align:center;">#</th>
      <th>Descripción</th>
      <th style="width:88px;">Método</th>
      <th style="width:52px;text-align:center;">Conforme</th>
      <th style="width:140px;">Obs. levantada</th>
    </tr></thead>
    <tbody>${itemsHtml}</tbody>
  </table>
  <div class="proto-footer">
    <div class="signature-block">${signatureHtml}<div class="signature-name">${escHtml(signedName)}</div><div class="signature-role">Jefe de Calidad</div></div>
    <div class="footer-right">Dossier de Calidad<br/>Página ${globalPageStart + pageIdx} de ${totalDocPages}</div>
  </div>
</div>`;
  }).join('');
}

// ── Photo panel ───────────────────────────────────────────────────────────────

async function buildPhotoPanel(
  protocolName: string, evidenceUrls: string[],
  logoB64: string | null, signB64: string | null, signerName: string,
  pageNumber: number, totalDocPages: number,
): Promise<string> {
  if (evidenceUrls.length === 0) return '';
  const b64s = await Promise.all(evidenceUrls.map(url => fetchToBase64(url)));
  const valid = b64s.filter(Boolean) as string[];
  if (valid.length === 0) return '';

  // All photos treated as landscape (4/3) in web version for simplicity
  const HORIZ_PER_PAGE = 9;
  const chunks: string[][] = [];
  for (let i = 0; i < valid.length; i += HORIZ_PER_PAGE) chunks.push(valid.slice(i, i + HORIZ_PER_PAGE));

  const logoHtml = logoB64 ? `<img src="${logoB64}" class="proto-logo" alt="Logo"/>` : '<div style="min-width:80px;"></div>';
  const signatureHtml = signB64 ? `<img src="${signB64}" class="signature-img" alt="Firma"/>` : '<div class="signature-line"></div>';

  return chunks.map((chunk, idx) => {
    const horizHtml = `<div class="photo-grid-h">${chunk.map(b64 => `<div class="photo-cell-h"><img src="${b64}" /></div>`).join('')}</div>`;
    return `<div class="page">
  <div class="photo-page-header">${logoHtml}<div class="photo-panel-title">Panel Fotográfico — ${escHtml(protocolName)}</div></div>
  ${horizHtml}
  <div class="proto-footer">
    <div class="signature-block">${signatureHtml}<div class="signature-name">${escHtml(signerName)}</div><div class="signature-role">Jefe de Calidad</div></div>
    <div class="footer-right">Dossier de Calidad<br/>Página ${pageNumber + idx} de ${totalDocPages}</div>
  </div>
</div>`;
  }).join('');
}

// ── Open print window ─────────────────────────────────────────────────────────

function openPrintWindow(html: string): void {
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url  = URL.createObjectURL(blob);
  const win  = window.open(url, '_blank');
  if (win) {
    win.addEventListener('load', () => {
      setTimeout(() => {
        win.print();
        URL.revokeObjectURL(url);
      }, 400);
    });
  } else {
    // Fallback: download the HTML file
    const a = document.createElement('a');
    a.href = url;
    a.download = 'dossier.html';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

export interface DossierExportOptions {
  projectId: string;
  projectName: string;
  signerName: string;
  signerUserId: string;
  logoS3Key?: string | null;
  protocols: DossierProtocol[];
  locations: Location[];
  onProgress?: (msg: string) => void;
}

export async function exportFullDossier(opts: DossierExportOptions): Promise<void> {
  const { projectId, projectName, signerName, signerUserId, logoS3Key, protocols, locations, onProgress } = opts;

  onProgress?.('Cargando imágenes...');

  // Load logo + signer signature
  const [logoB64, signB64] = await Promise.all([
    logoS3Key ? fetchToBase64(s3Url(logoS3Key)) : Promise.resolve(null),
    fetchToBase64(s3Url(`signatures/${signerUserId}/signature.jpg`)),
  ]);

  onProgress?.('Cargando datos de protocolos...');

  // Build user map + location map from protocols already loaded
  const userMap: Record<string, string> = {};
  const locMap: Record<string, Location> = {};
  protocols.forEach(p => {
    if (p.filledByName && p.created_by_id) userMap[p.created_by_id] = p.filledByName;
    if (p.signedByName && p.signed_by_id)  userMap[p.signed_by_id]  = p.signedByName;
    if (p.location && p.location_id) locMap[p.location_id] = p.location;
  });

  // Load full data for each protocol
  const fullData: DossierProtocolFull[] = [];
  for (let i = 0; i < protocols.length; i++) {
    onProgress?.(`Cargando protocolo ${i + 1}/${protocols.length}...`);
    const d = await fetchDossierProtocolFull(protocols[i].id, locMap, userMap);
    fullData.push(d);
  }

  onProgress?.('Generando PDF...');

  const project = await supabase.from('projects').select('created_at').eq('id', projectId).single();
  const projectStart = project.data?.created_at ? new Date(project.data.created_at) : new Date();

  const generatedAt = fmtDateTime(new Date().toISOString());
  const approved = protocols.filter(p => p.status === 'APPROVED').length;
  const total    = protocols.length;

  const coverHtml = buildCoverPage(projectName, logoB64, approved, total, generatedAt, signerName, signB64);
  const statsHtml = buildStatsPage(protocols, locations, projectStart);
  const summaryHtml = buildSummaryTable(protocols);

  // Estimate total pages for numbering
  let globalPage = 4; // cover + stats + summary + buffer
  const protocolHtmlParts: string[] = [];
  const photoParts: string[] = [];

  for (const full of fullData) {
    const chunks = Math.ceil(full.items.length / ROWS_PER_PAGE) || 1;
    const pHtml = buildProtocolPages(full, logoB64, signB64, signerName, globalPage, 999, projectName);
    protocolHtmlParts.push(pHtml);
    globalPage += chunks;

    const evidenceUrls = full.evidences.map(ev => ev.s3_key ? s3Url(ev.s3_key) : null).filter(Boolean) as string[];
    if (evidenceUrls.length > 0) {
      onProgress?.(`Panel fotográfico ${full.protocol.protocol_number}...`);
      const photoHtml = await buildPhotoPanel(
        full.protocol.protocol_number ?? full.protocol.id,
        evidenceUrls, logoB64, signB64, signerName, globalPage, 999,
      );
      photoParts.push(photoHtml);
      globalPage += Math.ceil(evidenceUrls.length / 9) || 1;
    }
  }

  const bodyHtml = [coverHtml, statsHtml, summaryHtml, ...protocolHtmlParts, ...photoParts].join('\n');
  const html = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8">
<title>Dossier — ${escHtml(projectName)}</title>
<style>${CSS}</style>
</head><body>${bodyHtml}</body></html>`;

  openPrintWindow(html);
}

export async function exportSingleProtocolPdf(
  protocolId: string,
  projectName: string,
  signerName: string,
  signerUserId: string,
  logoS3Key: string | null,
  locMap: Record<string, Location>,
  userMap: Record<string, string>,
): Promise<void> {
  const [logoB64, signB64] = await Promise.all([
    logoS3Key ? fetchToBase64(s3Url(logoS3Key)) : Promise.resolve(null),
    fetchToBase64(s3Url(`signatures/${signerUserId}/signature.jpg`)),
  ]);

  const full = await fetchDossierProtocolFull(protocolId, locMap, userMap);
  const evidenceUrls = full.evidences.map(ev => ev.s3_key ? s3Url(ev.s3_key) : null).filter(Boolean) as string[];

  const chunks = Math.ceil(full.items.length / ROWS_PER_PAGE) || 1;
  const totalDocPages = chunks + (evidenceUrls.length > 0 ? Math.ceil(evidenceUrls.length / 9) : 0);

  const protoHtml = buildProtocolPages(full, logoB64, signB64, signerName, 1, totalDocPages, projectName);
  const photoHtml = evidenceUrls.length > 0
    ? await buildPhotoPanel(full.protocol.protocol_number ?? protocolId, evidenceUrls, logoB64, signB64, signerName, chunks + 1, totalDocPages)
    : '';

  const html = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8">
<title>${escHtml(full.protocol.protocol_number ?? protocolId)}</title>
<style>${CSS}</style>
</head><body>${protoHtml}${photoHtml}</body></html>`;

  openPrintWindow(html);
}
