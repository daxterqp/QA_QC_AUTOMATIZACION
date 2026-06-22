// Mini-evaluador de fórmulas tipo Excel para protocolos numéricos.
// Sin dependencias externas; sin eval / new Function.
//
// Tokens:
//   - Números: 1, 1.5, notación 1e3 (solo punto como decimal)
//   - Identificadores: [A-Za-z_][A-Za-z0-9_-]*   (nombres de funciones)
//   - Referencias a celda: #<row><col?>          → "1A", "3B", etc. (col=A implícita)
//   - Rangos:              #<row><col?>:#<row><col?>
//   - Cross-protocolo:     @<external_id>.<row><col?>  (v26)
//   - Operadores binarios: + - * / ^         (^ asoc. derecha)
//   - Comparaciones: > < >= <= == !=         (resultado 1 o 0)
//   - Unarios: + - (prefijo)
//   - Paréntesis: ( )
//   - Función:   NOMBRE(arg1, arg2, ...)
//
// Funciones built-in (case-insensitive):
//
//   ── Aritmética / estadística (v1) ───────────────────────────────────────
//   SUMA, PROMEDIO, MAX, MIN, ABS, REDONDEAR(x,n), RAIZ(x), POTENCIA(x,n)
//   DESVEST(args…)         → desviación estándar muestral (n-1)
//   DESVESTP(args…)        → desviación estándar poblacional (n)
//   CV(args…)              → coef. de variación % = DESVEST / PROMEDIO × 100
//   MEDIANA(args…)         → mediana (interpolación lineal en n par)
//   PERCENTIL(args…, p)    → percentil p (0–100), interpolación tipo Excel
//   OUTLIER(args…)         → 1 si el ÚLTIMO arg es outlier IQR del resto, 0 si no
//   LOOKUP(ref, Mx, ColBusq, ColRet) → búsqueda en matriz auxiliar
//
//   ── Lógica (v32) ────────────────────────────────────────────────────────
//   SI(cond, a [, b])      → LAZY: solo evalúa la rama elegida. Sin 3er arg y
//                            cond falsa → vacío (null). Permite guardas reales:
//                            SI(#1A>0, #1B/#1A, 0) ya no truena por div/0.
//   Y(args…), O(args…), NO(x) → and/or/not numéricos (1/0)
//   ESVACIO(celda)         → 1 si la celda está vacía, 0 si tiene valor.
//                            (Única función que NO propaga null del argumento.)
//   SIERROR(expr, alt)     → evalúa expr; si da ERROR devuelve alt. (Null sigue
//                            propagando como null: vacío no es error.)
//
//   ── Tablas dinámicas fila-a-fila (v32) ──────────────────────────────────
//   FILA()                 → número de fila (partida) de la celda actual.
//   CELDA(Col [, fila])    → valor de la celda en columna Col y fila dada.
//                            `fila` admite números y FILA()±k (estático).
//                            Sin 2º arg → fila actual. Celda inexistente → vacío.
//                            Acumulado: SI(FILA()>1, CELDA(C, FILA()-1)+CELDA(B), CELDA(B))
//   COLUMNA(Col)           → la serie completa de la columna Col (todas las filas,
//                            excluyendo la celda actual). Solo válida como
//                            argumento de función. Los vacíos se ignoran en
//                            funciones simples (SUMA(COLUMNA(B)) suma lo llenado).
//
//   ── Agregación filtrada (v32) ───────────────────────────────────────────
//   SUMARSI(valores, condiciones)    → suma valores[i] donde condiciones[i] ≠ 0
//   PROMEDIOSI(valores, condiciones) → promedio filtrado (vacío si no hay pares)
//   CONTARSI(condiciones)            → cuenta condiciones ≠ 0
//   CONTAR(valores…)                 → cuenta valores NO vacíos
//   (valores/condiciones son rangos #1B:#10B o COLUMNA(B); pares con vacío se omiten)
//
//   ── Aproximación de curvas (v32) ────────────────────────────────────────
//   INTERPY(xs, ys, x)        → interpola linealmente Y para un X dado
//   INTERPX(xs, ys, yObj)     → X donde la serie cruza el Y objetivo (lineal)
//   INTERPXLOG(xs, ys, yObj)  → idem con X en escala log10 (P50/P80/D60 granulometría)
//   PUNTOMAXIMOX(xs, ys [, grado]) → X del máximo de la curva ajustada (polinomio
//                                    grado 2 ó 3; default 2). Óptimo Proctor.
//                                    Máximo ALGEBRAICO: derivada = 0 resuelta en
//                                    forma cerrada (no búsqueda gráfica).
//   PUNTOMAXIMOY(xs, ys [, grado]) → Y del máximo de esa curva (MDS Proctor).
//   PENDIENTE(xs, ys), INTERSECCION(xs, ys), R2(xs, ys) → regresión lineal
//
//   ── Matemática adicional (v32) ──────────────────────────────────────────
//   LOG(x [, base=10]), LN(x), EXP(x), PI()
//   SENO(x), COSENO(x), TAN(x), ATAN(x)        (radianes)
//   ENTERO(x)                 → piso (floor)
//   RESIDUO(a, b)             → módulo con signo del divisor (tipo Excel)
//   MODA(args…)               → valor más frecuente (error si no hay repetidos)
//
// Si una referencia es null/vacía, el resultado de la fórmula es null
// (se renderiza como vacío). División por cero → throw 'div0'.
//
// Las claves del scope son `<row><col>` (col = letra mayúscula), ej: "1A", "2B".
// Una ref sin letra (#1) se normaliza a #1A.

export type Scope = Record<string, number | null>;

export class FormulaError extends Error {
  code: string;
  constructor(code: string, message: string) { super(message); this.code = code; }
}

// ─── Lexer ─────────────────────────────────────────────────────────────────
type Token =
  | { t: 'num'; v: number }
  | { t: 'id';  v: string }
  | { t: 'range'; from: string; to: string }
  | { t: 'xref'; externalId: string; key: string }   // v26
  | { t: 'op';  v: string }
  | { t: 'lp' } | { t: 'rp' } | { t: 'comma' };

const RE_CELL = /^#(\d+)([A-Za-z])?/;
const RE_XREF = /^@([A-Za-z0-9_-]+)\.(\d+)([A-Za-z])?/;

