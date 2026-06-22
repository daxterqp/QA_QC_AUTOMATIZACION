# Manual de uso — Módulos GIS y Trazabilidad Operacional

Este documento explica cómo configurar y operar los dos módulos nuevos del sistema:

1. **Módulo GIS** (v26): captura de coordenadas en ensayos + sectores + mapa.
2. **Módulo de Trazabilidad Operacional** (v27): registro de actividades de equipos por sesión con cronómetro + vistas analíticas.

Ambos son **opcionales por proyecto**: el CREATOR los activa desde Configuración. Mientras están apagados, la app funciona idéntica a antes.

---

## Tabla de contenidos

- [Roles](#roles)
- [Módulo GIS](#módulo-gis)
  - [1. Activar el módulo](#1-activar-el-módulo-gis)
  - [2. Importar sectores](#2-importar-sectores-creator)
  - [3. Capturar coordenadas en ensayos](#3-capturar-coordenadas-en-ensayos-técnico)
  - [4. Ver el mapa del proyecto](#4-ver-el-mapa-del-proyecto)
- [Módulo de Trazabilidad Operacional](#módulo-de-trazabilidad-operacional)
  - [1. Activar el módulo](#1-activar-el-módulo-trazabilidad)
  - [2. Subir el Excel de catálogos](#2-subir-el-excel-de-catálogos-creator)
  - [3. Capturar una sesión de trabajo](#3-capturar-una-sesión-de-trabajo-técnico)
  - [4. Ver las vistas analíticas](#4-ver-las-vistas-analíticas-creator--jefe)
- [Preguntas frecuentes](#preguntas-frecuentes)

---

## Roles

| Rol | Permisos |
|---|---|
| **CREATOR** | Activa los módulos, sube Excel de catálogos, gestiona sectores, edita/elimina sesiones cerradas. Ve TODOS los datos del proyecto. |
| **RESIDENT** (JEFE) | Edita/elimina sesiones cerradas. Ve TODOS los datos del proyecto en las vistas analíticas. |
| **SUPERVISOR / OPERATOR** (técnico) | Captura sus propias sesiones. Solo ve sus propias sesiones en el listado móvil. No puede editar después de cerrar. |

---

# Módulo GIS

## 1. Activar el módulo GIS

**Quién**: CREATOR.

**Dónde**: Web → Proyecto → **Configuración** → sección **GIS y geolocalización**.

Activa los flags que necesites:
- **Captura GPS en ensayos subjetivos**: botón "Registrar coordenadas" en protocolos clásicos.
- **Captura GPS en ensayos numéricos**: botón equivalente en protocolos numéricos.
- **Mapa del proyecto**: visor con pines de ensayos y croquis de sectores.

Configura:
- **Sistema de coordenadas** (cómo se muestran al técnico):
  - **WGS84 Lat/Lng** — estándar GPS (recomendado por defecto).
  - **WGS84 UTM** — Este/Norte, zona auto-detectada.
  - **PSAD56 Lat/Lng** — datum antiguo aún usado en planos.
  - **PSAD56 UTM** — minería peruana legacy.
  > Internamente todo se guarda en WGS84; este parámetro solo afecta el display.
- **URL de ortofoto** (opcional): URL de tile server XYZ (`https://tu-server.com/tiles/{z}/{x}/{y}.png`). Si la defines, el mapa permite alternar entre Google Maps y la ortofoto del cliente.

Guarda con **Guardar configuración**.

## 2. Importar sectores (CREATOR)

Los sectores son zonas/áreas del proyecto (ej. "Sector 3 — Cimentación", "Tajo A"). Pueden ser:
- **Solo nombres** — lista plana sin coordenadas (selección manual del técnico).
- **Con geometría** — polígonos en WGS84 → el sistema auto-asigna el sector cuando el GPS cae dentro.

**Dónde**: App móvil → **Proyectos** → tap largo o tap en el proyecto → modal **"Gestionar sectores (GIS)"**.

Tap **"Importar Excel/CSV"** y elige el archivo. El parser detecta automáticamente el formato:

| Formato | Columnas en el Excel | Resultado |
|---|---|---|
| Solo nombres | `name` | Sectores sin geometría |
| WGS84 plano | `name, lat, lng` (varias filas por sector con el mismo `name`) | Polígonos en WGS84 |
| Proyectado | `name, x, y, system` (`system` puede ser `WGS84_UTM18S`, `PSAD56_UTM18S`, etc.) | Convierte UTM/PSAD56 → WGS84 al guardar |

El preview muestra cuántos sectores se importarán y advertencias. Tap **"Confirmar importación"**.

Los sectores quedan guardados localmente y se sincronizan con Supabase en cuanto haya red. Si re-importas con los mismos nombres, se hace **upsert** (no se duplican).

## 3. Capturar coordenadas en ensayos (técnico)

Cuando el flag está activo, al abrir un ensayo (subjetivo o numérico según corresponda) aparece arriba la **Barra GPS**:

- **Auto-captura**: la primera vez que abres el ensayo, el sistema toma las coordenadas automáticamente (~3 s con cielo abierto).
- **Botón "Capturar"**: tap para refinar manualmente. Si ya hay coords, se muestra modal de confirmación; la coordenada anterior queda en un respaldo interno (no se ve, pero queda en la DB para auditoría).
- **Dropdown de sector**:
  - Si hay sectores con geometría y el GPS cae dentro → se auto-asigna y muestra "(auto)".
  - Si tocas el dropdown para cambiar manualmente y había auto-asignación → modal de confirmación.
  - Si los sectores son solo-nombres → cambio directo sin modal.
- **Advertencia**: si el GPS cae fuera de TODOS los polígonos definidos, aparece "⚠ Coordenada fuera de cualquier sector".

Las coordenadas se guardan offline si no hay red y se sincronizan automáticamente cuando vuelva la conexión.

## 4. Ver el mapa del proyecto

**Quién**: cualquier rol con acceso al proyecto.

**Dónde**: App móvil → **Proyectos** → tap en el proyecto → modal **"Ver mapa del proyecto"**.

El mapa muestra:
- **Pines** de cada ensayo con coordenadas (color según sector).
- **Polígonos** semitransparentes de los sectores con geometría.
- **Filtros** por estado de protocolo (Borrador / En proceso / Enviado / Aprobado / Rechazado).
- Botón flotante **"Google ↔ Ortofoto"** si tienes URL de tile definida.

Tap en un pin → abre el protocolo. Tap en un sector → ve estadísticas (cantidad de ensayos por estado, y si el módulo de Trazabilidad está activo, horas trabajadas + equipos).

---

# Módulo de Trazabilidad Operacional

## 1. Activar el módulo Trazabilidad

**Quién**: CREATOR.

**Dónde**: Web → Proyecto → **Configuración** → sección **Trazabilidad operacional**.

Activa **Módulo de Trazabilidad operacional**. Configura:
- **Seguimiento GPS automático**:
  - **OFF** — solo registra el sector seleccionado por el técnico, sin tracking continuo.
  - **Foreground** — captura GPS cada N segundos mientras el técnico tiene la app abierta y la sesión activa.
  - **Background** — captura aunque la app esté en segundo plano o la pantalla bloqueada. Requiere que el técnico acepte "Permitir siempre" en Settings (Android 11+ y iOS lo piden manualmente).
- **Intervalo entre puntos GPS** (segundos): default 3, rango 1-30. Valores menores drenan más batería. El sistema deduplica automáticamente puntos a menos de 3 m del anterior.
- **Mostrar técnicos como Técnico 1/2/3**: activa modo anónimo. Cuando está ON, TODAS las vistas analíticas (incluso CREATOR/JEFE) muestran "Técnico N" en lugar del nombre real. El mapeo es estable por proyecto. Los logs internos siguen guardando el `user_id` real para integridad.

## 2. Subir el Excel de catálogos (CREATOR)

**Dónde**: Web → Proyecto → **Cargar archivos** → tab **Trazabilidad** → botón **"Subir Excel de Trazabilidad"**.

El archivo `.xlsx` debe tener hasta 5 hojas (cada una es opcional):

### Hoja "Equipos"
Las mismas columnas del importer de equipos calibrados:
- `Código` (requerido, único por proyecto)
- `Nombre` (requerido)
- `Tipo` (balanza | prensa | horno | tamiz | termometro | otros)
- `Próxima calibración` (fecha)
- Opcionales: `Marca`, `Modelo`, `Serie`, `Capacidad`, `Resolución`, `Última calibración`, `Notas`

### Hoja "Actividades"
- `Nombre` (requerido)
- `Tipo`: `productiva` | `mantenimiento` | `transporte` | `otro`
  > El tipo se usa para calcular ratio de utilización, disponibilidad operacional, etc.

### Hoja "Equipo-Actividad"
Asocia qué actividades puede realizar cada equipo:
- `Código Equipo` (debe existir en Hoja Equipos)
- `Actividad` (debe existir en Hoja Actividades)
- `Plantilla Formulario` (opcional — nombre de la plantilla en Hoja 5)

Ejemplo:
| Código Equipo | Actividad | Plantilla Formulario |
|---|---|---|
| CAT320 | Compactación | Form Compactación |
| CAT320 | Mantenimiento | Form Mantenimiento |
| EXC450 | Excavación | |
| EXC450 | Traslado | |

### Hoja "Turnos"
- `Nombre` (ej. "Mañana", "Tarde", "Noche")
- `Hora Inicio` (0-23, hora entera)
- `Hora Fin` (0-23). Si `Hora Fin < Hora Inicio` se interpreta como turno que cruza medianoche (ej. 22 → 6).

### Hoja "Plantillas Formulario"
Cada fila es UN ítem de una plantilla. Usa la **MISMA sintaxis numérica de protocolos**:
- `Plantilla` (nombre de la plantilla)
- `Partida` (opcional)
- `Item` (descripción)
- `Método_Validación`: `numerico-[min:max]`, `numerico-fx[expr]`, `list-[a,b,c]`, `comment-[...]`, `numerico-grN[...]`, etc.
- `Sección` (opcional)

Tras pulsar **"Subir Excel"**, ves preview con conteo + advertencias. Tap **"Confirmar importación"**. El re-import es idempotente: upsert por nombre, los items de plantilla se reemplazan.

> Tip: si ya tenías equipos cargados en el módulo de Equipos Calibrados, el Excel de Trazabilidad los **reutiliza** — no necesitas re-cargarlos.

## 3. Capturar una sesión de trabajo (técnico)

**Dónde**: App móvil → **Proyectos** → tap en el proyecto → modal **"Trazabilidad operacional"**.

### TraceabilityHome
Vista principal:
- **Sesión actual** (si tienes una activa o pausada): card destacada arriba.
- **Historial** de tus sesiones cerradas (badge "Cerrada automáticamente" si pasó por auto-cierre 24 h).
- Botón flotante **"+"** abajo a la derecha → inicia una nueva sesión.

### Wizard de nueva sesión
1. **Selecciona Equipo**.
   - Si el equipo está siendo usado por otro técnico, ves un banner amarillo: *"El equipo X está siendo usado por T7 desde las 14:00."* El slider de iniciar queda bloqueado.
2. **Selecciona Actividad** (solo aparecen las actividades válidas para ese equipo).
3. **Selecciona Sector** (opcional, viene del módulo GIS si lo tienes).
4. **Selecciona Turno** (auto-sugerido por la hora actual).
5. Si la combinación (Equipo, Actividad) tiene **Plantilla Formulario** asignada, completa los ítems (mismo motor que protocolos numéricos).
6. **Desliza para iniciar** ← *no es un botón, es un gesto de swipe horizontal* (~70% del ancho).
   > Esto previene activaciones accidentales. Si tu dedo no completa el recorrido, el slider vuelve solo.
7. Toast verde: **"Sesión iniciada"**.

### Pantalla de cronómetro
Mientras la sesión está activa:
- **Cronómetro grande** con tiempo efectivo (sin contar pausas).
- Chip **"ACTIVA"** verde · indicador GPS verde si polling activo.
- Lista de intervals con duraciones (alterna activo/pausado).

Acciones:
- **Desliza para pausar** (slider ámbar) → la sesión queda PAUSED. El GPS se suspende automáticamente. Toast: "Sesión pausada".
- **Desliza para reanudar** (slider verde) → vuelve a ACTIVE. GPS se reactiva.
- **Stop** (botón rojo, tap normal) → abre modal de confirmación con la duración efectiva. Confirma para cerrar definitivamente.
  > Stop es tap+confirm (no swipe) porque es la acción irreversible.

### Comportamientos especiales
- **App cerrada mientras la sesión está activa**: al re-abrir, aparece modal **"Sesión sin cerrar de hace X min — Continuar / Pausar / Cerrar ahora"**.
- **Sesión activa en otro dispositivo del mismo usuario**: solo lectura. La sesión se debe cerrar desde el dispositivo donde se inició (device lock).
- **Auto-cierre 24 h**: si dejas una sesión sin tocar por 24 h, el sistema la cierra automáticamente con `ended_at` = último punto GPS conocido. Aparece con badge "Cerrada automáticamente" — sus duraciones pueden ser inexactas; el CREATOR puede revisar/eliminar.

### Detalle de sesión cerrada
Tap en una sesión cerrada del historial:
- Resumen: equipo, actividad, sector, turno, duración efectiva, tiempo pausado, # puntos GPS.
- Lista de intervals con horas inicio/fin.
- Notas (editables solo si eres CREATOR/JEFE).
- Botón "Eliminar" (solo CREATOR/JEFE).

## 4. Ver las vistas analíticas (CREATOR / JEFE)

**Dónde**: Web → Proyecto → **Cargar archivos** → tab **Trazabilidad** *(NO, espera — la captura es móvil)*.

→ **Web → Proyecto → tab "Trazabilidad operacional"** (en el menú lateral o en la ruta `/app/projects/{id}/traceability`).

Si el módulo no está activo en el proyecto, ves un mensaje **"Módulo no activado"** con CTA hacia Configuración.

### KPIs globales (cabecera)
- **Horas trabajadas** — suma de tiempo efectivo.
- **Sesiones** — total del rango.
- **Equipos usados** — distintos.
- **Sectores** — distintos.

### Filtros
- **Desde / Hasta** (fechas). Si seleccionas un rango, las vistas filtran. Incluye sesiones que cruzan medianoche.
- Botón **"limpiar"** para resetear.

### 5 vistas (tabs internos)

1. **Por sector** — grupos de sectores expandibles. Cada uno lista los ensayos con equipo, actividad, técnico y tiempo. Click en un equipo te lleva a Vista 4 con ese equipo seleccionado.

2. **Línea de tiempo** — Gantt simplificado: una fila por técnico, barras horizontales por sesión, colores por tipo de actividad (verde=productivo, ámbar=mantenimiento, azul=transporte, gris=otro). Hover en una barra muestra equipo + actividad + duración.

3. **Resumen consolidado** — dos tablas: (a) por combinación Equipo+Actividad con horas totales, (b) por Sector. Ambas con links de drilldown.

4. **Por equipo** — selector de equipo → cards de indicadores:
   - **Productivo**, **Mantenimiento** — horas por categoría.
   - **Utilización** — productive / total. Indica qué % del tiempo del equipo fue productivo.
   - **Disponibilidad operacional** — (total − mantenimiento) / total. Indica % de tiempo que el equipo NO estuvo en mantenimiento.
   - Tabla "Dónde trabajó" agrupada por sector (drilldown a Vista 1).
   - Si hay sesiones auto-cerradas, banner amarillo de advertencia.

5. **Por personal** — un row por técnico (anonimizado si el flag está ON) con cantidad de sesiones, equipos distintos, sectores distintos, horas totales.

### Marcas visuales
- **⚠ Sesiones auto-cerradas**: ícono amarillo junto al equipo en Vista 1 + banner en Vista 4. Sus duraciones pueden ser inexactas — revisa antes de generar reportes.

---

# Preguntas frecuentes

### ¿Cuánta batería consume el GPS background?
Con polling cada 3 s y GPS de alta precisión, ~15-20%/hora. Recomendable enchufar el equipo a una toma 12V/USB en la cabina si la jornada es de un turno completo (8h).

### ¿Funciona sin red?
**Sí.** Todo se guarda localmente en WatermelonDB y se sincroniza automáticamente cuando vuelva la red. La cola de sync tiene backoff exponencial y reintentos. Hemos validado escenarios de 8h sin red con miles de puntos GPS.

### ¿Qué pasa si dos celulares intentan iniciar sesión sobre el mismo equipo?
El sistema bloquea el segundo intento con mensaje *"Equipo bloqueado: otra sesión ACTIVE o PAUSED ya existe."* A nivel base de datos, hay un índice único parcial que garantiza la atomicidad. Si por race extremo ambas sesiones llegan a Supabase, la segunda se marca automáticamente como cerrada por conflicto.

### ¿Puedo editar una sesión después de cerrarla?
Solo CREATOR y RESIDENT (JEFE). El técnico que la creó NO puede editar después del Stop. Esto es por diseño para evitar manipulación retroactiva del registro operacional.

### ¿El modo anónimo se aplica a CREATOR y JEFE?
**Sí, sin excepción.** Si el flag está ON, todos ven "Técnico 1/2/3" en las vistas analíticas. Esto fomenta el uso del módulo como herramienta de gestión, no de fiscalización individual. Los logs internos (sync queue) siguen guardando el `user_id` real.

### ¿Por qué no veo el botón "+ Nueva sesión"?
Verifica que:
1. El módulo de Trazabilidad esté activo en la configuración del proyecto (CREATOR).
2. Ya hayas importado el Excel de catálogos (al menos equipos + actividades + vínculo).
3. Tienes acceso al proyecto (CREATOR/RESIDENT/SUPERVISOR/OPERATOR con `user_project_access`).

### ¿Cómo borro un sector que ya tiene ensayos asignados?
En la pantalla "Gestionar sectores", tap el ícono basura. El sistema te avisa cuántos ensayos quedarán sin sector y pide confirmación. Tras confirmar, los protocolos quedan con `sector_id = null` (aparecen como "Sin sector" en las vistas).

### ¿Qué sistemas de coordenadas exporta el Excel de sectores?
- WGS84 Lat/Lng (la mayoría de los GPS modernos).
- WGS84 UTM 17S/18S/19S (Perú).
- PSAD56 UTM 17S/18S/19S (planos antiguos de minería).
- PSAD56 Lat/Lng.

Todos se convierten a WGS84 internamente con `proj4js` + parámetros oficiales de IGN Perú. Precisión típica: ±1 m.

### ¿Cómo sé si una sesión fue cerrada automáticamente?
- En el historial móvil: badge **"Cerrada automáticamente"**.
- En la web: ícono ⚠ amarillo (Vista 1) o banner en Vista 4. Considera estos registros como aproximados.

### ¿Puedo cambiar el intervalo GPS sin reiniciar las sesiones?
Sí, desde Configuración. El cambio aplica a la **siguiente** sesión que se inicie. Las sesiones ya activas mantienen el intervalo con el que arrancaron hasta que se cierren.

### ¿Se pueden hacer reportes mensuales / por turno?
Los filtros de fecha + el export PDF/CSV cubren reportes ad-hoc. Para reportes recurrentes y consolidados más complejos (ej. ratio diario por equipo, alertas automáticas), tendría que agregarse un módulo de reportería específico en una entrega futura.
