# Diseño — Tipos de proyecto + Obra Lineal por progresivas (v100b)

> Estado: **APROBADO por el usuario** (A/B/C confirmados el 2026-07-20) con mandato
> de ejecución autónoma. Este doc es el contrato; el usuario lo revisa al volver.

## 1. Problema

Hoy el sistema asume un único modelo de obra (edificaciones): total de ensayos
definido por `locations.template_ids`. Faltan dos modelos:

- **Obra lineal / carretero**: total de ensayos organizado por **tramos** (hoy
  "sectores") subdivididos en **subtramos** por **progresivas**. Cada subtramo
  requiere un **juego de ensayos** completo; su aprobación es por subtramo.
- **Minería**: operación diaria, ensayos NO aditivos, sin total → solo resúmenes
  diario/semanal/mensual. (Se deja el tipo declarado; su comportamiento es trabajo
  futuro. NO es el foco de esta entrega.)

El foco de esta entrega es **obra lineal**; edificaciones = comportamiento actual
(default); minería = solo el flag.

## 2. Decisiones del usuario (A/B/C)

- **C** — subtramo + progresiva se **calculan de las coordenadas del ensayo y
  viven en el ENSAYO** (espejo de cómo `protocols.sector_id` ya se auto-asigna por
  point-in-polygon). NO en la ubicación.
- **A** — progresiva **CONTINUA en todo el corredor**: T1 [0,360), T2 [360,720),
  T3 [720,1080), T4 [1080,1440). El **eje** de cada tramo se **deriva del polígono**
  (no se carga eje aparte por ahora).
- **B** — **juego de ensayos UNIFORME** por subtramo (misma cantidad de cada tipo en
  todos los subtramos y tramos). Yo defino las cantidades. Total esperado =
  (nº subtramos) × (Σ cantidades del juego).

## 3. Hechos del código (del mapeo read-only, no re-investigar)

- **NO existe** `project_type`, tramo, progresiva ni eje en el código/DB. Nombre libre.
- `project_sectors` es la ÚNICA subdivisión espacial (id, name, points_json JSONB en
  nube / TEXT en móvil, display_color, source_system, sort_order). UNIQUE(project_id,name).
- `protocols` YA tiene `sector_id` (FK→project_sectors ON DELETE SET NULL) +
  `sector_assigned_manually`, auto-asignado por **point-in-polygon** desde las coords GPS.
  → **En obra lineal, `sector_id` ES el tramo.** Solo faltan `progresiva` + `subtramo_index`.
- Motor de geometría compartido y espejado móvil↔web: `pointInPolygon`,
  `findSectorByPoint`, `llToLocalMeters`, `pointSegDistanceM` en
  [CoordinateSystem.ts](../../../src/utils/CoordinateSystem.ts) ↔
  [coordinateTopo.ts](../../../flow-qaqc-web/lib/coordinateTopo.ts).
- Único writer de coords+sector (móvil): `GPSCaptureBar.saveCoords`.
- feature_flags: fuente de verdad `src/utils/featureFlags.ts`; espejo web
  `flow-qaqc-web/types/index.ts` (NO existe `lib/featureFlags.ts`). Se editan a mano en
  paralelo. Persistencia parcial cloud-wins: `mergeAndSaveFeatureFlags`.
- Config de proyecto (solo CREATOR): móvil `ProjectConfigScreen.tsx` (radios patrón
  `deletion_mode` L461-479), web `ProjectConfigModal.tsx`.
- PDF "Datos Generales": constructor ÚNICO compartido `buildProtocolPages` — móvil
  `DossierExportService.ts:816` (celda `ubicacion`), web `pdfGenerator.ts:694`. Móvil
  solo pasa strings (no el objeto Location/Sector); web tiene `full.location`.
  La celda bifurca `isNumeric ? 'Coordenadas' : 'Ubicación'`. Espejo OBLIGATORIO (grave si diverge).
- Avance edificaciones: `computeTotalExpected(locations)` = Σ split(template_ids)
  (web `dashboardUtils.ts`; móvil reimplementado inline). Denominador = APPROVED con
  location_id != null. Buckets `progressBucket` + `PROGRESS_BUCKET_COLORS`.
- Todo cambio de esquema toca 3 lugares: nube `supabase/*.sql`, móvil
  `schema.ts`+`migrations.ts`+`models/*`, y tipos web `types/index.ts`. `points_json`
  es JSONB(nube)/TEXT(móvil). org_id (v56/57), demo (v71), cascade (v51) ya enumeran
  project_sectors/protocols → añadir COLUMNAS es barato; tabla nueva sería caro.
