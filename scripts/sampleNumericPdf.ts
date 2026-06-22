// Muestra visual del render de protocolos NUMÉRICOS para el PDF (Parte B).
// Llena PRO-103 y PRC-201 con datos realistas, construye los bloques con
// buildNumericProtocolBlocks + paginateNumericBlocks y escribe HTML para
// renderizarlo con Chrome headless (verificación visual del formato audit).
import * as path from 'path';
import * as fs from 'fs';
import { createRequire } from 'module';
import { parseNumericRow, colLetter, joinRowComments } from '../src/utils/numericProtocol';
import { buildNumericProtocolBlocks, paginateNumericBlocks, type NumericPdfItem } from '../src/utils/numericPdfHtml';

const req = createRequire(path.join(process.cwd(), 'flow-qaqc-web', 'package.json'));
const XLSX = req('xlsx');

const wb = XLSX.readFile(path.join('sample_numerico_v33', '01_protocolos_numericos_v35.xlsx'));
const rows: string[][] = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '' });
const header = rows[0].map(String);
const iSec = header.findIndex(h => /secci/i.test(h));

interface It { partida_item: string | null; item_description: string; validation_method: string | null; section: string | null }
const byProto = new Map<string, It[]>();
for (let i = 1; i < rows.length; i++) {
  const r = rows[i];
  if (!r[0]) continue;
  const arr = byProto.get(String(r[0])) ?? [];
  arr.push({
    partida_item: String(r[2] ?? '').trim() || null,
    item_description: String(r[3] ?? ''),
    validation_method: String(r[4] ?? '').trim() || null,
    section: iSec >= 0 ? (String(r[iSec] ?? '').trim() || null) : null,
  });
  byProto.set(String(r[0]), arr);
}

/** Serializa los valores de usuario a `comments` por fila (como la app). */
function fillItems(items: It[], vals: Record<string, string>): NumericPdfItem[] {
  return items.map((it, idx) => {
    const spec = parseNumericRow(it.validation_method);
    let comments: string | null = null;
    if (spec?.kind === 'row') {
      const partida = (it.partida_item ?? '').trim();
      const cellVals = spec.cells.map((_, i) => vals[`${partida}${colLetter(i)}`] ?? '');
      if (cellVals.some(v => v !== '')) comments = joinRowComments(cellVals);
    }
    return {
      id: `it-${idx}`,
      item_description: it.item_description,
      validation_method: it.validation_method,
      partida_item: it.partida_item,
      comments,
      section: it.section,
    };
  });
}

function renderProto(id: string, vals: Record<string, string>): string {
  const blocks = buildNumericProtocolBlocks(fillItems(byProto.get(id)!, vals));
  const pages = paginateNumericBlocks(blocks);
  console.log(`${id}: ${blocks.length} bloques → ${pages.length} páginas`);
  return pages.map((content, i) => `<div class="page"><div class="ph">${id} — página ${i + 1}/${pages.length}</div>${content}</div>`).join('\n');
}

// PRO-103: mismos datos que verifyNumericSample (curva con pico en 12%)
const valsPro: Record<string, string> = {};
[8, 10, 12, 14, 16].forEach((v, i) => { valsPro[`${i + 1}B`] = String(v); });
[2.009, 2.146, 2.24, 2.205, 2.123].forEach((v, i) => { valsPro[`${i + 1}C`] = String(v); });

// PRC-201: 4 puntos Proctor estilo Excel CV
const valsPrc: Record<string, string> = { '1A': '03/03/2026' };
[5905.2, 5998.5, 6080.8, 6051.1].forEach((v, i) => { valsPrc[`4${colLetter(i)}`] = String(v); });
[650.5, 680.2, 700.1, 690.3].forEach((v, i) => { valsPrc[`7${colLetter(i)}`] = String(v); });
[621.1, 643.5, 654.3, 638.2].forEach((v, i) => { valsPrc[`8${colLetter(i)}`] = String(v); });
[150.0, 152.0, 148.0, 151.0].forEach((v, i) => { valsPrc[`9${colLetter(i)}`] = String(v); });

const html = `<!doctype html><html><head><meta charset="utf-8"/><style>
body { font-family: Helvetica, Arial, sans-serif; background:#888; margin:0; }
.page { width: 210mm; min-height: 280mm; background: white; margin: 8px auto; padding: 24px 28px; box-sizing: border-box; }
.ph { font-size: 10px; color:#999; border-bottom: 1px solid #ccc; margin-bottom: 8px; padding-bottom: 2px; }
</style></head><body>
${renderProto('PRO-103', valsPro)}
${renderProto('PRC-201', valsPrc)}
</body></html>`;

const out = path.join('scripts', 'out', 'numericPdf.html');
fs.writeFileSync(out, html, 'utf-8');
console.log(`OK → ${out}`);
