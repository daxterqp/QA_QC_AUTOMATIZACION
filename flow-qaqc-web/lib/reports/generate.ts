/**
 * generate.ts — Núcleo del Módulo de Reportes por Correo (server-side, Node). Reutilizado por:
 *   - flow-qaqc-web/scripts/reportMailer.ts (GitHub Action cron)
 *   - flow-qaqc-web/app/api/reports/send-test/route.ts ("Enviar prueba")
 *
 * Dado un templateId (+ toEmail opcional para prueba): carga el modelo + destinatarios + la Tabla
 * Resumen del TIPO (filtrada por ventana) → arma HTML email-safe + gráficos (SVG→PNG inline CID) →
 * envía por AWS SES (MIME raw). Si NO es prueba, avanza next_send_at y registra en report_runs.
 *
 * Imports RELATIVOS (no alias @lib) para que resuelva igual desde el script tsx y desde Next.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { SESClient, SendRawEmailCommand } from '@aws-sdk/client-ses';
import { buildAutoColumns } from '../summaryColumns';
import { FIXED_SUMMARY_COLUMNS, summaryStatus, type SummaryColumn } from '../summaryTable';
import { renderReportChartSvg, svgToPng } from './chart';

export type Periodicity = 'daily' | 'weekly' | 'monthly';
interface Chart { yKey: string; type: 'line' | 'bars'; label?: string }

function svc(): SupabaseClient {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!url || !key) throw new Error('Faltan SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY');
  return createClient(url, key, { auth: { persistSession: false } });
}

const esc = (s: unknown) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Próxima ocurrencia (ms, UTC). Espejo de hooks/useReportTemplates.computeNextSendAt (pure). */
export function computeNextSendAt(periodicity: Periodicity, sendHour: number, sendDow: number | null, sendDom: number | null, fromMs: number): number {
  const d = new Date(fromMs);
  const next = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), Math.max(0, Math.min(23, sendHour || 0)), 0, 0, 0));
  if (periodicity === 'daily') { if (next.getTime() <= fromMs) next.setUTCDate(next.getUTCDate() + 1); return next.getTime(); }
  if (periodicity === 'weekly') {
    const dow = Math.max(0, Math.min(6, sendDow ?? 1)); let g = 0;
    while ((next.getUTCDay() !== dow || next.getTime() <= fromMs) && g < 14) { next.setUTCDate(next.getUTCDate() + 1); g++; }
    return next.getTime();
  }
  const dom = Math.max(1, Math.min(28, sendDom ?? 1));
  next.setUTCDate(dom);
  if (next.getTime() <= fromMs) { next.setUTCMonth(next.getUTCMonth() + 1); next.setUTCDate(dom); }
  return next.getTime();
}

interface Loaded {
  tpl: any; recipients: string[]; projectName: string; columns: SummaryColumn[]; rows: any[];
}

async function loadReport(sb: SupabaseClient, templateId: string): Promise<Loaded | null> {
  const { data: tpl } = await sb.from('report_templates').select('*').eq('id', templateId).single();
  if (!tpl) return null;
  const [{ data: recips }, { data: project }] = await Promise.all([
    sb.from('report_template_recipients').select('email').eq('template_id', templateId),
    sb.from('projects').select('name').eq('id', tpl.project_id).single(),
  ]);
  let templateIds: string[] = [];
  let columns: SummaryColumn[] = [];
  if (tpl.report_tipo) {
    const { data: tmpls } = await sb.from('protocol_templates').select('id').eq('id_protocolo', tpl.report_tipo);
    templateIds = (tmpls ?? []).map((t: any) => t.id);
    if (templateIds.length) {
      const { data: items } = await sb.from('protocol_template_items')
        .select('id, partida_item, item_description, validation_method, section').eq('template_id', templateIds[0]);
      columns = buildAutoColumns((items ?? []) as any);
    }
  }
  let q = sb.from('protocol_summary_rows').select('protocol_code, ensayo_date, sector_name, location_name, status, values_json')
    .eq('project_id', tpl.project_id).order('ensayo_date', { ascending: true });
  if (templateIds.length) q = q.in('template_id', templateIds);
  const wd = tpl.scope_json?.window_days;
  if (wd) {
    const from = new Date(Date.now() - wd * 86400000).toISOString().slice(0, 10);
    q = q.gte('ensayo_date', from);
  }
  const { data: rows } = await q;
  return { tpl, recipients: (recips ?? []).map((r: any) => r.email), projectName: project?.name ?? 'Proyecto', columns, rows: rows ?? [] };
}