- Schema móvil WatermelonDB en **v45** → nueva **v46**.

## 4. Arquitectura

### 4.1 Flag de tipo de proyecto (feature_flags)

`project_type?: 'edificaciones' | 'obra_lineal' | 'mineria'` (default `'edificaciones'`).
Vive en feature_flags (sin migración de tabla; se propaga móvil↔web solo). Helpers:
`getProjectType(flags)`, `isLinearProject(flags)`. Espejo en ambos archivos.

Config lineal (solo relevante si `obra_lineal`), también en feature_flags:
- `linear_subtramo_length_m?: number` — longitud de subtramo (default helper 20; carretera=60).
- `linear_test_set?: Array<{ id_protocolo: string; count: number }>` — juego uniforme por subtramo.

### 4.2 Metadatos de tramo (project_sectors)

Nuevas columnas OPCIONALES (nulas fuera de obra lineal):
- `station_start` REAL — progresiva de inicio del tramo (continua: 0, 360, 720, 1080).
- `station_end` REAL — progresiva de fin (360, 720, 1080, 1440).

3 espejos: nube (migración `v100_linear_obra.sql` / apply_migration), móvil
(`schema.ts` v46 + `migrations.ts` v46 + `models/ProjectSector.ts`), web (`types/index.ts` ProjectSector).
El polígono (points_json) sigue siendo la geometría; el EJE se deriva de él en runtime.

### 4.3 Progresiva/subtramo en el ensayo (protocols)

Nuevas columnas OPCIONALES:
- `progresiva` REAL — metros a lo largo del corredor (continua). null si fuera de todo tramo.
- `subtramo_index` INTEGER — índice 0-based del subtramo DENTRO de su tramo.

`sector_id` (existente) = el tramo. 3 espejos igual que 4.2.

### 4.4 Motor de progresiva (chainage) — nuevo, espejado

En `CoordinateSystem.ts` + `coordinateTopo.ts` (idénticos):

```
tramoAxis(points: LatLng[]): [LatLng, LatLng] | null
  // Eje = puntos medios de las DOS aristas OPUESTAS más CORTAS (secciones
  // transversales) de un cuadrilátero alargado. Para polígonos ≠4 vértices:
  // fallback a eje principal (PCA) = cuerda por el centroide en la dirección de
  // mayor varianza, extremos = vértices de proyección mín/máx.

computeChainage(point, tramos: TramoInfo[], subtramoLengthM): ChainageResult | null
  // 1. tramo = pointInPolygon (solo tramos con geometría + station_start/end).
  // 2. eje del tramo, ORIENTADO por la dirección global del corredor
  //    (centroide del tramo de menor station → centroide del de mayor station).
  //    entry = extremo de menor proyección sobre esa dirección.
  // 3. t = clamp( proj(P sobre eje A→B) / |eje|² , 0, 1 ).
  //    progresiva = station_start + t*(station_end - station_start).  ← la
  //    LONGITUD DECLARADA manda; el polígono solo da la fracción (desacopla
  //    imperfección geométrica de la progresiva declarada).
  // 4. subtramo_index = clamp( floor((progresiva-station_start)/subLen), 0, nSub-1 ).

formatProgresiva(m): string   // "0+000" → km+m: 12.5→"0+012.5", 375→"0+375", 1080→"1+080"
subtramoRangeLabel(stationStart, idx, subLen, stationEnd): string  // "0+000 – 0+060"
```

`TramoInfo = { id; name; points: LatLng[]|null; stationStart: number|null; stationEnd: number|null }`.
`ChainageResult = { tramoId; tramoName; progresiva; subtramoIndex }`.

### 4.5 Cálculo al capturar coords (móvil)

`GPSCaptureBar.saveCoords`: tras resolver sector (lógica actual intacta), si
`isLinearProject(flags)` y hay tramos con station + subLen, corre `computeChainage`
y escribe `p.progresiva` + `p.subtramoIndex` (null si el punto no cae en ningún tramo).
La progresiva es geometría pura → siempre se recalcula de las coords (no respeta
`sectorAssignedManually`, que solo aplica a la elección de sector).

### 4.6 PDF Datos Generales (obra lineal)

