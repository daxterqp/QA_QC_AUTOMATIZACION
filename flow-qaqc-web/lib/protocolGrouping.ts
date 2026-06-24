/**
 * protocolGrouping (v45.3 / v47) — Resuelve un AGRUPAMIENTO (preset) a una lista de IDS
 * de protocolo (permanentes), leyendo de Supabase (acotado: project_id + status APPROVED).
 * ESPEJO de src/services/ProtocolGroupingService.ts (que lee de WatermelonDB local).
 *
 * La regla se re-evalúa EN VIVO (por fecha de realización); excepciones/añadidos por id.
 * También expone el EXPANSOR de marcadores `@g:<presetId>` y el HORNEADO para el freeze.
 */
import { createClient } from '@lib/supabase/client';
import { parseNumericRow, splitRowComments, joinRowComments } from '@lib/numericProtocol';
import { clauseMatches, clauseCellKey } from '@lib/groupingFilters';
import type { GroupingPreset } from '@/types';

const supabase = createClient();

/** Contexto del ensayo que está abriendo el selector (para criterios relativos). */
export interface GroupingContext {
  projectId: string;
  tipoActual?: string | null;   // id_protocolo de la ficha que llama
  sectorId?: string | null;
  sampleId?: string | null;
  locationId?: string | null;
  ensayoDate?: string | null;   // YYYY-MM-DD
}

function sortMs(p: any): number {
  if (p.ensayo_date) { const t = Date.parse(p.ensayo_date); if (isFinite(t)) return t; }
  const c = p.created_at;
  if (typeof c === 'number') return c;
  if (typeof c === 'string') { const t = Date.parse(c); if (isFinite(t)) return t; }
  return 0;
}