const TD = 'padding:6px 9px;border:1px solid #e2e8f0;font-family:Arial,sans-serif;font-size:12px;color:#1e293b;';
const TH = 'padding:7px 9px;border:1px solid #1e3a5f;background:#1e3a5f;color:#fff;font-family:Arial,sans-serif;font-size:11px;font-weight:bold;text-align:left;white-space:nowrap;';

function buildTableHtml(l: Loaded): string {
  const fixed = FIXED_SUMMARY_COLUMNS.filter(c => ['ensayo_date', 'protocol_code', 'sector_name', 'location_name', 'estado'].includes(c.key));
  const cols = [...fixed, ...l.columns];
  const head = cols.map(c => `<th style="${TH}">${esc(c.group ? `${c.group} · ${c.label}` : c.label)}</th>`).join('');
  const cell = (c: SummaryColumn, r: any): string => {
    switch (c.key) {
      case 'ensayo_date': return esc(r.ensayo_date ?? '—');
      case 'protocol_code': return esc(r.protocol_code ?? '—');
      case 'sector_name': return esc(r.sector_name ?? '—');
      case 'location_name': return esc(r.location_name ?? '—');
      case 'estado': return esc(summaryStatus(r.status).label);
      default: { const v = (r.values_json ?? {})[c.key]; return esc(v == null || v === '' ? '—' : v); }
    }
  };
  const body = l.rows.length === 0
    ? `<tr><td style="${TD}" colspan="${cols.length}">Sin ensayos en el período.</td></tr>`
    : l.rows.map((r, i) => `<tr style="background:${i % 2 ? '#f8fafc' : '#fff'}">${cols.map(c => `<td style="${TD}">${cell(c, r)}</td>`).join('')}</tr>`).join('');
  return `<table style="border-collapse:collapse;width:100%;"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
}

function buildEmailHtml(l: Loaded, chartCids: string[]): string {
  const msg = (l.tpl.custom_message ?? '').trim();
  const charts = chartCids.map(cid => `<tr><td style="padding:8px 0;"><img src="cid:${cid}" alt="gráfico" style="width:100%;max-width:680px;border:1px solid #e2e8f0;border-radius:6px;" /></td></tr>`).join('');
  return `<!doctype html><html><body style="margin:0;background:#f1f5f9;padding:18px;">
  <table role="presentation" style="max-width:720px;margin:0 auto;background:#fff;border-radius:10px;overflow:hidden;border:1px solid #e2e8f0;">
    <tr><td style="background:#1e3a5f;padding:16px 20px;"><span style="font-family:Arial,sans-serif;font-size:16px;font-weight:bold;color:#fff;">${esc(l.projectName)}</span><br/><span style="font-family:Arial,sans-serif;font-size:12px;color:#a8c0e0;">${esc(l.tpl.name)}</span></td></tr>
    ${msg ? `<tr><td style="padding:14px 20px 4px;font-family:Arial,sans-serif;font-size:13px;color:#334155;line-height:1.5;">${esc(msg).replace(/\n/g, '<br/>')}</td></tr>` : ''}
    <tr><td style="padding:12px 20px;"><div style="overflow-x:auto;">${buildTableHtml(l)}</div></td></tr>
    ${charts ? `<tr><td style="padding:4px 20px 14px;"><table role="presentation" style="width:100%;">${charts}</table></td></tr>` : ''}
    <tr><td style="padding:12px 20px;border-top:1px solid #e2e8f0;font-family:Arial,sans-serif;font-size:11px;color:#94a3b8;">Reporte automático generado por la plataforma de QA/QC.</td></tr>
  </table></body></html>`;
}

function encHeader(s: string): string {
  // eslint-disable-next-line no-control-regex
  return /[^\x00-\x7F]/.test(s) ? `=?UTF-8?B?${Buffer.from(s, 'utf-8').toString('base64')}?=` : s;
}
function buildMime(from: string, to: string[], subject: string, html: string, images: { cid: string; png: Buffer }[]): string {
  const b = 'rpt_' + Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36);
  const parts: string[] = [
    `From: ${from}`, `To: ${to.join(', ')}`, `Subject: ${encHeader(subject)}`, 'MIME-Version: 1.0',
    `Content-Type: multipart/related; boundary="${b}"`, '',
    `--${b}`, 'Content-Type: text/html; charset=UTF-8', 'Content-Transfer-Encoding: base64', '',
    Buffer.from(html, 'utf-8').toString('base64').replace(/(.{76})/g, '$1\r\n'),
  ];
  for (const img of images) {
    parts.push('', `--${b}`, 'Content-Type: image/png', 'Content-Transfer-Encoding: base64',
      `Content-ID: <${img.cid}>`, `Content-Disposition: inline; filename="${img.cid}.png"`, '',
      img.png.toString('base64').replace(/(.{76})/g, '$1\r\n'));
  }
  parts.push('', `--${b}--`, '');
  return parts.join('\r\n');
}

export interface SendResult { ok: boolean; recipients: number; error?: string }

/** Genera y envía el reporte. `toEmail` (prueba) sobreescribe los destinatarios y NO avanza el horario. */
export async function sendReport(opts: { templateId: string; toEmail?: string }): Promise<SendResult> {
  const sb = svc();
  try {
    const l = await loadReport(sb, opts.templateId);
    if (!l) return { ok: false, recipients: 0, error: 'template_not_found' };
    const recipients = opts.toEmail ? [opts.toEmail] : l.recipients;
    if (recipients.length === 0) return { ok: false, recipients: 0, error: 'no_recipients' };

    const images: { cid: string; png: Buffer }[] = [];
    const charts = (l.tpl.charts_json ?? []) as Chart[];
    charts.forEach((ch, idx) => {
      const points = l.rows
        .map((r: any) => ({ x: r.ensayo_date ?? r.protocol_code ?? '', y: Number((r.values_json ?? {})[ch.yKey]) }))
        .filter(p => Number.isFinite(p.y));
      if (points.length === 0) return;
      const svg = renderReportChartSvg({ title: ch.label || ch.yKey, type: ch.type, points });
      images.push({ cid: `chart${idx}`, png: svgToPng(svg) });
    });

    const html = buildEmailHtml(l, images.map(i => i.cid));
    const subject = `${l.projectName} — ${l.tpl.name}`;
    const from = process.env.SES_FROM || '';
    if (!from) return { ok: false, recipients: 0, error: 'missing_SES_FROM' };
    const mime = buildMime(from, recipients, subject, html, images);

    const ses = new SESClient({
      region: process.env.SES_REGION || 'us-east-2',
      credentials: (process.env.SES_AWS_ACCESS_KEY_ID && process.env.SES_AWS_SECRET_ACCESS_KEY)
        ? { accessKeyId: process.env.SES_AWS_ACCESS_KEY_ID, secretAccessKey: process.env.SES_AWS_SECRET_ACCESS_KEY }
        : undefined,
    });
    await ses.send(new SendRawEmailCommand({ RawMessage: { Data: Buffer.from(mime, 'utf-8') } }));

    const now = Date.now();
    if (!opts.toEmail) {
      const next = l.tpl.status === 'active'
        ? computeNextSendAt(l.tpl.periodicity, l.tpl.send_hour, l.tpl.send_dow, l.tpl.send_dom, now)
        : null;
      await sb.from('report_templates').update({ last_run_at: now, next_send_at: next }).eq('id', opts.templateId);
    }
    await sb.from('report_runs').insert({ id: cryptoRandom(), template_id: opts.templateId, ran_at: now, status: 'ok', recipients: recipients.length, created_at: now });
    return { ok: true, recipients: recipients.length };
  } catch (e: any) {
    const msg = String(e?.message ?? e);
    try { await sb.from('report_runs').insert({ id: cryptoRandom(), template_id: opts.templateId, ran_at: Date.now(), status: 'error', error: msg.slice(0, 500), recipients: 0, created_at: Date.now() }); } catch { /* */ }
    return { ok: false, recipients: 0, error: msg };
  }
}

function cryptoRandom(): string {
  return (globalThis.crypto?.randomUUID?.() ?? `r-${Date.now()}-${Math.floor(Math.random() * 1e9)}`);
}

/** Para el cron: devuelve los modelos activos cuyo next_send_at ya venció. */
export async function dueTemplates(): Promise<{ id: string }[]> {
  const sb = svc();
  const { data } = await sb.from('report_templates').select('id')
    .eq('status', 'active').lte('next_send_at', Date.now()).not('next_send_at', 'is', null);
  return (data ?? []) as { id: string }[];
}
