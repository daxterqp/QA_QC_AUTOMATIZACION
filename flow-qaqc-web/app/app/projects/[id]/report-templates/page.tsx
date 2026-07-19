'use client';

/**
 * Reportes por Correo — Dashboard de Plantillas (web). CRUD de los modelos de reporte programado
 * por proyecto + destinatarios + "Enviar prueba". Espejo del patrón de Contactos.
 */
import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { Mail, Plus, X, Pencil, Trash2, Send, Clock, Users, Check, Power, LineChart, BarChart3 } from 'lucide-react';
import PageHeader from '@components/PageHeader';
import { useProjects } from '@hooks/useProjects';
import { useEnsayosData } from '@hooks/useEnsayos';
import { useAuth } from '@lib/auth-context';
import { cn } from '@lib/utils';
import { createClient } from '@lib/supabase/client';
import { buildAutoColumns, chartYOptions } from '@lib/summaryColumns';
import {
  useReportTemplates, useCreateReportTemplate, useUpdateReportTemplate, useDeleteReportTemplate, useSendTestReport,
  type ReportTemplateWithRecipients, type ReportPeriodicity, type ReportTemplateInput, type ReportChart,
} from '@hooks/useReportTemplates';

const sb = createClient();

const PERIODICITY_LABEL: Record<ReportPeriodicity, string> = { daily: 'Diario', weekly: 'Semanal', monthly: 'Mensual' };
const DOW = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

