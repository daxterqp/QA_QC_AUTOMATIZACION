// parametricExpand.ts — Plantillas paramétricas (FASE 5).
//
// Una plantilla puede declarar uno o más bloques REPETIBLES:
//
//   PartidaItem            Método                                 Actividad
//   ─────────────────────  ─────────────────────────────────────  ─────────────────
//   __repeat_probetas__    repeat-[probetas:2:6:3]                (directiva)
//   __template_probetas_1__  numerico-[145:155]                   Probeta {{n}}
//   __template_probetas_2__  numerico-fx[#1A*0.005]:[0.5:1.5]     Densidad probeta {{n}}
//
// Cuando el usuario crea una instancia:
//   1) `extractRepeatDirectives` localiza cada directiva (groupId, min, max, default).
//   2) Un modal pide N por grupo (clampeado a [min, max]).
//   3) `expandTemplateItems` reemplaza el bloque de N filas template por N×K filas
//      reales (K = filas template del grupo), numeradas y con `{{n}}` resuelto.
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

/** Encuentra todas las directivas `repeat-[...]` declaradas en una plantilla.
 *  La fuente de verdad es el `validation_method` de la fila directiva; el
 *  partida_item `__repeat_<groupId>__` es solo un sentinel del importer.
 *  Devuelve directivas únicas por groupId — si el usuario duplicó la directiva,
 *  gana la última (las posteriores sobrescriben). */
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

/** Reescribe referencias `#<row><col>` dentro de una fórmula reemplazando
 *  `<row>=oldRow` por `<row>=newRow`. Mantiene el resto del expresión intacto.
 *  Esto permite que las plantillas escriban `#1A * 2` y al expandir la fila
 *  template offset=1 a la instancia N=3, la fórmula se convierta en `#3A * 2`. */
function rewriteRefRows(method: string | null, oldRow: number, newRow: number): string | null {
  if (!method) return method;
  return method.replace(/#(\d+)([A-Za-z]?)/g, (full, row, col) => {
    if (parseInt(row, 10) === oldRow) return `#${newRow}${col}`;
    return full;
  });
}

/** Detecta refs `#<row><col>` que apuntan a OTROS offsets del mismo grupo.
 *  Devuelve la lista de refs problemáticas (string completo del match).
 *  Útil para warning de multi-offset cross-ref (no soportado). */
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
  /** True si se ejecutó alguna expansión (al menos una directiva resuelta). */
  expanded: boolean;
  /** Warnings detectados durante la expansión. Vacío si todo OK.
   *  Casos típicos: multi-offset cross-ref (no soportado), refs a partidas inexistentes. */
  warnings: string[];
}

/** Expande los bloques paramétricos con las elecciones del usuario.
 *  - `choices[groupId] = N` (preset). Si falta, se usa `defaultN` de la directiva.
 *  - Filas directiva (`__repeat_<grupo>__`) se OMITEN del output.
 *  - Filas template (`__template_<grupo>_<offset>__`) se reemplazan por N filas
 *    con `{{n}}` resuelto en la descripción y refs `#<offset><col>` reescritas
 *    a `#<n><col>` para apuntar a la celda correcta tras expandir.
 *  - Cualquier otra fila pasa tal cual.
 *
 *  ## Modos
 *
 *  **Single-offset (recomendado)**: 1 fila template por grupo. Las partidas
 *  resultantes son planas: `"1"`, `"2"`, ..., `"N"`. Las fórmulas funcionan
 *  perfecto. Si necesitas varias celdas por instancia (peso, densidad, etc.),
 *  usa **multi-cell con `//`** dentro del mismo método:
 *  ```
 *  __template_probetas_1__   numerico-[145:155] // numerico-fx[#1A * 0.005]:[0.5:1.5]
 *  ```
 *
 *  **Multi-offset (LIMITACIÓN)**: K > 1 filas template por grupo. Las partidas
 *  son compuestas: `"1.1"`, `"1.2"`, `"2.1"`, `"2.2"`, ... Como el lexer del
 *  evaluador NO acepta partidas decimales, **las refs cruzadas entre filas
 *  template del mismo grupo NO funcionan** (`#1A` desde la fila offset=2 no
 *  resuelve a `#1.1A` después de expandir). El expandidor detecta este caso y
 *  emite un WARNING — la celda con la ref cruzada se renderiza con un sentinel
 *  inválido (`#999999<col>`) para que el usuario vea el error inline en vez de
 *  un valor aparentemente correcto pero incorrecto.
 *  Workaround: refactorizar a single-offset con multi-cell. */
