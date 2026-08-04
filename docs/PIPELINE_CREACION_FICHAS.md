# PIPELINE — Creación de fichas y proyectos (arranque de obra)

> Documento **depurado y vivo**: es lo más recurrente al iniciar un proyecto.
> Se actualiza con cada obra nueva. Caso de referencia real: **Mercado Mayorista
> Plaza Unicachi Huancayo** (2026), primer proyecto con protocolos 100% de cliente.
>
> Complementos: `Actividadesv1/DOCUMENTO_GUIA_Conversion_Fichas.md` (DSL numérico
> a detalle) · `docs/FLUJO_EDICION_FICHAS.md` (editar fichas ya cargadas, en nube).

---

## FASE 0 — Recepción y triaje de la carpeta

El cliente entrega una carpeta de Excel. **Nunca asumir 1 archivo = 1 protocolo.**

1. **Inventariar TODAS las hojas** de todos los libros (un libro suele traer
   varios protocolos distintos y muchas copias ya llenadas).
2. Por cada hoja extraer: **título**, **código de documento** (ej. `PA-VRS-2026-002`),
   nº de ítems, si tiene columnas SI/NO/NA, y si hay tablas de datos.
3. **Deduplicar por código+título** → lista de *protocolos únicos*. Las hojas
   repetidas suelen ser el mismo protocolo llenado para distinto bloque/fecha:
   sirven como **datos de ejemplo**, no como fichas nuevas.
4. **Detectar protocolos de OTRO proyecto**: revisar CLIENTE/PROYECTO en el
   encabezado. Es normal que el cliente mande plantillas de una obra anterior
   como modelo → **preguntar** si se adoptan, y con qué cliente/código.

Script base (ejecutar **desde la raíz del repo**, resuelve `node_modules/xlsx`):

```js
const XLSX = require('xlsx');
const wb = XLSX.readFile(file, { cellFormula: true });   // lee .xls y .xlsx
for (const name of wb.SheetNames) { /* recorrer !ref y volcar celdas */ }
```

---

## FASE 1 — Clasificar: ¿protocolo CLÁSICO o NUMÉRICO?

Esta es **la primera decisión** y condiciona todo lo demás.

| Señal en el Excel | Tipo | Por qué |
|---|---|---|
| Columnas **SI / NO / NA** (o CONFORME/OBSERVADO), ítems de verificación en texto | **CLÁSICO** (de opción) | Es una lista de verificación: se responde, no se calcula |
| **Fórmulas reales** de cálculo (`=B21*C21`, promedios, interpolaciones) | **NUMÉRICO** | Hay un resultado que depende de mediciones |
| Tabla de **mediciones** con unidades (kg/cm², %, m³, coordenadas) y/o comparación contra un límite | **NUMÉRICO** | Requiere celdas tipadas + dictamen |
| Checklist **+** una tabla de registro de datos sin cálculo | **HÍBRIDO** → decidir (ver abajo) | |

**Ojo — falsos positivos de "numérico":** fórmulas tipo `=B21+1` son solo
autonumeración de ítems, **no** son cálculo → sigue siendo clásico.

**Regla para HÍBRIDOS** (checklist + tabla de datos): si la tabla **no tiene
cálculo ni dictamen**, va como **clásico** y la tabla se resuelve con ítems de
texto o evidencia. Si la tabla **compara contra tolerancia** (ej. coordenadas
plano vs campo → variación), va como **numérico**.

---

## FASE 2 — Extraer la estructura (lo que va a la ficha)

Por cada protocolo único, identificar en orden de aparición:

1. **Encabezado / Datos generales** → NO van como ítems: se mapean a los campos
   del sistema (proyecto, cliente, supervisión, contratista, fecha, plano de
   referencia, ubicación/niveles, elemento). Si un dato **no** existe en el
   sistema, va a la config del proyecto o a un ítem de texto al inicio.
2. **SECCIONES**: todo título en mayúsculas o fila con encabezado
   `1° Rev / 2° Rev / OBSERVACIONES` abre una sección nueva.
3. **ÍTEMS/preguntas** de cada sección, **en su orden original**.
4. **Croquis / esquema** → se resuelve con el croquis del sistema o evidencia
   fotográfica, no como ítem.
5. **Firmas** → no son ítems: las cubre el flujo de aprobación del sistema.

> ⚠ **REGLA DE ORO:** incluir **todas las preguntas en todas las secciones**.
> Si el mismo set de 4 preguntas se repite en 9 secciones → **36 filas**, no 4.
> Cada sección es un elemento que se libera por separado.
> (Ver memoria `feedback-fichas-todas-las-preguntas`.)

---

## FASE 3 — Construir el Excel maestro (formato que lee la app)

**Hoja 1** (la primera del libro), columnas **obligatorias** con estos nombres exactos:

