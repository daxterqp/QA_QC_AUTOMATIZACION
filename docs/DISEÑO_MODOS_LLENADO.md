# Diseño — Modos de llenado de protocolos + Codificaciones (Partes D y E)

> **Estado: ✅ IMPLEMENTADO (v31)** — ver `RESUMEN_MEJORAS.md` §16.
> Decisiones tomadas: `ensayo_date` SÍ (columna nueva); correlativo ámbito
> tipo+año+proyecto; turno A/B y Sp/Sb como celdas de ficha; SIN backfill.
> Requiere ejecutar `supabase/v31_fill_modes_codes_migration.sql`.
> Lo que sigue es el diseño original de referencia.

Referencia de magnitud real (Excels de minería analizados):
`Compaction Summary - 03 Marzo.xlsx` (~2,200 ensayos PR/DS en un resumen),
`Resumen de Curvas Proctor- 03 Marzo 2026.xlsx`, `Resumen Granulometrias
Relaves-Presa QAQC - 03 MARZO.xlsx`. De ahí salen los patrones de codificación
(`PR-260032`, cancha `2C-M`, turno A/B, Sp/Sb, reporte
`CV-DRE-QC-RPR-260319-PR-2600402`).

---

## 1. Problema

Hoy la ÚNICA puerta de entrada para llenar un protocolo es **por ubicación**
(`LocationProtocolsScreen` / web `useLocations`): la ubicación trae
`template_ids` y de ahí se crean instancias con `location_id` fijo. En proyectos
mineros reales:

- Los ensayos se disparan **por sector/cancha** (`2C-M`, `4B-H`) y por **turno**,
  no por una lista cerrada de ubicaciones; la cantidad por día es variable
  (decenas por turno).
