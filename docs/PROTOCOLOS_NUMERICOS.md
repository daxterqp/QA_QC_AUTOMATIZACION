# Protocolos numéricos — referencia del DSL

> Documento de consulta rápida del subsistema de **protocolos numéricos**: cómo se escriben, cómo se
> parsean, cómo se evalúan las fórmulas y cómo se grafican.
>
> Caso de referencia: `D:\VxP_QAQC_Automatizado\sample_project_carretera` → ensayo **Granulometría por
> Tamizado (GRA-001)**.
>
> **v32** agregó: tipos de celda nuevos (§3.1b), tablas dinámicas fila-a-fila, agregación filtrada,
> aproximación de curvas (§5b), gráficos extendidos (§6) y el validador de fichas (§8b).
> Ver [MAPEO_CAPACIDADES.md](MAPEO_CAPACIDADES.md) y [RESUMEN_MEJORAS.md](RESUMEN_MEJORAS.md).

---

## 1. Visión general: del Excel a la celda llenada

Un protocolo recorre 4 capas de datos:

```
Excel (col. "Método de validación" = DSL)
   │  parseActivitiesExcel()            flow-qaqc-web/lib/excelParser.ts
   ▼
protocol_templates / protocol_template_items   (plantilla, validation_method = DSL crudo)
   │  copia 1 sola vez al abrir el protocolo    src/screens/LocationProtocolsScreen.tsx
   ▼
protocols / protocol_items                      (instancia rellenable, copia desacoplada)
   │  el usuario llena
   ▼
protocol_items.comments  (valores por celda, multi-celda separados por "//")
+ is_compliant / is_na / has_answer  (flags clásicos, también usados por el motor numérico)
```

- El **DSL vive en `validation_method`**. Es texto crudo que se interpreta en tiempo de render.
- Cada `protocol_item` es **una fila** de la tabla. Una fila puede tener **varias celdas** separadas
  por `//`.
- Los valores llenados se guardan en `comments` (multi-celda con `//`); ver `splitRowComments()` /
  `joinRowComments()` en `numericProtocol.ts`.

### Dónde vive cada cosa (web y mobile tienen copias paralelas)

| Pieza | Web (`flow-qaqc-web/`) | Mobile (`src/`) |
|---|---|---|
| Parser del DSL | `lib/numericProtocol.ts` | `utils/numericProtocol.ts` |
| Motor de fórmulas | `lib/formulaEval.ts` | `utils/formulaEval.ts` |
| Render de gráficos (SVG) | `lib/chartRenderer.ts` | *(pendiente de portar — Fase 3)* |
| Tabla de llenado | `components/numeric/NumericTable.tsx` | `components/NumericTable.tsx` |
| Importar Excel | `app/api/plans/...` + `lib/excelParser.ts` | `hooks/useExcelImport.ts` |

> ⚠️ Al cambiar la sintaxis del DSL hay que tocar **ambas** copias del parser (web + mobile).

---

## 2. Clásico (Sí/No/NA) vs numérico

`isNumericProtocol(items)` decide el modo (`numericProtocol.ts`):

```ts
// v31: ignora items SIN validation_method (encabezados de sección, items vacíos)
// y exige que TODOS los que SÍ lo tienen parseen con el parser numérico estricto.
const withValidation = items.filter(i => i.validation_method?.trim());
if (withValidation.length === 0) return false;
return withValidation.every(i => parseNumericRow(i.validation_method) !== null);
```

- **Numérico:** ≥1 item con `validation_method` y **todos** los que lo tienen parsean → tabla numérica.
- **Clásico:** ningún item con DSL, o alguno con DSL no parseable → botones **Sí / No / N/A** + comentario.

> **Nota de bug (importante):** si un protocolo **numérico** aparece como **clásico**, normalmente NO es
> un fallo del parser, sino que la **instancia local quedó desactualizada**: sus `protocol_items` se
> copiaron de la plantilla *antes* de que el método fuera numérico y nunca se refrescaron. La detección
> corre sobre esos items viejos (con `validation_method` null/texto) y devuelve `false`. Lo resuelve la
> reconciliación no destructiva de la plantilla → instancia (Fase 1 del plan).

---

## 3. El DSL — tabla de bloques

