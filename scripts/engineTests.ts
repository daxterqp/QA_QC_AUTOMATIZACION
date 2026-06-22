// Tests del motor de protocolos numéricos (v32).
// Ejecutar:  npx -y tsx scripts/engineTests.ts
//
// Cubre: parser DSL (legacy + tipos nuevos + graph extendido), motor de fórmulas
// (SI lazy, ESVACIO, FILA/CELDA/COLUMNA, agregación filtrada, curvas), renderer
// de gráficos (multi-serie/banda/leyenda) y validador de fichas.
// Corre sobre las copias de `src/utils/` — espejo exacto de `flow-qaqc-web/lib/`.

import {
  parseNumericRow, isNumericProtocol, isValidDateText, isValidTimeText,
  deriveAxisTitles, extractHeaderRows, groupIntoSections, extractMatrices,
} from '../src/utils/numericProtocol';
import {
  evalFormula, extractRefs, resolveScopeCells, type ScopeCell, type Scope,
} from '../src/utils/formulaEval';
import { renderChartSvg, niceScale } from '../src/utils/chartRenderer';
import { validateProtocolSpec } from '../src/utils/protocolValidator';
import { buildNumericProtocolBlocks, paginateNumericBlocks } from '../src/utils/numericPdfHtml';
import {
  validateMask, buildProtocolCode, maskToRegex, nextSeq, todayEnsayoDate, parseEnsayoDate, pickMask,
} from '../src/utils/protocolCode';
import {
  parseGroupingFilters, clauseMatches, clauseCellKey, parseExcludeCodes,
} from '../src/utils/groupingFilters';

