# Sistema S-CUA / Flow-QA·QC — Resumen técnico para tesis

> Documento de referencia que cataloga, de forma estructurada y "presentable", **todo lo
> implementado** en la plataforma de automatización de QA/QC para obras de ingeniería (énfasis vial).
> Pensado como fuente de información para la redacción de la tesis: cada módulo incluye el problema
> que resuelve, el enfoque técnico y las decisiones de diseño relevantes.
>
> Fecha de corte: 2026-06-13.

---

## 1. Visión general

**S-CUA** (también "Flow · QA · QC") es una plataforma **multiplataforma y offline-first** para la
gestión, ejecución y trazabilidad del control de calidad (QA/QC) en obra. Reemplaza el flujo
tradicional basado en planillas Excel manuales y fichas en papel por un sistema digital con
sincronización en la nube, geolocalización, y generación automática de expedientes (dossiers).

### 1.1. Componentes (arquitectura)

| Componente | Stack | Rol |
|---|---|---|
| **App móvil** | React Native + Expo, WatermelonDB (SQLite) | Captura de datos **en campo, sin conexión**: llenado de ensayos, fotos, GPS, planos, trazabilidad. |
| **App web** | Next.js (App Router) + Supabase (PostgreSQL) | Gestión, supervisión, auditoría, importación de plantillas, dashboards, exportación de dossiers. |
| **App de escritorio** | Electron (empaqueta el build web) | Misma funcionalidad web en entorno de oficina; `appId com.vxp.scua`. |
| **Backend / nube** | Supabase (Postgres + RLS + Storage), AWS S3 | Fuente de verdad compartida; almacenamiento de evidencias (fotos), planos, ortofotos. |

### 1.2. Principios de diseño

- **Offline-first:** el dispositivo móvil opera contra una base local (WatermelonDB). La nube es
  **orquestadora**: se sincroniza de forma incremental, no se depende de la conexión para trabajar.
- **La nube como fuente de verdad compartida** entre dispositivos y usuarios; resolución de
  conflictos por *last-write-wins* en el dominio de datos de campo y *cloud-wins* en la configuración
  administrada centralmente.
- **Esquema-dirigido (schema-driven):** la sincronización mapea automáticamente columnas entre el
  esquema local y el remoto, con coerciones de tipo (JSONB↔texto, boolean) defensivas.
- **Roles y aislamiento por proyecto:** todos los datos están particionados por `project_id`; los
  permisos dependen del rol del usuario.

---

## 2. Modelo de datos y sincronización

### 2.1. Esquema versionado

El esquema local (WatermelonDB) está versionado con **migraciones incrementales** (actualmente
**v39**). Hitos relevantes:

| Versión | Aporte |
|---|---|
| v18–v19 | Mediciones sobre planos; prioridad de anotaciones. |
| v21 | Carga **histórica** de protocolos (datos previos a la digitalización). |
| v22 | `feature_flags` por proyecto (activación modular). |
| v23 | Aprobaciones jerárquicas (1–3 niveles). |
| v24 / v28 | Catálogo de **equipos calibrados** + categoría (laboratorio / maquinaria). |
| v25 | **Outbox de sincronización** (`sync_queue`) para escrituras offline. |
| v26 | **Módulo GIS**: coordenadas y sector en protocolos, `project_sectors`, capa de mapa. |
| v27 | **Trazabilidad operacional** (9 tablas: sesiones, turnos, GPS, formularios). |
| v29 | Orden de sectores (respeta el orden del Excel). |
| v30 | Checklist en formularios de sesión; evidencias asociables a ítems de checklist. |
| v31–v33 | Modos de llenado, **codificación correlativa** de protocolos, hora de ensayo, motivo de aprobación. |
| v33/36/37 | **Ortofotos**: capa única, versiones, pirámide de tiles XYZ. |
| v35 | **Precisión GPS** (método, nº de muestras, precisión estimada). |
| v37–v38 | **Tablas Resumen** (`summary_rows` + config embebida en plantilla). |
| v39 | **Ocultar tipo de ensayo** (sin eliminar). |

### 2.2. Sincronización

