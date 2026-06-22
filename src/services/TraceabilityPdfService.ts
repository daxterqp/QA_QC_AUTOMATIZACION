/**
 * TraceabilityPdfService — genera el PDF de análisis de Trazabilidad.
 *
 * Estructura del informe (v30):
 *   1. Portada: proyecto, exportador, rango de fechas, fecha de generación.
 *   2. KPIs globales.
 *   3. Por sector (orden Excel): pie chart (equipos + "No trabajado") +
 *      línea de tiempo + leyenda con horas.
 *   4. Por equipo: KPIs (Horas trabajadas + Detenciones) + pie chart por
 *      sectores + línea de tiempo + leyenda.
 *
 * Tecnología: expo-print con HTML + SVG inline (mismo patrón que
 * DossierExportService).
 */

import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { fmtHm, type SessionWithIntervals } from '@utils/traceabilityAggregates';
import { effectiveDurationMs, pausedDurationMs } from '@services/WorkSessionService';
import { buildPieSvg, buildTimelineRectsSvg, type PieSlice, type TimelineSegmentLite } from '@utils/svgHelpers';
import { TIMELINE_EMPTY, colorAt } from '@components/TimelineBar';

export interface GeneratePdfInput {
  projectName: string;
  exporterName: string;
  fromMs: number;
  toMs: number;
  sessions: SessionWithIntervals[];
  equipNames: Record<string, string>;
  sectorNames: Record<string, string>;
  allSectors: Array<{ id: string; name: string; sortOrder: number }>;
  /** v31 — Si true, NO abre el share dialog; solo devuelve el URI para preview. */
  previewOnly?: boolean;
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function fmtDateLong(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fmtDateOnly(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}

function buildLegendHtml(slices: PieSlice[]): string {
  return `<table class="legend">${slices.map(s => `
    <tr>
      <td><span class="dot" style="background:${s.color}"></span></td>
      <td class="legend-label">${esc(s.label)}</td>
      <td class="legend-value">${esc(fmtHm(s.value))}</td>
    </tr>`).join('')}</table>`;
}

function fmtTimelineDates(fromMs: number, toMs: number): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const f = (ms: number) => {
    const d = new Date(ms);
    return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
  };
  return `<div class="tl-dates"><span>${f(fromMs)}</span><span>${f(toMs)}</span></div>`;
}

function buildSectorBlock(
  sectorTitle: string,
  sectorSessions: SessionWithIntervals[],
  equipNames: Record<string, string>,
  windowMs: number,
  fromMs: number,
  toMs: number,
): string {
  // Asignar colorIdx por orden de aparición del equipo en este sector
  const equipOrder: string[] = [];
  for (const x of sectorSessions) {
    if (!equipOrder.includes(x.session.equipmentId)) equipOrder.push(x.session.equipmentId);
  }
  const colorIdxOf = (eqId: string) => equipOrder.indexOf(eqId);

  const byEquip = new Map<string, { eqId: string; durationMs: number }>();
  for (const x of sectorSessions) {
    const dur = effectiveDurationMs(x.intervals as any);
    const cur = byEquip.get(x.session.equipmentId) ?? { eqId: x.session.equipmentId, durationMs: 0 };
    cur.durationMs += dur;
    byEquip.set(x.session.equipmentId, cur);
  }
  const equipRows = Array.from(byEquip.values()).sort((a, b) => b.durationMs - a.durationMs);
  const usedMs = equipRows.reduce((a, r) => a + r.durationMs, 0);

  const pieSlices: PieSlice[] = [
    ...equipRows.map(e => ({
      label: equipNames[e.eqId] ?? 'Equipo',
      value: e.durationMs,
      color: colorAt(colorIdxOf(e.eqId)),
    })),
    ...(windowMs > usedMs ? [{ label: 'No trabajado', value: windowMs - usedMs, color: TIMELINE_EMPTY }] : []),
  ];

  const segments: TimelineSegmentLite[] = [];
  for (const x of sectorSessions) {
    const c = colorAt(colorIdxOf(x.session.equipmentId));
    for (const it of x.intervals) {
      if ((it as any).kind !== 'active') continue;
      segments.push({
        startMs: (it as any).startedAt,
        endMs: (it as any).endedAt ?? Date.now(),
        color: c,
      });
    }
  }
  const timelineSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="22" viewBox="0 0 600 22">${buildTimelineRectsSvg(segments, fromMs, toMs, 600, 22)}</svg>`;
  const pieSvg = buildPieSvg(pieSlices, 180);

  // v31 — Datos resumen del sector (debajo del título)
  const totalSector = equipRows.reduce((a, r) => a + r.durationMs, 0);
  const dataLine = `<div class="block-data">Horas trabajadas: <strong>${esc(fmtHm(totalSector))}</strong> · Equipos involucrados: <strong>${equipRows.length}</strong> · Sesiones: <strong>${sectorSessions.length}</strong></div>`;

  // Orden v31: Título → Datos → Timeline + fechas → Pie + Leyenda al costado.
  return `
    <section class="block">
      <h3>${esc(sectorTitle)}</h3>
      ${dataLine}
      <div class="timeline">${timelineSvg}</div>
      ${fmtTimelineDates(fromMs, toMs)}
      <div class="chart-row">
        <div class="pie">${pieSvg}</div>
        <div class="legend-wrap">${buildLegendHtml(pieSlices)}</div>
      </div>
    </section>`;
}

function buildEquipmentBlock(
  eqLabel: string,
  subset: SessionWithIntervals[],
  sectorNames: Record<string, string>,
  windowMs: number,
  fromMs: number,
  toMs: number,
): string {
  let productiveMs = 0, downMs = 0;
  for (const x of subset) {
    productiveMs += effectiveDurationMs(x.intervals as any);
    downMs += pausedDurationMs(x.intervals as any);
  }

  const sectorOrder: string[] = [];
  for (const x of subset) {
    const sid = x.session.sectorId ?? '_none';
    if (!sectorOrder.includes(sid)) sectorOrder.push(sid);
  }
  const colorIdxOf = (sid: string) => sectorOrder.indexOf(sid);
  const bySector = new Map<string, { sid: string; durationMs: number }>();
  for (const x of subset) {
    const sid = x.session.sectorId ?? '_none';
    const dur = effectiveDurationMs(x.intervals as any);
    const cur = bySector.get(sid) ?? { sid, durationMs: 0 };
    cur.durationMs += dur;
    bySector.set(sid, cur);
  }
  const sectorRows = Array.from(bySector.values()).sort((a, b) => b.durationMs - a.durationMs);
  const usedMs = sectorRows.reduce((a, r) => a + r.durationMs, 0);

  const pieSlices: PieSlice[] = [
    ...sectorRows.map(r => ({
      label: r.sid === '_none' ? '(Sin sector)' : (sectorNames[r.sid] ?? 'Sector'),
      value: r.durationMs,
      color: colorAt(colorIdxOf(r.sid)),
    })),
    ...(windowMs > usedMs ? [{ label: 'No trabajado', value: windowMs - usedMs, color: TIMELINE_EMPTY }] : []),
  ];

  const segments: TimelineSegmentLite[] = [];
  for (const x of subset) {
    const sid = x.session.sectorId ?? '_none';
    const c = colorAt(colorIdxOf(sid));
    for (const it of x.intervals) {
      if ((it as any).kind !== 'active') continue;
      segments.push({
        startMs: (it as any).startedAt,
        endMs: (it as any).endedAt ?? Date.now(),
        color: c,
      });
    }
  }
  const timelineSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="22" viewBox="0 0 600 22">${buildTimelineRectsSvg(segments, fromMs, toMs, 600, 22)}</svg>`;
  const pieSvg = buildPieSvg(pieSlices, 180);

  // v31 — Orden: Título → KPIs (Horas + Detenciones) → Timeline + fechas → Pie + Leyenda al costado.
  return `
    <section class="block">
      <h3>${esc(eqLabel)}</h3>
      <div class="kpi-row">
        <div class="kpi-mini"><div class="kpi-mini-value">${esc(fmtHm(productiveMs))}</div><div class="kpi-mini-label">Horas trabajadas</div></div>
        <div class="kpi-mini"><div class="kpi-mini-value">${esc(fmtHm(downMs))}</div><div class="kpi-mini-label">Detenciones</div></div>
      </div>
      <div class="timeline">${timelineSvg}</div>
      ${fmtTimelineDates(fromMs, toMs)}
      <div class="chart-row">
        <div class="pie">${pieSvg}</div>
        <div class="legend-wrap">${buildLegendHtml(pieSlices)}</div>
      </div>
    </section>`;
}

export async function generateTraceabilityPdf(input: GeneratePdfInput): Promise<string> {
  const { projectName, exporterName, fromMs, toMs, sessions, equipNames, sectorNames, allSectors, previewOnly } = input;
  const windowMs = Math.max(0, toMs - fromMs);

  // KPIs globales
  const totalMs = sessions.reduce((a, x) => a + effectiveDurationMs(x.intervals as any), 0);
  const uniqEquip = new Set(sessions.map(x => x.session.equipmentId)).size;
  const uniqSector = new Set(sessions.map(x => x.session.sectorId).filter(Boolean)).size;
  // v31 — Utilización = horas trabajadas / ventana (capeado a 100%).
  const utilizationPct = windowMs > 0 ? Math.min(100, Math.round((totalMs / windowMs) * 100)) : 0;

  // Por sector
  const sectorBlocks: string[] = [];
  for (const sec of allSectors) {
    const subset = sessions.filter(x => x.session.sectorId === sec.id);
    sectorBlocks.push(buildSectorBlock(sec.name, subset, equipNames, windowMs, fromMs, toMs));
  }
  // (Sin sector)
  const noSecSubset = sessions.filter(x => !x.session.sectorId);
  if (noSecSubset.length > 0) {
    sectorBlocks.push(buildSectorBlock('(Sin sector asignado)', noSecSubset, equipNames, windowMs, fromMs, toMs));
  }

  // Por equipo
  const eqIds: string[] = [];
  for (const x of sessions) {
    if (!eqIds.includes(x.session.equipmentId)) eqIds.push(x.session.equipmentId);
  }
  const equipmentBlocks: string[] = eqIds.map(eqId =>
    buildEquipmentBlock(
      equipNames[eqId] ?? 'Equipo',
      sessions.filter(x => x.session.equipmentId === eqId),
      sectorNames,
      windowMs,
      fromMs,
      toMs,
    ),
  );

  const NAVY = '#1E3A8A';
  const NAVY_LIGHT = '#EAF0FA';
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8" />
    <style>
      body { font-family: -apple-system, Helvetica, Arial, sans-serif; color: #0f172a; padding: 0; margin: 0; }
      .page { padding: 24px; }
      h1 { font-size: 22px; margin: 0 0 6px 0; color: #fff; }
      h2 { font-size: 13px; color: #fff; margin: 0; padding: 8px 12px; background: ${NAVY}; border-radius: 6px 6px 0 0; text-transform: uppercase; letter-spacing: 1px; }
      h3 { font-size: 13px; margin: 0 0 6px 0; color: ${NAVY}; }

      /* v31 — Carátula obligatoria (esquema dossier de calidad) */
      .cover { background: ${NAVY}; color: #fff; padding: 60px 40px; height: 100vh; box-sizing: border-box; display: flex; flex-direction: column; justify-content: space-between; page-break-after: always; }
      .cover-top { font-size: 11px; letter-spacing: 3px; text-transform: uppercase; opacity: 0.7; }
      .cover-title { font-size: 36px; font-weight: 900; margin: 12px 0 6px 0; line-height: 1.1; }
      .cover-sub { font-size: 18px; opacity: 0.9; margin-bottom: 30px; }
      .cover-meta { font-size: 13px; line-height: 1.8; opacity: 0.95; }
      .cover-meta strong { font-weight: 800; }
      .cover-bottom { font-size: 11px; opacity: 0.6; text-align: center; letter-spacing: 2px; }

      /* v31 — Encabezados de sección Navy */
      .section-header { background: ${NAVY}; color: #fff; padding: 10px 14px; margin: 24px 0 0 0; border-radius: 6px 6px 0 0; font-size: 13px; font-weight: 800; text-transform: uppercase; letter-spacing: 1.2px; }
      .section-body { border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 6px 6px; padding: 12px; margin-bottom: 8px; }

      /* KPIs globales */
      .kpi-row { display: flex; gap: 8px; margin: 0; }
      .kpi { flex: 1; padding: 12px; border-radius: 8px; background: ${NAVY_LIGHT}; text-align: center; border: 1px solid ${NAVY}33; }
      .kpi-value { font-size: 22px; font-weight: 900; color: ${NAVY}; }
      .kpi-label { font-size: 9px; font-weight: 800; color: ${NAVY}cc; text-transform: uppercase; margin-top: 4px; letter-spacing: 0.5px; }

      /* KPIs mini por equipo */
      .kpi-mini { flex: 1; padding: 8px; border-radius: 4px; background: #f8fafc; text-align: center; border: 1px solid #e2e8f0; }
      .kpi-mini-value { font-size: 14px; font-weight: 800; color: ${NAVY}; }
      .kpi-mini-label { font-size: 8px; color: #64748b; text-transform: uppercase; margin-top: 2px; }

      /* Bloques por sector/equipo */
      .block { page-break-inside: avoid; margin-bottom: 14px; padding: 12px; border: 1px solid #e2e8f0; border-radius: 6px; background: #fff; }
      .block-data { font-size: 11px; color: #475569; margin: 4px 0 10px 0; }
      .block-data strong { color: ${NAVY}; }
      .chart-row { display: flex; gap: 14px; align-items: center; margin-top: 10px; }
      .pie { flex: 0 0 180px; }
      .legend-wrap { flex: 1; }
      .legend { width: 100%; font-size: 10px; border-collapse: collapse; }
      .legend td { padding: 3px 4px; }
      .legend-label { color: #0f172a; }
      .legend-value { text-align: right; color: ${NAVY}; font-weight: 700; font-variant-numeric: tabular-nums; }
      .dot { display: inline-block; width: 10px; height: 10px; border-radius: 5px; }
      .timeline { margin-top: 4px; }
      .tl-dates { display: flex; justify-content: space-between; font-size: 9px; color: #64748b; margin-top: 3px; font-variant-numeric: tabular-nums; }

      footer { margin-top: 30px; font-size: 9px; color: #94a3b8; text-align: center; padding: 12px 0; border-top: 1px solid #e2e8f0; }
    </style>
  </head><body>
    <!-- v31 — Carátula obligatoria (esquema dossier de calidad) -->
    <div class="cover">
      <div>
        <div class="cover-top">Flow Quarkus AI · Dossier de Calidad</div>
        <div class="cover-title">Análisis de Trazabilidad</div>
        <div class="cover-sub">${esc(projectName)}</div>
      </div>
      <div class="cover-meta">
        <strong>Rango de análisis:</strong> ${esc(fmtDateOnly(fromMs))} — ${esc(fmtDateOnly(toMs))}<br/>
        <strong>Exportado por:</strong> ${esc(exporterName)}<br/>
        <strong>Fecha de generación:</strong> ${esc(fmtDateLong(Date.now()))}
      </div>
      <div class="cover-bottom">Documento generado con Flow Quarkus AI</div>
    </div>

    <div class="page">
      <div class="section-header">KPIs globales</div>
      <div class="section-body">
        <div class="kpi-row">
          <div class="kpi"><div class="kpi-value">${esc(fmtHm(totalMs))}</div><div class="kpi-label">Total horas máquina</div></div>
          <div class="kpi"><div class="kpi-value">${sessions.length}</div><div class="kpi-label">Sesiones trabajadas</div></div>
          <div class="kpi"><div class="kpi-value">${uniqEquip}</div><div class="kpi-label">Equipos operativos</div></div>
          <div class="kpi"><div class="kpi-value">${uniqSector}</div><div class="kpi-label">Sectores trabajados</div></div>
          <div class="kpi"><div class="kpi-value">${utilizationPct}%</div><div class="kpi-label">Utilización por tramo</div></div>
        </div>
      </div>

      <div class="section-header">Análisis por sector (KPIs)</div>
      <div class="section-body">
        ${sectorBlocks.join('') || '<p style="font-size:11px;color:#64748b">Sin sectores en el proyecto.</p>'}
      </div>

      <div class="section-header">Análisis por equipo (KPIs)</div>
      <div class="section-body">
        ${equipmentBlocks.join('') || '<p style="font-size:11px;color:#64748b">Sin sesiones de equipos en el rango.</p>'}
      </div>

      <footer>Generado con Flow Quarkus AI · ${esc(fmtDateLong(Date.now()))}</footer>
    </div>
  </body></html>`;

  const { uri } = await Print.printToFileAsync({ html, base64: false });
  if (!previewOnly) {
    try {
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: 'Análisis de Trazabilidad' });
      }
    } catch { /* sharing opcional */ }
  }
  return uri;
}
