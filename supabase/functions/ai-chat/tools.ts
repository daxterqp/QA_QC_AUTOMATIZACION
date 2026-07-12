/**
 * tools.ts — Herramientas del Asistente IA.
 *
 * Cada tool consulta Supabase con el cliente AUTENTICADO CON EL JWT DEL USUARIO
 * (RLS aplica solo: can_access_project + org). El `projectId` va CERRADO en el
 * closure — el modelo no puede cambiar de proyecto. Toda cifra que el asistente
 * diga sale de aquí; el system prompt le prohíbe estimar por su cuenta.
 *
 * FUENTES DE DATOS (decisión clave):
 *  - Conteos / listas / estados → tabla `protocols` (SIEMPRE fresca: push
 *    inmediato + cola con retry en cada guardado/envío/aprobación — la misma
 *    fuente que usa la web en useEnsayos/useDossier/useProjectMetrics).
 *  - Valores numéricos (series/comparaciones/gráficos) → `protocol_summary_rows`
 *    (values_json derivado). Es best-effort: cada tool de valores verifica la
 *    COBERTURA contra `protocols` y avisa si hay ensayos sin valores sincronizados.
 * Nunca se cuentan borradores (status DRAFT).
 */
import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2';
import { type DateUnit, isRealYmd, isYmd, periodKeyOf, periodLabel, todayLimaYmd } from './dates.ts';
import { type ChartKind, renderChartSvg } from './chart.ts';

/** Nombre de la tool cuyo SVG intercepta index.ts (no vuelve al modelo). */
export const CHART_TOOL_NAME = 'generar_grafico';
/** Clave interna del SVG dentro del resultado de la tool de gráfico. */
export const CHART_SVG_KEY = '__chart_svg';
/** Clave interna de la ACCIÓN propuesta (tarjeta de confirmación en el chat).
 *  Igual que el SVG: se intercepta y NO viaja al modelo. */
export const ACTION_KEY = '__action';
/** Clave interna de los LINKS de ensayos (chips tocables bajo la respuesta).
 *  Se intercepta y NO viaja al modelo (los ids serían ruido para él). */
export const LINKS_KEY = '__links';

/** Pantallas del proyecto a las que Flo puede llevar al usuario. */
const DESTINOS = ['dashboard', 'ensayos', 'dossier', 'muestras', 'mapa', 'sectores', 'trazabilidad', 'tablas_resumen', 'configuracion', 'papelera', 'topografia', 'planos', 'contactos', 'archivos', 'ubicaciones'] as const;
const DESTINO_LABEL: Record<string, string> = {
  ensayos: 'Ensayos', dossier: 'Dossier de protocolos', muestras: 'Muestras',
  mapa: 'Mapa del proyecto', sectores: 'Sectores', trazabilidad: 'Trazabilidad',
  tablas_resumen: 'Tablas Resumen', configuracion: 'Configuración del proyecto',
  papelera: 'Papelera de reciclaje', topografia: 'Datos topográficos',
  planos: 'Planos', contactos: 'Contactos',
  archivos: 'Cargar archivos', ubicaciones: 'Ubicaciones / Puntos de control',
  dashboard: 'Dashboard del proyecto',
};

// ── v85 — Disponibilidad de destinos por FLAGS del proyecto y ROL ────────────
// Mirror de los gates del menú del proyecto (ProjectMenuScreen): un botón del
// chat jamás debe llevar a un módulo que el menú le oculta al usuario.
// Flags: solo bloquea el false EXPLÍCITO (undefined = default del móvil = ON).
const DESTINO_FLAG: Record<string, string> = {
  mapa: 'map_enabled', sectores: 'map_enabled',
  tablas_resumen: 'module_summary_tables', topografia: 'module_topo',
  planos: 'module_plans', contactos: 'module_contacts',
  trazabilidad: 'traceability_module', ubicaciones: 'module_protocols_by_location',
};
const DESTINO_ROLES: Record<string, string[]> = {
  papelera: ['CREATOR', 'RESIDENT'],
  topografia: ['CREATOR', 'RESIDENT'],
  archivos: ['CREATOR', 'RESIDENT'],
  configuracion: ['CREATOR'],
};

/** null si el destino está disponible; si no, el motivo (para el modelo). */
function destinoNoDisponible(destino: string, acceso?: AccessCtx | null): string | null {
  const flag = DESTINO_FLAG[destino];
  if (flag && acceso?.flags && (acceso.flags as Record<string, unknown>)[flag] === false) {
    return `El módulo "${DESTINO_LABEL[destino]}" está DESACTIVADO en este proyecto — no prepares el botón; dile al usuario que el Creador puede activarlo en Configuración.`;
  }
  const roles = DESTINO_ROLES[destino];
  if (roles && !roles.includes(String(acceso?.userRole ?? ''))) {
    return `La pantalla "${DESTINO_LABEL[destino]}" no está disponible para el rol del usuario — no prepares el botón; explícale quién puede (${roles.map(r => r === 'CREATOR' ? 'Creador' : 'Jefe de obra').join(' / ')}).`;
  }
  return null;
}

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
  const contains = items.filter(i => {
    const n = norm(i.nombre);
    if (!n) return false; // nombre vacío: jamás matchea (q.includes('') es true)
    // La dirección q ⊇ nombre solo con nombres de ≥3 chars — un sector "A"
    // matchearía cualquier consulta que contenga esa letra.
    return n.includes(q) || (n.length >= 3 && q.includes(n));
  });
  if (contains.length === 1) return { match: contains[0] };
  return { candidatos: contains };
}

// ── v84 — Ubicación GPS → sector (mirror de CoordinateSystem.ts del móvil:
// pointInPolygon ray-casting + findSectorByPointWithTolerance) ───────────────

interface LatLng { lat: number; lng: number }

const M_PER_DEG_LAT = 111_320;