function tokenize(src: string): Token[] {
  const tokens: Token[] = [];
  let i = 0, n = src.length;
  const isDigit = (c: string) => c >= '0' && c <= '9';
  const isIdStart = (c: string) => /[A-Za-z_]/.test(c);
  const isIdCont  = (c: string) => /[A-Za-z0-9_\-]/.test(c);

  while (i < n) {
    const c = src[i];
    if (c === ' ' || c === '\t' || c === '\n') { i++; continue; }

    if (isDigit(c) || (c === '.' && isDigit(src[i + 1] ?? ''))) {
      let j = i;
      let hasDecimal = c === '.';
      while (j < n) {
        const ch = src[j];
        if (isDigit(ch)) { j++; continue; }
        // SOLO el punto es separador decimal en literales de fórmula. La coma
        // siempre es separador de argumentos.
        if (ch === '.' && !hasDecimal && isDigit(src[j + 1] ?? '')) {
          hasDecimal = true;
          j++;
          continue;
        }
        break;
      }
      // notación científica
      if (j < n && (src[j] === 'e' || src[j] === 'E')) {
        j++;
        if (j < n && (src[j] === '+' || src[j] === '-')) j++;
        while (j < n && isDigit(src[j])) j++;
      }
      const lit = src.slice(i, j);
      const v = Number(lit);
      if (!isFinite(v)) throw new FormulaError('lex', `Número inválido: ${lit}`);
      tokens.push({ t: 'num', v });
      i = j;
      continue;
    }

    // Sigilo `@`: referencia cross-protocolo `@<external_id>.<row><col?>`.
    if (c === '@') {
      const m = src.slice(i).match(RE_XREF);
      if (!m) throw new FormulaError('lex', `Sigilo '@' debe ir seguido de '<external_id>.<celda>'`);
      const externalId = m[1];
      const key = m[2] + (m[3] ? m[3].toUpperCase() : 'A');
      tokens.push({ t: 'xref', externalId, key });
      i += m[0].length;
      continue;
    }

    // Sigilo `#`: referencia a celda `#<n><L?>` o rango `#<n><L?>:#<n><L?>`.
    // Sin letra, columna A implícita.
    if (c === '#') {
      const m = src.slice(i).match(RE_CELL);
      if (!m) throw new FormulaError('lex', `Sigilo '#' debe ir seguido de un número (ej: #1 o #1A)`);
      // v42e (I2/L4) — normaliza ceros a la izquierda (`#01A`→`1A`) vía parseInt y
      // rechaza fila 0: antes `#01A` generaba la key '01A' (≠ scope key '1A') y daba
      // "Referencia desconocida"; ahora coincide. Consistente con normalizeRef().
      const fromRow = parseInt(m[1], 10);
      if (fromRow < 1) throw new FormulaError('lex', `Referencia con fila inválida (debe ser ≥1): #${m[1]}`);
      const fromKey = String(fromRow) + (m[2] ? m[2].toUpperCase() : 'A');
      let j = i + m[0].length;
      const rangeRest = src.slice(j);
      const rm = rangeRest.match(/^:#(\d+)([A-Za-z])?/);
      if (rm) {
        const toRow = parseInt(rm[1], 10);
        if (toRow < 1) throw new FormulaError('lex', `Rango con fila inválida (debe ser ≥1): #${rm[1]}`);
        const toKey = String(toRow) + (rm[2] ? rm[2].toUpperCase() : 'A');
        tokens.push({ t: 'range', from: fromKey, to: toKey });
        i = j + rm[0].length;
      } else {
        tokens.push({ t: 'id', v: fromKey });
        i = j;
      }
      continue;
    }

    if (isIdStart(c)) {
      let j = i + 1;
      while (j < n && isIdCont(src[j])) j++;
      tokens.push({ t: 'id', v: src.slice(i, j) });
      i = j;
      continue;
    }

    // Operadores multi-char
    const two = src.slice(i, i + 2);
    if (two === '>=' || two === '<=' || two === '==' || two === '!=' || two === '<>') {
      tokens.push({ t: 'op', v: two === '<>' ? '!=' : two });
      i += 2;
      continue;
    }
    if (c === '+' || c === '-' || c === '*' || c === '/' || c === '^' || c === '>' || c === '<' || c === '=') {
      tokens.push({ t: 'op', v: c === '=' ? '==' : c });
      i++;
      continue;
    }
    if (c === '(') { tokens.push({ t: 'lp' }); i++; continue; }
    if (c === ')') { tokens.push({ t: 'rp' }); i++; continue; }
    if (c === ',' || c === ';') { tokens.push({ t: 'comma' }); i++; continue; }

    throw new FormulaError('lex', `Carácter inesperado: ${c}`);
  }
  return tokens;
}

/** Expande un rango `#fromKey:#toKey` en la lista plana de keys.
 *  - Vertical (misma col):    `1A:4A` → ["1A","2A","3A","4A"]
 *  - Horizontal (misma fila): `1A:1D` → ["1A","1B","1C","1D"]
 *  - Si varían fila Y col → throw "Rango inválido"
 *  - Si from > to → throw "Rango invertido"
 */
export function expandRange(from: string, to: string): string[] {
  const mFrom = from.match(/^(\d+)([A-Z])$/);
  const mTo = to.match(/^(\d+)([A-Z])$/);
  if (!mFrom || !mTo) throw new FormulaError('range', `Rango con celda inválida: ${from}:${to}`);
  const fromRow = parseInt(mFrom[1], 10);
  const fromCol = mFrom[2];
  const toRow = parseInt(mTo[1], 10);
  const toCol = mTo[2];

  if (fromRow === toRow && fromCol === toCol) return [from];

  if (fromRow !== toRow && fromCol !== toCol) {
    throw new FormulaError('range', `Rango inválido: debe variar solo fila o solo columna (#${from}:#${to})`);
  }

  if (fromRow === toRow) {
    const a = fromCol.charCodeAt(0), b = toCol.charCodeAt(0);
    if (a > b) throw new FormulaError('range', `Rango invertido: #${from}:#${to}`);
    const out: string[] = [];
    for (let c = a; c <= b; c++) out.push(`${fromRow}${String.fromCharCode(c)}`);
    return out;
  } else {
    if (fromRow > toRow) throw new FormulaError('range', `Rango invertido: #${from}:#${to}`);
    const out: string[] = [];
    for (let r = fromRow; r <= toRow; r++) out.push(`${r}${fromCol}`);
    return out;
  }
}

/** Fila numérica de una key de scope (`"5B"` → 5). Null si la partida no es numérica. */
export function rowOfKey(key: string): number | null {
  const m = key.match(/^(\d+)[A-Z]$/);
  return m ? parseInt(m[1], 10) : null;
}

/** Columna (última letra) de una key de scope (`"5B"` → "B"). */
export function colOfKey(key: string): string {
  return key.slice(-1);
}

// ─── Parser (precedencia) ──────────────────────────────────────────────────
// expr   := cmp
// cmp    := add ( ( > < >= <= == != ) add )*
// add    := mul ( (+ -) mul )*
// mul    := pow ( (* /) pow )*
// pow    := unary ( ^ pow )?                      // asoc. derecha
// unary  := (+ -) unary | call
// call   := primary | ID '(' args ')'
// primary:= NUM | ID | '(' expr ')'
// args   := arg (',' arg)*
// arg    := RANGE | expr                          // RANGE solo dentro de args

type Node =
  | { type: 'num'; value: number }
  | { type: 'ref'; name: string }
  | { type: 'xref'; externalId: string; key: string }   // v26
  | { type: 'lit'; value: string }                   // literal identificador (args de LOOKUP/CELDA)
  | { type: 'group'; keys: string[] }                // rango expandido como UN argumento (v32)
  | { type: 'col'; col: string }                     // COLUMNA(X) — serie completa (v32)
  | { type: 'bin'; op: string; lhs: Node; rhs: Node }
  | { type: 'unary'; op: '-' | '+'; arg: Node }
  | { type: 'call'; name: string; args: Node[] };

class Parser {
  pos = 0;
  constructor(public tokens: Token[]) {}
  peek(): Token | null { return this.tokens[this.pos] ?? null; }
  next(): Token { return this.tokens[this.pos++]; }
  eatOp(op: string): boolean { const p = this.peek(); if (p && p.t === 'op' && p.v === op) { this.pos++; return true; } return false; }
  expect(cond: boolean, msg: string): void { if (!cond) throw new FormulaError('parse', msg); }
  // v42e (H3) — verifica fin de entrada: una fórmula como "#1A #2A" o "#1A2" dejaba
  // tokens colgados que el parser descartaba en silencio (valor erróneo, dependencia
  // invisible al topo-sort). Ahora se rechaza con error accionable.
  expectEof(): void { if (this.pos < this.tokens.length) throw new FormulaError('parse', 'Tokens sobrantes en la fórmula'); }

  parseExpr(): Node { return this.parseCmp(); }

  parseCmp(): Node {
    let lhs = this.parseAdd();
    while (true) {
      const p = this.peek();
      if (!p || p.t !== 'op') break;
      if (['>', '<', '>=', '<=', '==', '!='].includes(p.v)) {
        this.next();
        const rhs = this.parseAdd();
        lhs = { type: 'bin', op: p.v, lhs, rhs };
      } else break;
    }
    return lhs;
  }
  parseAdd(): Node {
    let lhs = this.parseMul();
    while (true) {
      const p = this.peek();
      if (p && p.t === 'op' && (p.v === '+' || p.v === '-')) {
        this.next();
        const rhs = this.parseMul();
        lhs = { type: 'bin', op: p.v, lhs, rhs };
      } else break;
    }
    return lhs;
  }
  parseMul(): Node {
    let lhs = this.parsePow();
    while (true) {
      const p = this.peek();
      if (p && p.t === 'op' && (p.v === '*' || p.v === '/')) {
        this.next();
        const rhs = this.parsePow();
        lhs = { type: 'bin', op: p.v, lhs, rhs };
      } else break;
    }
    return lhs;
  }
  parsePow(): Node {
    const lhs = this.parseUnary();
    if (this.eatOp('^')) {
      const rhs = this.parsePow(); // asoc derecha
      return { type: 'bin', op: '^', lhs, rhs };
    }
    return lhs;
  }
  parseUnary(): Node {
    const p = this.peek();
    if (p && p.t === 'op' && (p.v === '-' || p.v === '+')) {
      this.next();
      return { type: 'unary', op: p.v as '-' | '+', arg: this.parseUnary() };
    }
    return this.parseCall();
  }
  parseCall(): Node {
    const p = this.peek();
    if (p && p.t === 'id') {
      const name = p.v;
      const next = this.tokens[this.pos + 1];
      if (next && next.t === 'lp') {
        this.next(); this.next(); // id + '('
        const fname = name.toUpperCase();
        const args: Node[] = [];
        // LOOKUP(ref, matrixId, searchCol, returnCol): los args 2-4 son literales.
        if (fname === 'LOOKUP') {
          if (this.peek()?.t !== 'rp') {
            args.push(this.parseExpr());
            for (let argIdx = 1; argIdx <= 3; argIdx++) {
              this.expect(this.peek()?.t === 'comma', `LOOKUP requiere 4 argumentos`);
              this.next();
              const tok = this.next();
              if (!tok || tok.t !== 'id') {
                throw new FormulaError('parse', `LOOKUP arg ${argIdx + 1} debe ser un identificador literal (matriz o columna)`);
              }
              args.push({ type: 'lit', value: tok.v });
            }
          }
        } else if (fname === 'BUSCAR') {
          // v41 — BUSCAR(tabla, valor, columna): `tabla` y `columna` son
          // identificadores literales (nombre de tabla del proyecto y de columna);
          // `valor` es una expresión (la LLAVE buscada en la 1ª columna).
          const t1 = this.next();
          if (!t1 || t1.t !== 'id') throw new FormulaError('parse', 'BUSCAR: el 1er argumento debe ser el nombre de la tabla');
          args.push({ type: 'lit', value: t1.v });
          this.expect(this.peek()?.t === 'comma', 'BUSCAR(tabla, valor, columna) requiere 3 argumentos');
          this.next();
          args.push(this.parseExpr());
          this.expect(this.peek()?.t === 'comma', 'BUSCAR(tabla, valor, columna) requiere 3 argumentos');
          this.next();
          const t3 = this.next();
          if (!t3 || t3.t !== 'id') throw new FormulaError('parse', 'BUSCAR: el 3er argumento debe ser el nombre de la columna');
          args.push({ type: 'lit', value: t3.v });
        } else if (fname === 'CELDA') {
          // CELDA(Col [, filaExpr]) — Col es una letra literal (A-Z).
          const tok = this.next();
          if (!tok || tok.t !== 'id' || !/^[A-Za-z]$/.test(tok.v)) {
            throw new FormulaError('parse', `CELDA: el primer argumento debe ser una letra de columna (A-Z)`);
          }
          args.push({ type: 'lit', value: tok.v.toUpperCase() });
          if (this.peek()?.t === 'comma') {
            this.next();
            args.push(this.parseExpr());
          }
        } else if (fname === 'COLUMNA') {
          // COLUMNA(Col) — serie completa de la columna. Solo como argumento de función.
          const tok = this.next();
          if (!tok || tok.t !== 'id' || !/^[A-Za-z]$/.test(tok.v)) {
            throw new FormulaError('parse', `COLUMNA: el argumento debe ser una letra de columna (A-Z)`);
          }
          this.expect(this.peek()?.t === 'rp', `Falta ')' después de COLUMNA(`);
          this.next();
          return { type: 'col', col: tok.v.toUpperCase() };
        } else if (this.peek()?.t !== 'rp') {
          this.pushArg(args);
          while (this.peek()?.t === 'comma') { this.next(); this.pushArg(args); }
        }
        this.expect(this.peek()?.t === 'rp', `Falta ')' después de ${name}(`);
        this.next();
        return { type: 'call', name: fname, args };
      }
    }
    return this.parsePrimary();
  }
  /** Empuja un argumento. Un rango se agrupa como UN argumento (v32) para que
   *  las funciones de pares (SUMARSI, INTERPX, …) distingan series. Las funciones
   *  simples (SUMA, PROMEDIO, …) lo aplanan internamente — comportamiento idéntico
   *  al histórico. */
  pushArg(args: Node[]): void {
    const p = this.peek();
    if (p && p.t === 'range') {
      this.next();
      const refs = expandRange(p.from, p.to);
      args.push({ type: 'group', keys: refs });
      return;
    }
    args.push(this.parseExpr());
  }
  parsePrimary(): Node {
    const tok = this.next();
    if (!tok) throw new FormulaError('parse', 'Expresión vacía');
    if (tok.t === 'num') return { type: 'num', value: tok.v };
    if (tok.t === 'id')  return { type: 'ref', name: tok.v };
    if (tok.t === 'xref') return { type: 'xref', externalId: tok.externalId, key: tok.key };
    if (tok.t === 'range') throw new FormulaError('parse', `Rango #${tok.from}:#${tok.to} solo es válido dentro de argumentos de función`);
    if (tok.t === 'lp')  {
      const e = this.parseExpr();
      this.expect(this.peek()?.t === 'rp', `Falta ')'`);
      this.next();
      return e;
    }
    throw new FormulaError('parse', `Token inesperado: ${JSON.stringify(tok)}`);
  }
}

// ─── Helpers numéricos ─────────────────────────────────────────────────────
function _mean(a: number[]): number {
  if (a.length === 0) throw new FormulaError('args', 'Función requiere al menos un valor');
  return a.reduce((s, x) => s + x, 0) / a.length;
}
function _variance(a: number[], sample: boolean): number {
  if (a.length === 0) throw new FormulaError('args', 'Función requiere al menos un valor');
  if (sample && a.length < 2) throw new FormulaError('args', 'DESVEST requiere al menos 2 valores');
  const m = _mean(a);
  const ss = a.reduce((s, x) => s + (x - m) * (x - m), 0);
  return ss / (sample ? a.length - 1 : a.length);
}
function _quantile(sorted: number[], p: number): number {
  const n = sorted.length;
  if (n === 0) throw new FormulaError('args', 'PERCENTIL requiere al menos un valor');
  if (n === 1) return sorted[0];
  const idx = (p / 100) * (n - 1);
  const lo = Math.floor(idx), hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  const frac = idx - lo;
  return sorted[lo] * (1 - frac) + sorted[hi] * frac;
}

type Pt = { x: number; y: number };

/** Construye los pares (x,y) de dos series alineadas posicionalmente.
 *  Series de distinta longitud → error. Pares con algún vacío se omiten. */
function _pairs(xs: (number | null)[], ys: (number | null)[], fname: string): Pt[] {
  if (xs.length !== ys.length) {
    throw new FormulaError('args', `${fname}: las series X (${xs.length}) e Y (${ys.length}) deben tener la misma cantidad de valores`);
  }
  const out: Pt[] = [];
  for (let i = 0; i < xs.length; i++) {
    const x = xs[i], y = ys[i];
    if (x == null || y == null || !isFinite(x) || !isFinite(y)) continue;
    out.push({ x, y });
  }
  return out;
}

/** Regresión lineal por mínimos cuadrados. */
function _linreg(pts: Pt[], fname: string): { slope: number; intercept: number; r2: number } {
  if (pts.length < 2) throw new FormulaError('curva', `${fname}: se requieren al menos 2 puntos con X e Y llenos`);
  const n = pts.length;
  const sumX  = pts.reduce((s, p) => s + p.x, 0);
  const sumY  = pts.reduce((s, p) => s + p.y, 0);
  const sumXY = pts.reduce((s, p) => s + p.x * p.y, 0);
  const sumX2 = pts.reduce((s, p) => s + p.x * p.x, 0);
  const denom = n * sumX2 - sumX * sumX;
  if (denom === 0) throw new FormulaError('curva', `${fname}: todos los X son iguales — no hay recta posible`);
  const slope = (n * sumXY - sumX * sumY) / denom;
  const intercept = (sumY - slope * sumX) / n;
  const ssRes = pts.reduce((s, p) => { const yp = slope * p.x + intercept; return s + (p.y - yp) ** 2; }, 0);
  const ssTot = pts.reduce((s, p) => s + (p.y - sumY / n) ** 2, 0);
  const r2 = ssTot !== 0 ? 1 - ssRes / ssTot : 1;
  return { slope, intercept, r2 };
}

/** Ajuste polinómico de grado `deg` por mínimos cuadrados (ecuaciones normales +
 *  eliminación gaussiana con pivoteo). Devuelve coeficientes [c0, c1, …] o null
 *  si el sistema es degenerado (p.ej. X repetidos). */
function _polyfit(pts: Pt[], deg: number): number[] | null {
  const n = deg + 1;
  const A: number[][] = Array.from({ length: n }, () => Array(n).fill(0));
  const B: number[] = Array(n).fill(0);
  for (const p of pts) {
    const pows: number[] = [1];
    for (let k = 1; k <= 2 * deg; k++) pows.push(pows[k - 1] * p.x);
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) A[r][c] += pows[r + c];
      B[r] += pows[r] * p.y;
    }
  }
  for (let col = 0; col < n; col++) {
    let piv = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(A[r][col]) > Math.abs(A[piv][col])) piv = r;
    if (Math.abs(A[piv][col]) < 1e-12) return null;
    [A[col], A[piv]] = [A[piv], A[col]];
    [B[col], B[piv]] = [B[piv], B[col]];
    for (let r = col + 1; r < n; r++) {
      const f = A[r][col] / A[col][col];
      for (let c = col; c < n; c++) A[r][c] -= f * A[col][c];
      B[r] -= f * B[col];
    }
  }
  const coef = Array(n).fill(0);
  for (let r = n - 1; r >= 0; r--) {
    let s = B[r];
    for (let c = r + 1; c < n; c++) s -= A[r][c] * coef[c];
    coef[r] = s / A[r][r];
  }
  return coef;
}

