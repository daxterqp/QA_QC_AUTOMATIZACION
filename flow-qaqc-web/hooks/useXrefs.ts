'use client';

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { createClient } from '@lib/supabase/client';
import { extractXrefs, type XrefValues } from '@lib/formulaEval';
import { parseNumericRow, splitRowComments, scopeKeyFor } from '@lib/numericProtocol';
import type { ProtocolItem } from '@/types';

const supabase = createClient();

/** Una xref local: correlativo (protocol_code) + key (`<row><col>`). */
export interface XrefSpec {
  externalId: string; // correlativo escrito por el usuario (nombre histórico del campo)
  key: string;
}

export type XrefStatus = 'ok' | 'pendiente' | 'ambiguo';

/** Metadata por xref para el doble check + frescura (snapshot). */
export interface XrefMeta {
  code: string;
  key: string;
  status: XrefStatus;
  sourceId: string | null;       // id permanente del ensayo fuente
  sourceUpdatedAt: number | null;
  value: number | null;
}

export interface XrefResolution {
  values: XrefValues;               // { "ref.key": number|null } (ref = id o código)
  meta: Record<string, XrefMeta>;   // { "ref.key": XrefMeta }
  /** v47 — ref-guardada → código a MOSTRAR (las que guardan el id permanente se
   *  mapean a su código actual; las legacy por código, a sí mismas). */
  displayByRef: Record<string, string>;
}

/** Items para el scan: `validation_method` + `comments` (código elegido en celdas
 *  xref) + `partida_item` (para mapear celdas selectoras por scope key). */
export type ScanItem = Pick<ProtocolItem, 'validation_method'> & { comments?: string | null; partida_item?: string | null };

/** v45.2 — celdas-clave de comparación que una op de `get` necesita además del targetKey. */
function opMatchKeys(op: import('@lib/numericProtocol').XrefGetOp | undefined): string[] {
  if (!op) return [];
  if (op.kind === 'agg') return op.filter ? [op.filter.matchKey] : [];
  if (op.kind === 'pick') return op.matchKey ? [op.matchKey] : [];
  if (op.kind === 'interp') return [op.matchKey];
  return [];
}

/** Recorre los items y extrae todas las xrefs `@<code>.<key>`:
 *  (a) las declaradas en fórmulas `numerico-fx[...]` (estáticas, v26), y
 *  (b) v45 — las de celdas `xref`: `self` (código propio), `get` (código tomado de
 *      su celda selectora), y `select` (solo guarda el código; no emite ref).
 *  Devuelve el conjunto deduplicado. */
export function scanXrefsInItems(items: ScanItem[], expand: (raw: string) => string = (s) => s): XrefSpec[] {
  const seen = new Set<string>();
  const out: XrefSpec[] = [];
  const add = (externalId: string, key: string) => {
    const k = `${externalId}.${key}`;
    if (!seen.has(k)) { seen.add(k); out.push({ externalId, key }); }
  };

  // Pass 1 — valores de celdas SELECTORAS (select/self) por scope key. `expand` reemplaza
  // marcadores de grupo `@g:<presetId>` por la lista de IDS resuelta EN VIVO (v47).
  const codeByKey: Record<string, string> = {};
  for (const it of items) {
    const m = (it.validation_method ?? '').trim();
    if (!m || !m.toLowerCase().includes('xref')) continue;
    const row = parseNumericRow(m);
    if (row?.kind !== 'row') continue;
    const partida = (it.partida_item ?? '').trim();
    const vals = splitRowComments(it.comments, row.cells.length);
    row.cells.forEach((c, idx) => {
      if (c.kind === 'xref' && (c.mode === 'select' || c.mode === 'self')) {
        const code = expand((vals[idx] ?? '').trim());
        if (code) codeByKey[scopeKeyFor(partida, idx)] = code;
      }
    });
  }

  // Pass 2 — emitir refs.
  for (const it of items) {
    const m = (it.validation_method ?? '').trim();
    if (!m) continue;
    // (a) refs estáticas en fórmulas.
    for (const seg of m.split('//')) {
      const fx = seg.match(/^numerico-fx\[(.+?)\]/i);
      if (!fx) continue;
      try {
        for (const x of extractXrefs(fx[1])) add(x.externalId, x.key);
      } catch { /* fórmula inválida → la celda mostrará error igual */ }
    }
    // (b) celdas xref.
    if (m.toLowerCase().includes('xref')) {
      const row = parseNumericRow(m);
      if (row?.kind === 'row') {
        const vals = splitRowComments(it.comments, row.cells.length);
        row.cells.forEach((c, idx) => {
          if (c.kind !== 'xref' || !c.targetKey) return;
          if (c.mode === 'self') {
            const code = (vals[idx] ?? '').trim();
            if (code) add(code, c.targetKey!);
          } else if (c.mode === 'get') {
            const codesRaw = c.sourceRef ? (codeByKey[c.sourceRef] ?? '') : '';
            // v45.2 — además del targetKey, emite el matchKey de la op (filtro/cerca/interp).
            const keys = [c.targetKey!, ...opMatchKeys(c.op)];
            codesRaw.split(',').map(s => s.trim()).filter(Boolean).forEach(code => keys.forEach(k => add(code, k)));
          }
        });
      }
    }
  }
  return out;
}

