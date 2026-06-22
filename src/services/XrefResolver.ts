/**
 * XrefResolver (v42) — Resuelve los llamados entre ensayos `@<correlativo>.<celda>`
 * en MÓVIL, leyendo de la base LOCAL (WatermelonDB) → instantáneo y offline.
 *
 * Direccionamiento robusto (decisión del usuario):
 *   - El usuario escribe el CORRELATIVO (protocol_code), legible.
 *   - Internamente resolvemos a un ID PERMANENTE del ensayo (`protocols.id`, que
 *     nunca se reusa) y lo guardamos en el snapshot → habilita el DOBLE CHECK.
 *   - Solo se referencian ensayos APROBADOS del MISMO proyecto.
 *   - Doble check por correlativo: exactamente 1 aprobado → `ok`; 0 → `pendiente`;
 *     >1 (colisión por reúso del correlativo) → `ambiguo`. Nunca lanza; degrada.
 *
 * Devuelve `values` (para el motor `resolveScopeCells`) y `meta` (para el
 * snapshot `xref_snapshot_json` y los indicadores de frescura/doble check).
 */
import { Q } from '@nozbe/watermelondb';
import { protocolsCollection, protocolItemsCollection } from '@db/index';
import { extractXrefs, type XrefValues } from '@utils/formulaEval';
import { parseNumericRow, splitRowComments, scopeKeyFor, type XrefGetOp } from '@utils/numericProtocol';

/** v45.2 — celdas-clave de comparación que una op de `get` necesita además del targetKey. */
function opMatchKeys(op: XrefGetOp | undefined): string[] {
  if (!op) return [];
  if (op.kind === 'agg') return op.filter ? [op.filter.matchKey] : [];
  if (op.kind === 'pick') return op.matchKey ? [op.matchKey] : [];
  if (op.kind === 'interp') return [op.matchKey];
  return [];
}

export type XrefStatus = 'ok' | 'pendiente' | 'ambiguo';

export interface XrefMeta {
  code: string;            // correlativo escrito por el usuario
  key: string;             // celda destino, ej. "5F"
  status: XrefStatus;
  sourceId: string | null;       // id permanente del ensayo fuente (doble check)
  sourceUpdatedAt: number | null;
  value: number | null;
}

export interface XrefResolution {
  values: XrefValues;                  // { "code.key": number|null }
  meta: Record<string, XrefMeta>;      // { "code.key": XrefMeta }
}

interface ScanItem { validationMethod?: string | null; validation_method?: string | null; comments?: string | null; partidaItem?: string | null; partida_item?: string | null }

export interface XrefStaleness { stale: boolean; reasons: string[]; }

/** Compara dos valores numéricos con tolerancia (evita falsos "cambió" por drift
 *  de punto flotante, p.ej. 0.1+0.2). null vs número = cambió; ambos null = igual. */
function valueChanged(a: number | null, b: number | null): boolean {
  if (a == null && b == null) return false;
  if ((a == null) !== (b == null)) return true;
  return Math.abs((a as number) - (b as number)) > 1e-9;
}

/** Compara el snapshot guardado (al enviar) vs una resolución FRESCA: detecta si
 *  algún ensayo fuente cambió (valor/versión/estado) o si el doble check ahora
 *  resuelve a otro id (reúso del correlativo). Pure (sin I/O). */
export function compareXrefMeta(stored: Record<string, XrefMeta> | null | undefined, fresh: Record<string, XrefMeta>): XrefStaleness {
  if (!stored || Object.keys(stored).length === 0) return { stale: false, reasons: [] };
  const reasons: string[] = [];
  for (const k of Object.keys(stored)) {
    const s = stored[k]; const f = fresh[k];
    if (!f) continue; // la ref ya no está en la fórmula → ignora
    if (f.status !== s.status) reasons.push(`${k}: ${s.status}→${f.status}`);
    else if (f.sourceId !== s.sourceId) reasons.push(`${k}: fuente reemplazada`);
    // v42e (L7) — NO usar `sourceUpdatedAt` (timestamp del ENSAYO completo): una foto,
    // comentario o re-push en la fuente lo bumpea aunque la CELDA referenciada no cambie
    // → "desactualizado" falso. `valueChanged` ya detecta el cambio real del valor.
    else if (valueChanged(s.value, f.value)) reasons.push(`${k}: valor cambió`);
  }
  return { stale: reasons.length > 0, reasons };
}

/** Extrae todas las xrefs `@<code>.<key>`:
 *  (a) las declaradas en fórmulas `numerico-fx[...]` (estáticas, v26), y
 *  (b) v45 — las de celdas `xref`: `self` (código propio), `get` (código tomado de
 *      su celda selectora), y `select` (solo guarda el código; no emite ref). */
