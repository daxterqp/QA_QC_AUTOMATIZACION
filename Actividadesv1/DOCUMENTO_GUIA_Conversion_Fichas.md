# Documento Guía — Conversión de fichas de ensayo (Excel) → ficha numérica del sistema

> Base metodológica para armar TODAS las fichas. Verificado contra el código real
> (`numericProtocol.ts`, `formulaEval.ts`, `NumericTable.tsx`, `excelParser.ts`) y
> validado con el motor. Caso de referencia: **Proctor (PRV4)**.
> Última actualización: 2026-06-15.

---

## 0. Cómo recibe y ordena los datos la app (regla de oro)

1. **La hoja se llama `Actividades`.** Columnas obligatorias (fila 1):
   `ID_Protocolo | Protocolo | PartidaItem | Actividad realizada | Método de validación | Sección`.
2. **El orden de render = orden por `PartidaItem`** (las pantallas de llenado/auditoría ordenan los
   ítems por `partida_item`, orden natural numérico). **NO** se respeta el orden físico del Excel.
   → **Numera TODAS las filas (incluidos los encabezados `col-` y los gráficos) con enteros
   secuenciales 1,2,3,…** en el orden deseado. Si dejas la partida vacía en un encabezado, queda
   "suelta" y la sección se entremezcla (bug que tuvimos en PRV3).
3. **El scope de fórmulas es GLOBAL al protocolo.** Una celda de cualquier sección puede referenciar
   otra con `#<partida><columna>` (ej. `#7A`). Por eso las **partidas deben ser únicas** en toda la
   ficha (en móvil, partidas repetidas colisionan en el upsert `templateId|partida`).
4. **Cada `Sección` (columna F) = su propia TABLA.** Dos disparadores de corte de sección:
   (a) cambiar el texto de `Sección`, o (b) emitir un nuevo encabezado `col-` después de filas de
   datos. El nº de columnas (`maxCols`) se calcula **aislado por sección**, así que NO se propaga en
   el parser. (El render sí lo amplificaba — ver §5.)
5. **Si CUALQUIER celda de CUALQUIER fila no parsea, toda la ficha cae a Sí/No/NA clásico.** Por eso
   **valida siempre antes de subir** (§6).

---

## 1. Identificar FILAS vs COLUMNAS (lo más importante)

Antes de escribir nada, segrega la ficha del Excel en **procedimientos** y, dentro de cada uno,
decide qué es fila y qué es columna. **No transpongas. No juntes procedimientos.**

- **PROCEDIMIENTO** = un bloque lógico del ensayo (ej. "Determinación de densidades húmedas",
  "Determinación de contenido de humedad", "Granulometría"). → **una `Sección` propia**.
- **FILA (partida)** = una sub-medición / magnitud (ej. "Peso molde + suelo", "Densidad húmeda").
- **COLUMNA (A, B, C, D…)** = una repetición/serie del MISMO tipo de dato. En Proctor, los **4
  puntos de compactación son COLUMNAS** (A=Punto 1 … D=Punto 4), no filas.

Regla práctica: si en el Excel ves valores que se repiten **horizontalmente** bajo un mismo
enunciado (4 columnas E:H para 4 puntos) → son **columnas** en el sistema (una fila con 4 celdas).
Si cada concepto va en su propia línea con un único valor → son **filas** de 1 columna.

**"Mismo punto" entre procedimientos = misma LETRA de columna.** Como la columna es posicional, el
Punto 2 es la columna **B** en densidad y en humedad. La densidad seca del punto B se calcula
`#<densHúmeda>B / (1 + #<humedad>B/100)` — un *join* implícito por posición de columna.

---

## 2. DSL del "Método de validación" (resumen operativo)

| Tipo de celda | Sintaxis | Notas |
|---|---|---|
| Numérico con rango | `numerico-[min:max]` | ingreso validado |
| Numérico libre | `numerico-[]` | sin rango |
| Fórmula | `numerico-fx[expr]` | refs `#<partida><col>`, funciones (§3) |
| Literal solo-lectura | `val-[9.5]` | entra al scope; ideal para constantes (aberturas, ρ20) |
| Lista inline | `list-[a, b, c]` | desplegable fijo |
| Lista desde tabla aux | `list-[@tabla[Columna]]` | desplegable poblado por la tabla del proyecto |
| Texto | `texto-[]` | no entra al scope numérico |
| Fecha / Hora / Bool | `fecha-[]` / `hora-[]` / `bool-[]` | |
| Encabezado de columnas | `col-[A][Título] // col-[B][Título] // …` | **fila propia**; define el ancho de la sección |
| Matriz inline | `matrix-[Mx] // col-[A][..] // …` + filas `val-[..] // val-[..]` | catálogo local (alternativa a tablas aux) |
| Gráfico | `numerico-gr1[x:..|y:..|ajuste:poli3|t:..|xt:..|yt:..]` | `gr1` línea, `gr5` log-X |
| **Multi-columna** | `cellA // cellB // cellC // cellD` | separa con ` // ` → columnas A,B,C,D… |