function pointInPolygon(point: LatLng, polygon: LatLng[]): boolean {
  if (polygon.length < 3) return false;
  let inside = false;
  const x = point.lng, y = point.lat;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].lng, yi = polygon[i].lat;
    const xj = polygon[j].lng, yj = polygon[j].lat;
    const intersect = ((yi > y) !== (yj > y)) &&
      (x < ((xj - xi) * (y - yi)) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

function pointSegDistanceM(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy;
  let t = len2 === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / len2;
  if (t < 0) t = 0; else if (t > 1) t = 1;
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/** Dentro de un sector → distancia 0; fuera → el más cercano por distancia al
 *  borde, solo si queda dentro de `toleranceM`. */
function sectorForPoint(
  point: LatLng,
  sectors: { id: string; name: string; points: LatLng[] | null }[],
  toleranceM: number,
): { id: string; name: string; distanceM: number } | null {
  for (const s of sectors) {
    if (!s.points || s.points.length < 3) continue;
    if (pointInPolygon(point, s.points)) return { id: s.id, name: s.name, distanceM: 0 };
  }
  let best: { id: string; name: string; distanceM: number } | null = null;
  const mPerDegLng = M_PER_DEG_LAT * Math.cos((point.lat * Math.PI) / 180);
  for (const s of sectors) {
    if (!s.points || s.points.length < 3) continue;
    let dmin = Infinity;
    const verts = s.points.map(v => ({ x: (v.lng - point.lng) * mPerDegLng, y: (v.lat - point.lat) * M_PER_DEG_LAT }));
    for (let i = 0, j = verts.length - 1; i < verts.length; j = i++) {
      const d = pointSegDistanceM(0, 0, verts[j].x, verts[j].y, verts[i].x, verts[i].y);
      if (d < dmin) dmin = d;
    }
    if (!best || dmin < best.distanceM) best = { id: s.id, name: s.name, distanceM: dmin };
  }
  if (best && best.distanceM <= toleranceM) return best;
  return null;
}

/** points_json de project_sectors: array de {lat,lng} (JSONB en la nube). */
// deno-lint-ignore no-explicit-any
function parseSectorPoints(raw: any): LatLng[] | null {
  try {
    const arr = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!Array.isArray(arr)) return null;
    const pts = arr.filter((p) => typeof p?.lat === 'number' && typeof p?.lng === 'number')
      .map((p) => ({ lat: p.lat, lng: p.lng }));
    return pts.length >= 3 ? pts : null;
  } catch { return null; }
}

/** Ubicación GPS del usuario tal como llega del móvil (ya saneada en index.ts). */
export interface UserLocation { lat: number; lng: number; precisionM?: number | null }

/** Rol y feature_flags del usuario/proyecto (para gatear destinos y acciones). */
export interface AccessCtx { userRole?: string | null; flags?: Record<string, unknown> | null }

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

// v86 — Catálogo con CACHE corto (TTL 15s) por proyecto: un turno del modelo
// encadena varias tools (catalogo → serie → grafico → accion) y cada una
// re-consultaba el catálogo entero (3 queries + posible N+1 por plantilla) —
// hasta 6-10 ejecuciones por respuesta. El catálogo no cambia en los ~10s de
// un turno y es idéntico para todo usuario CON acceso (RLS es por proyecto),
// así que la clave es solo projectId. Ante error no se cachea (reintenta).
const _catalogCache = new Map<string, { at: number; promise: Promise<Catalog> }>();

function loadCatalog(supabase: SupabaseClient, projectId: string): Promise<Catalog> {
  const hit = _catalogCache.get(projectId);
  if (hit && Date.now() - hit.at < 15_000) return hit.promise;
  const promise = loadCatalogFresh(supabase, projectId);
  _catalogCache.set(projectId, { at: Date.now(), promise });
  promise.catch(() => { _catalogCache.delete(projectId); });
  return promise;
}

async function loadCatalogFresh(supabase: SupabaseClient, projectId: string): Promise<Catalog> {
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
  /** Código de ensayo (igualdad case-insensitive) — v85: "¿quién aprobó el PRD-7?". */
  codigo?: string;
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

interface FetchResult {
  /** Filas en orden ASCENDENTE por fecha (tope `limit`; si se trunca, se descarta lo más ANTIGUO). */
  rows: SummaryRowLite[];
  /** Total EXACTO del filtro en la base (puede ser > rows.length). */
  total: number;
}

async function fetchRows(supabase: SupabaseClient, projectId: string, f: CommonFilters, resolved: { templateId?: string; sectorId?: string }, limit = 2000): Promise<FetchResult> {
  let q = supabase.from('protocol_summary_rows')
    .select('ensayo_date, template_id, sector_id, sector_name, location_name, protocol_code, status, values_json', { count: 'exact' })
    .eq('project_id', projectId);
  if (isYmd(f.desde)) q = q.gte('ensayo_date', f.desde);
  if (isYmd(f.hasta)) q = q.lte('ensayo_date', f.hasta);
  if (resolved.templateId) q = q.eq('template_id', resolved.templateId);
  if (resolved.sectorId) q = q.eq('sector_id', resolved.sectorId);
  if (f.estado) q = q.eq('status', f.estado);
  // Descendente + reverse: si el filtro excede `limit`, se pierde lo más
  // ANTIGUO (no lo más reciente, que es lo que el usuario suele preguntar).
  const { data, error, count } = await q
    .order('ensayo_date', { ascending: false, nullsFirst: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  const rows = ((data ?? []) as SummaryRowLite[]).reverse();
  return { rows, total: count ?? rows.length };
}

/** Mensaje estándar cuando el detalle se calculó sobre una página truncada. */
const truncNote = (shown: number, total: number) =>
  shown < total ? `Detalle calculado sobre los ${shown} ensayos más recientes de ${total} — acota el rango de fechas para exactitud.` : undefined;

// ── Fuente FRESCA: tabla `protocols` (conteos / listas / estados) ────────────

const NON_DRAFT = ['SUBMITTED', 'APPROVED', 'REJECTED'];

interface ProtocolLite {
  id: string;
  protocol_code: string | null;
  ensayo_date: string | null;
  status: string | null;
  template_id: string | null;
  sector_id: string | null;
  location_id: string | null;
  filled_by_id: string | null;
  signed_by_id: string | null;
  rejection_reason: string | null;
}

function protocolsQuery(supabase: SupabaseClient, projectId: string, f: CommonFilters, resolved: { templateId?: string; sectorId?: string }, select: string, withCount: boolean) {
  let q = supabase.from('protocols')
    .select(select, withCount ? { count: 'exact' as const } : undefined)
    .eq('project_id', projectId)
    .in('status', NON_DRAFT);
  if (isYmd(f.desde)) q = q.gte('ensayo_date', f.desde);
  if (isYmd(f.hasta)) q = q.lte('ensayo_date', f.hasta);
  if (resolved.templateId) q = q.eq('template_id', resolved.templateId);
  if (resolved.sectorId) q = q.eq('sector_id', resolved.sectorId);
  if (f.estado) q = q.eq('status', f.estado);
  if (typeof f.codigo === 'string' && f.codigo.trim()) {
    // Igualdad case-insensitive con comodines neutralizados (mismo criterio
    // que findByCode de preparar_accion).
    const safe = f.codigo.trim().replace(/[%*]/g, '').replace(/_/g, '\\_');
    if (safe) q = q.ilike('protocol_code', safe);
  }
  return q;
}

/** Ensayos desde `protocols` con count exacto; truncado descarta lo más antiguo. */
async function fetchProtocols(supabase: SupabaseClient, projectId: string, f: CommonFilters, resolved: { templateId?: string; sectorId?: string }, limit = 2000): Promise<{ rows: ProtocolLite[]; total: number }> {
  const { data, error, count } = await protocolsQuery(
    supabase, projectId, f, resolved,
    'id, protocol_code, ensayo_date, status, template_id, sector_id, location_id, filled_by_id, signed_by_id, rejection_reason',
    true,
  )
    .order('ensayo_date', { ascending: false, nullsFirst: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  const rows = ((data ?? []) as unknown as ProtocolLite[]).reverse();
  return { rows, total: count ?? rows.length };
}

/** Cobertura de VALORES: cuántos ensayos reales del filtro tienen fila resumen
 *  sincronizada. Si faltan, las tools de valores lo advierten (cifras parciales). */
async function valueCoverageNote(supabase: SupabaseClient, projectId: string, f: CommonFilters, resolved: { templateId?: string; sectorId?: string }, valuesFound: number): Promise<string | undefined> {
  try {
    const { count } = await protocolsQuery(supabase, projectId, f, resolved, 'id', true).limit(1);
    const realTotal = count ?? 0;
    if (realTotal > valuesFound) {
      return `Hay ${realTotal} ensayos en el filtro pero solo ${valuesFound} tienen resultados numéricos sincronizados — las cifras pueden ser parciales. Sugiere al usuario abrir Tablas Resumen o re-sincronizar para completar.`;
    }
  } catch { /* la advertencia es best-effort */ }
  return undefined;
}

/** v85 — Valida una column_key contra las columnas reales del catálogo: un
 *  typo del modelo ('grado_compactacion' vs 'compactacion:A') producía "0
 *  datos" indistinguible de "no hay datos" y respuestas falsas al usuario. */
function columnaInvalida(cat: Catalog, templateId: string | undefined, key: string): Record<string, unknown> | null {
  const tpl = templateId ? cat.tipos.find(t => t.template_id === templateId) : undefined;
  const cols = tpl ? tpl.columnas : cat.tipos.flatMap(t => t.columnas);
  // Sin columnas conocidas (resumen aún no sincronizado) no se puede validar:
  // dejar pasar — el flujo normal reportará la cobertura.
  if (cols.length === 0) return null;
  if (cols.some(c => c.key === key)) return null;
  const seen = new Set<string>();
  const candidatas: { key: string; label: string }[] = [];
  for (const c of cols) {
    if (seen.has(c.key)) continue;
    seen.add(c.key);
    candidatas.push({ key: c.key, label: c.label });
  }
  return {
    error: 'columna_inexistente',
    consulta: key,
    candidatas: candidatas.slice(0, 40),
    mensaje: 'Esa column_key NO existe en el tipo de ensayo (no es que falten datos). Usa la key EXACTA de las candidatas.',
  };
}

async function validarColumna(supabase: SupabaseClient, projectId: string, templateId: string | undefined, key: string): Promise<Record<string, unknown> | null> {
  try {
    const cat = await loadCatalog(supabase, projectId);
    return columnaInvalida(cat, templateId, key);
  } catch { return null; /* validación best-effort: nunca bloquear por sí misma */ }
}

// ── Helpers de fecha del parte diario (Lima) ─────────────────────────────────

const todayYmd = () => todayLimaYmd();
const addDaysYmd = (ymd: string, days: number): string => {
  const d = new Date(ymd + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};
/** Lunes de la semana del ymd (mirror del corte semanal de la app). */
const mondayOfWeek = (ymd: string): string => periodKeyOf(ymd, 'semana');

/** Mirror de splitCells (src/utils/numericProtocol.ts v42e): separa por `//`
 *  IGNORANDO los `//` dentro de corchetes (un literal `val-[3//8 pulg]` no debe
 *  partirse). El alineamiento segmento↔letra debe ser IDÉNTICO al de la app. */
function splitCellsMirror(s: string): string[] {
  const out: string[] = [];
  let depth = 0, last = 0;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === '[') depth++;
    else if (ch === ']') { if (depth > 0) depth--; }
    else if (ch === '/' && s[i + 1] === '/' && depth === 0) {
      out.push(s.slice(last, i));
      i++;
      last = i + 1;
    }
  }
  out.push(s.slice(last));
  return out;
}

/** Extrae el rango [min:max] de UN segmento de método de validación numérico:
 *  `numerico-[min:max]`, `porcentaje-[min:max]` o `numerico-fx[expr]:[min:max]`
 *  (los modificadores posteriores tipo `:nopdf` no estorban). Devuelve null si
 *  el segmento no define rango — texto/checkbox/fórmulas sin tolerancia. */
function parseRangeFromSegment(seg: string): { min: number; max: number } | null {
  const num = '(-?\\d+(?:[.,]\\d+)?)';
  const m = seg.match(new RegExp(`^(?:numerico|porcentaje)-\\[${num}:${num}\\]`, 'i'))
    ?? seg.match(new RegExp(`^numerico-fx\\[.+?\\]:\\[${num}:${num}\\]`, 'i'));
  if (!m) return null;
  const min = Number(m[1].replace(',', '.'));
  const max = Number(m[2].replace(',', '.'));
  if (!isFinite(min) || !isFinite(max) || min > max) return null;
  return { min, max };
}

/** Nombres de usuarios (realizó/aprobó) por id — best-effort bajo RLS de org. */
async function userNames(supabase: SupabaseClient, ids: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const uniq = Array.from(new Set(ids.filter(Boolean)));
  if (uniq.length === 0) return map;
  try {
    const { data } = await supabase.from('users').select('id, name, apellido').in('id', uniq.slice(0, 100));
    for (const u of data ?? []) {
      map.set(u.id as string, [u.name, u.apellido].filter(Boolean).join(' ').trim());
    }
  } catch { /* sin nombres: se devuelven ids nulos */ }
  return map;
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

export function buildTools(supabase: SupabaseClient, projectId: string, ubicacion?: UserLocation | null, acceso?: AccessCtx | null): ToolDef[] {
  return [
    {
      name: 'ubicacion_usuario',
      description: 'Devuelve la ubicación GPS actual del usuario y, si el proyecto tiene sectores con geometría, EN QUÉ SECTOR está parado (o el más cercano, con su distancia en metros). Úsala cuando una acción o consulta necesite un sector y el usuario NO lo haya dicho (ej. "quiero sacar una muestra aquí", "crea un ensayo donde estoy") — propón ese sector y confírmalo con él. Si no hay ubicación disponible, pregunta el sector como siempre.',
      input_schema: { type: 'object', properties: {}, additionalProperties: false },
      execute: async () => {
        if (!ubicacion) {
          return { disponible: false, mensaje: 'El usuario no compartió su ubicación (GPS apagado o sin permiso). Pide el sector por su nombre.' };
        }
        const { data, error } = await supabase.from('project_sectors')
          .select('id, name, points_json').eq('project_id', projectId);
        if (error) throw new Error(error.message);
        const sectors = (data ?? []).map((s) => ({
          id: String(s.id), name: String(s.name ?? ''), points: parseSectorPoints(s.points_json),
        }));
        const conGeo = sectors.filter(s => s.points);
        const base = {
          disponible: true,
          lat: ubicacion.lat, lng: ubicacion.lng,
          precision_m: ubicacion.precisionM ?? null,
        };
        if (sectors.length === 0) {
          return { ...base, sector: null, mensaje: 'El proyecto no tiene sectores cargados; no se puede ubicar al usuario dentro de uno.' };
        }
        if (conGeo.length === 0) {
          return { ...base, sector: null, mensaje: 'Los sectores del proyecto no tienen geometría (polígonos) cargada; no se puede saber en cuál está el usuario.' };
        }
        // Tolerancia 100 m: fuera de eso, decir "no está en ningún sector".
        const hit = sectorForPoint({ lat: ubicacion.lat, lng: ubicacion.lng }, conGeo, 100);
        if (!hit) {
          return { ...base, sector: null, mensaje: 'El usuario no está dentro (ni a menos de 100 m) de ningún sector con geometría.' };
        }
        return {
          ...base,
          sector: { id: hit.id, nombre: hit.name, distancia_m: Math.round(hit.distanceM) },
          mensaje: hit.distanceM === 0
            ? `El usuario está DENTRO del sector "${hit.name}".`
            : `El usuario está a ~${Math.round(hit.distanceM)} m del sector "${hit.name}" (el más cercano).`,
        };
      },
    },
    {
      name: 'catalogo_proyecto',
      description: 'Devuelve los catálogos reales del proyecto: sectores (id+nombre), tipos de ensayo (template_id, código, nombre y sus columnas de resultados con su key exacta), ubicaciones, rango de fechas con datos y total de ensayos registrados. Úsala PRIMERO cuando el usuario mencione un sector, tipo de ensayo o resultado por su nombre, para resolverlo a IDs/keys reales.',
      input_schema: { type: 'object', properties: {}, additionalProperties: false },
      execute: async () => {
        const [cat, minQ, maxQ, totQ, sumQ] = await Promise.all([
          loadCatalog(supabase, projectId),
          supabase.from('protocols').select('ensayo_date').eq('project_id', projectId)
            .in('status', NON_DRAFT).not('ensayo_date', 'is', null)
            .order('ensayo_date', { ascending: true }).limit(1),
          supabase.from('protocols').select('ensayo_date').eq('project_id', projectId)
            .in('status', NON_DRAFT).not('ensayo_date', 'is', null)
            .order('ensayo_date', { ascending: false }).limit(1),
          supabase.from('protocols').select('id', { count: 'exact', head: true })
            .eq('project_id', projectId).in('status', NON_DRAFT),
          supabase.from('protocol_summary_rows').select('id', { count: 'exact', head: true })
            .eq('project_id', projectId),
        ]);
        const total = totQ.count ?? 0;
        const conValores = sumQ.count ?? 0;
        return {
          ...cat,
          rango_fechas: { primera: minQ.data?.[0]?.ensayo_date ?? null, ultima: maxQ.data?.[0]?.ensayo_date ?? null },
          total_ensayos: total,
          ensayos_con_valores_numericos: conValores,
          ...(conValores < total ? { advertencia: `${total - conValores} ensayos aún no tienen sus resultados numéricos sincronizados (los conteos y estados SÍ están completos; las series/gráficos pueden ser parciales).` } : {}),
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
        const { rows, total } = await fetchProtocols(supabase, projectId, input, res);
        const unit: DateUnit = input.agrupar && ['dia', 'semana', 'mes'].includes(input.agrupar) ? input.agrupar : 'total';
        const porTipo = new Map<string, number>();
        for (const r of rows) porTipo.set(r.template_id ?? '?', (porTipo.get(r.template_id ?? '?') ?? 0) + 1);
        const porEstado = { SUBMITTED: 0, APPROVED: 0, REJECTED: 0 } as Record<string, number>;
        for (const r of rows) porEstado[r.status ?? '?'] = (porEstado[r.status ?? '?'] ?? 0) + 1;
        const out: Record<string, unknown> = {
          total,
          por_estado: { en_revision: porEstado.SUBMITTED ?? 0, aprobados: porEstado.APPROVED ?? 0, rechazados: porEstado.REJECTED ?? 0 },
          por_tipo: Array.from(porTipo, ([template_id, cantidad]) => ({ template_id, cantidad })),
        };
        const nota = truncNote(rows.length, total);
        if (nota) out.advertencia = nota;
        if (unit !== 'total') {
          const buckets = new Map<string, number>();
          let sinFecha = 0;
          for (const r of rows) {
            if (!r.ensayo_date) { sinFecha++; continue; }
            const k = periodKeyOf(r.ensayo_date, unit);
            buckets.set(k, (buckets.get(k) ?? 0) + 1);
          }
          out.grupos = Array.from(buckets.entries()).sort((a, b) => a[0].localeCompare(b[0]))
            .map(([k, cantidad]) => ({ periodo: k, etiqueta: periodLabel(k, unit), cantidad }));
          // Sin esto, total != suma de grupos y el modelo no sabría por qué.
          if (sinFecha > 0) out.sin_fecha = sinFecha;
        }
        return out;
      },
    },
    {
      name: 'listar_ensayos',
      description: 'Lista ensayos (código, fecha, tipo, sector, ubicación, estado, quién lo realizó y quién lo APROBÓ), del más reciente al más antiguo. SOLO para ubicar POCOS ensayos concretos (máx 20) o responder por UNO (filtro por CÓDIGO exacto: "¿quién aprobó el PRD-260003?" → codigo). Para listados extensos NO la uses: responde cantidades agrupadas (contar_ensayos) + tarjeta abrir_dossier con filtros.',
      input_schema: {
        type: 'object',
        properties: {
          ...COMMON_FILTER_PROPS,
          codigo: { type: 'string', description: 'Código exacto de UN ensayo (case-insensitive), ej. PRD-260003' },
          limite: { type: 'integer', minimum: 1, maximum: 20, description: 'Cuántos devolver (default 10)' },
        },
        additionalProperties: false,
      },
      execute: async (input: CommonFilters & { limite?: number }) => {
        const res = await resolveFilters(supabase, projectId, input);
        if (!res.ok) return res.error;
        const { rows, total } = await fetchProtocols(supabase, projectId, input, res);
        const limite = Math.min(Math.max(input.limite ?? 10, 1), 20);
        const recent = rows.slice(-limite).reverse();
        // Nombres legibles (tipo/sector/ubicación/personas) solo para los listados.
        const [tplQ, secQ, locQ, names] = await Promise.all([
          supabase.from('protocol_templates').select('id, id_protocolo, name').eq('project_id', projectId),
          supabase.from('project_sectors').select('id, name').eq('project_id', projectId),
          supabase.from('locations').select('id, name').eq('project_id', projectId).limit(500),
          userNames(supabase, recent.flatMap(r => [r.filled_by_id ?? '', r.signed_by_id ?? ''])),
        ]);
        const tplName = new Map((tplQ.data ?? []).map(t => [t.id as string, `${t.id_protocolo ? t.id_protocolo + ' · ' : ''}${t.name ?? ''}`]));
        const secName = new Map((secQ.data ?? []).map(s => [s.id as string, s.name as string]));
        const locName = new Map((locQ.data ?? []).map(l => [l.id as string, l.name as string]));
        return {
          mostrando: recent.length,
          total_filtrado: total,
          ensayos: recent.map(r => ({
            codigo: r.protocol_code, fecha: r.ensayo_date,
            tipo: r.template_id ? (tplName.get(r.template_id) ?? null) : null,
            sector: r.sector_id ? (secName.get(r.sector_id) ?? null) : null,
            ubicacion: r.location_id ? (locName.get(r.location_id) ?? null) : null,
            estado: r.status,
            realizo: r.filled_by_id ? (names.get(r.filled_by_id) ?? null) : null,
            aprobo: r.signed_by_id ? (names.get(r.signed_by_id) ?? null) : null,
          })),
          // Interceptado (no viaja al modelo): chips tocables en el chat que
          // abren cada ensayo directamente.
          [LINKS_KEY]: recent.map(r => ({ codigo: r.protocol_code, protocolId: r.id, estado: r.status })),
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
        const colErr = await validarColumna(supabase, projectId, res.templateId, input.column_key);
        if (colErr) return colErr;
        const { rows, total } = await fetchRows(supabase, projectId, input, res);
        const points: { fecha: string; valor: number }[] = [];
        for (const r of rows) {
          // isRealYmd: '2026-02-31' pasa la regex pero da NaN en la tendencia.
          if (!isRealYmd(r.ensayo_date)) continue;
          const v = numValue(r.values_json, input.column_key);
          if (v != null) points.push({ fecha: r.ensayo_date, valor: v });
        }
        // Cobertura con el TOTAL EXACTO de filas resumen (no la página truncada a
        // 2000): con >2000 filas sincronizadas la nota acusaría un falso "faltan
        // por sincronizar" y taparía la explicación correcta (truncación).
        const cobertura = await valueCoverageNote(supabase, projectId, input, res, total);
        if (points.length === 0) {
          return { puntos: [], n: 0, mensaje: 'Sin datos numéricos para esa columna en el rango.', ...(cobertura ? { advertencia: cobertura } : {}) };
        }
        const ys = points.map(p => p.valor);
        const xs0 = ymdToDays(points[0].fecha);
        const slope = linearSlopePerDay(points.map(p => ({ x: ymdToDays(p.fecha) - xs0, y: p.valor })));
        let capped = points.length > 200 ? points.filter((_, i) => i % Math.ceil(points.length / 200) === 0) : points;
        // El downsample por módulo puede descartar el ÚLTIMO punto (el ensayo
        // más reciente, justo el que el usuario mira) — conservarlo siempre.
        if (capped[capped.length - 1] !== points[points.length - 1]) capped = [...capped, points[points.length - 1]];
        const advertencia = truncNote(rows.length, total) ?? cobertura;
        return {
          ...(advertencia ? { advertencia } : {}),
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
        // Fechas malformadas NO deben ignorarse en silencio (el rango pasaría a
        // ser toda la historia y el delta sería falso).
        for (const [nombre, p] of [['periodo_a', input.periodo_a], ['periodo_b', input.periodo_b]] as const) {
          if (!p || !isYmd(p.desde) || !isYmd(p.hasta)) {
            return { error: 'fecha_invalida', periodo: nombre, mensaje: 'desde/hasta deben ser fechas YYYY-MM-DD válidas.' };
          }
        }
        const res = await resolveFilters(supabase, projectId, input);
        if (!res.ok) return res.error;
        const colErr = await validarColumna(supabase, projectId, res.templateId, input.column_key);
        if (colErr) return colErr;
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
          const { rows, total } = await fetchRows(supabase, projectId, { ...input, desde: p.desde, hasta: p.hasta }, res);
          return {
            vals: rows.map(r => numValue(r.values_json, input.column_key)).filter((v): v is number => v != null),
            // Total EXACTO de filas resumen del periodo (para cobertura): contar
            // valores no-nulos confundiría "columna no aplica" con "sin sincronizar".
            total,
          };
        };
        const [ga, gb] = await Promise.all([grab(input.periodo_a), grab(input.periodo_b)]);
        const va = ga.vals, vb = gb.vals;
        const a = agg(va), b = agg(vb);
        const [covA, covB] = await Promise.all([
          valueCoverageNote(supabase, projectId, { ...input, desde: input.periodo_a.desde, hasta: input.periodo_a.hasta }, res, ga.total),
          valueCoverageNote(supabase, projectId, { ...input, desde: input.periodo_b.desde, hasta: input.periodo_b.hasta }, res, gb.total),
        ]);
        const advertencia = covB ?? covA;
        return {
          ...(advertencia ? { advertencia } : {}),
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
      description: 'Genera un GRÁFICO de una columna numérica de un tipo de ensayo en el tiempo: estilo "linea" (con recta de tendencia — para evolución/tendencia) o "barras" (para comparar valores individuales). El gráfico se muestra automáticamente en el chat — tú solo comenta las cifras del resumen que te devuelve. Úsala cuando pidan "grafica", "muéstrame la curva/tendencia/evolución/barras".',
      input_schema: {
        type: 'object',
        properties: {
          ...COMMON_FILTER_PROPS,
          column_key: { type: 'string', description: 'Key exacta de la columna (de catalogo_proyecto)' },
          titulo: { type: 'string', description: 'Título corto del gráfico en español (ej. "Grado de compactación — última semana")' },
          estilo: { type: 'string', enum: ['linea', 'barras'], description: 'Estilo del gráfico (default linea)' },
        },
        required: ['column_key', 'titulo'],
        additionalProperties: false,
      },
      execute: async (input: CommonFilters & { column_key: string; titulo: string; estilo?: string }) => {
        const res = await resolveFilters(supabase, projectId, input);
        if (!res.ok) return res.error;
        if (!res.templateId && !input.tipo_nombre) {
          return { error: 'falta_tipo', mensaje: 'Indica template_id o tipo_nombre: una columna pertenece a un tipo de ensayo (sin él se mezclarían valores de tipos distintos).' };
        }
        const colErr = await validarColumna(supabase, projectId, res.templateId, input.column_key);
        if (colErr) return colErr;
        const { rows, total } = await fetchRows(supabase, projectId, input, res);
        const points: { x: string; y: number }[] = [];
        for (const r of rows) {
          // isRealYmd: '2026-02-31' pasa la regex pero chart.ts la re-filtra y
          // el SVG podía salir vacío con grafico_generado:true (mentira al modelo).
          if (!isRealYmd(r.ensayo_date)) continue;
          const v = numValue(r.values_json, input.column_key);
          if (v != null) points.push({ x: r.ensayo_date, y: v });
        }
        const estilo: ChartKind = input.estilo === 'barras' ? 'barras' : 'linea';
        // Barras funcionan desde 1 dato; la línea de tendencia necesita ≥2.
        const minPoints = estilo === 'barras' ? 1 : 2;
        if (points.length < minPoints) {
          const cobertura = await valueCoverageNote(supabase, projectId, input, res, total);
          return {
            grafico_generado: false,
            mensaje: `Solo hay ${points.length} dato(s) numérico(s) para esa columna en el rango — no alcanza para el gráfico.`,
            ...(cobertura ? { advertencia: cobertura } : {}),
          };
        }
        // Barras: recorte a los últimos 48 ANTES de svg Y resumen (siempre
        // consistentes entre sí) con advertencia explícita al modelo.
        // Línea: downsample SOLO del dibujo (máx 200 puntos — un SVG de 2000
        // círculos pesa ~200KB y se persiste en cada sesión); el resumen usa
        // todos los puntos (mismo rango de fechas → estadísticos coherentes).
        let plotPoints = points;
        let recorteNota: string | undefined;
        if (estilo === 'barras' && points.length > 48) {
          plotPoints = points.slice(-48);
          recorteNota = `El gráfico de barras y su resumen corresponden a los ÚLTIMOS 48 de ${points.length} datos — acota el rango de fechas para ver otros.`;
        } else if (estilo === 'linea' && points.length > 200) {
          plotPoints = points.filter((_, i) => i % Math.ceil(points.length / 200) === 0);
          // Conservar SIEMPRE el punto más reciente (el downsample por módulo
          // podía descartarlo y el gráfico terminaba antes que ultima_fecha).
          if (plotPoints[plotPoints.length - 1] !== points[points.length - 1]) {
            plotPoints = [...plotPoints, points[points.length - 1]];
          }
        }
        const statsPoints = estilo === 'barras' ? plotPoints : points;
        const ys = statsPoints.map(p => p.y);
        const xs0 = ymdToDays(statsPoints[0].x);
        const slope = estilo === 'linea'
          ? linearSlopePerDay(statsPoints.map(p => ({ x: ymdToDays(p.x) - xs0, y: p.y })))
          : null;
        const svg = renderChartSvg(estilo, input.titulo.slice(0, 80), plotPoints);
        // Total exacto (no la página truncada) — ver nota en serie_temporal.
        const cobertura = truncNote(rows.length, total) ?? await valueCoverageNote(supabase, projectId, input, res, total);
        const advertencia = recorteNota ?? cobertura;
        return {
          // Patrón de comparar_sectores: clave condicional + flag honesto (un
          // SVG vacío con grafico_generado:true hacía narrar un gráfico inexistente).
          grafico_generado: !!svg,
          ...(svg ? { [CHART_SVG_KEY]: svg } : {}),   // index.ts lo extrae; NO viaja al modelo
          ...(advertencia ? { advertencia } : {}),
          resumen: {
            n: statsPoints.length,
            promedio: ys.reduce((a, b) => a + b, 0) / ys.length,
            minimo: Math.min(...ys),
            maximo: Math.max(...ys),
            ...(estilo === 'linea' ? { tendencia_por_dia: slope } : {}),
            primera_fecha: statsPoints[0].x,
            ultima_fecha: statsPoints[statsPoints.length - 1].x,
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
          .select('sample_code, sample_date, material_type, condition, sector_id', { count: 'exact' })
          .eq('project_id', projectId);
        if (isYmd(input.desde)) q = q.gte('sample_date', input.desde);
        if (isYmd(input.hasta)) q = q.lte('sample_date', input.hasta);
        if (res.sectorId) q = q.eq('sector_id', res.sectorId);
        const { data, error, count } = await q
          .order('sample_date', { ascending: false, nullsFirst: false })
          .limit(1000);
        if (error) throw new Error(error.message);
        const rows = data ?? [];
        const total = count ?? rows.length;
        const by = (key: 'material_type' | 'condition') => {
          const m = new Map<string, number>();
          for (const r of rows) m.set(String(r[key] ?? 'sin dato'), (m.get(String(r[key] ?? 'sin dato')) ?? 0) + 1);
          return Array.from(m, ([valor, cantidad]) => ({ valor, cantidad }));
        };
        const limite = Math.min(Math.max(input.limite ?? 5, 1), 20);
        const nota = rows.length < total ? `Desglose calculado sobre las ${rows.length} muestras más recientes de ${total}.` : undefined;
        return {
          ...(nota ? { advertencia: nota } : {}),
          total,
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
        const { rows, total } = await fetchProtocols(supabase, projectId, input, res);
        const counts = { SUBMITTED: 0, APPROVED: 0, REJECTED: 0 } as Record<string, number>;
        for (const r of rows) counts[r.status ?? '?'] = (counts[r.status ?? '?'] ?? 0) + 1;
        // Motivos de rechazo: SOLO de los ensayos que pasaron el filtro (fecha/
        // tipo/sector) — `protocols.rejection_reason` viene en la misma query.
        const rechazos = rows
          .filter(r => r.status === 'REJECTED')
          .slice(-5)
          .reverse()
          .map(r => ({ codigo: r.protocol_code, fecha: r.ensayo_date, motivo: r.rejection_reason }));
        const nota = truncNote(rows.length, total);
        return {
          ...(nota ? { advertencia: nota } : {}),
          en_revision: counts.SUBMITTED ?? 0,
          aprobados: counts.APPROVED ?? 0,
          rechazados: counts.REJECTED ?? 0,
          rechazos_recientes: rechazos,
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
        const limite = Math.min(Math.max(input.limite ?? 5, 1), 20);
        // Conteos EXACTOS del total (head+count) — nunca sobre una página.
        const [totQ, openQ, listQ] = await Promise.all([
          supabase.from('non_conformities').select('id', { count: 'exact', head: true }).eq('project_id', projectId),
          supabase.from('non_conformities').select('id', { count: 'exact', head: true }).eq('project_id', projectId).eq('status', 'OPEN'),
          (input.estado
            ? supabase.from('non_conformities').select('description, status, resolution_notes, created_at').eq('project_id', projectId).eq('status', input.estado)
            : supabase.from('non_conformities').select('description, status, resolution_notes, created_at').eq('project_id', projectId)
          ).order('created_at', { ascending: false }).limit(limite),
        ]);
        if (listQ.error) throw new Error(listQ.error.message);
        const total = totQ.count ?? 0;
        const abiertas = openQ.count ?? 0;
        return {
          abiertas,
          resueltas: Math.max(0, total - abiertas),
          total,
          recientes: (listQ.data ?? []).map(r => ({
            descripcion: String(r.description ?? '').slice(0, 200),
            estado: r.status === 'OPEN' ? 'abierta' : 'resuelta',
            resolucion: r.resolution_notes ? String(r.resolution_notes).slice(0, 200) : null,
          })),
        };
      },
    },
    {
      name: 'recordar_preferencia',
      description: 'Guarda una PREFERENCIA estable del usuario para futuras conversaciones (se almacena en su dispositivo y te llegará en cada consulta). Úsala SOLO cuando exprese una preferencia duradera ("siempre muéstramelo por sector", "prefiero gráficos de barras", "de ahora en adelante..."). Redacta el texto corto y en tercera persona (ej. "Prefiere ver los conteos desglosados por sector").',
      input_schema: {
        type: 'object',
        properties: {
          texto: { type: 'string', description: 'La preferencia, corta y en tercera persona (máx 140 caracteres)' },
        },
        required: ['texto'],
        additionalProperties: false,
      },
      execute: (input: { texto: string }) => {
        const texto = String(input.texto ?? '').trim().slice(0, 140);
        if (texto.length < 4) return Promise.resolve({ error: 'texto_invalido', mensaje: 'La preferencia debe ser un texto corto y claro.' });
        return Promise.resolve({
          [ACTION_KEY]: { kind: 'recordar_preferencia', texto, etiqueta: `Recordar: ${texto}` },
          guardada: true,
          resumen: 'Preferencia guardada en el dispositivo del usuario. Confírmaselo en una frase natural.',
        });
      },
    },
    {
      name: 'parte_diario',
      description: 'PARTE DIARIO de la obra en una sola llamada: ensayos de hoy y de la semana, estado del flujo de aprobación, no conformidades abiertas y jornadas activas. Úsala cuando pidan "el parte del día", "cómo amaneció la obra", "resumen de hoy" o un panorama general rápido.',
      input_schema: { type: 'object', properties: {}, additionalProperties: false },
      execute: async () => {
        const hoy = todayYmd();
        const ayer = addDaysYmd(hoy, -1);
        const lunes = mondayOfWeek(hoy);
        const [hoyQ, ayerQ, semanaQ, subQ, aprQ, rejQ, ncQ, actQ] = await Promise.all([
          protocolsQuery(supabase, projectId, { desde: hoy, hasta: hoy }, {}, 'id', true).limit(1),
          protocolsQuery(supabase, projectId, { desde: ayer, hasta: ayer }, {}, 'id', true).limit(1),
          protocolsQuery(supabase, projectId, { desde: lunes, hasta: hoy }, {}, 'id', true).limit(1),
          protocolsQuery(supabase, projectId, { estado: 'SUBMITTED' }, {}, 'id', true).limit(1),
          protocolsQuery(supabase, projectId, { estado: 'APPROVED' }, {}, 'id', true).limit(1),
          protocolsQuery(supabase, projectId, { estado: 'REJECTED' }, {}, 'id', true).limit(1),
          supabase.from('non_conformities').select('id', { count: 'exact', head: true }).eq('project_id', projectId).eq('status', 'OPEN'),
          supabase.from('work_sessions').select('id', { count: 'exact', head: true }).eq('project_id', projectId).eq('status', 'ACTIVE'),
        ]);
        return {
          fecha: hoy,
          ensayos_hoy: hoyQ.count ?? 0,
          ensayos_ayer: ayerQ.count ?? 0,
          ensayos_semana: semanaQ.count ?? 0,
          aprobaciones: { en_revision: subQ.count ?? 0, aprobados: aprQ.count ?? 0, rechazados: rejQ.count ?? 0 },
          nc_abiertas: ncQ.count ?? 0,
          jornadas_activas: actQ.count ?? 0,
        };
      },
    },
    {
      name: 'comparar_sectores',
      description: 'Compara el PROMEDIO de una columna numérica de un tipo de ensayo ENTRE SECTORES (ej. "compárame la compactación del sector 1 vs el 2"). Genera automáticamente un gráfico de barras por sector en el chat — tú solo comenta las cifras. El tipo de ensayo es obligatorio; sin lista de sectores compara todos los que tengan datos.',
      input_schema: {
        type: 'object',
        properties: {
          template_id: COMMON_FILTER_PROPS.template_id,
          tipo_nombre: COMMON_FILTER_PROPS.tipo_nombre,
          column_key: { type: 'string', description: 'Key exacta de la columna (de catalogo_proyecto)' },
          sectores: { type: 'array', items: { type: 'string' }, description: 'Nombres de sectores a comparar (opcional: default todos con datos)' },
          desde: COMMON_FILTER_PROPS.desde,
          hasta: COMMON_FILTER_PROPS.hasta,
          titulo: { type: 'string', description: 'Título corto del gráfico en español' },
        },
        required: ['column_key', 'titulo'],
        additionalProperties: false,
      },
      execute: async (input: { template_id?: string; tipo_nombre?: string; column_key: string; sectores?: string[]; desde?: string; hasta?: string; titulo: string }) => {
        const res = await resolveFilters(supabase, projectId, input);
        if (!res.ok) return res.error;
        if (!res.templateId) return { error: 'falta_tipo', mensaje: 'Indica template_id o tipo_nombre: la comparación es de una columna de UN tipo de ensayo.' };
        const cat = await loadCatalog(supabase, projectId);
        const colErr = columnaInvalida(cat, res.templateId, input.column_key);
        if (colErr) return colErr;
        // Sectores objetivo: los pedidos (resueltos por nombre, DEDUP) o todos.
        let objetivo = cat.sectores;
        let notaSectores: string | undefined;
        if (input.sectores?.length) {
          if (input.sectores.length > 12) notaSectores = `Se comparan solo los primeros 12 de los ${input.sectores.length} sectores pedidos.`;
          const vistos = new Set<string>();
          const elegidos: typeof cat.sectores = [];
          for (const nombre of input.sectores.slice(0, 12)) {
            const r = resolveByName(cat.sectores, String(nombre));
            if (!r.match) return { error: 'sector_ambiguo_o_inexistente', consulta: nombre, candidatos: (r.candidatos ?? cat.sectores).map(s => ({ id: s.id, nombre: s.nombre })) };
            if (!vistos.has(r.match.id)) { vistos.add(r.match.id); elegidos.push(r.match); }
          }
          objetivo = elegidos;
        }
        const { rows, total } = await fetchRows(supabase, projectId, input, res);
        const porSector = new Map<string, number[]>();
        for (const r of rows) {
          if (!r.sector_id) continue;
          const v = numValue(r.values_json, input.column_key);
          if (v == null) continue;
          const arr = porSector.get(r.sector_id) ?? [];
          arr.push(v);
          porSector.set(r.sector_id, arr);
        }
        const resultados = objetivo
          .map(s => {
            const vals = porSector.get(s.id) ?? [];
            return {
              sector: s.nombre,
              n: vals.length,
              promedio: vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null,
            };
          })
          .filter(x => input.sectores?.length ? true : x.n > 0); // sin lista: solo sectores con datos
        // Modo 'todos' también se acota a 12 (el SVG de barras recortaba a 48
        // en silencio y con >12 las barras categóricas no se distinguen). El
        // resumen y el gráfico quedan CONSISTENTES entre sí.
        if (!input.sectores?.length && resultados.length > 12) {
          notaSectores = `Se comparan los primeros 12 de ${resultados.length} sectores con datos (orden alfabético) — pide sectores específicos para ver otros.`;
          resultados.splice(12);
        }
        const conDatos = resultados.filter(x => x.promedio != null);
        if (conDatos.length === 0) {
          return { resultados, mensaje: 'Ningún sector tiene datos numéricos de esa columna en el rango.' };
        }
        const svg = renderChartSvg('barras', input.titulo.slice(0, 80),
          conDatos.map(x => ({ x: x.sector, y: x.promedio as number })));
        // Misma disciplina de cobertura que las demás tools de valores.
        const advertencia = notaSectores
          ?? truncNote(rows.length, total)
          ?? await valueCoverageNote(supabase, projectId, input, res, total);
        return {
          ...(svg ? { [CHART_SVG_KEY]: svg } : {}),
          grafico_generado: !!svg,
          ...(advertencia ? { advertencia } : {}),
          resultados,
        };
      },
    },
    {
      name: 'fuera_de_norma',
      description: 'Detecta resultados FUERA DE TOLERANCIA: cruza los valores de los ensayos contra los rangos [min:max] definidos en las fichas (métodos de validación numéricos). Úsala ante "¿hay resultados fuera de norma/tolerancia/rango?". Si un tipo no define rangos, lo dice. Filtros de tipo/fechas opcionales.',
      input_schema: {
        type: 'object',
        properties: {
          template_id: COMMON_FILTER_PROPS.template_id,
          tipo_nombre: COMMON_FILTER_PROPS.tipo_nombre,
          desde: COMMON_FILTER_PROPS.desde,
          hasta: COMMON_FILTER_PROPS.hasta,
        },
        additionalProperties: false,
      },
      execute: async (input: { template_id?: string; tipo_nombre?: string; desde?: string; hasta?: string }) => {
        const res = await resolveFilters(supabase, projectId, input);
        if (!res.ok) return res.error;
        // 1. Plantillas objetivo + sus ítems con rangos [min:max].
        let tplQ = supabase.from('protocol_templates').select('id, id_protocolo, name').eq('project_id', projectId);
        if (res.templateId) tplQ = tplQ.eq('id', res.templateId);
        const { data: tpls } = await tplQ;
        const templates = tpls ?? [];
        if (templates.length === 0) return { violaciones: [], mensaje: 'Sin tipos de ensayo.' };
        const { data: items } = await supabase.from('protocol_template_items')
          .select('template_id, partida_item, validation_method')
          .in('template_id', templates.map(t => t.id));
        // Rangos por template: key de values_json (`partida:LETRA` o `partida`) → {min,max}.
        const rangesByTpl = new Map<string, Map<string, { min: number; max: number }>>();
        for (const it of items ?? []) {
          const vm = String(it.validation_method ?? '');
          const partida = String(it.partida_item ?? '').trim();
          if (!vm || !partida) continue;
          // split IGUAL que la app (v42e: `//` dentro de corchetes no separa) y
          // key SIEMPRE `partida:LETRA` — así escriben values_json los writers
          // (SummaryRowService.extractValues), incluso para filas de una celda.
          const segs = splitCellsMirror(vm).map(s => s.trim());
          segs.forEach((seg, idx) => {
            const range = parseRangeFromSegment(seg);
            if (!range) return;
            const key = `${partida}:${String.fromCharCode(65 + idx)}`;
            const m = rangesByTpl.get(String(it.template_id)) ?? new Map();
            m.set(key, range);
            rangesByTpl.set(String(it.template_id), m);
          });
        }
        const conRangos = [...rangesByTpl.keys()];
        if (conRangos.length === 0) {
          return { violaciones: [], mensaje: 'Los tipos consultados no definen rangos de tolerancia numéricos en sus fichas.' };
        }
        // 2. Valores reales (filas resumen) vs rangos.
        const { rows, total } = await fetchRows(supabase, projectId, input, res);
        const violaciones: { codigo: string | null; fecha: string | null; celda: string; valor: number; min: number; max: number }[] = [];
        for (const r of rows) {
          const ranges = r.template_id ? rangesByTpl.get(r.template_id) : undefined;
          if (!ranges) continue;
          for (const [key, rg] of ranges) {
            const v = numValue(r.values_json, key);
            if (v == null) continue;
            if (v < rg.min || v > rg.max) {
              violaciones.push({ codigo: r.protocol_code, fecha: r.ensayo_date, celda: key, valor: v, min: rg.min, max: rg.max });
            }
          }
        }
        const nota = truncNote(rows.length, total);
        return {
          ...(nota ? { advertencia: nota } : {}),
          total_violaciones: violaciones.length,
          ensayos_revisados: rows.length,
          tipos_con_rangos: conRangos.length,
          violaciones: violaciones.slice(0, 30),
          ...(violaciones.length > 30 ? { nota: `Mostrando 30 de ${violaciones.length} violaciones.` } : {}),
        };
      },
    },
    {
      name: 'protocolos_faltantes',
      description: 'SOLO para proyectos CON UBICACIONES (obras por pisos/departamentos). Cada fila de ubicación en el sistema es una UBICACIÓN FÍSICA × ESPECIALIDAD (ej. "P1-Sector1-Cimiento") con su plan exacto de protocolos; esta tool agrupa por la ubicación FÍSICA real (P1-Sector1) y desglosa por especialidad (Cimiento, ARQ, IIEE, IISS…) — el mismo modelo del Dashboard de la app. Acepta filtro por nombre ("P1", "Piso 2", "sector 3" — matchea todas las que contengan el texto). Úsala ante "¿cuánto falta?", "¿qué protocolos faltan en el piso X?". En proyectos SIN ubicaciones NO la uses (ahí el avance es progresivo o por cuota de la descripción).',
      input_schema: {
        type: 'object',
        properties: {
          ubicacion_nombre: { type: 'string', description: 'Filtro por nombre de ubicación (contiene, sin acentos): "P1", "Piso 2 sector 3"… Vacío = todas.' },
        },
        additionalProperties: false,
      },
      execute: async (input: { ubicacion_nombre?: string }) => {
        // Plan exacto: locations.template_ids = códigos id_protocolo separados
        // por coma (mismo contrato que el orden del dossier web).
        const [locQ, tplQ] = await Promise.all([
          supabase.from('locations').select('id, name, location_only, specialty, template_ids').eq('project_id', projectId).order('created_at', { ascending: true }).limit(500),
          supabase.from('protocol_templates').select('id, id_protocolo, name').eq('project_id', projectId),
        ]);
        if (locQ.error) throw new Error(locQ.error.message);
        const locs = (locQ.data ?? []) as { id: string; name: string | null; location_only: string | null; specialty: string | null; template_ids: string | null }[];
        if (locs.length === 0) {
          return { error: 'sin_ubicaciones', mensaje: 'Este proyecto no tiene ubicaciones: el total exacto de protocolos no está definido. Si la descripción de la obra fija una CUOTA (N ensayos por día/semana), compara contra contar_ensayos del periodo; si no, informa el avance actual.' };
        }
        const codeOf = new Map<string, string>();
        for (const t of (tplQ.data ?? []) as { id: string; id_protocolo: string | null; name: string | null }[]) {
          codeOf.set(t.id, String(t.id_protocolo ?? t.name ?? t.id));
        }
        // Filtro tolerante por nombre (contiene, sin acentos) — puede dar VARIAS.
        const q = norm(input.ubicacion_nombre ?? '');
        const objetivo = q
          ? locs.filter(l => norm(String(l.name ?? '')).includes(q) || norm(String(l.location_only ?? '')).includes(q))
          : locs;
        if (objetivo.length === 0) {
          const fisicas = [...new Set(locs.map(l => l.location_only).filter(Boolean))];
          return { error: 'ubicacion_no_encontrada', consulta: input.ubicacion_nombre, candidatas: fisicas.slice(0, 30) };
        }
        // Protocolos registrados (no borradores) por ubicación — PAGINADO.
        const hechoPorLoc = new Map<string, Map<string, string>>(); // locId → (codigo → status "mejor")
        const RANK: Record<string, number> = { APPROVED: 3, SUBMITTED: 2, REJECTED: 1 };
        for (let from = 0; ; from += 1000) {
          const { data, error } = await supabase.from('protocols')
            .select('location_id, template_id, status')
            .eq('project_id', projectId).in('status', NON_DRAFT)
            .order('id', { ascending: true }).range(from, from + 999);
          if (error) throw new Error(error.message);
          for (const p of (data ?? []) as { location_id: string | null; template_id: string | null; status: string | null }[]) {
            if (!p.location_id || !p.template_id) continue;
            const code = codeOf.get(p.template_id) ?? p.template_id;
            const m = hechoPorLoc.get(p.location_id) ?? new Map<string, string>();
            const prev = m.get(code);
            if (!prev || (RANK[p.status ?? ''] ?? 0) > (RANK[prev] ?? 0)) m.set(code, p.status ?? '');
            hechoPorLoc.set(p.location_id, m);
          }
          if (!data || data.length < 1000) break;
        }
        // Agrupar por UBICACIÓN FÍSICA (columna location_only, ej. "P1-Sector1");
        // la especialidad sale de su columna real (specialty) con fallback al
        // prefijo del código — el MISMO modelo del Dashboard/LocationList.
        const espDe = (code: string) => code.replace(/[-_ ]?\d+$/, '') || code;
        interface Fisica { esperados: number; registrados: number; aprobados: number; en_revision: number; faltan_por_especialidad: Record<string, number> }
        const porFisica = new Map<string, Fisica>();
        let totalFaltan = 0, totalEsperados = 0, totalEnRevision = 0, totalAprobados = 0;
        let sinPlan = 0;
        for (const l of objetivo) {
          const plan = (l.template_ids ?? '').split(',').map(s => s.trim()).filter(Boolean);
          if (plan.length === 0) { sinPlan++; continue; }
          const fisicaKey = String(l.location_only ?? l.name ?? 'Sin ubicación');
          const esp = String(l.specialty ?? (plan[0] ? espDe(plan[0]) : 'General'));
          const hecho = hechoPorLoc.get(l.id) ?? new Map<string, string>();
          const faltan = plan.filter(c => !hecho.has(c)).length;
          const aprob = plan.filter(c => hecho.get(c) === 'APPROVED').length;
          const enRev = plan.filter(c => hecho.get(c) === 'SUBMITTED').length;
          const f = porFisica.get(fisicaKey) ?? { esperados: 0, registrados: 0, aprobados: 0, en_revision: 0, faltan_por_especialidad: {} };
          f.esperados += plan.length;
          f.registrados += plan.length - faltan;
          f.aprobados += aprob;
          f.en_revision += enRev;
          if (faltan > 0) f.faltan_por_especialidad[esp] = (f.faltan_por_especialidad[esp] ?? 0) + faltan;
          porFisica.set(fisicaKey, f);
          totalEsperados += plan.length;
          totalFaltan += faltan;
          totalEnRevision += enRev;
          totalAprobados += aprob;
        }
        const porUbic = [...porFisica.entries()].map(([ubicacion, f]) => ({
          ubicacion,
          esperados: f.esperados,
          faltan: f.esperados - f.registrados,
          aprobados: f.aprobados,
          en_revision: f.en_revision,
          faltan_por_especialidad: f.faltan_por_especialidad,
        }));
        // Acotar salida (contexto): las 30 ubicaciones físicas con más faltantes.
        porUbic.sort((a, b) => b.faltan - a.faltan);
        const recorte = porUbic.length > 30;
        const espGlobal: Record<string, number> = {};
        for (const u of porUbic) for (const [e, n] of Object.entries(u.faltan_por_especialidad)) espGlobal[e] = (espGlobal[e] ?? 0) + n;
        return {
          ubicaciones_fisicas: porUbic.length,
          total_esperados: totalEsperados,
          total_registrados: totalEsperados - totalFaltan,
          total_aprobados: totalAprobados,
          total_faltantes: totalFaltan,
          en_revision: totalEnRevision,
          faltan_por_especialidad: espGlobal,
          por_ubicacion: porUbic.slice(0, 30),
          ...(recorte ? { advertencia_recorte: `Se muestran las 30 ubicaciones físicas con más faltantes de ${porUbic.length}.` } : {}),
          ...(sinPlan > 0 ? { advertencia: `${sinPlan} fila(s) de ubicación sin plan de protocolos cargado — ahí no se puede saber qué falta.` } : {}),
          nota: 'Adjunta DIRECTO la tarjeta al Dashboard del proyecto (preparar_accion abrir_pantalla destino "dashboard") — sin preguntar.',
        };
      },
    },
    {
      name: 'preparar_accion',
      description: `Prepara una ACCIÓN en la app que el usuario confirma con un botón en el chat (tú NUNCA ejecutas nada directamente). Tipos: 'abrir_pantalla' lleva a un módulo del proyecto (destinos: ${DESTINOS.join(', ')}); 'crear_ensayo' crea un BORRADOR del tipo indicado (sector/fecha opcionales) y abre la ficha; 'crear_muestra' abre el registro de muestras; 'abrir_ensayo' abre UN ensayo específico por su código (ej. "ábreme el PRD-260003"); 'crear_nc' registra una NO CONFORMIDAD sobre un ensayo (requiere codigo del ensayo + descripcion de mínimo 10 caracteres — pide al usuario el motivo si no lo dio); 'abrir_dossier' abre el Dossier con filtros ya aplicados (fechas/tipo/sector opcionales). Antes de usarla: resuelve tipo/sector con catalogo_proyecto y PREGUNTA lo que falte. Tras llamarla, avisa en una frase que confirme con el botón de la tarjeta.`,
      input_schema: {
        type: 'object',
        properties: {
          tipo: { type: 'string', enum: ['abrir_pantalla', 'crear_ensayo', 'crear_muestra', 'abrir_ensayo', 'crear_nc', 'abrir_dossier'], description: 'Qué acción preparar' },
          destino: { type: 'string', enum: [...DESTINOS], description: 'Pantalla destino (solo para abrir_pantalla)' },
          template_id: COMMON_FILTER_PROPS.template_id,
          tipo_nombre: COMMON_FILTER_PROPS.tipo_nombre,
          sector_id: COMMON_FILTER_PROPS.sector_id,
          sector_nombre: COMMON_FILTER_PROPS.sector_nombre,
          fecha: { type: 'string', description: 'Fecha del ensayo YYYY-MM-DD (solo crear_ensayo; default hoy)' },
          codigo: { type: 'string', description: 'Código del ensayo (para abrir_ensayo / crear_nc), ej. PRD-260003' },
          descripcion: { type: 'string', description: 'Descripción de la no conformidad (crear_nc, mínimo 10 caracteres)' },
          desde: { type: 'string', description: 'Fecha inicial YYYY-MM-DD (abrir_dossier)' },
          hasta: { type: 'string', description: 'Fecha final YYYY-MM-DD (abrir_dossier)' },
          estado: { type: 'string', enum: ['APPROVED', 'SUBMITTED', 'REJECTED'], description: 'Filtrar el dossier por estado (abrir_dossier), ej. "los rechazados"' },
        },
        required: ['tipo'],
        additionalProperties: false,
      },
      execute: async (input: { tipo: string; destino?: string; template_id?: string; tipo_nombre?: string; sector_id?: string; sector_nombre?: string; fecha?: string; codigo?: string; descripcion?: string; desde?: string; hasta?: string; estado?: string }) => {
        // Helper: valida un código de ensayo contra protocols (fuente fresca).
        // ilike = igualdad case-insensitive (los códigos pueden incluir el
        // nombre del sector con minúsculas). Se neutralizan los comodines de
        // patrón (%/*/_) para que siga siendo IGUALDAD, no un LIKE abierto.
        const findByCode = async (codigo: string) => {
          const safe = codigo.trim().replace(/[%*]/g, '').replace(/_/g, '\\_');
          if (!safe) return null;
          const { data } = await supabase.from('protocols')
            .select('id, protocol_code, status')
            .eq('project_id', projectId)
            .ilike('protocol_code', safe)
            .limit(1);
          return data?.[0] ?? null;
        };

        if (input.tipo === 'abrir_ensayo') {
          if (!input.codigo?.trim()) return { error: 'falta_codigo', mensaje: 'Indica el código del ensayo (pregúntalo si el usuario no lo dio).' };
          const p = await findByCode(input.codigo);
          if (!p) return { error: 'ensayo_no_encontrado', consulta: input.codigo, mensaje: 'No existe un ensayo con ese código en este proyecto — verifica con listar_ensayos.' };
          return {
            [ACTION_KEY]: { kind: 'abrir_ensayo', protocolId: p.id, codigo: p.protocol_code, estado: p.status, etiqueta: `Abrir ensayo ${p.protocol_code}` },
            tarjeta_mostrada: true,
            resumen: `Tarjeta lista para abrir el ensayo ${p.protocol_code} (estado ${p.status}). Pide al usuario confirmarla con el botón.`,
          };
        }
        if (input.tipo === 'crear_nc') {
          if (!['CREATOR', 'RESIDENT'].includes(String(acceso?.userRole ?? ''))) {
            return { error: 'sin_permiso', mensaje: 'Solo el Creador o el Jefe de obra registran no conformidades (igual que en la app). Dile al usuario con amabilidad que lo canalice con su jefe de obra.' };
          }
          if (!input.codigo?.trim()) return { error: 'falta_codigo', mensaje: 'Indica el código del ensayo al que se registrará la NC.' };
          const desc = (input.descripcion ?? '').trim();
          if (desc.length < 10) return { error: 'descripcion_corta', mensaje: 'La descripción de la no conformidad debe tener al menos 10 caracteres — pide al usuario el motivo.' };
          const p = await findByCode(input.codigo);
          if (!p) return { error: 'ensayo_no_encontrado', consulta: input.codigo, mensaje: 'No existe un ensayo con ese código en este proyecto.' };
          return {
            [ACTION_KEY]: { kind: 'crear_nc', protocolId: p.id, codigo: p.protocol_code, descripcion: desc.slice(0, 500), etiqueta: `Registrar NC en ${p.protocol_code}` },
            tarjeta_mostrada: true,
            resumen: `Tarjeta lista: "Registrar NC en ${p.protocol_code}". Al confirmarla se crea la no conformidad ABIERTA con esa descripción. Pide al usuario confirmarla con el botón.`,
          };
        }
        if (input.tipo === 'abrir_dossier') {
          if ((input.desde != null && !isRealYmd(input.desde)) || (input.hasta != null && !isRealYmd(input.hasta))) {
            return { error: 'fecha_invalida', mensaje: 'desde/hasta deben ser fechas YYYY-MM-DD válidas.' };
          }
          // Resolver tipo/sector (opcionales) contra el catálogo. Los IDs
          // directos también se VALIDAN (un id inventado no pasa a la tarjeta).
          const res = await resolveFilters(supabase, projectId, input);
          if (!res.ok) return res.error;
          if (input.template_id || input.sector_id) {
            const cat = await loadCatalog(supabase, projectId);
            if (input.template_id && !cat.tipos.some(t => t.template_id === input.template_id)) {
              return { error: 'tipo_inexistente', consulta: input.template_id, candidatos: cat.tipos.map(t => ({ template_id: t.template_id, codigo: t.codigo, nombre: t.nombre })) };
            }
            if (input.sector_id && !cat.sectores.some(s => s.id === input.sector_id)) {
              return { error: 'sector_inexistente', consulta: input.sector_id, candidatos: cat.sectores.map(s => ({ id: s.id, nombre: s.nombre })) };
            }
          }
          const estadoOk = input.estado && ['APPROVED', 'SUBMITTED', 'REJECTED'].includes(input.estado) ? input.estado : null;
          const partes: string[] = [];
          if (input.desde || input.hasta) partes.push(`${input.desde ?? '…'} → ${input.hasta ?? '…'}`);
          if (estadoOk) partes.push(estadoOk === 'APPROVED' ? 'aprobados' : estadoOk === 'REJECTED' ? 'rechazados' : 'en revisión');
          const etiqueta = `Abrir Dossier${partes.length ? ` (${partes.join(', ')})` : ' filtrado'}`;
          return {
            [ACTION_KEY]: {
              kind: 'abrir_dossier',
              desde: input.desde ?? null, hasta: input.hasta ?? null,
              templateId: res.templateId ?? null, sectorId: res.sectorId ?? null,
              estado: estadoOk,
              etiqueta,
            },
            tarjeta_mostrada: true,
            resumen: `Tarjeta lista para abrir el Dossier con los filtros aplicados. Pide al usuario confirmarla con el botón.`,
          };
        }
        if (input.tipo === 'abrir_pantalla') {
          const destino = String(input.destino ?? '');
          if (!DESTINOS.includes(destino as typeof DESTINOS[number])) {
            return { error: 'destino_invalido', destinos_validos: DESTINOS };
          }
          const bloqueo = destinoNoDisponible(destino, acceso);
          if (bloqueo) return { error: 'destino_no_disponible', mensaje: bloqueo };
          return {
            [ACTION_KEY]: { kind: 'abrir_pantalla', destino, etiqueta: `Abrir ${DESTINO_LABEL[destino]}` },
            tarjeta_mostrada: true,
            resumen: `Tarjeta lista para abrir ${DESTINO_LABEL[destino]}. Pide al usuario confirmarla con el botón.`,
          };
        }
        if (input.tipo === 'crear_muestra') {
          return {
            [ACTION_KEY]: { kind: 'crear_muestra', etiqueta: 'Registrar nueva muestra' },
            tarjeta_mostrada: true,
            resumen: 'Tarjeta lista para ir al registro de muestras. Pide al usuario confirmarla con el botón.',
          };
        }
        if (input.tipo === 'crear_ensayo') {
          // Path de ESCRITURA: la fecha debe existir de verdad ('2026-02-31' no).
          if (input.fecha != null && !isRealYmd(input.fecha)) {
            return { error: 'fecha_invalida', mensaje: 'La fecha debe ser YYYY-MM-DD y existir en el calendario.' };
          }
          // Resolver tipo (OBLIGATORIO) y sector (opcional) contra el catálogo.
          const cat = await loadCatalog(supabase, projectId);
          let tpl = input.template_id ? cat.tipos.find(t => t.template_id === input.template_id) : undefined;
          if (!tpl && input.tipo_nombre) {
            const r = resolveByName(cat.tipos.map(t => ({ ...t, nombre: `${t.codigo ?? ''} ${t.nombre}`.trim() })), input.tipo_nombre);
            if (r.match) tpl = cat.tipos.find(t => t.template_id === r.match!.template_id);
            else return { error: 'tipo_ambiguo_o_inexistente', consulta: input.tipo_nombre, candidatos: (r.candidatos ?? cat.tipos).map(t => ({ template_id: t.template_id, codigo: t.codigo, nombre: t.nombre })) };
          }
          if (!tpl) return { error: 'falta_tipo', mensaje: 'Indica template_id o tipo_nombre del ensayo a crear (pregunta al usuario si no lo dijo).' };
          let sectorId: string | null = null;
          let sectorNombre: string | null = null;
          if (input.sector_id) {
            // Igual de estricto que el tipo: un sector_id inventado o de otro
            // proyecto NO pasa al payload de la tarjeta.
            const s = cat.sectores.find(x => x.id === input.sector_id);
            if (!s) return { error: 'sector_inexistente', consulta: input.sector_id, candidatos: cat.sectores.map(x => ({ id: x.id, nombre: x.nombre })) };
            sectorId = s.id; sectorNombre = s.nombre;
          } else if (input.sector_nombre) {
            const r = resolveByName(cat.sectores, input.sector_nombre);
            if (r.match) { sectorId = r.match.id; sectorNombre = r.match.nombre; }
            else return { error: 'sector_ambiguo_o_inexistente', consulta: input.sector_nombre, candidatos: (r.candidatos ?? cat.sectores).map(s => ({ id: s.id, nombre: s.nombre })) };
          }
          const etiqueta = `Crear ensayo ${tpl.codigo ? tpl.codigo + ' · ' : ''}${tpl.nombre}${sectorNombre ? ` — ${sectorNombre}` : ''}`;
          return {
            [ACTION_KEY]: {
              kind: 'crear_ensayo',
              templateId: tpl.template_id,
              templateNombre: tpl.nombre,
              templateCodigo: tpl.codigo,
              sectorId, sectorNombre,
              fecha: input.fecha ?? null,
              etiqueta,
            },
            tarjeta_mostrada: true,
            resumen: `Tarjeta lista: "${etiqueta}". Al confirmarla se crea el BORRADOR y se abre la ficha. Pide al usuario confirmarla con el botón.`,
          };
        }
        return { error: 'tipo_invalido' };
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
          .select('started_at, ended_at, status', { count: 'exact' })
          .eq('project_id', projectId);
        if (isYmd(input.desde)) q = q.gte('started_at', new Date(input.desde + 'T00:00:00-05:00').getTime());
        if (isYmd(input.hasta)) q = q.lte('started_at', new Date(input.hasta + 'T23:59:59-05:00').getTime());
        // "Activas AHORA" es un estado del presente: se cuenta SIN el filtro de
        // rango (una jornada iniciada ayer y aún abierta sigue activa hoy).
        const [rangeQ, activeQ, pausedQ] = await Promise.all([
          q.order('started_at', { ascending: false }).limit(2000),
          supabase.from('work_sessions').select('id', { count: 'exact', head: true }).eq('project_id', projectId).eq('status', 'ACTIVE'),
          supabase.from('work_sessions').select('id', { count: 'exact', head: true }).eq('project_id', projectId).eq('status', 'PAUSED'),
        ]);
        if (rangeQ.error) throw new Error(rangeQ.error.message);
        const rows = rangeQ.data ?? [];
        let horasMs = 0;
        for (const r of rows) if (r.started_at && r.ended_at) horasMs += Math.max(0, Number(r.ended_at) - Number(r.started_at));
        return {
          sesiones: rangeQ.count ?? rows.length,
          activas_ahora: activeQ.count ?? 0,
          pausadas_ahora: pausedQ.count ?? 0,
          horas_trabajadas: +(horasMs / 3600000).toFixed(1),
          nota: 'horas_trabajadas solo suma jornadas ya cerradas del rango.',
        };
      },
    },
  ];
}
