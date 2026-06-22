/**
 * summaryColumns.ts (móvil) — espejo de flow-qaqc-web/lib/summaryColumns.ts.
 * Construye columnas ORDENADAS y con encabezados limpios/jerárquicos a partir de
 * la estructura de la ficha (items de la plantilla).
 */
import { parseNumericRow, groupIntoSections, colLetter } from '@utils/numericProtocol';
import type { SummaryColumn } from '@utils/summaryTable';

export interface TemplateItemLite {
  id: string;
  partida_item: string | null;
  item_description: string;
  validation_method: string | null;
  section?: string | null;
}

const isNumericKind = (k: string) => k === 'manual' || k === 'formula' || k === 'percent';

export function buildAutoColumns(items: TemplateItemLite[]): SummaryColumn[] {
  const parsed = items.map(it => ({ item: it, spec: parseNumericRow(it.validation_method) }));
  const sections = groupIntoSections(parsed as any);
  const cols: SummaryColumn[] = [];

  for (const sec of sections) {
    const colTitle = (i: number): string | null => {
      let title: string | null = null;
      for (const hr of sec.headerRows) for (const sp of hr.spans) if (i >= sp.from && i <= sp.to) title = sp.title;
      return title;
    };
    for (const row of sec.rows as { item: TemplateItemLite; spec: ReturnType<typeof parseNumericRow> }[]) {
      const spec = row.spec;
      if (!spec || spec.kind !== 'row') continue;
      const it = row.item;
      const partida = (it.partida_item ?? '').trim() || it.id;
      const activity = (it.item_description || partida).trim();
      const reportable = spec.cells
        .map((c, i) => ({ c, i }))
        .filter(({ c }) => !(c as { hidden?: boolean }).hidden && !(c as { noReport?: boolean }).noReport && c.kind !== 'blank');
      if (reportable.length === 0) continue;
      if (reportable.length === 1) {
        const { c, i } = reportable[0];
        cols.push({ key: `${partida}:${colLetter(i)}`, label: activity, from: `key:${partida}:${colLetter(i)}`, kind: isNumericKind(c.kind) ? 'number' : 'text', decimals: (c as { decimals?: number }).decimals });
      } else {
        for (const { c, i } of reportable) {
          const sub = colTitle(i) || colLetter(i);
          cols.push({ key: `${partida}:${colLetter(i)}`, label: sub, group: activity, from: `key:${partida}:${colLetter(i)}`, kind: isNumericKind(c.kind) ? 'number' : 'text', decimals: (c as { decimals?: number }).decimals });
        }
      }
    }
  }
  return cols;
}

/** Opciones para el eje Y del gráfico: "[Fila] - [Columna]" (evita duplicados). */
export function chartYOptions(cols: SummaryColumn[]): { key: string; label: string }[] {
  return cols.filter(c => c.kind === 'number').map(c => ({
    key: c.key,
    label: c.group ? `${c.group} - ${c.label}` : c.label,
  }));
}
