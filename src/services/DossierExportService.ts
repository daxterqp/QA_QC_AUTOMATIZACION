/**
 * DossierExportService
 *
 * Genera un PDF profesional de Dosier de Calidad para un proyecto.
 * Incluye:
 *   - Portada con logo, resumen estadístico
 *   - Página de estadísticas (gráfica vertical semanal + horizontal por especialidad, SVG inline)
 *   - Tabla resumen de todos los protocolos
 *   - Sección detallada por protocolo con logo + firma al pie
 *
 * Tipografía: Montserrat vía Google Fonts CDN (fallback Helvetica/Arial sin internet)
 * Tecnología: expo-print (HTML → PDF nativo)
 */

import * as Print from 'expo-print';
import * as FileSystem from 'expo-file-system';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Image } from 'react-native';
import { Q } from '@nozbe/watermelondb';
import {
  protocolsCollection,
  protocolItemsCollection,
  evidencesCollection,
  usersCollection,
  locationsCollection,
  projectsCollection,
  protocolTemplatesCollection,
} from '@db/index';
import { getProjectSettings } from './ProjectSettings';
import { getOrDownloadSignatureUri } from './UserSignatureService';
import type Protocol from '@db/models/Protocol';
import type ProtocolItem from '@db/models/ProtocolItem';
import type Location from '@db/models/Location';
import type User from '@db/models/User';

// ── Helpers ───────────────────────────────────────────────────────────────────

function pad(n: number) { return String(n).padStart(2, '0'); }

function fmtDate(ts: number | null | undefined): string {
  if (!ts) return '—';
  const d = new Date(ts);
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}

