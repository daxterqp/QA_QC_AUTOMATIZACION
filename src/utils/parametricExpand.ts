// parametricExpand.ts (mobile mirror) — Plantillas paramétricas (FASE 5).
// Mirror exacto de flow-qaqc-web/lib/parametricExpand.ts. Mantener en sync.
//
// IMPORTANTE: Las directivas NUNCA se materializan en `protocol_items`. Tampoco
// las filas template originales. Solo las N expansiones quedan en la instancia.

export interface RepeatDirective {
  groupId: string;
  min: number;
  max: number;
  defaultN: number;
}

export interface TemplateItemForExpand {
  partida_item: string | null;
  item_description: string;
  validation_method: string | null;
  section: string | null;
}

const RE_DIRECTIVE_PARTIDA = /^__repeat_([A-Za-z][A-Za-z0-9_-]*)__$/;
const RE_TEMPLATE_PARTIDA  = /^__template_([A-Za-z][A-Za-z0-9_-]*)_(\d+)__$/;
const RE_REPEAT_METHOD     = /^repeat-\[\s*([A-Za-z][A-Za-z0-9_-]*)\s*:\s*(\d+)\s*:\s*(\d+)\s*:\s*(\d+)\s*\]$/i;

export function extractRepeatDirectives(items: TemplateItemForExpand[]): RepeatDirective[] {
  const byGroup = new Map<string, RepeatDirective>();
  for (const it of items) {
    const m = (it.validation_method ?? '').trim().match(RE_REPEAT_METHOD);
    if (!m) continue;
    const min = parseInt(m[2], 10), max = parseInt(m[3], 10), def = parseInt(m[4], 10);
    if (min < 1 || max < min) continue;
    byGroup.set(m[1], {
      groupId: m[1],
      min,
      max,
      defaultN: Math.min(Math.max(def, min), max),
    });
  }
  return Array.from(byGroup.values());
}

function rewriteRefRows(method: string | null, oldRow: number, newRow: number): string | null {
  if (!method) return method;
  return method.replace(/#(\d+)([A-Za-z]?)/g, (full, row, col) => {
    if (parseInt(row, 10) === oldRow) return `#${newRow}${col}`;
    return full;
  });
}

function findCrossOffsetRefs(method: string | null, currentOffset: number, groupOffsets: Set<number>): string[] {
  if (!method) return [];
  const out: string[] = [];
  const re = /#(\d+)([A-Za-z]?)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(method)) !== null) {
    const refRow = parseInt(m[1], 10);
    if (refRow !== currentOffset && groupOffsets.has(refRow)) out.push(m[0]);
  }
  return out;
}

export interface ExpandResult {
  items: TemplateItemForExpand[];
  expanded: boolean;
  warnings: string[];
}

export function expandTemplateItems(
  templateItems: TemplateItemForExpand[],
  choices: Record<string, number>,
): ExpandResult {
  const warnings: string[] = [];
  const directives = new Map<string, RepeatDirective>();
  for (const d of extractRepeatDirectives(templateItems)) directives.set(d.groupId, d);
  if (directives.size === 0) return { items: templateItems, expanded: false, warnings };

  type TmplRow = { item: TemplateItemForExpand; offset: number };
  const templateByGroup = new Map<string, TmplRow[]>();
  for (const it of templateItems) {
    const m = (it.partida_item ?? '').match(RE_TEMPLATE_PARTIDA);
    if (!m) continue;
    const gid = m[1];
    if (!directives.has(gid)) continue;
    const offset = parseInt(m[2], 10);
    if (!templateByGroup.has(gid)) templateByGroup.set(gid, []);
    templateByGroup.get(gid)!.push({ item: it, offset });
  }
  templateByGroup.forEach(arr => arr.sort((a, b) => a.offset - b.offset));

  const out: TemplateItemForExpand[] = [];
  let anyExpanded = false;

  for (const it of templateItems) {
    const partida = (it.partida_item ?? '').trim();
    const dirM = partida.match(RE_DIRECTIVE_PARTIDA);
    if (dirM && directives.has(dirM[1])) continue;

    const tplM = partida.match(RE_TEMPLATE_PARTIDA);
    if (tplM && directives.has(tplM[1])) {
      const gid = tplM[1];
      const offset = parseInt(tplM[2], 10);
      const group = templateByGroup.get(gid)!;
      if (group[0].offset !== offset) continue;

      const dir = directives.get(gid)!;
      const rawN = choices[gid] ?? dir.defaultN;
      const N = Math.min(Math.max(rawN, dir.min), dir.max);
      anyExpanded = true;

      const isMultiOffset = group.length > 1;
      let crossRefsWarned = false;
      const groupOffsets = new Set(group.map(g => g.offset));
      for (let n = 1; n <= N; n++) {
        for (const tmpl of group) {
          const desc = tmpl.item.item_description.replace(/\{\{n\}\}/g, String(n));
          let method = rewriteRefRows(tmpl.item.validation_method, tmpl.offset, n);
          if (isMultiOffset && method) {
            const cross = findCrossOffsetRefs(tmpl.item.validation_method, tmpl.offset, groupOffsets);
            if (cross.length > 0) {
              method = method.replace(/#(\d+)([A-Za-z]?)/g, (full, row, col) => {
                const rowN = parseInt(row, 10);
                if (rowN !== tmpl.offset && groupOffsets.has(rowN)) return `#999999${col}`;
                return full;
              });
              if (!crossRefsWarned) {
                warnings.push(
                  `Grupo "${gid}", offset ${tmpl.offset}: refs cruzadas (${cross.join(', ')}) no soportadas en multi-offset. Usa single-offset con multi-cell (//).`,
                );
                crossRefsWarned = true;
              }
            }
          }
          const partidaOut = isMultiOffset ? `${n}.${tmpl.offset}` : String(n);
          out.push({
            partida_item: partidaOut,
            item_description: desc,
            validation_method: method,
            section: tmpl.item.section,
          });
        }
      }
      continue;
    }

    out.push(it);
  }

  return { items: out, expanded: anyExpanded, warnings };
}