function _polyval(coef: number[], x: number): number {
  let v = 0;
  for (let i = coef.length - 1; i >= 0; i--) v = v * x + coef[i];
  return v;
}

/** Máximo de la curva ajustada — ALGEBRAICO (v34): se deriva el polinomio, se
 *  iguala a cero y se resuelve en forma cerrada (vértice para grado 2; raíces
 *  de la cuadrática derivada para grado 3). Los extremos del dominio de datos
 *  entran como candidatos (si el máximo analítico cae fuera del rango medido,
 *  gana el borde). Centrar X antes de ajustar mejora el condicionamiento sin
 *  cambiar el resultado. */
function _puntoMaximo(pts: Pt[], deg: number, coord: 'x' | 'y', fname: string): number {
  if (deg !== 2 && deg !== 3) throw new FormulaError('args', `${fname}: grado debe ser 2 ó 3`);
  if (pts.length < deg + 1) throw new FormulaError('curva', `${fname}: se requieren al menos ${deg + 1} puntos llenos para grado ${deg}`);
  const mx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
  const centered = pts.map(p => ({ x: p.x - mx, y: p.y }));
  const xsC = centered.map(p => p.x);
  const lo = Math.min(...xsC), hi = Math.max(...xsC);
  if (lo === hi) throw new FormulaError('curva', `${fname}: todos los X son iguales`);
  const coef = _polyfit(centered, deg);
  if (!coef) throw new FormulaError('curva', `${fname}: ajuste degenerado (¿X repetidos?)`);

  // Candidatos: bordes del dominio + raíces de la derivada dentro del dominio.
  const candidates: number[] = [lo, hi];
  if (deg === 2) {
    // y = c0 + c1·x + c2·x² → y' = c1 + 2·c2·x = 0 → x* = -c1 / (2·c2)
    if (Math.abs(coef[2]) > 1e-12) candidates.push(-coef[1] / (2 * coef[2]));
  } else {
    // y = c0 + c1·x + c2·x² + c3·x³ → y' = c1 + 2·c2·x + 3·c3·x² = 0
    const a = 3 * coef[3], b = 2 * coef[2], c = coef[1];
    if (Math.abs(a) < 1e-12) {
      if (Math.abs(b) > 1e-12) candidates.push(-c / b);
    } else {
      const disc = b * b - 4 * a * c;
      if (disc >= 0) {
        const sq = Math.sqrt(disc);
        candidates.push((-b + sq) / (2 * a), (-b - sq) / (2 * a));
      }
    }
  }

  let bestX = lo, bestY = -Infinity;
  for (const x of candidates) {
    if (!isFinite(x) || x < lo - 1e-9 || x > hi + 1e-9) continue;
    const xc = Math.min(hi, Math.max(lo, x));
    const y = _polyval(coef, xc);
    if (y > bestY) { bestY = y; bestX = xc; }
  }
  return coord === 'x' ? bestX + mx : bestY;
}