| Columna | Contenido |
|---|---|
| `ID_Protocolo` | Código corto y estable del tipo de ficha (ej. `ACE`, `ENC`, `PCC`). Es la llave: se usa en códigos de ensayo, config de PDF y llamadas entre fichas |
| `Protocolo` | Nombre visible (ej. `PROTOCOLO DE ACERO`) |
| `PartidaItem` | Numeración de la fila. **Enteros secuenciales, sin huecos** — las pantallas ORDENAN por este campo |
| `Actividad realizada` | El texto de la pregunta/ítem |
| `Método de validación` | Cómo se verifica (ej. `Inspección visual`, `Medición`, `Según plano`) |
| `Sección` | Nombre de la sección. Vacío o `NA` = sin sección |

Reglas críticas:
- **`PartidaItem` ordena la ficha**: numerar TODAS las filas (incluidos
  encabezados de columna y gráficos en fichas numéricas) con enteros
  secuenciales. Partidas vacías → las secciones se entremezclan.
- Un mismo libro puede traer **varios protocolos**: se agrupan por `ID_Protocolo`.
- Hoja opcional `AGRUPACIONES` → presets del selector de llamadas entre fichas.
- Para fichas **numéricas** el DSL va dentro de `Actividad realizada` /
  `Método de validación` (`num-`, `col-`, `list-`, `xref-`, `:ej[...]`, etc.):
  ver `DOCUMENTO_GUIA_Conversion_Fichas.md`.

---

## FASE 4 — Validar antes de subir

- Fichas **numéricas**: `npx tsx scripts/fichaValidate.ts <rows.json> [aux.json]`
  → `isNumericProtocol` + `validateProtocolSpec` + smoke test con los `:ej`.
- Fichas **clásicas**: verificar conteo de ítems por sección contra el Excel
  original (es el error más común: secciones colapsadas o ítems perdidos).
- Revisar que **ningún `PartidaItem` se repita ni salte**.

---

## FASE 5 — Configurar el proyecto

Antes de importar, dejar definido (Configuración del proyecto, solo CREADOR):

- **Tipo de obra**: `edificaciones` (default) · `obra_lineal` (tramos+progresivas) · `mineria`.
- **Flags de protocolo**: `classic_protocols`, `numeric_protocols`.
- **Modos de llenado**: por ubicación (siempre ON) + `fill_by_sector` /
  `fill_by_type` / `fill_by_date` / `fill_by_sample` según cómo trabaje la obra.
- **Codificación**: `protocol_codes` + `coding_mask_default`
  (`{TIPO}-{AA}{SEQ:4}`) y, si aplica, `coding_mask_by_type` / `coding_seq_reset`.
- **Aprobación**: `multi_level_approval` + `approval_levels` (1–3). Mapear a las
  firmas del protocolo original (ej. Calidad → Residente → Supervisión = 3).
- **Módulos**: `module_plans`, `module_contacts`, `module_summary_tables`,
  `module_topo`, `module_ai_assistant`, `map_enabled`…
- **Contexto para FLOW**: `ai_project_description` — descripción real de la obra
  (tipo, bloques, niveles, alcance). Es la fuente de verdad de la IA.
- **Sectores y ubicaciones**: sacarlos de los propios protocolos (bloques, ejes,
  niveles, zonas). Si la geometría puede cambiar en el tiempo → juegos de
  sectores con vigencia (v102).
- **PDF por tipo** (`print_configs`): se ajusta después, con la ficha ya cargada.

---

## FASE 6 — Importar y verificar en dispositivo

1. Importar el Excel maestro (Cargar archivos → Actividades).
2. Abrir un ensayo de cada tipo y comparar **lado a lado** con el Excel original.
3. Ajustar PDF (`print_configs`) mirando el dossier real.
4. Recién ahí, crear ubicaciones/sectores definitivos y el plan de protocolos.

---

## Errores conocidos (aprendidos en obra)

| Error | Consecuencia | Prevención |
|---|---|---|
| Colapsar secciones repetidas | Se pierde trazabilidad por sistema/elemento | Regla de oro Fase 2 |
| `PartidaItem` con huecos o vacío | Secciones entremezcladas en pantalla | Numerar TODO secuencial |
| Tomar cada hoja como protocolo nuevo | Decenas de tipos duplicados | Deduplicar por código+título (Fase 0) |
| Confundir `=B21+1` con cálculo | Ficha numérica innecesaria | Fase 1, falsos positivos |
| Mezclar protocolos de otra obra | Fichas con cliente equivocado | Revisar CLIENTE/PROYECTO en encabezado |
| Dos protocolos distintos con el mismo código | Colisión de `ID_Protocolo` | Verificar unicidad; renombrar con sufijo |