En `buildProtocolPages` (móvil L816 / web L694), SOLO si el proyecto es lineal, se
añaden 3 celdas tras la de ubicación/coordenadas, en AMBAS ramas isNumeric,
INDEPENDIENTES de `header_fields` (son esenciales):
`Tramo` (nombre del sector), `Subtramo` (rango "0+000 – 0+060"), `Progresiva` ("0+012.5").
- Móvil: nuevo parámetro `linearCells?: {tramo,subtramo,progresiva}|null` calculado en
  los 3 call sites (dossier/único/muestra) con sectorMap + flags + tramos.
- Web: se computa dentro de buildProtocolPages desde `full` + sectorMap + flags (tiene más contexto).
Helper compartido de presentación: `formatProgresiva` + `subtramoRangeLabel`.

### 4.7 Terminología Sector → Tramo (por tipo de proyecto)

Helper `unitTerm(flags): { sing, plur, singLower, plurLower }` → ('Tramo','Tramos') si
lineal, ('Sector','Sectores') si no. Espejo móvil (`src/utils/`) + web (`flow-qaqc-web/lib/`).
Se aplica a las pantallas user-facing RELEVANTES para obra lineal (alcance acotado):
gestión de sectores (título/botones/vacíos), mapa (panel/filtro), filtros de
ensayos/dossier, barra GPS, y el PDF. Se interpola `{unit}`/`{units}` en las claves i18n
de esos puntos (es/en/pt, móvil+web). Trazabilidad/tour/sync-modal/samples secundarios
quedan como follow-up (bajo valor). Documentar el alcance cubierto.

### 4.8 Avance por subtramo (data model + helper; dashboard DIFERIDO)

Helper `computeLinearProgress(flags, tramos, protocols)` (móvil+web espejo):
- `totalSubtramos = Σ ceil((station_end-station_start)/subLen)` sobre tramos con station.
- `juegoSize = Σ count` de `linear_test_set`.
- `totalExpected = totalSubtramos × juegoSize`.
- `approved` = Σ sobre (subtramo,tipo) de min(APPROVED_de_ese_tipo_en_ese_subtramo, count).
- `percent = round(approved/totalExpected*100)`.
- `bySubtramo[]` = { tramoId, subtramoIndex, done, total, complete }.
NO se cablea al dashboard en esta entrega (el usuario lo pidió DESPUÉS). Queda listo.

### 4.9 UI de configuración (solo CREATOR)

Móvil `ProjectConfigScreen` + web `ProjectConfigModal`: selector de `project_type`
(3 radios, arriba de todo por ser lo más estructural). Si `obra_lineal`: input de
`linear_subtramo_length_m` + editor simple del juego (`linear_test_set`: filas
tipo+cantidad, add/remove). Persisten con el save existente (UPDATE completo de flags).

### 4.10 Volcado a Proyecto_Carreteras (SQL directo)

Destino `uhGnc5GSyU6yt8zu` (Proyecto_Carreteras, HOY VACÍO). Origen plantillas/tramos:
`Jb0ZdgRbgpo5daA3` (Proyecto_Pruebas). Pasos (sin crear instancias de ensayo — la
siguiente tanda las llena en masa):
1. feature_flags del destino: `project_type='obra_lineal'`, `numeric_protocols`,
   `classic_protocols`, `map_enabled`+`gps_capture_numeric`+`gps_capture_subjective`,
   `fill_by_sector`, `protocol_codes`+`coding_mask_default`, `module_protocols_by_location`,
   `linear_subtramo_length_m=60`, `linear_test_set`, `print_configs` (copiados),
   `print_header_color`, `coordinate_system='WGS84_LATLNG'`.
2. Copiar 6 plantillas carreteras de Pruebas → Carreteras (nuevos ids, mismo id_protocolo,
   con TODOS sus `protocol_template_items` preservando orden): **DCC** (Cono de arena),
   **PRM** (Proctor modificado), **GRA** (Granulometría+Atterberg), **CBR**, **MAR**
   (Marshall), **TMA** (Temperatura mezcla asfáltica). (Se omiten las DEMO: CAD/CCD/PRD.)
3. Crear 4 tramos en el destino (copia de geometría de Pruebas) con station_start/end
   continuas: T1 [0,360], T2 [360,720], T3 [720,1080], T4 [1080,1440], sort_order 1-4.
4. Juego de ensayos (uniforme por subtramo, decidido por mí): **DCC×3, PRM×1, GRA×1,
   CBR×1, MAR×1, TMA×1** = 8/subtramo. Total = 4 tramos × 6 subtramos × 8 = **192 ensayos**.