Cada celda (segmento entre `//`) o fila completa puede ser uno de estos tipos. Regex en
`numericProtocol.ts`.

### 3.1 Celdas (dentro de una fila)

| Bloque | Sintaxis | Ejemplo (sample) | Significado |
|---|---|---|---|
| Manual | `numerico-[min:max]` | `numerico-[0:100]` | Input numérico validado por rango `[min,max]`. |
| Fórmula | `numerico-fx[expr]` o `numerico-fx[expr]:[min:max]` | `numerico-fx[#1D/2.10*100]:[95:102]` | Celda calculada; rango opcional valida el resultado. |
| Lista inline | `list-[a, b, c]` | `list-[Apto, Reproceso, Pendiente]` | Dropdown de opciones fijas. |
| Lista (matriz col.) | `list-[Mx[A]]` | `list-[Tamices[A]]` | Dropdown con toda la columna A de la matriz `Mx`. |
| Lista (matriz rango) | `list-[Mx[#1A:#10A]]` | `list-[Material[#1A:#10A]]` | Dropdown con un rango de filas de una columna. |
| Lookup | `lookup-[#ref, Mx, ColBusq, ColRet]` | `lookup-[#1A, Tamices, A, B]` | VLOOKUP: busca `#ref` en `ColBusq` de `Mx`, devuelve `ColRet`. |
| Comentario | `comment-[a, b, c]` | `comment-[Conforme, Observado]` | Dropdown que escribe en `comments` (no es numérico). |
| Blanco | *(vacío)* | `// //` | Celda intencionalmente vacía (no editable). |
| Valor literal | `val-[texto]` | `val-[50.8]` | Valor fijo de solo-lectura. Usado en filas de matriz y como dato fijo. |

### 3.1b Tipos de celda nuevos (v32)

| Bloque | Sintaxis | Significado |
|---|---|---|
| Booleano | `bool-[]` | Casilla Sí/No. Guarda "1"/"0" y **vale 1/0 en fórmulas**. |
| Fecha | `fecha-[]` | dd/mm/aaaa, validada (bisiestos incluidos). No entra al scope numérico. |
| Hora | `hora-[]` | HH:MM validada. |
| Porcentaje | `porcentaje-[min:max]` | Numérico con sufijo % visible; rango como `manual`. |
| Equipo | `equipo-[tipo]` | Código de equipo del módulo de Equipos (trazabilidad). Ej: `equipo-[Balanza]`. |

Todos admiten el sufijo `:norma[...]` y se combinan en filas multi-celda con `//`.

### 3.1c Sufijos de visibilidad (v34 — Mejora 6)

| Sufijo | Efecto |
|---|---|
| `:oculto` | Celda de **cálculo invisible**: no se ve en la app NI en el PDF, pero SÍ computa en el scope (intermedios de Proctor, etc.). Solo válida en celdas calculadas (`numerico-fx` / `val-`) — el validador rechaza ocultar entradas. Implica `:nopdf`. |
| `:nopdf` | Visible y editable en la app, **excluida del PDF/reporte** (datos auxiliares del ensayo: condición, clima, estadística interna). |

Se combinan con `:norma[...]` y el rango de `fx` en cualquier orden:
`numerico-fx[#1A/2]:[0:100]:nopdf:norma[ASTM D1557]`. Una fila cuyas celdas son
todas `:oculto` desaparece completa (app y PDF) sin alterar la numeración visible.

### 3.1c-bis Sufijo de decimales `:dec[n]` (v35 — Parte A3)

`:dec[n]` con `n` de 0 a 6 fija los **decimales de presentación** de la celda
(app, audit y PDF). Aplica a `numerico-`, `porcentaje-` y `numerico-fx`. Sin él,
se mantiene el formato compacto por defecto (2 dec, 0 si ≥100).

```
numerico-[100:2000]:dec[2]                        → entrada mostrada con 2 dec
numerico-fx[CELDA(A, 5)/#3A]:[1.5:2.6]:dec[3]     → computada con 3 dec
```

⚠️ **Orden**: el rango `:[min:max]` es parte de la sintaxis `fx` y va INMEDIATO
tras el `]` de la fórmula; `:dec[n]`, `:norma[…]`, `:oculto`, `:nopdf` van
después, entre ellos en cualquier orden. `n` fuera de 0–6 invalida la fila (el
validador lo reporta).