**Sufijos** (van tras el `]` del tipo, cualquier orden): `:dec[n]` decimales (0–6) · `:[min:max]`
valida el resultado de una fórmula · `:oculto` celda de cálculo no visible/no-PDF · `:nopdf` visible
fuera del reporte · `:norma[ID]` (compat, ya no se muestra).

---

## 3. Funciones del motor (para replicar cálculos)

- Aritmética/estadística: `SUMA, PROMEDIO, MAX, MIN, ABS, REDONDEAR(x,n), ENTERO, RESIDUO, RAIZ,
  POTENCIA, DESVEST, DESVESTP, CV, MEDIANA, PERCENTIL, MODA, LOG, LN, EXP, PI, SENO, COSENO, TAN, ATAN`.
- Lógica: `SI(cond, vSi [, vNo])` (perezosa; sin 3er arg y falso → vacío), `Y, O, NO, ESVACIO, SIERROR`.
- Dinámicas (misma fila/columna): `FILA()`, `CELDA(Col [, fila])`, `COLUMNA(Col)`.
- Filtradas: `SUMARSI, PROMEDIOSI, CONTARSI, CONTAR`.
- **Curva/regresión (clave para Proctor):**
  - `PUNTOMAXIMOY(xs, ys, 3)` → **MDS** (densidad máxima del ajuste cúbico).
  - `PUNTOMAXIMOX(xs, ys, 3)` → **OCH** (humedad en el máximo). Ajuste por mínimos cuadrados +
    máximo algebraico de forma cerrada — **NO necesita `MDETERM`** (que NO existe en el motor).
  - `PENDIENTE, INTERSECCION, R2, INTERPY, INTERPX, INTERPXLOG`.
- Lookups: `BUSCAR(tabla, valor, "Columna")` (tablas aux del proyecto, §4) y `LOOKUP(#ref, Mx, A, B)`
  (matrices inline). `HLOOKUP/VLOOKUP` **no** existen.
- **Rangos**: `#4A:#7A` (vertical, varía fila) o `#15A:#15D` (horizontal, varía columna). **No** se
  puede variar fila y columna a la vez. Con puntos en columnas, MDS/OCH usan rango **horizontal**.

---

## 4. Tablas auxiliares del proyecto

Hoja separada **`Tablas auxiliares`** (se sube en *Cargar archivos → Lab.*). Formato:
`tabla-<nombre> | NombreColumna | v1 | v2 | …` (una fila por columna). La **1ª columna declarada es
la LLAVE** de `BUSCAR`.

> **Las llaves deben ser NUMÉRICAS.** `BUSCAR(taras, #9A, Peso)` toma el valor numérico de `#9A`; si
> el código de la tara es texto ("P1"), `#9A` resuelve a vacío y `BUSCAR` falla. Usa códigos 1,2,3…

`list-[@tabla[Columna]]` puebla el desplegable desde esa misma tabla. `BUSCAR` tolera "13" ≈ "13.0".

---

## 5. El ancho de tabla se PROPAGABA (causa raíz + fix aplicado)

- `groupIntoSections` (parser) ya calcula `maxCols` **aislado por sección** — correcto.
- El **render** (`NumericTable.tsx`) dimensionaba el ancho de TODAS las secciones al **máximo global**
  (`maxStripW` móvil / `maxStripPx` web) para alinear el ✓. Resultado: una sección de 12 columnas
  estiraba toda la ficha y las secciones de 1 valor reservaban columnas fantasma.
- **Doble corrección:**
  1. **Autoría** (la principal): puntos en columnas → la sección más ancha baja de **12 → ~5**.
  2. **Software (v42b)**: cada sección ahora usa **su propio ancho** (`secStripW`/`secStripPx`), sin
     relleno al global. Tocado en AMBOS `NumericTable.tsx` (web y móvil — son copias paralelas;
     mantener sincronizadas).

---

## 6. Validar ANTES de subir (sin abrir la app)

El motor (`src/utils/numericProtocol.ts` + `formulaEval.ts`) no tiene imports → se transpila con
`typescript` (`ts.transpileModule`) y se corre `resolveScopeCells` con datos de prueba. Ver
`Actividadesv1/_validateProctorV4.js` (plantilla reutilizable): comprueba `isNumericProtocol`,
imprime los resultados calculados y lista **celdas con error** (debe ser 0) y `maxCols` por sección.
También existe `validateProtocolSpec` (refs inexistentes, partidas duplicadas, ciclos, specs de
gráfico) y `npx -y tsx scripts/engineTests.ts`.

