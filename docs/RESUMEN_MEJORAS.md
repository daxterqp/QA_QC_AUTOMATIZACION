# Resumen de mejoras — Protocolos numéricos v32 (09/06/2026)

> Todo lo implementado en esta sesión para que el sistema soporte **fichas de ensayo de
> cualquier tipo** (granulometrías, Proctor, densidades, cono de arena, etc.), con
> **paridad exacta web/mobile** y un **contrato de validación** para que una IA genere
> fichas desde el Excel de forma confiable.
>
> Verificación: **73/73 tests del motor pasan** (`npx -y tsx scripts/engineTests.ts`) y
> **0 errores de TypeScript** en ambos proyectos (`npx tsc --noEmit`).

---

## 1. Bugs corregidos (existían antes de esta sesión)

| Bug | Dónde | Impacto |
|---|---|---|
| **Filas mixtas `val-` rotas en WEB** | `flow-qaqc-web/lib/numericProtocol.ts` | `val-[50.8] // numerico-[0:100]` (¡la granulometría!) caía a modo clásico en la web. Mobile ya lo tenía bien — ahora son espejo. |
| **Celdas `val-` fuera del scope en WEB** | `NumericTable.tsx` web | Una fórmula que referenciaba `#3A` (tamiz fijo) no resolvía en web. |
| **`SI(...)` evaluaba TODAS las ramas (eager)** | `formulaEval.ts` ×2 | `SI(#1A>0, #1B/#1A, 0)` tronaba con div/0 aunque la condición protegiera. Ahora es lazy. |
| **Imposible preguntar "¿está vacía?"** | `formulaEval.ts` ×2 | Referenciar una celda vacía anulaba toda la fórmula → no había forma de hacer guardas. Nuevo `ESVACIO()`. |
| **Headers fusionados solo en mobile** | `extractHeaderRows` | El fix de "Tamaño (mm) / % Pasa al mismo nivel" ahora aplica también en web (copiado al sincronizar). |

## 2. Motor de fórmulas (`formulaEval.ts`, web + mobile espejo)

**Lógica robusta:**
- `SI` lazy (solo evalúa la rama elegida; 2 args + falso → vacío)
- `ESVACIO(celda)` · `SIERROR(expr, alternativa)` · `Y` · `O` · `NO`

**Tablas dinámicas fila-a-fila** (lo que faltaba para acumulados estilo DINDEX/DATTR):
- `FILA()` — fila (partida) de la celda actual
- `CELDA(Col [, fila])` — lectura por columna+fila; `fila` admite `FILA()±k` (resolución
  estática → el topo-sort conoce las dependencias exactas, sin falsos ciclos)
- `COLUMNA(Col)` — serie completa de una columna como argumento de función
- Acumulado con UNA fórmula repetida: `SI(FILA()>1, CELDA(C, FILA()-1)+CELDA(B), CELDA(B))`

**Agregación filtrada:** `SUMARSI` · `PROMEDIOSI` · `CONTARSI` · `CONTAR`
(rangos o COLUMNA; pares con vacío se omiten; semántica null documentada y testeada)

**Aproximación de curvas:**
- `INTERPY` / `INTERPX` / `INTERPXLOG` — interpolación a objetivo; **P50/P80/D60**
  log-interp verificado con datos reales de granulometría (D50 ≈ 11.36 ✓)
- `PUNTOMAXIMOX` / `PUNTOMAXIMOY` — ajuste polinómico grado 2/3 (X centrado para
  estabilidad numérica) + búsqueda densa del máximo; **óptimo Proctor** verificado
  (HOP=12.000, MDS=2.0000 ✓)
- `PENDIENTE` / `INTERSECCION` / `R2` — regresión lineal desde fórmulas

**Matemática:** `LOG(x, base)` · `LN` · `EXP` · `PI()` · `SENO/COSENO/TAN/ATAN` ·
`ENTERO` · `RESIDUO` · `MODA`

**Infraestructura:** argumentos por grupos (cada rango = una serie), contexto de
evaluación por celda, `extractRefs(expr, ctx)` con resolución de CELDA/COLUMNA,
detección de ciclos extendida (CELDA↔CELDA, auto-COLUMNA) — sin romper NINGÚN
comportamiento previo (tests de no-regresión incluidos).

## 3. Tipos de celda nuevos (`numericProtocol.ts` ×2 + ambas UIs)

| Sintaxis | Render mobile | Render web |
|---|---|---|
| `bool-[]` | botón Sí/No (verde/rojo), vale 1/0 en fórmulas | ídem |
| `fecha-[]` | input dd/mm/aaaa con validación real (bisiestos) | ídem |
| `hora-[]` | input HH:MM validado | ídem |
| `porcentaje-[min:max]` | numérico con `[a:b] %` y validación de rango | ídem |
| `equipo-[tipo]` | input de código (mayúsculas autom.), trazabilidad | ídem |

Todos integrados en: detección numérica, scope de fórmulas, estado ✓/✗ por fila,
`commitRow` (persistencia), navegación Play/Enter, y el validador.

## 4. Gráficos (`chartRenderer.ts` ×2 + NumericChart + pdfGenerator + tabla mobile)

- **Múltiples series** (`y2:`, `y3:`) con colores propios
- **Banda de especificación / huso** (`bandalo:`+`bandahi:`) como área sombreada con
  bordes punteados — clave para husos granulométricos normativos
- **Curva ajustada** sobre la serie 1 (`ajuste: lineal|poli2|poli3|spline|loglog`),
  recortada al área del plot (clipPath)
- **Leyenda automática** (etiquetas `ly:`/`ly2:`/`ly3:` + "Especificación" + tipo de ajuste)
- Dominios X/Y calculados sobre TODAS las series + banda (nada queda fuera del plot)
- Sintaxis legacy 100% intacta (`gr1`…`gr7` sin claves nuevas rinde idéntico)
- Fail-safe del parser: `ajuste` inválido, banda a medias o `y3` sin `y2` → la fila no
  parsea (no gráficos a medias)

## 5. Validador de fichas (`protocolValidator.ts`, NUEVO ×2)