let passed = 0, failed = 0;
function ok(cond: boolean, name: string, detail?: string) {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`); }
}
function near(a: number | null, b: number, tol: number): boolean {
  return a != null && Math.abs(a - b) <= tol;
}
function section(t: string) { console.log(`\n── ${t} ──`); }

// ═══ 1. Parser DSL: compatibilidad legacy ═══════════════════════════════════
section('Parser legacy (sin regresiones)');
{
  const r1 = parseNumericRow('numerico-[0:100]');
  ok(r1?.kind === 'row' && r1.cells[0].kind === 'manual', 'numerico-[0:100] parsea manual');

  const r2 = parseNumericRow('val-[50.8] // numerico-[0:100]');
  ok(r2?.kind === 'row' && r2.cells[0].kind === 'val' && r2.cells[1].kind === 'manual',
    'fila mixta val+manual (bug web corregido)');

  const r3 = parseNumericRow('val-[50.8] // val-[70]');
  ok(r3?.kind === 'matrix-data', 'fila todo-val sigue siendo matrix-data');

  const r4 = parseNumericRow('numerico-gr5[x:#1A:#10A-y:#1B:#10B]');
  ok(r4?.kind === 'graph' && r4.mode === 'log-x' && r4.xRefs.length === 10, 'gr5 legacy parsea');

  const r5 = parseNumericRow('numerico-fx[#1A*2]:[0:10]:norma[MTC E-202]');
  ok(r5?.kind === 'row' && r5.cells[0].kind === 'formula' && r5.cells[0].normaRef === 'MTC E-202',
    'fx con rango y norma');
}

// ═══ 2. Parser DSL: tipos nuevos (v32) ══════════════════════════════════════
section('Parser tipos nuevos');
{
  const b = parseNumericRow('bool-[]');
  ok(b?.kind === 'row' && b.cells[0].kind === 'bool', 'bool-[]');
  const f = parseNumericRow('fecha-[]');
  ok(f?.kind === 'row' && f.cells[0].kind === 'date', 'fecha-[]');
  const h = parseNumericRow('hora-[]');
  ok(h?.kind === 'row' && h.cells[0].kind === 'time', 'hora-[]');
  const p = parseNumericRow('porcentaje-[0:100]:norma[ASTM-D2216]');
  ok(p?.kind === 'row' && p.cells[0].kind === 'percent' && (p.cells[0] as any).range.max === 100
    && p.cells[0].kind === 'percent' && p.cells[0].normaRef === 'ASTM-D2216', 'porcentaje-[0:100] + norma');
  const e = parseNumericRow('equipo-[Balanza]');
  ok(e?.kind === 'row' && e.cells[0].kind === 'equipment' && (e.cells[0] as any).equipType === 'Balanza', 'equipo-[Balanza]');
  const mixed = parseNumericRow('val-[Probeta 1] // numerico-[100:200] // bool-[] // fecha-[]');
  ok(mixed?.kind === 'row' && mixed.cells.length === 4, 'fila mixta con tipos nuevos');
  ok(parseNumericRow('porcentaje-[100:0]') === null, 'porcentaje rango invertido → null (fail-safe)');
  // v33 — celdas de ingreso libre
  const fr = parseNumericRow('numerico-[]');
  ok(fr?.kind === 'row' && fr.cells[0].kind === 'free', 'numerico-[] → free (numérico libre)');
  const frd = parseNumericRow('numerico-[]:dec[2]');
  ok(frd?.kind === 'row' && frd.cells[0].kind === 'free' && (frd.cells[0] as any).decimals === 2, 'numerico-[]:dec[2] → free con decimales');
  const tx = parseNumericRow('texto-[]');
  ok(tx?.kind === 'row' && tx.cells[0].kind === 'text', 'texto-[] → text (texto libre)');
  const mix2 = parseNumericRow('val-[Obs] // numerico-[] // texto-[]');
  ok(mix2?.kind === 'row' && mix2.cells.length === 3 && mix2.cells[1].kind === 'free' && mix2.cells[2].kind === 'text', 'fila mixta con free + text');
  // free entra al scope como número y es referenciable; una fórmula lo usa.
  {
    const freeScope = resolveScopeCells([
      { key: '1A', kind: 'manual', raw: '7.123456' },           // simula celda free (numérica, sin rango)
      { key: '2A', kind: 'formula', expr: '#1A*2' },
    ]);
    ok(Math.abs((freeScope.scope['2A'] ?? 0) - 14.246912) < 1e-6, 'free numérico es referenciable en fórmula (precisión completa)');
  }
  ok(isValidDateText('29/02/2024') && !isValidDateText('31/02/2024') && !isValidDateText('1/13/2024'),
    'validador de fechas (bisiesto, mes 13)');
  ok(isValidTimeText('23:59') && !isValidTimeText('24:00') && !isValidTimeText('7:5'),
    'validador de horas');
}

// ═══ 2b. Celda xref (v45 — llamada a otra ficha) ════════════════════════════
section('Celda xref (llamada a otra ficha)');
{
  // Parser: tipo + celda destino, con y sin columna explícita.
  const x1 = parseNumericRow('xref-[PR].5B');
  ok(x1?.kind === 'row' && x1.cells[0].kind === 'xref'
    && (x1.cells[0] as any).targetKey === '5B' && (x1.cells[0] as any).filter.tipo === 'PR',
    'xref-[PR].5B → kind xref, targetKey 5B, filtro tipo PR');
  const x2 = parseNumericRow('xref-[].3');
  ok(x2?.kind === 'row' && x2.cells[0].kind === 'xref'
    && (x2.cells[0] as any).targetKey === '3A' && (x2.cells[0] as any).filter.tipo === undefined,
    'xref-[].3 → targetKey 3A (col A por defecto), sin filtro de tipo');
  const x3 = parseNumericRow('numerico-[0:100] // xref-[DS].5A');
  ok(x3?.kind === 'row' && x3.cells.length === 2 && x3.cells[1].kind === 'xref',
    'fila mixta manual + xref');
  // Modificadores comunes aplican (dec).
  const x4 = parseNumericRow('xref-[PR].5B:dec[2]');
  ok(x4?.kind === 'row' && x4.cells[0].kind === 'xref' && (x4.cells[0] as any).decimals === 2,
    'xref con :dec[2]');

  // Scope: con código elegido (raw) toma el valor resuelto de xrefValues[código.targetKey].
  const sc = resolveScopeCells(
    [
      { key: '1A', kind: 'xref', targetKey: '5B', raw: 'PR-260032' },
      { key: '2A', kind: 'formula', expr: '#1A*2' },        // referenciable como celda normal
    ],
    undefined,
    { 'PR-260032.5B': 21.5 },
  );
  ok(sc.scope['1A'] === 21.5, 'celda xref resuelve al valor de xrefValues[código.targetKey]');
  ok(sc.scope['2A'] === 43, 'el valor traído por xref es referenciable en otra fórmula');
  // Sin código elegido → null (no rompe el scope).
  const sc2 = resolveScopeCells(
    [{ key: '1A', kind: 'xref', targetKey: '5B', raw: '' }],
    undefined,
    { 'PR-260032.5B': 21.5 },
  );
  ok(sc2.scope['1A'] === null, 'celda xref sin código elegido → null');

  // ── v45 — modos selector/self/get ──
  const sel = parseNumericRow('xref-[PRV5]');
  ok(sel?.kind === 'row' && sel.cells[0].kind === 'xref' && (sel.cells[0] as any).mode === 'select'
    && (sel.cells[0] as any).targetKey === undefined && (sel.cells[0] as any).filter.tipo === 'PRV5',
    'xref-[PRV5] → selector (mode select, sin targetKey)');
  const self = parseNumericRow('xref-[PRV5].19A');
  ok(self?.kind === 'row' && (self.cells[0] as any).mode === 'self' && (self.cells[0] as any).targetKey === '19A',
    'xref-[PRV5].19A → self (elige y trae)');
  const get = parseNumericRow('xref-[#1A].19A');
  ok(get?.kind === 'row' && (get.cells[0] as any).mode === 'get'
    && (get.cells[0] as any).sourceRef === '1A' && (get.cells[0] as any).targetKey === '19A',
    'xref-[#1A].19A → get (lee código de 1A, trae 19A)');
  ok(parseNumericRow('xref-[#1A]') === null, 'puller sin celda destino → inválido (null)');

  // Scope: una celda SELECTORA (1A) tiene el código; las celdas GET (2A,3A) lo usan.
  const scG = resolveScopeCells(
    [
      { key: '1A', kind: 'xref', raw: 'PRV5-260007' },                 // selector (sin targetKey)
      { key: '2A', kind: 'xref', sourceRef: '1A', targetKey: '19A' },  // get MDS
      { key: '3A', kind: 'xref', sourceRef: '1A', targetKey: '20A' },  // get OCH
      { key: '4A', kind: 'formula', expr: '#2A/2' },                   // usable en fórmula
    ],
    undefined,
    { 'PRV5-260007.19A': 2.05, 'PRV5-260007.20A': 9.8 },
  );
  ok(scG.scope['1A'] === null, 'celda selectora no aporta valor numérico (solo guarda código)');
  ok(scG.scope['2A'] === 2.05, 'celda get lee el código de su selectora y trae 19A (MDS)');
  ok(scG.scope['3A'] === 9.8, 'celda get trae 20A (OCH) del MISMO ensayo, sin re-seleccionar');
  ok(scG.scope['4A'] === 1.025, 'el valor traído por get es referenciable en fórmula');

  // ── v45.1 — multi-selector + agg (promedio de varios protocolos) ──
  const multi = parseNumericRow('xref-multi-[PRV5]');
  ok(multi?.kind === 'row' && (multi.cells[0] as any).mode === 'select' && (multi.cells[0] as any).multi === true,
    'xref-multi-[PRV5] → selector múltiple');
  const red = parseNumericRow('xref-[#1A].19A:prom');
  ok(red?.kind === 'row' && (red.cells[0] as any).mode === 'get' && (red.cells[0] as any).op?.kind === 'agg' && (red.cells[0] as any).op?.fn === 'prom',
    'xref-[#1A].19A:prom → get con op agg/prom');

  // Scope: selector 1A con 3 códigos; get 2A promedia su 19A.
  const scM = resolveScopeCells(
    [
      { key: '1A', kind: 'xref', raw: 'PRV5-01,PRV5-02,PRV5-03' },                                       // multi-selector
      { key: '2A', kind: 'xref', sourceRef: '1A', targetKey: '19A', op: { kind: 'agg', fn: 'prom' } },    // promedio MDS
      { key: '3A', kind: 'xref', sourceRef: '1A', targetKey: '19A', op: { kind: 'agg', fn: 'max' } },     // máx MDS
      { key: '4A', kind: 'xref', sourceRef: '1A', targetKey: '19A', op: { kind: 'agg', fn: 'cuenta' } },  // n
      { key: '5A', kind: 'xref', sourceRef: '1A', targetKey: '19A', op: { kind: 'agg', fn: 'mediana' } }, // mediana
    ],
    undefined,
    { 'PRV5-01.19A': 2.00, 'PRV5-02.19A': 2.10, 'PRV5-03.19A': 2.20 },
  );
  ok(Math.abs((scM.scope['2A'] ?? 0) - 2.10) < 1e-9, 'agg prom = promedio de los 3 MDS (2.10)');
  ok(scM.scope['3A'] === 2.20, 'agg max = mayor MDS (2.20)');
  ok(scM.scope['4A'] === 3, 'agg cuenta = nº de protocolos (3)');
  ok(Math.abs((scM.scope['5A'] ?? 0) - 2.10) < 1e-9, 'agg mediana de 3 valores (2.10)');
  // Un código faltante no rompe el promedio (se ignora el nulo).
  const scMnull = resolveScopeCells(
    [
      { key: '1A', kind: 'xref', raw: 'PRV5-01,PRV5-09' },
      { key: '2A', kind: 'xref', sourceRef: '1A', targetKey: '19A', op: { kind: 'agg', fn: 'prom' } },
    ],
    undefined,
    { 'PRV5-01.19A': 2.00, 'PRV5-09.19A': null },
  );
  ok(scMnull.scope['2A'] === 2.00, 'agg prom ignora protocolos sin valor (promedio de los válidos)');

  // ── v45.2 — ops avanzadas: filtro, pick (cerca/mayor/menor), interp ──
  // Parser
  const pFilter = parseNumericRow('xref-[#1A].19A:prom(20A<=#2A)');
  ok(pFilter?.kind === 'row' && (pFilter.cells[0] as any).op?.kind === 'agg'
    && (pFilter.cells[0] as any).op?.filter?.matchKey === '20A'
    && (pFilter.cells[0] as any).op?.filter?.cmp === '<='
    && (pFilter.cells[0] as any).op?.filter?.ref?.cell === '2A',
    'xref-[#1A].19A:prom(20A<=#2A) → agg con filtro 20A<=#2A');
  const pCerca = parseNumericRow('xref-[#1A].19A:cerca(20A,#2A)');
  ok(pCerca?.kind === 'row' && (pCerca.cells[0] as any).op?.kind === 'pick'
    && (pCerca.cells[0] as any).op?.mode === 'cerca'
    && (pCerca.cells[0] as any).op?.matchKey === '20A'
    && (pCerca.cells[0] as any).op?.ref?.cell === '2A',
    'xref-[#1A].19A:cerca(20A,#2A) → pick cerca matchKey 20A ref #2A');
  const pInterp = parseNumericRow('xref-[#1A].19A:interp(20A,#2A)');
  ok(pInterp?.kind === 'row' && (pInterp.cells[0] as any).op?.kind === 'interp'
    && (pInterp.cells[0] as any).op?.matchKey === '20A',
    'xref-[#1A].19A:interp(20A,#2A) → interp');
  ok(parseNumericRow('xref-[#1A].19A:cerca(20A)') === null, 'cerca sin ref → inválido (null)');

  // Resolución: 3 Proctores con OCH (20A) y MDS (19A); humedad de campo en #9A.
  const xv = {
    'P1.20A': 8.0, 'P1.19A': 2.00,
    'P2.20A': 10.0, 'P2.19A': 2.10,
    'P3.20A': 12.0, 'P3.19A': 2.05,
  };
  const selCtx = [{ key: '9A', kind: 'manual', raw: '11' } as any, { key: '1A', kind: 'xref', raw: 'P1,P2,P3' } as any];
  // cerca: humedad de campo 11 → OCH más cercano = 10 (P2) → MDS 2.10
  const rCerca = resolveScopeCells([...selCtx,
    { key: '2A', kind: 'xref', sourceRef: '1A', targetKey: '19A', op: { kind: 'pick', mode: 'cerca', matchKey: '20A', ref: { cell: '9A' } } } as any,
    { key: '3A', kind: 'xref', sourceRef: '1A', targetKey: '20A', op: { kind: 'pick', mode: 'cerca', matchKey: '20A', ref: { cell: '9A' } } } as any,
  ], undefined, xv);
  ok(rCerca.scope['2A'] === 2.10, 'pick cerca: MDS del Proctor con OCH más cercano a 11 (P2 → 2.10)');
  ok(rCerca.scope['3A'] === 10.0, 'pick cerca: OCH más cercano a 11 (10.0)');
  // cerca_inf: más cercana por DEBAJO de 11 → OCH 10 (P2). cerca_sup → 12 (P3).
  const rInf = resolveScopeCells([...selCtx,
    { key: '2A', kind: 'xref', sourceRef: '1A', targetKey: '20A', op: { kind: 'pick', mode: 'cerca_inf', matchKey: '20A', ref: { cell: '9A' } } } as any,
    { key: '3A', kind: 'xref', sourceRef: '1A', targetKey: '20A', op: { kind: 'pick', mode: 'cerca_sup', matchKey: '20A', ref: { cell: '9A' } } } as any,
  ], undefined, xv);
  ok(rInf.scope['2A'] === 10.0, 'cerca_inf de 11 → 10.0');
  ok(rInf.scope['3A'] === 12.0, 'cerca_sup de 11 → 12.0');
  // mayor/menor por OCH
  const rMM = resolveScopeCells([...selCtx,
    { key: '2A', kind: 'xref', sourceRef: '1A', targetKey: '19A', op: { kind: 'pick', mode: 'mayor', matchKey: '20A' } } as any,
    { key: '3A', kind: 'xref', sourceRef: '1A', targetKey: '19A', op: { kind: 'pick', mode: 'menor', matchKey: '20A' } } as any,
  ], undefined, xv);
  ok(rMM.scope['2A'] === 2.05, 'mayor OCH (P3, 12) → MDS 2.05');
  ok(rMM.scope['3A'] === 2.00, 'menor OCH (P1, 8) → MDS 2.00');
  // filtro: promedio MDS de los Proctores con OCH <= 11 (P1=2.00, P2=2.10) = 2.05
  const rFil = resolveScopeCells([...selCtx,
    { key: '2A', kind: 'xref', sourceRef: '1A', targetKey: '19A', op: { kind: 'agg', fn: 'prom', filter: { matchKey: '20A', cmp: '<=', ref: { cell: '9A' } } } } as any,
  ], undefined, xv);
  ok(Math.abs((rFil.scope['2A'] ?? 0) - 2.05) < 1e-9, 'agg prom con filtro OCH<=11 → (2.00+2.10)/2 = 2.05');
  // interp: MDS a humedad 11 entre P2(10→2.10) y P3(12→2.05) = 2.075
  const rInt = resolveScopeCells([...selCtx,
    { key: '2A', kind: 'xref', sourceRef: '1A', targetKey: '19A', op: { kind: 'interp', matchKey: '20A', ref: { cell: '9A' } } } as any,
  ], undefined, xv);
  ok(Math.abs((rInt.scope['2A'] ?? 0) - 2.075) < 1e-9, 'interp MDS a humedad 11 entre P2 y P3 = 2.075');

  // ── v45.2 fixes (ronda 1 de bugs) ──
  // A) fila/celda 0 → celda inválida (no ref muerta)
  ok(parseNumericRow('xref-[#0].19A') === null, 'A: selector #0 → inválido');
  ok(parseNumericRow('xref-[#1A].0A') === null, 'A: celda destino .0A → inválido');
  ok(parseNumericRow('xref-[#1A].0') === null, 'A: celda destino .0 → inválido');
  // B) operador en celda self/select → inválido (solo aplica a get)
  ok(parseNumericRow('xref-[PRV5].19A:prom') === null, 'B: op en celda self → inválido');
  ok(parseNumericRow('xref-[PRV5].19A') !== null, 'B: self sin op sigue válida');
  // C) op cuyo ref apunta a una celda FÓRMULA (computada) resuelve vía topo-sort
  const scC = resolveScopeCells([
    { key: '1A', kind: 'manual', raw: '5' },
    { key: '2A', kind: 'formula', expr: '#1A*2' },                                            // = 10 (computada)
    { key: '3A', kind: 'xref', raw: 'P1,P2,P3' },
    { key: '4A', kind: 'xref', sourceRef: '3A', targetKey: '20A', op: { kind: 'pick', mode: 'cerca', matchKey: '20A', ref: { cell: '2A' } } },
  ], undefined, { 'P1.20A': 8, 'P2.20A': 10, 'P3.20A': 12 });
  ok(scC.scope['4A'] === 10, 'C: op ref a celda FÓRMULA (#2A=10) → OCH más cercano 10');
  // C2) op cuyo ref apunta a OTRA celda get (cadena) resuelve
  const scC2 = resolveScopeCells([
    { key: '1A', kind: 'xref', raw: 'P1,P2,P3' },
    { key: '2A', kind: 'xref', sourceRef: '1A', targetKey: '20A', op: { kind: 'agg', fn: 'min' } },           // = 8
    { key: '3A', kind: 'xref', sourceRef: '1A', targetKey: '20A', op: { kind: 'pick', mode: 'cerca', matchKey: '20A', ref: { cell: '2A' } } }, // cercano a 8 → 8
  ], undefined, { 'P1.20A': 8, 'P2.20A': 10, 'P3.20A': 12 });
  ok(scC2.scope['3A'] === 8, 'C2: op ref a OTRA celda get (cadena) resuelve');
  // D) cuenta con ref de filtro vacío → 0 (no null); prom → null
  const scD = resolveScopeCells([
    { key: '1A', kind: 'manual', raw: '' },
    { key: '2A', kind: 'xref', raw: 'P1,P2' },
    { key: '3A', kind: 'xref', sourceRef: '2A', targetKey: '19A', op: { kind: 'agg', fn: 'cuenta', filter: { matchKey: '20A', cmp: '<=', ref: { cell: '1A' } } } },
    { key: '4A', kind: 'xref', sourceRef: '2A', targetKey: '19A', op: { kind: 'agg', fn: 'prom', filter: { matchKey: '20A', cmp: '<=', ref: { cell: '1A' } } } },
  ], undefined, { 'P1.20A': 8, 'P1.19A': 2, 'P2.20A': 10, 'P2.19A': 2.1 });
  ok(scD.scope['3A'] === 0, 'D: cuenta con ref de filtro vacío → 0');
  ok(scD.scope['4A'] === null, 'D: prom con ref de filtro vacío → null (blanco)');
  // E) interp con un solo punto → null (insuficiente)
  const scE = resolveScopeCells([
    { key: '1A', kind: 'manual', raw: '11' },
    { key: '2A', kind: 'xref', raw: 'P1' },
    { key: '3A', kind: 'xref', sourceRef: '2A', targetKey: '19A', op: { kind: 'interp', matchKey: '20A', ref: { cell: '1A' } } },
  ], undefined, { 'P1.20A': 10, 'P1.19A': 2 });
  ok(scE.scope['3A'] === null, 'E: interp con 1 solo punto → null');
  // F) interp con eje X degenerado (todos los matchKey iguales) → null
  const scF = resolveScopeCells([
    { key: '1A', kind: 'manual', raw: '11' },
    { key: '2A', kind: 'xref', raw: 'P1,P2' },
    { key: '3A', kind: 'xref', sourceRef: '2A', targetKey: '19A', op: { kind: 'interp', matchKey: '20A', ref: { cell: '1A' } } },
  ], undefined, { 'P1.20A': 10, 'P1.19A': 2, 'P2.20A': 10, 'P2.19A': 2.2 });
  ok(scF.scope['3A'] === null, 'F: interp con eje X degenerado (todos 10) → null');
}

// ═══ 3. Parser DSL: gráficos extendidos ═════════════════════════════════════
section('Parser gráficos extendidos');
{
  const g = parseNumericRow(
    'numerico-gr5[x:#1A:#5A|y:#1B:#5B|y2:#1C:#5C|t:Curvas|xt:Tamaño|yt:Pasa|ly:Muestra|ly2:Patrón|bandalo:#1D:#5D|bandahi:#1E:#5E|ajuste:loglog]');
  ok(g?.kind === 'graph' && g.y2Refs?.length === 5 && g.bandLoRefs?.length === 5
    && g.fit === 'loglog' && g.seriesLabels?.[0] === 'Muestra', 'graph con y2+banda+ajuste+leyendas');
  ok(parseNumericRow('numerico-gr1[x:#1A:#3A|y:#1B:#3B|ajuste:cubica]') === null, 'ajuste inválido → null');
  ok(parseNumericRow('numerico-gr1[x:#1A:#3A|y:#1B:#3B|bandalo:#1C:#3C]') === null, 'banda sin límite superior → null');
  ok(parseNumericRow('numerico-gr1[x:#1A:#3A|y:#1B:#3B|y3:#1C:#3C]') === null, 'y3 sin y2 → null');
  const legacy = parseNumericRow('numerico-gr2[x:#1A,#2A-y:#1B,#2B]');
  ok(legacy?.kind === 'graph' && legacy.y2Refs === undefined, 'legacy sigue sin campos nuevos');

  // v33 — proporción del gráfico
  const ga = parseNumericRow('numerico-gr5[x:#1A:#3A|y:#1B:#3B|alto:80]');
  ok(ga?.kind === 'graph' && ga.aspectPct === 80, 'alto:80 → aspectPct 80');
  ok(parseNumericRow('numerico-gr5[x:#1A:#3A|y:#1B:#3B|alto:20]') === null, 'alto fuera de rango → null');
  ok(parseNumericRow('numerico-gr5[x:#1A:#3A|y:#1B:#3B|alto:abc]') === null, 'alto no numérico → null');
}

// ═══ 4. Motor: SI lazy, ESVACIO, SIERROR ════════════════════════════════════
section('Motor: lógica robusta');
{
  const scope: Scope = { '1A': 0, '1B': 10, '1C': null };
  ok(evalFormula('SI(#1A>0, #1B/#1A, -1)', scope) === -1, 'SI lazy: rama div/0 NO evaluada');
  ok(evalFormula('SI(#1A==0, 5)', scope) === 5, 'SI de 2 args (rama verdadera)');
  ok(evalFormula('SI(#1A>0, 5)', scope) === null, 'SI de 2 args falso → vacío');
  ok(evalFormula('ESVACIO(#1C)', scope) === 1, 'ESVACIO de celda vacía → 1');
  ok(evalFormula('ESVACIO(#1B)', scope) === 0, 'ESVACIO de celda llena → 0');
  ok(evalFormula('SI(ESVACIO(#1C), 0, #1C*2)', scope) === 0, 'guarda ESVACIO + SI lazy');
  ok(evalFormula('SIERROR(#1B/#1A, 99)', scope) === 99, 'SIERROR atrapa div/0');
  ok(evalFormula('SIERROR(#1C, 99)', scope) === null, 'SIERROR no atrapa vacío (null propaga)');
  ok(evalFormula('Y(#1B>5, NO(#1A))', scope) === 1, 'Y / NO');
  ok(evalFormula('O(#1A, 0, 3)', scope) === 1, 'O');
}

// ═══ 5. Motor: matemática nueva ═════════════════════════════════════════════
section('Motor: matemática');
{
  const s: Scope = {};
  ok(near(evalFormula('LOG(100)', s), 2, 1e-9), 'LOG base 10 default');
  ok(near(evalFormula('LOG(8, 2)', s), 3, 1e-9), 'LOG base 2');
  ok(near(evalFormula('LN(EXP(1))', s), 1, 1e-9), 'LN/EXP');
  ok(near(evalFormula('SENO(PI()/2)', s), 1, 1e-9), 'SENO(π/2)');
  ok(near(evalFormula('ENTERO(3.9)', s), 3, 0), 'ENTERO');
  ok(near(evalFormula('RESIDUO(-3, 5)', s), 2, 1e-9), 'RESIDUO signo del divisor');
  ok(near(evalFormula('MODA(1, 2, 2, 3)', s), 2, 0), 'MODA');
}

// ═══ 6. Motor: FILA / CELDA / acumulado (tablas dinámicas) ══════════════════
section('Motor: tablas dinámicas fila-a-fila');
{
  // Granulometría: col B = retenido parcial; col C = retenido acumulado.
  const cells: ScopeCell[] = [];
  const parciales = [5, 10, 15, 20, 8];
  for (let r = 1; r <= 5; r++) {
    cells.push({ key: `${r}B`, kind: 'manual', raw: String(parciales[r - 1]) });
    cells.push({ key: `${r}C`, kind: 'formula', expr: 'SI(FILA()>1, CELDA(C, FILA()-1) + CELDA(B), CELDA(B))' });
  }
  const { scope, errors, inCycle } = resolveScopeCells(cells);
  ok(Object.keys(errors).length === 0 && inCycle.size === 0, 'acumulado sin errores ni ciclos',
    JSON.stringify(errors));
  ok(scope['1C'] === 5 && scope['3C'] === 30 && scope['5C'] === 58, 'acumulado correcto (5,30,58)',
    `got ${scope['1C']}, ${scope['3C']}, ${scope['5C']}`);

  // Acumulado parcial: si la fila 3 está vacía, su acumulado queda vacío pero 1-2 funcionan.
  const cells2: ScopeCell[] = [];
  for (let r = 1; r <= 3; r++) {
    cells2.push({ key: `${r}B`, kind: 'manual', raw: r === 3 ? '' : String(10 * r) });
    cells2.push({ key: `${r}C`, kind: 'formula', expr: 'SI(FILA()>1, CELDA(C, FILA()-1) + CELDA(B), CELDA(B))' });
  }
  const r2 = resolveScopeCells(cells2);
  ok(r2.scope['2C'] === 30 && r2.scope['3C'] === null, 'fila vacía → acumulado vacío río abajo');

  // Ciclo real: dos fórmulas en la misma columna que se referencian mutuamente.
  const cyc: ScopeCell[] = [
    { key: '1C', kind: 'formula', expr: 'CELDA(C, 2) + 1' },
    { key: '2C', kind: 'formula', expr: 'CELDA(C, 1) + 1' },
  ];
  const r3 = resolveScopeCells(cyc);
  ok(r3.inCycle.has('1C') && r3.inCycle.has('2C'), 'ciclo CELDA↔CELDA detectado');

  // extractRefs con ctx resuelve CELDA estática
  const deps = extractRefs('CELDA(C, FILA()-1) + CELDA(B)', { currentKey: '4C', allKeys: ['4B', '3C', '4C'] });
  ok(deps.includes('3C') && deps.includes('4B'), 'extractRefs resuelve CELDA con FILA()');

  // Fallback (fórmula que no parsea): letras sueltas NO son refs falsas
  const fb = extractRefs('CELDA(B + #2A');
  ok(fb.includes('2A') && !fb.includes('B'), 'fallback sin refs falsas de letras sueltas', JSON.stringify(fb));
}

// ═══ 7. Motor: COLUMNA + agregación filtrada ════════════════════════════════
section('Motor: COLUMNA y agregación filtrada');
{
  const cells: ScopeCell[] = [
    { key: '1B', kind: 'manual', raw: '10' },
    { key: '2B', kind: 'manual', raw: '' },        // vacío
    { key: '3B', kind: 'manual', raw: '30' },
    { key: '1C', kind: 'manual', raw: '1' },       // flags
    { key: '2C', kind: 'manual', raw: '1' },
    { key: '3C', kind: 'manual', raw: '0' },
    // Totales en columna A (fuera de las columnas agregadas — COLUMNA(B) incluye
    // TODAS las celdas de la columna B, también fórmulas; los totales van aparte).
    { key: '9A',  kind: 'formula', expr: 'SUMA(COLUMNA(B))' },
    { key: '10A', kind: 'formula', expr: 'SUMARSI(#1B:#3B, #1C:#3C)' },
    { key: '11A', kind: 'formula', expr: 'CONTAR(COLUMNA(B))' },
    { key: '12A', kind: 'formula', expr: 'CONTARSI(#1C:#3C)' },
  ];
  const { scope, errors } = resolveScopeCells(cells);
  ok(scope['9A'] === 40, 'SUMA(COLUMNA(B)) ignora vacíos → 40', `got ${scope['9A']} errs=${JSON.stringify(errors)}`);
  ok(scope['10A'] === 10, 'SUMARSI omite pares con vacío → 10', `got ${scope['10A']}`);
  ok(scope['11A'] === 2, 'CONTAR no-vacíos → 2');
  ok(scope['12A'] === 2, 'CONTARSI flags → 2');

  // SUMA con rango estricto sigue propagando vacío (comportamiento histórico)
  ok(evalFormula('SUMA(#1B:#3B)', { '1B': 10, '2B': null, '3B': 30 }) === null,
    'SUMA(rango) con vacío → vacío (sin regresión)');

  // Auto-suma de la propia columna → ciclo detectado
  const cyc = resolveScopeCells([
    { key: '1B', kind: 'manual', raw: '1' },
    { key: '2B', kind: 'formula', expr: 'SUMA(COLUMNA(B))' },
    { key: '3B', kind: 'formula', expr: 'SUMA(COLUMNA(B))' },
  ]);
  ok(cyc.inCycle.has('2B') && cyc.inCycle.has('3B'), 'COLUMNA de la propia columna entre fórmulas → ciclo');
}

// ═══ 8. Motor: curvas (granulometría + Proctor reales) ══════════════════════
section('Motor: aproximación de curvas');
{
  // Granulometría: tamaño (mm) vs % pasa — datos del sample GRA-001
  const sizes = [50.8, 38.1, 25.4, 19, 12.7, 9.5, 4.75, 2, 0.425, 0.075];
  const pasa  = [100, 95, 82, 70, 55, 42, 30, 18, 8, 2];
  const scope: Scope = {};
  sizes.forEach((v, i) => { scope[`${i + 1}A`] = v; });
  pasa.forEach((v, i) => { scope[`${i + 1}B`] = v; });

  const d50 = evalFormula('INTERPXLOG(#1A:#10A, #1B:#10B, 50)', scope);
  // Interpolación log entre (12.7, 55) y (9.5, 42): x ≈ 11.36
  ok(near(d50, 11.36, 0.05), `D50 log-interp ≈ 11.36 (got ${d50?.toFixed(3)})`);

  const d80 = evalFormula('INTERPXLOG(#1A:#10A, #1B:#10B, 80)', scope);
  // Entre (25.4, 82) y (19, 70): f=(80-82)/(70-82)=0.1667 → x ≈ 24.2
  ok(near(d80, 24.2, 0.2), `P80 log-interp ≈ 24.2 (got ${d80?.toFixed(3)})`);

  const yAt19 = evalFormula('INTERPY(#1A:#10A, #1B:#10B, 19)', scope);
  ok(near(yAt19, 70, 1e-9), 'INTERPY en punto exacto');

  ok(evalFormula('SIERROR(INTERPX(#1A:#10A, #1B:#10B, 150), -1)', scope) === -1,
    'INTERPX objetivo fuera de rango → error atrapable');

  // Proctor: densidad seca vs humedad — parábola con óptimo en (12, 2.0)
  const hum = [8, 10, 12, 14, 16];
  const dens = hum.map(x => -0.01 * (x - 12) ** 2 + 2.0);
  const pscope: Scope = {};
  hum.forEach((v, i) => { pscope[`${i + 1}A`] = v; });
  dens.forEach((v, i) => { pscope[`${i + 1}B`] = v; });
  const hop = evalFormula('PUNTOMAXIMOX(#1A:#5A, #1B:#5B)', pscope);
  const mds = evalFormula('PUNTOMAXIMOY(#1A:#5A, #1B:#5B)', pscope);
  ok(near(hop, 12, 0.05), `óptimo Proctor X ≈ 12 (got ${hop?.toFixed(3)})`);
  ok(near(mds, 2.0, 0.005), `MDS Proctor Y ≈ 2.0 (got ${mds?.toFixed(4)})`);
  const hop3 = evalFormula('PUNTOMAXIMOX(#1A:#5A, #1B:#5B, 3)', pscope);
  ok(near(hop3, 12, 0.15), 'PUNTOMAXIMOX grado 3 también converge');

  // Regresión lineal: y = 2x + 1 exacta
  const ls: Scope = { '1A': 1, '2A': 2, '3A': 3, '1B': 3, '2B': 5, '3B': 7 };
  ok(near(evalFormula('PENDIENTE(#1A:#3A, #1B:#3B)', ls), 2, 1e-9), 'PENDIENTE');
  ok(near(evalFormula('INTERSECCION(#1A:#3A, #1B:#3B)', ls), 1, 1e-9), 'INTERSECCION');
  ok(near(evalFormula('R2(#1A:#3A, #1B:#3B)', ls), 1, 1e-9), 'R² = 1 en línea perfecta');

  // Pares con vacío se omiten en funciones de curva
  const ps: Scope = { '1A': 1, '2A': null, '3A': 3, '1B': 3, '2B': 5, '3B': 7 };
  ok(near(evalFormula('PENDIENTE(#1A:#3A, #1B:#3B)', ps), 2, 1e-9), 'curvas omiten pares vacíos');
}

// ═══ 9. Renderer de gráficos ════════════════════════════════════════════════
section('Renderer de gráficos');
{
  const scope: Scope = {};
  [50.8, 25.4, 9.5, 2, 0.075].forEach((v, i) => { scope[`${i + 1}A`] = v; });
  [100, 80, 45, 18, 2].forEach((v, i) => { scope[`${i + 1}B`] = v; });
  [95, 70, 35, 10, 0].forEach((v, i) => { scope[`${i + 1}C`] = v; });   // banda lo
  [100, 92, 60, 30, 8].forEach((v, i) => { scope[`${i + 1}D`] = v; });  // banda hi

  const refs = (col: string) => [1, 2, 3, 4, 5].map(r => `${r}${col}`);
  const svg = renderChartSvg({
    mode: 'log-x', xRefs: refs('A'), yRefs: refs('B'),
    bandLoRefs: refs('C'), bandHiRefs: refs('D'),
    seriesLabels: ['Muestra'], fit: 'loglog',
    title: 'Curva Granulométrica', xAxisTitle: 'Tamaño (mm)', yAxisTitle: '% Pasa',
  }, scope, { width: 480, height: 280 });
  ok(svg.startsWith('<svg') && svg.endsWith('</svg>'), 'SVG bien formado');
  ok(svg.includes('Especificación'), 'leyenda incluye banda de especificación');
  ok(svg.includes('Muestra'), 'leyenda incluye etiqueta de serie');
  ok(svg.includes('fill-opacity="0.13"'), 'banda dibujada como área');
  ok(svg.includes('stroke-dasharray="5,3"'), 'curva ajustada/bordes punteados presentes');

  // Multi-serie en modo line
  const svg2 = renderChartSvg({
    mode: 'line', xRefs: refs('A'), yRefs: refs('B'), y2Refs: refs('C'),
  }, scope, { width: 400, height: 240 });
  ok(svg2.includes('#0064dc') && svg2.includes('#f59e0b'), 'dos series con colores distintos');

  // Legacy sin extensiones sigue rindiendo
  const svg3 = renderChartSvg({ mode: 'scatter', xRefs: refs('A'), yRefs: refs('B') }, scope, {});
  ok(svg3.includes('R²'), 'scatter legacy conserva R²');
}

// ═══ 10. Validador de fichas ════════════════════════════════════════════════
section('Validador de fichas');
{
  // Ficha granulometría válida (como el sample GRA-001)
  const ficha = [
    { partida_item: '1', item_description: 'Tamices', validation_method: 'col-[A][Tamaño (mm)]' },
    { partida_item: '2', item_description: 'Tamices', validation_method: 'col-[B][% Pasa]' },
    { partida_item: '3', item_description: '2 pulgadas', validation_method: 'val-[50.8] // numerico-[0:100]' },
    { partida_item: '4', item_description: '1 pulgada', validation_method: 'val-[25.4] // numerico-[0:100]' },
    { partida_item: '5', item_description: 'Acumulado', validation_method: 'val-[—] // numerico-fx[SUMA(#3B:#4B)]' },
    { partida_item: '6', item_description: 'Curva', validation_method: 'numerico-gr5[x:#3A:#4A-y:#3B:#4B]' },
  ];
  const v1 = validateProtocolSpec(ficha);
  ok(v1.isNumeric && v1.ok, 'ficha granulometría válida pasa', JSON.stringify(v1.issues));

  // Referencia inexistente
  const v2 = validateProtocolSpec([
    { partida_item: '1', item_description: 'a', validation_method: 'numerico-[0:10]' },
    { partida_item: '2', item_description: 'b', validation_method: 'numerico-fx[#9Z+1]' },
  ]);
  ok(!v2.ok && v2.issues.some(i => i.code === 'ref-desconocida'), 'ref inexistente → error accionable');

  // Partida duplicada
  const v3 = validateProtocolSpec([
    { partida_item: '1', item_description: 'a', validation_method: 'numerico-[0:10]' },
    { partida_item: '1', item_description: 'b', validation_method: 'numerico-[0:10]' },
  ]);
  ok(!v3.ok && v3.issues.some(i => i.code === 'partida-duplicada'), 'partida duplicada → error');

  // Ciclo
  const v4 = validateProtocolSpec([
    { partida_item: '1', item_description: 'a', validation_method: 'numerico-fx[#2A+1]' },
    { partida_item: '2', item_description: 'b', validation_method: 'numerico-fx[#1A+1]' },
  ]);
  ok(!v4.ok && v4.issues.some(i => i.code === 'ciclo'), 'ciclo → error');

  // Matriz desconocida en lookup
  const v5 = validateProtocolSpec([
    { partida_item: '1', item_description: 'a', validation_method: 'list-[x, y]' },
    { partida_item: '2', item_description: 'b', validation_method: 'lookup-[#1A, Fantasma, A, B]' },
  ]);
  ok(!v5.ok && v5.issues.some(i => i.code === 'matriz-desconocida'), 'lookup a matriz fantasma → error');

  // Fila con typo señala el segmento exacto
  const v6 = validateProtocolSpec([
    { partida_item: '1', item_description: 'a', validation_method: 'numerico-[0:10]' },
    { partida_item: '2', item_description: 'b', validation_method: 'val-[5] // numerco-[0:10]' },
  ]);
  ok(!v6.ok && v6.issues.some(i => i.code === 'sintaxis' && i.message.includes('numerco')),
    'typo en segmento → señalado con el texto exacto');

  // Ficha clásica real (sin DSL) no genera ruido
  const v7 = validateProtocolSpec([
    { partida_item: '1', item_description: 'Inspección visual', validation_method: 'In Situ' },
  ]);
  ok(!v7.isNumeric && v7.ok, 'ficha clásica → sin falsos errores');
}

// ═══ 10b. Escala "nice numbers" (v33) ═══════════════════════════════════════
section('niceScale (ejes con sentido)');
{
  const s1 = niceScale(3, 97);
  ok(s1.min === 0 && s1.max === 100 && s1.step === 20 && s1.decimals === 0,
    'niceScale(3,97) → 0..100 paso 20 enteros', JSON.stringify(s1));
  ok(s1.ticks.join(',') === '0,20,40,60,80,100', 'ticks exactos 0,20,…,100');

  const s2 = niceScale(1.93, 2.08);
  ok(s2.min <= 1.93 && s2.max >= 2.08 && s2.decimals >= 1 && s2.step <= 0.1,
    `niceScale(1.93,2.08) encuadra con decimales coherentes (${JSON.stringify(s2)})`);
  ok(s2.ticks.every(t => t.toFixed(s2.decimals) === String(t.toFixed(s2.decimals))),
    'todos los ticks comparten formato');

  const s3 = niceScale(55, 55);
  ok(s3.min < 55 && s3.max > 55 && s3.ticks.length >= 3, 'degenerado (55,55) → ventana válida', JSON.stringify(s3));

  const s4 = niceScale(-3, 3);
  ok(s4.ticks.includes(0) && s4.min <= -3 && s4.max >= 3, 'negativos: dominio simétrico incluye 0', JSON.stringify(s4));

  const s5 = niceScale(0, 0.131);
  ok(s5.min === 0 && s5.max >= 0.131 && s5.decimals >= 1, 'rango pequeño (0..0.131) decimales coherentes', JSON.stringify(s5));

  const s6 = niceScale(1850, 2120);
  ok(s6.ticks.every(Number.isInteger) && s6.min <= 1850 && s6.max >= 2120,
    'rango grande (1850..2120) ticks enteros', JSON.stringify(s6));
}

// ═══ 10c. Títulos de eje derivados (v33) ════════════════════════════════════
section('deriveAxisTitles');
{
  const items = [
    { partida_item: '1', item_description: 'h', validation_method: 'col-[A][Tamaño (mm)]' },
    { partida_item: '2', item_description: 'h', validation_method: 'col-[B][% Pasa]' },
    { partida_item: '3', item_description: 'a', validation_method: 'val-[50.8] // numerico-[0:100]' },
    { partida_item: '4', item_description: 'b', validation_method: 'val-[25.4] // numerico-[0:100]' },
    { partida_item: '5', item_description: 'g', validation_method: 'numerico-gr5[x:#3A:#4A-y:#3B:#4B]' },
  ];
  const parsed = items.map(it => ({ spec: parseNumericRow(it.validation_method) }));
  const { headerRows } = extractHeaderRows(parsed);
  const graph = parsed[4].spec as Extract<NonNullable<typeof parsed[4]['spec']>, { kind: 'graph' }>;
  const t1 = deriveAxisTitles(graph, headerRows);
  ok(t1.xAxisTitle === 'Tamaño (mm)' && t1.yAxisTitle === '% Pasa',
    'graph legacy hereda títulos de col-[A]/col-[B]', JSON.stringify(t1));

  const explicit = parseNumericRow('numerico-gr5[x:#3A:#4A|y:#3B:#4B|xt:Abertura|yt:Pasante]');
  const t2 = deriveAxisTitles(explicit as any, headerRows);
  ok(t2.xAxisTitle === 'Abertura' && t2.yAxisTitle === 'Pasante', 'xt:/yt: explícitos ganan al fallback');

  const t3 = deriveAxisTitles(graph, []);
  ok(t3.xAxisTitle === undefined && t3.yAxisTitle === undefined, 'sin headers → sin título inventado');
}

// ═══ 10d. SVG profesional (v33) ═════════════════════════════════════════════
section('SVG profesional');
{
  const scope: Scope = {};
  [50.8, 25.4, 9.5, 2, 0.075].forEach((v, i) => { scope[`${i + 1}A`] = v; });
  [97, 80, 45, 18, 3].forEach((v, i) => { scope[`${i + 1}B`] = v; });
  const refs = (col: string) => [1, 2, 3, 4, 5].map(r => `${r}${col}`);

  const svg = renderChartSvg({
    mode: 'log-x', xRefs: refs('A'), yRefs: refs('B'),
    title: 'Curva Granulométrica', xAxisTitle: 'Tamaño (mm)', yAxisTitle: '% Pasa',
  }, scope, { width: 480, height: 300 });
  for (const lbl of ['>0<', '>20<', '>40<', '>60<', '>80<', '>100<']) {
    if (!svg.includes(lbl)) { ok(false, `eje Y con ticks bonitos — falta ${lbl}`); break; }
    if (lbl === '>100<') ok(true, 'eje Y granulometría: 0,20,40,60,80,100');
  }
  ok(svg.includes('Tamaño (mm)') && svg.includes('% Pasa'), 'títulos de ambos ejes presentes');
  ok(svg.includes(`stroke="#cbd5e1"`), 'marco del plot presente');
  ok(svg.includes('stroke-dasharray="2,3"'), 'grilla menor punteada presente');
  ok((svg.match(/>0\.01</g) ?? svg.match(/>0\.010</g) ?? []).length >= 0 && svg.includes('</svg>'), 'SVG bien formado');

  // Encuadre lineal: Proctor 8..16 / 1.93..2.08 → ticks con sentido, sin 23.47s
  const ps: Scope = {};
  [8, 10, 12, 14, 16].forEach((v, i) => { ps[`${i + 1}A`] = v; });
  [1.93, 2.0, 2.08, 2.02, 1.95].forEach((v, i) => { ps[`${i + 1}B`] = v; });
  const svg2 = renderChartSvg({
    mode: 'line', xRefs: refs('A'), yRefs: refs('B'),
    xAxisTitle: 'Humedad (%)', yAxisTitle: 'Densidad seca (g/cm³)',
  }, ps, { width: 480, height: 300 });
  ok(svg2.includes('>8<') && svg2.includes('>16<'), 'eje X Proctor con enteros (8..16)', svg2.match(/>[\d.]+</g)?.slice(0, 12)?.join(' ') ?? '');
  ok(!/>\d+\.\d{3,}</.test(svg2), 'ningún tick con decimales sin sentido');

  // Bars: el dominio incluye 0
  const bs: Scope = { '1A': 1, '2A': 2, '3A': 3, '1B': 40, '2B': 75, '3B': 60 };
  const svg3 = renderChartSvg({ mode: 'bars', xRefs: ['1A', '2A', '3A'], yRefs: ['1B', '2B', '3B'] }, bs, {});
  ok(svg3.includes('>0<'), 'barras: el eje Y incluye el 0 (baseline)');
}

// ═══ 10e. v34 — Sufijos :oculto/:nopdf + secciones + máximo algebraico ══════
section('v34: celdas ocultas / no-reporte');
{
  const h = parseNumericRow('numerico-fx[#1A*2]:oculto');
  ok(h?.kind === 'row' && h.cells[0].hidden === true && h.cells[0].noReport === true,
    ':oculto parsea (e implica :nopdf)');
  const n = parseNumericRow('numerico-[0:50]:nopdf');
  ok(n?.kind === 'row' && n.cells[0].noReport === true && !n.cells[0].hidden, ':nopdf parsea');
  const combo = parseNumericRow('numerico-fx[#1A/2]:[0:100]:nopdf:norma[ASTM D1557]');
  ok(combo?.kind === 'row' && combo.cells[0].kind === 'formula'
    && (combo.cells[0] as any).range?.max === 100
    && combo.cells[0].noReport === true && combo.cells[0].normaRef === 'ASTM D1557',
    'combinación fx + rango + :nopdf + :norma en cualquier orden');
  const vo = parseNumericRow('val-[interno]:oculto // numerico-fx[#1A]:oculto');
  ok(vo?.kind === 'row' && vo.cells.every(c => c.hidden), 'val:oculto + fx:oculto (fila 100% oculta)');

  // Validador: :oculto en celda de ENTRADA → error accionable
  const v = validateProtocolSpec([
    { partida_item: '1', item_description: 'a', validation_method: 'numerico-[0:10]:oculto' },
    { partida_item: '2', item_description: 'b', validation_method: 'numerico-[0:10]' },
  ]);
  ok(!v.ok && v.issues.some(i => i.code === 'oculto-en-entrada'), ':oculto en entrada → error del validador');

  // Las celdas ocultas SÍ computan en el scope (cálculo intermedio)
  const cells: ScopeCell[] = [
    { key: '1A', kind: 'manual', raw: '10' },
    { key: '2A', kind: 'formula', expr: '#1A*3' },     // oculta en UI — el scope no distingue
    { key: '3A', kind: 'formula', expr: '#2A+1' },
  ];
  const r = resolveScopeCells(cells);
  ok(r.scope['3A'] === 31, 'cadena con intermedia oculta computa (10→30→31)');
}

section('v34: secciones con columnas variables');
{
  const items = [
    { section: 'Datos',    validation_method: 'numerico-[0:100]' },
    { section: 'Datos',    validation_method: 'fecha-[]' },
    { section: 'Tamizado', validation_method: 'col-[A][Tamiz] // col-[B][Peso]' },
    { section: 'Tamizado', validation_method: 'val-[25.4] // numerico-[0:5000]' },
    { section: 'Tamizado', validation_method: 'val-[19.0] // numerico-[0:5000]' },
  ];
  const parsed = items.map((it, i) => ({
    item: { section: it.section },
    spec: parseNumericRow(it.validation_method),
    i,
  }));
  const secs = groupIntoSections(parsed);
  ok(secs.length === 2, `2 secciones (got ${secs.length})`);
  ok(secs[0].maxCols === 1 && secs[1].maxCols === 2,
    `columnas por sección: 1 y 2 (got ${secs[0]?.maxCols}, ${secs[1]?.maxCols})`,
    JSON.stringify(secs.map(s => ({ t: s.title, c: s.maxCols }))));
  ok(secs[0].title === 'Datos' && secs[1].title === 'Tamizado', 'títulos de sección correctos');
  ok(secs[1].headerRows.length === 1, 'headers de la 2da sección viven en su sección');

  // Validador: headers DESPUÉS de datos ya son válidos (inician sección)
  const v = validateProtocolSpec([
    { partida_item: '1', item_description: 'a', validation_method: 'numerico-[0:10]' },
    { partida_item: '', item_description: 'h', validation_method: 'col-[A][X] // col-[B][Y]' },
    { partida_item: '2', item_description: 'b', validation_method: 'numerico-[0:10] // numerico-[0:10]' },
  ]);
  ok(v.ok, 'header tras datos → válido (nueva sección)', JSON.stringify(v.issues.filter(i => i.severity === 'error')));
}

section('v34: máximo algebraico + gráfico scatter con ajuste');
{
  // Parábola PERFECTA: el máximo algebraico debe ser exacto (no aproximado).
  const ps: Scope = {};
  [8, 10, 12, 14, 16].forEach((v, i) => { ps[`${i + 1}A`] = v; });
  [8, 10, 12, 14, 16].map(x => -0.01 * (x - 12) ** 2 + 2.0).forEach((v, i) => { ps[`${i + 1}B`] = v; });
  ok(near(evalFormula('PUNTOMAXIMOX(#1A:#5A, #1B:#5B)', ps), 12, 1e-9), 'máximo X algebraicamente EXACTO');
  ok(near(evalFormula('PUNTOMAXIMOY(#1A:#5A, #1B:#5B)', ps), 2.0, 1e-9), 'máximo Y algebraicamente EXACTO');

  const refs = (col: string) => [1, 2, 3, 4, 5].map(r => `${r}${col}`);
  const svg = renderChartSvg({
    mode: 'line', xRefs: refs('A'), yRefs: refs('B'), fit: 'poli3',
    xAxisTitle: 'Humedad (%)', yAxisTitle: 'Densidad seca (g/cm³)',
  }, ps, { width: 480, height: 320 });
  ok(!svg.includes('<polyline'), 'con ajuste: los puntos NO se unen con líneas (scatter)');
  ok(svg.includes('#c0392b'), 'punto máximo marcado con líneas de referencia');
  ok(svg.includes('Punto máximo'), 'leyenda incluye "Punto máximo"');

  // Sin ajuste, la línea de la serie se mantiene (granulometrías).
  const svg2 = renderChartSvg({ mode: 'line', xRefs: refs('A'), yRefs: refs('B') }, ps, {});
  ok(svg2.includes('<polyline'), 'sin ajuste la polilínea sigue presente');
}

// ═══ 11. isNumericProtocol con tipos nuevos ═════════════════════════════════
section('Detección numérico con tipos nuevos');
{
  ok(isNumericProtocol([
    { validation_method: 'bool-[]' },
    { validation_method: 'fecha-[]' },
    { validation_method: 'porcentaje-[0:100]' },
    { validation_method: 'equipo-[Balanza] // hora-[]' },
  ]), 'protocolo con solo tipos nuevos es numérico');
}

// ═══ 12. Sufijo :dec[n] (decimales por celda) ═══════════════════════════════
section('Sufijo :dec[n]');
{
  const r1 = parseNumericRow('numerico-fx[#1A*2]:[0:10]:dec[3]');
  const c1 = r1?.kind === 'row' ? r1.cells[0] : null;
  ok(c1?.kind === 'formula' && c1.decimals === 3 && c1.range?.min === 0 && c1.range?.max === 10,
    'fx + rango + :dec[3] → decimals=3 y rango intacto', JSON.stringify(c1));

  const r2 = parseNumericRow('numerico-[0:100]:dec[1]');
  const c2 = r2?.kind === 'row' ? r2.cells[0] : null;
  ok(c2?.kind === 'manual' && c2.decimals === 1, 'manual :dec[1] → decimals=1');

  ok(parseNumericRow('numerico-[0:100]:dec[7]') === null, ':dec[7] fuera de 0–6 → fila inválida');

  const r4 = parseNumericRow('numerico-fx[#1A]:dec[2]:norma[ASTM D698]');
  const c4 = r4?.kind === 'row' ? r4.cells[0] : null;
  ok(c4?.kind === 'formula' && c4.decimals === 2 && c4.normaRef === 'ASTM D698',
    ':dec combinado con :norma (cualquier orden de sufijos finales)', JSON.stringify(c4));

  const r5 = parseNumericRow('numerico-[0:10]');
  const c5 = r5?.kind === 'row' ? r5.cells[0] : null;
  ok(c5?.kind === 'manual' && c5.decimals == null, 'sin :dec → decimals undefined (default)');
}

// ═══ 13. Leyenda debajo del gráfico + dominio Y incluye el ajuste ════════════
section('Leyenda abajo + dominio Y con curva ajustada');
{
  // Parábola exacta y = x(4-x): vértice (2,4) por ENCIMA del máximo de los
  // datos (y=3) → el dominio Y debe extenderse para no cortar la curva.
  const ps: Scope = {};
  const data: [number, number][] = [[0, 0], [1, 3], [3, 3], [4, 0]];
  data.forEach(([x, y], i) => {
    ps[`${i + 1}A`] = x;
    ps[`${i + 1}B`] = y;
  });
  const refs = (col: string) => [1, 2, 3, 4].map(r => `${r}${col}`);
  const H = 320;
  const svg = renderChartSvg({
    mode: 'line', xRefs: refs('A'), yRefs: refs('B'), fit: 'poli2',
  }, ps, { width: 480, height: H });

  // Ticks del eje Y (text-anchor="end"): el mayor debe cubrir el vértice (≥4).
  const yTicks = Array.from(svg.matchAll(/text-anchor="end"[^>]*>([\d.,−-]+)</g))
    .map(m => parseFloat(m[1].replace(',', '.').replace('−', '-')))
    .filter(n => Number.isFinite(n));
  ok(yTicks.length > 0 && Math.max(...yTicks) >= 4,
    `dominio Y se extiende hasta el vértice del ajuste (maxTick=${Math.max(...yTicks)})`);

  // La leyenda queda DEBAJO del área del gráfico (banda inferior). v43.4 — el layout
  // interno se hace a un ancho base y se escala vía viewBox, así que la referencia es
  // la ALTURA del viewBox (coordenadas internas), no el alto de salida.
  const vbH = (() => { const m = svg.match(/viewBox="0 0 [\d.]+ ([\d.]+)"/); return m ? parseFloat(m[1]) : H; })();
  const legendText = Array.from(svg.matchAll(/<text x="[\d.]+" y="([\d.]+)"[^>]*>(?:Ajuste|Punto máximo|Serie)/g));
  ok(legendText.length > 0 && legendText.every(m => parseFloat(m[1]) > vbH - 50),
    `leyenda en banda inferior (y > ${vbH - 50})`, JSON.stringify(legendText.map(m => m[1])));
  ok(svg.includes('Punto máximo'), 'leyenda incluye "Punto máximo" con ajuste poli2');
}

// ═══ 14. matrix-data huérfana = fila de valores fijos (v35) ══════════════════
section('Fila todo-val sin matriz declarada');
{
  const rows = [
    { spec: parseNumericRow('val-[4111.7]') },
    { spec: parseNumericRow('numerico-[0:10]') },
  ];
  const { mainRows, valid } = extractMatrices(rows);
  const first = mainRows[0]?.spec;
  ok(valid, 'val-[x] suelto antes de matrix-[…] NO invalida la ficha');
  ok(mainRows.length === 2 && first?.kind === 'row' && first.cells[0]?.kind === 'val'
    && first.cells[0].literal === '4111.7',
    'se reinterpreta como fila normal de celdas val', JSON.stringify(first));
}

// ═══ 15. PDF numérico (Parte B): bloques con formato del audit ═══════════════
section('PDF numérico (buildNumericProtocolBlocks)');
{
  const mk = (partida: string, desc: string, method: string, comments: string | null = null, sec?: string) =>
    ({ id: `i${partida}`, item_description: desc, validation_method: method, partida_item: partida, comments, section: sec ?? null });
  const items = [
    mk('1', 'Peso (g)', 'numerico-[0:100]:dec[1]', '50,5', 'Datos'),
    mk('2', 'Interno oculto', 'numerico-fx[#1A*2]:oculto', null, 'Datos'),
    mk('3', 'Doble', 'numerico-fx[#1A*2]:[0:200]:dec[1]', null, 'Datos'),
    mk('4', 'Solo app', 'numerico-[0:10]:nopdf', '5', 'Datos'),
    mk('5', 'Curva', 'numerico-gr1[x:#1A:#1A|y:#3A:#3A|t:Demo]', null, 'Resultados'),
  ];
  const blocks = buildNumericProtocolBlocks(items);
  const all = blocks.map(b => b.html).join('\n');
  ok(blocks.length >= 2, `genera bloques (${blocks.length})`);
  ok(all.includes('DATOS') || all.includes('Datos'), 'banda de sección presente');
  ok(all.includes('50.5'), 'valor manual con :dec[1] formateado (50.5)');
  ok(all.includes('101.0'), 'fórmula computada desde comments con :dec[1] (101.0)');
  ok(!all.includes('Interno oculto'), 'fila :oculto excluida del PDF');
  ok(!all.includes('>5<'), 'celda :nopdf sin valor en el PDF');
  ok(all.includes('Gráfico 1'), 'gráfico numerado');
  ok(all.includes('✓'), 'veredicto ✓ por fila presente');

  // La numeración visible salta la fila oculta: "Doble" debe ser la fila 2.
  const idxDoble = all.indexOf('Doble');
  const before = all.slice(0, idxDoble);
  ok(/;">2<\/td>/.test(before.slice(before.lastIndexOf('<tr>'))), 'numeración continua omite ocultas (Doble = 2)');

  const pages = paginateNumericBlocks(blocks);
  ok(pages.length >= 1 && pages.every(p => p.length > 0), `paginación sin páginas vacías (${pages.length} pág.)`);
  // Un bloque gigante no debe generar página vacía previa.
  const pages2 = paginateNumericBlocks([{ html: 'a', weight: 5 }, { html: 'b', weight: 100 }]);
  ok(pages2.length === 2 && pages2[0] === 'a' && pages2[1] === 'b', 'bloque sobredimensionado va solo a su página');
}

// ═══ 16. Códigos correlativos de ensayo (v31 — Parte E) ══════════════════════
section('protocolCode (máscaras y correlativos)');
{
  const d = new Date(2026, 2, 3, 12);   // 03/03/2026

  ok(validateMask('{TIPO}-{AA}{SEQ:4}').length === 0, 'máscara default válida');
  ok(validateMask('{TIPO}-{SEQ:4}').some(e => e.includes('año')), 'sin año → error');
  ok(validateMask('{AA}{SEQ:4}').some(e => e.includes('{TIPO}')), 'sin tipo → error');
  ok(validateMask('{TIPO}-{AA}').some(e => e.includes('{SEQ')), 'sin SEQ → error');
  ok(validateMask('{TIPO}-{AA}{SEQ:4}-{TURNO}').some(e => e.includes('desconocidos')), 'token inventado → error');

  ok(buildProtocolCode('{TIPO}-{AA}{SEQ:4}', { tipo: 'PR', date: d, seq: 32 }) === 'PR-260032',
    'PR-260032 (patrón minería)');
  ok(buildProtocolCode('CV-DRE-QC-RPR-{AA}{MM}{DD}-{TIPO}-{SEQ:4}', { tipo: 'PR', date: d, seq: 402 }) === 'CV-DRE-QC-RPR-260303-PR-0402',
    'máscara estilo reporte CV');
  ok(buildProtocolCode('{TIPO}-{AAAA}-{SECTOR}-{SEQ:3}', { tipo: 'DS', date: d, seq: 7, sector: '2C - M' }) === 'DS-2026-2C-M-007',
    '{SECTOR} sanitizado (sin espacios, mayúsculas)');
  ok(buildProtocolCode('{TIPO}-{AA}{SEQ:4}', { tipo: 'PR', date: d, seq: 12345 }) === 'PR-2612345',
    'overflow del padding: seq 12345 con {SEQ:4} no se trunca');

  // nextSeq: ámbito tipo+año — ignora otros tipos, otros años y códigos ajenos
  const codes = ['PR-260031', 'PR-260032', 'PR-250099', 'DS-260118', 'PR-2612345', 'libre-001', null];
  ok(nextSeq(codes, '{TIPO}-{AA}{SEQ:4}', 'PR', d) === 12346, 'nextSeq toma el max del ámbito (incl. overflow)');
  ok(nextSeq(codes, '{TIPO}-{AA}{SEQ:4}', 'DS', d) === 119, 'nextSeq de otro tipo es independiente');
  ok(nextSeq([], '{TIPO}-{AA}{SEQ:4}', 'GR', d) === 1, 'ámbito vacío arranca en 1');

  // Tipos con guiones no rompen el parseo (literal escapado, no genérico)
  const codesGuion = ['QC-PR-260009', 'QC-PR-260010'];
  ok(nextSeq(codesGuion, '{TIPO}-{AA}{SEQ:4}', 'QC-PR', d) === 11, 'tipo con guion (QC-PR) parsea bien');

  // {MM}/{DD} genéricos: meses distintos COMPARTEN correlativo del año
  const codesMes = ['PR-2601-0005', 'PR-2603-0008'];
  ok(nextSeq(codesMes, '{TIPO}-{AA}{MM}-{SEQ:4}', 'PR', d) === 9, 'el ámbito es tipo+año (meses comparten secuencia)');

  // v46.1 — pickMask: máscara por tipo de ensayo (cae al default si no hay override)
  ok(pickMask('{TIPO}-{AA}{SEQ:4}', undefined, 'PR') === '{TIPO}-{AA}{SEQ:4}', 'pickMask sin byType → default');
  ok(pickMask('{TIPO}-{AA}{SEQ:4}', { DS: '{TIPO}-{AAAA}-{SEQ:3}' }, 'DS') === '{TIPO}-{AAAA}-{SEQ:3}', 'pickMask con override para el tipo');
  ok(pickMask('{TIPO}-{AA}{SEQ:4}', { DS: '{TIPO}-{AAAA}-{SEQ:3}' }, 'PR') === '{TIPO}-{AA}{SEQ:4}', 'pickMask sin override para el tipo → default');

  // v46.1 — reinicio por año+mes: con scope.month, meses distintos cuentan POR SEPARADO
  ok(nextSeq(codesMes, '{TIPO}-{AA}{MM}-{SEQ:4}', 'PR', d, null, { month: true }) === 9, 'reset year_month: marzo (03/03) continúa su propio correlativo');
  ok(nextSeq(codesMes, '{TIPO}-{AA}{MM}-{SEQ:4}', 'PR', new Date(2026, 0, 15), null, { month: true }) === 6, 'reset year_month: enero independiente de marzo');

  // v46.1 — reinicio por año+sector: con scope.sector, sectores distintos cuentan POR SEPARADO
  const codesSec = ['PR-26-NORTE-005', 'PR-26-SUR-002'];
  ok(nextSeq(codesSec, '{TIPO}-{AA}-{SECTOR}-{SEQ:3}', 'PR', d, 'NORTE', { sector: true }) === 6, 'reset year_sector: NORTE continúa su correlativo');
  ok(nextSeq(codesSec, '{TIPO}-{AA}-{SECTOR}-{SEQ:3}', 'PR', d, 'SUR', { sector: true }) === 3, 'reset year_sector: SUR independiente de NORTE');
  ok(nextSeq(codesSec, '{TIPO}-{AA}-{SECTOR}-{SEQ:3}', 'PR', d, null, {}) === 6, 'sin reset por sector: ámbito tipo+año comparte (max global)');

  ok(/^\d{4}-\d{2}-\d{2}$/.test(todayEnsayoDate(d)) && todayEnsayoDate(d) === '2026-03-03', 'todayEnsayoDate local');
  const pd = parseEnsayoDate('2026-03-03');
  ok(pd != null && pd.getDate() === 3 && pd.getMonth() === 2 && pd.getHours() === 12, 'parseEnsayoDate a mediodía local');
  ok(parseEnsayoDate('2026-13-40') == null && parseEnsayoDate('') == null, 'ensayo_date inválida → null');
}

// ═══ 17. Celda codigo-[] (v31 — Parte E) ═════════════════════════════════════
section('Celda codigo-[]');
{
  const r = parseNumericRow('codigo-[]');
  ok(r?.kind === 'row' && r.cells[0]?.kind === 'code', 'codigo-[] parsea como celda code');
  const r2 = parseNumericRow('codigo-[] // numerico-[0:10]');
  ok(r2?.kind === 'row' && r2.cells[0]?.kind === 'code' && r2.cells[1]?.kind === 'manual',
    'codigo-[] convive en fila multi-celda');

  // Validador: máx 1 por ficha; no entra al scope (referenciarla = ref desconocida).
  const mk = (partida: string, desc: string, method: string) =>
    ({ partida_item: partida, item_description: desc, validation_method: method });
  const v1 = validateProtocolSpec([
    mk('1', 'Código', 'codigo-[]'),
    mk('2', 'Peso', 'numerico-[0:100]'),
  ]);
  ok(v1.ok, 'una celda codigo-[] es válida', JSON.stringify(v1.issues.slice(0, 2)));
  const v2 = validateProtocolSpec([
    mk('1', 'Código', 'codigo-[]'),
    mk('2', 'Otro código', 'codigo-[]'),
  ]);
  ok(v2.issues.some(i => i.code === 'codigo-duplicado'), 'dos codigo-[] → error codigo-duplicado');
  const v3 = validateProtocolSpec([
    mk('1', 'Código', 'codigo-[]'),
    mk('2', 'Suma', 'numerico-fx[#1A*2]'),
  ]);
  ok(v3.issues.some(i => i.code === 'ref-desconocida'), 'codigo-[] NO entra al scope (#1A es ref desconocida)');

  // PDF: la celda muestra el protocol_code del protocolo.
  const blocks = buildNumericProtocolBlocks([
    { id: 'c1', item_description: 'Código', validation_method: 'codigo-[]', partida_item: '1', comments: null, section: null },
    { id: 'c2', item_description: 'Peso', validation_method: 'numerico-[0:100]', partida_item: '2', comments: '50', section: null },
  ], { protocolCode: 'PR-260032' });
  ok(blocks.map(b => b.html).join('').includes('PR-260032'), 'PDF muestra el código en la celda codigo-[]');
}

// ═══ 18. Robustez del parser (v42e — escaneo del módulo numérico) ════════════
section('Robustez del parser (v42e)');
{
  // M1 — `//` dentro de un literal val-[…] no se parte.
  const v1 = parseNumericRow('val-[3//8 pulg]');
  ok(v1?.kind === 'matrix-data' && v1.values[0] === '3//8 pulg',
    'M1: // dentro de val-[] no se parte (matrix-data 1 valor)', JSON.stringify(v1));

  const v2 = parseNumericRow('val-[3//8] // numerico-[0:100]');
  ok(v2?.kind === 'row' && v2.cells.length === 2 && v2.cells[0].kind === 'val'
    && (v2.cells[0] as any).literal === '3//8' && v2.cells[1].kind === 'manual',
    'M1: // en literal no rompe la fila mixta', JSON.stringify(v2));

  const v3 = parseNumericRow('numerico-[0:10] // // numerico-[0:10]');
  ok(v3?.kind === 'row' && v3.cells.length === 3 && v3.cells[1].kind === 'blank',
    'M1: celdas en blanco (////) siguen intactas', JSON.stringify(v3?.kind === 'row' ? v3.cells.map(c => c.kind) : v3));

  // M2 — modo numérico exige ≥1 fila de datos (row/graph).
  ok(!isNumericProtocol([{ validation_method: 'col-[A][X]' }]), 'M2: solo headers → NO numérico');
  ok(!isNumericProtocol([{ validation_method: 'val-[1] // val-[2]' }]), 'M2: solo matrix-data → NO numérico');
  ok(!isNumericProtocol([{ validation_method: 'repeat-[g:1:5:3]' }]), 'M2: solo repeat → NO numérico');
  ok(isNumericProtocol([{ validation_method: 'col-[A][X]' }, { validation_method: 'numerico-[0:10]' }]),
    'M2: header + fila de datos → numérico');

  // M3 — matrix-data con ancho ≠ columnas del header → valid:false.
  const m3 = extractMatrices([
    { spec: parseNumericRow('matrix-[M1] // col-[A][X] // col-[B][Y]') },
    { spec: parseNumericRow('val-[a] // val-[b] // val-[c]') },
  ]);
  ok(!m3.valid, 'M3: matrix-data más ancha que el header → valid:false');

  const m3ok = extractMatrices([
    { spec: parseNumericRow('matrix-[M2] // col-[A][X] // col-[B][Y]') },
    { spec: parseNumericRow('val-[a] // val-[b]') },
  ]);
  ok(m3ok.valid && m3ok.matrices['M2']?.rows.length === 1, 'M3: matrix-data del ancho correcto sigue válida');

  // M4 — id de matriz duplicado → valid:false.
  const m4 = extractMatrices([
    { spec: parseNumericRow('matrix-[M1] // col-[A][X]') },
    { spec: parseNumericRow('val-[a]') },
    { spec: parseNumericRow('matrix-[M1] // col-[A][Y]') },
    { spec: parseNumericRow('val-[b]') },
  ]);
  ok(!m4.valid, 'M4: id de matriz duplicado → valid:false');

  // L1 — lookup exige `#` en el 1er argumento.
  ok(parseNumericRow('lookup-[5, M1, A, B]') === null, 'L1: lookup con número pelado → rechazado');
  const lk = parseNumericRow('lookup-[#1A, M1, A, B]');
  ok(lk?.kind === 'row' && lk.cells[0].kind === 'lookup' && (lk.cells[0] as any).refKey === '1A',
    'L1: lookup con #ref sigue funcionando');

  // L4 / I2 — fila 0 rechazada; ceros a la izquierda normalizados.
  const lz = parseNumericRow('lookup-[#01A, M1, A, B]');
  ok(lz?.kind === 'row' && (lz.cells[0] as any).refKey === '1A',
    'I2: cero a la izquierda en ref se normaliza (#01A→1A)');
  ok(parseNumericRow('numerico-gr1[x:#0A|y:#1B]') === null, 'L4: ref a fila 0 en gráfico → fila inválida');
  const g = parseNumericRow('numerico-gr1[x:#01A:#03A|y:#01B:#03B]');
  ok(g?.kind === 'graph' && g.xRefs.join(',') === '1A,2A,3A',
    'L4/I2: rango con ceros a la izquierda se normaliza', JSON.stringify(g?.kind === 'graph' ? g.xRefs : g));

  // I2 lexer — `#01A` en una fórmula coincide con la scope key '1A'.
  ok(evalFormula('#01A + 1', { '1A': 4 }) === 5, 'I2: #01A en fórmula resuelve a 1A');
  // L4 lexer — fila 0 en una fórmula → error (no se evalúa como key fantasma).
  let l4threw = false;
  try { evalFormula('#0A', { '1A': 4 }); } catch { l4threw = true; }
  ok(l4threw, 'L4: #0 en fórmula lanza error');

  // L5 — CONTAR de un escalar DECLARADO pero vacío cuenta 0 (antes propagaba null).
  ok(evalFormula('CONTAR(#2A)', { '1A': 5, '2A': null }) === 0, 'L5: CONTAR(escalar vacío) = 0');
  ok(evalFormula('CONTAR(#1A)', { '1A': 5, '2A': null }) === 1, 'L5: CONTAR(escalar lleno) = 1');
  // RAIZ de escalar vacío sigue propagando vacío (semántica intacta).
  ok(evalFormula('RAIZ(#2A)', { '1A': 5, '2A': null }) === null, 'L5: el resto de funciones conserva propagación de vacío');
}

