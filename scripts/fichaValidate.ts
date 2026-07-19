/**
 * fichaValidate — Validador HEADLESS de una ficha numérica (flujo v95 de
 * edición directa de fichas). Corre el MISMO motor de la app sin abrirla.
 *
 * Uso:
 *   npx tsx scripts/fichaValidate.ts <rows.json> [auxTables.json]
 *
 * rows.json — array ordenado de filas del template:
 *   [{ "partida_item": "1", "item_description": "...", "validation_method": "...", "section": "..." }, ...]
 * auxTables.json (opcional) — tablas auxiliares para BUSCAR/list-@:
 *   { "moldes": { "columns": ["Codigo","Peso"], "rows": [[1, 5350], ...] }, ... }
 *
 * Chequea:
 *   1. isNumericProtocol — la ficha entera parsea como numérica (si no, cae a Sí/No).
 *   2. validateProtocolSpec — refs inexistentes, partidas duplicadas, ciclos, gráficos.
 *   3. SMOKE TEST de cálculo: llena cada celda de ENTRADA con su :ej[] (o el punto
 *      medio del rango) y congela con buildFrozenComments → imprime los valores
 *      computados por fila y marca fórmulas que quedaron vacías (posible error).
 *
 * Exit code 0 = ficha OK; 1 = hay errores (NO subir/aplicar la edición).
 */
import * as fs from 'fs';
import { isNumericProtocol, parseNumericRow } from '../src/utils/numericProtocol';
import { validateProtocolSpec } from '../src/utils/protocolValidator';
import { buildFrozenComments } from '../src/utils/freezeSnapshot';

interface RowIn {
  partida_item: string | null;
  item_description?: string | null;
  validation_method: string | null;
  section?: string | null;
}

const file = process.argv[2];
if (!file) {
  console.error('Uso: npx tsx scripts/fichaValidate.ts <rows.json> [auxTables.json]');
  process.exit(1);
}
const rows: RowIn[] = JSON.parse(fs.readFileSync(file, 'utf8'));
const auxTables = process.argv[3]
  ? JSON.parse(fs.readFileSync(process.argv[3], 'utf8'))
  : undefined;

let failed = false;

// ── 1. ¿Numérica? ─────────────────────────────────────────────────────────────
const numeric = isNumericProtocol(rows.map(r => ({ validation_method: r.validation_method })));
console.log(`1) isNumericProtocol: ${numeric ? 'OK (numérica)' : 'FALLA — caería a Sí/No clásico'}`);
if (!numeric) {
  // Señalar la(s) fila(s) que no parsean.
  rows.forEach(r => {
    const vm = r.validation_method?.trim();
    if (!vm) return;
    const spec = parseNumericRow(vm);
    if (!spec) console.log(`   ✗ partida ${r.partida_item}: NO parsea → "${vm.slice(0, 80)}"`);
  });
  failed = true;
}

// ── 2. Validación estructural ─────────────────────────────────────────────────
const result = validateProtocolSpec(rows.map(r => ({
  partida_item: r.partida_item ?? null,
  item_description: r.item_description ?? '',
  validation_method: r.validation_method ?? null,
})) as never);
const issues = (result as { issues?: { severity?: string; level?: string; partida?: string | null; message: string }[] }).issues
  ?? (result as never as { severity?: string; partida?: string | null; message: string }[]);
const list = Array.isArray(issues) ? issues : [];
const errors = list.filter(i => (i.severity ?? (i as { level?: string }).level ?? 'error') === 'error');
const warns = list.filter(i => (i.severity ?? (i as { level?: string }).level) === 'warning');
console.log(`2) validateProtocolSpec: ${errors.length} error(es), ${warns.length} warning(s)`);
for (const i of list) {
  const sev = i.severity ?? (i as { level?: string }).level ?? '?';
  console.log(`   [${sev}] partida ${i.partida ?? '—'}: ${i.message}`);
}
if (errors.length > 0) failed = true;

// ── 3. Smoke test de cálculo (autofill :ej → congelar) ────────────────────────
const filled = rows.map((r, idx) => {
  const spec = r.validation_method ? parseNumericRow(r.validation_method) : null;
  let comments = '';
  if (spec && spec.kind === 'row') {
    const vals = spec.cells.map(c => {
      const anyC = c as { kind: string; sample?: string; range?: { min: number; max: number } | null; options?: string[] };
      if (anyC.kind === 'manual' || anyC.kind === 'percent' || anyC.kind === 'free') {
        if (anyC.sample != null) return String(anyC.sample);
        if (anyC.range) return String((anyC.range.min + anyC.range.max) / 2);
        return '1';
      }
      if (anyC.kind === 'list') return anyC.sample ?? (anyC.options?.[0] ?? '');
      if (anyC.kind === 'text') return anyC.sample ?? 'texto';
      if (anyC.kind === 'date') return '2026-01-15';
      if (anyC.kind === 'time') return '10:30';
      if (anyC.kind === 'bool') return 'Sí';
      return ''; // formula/lookup/xref/val → las llena el congelado
    });
    comments = vals.join(' // ');
  }
  return { id: String(idx), partidaItem: r.partida_item, validationMethod: r.validation_method, comments };
});

const frozen = buildFrozenComments(filled, auxTables, {});
console.log('3) Smoke test de cálculo (entradas = :ej o punto medio):');
let emptyFormulas = 0;
rows.forEach((r, idx) => {
  const spec = r.validation_method ? parseNumericRow(r.validation_method) : null;
  if (!spec || spec.kind !== 'row') return;
  const out = frozen.get(String(idx)) ?? filled[idx].comments;
  const cells = out.split('//').map(s => s.trim());
  const hasFormula = spec.cells.some(c => c.kind === 'formula' || c.kind === 'lookup');
  if (!hasFormula) return;
  const flags = spec.cells.map((c, i) => {
    if (c.kind !== 'formula' && c.kind !== 'lookup') return null;
    const v = cells[i] ?? '';
    if (v === '') { emptyFormulas++; return `col ${String.fromCharCode(65 + i)}: VACÍA`; }
    return `col ${String.fromCharCode(65 + i)}: ${v}`;
  }).filter(Boolean);
  console.log(`   partida ${r.partida_item} (${(r.item_description ?? '').slice(0, 40)}): ${flags.join(' · ')}`);
});
if (emptyFormulas > 0) {
  console.log(`   ⚠ ${emptyFormulas} celda(s) de fórmula/lookup quedaron VACÍAS (ref rota, BUSCAR sin tabla aux, o requiere xref).`);
  // No es fallo duro: lookups sin auxTables.json y xref legítimamente quedan vacíos.
}

console.log(failed ? '\nRESULTADO: ✗ NO APLICAR — corrige los errores.' : '\nRESULTADO: ✓ ficha válida.');
process.exit(failed ? 1 : 0);