`validateProtocolSpec(items)` valida la ficha completa con **errores accionables**
(fila, celda, código, mensaje):
- sintaxis por segmento (señala el segmento exacto del typo: `"numerco-[0:10]"`)
- referencias inexistentes (`#9Z`), partidas duplicadas, ciclos
- matrices/lookup/list (matriz existe, columnas válidas), refs de gráficos, longitudes
  de series, headers fuera de lugar, xrefs (aviso de protocolo aprobado requerido)
- fichas clásicas reales → cero falsos positivos

**Integrado al import web** (`file-upload/page.tsx`): al subir el Excel se validan todas
las fichas; los errores salen en el banner y la consola. Es el contrato para el flujo
*Excel → IA → ficha → validador → IA corrige*.

## 6. Paridad web/mobile

Los 4 módulos del motor (`formulaEval`, `numericProtocol`, `chartRenderer`,
`protocolValidator`) son ahora **espejo byte-a-byte** (verificado por diff), con una sola
diferencia intencional: el mensaje de xref offline en mobile. Las dos NumericTable
implementan la misma semántica de estado/commit para todos los kinds.

## 7. Tests y documentación

- **`scripts/engineTests.ts`** — 73 casos: no-regresión del DSL legacy, tipos nuevos,
  gráficos extendidos, SI lazy/ESVACIO/SIERROR, acumulados fila-a-fila, ciclos,
  agregación filtrada, curvas con datos reales (granulometría GRA-001 y Proctor),
  renderer SVG y validador. Ejecutar: `npx -y tsx scripts/engineTests.ts`
- **`docs/MAPEO_CAPACIDADES.md`** — análisis de brechas vs SimpleLab, arquitectura en
  3 capas, tabla de 19 capacidades con estado, y diseño de la Fase F.
- **`docs/PROTOCOLOS_NUMERICOS.md`** — actualizado con toda la sintaxis v32.

## 8. Qué queda para después (Fase F, documentada en MAPEO_CAPACIDADES.md)

- Secciones enlazadas / multi-procedimiento con visibilidad ejecución-vs-resultados
- Dropdown de equipos poblado del catálogo (la celda `equipo-[tipo]` ya guarda el código compatible)
- Etapas / cuerpos de prueba múltiples
- Campo operativo/efectivo de primera clase (hoy ya expresable con `SI(ESVACIO(...))`)

## 9. Ronda de revisión de sync a la nube (push/pull) — bugs corregidos

Auditoría completa del camino *celular ↔ Supabase* para protocolos numéricos:

| # | Bug | Gravedad | Fix |
|---|---|---|---|
| 1 | **El pull pisaba datos llenados offline.** `prepareOverride` era cloud-wins incondicional; `syncProject` corre el pull aunque el push haya fallado, y `pullProjectFromCloud` (pull-only) se llama al abrir la lista de proyectos/ubicaciones. Escenario real: llenas valores sin señal → abres la app con señal → pull pisa tus `comments` con la versión vieja de la nube. | 🔴 Pérdida de datos | Nuevo `prepareFreshOverride` (last-write-wins por fila, mismo criterio que el push): si lo local es más fresco, se conserva y sube en el próximo push. Aplicado a `protocols`, `protocol_items`, `protocol_templates`, `protocol_template_items`, `evidences`, `non_conformities`. Las tablas administradas desde web siguen cloud-wins. |
| 2 | **La propagación web de cambios de plantilla re-escribía TODOS los items** de toda instancia DRAFT con `updated_at` nuevo, aunque nada hubiera cambiado — hacía que la nube pareciera "más fresca" que los valores llenados offline y amplificaba el bug #1. | 🔴 | `propagateTemplateChangesToInstances` ahora solo actualiza items cuyos campos realmente difieren (`useFileUpload.ts`). |
| 3 | **Push sin chunking**: `pushTable` mandaba todos los rows en un solo upsert — un proyecto con cientos de `protocol_items` podía exceder payload/timeout y tumbar todo el push. | 🟠 | Lotes de 200 con continuación ante fallo parcial (un row malo ya no bloquea el resto). |
| 4 | **Instancia nueva sin ancla de push**: al crear el protocolo localmente nadie lo encolaba; los `PUSH_PROTOCOL_ITEM` posteriores podían fallar por FK (el padre no existía en la nube) hasta el siguiente sync manual. | 🟠 | Al crear la instancia se encola `PUSH_PROTOCOL_STATUS` (FIFO garantiza protocolo→items). La reconciliación también encola sus items cambiados → las modificaciones de plantilla llegan a la nube en segundos. |
| 5 | **Bool en web no persistía al instante**: el commit esperaba el blur del botón. | 🟡 | `bool` se añadió al auto-commit inmediato (como listas). |
| 6 | **PDF ignoraba los tipos v32**: `percent`/`bool`/`val` no entraban al scope (fórmulas que los referencian fallaban en el PDF) y bool salía como "1"/"0". | 🟡 | `pdfGenerator` ahora puebla el scope con todos los kinds y renderiza `val` (literal), `bool` (Sí/No) y `percent` (valor + % + ✓/✗). Filas de una sola celda v32 también se renderizan con valor. |
| 7 | **Path SVG inválido en curva ajustada**: valores no-finitos generaban comandos `M` huérfanos/colgantes. | 🟡 | Reconstrucción con "pluma" — SVG siempre válido. |

**Notas de diseño (no bugs):**
- El celular **nunca borra** items locales de un protocolo vivo aunque la web los haya
  eliminado de la plantilla (política no-destructiva del reconcile). La web sí alinea
  (insert/update/delete) sus instancias DRAFT.
- Conflictos simultáneos en la MISMA fila (web y celular editan el mismo item) se
  resuelven por last-write-wins de fila — igual que el diseño del push existente.

## 10. Gráficos profesionales (v33)

Rediseño de presentación del `chartRenderer` (espejo web/mobile/PDF, API y DSL intactos):

