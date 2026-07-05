/**
 * tools.ts — Herramientas del Asistente IA (Fase 1: núcleo de ensayos).
 *
 * Cada tool consulta Supabase con el cliente AUTENTICADO CON EL JWT DEL USUARIO
 * (RLS aplica solo: can_access_project + org). El `projectId` va CERRADO en el
 * closure — el modelo no puede cambiar de proyecto. Toda cifra que el asistente
 * diga sale de aquí; el system prompt le prohíbe estimar por su cuenta.
 *
 * Fuente principal: `protocol_summary_rows` (una fila por ensayo ENVIADO/aprobado/
 * rechazado, con values_json ya calculado — nunca borradores a medio llenar).
 */
import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2';
import { type DateUnit, isYmd, periodKeyOf, periodLabel } from './dates.ts';
import { renderTrendChartSvg } from './chart.ts';

/** Nombre de la tool cuyo SVG intercepta index.ts (no vuelve al modelo). */
export const CHART_TOOL_NAME = 'generar_grafico';
/** Clave interna del SVG dentro del resultado de la tool de gráfico. */
export const CHART_SVG_KEY = '__chart_svg';

// ── Tipos ────────────────────────────────────────────────────────────────────

export interface ToolDef {
  name: string;
  description: string;
  // deno-lint-ignore no-explicit-any
  input_schema: Record<string, any>;
  // deno-lint-ignore no-explicit-any
  execute: (input: any) => Promise<unknown>;
}

interface SummaryRowLite {
  ensayo_date: string | null;
  template_id: string | null;
  sector_id: string | null;
  sector_name: string | null;
  location_name: string | null;
  protocol_code: string | null;
  status: string | null;
  values_json: Record<string, unknown> | null;
}

// ── Resolución tolerante de nombres (sector/tipo por nombre) ────────────────

const norm = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();

/** exacto → prefijo → contiene. 1 match = ok; 0 o 2+ = se reporta al modelo. */
function resolveByName<T extends { nombre: string }>(items: T[], query: string): { match?: T; candidatos?: T[] } {
  const q = norm(query);
  if (!q) return { candidatos: [] };
  const exact = items.filter(i => norm(i.nombre) === q);
  if (exact.length === 1) return { match: exact[0] };
  if (exact.length > 1) return { candidatos: exact };
  const prefix = items.filter(i => norm(i.nombre).startsWith(q));
  if (prefix.length === 1) return { match: prefix[0] };
  if (prefix.length > 1) return { candidatos: prefix };
  const contains = items.filter(i => norm(i.nombre).includes(q) || q.includes(norm(i.nombre)));
  if (contains.length === 1) return { match: contains[0] };
  return { candidatos: contains };
}

// ── Estadística mínima (mirror del patrón polyfit de SummaryTablesScreen) ───

function linearSlopePerDay(points: { x: number; y: number }[]): number | null {
  const n = points.length;
  if (n < 2) return null;
  let sx = 0, sy = 0, sxy = 0, sxx = 0;
  for (const p of points) { sx += p.x; sy += p.y; sxy += p.x * p.y; sxx += p.x * p.x; }
  const den = n * sxx - sx * sx;
  if (Math.abs(den) < 1e-12) return null;
  return (n * sxy - sx * sy) / den;
}

const ymdToDays = (ymd: string) => Math.floor(new Date(ymd + 'T00:00:00Z').getTime() / 86400000);

// ── Catálogo (sectores / tipos+columnas / ubicaciones) ───────────────────────

interface Catalog {
  sectores: { id: string; nombre: string }[];
  tipos: { template_id: string; codigo: string | null; nombre: string; columnas: { key: string; label: string; kind: string }[] }[];
  ubicaciones: { id: string; nombre: string }[];
}

/** Columnas de una plantilla: summary_config_json si existe; si no, deriva de
 *  la fila resumen más reciente (mirror mínimo de parseSummaryConfig/
 *  dynamicColumnsFromRows de lib/summaryTable.ts). */
// deno-lint-ignore no-explicit-any
function columnsFromConfig(raw: any): { key: string; label: string; kind: string }[] | null {
  try {
    const cfg = typeof raw === 'string' ? JSON.parse(raw) : raw;
    const cols = cfg?.columns;
    if (!Array.isArray(cols) || cols.length === 0) return null;
    return cols
      .filter((c: unknown) => c && typeof (c as { key?: unknown }).key === 'string')
      // deno-lint-ignore no-explicit-any
      .map((c: any) => ({ key: c.key, label: String(c.label ?? c.key), kind: String(c.kind ?? 'text') }));
  } catch { return null; }
}

