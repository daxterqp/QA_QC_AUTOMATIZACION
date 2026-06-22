/**
 * ChecklistPdfService (v31) — PDF de checklists con esquema dossier de calidad.
 *
 *  - Unitario: un solo checklist con carátula + items + comentarios + fotos.
 *  - Consolidado: varios checklists agrupados, todos con la misma carátula
 *    inicial.
 *
 * Reutiliza el patrón de TraceabilityPdfService (carátula Navy + footer
 * "Generado con Flow Quarkus AI"). Usa expo-print + expo-sharing.
 */

import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Q } from '@nozbe/watermelondb';
import {
  workSessionsCollection, workSessionFormItemsCollection, evidencesCollection,
  equipmentCollection, activitiesCollection, projectSectorsCollection,
  sessionFormTemplatesCollection, equipmentActivitiesCollection,
} from '@db/index';
import * as FileSystem from 'expo-file-system';

interface ChecklistItemFull {
  partidaItem: string | null;
  itemDescription: string;
  validationMethod: string | null;
  comments: string | null;
  isCompliant: boolean | null;
  isNa: boolean | null;
  hasAnswer: boolean | null;
  valueText: string | null;
  valueNumber: number | null;
  photos: string[];
}

interface ChecklistFull {
  sessionId: string;
  templateName: string | null;
  equipName: string;
  activityName: string;
  sectorName: string;
  status: 'ACTIVE' | 'PAUSED' | 'CLOSED';
  startedAt: number;
  endedAt: number | null;
  items: ChecklistItemFull[];
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

async function uriToBase64Img(uri: string): Promise<string | null> {
  try {
    const b64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
    const ext = (uri.split('.').pop() ?? 'jpg').toLowerCase();
    const mime = ext === 'png' ? 'image/png' : 'image/jpeg';
    return `data:${mime};base64,${b64}`;
  } catch {
    return null;
  }
}

/** Carga todos los datos del checklist de una sesión (items + fotos en base64). */
export async function loadChecklistFull(sessionId: string): Promise<ChecklistFull | null> {
  const session = await workSessionsCollection.find(sessionId).catch(() => null);
  if (!session) return null;
  const sAny = session as any;
  const [items, equip, activity, sector, links] = await Promise.all([
    workSessionFormItemsCollection
      .query(Q.where('session_id', sessionId), Q.sortBy('created_at', Q.asc))
      .fetch(),
    equipmentCollection.find(sAny.equipmentId).catch(() => null),
    activitiesCollection.find(sAny.activityId).catch(() => null),
    sAny.sectorId ? projectSectorsCollection.find(sAny.sectorId).catch(() => null) : null,
    equipmentActivitiesCollection
      .query(Q.where('equipment_id', sAny.equipmentId), Q.where('activity_id', sAny.activityId))
      .fetch(),
  ]);

  let templateName: string | null = null;
  const link = (links as any[])[0];
  if (link?.formTemplateId) {
    const t = await sessionFormTemplatesCollection.find(link.formTemplateId).catch(() => null);
    templateName = (t as any)?.name ?? null;
  }

  const itemIds = (items as any[]).map(i => i.id);
  const allPhotos = itemIds.length > 0
    ? await evidencesCollection.query(Q.where('session_form_item_id', Q.oneOf(itemIds))).fetch()
    : [];
  const photosByItem: Record<string, string[]> = {};
  for (const p of allPhotos as any[]) {
    if (!p.sessionFormItemId) continue;
    if (!photosByItem[p.sessionFormItemId]) photosByItem[p.sessionFormItemId] = [];
    photosByItem[p.sessionFormItemId].push(p.localUri);
  }

  const itemsFull: ChecklistItemFull[] = [];
  for (const it of items as any[]) {
    const uris = photosByItem[it.id] ?? [];
    const datas = await Promise.all(uris.map(uriToBase64Img));
    itemsFull.push({
      partidaItem: it.partidaItem,
      itemDescription: it.itemDescription,
      validationMethod: it.validationMethod,
      comments: it.comments,
      isCompliant: it.isCompliant,
      isNa: it.isNa,
      hasAnswer: it.hasAnswer,
      valueText: it.valueText,
      valueNumber: it.valueNumber,
      photos: datas.filter((d): d is string => !!d),
    });
  }

  return {
    sessionId,
    templateName,
    equipName: equip ? `${(equip as any).code} — ${(equip as any).name}` : 'Equipo',
    activityName: activity ? (activity as any).name : 'Actividad',
    sectorName: sector ? (sector as any).name : '',
    status: sAny.status,
    startedAt: sAny.startedAt,
    endedAt: sAny.endedAt,
    items: itemsFull,
  };
}

function buildItemHtml(item: ChecklistItemFull): string {
  const a = item;
  const NAVY = '#1E3A8A';
  let answerLabel = '—', answerColor = '#6b7280';
  if (a.isNa) { answerLabel = 'N/A'; answerColor = '#6b7280'; }
  else if (a.isCompliant === true) { answerLabel = 'SÍ'; answerColor = '#16a34a'; }
  else if (a.isCompliant === false) { answerLabel = 'NO'; answerColor = '#dc2626'; }
  const valueLine = a.valueNumber != null
    ? `<div class="ck-value">Valor: <strong>${a.valueNumber}</strong></div>`
    : (a.valueText ? `<div class="ck-value">Valor: <strong>${esc(a.valueText)}</strong></div>` : '');
  const commentsLine = a.comments ? `<div class="ck-comments"><span>Comentarios:</span> ${esc(a.comments)}</div>` : '';
  const photosHtml = a.photos.length > 0
    ? `<div class="ck-photos">${a.photos.map(p => `<img src="${p}" />`).join('')}</div>`
    : '';
  return `
    <div class="ck-item">
      <div class="ck-head">
        ${a.partidaItem ? `<span class="ck-partida">${esc(a.partidaItem)}</span>` : ''}
        <span class="ck-desc">${esc(a.itemDescription)}</span>
        <span class="ck-ans" style="color:${answerColor};border-color:${answerColor};">${answerLabel}</span>
      </div>
      ${a.validationMethod ? `<div class="ck-method">Método: ${esc(a.validationMethod)}</div>` : ''}
      ${valueLine}
      ${commentsLine}
      ${photosHtml}
    </div>`;
}

function buildChecklistSection(c: ChecklistFull): string {
  const NAVY = '#1E3A8A';
  const total = c.items.length;
  const answered = c.items.filter(i => i.hasAnswer || i.isNa).length;
  const ok = c.items.filter(i => i.isCompliant === true).length;
  const ko = c.items.filter(i => i.isCompliant === false).length;
  const na = c.items.filter(i => i.isNa).length;
  return `
    <div class="ck-section">
      <div class="ck-section-head">${esc(c.templateName ?? 'Checklist')}</div>
      <div class="ck-meta">
        <strong>Equipo:</strong> ${esc(c.equipName)} · <strong>Actividad:</strong> ${esc(c.activityName)}
        ${c.sectorName ? ` · <strong>Sector:</strong> ${esc(c.sectorName)}` : ''}
        <br/>
        <strong>Inicio:</strong> ${esc(fmtDateLong(c.startedAt))}
        ${c.endedAt ? ` · <strong>Cierre:</strong> ${esc(fmtDateLong(c.endedAt))}` : ''}
        · <strong>Estado:</strong> ${c.status}
      </div>
      <div class="ck-stats">
        Respondidos: <strong>${answered}/${total}</strong>
        · Conformes: <strong style="color:#16a34a">${ok}</strong>
        · No conformes: <strong style="color:#dc2626">${ko}</strong>
        · N/A: <strong>${na}</strong>
      </div>
      ${c.items.map(buildItemHtml).join('')}
    </div>`;
}

function buildHtml(args: {
  title: string;
  subtitle: string;
  projectName: string;
  exporterName: string;
  rangeLabel: string;
  checklists: ChecklistFull[];
}): string {
  const { title, subtitle, projectName, exporterName, rangeLabel, checklists } = args;
  const NAVY = '#1E3A8A';
  return `<!DOCTYPE html><html><head><meta charset="utf-8" />
    <style>
      body { font-family: -apple-system, Helvetica, Arial, sans-serif; color: #0f172a; padding: 0; margin: 0; }
      .page { padding: 24px; }
      .cover { background: ${NAVY}; color: #fff; padding: 60px 40px; height: 100vh; box-sizing: border-box; display: flex; flex-direction: column; justify-content: space-between; page-break-after: always; }
      .cover-top { font-size: 11px; letter-spacing: 3px; text-transform: uppercase; opacity: 0.7; }
      .cover-title { font-size: 36px; font-weight: 900; margin: 12px 0 6px 0; line-height: 1.1; }
      .cover-sub { font-size: 18px; opacity: 0.9; margin-bottom: 30px; }
      .cover-meta { font-size: 13px; line-height: 1.8; opacity: 0.95; }
      .cover-meta strong { font-weight: 800; }
      .cover-bottom { font-size: 11px; opacity: 0.6; text-align: center; letter-spacing: 2px; }

      .ck-section { page-break-inside: auto; margin-bottom: 24px; }
      .ck-section-head { background: ${NAVY}; color: #fff; padding: 10px 14px; border-radius: 6px 6px 0 0; font-size: 14px; font-weight: 800; }
      .ck-meta { font-size: 11px; color: #475569; padding: 10px 14px; background: #f8fafc; border-left: 1px solid #e2e8f0; border-right: 1px solid #e2e8f0; }
      .ck-stats { font-size: 11px; color: #475569; padding: 8px 14px; background: #f1f5f9; border-left: 1px solid #e2e8f0; border-right: 1px solid #e2e8f0; }

      .ck-item { padding: 10px 14px; border-bottom: 1px solid #e2e8f0; border-left: 1px solid #e2e8f0; border-right: 1px solid #e2e8f0; page-break-inside: avoid; }
      .ck-head { display: flex; align-items: center; gap: 8px; }
      .ck-partida { font-size: 10px; font-weight: 900; color: #64748b; letter-spacing: 0.5px; }
      .ck-desc { flex: 1; font-size: 12px; font-weight: 700; color: #0f172a; }
      .ck-ans { padding: 3px 10px; border-radius: 10px; border: 1.5px solid; font-size: 11px; font-weight: 900; letter-spacing: 0.5px; }
      .ck-method { font-size: 10px; color: #64748b; font-style: italic; margin-top: 4px; }
      .ck-value { font-size: 11px; color: #0f172a; margin-top: 4px; }
      .ck-value strong { color: ${NAVY}; }
      .ck-comments { font-size: 11px; color: #334155; margin-top: 4px; }
      .ck-comments span { font-weight: 700; color: #64748b; }
      .ck-photos { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 6px; }
      .ck-photos img { width: 120px; height: 90px; object-fit: cover; border-radius: 4px; border: 1px solid #e2e8f0; }

      footer { margin-top: 30px; font-size: 9px; color: #94a3b8; text-align: center; padding: 12px 0; border-top: 1px solid #e2e8f0; }
    </style>
  </head><body>
    <div class="cover">
      <div>
        <div class="cover-top">Flow Quarkus AI · Dossier de Calidad</div>
        <div class="cover-title">${esc(title)}</div>
        <div class="cover-sub">${esc(subtitle)}</div>
      </div>
      <div class="cover-meta">
        <strong>Proyecto:</strong> ${esc(projectName)}<br/>
        <strong>Rango:</strong> ${esc(rangeLabel)}<br/>
        <strong>Exportado por:</strong> ${esc(exporterName)}<br/>
        <strong>Fecha de generación:</strong> ${esc(fmtDateLong(Date.now()))}
      </div>
      <div class="cover-bottom">Documento generado con Flow Quarkus AI</div>
    </div>

    <div class="page">
      ${checklists.map(buildChecklistSection).join('')}
      <footer>Generado con Flow Quarkus AI · ${esc(fmtDateLong(Date.now()))}</footer>
    </div>
  </body></html>`;
}

/** PDF unitario de un solo checklist. */
export async function generateChecklistPdf(args: {
  sessionId: string;
  projectName: string;
  exporterName: string;
  previewOnly?: boolean;
}): Promise<string> {
  const c = await loadChecklistFull(args.sessionId);
  if (!c) throw new Error('Sesión no encontrada o sin checklist');
  const rangeLabel = `${fmtDateOnly(c.startedAt)} — ${c.endedAt ? fmtDateOnly(c.endedAt) : 'en curso'}`;
  const html = buildHtml({
    title: `Checklist${c.templateName ? ' — ' + c.templateName : ''}`,
    subtitle: c.equipName,
    projectName: args.projectName,
    exporterName: args.exporterName,
    rangeLabel,
    checklists: [c],
  });
  const { uri } = await Print.printToFileAsync({ html, base64: false });
  if (!args.previewOnly) {
    try {
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: 'Checklist' });
      }
    } catch { /* opcional */ }
  }
  return uri;
}

/** PDF consolidado de varios checklists. */
export async function generateConsolidatedChecklistsPdf(args: {
  sessionIds: string[];
  projectName: string;
  exporterName: string;
  fromMs: number;
  toMs: number;
  previewOnly?: boolean;
}): Promise<string> {
  const checklists: ChecklistFull[] = [];
  for (const sid of args.sessionIds) {
    const c = await loadChecklistFull(sid);
    if (c && c.items.length > 0) checklists.push(c);
  }
  if (checklists.length === 0) throw new Error('No hay checklists con datos en el rango seleccionado');
  const rangeLabel = `${fmtDateOnly(args.fromMs)} — ${fmtDateOnly(args.toMs)}`;
  const html = buildHtml({
    title: 'Dossier de Checklists',
    subtitle: `${checklists.length} checklist${checklists.length === 1 ? '' : 's'} consolidado${checklists.length === 1 ? '' : 's'}`,
    projectName: args.projectName,
    exporterName: args.exporterName,
    rangeLabel,
    checklists,
  });
  const { uri } = await Print.printToFileAsync({ html, base64: false });
  if (!args.previewOnly) {
    try {
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: 'Dossier de Checklists' });
      }
    } catch { /* opcional */ }
  }
  return uri;
}