- **Escala "nice numbers" (Heckbert)** — `niceScale()` exportada: calcula el min/max real de
  los datos por eje, elige el paso entre `{1, 2, 2.5, 5}×10^k` y **encuadra el dominio en
  múltiplos del paso**. Ticks con sentido: `0, 20, 40, …, 100` en granulometría; `8, 10, 12,
  14, 16` y `1.85, 1.90, 1.95, 2.00` en Proctor. Enteros cuando el paso ≥ 1; todos los ticks
  con los MISMOS decimales; barras siempre con baseline 0; eje X log encuadrado a décadas
  completas con etiquetas limpias (`0.01, 0.1, 1, 10, 100`).
- **Títulos de eje garantizados** — `deriveAxisTitles()` (numericProtocol ×2): si el gráfico
  no declara `xt:`/`yt:`, los hereda de los encabezados de columna (`col-[A][Tamaño (mm)]` →
  eje X). Conectado en NumericTable mobile/web y pdfGenerator. Explícitos siempre ganan.
- **Área de plot de informe técnico** — marco completo, grilla jerárquica (mayor sólida +
  menor punteada en medios pasos), tick marks, margen izquierdo dinámico según el ancho real
  de las etiquetas Y (no se cortan números largos), tipografía 10/11/13px, R² reubicado para
  no chocar con la leyenda, valores de datos enteros sin `.00`.
- **Verificación visual real**: muestras renderizadas con Chrome headless e inspeccionadas
  (`scripts/sampleCharts.ts` → `scripts/out/*.svg|png`): curva granulométrica con huso,
  Proctor con ajuste polinómico, barras.
- Tests: 19 casos nuevos (92 totales) — niceScale (rangos chicos/grandes/negativos/degenerado),
  deriveAxisTitles (fallback/explícito/sin headers), sanity del SVG (ticks, títulos, marco,
  grilla menor, baseline de barras).

## 11. Segunda ronda de caza de bugs (auditoría esquemática)

Auditoría con 3 revisiones paralelas (mobile / web / motor) + triage manual. 10 bugs reales
corregidos (varios hallazgos de la auditoría se refutaron contra el código y no se tocaron):

| # | Bug | Plataforma | Fix |
|---|---|---|---|
| 1 | **Aprobar bloqueado para siempre en granulometrías (web)**: el `canApprove` del audit no mapeaba celdas `val-` al scope → fórmulas que referencian tamices fijos daban "Referencia desconocida". | Web | Mapeo `val→manual` agregado al gate. |
| 2 | **Aprobar bloqueado por items sin método**: `if (!spec) return false` bloqueaba protocolos numéricos con encabezados de sección (permitidos desde v31). | Ambas | Items sin método se saltan; solo bloquea un método presente que no parsea. |
| 3 | **El gate de aprobación no conocía los tipos v32**: `percent` sin validar rango ni requerirse; `bool/equipment` no requeridos; `fecha/hora` aprobables con "99/99/9999". | Ambas | Gate completo por kind (incl. validez de formato). |
| 4 | **Navegación Enter/Play atascada**: el ciclo de foco incluía celdas `bool` (botón) y `list/comment` (picker/select) que no son enfocables → el foco moría en silencio. | Ambas | La navegación recorre solo celdas tipeables. |
| 5 | **`//` escrito por el usuario corrompía la fila**: el separador posicional de celdas dentro de un valor (p.ej. código de equipo) desalineaba TODAS las celdas al deserializar. | Ambas | `sanitizeCellText` colapsa `//`→`/` al persistir. |
| 6 | **Banner de errores ciego a fechas/horas inválidas**: "X valores fuera de rango" no contaba formatos inválidos. | Ambas | Cuenta y texto actualizados. |
| 7 | **Refs falsas en fórmulas malformadas**: el fallback de `extractRefs` trataba letras sueltas (`CELDA(B` sin cerrar) como referencias → ruido en el validador. | Motor | Solo ids con forma de key (`3B`) cuentan como refs. |
| 8 | **Gráfico desbordado**: SVG con width fijo se salía del contenedor en pantallas angostas (web) y el ancho mobile no descontaba el padding real. | Ambas | SVG responsive (`max-w-full h-auto`) + `window-48` en mobile. |
| 9 | **SVG corrupto con alturas mínimas** + etiqueta de barra negativa ilegible (quedaba dentro de la barra) + leyenda desbordada con etiquetas largas. | Charts | Mínimos defensivos 220×140, label bajo la barra negativa, truncado a 25 chars con `…`. |
| 10 | Tests: +1 caso (fallback de refs) → **93/93**. | — | — |

## 12. Mejoras visuales del módulo (v33b) — 13 puntos aplicados

Siguiendo la paleta corporativa S-CUA existente (navy/primary/light, Radius, Shadow):

**Mobile (`NumericTable`):** inputs de 42px con resaltado de celda enfocada (borde primary +
tinte azulado), banner de errores estilo alerta (borde izquierdo 4px warning), botón "EMPEZAR
LLENADO" con sombra y mayúsculas, modal de listas con fondo navy 55% + opción seleccionada con
check, estado por fila como badge circular (✓ verde suave / ✗ rojo suave), y **bandas de
sección** cuando el protocolo tiene ≥2 secciones (chip uppercase estilo app).

**Web (`NumericTable` / fill):** íconos lucide `CheckCircle2`/`XCircle` en el estado de fila,
**tooltip nativo** con rango+norma al pasar el mouse por la celda, **fila completa teñida** y
número en rojo cuando hay error, botón **fx por fila** (ver fórmulas de una sola fila además
del toggle global), bandas de sección, y bloques del fill numérico con `gap-6`.

**Gráficos/PDF:** clave DSL **`alto:`** (proporción alto/ancho 30–150%, validada con fail-safe)
respetada en celular, web y PDF; y en el PDF cada gráfico lleva **pie numerado**
("Gráfico N — Título") para citarlo en el informe.

La página de auditoría no diverge: usa el mismo `NumericTable` compartido, manteniendo la
apariencia consistente con los protocolos clásicos. Tests: 96/96.

## 13. Mejoras de visualización y lógica del prompt MEJORAS_PROTOCOLO_ENSAYO (v34)

Las 6 mejoras del prompt, guiadas por el Excel base de Cerro Verde (`Excel_Base_CV`):

