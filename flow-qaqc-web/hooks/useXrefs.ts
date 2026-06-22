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
  values: XrefValues;               // { "code.key": number|null } para el motor
  meta: Record<string, XrefMeta>;   // { "code.key": XrefMeta }
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
export function scanXrefsInItems(items: ScanItem[]): XrefSpec[] {
  const seen = new Set<string>();
  const out: XrefSpec[] = [];
  const add = (externalId: string, key: string) => {
    const k = `${externalId}.${key}`;
    if (!seen.has(k)) { seen.add(k); out.push({ externalId, key }); }
  };

  // Pass 1 — códigos de celdas SELECTORAS (select/self) por scope key.
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
        const code = (vals[idx] ?? '').trim();
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
): Promise<XrefResolution> {
  const refs = scanXrefsInItems(items);
  if (refs.length === 0) return { values: {}, meta: {} };
  const codes = Array.from(new Set(refs.map(x => x.externalId)));

  const groups = new Map<string, { id: string; updated_at: number }[]>();
  const push = (codeKey: string, p: { id: string; updated_at: number }) => {
    if (!codeKey) return;
    if (!groups.has(codeKey)) groups.set(codeKey, []);
    groups.get(codeKey)!.push(p);
  };

  // Primario: por protocol_code (el correlativo).
  const { data: byCode } = await supabase
    .from('protocols')
    .select('id, protocol_code, external_id, updated_at')
    .eq('project_id', projectId)
    .eq('status', 'APPROVED')
    .in('protocol_code', codes);
  for (const p of (byCode ?? []) as any[]) push((p.protocol_code ?? '').trim(), { id: p.id, updated_at: p.updated_at ?? 0 });

  // Fallback histórico: external_id para los correlativos sin match por código.
  const unresolved = codes.filter(c => !groups.has(c));
  if (unresolved.length > 0) {
    const { data: byExt } = await supabase
      .from('protocols')
      .select('id, protocol_code, external_id, updated_at')
      .eq('project_id', projectId)
      .eq('status', 'APPROVED')
      .in('external_id', unresolved);
    for (const p of (byExt ?? []) as any[]) push((p.external_id ?? '').trim(), { id: p.id, updated_at: p.updated_at ?? 0 });
  }

  // Cargar items SOLO de las fuentes resueltas sin ambigüedad.
  const matchedIds = Array.from(groups.values()).filter(g => g.length === 1).map(g => g[0].id);
  const itemsByProto = new Map<string, any[]>();
  if (matchedIds.length > 0) {
    const { data: refItems } = await supabase
      .from('protocol_items')
      .select('protocol_id, partida_item, validation_method, comments')
      .in('protocol_id', matchedIds);
    for (const it of (refItems ?? []) as any[]) {
      if (!itemsByProto.has(it.protocol_id)) itemsByProto.set(it.protocol_id, []);
      itemsByProto.get(it.protocol_id)!.push(it);
    }
  }

  const values: XrefValues = {};
  const meta: Record<string, XrefMeta> = {};
  for (const { externalId: code, key } of refs) {
    const fullKey = `${code}.${key}`;
    const g = groups.get(code) ?? [];
    if (g.length === 0) { meta[fullKey] = { code, key, status: 'pendiente', sourceId: null, sourceUpdatedAt: null, value: null }; values[fullKey] = null; continue; }
    if (g.length > 1)  { meta[fullKey] = { code, key, status: 'ambiguo',   sourceId: null, sourceUpdatedAt: null, value: null }; values[fullKey] = null; continue; }
    const src = g[0];
    const value = readCell(itemsByProto.get(src.id) ?? [], key);
    meta[fullKey] = { code, key, status: 'ok', sourceId: src.id, sourceUpdatedAt: src.updated_at ?? null, value };
    values[fullKey] = value;
  }
  return { values, meta };
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
): Promise<XrefValues> {
  const { values } = await fetchXrefResolution(projectId, items);
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
