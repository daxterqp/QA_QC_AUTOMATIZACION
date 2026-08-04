# Armado del proyecto — Mercado Mayorista Plaza Unicachi Huancayo

Todo lo necesario para dejar el proyecto operativo. Orden recomendado: 1 → 6.

| Archivo | Para qué |
|---|---|
| `01 Excel Base/` | Los 9 Excel originales del cliente (**no tocar**) |
| `02 Excel Maestro/MAESTRO_Mercado_Mayorista_v1.xlsx` | **El archivo a importar** — 13 fichas, 201 filas |
| `_genMaestro.js` | Generador reproducible del maestro (editar aquí, no el .xlsx) |

Regenerar tras un cambio: `node "01 Proyecto_Mercado_Mayorista/_genMaestro.js"` (desde la raíz del repo).

---

## 1. Crear el proyecto

- **Nombre:** `Mercado Mayorista Huancayo`
- **Tipo de obra:** `edificaciones` (vertical por bloques/niveles)

**Contexto para FLOW** (Configuración → Descripción de la obra) — pegar tal cual:

> Ampliación de la Zona de Bancos (segundo nivel) del mercado mayorista Plaza
> Unicachi Huancayo, ubicado en Av. Mariscal Castilla Sub Lote 2, distrito El
> Tambo, provincia de Huancayo, departamento de Junín. Cliente y supervisión:
> Plaza Unicachi Mayorista Huancayo S.A. Contratista: Grupo VRS S.A.C.
> Topografía a cargo de Abugattas Ingenieros S.A. La obra se organiza en bloques
> A, B y C con zonas Z1 a Z11, e incluye trabajos de topografía (trazo,
> replanteo y levantamiento del terreno), estructuras (acero, encofrado,
> colocación de concreto, perforación y anclaje de acero, planchas metálicas y
> pernos para pedestales) e instalaciones sanitarias y eléctricas. El control de
> calidad se ejecuta con protocolos de verificación firmados por Ingeniero de
> Calidad, Residente de Obra y Supervisión.

---

## 2. Flags de configuración

| Flag | Valor | Por qué |
|---|---|---|
| `classic_protocols` | **ON** | 11 de 13 fichas son checklist |
| `numeric_protocols` | **ON** | `LIPMPP` y `PCC` llevan cálculo |
| `module_protocols_by_location` | **ON** | Los protocolos piden "Ubicación / Niveles" |
| `fill_by_sector` | **ON** | Piden "Sector" / "Zona" |
| `fill_by_type` | **ON** | Cómodo para llenar por especialidad |
| `fill_by_date` | OFF | |
| `fill_by_sample` | OFF | No hay muestras de laboratorio |
| `protocol_codes` | **ON** | El cliente ya usa "Registro N°" |
| `coding_mask_default` | `{TIPO}-{AA}{SEQ:4}` | → `PA-260001`, `PCC-260001` |
| `deletion_mode` | `last_only` | Cero huecos en el correlativo |
| `multi_level_approval` | **ON** | |
| `approval_levels` | **3** | Ing. Calidad → Residente → Supervisión |
| `module_plans` | **ON** | Todos referencian planos E-06/E-08/E-12 |
| `module_contacts` | **ON** | 3 empresas involucradas |
| `module_summary_tables` | **ON** | Consolidado de coordenadas (LIPMPP) y batches (PCC) |
| `map_enabled` + captura GPS | **ON** | Evidencia con GPS por bloque |
| `module_ai_assistant` | a criterio | |
| `module_topo` | OFF | Solo si se cargan datos topográficos masivos |

---

## 3. Sectores y ubicaciones

**Sectores** (geometría opcional; sirven para el croquis y el filtro):
`Bloque A` · `Bloque B` · `Bloque C`

**Ubicaciones** (plan de protocolos por nivel):
`Primer Nivel` · `Segundo Nivel – Zona de Bancos`

Los ejes (P-C, PP, PN…) y zonas (Z1…Z11) que aparecen en los Excel pueden ir
como sub-ubicaciones o quedar en el campo de detalle del ensayo, según cómo
prefiera trabajar el equipo en campo.

---

## 4. Importar las fichas