| # | Mejora | Implementación |
|---|---|---|
| 1 | **Secciones con columnas variables** | `groupIntoSections()` (parser ×2): una fila `col-[…]` o un cambio de `Sección` inicia sección nueva con su PROPIO nº de columnas. Render por secciones en NumericTable mobile+web (banda con título y nº de cols, headers y fila de letras por sección, ✓ alineado con spacer). Headers ya no limitados al inicio ni a 3 niveles; imports web/mobile auto-asignan `__hdrN__` sin límite. |
| 2 | **Alineación vertical de celdas** | Slot de ALTURA FIJA bajo cada recuadro (con o sin rango, misma altura), inputs compactados a 36px, y la **norma sube al encabezado de columna** (bajo la letra) en vez de empujar la celda. |
| 3 | **Encabezados completos** | Sin `…`: word-wrap multi-línea manteniendo el ancho de columna; fila de encabezado más compacta (crece solo si el texto lo necesita). |
| 4 | **Header fijo liberado** | Ubicación + botón Planos salieron del encabezado fijo del fill screen mobile → ahora viven en el contenido desplazable; el header conserva solo título y fecha. |
| 5 | **Gráfico Proctor correcto** | Con `ajuste:` los puntos van **sueltos** (scatter) y la polinómica es la curva que los conecta; `PUNTOMAXIMOX/Y` ahora es **algebraico** (derivada=0 en forma cerrada, exacto en parábolas perfectas) y el gráfico marca el **punto máximo** con líneas de referencia rojas + leyenda (réplica del Excel base, verificado visualmente con Chrome headless). |
| 6 | **Tipos de celda por visibilidad** | Sufijos `:oculto` (cálculo invisible en app y PDF, sigue computando) y `:nopdf` (visible en app, excluido del reporte). Validador rechaza `:oculto` en entradas; PDF omite celdas/filas suprimidas; gates de aprobación las saltan. |

Extra de la ronda: falso warning del import web con filas mixtas `val-[…] // numerico-[…]`
corregido, y auto-asignación de partidas reservadas portada al import mobile (antes los
headers con partida vacía colisionaban entre sí).

Sample actualizado (`01_protocolos_numericos_v34.xlsx`): PRO-103 ahora usa poli3 con
intermedio `:oculto` consumido por la celda visible, dato `:nopdf`, y curva estilo informe.
Verificación: **113/113 tests del motor + 38/38 end-to-end del sample + 0 errores TS ×2**.

## 14. Iteración prompt-flow-qaqc-protocolos — Partes A/B/C/D+E (v35)

Diagnóstico con 3 pantallazos del celular + 3 Excels reales de minería
(`Compaction Summary`, `Resumen de Curvas Proctor`, `Resumen Granulometrias` —
~2,200 ensayos/resumen, codificación `PR-260032`).

### Parte A — Correcciones (A6 omitida a pedido)

| # | Item | Implementación |
|---|---|---|
| A1 | Norma fuera de vista | `:norma[]` sigue parseando (compat) pero ya NO se renderiza: fila de letras mobile/web sin chip de norma; tooltip web solo con rango. |
| A2 | Ensayo de ejemplo convertido | Nueva ficha `PRC-201 — Compactación Proctor (ASTM D698)` en el sample, réplica del Excel base CV: molde como datos fijos, 4 puntos por columnas (`CELDA(?, n)` por columna), humedad, resultados con `PUNTOMAXIMOX` oculto + curva poli3. Asignada al Tramo 2. |
| A3 | Decimales por celda | Nuevo sufijo DSL **`:dec[n]`** (0–6) en manual/porcentaje/fórmula → render y PDF con `toFixed(n)`. Orden: el rango de `fx` va primero, `:dec` después. Validador rechaza n>6. |
| A4 | Casilla sobre el teclado | `app.json` → `softwareKeyboardLayoutMode: "resize"` + `ensureCellVisible` en el fill screen: cada input numérico se mide en pantalla al enfocar (`measureInWindow`) y la lista se desplaza si la celda queda bajo el teclado. |
| A5 | Gráfico cortado + leyenda | El dominio Y ahora incluye la **curva ajustada muestreada** y el punto máximo (el pico ya no se corta), y la **leyenda va DEBAJO del gráfico** en filas centradas (fuera del área de datos). chartRenderer ×2. |
| A7 | "7" bajo el resultado | Eliminado el subtexto de partida en modo numérico (la renumeración v34 salta ocultas y desalineaba partida vs nº visible). |
| A8 | Columnas A-D fantasma | Causa: `// //` al final de las filas del sample declaraba 2 celdas blank → sección de 4 columnas. Corregido el sample; documentado que las blank definen columnas. |
| A9 | Resumen cumple/no-cumple | El bloque de 4 contadores del audit se oculta en modo numérico (mobile; web ya lo hacía) — contaba headers/ocultos y confundía. |
| A10 | Columna en blanco | El ancho del gráfico embebido se acota al ancho real de la tabla (cols izq + strip de celdas) → el contenido llega solo hasta el ✓. |
| extra | Título duplicado | La fila de gráfico ya no repite la descripción si el chart trae `t:` propio (solo nº). |

Fix de parser (v35): una fila todo-`val-[…]` ANTES de cualquier `matrix-[…]` se
reinterpreta como fila normal de valores fijos (antes: `matriz-mal-formada`).

### Parte B — Exportación de protocolos numéricos (CRÍTICO)

El PDF exportaba los numéricos como clásico (mobile) o como spans inline (web).
Ahora ambos generadores comparten **`numericPdfHtml.ts`** (espejo ×2):
`buildNumericProtocolBlocks()` emite el MISMO formato del audit page — bandas de
sección, encabezados `col-[…]`, fila de letras, valor+rango+✓ por celda, ✓ por
fila, gráficos numerados con leyenda — respetando `:oculto`/`:nopdf`/`:dec` y
con las matrices como tabla auxiliar anexa. `paginateNumericBlocks()` pagina por
peso real (las secciones largas se trocean repitiendo encabezados; un gráfico
pesa su altura real) y el CONTEO de páginas del dossier usa la misma función →
"Página X de Y" nunca se desfasa. Wire-in: `flow-qaqc-web/lib/pdfGenerator.ts`
(dossier + protocolo individual) y `src/services/DossierExportService.ts`
(mobile), con fallback al render clásico si la estructura es inesperada.
Verificado visualmente (Chrome headless) con PRO-103 y PRC-201 llenos.