- **Push (subida):** por proyecto, con **guardia de frescura** (`filterByFreshness`) para no pisar
  datos remotos más nuevos; orden de tablas que respeta llaves foráneas (p. ej. sectores antes que
  protocolos). Las columnas administradas por la web (flags, ortofoto) se excluyen del push masivo.
- **Pull (descarga):** *cloud-wins* para configuración; *last-write-wins por fila*
  (`prepareFreshOverride`) para el dominio de datos de campo (protocolos, ítems, evidencias,
  anotaciones, mediciones), evitando perder ediciones offline.
- **Outbox offline (`sync_queue`):** las escrituras se encolan y se drenan con reintentos y
  *backoff* al reconectar (NetInfo), garantizando durabilidad sin conexión.
- **Sincronización incremental con cursor** (Tablas Resumen): solo se traen filas con
  `updated_at` mayor al último cursor, con solapamiento de 120 s para tolerar desfases de reloj.
- **Verificación de escritura** mediante `.select()` para detectar fallos silenciosos de RLS.

---

## 3. Módulo de Protocolos Numéricos (núcleo de QA/QC)

Es el corazón del sistema: convierte **fichas de ensayo de laboratorio/campo en formato Excel** en
formularios digitales con cálculos automáticos, validaciones y trazabilidad.

### 3.1. Problema que resuelve
Las fichas de ensayo (Proctor, granulometría, densidad de campo, CBR, etc.) son hojas Excel con
celdas de entrada, **cálculos ocultos** (fórmulas, interpolaciones, búsquedas en tablas auxiliares),
y criterios de aceptación. Digitalizarlas una por una sería inviable; el sistema las **interpreta a
partir de un lenguaje declarativo (DSL)** embebido en la propia plantilla Excel.

### 3.2. DSL de fichas numéricas
Cada celda de la ficha se describe con una mini-sintaxis que el parser (`numericProtocol.ts`)
traduce a una especificación de celda. Tipos soportados:

- **Entrada manual** (`manual`), **porcentaje**, **booleano**, **texto libre**, **fecha/hora**.
- **Lista** (`list`): opciones inline o tomadas de una **matriz auxiliar** (columna o rango
  `#fila:#fila` de una tabla fuera de la ficha principal — datos de calibración, factores, etc.).
- **Equipo** (`equipment`): vincula el ensayo a un equipo calibrado del catálogo.
- **Fórmula** (`formula`): expresión aritmética sobre otras celdas (con funciones, condicionales
  `SI`, manejo de división por cero, etc.), evaluada por `formulaEval.ts`.
- **Lookup**: búsqueda/interpolación en una matriz (tipo `BUSCARV`).
- **Valor literal**, celdas **ocultas** / **no reportables** / **en blanco**.

### 3.3. Capacidades clave
- **Réplica exacta de los cálculos del Excel**, incluyendo los **datos y cálculos auxiliares fuera de
  la ficha principal** (matrices), reordenados lógicamente para que el resultado numérico sea idéntico.
- **Matrices auxiliares** visualizables ("Ver tablas") y referenciables desde fórmulas y listas.
- **Validación estática** de cada ficha al importar (sintaxis del DSL, referencias, ciclos, matrices,
  gráficos): reporta errores accionables sin bloquear la importación.
- **Secciones y agrupación** de filas; tablas con **scroll horizontal** y anchos por contenido.
- **Gráficos** embebidos (p. ej. curvas de compactación) renderizados desde la especificación.
- **Generación de PDF** del protocolo con encabezado dinámico (proyecto, sector, ubicación), marcas
  de cumplimiento centradas, y datos generales.

---

## 4. Módulo de Trazabilidad Operacional

Registra **qué se hizo, quién, cuándo, con qué equipo y dónde**, durante la operación de obra
(complementa el control de calidad por ensayos con el control de **proceso**).

### 4.1. Entidades (v27)
`activities`, `equipment_activities`, `work_shifts`, `session_form_templates`,
`session_form_template_items`, `work_sessions`, `work_session_intervals`,
`work_session_form_items`, `work_session_gps_points`.