Cargar archivos → **Actividades** → seleccionar
`02 Excel Maestro/MAESTRO_Mercado_Mayorista_v1.xlsx`.

Deben entrar **13 tipos / 201 ítems**:

| ID | Protocolo | Filas | Secc. | Tipo |
|---|---|---|---|---|
| `CTTR` | Control topográfico trazo y replanteo | 8 | 2 | Clásico |
| `CTPT` | Control topográfico levantamiento del terreno | 8 | 2 | Clásico |
| `LIPMPP` | Liberación de planchas metálicas y pernos | 15 | 3 | **Numérico** |
| `PA` | Acero | 10 | 1 | Clásico |
| `PCC` | Colocación de concreto | 29 | 4 | **Numérico** |
| `PE` | Encofrado | 11 | 1 | Clásico |
| `PAA` | Perforación y anclaje de acero | 10 | 1 | Clásico |
| `PIS` | Tubería (instalaciones sanitarias) | 6 | 1 | Clásico |
| `PIE` | Instalaciones eléctricas | 8 | 1 | Clásico |
| `PPIS` | Puntos de instalaciones sanitarias | 20 | 3 | Clásico |
| `PPIE` | Puntos en instalaciones eléctricas | 36 | **9** | Clásico |
| `PRE` | Redes eléctricas | 20 | 3 | Clásico |
| `PDA` | Detección y alarmas contra incendio | 20 | 5 | Clásico |

---

## 5. Decisiones tomadas (revisar en el celular)

1. **`PAA` con código propio.** En el Excel original, *Encofrado* y *Perforación
   y anclaje* compartían `PE-VRS-2026-004`. Como el ID es la llave del sistema,
   perforación quedó como **`PAA`**. Sugerencia para el cliente:
   renumerar su documento a `PE-VRS-2026-005`.
2. **Los 4 protocolos MEP se adoptaron** (`PPIS`, `PPIE`, `PRE`, `PDA`). En su
   Excel figuraban con cliente *GRV 5 S.A.C.* / obra *Áreas Comunes Solara*: son
   plantillas reutilizadas. Si el cliente pide sacarlos → `docs/FLUJO_RETIRO_FICHAS.md`.
3. **`PCC` quedó numérico.** Su tabla de batches (guía, horas, slump, volumen,
   testigos) no cabe en un checklist; se modeló como tabla de 6 batches con
   **suma automática del volumen colocado**. Los checklist previo y posterior al
   vaciado van como listas SI/NO/NA dentro de la misma ficha.
4. **`LIPMPP` quedó numérico.** Coordenadas de plano vs campo con **variación
   calculada** (N/E/Z) y una columna de dictamen: `1` si las tres variaciones
   están dentro de ±2 cm, `0` si no. **La tolerancia de ±2 cm es un supuesto**
   —el Excel no la declaraba— y se ajusta en `_genMaestro.js` (constante `TOL`).
5. **`PDA` se generalizó a 5 "AMBIENTE N"** en vez de "Dpto" (el original repetía
   el bloque 5 veces para departamentos; aquí son ambientes del mercado).
6. **Doble columna de verificación.** Varios protocolos traen dos firmas por ítem
   (ING. CALIDAD | SUPERVISIÓN). El sistema resuelve esto con los **3 niveles de
   aprobación**, no con dos columnas por ítem.
7. **Datos generales del encabezado** (proyecto, cliente, supervisión, contratista,
   plano de referencia) **no** se cargaron como ítems: son campos del sistema o
   del contexto del proyecto.

---

## 6. Verificación en dispositivo

1. Abrir un ensayo de **`PPIE`** → deben verse **9 secciones** con 4 preguntas
   cada una (36 en total). Es la ficha que valida la regla "todas las preguntas
   en todas las secciones".
2. Abrir **`LIPMPP`** → llenar coordenadas de plano y campo: las variaciones y el
   dictamen deben calcularse solos.
3. Abrir **`PCC`** → cargar 2-3 batches: el volumen total debe sumarse solo.
4. Ajustar el PDF por tipo (tuerca del Dossier) recién con la ficha ya cargada.

> Fichas numéricas validadas con el motor real antes de generar el archivo:
> `npx tsx scripts/fichaValidate.ts <rows.json>` → **0 errores** en ambas.