### Parte C — Tarjeta "Dossier de calidad"

Primera tarjeta del menú del proyecto (web `menu/page.tsx` + mobile
`ProjectMenuScreen`), con 3 contadores (aprobados / en revisión / rechazados —
mismos datos que los mini-badges de la lista de proyectos) y enlace al Dossier
EXISTENTE (sin duplicar módulo).

### Parte D+E — Documento de diseño (pendiente de aprobación)

`docs/DISEÑO_MODOS_LLENADO.md`: modos de llenado por sector/tipo/fecha (flags
`fill_by_*`, sin migración: `sector_id` v26 + `location_id` nullable),
codificaciones con máscaras `{TIPO}-{AA}{SEQ:4}` → `PR-260032` (migración v35
`protocol_code` + índice único Supabase + correlativo offline-safe con
re-secuenciación al push), celda DSL `codigo-[]`, y 4 preguntas abiertas.
**Nada implementado aún** — espera aprobación del diseño.

Sample regenerado como `01_protocolos_numericos_v35.xlsx` (7 fichas).
Verificación: **134/134 tests del motor + 40/40 end-to-end del sample + 0
errores TS ×2 + muestras visuales (charts y PDF numérico) renderizadas con
Chrome headless**.

## 15. Módulo CSV de ensayos numéricos — import/export (v35b)

### Fase 0 — limpieza de bugs de la ronda v35

Auditoría adversarial del código nuevo. Falsos positivos descartados con
verificación de código (alineación de columnas del PDF, conteo de páginas,
leyenda en barras, fitYExtremes con logX, anclas del resumen). Corregidos:

- **`:dec[n]` coherente en la app**: las celdas de ENTRADA (manual/porcentaje)
  ahora MUESTRAN el valor confirmado con los decimales fijados cuando no están
  enfocadas (igual que el PDF); el crudo tipeado se conserva. NumericTable ×2.
- **Scroll fantasma del teclado**: `keyboardDidHide` marca el teclado cerrado y
  `ensureCellVisible` ya no desplaza con una altura stale (fill screen mobile).
- **PDF numérico endurecido**: si `extractMatrices` reporta estructura de
  matriz malformada, el helper lanza y el generador cae al formato clásico
  (antes ignoraba las matrices en silencio).

### Importación CSV (formato ANCHO — 1 fila = 1 ensayo) — solo web

Tab **"Históricos / CSV"** de Cargar archivos (el tab ahora es siempre visible;
el flag `historical_import` gatea solo las secciones de importación):

- Columnas fijas `external_id, ubicacion, fecha` (+ opcionales `llenado_por`,
  `firmado_por` — fallback al usuario actual) y una columna por celda de
  ENTRADA con encabezado **clave + descripción** (`4A Peso molde + suelo (g)`);
  el parser identifica por el token inicial e ignora el resto.
- **Plantilla CSV descargable** por protocolo (roundtrip garantizado por test).
- Acepta CSV de **Excel regional ES** (`;` + coma decimal, autodetección de
  delimitador), UTF-8 con/sin BOM y fallback windows-1252.
- REUSA el pipeline histórico completo (`validateImport` → resolución de
  usuarios → `executeImport`): los ensayos entran **APPROVED + is_historical +
  is_locked**, con snapshot de fórmulas/lookups, dedup por external_id y los
  mismos modales/resúmenes del importador Excel de 2 hojas.
- De paso se EXTENDIÓ el núcleo histórico a los **tipos v32** (fecha, hora,
  bool, porcentaje, equipo, comentario — antes se perdían en silencio) y las
  celdas `val-` ahora entran al scope del snapshot (las fórmulas que las
  referencian ya computan en el import).

### Exportación CSV de datos — solo web, SIEMPRE visible

Sección 4 del mismo tab: elige protocolo → descarga **1 fila por ensayo**
(cualquier estado) con columnas fijas (external_id, protocolo, ubicación,
estado en español, fechas) + TODAS las celdas visibles en el orden de la ficha
(entrada y calculadas; `:oculto` y blanks excluidas; `:dec[n]` aplica; bool
sale Sí/No). Si una instancia vieja no tiene snapshot de fórmulas, se recomputa
al vuelo. **UTF-8 con BOM** (abre directo en Excel con acentos/ñ). Items
consultados por chunks de 100 ids (~2,200 ensayos sin problema).

### Archivos

```
flow-qaqc-web/lib/csvEnsayos.ts                      ★ NUEVO (núcleo import + plantilla)
flow-qaqc-web/lib/csvExport.ts                       ★ NUEVO (núcleo export)
flow-qaqc-web/hooks/useCsvEnsayos.ts                 ★ NUEVO (I/O + descarga BOM)
flow-qaqc-web/components/historical/CsvImportSection.tsx  ★ NUEVO
flow-qaqc-web/components/historical/CsvExportSection.tsx  ★ NUEVO
flow-qaqc-web/lib/historicalImport.ts                ★ tipos v32 + val al scope
flow-qaqc-web/hooks/useHistoricalImport.ts           ★ loadProjectImportCatalog extraído
flow-qaqc-web/components/historical/HistoricosTab.tsx ★ secciones 3-4 + gating interno
scripts/csvEnsayosTests.ts                           ★ NUEVO (52 tests)
```

Verificación: **52/52 tests CSV + 134/134 motor + 40/40 sample + 0 errores TS ×2**.

### Ronda de revisión adversarial del módulo CSV (4 bugs corregidos)

1. **`//` dentro de un valor de usuario** rompía el alineamiento posicional de
   `joinRowComments` al serializar. Se colapsa a `/` en `assembleProtocolItems`
   (cubre el import CSV Y el Excel histórico, que tampoco sanitizaba).
