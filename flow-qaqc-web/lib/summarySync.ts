/**
 * summarySync.ts (web) — Sync INCREMENTAL + caché LOCAL de las Tablas Resumen.
 *
 * La nube (`protocol_summary_rows`) es la ORQUESTADORA/fuente de verdad. El
 * cliente mantiene una caché en localStorage por proyecto y solo trae las filas
 * con `updated_at` mayor al último cursor → NO recarga toda la tabla cada vez.
 *
 * `backfillSummary` garantiza que NINGÚN ensayo falte: crea las filas resumen
 * que aún no existan para protocolos no-DRAFT (datos previos a la feature).
 */
import { createClient } from '@lib/supabase/client';
import { upsertSummaryRowWeb, SUMMARY_ROW_VERSION } from '@lib/summaryRow';

const supabase = createClient();

export interface SummaryRowData {
  id: string;
  protocol_id: string;
  template_id: string | null;
  protocol_code: string | null;
  protocol_number: string | null;
  ensayo_date: string | null;
  sector_id: string | null;
  sector_name: string | null;
  location_id: string | null;
  location_name: string | null;
  status: string | null;
  values_json: Record<string, unknown> | null;
  updated_at?: number | null;
}

interface Cache { rows: Record<string, SummaryRowData>; cursor: number; }
const KEY = (pid: string) => `summary_cache_${pid}`;

function load(pid: string): Cache {
  try {
    const r = localStorage.getItem(KEY(pid));
    if (r) {
      const c = JSON.parse(r);
      // Validar la FORMA: un JSON válido pero con esquema viejo/corrupto
      // (array, null, rows no-objeto) reventaría más abajo al indexar.
      if (c && typeof c === 'object' && c.rows && typeof c.rows === 'object' && !Array.isArray(c.rows) && typeof c.cursor === 'number') {
        return c as Cache;
      }
    }
  } catch { /* ignore */ }
  return { rows: {}, cursor: 0 };
}
function save(pid: string, c: Cache) {
  try { localStorage.setItem(KEY(pid), JSON.stringify(c)); }
  catch { /* cuota llena: la caché es best-effort, el sync incremental se rehará */ }
}

// Backfill: solo 1 vez por proyecto por sesión (evita re-escanear en cada navegación).
const _backfilled = new Set<string>();

/** Crea las filas resumen FALTANTES (protocolos no-DRAFT sin fila). Garantiza
 *  que no falte ningún ensayo. Idempotente y barato si ya está completo. */
export async function backfillSummary(pid: string): Promise<number> {
  if (_backfilled.has(pid)) return 0;
  _backfilled.add(pid);
  const [{ data: protos }, { data: sums }] = await Promise.all([
    supabase.from('protocols').select('id').eq('project_id', pid).neq('status', 'DRAFT'),
    supabase.from('protocol_summary_rows').select('protocol_id, values_json').eq('project_id', pid),
  ]);
  // Filas al día = existen Y con la versión actual del esquema.
  const fresh = new Set((sums ?? [])
    .filter((s: { values_json: { _sv?: number } | null }) => (s.values_json?._sv ?? 0) >= SUMMARY_ROW_VERSION)
    .map((s: { protocol_id: string }) => s.protocol_id));
  // Re-construir las que faltan O quedaron en una versión vieja (responsables/estado/calculados).
  const todo = (protos ?? []).map((p: { id: string }) => p.id).filter(id => !fresh.has(id));
  for (const id of todo) { await upsertSummaryRowWeb(id); }
  return todo.length;
}

/** Sync incremental: trae solo filas nuevas/cambiadas y mergea en la caché. */
export async function syncSummary(pid: string): Promise<SummaryRowData[]> {
  const cache = load(pid);
  // Solapamiento de 2 min: re-trae lo recientísimo para cerrar huecos por desfase
  // de reloj entre dispositivos (barato; son pocas filas). El merge es idempotente.
  const since = Math.max(0, cache.cursor - 120_000);
  const { data, error } = await supabase
    .from('protocol_summary_rows')
    .select('*')
    .eq('project_id', pid)
    .gt('updated_at', since)
    .order('updated_at', { ascending: true }); // determinista: el cursor avanza al máximo realmente leído
  if (error) {
    console.warn('[summary] sync falló (¿corriste v38?):', error.message);
    return Object.values(cache.rows);
  }
  let maxC = cache.cursor;
  for (const r of (data ?? []) as SummaryRowData[]) {
    cache.rows[r.protocol_id] = r;
    if (typeof r.updated_at === 'number' && r.updated_at > maxC) maxC = r.updated_at;
  }
  cache.cursor = maxC;
  save(pid, cache);
  return Object.values(cache.rows);
}

/** Backfill (1ª vez) + sync incremental → todas las filas (desde caché local). */
export async function loadSummary(pid: string): Promise<SummaryRowData[]> {
  try { await backfillSummary(pid); } catch (e) { console.warn('[summary] backfill falló:', e); }
  return syncSummary(pid);
}
