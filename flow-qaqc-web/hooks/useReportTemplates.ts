'use client';

/**
 * useReportTemplates — Módulo de Reportes por Correo (web). CRUD de los "modelos" de reporte
 * programado por proyecto + sus destinatarios. Espejo del patrón de useContacts.
 * El ENVÍO real lo hace el generador (GitHub Action / ruta /api/reports/send-test); aquí solo
 * se gestiona la config y se calcula `next_send_at`.
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@lib/supabase/client';

const supabase = createClient();
const KEY = (projectId: string) => ['report-templates', projectId];

export type ReportPeriodicity = 'daily' | 'weekly' | 'monthly';
export type ReportStatus = 'active' | 'inactive';

export interface ReportScope {
  /** Ventana relativa (días hacia atrás desde el envío). null/0 = todo el proyecto. Para un reporte
   *  RECURRENTE conviene relativo (ej. "ensayos de los últimos 7 días"), no fechas fijas. */
  window_days?: number | null;
}

/** Un gráfico del reporte: traza la columna `yKey` del resumen sobre las fechas de ensayo. */
export interface ReportChart {
  yKey: string;                 // key de la columna del resumen (ej. "1:A")
  type: 'line' | 'bars';
  label?: string;               // etiqueta a mostrar (ej. "Densidad - MDS")
}

export interface ReportRecipient {
  id: string;
  template_id: string;
  email: string;
  name: string | null;
  created_at: number;
}

export interface ReportTemplate {
  id: string;
  project_id: string;
  name: string;
  periodicity: ReportPeriodicity;
  send_hour: number;
  send_dow: number | null;
  send_dom: number | null;
  scope_json: ReportScope | null;
  report_tipo: string | null;       // id_protocolo del tipo cuya Tabla Resumen se reporta
  charts_json: ReportChart[] | null;
  custom_message: string | null;
  status: ReportStatus;
  next_send_at: number | null;
  last_run_at: number | null;
  created_at: number;
  updated_at: number;
}

export interface ReportTemplateWithRecipients extends ReportTemplate {
  recipients: ReportRecipient[];
}

export interface ReportTemplateInput {
  name: string;
  periodicity: ReportPeriodicity;
  send_hour: number;
  send_dow: number | null;
  send_dom: number | null;
  scope: ReportScope | null;
  report_tipo: string | null;
  charts: ReportChart[];
  custom_message: string | null;
  status: ReportStatus;
  recipients: { email: string; name: string | null }[];
}

/** Próxima ocurrencia (ms, UTC) según periodicidad + hora/día. null si inactivo. */
export function computeNextSendAt(periodicity: ReportPeriodicity, sendHour: number, sendDow: number | null, sendDom: number | null, fromMs: number): number {
  const d = new Date(fromMs);
  const next = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), Math.max(0, Math.min(23, sendHour)), 0, 0, 0));
  if (periodicity === 'daily') {
    if (next.getTime() <= fromMs) next.setUTCDate(next.getUTCDate() + 1);
    return next.getTime();
  }
  if (periodicity === 'weekly') {
    const dow = Math.max(0, Math.min(6, sendDow ?? 1));
    let guard = 0;
    while ((next.getUTCDay() !== dow || next.getTime() <= fromMs) && guard < 14) { next.setUTCDate(next.getUTCDate() + 1); guard++; }
    return next.getTime();
  }
  // monthly — limitado a día 1-28 para que exista en todos los meses.
  const dom = Math.max(1, Math.min(28, sendDom ?? 1));
  next.setUTCDate(dom);
  if (next.getTime() <= fromMs) { next.setUTCMonth(next.getUTCMonth() + 1); next.setUTCDate(dom); }
  return next.getTime();
}

