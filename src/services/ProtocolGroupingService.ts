/**
 * ProtocolGroupingService (v45.3 / v47) — Resuelve un AGRUPAMIENTO (preset) a una lista de
 * IDS de protocolo (permanentes), leyendo de la base LOCAL (WatermelonDB, sin red). La regla
 * se re-evalúa EN VIVO (por fecha de realización); excepciones/añadidos por id.
 *
 * Un preset = selección base (tipo, contexto relativo, fechas, etiqueta) + filtros
 * (atributos y/o valores de celda) + excepciones. Ver docs/agrupaciones-de-protocolos.md.
 */
import { Q } from '@nozbe/watermelondb';
import { protocolsCollection, protocolTemplatesCollection, samplesCollection, projectSectorsCollection } from '@db/index';
import { readCellValue } from '@services/XrefResolver';
import { clauseMatches, clauseCellKey } from '@utils/groupingFilters';
import { parseNumericRow, splitRowComments, joinRowComments } from '@utils/numericProtocol';
import type { GroupingPreset } from '@utils/featureFlags';

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
  if (p.ensayoDate) { const t = Date.parse(p.ensayoDate); if (isFinite(t)) return t; }
  return p.createdAt instanceof Date ? p.createdAt.getTime() : (p._raw?.created_at ?? 0);
}