const FIXED_KEYS = new Set(['project_name', 'sector_name', 'location_name', 'protocol_code', 'ensayo_date', 'realizado_por', 'aprobado_por', 'estado', 'fecha_aprobacion']);

async function loadCatalog(supabase: SupabaseClient, projectId: string): Promise<Catalog> {
  const [secQ, tplQ, locQ] = await Promise.all([
    supabase.from('project_sectors').select('id, name').eq('project_id', projectId).order('name'),
    supabase.from('protocol_templates').select('id, id_protocolo, name, summary_config_json, is_hidden').eq('project_id', projectId),
    supabase.from('locations').select('id, name').eq('project_id', projectId).order('name').limit(100),
  ]);
  const sectores = (secQ.data ?? []).map(s => ({ id: s.id as string, nombre: String(s.name ?? '') }));
  const ubicaciones = (locQ.data ?? []).map(l => ({ id: l.id as string, nombre: String(l.name ?? '') }));

  const tipos: Catalog['tipos'] = [];
  for (const t of tplQ.data ?? []) {
    if (t.is_hidden) continue;
    let columnas = columnsFromConfig(t.summary_config_json);
    if (!columnas) {
      // Deriva de la fila resumen más reciente de ese tipo (si hay datos).
      const { data: sample } = await supabase.from('protocol_summary_rows')
        .select('values_json').eq('project_id', projectId).eq('template_id', t.id)
        .order('updated_at', { ascending: false }).limit(1).maybeSingle();
      const vj = (sample?.values_json ?? null) as Record<string, unknown> | null;
      columnas = vj
        ? Object.entries(vj)
          .filter(([k]) => !FIXED_KEYS.has(k))
          .slice(0, 40)
          .map(([k, v]) => ({ key: k, label: k, kind: typeof v === 'number' || (typeof v === 'string' && v !== '' && !isNaN(Number(v))) ? 'number' : 'text' }))
        : [];
    }
    tipos.push({ template_id: t.id as string, codigo: (t.id_protocolo as string) ?? null, nombre: String(t.name ?? ''), columnas });
  }
  return { sectores, tipos, ubicaciones };
}

// ── Query base de filas resumen con filtros comunes ──────────────────────────

interface CommonFilters {
  desde?: string; hasta?: string;
  template_id?: string; tipo_nombre?: string;
  sector_id?: string; sector_nombre?: string;
  estado?: 'APPROVED' | 'SUBMITTED' | 'REJECTED';
}

/** Resuelve nombres → ids contra el catálogo. Devuelve error estructurado si es ambiguo. */
async function resolveFilters(supabase: SupabaseClient, projectId: string, f: CommonFilters):
  Promise<{ ok: true; templateId?: string; sectorId?: string } | { ok: false; error: unknown }> {
  let templateId = f.template_id;
  let sectorId = f.sector_id;
  if ((!templateId && f.tipo_nombre) || (!sectorId && f.sector_nombre)) {
    const cat = await loadCatalog(supabase, projectId);
    if (!templateId && f.tipo_nombre) {
      const r = resolveByName(cat.tipos.map(t => ({ ...t, nombre: `${t.codigo ?? ''} ${t.nombre}`.trim() })), f.tipo_nombre);
      if (r.match) templateId = r.match.template_id;
      else return { ok: false, error: { error: 'tipo_ambiguo_o_inexistente', consulta: f.tipo_nombre, candidatos: (r.candidatos ?? cat.tipos).map(t => ({ template_id: t.template_id, codigo: t.codigo, nombre: t.nombre })) } };
    }
    if (!sectorId && f.sector_nombre) {
      const r = resolveByName(cat.sectores, f.sector_nombre);
      if (r.match) sectorId = r.match.id;
      else return { ok: false, error: { error: 'sector_ambiguo_o_inexistente', consulta: f.sector_nombre, candidatos: (r.candidatos ?? cat.sectores).map(s => ({ id: s.id, nombre: s.nombre })) } };
    }
  }
  return { ok: true, templateId, sectorId };
}

