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
import type { PreloadedProjectData } from '@hooks/useProjectPreload';
import type { Protocol, Location, ProtocolItem } from '@/types';
import { fetchDossierProtocolFull } from '@hooks/useDossier';
import { parseNumericItem, parseNumericRow, extractHeaderRows, extractMatrices, splitRowComments, scopeKeyFor, colLetter, inRange, deriveAxisTitles, isNumericProtocol } from '@lib/numericProtocol';
import { resolveScopeCells, type ScopeCell, type XrefValues, type AuxTables } from '@lib/formulaEval';
import { renderChartSvg } from '@lib/chartRenderer';
import { buildNumericProtocolBlocks, paginateNumericBlocks, type NumericPdfBlock } from '@lib/numericPdfHtml';
import {
  getTemplatePrintConfig, getPrintHeaderColor, chartWidthFor,
  PRINT_FONT_SCALE, PRINT_HEADER_ROWS, PRINT_HEADER_FIELDS, DEFAULT_HEADER_COLOR,
  type ResolvedPrintConfig,
} from '@lib/printConfig';
import { buildCroquisFigureHtml, type CroquisSectorIn, type CroquisOrtho } from '@lib/croquisHtml';

const supabase = createClient();

// ── Helpers ───────────────────────────────────────────────────────────────────

function pad(n: number) { return String(n).padStart(2, '0'); }

function toPeruDate(iso: string | number | null | undefined): Date {
  const d = new Date(iso as string | number);
  // Convert to Peru timezone (UTC-5)
  return new Date(d.toLocaleString('en-US', { timeZone: 'America/Lima' }));
}

function fmtDate(iso: string | number | null | undefined): string {
  if (!iso) return '—';
  const d = toPeruDate(iso);
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}