function daysAgoISO(days: number, todayMs: number): string {
  // Resta días en calendario LOCAL (ensayo_date es una fecha local 'YYYY-MM-DD'):
  // usar toISOString() (UTC) desfasaba ±1 día en zonas con offset negativo (Perú UTC-5).
  const d = new Date(todayMs);
  d.setDate(d.getDate() - days);
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

/**
 * Resuelve un preset a IDS de protocolo (orden + límite + exclusiones + añadidos aplicados).
 * @param todayMs  fecha "hoy" en ms (se inyecta para testabilidad / determinismo).
 */
export async function resolvePreset(preset: GroupingPreset, ctx: GroupingContext, todayMs: number): Promise<string[]> {
  if (!ctx.projectId) return [];
  const tipo = preset.source_tipo || ctx.tipoActual || undefined;

  const clauses: any[] = [
    Q.where('project_id', ctx.projectId),
    Q.where('status', 'APPROVED'),
  ];
  if (tipo) {
    const tpls: any[] = await protocolTemplatesCollection.query(Q.where('id_protocolo', tipo)).fetch().catch(() => []);
    const ids = tpls.map(t => t.id);
    clauses.push(Q.where('template_id', Q.oneOf(ids.length ? ids : ['__none__'])));
  }
  // Filtros relativos EXCLUSIVOS: si el preset pide "mismo sector/muestra/ubicación" pero el
  // ensayo actual no tiene ese ancla, no debe ABRIRSE a todos → sentinel imposible (set vacío).
  if (preset.same_sector) clauses.push(Q.where('sector_id', ctx.sectorId ?? '__none__'));
  if (preset.same_sample) clauses.push(Q.where('sample_id', ctx.sampleId ?? '__none__'));
  if (preset.same_location) clauses.push(Q.where('location_id', ctx.locationId ?? '__none__'));

  let rows: any[] = await protocolsCollection.query(...clauses).fetch().catch(() => []);

  // ── Fechas (sobre ensayo_date) ──
  let from = preset.date_from ?? null;
  const to = preset.date_to ?? null;
  if (preset.last_days != null && preset.last_days > 0) {
    const rel = daysAgoISO(preset.last_days, todayMs);
    from = from && from > rel ? from : rel;   // el más restrictivo
  }
  if (from) rows = rows.filter(p => p.ensayoDate && p.ensayoDate >= from!);
  if (to)   rows = rows.filter(p => p.ensayoDate && p.ensayoDate <= to);

  // ── Etiqueta manual: coincide en la referencia de ubicación o el número ──
  if (preset.label && preset.label.trim()) {
    const lbl = preset.label.trim().toLowerCase();
    rows = rows.filter(p =>
      (`${p.protocolCode ?? p.externalId ?? ''} ${p.locationReference ?? ''} ${p.protocolNumber ?? ''}`).toLowerCase().includes(lbl));
  }

  // ── Filtros (atributos + valores de celda) ──
  const clausesF = preset.filters ?? [];
  if (clausesF.length) {
    // Pre-carga de muestras y sectores para atributos (evita N+1).
    const needSample = clausesF.some(c => c.field === 'material' || c.field === 'condicion');
    const needSector = clausesF.some(c => c.field === 'sector');
    const sampleById = new Map<string, any>();
    const sectorById = new Map<string, any>();
    if (needSample) {
      const ids = Array.from(new Set(rows.map(p => p.sampleId).filter(Boolean)));
      if (ids.length) {
        const ss: any[] = await samplesCollection.query(Q.where('id', Q.oneOf(ids))).fetch().catch(() => []);
        ss.forEach(s => sampleById.set(s.id, s));
      }
    }
    if (needSector) {
      const ids = Array.from(new Set(rows.map(p => p.sectorId).filter(Boolean)));
      if (ids.length) {
        const ss: any[] = await projectSectorsCollection.query(Q.where('id', Q.oneOf(ids))).fetch().catch(() => []);
        ss.forEach(s => sectorById.set(s.id, s));
      }
    }
    const attrOf = (p: any, field: string): string | null => {
      switch (field) {
        case 'material':  return p.sampleId ? (sampleById.get(p.sampleId)?.materialType ?? null) : null;
        case 'condicion': return p.sampleId ? (sampleById.get(p.sampleId)?.condition ?? null) : null;
        case 'sector':    return p.sectorId ? (sectorById.get(p.sectorId)?.name ?? null) : null;
        case 'fecha':     return p.ensayoDate ?? null;
        case 'codigo':    return (p.protocolCode ?? p.externalId ?? null);
        default:          return null;
      }
    };
    const kept: any[] = [];
    for (const p of rows) {
      let ok = true;
      for (const clause of clausesF) {
        const cellKey = clauseCellKey(clause);
        const actual = cellKey ? await readCellValue(p.id, cellKey).catch(() => null) : attrOf(p, clause.field);
        if (!clauseMatches(clause, actual)) { ok = false; break; }
      }
      if (ok) kept.push(p);
    }
    rows = kept;
  }

  // ── Orden + límite ──
  rows.sort((a, b) => preset.order === 'antiguo' ? sortMs(a) - sortMs(b) : sortMs(b) - sortMs(a));
  if (preset.last_n != null && preset.last_n > 0) rows = rows.slice(0, preset.last_n);

  // ── IDS + exclusiones + añadidos (v47: el grupo se referencia por ID permanente) ──
  const exclCodes = new Set((preset.exclude_codes ?? []).map(c => c.trim()).filter(Boolean));
  const exclIds = new Set((preset.exclude_ids ?? []).filter(Boolean));
  const out: string[] = [];
  for (const p of rows) {
    if (exclIds.has(p.id)) continue;
    const code = (p.protocolCode ?? p.externalId ?? '').trim();
    if (code && exclCodes.has(code)) continue;
    out.push(p.id);
  }
  // Añadidos por id (ensayos específicos aunque la regla no los traiga): APPROVED + mismo proyecto.
  const incl = (preset.include_ids ?? []).filter(Boolean).filter(id => !exclIds.has(id));
  if (incl.length) {
    const addRows: any[] = await protocolsCollection
      .query(Q.where('project_id', ctx.projectId), Q.where('status', 'APPROVED'), Q.where('id', Q.oneOf(incl)))
      .fetch().catch(() => []);
    const have = new Set(out);
    for (const p of addRows) if (!have.has(p.id)) out.push(p.id);
  }
  return out;
}

const MARKER_RE = /@g:[A-Za-z0-9_-]+/g;

/**
 * v47 — Construye un EXPANSOR síncrono de marcadores de grupo `@g:<presetId>` → lista
 * de IDS vigente. Pre-resuelve (async) solo los presets realmente presentes en `comments`
 * usando la regla EN VIVO (por fecha). El expansor resultante es síncrono → se puede usar
 * dentro de `scanXrefs`/`resolveScopeCells`. Identidad si no hay marcadores.
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
  for (const mk of found) {
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
 * el grupo del ensayo aprobado queda FIJO (auditable), mientras que en borrador sigue vivo.
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