2. **Partidas con punto** ("1.1", "7.2"): el token del encabezado se matchea
   ahora contra las partidas REALES del template (`matchCellToken`), no con un
   regex solo-dígitos que mapeaba "1.1A" a la celda equivocada.
3. **Fechas ISO solo-fecha y timezone**: `2026-03-03` se parseaba a medianoche
   UTC → en husos negativos (Perú) la fecha exportada retrocedía un día. Ahora
   queda a mediodía LOCAL (igual que dd/mm/aaaa).
4. Limpieza: cast innecesario de `apellido` (el tipo `User` ya lo tiene) y
   helper `listTemplates` muerto.

Verificación final: **60/60 tests CSV (8 de regresión nuevos) + 134/134 motor +
40/40 sample + 0 errores TS ×2**.

## 16. Modos de llenado de protocolos + codificación correlativa (v31, Partes D+E)

> ⚠ **Requiere ejecutar `supabase/v31_fill_modes_codes_migration.sql` en el SQL
> Editor de Supabase** (columnas `protocol_code` y `ensayo_date` + índice único).

### Parte D — Modos de llenado (conviven; "por ubicación" intacto y default)

- **Flags nuevos** (`fill_by_sector`, `fill_by_type`, `fill_by_date`) configurables
  en el grupo **"Llenado de protocolos"** de Configuración de Protocolos — móvil
  (`ProjectConfigScreen`) y web (`ProjectConfigModal`).
- **Móvil**: pantalla única `EnsayosScreen` (modo sector/tipo/fecha) con grupos
  DESPLEGABLES (sectores de `project_sectors` / plantillas / fechas desc con
  "Sin fecha"), contadores por estado, y modal **"+ Adicionar ensayo"** (tipo +
  cantidad N 1–50 + fecha editable). Tarjetas en el menú del proyecto gateadas
  por flag. Las instancias van SIN ubicación (`location_id null`,
  `sector_id` en modo sector); las 3 vistas leen las MISMAS instancias.
- **Web**: espejo en `app/.../ensayos/[mode]/page.tsx` + hook `useEnsayos` +
  tarjetas en el menú. Fix de navegación: fill/audit ya no rompen con
  `location_id null` (vuelven a la vista de ensayos del modo o al menú).
- `useProjectMetrics`: el % de avance cuenta solo protocolos CON ubicación
  contra el esperado por ubicación (los ensayos de los modos nuevos no inflan
  el progreso).
- **Refactor**: la creación de instancias móvil vive ahora en
  `ProtocolInstanceService.createInstances()` (lote atómico de N + enqueue FIFO),
  consumido también por el flujo clásico por ubicación. En web, el núcleo es
  `createEnsayoInstances()` (useEnsayos), reusado por `useCreateProtocolInstance`.
- Nueva columna `protocols.ensayo_date` (YYYY-MM-DD, default hoy en TODA
  creación nueva) — el modo fecha es una vista sobre todo lo creado desde v31.

### Parte E — Codificación correlativa (PR-260032)

- Flag `protocol_codes` + máscara configurable `coding_mask_default` (default
  `{TIPO}-{AA}{SEQ:4}`) con tokens `{TIPO} {AA} {AAAA} {MM} {DD} {SEQ:n}
  {SECTOR}` y validación en ambas UIs ({SEQ}, {TIPO} y año obligatorios — el
  índice único es por string). Ámbito del correlativo: **tipo + año + proyecto**.
- Utilidad pura espejo `protocolCode.ts` ×2 (`buildProtocolCode`, `maskToRegex`
  con literales escapados — tipos con guiones OK, `{SEQ:n}` tolera overflow,
  `nextSeq`). 17 tests.
- **Generación offline-safe**: al crear, seq = max local + 1. El índice único
  parcial de Supabase `(project_id, protocol_code)` es el guardián; en colisión
  (23505) el sync móvil **re-secuencia y reintenta** — con mutex de módulo
  (el SyncWorker paraleliza ops: sin serializar, N protocolos en conflicto
  elegirían el mismo seq nuevo) y fallback fila-por-fila en el push bulk.
  Web: retry-loop (máx 5) re-leyendo códigos remotos.
- **Display**: el código aparece en cards (Ensayos/listas/Dossier), headers de
  fill/audit, PDFs (header + tabla resumen) y como columna fija `codigo` del
  export CSV.
- **Celda DSL nueva `codigo-[]`**: read-only, muestra el protocol_code dentro
  de la ficha (render ×2 + PDF + validador: máx 1 por ficha, no entra al scope).
- Sin backfill (solo ensayos nuevos); las importaciones históricas/CSV no
  generan código (traen `external_id`).

Verificación: **157/157 motor (23 nuevos) + 60/60 CSV + 40/40 sample + 0 TS ×2**.

### Ronda de revisión adversarial de v31 (3 fixes)

1. **Hint del menú** (×2): decía que las opciones ocultas eran solo
   Trazabilidad/Geolocalización; ahora también cubre los modos de llenado.
2. **Históricos sin `ensayo_date`**: el importador histórico/CSV ahora deriva
   `ensayo_date` de `filled_at` — los históricos agrupan bien en el modo
   "por fecha" (antes caían todos en "Sin fecha").
3. **Tipo vacío**: una plantilla sin `id_protocolo` ni nombre ya no genera un
   código malformado ("-260001"); el ensayo se crea SIN código con aviso (×2).

Falsos positivos descartados con verificación: convergencia de colisiones en
lote (cada op re-secuencia individualmente, serializada por el mutex que SÍ ve
los códigos locales regenerados previos), `parseEnsayoDate` valida overflow,
`Q.notEq(null)` soportado por WatermelonDB (`IS NOT NULL`), las puertas de
aprobación ignoran `codigo-[]` (no bloquea), y los códigos offline son
PROVISIONALES por diseño (pueden cambiar al sincronizar si hubo colisión).

## 17. Mejoras UI/UX de los módulos de ensayos (v32)

> ⚠ **Requiere ejecutar `supabase/v32_ensayo_time_migration.sql`** (columna
> `ensayo_time`). El celular migra solo al actualizar la app (schema v32).