### 4.2. Capacidades
- **Sesiones de trabajo** con **intervalos** (inicio/pausa/reanudación/fin) y **turnos**.
- **Seguimiento GPS** de la sesión (traza de puntos), con muestreo en segundo plano.
- **Formularios de sesión** configurables con **checklist** (cumple / no cumple / N/A / sin
  responder) — espejo del modelo de ítems de protocolo (v30), con evidencias fotográficas asociables.
- **Maquinaria pesada** como catálogo separado de los equipos de laboratorio (v28).
- **Analítica y cronología** de la trazabilidad, respetando el orden original del Excel de
  configuración (v29), y exportación a PDF.

---

## 5. Módulo GIS / Geolocalización

Ubica espacialmente los ensayos y la operación, y soporta **ortofotos** como capa base.

### 5.1. Sectorización
- **Sectores de proyecto** (`project_sectors`) con polígonos (`points_json`) y orden configurable.
- **Asignación automática de sector** al capturar un punto (point-in-polygon), con posibilidad de
  ajuste manual.

### 5.2. Captura GPS de alta precisión
- Captura de coordenadas del punto de ensayo con precisión registrada (`coord_accuracy`).
- (Diseño planificado) **Promediado de waypoints**: múltiples muestras de alta precisión filtradas y
  promediadas con peso inverso a la varianza, rechazo de *outliers* (multipath) y detección de
  alejamiento, para bajar el error de ~3–8 m a ~1–3 m **sin hardware externo** (v35 ya añade método,
  nº de muestras y precisión estimada al modelo).

### 5.3. Ortofotos
- Capa de ortofoto por proyecto con **versiones** (v36) y **pirámide de tiles XYZ** (v37) para
  navegación fluida.
- Selección de "capa de proyecto activa" con previsualización y confirmación.
- **Descarga de ortofoto por rol** (solo Jefe/Creador) y aislamiento por proyecto; caché local con
  carga perezosa (S3 solo si no está local).
- Saneo de *bounds* (`normalizeBounds`) que corrige una recursión infinita de Leaflet.

### 5.4. Mapa
- Pines etiquetados solo con el **código** del ensayo, con toggle "Mostrar/Quitar etiquetas".
- **Filtros por rango de fechas, estado, tipo y sector**, con visibilidad dinámica (se ocultan los
  filtros que no aplican al proyecto).

---

## 6. Módulo Tablas Resumen

Consolida **todos los ensayos de un mismo tipo** en una **tabla única** (cada fila = un ensayo; las
celdas de la ficha se vuelven columnas), con KPIs y gráficos — el "tablero" analítico por tipo de
ensayo.

### 6.1. Enfoque
- **Escritura progresiva:** al guardar/enviar un ensayo numérico se hace *upsert* de **una** fila
  resumen (no se recalcula en masa). Incluye valores **ingresados y calculados** (recomputando
  fórmulas/lookups) más datos fijos (fecha, código, proyecto, sector, ubicación, realizado/aprobado
  por, estado, fecha de aprobación).
- **Configuración embebida** en la plantilla (hoja `RESUMEN` del Excel): define columnas, grupos
  ("paraguas"), decimales y agregaciones; se importa junto con la plantilla.
- **Sincronización incremental con backfill** que garantiza que ningún ensayo falte.

### 6.2. UI (web y móvil)
- Selector de tipo → tabla con **encabezados jerárquicos**, **orden de la ficha**, columnas fijas.
- **Paneles congelados (freeze panes):** primera columna y encabezado fijos (CSS sticky en web;
  *overlays* absolutos con scroll sincronizado en móvil).
- **Selector de "primera columna"** (modal) para fijar cualquier columna a la izquierda.
- **Filtros** (rango de fechas, estado, tipo, ubicación/sector según aplique).
- **KPIs personalizables** ("+ Nueva medida": promedio, desviación estándar, máximo, mínimo).
- **Gráfico de dispersión** (X = fecha, Y = [fila]–[columna]) con **línea de tendencia** (regresión
  lineal / cuadrática / cúbica por mínimos cuadrados).
- **Exportación CSV** (UTF-8 con BOM para compatibilidad con Excel/acentos).

---

## 7. Dossier y exportación documental

