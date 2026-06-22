// Tests del módulo CSV de ensayos (import wide + export). Solo web:
// importa los núcleos puros de flow-qaqc-web/lib por ruta relativa.
//   npx -y tsx scripts/csvEnsayosTests.ts
import {
  CSV_BOM, detectDelimiter, parseCsv, toCsv,
  parseWideHeader, wideRowToInstance, parseEnsayosCsv,
  generateCsvTemplate, parseFechaFlexible, splitFullName,
} from '../flow-qaqc-web/lib/csvEnsayos';
import {
  buildExportColumns, protocolToCsvRow, buildExportCsv, type ExportProtocolRow,
} from '../flow-qaqc-web/lib/csvExport';
import {
  buildTemplateContext, validateImport, assembleProtocolItems,
  type TemplateContext,
} from '../flow-qaqc-web/lib/historicalImport';

let passed = 0, failed = 0;
function ok(cond: boolean, name: string, detail?: string) {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`); }
}
function section(t: string) { console.log(`\n── ${t} ──`); }

// ─── Fixture: template numérico sintético ────────────────────────────────────
// 1: fecha | 2: peso A,B (manual dec1) | 3: suma fx :dec[2] | 4: oculto fx | 5: % | 6: bool
const mkItem = (id: string, partida: string | null, desc: string, method: string | null) =>
  ({ id, partida_item: partida, item_description: desc, validation_method: method, section: null });
const TPL: TemplateContext = buildTemplateContext(
  { id: 'tpl-1', id_protocolo: 'ENS-01', name: 'Ensayo de prueba' },
  [
    mkItem('i1', '1', 'Fecha de ensayo', 'fecha-[]'),
    mkItem('i2', '2', 'Peso húmedo (g)', 'numerico-[0:1000]:dec[1] // numerico-[0:1000]:dec[1]'),
    mkItem('i3', '3', 'Suma de pesos', 'numerico-fx[#2A+#2B]:[0:2000]:dec[2]'),
    mkItem('i4', '4', 'Interno', 'numerico-fx[#3A*2]:oculto'),
    mkItem('i5', '5', 'Humedad', 'porcentaje-[0:100]'),
    mkItem('i6', '6', '¿Cumple norma?', 'bool-[]'),
  ],
);

// ═══ 1. parseCsv / toCsv / detectDelimiter ═══════════════════════════════════
section('parseCsv / toCsv');
{
  ok(detectDelimiter('a;b;c') === ';', 'detecta ;');
  ok(detectDelimiter('a,b,c') === ',', 'detecta ,');
  ok(detectDelimiter('"x;y",a,b') === ',', 'ignora ; dentro de comillas');

  const es = parseCsv('id;peso\r\nE1;12,5\r\nE2;3,75\r\n');
  ok(es.delimiter === ';', 'CSV regional ES: delimitador ;');
  ok(es.rows.length === 3 && es.rows[1][1] === '12,5', 'coma decimal sobrevive el parseo', JSON.stringify(es.rows));

  const q = parseCsv('a,b\n"x, y","di""jo"\n"multi\nlinea",z\n');
  ok(q.rows[1][0] === 'x, y' && q.rows[1][1] === 'di"jo', 'comillas y "" escapadas');
  ok(q.rows[2][0] === 'multi\nlinea', 'salto de línea dentro de comillas');

  const bom = parseCsv('﻿a,b\n1,2\n');
  ok(bom.rows[0][0] === 'a', 'BOM inicial removido');

  const empty = parseCsv('a,b\n\n  \n1,2\n');
  ok(empty.rows.length === 2, 'filas vacías omitidas');

  const out = toCsv([['a', 'x, y'], ['di"jo', 'multi\nlinea']], ',');
  ok(out === 'a,"x, y"\r\n"di""jo","multi\nlinea"', 'toCsv quotea bien', JSON.stringify(out));
  ok(CSV_BOM === '﻿', 'CSV_BOM es U+FEFF');
}

// ═══ 2. parseWideHeader ══════════════════════════════════════════════════════
section('parseWideHeader');
{
  const h = parseWideHeader(
    ['external_id', 'Ubicación', 'fecha', 'llenado_por', '1A Fecha de ensayo', '2A Peso húmedo (g)', '2B Peso húmedo (g)', '3A Suma', '99Z Columna fantasma', 'notas'],
    TPL,
  );
  ok(h.errors.length === 0, 'sin errores', JSON.stringify(h.errors));
  ok(h.fixedIdx.external_id === 0 && h.fixedIdx.ubicacion === 1 && h.fixedIdx.fecha === 2, 'fijas mapeadas (con acento)');
  ok(h.cellCols.map(c => c.key).join(',') === '1A,2A,2B', 'celdas de entrada mapeadas (3A=fórmula NO)', JSON.stringify(h.cellCols.map(c => c.key)));
  ok(h.unknownHeaders.length === 3, 'fantasma + fórmula + notas → 3 desconocidas', JSON.stringify(h.unknownHeaders));

  const dup = parseWideHeader(['external_id', 'ubicacion', 'fecha', '2A x', '2A y'], TPL);
  ok(dup.errors.some(e => e.includes('duplicada')), 'clave duplicada → error');

  const missing = parseWideHeader(['ubicacion', '2A x'], TPL);
  ok(missing.errors.some(e => e.includes('external_id')) && missing.errors.some(e => e.includes('fecha')), 'fijas faltantes → errores');

  const noLetter = parseWideHeader(['external_id', 'ubicacion', 'fecha', '5 Humedad'], TPL);
  ok(noLetter.cellCols[0]?.key === '5A', 'token sin letra → columna A');
}

// ═══ 3. fechas y nombres ═════════════════════════════════════════════════════
section('parseFechaFlexible / splitFullName');
{
  const d = new Date(parseFechaFlexible('03/03/2026')!);
  ok(d.getDate() === 3 && d.getMonth() === 2 && d.getFullYear() === 2026, 'dd/mm/aaaa');
  ok(parseFechaFlexible('2026-03-03') != null, 'ISO');
  ok(parseFechaFlexible('32/13/2026') == null, 'fecha overflow → null');
  ok(parseFechaFlexible('') == null && parseFechaFlexible('ayer') == null, 'inválidas → null');

  ok(JSON.stringify(splitFullName('Juan Pérez Soto')) === JSON.stringify({ name: 'Juan', apellido: 'Pérez Soto' }), 'nombre + apellidos');
  ok(JSON.stringify(splitFullName('Juan')) === JSON.stringify({ name: 'Juan' }), 'solo nombre');
}

// ═══ 4. wideRowToInstance + parseEnsayosCsv ══════════════════════════════════
section('wideRowToInstance / parseEnsayosCsv');
{
  const csv = [
    'external_id,ubicacion,fecha,llenado_por,1A Fecha de ensayo,2A Peso,2B Peso,5A Humedad,6A Cumple',
    'E-001,Tramo 1,03/03/2026,Juan Pérez,03/03/2026,100,120,"12,5",Sí',
    'E-002,Tramo 1,04/03/2026,,04/03/2026,80,90,10,no',
    ',Tramo 1,05/03/2026,X,,,,,',
    'E-004,Tramo 1,fecha-mala,X,,,,,',
  ].join('\n');
  const r = parseEnsayosCsv(csv, TPL, { name: 'Admin', apellido: 'Default' });
  ok(r.instances.length === 2, '2 instancias válidas', JSON.stringify(r.errors));
  ok(r.errors.length === 2, 'external_id vacío + fecha mala → 2 errores de fila', JSON.stringify(r.errors));
  const e1 = r.instances[0];
  ok(e1.cells.some(c => c.partida_item === '2' && c.col === 'B' && c.value === '120'), 'celda 2B=120');
  ok(e1.cells.some(c => c.partida_item === '5' && c.value === '12,5'), 'coma decimal cruda en 5A');
  ok(e1.cells.some(c => c.partida_item === '6' && c.value === '1'), 'bool "Sí" → "1"');
  const e2 = r.instances[1];
  ok(e2.filled_by_name === 'Admin' && e2.signed_by_name === 'Admin', 'fallback al usuario actual');
  ok(e2.cells.some(c => c.partida_item === '6' && c.value === '0'), 'bool "no" → "0"');
  ok(r.warnings.some(w => w.reason.includes('usuario actual')), 'warning de fallback');

  // Variante regional ES completa (; + coma decimal)
  const csvEs = 'external_id;ubicacion;fecha;2A Peso;2B Peso\nE-010;Tramo 1;03/03/2026;100,5;200,25\n';
  const rEs = parseEnsayosCsv(csvEs, TPL, { name: 'A' });
  ok(rEs.instances.length === 1 && rEs.instances[0].cells.find(c => c.col === 'A' && c.partida_item === '2')?.value === '100,5',
    'CSV regional ES (;) parsea', JSON.stringify(rEs.errors));
}

// ═══ 5. Integración: CSV → validateImport → assembleProtocolItems ════════════
section('Integración import (snapshot de fórmulas)');
{
  const csv = 'external_id,ubicacion,fecha,1A f,2A p,2B p,5A h,6A c\nE-100,tramo 1,03/03/2026,03/03/2026,100,120,"12,5",1\n';
  const { instances } = parseEnsayosCsv(csv, TPL, { name: 'A' });
  const templates = new Map([[TPL.id_protocolo, TPL]]);
  const v = validateImport(instances, templates, new Set(['tramo 1']), new Set());
  ok(v.validInstances.length === 1, 'instancia válida', JSON.stringify(v.errors));

  const { items } = assembleProtocolItems(v.validInstances[0], TPL);
  const row3 = items.find(i => i.partida_item === '3');
  ok(row3?.comments === '220', 'fórmula #2A+#2B snapshoteada = 220', String(row3?.comments));
  const row4 = items.find(i => i.partida_item === '4');
  ok(row4?.comments === '440', 'fórmula oculta también computa = 440', String(row4?.comments));
  const row1 = items.find(i => i.partida_item === '1');
  ok(row1?.comments === '03/03/2026', 'fecha persiste (tipo v32)', String(row1?.comments));
  const row5 = items.find(i => i.partida_item === '5');
  ok(row5?.comments === '12,5' && row5?.has_answer === true, 'porcentaje persiste y cuenta como respondido');
  const row6 = items.find(i => i.partida_item === '6');
  ok(row6?.comments === '1', 'bool persiste como "1"');
  ok(items.every(i => i.partida_item !== '2' || i.is_compliant), 'fila 2 en rango → compliant');
}

// ═══ 6. Plantilla CSV (roundtrip) ════════════════════════════════════════════
section('generateCsvTemplate');
{
  const tpl = generateCsvTemplate(TPL);
  const { rows } = parseCsv(tpl);
  ok(rows.length === 2, 'header + fila ejemplo');
  const h = parseWideHeader(rows[0], TPL);
  ok(h.errors.length === 0 && h.unknownHeaders.length === 0,
    'roundtrip: la plantilla se re-parsea sin warnings', JSON.stringify({ e: h.errors, u: h.unknownHeaders }));
  ok(h.cellCols.map(c => c.key).join(',') === '1A,2A,2B,5A,6A', 'incluye SOLO celdas de entrada (sin fx ni oculta)',
    JSON.stringify(h.cellCols.map(c => c.key)));
}

// ═══ 7. Export ═══════════════════════════════════════════════════════════════
section('Export CSV');
{
  const cols = buildExportColumns(TPL);
  const keys = cols.filter(c => c.kind === 'cell').map(c => c.kind === 'cell' ? `${c.partida}${'ABC'[c.colIdx]}` : '');
  ok(!keys.includes('4A'), 'columna :oculto excluida', JSON.stringify(keys));
  ok(keys.join(',') === '1A,2A,2B,3A,5A,6A', 'orden del template, incluye fórmula visible', keys.join(','));

  // Con snapshot completo
  const p1: ExportProtocolRow = {
    external_id: 'E-100', protocol_number: 'Ensayo de prueba', location_name: 'Tramo 1',
    status: 'APPROVED', filled_at: Date.UTC(2026, 2, 3, 12), signed_at: Date.UTC(2026, 2, 4, 12),
    itemsByPartida: new Map([
      ['1', { comments: '03/03/2026' }],
      ['2', { comments: '100.04//120' }],
      ['3', { comments: '220.04' }],
      ['4', { comments: '440.08' }],
      ['5', { comments: '12.5' }],
      ['6', { comments: '1' }],
    ]),
  };
  const row = protocolToCsvRow(p1, TPL, cols);
  ok(row[0] === 'E-100' && row[4] === 'Aprobado', 'fijas: external_id + estado ES (con columna codigo)', JSON.stringify(row.slice(0, 7)));
  const cellVals = row.slice(7);
  ok(cellVals[1] === '100.0', ':dec[1] aplica a manual (100.04 → 100.0)', cellVals[1]);
  ok(cellVals[3] === '220.04', 'fórmula :dec[2] desde snapshot', cellVals[3]);
  ok(cellVals[5] === 'Sí', 'bool exporta Sí/No', cellVals[5]);

  // Sin snapshot de fórmula → recompute
  const p2: ExportProtocolRow = {
    ...p1, external_id: 'E-101',
    itemsByPartida: new Map([
      ['2', { comments: '100//120' }],
      ['3', { comments: '' }],
    ]),
  };
  const row2 = protocolToCsvRow(p2, TPL, cols);
  ok(row2[7 + 3] === '220.00', 'slot de fórmula vacío → recompute con :dec[2]', row2[7 + 3]);

  const csv = buildExportCsv(TPL, [p1, p2]);
  const reparsed = parseCsv(csv);
  ok(reparsed.rows.length === 3, 'CSV completo: header + 2 filas');
  ok(reparsed.rows[0][7] === '1A Fecha de ensayo', 'header clave+descripción', reparsed.rows[0][7]);
}

// ═══ 8. Bugs de la revisión adversarial (regresión) ══════════════════════════
section('Regresión: partidas con punto / "//" en valores / ISO local');
{
  // (a) Partidas con punto ("1.1") — el token del header debe matchear contra
  // las partidas REALES del template, no solo dígitos.
  const TPL2 = buildTemplateContext(
    { id: 'tpl-2', id_protocolo: 'ENS-02', name: 'Con subpartidas' },
    [
      mkItem('j1', '1.1', 'Espesor capa (cm)', 'numerico-[0:50] // numerico-[0:50]'),
      mkItem('j2', '2', 'Observación', 'comment-[Conforme,Observado]'),
    ],
  );
  const tpl2csv = generateCsvTemplate(TPL2);
  const h2 = parseWideHeader(parseCsv(tpl2csv).rows[0], TPL2);
  ok(h2.errors.length === 0 && h2.unknownHeaders.length === 0,
    'roundtrip de plantilla con partida "1.1"', JSON.stringify({ e: h2.errors, u: h2.unknownHeaders }));
  ok(h2.cellCols.map(c => c.key).join(',') === '1.1A,1.1B,2A',
    'claves 1.1A / 1.1B / 2A mapeadas', JSON.stringify(h2.cellCols.map(c => c.key)));

  // (b) Un valor de usuario que contenga "//" NO debe romper el alineamiento
  // posicional de joinRowComments (se colapsa a "/").
  const csv2 = 'external_id,ubicacion,fecha,1.1A e,1.1B e,2A obs\nE-200,Tramo 1,03/03/2026,10,20,Texto raro//con separador\n';
  const r2 = parseEnsayosCsv(csv2, TPL2, { name: 'A' });
  ok(r2.instances.length === 1, 'instancia con subpartida válida', JSON.stringify(r2.errors));
  const v2 = validateImport(r2.instances, new Map([[TPL2.id_protocolo, TPL2]]), new Set(['tramo 1']), new Set());
  const asm2 = assembleProtocolItems(v2.validInstances[0], TPL2);
  const obs = asm2.items.find(i => i.partida_item === '2');
  ok(obs?.comments === 'Texto raro/con separador', '"//" en el valor se colapsa a "/"', String(obs?.comments));
  const esp = asm2.items.find(i => i.partida_item === '1.1');
  ok(esp?.comments === '10//20', 'fila multi-celda de subpartida serializa posicional', String(esp?.comments));

  // (c) ISO solo-fecha → mediodía LOCAL (sin retroceso de día en husos UTC-).
  const iso = new Date(parseFechaFlexible('2026-03-03')!);
  ok(iso.getDate() === 3 && iso.getMonth() === 2 && iso.getFullYear() === 2026 && iso.getHours() === 12,
    'ISO solo-fecha queda a mediodía local (03/03/2026)', iso.toString());
  ok(parseFechaFlexible('2026-13-40') == null, 'ISO inválida → null');
  ok(parseFechaFlexible('2026-03-03T08:30:00Z') != null, 'ISO con hora sigue aceptada');
}

console.log(`\n════════════════════════════════════`);
console.log(`  ${passed} pasaron, ${failed} fallaron`);
if (failed > 0) process.exit(1);
console.log('  TODOS LOS TESTS PASARON ✓');