/** Interpolación lineal Y(x) sobre la serie ordenada por X. */
function _interpY(pts: Pt[], x: number, fname: string): number {
  if (pts.length < 2) throw new FormulaError('curva', `${fname}: se requieren al menos 2 puntos llenos`);
  const s = [...pts].sort((a, b) => a.x - b.x);
  if (x < s[0].x || x > s[s.length - 1].x) {
    throw new FormulaError('interp', `${fname}: x=${x} fuera del rango de la serie [${s[0].x}, ${s[s.length - 1].x}]`);
  }
  for (let i = 0; i < s.length - 1; i++) {
    const a = s[i], b = s[i + 1];
    if (x >= a.x && x <= b.x) {
      if (a.x === b.x) return a.y;
      return a.y + ((x - a.x) * (b.y - a.y)) / (b.x - a.x);
    }
  }
  return s[s.length - 1].y;
}

/** X donde la serie (ordenada por X) cruza el Y objetivo. `logX` interpola
 *  sobre log10(x) — el estándar para tamaños de partícula (P50/P80/D60). */
function _interpX(pts: Pt[], yTarget: number, logX: boolean, fname: string): number {
  if (pts.length < 2) throw new FormulaError('curva', `${fname}: se requieren al menos 2 puntos llenos`);
  if (logX && pts.some(p => p.x <= 0)) {
    throw new FormulaError('interp', `${fname}: todos los X deben ser > 0 en escala log`);
  }
  const s = [...pts].sort((a, b) => a.x - b.x);
  const tx = (x: number) => (logX ? Math.log10(x) : x);
  for (let i = 0; i < s.length - 1; i++) {
    const a = s[i], b = s[i + 1];
    const yLo = Math.min(a.y, b.y), yHi = Math.max(a.y, b.y);
    if (yTarget < yLo || yTarget > yHi) continue;
    if (a.y === b.y) return a.x;             // segmento plano que toca el target
    const f = (yTarget - a.y) / (b.y - a.y);
    const lx = tx(a.x) + f * (tx(b.x) - tx(a.x));
    return logX ? Math.pow(10, lx) : lx;
  }
  throw new FormulaError('interp', `${fname}: y=${yTarget} no es cruzado por la serie`);
}

// ─── Funciones simples (args aplanados) ────────────────────────────────────
const FUNCS: Record<string, (args: number[]) => number> = {
  SUMA:        (a) => a.reduce((s, x) => s + x, 0),
  PROMEDIO:    (a) => a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0,
  MAX:         (a) => Math.max(...a),
  MIN:         (a) => Math.min(...a),
  ABS:         (a) => Math.abs(a[0]),
  REDONDEAR:   (a) => { const p = Math.pow(10, a[1] ?? 0); return Math.round(a[0] * p) / p; },
  RAIZ:        (a) => Math.sqrt(a[0]),
  POTENCIA:    (a) => Math.pow(a[0], a[1]),
  DESVEST:     (a) => Math.sqrt(_variance(a, true)),
  DESVESTP:    (a) => Math.sqrt(_variance(a, false)),
  CV: (a) => {
    const m = _mean(a);
    if (m === 0) throw new FormulaError('div0', 'CV indefinido: media = 0');
    return (Math.sqrt(_variance(a, true)) / Math.abs(m)) * 100;
  },
  MEDIANA: (a) => {
    if (a.length === 0) throw new FormulaError('args', 'MEDIANA requiere al menos un valor');
    const s = [...a].sort((x, y) => x - y);
    const mid = Math.floor(s.length / 2);
    return s.length % 2 === 0 ? (s[mid - 1] + s[mid]) / 2 : s[mid];
  },
  PERCENTIL: (a) => {
    if (a.length < 2) throw new FormulaError('args', 'PERCENTIL requiere al menos 2 args (datos…, p)');
    const p = a[a.length - 1];
    if (!isFinite(p) || p < 0 || p > 100) throw new FormulaError('args', 'PERCENTIL: p debe estar en [0,100]');
    const data = a.slice(0, -1).sort((x, y) => x - y);
    return _quantile(data, p);
  },
  OUTLIER: (a) => {
    if (a.length < 4) return 0;
    const candidate = a[a.length - 1];
    const rest = [...a.slice(0, -1)].sort((x, y) => x - y);
    const q1 = _quantile(rest, 25);
    const q3 = _quantile(rest, 75);
    const iqr = q3 - q1;
    const lo = q1 - 1.5 * iqr;
    const hi = q3 + 1.5 * iqr;
    return candidate < lo || candidate > hi ? 1 : 0;
  },

  // ── v32: lógica numérica ──────────────────────────────────────────────
  Y:  (a) => { if (a.length === 0) throw new FormulaError('args', 'Y requiere al menos un argumento'); return a.every(v => v !== 0) ? 1 : 0; },
  O:  (a) => { if (a.length === 0) throw new FormulaError('args', 'O requiere al menos un argumento'); return a.some(v => v !== 0) ? 1 : 0; },
  NO: (a) => { if (a.length !== 1) throw new FormulaError('args', 'NO requiere exactamente 1 argumento'); return a[0] === 0 ? 1 : 0; },

  // ── v32: matemática adicional ─────────────────────────────────────────
  LOG: (a) => {
    const x = a[0]; const base = a[1] ?? 10;
    if (!(x > 0)) throw new FormulaError('args', 'LOG requiere x > 0');
    if (!(base > 0) || base === 1) throw new FormulaError('args', 'LOG: base debe ser > 0 y ≠ 1');
    return Math.log(x) / Math.log(base);
  },
  LN:  (a) => { if (!(a[0] > 0)) throw new FormulaError('args', 'LN requiere x > 0'); return Math.log(a[0]); },
  EXP: (a) => Math.exp(a[0]),
  PI:  () => Math.PI,
  SENO:   (a) => Math.sin(a[0]),
  COSENO: (a) => Math.cos(a[0]),
  TAN:    (a) => Math.tan(a[0]),
  ATAN:   (a) => Math.atan(a[0]),
  ENTERO: (a) => Math.floor(a[0]),
  RESIDUO: (a) => {
    if (a.length !== 2) throw new FormulaError('args', 'RESIDUO requiere 2 argumentos');
    if (a[1] === 0) throw new FormulaError('div0', 'RESIDUO: divisor 0');
    return a[0] - a[1] * Math.floor(a[0] / a[1]);
  },
  MODA: (a) => {
    if (a.length === 0) throw new FormulaError('args', 'MODA requiere al menos un valor');
    const counts = new Map<number, number>();
    for (const v of a) counts.set(v, (counts.get(v) ?? 0) + 1);
    let best: number | null = null, bestN = 1;
    counts.forEach((n, v) => {
      if (n > bestN || (n === bestN && best != null && v < best)) { best = v; bestN = n; }
    });
    if (best == null) throw new FormulaError('args', 'MODA: ningún valor se repite');
    return best;
  },
};

/** Funciones que reciben los argumentos como GRUPOS (series con vacíos),
 *  no aplanados. Los rangos y COLUMNA conservan posición y nulls. */
const GROUP_FNS = new Set([
  'SUMARSI', 'PROMEDIOSI', 'CONTARSI', 'CONTAR',
  'INTERPY', 'INTERPX', 'INTERPXLOG',
  'PUNTOMAXIMOX', 'PUNTOMAXIMOY', 'PENDIENTE', 'INTERSECCION', 'R2',
]);

class NullPropagation { constructor(public message = 'null') {} }

/** v26 — Valores de referencias cross-protocolo, keyed por `<externalId>.<key>`. */
export type XrefValues = Record<string, number | null>;

/** v41 — Tablas auxiliares de laboratorio a nivel proyecto (grupos: taras, moldes,
 *  fiolas, densidad-agua), keyed por `group_key` (minúsculas). La 1ª columna es la
 *  LLAVE. Las usa la función `BUSCAR(tabla, valor, columna)`. */
export type AuxTables = Record<string, { columns: string[]; rows: string[][] }>;

/** Contexto de evaluación de una celda (v32): habilita FILA()/CELDA()/COLUMNA(). */
export interface EvalCtx {
  /** Key de la celda que se está evaluando (`"5B"`). */
  currentKey?: string;
  /** v41 — Tablas auxiliares del proyecto, para `BUSCAR()`. */
  auxTables?: AuxTables;
}

interface Env {
  scope: Scope;
  matrices?: Matrices;
  textValues?: Record<string, string>;
  xrefValues?: XrefValues;
  auxTables?: AuxTables;
  currentKey?: string;
  currentRow: number | null;
}

/** Resuelve estáticamente la expresión de fila de CELDA: números, ± * /, FILA().
 *  Cualquier otra cosa (refs, otras funciones) → error claro. */
function staticRowExpr(node: Node, currentRow: number | null): number {
  switch (node.type) {
    case 'num': return node.value;
    case 'unary': {
      const v = staticRowExpr(node.arg, currentRow);
      return node.op === '-' ? -v : v;
    }
    case 'bin': {
      const l = staticRowExpr(node.lhs, currentRow);
      const r = staticRowExpr(node.rhs, currentRow);
      switch (node.op) {
        case '+': return l + r;
        case '-': return l - r;
        case '*': return l * r;
        case '/': if (r === 0) throw new FormulaError('celda', 'División por 0 en índice de CELDA'); return l / r;
        default: throw new FormulaError('celda', `Operador '${node.op}' no permitido en índice de CELDA`);
      }
    }
    case 'call':
      if (node.name === 'FILA') {
        if (currentRow == null) throw new FormulaError('fila', 'FILA() requiere que la fila tenga partida numérica');
        return currentRow;
      }
      throw new FormulaError('celda', `Función ${node.name} no permitida en índice de CELDA — usa números o FILA()±k`);
    default:
      throw new FormulaError('celda', 'El índice de fila de CELDA debe ser un número fijo o FILA()±k');
  }
}