/** Lee el valor numérico de la celda `<row><col>` desde los items de la fuente. */
function readCell(its: { partida_item: string | null; validation_method: string | null; comments: string | null }[], key: string): number | null {
  const cellMatch = key.match(/^(\d+)([A-Z])$/);
  if (!cellMatch) return null;
  const partidaWanted = cellMatch[1];
  const colIdx = cellMatch[2].charCodeAt(0) - 65;
  const item = its.find(it => (it.partida_item ?? '').trim() === partidaWanted);
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
 * v42 — Resuelve los llamados entre ensayos `@<correlativo>.<celda>`.
 *
 * Direccionamiento robusto: el usuario escribe el CORRELATIVO (protocol_code);
 * resolvemos al ID PERMANENTE del ensayo (`protocols.id`) y aplicamos DOBLE CHECK:
 *   - exactamente 1 aprobado con ese correlativo → `ok`
 *   - 0 → `pendiente`  | >1 (reúso del correlativo) → `ambiguo`
 * Solo ensayos APROBADOS del mismo proyecto. `external_id` queda como fallback
 * histórico. Nunca lanza; degrada con estado por ref.
 */
export async function fetchXrefResolution(
  projectId: string,
  items: ScanItem[],
  expand: (raw: string) => string = (s) => s,
): Promise<XrefResolution> {
  const refs = scanXrefsInItems(items, expand);
  if (refs.length === 0) return { values: {}, meta: {}, displayByRef: {} };
  // `token` = valor guardado en la celda: id permanente (v47) o correlativo (legacy/fórmulas).
  const tokens = Array.from(new Set(refs.map(x => x.externalId)));

  // Candidatos por id O protocol_code O external_id (3 .in() seguros, dedupe por id).
  const sel = 'id, protocol_code, external_id, updated_at';
  const base = () => supabase.from('protocols').select(sel).eq('project_id', projectId).eq('status', 'APPROVED');
  const [r1, r2, r3] = await Promise.all([
    base().in('id', tokens), base().in('protocol_code', tokens), base().in('external_id', tokens),
  ]);
  const all = new Map<string, any>();
  for (const r of [r1, r2, r3]) for (const p of ((r.data ?? []) as any[])) all.set(p.id, p);
  const candidates = Array.from(all.values());

  const byId = new Map<string, any>(candidates.map(p => [p.id, p]));
  const byCode = new Map<string, any[]>();
  for (const p of candidates) { const c = (p.protocol_code ?? '').trim(); if (c) { if (!byCode.has(c)) byCode.set(c, []); byCode.get(c)!.push(p); } }
  for (const p of candidates) { const e = (p.external_id ?? '').trim(); if (e && !byCode.has(e)) { byCode.set(e, []); byCode.get(e)!.push(p); } }
  const codeOf = (p: any) => ((p.protocol_code ?? p.external_id ?? '') as string).trim();

  // Resolver fuente por token (id primero); recolectar ids resueltos sin ambigüedad.
  const srcByToken = new Map<string, { src: any | null; status: XrefStatus }>();
  const matchedIds = new Set<string>();
  for (const tk of tokens) {
    let src = byId.get(tk) ?? null;
    let status: XrefStatus = 'ok';
    if (!src) { const m = byCode.get(tk) ?? []; if (m.length === 1) src = m[0]; else status = m.length > 1 ? 'ambiguo' : 'pendiente'; }
    if (src) matchedIds.add(src.id);
    srcByToken.set(tk, { src, status });
  }

  const itemsByProto = new Map<string, any[]>();
  if (matchedIds.size > 0) {
    const { data: refItems } = await supabase
      .from('protocol_items')
      .select('protocol_id, partida_item, validation_method, comments')
      .in('protocol_id', Array.from(matchedIds));
    for (const it of (refItems ?? []) as any[]) {
      if (!itemsByProto.has(it.protocol_id)) itemsByProto.set(it.protocol_id, []);
      itemsByProto.get(it.protocol_id)!.push(it);
    }
  }

  const values: XrefValues = {};
  const meta: Record<string, XrefMeta> = {};
  const displayByRef: Record<string, string> = {};
  for (const { externalId: ref, key } of refs) {
    const fullKey = `${ref}.${key}`;
    const r = srcByToken.get(ref);
    if (!r || !r.src) {
      meta[fullKey] = { code: ref, key, status: (r?.status ?? 'pendiente'), sourceId: null, sourceUpdatedAt: null, value: null };
      values[fullKey] = null; displayByRef[ref] = ref; continue;
    }
    const src = r.src;
    const display = codeOf(src) || ref;
    displayByRef[ref] = display;
    const value = readCell(itemsByProto.get(src.id) ?? [], key);
    meta[fullKey] = { code: display, key, status: 'ok', sourceId: src.id, sourceUpdatedAt: src.updated_at ?? null, value };
    values[fullKey] = value;
  }
  return { values, meta, displayByRef };
}

export interface XrefStaleness { stale: boolean; reasons: string[]; }

/** Compara dos valores numéricos con tolerancia (evita falsos "cambió" por drift
 *  de punto flotante). null vs número = cambió; ambos null = igual. */
function valueChanged(a: number | null, b: number | null): boolean {
  if (a == null && b == null) return false;
  if ((a == null) !== (b == null)) return true;
  return Math.abs((a as number) - (b as number)) > 1e-9;
}

/** Compara el snapshot guardado (al enviar) vs una resolución FRESCA: detecta si
 *  alguna fuente cambió (valor/versión/estado) o si el correlativo ahora resuelve
 *  a otro id (reúso). Pure (sin I/O). */
export function compareXrefMeta(stored: Record<string, XrefMeta> | null | undefined, fresh: Record<string, XrefMeta>): XrefStaleness {
  if (!stored || Object.keys(stored).length === 0) return { stale: false, reasons: [] };
  const reasons: string[] = [];
  for (const k of Object.keys(stored)) {
    const s = stored[k]; const f = fresh[k];
    if (!f) continue;
    if (f.status !== s.status) reasons.push(`${k}: ${s.status}→${f.status}`);
    else if (f.sourceId !== s.sourceId) reasons.push(`${k}: fuente reemplazada`);
    // v42e (L7) — NO usar `sourceUpdatedAt` (timestamp del ENSAYO completo): una foto,
    // comentario o re-push en la fuente lo bumpea aunque la CELDA referenciada no cambie
    // → "desactualizado" falso. `valueChanged` ya detecta el cambio real del valor.
    else if (valueChanged(s.value, f.value)) reasons.push(`${k}: valor cambió`);
  }
  return { stale: reasons.length > 0, reasons };
}

/** Versión imperativa que devuelve SOLO los valores (para flujos no-React: PDF,
 *  freeze, resumen). Mantiene compatibilidad con los llamadores existentes. */
export async function fetchXrefValues(
  projectId: string,
  items: ScanItem[],
  expand: (raw: string) => string = (s) => s,
): Promise<XrefValues> {
  const { values } = await fetchXrefResolution(projectId, items, expand);
  return values;
}

/** Hook react-query para la vista en vivo (re-fetch en foco/intervalo). */
export function useXrefValues(projectId: string, items: ScanItem[], enabled = true) {
  const xrefs = useMemo(() => scanXrefsInItems(items), [items]);
  return useQuery({
    queryKey: ['xref-values', projectId, xrefs.map(x => `${x.externalId}.${x.key}`).sort().join(',')],
    queryFn: () => fetchXrefValues(projectId, items),
    enabled: enabled && !!projectId && xrefs.length > 0,
    staleTime: 30_000,
  });
}