Todo con `updated_at` bumpeado (LWW). Backup no aplica (destino vacío; solo INSERT).

## 5. Riesgos y mitigaciones

1. **Espejo móvil↔web** (geometría, PDF, flags, avance): editar SIEMPRE ambos lados
   idénticos. El proyecto lo trata como bug grave. → Revisión adversarial final compara pares.
2. **Orientación del eje**: si un tramo aislado no tiene vecinos, la dirección del
   corredor es ambigua. → Con ≥2 tramos (nuestro caso) es robusto; 1 tramo usa la
   dirección del propio eje. Documentado.
3. **Geometría ≠ longitud declarada**: el polígono puede no medir 360 m exactos. → La
   progresiva usa la LONGITUD DECLARADA (station_end-start); el polígono solo da la fracción.
4. **`header_fields` oculta celdas nuevas**: las 3 celdas lineales se renderizan
   FUERA del gating de header_fields (siempre en lineal).
5. **Migración WMDB v46**: `addColumns` opcionales, no destructivo. Nube: `ADD COLUMN IF NOT EXISTS`.
6. **Alcance del rename**: acotado a pantallas clave; el resto queda documentado como follow-up.
7. **Órden de items al copiar plantillas**: preservar el orden de origen (por created_at)
   reasignando created_at incremental — el orden POSICIONAL importa (extractMatrices, v98e).

## 6. Fuera de alcance de esta entrega

- Dashboard/indicadores de avance por tramo (helper listo; UI después — el usuario lo pidió después).
- Comportamiento específico de minería (resúmenes diario/semanal/mensual).
- Carga de un eje/centerline explícito (se deriva del polígono).
- Llenado en masa de los 192 ensayos (siguiente tanda).
- Rename de sector→tramo en pantallas secundarias (trazabilidad, tour, sync-modal).

## 7. Verificación — RESULTADOS

- `npx tsc --noEmit` móvil = **0** ✔ ; tsc web = **0** ✔ (varias corridas).
- **Motor de chainage validado empíricamente** (script standalone con la geometría
  real de los 4 tramos): los 4 centroides dan progresiva = el medio EXACTO de su
  rango (180 / 540 / 900 / 1260), PRM-260007 → Tramo 1 prog 0+180, `formatProgresiva`
  correcto (12.5→0+012.5, 375→0+375, 1080→1+080, 0→0+000), puntos fuera → null. ✔
- **Volcado a Proyecto_Carreteras (uhGnc5GSyU6yt8zu) verificado** ✔:
  - project_type=obra_lineal, subtramo=60 m, juego (6 tipos)=8/subtramo.
  - 6 plantillas (DCC/PRM/GRA/CBR/MAR/TMA) con ítems IDÉNTICOS al origen
    (CBR 36, DCC 31, GRA 37, MAR 22, PRM 16, TMA 25).
  - 4 tramos con progresivas continuas 0–1440; 6 print_configs copiados.
  - Total esperado = 4 tramos × 6 subtramos × 8 = **192 ensayos** (sin instancias aún).
- **Revisión adversarial (2 rondas de workflow) COMPLETADA** ✔: ronda 1 halló 6
  bugs reales (orientación por cuerda global → invertía progresiva en herraduras;
  subtramo_index congelado inconsistente al cambiar longitud / reasignar tramo) —
  todos corregidos. Ronda 2 (sobre los fixes) halló 1 más: el BORRADO de tramo no
  limpiaba progresiva/subtramo — corregido. Fix F1 revalidado con corredor en U
  (extremo del tramo de vuelta da progresiva correcta, antes espejada).

## 8. Estado de implementación

HECHO ✔: flag project_type + helpers (ambos espejos) · motor chainage (ambos
espejos, validado) · DB v46 (nube + móvil + tipos web) + sync · GPSCaptureBar ·
PDF Datos Generales (móvil + web) · UI config (móvil completo, web
selector+lectura del juego) · helper de avance (ambos espejos) · título "Tramos"
en obra lineal · volcado a Proyecto_Carreteras.

FOLLOW-UP (documentado, no bloqueante): rename sector→tramo en pantallas
secundarias (contenido de sectores, mapa, filtros ensayos/dossier, GPS bar, tour,
trazabilidad) · editor detallado del juego en web · dashboard de avance por tramo ·
comportamiento de minería · carga de eje explícito.