function fmtDateTime(ts: number | null | undefined): string {
  if (!ts) return '—';
  const d = new Date(ts);
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function getTs(val: any): number {
  if (typeof val === 'number') return val;
  if (val instanceof Date) return val.getTime();
  return 0;
}

async function toBase64(uri: string | null): Promise<string | null> {
  if (!uri) return null;
  try {
    const b64 = await FileSystem.readAsStringAsync(uri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    return `data:image/jpeg;base64,${b64}`;
  } catch { return null; }
}

function escHtml(s: string | null | undefined): string {
  if (!s) return '';
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function getImageOrientation(uri: string): Promise<'portrait' | 'landscape'> {
  return new Promise((resolve) => {
    Image.getSize(
      uri,
      (w, h) => resolve(h >= w ? 'portrait' : 'landscape'),
      () => resolve('portrait'),
    );
  });
}

// ── Cálculo de semanas (mismo algoritmo que HistoricalScreen) ─────────────────

function getWeekBoundaries(projectStart: Date): Array<{ start: number; end: number }> {
  const now = Date.now();
  const day = projectStart.getDay();
  const daysToSunday = day === 0 ? 0 : 7 - day;
  const week1End = new Date(projectStart);
  week1End.setDate(projectStart.getDate() + daysToSunday);
  week1End.setHours(23, 59, 59, 999);

  const weeks: Array<{ start: number; end: number }> = [
    { start: projectStart.getTime(), end: week1End.getTime() },
  ];

  let wkStart = new Date(week1End.getTime() + 1);
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

// ── Gráfica vertical: aprobados por semana (SVG) ──────────────────────────────

function buildWeeklyChartSvg(
  protocols: Protocol[],
  projectStart: Date,
): string {
  const weeks = getWeekBoundaries(projectStart);
  const counts = weeks.map(({ start, end }) =>
    protocols.filter(p => {
      if (p.status !== 'APPROVED') return false;
      const ts = p.signedAt ?? getTs(p.updatedAt);
      return ts >= start && ts <= end;
    }).length
  );

  // Limitar a últimas 20 semanas para que quepa
  const display = counts.length > 20 ? counts.slice(-20) : counts;
  const offset = counts.length > 20 ? counts.length - 20 : 0;

  const maxVal = Math.max(...display, 1);
  const svgW = 680;
  const svgH = 200;
  const padL = 36;
  const padR = 10;
  const padT = 16;
  const padB = 38;
  const chartW = svgW - padL - padR;
  const chartH = svgH - padT - padB;
  const n = display.length;
  const barW = Math.max(4, Math.floor((chartW / n) * 0.65));
  const gap = Math.floor(chartW / n);

  let bars = '';
  let xLabels = '';

  display.forEach((cnt, i) => {
    const x = padL + i * gap + Math.floor((gap - barW) / 2);
    const barH = cnt > 0 ? Math.max(4, Math.round((cnt / maxVal) * chartH)) : 2;
    const y = padT + chartH - barH;
    const weekNum = offset + i + 1;
    bars += `<rect x="${x}" y="${y}" width="${barW}" height="${barH}" fill="#1a4f7a" rx="3"/>`;
    if (cnt > 0) {
      bars += `<text x="${x + barW / 2}" y="${y - 4}" text-anchor="middle" font-size="9" fill="#333" font-weight="700">${cnt}</text>`;
    }
    if (n <= 16 || i % 2 === 0) {
      xLabels += `<text x="${x + barW / 2}" y="${padT + chartH + 16}" text-anchor="middle" font-size="9" fill="#666">S${weekNum}</text>`;
    }
  });

  // Líneas del eje Y
  let yLines = '';
  const steps = Math.min(maxVal, 5);
  for (let s = 0; s <= steps; s++) {
    const val = Math.round((maxVal / steps) * s);
    const y = padT + chartH - Math.round((val / maxVal) * chartH);
    yLines += `<line x1="${padL}" y1="${y}" x2="${padL + chartW}" y2="${y}" stroke="#e5e8ec" stroke-width="1"/>`;
    yLines += `<text x="${padL - 4}" y="${y + 3}" text-anchor="end" font-size="9" fill="#999">${val}</text>`;
  }

  return `
<svg xmlns="http://www.w3.org/2000/svg" width="${svgW}" height="${svgH}" viewBox="0 0 ${svgW} ${svgH}">
  <rect width="${svgW}" height="${svgH}" fill="white" rx="6"/>
  ${yLines}
  ${bars}
  ${xLabels}
  <text x="${svgW/2}" y="${svgH - 4}" text-anchor="middle" font-size="10" fill="#888">Semana del proyecto</text>
</svg>`;
}

// ── Gráfica horizontal: avance por especialidad (SVG) ─────────────────────────

function buildSpecialtySvg(protocols: Protocol[], locations: Location[]): string {
  const locSpecMap: Record<string, string> = {};
  locations.forEach(l => { if (l.specialty) locSpecMap[l.id] = l.specialty; });

  const specTotals: Record<string, number> = {};
  locations.forEach(loc => {
    const sp = loc.specialty?.trim();
    if (!sp) return;
    const count = loc.templateIds ? loc.templateIds.split(',').filter(s => s.trim()).length : 0;
    if (count > 0) specTotals[sp] = (specTotals[sp] ?? 0) + count;
  });

  const specApproved: Record<string, number> = {};
  protocols.forEach(p => {
    if (!p.locationId) return;
    const sp = locSpecMap[p.locationId];
    if (!sp || p.status !== 'APPROVED') return;
    specApproved[sp] = (specApproved[sp] ?? 0) + 1;
  });

  const data = Object.entries(specTotals)
    .map(([name, total]) => ({ name, total, approved: specApproved[name] ?? 0 }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 12); // máx 12 especialidades

  if (data.length === 0) return '';

  const rowH = 32;
  const labelW = 130;
  const barAreaW = 480;
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
      <text x="${labelW + totalBarW + 6}" y="${y + 18}" font-size="10" fill="#333" font-weight="700">${approved}/${total} (${pct}%)</text>
    `;
  });

  return `
<svg xmlns="http://www.w3.org/2000/svg" width="${svgW}" height="${svgH}" viewBox="0 0 ${svgW} ${svgH}">
  <rect width="${svgW}" height="${svgH}" fill="white" rx="6"/>
  ${rows}
</svg>`;
}

// ── Color por estado ───────────────────────────────────────────────────────────

function statusLabel(s: string): string {
  if (s === 'APPROVED') return 'APROBADO';
  if (s === 'REJECTED') return 'RECHAZADO';
  if (s === 'SUBMITTED') return 'EN REVISIÓN';
  if (s === 'IN_PROGRESS') return 'EN PROGRESO';
  return s;
}

function statusColor(s: string): string {
  if (s === 'APPROVED') return '#1e8e3e';
  if (s === 'REJECTED') return '#d93025';
  if (s === 'SUBMITTED') return '#1a4f7a';
  return '#666';
}

// ── CSS base ──────────────────────────────────────────────────────────────────

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Montserrat:wght@400;600;700;900&display=swap');

* { box-sizing: border-box; margin: 0; padding: 0; }
body {
  font-family: 'Montserrat', Helvetica, Arial, sans-serif;
  font-size: 10.5px;
  color: #1a1a2e;
  background: white;
}
h1 { font-size: 28px; font-weight: 900; letter-spacing: 1px; }
h2 { font-size: 16px; font-weight: 700; letter-spacing: 0.5px; margin-bottom: 10px; }
h3 { font-size: 12px; font-weight: 700; letter-spacing: 0.4px; margin-bottom: 6px; }

.page { page-break-before: always; padding: 32px 36px 150px 36px; min-height: 100vh; position: relative; }
.page:first-child { page-break-before: avoid; padding-bottom: 36px; }

/* ── Portada ── */
.cover { display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 70vh; gap: 14px; text-align: center; }
.cover-logo { max-height: 240px; max-width: 520px; object-fit: contain; margin-bottom: 28px; }
.cover-title { font-size: 34px; font-weight: 900; color: #0e213d; letter-spacing: 2px; text-transform: uppercase; }
.cover-project { font-size: 18px; font-weight: 700; color: #1a4f7a; margin-top: 4px; }
.cover-date { font-size: 11px; color: #666; margin-top: 2px; }
.cover-divider { width: 80px; height: 3px; background: #1a4f7a; margin: 16px auto; border-radius: 2px; }
.cover-ornament { display: flex; align-items: center; gap: 14px; width: 78%; margin: 0 auto; }
.ornament-line { flex: 1; height: 2px; background: linear-gradient(to right, transparent, #1a4f7a 25%, #1a4f7a 75%, transparent); border-radius: 2px; }
.ornament-dots { color: #1a4f7a; font-size: 13px; letter-spacing: 8px; font-weight: 700; }
.stat-boxes { display: flex; flex-direction: row; gap: 16px; margin-top: 16px; flex-wrap: wrap; justify-content: center; }
.stat-box { border-radius: 10px; padding: 16px 24px; min-width: 100px; text-align: center; }
.stat-box-num { font-size: 28px; font-weight: 900; }
.stat-box-lbl { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; margin-top: 2px; }

/* ── Estadísticas ── */
.chart-section { margin-bottom: 28px; }
.chart-title { font-size: 12px; font-weight: 700; color: #0e213d; letter-spacing: 0.5px; margin-bottom: 10px; padding-bottom: 6px; border-bottom: 1px solid #e5e8ec; }
.chart-container { background: #f8f9fc; border-radius: 8px; padding: 12px; overflow: hidden; }
.chart-container svg { display: block; max-width: 100%; }
.chart-legend { display: flex; flex-direction: row; gap: 16px; margin-top: 8px; }
.legend-item { display: flex; align-items: center; gap: 6px; font-size: 10px; color: #555; }
.legend-dot { width: 10px; height: 10px; border-radius: 50%; display: inline-block; }

/* ── Tabla resumen ── */
table { width: 100%; border-collapse: collapse; font-size: 10px; }
thead th { background: #0e213d; color: white; padding: 8px 10px; font-weight: 700; text-align: left; font-size: 9.5px; letter-spacing: 0.3px; }
tbody tr:nth-child(even) { background: #f4f6f9; }
tbody td { padding: 7px 10px; border-bottom: 1px solid #e5e8ec; vertical-align: top; line-height: 1.4; }
.status-badge { display: inline-block; padding: 2px 7px; border-radius: 4px; font-size: 8.5px; font-weight: 700; color: white; text-transform: uppercase; letter-spacing: 0.3px; white-space: nowrap; }
.td-compliant { color: #1e8e3e; font-weight: 700; font-size: 12px; }
.td-noncompliant { color: #d93025; font-weight: 700; font-size: 12px; }
.td-noanswer { color: #aaa; }

/* ── Protocolo individual ── */
.proto-header { display: flex; flex-direction: row; align-items: center; margin-bottom: 16px; gap: 12px; border-bottom: 2px solid #0e213d; padding-bottom: 12px; }
.proto-logo { max-height: 56px; max-width: 100px; object-fit: contain; }
.proto-header-center { flex: 1; display: flex; align-items: center; justify-content: center; }
.proto-num { font-size: 10px; font-weight: 700; color: #1a4f7a; text-align: right; min-width: 80px; }
.proto-name { font-size: 18px; font-weight: 900; color: #0e213d; text-transform: uppercase; letter-spacing: 0.5px; text-align: center; }
.section-group-header { background: #e8eef5; padding: 5px 10px; font-size: 10px; font-weight: 700; color: #1a4f7a; text-transform: uppercase; letter-spacing: 0.4px; border-radius: 4px; margin: 8px 0 4px 0; }

/* ── Info grid por protocolo ── */
.proto-info-grid { display: flex; flex-direction: column; gap: 4px; margin-bottom: 10px; }
.proto-info-row { display: flex; flex-direction: row; gap: 6px; }
.proto-info-cell { flex: 1; background: #f4f6f9; border-radius: 5px; padding: 5px 9px; display: flex; flex-direction: column; }
.proto-info-label { font-size: 8px; font-weight: 700; color: #888; text-transform: uppercase; letter-spacing: 0.3px; }
.proto-info-value { font-size: 10px; font-weight: 600; color: #1a1a2e; margin-top: 1px; }
.proto-divider { border: none; border-top: 2px solid #1a4f7a; margin: 10px 0; }

/* ── Footer firma (fijado al fondo de cada página) ── */
.proto-footer { position: absolute; bottom: 32px; left: 36px; right: 36px; border-top: 1px solid #ddd; padding-top: 12px; display: flex; flex-direction: row; align-items: flex-end; gap: 16px; }
.signature-block { text-align: center; }
.signature-img { max-height: 60px; max-width: 150px; object-fit: contain; display: block; margin-bottom: 4px; }
.signature-line { width: 160px; border-bottom: 1px solid #333; margin-bottom: 4px; }
.signature-name { font-size: 10px; font-weight: 700; color: #0e213d; }
.signature-role { font-size: 9px; color: #666; }
.footer-right { flex: 1; text-align: right; font-size: 9px; color: #aaa; line-height: 1.6; }

/* Ocultar elemento si vacío */
.hide-if-empty:empty { display: none; }

/* ── Panel fotográfico ── */
.photo-panel-title { flex: 1; font-size: 13px; font-weight: 900; color: #0e213d; text-transform: uppercase; letter-spacing: 0.5px; text-align: center; }
.photo-page-header { display: flex; flex-direction: row; align-items: center; gap: 12px; margin-bottom: 12px; padding-bottom: 10px; border-bottom: 2px solid #0e213d; }
/* ── Fotos verticales 4-col ── */
.photo-grid-v { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 8px; }
.photo-cell-v { width: calc(25% - 6px); aspect-ratio: 3/4; overflow: hidden; border-radius: 4px; background: #f0f0f0; }
.photo-cell-v img { width: 100%; height: 100%; object-fit: cover; }
/* ── Fotos horizontales 3-col ── */
.photo-grid-h { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 8px; }
.photo-cell-h { width: calc(33.33% - 6px); aspect-ratio: 4/3; overflow: hidden; border-radius: 4px; background: #f0f0f0; }
.photo-cell-h img { width: 100%; height: 100%; object-fit: cover; }

/* ── Portada info-list ── */
.cover-info-list { width: 72%; margin: 0 auto; display: flex; flex-direction: column; gap: 0; }
.cover-info-row { display: flex; flex-direction: row; align-items: flex-end; padding: 10px 0; border-bottom: 1px solid #c8d0db; }
.cover-info-label { font-size: 13px; font-weight: 700; color: #0e213d; min-width: 200px; }
.cover-info-value { flex: 1; font-size: 13px; font-weight: 600; color: #1a4f7a; padding-left: 8px; }
.cover-signature-img { max-height: 48px; max-width: 120px; object-fit: contain; display: block; margin: 0 auto; }
`;

// ── Portada HTML ───────────────────────────────────────────────────────────────

function buildCoverPage(
  projectName: string,
  logoB64: string | null,
  approved: number,
  total: number,
  generatedAt: string,
  signerName: string,
  signB64: string | null,
): string {
  const logoHtml = logoB64
    ? `<img src="${logoB64}" class="cover-logo" alt="Logo"/>`
    : '';

  const signatureHtml = signB64
    ? `<img src="${signB64}" class="cover-signature-img" alt="Firma"/>`
    : '<div style="width:120px;border-bottom:1px solid #333;height:1px;"></div>';

  return `
<div class="page">
  <div class="cover">
    ${logoHtml}
    <div class="cover-ornament">
      <span class="ornament-line"></span>
      <span class="ornament-dots">◆ ◇ ◆</span>
      <span class="ornament-line"></span>
    </div>
    <div>
      <div class="cover-title">Dosier de Calidad</div>
      <div class="cover-date">Generado el ${generatedAt}</div>
    </div>
    <div class="cover-ornament">
      <span class="ornament-line"></span>
      <span class="ornament-dots">◆ ◇ ◆</span>
      <span class="ornament-line"></span>
    </div>
    <div class="cover-divider"></div>

    <div class="cover-info-list">
      <div class="cover-info-row">
        <span class="cover-info-label">Proyecto</span>
        <span class="cover-info-value">${escHtml(projectName)}</span>
      </div>
      <div class="cover-info-row">
        <span class="cover-info-label">Total protocolos</span>
        <span class="cover-info-value">${total}</span>
      </div>
      <div class="cover-info-row">
        <span class="cover-info-label">Protocolos aprobados</span>
        <span class="cover-info-value">${approved}</span>
      </div>
      <div class="cover-info-row">
        <span class="cover-info-label">Jefe de calidad</span>
        <span class="cover-info-value">${escHtml(signerName)}</span>
      </div>
      <div class="cover-info-row" style="align-items:center;">
        <span class="cover-info-label">Firma</span>
        <span class="cover-info-value">${signatureHtml}</span>
      </div>
    </div>
  </div>
</div>`;
}

// ── Carátula de sección (por grupo location_only) ────────────────────────────

function buildSectionCoverPage(
  locationOnly: string,
  logoB64: string | null,
  projectName: string,
  totalInGroup: number,
  approvedInGroup: number,
): string {
  const logoHtml = logoB64
    ? `<img src="${logoB64}" class="cover-logo" alt="Logo"/>`
    : '';
  return `
<div class="page">
  <div class="cover">
    ${logoHtml}
    <div class="cover-ornament">
      <span class="ornament-line"></span>
      <span class="ornament-dots">◆ ◇ ◆</span>
      <span class="ornament-line"></span>
    </div>
    <div>
      <div class="cover-title">Protocolos — ${escHtml(locationOnly)}</div>
    </div>
    <div class="cover-ornament">
      <span class="ornament-line"></span>
      <span class="ornament-dots">◆ ◇ ◆</span>
      <span class="ornament-line"></span>
    </div>
    <div class="cover-divider"></div>
    <div class="cover-info-list">
      <div class="cover-info-row">
        <span class="cover-info-label">Proyecto</span>
        <span class="cover-info-value">${escHtml(projectName)}</span>
      </div>
      <div class="cover-info-row">
        <span class="cover-info-label">Sector</span>
        <span class="cover-info-value">${escHtml(locationOnly)}</span>
      </div>
      <div class="cover-info-row">
        <span class="cover-info-label">Total protocolos</span>
        <span class="cover-info-value">${totalInGroup}</span>
      </div>
      <div class="cover-info-row">
        <span class="cover-info-label">Protocolos aprobados</span>
        <span class="cover-info-value">${approvedInGroup}</span>
      </div>
    </div>
  </div>
</div>`;
}

// ── Página de estadísticas ─────────────────────────────────────────────────────

function buildStatsPage(
  protocols: Protocol[],
  locations: Location[],
  projectStart: Date,
): string {
  const weeklySvg = buildWeeklyChartSvg(protocols, projectStart);
  const specialtySvg = buildSpecialtySvg(protocols, locations);

  return `
<div class="page">
  <h2 style="color:#0e213d;border-bottom:2px solid #1a4f7a;padding-bottom:8px;margin-bottom:20px;">
    RESUMEN ESTADÍSTICO
  </h2>

  <div class="chart-section">
    <div class="chart-title">Protocolos Aprobados por Semana</div>
    <div class="chart-container">${weeklySvg}</div>
    <div class="chart-legend">
      <div class="legend-item"><span class="legend-dot" style="background:#1a4f7a;"></span>Aprobados</div>
    </div>
  </div>

  ${specialtySvg ? `
  <div class="chart-section">
    <div class="chart-title">Avance por Especialidad</div>
    <div class="chart-container">${specialtySvg}</div>
    <div class="chart-legend">
      <div class="legend-item"><span class="legend-dot" style="background:#1e8e3e;"></span>Aprobados</div>
      <div class="legend-item"><span class="legend-dot" style="background:#c8d0db;"></span>Pendientes</div>
    </div>
  </div>` : ''}
</div>`;
}

// ── Tabla resumen ─────────────────────────────────────────────────────────────

function buildSummaryTable(
  protocols: Protocol[],
  userMap: Map<string, User>,
  pageMap: Map<string, number>,
): string {
  const rows = protocols.map(p => {
    const filledName = p.filledById ? (userMap.get(p.filledById)?.fullName ?? '—') : '—';
    const signedName = p.signedById ? (userMap.get(p.signedById)?.fullName ?? '—') : '—';
    const sc = statusColor(p.status);
    const sl = statusLabel(p.status);
    const pg = pageMap.get(p.id) ?? '';
    return `
<tr>
  <td><a href="#protocol-${p.id}" style="color:#1a4f7a;text-decoration:none;"><strong>${escHtml(p.protocolNumber)}</strong></a></td>
  <td>${escHtml(p.locationReference)}</td>
  <td><span class="status-badge" style="background:${sc}">${sl}</span></td>
  <td>${escHtml(filledName)}</td>
  <td>${fmtDate(p.filledAt)}</td>
  <td>${escHtml(signedName)}</td>
  <td>${fmtDate(p.signedAt)}</td>
  <td style="text-align:center;color:#1a4f7a;font-weight:700;">${pg}</td>
</tr>`;
  }).join('');

  return `
<div class="page">
  <h2 style="color:#0e213d;border-bottom:2px solid #1a4f7a;padding-bottom:8px;margin-bottom:16px;">
    TABLA RESUMEN DE PROTOCOLOS
  </h2>
  <table>
    <thead>
      <tr>
        <th>N° Protocolo</th>
        <th>Ubicación</th>
        <th>Estado</th>
        <th>Llenado por</th>
        <th>Fecha realización</th>
        <th>Aprobado por</th>
        <th>Fecha aprobación</th>
        <th style="width:40px;">Pág.</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
</div>`;
}

// ── Páginas de protocolo (paginación manual, header+firma en cada hoja) ───────

const ROWS_PER_PAGE = 20;

function buildProtocolPages(
  protocol: Protocol,
  items: ProtocolItem[],
  userMap: Map<string, User>,
  logoB64: string | null,
  signB64: string | null,
  signerName: string,
  globalPageStart: number,
  totalDocPages: number,
  projectName: string,
  specialty: string | null,
  idProtocolo: string | null,
  locationOnly: string | null,
): string {
  const filledName = protocol.filledById ? (userMap.get(protocol.filledById)?.fullName ?? '—') : '—';
  const signedName = protocol.signedById ? (userMap.get(protocol.signedById)?.fullName ?? signerName) : signerName;
  const sc = statusColor(protocol.status);
  const sl = statusLabel(protocol.status);

  const logoHtml = logoB64
    ? `<img src="${logoB64}" class="proto-logo" alt="Logo"/>`
    : '<div style="min-width:80px;"></div>';

  const signatureHtml = signB64
    ? `<img src="${signB64}" class="signature-img" alt="Firma"/>`
    : '<div class="signature-line"></div>';

  const today = fmtDate(Date.now());

  // Encabezado reutilizable en cada página del protocolo
  const headerHtml = `
  <div class="proto-header">
    ${logoHtml}
    <div class="proto-header-center">
      <div class="proto-name">${escHtml(protocol.protocolNumber)}</div>
    </div>
    <div class="proto-num">
      <span class="status-badge" style="background:${sc}">${sl}</span>
    </div>
  </div>
  <div class="proto-info-grid">
    <div class="proto-info-row">
      <div class="proto-info-cell">
        <span class="proto-info-label">Proyecto</span>
        <span class="proto-info-value">${escHtml(projectName)}</span>
      </div>
      <div class="proto-info-cell">
        <span class="proto-info-label">Fecha</span>
        <span class="proto-info-value">${today}</span>
      </div>
    </div>
    <div class="proto-info-row">
      <div class="proto-info-cell">
        <span class="proto-info-label">Supervisor</span>
        <span class="proto-info-value">${escHtml(filledName)}</span>
      </div>
      <div class="proto-info-cell">
        <span class="proto-info-label">Fecha realización</span>
        <span class="proto-info-value">${fmtDateTime(protocol.filledAt ?? protocol.submittedAt)}</span>
      </div>
      <div class="proto-info-cell">
        <span class="proto-info-label">Fecha aprobación</span>
        <span class="proto-info-value">${fmtDateTime(protocol.signedAt)}</span>
      </div>
    </div>
    <div class="proto-info-row">
      <div class="proto-info-cell">
        <span class="proto-info-label">ID Protocolo</span>
        <span class="proto-info-value">${escHtml(idProtocolo ?? protocol.protocolNumber)}</span>
      </div>
      <div class="proto-info-cell">
        <span class="proto-info-label">Ubicación</span>
        <span class="proto-info-value">${escHtml(locationOnly ?? protocol.locationReference)}</span>
      </div>
      ${specialty
        ? `<div class="proto-info-cell"><span class="proto-info-label">Especialidad</span><span class="proto-info-value">${escHtml(specialty)}</span></div>`
        : '<div class="proto-info-cell" style="background:transparent;box-shadow:none;"></div>'
      }
    </div>
    ${protocol.rejectionReason ? `
    <div class="proto-info-row">
      <div class="proto-info-cell" style="background:#fce8e6;flex:1;">
        <span class="proto-info-label" style="color:#d93025;">Motivo rechazo</span>
        <span class="proto-info-value" style="color:#d93025;">${escHtml(protocol.rejectionReason)}</span>
      </div>
    </div>` : ''}
  </div>
  <hr class="proto-divider"/>`;

  // Dividir ítems en chunks de ROWS_PER_PAGE
  const chunks: ProtocolItem[][] = [];
  for (let i = 0; i < items.length; i += ROWS_PER_PAGE) {
    chunks.push(items.slice(i, i + ROWS_PER_PAGE));
  }
  if (chunks.length === 0) chunks.push([]);
  const totalPages = chunks.length;

  return chunks.map((chunk, pageIdx) => {
    const pageNum = pageIdx + 1;
    let rowNumber = pageIdx * ROWS_PER_PAGE + 1; // numeración global de filas

    // Generar filas con encabezados de sección al inicio de cada grupo dentro del chunk
    let itemsHtml = '';
    let lastSection = '';
    const hasMultipleSections = new Set(items.map(i => i.section?.trim() || 'General')).size > 1;

    for (const item of chunk) {
      const sec = item.section?.trim() || 'General';
      if (hasMultipleSections && sec !== lastSection) {
        lastSection = sec;
        itemsHtml += `<tr><td colspan="5" style="padding:0;"><div class="section-group-header">${escHtml(sec)}</div></td></tr>`;
      }
      let conformeHtml: string;
      if (!item.hasAnswer) {
        conformeHtml = `<span class="td-noanswer">—</span>`;
      } else if ((item as any).isNa) {
        conformeHtml = `<span style="color:#e37400;font-weight:700;font-size:10px;">N/A</span>`;
      } else if (item.isCompliant) {
        conformeHtml = `<span class="td-compliant">✓</span>`;
      } else {
        conformeHtml = `<span class="td-noncompliant">✗</span>`;
      }
      const commentHtml = item.comments ? escHtml(item.comments) : '';
      itemsHtml += `
<tr>
  <td style="width:36px;color:#1a4f7a;font-weight:700;text-align:center;">${rowNumber++}</td>
  <td>${escHtml(item.itemDescription)}</td>
  <td style="width:88px;color:#555;">${escHtml(item.validationMethod)}</td>
  <td style="width:52px;text-align:center;">${conformeHtml}</td>
  <td style="width:140px;color:#555;font-size:9px;">${commentHtml}</td>
</tr>`;
    }

    const continuacion = pageIdx > 0 ? ' <span style="font-size:9px;color:#888;font-weight:400;">(continuación)</span>' : '';
    const anchorId = pageIdx === 0 ? ` id="protocol-${protocol.id}"` : '';
    return `
<div class="page"${anchorId}>
  ${headerHtml}
  ${pageIdx > 0 ? `<div style="font-size:9px;color:#888;margin-bottom:6px;">— Continuación de lista de ítems${continuacion} —</div>` : ''}

  <table>
    <thead>
      <tr>
        <th style="width:36px;text-align:center;">#</th>
        <th>Descripción</th>
        <th style="width:88px;">Método</th>
        <th style="width:52px;text-align:center;">Conforme</th>
        <th style="width:140px;">Obs. levantada</th>
      </tr>
    </thead>
    <tbody>${itemsHtml}</tbody>
  </table>

  <div class="proto-footer">
    <div class="signature-block">
      ${signatureHtml}
      <div class="signature-name">${escHtml(signedName)}</div>
      <div class="signature-role">Jefe de Calidad</div>
    </div>
    <div class="footer-right">
      Dosier de Calidad<br/>
      Página ${globalPageStart + pageIdx} de ${totalDocPages}
    </div>
  </div>
</div>`;
  }).join('');
}

// ── Panel fotográfico ─────────────────────────────────────────────────────────

async function buildPhotoPanel(
  protocolName: string,
  locationName: string | null,
  evidenceUris: string[],
  logoB64: string | null,
  signB64: string | null,
  signerName: string,
  pageNumber: number,
  totalDocPages: number,
): Promise<string> {
  if (evidenceUris.length === 0) return '';

  // Detectar orientación y separar
  const orientations = await Promise.all(evidenceUris.map(uri => getImageOrientation(uri)));
  const b64s = await Promise.all(evidenceUris.map(uri => toBase64(uri)));

  const verticals: string[] = [];
  const horizontals: string[] = [];
  for (let i = 0; i < evidenceUris.length; i++) {
    if (!b64s[i]) continue;
    if (orientations[i] === 'portrait') verticals.push(b64s[i]!);
    else horizontals.push(b64s[i]!);
  }
  if (verticals.length === 0 && horizontals.length === 0) return '';

  // Paginación: 8 verticales/pág (4-col × 2 filas), 9 horizontales/pág (3-col × 3 filas)
  const VERT_PER_PAGE = 8;
  const HORIZ_PER_PAGE = 9;

  const vertChunks: string[][] = [];
  for (let i = 0; i < verticals.length; i += VERT_PER_PAGE) {
    vertChunks.push(verticals.slice(i, i + VERT_PER_PAGE));
  }
  const horizChunks: string[][] = [];
  for (let i = 0; i < horizontals.length; i += HORIZ_PER_PAGE) {
    horizChunks.push(horizontals.slice(i, i + HORIZ_PER_PAGE));
  }

  // Si no hay chunk de ningún tipo, generar al menos uno vacío para no perder la página
  const allChunks: Array<{ verts: string[]; horizs: string[] }> = [];
  const maxLen = Math.max(vertChunks.length, horizChunks.length, 1);
  for (let i = 0; i < maxLen; i++) {
    allChunks.push({ verts: vertChunks[i] ?? [], horizs: horizChunks[i] ?? [] });
  }

  const signatureHtml = signB64
    ? `<img src="${signB64}" class="signature-img" alt="Firma"/>`
    : '<div class="signature-line"></div>';

  const logoHtml = logoB64
    ? `<img src="${logoB64}" class="proto-logo" alt="Logo"/>`
    : '<div style="min-width:80px;"></div>';

  return allChunks.map(({ verts, horizs }, idx) => {
    const vertHtml = verts.length > 0
      ? `<div class="photo-grid-v">${verts.map(b64 => `<div class="photo-cell-v"><img src="${b64}" /></div>`).join('')}</div>`
      : '';
    const horizHtml = horizs.length > 0
      ? `<div class="photo-grid-h">${horizs.map(b64 => `<div class="photo-cell-h"><img src="${b64}" /></div>`).join('')}</div>`
      : '';
    const currentPage = pageNumber + idx;

    return `
<div class="page">
  <div class="photo-page-header">
    ${logoHtml}
    <div class="photo-panel-title">Panel Fotográfico — ${escHtml(protocolName)}${locationName ? `<div style="font-size:10px;font-weight:600;color:#555;margin-top:2px;">Ubicación: ${escHtml(locationName)}</div>` : ''}</div>
  </div>
  ${vertHtml}
  ${horizHtml}
  <div class="proto-footer">
    <div class="signature-block">
      ${signatureHtml}
      <div class="signature-name">${escHtml(signerName)}</div>
      <div class="signature-role">Jefe de Calidad</div>
    </div>
    <div class="footer-right">
      Dosier de Calidad<br/>
      Página ${currentPage} de ${totalDocPages}
    </div>
  </div>
</div>`;
  }).join('');
}

// ── Función principal ─────────────────────────────────────────────────────────

export async function exportDossierPdf(
  projectId: string,
  projectName: string,
  currentUserId: string,
): Promise<string> {
  // ── 1. Cargar datos ──────────────────────────────────────────────────────
  const [protocols, allProtocols, allUsers, locations, settings, projectArr, allTemplates] = await Promise.all([
    protocolsCollection
      .query(Q.where('project_id', projectId), Q.where('status', Q.notEq('DRAFT')))
      .fetch(),
    protocolsCollection
      .query(Q.where('project_id', projectId))
      .fetch(),
    usersCollection.query().fetch(),
    locationsCollection.query(Q.where('project_id', projectId)).fetch(),
    getProjectSettings(projectId),
    projectsCollection.query(Q.where('id', projectId)).fetch(),
    protocolTemplatesCollection.query(Q.where('project_id', projectId)).fetch(),
  ]);

  const userMap = new Map<string, User>(allUsers.map(u => [u.id, u]));
  const locationMap = new Map(locations.map(l => [l.id, l]));
  const templateMap = new Map(allTemplates.map(t => [t.id, t]));
  const currentUserRecord = userMap.get(currentUserId);
  const signerName = currentUserRecord?.fullName ?? 'Jefe de Calidad';

  // ── 2. Imágenes base64 ───────────────────────────────────────────────────
  // Logo: try local cache first, then download from S3
  let logoB64: string | null = null;
  const logoS3Key = `logos/project_${projectId}/logo.jpg`;
  const localLogoUri = `${FileSystem.cacheDirectory}project_logo_${projectId}.jpg`;
  const logoInfo = await FileSystem.getInfoAsync(localLogoUri);
  if (logoInfo.exists) {
    logoB64 = await toBase64(localLogoUri);
  } else {
    try {
      const { downloadFromS3 } = require('./S3Service');
      await downloadFromS3(logoS3Key, localLogoUri);
      logoB64 = await toBase64(localLogoUri);
    } catch { /* no logo available */ }
  }
  // Signature: try per-user download (S3) first, fall back to project settings
  const currentSignUri = await getOrDownloadSignatureUri(currentUserId) ?? settings.signatureUri;
  const signB64 = await toBase64(currentSignUri);

  // ── 3. Cargar ítems, evidencias y fotos extra por protocolo ─────────────────
  const itemsByProtocol = new Map<string, ProtocolItem[]>();
  const evidencesByProtocol = new Map<string, string[]>();

  for (const p of protocols) {
    const its = await protocolItemsCollection
      .query(Q.where('protocol_id', p.id))
      .fetch() as ProtocolItem[];
    itemsByProtocol.set(p.id, its);

    const photoUris: string[] = [];
    if (its.length > 0) {
      const itemIds = its.map(i => i.id);
      const evs = await evidencesCollection
        .query(Q.where('protocol_item_id', Q.oneOf(itemIds)))
        .fetch();
      const evidUris = evs.map(ev => ev.localUri).filter(Boolean) as string[];
      photoUris.push(...evidUris);
    }

    // Extra photos stored in AsyncStorage
    try {
      const raw = await AsyncStorage.getItem(`protocol_extra_photos_${p.id}`);
      if (raw) {
        const extras: string[] = JSON.parse(raw);
        if (Array.isArray(extras)) photoUris.push(...extras);
      }
    } catch { /* ignore */ }

    if (photoUris.length > 0) evidencesByProtocol.set(p.id, photoUris);
  }

  // ── 3b. Ordenar protocolos por orden de template_ids de cada ubicación ──
  // Sort locations by created_at (preserves Excel import order = first appearance of locationOnly)
  const sortedLocations = [...locations].sort((a, b) => {
    const tA = a.createdAt instanceof Date ? a.createdAt.getTime() : 0;
    const tB = b.createdAt instanceof Date ? b.createdAt.getTime() : 0;
    return tA - tB;
  });
  // Determine locationOnly group order by first appearance in Excel order
  const locOnlyOrder = new Map<string, number>();
  let gIdx = 0;
  for (const loc of sortedLocations) {
    const locOnly = loc.locationOnly ?? loc.name ?? '';
    if (!locOnlyOrder.has(locOnly)) locOnlyOrder.set(locOnly, gIdx++);
  }
  // Sort locations: group order first, then creation order within group
  const groupedLocations = [...sortedLocations].sort((a, b) => {
    const gA = locOnlyOrder.get(a.locationOnly ?? a.name ?? '') ?? 99999;
    const gB = locOnlyOrder.get(b.locationOnly ?? b.name ?? '') ?? 99999;
    if (gA !== gB) return gA - gB;
    const tA = a.createdAt instanceof Date ? a.createdAt.getTime() : 0;
    const tB = b.createdAt instanceof Date ? b.createdAt.getTime() : 0;
    return tA - tB;
  });
  const templateOrderMap = new Map<string, number>();
  let tOrderIdx = 0;
  for (const loc of groupedLocations) {
    const tids = loc.templateIds ? loc.templateIds.split(',').map(s => s.trim()).filter(Boolean) : [];
    for (const tid of tids) {
      templateOrderMap.set(`${loc.id}__${tid}`, tOrderIdx++);
    }
  }
  // Convert template UUID to id_protocolo for lookup (templateIds uses id_protocolo strings)
  protocols.sort((a, b) => {
    const idProtoA = a.templateId ? (templateMap.get(a.templateId)?.idProtocolo ?? a.templateId) : '';
    const idProtoB = b.templateId ? (templateMap.get(b.templateId)?.idProtocolo ?? b.templateId) : '';
    const orderA = templateOrderMap.get(`${a.locationId}__${idProtoA}`) ?? 99999;
    const orderB = templateOrderMap.get(`${b.locationId}__${idProtoB}`) ?? 99999;
    return orderA - orderB;
  });

  // ── 4. Datos estadísticos ────────────────────────────────────────────────
  const approved = protocols.filter(p => p.status === 'APPROVED').length;
  const submitted = protocols.filter(p => p.status === 'SUBMITTED').length;
  const rejected = protocols.filter(p => p.status === 'REJECTED').length;
  // Total = all template slots across all locations (same as project progress denominator)
  const total = locations.reduce((sum, loc) => {
    const tids = loc.templateIds ? loc.templateIds.split(',').map(s => s.trim()).filter(Boolean) : [];
    return sum + tids.length;
  }, 0);

  const projectRecord = projectArr[0];
  const getTs2 = (val: any) => {
    if (typeof val === 'number') return val;
    if (val instanceof Date) return val.getTime();
    return 0;
  };
  const projectStart = projectRecord
    ? new Date(getTs2(projectRecord.createdAt))
    : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const generatedAt = fmtDateTime(Date.now());

  // ── 5. Ensamblar HTML ────────────────────────────────────────────────────
  const coverPage = buildCoverPage(projectName, logoB64, approved, total, generatedAt, signerName, signB64);
  const statsPage = buildStatsPage(protocols, locations, projectStart);

  // Group stats by location_only (for section cover pages)
  const groupStats = new Map<string, { total: number; approved: number }>();
  for (const loc of locations) {
    const locOnly = loc.locationOnly ?? null;
    if (!locOnly) continue;
    const stats = groupStats.get(locOnly) ?? { total: 0, approved: 0 };
    const tids = loc.templateIds ? loc.templateIds.split(',').map(s => s.trim()).filter(Boolean) : [];
    stats.total += tids.length;
    groupStats.set(locOnly, stats);
  }
  for (const p of protocols) {
    const loc = p.locationId ? locationMap.get(p.locationId) : undefined;
    const locOnly = loc?.locationOnly ?? null;
    if (!locOnly) continue;
    const stats = groupStats.get(locOnly);
    if (stats && p.status === 'APPROVED') stats.approved++;
  }

  // Detect section cover count (unique adjacent location_only changes)
  let sectionCoverCount = 0;
  let _prevLocOnly: string | null = null;
  for (const p of protocols) {
    const loc = p.locationId ? locationMap.get(p.locationId) : undefined;
    const locOnly = loc?.locationOnly ?? null;
    if (locOnly && locOnly !== _prevLocOnly) {
      sectionCoverCount++;
      _prevLocOnly = locOnly;
    }
  }

  // First pass: calculate total pages AND page map for each protocol
  const FIXED_PAGES = 3; // cover + stats + summary
  let totalDocPages = FIXED_PAGES + sectionCoverCount;
  const pageMap = new Map<string, number>();
  let _calcPage = FIXED_PAGES + 1;
  let _calcPrevLocOnly: string | null = null;
  for (const p of protocols) {
    const loc = p.locationId ? locationMap.get(p.locationId) : undefined;
    const curLocOnly = loc?.locationOnly ?? null;
    if (curLocOnly && curLocOnly !== _calcPrevLocOnly) {
      _calcPage += 1; // section cover page
      _calcPrevLocOnly = curLocOnly;
    }
    pageMap.set(p.id, _calcPage); // page where this protocol starts
    const its = itemsByProtocol.get(p.id) ?? [];
    const itemPages = Math.max(1, Math.ceil(its.length / ROWS_PER_PAGE));
    totalDocPages += itemPages;
    _calcPage += itemPages;
    const photoUrisCount = (evidencesByProtocol.get(p.id) ?? []).length;
    if (photoUrisCount > 0) {
      const photoPages = Math.ceil(photoUrisCount / 8);
      totalDocPages += photoPages;
      _calcPage += photoPages;
    }
  }

  const summaryPage = buildSummaryTable(protocols, userMap, pageMap);

  let pageOffset = FIXED_PAGES + 1; // primera página de protocolos
  const protocolPagesHtml: string[] = [];
  let prevLocationOnly: string | null = null;

  for (let i = 0; i < protocols.length; i++) {
    const p = protocols[i];
    const its = itemsByProtocol.get(p.id) ?? [];
    const its_itemPages = Math.max(1, Math.ceil(its.length / ROWS_PER_PAGE));
    const location = p.locationId ? locationMap.get(p.locationId) : undefined;
    const specialty = location?.specialty ?? null;
    const locationOnly = location?.locationOnly ?? null;
    const template = p.templateId ? templateMap.get(p.templateId) : undefined;
    const idProtocolo = template?.idProtocolo ?? null;

    // Insert section cover at group boundary
    if (locationOnly && locationOnly !== prevLocationOnly) {
      const stats = groupStats.get(locationOnly) ?? { total: 0, approved: 0 };
      protocolPagesHtml.push(buildSectionCoverPage(locationOnly, logoB64, projectName, stats.total, stats.approved));
      pageOffset += 1;
      prevLocationOnly = locationOnly;
    }

    // Per-jefe signature: use the specific approver's signature if available
    let protoSignB64 = signB64;
    let protoSignerName = signerName;
    if (p.signedById) {
      const jefeRecord = userMap.get(p.signedById);
      if (jefeRecord) protoSignerName = jefeRecord.fullName;
      try {
        const jefeSignUri = await getOrDownloadSignatureUri(p.signedById);
        if (jefeSignUri) protoSignB64 = await toBase64(jefeSignUri);
      } catch { /* use project default */ }
    }

    const html = buildProtocolPages(
      p,
      its,
      userMap,
      logoB64,
      protoSignB64,
      protoSignerName,
      pageOffset,
      totalDocPages,
      projectName,
      specialty,
      idProtocolo,
      locationOnly,
    );
    pageOffset += its_itemPages;
    // Panel fotográfico (si hay fotos)
    const photoUris = evidencesByProtocol.get(p.id) ?? [];
    const locRef = locationOnly && specialty ? `${locationOnly}-${specialty}` : (locationOnly ?? specialty ?? null);
    const photoHtml = await buildPhotoPanel(
      p.protocolNumber ?? p.id,
      locRef,
      photoUris,
      logoB64,
      protoSignB64,
      protoSignerName,
      pageOffset,
      totalDocPages,
    );
    if (photoHtml) pageOffset += Math.ceil(photoUris.length / 8);
    protocolPagesHtml.push(html + photoHtml);
  }
  const protocolPages = protocolPagesHtml.join('');

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<title>Dosier de Calidad — ${escHtml(projectName)}</title>
<style>${CSS}</style>
</head>
<body>
${coverPage}
${statsPage}
${summaryPage}
${protocolPages}
</body>
</html>`;

  // ── 6. Generar PDF ───────────────────────────────────────────────────────
  const { uri } = await Print.printToFileAsync({ html, base64: false });

  // Renombrar al formato DOSIER-{proyecto}-{fecha}.pdf
  const now = new Date();
  const safeName = projectName
    .replace(/[^a-zA-Z0-9áéíóúÁÉÍÓÚñÑüÜ\s]/g, '')
    .trim()
    .replace(/\s+/g, '_');
  const dateStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const targetUri = `${FileSystem.documentDirectory}DOSIER-${safeName}-${dateStr}.pdf`;
  try { await FileSystem.deleteAsync(targetUri, { idempotent: true }); } catch {}
  await FileSystem.moveAsync({ from: uri, to: targetUri });
  return targetUri;
}

// ── Exportar un único protocolo como PDF ─────────────────────────────────────

export async function exportSingleProtocolPdf(
  protocolId: string,
  projectId: string,
  projectName: string,
  currentUserId: string,
): Promise<string> {
  // Cargar datos necesarios
  const [protocol, allUsers, locations, settings, allTemplates] = await Promise.all([
    protocolsCollection.find(protocolId),
    usersCollection.query().fetch(),
    locationsCollection.query(Q.where('project_id', projectId)).fetch(),
    getProjectSettings(projectId),
    protocolTemplatesCollection.query(Q.where('project_id', projectId)).fetch(),
  ]);

  const userMap = new Map<string, User>(allUsers.map(u => [u.id, u]));
  const locationMap = new Map(locations.map(l => [l.id, l]));
  const templateMap = new Map(allTemplates.map(t => [t.id, t]));
  const currentUserRecord = userMap.get(currentUserId);
  const signerName = currentUserRecord?.fullName ?? 'Jefe de Calidad';

  // Imágenes base64
  // Logo: try local cache first, then download from S3
  let logoB64: string | null = null;
  const logoS3Key = `logos/project_${projectId}/logo.jpg`;
  const localLogoUri = `${FileSystem.cacheDirectory}project_logo_${projectId}.jpg`;
  const logoInfo = await FileSystem.getInfoAsync(localLogoUri);
  if (logoInfo.exists) {
    logoB64 = await toBase64(localLogoUri);
  } else {
    try {
      const { downloadFromS3 } = require('./S3Service');
      await downloadFromS3(logoS3Key, localLogoUri);
      logoB64 = await toBase64(localLogoUri);
    } catch { /* no logo available */ }
  }
  // Signature: try per-user download (S3) first, fall back to project settings
  const currentSignUri = await getOrDownloadSignatureUri(currentUserId) ?? settings.signatureUri;
  const defaultSignB64 = await toBase64(currentSignUri);

  // Items y evidencias del protocolo
  const its = await protocolItemsCollection
    .query(Q.where('protocol_id', protocolId))
    .fetch() as ProtocolItem[];

  const photoUris: string[] = [];
  if (its.length > 0) {
    const itemIds = its.map(i => i.id);
    const evs = await evidencesCollection
      .query(Q.where('protocol_item_id', Q.oneOf(itemIds)))
      .fetch();
    const evidUris = evs.map(ev => ev.localUri).filter(Boolean) as string[];
    photoUris.push(...evidUris);
  }
  try {
    const raw = await AsyncStorage.getItem(`protocol_extra_photos_${protocolId}`);
    if (raw) {
      const extras: string[] = JSON.parse(raw);
      if (Array.isArray(extras)) photoUris.push(...extras);
    }
  } catch { /* ignore */ }

  // Firma del aprobador
  let signB64 = defaultSignB64;
  let protoSignerName = signerName;
  if (protocol.signedById) {
    const jefeRecord = userMap.get(protocol.signedById);
    if (jefeRecord) protoSignerName = jefeRecord.fullName;
    try {
      const jefeSignUri = await getOrDownloadSignatureUri(protocol.signedById);
      if (jefeSignUri) signB64 = await toBase64(jefeSignUri);
    } catch { /* use default */ }
  }

  const location = protocol.locationId ? locationMap.get(protocol.locationId) : undefined;
  const specialty = location?.specialty ?? null;
  const locationOnly = location?.locationOnly ?? null;
  const template = protocol.templateId ? templateMap.get(protocol.templateId) : undefined;
  const idProtocolo = template?.idProtocolo ?? null;

  const itemPages = Math.max(1, Math.ceil(its.length / ROWS_PER_PAGE));
  const photoPages = photoUris.length > 0 ? Math.ceil(photoUris.length / 8) : 0;
  const totalPages = itemPages + photoPages;

  const protocolHtml = buildProtocolPages(
    protocol,
    its,
    userMap,
    logoB64,
    signB64,
    protoSignerName,
    1,
    totalPages,
    projectName,
    specialty,
    idProtocolo,
    locationOnly,
  );

  const locRef = locationOnly && specialty ? `${locationOnly}-${specialty}` : (locationOnly ?? specialty ?? null);
  const photoHtml = await buildPhotoPanel(
    protocol.protocolNumber ?? protocol.id,
    locRef,
    photoUris,
    logoB64,
    signB64,
    protoSignerName,
    itemPages + 1,
    totalPages,
  );

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<title>Protocolo — ${escHtml(projectName)}</title>
<style>${CSS}</style>
</head>
<body>
${protocolHtml}${photoHtml}
</body>
</html>`;

  const { uri } = await Print.printToFileAsync({ html, base64: false });

  const now = new Date();
  const safeName = (protocol.protocolNumber ?? protocolId)
    .replace(/[^a-zA-Z0-9\-_]/g, '_');
  const dateStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const targetUri = `${FileSystem.documentDirectory}PROTOCOLO-${safeName}-${dateStr}.pdf`;
  try { await FileSystem.deleteAsync(targetUri, { idempotent: true }); } catch {}
  await FileSystem.moveAsync({ from: uri, to: targetUri });
  return targetUri;
}