---

## 7. Caso de referencia: PROCTOR (PRV4) — segregación correcta

El usuario segregó el Excel en procedimientos etiquetados `Procedimiento N` (col B). Mapeo final:

| Sección (procedimiento) | Tipo | maxCols | Contenido |
|---|---|---|---|
| Datos del molde | 1 valor | 1 | N° molde (lista), peso/volumen por `BUSCAR(moldes)` |
| Determinación de densidades húmedas | **4 puntos = columnas** | 4 | molde+suelo, suelo compactado, densidad húmeda |
| Determinación de contenido de humedad | **4 puntos = columnas** | 4 | recipiente, pesos, humedad %, **densidad seca** (ref cruzada) |
| Determinación de densidad máxima seca | 1 valor + gráfico | 1 | **MDS** `PUNTOMAXIMOY(...,3)`, **OCH** `PUNTOMAXIMOX(...,3)`, curva `gr1 poli3` |
| Contenido de humedad y % de sólidos | 1 ensayo | 1 | tara, humedad, % sólidos, peso seco total |
| Ensayo de granulometría | tabla tamices | 5 | abertura/retenido/%ret/%acum/%pasa, Fondo por diferencia, curva `gr5 loglog` |
| Gravedad específica | 1 valor | 1 | fiola `BUSCAR`, densidad agua vs T° `BUSCAR(agua)`, Gst→K1→Gs20 |
| Observaciones | texto | 1 | `texto-[]` |

Cálculo oculto del Excel (curva por mínimos cuadrados 3er grado + `MDETERM` + barrido de 100 puntos
para el máximo) → **se reemplaza por `PUNTOMAXIMOX/Y(...,3)` nativos** (resultado equivalente, sin
replicar determinantes). Tabla de moldes `HLOOKUP` → tabla aux `moldes`. Hoja `Datos fiola`
(picnómetro + densidad del agua) → tablas aux `fiola` y `agua`.

**Generador reproducible:** `Actividadesv1/_genProctorV4.js` (numeración secuencial, fórmulas por
columna, refs cruzadas). Salidas: `PRV4_Proctor_v4.xlsx` + `PRV4_TablasAuxiliares_v4.xlsx`.

---

## 8. Checklist para una ficha nueva

1. Leer TODA la hoja del Excel (incluidas columnas lejanas y otras hojas: cálculos ocultos).
2. Segregar en **procedimientos** → cada uno una `Sección`.
3. En cada procedimiento decidir filas (sub-mediciones) vs columnas (series/puntos). No transponer.
4. Numerar **todas** las filas con enteros secuenciales (encabezados `col-` y gráficos incluidos).
5. Escribir el DSL: encabezado `col-` por sección que tenga >1 columna; multi-columna con ` // `;
   fórmulas con `#refs`; constantes con `val-[]`; lookups con `BUSCAR`/tablas aux (llaves numéricas).
6. Replicar cálculos ocultos con funciones nativas (curvas → `PUNTOMAXIMO*`; evitar `MDETERM`).
7. Tablas auxiliares en hoja `Tablas auxiliares` (llaves numéricas).
8. **Validar con el motor** (`_validate*.js`) → 0 errores + `maxCols` correcto por sección.
9. Subir: ficha en *Actividades*, tablas aux en *Lab.*. Verificar visualmente el ancho por sección.

---

## 9. Archivos clave (rutas absolutas)

- Generador/validador Proctor: `D:\VxP_QAQC_Automatizado\Actividadesv1\_genProctorV4.js`, `_validateProctorV4.js`
- Salidas: `D:\VxP_QAQC_Automatizado\Actividadesv1\PRV4_Proctor_v4.xlsx`, `PRV4_TablasAuxiliares_v4.xlsx`
- Parser DSL: `D:\VxP_QAQC_Automatizado\src\utils\numericProtocol.ts` (`groupIntoSections`, `parseNumericRow`)
- Motor: `D:\VxP_QAQC_Automatizado\src\utils\formulaEval.ts` (`resolveScopeCells`, `BUSCAR`, `PUNTOMAXIMO*`)
- Render (fix de ancho por sección, v42b): `D:\VxP_QAQC_Automatizado\src\components\NumericTable.tsx`
  y `D:\VxP_QAQC_Automatizado\flow-qaqc-web\components\numeric\NumericTable.tsx`
- Importador de hojas: `D:\VxP_QAQC_Automatizado\flow-qaqc-web\lib\excelParser.ts`
- DSL de referencia (detalle): `D:\VxP_QAQC_Automatizado\docs\PROTOCOLOS_NUMERICOS.md`