async function fetchRows(supabase: SupabaseClient, projectId: string, f: CommonFilters, resolved: { templateId?: string; sectorId?: string }, limit = 2000): Promise<SummaryRowLite[]> {
  let q = supabase.from('protocol_summary_rows')
    .select('ensayo_date, template_id, sector_id, sector_name, location_name, protocol_code, status, values_json')
    .eq('project_id', projectId);
  if (isYmd(f.desde)) q = q.gte('ensayo_date', f.desde);
  if (isYmd(f.hasta)) q = q.lte('ensayo_date', f.hasta);
  if (resolved.templateId) q = q.eq('template_id', resolved.templateId);
  if (resolved.sectorId) q = q.eq('sector_id', resolved.sectorId);
  if (f.estado) q = q.eq('status', f.estado);
  const { data, error } = await q.order('ensayo_date', { ascending: true }).limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []) as SummaryRowLite[];
}

/** Valor numérico de una columna del values_json (acepta número o string numérica). */
function numValue(vj: Record<string, unknown> | null, key: string): number | null {
  const v = vj?.[key];
  if (typeof v === 'number' && isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v.replace(',', '.'));
    if (isFinite(n)) return n;
  }
  return null;
}

// ── Definición de las tools ──────────────────────────────────────────────────

const COMMON_FILTER_PROPS = {
  desde: { type: 'string', description: 'Fecha inicial YYYY-MM-DD (inclusive), en hora de Lima' },
  hasta: { type: 'string', description: 'Fecha final YYYY-MM-DD (inclusive)' },
  template_id: { type: 'string', description: 'ID exacto del tipo de ensayo (de catalogo_proyecto)' },
  tipo_nombre: { type: 'string', description: 'Nombre o código del tipo de ensayo tal como lo dijo el usuario (se resuelve tolerante)' },
  sector_id: { type: 'string', description: 'ID exacto del sector (de catalogo_proyecto)' },
  sector_nombre: { type: 'string', description: 'Nombre del sector tal como lo dijo el usuario, ej. "sector 3" (se resuelve tolerante)' },
  estado: { type: 'string', enum: ['APPROVED', 'SUBMITTED', 'REJECTED'], description: 'Filtrar por estado (aprobado / en revisión / rechazado)' },
};