function daysAgoISO(days: number, todayMs: number): string {
  // Resta días en calendario LOCAL (ensayo_date es 'YYYY-MM-DD' local).
  const d = new Date(todayMs);
  d.setDate(d.getDate() - days);
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

/** Lee el valor numérico de la celda `<fila><col>` del ensayo fuente (comments congelado). */
async function readCellValue(protocolId: string, key: string): Promise<number | null> {
  const cellMatch = key.match(/^(\d+)([A-Z])$/);
  if (!cellMatch) return null;
  const partidaWanted = cellMatch[1];
  const colIdx = cellMatch[2].charCodeAt(0) - 65;
  const { data } = await supabase
    .from('protocol_items').select('partida_item, validation_method, comments').eq('protocol_id', protocolId);
  const item = ((data ?? []) as any[]).find(it => (it.partida_item ?? '').trim() === partidaWanted);
  if (!item) return null;
  const spec = parseNumericRow(item.validation_method);
  const cellCount = spec?.kind === 'row' ? spec.cells.length : 1;
  const vals = splitRowComments(item.comments, cellCount);
  const raw = vals[colIdx] ?? '';
  if (raw === '') return null;
  const num = Number(String(raw).replace(',', '.'));
  return isFinite(num) ? num : null;
}

/**
 * Resuelve un preset a IDS de protocolo (orden + límite + exclusiones + añadidos aplicados).
 * @param todayMs  fecha "hoy" en ms (inyectada para determinismo).
 */
export async function resolvePreset(preset: GroupingPreset, ctx: GroupingContext, todayMs: number): Promise<string[]> {
  if (!ctx.projectId) return [];
  const tipo = preset.source_tipo || ctx.tipoActual || undefined;

  let q = supabase
    .from('protocols')
    .select('id, protocol_code, external_id, ensayo_date, created_at, sample_id, sector_id, location_id, protocol_number, location_reference, template_id')
    .eq('project_id', ctx.projectId)
    .eq('status', 'APPROVED');
  if (tipo) {
    const { data: tpls } = await supabase.from('protocol_templates').select('id').eq('id_protocolo', tipo);
    const ids = ((tpls ?? []) as any[]).map(t => t.id);
    q = q.in('template_id', ids.length ? ids : ['__none__']);
  }
  // Filtros relativos EXCLUSIVOS: si pide "mismo sector/muestra/ubicación" sin ancla → set vacío.
  if (preset.same_sector) q = q.eq('sector_id', ctx.sectorId ?? '__none__');
  if (preset.same_sample) q = q.eq('sample_id', ctx.sampleId ?? '__none__');
  if (preset.same_location) q = q.eq('location_id', ctx.locationId ?? '__none__');

  const { data } = await q;
  let rows: any[] = (data ?? []) as any[];

  // ── Fechas (sobre ensayo_date) ──
  let from = preset.date_from ?? null;
  const to = preset.date_to ?? null;
  if (preset.last_days != null && preset.last_days > 0) {
    const rel = daysAgoISO(preset.last_days, todayMs);
    from = from && from > rel ? from : rel;   // el más restrictivo
  }
  if (from) rows = rows.filter(p => p.ensayo_date && p.ensayo_date >= from!);
  if (to)   rows = rows.filter(p => p.ensayo_date && p.ensayo_date <= to);

  // ── Etiqueta manual ──
  if (preset.label && preset.label.trim()) {
    const lbl = preset.label.trim().toLowerCase();
    rows = rows.filter(p =>
      (`${p.protocol_code ?? p.external_id ?? ''} ${p.location_reference ?? ''} ${p.protocol_number ?? ''}`).toLowerCase().includes(lbl));
  }

  // ── Filtros (atributos + valores de celda) ──
  const clausesF = preset.filters ?? [];
  if (clausesF.length) {
    const needSample = clausesF.some(c => c.field === 'material' || c.field === 'condicion');
    const needSector = clausesF.some(c => c.field === 'sector');
    const sampleById = new Map<string, any>();
    const sectorById = new Map<string, any>();
    if (needSample) {
      const ids = Array.from(new Set(rows.map(p => p.sample_id).filter(Boolean)));
      if (ids.length) { const { data: ss } = await supabase.from('samples').select('id, material_type, condition').in('id', ids); ((ss ?? []) as any[]).forEach(s => sampleById.set(s.id, s)); }
    }
    if (needSector) {
      const ids = Array.from(new Set(rows.map(p => p.sector_id).filter(Boolean)));
      if (ids.length) { const { data: ss } = await supabase.from('project_sectors').select('id, name').in('id', ids); ((ss ?? []) as any[]).forEach(s => sectorById.set(s.id, s)); }
    }
    const attrOf = (p: any, field: string): string | null => {
      switch (field) {
        case 'material':  return p.sample_id ? (sampleById.get(p.sample_id)?.material_type ?? null) : null;
        case 'condicion': return p.sample_id ? (sampleById.get(p.sample_id)?.condition ?? null) : null;
        case 'sector':    return p.sector_id ? (sectorById.get(p.sector_id)?.name ?? null) : null;
        case 'fecha':     return p.ensayo_date ?? null;
        case 'codigo':    return (p.protocol_code ?? p.external_id ?? null);
        default:          return null;
      }
    };
    const kept: any[] = [];
    for (const p of rows) {
      let ok = true;
      for (const clause of clausesF) {
        const cellKey = clauseCellKey(clause);
        const actual = cellKey ? await readCellValue(p.id, cellKey) : attrOf(p, clause.field);
        if (!clauseMatches(clause, actual)) { ok = false; break; }
      }
      if (ok) kept.push(p);
    }
    rows = kept;
  }

  // ── Orden + límite ──
  rows.sort((a, b) => preset.order === 'antiguo' ? sortMs(a) - sortMs(b) : sortMs(b) - sortMs(a));
  if (preset.last_n != null && preset.last_n > 0) rows = rows.slice(0, preset.last_n);

  // ── IDS + exclusiones + añadidos (el grupo se referencia por ID permanente) ──
  const exclCodes = new Set((preset.exclude_codes ?? []).map(c => c.trim()).filter(Boolean));
  const exclIds = new Set((preset.exclude_ids ?? []).filter(Boolean));
  const out: string[] = [];
  for (const p of rows) {
    if (exclIds.has(p.id)) continue;
    const code = (p.protocol_code ?? p.external_id ?? '').trim();
    if (code && exclCodes.has(code)) continue;
    out.push(p.id);
  }
  // Añadidos por id (APPROVED + mismo proyecto).
  const incl = (preset.include_ids ?? []).filter(Boolean).filter(id => !exclIds.has(id));
  if (incl.length) {
    const { data: addRows } = await supabase
      .from('protocols').select('id').eq('project_id', ctx.projectId).eq('status', 'APPROVED').in('id', incl);
    const have = new Set(out);
    for (const p of ((addRows ?? []) as any[])) if (!have.has(p.id)) out.push(p.id);
  }
  return out;
}

const MARKER_RE = /@g:[A-Za-z0-9_-]+/g;

/**
 * v47 — Construye un EXPANSOR síncrono de marcadores de grupo `@g:<presetId>` → ids
 * vigentes. Pre-resuelve (async) solo los presets presentes en `commentsList` (regla EN
 * VIVO por fecha). El expansor resultante es síncrono → usable en scanXrefs/scope. Identidad
 * si no hay marcadores.
 */
export async function buildMarkerExpander(
  presets: GroupingPreset[] | undefined,
  ctx: GroupingContext,
  commentsList: (string | null | undefined)[],
  todayMs: number,
): Promise<(raw: string) => string> {
  const found = new Set<string>();
  for (const cs of commentsList) { const mm = (cs ?? '').match(MARKER_RE); if (mm) mm.forEach(m => found.add(m)); }
  if (found.size === 0) return (s) => s;
  const map: Record<string, string[]> = {};
  for (const mk of Array.from(found)) {
    const preset = (presets ?? []).find(p => `@g:${p.id}` === mk);
    map[mk] = preset ? await resolvePreset(preset, ctx, todayMs).catch(() => []) : [];
  }
  return (raw: string) => {
    if (!raw || raw.indexOf('@g:') < 0) return raw;
    const acc: string[] = [];
    for (const tok of raw.split(',').map(s => s.trim()).filter(Boolean)) {
      if (tok.startsWith('@g:')) { for (const id of (map[tok] ?? [])) acc.push(id); }
      else acc.push(tok);
    }
    return acc.join(',');
  };
}

/**
 * v47 — HORNEA los marcadores de grupo de las celdas selectoras (select/self) de una fila,
 * reemplazándolos por la lista de IDS concreta (vía `expand`). Se usa al CONGELAR (enviar):
 * el grupo del ensayo aprobado queda FIJO (auditable); en borrador sigue vivo.
 */
export function bakeMarkersInComments(validationMethod: string | null, comments: string | null, expand: (raw: string) => string): string | null {
  if (!comments || comments.indexOf('@g:') < 0) return comments;
  const row = parseNumericRow(validationMethod);
  if (row?.kind !== 'row') return comments;
  const vals = splitRowComments(comments, row.cells.length);
  let changed = false;
  row.cells.forEach((c, idx) => {
    if (c.kind === 'xref' && ((c as { mode?: string }).mode === 'select' || (c as { mode?: string }).mode === 'self') && (vals[idx] ?? '').indexOf('@g:') >= 0) {
      vals[idx] = expand(vals[idx] ?? ''); changed = true;
    }
  });
  return changed ? joinRowComments(vals) : comments;
}