function resolveCeldaKey(args: Node[], currentRow: number | null, currentKey?: string): string {
  const colNode = args[0];
  if (!colNode || colNode.type !== 'lit') throw new FormulaError('celda', 'CELDA: falta la letra de columna');
  const col = colNode.value.toUpperCase();
  let row: number;
  if (args.length >= 2) {
    const raw = staticRowExpr(args[1], currentRow);
    row = Math.round(raw);
    if (Math.abs(raw - row) > 1e-9) throw new FormulaError('celda', `CELDA: índice de fila no entero (${raw})`);
  } else {
    if (currentRow == null) throw new FormulaError('fila', 'CELDA sin fila requiere que la fila actual tenga partida numérica');
    row = currentRow;
  }
  if (row < 1) return '';   // fila inexistente → vacío (permite guardas SI(FILA()>1, …))
  const key = `${row}${col}`;
  if (currentKey && key === currentKey) {
    throw new FormulaError('celda', `CELDA(${col}, ${row}) referencia a la propia celda`);
  }
  return key;
}

/** Expande la serie de una columna desde el scope, en orden de fila, conservando
 *  vacíos (null) para alineamiento posicional. Excluye la celda actual. */
function expandColumnVals(scope: Scope, col: string, currentKey?: string): (number | null)[] {
  const numeric: { row: number; key: string }[] = [];
  const others: string[] = [];
  for (const k of Object.keys(scope)) {
    if (colOfKey(k) !== col) continue;
    if (currentKey && k === currentKey) continue;
    const r = rowOfKey(k);
    if (r != null) numeric.push({ row: r, key: k });
    else others.push(k);
  }
  numeric.sort((a, b) => a.row - b.row);
  others.sort();
  return [...numeric.map(e => scope[e.key]), ...others.map(k => scope[k])];
}

type ArgGroup = { vals: (number | null)[]; origin: 'range' | 'col' | 'scalar' };

function evalArgGroups(args: Node[], env: Env, tolerateNullScalar = false): ArgGroup[] {
  const out: ArgGroup[] = [];
  for (const a of args) {
    if (a.type === 'group') {
      const vals = a.keys.map(k => {
        if (!(k in env.scope)) throw new FormulaError('ref', `Referencia desconocida: #${k}`);
        return env.scope[k];
      });
      out.push({ vals, origin: 'range' });
    } else if (a.type === 'col') {
      out.push({ vals: expandColumnVals(env.scope, a.col, env.currentKey), origin: 'col' });
    } else if (tolerateNullScalar) {
      // v42e (L5) — solo para CONTAR/CONTARSI: un escalar vacío (`CONTAR(#2A)` con
      // #2A en blanco) se representa como null para contar 0, en vez de propagar
      // NullPropagation y dejar la fórmula vacía. El resto de funciones conservan
      // su semántica (escalar vacío → fórmula vacía).
      let v: number | null;
      try { v = evalNode(a, env); }
      catch (e) { if (e instanceof NullPropagation) v = null; else throw e; }
      out.push({ vals: [v], origin: 'scalar' });
    } else {
      out.push({ vals: [evalNode(a, env)], origin: 'scalar' });
    }
  }
  return out;
}

/** Aplana grupos para funciones simples, preservando el comportamiento histórico:
 *  - rango / escalar con vacío → propaga null (la fórmula queda vacía)
 *  - COLUMNA con vacíos → los ignora (suma/promedio de lo llenado) */
function flattenGroups(groups: ArgGroup[]): number[] {
  const flat: number[] = [];
  for (const g of groups) {
    for (const v of g.vals) {
      if (v == null) {
        if (g.origin === 'col') continue;
        throw new NullPropagation();
      }
      flat.push(v);
    }
  }
  return flat;
}

function requireScalar(g: ArgGroup | undefined, fname: string, what: string): number {
  if (!g || g.origin !== 'scalar' || g.vals.length !== 1 || g.vals[0] == null) {
    throw new FormulaError('args', `${fname}: ${what} debe ser un valor único`);
  }
  return g.vals[0];
}

function evalGroupFn(name: string, groups: ArgGroup[], _env: Env): number {
  switch (name) {
    case 'CONTAR': {
      if (groups.length === 0) throw new FormulaError('args', 'CONTAR requiere al menos un argumento');
      let n = 0;
      for (const g of groups) for (const v of g.vals) if (v != null) n++;
      return n;
    }
    case 'CONTARSI': {
      if (groups.length !== 1) throw new FormulaError('args', 'CONTARSI(condiciones) requiere exactamente 1 serie');
      let n = 0;
      for (const v of groups[0].vals) if (v != null && v !== 0) n++;
      return n;
    }
    case 'SUMARSI':
    case 'PROMEDIOSI': {
      if (groups.length !== 2) throw new FormulaError('args', `${name}(valores, condiciones) requiere exactamente 2 series`);
      const vals = groups[0].vals, conds = groups[1].vals;
      if (vals.length !== conds.length) {
        throw new FormulaError('args', `${name}: las series deben tener la misma cantidad (${vals.length} vs ${conds.length})`);
      }
      let sum = 0, n = 0;
      for (let i = 0; i < vals.length; i++) {
        const v = vals[i], c = conds[i];
        if (v == null || c == null || c === 0) continue;
        sum += v; n++;
      }
      if (name === 'SUMARSI') return sum;
      if (n === 0) throw new NullPropagation();   // sin pares aún → fórmula vacía
      return sum / n;
    }
    case 'PENDIENTE':
    case 'INTERSECCION':
    case 'R2': {
      if (groups.length !== 2) throw new FormulaError('args', `${name}(xs, ys) requiere exactamente 2 series`);
      const pts = _pairs(groups[0].vals, groups[1].vals, name);
      const r = _linreg(pts, name);
      return name === 'PENDIENTE' ? r.slope : name === 'INTERSECCION' ? r.intercept : r.r2;
    }
    case 'INTERPY': {
      if (groups.length !== 3) throw new FormulaError('args', 'INTERPY(xs, ys, x) requiere 3 argumentos');
      const pts = _pairs(groups[0].vals, groups[1].vals, name);
      const x = requireScalar(groups[2], name, 'x');
      return _interpY(pts, x, name);
    }
    case 'INTERPX':
    case 'INTERPXLOG': {
      if (groups.length !== 3) throw new FormulaError('args', `${name}(xs, ys, yObjetivo) requiere 3 argumentos`);
      const pts = _pairs(groups[0].vals, groups[1].vals, name);
      const y = requireScalar(groups[2], name, 'yObjetivo');
      return _interpX(pts, y, name === 'INTERPXLOG', name);
    }
    case 'PUNTOMAXIMOX':
    case 'PUNTOMAXIMOY': {
      if (groups.length !== 2 && groups.length !== 3) {
        throw new FormulaError('args', `${name}(xs, ys [, grado]) requiere 2 ó 3 argumentos`);
      }
      const pts = _pairs(groups[0].vals, groups[1].vals, name);
      const deg = groups.length === 3 ? Math.round(requireScalar(groups[2], name, 'grado')) : 2;
      return _puntoMaximo(pts, deg, name === 'PUNTOMAXIMOX' ? 'x' : 'y', name);
    }
    default:
      throw new FormulaError('func', `Función desconocida: ${name}`);
  }
}