1. **Módulos de ensayos (sector/tipo/fecha, móvil + web)**: cards más altas y
   aireadas (código + estado arriba, nombre en 2 líneas, fecha · hora ·
   referencia); **buscador de texto**; botón **"Adicionar ensayo" outline**
   (borde de color, interior blanco) ubicado JUSTO debajo de la tarjeta del
   grupo; **filtros cruzados** arriba (fecha → calendario [react-native-calendars
   en móvil, date-picker nativo en web]; sector/tipo → modal de selección),
   default "todos"; con filtros/búsqueda activos los grupos con coincidencias se
   auto-expanden.
2. **Hora del ensayo** (`protocols.ensayo_time`, HH:MM): el modal de creación
   la recolecta con default = hora del sistema AL GUARDAR (editable), con el
   mensaje "Se recolectará la hora de inicio del ensayo". Visible en cards y en
   Datos generales.
3. **"Datos generales" en el fill screen (móvil)**: sección superior con
   Proyecto, Código, Ensayo, Fecha/hora y Ubicación (sin el recuadro
   "UBICACION"), con el **módulo GIS integrado** y rediseñado: título
   "Coordenadas" + datum visible ("Latitud, Longitud · WGS84"), sin precisión
   (±m), sin iconos a la izquierda, sector sin sufijo "(manual)", y el botón
   Recapturar con icono GPS (locate) en vez de recarga. La lógica de captura
   (coordenada actual + respaldo previo + timestamp) quedó intacta.
4. **Evidencia en numéricos (móvil)**: el botón "Adjuntar evidencia fotográfica
   extra" ahora usa icono de upload y a su lado hay un **botón de cámara** que
   abre LA MISMA cámara de los ensayos tradicionales (compresión + estampado de
   logo/fecha/hora) y guarda la foto como evidencia extra
   (`CameraScreen.extraPhotoProtocolId`). Orden de la base: evidencia →
   comentarios generales → enviar para aprobación.
5. **Dossier de calidad**: los chips de estado (aprobados / en revisión /
   rechazados) pasaron a estilo outline (solo borde de color) en móvil y web.

Verificación: **157/157 motor + 60/60 CSV + 0 errores TS ×2**.

### Segunda ronda UI/UX (v32b)

1. **Filtros**: fecha pasó a **RANGO desde/hasta** (DateRangePicker con
   calendario en móvil; 2 date-pickers en web; mismo día = solo ese día);
   tipo y sector pasaron a **multiselección** (modal con checkboxes + "Todos");
   default sin restricción.
2. **Acordeón de ensayos**: tarjeta principal **navy** (jerarquía) y panel
   desplegado con **fondo plomo** tipo tapiz (referencia: módulo Planos), con
   el botón Adicionar (outline) arriba del panel. Móvil + web.
3. **Fill numérico (móvil)**: sin encabezado superior (el nombre/fecha viven en
   Datos generales) — queda un **botón flotante de retroceder**; márgenes
   laterales mínimos (padding 2px; gráficos hasta width-20).
4. **Datos generales**: formato del Audit Page (celdas en grid 2×fila con caja
   gris); se eliminó el campo "Buscar ubicación".
5. **Tabla numérica (móvil)**: la cabecera `# / Actividad / ✓` ya no es una
   barra global — vive en CADA sección (debajo de su título), con `#` y
   `Actividad` centrados VERTICALMENTE respecto a las filas de encabezados +
   letras.
6. **GIS**: la 1ª captura automática al entrar al ensayo ya no muestra el aviso
   "fuera del área de trabajo" (solo en recapturas explícitas).

Verificación: **157/157 motor + 60/60 CSV + 0 errores TS ×2**.

### Tercera ronda UI/UX + fixes (v32c)

> ⚠ Requiere la API key de Google Maps en el manifest (ya cableada, ver abajo)
> y la migración `supabase/v32_ensayo_time_migration.sql`.

1. **Tarjetas de grupo (sector/tipo/fecha)**: reemplazada la cabecera navy
   sólida por la **"cinta" de las tarjetas de la página principal** (borde
   superior primary 3px + Radius.lg + sombra de tarjeta); más altas
   (paddingVertical 18) y el título admite 2 líneas (ya no se corta). Panel
   desplegado conserva el fondo plomo. `paddingBottom` de la lista subido a 220
   para que la última tarjeta siempre pueda subirse sobre el borde inferior.
2. **Botón "Empezar llenado"**: verde y compacto (mismo tamaño que el botón
   "Recapturar" del GPS) — `NumericTable`.
3. **Fill numérico**: franja superior **mini** (back + código·nombre) en lugar
   del header completo; márgenes laterales con algo de aire (offset 8);
   **carga esquelética** (skeleton + spinner) mientras se arman protocolo+items
   en background → al terminar aparece directo el formato correcto, sin el flash
   del layout clásico (gate `itemsLoaded`).
4. **Sector fijo por sector**: al entrar a un ensayo desde "Ensayos por sector",
   el selector de sector del recuadro de Coordenadas viene FIJO con ese sector y
   no editable (`GPSCaptureBar.sectorLocked`, propagado vía
   `ProtocolFill.sectorLocked` solo en modo sector).
5. **Gestión del ensayo (long-press)**: en los 3 módulos, mantener presionada la
   tarjeta abre un modal para **editar fecha/hora** o **eliminar** el ensayo.
   El borrado es FK-seguro y sin huérfanos (evidencias → items → approvals →
   protocolo), local + nube vía nueva op de cola **`DELETE_PROTOCOL`**
   (`deleteProtocolStrict` en SupabaseSyncService). En revisión/aprobados: el
   modal bloquea editar/eliminar.
6. **Fix bug de borrado/edición "Cannot destroy/update a record with pending
   changes"**: un pull interrumpido dejaba prepares HUÉRFANOS en instancias
   cacheadas de WatermelonDB. Solución doble: (a) los call-sites de borrado/
   edición limpian `_preparedState` antes de la operación; (b) los 8 batches del
   sync pasan por `safeBatchWrite`, que limpia los prepares si el batch falla
   (no vuelve a envenenar registros).