### 3.1c-quater Celda `codigo-[]` (v31 — Parte E)

Celda **read-only** que muestra el código correlativo del ensayo
(`protocols.protocol_code`, p.ej. `PR-260032`) dentro del cuerpo de la ficha —
como en los formatos de minería. Requiere el flag `protocol_codes` del proyecto
(si está apagado, la celda muestra `—`). Máximo UNA por ficha (el validador lo
exige) y NO entra al scope de fórmulas (referenciarla con `#` es
`ref-desconocida`). Convive en filas multi-celda:

```
Código del ensayo | codigo-[]
Código y fecha    | codigo-[] // fecha-[]
```

### 3.1c-ter Filas de valores fijos sueltas (v35)

Una fila compuesta SOLO por celdas `val-[…]` **fuera de un bloque de matriz**
(antes de cualquier `matrix-[…]`) es una fila normal de datos fijos — p.ej.
`Peso del molde (g) | val-[4111.7]`. Sus valores entran al scope y las fórmulas
pueden referenciarlos (`#2A`). (Antes invalidaba la ficha con
`matriz-mal-formada`.) Dentro de un bloque `matrix-[…]` nada cambia: las filas
todo-`val-` siguen siendo datos del catálogo.

### 3.1d Secciones con columnas variables (v34 — Mejora 1)

Una fila `col-[…]` (o un cambio del campo `Sección` del Excel) **inicia una
sección nueva** con su PROPIO número de columnas: las secciones de 1 columna ya
no heredan columnas fantasma de las secciones anchas. Cada sección renderiza su
banda de título, sus encabezados y su fila de letras (con la norma de la columna
arriba, en el encabezado). Los `col-[…]` ya NO están limitados al inicio del
protocolo ni a 3 niveles.

### 3.2 Filas completas (ocupan toda la fila)

| Bloque | Sintaxis | Ejemplo (sample) | Significado |
|---|---|---|---|
| Encabezado de columna | `col-[A][Título]` o `col-[A:C][Título]` | `col-[A][Tamaño (mm)] // col-[B][% Pasa]` | Títulos de las columnas de datos (spans A, B, …). |
| Declaración de matriz | `matrix-[Id]` (+ `col-[…]`) | `matrix-[Tamices] // col-[A][Tamaño (mm)] // col-[B][% Pasa]` | Define una tabla auxiliar para `list-`/`lookup-`. |
| Datos de matriz | `val-[..] // val-[..]` | `val-[50.8] // val-[70]` | Una fila de la matriz auxiliar. |
| Gráfico | `numerico-gr<N>[ … ]` | `numerico-gr5[x:#1A:#10A-y:#1B:#10B]` | Gráfico que ocupa una fila. Ver §5. |
| Directiva paramétrica | `repeat-[grupo:min:max:def]` | `repeat-[probetas:2:6:3]` | En plantillas: expande N filas al instanciar. Ver §6. |

### 3.3 Sufijo de norma (opcional, cualquier celda)

```
<bloque>:norma[<referencia>]
```
Ej.: `numerico-[0:25]:norma[MTC E-202]`. Se guarda en `normaRef` y se muestra bajo la celda.

### 3.4 Multi-celda: separador `//`

Una fila con varias columnas separa sus celdas con `//` (posicionales → columnas A, B, C…):

```
col-[A][Progresiva] // col-[B][Densidad] // col-[C][Humedad]
val-[50] // numerico-[1.5:2.5] // numerico-fx[#1B/(1+#1C/100)]
```

> Si **cualquier** segmento de la fila no parsea, `parseNumericRow` devuelve `null` para toda la fila
> (y eso puede tumbar la detección numérica del protocolo entero — ver §2).

---

## 4. Cómo se mapea el sample (GRA-001)