function fmtDateTime(ms: number | null): string {
  if (!ms) return '—';
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
function describeSchedule(t: ReportTemplateWithRecipients): string {
  const h = `${String(t.send_hour).padStart(2, '0')}:00`;
  if (t.periodicity === 'daily') return `${PERIODICITY_LABEL.daily} · ${h}`;
  if (t.periodicity === 'weekly') return `${PERIODICITY_LABEL.weekly} · ${DOW[t.send_dow ?? 1]} ${h}`;
  return `${PERIODICITY_LABEL.monthly} · día ${t.send_dom ?? 1} ${h}`;
}

export default function ReportTemplatesPage() {
  const { id: projectId } = useParams<{ id: string }>();
  const { data: projects = [] } = useProjects();
  const project = projects.find(p => p.id === projectId);
  const { data: templates = [], isLoading } = useReportTemplates(projectId);

  const [showForm, setShowForm] = useState(false);
  const [editTarget, setEditTarget] = useState<ReportTemplateWithRecipients | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ReportTemplateWithRecipients | null>(null);
  const [testTarget, setTestTarget] = useState<ReportTemplateWithRecipients | null>(null);

  return (
    <div className="min-h-screen bg-surface flex flex-col">
      <PageHeader
        title={project?.name ?? 'Proyecto'}
        subtitle={`Reportes por correo · ${templates.length} ${templates.length === 1 ? 'modelo' : 'modelos'}`}
        crumbs={[
          { label: 'Proyectos', href: '/app/projects' },
          { label: project?.name ?? '...', href: `/app/projects/${projectId}/menu` },
          { label: 'Reportes por correo' },
        ]}
        syncing={isLoading}
        rightContent={
          <button onClick={() => { setEditTarget(null); setShowForm(true); }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-bold bg-primary text-white hover:bg-primary/90 transition">
            <Plus size={14} /> Nuevo modelo
          </button>
        }
      />

      <div className="flex-1 p-4 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2.5 auto-rows-min max-w-screen-2xl w-full mx-auto">
        {isLoading ? (
          [...Array(3)].map((_, i) => <div key={i} className="bg-white rounded-xl h-[84px] animate-pulse border border-gray-100" />)
        ) : templates.length === 0 ? (
          <div className="col-span-full flex flex-col items-center py-16 gap-3">
            <Mail size={36} className="text-[#8896a5]" />
            <p className="text-[#8896a5] font-semibold text-sm text-center">Aún no hay modelos de reporte.<br />Crea uno para enviar la Tabla Resumen + gráficos por correo, automáticamente.</p>
          </div>
        ) : (
          templates.map(tpl => (
            <div key={tpl.id} className="h-full bg-white rounded-xl shadow-subtle border border-transparent p-4 flex items-center gap-3 hover:shadow-card hover:border-primary/20 transition group">
              <div className={cn('w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0', tpl.status === 'active' ? 'bg-primary/10' : 'bg-gray-100')}>
                <Mail size={18} className={tpl.status === 'active' ? 'text-primary' : 'text-[#8896a5]'} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-navy font-semibold text-sm leading-tight truncate">{tpl.name}</p>
                  <span className={cn('text-[9px] font-extrabold rounded px-1.5 py-0.5', tpl.status === 'active' ? 'bg-success/10 text-success' : 'bg-gray-100 text-[#8896a5]')}>
                    {tpl.status === 'active' ? 'ACTIVO' : 'INACTIVO'}
                  </span>
                </div>
                <div className="flex items-center gap-3 mt-0.5 text-[11px] text-[#8896a5] flex-wrap">
                  <span className="flex items-center gap-1"><Clock size={10} /> {describeSchedule(tpl)}</span>
                  <span className="flex items-center gap-1"><Users size={10} /> {tpl.recipients.length} dest.</span>
                  {tpl.status === 'active' && <span>Próximo: {fmtDateTime(tpl.next_send_at)}</span>}
                  {tpl.last_run_at && <span>Último: {fmtDateTime(tpl.last_run_at)}</span>}
                </div>
              </div>
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition">
                <button onClick={() => setTestTarget(tpl)} title="Enviar prueba" className="p-1.5 rounded-lg text-[#8896a5] hover:text-primary hover:bg-primary/10 transition"><Send size={14} /></button>
                <button onClick={() => { setEditTarget(tpl); setShowForm(true); }} title="Editar" className="p-1.5 rounded-lg text-[#8896a5] hover:text-primary hover:bg-primary/10 transition"><Pencil size={14} /></button>
                <button onClick={() => setDeleteTarget(tpl)} title="Eliminar" className="p-1.5 rounded-lg text-[#8896a5] hover:text-danger hover:bg-danger/10 transition"><Trash2 size={14} /></button>
              </div>
            </div>
          ))
        )}
      </div>

      {showForm && <FormModal projectId={projectId} template={editTarget} onClose={() => { setShowForm(false); setEditTarget(null); }} />}
      {deleteTarget && <DeleteModal projectId={projectId} template={deleteTarget} onClose={() => setDeleteTarget(null)} />}
      {testTarget && <TestModal projectId={projectId} template={testTarget} onClose={() => setTestTarget(null)} />}
    </div>
  );
}

// ── Form modal ────────────────────────────────────────────────────────────────
function FormModal({ projectId, template, onClose }: { projectId: string; template: ReportTemplateWithRecipients | null; onClose: () => void }) {
  const isEdit = !!template;
  const createMut = useCreateReportTemplate(projectId);
  const updateMut = useUpdateReportTemplate(projectId);
  const loading = createMut.isPending || updateMut.isPending;

  const [name, setName] = useState(template?.name ?? '');
  const [status, setStatus] = useState<'active' | 'inactive'>(template?.status ?? 'active');
  const [periodicity, setPeriodicity] = useState<ReportPeriodicity>(template?.periodicity ?? 'weekly');
  const [sendHour, setSendHour] = useState(template?.send_hour ?? 8);
  const [sendDow, setSendDow] = useState(template?.send_dow ?? 1);
  const [sendDom, setSendDom] = useState(template?.send_dom ?? 1);
  const [windowDays, setWindowDays] = useState<number | null>(template?.scope_json?.window_days ?? null);
  const [reportTipo, setReportTipo] = useState<string>(template?.report_tipo ?? '');
  const [charts, setCharts] = useState<ReportChart[]>(template?.charts_json ?? []);
  const [yOptions, setYOptions] = useState<{ key: string; label: string }[]>([]);
  const { data: ens } = useEnsayosData(projectId);
  const tipos = (ens?.templates ?? []).filter(t => !t.is_hidden && t.id_protocolo);
  const [message, setMessage] = useState(template?.custom_message ?? '');

  useEffect(() => {
    let active = true;
    (async () => {
      const tpl = reportTipo ? (ens?.templates ?? []).find(t => t.id_protocolo === reportTipo) : null;
      if (!tpl) { if (active) setYOptions([]); return; }
      const { data: items } = await sb.from('protocol_template_items')
        .select('id, partida_item, item_description, validation_method, section').eq('template_id', tpl.id);
      if (active) setYOptions(chartYOptions(buildAutoColumns((items ?? []) as any)));
    })();
    return () => { active = false; };
  }, [reportTipo, ens]);
  const toggleChart = (key: string, label: string) =>
    setCharts(prev => prev.find(c => c.yKey === key) ? prev.filter(c => c.yKey !== key) : [...prev, { yKey: key, type: 'line', label }]);
  const setChartType = (key: string, type: 'line' | 'bars') =>
    setCharts(prev => prev.map(c => c.yKey === key ? { ...c, type } : c));
  const [recipients, setRecipients] = useState<{ email: string; name: string }[]>(
    template?.recipients.map(r => ({ email: r.email, name: r.name ?? '' })) ?? [{ email: '', name: '' }],
  );
  const [error, setError] = useState('');

  const setRecip = (i: number, patch: Partial<{ email: string; name: string }>) =>
    setRecipients(prev => prev.map((r, idx) => idx === i ? { ...r, ...patch } : r));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!name.trim()) { setError('El nombre es obligatorio.'); return; }
    const cleanRecips = recipients.filter(r => r.email.trim());
    if (cleanRecips.length === 0) { setError('Agrega al menos un destinatario.'); return; }
    if (cleanRecips.some(r => !/\S+@\S+\.\S+/.test(r.email.trim()))) { setError('Hay un email inválido.'); return; }

    const input: ReportTemplateInput = {
      name, periodicity, send_hour: sendHour,
      send_dow: periodicity === 'weekly' ? sendDow : null,
      send_dom: periodicity === 'monthly' ? sendDom : null,
      scope: { window_days: windowDays },
      report_tipo: reportTipo || null,
      charts: reportTipo ? charts : [],
      custom_message: message, status,
      recipients: cleanRecips.map(r => ({ email: r.email, name: r.name || null })),
    };
    try {
      if (isEdit) await updateMut.mutateAsync({ id: template!.id, ...input });
      else await createMut.mutateAsync(input);
      onClose();
    } catch { setError('No se pudo guardar. Revisa tu conexión.'); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-divider sticky top-0 bg-white">
          <h2 className="font-bold text-navy text-base">{isEdit ? 'Editar modelo' : 'Nuevo modelo de reporte'}</h2>
          <button onClick={onClose} className="text-[#8896a5] hover:text-navy transition"><X size={18} /></button>
        </div>
        <form onSubmit={submit} className="px-5 py-4 flex flex-col gap-3">
          <Field label="Nombre del modelo">
            <input value={name} onChange={e => setName(e.target.value)} placeholder="Ej. Resumen semanal de obra" autoFocus className={inputCls} />
          </Field>

          <div className="flex items-center justify-between bg-surface rounded-lg px-3 py-2.5 border border-border">
            <span className="text-sm font-semibold text-navy flex items-center gap-2"><Power size={14} className={status === 'active' ? 'text-success' : 'text-[#8896a5]'} /> {status === 'active' ? 'Activo (se enviará)' : 'Inactivo'}</span>
            <button type="button" onClick={() => setStatus(s => s === 'active' ? 'inactive' : 'active')}
              className={cn('w-11 h-6 rounded-full transition relative', status === 'active' ? 'bg-success' : 'bg-gray-300')}>
              <span className={cn('absolute top-0.5 w-5 h-5 bg-white rounded-full transition', status === 'active' ? 'left-[22px]' : 'left-0.5')} />
            </button>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Periodicidad">
              <select value={periodicity} onChange={e => setPeriodicity(e.target.value as ReportPeriodicity)} className={inputCls}>
                <option value="daily">Diario</option>
                <option value="weekly">Semanal</option>
                <option value="monthly">Mensual</option>
              </select>
            </Field>
            <Field label="Hora (UTC)">
              <select value={sendHour} onChange={e => setSendHour(Number(e.target.value))} className={inputCls}>
                {Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{String(h).padStart(2, '0')}:00</option>)}
              </select>
            </Field>
          </div>

          {periodicity === 'weekly' && (
            <Field label="Día de la semana">
              <select value={sendDow} onChange={e => setSendDow(Number(e.target.value))} className={inputCls}>
                {DOW.map((d, i) => <option key={i} value={i}>{d}</option>)}
              </select>
            </Field>
          )}
          {periodicity === 'monthly' && (
            <Field label="Día del mes (1–28)">
              <input type="number" min={1} max={28} value={sendDom} onChange={e => setSendDom(Math.max(1, Math.min(28, Number(e.target.value) || 1)))} className={inputCls} />
            </Field>
          )}

          <Field label="Tipo de ensayo (Tabla Resumen)">
            <select value={reportTipo} onChange={e => { setReportTipo(e.target.value); setCharts([]); }} className={inputCls}>
              <option value="">— Elige el tipo —</option>
              {tipos.map(t => <option key={t.id} value={t.id_protocolo ?? ''}>{t.id_protocolo ? `${t.id_protocolo} — ${t.name}` : t.name}</option>)}
            </select>
          </Field>

          <Field label="Datos a incluir (ventana)">
            <select value={windowDays ?? 0} onChange={e => setWindowDays(Number(e.target.value) || null)} className={inputCls}>
              <option value={0}>Todo el proyecto</option>
              <option value={7}>Últimos 7 días</option>
              <option value={30}>Últimos 30 días</option>
              <option value={90}>Últimos 90 días</option>
            </select>
          </Field>

          {reportTipo && (
            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-bold text-[#4a5568] uppercase tracking-wider">Gráficos (opcional)</label>
              {yOptions.length === 0 ? (
                <p className="text-xs text-[#8896a5] italic">Este tipo no tiene columnas numéricas para graficar.</p>
              ) : (
                <div className="flex flex-col gap-1 max-h-44 overflow-y-auto border border-border rounded-lg p-2 bg-surface">
                  {yOptions.map(o => {
                    const sel = charts.find(c => c.yKey === o.key);
                    return (
                      <div key={o.key} className="flex items-center gap-2">
                        <label className="flex items-center gap-2 flex-1 min-w-0 cursor-pointer text-sm text-navy">
                          <input type="checkbox" checked={!!sel} onChange={() => toggleChart(o.key, o.label)} className="accent-primary" />
                          <span className="truncate">{o.label}</span>
                        </label>
                        {sel && (
                          <div className="flex items-center gap-1 shrink-0">
                            <button type="button" onClick={() => setChartType(o.key, 'line')} title="Línea" className={cn('p-1 rounded', sel.type === 'line' ? 'bg-primary text-white' : 'text-[#8896a5] hover:bg-gray-100')}><LineChart size={14} /></button>
                            <button type="button" onClick={() => setChartType(o.key, 'bars')} title="Barras" className={cn('p-1 rounded', sel.type === 'bars' ? 'bg-primary text-white' : 'text-[#8896a5] hover:bg-gray-100')}><BarChart3 size={14} /></button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          <Field label="Mensaje personalizado (opcional)">
            <textarea value={message} onChange={e => setMessage(e.target.value)} rows={2} placeholder="Saludo o nota que va arriba de la tabla…" className={inputCls} />
          </Field>

          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-bold text-[#4a5568] uppercase tracking-wider">Destinatarios</label>
            {recipients.map((r, i) => (
              <div key={i} className="flex gap-2 items-center">
                <input value={r.email} onChange={e => setRecip(i, { email: e.target.value })} placeholder="correo@empresa.com" type="email" className={cn(inputCls, 'flex-1')} />
                <input value={r.name} onChange={e => setRecip(i, { name: e.target.value })} placeholder="Nombre" className={cn(inputCls, 'w-28')} />
                <button type="button" onClick={() => setRecipients(prev => prev.filter((_, idx) => idx !== i))} className="text-[#8896a5] hover:text-danger p-1"><X size={16} /></button>
              </div>
            ))}
            <button type="button" onClick={() => setRecipients(prev => [...prev, { email: '', name: '' }])} className="self-start text-xs font-bold text-primary hover:underline flex items-center gap-1"><Plus size={12} /> Agregar destinatario</button>
          </div>

          {error && <p className="text-danger text-xs font-medium">{error}</p>}

          <div className="flex gap-2 mt-1">
            <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-border text-sm font-semibold text-[#4a5568] hover:bg-surface transition">Cancelar</button>
            <button type="submit" disabled={loading} className={cn('flex-1 py-2.5 rounded-xl text-sm font-bold text-white transition flex items-center justify-center gap-1.5', loading ? 'bg-primary/60' : 'bg-primary hover:bg-primary/90')}>
              {loading ? <span className="animate-spin inline-block w-4 h-4 border-2 border-white/40 border-t-white rounded-full" /> : <><Check size={14} /> {isEdit ? 'Guardar' : 'Crear'}</>}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Delete modal ──────────────────────────────────────────────────────────────
function DeleteModal({ projectId, template, onClose }: { projectId: string; template: ReportTemplateWithRecipients; onClose: () => void }) {
  const del = useDeleteReportTemplate(projectId);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-danger/10 flex items-center justify-center flex-shrink-0"><Trash2 size={18} className="text-danger" /></div>
          <div><p className="font-bold text-navy text-sm">Eliminar modelo</p><p className="text-[#8896a5] text-xs mt-0.5">No se puede deshacer.</p></div>
        </div>
        <div className="bg-surface rounded-lg px-4 py-3"><p className="font-semibold text-navy text-sm">{template.name}</p></div>
        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-border text-sm font-semibold text-[#4a5568] hover:bg-surface transition">Cancelar</button>
          <button onClick={async () => { await del.mutateAsync(template.id); onClose(); }} disabled={del.isPending} className="flex-1 py-2.5 rounded-xl bg-danger text-white text-sm font-bold hover:bg-red-700 transition disabled:opacity-60">{del.isPending ? 'Eliminando…' : 'Eliminar'}</button>
        </div>
      </div>
    </div>
  );
}

// ── Test send modal ───────────────────────────────────────────────────────────
function TestModal({ projectId, template, onClose }: { projectId: string; template: ReportTemplateWithRecipients; onClose: () => void }) {
  const { currentUser } = useAuth();
  const sendTest = useSendTestReport(projectId);
  const [email, setEmail] = useState((currentUser as { email?: string } | null)?.email ?? '');
  const [msg, setMsg] = useState('');

  async function send() {
    setMsg('');
    if (!/\S+@\S+\.\S+/.test(email.trim())) { setMsg('Email inválido.'); return; }
    try { await sendTest.mutateAsync({ templateId: template.id, toEmail: email.trim() }); setMsg('✓ Enviado. Revisa tu bandeja.'); }
    catch (e: any) { setMsg(`No se pudo enviar: ${e?.message ?? 'error'}`); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0"><Send size={18} className="text-primary" /></div>
          <div><p className="font-bold text-navy text-sm">Enviar prueba</p><p className="text-[#8896a5] text-xs mt-0.5">{template.name}</p></div>
        </div>
        <Field label="Enviar a">
          <input value={email} onChange={e => setEmail(e.target.value)} type="email" className={inputCls} />
        </Field>
        {msg && <p className={cn('text-xs font-medium', msg.startsWith('✓') ? 'text-success' : 'text-danger')}>{msg}</p>}
        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-border text-sm font-semibold text-[#4a5568] hover:bg-surface transition">Cerrar</button>
          <button onClick={send} disabled={sendTest.isPending} className="flex-1 py-2.5 rounded-xl bg-primary text-white text-sm font-bold hover:bg-primary/90 transition disabled:opacity-60">{sendTest.isPending ? 'Enviando…' : 'Enviar'}</button>
        </div>
      </div>
    </div>
  );
}

const inputCls = 'w-full bg-surface border border-border rounded-lg px-3 py-2.5 text-sm text-navy placeholder:text-[#8896a5] focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition';
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="flex flex-col gap-1"><label className="text-[11px] font-bold text-[#4a5568] uppercase tracking-wider">{label}</label>{children}</div>;
}