7. **Geolocalización**: agregada la `<meta-data com.google.android.geo.API_KEY>`
   al `AndroidManifest.xml` (carpeta android/ versionada) + slot en `app.json`
   (`android.config.googleMaps.apiKey`). Los permisos de ubicación se fusionan
   desde la librería `expo-location`. **Pendiente de seguridad**: restringir la
   key por package `com.vxp.scua` + SHA-1 antes de release.

Verificación: **157/157 motor + 60/60 CSV + 40/40 sample + 0 errores TS ×2**.

## 18. Onboarding/tour en las pantallas nuevas (v32d) — SOLO móvil

Se extendió el sistema de tour guiado existente (TourContext + useTourStep +
TourOverlay) a **11 pantallas** que no tenían onboarding, con el MISMO patrón ya
usado en ProtocolFill/PlanViewer/etc.

**Mecanismo nuevo `contextOnly`**: los 30 pasos agregados son tours
CONTEXTUALES por pantalla (se alcanzan solo con el botón de ayuda `?` de cada
una vía `jumpToStep`, y cada bloque cierra con `contextEnd`). Marcados
`contextOnly: true`, viven al final de `TOUR_STEPS` y NO entran al recorrido
lineal de bienvenida: `totalSteps` expone ahora `linearCount` (excluye los
contextuales) y `nextStep` corta el welcome al toparse con el primer
`contextOnly`. El overlay oculta el contador "X / N" en modo contextual.
Decisión del usuario: contextual por pantalla (no integrar al tour lineal),
porque son módulos opcionales gateados por flags.

**Pantallas cubiertas (3-4 pasos c/u, botón de ayuda en el AppHeader):**
- Ensayos por sector/tipo/fecha (`ens_*`): buscador, filtros, grupo desplegable.
- Geolocalización: Mapa (`map_*`: filtros, mapa, capa) y Sectores
  (`sectors_*`: importar, tarjeta, recalcular).
- Configurar módulos (`config_*`: protocolos, trazabilidad, geo, guardar).
- Contactos (`contacts_*`: directorio, agregar).
- Trazabilidad: Home (`trace_home_*`), Nueva sesión (`trace_cap_*`), Checklist
  (`trace_chk_*`), Sesión activa (`trace_run_*`), Análisis (`trace_an_*`) y
  Detalle de sesión (`wsd_*`).

Patrón aplicado: `useTour()` + `useTourStep('id')` por elemento, refs directos
en TouchableOpacity/View/TextInput y `<View ref>` envolviendo componentes custom
(MapView, PickerField, SlideToConfirm, DateRangePicker, SectionBox); en
listas/SectionList el ref va solo al primer item; efecto `blur` que cierra el
tour contextual al salir de la pantalla. Web sin cambios (el onboarding es
solo móvil). Verificación: **30/30 ids cableados consistentes + 157/157 motor +
60/60 CSV + 0 errores TS ×2**.

## 19. PDF de ensayos numéricos — orden y rediseño de tablas (v32e)

Correcciones al helper `numericPdfHtml.ts` (espejo ×2):

1. **Orden (bug)**: el dossier hacía `.fetch()` de los protocol_items SIN ordenar
   → el PDF salía en orden de inserción. Ahora `buildNumericProtocolBlocks`
   ordena por `partida_item` natural (`localeCompare numeric`), réplica exacta
   del sort del audit/llenado → mismo orden A,B,C que en la app.
2. **Cabecera unificada y completa**: cada tabla de sección abre con una franja
   **navy** (`#0e213d`, el de la app) que ya incluye `#` · `Actividad` ·
   títulos de columna (col-[…], con rowspan) · `✓`.
3. **Limpieza visual**: se quitó la fila de letras A/B/C/D, los rangos
   `[min:max]` bajo cada valor y los ✓/✗ por celda. Queda **un solo ✓/✗ por
   fila** en la columna del extremo derecho.
4. **Títulos de procedimiento**: sin franja de fondo → texto centrado, negrita,
   subrayado, un punto mayor que el cuerpo, con margen inferior antes de la tabla.

Verificado con render Chrome headless (PRO-103 + PRC-201) y engineTests.
**0 errores TS ×2.**

## Archivos tocados

```
src/utils/formulaEval.ts                ★ reescrito (motor v32)
src/utils/numericProtocol.ts            ★ tipos nuevos + graph ext + validadores fecha/hora
src/utils/chartRenderer.ts              ★ multi-serie/banda/ajuste/leyenda
src/utils/protocolValidator.ts          ★ NUEVO
src/components/NumericTable.tsx         ★ kinds nuevos + ctx de fila
flow-qaqc-web/lib/formulaEval.ts        ★ espejo
flow-qaqc-web/lib/numericProtocol.ts    ★ espejo (corrige bug val- mixto)
flow-qaqc-web/lib/chartRenderer.ts      ★ espejo
flow-qaqc-web/lib/protocolValidator.ts  ★ NUEVO
flow-qaqc-web/lib/pdfGenerator.ts       ★ pasa campos nuevos del gráfico
flow-qaqc-web/components/numeric/NumericTable.tsx  ★ kinds nuevos + ctx + branch val
flow-qaqc-web/components/numeric/NumericChart.tsx  ★ props nuevas
flow-qaqc-web/app/app/projects/[id]/file-upload/page.tsx  ★ validador integrado
flow-qaqc-web/hooks/useFileUpload.ts    ★ propagación solo-si-cambió (sync §9.2)
flow-qaqc-web/lib/pdfGenerator.ts       ★ tipos v32 en scope + render (sync §9.6)
src/services/SupabaseSyncService.ts     ★ prepareFreshOverride + pushTable en lotes (sync §9.1/9.3)
src/screens/LocationProtocolsScreen.tsx ★ enqueue protocolo+items reconciliados (sync §9.4)
scripts/engineTests.ts                  ★ NUEVO (73 tests)
docs/MAPEO_CAPACIDADES.md               ★ NUEVO
docs/PROTOCOLOS_NUMERICOS.md            ★ actualizado a v32
docs/RESUMEN_MEJORAS.md                 ★ este archivo
```