| Item | Método (DSL) | Tipo |
|---|---|---|
| 1 | `col-[A][Tamaño (mm)]` | Encabezado columna A |
| 2 | `col-[B][% Pasa]` | Encabezado columna B |
| 3 | `val-[50.8] // numerico-[0:100]` | Fila: valor fijo 50.8 (A) + input 0–100 (B) |
| 4 | `val-[38.1] // numerico-[0:100]` | idem |
| … | … | … |
| 12 | `val-[0.075] // numerico-[0:25]:norma[MTC E-202]` | valor fijo + input 0–25 con norma |
| 13 | `numerico-gr5[x:#1A:#10A-y:#1B:#10B]` | Curva granulométrica (gráfico log-x) |

La columna A son los **tamices fijos** (`val-`), la columna B es el **% que pasa** que el técnico llena
(`numerico-[0:100]`), y la fila 13 grafica A (x, log) vs B (y).

---

## 5. Motor de fórmulas (`formulaEval.ts`)

Las celdas `numerico-fx[...]` se evalúan contra un *scope* `{ "<row><col>": número|null }` (clave estilo
`"1A"`, `"3B"`; ver `scopeKeyFor()`).

**Referencias:**
- `#1A` → celda fila 1, columna A. `#4` → fila 4, columna A (col. implícita).
- Rangos: `#1A:#4A` (vertical) o `#1A:#1D` (horizontal) → se expanden a lista de celdas.
- Cross-protocolo: `@HIS-001.5F` → valor de otro protocolo **aprobado** (vía `xrefValues`).

**Operadores:** `+ - * / ^` y comparaciones `> < >= <= == !=`. Precedencia (menor→mayor):
comparación → suma/resta → mult/div → potencia (asoc. derecha) → unario → llamada → primaria.

**Funciones built-in** (case-insensitive, `;` o `,` como separador):

| Función | Qué hace |
|---|---|
| `SUMA(…)` / `PROMEDIO(…)` | sumatoria / media |
| `MAX(…)` / `MIN(…)` | máximo / mínimo |
| `ABS(x)`, `RAIZ(x)`, `POTENCIA(x,n)` | absoluto, raíz, potencia |
| `REDONDEAR(x, dec)` | redondeo a N decimales |
| `SI(cond, siVerdad, siFalso)` | condicional |
| `DESVEST(…)` / `DESVESTP(…)` | desv. estándar muestral (n-1) / poblacional (n) |
| `CV(…)` | coef. de variación = DESVEST/PROMEDIO×100 |
| `MEDIANA(…)`, `PERCENTIL(…, p)` | mediana, percentil p (0–100) |
| `OUTLIER(…)` | 1 si el último arg es atípico (IQR), si no 0 |
| `LOOKUP(ref, Mx, ColBusq, ColRet)` | búsqueda en matriz |

**Reglas:** referencia ausente/null ⇒ la fórmula devuelve `null` (se propaga). División por cero ⇒
error (`div0`). Las dependencias se resuelven por orden topológico (`resolveScopeCells`); ciclos se
detectan con `extractRefs`.

### 5b. Funciones nuevas del motor (v32)

**Lógica robusta:**
- `SI(cond, a [, b])` ahora es **lazy**: solo evalúa la rama elegida → `SI(#1A>0, #1B/#1A, 0)`
  ya no truena por división entre 0. Con 2 args y condición falsa → vacío.
- `ESVACIO(celda)` → 1/0 sin propagar el vacío (única función que lo permite). Patrón guarda:
  `SI(ESVACIO(#1B), 0, #1B*2)`.
- `SIERROR(expr, alternativa)` → atrapa errores (no vacíos).
- `Y(…)`, `O(…)`, `NO(x)`.

**Tablas dinámicas fila-a-fila** (la fórmula conoce su propia fila):
- `FILA()` → número de fila (partida) de la celda actual.
- `CELDA(Col [, fila])` → valor de otra celda por columna+fila. `fila` admite números y
  `FILA()±k`. **Acumulado** (retenido acumulado, % pasa):
  `numerico-fx[SI(FILA()>1, CELDA(C, FILA()-1) + CELDA(B), CELDA(B))]` — la MISMA fórmula
  en todas las filas de la columna C.
- `COLUMNA(Col)` → la serie completa de esa columna (solo como argumento de función;
  excluye la celda actual; los vacíos se ignoran en funciones simples).

**Agregación filtrada:** `SUMARSI(valores, condiciones)`, `PROMEDIOSI`, `CONTARSI(conds)`,
`CONTAR(valores)`. Las series son rangos `#1B:#10B` o `COLUMNA(B)`; los pares con vacío se omiten.