- Generación del **expediente (dossier)** del proyecto en **PDF**, con filtros inteligentes (fecha,
  estado, tipo, ubicación/sector según corresponda).
- Encabezado dinámico (caja de Sector, Ubicación), marcas de aprobación, y maquetación por tramos.
- **Importación / exportación** de fichas y datos vía Excel/CSV.

---

## 8. Carga histórica

- Importación de **protocolos previos** a la digitalización (v21), con validación contra el DSL de la
  ficha, para que los registros antiguos convivan con los nuevos en dossiers y analítica.

---

## 9. Gestión de equipos calibrados

- Catálogo de **equipos** con calibración (v24), **categorizados** (laboratorio vs. maquinaria
  pesada, v28).
- Vinculación de equipos a celdas de ensayo (tipo `equipment`) y a actividades de trazabilidad.

---

## 10. Roles, permisos y seguridad

- **Roles:** Creador, Residente, Supervisor, Operador.
- **Permisos por rol:** p. ej., solo el **Creador** gestiona la configuración del proyecto, oculta
  tipos de ensayo y descarga ortofotos históricas; los flujos de aprobación respetan la jerarquía.
- **Aislamiento por proyecto** en todas las consultas.
- **RLS** (Row Level Security) en Supabase con políticas permisivas para la *anon key* (el
  *hardening* de seguridad fino — restricción de la API key de mapas por paquete + SHA-1, credenciales
  de *keystore*— está planificado como fase final).

---

## 11. Ocultar tipo de ensayo (implementado 2026-06-13)

### 11.1. Necesidad
Una empresa puede ejecutar los ensayos A, B, C y, con el tiempo, dejar de hacer C e iniciar D. Se
necesita que **C desaparezca de los desplegables de ensayos nuevos** (y no se pueda crear más de ese
tipo), **pero** que los registros ya hechos con C **sigan visibles** en todos lados.

### 11.2. Solución
- Columna `protocol_templates.is_hidden` (v39); reversible (ocultar / mostrar).
- **No elimina nada.** Un tipo oculto:
  - No aparece en selectores de **ensayo nuevo** (móvil y web; modos por tipo, sector y fecha; flujo
    por ubicación) y no se puede crear (con guarda de respaldo en la creación).
  - **Sí** aparece en registros, dossier, histórico y tablas resumen (los ensayos existentes intactos).
  - En la vista "por tipo", la tarjeta del tipo oculto se sigue mostrando si tiene registros, pero sin
    el botón "Adicionar".
- **Gestión:** botón ojo (mostrar/ocultar) en Cargar archivos → Actividades, **solo para el Creador**,
  en web y móvil. Badge "Oculto" en la lista.

---

## 12. Codificación correlativa de protocolos

- Generación de **códigos correlativos** de protocolo según una máscara configurable, con reintento
  ante colisión del índice único (otro dispositivo ganó el número): re-lee, re-secuencia y reintenta.

---

## 13. Resumen de aportes (para la tesis)

1. **Digitalización de fichas de ensayo mediante un DSL** embebido en Excel, capaz de replicar
   cálculos ocultos y matrices auxiliares — elimina la transcripción manual y los errores de cálculo.
2. **Arquitectura offline-first** con sincronización en la nube orquestada, *outbox* durable y
   resolución de conflictos diferenciada por dominio.
3. **Trazabilidad operacional** (proceso) integrada con el **control por ensayos** (producto).
4. **GIS** con sectorización automática, ortofotos en pirámide de tiles y captura GPS de precisión
   mejorada por software.
5. **Analítica consolidada** (Tablas Resumen) con KPIs y tendencias por tipo de ensayo.
6. **Generación automática de expedientes (dossiers) en PDF** trazables y auditables.
7. **Multiplataforma** (campo móvil + oficina web/escritorio) con un único modelo de datos.

---

> *Nota de mantenimiento:* este documento es un catálogo de alto nivel orientado a la tesis. Para el
> detalle de implementación, ver el código fuente (`src/` móvil, `flow-qaqc-web/` web,
> `supabase/*.sql` esquema) y el registro de auditoría `docs/Auditoria_Sync_Bugs_2026-06-13.md`.
