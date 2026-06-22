# Llamadas y cálculos entre fichas (motor xref) — Guía para crear fichas

> Documento de referencia para **escribir el Excel maestro** de los ensayos cuando una ficha necesita
> traer o calcular valores a partir de OTRAS fichas (otros protocolos ya registrados).
> Todo se escribe en la columna **"Método de validación"** del Excel, igual que el resto de celdas.

## Conceptos
- Cada celda de una fila numérica se escribe con un "método de validación" (DSL).
- Una **celda xref** es una celda que se conecta con otras fichas (otros protocolos del proyecto).
- Solo se pueden traer valores de fichas **APROBADAS** del **mismo proyecto** (el valor se lee
  *congelado*, tal como quedó al aprobarse). Fichas en borrador/revisión no aparecen ni aportan valor.
- Las **claves de celda** son `<fila><columna>`: `19A` = fila 19, columna A; `5B` = fila 5, columna B.
  La columna por defecto es A (`19` ≡ `19A`). Las refs a TU propia ficha se escriben con `#`: `#1A`.

## Los 3 tipos de celda xref

### 1. Selector — el técnico elige el/los ensayo(s)
| DSL | Qué hace |
|---|---|
| `xref-[TIPO]` | El técnico elige **UN** ensayo aprobado del tipo `TIPO` (su `ID_Protocolo`, p. ej. `PRV5`). Guarda el código. |
| `xref-multi-[TIPO]` | El técnico elige **VARIOS** ensayos (multi-selección con "Listo"). |
| `xref-[]` / `xref-multi-[]` | Sin filtro de tipo (autocompleta sobre todos los aprobados). |

El selector **no muestra un número**: guarda el/los código(s). Las celdas siguientes los usan.

### 2. Self — elige y trae en la MISMA celda (atajo de 1 ficha)
| DSL | Qué hace |
|---|---|
| `xref-[TIPO].<celda>` | Elige un ensayo `TIPO` y trae su `<celda>` en la misma casilla. Ej. `xref-[PRV5].19A`. |

### 3. Get — jala valores del/los ensayo(s) elegido(s) en una celda selectora
Sintaxis: `xref-[#<celdaSelector>].<celdaDestino>[:<operación>]`
- `#<celdaSelector>` = la celda selectora de donde toma el/los código(s). Ej. `#1A`.
- `<celdaDestino>` = qué celda traer de cada ensayo fuente. Ej. `19A` (MDS), `20A` (OCH).
- `:<operación>` (opcional) = qué calcular sobre el conjunto. Sin operación = identidad (1 ficha).

> **Patrón recomendado:** una celda selectora (fila 1) + varias celdas `get` que jalan distintas
> celdas del MISMO conjunto, sin re-seleccionar.

## Operaciones de una celda `get`

### A) Agregar (sobre todo el conjunto) — `:<fn>`
`prom` (promedio) · `max` · `min` · `suma` · `cuenta` (nº de fichas con valor válido) · `mediana` · `desv` (desv. estándar muestral).
- `xref-[#1A].19A:prom` → promedio de la celda 19A de todas las fichas elegidas en `1A`.
- `xref-[#1A].19A:cuenta` → cuántas fichas aportaron un 19A válido (las sin valor se ignoran).

### B) Agregar con FILTRO relativo a TU ficha — `:<fn>(<celdaFuente><cmp><ref>)`
Filtra el conjunto antes de agregar. `<cmp>` ∈ `<` `<=` `>` `>=` `=` `!=`. `<ref>` = `#celdaTuya` o un número.
- `xref-[#1A].19A:prom(20A<=#3A)` → promedio del 19A **solo** de las fichas cuyo 20A ≤ tu celda `#3A`.
- `xref-[#1A].19A:cuenta(20A>=12)` → cuántas fichas tienen 20A ≥ 12.

### C) Elegir UNA ficha (y traer su celda) — pick
| DSL | Elige la ficha… |
|---|---|
| `xref-[#1A].<dest>:cerca(<match>,<ref>)` | cuyo `<match>` es **el más cercano** (absoluto) a `<ref>`. |
| `…:cerca_inf(<match>,<ref>)` | el más cercano **por debajo** (≤ ref). |
| `…:cerca_sup(<match>,<ref>)` | el más cercano **por arriba** (≥ ref). |
| `…:mayor(<match>)` | con el **mayor** `<match>` (si se omite `<match>`, usa la celda destino). |
| `…:menor(<match>)` | con el **menor** `<match>`. |

`<match>` = celda de la ficha fuente para comparar (ej. `20A`). `<ref>` = `#celdaTuya` o número.
La celda devuelve la **celda destino** de la ficha ganadora. Varias celdas `get` con el mismo
`cerca(...)` apuntan al MISMO ganador → puedes traer varias celdas asociadas.

### D) Interpolar — `:interp(<match>,<ref>)`
Interpola linealmente la celda destino a `<ref>` usando `<match>` como eje X, sobre el conjunto.
- Si `<ref>` cae fuera del rango de `<match>`, extrapola con el segmento extremo más cercano.

## Ejemplo completo — Densidad de campo vs. Proctor `PRV5`
(celdas MDS=`19A`, OCH=`20A` del Proctor PRV5)

| Fila | Actividad | Método de validación | Resultado |
|---|---|---|---|
| 1 | Humedad de campo (%) | `numerico-[0:50]` | manual (ej. 11) |
| 2 | Proctores de referencia | `xref-multi-[PRV5]` | el técnico elige varios |
| 3 | MDS promedio | `xref-[#2A].19A:prom` | promedio de las MDS |
| 4 | OCH más cercano a mi humedad | `xref-[#2A].20A:cerca(20A,#1A)` | el OCH más cercano a 11 |
| 5 | MDS del Proctor de OCH más cercano | `xref-[#2A].19A:cerca(20A,#1A)` | MDS de ESE Proctor |
| 6 | MDS interpolada a mi humedad | `xref-[#2A].19A:interp(20A,#1A)` | MDS interpolada en 11 |
| 7 | MDS promedio de los secos (OCH≤mi humedad) | `xref-[#2A].19A:prom(20A<=#1A)` | promedio filtrado |
| 8 | Grado de compactación (%) | `numerico-fx[#... / #5A * 100]:[0:110]:dec[1]` | con la MDS elegida |

> Las celdas `get` (3–7) son **read-only**: se calculan solas a partir de lo elegido en la fila 2.
> Las fórmulas normales (`numerico-fx[...]`, fila 8) pueden referenciar cualquier celda `get` con `#5A`, etc.

## Reglas de robustez (el motor las aplica solo)
- Las fichas **sin valor** en la celda pedida (o con valor no numérico) **se excluyen** del cálculo.
- El cálculo se ejecuta **una sola vez al pulsar "Listo"** en el selector (no en cada toque).
- Los valores se **congelan** al enviar la ficha (Audit/PDF muestran lo que vio el técnico) y el sistema
  **avisa si la ficha fuente cambió** después (doble-check de obsolescencia).
- Modificadores comunes aplican también a celdas `get`: `:dec[n]` (decimales), `:nopdf` (no va al PDF).

## Notas
- Móvil lee todo de la base local (sin costo de red). Web usa consultas estrechas a Supabase.
- El motor es **espejo** móvil/web (`numericProtocol.ts` + `formulaEval.ts`): el mismo DSL calcula igual
  en ambas plataformas. Tests en `scripts/engineTests.ts`.

---
*(Las agrupaciones/presets que aparecen arriba del selector se documentan en
`docs/agrupaciones-de-protocolos.md`.)*