function evalNode(n: Node, env: Env): number {
  switch (n.type) {
    case 'num': return n.value;
    case 'lit': throw new FormulaError('parse', `Literal '${n.value}' fuera de contexto válido`);
    case 'group': throw new FormulaError('parse', 'Un rango solo es válido como argumento de una función');
    case 'col': throw new FormulaError('parse', 'COLUMNA solo es válida como argumento de una función');
    case 'ref': {
      if (!(n.name in env.scope)) throw new FormulaError('ref', `Referencia desconocida: #${n.name}`);
      const v = env.scope[n.name];
      if (v == null) throw new NullPropagation();
      return v;
    }
    case 'xref': {
      // Distinguimos no-soportado (xrefValues nunca pasado) vs no-encontrado
      // (xrefValues definido pero la key no resuelve). Diferenciar evita
      // mensajes engañosos en plataformas que aún no implementan xrefs.
      if (!env.xrefValues) {
        throw new FormulaError('xref-unsupported',
          `Referencia cruzada @${n.externalId}.${n.key} no soportada en este contexto.`);
      }
      const fullKey = `${n.externalId}.${n.key}`;
      if (!(fullKey in env.xrefValues)) {
        throw new FormulaError('xref-missing',
          `Protocolo @${n.externalId} no encontrado o no aprobado (ref @${n.externalId}.${n.key})`);
      }
      const v = env.xrefValues[fullKey];
      if (v == null) throw new NullPropagation();
      return v;
    }
    case 'unary': {
      const v = evalNode(n.arg, env);
      return n.op === '-' ? -v : v;
    }
    case 'bin': {
      const l = evalNode(n.lhs, env);
      const r = evalNode(n.rhs, env);
      switch (n.op) {
        case '+': return l + r;
        case '-': return l - r;
        case '*': return l * r;
        case '/': if (r === 0) throw new FormulaError('div0', 'Error: división por 0'); return l / r;
        case '^': return Math.pow(l, r);
        case '>':  return l >  r ? 1 : 0;
        case '<':  return l <  r ? 1 : 0;
        case '>=': return l >= r ? 1 : 0;
        case '<=': return l <= r ? 1 : 0;
        case '==': return l === r ? 1 : 0;
        case '!=': return l !== r ? 1 : 0;
        default: throw new FormulaError('op', `Operador desconocido: ${n.op}`);
      }
    }
    case 'call': {
      // ── SI lazy (v32): evalúa la condición y SOLO la rama elegida.
      // Sin 3er argumento y condición falsa → vacío (null), estilo IF de 2 args.
      if (n.name === 'SI') {
        if (n.args.length < 2 || n.args.length > 3) {
          throw new FormulaError('args', 'SI requiere 2 ó 3 argumentos: SI(cond, siVerdad [, siFalso])');
        }
        const cond = evalNode(n.args[0], env);
        if (cond !== 0) return evalNode(n.args[1], env);
        if (n.args.length === 3) return evalNode(n.args[2], env);
        throw new NullPropagation();
      }

      // ── ESVACIO (v32): única función que NO propaga el null del argumento.
      if (n.name === 'ESVACIO') {
        if (n.args.length !== 1) throw new FormulaError('args', 'ESVACIO requiere exactamente 1 argumento');
        const a = n.args[0];
        if (a.type === 'group' || a.type === 'col') {
          throw new FormulaError('args', 'ESVACIO espera una sola celda — para series usa CONTAR');
        }
        try {
          evalNode(a, env);
          return 0;
        } catch (e) {
          if (e instanceof NullPropagation) return 1;
          throw e;
        }
      }

      // ── SIERROR (v32): error → alternativa. Vacío sigue siendo vacío.
      if (n.name === 'SIERROR') {
        if (n.args.length !== 2) throw new FormulaError('args', 'SIERROR requiere 2 argumentos: SIERROR(expr, alternativa)');
        try {
          return evalNode(n.args[0], env);
        } catch (e) {
          if (e instanceof NullPropagation) throw e;
          if (e instanceof FormulaError) return evalNode(n.args[1], env);
          throw e;
        }
      }

      // ── FILA (v32)
      if (n.name === 'FILA') {
        if (n.args.length !== 0) throw new FormulaError('args', 'FILA() no lleva argumentos');
        if (env.currentRow == null) throw new FormulaError('fila', 'FILA() requiere que la fila tenga partida numérica');
        return env.currentRow;
      }

      // ── CELDA (v32)
      if (n.name === 'CELDA') {
        const key = resolveCeldaKey(n.args, env.currentRow, env.currentKey);
        if (key === '' || !(key in env.scope)) throw new NullPropagation();
        const v = env.scope[key];
        if (v == null) throw new NullPropagation();
        return v;
      }

      if (n.name === 'LOOKUP') {
        if (!env.matrices) throw new FormulaError('lookup', 'LOOKUP requiere matrices auxiliares');
        if (n.args.length !== 4) throw new FormulaError('lookup', 'LOOKUP requiere 4 argumentos');
        // arg[0]: clave (puede venir de texto o número)
        const a0 = n.args[0];
        let refKey: string;
        if (a0.type === 'ref') {
          if (env.textValues && env.textValues[a0.name] != null && env.textValues[a0.name] !== '') {
            refKey = env.textValues[a0.name];
          } else {
            const v = env.scope[a0.name];
            if (v == null) throw new NullPropagation();
            refKey = String(v);
          }
        } else {
          refKey = String(evalNode(a0, env));
        }
        const matrixId = (n.args[1] as { type: 'lit'; value: string }).value;
        const searchCol = (n.args[2] as { type: 'lit'; value: string }).value.toUpperCase();
        const returnCol = (n.args[3] as { type: 'lit'; value: string }).value.toUpperCase();
        const m = env.matrices[matrixId];
        if (!m) throw new FormulaError('lookup', `Matriz ${matrixId} no encontrada`);
        const sIdx = searchCol.charCodeAt(0) - 65;
        const rIdx = returnCol.charCodeAt(0) - 65;
        const row = m.rows.find(r => (r[sIdx] ?? '') === refKey);
        if (!row) throw new FormulaError('lookup', `LOOKUP: "${refKey}" no encontrado en ${matrixId}.${searchCol}`);
        const result = row[rIdx];
        if (result == null) throw new FormulaError('lookup', `LOOKUP: ${matrixId}.${returnCol} vacío`);
        const num = Number(String(result).replace(',', '.'));
        if (!isFinite(num)) throw new FormulaError('lookup', `LOOKUP no devuelve número`);
        return num;
      }

      // ── BUSCAR (v41): lookup en tabla auxiliar del PROYECTO por nombre de columna.
      // BUSCAR(tabla, valor, columna): busca `valor` en la 1ª columna (LLAVE) de la
      // tabla `tabla` y devuelve `columna` de esa fila. Devuelve número.
      if (n.name === 'BUSCAR') {
        if (!env.auxTables) throw new FormulaError('buscar', 'BUSCAR requiere las tablas auxiliares del proyecto');
        if (n.args.length !== 3) throw new FormulaError('buscar', 'BUSCAR(tabla, valor, columna) requiere 3 argumentos');
        const tableKey = (n.args[0] as { type: 'lit'; value: string }).value.toLowerCase();
        const colName = (n.args[2] as { type: 'lit'; value: string }).value;
        // valor: usa el texto de la celda si existe (la LLAVE puede ser código no-numérico).
        const a1 = n.args[1];
        let needle: string;
        if (a1.type === 'ref') {
          if (env.textValues && env.textValues[a1.name] != null && env.textValues[a1.name] !== '') {
            needle = env.textValues[a1.name];
          } else {
            const v = env.scope[a1.name];
            if (v == null) throw new NullPropagation();
            needle = String(v);
          }
        } else {
          needle = String(evalNode(a1, env));
        }
        const tbl = env.auxTables[tableKey];
        if (!tbl) throw new FormulaError('buscar', `Tabla auxiliar "${tableKey}" no encontrada`);
        const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
        const retIdx = tbl.columns.findIndex(c => norm(c) === norm(colName));
        if (retIdx < 0) throw new FormulaError('buscar', `Columna "${colName}" no existe en la tabla "${tableKey}"`);
        // Match por LLAVE (1ª columna): exacto por texto, o equivalencia numérica
        // (tolera "007" vs "7", "13.0" vs "13", coma decimal). Evita falsos negativos
        // con códigos de lab que Excel normaliza distinto a lo tipeado.
        const keyEq = (a: string, b: string): boolean => {
          if (a === b) return true;
          const na = Number(String(a).replace(',', '.')), nb = Number(String(b).replace(',', '.'));
          return isFinite(na) && isFinite(nb) && na === nb;
        };
        const row = tbl.rows.find(r => keyEq(r[0] ?? '', needle));
        if (!row) throw new FormulaError('buscar', `"${needle}" no encontrado en la llave de "${tableKey}"`);
        const result = row[retIdx];
        if (result == null || result === '') throw new FormulaError('buscar', `"${tableKey}".${colName} vacío para "${needle}"`);
        const num = Number(String(result).replace(',', '.'));
        if (!isFinite(num)) throw new FormulaError('buscar', `BUSCAR no devuelve un número (${result})`);
        return num;
      }

      // ── Funciones de series (v32): reciben grupos con vacíos.
      if (GROUP_FNS.has(n.name)) {
        // v42e (L5) — CONTAR/CONTARSI toleran celdas escalares vacías (cuentan 0).
        const tolerateNullScalar = n.name === 'CONTAR' || n.name === 'CONTARSI';
        const groups = evalArgGroups(n.args, env, tolerateNullScalar);
        return evalGroupFn(n.name, groups, env);
      }

      const fn = FUNCS[n.name];
      if (!fn) throw new FormulaError('func', `Función desconocida: ${n.name}`);
      const groups = evalArgGroups(n.args, env);
      return fn(flattenGroups(groups));
    }
  }
}

/** Evalúa una fórmula contra un scope (+ matrices, textValues, xrefValues y ctx
 *  de fila opcionales). Devuelve el número, o null si alguna referencia es null
 *  (propagación), o throw FormulaError para otros casos. */
export function evalFormula(
  expr: string,
  scope: Scope,
  matrices?: Matrices,
  textValues?: Record<string, string>,
  xrefValues?: XrefValues,
  ctx?: EvalCtx,
): number | null {
  const tokens = tokenize(expr);
  if (tokens.length === 0) return null;
  const parser = new Parser(tokens);
  const node = parser.parseExpr();
  parser.expectEof();
  const currentKey = ctx?.currentKey;
  const env: Env = {
    scope, matrices, textValues, xrefValues, auxTables: ctx?.auxTables, currentKey,
    currentRow: currentKey ? rowOfKey(currentKey) : null,
  };
  try {
    return evalNode(node, env);
  } catch (e) {
    if (e instanceof NullPropagation) return null;
    throw e;
  }
}

/** v26 — Extrae las xrefs `@<external_id>.<row><col?>` de una fórmula. */
export function extractXrefs(expr: string): { externalId: string; key: string }[] {
  const tokens = tokenize(expr);
  if (tokens.length === 0) return [];
  const out: { externalId: string; key: string }[] = [];
  for (const t of tokens) {
    if (t.t === 'xref') out.push({ externalId: t.externalId, key: t.key });
  }
  return out;
}

/** Contexto opcional para extraer dependencias dinámicas (v32):
 *  - currentKey: key de la celda dueña de la fórmula (habilita FILA()).
 *  - allKeys: todas las keys del protocolo (habilita COLUMNA → deps exactas). */
export interface RefCtx {
  currentKey?: string;
  allKeys?: string[];
}