export function useReportTemplates(projectId: string) {
  return useQuery<ReportTemplateWithRecipients[]>({
    queryKey: KEY(projectId),
    queryFn: async () => {
      const { data: tpls, error } = await supabase
        .from('report_templates').select('*').eq('project_id', projectId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      const templates = (tpls ?? []) as ReportTemplate[];
      if (templates.length === 0) return [];
      const { data: recs } = await supabase
        .from('report_template_recipients').select('*').in('template_id', templates.map(t => t.id));
      const byT = new Map<string, ReportRecipient[]>();
      for (const r of (recs ?? []) as ReportRecipient[]) {
        if (!byT.has(r.template_id)) byT.set(r.template_id, []);
        byT.get(r.template_id)!.push(r);
      }
      return templates.map(t => ({ ...t, recipients: byT.get(t.id) ?? [] }));
    },
    enabled: !!projectId,
    staleTime: 30_000,
  });
}

async function writeRecipients(templateId: string, recipients: { email: string; name: string | null }[]) {
  const now = Date.now();
  const seen = new Set<string>();
  const rows = recipients
    .map(r => ({ email: r.email.trim().toLowerCase(), name: r.name?.trim() || null }))
    .filter(r => r.email && /\S+@\S+\.\S+/.test(r.email) && !seen.has(r.email) && seen.add(r.email))
    .map(r => ({ id: crypto.randomUUID(), template_id: templateId, email: r.email, name: r.name, created_at: now }));
  if (rows.length) {
    const { error } = await supabase.from('report_template_recipients').insert(rows);
    if (error) throw error;
  }
}

export function useCreateReportTemplate(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: ReportTemplateInput) => {
      const now = Date.now();
      const id = crypto.randomUUID();
      const nextSend = input.status === 'active' ? computeNextSendAt(input.periodicity, input.send_hour, input.send_dow, input.send_dom, now) : null;
      const { error } = await supabase.from('report_templates').insert({
        id, project_id: projectId, name: input.name.trim(), periodicity: input.periodicity,
        send_hour: input.send_hour, send_dow: input.send_dow, send_dom: input.send_dom,
        scope_json: input.scope, report_tipo: input.report_tipo, charts_json: input.charts,
        custom_message: input.custom_message?.trim() || null,
        status: input.status, next_send_at: nextSend, created_at: now, updated_at: now,
      });
      if (error) throw error;
      await writeRecipients(id, input.recipients);
      return id;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY(projectId) }),
  });
}

export function useUpdateReportTemplate(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...input }: { id: string } & ReportTemplateInput) => {
      const now = Date.now();
      const nextSend = input.status === 'active' ? computeNextSendAt(input.periodicity, input.send_hour, input.send_dow, input.send_dom, now) : null;
      const { error } = await supabase.from('report_templates').update({
        name: input.name.trim(), periodicity: input.periodicity,
        send_hour: input.send_hour, send_dow: input.send_dow, send_dom: input.send_dom,
        scope_json: input.scope, report_tipo: input.report_tipo, charts_json: input.charts,
        custom_message: input.custom_message?.trim() || null,
        status: input.status, next_send_at: nextSend, updated_at: now,
      }).eq('id', id);
      if (error) throw error;
      // Reemplazar destinatarios (borrar todos + insertar los nuevos).
      await supabase.from('report_template_recipients').delete().eq('template_id', id);
      await writeRecipients(id, input.recipients);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY(projectId) }),
  });
}

export function useDeleteReportTemplate(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('report_templates').delete().eq('id', id);  // cascade borra recipients/runs
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY(projectId) }),
  });
}

/** Enviar el reporte AHORA como prueba (al email indicado). Lo procesa la ruta server-side
 *  /api/reports/send-test (Node: render + resvg + SES). Implementada en la Fase 3. */
export function useSendTestReport(projectId: string) {
  return useMutation({
    mutationFn: async ({ templateId, toEmail }: { templateId: string; toEmail: string }) => {
      const res = await fetch('/api/reports/send-test', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ templateId, toEmail }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || `Error ${res.status}`);
      }
      return true;
    },
  });
}