export function buildTools(supabase: SupabaseClient, projectId: string): ToolDef[] {
  return [
    {
      name: 'catalogo_proyecto',
      description: 'Devuelve los catálogos reales del proyecto: sectores (id+nombre), tipos de ensayo (template_id, código, nombre y sus columnas de resultados con su key exacta), ubicaciones, rango de fechas con datos y total de ensayos registrados. Úsala PRIMERO cuando el usuario mencione un sector, tipo de ensayo o resultado por su nombre, para resolverlo a IDs/keys reales.',
      input_schema: { type: 'object', properties: {}, additionalProperties: false },
      execute: async () => {
        const cat = await loadCatalog(supabase, projectId);
        const { data: range } = await supabase.from('protocol_summary_rows')
          .select('ensayo_date').eq('project_id', projectId)
          .not('ensayo_date', 'is', null).order('ensayo_date', { ascending: true }).limit(1);
        const { data: rangeMax } = await supabase.from('protocol_summary_rows')
          .select('ensayo_date').eq('project_id', projectId)
          .not('ensayo_date', 'is', null).order('ensayo_date', { ascending: false }).limit(1);
        const { count } = await supabase.from('protocol_summary_rows')
          .select('id', { count: 'exact', head: true }).eq('project_id', projectId);
        return {
          ...cat,
          rango_fechas: { primera: range?.[0]?.ensayo_date ?? null, ultima: rangeMax?.[0]?.ensayo_date ?? null },
          total_ensayos: count ?? 0,
        };
      },
    },
    {
      name: 'contar_ensayos',
      description: 'Cuenta ensayos registrados (enviados/aprobados/rechazados; nunca borradores) con filtros de fecha, tipo, sector y estado. Puede agrupar por día, semana (corte lunes) o mes. Para "hoy"/"ayer"/"esta semana" calcula tú las fechas con la fecha actual de Lima del sistema.',
      input_schema: {
        type: 'object',
        properties: {
          ...COMMON_FILTER_PROPS,
          agrupar: { type: 'string', enum: ['total', 'dia', 'semana', 'mes'], description: 'Cómo agrupar el conteo (default total)' },
        },
        additionalProperties: false,
      },
      execute: async (input: CommonFilters & { agrupar?: DateUnit }) => {
        const res = await resolveFilters(supabase, projectId, input);
        if (!res.ok) return res.error;
        const rows = await fetchRows(supabase, projectId, input, res);
        const unit: DateUnit = input.agrupar && ['dia', 'semana', 'mes'].includes(input.agrupar) ? input.agrupar : 'total';
        const porTipo = new Map<string, number>();
        for (const r of rows) porTipo.set(r.template_id ?? '?', (porTipo.get(r.template_id ?? '?') ?? 0) + 1);
        const out: Record<string, unknown> = { total: rows.length, por_tipo: Array.from(porTipo, ([template_id, cantidad]) => ({ template_id, cantidad })) };
        if (unit !== 'total') {
          const buckets = new Map<string, number>();
          for (const r of rows) {
            if (!r.ensayo_date) continue;
            const k = periodKeyOf(r.ensayo_date, unit);
            buckets.set(k, (buckets.get(k) ?? 0) + 1);
          }
          out.grupos = Array.from(buckets.entries()).sort((a, b) => a[0].localeCompare(b[0]))
            .map(([k, cantidad]) => ({ periodo: k, etiqueta: periodLabel(k, unit), cantidad }));
        }
        return out;
      },
    },
    {
      name: 'listar_ensayos',
      description: 'Lista ensayos (código, fecha, tipo, sector, ubicación, estado, quién lo realizó y quién lo aprobó), ordenados del más reciente al más antiguo. Máximo 20.',
      input_schema: {
        type: 'object',
        properties: {
          ...COMMON_FILTER_PROPS,
          limite: { type: 'integer', minimum: 1, maximum: 20, description: 'Cuántos devolver (default 10)' },
        },
        additionalProperties: false,
      },
      execute: async (input: CommonFilters & { limite?: number }) => {
        const res = await resolveFilters(supabase, projectId, input);
        if (!res.ok) return res.error;
        const rows = await fetchRows(supabase, projectId, input, res);
        const limite = Math.min(Math.max(input.limite ?? 10, 1), 20);
        const recent = rows.slice(-limite).reverse();
        return {
          mostrando: recent.length,
          total_filtrado: rows.length,
          ensayos: recent.map(r => ({
            codigo: r.protocol_code, fecha: r.ensayo_date, template_id: r.template_id,
            sector: r.sector_name, ubicacion: r.location_name, estado: r.status,
            realizo: (r.values_json?.realizado_por as string) ?? null,
            aprobo: (r.values_json?.aprobado_por as string) ?? null,
          })),
        };
      },
    },
    {
      name: 'serie_temporal',
      description: 'Serie temporal de una columna numérica de un tipo de ensayo (ej. grado de compactación, densidad). Devuelve los puntos (fecha, valor) Y estadísticos ya calculados (promedio, mín, máx, tendencia por día) — usa ESTAS cifras, no calcules tú. La column_key exacta sale de catalogo_proyecto.',
      input_schema: {
        type: 'object',
        properties: {
          ...COMMON_FILTER_PROPS,
          column_key: { type: 'string', description: 'Key exacta de la columna (de catalogo_proyecto → tipos → columnas)' },
        },
        required: ['column_key'],
        additionalProperties: false,
      },
      execute: async (input: CommonFilters & { column_key: string }) => {
        const res = await resolveFilters(supabase, projectId, input);
        if (!res.ok) return res.error;
        if (!res.templateId && !input.tipo_nombre) {
          return { error: 'falta_tipo', mensaje: 'Indica template_id o tipo_nombre para la serie (una columna pertenece a un tipo de ensayo).' };
        }
        const rows = await fetchRows(supabase, projectId, input, res);
        const points: { fecha: string; valor: number }[] = [];
        for (const r of rows) {
          if (!r.ensayo_date) continue;
          const v = numValue(r.values_json, input.column_key);
          if (v != null) points.push({ fecha: r.ensayo_date, valor: v });
        }
        if (points.length === 0) return { puntos: [], n: 0, mensaje: 'Sin datos numéricos para esa columna en el rango.' };
        const ys = points.map(p => p.valor);
        const xs0 = ymdToDays(points[0].fecha);
        const slope = linearSlopePerDay(points.map(p => ({ x: ymdToDays(p.fecha) - xs0, y: p.valor })));
        const capped = points.length > 200 ? points.filter((_, i) => i % Math.ceil(points.length / 200) === 0) : points;
        return {
          n: points.length,
          puntos: capped,
          promedio: ys.reduce((a, b) => a + b, 0) / ys.length,
          minimo: Math.min(...ys),
          maximo: Math.max(...ys),
          tendencia_por_dia: slope,
          primera_fecha: points[0].fecha,
          ultima_fecha: points[points.length - 1].fecha,
        };
      },
    },
    {
      name: 'comparar_periodos',
      description: 'Compara una columna numérica de un tipo de ensayo entre DOS rangos de fechas (ej. esta semana vs la anterior) y devuelve valores agregados, delta y delta porcentual. Útil para "¿mejoró X?".',
      input_schema: {
        type: 'object',
        properties: {
          template_id: COMMON_FILTER_PROPS.template_id,
          tipo_nombre: COMMON_FILTER_PROPS.tipo_nombre,
          sector_id: COMMON_FILTER_PROPS.sector_id,
          sector_nombre: COMMON_FILTER_PROPS.sector_nombre,
          column_key: { type: 'string', description: 'Key exacta de la columna (de catalogo_proyecto)' },
          periodo_a: { type: 'object', properties: { desde: { type: 'string' }, hasta: { type: 'string' } }, required: ['desde', 'hasta'], description: 'Rango anterior (YYYY-MM-DD)' },
          periodo_b: { type: 'object', properties: { desde: { type: 'string' }, hasta: { type: 'string' } }, required: ['desde', 'hasta'], description: 'Rango reciente (YYYY-MM-DD)' },
          operacion: { type: 'string', enum: ['promedio', 'suma', 'maximo', 'minimo'], description: 'Agregación (default promedio)' },
        },
        required: ['column_key', 'periodo_a', 'periodo_b'],
        additionalProperties: false,
      },
      execute: async (input: CommonFilters & { column_key: string; periodo_a: { desde: string; hasta: string }; periodo_b: { desde: string; hasta: string }; operacion?: string }) => {
        const res = await resolveFilters(supabase, projectId, input);
        if (!res.ok) return res.error;
        const agg = (vals: number[]): number | null => {
          if (vals.length === 0) return null;
          switch (input.operacion ?? 'promedio') {
            case 'suma': return vals.reduce((a, b) => a + b, 0);
            case 'maximo': return Math.max(...vals);
            case 'minimo': return Math.min(...vals);
            default: return vals.reduce((a, b) => a + b, 0) / vals.length;
          }
        };
        const grab = async (p: { desde: string; hasta: string }) => {
          const rows = await fetchRows(supabase, projectId, { ...input, desde: p.desde, hasta: p.hasta }, res);
          return rows.map(r => numValue(r.values_json, input.column_key)).filter((v): v is number => v != null);
        };
        const [va, vb] = await Promise.all([grab(input.periodo_a), grab(input.periodo_b)]);
        const a = agg(va), b = agg(vb);
        return {
          operacion: input.operacion ?? 'promedio',
          periodo_a: { ...input.periodo_a, valor: a, n: va.length },
          periodo_b: { ...input.periodo_b, valor: b, n: vb.length },
          delta: a != null && b != null ? b - a : null,
          delta_pct: a != null && b != null && a !== 0 ? ((b - a) / Math.abs(a)) * 100 : null,
        };
      },
    },

    // ── Fase 2: "toda la app conversable" ────────────────────────────────────
    {
      name: CHART_TOOL_NAME,
      description: 'Genera un GRÁFICO de tendencia (línea + recta de tendencia) de una columna numérica de un tipo de ensayo en el tiempo. El gráfico se muestra automáticamente en el chat — tú solo comenta las cifras del resumen que te devuelve. Úsala cuando pidan "grafica", "muéstrame la curva/tendencia/evolución".',
      input_schema: {
        type: 'object',
        properties: {
          ...COMMON_FILTER_PROPS,
          column_key: { type: 'string', description: 'Key exacta de la columna (de catalogo_proyecto)' },
          titulo: { type: 'string', description: 'Título corto del gráfico en español (ej. "Grado de compactación — última semana")' },
        },
        required: ['column_key', 'titulo'],
        additionalProperties: false,
      },
      execute: async (input: CommonFilters & { column_key: string; titulo: string }) => {
        const res = await resolveFilters(supabase, projectId, input);
        if (!res.ok) return res.error;
        if (!res.templateId && !input.tipo_nombre) {
          return { error: 'falta_tipo', mensaje: 'Indica template_id o tipo_nombre: una columna pertenece a un tipo de ensayo (sin él se mezclarían valores de tipos distintos).' };
        }
        const rows = await fetchRows(supabase, projectId, input, res);
        const points: { x: string; y: number }[] = [];
        for (const r of rows) {
          if (!r.ensayo_date) continue;
          const v = numValue(r.values_json, input.column_key);
          if (v != null) points.push({ x: r.ensayo_date, y: v });
        }
        if (points.length < 2) {
          return { grafico_generado: false, mensaje: `Solo hay ${points.length} dato(s) numérico(s) para esa columna en el rango — no alcanza para una tendencia.` };
        }
        const ys = points.map(p => p.y);
        const svg = renderTrendChartSvg(input.titulo.slice(0, 80), points);
        return {
          grafico_generado: true,
          [CHART_SVG_KEY]: svg,   // index.ts lo extrae; NO viaja al modelo
          resumen: {
            n: points.length,
            promedio: ys.reduce((a, b) => a + b, 0) / ys.length,
            minimo: Math.min(...ys),
            maximo: Math.max(...ys),
            primera_fecha: points[0].x,
            ultima_fecha: points[points.length - 1].x,
          },
        };
      },
    },
    {
      name: 'resumen_muestras',
      description: 'Resumen de MUESTRAS físicas del proyecto: conteos por tipo de material y condición (alterada/inalterada), con filtros de fecha y sector, más las muestras más recientes.',
      input_schema: {
        type: 'object',
        properties: {
          desde: COMMON_FILTER_PROPS.desde,
          hasta: COMMON_FILTER_PROPS.hasta,
          sector_id: COMMON_FILTER_PROPS.sector_id,
          sector_nombre: COMMON_FILTER_PROPS.sector_nombre,
          limite: { type: 'integer', minimum: 1, maximum: 20, description: 'Muestras recientes a listar (default 5)' },
        },
        additionalProperties: false,
      },
      execute: async (input: { desde?: string; hasta?: string; sector_id?: string; sector_nombre?: string; limite?: number }) => {
        const res = await resolveFilters(supabase, projectId, input);
        if (!res.ok) return res.error;
        let q = supabase.from('samples')
          .select('sample_code, sample_date, material_type, condition, sector_id')
          .eq('project_id', projectId);
        if (isYmd(input.desde)) q = q.gte('sample_date', input.desde);
        if (isYmd(input.hasta)) q = q.lte('sample_date', input.hasta);
        if (res.sectorId) q = q.eq('sector_id', res.sectorId);
        const { data, error } = await q.order('sample_date', { ascending: false }).limit(1000);
        if (error) throw new Error(error.message);
        const rows = data ?? [];
        const by = (key: 'material_type' | 'condition') => {
          const m = new Map<string, number>();
          for (const r of rows) m.set(String(r[key] ?? 'sin dato'), (m.get(String(r[key] ?? 'sin dato')) ?? 0) + 1);
          return Array.from(m, ([valor, cantidad]) => ({ valor, cantidad }));
        };
        const limite = Math.min(Math.max(input.limite ?? 5, 1), 20);
        return {
          total: rows.length,
          por_material: by('material_type'),
          por_condicion: by('condition'),
          recientes: rows.slice(0, limite).map(r => ({ codigo: r.sample_code, fecha: r.sample_date, material: r.material_type, condicion: r.condition })),
        };
      },
    },
    {
      name: 'estado_aprobaciones',
      description: 'Estado del flujo de aprobación: cuántos ensayos están EN REVISIÓN (pendientes de aprobar), aprobados y rechazados en un rango, y los rechazos recientes con su motivo.',
      input_schema: {
        type: 'object',
        properties: {
          desde: COMMON_FILTER_PROPS.desde,
          hasta: COMMON_FILTER_PROPS.hasta,
          template_id: COMMON_FILTER_PROPS.template_id,
          tipo_nombre: COMMON_FILTER_PROPS.tipo_nombre,
          sector_id: COMMON_FILTER_PROPS.sector_id,
          sector_nombre: COMMON_FILTER_PROPS.sector_nombre,
        },
        additionalProperties: false,
      },
      execute: async (input: CommonFilters) => {
        const res = await resolveFilters(supabase, projectId, input);
        if (!res.ok) return res.error;
        const rows = await fetchRows(supabase, projectId, input, res);
        const counts = { SUBMITTED: 0, APPROVED: 0, REJECTED: 0 } as Record<string, number>;
        for (const r of rows) counts[r.status ?? '?'] = (counts[r.status ?? '?'] ?? 0) + 1;
        // Motivos de rechazo recientes (tabla protocols, RLS aplica).
        const { data: rej } = await supabase.from('protocols')
          .select('protocol_code, rejection_reason, ensayo_date')
          .eq('project_id', projectId).eq('status', 'REJECTED')
          .not('rejection_reason', 'is', null)
          .order('updated_at', { ascending: false }).limit(5);
        return {
          en_revision: counts.SUBMITTED ?? 0,
          aprobados: counts.APPROVED ?? 0,
          rechazados: counts.REJECTED ?? 0,
          rechazos_recientes: (rej ?? []).map(r => ({ codigo: r.protocol_code, fecha: r.ensayo_date, motivo: r.rejection_reason })),
        };
      },
    },
    {
      name: 'no_conformidades',
      description: 'No conformidades del proyecto: cuántas están ABIERTAS y cuántas RESUELTAS, con las más recientes (descripción y estado).',
      input_schema: {
        type: 'object',
        properties: {
          estado: { type: 'string', enum: ['OPEN', 'RESOLVED'], description: 'Filtrar por estado (abierta/resuelta)' },
          limite: { type: 'integer', minimum: 1, maximum: 20, description: 'Recientes a listar (default 5)' },
        },
        additionalProperties: false,
      },
      execute: async (input: { estado?: 'OPEN' | 'RESOLVED'; limite?: number }) => {
        let q = supabase.from('non_conformities')
          .select('description, status, resolution_notes, created_at')
          .eq('project_id', projectId);
        if (input.estado) q = q.eq('status', input.estado);
        const { data, error } = await q.order('created_at', { ascending: false }).limit(500);
        if (error) throw new Error(error.message);
        const rows = data ?? [];
        const abiertas = rows.filter(r => r.status === 'OPEN').length;
        const resueltas = rows.filter(r => r.status === 'RESOLVED').length;
        const limite = Math.min(Math.max(input.limite ?? 5, 1), 20);
        return {
          abiertas, resueltas, total: rows.length,
          recientes: rows.slice(0, limite).map(r => ({
            descripcion: String(r.description ?? '').slice(0, 200),
            estado: r.status === 'OPEN' ? 'abierta' : 'resuelta',
            resolucion: r.resolution_notes ? String(r.resolution_notes).slice(0, 200) : null,
          })),
        };
      },
    },
    {
      name: 'resumen_trazabilidad',
      description: 'Jornadas de trabajo (módulo Trazabilidad): sesiones activas ahora, sesiones y horas trabajadas en un rango de fechas.',
      input_schema: {
        type: 'object',
        properties: {
          desde: { type: 'string', description: 'Fecha inicial YYYY-MM-DD (sobre el inicio de la jornada)' },
          hasta: { type: 'string', description: 'Fecha final YYYY-MM-DD' },
        },
        additionalProperties: false,
      },
      execute: async (input: { desde?: string; hasta?: string }) => {
        let q = supabase.from('work_sessions')
          .select('started_at, ended_at, status')
          .eq('project_id', projectId);
        if (isYmd(input.desde)) q = q.gte('started_at', new Date(input.desde + 'T00:00:00-05:00').getTime());
        if (isYmd(input.hasta)) q = q.lte('started_at', new Date(input.hasta + 'T23:59:59-05:00').getTime());
        const { data, error } = await q.order('started_at', { ascending: false }).limit(2000);
        if (error) throw new Error(error.message);
        const rows = data ?? [];
        const activas = rows.filter(r => !r.ended_at && r.status !== 'CLOSED').length;
        let horasMs = 0;
        for (const r of rows) if (r.started_at && r.ended_at) horasMs += Math.max(0, Number(r.ended_at) - Number(r.started_at));
        return {
          sesiones: rows.length,
          activas_ahora: activas,
          horas_trabajadas: +(horasMs / 3600000).toFixed(1),
        };
      },
    },
  ];
}