/** Extrae los identificadores referenciados por una fórmula (para detección de
 *  dependencias / ciclos). Expande rangos, CELDA estática y COLUMNA (con ctx).
 *  No incluye nombres de funciones ni literales de LOOKUP.
 *
 *  Sin `ctx`: CELDA con FILA() y COLUMNA se omiten (best-effort para UIs).
 *  Con `ctx`: CELDA no resoluble → throw (error accionable de la celda). */
export function extractRefs(expr: string, ctx?: RefCtx): string[] {
  const tokens = tokenize(expr);
  if (tokens.length === 0) return [];
  let node: Node;
  try {
    const parser = new Parser(tokens);
    node = parser.parseExpr();
    parser.expectEof();
  } catch {
    // Si falla parse, caemos al fallback simple por tokens (no detecta LOOKUP literals).
    // Solo ids con forma de key de scope (`<fila><col>`, ej. "3B") cuentan como refs —
    // sin este filtro, letras sueltas (la columna de un CELDA(B mal cerrado) entraban
    // como refs falsas y ensuciaban la detección de dependencias del validador.
    const refs: string[] = [];
    for (let i = 0; i < tokens.length; i++) {
      const t = tokens[i];
      if (t.t === 'range') { for (const r of expandRange(t.from, t.to)) refs.push(r); continue; }
      if (t.t === 'id') {
        const next = tokens[i + 1];
        if (!(next && next.t === 'lp') && /^\d+[A-Z]$/.test(t.v)) refs.push(t.v);
      }
    }
    return refs;
  }
  const refs: string[] = [];
  const currentRow = ctx?.currentKey ? rowOfKey(ctx.currentKey) : null;
  walkRefs(node, refs, ctx, currentRow);
  return refs;
}

/** Recolector recursivo de refs reales (ignora `lit` nodes y nombres de función).
 *  `xref` queda fuera — son refs externas, no entran al topo-sort interno. */
function walkRefs(n: Node, out: string[], ctx: RefCtx | undefined, currentRow: number | null): void {
  switch (n.type) {
    case 'num':
    case 'lit':
    case 'xref':
      return;
    case 'ref':
      out.push(n.name);
      return;
    case 'group':
      for (const k of n.keys) out.push(k);
      return;
    case 'col': {
      // Con ctx.allKeys → dependencia exacta sobre toda la columna (menos la
      // propia celda). Sin ctx → se omite (los consumidores UI son tolerantes).
      if (ctx?.allKeys) {
        for (const k of ctx.allKeys) {
          if (colOfKey(k) !== n.col) continue;
          if (ctx.currentKey && k === ctx.currentKey) continue;
          out.push(k);
        }
      }
      return;
    }
    case 'unary':
      walkRefs(n.arg, out, ctx, currentRow);
      return;
    case 'bin':
      walkRefs(n.lhs, out, ctx, currentRow);
      walkRefs(n.rhs, out, ctx, currentRow);
      return;
    case 'call': {
      if (n.name === 'CELDA') {
        // Resolución estática del índice → dependencia exacta.
        try {
          const key = resolveCeldaKey(n.args, currentRow, ctx?.currentKey);
          if (key !== '') out.push(key);
        } catch (e) {
          // Sin ctx (p.ej. desde una UI sin fila) toleramos FILA() no resoluble.
          if (ctx) throw e;
        }
        return;
      }
      if (n.name === 'FILA') return;
      for (const a of n.args) walkRefs(a, out, ctx, currentRow);
      return;
    }
  }
}

// ─── Matrices auxiliares (catálogos para listas y LOOKUP) ─────────────────
/** Datos de una matriz auxiliar tal como la consume el evaluador. Mirror del
 *  `MatrixData` de `numericProtocol.ts` para no duplicar imports cruzados. */
export interface MatrixDataLite {
  id: string;
  columnTitles: string[];
  rows: string[][];
}

export type Matrices = Record<string, MatrixDataLite>;

// ─── Resolución global del scope (topo-sort por celdas) ────────────────────
/** v45.2 — Operación de una celda xref `get` (estructuralmente idéntica a la de
 *  numericProtocol.ts; definida aquí para mantener formulaEval autocontenido). */
export type XrefGetOp =
  | { kind: 'agg'; fn: 'prom' | 'max' | 'min' | 'suma' | 'cuenta' | 'mediana' | 'desv'; filter?: { matchKey: string; cmp: '<' | '<=' | '>' | '>=' | '=' | '!='; ref: { cell: string } | { num: number } } }
  | { kind: 'pick'; mode: 'cerca' | 'cerca_inf' | 'cerca_sup' | 'mayor' | 'menor'; matchKey?: string; ref?: { cell: string } | { num: number } }
  | { kind: 'interp'; matchKey: string; ref: { cell: string } | { num: number } };

export interface ScopeCell {
  /** Clave única en el scope: `<row><col>`, e.g. "1A", "2B". */
  key: string;
  kind: 'manual' | 'formula' | 'list' | 'lookup' | 'xref';
  /** Solo para formula. */
  expr?: string;
  /** Solo para xref (v45): celda destino en la ficha fuente, ej. "5B". El `raw`
   *  guarda el CÓDIGO elegido por el técnico; el valor = `xrefValues[código.targetKey]`. */
  targetKey?: string;
  /** Solo para xref `get` (v45): scope key de la celda SELECTORA de la que se lee
   *  el código (ej. "1A"). Si está presente, el código no es el `raw` propio. */
  sourceRef?: string;
  /** Solo para xref `get` (v45.2): operación sobre el conjunto (agg/pick/interp). */
  op?: XrefGetOp;
  /** Solo para manual/list: raw string del comments correspondiente. */
  raw?: string | null;
  /** Solo para lookup. */
  refKey?: string;
  matrixId?: string;
  searchCol?: string;
  returnCol?: string;
}

export interface ScopeResult {
  /** Valores numéricos por key. Las celdas no-numéricas (texto) son null aquí. */
  scope: Scope;
  /** Valores de texto por key — para list seleccionada y lookup que devuelve texto.
   *  Las celdas numéricas se duplican aquí como string del número (para que LOOKUP
   *  pueda usarlas como clave de búsqueda). */
  textValues: Record<string, string>;
  errors: Record<string, string>;
  inCycle: Set<string>;
}

/** Resuelve los valores de un conjunto de celdas planas con soporte para:
 *  - Manuales: parsea su `raw` como número.
 *  - Listas: el `raw` es el valor seleccionado (string). Se intenta coercer a número.
 *  - Fórmulas: evalúa en orden topológico, detectando ciclos y refs inválidas.
 *    (v32) Cada fórmula evalúa con ctx de su propia celda → FILA()/CELDA()/COLUMNA().
 *  - Lookups: busca `refKey` en `matrices[matrixId]` y devuelve `returnCol` (texto/núm).
 *
 *  Devuelve `scope` (números) + `textValues` (string) — ambos keyed por cell key. */
/** v45.2 — Agrega una lista de valores numéricos (ya sin nulos) según la función. */
function aggXref(fn: Extract<XrefGetOp, { kind: 'agg' }>['fn'], vals: number[]): number | null {
  if (fn === 'cuenta') return vals.length;
  if (vals.length === 0) return null;
  const n = vals.length;
  const sum = vals.reduce((a, b) => a + b, 0);
  switch (fn) {
    case 'prom': return sum / n;
    case 'max':  return Math.max(...vals);
    case 'min':  return Math.min(...vals);
    case 'suma': return sum;
    case 'mediana': {
      const s = [...vals].sort((a, b) => a - b);
      const mid = Math.floor(s.length / 2);
      return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
    }
    case 'desv': {  // desviación estándar muestral (n-1); null si <2 datos
      if (n < 2) return null;
      const mean = sum / n;
      const variance = vals.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1);
      return Math.sqrt(variance);
    }
    default: return null;
  }
}

/** Resuelve una referencia de comparación contra el scope local (celda) o literal. */
function resolveXrefRef(ref: { cell: string } | { num: number } | undefined, scope: Scope): number | null {
  if (!ref) return null;
  if ('num' in ref) return ref.num;
  const v = scope[ref.cell];
  return (v != null && Number.isFinite(v)) ? v : null;
}

function cmpXref(a: number, cmp: string, b: number): boolean {
  switch (cmp) {
    case '<':  return a < b;
    case '<=': return a <= b;
    case '>':  return a > b;
    case '>=': return a >= b;
    case '=':  return Math.abs(a - b) < 1e-9;
    case '!=': return Math.abs(a - b) >= 1e-9;
    default:   return false;
  }
}

/** v45.2 — Aplica la operación de una celda xref `get` sobre el conjunto de códigos.
 *  `valOf(code,key)` lee el valor numérico congelado de la celda `key` del protocolo `code`. */
