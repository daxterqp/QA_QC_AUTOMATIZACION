/**
 * devAutofill — v91: Autollenado de DESARROLLO extraído de NumericTable para
 * poder usarlo HEADLESS (DevSeedService: ensayos llenos+enviados en lote)
 * además de en la UI. Genera valores de entrada plausibles por celda con
 * PRIORIDAD `:ej[]` de la ficha (patrón físico congruente) > regla Proctor
 * por descripción > aleatorio en rango.
 */
import { tx } from '@i18n/index';
import {
  type ListSource, type MatrixData, type NumericCellSpec,
} from './numericProtocol';
import { type AuxTables } from './formulaEval';

// ── Herramienta de desarrollo: autollenado (solo __DEV__) ────────────────────
// Perfil del ensayo PROCTOR (PRV5): valores REALES tomados del Excel de ejemplo
// (CV-QC-PR-260101-AB). Cada regla mapea (por descripción de la fila) los valores
// base por columna — para las filas de 4 puntos, un valor por punto (A/B/C/D). El
// autollenado emite `base × (1 ± 0.5%)` para que ensayos sucesivos salgan PARECIDOS
// (pequeñas variaciones, como repeticiones del mismo material). Las listas (molde,
// recipiente, tara, fiola, temperatura) toman el código real EXACTO (sin ruido) para
// que los BUSCAR resuelvan igual que el ensayo real. Filas que no matchean ninguna
// regla (otros ensayos) caen al generador genérico.
export const devNorm = (s: string) => (s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();

const PROCTOR_RULES: { match: RegExp; perCol: (number | string | null)[] }[] = [
  // S1 — densidades húmedas (4 puntos)
  { match: /molde \+ suelo/, perCol: [5911, 5956, 5979, 5963] },     // Peso molde + suelo húmedo
  { match: /agua anadida/, perCol: [0, 40, 80, 120] },               // informativo (incremental)
  // S2 — contenido de humedad (4 puntos)
  { match: /suelo humedo \+ recipiente/, perCol: [668.9, 605.2, 685.7, 669.8] },
  { match: /suelo seco \+ recipiente/, perCol: [622, 560.8, 626, 610.2] },
  { match: /suelo humedo \+ tara/, perCol: [1160.6] },               // S4 (1 columna)
  { match: /suelo seco \+ tara/, perCol: [1103.7] },                 // S4
  { match: /recipiente n/, perCol: ['1', '2', '3', '4'] },           // list @taras (pesos 269.9/268.5/269.7/269.8)
  { match: /n. de molde/, perCol: ['13'] },                          // list @moldes (peso 4111.7)
  { match: /n. de tara/, perCol: ['33'] },                           // list @taras2 (peso 721.8)
  // S5 — granulometría (input = col B "Peso retenido"); pasa con curva de arena
  { match: /tamiz 9\.5/, perCol: [null, 0] },
  { match: /tamiz 4\.75/, perCol: [null, 2] },
  { match: /tamiz 2\.0/, perCol: [null, 10] },
  { match: /tamiz 0\.425/, perCol: [null, 90] },
  { match: /tamiz 0\.150/, perCol: [null, 160] },
  { match: /tamiz 0\.075/, perCol: [null, 85] },
  // S6 — gravedad específica (fiola 17 + temp 20 → Gs20 ≈ 2.729, igual al real)
  { match: /picnometro|fiola/, perCol: ['17'] },                     // list @fiola
  { match: /temperatura/, perCol: ['20'] },                          // list @agua
  { match: /frasco \+ agua \+ suelo|pfws/, perCol: [387.6] },        // Pfws
  { match: /pss|suelo seco \(pss\)/, perCol: [100] },                // Pss
];

/** Valor aleatorio dentro de [min,max], banda media, redondeado (fallback genérico). */
function devRandIn(min: number, max: number, decimals: number): string {
  const frac = 0.35 + Math.random() * 0.35;
  return (min + frac * (max - min)).toFixed(Math.max(0, Math.min(6, decimals)));
}

/** Aplica ruido (±`frac/2`) a un valor base y lo acota al rango de la celda.
 *  Default ±0.5%; los valores `:ej[]` de la ficha usan un ruido menor para que
 *  las corridas se vean congruentes (curva limpia). */
function devNoisy(base: number, range: { min: number; max: number } | null | undefined, decimals: number, frac = 0.01): string {
  const noisy = base * (1 + (Math.random() - 0.5) * frac);
  const v = range ? Math.min(range.max, Math.max(range.min, noisy)) : noisy;
  return v.toFixed(Math.max(0, Math.min(6, decimals)));
}

/** Genera un valor de ingreso para una celda. PRIORIDAD: `:ej[valor]` de la ficha
 *  (patrón congruente) > regla Proctor por descripción > aleatorio en rango.
 *  Devuelve null para celdas calculadas/solo-lectura (no se rellenan). */
export function devGenCellValue(cell: NumericCellSpec, colIdx: number, descNorm: string, matrices: Record<string, MatrixData>, auxTables?: AuxTables): string | null {
  const sample = (cell as { sample?: string }).sample;
  const hasEj = sample != null && sample !== '';
  const rule = hasEj ? undefined : PROCTOR_RULES.find(r => r.match.test(descNorm));
  const base: number | string | null | undefined = hasEj ? sample : (rule ? (rule.perCol[colIdx] ?? rule.perCol[0]) : undefined);
  const dec = (cell as { decimals?: number }).decimals;
  const range = (cell as { range?: { min: number; max: number } }).range;
  // :ej → ruido chico (±0.05%) para que las CORRIDAS queden congruentes: con ±0.15% el
  // ruido se componía sobre las ~6 entradas y sacaba el GC del Cono fuera de [100,101.5]
  // (~8% de las veces). ±0.05% mantiene GC[100.1,101.0] y la curva Proctor limpia.
  const frac = hasEj ? 0.001 : 0.01;
  const asNum = (v: number | string | null | undefined): number | undefined => {
    if (v == null) return undefined;
    const n = typeof v === 'number' ? v : Number(String(v).replace(',', '.'));
    return Number.isFinite(n) ? n : undefined;
  };
  switch (cell.kind) {
    case 'manual':
    case 'percent': {
      const b = asNum(base);
      if (b != null) return devNoisy(b, range, dec ?? 2, frac);
      return range ? devRandIn(range.min, range.max, dec ?? 2) : (Math.random() * 100).toFixed(dec ?? 2);
    }
    case 'free': {
      const b = asNum(base);
      if (b != null) return devNoisy(b, range, dec ?? 1, frac);
      return (10 + Math.random() * 990).toFixed(dec ?? 1);
    }
    case 'list': {
      const opts = resolveListOptionsMobile((cell as { source: ListSource }).source, matrices, auxTables);
      if (base != null) {
        const hit = opts.find(o => String(o) === String(base));
        if (hit != null) return String(hit);   // código/opción real exacto (BUSCAR resuelve igual)
      }
      return opts.length ? String(opts[Math.floor(Math.random() * opts.length)]) : null;
    }
    case 'text':
      return hasEj ? String(base) : tx('numericTable.devTestValue');
    case 'date': {
      const d = new Date();
      return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
    }
    case 'time': {
      const h = 8 + Math.floor(Math.random() * 8), m = Math.floor(Math.random() * 60);
      return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    }
    case 'bool':
      return hasEj ? String(base) : '1';
    case 'equipment':
      return 'DEV-001';
    case 'comment': {
      const opts = (cell as { options?: string[] }).options;
      return opts && opts.length ? opts[Math.floor(Math.random() * opts.length)] : null;
    }
    default:
      return null; // formula / lookup / val / code / blank
  }
}

/** Resuelve opciones de una lista a partir de la spec, matrices y tablas auxiliares. */
export function resolveListOptionsMobile(source: ListSource, matrices: Record<string, MatrixData>, auxTables?: AuxTables): string[] {
  if (source.type === 'inline') return source.values;
  // v41 — Tabla auxiliar del proyecto: columna por NOMBRE.
  if (source.type === 'project-table') {
    const t = auxTables?.[source.tableKey];
    if (!t) return [];
    const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
    const idx = t.columns.findIndex(c => norm(c) === norm(source.column));
    if (idx < 0) return [];
    return t.rows.map(r => r[idx] ?? '').filter(v => v !== '');
  }
  const m = matrices[source.matrixId];
  if (!m) return [];
  const colIdx = source.col.charCodeAt(0) - 65;
  const colVals = (rows: typeof m.rows) => rows.map(r => r[colIdx] ?? '').filter(v => v !== '');
  if (source.type === 'matrix-col') return colVals(m.rows);
  // Rango por fila (#from:#to): los índices 1-based del usuario apuntan a las
  // filas ORIGINALES de la matriz. Recortar PRIMERO y luego limpiar vacíos; si
  // se filtra antes de recortar, los huecos del medio desalinean el rango.
  const from = Math.max(0, source.fromRow - 1);
  const to = Math.min(m.rows.length, source.toRow);
  return colVals(m.rows.slice(from, to));
}