export function expandTemplateItems(
  templateItems: TemplateItemForExpand[],
  choices: Record<string, number>,
): ExpandResult {
  const warnings: string[] = [];
  const directives = new Map<string, RepeatDirective>();
  for (const d of extractRepeatDirectives(templateItems)) directives.set(d.groupId, d);
  if (directives.size === 0) return { items: templateItems, expanded: false, warnings };

  // Agrupa filas template por groupId — preserva orden de aparición.
  type TmplRow = { item: TemplateItemForExpand; offset: number };
  const templateByGroup = new Map<string, TmplRow[]>();
  for (const it of templateItems) {
    const m = (it.partida_item ?? '').match(RE_TEMPLATE_PARTIDA);
    if (!m) continue;
    const gid = m[1];
    if (!directives.has(gid)) continue; // template sin directiva → ignorar (silencioso)
    const offset = parseInt(m[2], 10);
    if (!templateByGroup.has(gid)) templateByGroup.set(gid, []);
    templateByGroup.get(gid)!.push({ item: it, offset });
  }
  // Ordena por offset asc
  templateByGroup.forEach(arr => arr.sort((a, b) => a.offset - b.offset));

  const out: TemplateItemForExpand[] = [];
  let anyExpanded = false;

  for (const it of templateItems) {
    const partida = (it.partida_item ?? '').trim();
    const dirM = partida.match(RE_DIRECTIVE_PARTIDA);
    if (dirM && directives.has(dirM[1])) continue; // skip directive

    const tplM = partida.match(RE_TEMPLATE_PARTIDA);
    if (tplM && directives.has(tplM[1])) {
      // Skip template rows aquí — se procesan en bloque al ver la PRIMERA del grupo.
      const gid = tplM[1];
      const offset = parseInt(tplM[2], 10);
      const group = templateByGroup.get(gid)!;
      if (group[0].offset !== offset) continue; // solo emitir desde la primera

      const dir = directives.get(gid)!;
      const rawN = choices[gid] ?? dir.defaultN;
      const N = Math.min(Math.max(rawN, dir.min), dir.max);
      anyExpanded = true;

      const isMultiOffset = group.length > 1;
      // Detección de cross-offset refs (solo aplica en multi-offset; en single-offset
      // no hay "otros offsets" del mismo grupo). Una sola vez por grupo, no por instancia.
      let crossRefsWarned = false;
      const groupOffsets = new Set(group.map(g => g.offset));
      for (let n = 1; n <= N; n++) {
        for (const tmpl of group) {
          const desc = tmpl.item.item_description.replace(/\{\{n\}\}/g, String(n));
          let method = rewriteRefRows(tmpl.item.validation_method, tmpl.offset, n);
          if (isMultiOffset && method) {
            const cross = findCrossOffsetRefs(tmpl.item.validation_method, tmpl.offset, groupOffsets);
            if (cross.length > 0) {
              // Marcar las refs cruzadas con un sentinel inválido para que el usuario
              // vea el error claramente en la celda (en lugar de un valor silenciosamente
              // incorrecto). El sentinel #999999<col> nunca matchea una partida real.
              method = method.replace(/#(\d+)([A-Za-z]?)/g, (full, row, col) => {
                const rowN = parseInt(row, 10);
                if (rowN !== tmpl.offset && groupOffsets.has(rowN)) return `#999999${col}`;
                return full;
              });
              if (!crossRefsWarned) {
                warnings.push(
                  `Grupo "${gid}", fila template offset ${tmpl.offset}: referencias cruzadas a otros offsets del mismo grupo (${cross.join(', ')}) NO están soportadas en multi-offset. Refactoriza a single-offset con multi-cell (//). Las celdas afectadas mostrarán error inline.`,
                );
                crossRefsWarned = true;
              }
            }
          }
          const partidaOut = isMultiOffset
            ? `${n}.${tmpl.offset}`  // multi-offset: "1.1", "1.2", "2.1", "2.2", …
            : String(n);             // single-offset: "1".."N"
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

    // Fila normal → pasa tal cual
    out.push(it);
  }

  return { items: out, expanded: anyExpanded, warnings };
}