function applyXrefGetOp(
  op: XrefGetOp | undefined,
  codes: string[],
  targetKey: string,
  xrefValues: XrefValues,
  scope: Scope,
): number | null {
  const valOf = (code: string, key: string): number | null => {
    const v = xrefValues[`${code}.${key}`];
    return (v != null && Number.isFinite(v)) ? v : null;
  };
  // Sin operación → identidad: primer protocolo con valor válido (caso de 1 ficha).
  if (!op) {
    for (const c of codes) { const v = valOf(c, targetKey); if (v != null) return v; }
    return null;
  }
  if (op.kind === 'agg') {
    let cs = codes;
    if (op.filter) {
      const ref = resolveXrefRef(op.filter.ref, scope);
      // ref sin valor → ninguna ficha pasa el filtro (conjunto vacío). Así `cuenta`
      // devuelve 0 (no null) y el resto queda en blanco, en vez de propagar null.
      cs = (ref == null) ? [] : codes.filter(c => { const mv = valOf(c, op.filter!.matchKey); return mv != null && cmpXref(mv, op.filter!.cmp, ref); });
    }
    const vals = cs.map(c => valOf(c, targetKey)).filter((v): v is number => v != null);
    return aggXref(op.fn, vals);
  }
  if (op.kind === 'pick') {
    const mk = op.matchKey ?? targetKey;
    const cand = codes.map(c => ({ c, mv: valOf(c, mk) })).filter((x): x is { c: string; mv: number } => x.mv != null);
    if (!cand.length) return null;
    let winner: { c: string; mv: number };
    if (op.mode === 'mayor') winner = cand.reduce((a, b) => (b.mv > a.mv ? b : a));
    else if (op.mode === 'menor') winner = cand.reduce((a, b) => (b.mv < a.mv ? b : a));
    else {
      const ref = resolveXrefRef(op.ref, scope);
      if (ref == null) return null;
      let pool = cand;
      if (op.mode === 'cerca_inf') pool = cand.filter(x => x.mv <= ref);
      else if (op.mode === 'cerca_sup') pool = cand.filter(x => x.mv >= ref);
      if (!pool.length) return null;
      winner = pool.reduce((a, b) => (Math.abs(b.mv - ref) < Math.abs(a.mv - ref) ? b : a));
    }
    return valOf(winner.c, targetKey);
  }
  // interp: interpola targetKey a `ref` usando matchKey como eje X sobre el set.
  const ref = resolveXrefRef(op.ref, scope);
  if (ref == null) return null;
  const pts = codes
    .map(c => ({ x: valOf(c, op.matchKey), y: valOf(c, targetKey) }))
    .filter((p): p is { x: number; y: number } => p.x != null && p.y != null)
    .sort((a, b) => a.x - b.x);
  if (pts.length < 2) return null;   // interp requiere ≥2 puntos válidos (si no, blanco)
  if (pts[0].x === pts[pts.length - 1].x) return null;   // eje X degenerado (todos iguales) → indefinido
  const lin = (p: { x: number; y: number }, q: { x: number; y: number }) =>
    q.x === p.x ? p.y : p.y + (q.y - p.y) * ((ref - p.x) / (q.x - p.x));
  for (let i = 0; i < pts.length - 1; i++) {
    if (ref >= pts[i].x && ref <= pts[i + 1].x) return lin(pts[i], pts[i + 1]);
  }
  // Fuera de rango → extrapola con el segmento extremo más cercano.
  return ref < pts[0].x ? lin(pts[0], pts[1]) : lin(pts[pts.length - 2], pts[pts.length - 1]);
}

export function resolveScopeCells(cells: ScopeCell[], matrices?: Matrices, xrefValues?: XrefValues, auxTables?: AuxTables): ScopeResult {
  const scope: Scope = {};
  const textValues: Record<string, string> = {};
  const errors: Record<string, string> = {};
  const inCycle = new Set<string>();
  const byKey: Record<string, ScopeCell> = {};
  for (const c of cells) byKey[c.key] = c;
  const allKeys = cells.map(c => c.key);

  // v45 — códigos elegidos en celdas xref SELECTORAS (select/self): scopeKey → código.
  // Las celdas `get` leen su código de aquí (vía sourceRef), sin re-seleccionar.
  const xrefCodeByKey: Record<string, string> = {};
  for (const c of cells) {
    if (c.kind === 'xref' && !c.sourceRef) {
      const code = (c.raw ?? '').trim();
      if (code) xrefCodeByKey[c.key] = code;
    }
  }

  // Setea valores de celdas sin dependencias dinámicas (manual + list)
  const dynCells: { key: string; deps: string[] }[] = [];
  for (const c of cells) {
    if (c.kind === 'manual') {
      const raw = c.raw;
      const v = raw == null || raw === '' ? null : Number(String(raw).replace(',', '.'));
      scope[c.key] = isFinite(v as number) ? (v as number) : null;
      if (raw != null && raw !== '') textValues[c.key] = String(raw);
    } else if (c.kind === 'list') {
      const raw = c.raw;
      if (raw != null && raw !== '') {
        textValues[c.key] = String(raw);
        // Intentamos coercer a número para uso en fórmulas
        const v = Number(String(raw).replace(',', '.'));
        scope[c.key] = isFinite(v) ? v : null;
      } else {
        scope[c.key] = null;
      }
    } else if (c.kind === 'formula') {
      try {
        const deps = extractRefs(c.expr!, { currentKey: c.key, allKeys });
        dynCells.push({ key: c.key, deps });
        scope[c.key] = null;
      } catch (e) {
        errors[c.key] = (e as Error).message;
        scope[c.key] = null;
      }
    } else if (c.kind === 'lookup') {
      // Depende de refKey
      const dep = c.refKey ? [c.refKey] : [];
      dynCells.push({ key: c.key, deps: dep });
      scope[c.key] = null;
    } else if (c.kind === 'xref') {
      // v45.2 — el VALOR de un selector (sin targetKey) es nulo. Las celdas `get`
      // entran al topo-sort con dependencias en las celdas que referencia su op
      // (#1A vía filter/cerca/interp), para que se evalúen DESPUÉS de manuales,
      // fórmulas, lookups u otros `get` que leen (los códigos del selector vienen de
      // xrefCodeByKey, que no depende del orden). La FUENTE externa no es dependencia.
      scope[c.key] = null;
      if (c.targetKey) {
        const refCell = (r: { cell: string } | { num: number } | undefined): string | null => (r && 'cell' in r) ? r.cell : null;
        const deps: string[] = [];
        const op = c.op;
        if (op) {
          if (op.kind === 'agg') { const d = refCell(op.filter?.ref); if (d) deps.push(d); }
          else { const d = refCell(op.ref); if (d) deps.push(d); }   // pick / interp
        }
        dynCells.push({ key: c.key, deps });
      }
    }
  }

  // Topo-sort con DFS sobre dynCells (formulas + lookups + xref get)
  const state: Record<string, 0 | 1 | 2> = {};
  const depsByKey: Record<string, string[]> = {};
  for (const f of dynCells) depsByKey[f.key] = f.deps;
  const order: string[] = [];

  function dfs(k: string) {
    if (state[k] === 2) return;
    if (state[k] === 1) { inCycle.add(k); return; }
    if (!(k in depsByKey)) return;
    state[k] = 1;
    for (const d of depsByKey[k]) {
      if (d in depsByKey) {
        dfs(d);
        if (inCycle.has(d)) inCycle.add(k);
      }
    }
    state[k] = 2;
    order.push(k);
  }
  for (const f of dynCells) dfs(f.key);
  inCycle.forEach(k => { errors[k] = 'Referencia circular'; });

  // Evaluar en orden topológico
  for (const k of order) {
    if (errors[k]) continue;
    const cell = byKey[k];
    if (!cell) continue;
    if (cell.kind === 'formula') {
      try {
        const v = evalFormula(cell.expr!, scope, matrices, textValues, xrefValues, { currentKey: k, auxTables });
        // v42e (H2) — NaN / ±Infinity (p. ej. RAIZ de negativo, MAX de columna vacía)
        // se trataban como número válido y se congelaban como texto 'NaN'/'-Infinity'
        // en el histórico. Ahora degradan a null + error visible (no se persiste basura).
        const fin = (v != null && Number.isFinite(v)) ? v : null;
        if (v != null && !Number.isFinite(v)) errors[k] = 'Resultado no numérico (NaN/Infinito)';
        scope[k] = fin;
        if (fin != null) textValues[k] = String(fin);
      } catch (e) {
        errors[k] = (e as Error).message;
        scope[k] = null;
      }
    } else if (cell.kind === 'lookup') {
      try {
        if (!matrices) throw new Error('Matrices no provistas');
        const matrix = matrices[cell.matrixId!];
        if (!matrix) throw new Error(`Matriz ${cell.matrixId} no encontrada`);
        const refKey = cell.refKey!;
        // Valor de la clave: primero textValues (puede ser string), luego scope
        let key: string | null = null;
        if (textValues[refKey] != null && textValues[refKey] !== '') key = textValues[refKey];
        else if (scope[refKey] != null) key = String(scope[refKey]);
        if (key == null) { scope[k] = null; continue; }
        const sIdx = (cell.searchCol ?? 'A').charCodeAt(0) - 65;
        const rIdx = (cell.returnCol ?? 'B').charCodeAt(0) - 65;
        const row = matrix.rows.find(r => (r[sIdx] ?? '') === key);
        if (!row) throw new Error(`LOOKUP: "${key}" no encontrado en ${cell.matrixId}.${cell.searchCol}`);
        const result = row[rIdx] ?? '';
        textValues[k] = result;
        const num = Number(String(result).replace(',', '.'));
        scope[k] = isFinite(num) ? num : null;
      } catch (e) {
        errors[k] = (e as Error).message;
        scope[k] = null;
      }
    } else if (cell.kind === 'xref') {
      // v45.2 — celda `get`: ya en orden topológico, sus refs (#1A) están resueltas.
      const codesRaw = cell.sourceRef ? (xrefCodeByKey[cell.sourceRef] ?? '') : (cell.raw ?? '');
      const codes = codesRaw.split(',').map(s => s.trim()).filter(Boolean);
      if (codes.length && cell.targetKey && xrefValues) {
        const fin = applyXrefGetOp(cell.op, codes, cell.targetKey, xrefValues, scope);
        scope[k] = fin;
        if (fin != null) textValues[k] = String(fin);
      } else {
        scope[k] = null;
      }
    }
  }

  return { scope, textValues, errors, inCycle };
}