**Aproximación de curvas:**
- `INTERPY(xs, ys, x)` — interpola Y para un X (lineal).
- `INTERPX(xs, ys, yObjetivo)` — X donde la serie cruza el Y objetivo.
- `INTERPXLOG(xs, ys, yObjetivo)` — ídem con X en log10 → **P50/P80/D60 de granulometría**:
  `numerico-fx[INTERPXLOG(#3A:#12A, #3B:#12B, 50)]`.
- `PUNTOMAXIMOX(xs, ys [, grado])` / `PUNTOMAXIMOY(…)` — coordenadas del máximo de la curva
  ajustada (polinomio grado 2 ó 3) → **óptimo Proctor (HOP / MDS)**. v34: el máximo es
  **ALGEBRAICO** — se deriva el polinomio, se iguala a cero y se resuelve en forma cerrada
  (no hay búsqueda gráfica ni muestreo).
- `PENDIENTE`, `INTERSECCION`, `R2` — regresión lineal.

**Matemática:** `LOG(x [, base=10])`, `LN`, `EXP`, `PI()`, `SENO`, `COSENO`, `TAN`, `ATAN`,
`ENTERO`, `RESIDUO(a,b)`, `MODA`.

### Visualización de fórmulas
- **PC:** botón **"Mostrar fórmulas"** (`showFormulas`) en `components/numeric/NumericTable.tsx`; al
  activarlo, la fórmula se muestra **encima** de cada celda calculada (formato Excel:
  `formatFormulaExcelStyle` convierte `#1A` → `A1`).
- **Mobile:** las fórmulas **no** se muestran (espacio reducido). La columna "Método" se elimina de la
  tabla del celular.

---

## 6. Gráficos (`chartRenderer.ts`)

`numerico-gr<N>[ body ]` ocupa una fila completa. Render = **SVG puro** (sin Recharts ni dependencias),
inyectado con `dangerouslySetInnerHTML` en web (y, tras la Fase 3, con `SvgXml` de `react-native-svg`
en mobile).

| N | Modo | Uso |
|---|---|---|
| gr1 | `line` | polilínea recta con marcadores |
| gr2 | `smooth` | curva suavizada (Catmull-Rom) |
| gr3 | `bars` | barras verticales (X categórico) |
| **gr5** | `log-x` | **escala log en X**, Y lineal — **granulometría** |
| gr7 | `scatter` | dispersión + recta de regresión + R² |
| gr4/6/8 | — | reservados (no implementados) |

**Body — dos formatos** (`parseGraphBody`):
- Legacy: `x:<refs>-y:<refs>` → `numerico-gr5[x:#1A:#10A-y:#1B:#10B]`
- Extendido (secciones con `|`): `x:..|y:..|t:Título|xt:Eje X|yt:Eje Y`

**Extensiones v32** (claves opcionales del formato extendido):

| Clave | Significado |
|---|---|
| `y2:` / `y3:` | Series Y adicionales (mismo eje X) — hasta 3 series con colores propios |
| `ly:` `ly2:` `ly3:` | Etiquetas de leyenda por serie (la leyenda aparece sola si hay >1 serie/banda/ajuste) |
| `bandalo:` + `bandahi:` | **Banda de especificación (huso)**: área sombreada entre dos series Y. Deben ir juntas. |
| `ajuste:` | Curva ajustada sobre la serie 1: `lineal` \| `poli2` \| `poli3` \| `spline` \| `loglog` |
| `alto:` | Proporción alto/ancho en % (30–150). Ej: `alto:80` → gráfico más cuadrado para informes. |

**v34 — estilo Proctor (Excel base CV):** cuando un `gr1`/`gr2` lleva `ajuste:`, los puntos
de la serie 1 se dibujan **sueltos** (scatter, sin líneas que los conecten) — la polinómica es
la que conecta visualmente los datos. Con `ajuste:poli2|poli3` se marca además el **punto
máximo algebraico** con líneas de referencia punteadas a ambos ejes y entrada en la leyenda.