- El laboratorio piensa **por tipo de ensayo** ("hoy se hicieron 12 Proctor y
  30 densidades") y **por fecha**, no por ubicación.
- Cada ensayo lleva **código correlativo** (`PR-260032`) que hoy el sistema no
  genera ni muestra.

## 2. Modos de llenado (Parte D)

### 2.1 Flags de configuración (por proyecto)

Nuevas claves en `feature_flags` (JSON existente — **sin migración de schema**):

```jsonc
{
  "fill_by_sector": false,   // tarjeta "Ensayos por sector"
  "fill_by_type":   false,   // tarjeta "Ensayos por tipo"
  "fill_by_date":   false    // tarjeta "Ensayos por fecha"
}
```

- "Por ubicación" **siempre activo** (default actual, no se toca).
- Los modos **conviven**: cada flag activo agrega una tarjeta al menú del
  proyecto (web `menu/page.tsx` + móvil `ProjectMenuScreen`), debajo de
  "Protocolos por ubicación".
- UI de configuración: `ProjectConfigModal` (web) → sección **"Configuración de
  Protocolos"** → nuevo grupo "Llenado de protocolos" con 3 checkboxes
  (mismo patrón visual que los flags existentes). Solo CREATOR.

### 2.2 Modelo de datos

**Sin migración para los modos** — el schema actual ya lo soporta:

| Campo | Estado actual | Uso propuesto |
|---|---|---|
| `protocols.location_id` | nullable | `null` en instancias creadas por sector/tipo/fecha |
| `protocols.sector_id` | existe desde v26 (indexado, opcional) | se setea al crear desde un sector |
| `protocols.template_id` | existe | clasificador del modo "por tipo" |
| `protocols.created_at` / `ensayo_date`* | existe | clasificador del modo "por fecha" |

\* Propuesta: nueva columna **`protocols.ensayo_date` (string `YYYY-MM-DD`,
nullable)** en la migración v35 (junto con `protocol_code`, ver §3). Razón: la
fecha del ENSAYO no siempre es la fecha de creación del registro (carga
diferida del laboratorio). Default al crear: hoy; editable en el header del
protocolo. Si prefieres evitarla, el modo fecha agrupa por `created_at` y la
migración v35 solo lleva `protocol_code`.

### 2.3 Pantallas (espejo del flujo actual)

Las 3 pantallas nuevas son **variantes de `LocationProtocolsScreen`** (móvil) y
de la página de ubicaciones (web) — misma tarjeta de protocolo, mismos estados,
mismo flow de llenado/aprobación. Solo cambia el AGRUPADOR del nivel 1:

1. **`SectorProtocolsScreen`** (`fill_by_sector`)
   - Nivel 1: lista de sectores del proyecto (tabla `sectors`, ya existe para
     GIS) con contador de ensayos por estado.
   - Nivel 2: ensayos del sector (`protocols WHERE sector_id = X`), orden por
     código desc.
   - Acción **"+ Adicionar ensayo"**: modal con selector de plantilla
     (las del proyecto) + cantidad N (1–50) → crea N instancias
     `{sector_id, location_id: null}` con su código (§3). Igual que la creación
     actual de instancias (`LocationProtocolsScreen.tsx:243` / web
     `useLocations.ts:130`), reutilizando `reconcileInstanceItems`.

2. **`TypeProtocolsScreen`** (`fill_by_type`)
   - Nivel 1: plantillas del proyecto con contadores ("Proctor — 48 ensayos:
     30✓ 6⏳ 2✗").
   - Nivel 2: instancias de esa plantilla (TODAS, vengan del modo que vengan),
     orden por código desc. "+ Adicionar ensayo" crea
     `{location_id: null, sector_id: null}` + selector opcional de sector si
     `fill_by_sector` también está activo.

3. **`DateProtocolsScreen`** (`fill_by_date`)
   - Nivel 1: días con ensayos (desc), contadores por estado.
   - Nivel 2: ensayos del día (`ensayo_date = X`), agrupados por tipo.
   - "+ Adicionar ensayo" con fecha precargada (hoy, editable).

**Regla de convivencia:** las listas leen las MISMAS instancias — un protocolo
creado desde un sector aparece también en "por tipo" y "por fecha". No hay
duplicación de datos, solo lentes distintas. El modo "por ubicación" muestra lo
suyo (las instancias con `location_id`), intacto.

**Dossier/PDF/sync:** sin cambios — todo cuelga de `project_id`. El dossier
agrupa hoy por `location_only`; las instancias sin ubicación caen en un grupo
"Sin ubicación / {sector}" (ajuste menor en `buildSectionCoverPage`).

## 3. Codificaciones (Parte E)

### 3.1 Modelo

- **Migración v35** (WatermelonDB + Supabase):
  - `protocols.protocol_code` (string, nullable, indexado).
  - Supabase: índice único parcial `UNIQUE (project_id, protocol_code) WHERE
    protocol_code IS NOT NULL` — el guardián final contra duplicados.
  - (Opcional §2.2) `protocols.ensayo_date`.
- **Configuración por proyecto** — `feature_flags.coding_masks` (JSON, editado
  en el mismo grupo "Llenado de protocolos"):

```jsonc
{
  "coding_masks": {
    "default": "{TIPO}-{AA}{SEQ:4}",          // PR-260032
    "por_tipo": {
      "DS": "{TIPO}-{AA}{SEQ:4}",             // DS-260118
      "RPR": "CV-DRE-QC-RPR-{AA}{MM}{DD}-{SEQ:4}"  // máscara libre por tipo
    }
  }
}
```

### 3.2 Tokens de máscara

| Token | Valor | Ejemplo |
|---|---|---|
| `{TIPO}` | `id_protocolo` de la plantilla | `PR`, `DS`, `GR` |
| `{AA}` / `{AAAA}` | año del ensayo (2 / 4 dígitos) | `26` / `2026` |
| `{MM}` / `{DD}` | mes / día | `03` / `19` |
| `{SEQ:n}` | correlativo zero-padded a n dígitos, ámbito **tipo + año + proyecto** | `0032` |
| `{SECTOR}` | código del sector si existe | `2C-M` |

Con la máscara default y los Excels reales: `PR-260032`, `DS-260118` ✓.

### 3.3 Generación offline-safe del correlativo

El reto: dos celulares offline pueden crear "el siguiente" `PR-26xxxx` a la vez.

1. **Al crear la instancia** (cualquier modo, también por ubicación): se calcula
   `seq = max(seq local del ámbito tipo+año) + 1` y se guarda
   `protocol_code` provisional.
2. **Al push**: el índice único de Supabase rechaza la colisión → el SyncWorker
   la trata como conflicto recuperable: **re-secuencia** (`max(seq remoto)+1`),
   regenera el código y re-encola el push (mismo patrón FIFO del outbox actual).
3. **Al pull**: códigos remotos ganan (LWW ya existente); la UI siempre muestra
   el código actual.
4. El código NO es editable a mano (solo CREATOR puede regenerarlo desde el
   audit en casos excepcionales).

Consecuencia honesta: un código provisional puede cambiar tras sincronizar
(de `PR-260032` a `PR-260033`) si hubo colisión. Es el mismo trade-off de
cualquier correlativo offline; la alternativa (reservar rangos por dispositivo)
complica más de lo que aporta a esta escala (~2,200/año por tipo).

### 3.4 Dónde se ve el código

- Listas de ensayos (todas las lentes) — reemplaza al "Protocolo N" genérico,
  orden descendente por código.
- Header del fill/audit y el PDF (header del protocolo + tabla resumen del
  dossier).
- **Nueva celda DSL `codigo-[]`** (read-only, valor = `protocol_code`): permite
  que la ficha lo muestre dentro del cuerpo del ensayo (como en el Excel CV).
  Parser: tipo nuevo en `numericProtocol.ts` (no numérico, no entra al scope);
  validador lo acepta solo 1 vez por ficha.

## 4. Plan de implementación (cuando se apruebe)

| Paso | Alcance | Riesgo |
|---|---|---|
| 1 | Migración v35 (`protocol_code` [+ `ensayo_date`]) + índice único Supabase + push/pull de los campos | Bajo (patrón v26 ya probado) |
| 2 | Flags + UI ProjectConfigModal + tarjetas de menú ×2 | Bajo |
| 3 | Generador de códigos + máscaras + re-secuenciación en SyncWorker | Medio (tests de colisión) |
| 4 | `SectorProtocolsScreen` + espejo web | Medio |
| 5 | `TypeProtocolsScreen` / `DateProtocolsScreen` + espejos web | Medio |
| 6 | Celda `codigo-[]` + código en PDF/dossier | Bajo |
| 7 | Tests (engine + colisiones de seq) + docs | — |

Orden sugerido: 1→2→3 (núcleo de valor: códigos), luego 4 (sector, el modo más
pedido), luego 5–6.

## 5. Preguntas abiertas (para tu aprobación)

1. **`ensayo_date`**: ¿agregamos la columna (recomendado) o el modo fecha usa
   `created_at`?
2. **Ámbito del correlativo**: propuesto **tipo + año + proyecto** (coincide con
   `PR-260032`). ¿Confirmas, o es tipo + año global entre proyectos?
3. **Turno A/B y Sp/Sb** (aparecen en los Excels): ¿van como celdas de la ficha
   (list-[A,B]) — propuesta actual — o como token de la máscara de código?
4. **Códigos retroactivos**: ¿generar códigos para instancias ya existentes al
   activar la función (backfill por fecha de creación), o solo para nuevas?