export function scanXrefs(items: ScanItem[]): { code: string; key: string }[] {
  const seen = new Set<string>();
  const out: { code: string; key: string }[] = [];
  const add = (code: string, key: string) => {
    const k = `${code}.${key}`;
    if (!seen.has(k)) { seen.add(k); out.push({ code, key }); }
  };
  const vmOf = (it: ScanItem) => ((it.validationMethod ?? it.validation_method) ?? '').trim();
  const partidaOf = (it: ScanItem) => ((it.partidaItem ?? it.partida_item) ?? '').trim();

  // Pass 1 — códigos de celdas SELECTORAS (select/self) por scope key.
  const codeByKey: Record<string, string> = {};
  for (const it of items) {
    const m = vmOf(it);
    if (!m || !m.toLowerCase().includes('xref')) continue;
    const row = parseNumericRow(m);
    if (row?.kind !== 'row') continue;
    const partida = partidaOf(it);
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
    const m = vmOf(it);
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

/** Lee el valor numérico de la celda `<row><col>` del ensayo fuente (de su
 *  `comments` congelado). Devuelve null si la fila/celda no existe o no es número. */
export async function readCellValue(sourceProtocolId: string, key: string): Promise<number | null> {
  const cellMatch = key.match(/^(\d+)([A-Z])$/);
  if (!cellMatch) return null;
  const partidaWanted = cellMatch[1];
  const colIdx = cellMatch[2].charCodeAt(0) - 65;
  const items: any[] = await protocolItemsCollection.query(Q.where('protocol_id', sourceProtocolId)).fetch();
  const item = items.find(it => (it.partidaItem ?? '').trim() === partidaWanted);
  if (!item) return null;
  const spec = parseNumericRow(item.validationMethod);
  const cellCount = spec?.kind === 'row' ? spec.cells.length : 1;
  const vals = splitRowComments(item.comments, cellCount);
  const raw = vals[colIdx] ?? '';
  if (raw === '') return null;
  const num = Number(String(raw).replace(',', '.'));
  return isFinite(num) ? num : null;
}

/**
 * Resuelve todas las xrefs de un ensayo contra la base local.
 * @param projectId proyecto del ensayo que hace los llamados (scope de la búsqueda).
 */
export async function resolveXrefs(projectId: string, items: ScanItem[]): Promise<XrefResolution> {
  const refs = scanXrefs(items);
  const values: XrefValues = {};
  const meta: Record<string, XrefMeta> = {};
  if (refs.length === 0) return { values, meta };

  const codes = Array.from(new Set(refs.map(r => r.code).filter(Boolean)));
  if (codes.length === 0) return { values, meta };

  // Consulta ACOTADA a los correlativos pedidos (rápido aunque el proyecto tenga
  // miles de aprobados): protocol_code OR external_id ∈ codes.
  const approved: any[] = await protocolsCollection
    .query(
      Q.where('project_id', projectId),
      Q.where('status', 'APPROVED'),
      Q.or(Q.where('protocol_code', Q.oneOf(codes)), Q.where('external_id', Q.oneOf(codes))),
    )
    .fetch()
    .catch(() => [] as any[]);

  // Doble check con PRECEDENCIA del correlativo (igual que web): primero agrupa
  // por protocol_code; external_id SOLO cubre correlativos que ningún código
  // reclamó (evita falsos "ambiguo" cuando un external_id coincide con el
  // protocol_code de otro ensayo).
  const byCode = new Map<string, any[]>();
  for (const p of approved) {
    const code = (p.protocolCode ?? '').trim();
    if (code) { if (!byCode.has(code)) byCode.set(code, []); byCode.get(code)!.push(p); }
  }
  for (const p of approved) {
    const ext = (p.externalId ?? '').trim();
    if (ext && !byCode.has(ext)) { byCode.set(ext, []); byCode.get(ext)!.push(p); }
  }

  for (const { code, key } of refs) {
    const fullKey = `${code}.${key}`;
    const matches = byCode.get(code) ?? [];
    if (matches.length === 0) {
      meta[fullKey] = { code, key, status: 'pendiente', sourceId: null, sourceUpdatedAt: null, value: null };
      values[fullKey] = null;
      continue;
    }
    if (matches.length > 1) {
      meta[fullKey] = { code, key, status: 'ambiguo', sourceId: null, sourceUpdatedAt: null, value: null };
      values[fullKey] = null;
      continue;
    }
    const src = matches[0];
    const value = await readCellValue(src.id, key).catch(() => null);
    meta[fullKey] = {
      code, key, status: 'ok',
      sourceId: src.id,
      sourceUpdatedAt: src.updatedAt instanceof Date ? src.updatedAt.getTime() : (src._raw?.updated_at ?? null),
      value,
    };
    values[fullKey] = value;
  }

  return { values, meta };
}