Ejemplo — curva granulométrica con huso normativo y ajuste:
```
numerico-gr5[x:#3A:#12A|y:#3B:#12B|ly:Muestra|bandalo:#3C:#12C|bandahi:#3D:#12D|ajuste:loglog|t:Curva Granulométrica|xt:Tamaño (mm)|yt:% Pasa]
```

Las `refs` pueden ser listas (`#1A,#2A,#3A`) o rangos (`#1A:#10A`).

---

## 7. Plantillas paramétricas (`parametricExpand.ts`)

Para ensayos con N repeticiones (probetas, puntos), la **plantilla** usa una directiva y filas template:

```
repeat-[probetas:2:6:3]          ← al instanciar, pide N entre 2 y 6 (default 3)
numerico-[145:155]   Probeta {{n}}   ← fila template; {{n}} se resuelve por repetición
```

Al crear la instancia, `expandTemplateItems()` reemplaza el bloque por N filas reales, reescribe las
refs `#<fila><col>` a la fila destino y resuelve `{{n}}`. (Limitación: multi-offset con K>1 filas
template usa partidas compuestas `1.1`, `1.2`, y las refs cruzadas entre ellas no funcionan.)

---

## 8. Mapa de funciones clave

| Función | Archivo | Propósito |
|---|---|---|
| `parseActivitiesExcel(file)` | `flow-qaqc-web/lib/excelParser.ts` | Excel → protocolo + items |
| `parseNumericRow(method)` | `numericProtocol.ts` | Parsea una fila del DSL → `NumericRowSpec` |
| `parseCellSegment(seg)` | `numericProtocol.ts` | Parsea una celda → `NumericCellSpec` |
| `isNumericProtocol(items)` | `numericProtocol.ts` | Decide modo numérico vs clásico (v31) |
| `extractMatrices(rows)` | `numericProtocol.ts` | Separa matrices auxiliares |
| `extractHeaderRows(rows)` | `numericProtocol.ts` | Junta los `col-[…]` en niveles de encabezado |
| `splitRowComments` / `joinRowComments` | `numericProtocol.ts` | Serializa/deserializa valores multi-celda |
| `evalFormula(expr, scope, …)` | `formulaEval.ts` | Evalúa una fórmula |
| `resolveScopeCells(cells, …)` | `formulaEval.ts` | Orden topológico de celdas calculadas |
| `renderChartSvg(spec, scope, …)` | `chartRenderer.ts` | Genera el SVG del gráfico |
| `expandTemplateItems(…)` | `parametricExpand.ts` | Expansión paramétrica `repeat-[…]` |

### 8b. Validador de fichas (v32)

`validateProtocolSpec(items)` (`src/utils/protocolValidator.ts` ×2) valida una ficha completa
**antes** de usarla: sintaxis de cada segmento (señala el segmento exacto con typo), referencias
existentes, partidas duplicadas, ciclos, matrices/lookup válidos, specs de gráfico resolubles.
Devuelve `{ isNumeric, ok, issues[] }` con errores accionables (fila, celda, código, mensaje) —
pensado para que una **IA que genera la ficha se auto-corrija** con el reporte.
Integrado al import web (`file-upload`): los errores aparecen en el banner al subir el Excel.

Tests del motor: `npx -y tsx scripts/engineTests.ts` (73 casos).

---

## 9. Estructuras de datos (resumen)

```ts
// Una celda
type NumericCellSpec =
  | { kind:'manual';  range:{min,max}; normaRef? }
  | { kind:'formula'; expr:string; range:{min,max}|null; normaRef? }
  | { kind:'list';    source:ListSource; normaRef? }
  | { kind:'lookup';  refKey; matrixId; searchCol; returnCol; normaRef? }
  | { kind:'comment'; options:string[]; normaRef? }
  | { kind:'blank' }
  | { kind:'val';     literal:string };

// Una fila
type NumericRowSpec =
  | { kind:'row';            cells:NumericCellSpec[] }
  | { kind:'graph';          mode; xRefs:string[]; yRefs:string[]; title?; xAxisTitle?; yAxisTitle? }
  | { kind:'header';         spans:{from,to,title}[] }
  | { kind:'matrix-header';  matrixId; spans:{from,to,title}[] }
  | { kind:'matrix-data';    values:string[] }
  | { kind:'repeat-directive'; groupId; min; max; defaultN };
```