function fmtDateTime(iso: string | number | null | undefined): string {
  if (!iso) return '—';
  const d = toPeruDate(iso);
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

async function fetchToBase64(url: string, s3Key?: string | null): Promise<string | null> {
  // In Electron: try local file first
  const electronAPI = (window as any).electronAPI;
  if (electronAPI?.checkLocalFile && s3Key) {
    try {
      const localPath = await electronAPI.checkLocalFile(s3Key);
      if (localPath) {
        const res = await fetch(`file:///${localPath.replace(/\\/g, '/')}`);
        if (res.ok) {
          const buf = await res.arrayBuffer();
          const bytes = new Uint8Array(buf);
          let binary = '';
          bytes.forEach(b => { binary += String.fromCharCode(b); });
          console.log(`[PDF] LOCAL OK: ${s3Key}`);
          return `data:image/jpeg;base64,${btoa(binary)}`;
        }
        console.warn(`[PDF] LOCAL FAIL (fetch): ${localPath}`);
      }
    } catch (e) { console.warn(`[PDF] LOCAL ERROR: ${s3Key}`, e); }
  }

  // Fallback: download via API proxy (S3 direct access is forbidden)
  try {
    const proxyUrl = s3Key
      ? `/api/s3-image?key=${encodeURIComponent(s3Key)}`
      : url;
    const res = await fetch(proxyUrl);
    if (!res.ok) { console.warn(`[PDF] S3 FAIL (${res.status}): ${s3Key ?? url}`); return null; }
    const buf = await res.arrayBuffer();
    const bytes = new Uint8Array(buf);
    let binary = '';
    bytes.forEach(b => { binary += String.fromCharCode(b); });
    const b64 = btoa(binary);
    const ct = res.headers.get('content-type') ?? 'image/jpeg';

    // In Electron: save to local disk for next time
    if (electronAPI?.saveLocalFile && s3Key) {
      electronAPI.saveLocalFile(s3Key, buf).catch(() => {});
    }

    console.log(`[PDF] S3 OK: ${s3Key ?? url}`);
    return `data:${ct};base64,${b64}`;
  } catch (e) { console.warn(`[PDF] S3 ERROR: ${s3Key ?? url}`, e); return null; }
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
  if (s === 'APPROVED')  return 'APROBADO';
  if (s === 'REJECTED')  return 'RECHAZADO';
  if (s === 'SUBMITTED') return 'EN REVISIÓN';
  if (s === 'DRAFT')     return 'BORRADOR';
  return s;
}
function statusColor(s: string): string {
  if (s === 'APPROVED')  return '#1e8e3e';
  if (s === 'REJECTED')  return '#d93025';
  if (s === 'SUBMITTED') return '#1a4f7a';
  return '#666';
}

// ── CSS ───────────────────────────────────────────────────────────────────────

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Montserrat:wght@400;600;700;900&display=swap');
* { box-sizing: border-box; margin: 0; padding: 0; }
@page { size: A4 portrait; margin: 0; }
body { font-family: 'Montserrat', Helvetica, Arial, sans-serif; font-size: 10.5px; color: #1a1a2e; background: #e0e0e0; }
h1 { font-size: 28px; font-weight: 900; letter-spacing: 1px; }
h2 { font-size: 16px; font-weight: 700; letter-spacing: 0.5px; margin-bottom: 10px; }
h3 { font-size: 12px; font-weight: 700; letter-spacing: 0.4px; margin-bottom: 6px; }
.page { page-break-before: always; padding: 32px 36px 150px 36px; width: 210mm; min-height: 297mm; position: relative; background: white; margin: 0 auto 16px auto; box-shadow: 0 2px 10px rgba(0,0,0,0.12); }
.page:first-child { page-break-before: avoid; }
.page-cover { padding-bottom: 36px; }
.cover { display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: calc(297mm - 72px); gap: 14px; text-align: center; }
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
.status-badge { display: inline-block; padding: 2px 7px; border-radius: 4px; font-size: 8.5px; font-weight: 700; color: white; text-transform: uppercase; letter-spacing: 0.3px; white-space: nowrap; }
.td-compliant { color: #1e8e3e; font-weight: 700; font-size: 12px; }
.td-noncompliant { color: #d93025; font-weight: 700; font-size: 12px; }
.td-noanswer { color: #aaa; }
.proto-header { display: flex; flex-direction: row; align-items: center; margin-bottom: 9px; gap: 12px; border-bottom: 2px solid #0e213d; padding-bottom: 7px; }
.proto-logo { max-height: 56px; max-width: 100px; object-fit: contain; }
.proto-header-center { flex: 1; display: flex; align-items: center; justify-content: center; }
.proto-num { font-size: 10px; font-weight: 700; color: #1a4f7a; text-align: right; min-width: 80px; }
.proto-name { font-size: 18px; font-weight: 900; color: #0e213d; text-transform: uppercase; letter-spacing: 0.5px; text-align: center; }
.section-group-header { background: #e8eef5; padding: 5px 10px; font-size: 10px; font-weight: 700; color: #1a4f7a; text-transform: uppercase; letter-spacing: 0.4px; border-radius: 4px; margin: 8px 0 4px 0; }
.proto-info-grid { display: flex; flex-direction: column; gap: 4px; margin-bottom: 5px; }
.proto-info-row { display: flex; flex-direction: row; gap: 6px; }
.proto-info-cell { flex: 1; background: #f4f6f9; border-radius: 5px; padding: 5px 9px; display: flex; flex-direction: column; }
.proto-info-label { font-size: 8px; font-weight: 700; color: #888; text-transform: uppercase; letter-spacing: 0.3px; }
.proto-info-value { font-size: 10px; font-weight: 600; color: #1a1a2e; margin-top: 1px; }
.proto-info-compact .proto-info-row { gap: 3px; }
.proto-info-compact .proto-info-cell { padding: 2px 6px; border-radius: 3px; }
.proto-info-compact .proto-info-label { font-size: 6.5px; }
.proto-info-compact .proto-info-value { font-size: 8.5px; margin-top: 0; }
.proto-divider { border: none; border-top: 2px solid #1a4f7a; margin: 5px 0; }
.proto-footer { position: absolute; bottom: 32px; left: 36px; right: 36px; border-top: 1px solid #ddd; padding-top: 12px; display: flex; flex-direction: row; align-items: flex-end; gap: 16px; }
.signature-block { text-align: center; }
.signature-img { max-height: 60px; max-width: 150px; object-fit: contain; display: block; margin-bottom: 4px; }
.signature-line { width: 160px; border-bottom: 1px solid #333; margin-bottom: 4px; }
.signature-name { font-size: 10px; font-weight: 700; color: #0e213d; }
.signature-role { font-size: 9px; color: #666; }
.footer-right { flex: 1; text-align: right; font-size: 9px; color: #aaa; line-height: 1.6; }
a[href^="#proto-"]:hover { text-decoration: underline !important; }
.photo-panel-title { flex: 1; font-size: 13px; font-weight: 900; color: #0e213d; text-transform: uppercase; letter-spacing: 0.5px; text-align: center; }
.photo-page-header { display: flex; flex-direction: row; align-items: center; gap: 12px; margin-bottom: 12px; padding-bottom: 10px; border-bottom: 2px solid #0e213d; }
.photo-grid-v { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 8px; }
.photo-cell-v { width: calc(25% - 6px); aspect-ratio: 3/4; overflow: hidden; border-radius: 4px; background: #f0f0f0; }
.photo-cell-v img { width: 100%; height: 100%; object-fit: cover; }
.photo-grid-h { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 8px; }
.photo-cell-h { width: calc(33.33% - 6px); aspect-ratio: 4/3; overflow: hidden; border-radius: 4px; background: #f0f0f0; }
.photo-cell-h img { width: 100%; height: 100%; object-fit: cover; }
@media print {
  body { background: white; }
  .page { page-break-before: always; margin: 0; box-shadow: none; width: 100%; }
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
  return `<div class="page page-cover">
  <div class="cover">
    ${logoHtml}
    <div class="cover-ornament"><span class="ornament-line"></span><span class="ornament-dots">◆ ◇ ◆</span><span class="ornament-line"></span></div>
    <div>
      <div class="cover-title">Dosier de Calidad</div>
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

// ── Section cover page (per location_only group) ─────────────────────────────

function buildSectionCoverPage(
  locationOnly: string,
  logoB64: string | null,
  projectName: string,
  totalInGroup: number,
  approvedInGroup: number,
): string {
  const logoHtml = logoB64 ? `<img src="${logoB64}" class="cover-logo" alt="Logo"/>` : '';
  return `<div class="page page-cover">
  <div class="cover">
    ${logoHtml}
    <div class="cover-ornament"><span class="ornament-line"></span><span class="ornament-dots">◆ ◇ ◆</span><span class="ornament-line"></span></div>
    <div>
      <div class="cover-title">Protocolos — ${escHtml(locationOnly)}</div>
    </div>
    <div class="cover-ornament"><span class="ornament-line"></span><span class="ornament-dots">◆ ◇ ◆</span><span class="ornament-line"></span></div>
    <div class="cover-divider"></div>
    <div class="cover-info-list">
      <div class="cover-info-row"><span class="cover-info-label">Proyecto</span><span class="cover-info-value">${escHtml(projectName)}</span></div>
      <div class="cover-info-row"><span class="cover-info-label">Sector</span><span class="cover-info-value">${escHtml(locationOnly)}</span></div>
      <div class="cover-info-row"><span class="cover-info-label">Total protocolos</span><span class="cover-info-value">${totalInGroup}</span></div>
      <div class="cover-info-row"><span class="cover-info-label">Protocolos aprobados</span><span class="cover-info-value">${approvedInGroup}</span></div>
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

function buildSummaryTable(protocols: DossierProtocol[], pageMap: Record<string, number>): string {
  const rows = protocols.map(p => {
    const pg = pageMap[p.id] ?? '';
    return `
<tr>
  <td><a href="#proto-${p.id}" style="color:#1a4f7a;font-weight:700;text-decoration:none;" title="Ir al protocolo"><strong>${escHtml((p as { protocol_code?: string | null }).protocol_code ? `${(p as { protocol_code?: string | null }).protocol_code} · ${p.protocol_number}` : p.protocol_number)}</strong></a></td>
  <td>${escHtml(p.location?.name ?? null)}</td>
  <td><span class="status-badge" style="background:${statusColor(p.status)}">${statusLabel(p.status)}</span></td>
  <td>${escHtml(p.filledByName)}</td>
  <td>${fmtDate(p.updated_at)}</td>
  <td>${escHtml(p.signedByName)}</td>
  <td>${fmtDate(p.signed_at)}</td>
  <td style="text-align:center;color:#1a4f7a;font-weight:700;">${pg}</td>
</tr>`;
  }).join('');
  return `<div class="page">
  <h2 style="color:#0e213d;border-bottom:2px solid #1a4f7a;padding-bottom:8px;margin-bottom:16px;">TABLA RESUMEN DE PROTOCOLOS</h2>
  <table>
    <thead>
      <tr>
        <th>N° Protocolo</th><th>Ubicación</th><th>Estado</th>
        <th>Llenado por</th><th>Fecha realización</th>
        <th>Aprobado por</th><th>Fecha aprobación</th>
        <th style="width:40px;">Pág.</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
</div>`;
}

// ── Protocol pages ────────────────────────────────────────────────────────────

const ROWS_PER_PAGE = 20;

// ── Parte B: protocolos numéricos → PDF con el formato del audit page ────────

/** Tabla "Equipos utilizados" (título + tabla), sin wrapper de fila. Se usa en
 *  el path clásico (dentro de un <tr>) y en el numérico (bloque div). */
function equipmentSectionInner(equipment: NonNullable<DossierProtocolFull['equipment']>): string {
  const equipRows = equipment.map(eq => `<tr>
        <td style="font-weight:700;color:#1a4f7a;">${escHtml(eq.code)}</td>
        <td>${escHtml(eq.name)}</td>
        <td style="color:#666;">${escHtml(eq.type)}</td>
        <td style="color:#666;font-family:ui-monospace,Menlo,monospace;font-size:9px;">${eq.last_calibration_at ? fmtDate(eq.last_calibration_at) : '—'}</td>
        <td style="color:#666;font-family:ui-monospace,Menlo,monospace;font-size:9px;">${fmtDate(eq.next_calibration_at)}</td>
      </tr>`).join('');
  return `<div style="font-size:10px;font-weight:800;color:#444;letter-spacing:0.5px;text-transform:uppercase;margin-bottom:4px;">Equipos utilizados</div>
        <table style="width:100%;border-collapse:collapse;font-size:10px;">
          <thead><tr style="background:#f4f6f9;">
            <th style="text-align:left;padding:3px 6px;">Código</th>
            <th style="text-align:left;padding:3px 6px;">Nombre</th>
            <th style="text-align:left;padding:3px 6px;">Tipo</th>
            <th style="text-align:left;padding:3px 6px;">Última calib.</th>
            <th style="text-align:left;padding:3px 6px;">Próxima calib.</th>
          </tr></thead>
          <tbody>${equipRows}</tbody>
        </table>`;
}

/** Bloques del cuerpo numérico + extras (comentarios generales, equipos).
 *  Compartido entre el CONTEO de páginas (1er pase) y el render (2º pase)
 *  para que la numeración global "Página X de Y" nunca se desfase. */
/** Config por defecto (todos los campos resueltos) cuando el caller no pasa una. */
const DEFAULT_PRINT_CFG: ResolvedPrintConfig = getTemplatePrintConfig({}, null);

/** v43.6 — Sectores del proyecto CON geometría (para el croquis). */
async function loadGeomSectors(projectId: string): Promise<CroquisSectorIn[]> {
  try {
    const { data } = await supabase.from('project_sectors').select('name, display_color, points_json').eq('project_id', projectId);
    const out: CroquisSectorIn[] = [];
    for (const s of (data ?? []) as { name: string; display_color: string | null; points_json: unknown }[]) {
      const pts = Array.isArray(s.points_json) ? (s.points_json as { lat: number; lng: number }[]) : null;
      if (pts && pts.length >= 3 && pts.every(p => typeof p?.lat === 'number' && typeof p?.lng === 'number')) {
        out.push({ name: s.name, color: s.display_color || '#1a4f7a', points: pts });
      }
    }
    return out;
  } catch { return []; }
}

/** v43.6 — Ortofoto del proyecto a base64 + bounds (Leaflet [[swLat,swLng],[neLat,neLng]]). */
async function loadCroquisOrtho(row: { orthophoto_s3_key?: string | null; orthophoto_bounds_json?: unknown } | null): Promise<CroquisOrtho | null> {
  try {
    const key = row?.orthophoto_s3_key;
    const b = row?.orthophoto_bounds_json;
    if (!key || !b) return null;
    const bb = Array.isArray(b) ? b : (typeof b === 'string' ? JSON.parse(b) : null);
    if (!Array.isArray(bb) || bb.length < 2 || !Array.isArray(bb[0]) || !Array.isArray(bb[1])) return null;
    const swLat = Number(bb[0][0]), swLng = Number(bb[0][1]), neLat = Number(bb[1][0]), neLng = Number(bb[1][1]);
    if (![swLat, swLng, neLat, neLng].every(Number.isFinite)) return null;
    const dataUri = await fetchToBase64(s3Url(key), key);
    if (!dataUri) return null;
    return { dataUri, swLat, swLng, neLat, neLng };
  } catch { return null; }
}

/** v43.6 — Bloque de croquis (figura SVG vectorial sobre ortofoto) para un protocolo.
 *  Devuelve {block, placement} o null si el tipo no lo activó / sin coordenadas. El PESO
 *  depende solo de two_column → idéntico en conteo y render. 'photos' se trata como 'end'. */
function croquisBlockFor(
  full: DossierProtocolFull,
  cfg: ResolvedPrintConfig,
  geomSectors: CroquisSectorIn[],
  ortho: CroquisOrtho | null,
): { block: NumericPdfBlock; placement: 'start' | 'end' } | null {
  const cro = cfg.croquis;
  const pa = full.protocol as { latitude?: number | null; longitude?: number | null };
  if (!cro.show || pa.latitude == null || pa.longitude == null) return null;
  const imgWidth = cfg.two_column ? 150 : 380;
  const html = buildCroquisFigureHtml({
    sectors: geomSectors,
    point: { lat: pa.latitude, lng: pa.longitude },
    ortho: (cro.show_orthophoto && ortho) ? ortho : null,
    showOrtho: cro.show_orthophoto && !!ortho,
    baseOpacity: cro.base_opacity,
    pointSize: cro.point_size,
    imgWidth,
  });
  const weight = Math.max(6, Math.round((imgWidth * 0.75 + 22) / 24));
  return { block: { html, weight }, placement: cro.placement === 'start' ? 'start' : 'end' };
}

function numericProtoBlocks(
  full: DossierProtocolFull,
  xrefValues?: XrefValues,
  includeEquipment?: boolean,
  auxTables?: AuxTables,
  cfg: ResolvedPrintConfig = DEFAULT_PRINT_CFG,
  headerColor: string = DEFAULT_HEADER_COLOR,
  croquis?: { block: NumericPdfBlock; placement: 'start' | 'end' } | null,
): NumericPdfBlock[] {
  const blocks = buildNumericProtocolBlocks(full.items.map(it => ({
    id: it.id,
    item_description: it.item_description,
    validation_method: it.validation_method,
    partida_item: it.partida_item,
    comments: it.comments,
    section: it.section,
  })), {
    xrefValues, auxTables,
    protocolCode: (full.protocol as { protocol_code?: string | null }).protocol_code ?? null,
    fontScale: PRINT_FONT_SCALE[cfg.font_level],
    twoColumn: cfg.two_column,
    chartWidth: chartWidthFor(cfg),
    splitTables: cfg.split_tables,
    headerColor,
  });
  const protoAny = full.protocol as any;
  if (protoAny.general_comment) {
    blocks.push({
      html: `<div style="padding:8px 0 0 0;border-top:2px solid #1a4f7a;margin-top:8px;">
        <div style="font-size:10px;font-weight:800;color:#444;letter-spacing:0.5px;text-transform:uppercase;margin-bottom:2px;">Comentarios generales</div>
        <div style="font-size:11px;color:#222;white-space:pre-wrap;">${escHtml(protoAny.general_comment)}</div>
      </div>`,
      weight: 4,
    });
  }
  if (includeEquipment !== false && full.equipment && full.equipment.length > 0) {
    blocks.push({
      html: `<div style="padding:8px 0 0 0;border-top:2px solid #1a4f7a;margin-top:8px;">${equipmentSectionInner(full.equipment)}</div>`,
      weight: full.equipment.length + 4,
    });
  }
  // v43.6 — Croquis como una sección más (mismo peso en conteo y render).
  if (croquis) { croquis.placement === 'start' ? blocks.unshift(croquis.block) : blocks.push(croquis.block); }
  return blocks;
}

/** Nº de páginas que ocupará un protocolo en el dossier (clásico o numérico).
 *  Debe coincidir EXACTO con el render (mismo cfg/headerColor/perCol). */
function protoPageCount(
  full: DossierProtocolFull,
  includeEquipment?: boolean,
  cfg: ResolvedPrintConfig = DEFAULT_PRINT_CFG,
  headerColor: string = DEFAULT_HEADER_COLOR,
  croquis?: { block: NumericPdfBlock; placement: 'start' | 'end' } | null,
): number {
  if (isNumericProtocol(full.items)) {
    try {
      const fScale = PRINT_FONT_SCALE[cfg.font_level];
      const perCol = Math.max(12, Math.round(cfg.col_budget / fScale));
      const cols = paginateNumericBlocks(numericProtoBlocks(full, undefined, includeEquipment, undefined, cfg, headerColor, croquis), perCol, cfg.split_tables).length;
      return cfg.two_column ? Math.max(1, Math.ceil(cols / 2)) : Math.max(1, cols);
    } catch { /* estructura inesperada → cae al conteo clásico */ }
  }
  return Math.ceil(full.items.length / ROWS_PER_PAGE) || 1;
}

function buildProtocolPages(
  full: DossierProtocolFull,
  logoB64: string | null,
  signB64: string | null,
  signerName: string,
  globalPageStart: number,
  totalDocPages: number,
  projectName: string,
  signatureMap?: Record<string, string | null>,
  /** v26 (FASE 7) — SVG inline del QR para insertarse en la esquina del header.
   *  Si se omite, el header no muestra QR (back-compat). */
  qrSvg?: string,
  /** v26 (FASE 6) — Valores xref pre-resueltos para evaluar fórmulas con `@`
   *  refs en gráficos numéricos. Si se omite, las xref devuelven error inline. */
  xrefValues?: XrefValues,
  /** v24 (FASE 4) — Gate del flag `equipment_catalog`. Si false, la sección
   *  "Equipos utilizados" no se renderiza aunque `full.equipment` esté llena.
   *  Default true para back-compat. */
  includeEquipment?: boolean,
  /** v41 — Tablas auxiliares del proyecto para recomputar BUSCAR() en el PDF. */
  auxTables?: AuxTables,
  /** v43.6 — Config de impresión resuelta del tipo (dos columnas, letra, etc.). */
  cfg: ResolvedPrintConfig = DEFAULT_PRINT_CFG,
  /** v43.6 — Color GLOBAL de encabezados de tabla. */
  headerColor: string = DEFAULT_HEADER_COLOR,
  /** v43.6 — id_protocolo del tipo (para el campo "ID Protocolo" del encabezado). */
  idProtocolo: string | null = null,
  /** v43.6 — Croquis (figura vectorial) a insertar como sección (start/end). */
  croquis?: { block: NumericPdfBlock; placement: 'start' | 'end' } | null,
): string {
  const { protocol: p, items, approvals } = full;
  const loc = p.location;
  // v42d — En ensayos NUMÉRICOS, Datos Generales no lleva "Ubicación/Especialidad"
  // (se trabaja por coordenadas/sector, igual que el Audit). En clásicos se mantiene.
  const isNumeric = isNumericProtocol(items as any);
  const pa = p as { latitude?: number | null; longitude?: number | null };
  const coordsStr = (pa.latitude != null && pa.longitude != null)
    ? `${Number(pa.latitude).toFixed(6)}, ${Number(pa.longitude).toFixed(6)}`
    : 'Sin coordenadas';
  const filledName = p.filledByName ?? '—';
  const signedName = p.signedByName ?? signerName;
  const sc = statusColor(p.status);
  const sl = statusLabel(p.status);
  const logoHtml = logoB64 ? `<img src="${logoB64}" class="proto-logo" alt="Logo"/>` : '<div style="min-width:80px;"></div>';
  const signatureHtml = signB64 ? `<img src="${signB64}" class="signature-img" alt="Firma"/>` : '<div class="signature-line"></div>';
  const today = fmtDate(new Date().toISOString());

  // v43.6 — QR: se muestra si cfg.show_qr; tamaño por nivel de encabezado (igual que móvil).
  const qrPx = cfg.header_size === 'xcompact' ? 44 : cfg.header_size === 'compact' ? 54 : 100;
  const qrSized = (qrSvg && cfg.show_qr)
    ? qrSvg.replace(/width="\d+(?:\.\d+)?"/, `width="${qrPx}"`).replace(/height="\d+(?:\.\d+)?"/, `height="${qrPx}"`)
    : '';
  const qrHtml = qrSized
    ? `<div style="display:flex;align-items:center;justify-content:center;width:${qrPx + 6}px;flex-shrink:0;">${qrSized}</div>`
    : '';
  // v43.6 — Encabezado de datos generales CONFIGURABLE: el usuario elige qué campos
  // (header_fields) y el nivel define el N° de FILAS (3/2/1). Espejo del móvil.
  const headerGrid = (() => {
    const cell = (label: string, value: string) => `<div class="proto-info-cell"><span class="proto-info-label">${escHtml(label)}</span><span class="proto-info-value">${escHtml(value)}</span></div>`;
    const fieldHtml: Record<string, string> = {
      proyecto: cell('Proyecto', projectName),
      fecha: cell('Fecha', today),
      supervisor: cell('Supervisor', filledName),
      f_realizacion: cell('Fecha realización', fmtDateTime(p.updated_at)),
      f_aprobacion: cell('Fecha aprobación', fmtDateTime(p.signed_at)),
      id_protocolo: cell('ID Protocolo', idProtocolo ?? p.protocol_number ?? '—'),
      ubicacion: isNumeric ? cell('Coordenadas', coordsStr) : cell('Ubicación', loc?.name ?? '—'),
      especialidad: (!isNumeric && loc?.specialty) ? cell('Especialidad', loc.specialty) : '',
    };
    const cells = (cfg.header_fields ?? []).map(k => fieldHtml[k]).filter(Boolean);
    const nRows = PRINT_HEADER_ROWS[cfg.header_size];
    const perRow = Math.max(1, Math.ceil(cells.length / nRows));
    let rows = '';
    for (let i = 0; i < cells.length; i += perRow) rows += `<div class="proto-info-row">${cells.slice(i, i + perRow).join('')}</div>`;
    const rej = (p as any).rejection_reason
      ? `<div class="proto-info-row"><div class="proto-info-cell" style="background:#fce8e6;flex:1;"><span class="proto-info-label" style="color:#d93025;">Motivo rechazo</span><span class="proto-info-value" style="color:#d93025;">${escHtml((p as any).rejection_reason)}</span></div></div>`
      : '';
    const cls = cfg.header_size === 'normal' ? '' : ' proto-info-compact';
    return `<div class="proto-info-grid${cls}">${rows}${rej}</div>`;
  })();
  const headerHtml = `
  <div class="proto-header" style="display:flex;align-items:center;gap:8px;">
    ${logoHtml}
    <div class="proto-header-center" style="flex:1;"><div class="proto-name">${escHtml((p as { protocol_code?: string | null }).protocol_code ? `${(p as { protocol_code?: string | null }).protocol_code} — ${p.protocol_number}` : p.protocol_number)}</div></div>
    ${qrHtml}
    <div class="proto-num"><span class="status-badge" style="background:${sc}">${sl}</span></div>
  </div>
  ${headerGrid}
  <hr class="proto-divider"/>`;

  // Footer común a ambos formatos (clásico y numérico).
  const footerFor = (pageIdx: number) => `<div class="proto-footer">
    ${approvals && approvals.length > 1
      ? `<div class="signature-block" style="display:flex;gap:18px;flex:1;">
           ${approvals.filter(a => a.status === 'APPROVED').map(a => {
             const sigB64 = (a.signer_id && signatureMap?.[a.signer_id]) || null;
             const sigHtml = sigB64 ? `<img src="${sigB64}" class="signature-img" alt="Firma"/>` : '<div class="signature-line"></div>';
             const nm = [a.signer_name, a.signer_apellido].filter(Boolean).join(' ') || '—';
             return `<div style="text-align:center;flex:1;">
                ${sigHtml}
                <div class="signature-name">${escHtml(nm)}</div>
                <div class="signature-role">Nivel ${a.level} / ${approvals.length}</div>
                <div style="font-size:8px;color:#888;">${a.signed_at ? fmtDateTime(a.signed_at) : ''}</div>
             </div>`;
           }).join('')}
         </div>`
      : `<div class="signature-block">${signatureHtml}<div class="signature-name">${escHtml(signedName)}</div><div class="signature-role">Jefe de Calidad</div></div>`}
    <div class="footer-right">Dosier de Calidad<br/>Página ${globalPageStart + pageIdx} de ${totalDocPages}</div>
  </div>`;

  // ── Parte B: protocolo NUMÉRICO → mismo formato que el audit page ─────────
  // (secciones con banda, encabezados col-, fila de letras, ✓/✗ por fila y
  // gráficos numerados). Los clásicos siguen el path de abajo sin cambios.
  if (isNumericProtocol(items)) {
    try {
      const fScale = PRINT_FONT_SCALE[cfg.font_level];
      const perCol = Math.max(12, Math.round(cfg.col_budget / fScale));
      const blocks = numericProtoBlocks(full, xrefValues, includeEquipment, auxTables, cfg, headerColor, croquis);
      let contents: string[];
      if (cfg.two_column) {
        // Empaque explícito: cada "columna" se llena a la altura de página; luego 2
        // columnas por hoja, lado a lado (espejo del móvil DossierExportService).
        const colsHtml = paginateNumericBlocks(blocks, perCol, cfg.split_tables);
        contents = [];
        for (let i = 0; i < colsHtml.length; i += 2) {
          contents.push(`<div style="display:flex;gap:14px;align-items:stretch;">
  <div style="flex:1;min-width:0;">${colsHtml[i]}</div>
  <div style="flex:0 0 1px;background:#d9dde3;align-self:stretch;margin-bottom:14px;"></div>
  <div style="flex:1;min-width:0;">${colsHtml[i + 1] ?? ''}</div>
</div>`);
        }
        if (contents.length === 0) contents = [''];
      } else {
        contents = paginateNumericBlocks(blocks, perCol, cfg.split_tables);
      }
      return contents.map((content, pageIdx) => `<div class="page"${pageIdx === 0 ? ` id="proto-${p.id}"` : ''}>
  ${headerHtml}
  ${pageIdx > 0 ? '<div style="font-size:9px;color:#888;margin-bottom:6px;">— Continuación del protocolo —</div>' : ''}
  ${content}
  ${footerFor(pageIdx)}
</div>`).join('');
    } catch (e) {
      console.warn('[PDF] render numérico falló — fallback al formato clásico:', e);
    }
  }

  const chunks: ProtocolItem[][] = [];
  for (let i = 0; i < items.length; i += ROWS_PER_PAGE) chunks.push(items.slice(i, i + ROWS_PER_PAGE));
  if (chunks.length === 0) chunks.push([]);

  const hasMultipleSections = new Set(items.map(i => i.section?.trim() || 'General')).size > 1;

  // Scope + matrices del protocolo: necesario para renderizar gráficos en el PDF.
  // Se computa una sola vez por protocolo y se reutiliza dentro del loop.
  // Para protocolos APPROVED el snapshot está en item.comments — resolveScopeCells
  // los procesa con la misma lógica que la web (manual + list + lookup + formula).
  // v33 — Encabezados de columna del protocolo: fallback de títulos de eje
  // para gráficos que no declaran xt:/yt: (deriveAxisTitles).
  const protoHeaderRows = (() => {
    try {
      const parsedRows = items.map(it => ({ item: it, spec: parseNumericRow(it.validation_method) }));
      return extractHeaderRows(parsedRows).headerRows;
    } catch { return []; }
  })();

  const protoScope = (() => {
    try {
      const parsedRows = items.map(it => ({ item: it, spec: parseNumericRow(it.validation_method) }));
      const { dataRows } = extractHeaderRows(parsedRows);
      const { mainRows, matrices } = extractMatrices(dataRows);
      const scopeCells: ScopeCell[] = [];
      for (const { item, spec } of mainRows) {
        if (spec?.kind !== 'row') continue;
        const partida = item.partida_item ?? '';
        const cellVals = splitRowComments(item.comments, spec.cells.length);
        for (let i = 0; i < spec.cells.length; i++) {
          const cell = spec.cells[i];
          const key = scopeKeyFor(partida, i);
          if (cell.kind === 'manual' || cell.kind === 'percent' || cell.kind === 'bool' || cell.kind === 'free') scopeCells.push({ key, kind: 'manual', raw: cellVals[i] ?? '' });
          else if (cell.kind === 'list' || cell.kind === 'date' || cell.kind === 'time' || cell.kind === 'equipment' || cell.kind === 'text') scopeCells.push({ key, kind: 'list', raw: cellVals[i] ?? '' });
          else if (cell.kind === 'val') scopeCells.push({ key, kind: 'manual', raw: cell.literal });
          else if (cell.kind === 'lookup') scopeCells.push({ key, kind: 'lookup', refKey: cell.refKey, matrixId: cell.matrixId, searchCol: cell.searchCol, returnCol: cell.returnCol });
          else if (cell.kind === 'formula') scopeCells.push({ key, kind: 'formula', expr: cell.expr });
        }
      }
      const { scope } = resolveScopeCells(scopeCells, matrices, xrefValues, auxTables);
      return scope;
    } catch {
      return {};
    }
  })();

  // v33 — Numeración secuencial de gráficos del protocolo ("Gráfico 1 — …").
  let chartSeq = 0;

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
      // Render diferente si es item numérico: valor + ✓/✗ según rango
      const numSpec = parseNumericItem(item.validation_method);
      // Llamamos también a parseNumericRow para detectar (a) graphs en nuevos
      // modos (bars/log-x/scatter) y (b) filas multi-celda (`//` separador) que
      // parseNumericItem ignora — antes el PDF solo mostraba la primera celda.
      const rowSpec = parseNumericRow(item.validation_method);
      const graphSpec = numSpec?.kind === 'graph' ? numSpec
                      : rowSpec?.kind === 'graph' ? rowSpec : null;

      if (graphSpec) {
        // Render: fila full-width con el SVG inline.
        const axisTitles = deriveAxisTitles(graphSpec, protoHeaderRows);
        const svg = renderChartSvg(
          {
            mode: graphSpec.mode,
            xRefs: graphSpec.xRefs,
            yRefs: graphSpec.yRefs,
            title: graphSpec.title,
            xAxisTitle: axisTitles.xAxisTitle,
            yAxisTitle: axisTitles.yAxisTitle,
            y2Refs: (graphSpec as any).y2Refs,
            y3Refs: (graphSpec as any).y3Refs,
            seriesLabels: (graphSpec as any).seriesLabels,
            bandLoRefs: (graphSpec as any).bandLoRefs,
            bandHiRefs: (graphSpec as any).bandHiRefs,
            fit: (graphSpec as any).fit,
          },
          protoScope,
          { width: 640, height: Math.round(640 * (((graphSpec as any).aspectPct ?? 43.75) / 100)) },
        );
        chartSeq++;
        // Pie de gráfico numerado (el título ya va dentro del SVG).
        const captionLine = `<div style="font-size:9px;color:#666;text-align:center;margin-top:3px;">Gráfico ${chartSeq}${graphSpec.title ? ` — ${escHtml(graphSpec.title)}` : ''}</div>`;
        itemsHtml += `<tr>
  <td style="width:36px;color:#1a4f7a;font-weight:700;text-align:center;vertical-align:top;">${rowNumber++}</td>
  <td colspan="4" style="padding:6px 4px;">
    <div style="font-size:11px;color:#222;margin-bottom:4px;">${escHtml(item.item_description)}</div>
    <div style="display:flex;justify-content:center;">${svg}</div>
    ${captionLine}
  </td>
</tr>`;
        continue;
      }

      // Fila numérica multi-celda (// separador): rendrizamos cada celda con su
      // letra (A, B, C…), su valor y su ✓/✗ por rango. Antes de este fix, la
      // versión legacy solo mostraba la primera celda y descartaba las demás.
      // v34 — Mejora 6: celdas `:oculto` (nunca visibles) y `:nopdf` (visibles
      // en app, excluidas del reporte) NO van al PDF. Si la fila entera queda
      // sin celdas reportables, se omite completa.
      if (rowSpec?.kind === 'row') {
        const reportable = rowSpec.cells.filter(c => !c.hidden && !c.noReport && c.kind !== 'blank');
        const suppressed = rowSpec.cells.some(c => c.hidden || c.noReport);
        if (suppressed && reportable.length === 0) continue;
      }
      if (numSpec && numSpec.kind !== 'graph' && ((numSpec as any).hidden || (numSpec as any).noReport)) {
        // Fila legacy de una sola celda marcada oculta/no-reporte.
        if (rowSpec?.kind === 'row' && rowSpec.cells.length === 1) continue;
      }
      const isMultiCellRow = rowSpec?.kind === 'row' && (
        rowSpec.cells.length > 1 ||
        ['percent', 'bool', 'date', 'time', 'equipment', 'val'].includes(rowSpec.cells[0]?.kind)
      );

      let conformeHtml: string;
      let metodoHtml: string = escHtml(item.validation_method);
      if (isMultiCellRow && rowSpec?.kind === 'row') {
        const cellVals = splitRowComments(item.comments, rowSpec.cells.length);
        const partida = item.partida_item ?? '';
        const cellsHtml = rowSpec.cells.map((cell, i) => {
          const L = colLetter(i);
          const raw = cellVals[i] ?? '';
          // v34 — celdas ocultas / no-reporte: fuera del PDF.
          if (cell.hidden || cell.noReport) return '';
          // Valor literal fijo (tamiz, progresiva)
          if (cell.kind === 'val') {
            return `<span style="display:inline-block;margin-right:8px;"><b style="color:#1a4f7a;">${L}:</b><b>${escHtml(cell.literal || '—')}</b></span>`;
          }
          // Casilla Sí/No (guardada como "1"/"0")
          if (cell.kind === 'bool') {
            const t = raw === '1' ? '<span style="color:#137333;font-weight:700;">Sí</span>'
                    : raw === '0' ? '<span style="color:#d93025;font-weight:700;">No</span>' : '—';
            return `<span style="display:inline-block;margin-right:8px;"><b style="color:#1a4f7a;">${L}:</b>${t}</span>`;
          }
          // Manual / porcentaje / formula leen el VALOR computado
          if (cell.kind === 'manual' || cell.kind === 'percent' || cell.kind === 'formula') {
            const scopeKey = scopeKeyFor(partida, i);
            const computed = cell.kind === 'formula' ? protoScope[scopeKey] : null;
            const v = computed != null
              ? computed
              : (raw === '' ? null : Number(String(raw).replace(',', '.')));
            const valTxt = v == null || !isFinite(v) ? '—' : (Math.abs(v) >= 100 ? v.toFixed(0) : v.toFixed(2));
            const ok = (cell.range && v != null && isFinite(v)) ? inRange(v, cell.range) : null;
            const icon = ok === true ? '<span style="color:#137333;">✓</span>'
                        : ok === false ? '<span style="color:#d93025;">✗</span>'
                        : '';
            const pct = cell.kind === 'percent' && valTxt !== '—' ? '%' : '';
            return `<span style="display:inline-block;margin-right:8px;"><b style="color:#1a4f7a;">${L}:</b>${valTxt}${pct} ${icon}</span>`;
          }
          // Celda en blanco intencional: ocupa espacio pero sin contenido (preserva alineación).
          if (cell.kind === 'blank') {
            return `<span style="display:inline-block;margin-right:8px;color:#bbb;"><b>${L}:</b>·</span>`;
          }
          // list/lookup/comment: texto del snapshot
          return `<span style="display:inline-block;margin-right:8px;"><b style="color:#1a4f7a;">${L}:</b>${escHtml(raw || '—')}</span>`;
        }).join('');
        conformeHtml = `<div style="text-align:left;line-height:1.3;">${cellsHtml}</div>`;
        metodoHtml = `<span style="color:#7b1fa2;font-size:9px;">multi (${rowSpec.cells.length})</span>`;
      } else if (numSpec && numSpec.kind !== 'graph') {
        const v = item.comments == null || item.comments === '' ? null : Number(String(item.comments).replace(',', '.'));
        const okIcon = (numSpec.range && v != null && isFinite(v))
          ? (v >= numSpec.range.min && v <= numSpec.range.max
              ? `<span class="td-compliant">✓</span>`
              : `<span class="td-noncompliant">✗</span>`)
          : '';
        const valTxt = v == null || !isFinite(v) ? '—' : (Math.abs(v) >= 100 ? v.toFixed(0) : v.toFixed(2));
        conformeHtml = `<span style="font-weight:700;color:#1a4f7a;">${valTxt}</span> ${okIcon}`;
        metodoHtml = numSpec.range
          ? `<span style="color:#555;">[${numSpec.range.min}:${numSpec.range.max}]</span>`
          : (numSpec.kind === 'formula' ? '<span style="color:#7b1fa2;">fx</span>' : '');
      } else {
        if (!item.has_answer) conformeHtml = `<span class="td-noanswer">—</span>`;
        else if (item.is_na) conformeHtml = `<span style="color:#888;font-weight:700;">N/A</span>`;
        else if (item.is_compliant === true) conformeHtml = `<span class="td-compliant">✓</span>`;
        else conformeHtml = `<span class="td-noncompliant">✗</span>`;
      }
      // Multi-cell ocupa más ancho — colapsamos la columna método y la columna obs.
      if (isMultiCellRow) {
        itemsHtml += `<tr>
  <td style="width:36px;color:#1a4f7a;font-weight:700;text-align:center;">${rowNumber++}</td>
  <td>${escHtml(item.item_description)}</td>
  <td colspan="3" style="color:#222;font-size:10px;">${conformeHtml}</td>
</tr>`;
      } else {
        itemsHtml += `<tr>
  <td style="width:36px;color:#1a4f7a;font-weight:700;text-align:center;">${rowNumber++}</td>
  <td>${escHtml(item.item_description)}</td>
  <td style="width:88px;color:#555;">${metodoHtml}</td>
  <td style="width:52px;text-align:center;">${conformeHtml}</td>
  <td style="width:140px;color:#555;font-size:9px;">${numSpec ? '' : escHtml(item.comments ?? null)}</td>
</tr>`;
      }
    }
    // Bloque "Comentarios generales" si el protocolo es numérico y tiene general_comment
    const protoAny = full.protocol as any;
    if (pageIdx === chunks.length - 1 && protoAny.general_comment) {
      itemsHtml += `<tr><td colspan="5" style="padding:8px 6px;border-top:2px solid #1a4f7a;">
        <div style="font-size:10px;font-weight:800;color:#444;letter-spacing:0.5px;text-transform:uppercase;margin-bottom:2px;">Comentarios generales</div>
        <div style="font-size:11px;color:#222;white-space:pre-wrap;">${escHtml(protoAny.general_comment)}</div>
      </td></tr>`;
    }
    // v24 — Sección "Equipos utilizados" en la última página del protocolo.
    // Gated por el flag `equipment_catalog`: si está off, no renderizamos —
    // misma decisión que la UI (audit/page.tsx), evitando exponer datos que
    // el CREATOR ocultó al desactivar el módulo.
    // Default `includeEquipment !== false`: si el caller no lo pasó (back-compat
    // con código viejo), renderiza igual que antes.
    const renderEquipment = includeEquipment !== false;
    if (renderEquipment && pageIdx === chunks.length - 1 && full.equipment && full.equipment.length > 0) {
      itemsHtml += `<tr><td colspan="5" style="padding:8px 6px;border-top:2px solid #1a4f7a;">
        ${equipmentSectionInner(full.equipment)}
      </td></tr>`;
    }
    const continuacion = pageIdx > 0 ? ' <span style="font-size:9px;color:#888;font-weight:400;">(continuación)</span>' : '';
    const anchorId = pageIdx === 0 ? ` id="proto-${p.id}"` : '';
    return `<div class="page"${anchorId}>
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
  ${footerFor(pageIdx)}
</div>`;
  }).join('');
}

// ── Photo panel ───────────────────────────────────────────────────────────────

// Detect image orientation from base64 data URI
function getImageOrientation(b64: string): Promise<'portrait' | 'landscape'> {
  return new Promise((resolve) => {
    const img = new window.Image();
    img.onload = () => resolve(img.naturalHeight >= img.naturalWidth ? 'portrait' : 'landscape');
    img.onerror = () => resolve('portrait');
    img.src = b64;
  });
}

async function buildPhotoPanel(
  protocolName: string, locationName: string | null, evidenceEntries: { url: string; s3Key: string | null }[],
  logoB64: string | null, signB64: string | null, signerName: string,
  pageNumber: number, totalDocPages: number,
): Promise<string> {
  if (evidenceEntries.length === 0) return '';

  // Download all photos
  const b64s = await Promise.all(evidenceEntries.map(async (e, i) => {
    const result = await fetchToBase64(e.url, e.s3Key);
    if (!result) console.warn(`[PDF] Foto ${i + 1}/${evidenceEntries.length} FALLÓ: ${e.s3Key ?? e.url}`);
    return result;
  }));
  const valid = b64s.filter(Boolean) as string[];
  console.log(`[PDF] Panel ${protocolName}: ${evidenceEntries.length} intentadas → ${valid.length} exitosas, ${evidenceEntries.length - valid.length} fallidas`);
  if (valid.length === 0) return '';

  // Detect orientation for each photo and separate
  const orientations = await Promise.all(valid.map(b64 => getImageOrientation(b64)));
  const verticals: string[] = [];
  const horizontals: string[] = [];
  for (let i = 0; i < valid.length; i++) {
    if (orientations[i] === 'portrait') verticals.push(valid[i]);
    else horizontals.push(valid[i]);
  }

  // Paginate: 8 vertical per page (4-col × 2 rows), 9 horizontal per page (3-col × 3 rows)
  const VERT_PER_PAGE = 8;
  const HORIZ_PER_PAGE = 9;

  const vertChunks: string[][] = [];
  for (let i = 0; i < verticals.length; i += VERT_PER_PAGE) vertChunks.push(verticals.slice(i, i + VERT_PER_PAGE));
  const horizChunks: string[][] = [];
  for (let i = 0; i < horizontals.length; i += HORIZ_PER_PAGE) horizChunks.push(horizontals.slice(i, i + HORIZ_PER_PAGE));

  // Combine chunks: each page can have vertical grid + horizontal grid
  const allChunks: { verts: string[]; horizs: string[] }[] = [];
  const maxLen = Math.max(vertChunks.length, horizChunks.length, 1);
  for (let i = 0; i < maxLen; i++) {
    allChunks.push({ verts: vertChunks[i] ?? [], horizs: horizChunks[i] ?? [] });
  }

  const logoHtml = logoB64 ? `<img src="${logoB64}" class="proto-logo" alt="Logo"/>` : '<div style="min-width:80px;"></div>';
  const signatureHtml = signB64 ? `<img src="${signB64}" class="signature-img" alt="Firma"/>` : '<div class="signature-line"></div>';

  return allChunks.map(({ verts, horizs }, idx) => {
    const vertHtml = verts.length > 0
      ? `<div class="photo-grid-v">${verts.map(b64 => `<div class="photo-cell-v"><img src="${b64}" /></div>`).join('')}</div>`
      : '';
    const horizHtml = horizs.length > 0
      ? `<div class="photo-grid-h">${horizs.map(b64 => `<div class="photo-cell-h"><img src="${b64}" /></div>`).join('')}</div>`
      : '';
    return `<div class="page">
  <div class="photo-page-header">${logoHtml}<div class="photo-panel-title">Panel Fotográfico — ${escHtml(protocolName)}${locationName ? `<div style="font-size:10px;font-weight:600;color:#555;margin-top:2px;">Ubicación: ${escHtml(locationName)}</div>` : ''}</div></div>
  ${vertHtml}
  ${horizHtml}
  <div class="proto-footer">
    <div class="signature-block">${signatureHtml}<div class="signature-name">${escHtml(signerName)}</div><div class="signature-role">Jefe de Calidad</div></div>
    <div class="footer-right">Dosier de Calidad<br/>Página ${pageNumber + idx} de ${totalDocPages}</div>
  </div>
</div>`;
  }).join('');
}

// ── Generate PDF and download ────────────────────────────────────────────────

// Store for preview data (shared between generator and preview component)
let _previewData: { html: string; filename: string } | null = null;

export function getPreviewData() { return _previewData; }
export function clearPreviewData() { _previewData = null; }

async function generateAndDownloadPdf(html: string, filename: string): Promise<void> {
  _previewData = { html, filename };
  window.dispatchEvent(new CustomEvent('pdf-preview-ready'));
}

// ── Public API ────────────────────────────────────────────────────────────────

export interface DossierExportOptions {
  projectId: string;
  projectName: string;
  projectCreatedAt?: string | number | null;
  signerName: string;
  signerUserId: string;
  logoS3Key?: string | null;
  protocols: DossierProtocol[];
  locations: Location[];
  preloaded?: PreloadedProjectData | null;
  onProgress?: (msg: string) => void;
  /** v26 (FASE 7) — Incluir QR del protocolo en el header del PDF. Solo activar
   *  cuando `flags.qr_codes=true` para el proyecto. */
  includeQrCodes?: boolean;
  /** v24 (FASE 4) — Incluir sección "Equipos utilizados" en el PDF. Solo activar
   *  cuando `flags.equipment_catalog=true`. Si está off, el render del PDF omite
   *  la sección aunque los protocolos tengan equipos vinculados (paridad con UI). */
  includeEquipment?: boolean;
}

/** v41 — Carga las tablas auxiliares del proyecto como mapa para BUSCAR() en el PDF. */
async function fetchAuxTablesMap(projectId: string): Promise<AuxTables> {
  const map: AuxTables = {};
  try {
    const { data } = await supabase
      .from('lab_aux_tables').select('group_key, columns_json, rows_json').eq('project_id', projectId);
    for (const t of (data ?? []) as { group_key: string; columns_json: unknown; rows_json: unknown }[]) {
      map[String(t.group_key).toLowerCase()] = {
        columns: Array.isArray(t.columns_json) ? (t.columns_json as string[]) : [],
        rows: Array.isArray(t.rows_json) ? (t.rows_json as string[][]) : [],
      };
    }
  } catch (e) { console.warn('[PDF] aux tables fetch failed:', e); }
  return map;
}

export async function exportFullDossier(opts: DossierExportOptions): Promise<void> {
  const { projectId, projectName, projectCreatedAt, signerName, signerUserId, logoS3Key, protocols, locations, preloaded, onProgress, includeQrCodes, includeEquipment } = opts;
  const auxTablesForPdf = await fetchAuxTablesMap(projectId);   // v41 — para BUSCAR() en el PDF
  const qrEnabled = includeQrCodes === true;
  // Por defecto incluimos equipos (true) si el caller no especificó; los callers
  // nuevos deberían pasar explícitamente `includeEquipment: flags.equipment_catalog`.
  const equipmentEnabled = includeEquipment !== false;

  // v43.6 — Config de impresión por tipo (la define el CREADOR en móvil; vive en
  // projects.feature_flags, JSONB compartido). El PDF web honra esa misma config.
  let projectFlags: unknown = {};
  let orthoRow: { orthophoto_s3_key?: string | null; orthophoto_bounds_json?: unknown } | null = null;
  try {
    const { data: pr } = await supabase.from('projects')
      .select('feature_flags, orthophoto_s3_key, orthophoto_bounds_json').eq('id', projectId).maybeSingle();
    projectFlags = (pr as { feature_flags?: unknown } | null)?.feature_flags ?? {};
    orthoRow = pr as typeof orthoRow;
  } catch { /* sin flags → defaults */ }
  const headerColor = getPrintHeaderColor(projectFlags);

  // v43.6 — Croquis: sectores con geometría + ortofoto (base64 + bounds) del proyecto.
  // Se cargan UNA vez; el croquis se dibuja vectorial (sin Google Maps) sobre la ortofoto.
  const geomSectors: CroquisSectorIn[] = await loadGeomSectors(projectId);
  const croquisOrtho: CroquisOrtho | null = await loadCroquisOrtho(orthoRow);
  const croquisOf = (full: DossierProtocolFull, cfg: ResolvedPrintConfig) =>
    croquisBlockFor(full, cfg, geomSectors, croquisOrtho);

  onProgress?.('Cargando imágenes...');

  // Load logo
  const logoB64 = logoS3Key ? await fetchToBase64(s3Url(logoS3Key), logoS3Key) : null;

  // Load signatures for all unique approvers (per-jefe, like mobile DossierExportService)
  const approverIds = new Set<string>();
  approverIds.add(signerUserId);
  protocols.forEach(p => { if (p.signed_by_id) approverIds.add(p.signed_by_id); });
  const signatureMap: Record<string, string | null> = {};
  await Promise.all(
    Array.from(approverIds).map(async (userId) => {
      const key = `signatures/${userId}/signature.jpg`;
      signatureMap[userId] = await fetchToBase64(s3Url(key), key);
    })
  );
  const defaultSignB64 = signatureMap[signerUserId] ?? null;

  onProgress?.('Cargando datos de protocolos...');

  // Build user map + location map from protocols already loaded
  const userMap: Record<string, string> = {};
  const locMap: Record<string, Location> = {};
  protocols.forEach(p => {
    if (p.filledByName && p.filled_by_id) userMap[p.filled_by_id] = p.filledByName;
    if (p.signedByName && p.signed_by_id)  userMap[p.signed_by_id]  = p.signedByName;
    if (p.location && p.location_id) locMap[p.location_id] = p.location;
  });

  // v26 (FASE 7) — template UUID → id_protocolo. Necesario para el QR y, v43.6, para
  // KEYEAR la config de impresión (print_configs[idProtocolo]) y el campo "ID Protocolo".
  // Una sola query (siempre, no solo con QR).
  const templateIdProtoMap: Record<string, string> = {};
  {
    const tmplIds = Array.from(new Set(protocols.map(p => p.template_id).filter(Boolean) as string[]));
    if (tmplIds.length > 0) {
      const { data: tmpls } = await supabase
        .from('protocol_templates')
        .select('id, id_protocolo')
        .in('id', tmplIds);
      for (const t of (tmpls ?? []) as { id: string; id_protocolo: string }[]) {
        if (t.id_protocolo) templateIdProtoMap[t.id] = t.id_protocolo;
      }
    }
  }
  // Helper: id_protocolo + config resuelta de un protocolo.
  const idProtoOf = (full: DossierProtocolFull): string | null =>
    full.protocol.template_id ? (templateIdProtoMap[full.protocol.template_id] ?? null) : null;
  const cfgOf = (full: DossierProtocolFull): ResolvedPrintConfig =>
    getTemplatePrintConfig(projectFlags, idProtoOf(full));

  // Load full data for each protocol
  const fullData: DossierProtocolFull[] = [];
  for (let i = 0; i < protocols.length; i++) {
    onProgress?.(`Cargando protocolo ${i + 1}/${protocols.length}...`);
    const d = await fetchDossierProtocolFull(protocols[i].id, locMap, userMap, preloaded);
    onProgress?.(`Proto ${i + 1}: ${d.items.length} items, ${d.evidences.length} evidencias`);
    fullData.push(d);
  }

  onProgress?.('Generando PDF...');

  // Use preloaded project date instead of querying Supabase
  const projectStart = projectCreatedAt ? new Date(projectCreatedAt as string | number) : new Date();

  const generatedAt = fmtDateTime(new Date().toISOString());
  const approved = protocols.filter(p => p.status === 'APPROVED').length;
  // Total = all template slots across all locations (same as project progress denominator)
  const total = locations.reduce((sum, loc) => {
    const tids = loc.template_ids ? loc.template_ids.split(',').map(s => s.trim()).filter(Boolean) : [];
    return sum + tids.length;
  }, 0);

  const coverHtml = buildCoverPage(projectName, logoB64, approved, total, generatedAt, signerName, defaultSignB64);
  const statsHtml = buildStatsPage(protocols, locations, projectStart);

  // Group stats by location_only (for section cover pages)
  const groupStats: Record<string, { total: number; approved: number }> = {};
  for (const loc of locations) {
    const locOnly = loc.location_only ?? null;
    if (!locOnly) continue;
    if (!groupStats[locOnly]) groupStats[locOnly] = { total: 0, approved: 0 };
    const tids = loc.template_ids ? loc.template_ids.split(',').map(s => s.trim()).filter(Boolean) : [];
    groupStats[locOnly].total += tids.length;
  }
  for (const full of fullData) {
    const locOnly = full.protocol.location?.location_only ?? null;
    if (!locOnly || !groupStats[locOnly]) continue;
    if (full.protocol.status === 'APPROVED') groupStats[locOnly].approved++;
  }

  // Detect section cover count (unique adjacent location_only changes)
  let sectionCoverCount = 0;
  let _prevLocOnly: string | null = null;
  for (const full of fullData) {
    const locOnly = full.protocol.location?.location_only ?? null;
    if (locOnly && locOnly !== _prevLocOnly) {
      sectionCoverCount++;
      _prevLocOnly = locOnly;
    }
  }

  // First pass: calculate total pages AND page map for each protocol
  let totalDocPages = 3 + sectionCoverCount; // cover + stats + summary + section covers
  const evidenceEntriesByProto: { url: string; s3Key: string | null }[][] = [];
  const pageMap: Record<string, number> = {};
  let _calcPage = 4; // after cover + stats + summary
  let _calcPrevLocOnly: string | null = null;
  for (const full of fullData) {
    const curLocOnly = full.protocol.location?.location_only ?? null;
    if (curLocOnly && curLocOnly !== _calcPrevLocOnly) {
      _calcPage += 1; // section cover page
      _calcPrevLocOnly = curLocOnly;
    }

    pageMap[full.protocol.id] = _calcPage; // page where this protocol starts

    const cfgC = cfgOf(full);
    const protoPages = protoPageCount(full, equipmentEnabled, cfgC, headerColor, croquisOf(full, cfgC));
    totalDocPages += protoPages;
    _calcPage += protoPages;

    const entries = full.evidences.map(ev => {
      const key = ev.s3_key ?? ev.s3_url_placeholder ?? (ev as any).file_name;
      if (!key) return null;
      const url = key.startsWith('http') ? key : s3Url(key);
      const s3Key = key.startsWith('http') ? null : key;
      return { url, s3Key };
    }).filter(Boolean) as { url: string; s3Key: string | null }[];
    // v43.6 — Panel fotográfico solo si el tipo lo tiene activado (show_photos).
    evidenceEntriesByProto.push(cfgC.show_photos ? entries : []);
    if (cfgC.show_photos && entries.length > 0) {
      const photoPages = Math.ceil(entries.length / 8);
      totalDocPages += photoPages;
      _calcPage += photoPages;
    }
  }

  const summaryHtml = buildSummaryTable(protocols, pageMap);

  // Second pass: build HTML with correct page numbers, panel right after its protocol
  let globalPage = 4; // starts after cover + stats + summary
  const contentParts: string[] = [];
  let prevLocationOnly: string | null = null;

  for (let i = 0; i < fullData.length; i++) {
    const full = fullData[i];
    const entries = evidenceEntriesByProto[i];
    const curLocOnly = full.protocol.location?.location_only ?? null;

    // Insert section cover at group boundary
    if (curLocOnly && curLocOnly !== prevLocationOnly) {
      const stats = groupStats[curLocOnly] ?? { total: 0, approved: 0 };
      contentParts.push(buildSectionCoverPage(curLocOnly, logoB64, projectName, stats.total, stats.approved));
      globalPage += 1;
      prevLocationOnly = curLocOnly;
    }

    // Per-approver signature (same logic as mobile DossierExportService lines 1043-1053)
    const protoSignB64 = full.protocol.signed_by_id
      ? (signatureMap[full.protocol.signed_by_id] ?? defaultSignB64)
      : defaultSignB64;
    const protoSignerName = full.protocol.signedByName ?? signerName;

    // Protocol pages
    const cfgR = cfgOf(full);
    const croquisR = croquisOf(full, cfgR);
    const protoPages = protoPageCount(full, equipmentEnabled, cfgR, headerColor, croquisR);
    // Cargar firmas adicionales para approvers multi-nivel en PARALELO — antes
    // se hacía sequential (1 await por aprobación) dentro del loop de protocolos,
    // causando 50 protos × 3 niveles = 150 round-trips serializados.
    if (full.approvals && full.approvals.length > 0) {
      const missingSigners = full.approvals
        .map(a => a.signer_id)
        .filter((id): id is string => !!id && !(id in signatureMap));
      if (missingSigners.length > 0) {
        await Promise.all(missingSigners.map(async (sid) => {
          const k = `signatures/${sid}/signature.jpg`;
          signatureMap[sid] = await fetchToBase64(s3Url(k), k);
        }));
      }
    }
    const idProtoR = idProtoOf(full);
    let qrSvg: string | undefined;
    // v43.6 — QR si el flag global QR está on Y el tipo lo permite (show_qr).
    if (qrEnabled && cfgR.show_qr) {
      try {
        const { generateProtocolQr } = await import('@lib/qrCodeGenerator');
        const qr = await generateProtocolQr({
          idProtocolo: idProtoR,
          externalId: full.protocol.external_id ?? null,
          protocolUuid: full.protocol.id,
          size: 72,
        });
        qrSvg = qr.svg;
      } catch (e) { console.warn('[PDF] QR generation failed:', e); }
    }
    // v26 — Pre-cargar xrefValues si el protocolo tiene refs `@`. Una sola query
    // por protocolo. Falla silenciosa → las refs muestran ⚠ en el chart pero el
    // PDF sigue generándose.
    // v42e (H5) — Un protocolo APROBADO es histórico inmutable: sus celdas/gráficos
    // deben leerse del snapshot CONGELADO (comments), nunca re-resolver el xref en
    // vivo (si la fuente @código cambió/se reusó, el PDF firmado mostraría datos
    // distintos a los aprobados → rompe la trazabilidad). Solo DRAFT/SUBMITTED
    // resuelven en vivo. Para fichas sin `@`, recomputar == congelado (sin cambio).
    let xrefValuesForPdf: XrefValues | undefined;
    if (full.protocol.status !== 'APPROVED') {
      try {
        const { fetchXrefValues } = await import('@hooks/useXrefs');
        xrefValuesForPdf = await fetchXrefValues(projectId, full.items);
      } catch (e) { console.warn('[PDF] xref fetch failed:', e); }
    }
    const pHtml = buildProtocolPages(full, logoB64, protoSignB64, protoSignerName, globalPage, totalDocPages, projectName, signatureMap, qrSvg, xrefValuesForPdf, equipmentEnabled, auxTablesForPdf, cfgR, headerColor, idProtoR, croquisR);
    contentParts.push(pHtml);
    globalPage += protoPages;

    // Photo panel right after its protocol
    if (entries.length > 0) {
      onProgress?.(`Descargando fotos ${full.protocol.protocol_number}...`);
      const locName = full.protocol.location
        ? `${full.protocol.location.location_only ?? ''}-${full.protocol.location.specialty ?? ''}`.replace(/^-|-$/g, '')
        : null;
      const photoHtml = await buildPhotoPanel(
        full.protocol.protocol_number ?? full.protocol.id,
        locName,
        entries, logoB64, protoSignB64, protoSignerName, globalPage, totalDocPages,
      );
      if (photoHtml) {
        contentParts.push(photoHtml);
        globalPage += Math.ceil(entries.length / 8);
      }
    }
  }

  const bodyHtml = [coverHtml, statsHtml, summaryHtml, ...contentParts].join('\n');
  const html = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8">
<title>Dosier — ${escHtml(projectName)}</title>
<style>${CSS}</style>
</head><body>${bodyHtml}</body></html>`;

  const now = new Date();
  const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const safeName = projectName.replace(/[^a-zA-Z0-9áéíóúÁÉÍÓÚñÑüÜ\s]/g, '').trim().replace(/\s+/g, '_');
  await generateAndDownloadPdf(html, `DOSIER-${safeName}-${dateStr}.pdf`);
}

export async function exportSingleProtocolPdf(
  protocolId: string,
  projectName: string,
  signerName: string,
  signerUserId: string,
  logoS3Key: string | null,
  locMap: Record<string, Location>,
  userMap: Record<string, string>,
  /** v26 (FASE 7) — Incluir QR en el header del PDF. */
  includeQrCode?: boolean,
  /** v24 (FASE 4) — Incluir sección "Equipos utilizados". Pasar `flags.equipment_catalog`. */
  includeEquipment?: boolean,
): Promise<void> {
  const defaultSignKey = `signatures/${signerUserId}/signature.jpg`;
  const [logoB64, defaultSignB64] = await Promise.all([
    logoS3Key ? fetchToBase64(s3Url(logoS3Key), logoS3Key) : Promise.resolve(null),
    fetchToBase64(s3Url(defaultSignKey), defaultSignKey),
  ]);

  const full = await fetchDossierProtocolFull(protocolId, locMap, userMap);

  // Per-approver signature: use the specific approver's signature if available
  let signB64 = defaultSignB64;
  let actualSignerName = signerName;
  if (full.protocol.signed_by_id && full.protocol.signed_by_id !== signerUserId) {
    const approverKey = `signatures/${full.protocol.signed_by_id}/signature.jpg`;
    const approverSign = await fetchToBase64(s3Url(approverKey), approverKey);
    if (approverSign) signB64 = approverSign;
  }
  if (full.protocol.signedByName) actualSignerName = full.protocol.signedByName;

  // v43.6 — Config de impresión del tipo + color global (los define el creador en
  // móvil; viven en projects.feature_flags). idProtocolo se reusa para QR y header.
  let projectFlags: unknown = {};
  let idProto: string | null = null;
  let orthoRow: { orthophoto_s3_key?: string | null; orthophoto_bounds_json?: unknown } | null = null;
  try {
    const [prRes, tRes] = await Promise.all([
      supabase.from('projects').select('feature_flags, orthophoto_s3_key, orthophoto_bounds_json').eq('id', full.protocol.project_id).maybeSingle(),
      full.protocol.template_id
        ? supabase.from('protocol_templates').select('id_protocolo').eq('id', full.protocol.template_id).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);
    projectFlags = (prRes.data as { feature_flags?: unknown } | null)?.feature_flags ?? {};
    orthoRow = prRes.data as typeof orthoRow;
    idProto = (tRes.data as { id_protocolo?: string } | null)?.id_protocolo ?? null;
  } catch { /* defaults */ }
  const cfg = getTemplatePrintConfig(projectFlags, idProto);
  const headerColor = getPrintHeaderColor(projectFlags);
  // v43.6 — Croquis (sectores + ortofoto del proyecto).
  const [geomSectorsS, croquisOrthoS] = await Promise.all([
    loadGeomSectors(full.protocol.project_id),
    loadCroquisOrtho(orthoRow),
  ]);
  const croquisS = croquisBlockFor(full, cfg, geomSectorsS, croquisOrthoS);

  const allEvidenceEntries = full.evidences.map(ev => {
      const key = ev.s3_key ?? ev.s3_url_placeholder ?? (ev as any).file_name;
      if (!key) return null;
      const url = key.startsWith('http') ? key : s3Url(key);
      const s3Key = key.startsWith('http') ? null : key;
      return { url, s3Key };
    }).filter(Boolean) as { url: string; s3Key: string | null }[];
  // Panel fotográfico solo si el tipo lo tiene activado.
  const evidenceEntries = cfg.show_photos ? allEvidenceEntries : [];

  const chunks = protoPageCount(full, includeEquipment !== false, cfg, headerColor, croquisS);
  const totalDocPages = chunks + (evidenceEntries.length > 0 ? Math.ceil(evidenceEntries.length / 8) : 0);

  // Cargar firmas adicionales si hay aprobaciones multi-nivel
  const sigMapSingle: Record<string, string | null> = {};
  if (full.protocol.signed_by_id) sigMapSingle[full.protocol.signed_by_id] = signB64;
  if (full.approvals && full.approvals.length > 0) {
    for (const a of full.approvals) {
      if (a.signer_id && !(a.signer_id in sigMapSingle)) {
        const k = `signatures/${a.signer_id}/signature.jpg`;
        sigMapSingle[a.signer_id] = await fetchToBase64(s3Url(k), k);
      }
    }
  }
  let qrSvgSingle: string | undefined;
  if (includeQrCode && cfg.show_qr) {
    try {
      const { generateProtocolQr } = await import('@lib/qrCodeGenerator');
      const qr = await generateProtocolQr({
        idProtocolo: idProto,
        externalId: full.protocol.external_id ?? null,
        protocolUuid: full.protocol.id,
        size: 72,
      });
      qrSvgSingle = qr.svg;
    } catch (e) { console.warn('[PDF] QR generation failed:', e); }
  }
  // v42e (H5) — APROBADO = inmutable: no re-resolver xref en vivo (ver nota arriba).
  let xrefValuesSingle: XrefValues | undefined;
  if (full.protocol.status !== 'APPROVED') {
    try {
      const { fetchXrefValues } = await import('@hooks/useXrefs');
      xrefValuesSingle = await fetchXrefValues(full.protocol.project_id, full.items);
    } catch (e) { console.warn('[PDF] xref fetch failed:', e); }
  }
  const auxTablesSingle = await fetchAuxTablesMap(full.protocol.project_id);   // v41 — BUSCAR() en PDF
  const protoHtml = buildProtocolPages(full, logoB64, signB64, actualSignerName, 1, totalDocPages, projectName, sigMapSingle, qrSvgSingle, xrefValuesSingle, includeEquipment !== false, auxTablesSingle, cfg, headerColor, idProto, croquisS);
  const locName = full.protocol.location
    ? `${full.protocol.location.location_only ?? ''}-${full.protocol.location.specialty ?? ''}`.replace(/^-|-$/g, '')
    : null;
  const photoHtml = evidenceEntries.length > 0
    ? await buildPhotoPanel(full.protocol.protocol_number ?? protocolId, locName, evidenceEntries, logoB64, signB64, actualSignerName, chunks + 1, totalDocPages)
    : '';

  const html = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8">
<title>${escHtml(full.protocol.protocol_number ?? protocolId)}</title>
<style>${CSS}</style>
</head><body>${protoHtml}${photoHtml}</body></html>`;

  const now = new Date();
  const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const safeName = (full.protocol.protocol_number ?? protocolId).replace(/[^a-zA-Z0-9\-_]/g, '_');
  await generateAndDownloadPdf(html, `PROTOCOLO-${safeName}-${dateStr}.pdf`);
}

// ── Reporte rápido de calibración (#5b) ────────────────────────────────────────
//
// Lista los equipos de laboratorio y las tablas auxiliares con su última y
// próxima calibración + días restantes (mismo cálculo que el badge de la UI).
// Mira solo datos de calibración; no procesa cálculos de ensayos.

export interface CalibEquipInput {
  code: string | null;
  name: string | null;
  type: string | null;
  brand?: string | null;
  model?: string | null;
  serial?: string | null;
  last_calibration_at?: number | null;
  next_calibration_at?: number | null;
}
export interface CalibTableInput {
  group_key: string;
  name: string | null;
  columns_count: number;
  rows_count: number;
  last_calibration_at?: number | null;
  next_calibration_at?: number | null;
}
export interface CalibReportOptions {
  projectName: string;
  equipos: CalibEquipInput[];
  tablas: CalibTableInput[];
}

/** Estado de calibración (días restantes hasta la próxima). Mismo umbral que la UI. */
function calibStatus(ms: number | null | undefined): { text: string; bg: string; fg: string; order: number } {
  if (!ms) return { text: 'Sin fecha', bg: '#eceff3', fg: '#888', order: 3 };
  const days = Math.ceil((ms - Date.now()) / 86400000);
  if (days < 0)   return { text: `Vencida hace ${-days} día${-days === 1 ? '' : 's'}`, bg: '#fdecea', fg: '#d93025', order: 0 };
  if (days === 0) return { text: 'Vence hoy', bg: '#fdf0d5', fg: '#b8860b', order: 1 };
  if (days <= 30) return { text: `Faltan ${days} día${days === 1 ? '' : 's'}`, bg: '#fdf0d5', fg: '#b8860b', order: 2 };
  return { text: `Faltan ${days} días`, bg: '#e7f4ea', fg: '#1e8e3e', order: 4 };
}

function calibRows(items: { c1: string; c2: string; c3: string; last: number | null | undefined; next: number | null | undefined }[]): string {
  if (items.length === 0) {
    return `<tr><td colspan="6" style="text-align:center;color:#aaa;font-style:italic;">Sin registros.</td></tr>`;
  }
  // Orden: lo más urgente primero (vencidas → próximas → ok → sin fecha).
  const sorted = [...items].sort((a, b) => calibStatus(a.next).order - calibStatus(b.next).order);
  return sorted.map(it => {
    const st = calibStatus(it.next);
    return `<tr>
      <td><strong>${escHtml(it.c1)}</strong></td>
      <td>${escHtml(it.c2)}</td>
      <td>${escHtml(it.c3)}</td>
      <td>${fmtDate(it.last ?? null)}</td>
      <td>${fmtDate(it.next ?? null)}</td>
      <td><span class="status-badge" style="background:${st.bg};color:${st.fg};">${st.text}</span></td>
    </tr>`;
  }).join('');
}

export async function generateCalibrationReportPdf(opts: CalibReportOptions): Promise<void> {
  const { projectName, equipos, tablas } = opts;
  const now = new Date();
  const generatedAt = fmtDateTime(now.getTime());

  // Resumen de estado (cuántos vencidos / por vencer).
  const allNext = [...equipos.map(e => e.next_calibration_at), ...tablas.map(t => t.next_calibration_at)];
  const vencidas = allNext.filter(ms => ms && Math.ceil((ms - Date.now()) / 86400000) < 0).length;
  const porVencer = allNext.filter(ms => ms && (() => { const d = Math.ceil((ms - Date.now()) / 86400000); return d >= 0 && d <= 30; })()).length;

  const equipBody = calibRows(equipos.map(e => ({
    c1: e.code ?? '—',
    c2: e.name ?? '—',
    c3: [e.type ? String(e.type).replace(/_/g, ' ') : '', e.brand ?? '', e.model ?? ''].filter(Boolean).join(' · ') || '—',
    last: e.last_calibration_at,
    next: e.next_calibration_at,
  })));
  const tablaBody = calibRows(tablas.map(t => ({
    c1: t.group_key,
    c2: t.name ?? t.group_key,
    c3: `${t.columns_count} col · ${t.rows_count} filas`,
    last: t.last_calibration_at,
    next: t.next_calibration_at,
  })));

  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"/><style>${CSS}</style></head><body>
  <div class="page">
    <div class="proto-header">
      <div class="proto-header-center"><div class="proto-name">Reporte de Calibración</div></div>
      <div class="proto-num">${escHtml(generatedAt)}</div>
    </div>
    <div class="proto-info-grid">
      <div class="proto-info-row">
        <div class="proto-info-cell"><span class="proto-info-label">Proyecto</span><span class="proto-info-value">${escHtml(projectName)}</span></div>
        <div class="proto-info-cell"><span class="proto-info-label">Equipos de laboratorio</span><span class="proto-info-value">${equipos.length}</span></div>
        <div class="proto-info-cell"><span class="proto-info-label">Tablas auxiliares</span><span class="proto-info-value">${tablas.length}</span></div>
      </div>
      <div class="proto-info-row">
        <div class="proto-info-cell"><span class="proto-info-label">Calibraciones vencidas</span><span class="proto-info-value" style="color:${vencidas ? '#d93025' : '#1e8e3e'}">${vencidas}</span></div>
        <div class="proto-info-cell"><span class="proto-info-label">Por vencer (≤30 días)</span><span class="proto-info-value" style="color:${porVencer ? '#b8860b' : '#1e8e3e'}">${porVencer}</span></div>
      </div>
    </div>

    <div class="section-group-header">Equipos de laboratorio</div>
    <table>
      <thead><tr><th>Código</th><th>Equipo</th><th>Tipo / Marca</th><th>Última calib.</th><th>Próxima calib.</th><th>Estado</th></tr></thead>
      <tbody>${equipBody}</tbody>
    </table>

    <div class="section-group-header" style="margin-top:18px;">Tablas auxiliares (grupos calibrables)</div>
    <table>
      <thead><tr><th>Llave</th><th>Tabla</th><th>Contenido</th><th>Última calib.</th><th>Próxima calib.</th><th>Estado</th></tr></thead>
      <tbody>${tablaBody}</tbody>
    </table>

    <div class="proto-footer">
      <div class="footer-right">Reporte de Calibración · ${escHtml(projectName)}<br/>Generado el ${escHtml(generatedAt)}</div>
    </div>
  </div>
  </body></html>`;

  const dateStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const safeName = projectName.replace(/[^a-zA-Z0-9\-_]/g, '_');
  await generateAndDownloadPdf(html, `CALIBRACION-${safeName}-${dateStr}.pdf`);
}