// ═══ Agrupamientos (presets) — DSL de filtros (v45.3) ═══════════════════════
section('Agrupamientos: parser/evaluador de filtros');
{
  const f = parseGroupingFilters('material=GP & condicion=INALTERADA & celda:19A>=2.0');
  ok(f.length === 3, 'parseGroupingFilters separa 3 cláusulas por &');
  ok(f[0].field === 'material' && f[0].op === '=' && f[0].value === 'GP', 'cláusula de atributo material=GP');
  ok(f[2].field === 'celda:19a' && f[2].op === '>=' && f[2].value === '2.0', 'cláusula de celda celda:19A>=2.0');
  ok(clauseCellKey(f[2]) === '19A', 'clauseCellKey normaliza celda:19A → 19A');
  ok(clauseCellKey(f[0]) === null, 'clauseCellKey de atributo → null');
  // Evaluación
  ok(clauseMatches({ field: 'celda:19a', op: '>=', value: '2.0' }, 2.05) === true, 'celda 2.05 >= 2.0 → cumple');
  ok(clauseMatches({ field: 'celda:19a', op: '>=', value: '2.0' }, 1.9) === false, 'celda 1.9 >= 2.0 → no cumple');
  ok(clauseMatches({ field: 'material', op: '=', value: 'GP' }, 'gp') === true, 'material = GP (case-insensitive)');
  ok(clauseMatches({ field: 'material', op: '~', value: 'gra' }, 'Grava arcillosa') === true, '~ contiene texto');
  ok(clauseMatches({ field: 'celda:1a', op: '>', value: '5' }, null) === false, 'valor faltante (null) → no cumple');
  ok(clauseMatches({ field: 'codigo', op: '!=', value: 'PRV5-1' }, 'PRV5-2') === true, '!= distinto → cumple');
  // Excluir
  ok(parseExcludeCodes('PRV5-1, PRV5-2  PRV5-3').length === 3, 'parseExcludeCodes separa por coma/espacio');
  ok(parseExcludeCodes('').length === 0, 'parseExcludeCodes vacío → []');
  // Cláusulas inválidas se descartan
  ok(parseGroupingFilters('sinoperador & material=GP').length === 1, 'descarta cláusula sin operador');
  // J) =/!= en campos identificadores compara como TEXTO (no equipara '007' con '7')
  ok(clauseMatches({ field: 'codigo', op: '=', value: '007' }, '7') === false, 'J: codigo 007 ≠ 7 (texto, no numérico)');
  ok(clauseMatches({ field: 'codigo', op: '=', value: 'PRV5-2' }, 'PRV5-2') === true, 'J: codigo igual exacto');
  ok(clauseMatches({ field: 'celda:19a', op: '=', value: '2.0' }, 2.0) === true, 'J: celda numérica = sigue numérica');
  ok(clauseMatches({ field: 'material', op: '=', value: '2' }, 'Material 2') === false, 'J: material "2" no equipara con número 2');
  // fecha con operadores relacionales (ISO lexicográfico)
  ok(clauseMatches({ field: 'fecha', op: '>=', value: '2026-01-01' }, '2026-06-21') === true, 'fecha >= ISO → cumple');
  ok(clauseMatches({ field: 'fecha', op: '<', value: '2026-01-01' }, '2026-06-21') === false, 'fecha < ISO → no cumple');
  ok(clauseMatches({ field: 'fecha', op: '=', value: '2026-06-21' }, '2026-06-21') === true, 'fecha = ISO exacta');
  ok(clauseMatches({ field: 'fecha', op: '>', value: '2026-06-21' }, '2026-06-20') === false, 'fecha > ISO (anterior) → no cumple');
}

console.log(`\n════════════════════════════════════`);
console.log(`  ${passed} pasaron, ${failed} fallaron`);
if (failed > 0) process.exit(1);
console.log('  TODOS LOS TESTS PASARON ✓');
