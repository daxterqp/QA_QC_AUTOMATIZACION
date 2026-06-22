# Proyecto de prueba — Carretera Tramo Demo

Carpeta con los archivos CSV listos para cargar y probar **TODO** el sistema Flow QA/QC (módulo clásico + GIS + Trazabilidad opcional).

## Contenido

| Archivo | Contenido | Cobertura de pruebas |
|---|---|---|
| `1_sectores.csv` | 4 tramos de carretera como polígonos WGS84 (~250 m c/u, ancho ~13 m). Coordenadas reales en Junín. | Sectores GIS, auto-asignación de sector por GPS, mapa del proyecto |
| `2_equipos.csv` | **34 equipos** — 16 de laboratorio (balanzas, prensas CBR/Marshall, hornos, tamices, etc.) + 18 de maquinaria pesada (excavadoras, compactadores, motoniveladoras, rodillos, volquetes, cisternas, cargadores frontales, pavimentadora, planta chancadora) | Catálogo categorizado, validación de vencimiento (lab), asociación a protocolos, base para Trazabilidad |
| `3_protocolos.csv` | 8 protocolos: **3 subjetivos** (Visual, Materiales, Señalización) + **5 numéricos** (Compactación, Granulometría con gráfico log, Espesor, Nivelación, Atterberg+CBR) | Sí/No/NA, rangos numéricos, fórmulas, cálculos automáticos, gráficos, normas MTC |
| `4_ubicaciones.csv` | 12 ubicaciones distribuidas en los 4 tramos por capa (subrasante → subbase → base → carpeta asfáltica), cada una mapeada a los protocolos que corresponden | Generación de protocolos por ubicación, agrupación por especialidad, visualización por tramo |
| `5a_actividades.csv` | 13 actividades operacionales (productivas, transporte, mantenimiento, otro) | Catálogo de actividades (Trazabilidad) |
| `5b_equipo_actividad.csv` | Vínculos equipo↔actividad (~35 combinaciones) con plantillas opcionales | Tabla puente M:N (Trazabilidad) |
| `5c_turnos.csv` | 3 turnos: Mañana (07-15), Tarde (15-23), Noche (23-07) | Catálogo de turnos (Trazabilidad) |
| `5d_plantillas_formulario.csv` | 2 plantillas: Inspección excavadora, Inspección compactador (10 ítems totales) | Formularios iniciales (Trazabilidad) |
| **`5_trazabilidad.xlsx`** | **Bundle de las 5 hojas** anteriores listo para subir desde Cargar archivos → tab Trazabilidad | Importación atómica del catálogo completo |

---

## Datos del proyecto

- **Nombre sugerido**: `Carretera Demo Junín — Vía Departamental`
- **Contraseña**: la que prefieras (mínimo 4 caracteres)
- **Tramos**: 4 × 250 m ≈ 1 km total, ancho 12-14 m
- **Ubicación geográfica**: extremo PR0+000 = `12°4'12.40"S, 75°15'59.58"O`, extremo PR1+000 = `12°4'25.05"S, 75°15'28.04"O`

---

## Paso a paso de carga y verificación

### Paso 1 — Crear el proyecto (Web, CREATOR)

1. Login en la web con tu cuenta CREATOR.
2. **Proyectos → "+ Crear proyecto"**.
3. Nombre: `Carretera Demo Junín` (o el que prefieras). Contraseña: a elección.
4. En el wizard de configuración (módulos) activa:
   - **Tipos de protocolos**: `Protocolos clásicos Sí/No/NA` ✅, `Protocolos numéricos` ✅
   - **Visualización**: `Planos PDF` ✅, `Gráficos avanzados` ✅, `Normas técnicas` ✅
   - **Workflow**: `Catálogo de equipos` ✅
   - **GIS y geolocalización**: `Captura GPS en ensayos subjetivos` ✅, `Captura GPS en ensayos numéricos` ✅, `Mapa del proyecto` ✅, Sistema de coordenadas = `WGS84 Lat/Lng`
   - *(opcional)* `Trazabilidad operacional` ✅ con GPS polling = `foreground`
5. Tap **Crear proyecto**.

✅ **Verifica**: el proyecto aparece en tu lista de proyectos.

### Paso 2 — Subir protocolos (Web, CREATOR)

1. Entra al proyecto recién creado → tap **Cargar archivos** (ícono nube).
2. Tab **Actividades** → arrastra o selecciona `3_protocolos.csv`.
3. Espera el preview. Debe mostrar:
   - 8 protocolos detectados (VIS-001, MAT-001, SEN-001, COMP-001, GRA-001, ESP-001, NIV-001, CBR-001)
   - ~62 actividades en total
4. Tap **Confirmar importación**.

✅ **Verifica en BD** (web → mismo tab):
- Los 8 protocolos aparecen listados con número de actividades.
- COMP-001 muestra fórmulas (íconos de fx).
- GRA-001 muestra ítem con gráfico (curva).

### Paso 3 — Subir ubicaciones (Web, CREATOR)

1. Mismo tab "Cargar archivos" → tab **Ubicaciones** → sube `4_ubicaciones.csv`.
2. Preview: 12 ubicaciones detectadas, distribuidas en 4 tramos × 3 puntos.
3. Confirmar.

✅ **Verifica**: cada ubicación está mapeada a sus protocolos vía la columna `ID_Protocolos`. Si abres una ubicación, ves la lista de protocolos pendientes.

### Paso 4 — Subir equipos (Web O Móvil)

El catálogo de equipos puede subirse desde **ambas plataformas** — el tab "Equipos" está disponible al lado de Ubicaciones en cargar archivos.

**Desde la web** (CREATOR):
1. "Cargar archivos" → tab **Equipos** → sube `2_equipos.csv` → 17 equipos.

**Desde el móvil** (CREATOR / RESIDENT):
1. Cargar archivos → tab **Equipos** (entre Ubic. y PDF) → tap **Subir Excel / CSV**.

✅ **Verifica** (en cualquiera de las dos):
- Chips de filtro: **Todos (17)** · 🧪 **Laboratorio (8)** · 🚜 **Maquinaria (9)**.
- Lista muestra los 17 con badge categoría.
- La calibración solo aplica a Laboratorio: los 8 de Lab se muestran como vigentes (calibración 2027); maquinaria no muestra fecha (no se calibra).
- Si cambias manualmente la "Próxima calibración" de un equipo Lab a 01/01/2026 → aparece como "vencido" en rojo.

### Formato del CSV de equipos

| Columna | Requerida | Notas |
|---|---|---|
| `Código` | Sí | Único por proyecto |
| `Nombre` | Sí | Descriptivo |
| `Tipo` | Sí | Lab: `balanza`, `prensa`, `horno`, `tamiz`, `termometro`. Maq: `excavadora`, `compactador`, `motoniveladora`, `retroexcavadora`, `cargador_frontal`, `volquete`, `cisterna`, `rodillo`. O `otros`. |
| `Categoría` | Opcional | `laboratorio` o `maquinaria_pesada`. Si se omite, se auto-detecta por `Tipo`. |
| `Próxima calibración` | Sí para Lab, opcional para Maq | Formato `dd/mm/yyyy` |
| `Marca`, `Modelo`, `Serie`, `Capacidad`, `Resolución`, `Última calibración`, `Notas` | Opcionales | Free-text |

### Paso 5 — Subir sectores GIS (Web O Móvil, CREATOR)

> Desde v29 los sectores se gestionan desde Cargar archivos → tab **Sectores** (antes de Planos PDF), tanto en web como en móvil.

1. Entra al proyecto → **Cargar archivos** → tab **Sectores**.
2. Tap **Subir Excel/CSV** → selecciona `1_sectores.csv`.
3. Preview: 4 tramos detectados, formato "WGS84 Lat/Lng (polígonos)", 4 puntos cada uno.
4. Confirmar.

✅ **Verifica**:
- Lista muestra los 4 tramos con badge "Geometría ✓ · 4 vértices" y un color único por tramo.
- En el menú del proyecto, tap **Ver mapa del proyecto** → mapa muestra los 4 polígonos sobre la zona de Junín.
- Botón **Recalcular asignaciones** asigna sector a cualquier protocolo con GPS que aún no tenga.

### Paso 5b — Subir el catálogo de Trazabilidad (Web O Móvil, CREATOR)

> Requiere flag `traceability_module` activo.

1. Cargar archivos → tab **Trazabilidad** (entre Equipos y Planos PDF).
2. Tap **Subir Excel de Trazabilidad** → selecciona `5_trazabilidad.xlsx` (el archivo unificado con 5 hojas).
3. Preview muestra:
   - Equipos: 34
   - Actividades: 13
   - Vínculos Equipo-Actividad: ~37
   - Turnos: 3
   - Items de plantillas: 10 (de 2 plantillas)
4. Confirmar.

✅ **Verifica**:
- Al volver a entrar al proyecto, el menú intermedio muestra **Trazabilidad operacional** activa.
- Al iniciar una sesión de trazabilidad, los pickers de equipo/actividad/turno se llenan con los datos cargados.
- Si un equipo de maquinaria tiene una plantilla asociada (`Inspección excavadora` para EXC-001), aparece el formulario inicial al pulsar "Iniciar".

### Paso 6 — Generar protocolos por ubicación (App móvil, técnico)

1. Login con cuenta técnica (SUPERVISOR / OPERATOR) en el celular.
2. Entra al proyecto → ve la lista de ubicaciones (12).
3. Tap en una ubicación, ej. `Tramo 1 / Subrasante PR0+050`.
4. Verás los protocolos pendientes (VIS-001, MAT-001, COMP-001, GRA-001, ESP-001, NIV-001, CBR-001).
5. Tap en **Revisión Visual de Plataforma** (VIS-001).

✅ **Verifica**:
- Si flag `gps_capture_subjective` está ON → aparece **Barra GPS** arriba con coords auto-capturadas y sector inferido = "Tramo 1".
- 8 items con botones `Sí / No / N.A.` por cada uno.
- Botón **Cámara** para evidencia fotográfica por item.

### Paso 7 — Ejecutar un protocolo subjetivo

1. En VIS-001, responde los 8 items (mezcla Sí/No/NA).
2. En al menos 1 item con "No", agrega observación + foto.
3. Tap **Enviar para revisión** (icono al final).

✅ **Verifica**:
- El protocolo cambia a status `SUBMITTED`.
- En la web (CREATOR), el dashboard del proyecto muestra +1 en "pendientes de revisión".

### Paso 8 — Ejecutar un protocolo numérico

1. Tap en **Densidad y Humedad (COMP-001)** del mismo punto T1 PR0+050.
2. Verás una tabla con 5 columnas y 3 puntos de muestreo:

   | Progresiva | Dens húmeda | Humedad % | Dens seca | % Compactación |
   |---|---|---|---|---|
   | 50 | (ingreso) | (ingreso) | (auto fx) | (auto fx ±) |

3. Ingresa en Punto 1: densidad húmeda `2.18`, humedad `8.5`.

✅ **Verifica**:
- "Densidad seca" se calcula automáticamente: 2.18 / (1+8.5/100) ≈ **2.009 g/cm³**
- "% Compactación" se calcula: 2.009 / 2.10 × 100 ≈ **95.66 %** → dentro de [95:102] ✅ (verde)
- Si ingresas humedad `15` (densidad seca baja) → % Compactación cae a ~90% → fuera de rango (rojo) ❌

4. Completa los 3 puntos. Las filas de "Promedio" y "Mínimo" se calculan automáticamente.

### Paso 9 — Granulometría con gráfico

1. Tap en **Granulometría (GRA-001)** del mismo punto.
2. Ingresa % pasa en orden decreciente:
   - 2" → 100, 1½" → 98, 1" → 92, ¾" → 85, ½" → 70, 3/8" → 55, N°4 → 40, N°10 → 28, N°40 → 15, N°200 → 7

✅ **Verifica**:
- Después de la tabla aparece **automáticamente la curva granulométrica** con eje X logarítmico (escala log de aberturas).
- Curva descendente típica.
- Item del N°200 con valor 7 está dentro de rango [0:25] ✅. Si pones 30, rojo.

### Paso 10 — Aprobación (Web, CREATOR / JEFE)

1. Web → Proyecto → tab **Actividades** o **Histórico** → tap en el protocolo enviado.
2. Revisa items y observaciones.
3. Tap **Aprobar** (o Rechazar con motivo).

✅ **Verifica**:
- Status cambia a `APPROVED`.
- Si activaste `multi_level_approval`: pasa al siguiente nivel.
- Notificación push llega al técnico (si tiene token registrado).

### Paso 11 — Dossier y reportes

1. Web → Proyecto → **Dossier**.
2. Genera PDF.

✅ **Verifica**:
- PDF incluye: tabla de protocolos aprobados, gráficos de granulometría, sello del proyecto.
- Si activaste `coordenadas` en proyecto: pines de protocolos aparecen.

### Paso 12 — Vistas analíticas (web)

1. Web → Proyecto → tab **Histórico**.
2. Verifica gráficos de compactación por tramo: % Compactación promedio del proyecto + barras por ubicación.
3. Filtra por fecha / tramo / especialidad.

✅ **Verifica**:
- Gráficos consolidan datos de los 3 puntos COMP-001.
- Subtotales por tramo aparecen.
- Export PDF / CSV funciona.

---

## Cobertura de pruebas en este paquete

| Feature | Cubierto por |
|---|---|
| Crear proyecto | Paso 1 |
| Carga Excel de actividades | Paso 2 (`3_protocolos.csv`) |
| Carga Excel de ubicaciones | Paso 3 (`4_ubicaciones.csv`) |
| Carga Excel de equipos calibrados | Paso 4 (`2_equipos.csv`) |
| **Sectores GIS (polígonos)** | Paso 5 (`1_sectores.csv`) |
| **Captura GPS + auto-asignación de sector** | Paso 6 (Barra GPS) |
| **Mapa del proyecto** | Paso 5 (tap "Ver mapa") |
| Protocolos subjetivos Sí/No/NA | Paso 7 (VIS, MAT, SEN) |
| Cámara + evidencia fotográfica | Paso 7 |
| Protocolos numéricos con rangos | Paso 8 (densidad, humedad) |
| Fórmulas automáticas | Paso 8 (densidad seca, % compactación) |
| Validación de rangos con feedback visual | Paso 8 |
| Gráficos avanzados (log-x) | Paso 9 (granulometría) |
| Comentarios desplegables | CBR-001 (`comment-[...]`) |
| Normas técnicas (`:norma[...]`) | COMP-001, GRA-001, CBR-001 |
| Fórmulas estadísticas (PROM, MIN, DESVEST) | COMP-001 |
| Aprobación de protocolos | Paso 10 |
| Dossier PDF | Paso 11 |
| Vistas analíticas + filtros | Paso 12 |

---

## Tabla de coordenadas exactas (referencia)

| Punto | DMS | Decimal |
|---|---|---|
| P1 (PR0+000 izq) | 12°4'12.40"S, 75°15'59.58"O | -12.07011, -75.26655 |
| P2 (PR0+000 der) | 12°4'12.81"S, 75°15'59.74"O | -12.07023, -75.26659 |
| P3 (PR1+000 izq) | 12°4'25.05"S, 75°15'28.04"O | -12.07363, -75.25779 |
| P4 (PR1+000 der) | 12°4'24.65"S, 75°15'27.84"O | -12.07351, -75.25773 |

Distancia P1→P3 ≈ 1028 m → 4 tramos de ~257 m. Ancho ≈ 14 m.

---

## Trazabilidad operacional

El bundle `5_trazabilidad.xlsx` ya está generado (5 hojas) y se sube en un único paso desde Cargar archivos → tab Trazabilidad (Paso 5b).

Los CSVs `5a..5d_*.csv` son para que puedas **editar el catálogo en texto plano** antes de armar el `.xlsx`. Si modificas alguno, regenera el binario con:

```
node sample_project_carretera/_build_xlsx.js
```

Estructura de cada hoja (los headers deben coincidir EXACTAMENTE):

| Hoja                    | Columnas | Notas |
|-------------------------|----------|-------|
| `Equipos`               | Igual que `2_equipos.csv` | Reusa logic de catálogo de equipos. |
| `Actividades`           | `Nombre`, `Tipo` | Tipo: `productiva`, `mantenimiento`, `transporte`, `otro` |
| `Equipo-Actividad`      | `Código Equipo`, `Actividad`, `Plantilla Formulario` (opcional) | FKs resueltas por nombre |
| `Turnos`                | `Nombre`, `Hora Inicio`, `Hora Fin` | Horas 0-23; cruzan medianoche si fin < inicio |
| `Plantillas Formulario` | `Plantilla`, `Partida`, `Item`, `Método de validación`, `Sección` | `Método` reusa sintaxis numérica de protocolos |

---

## Tips de carga

- **Orden recomendado**: Protocolos → Ubicaciones → Equipos → Sectores → Generar registros desde móvil.
- Si el sistema rechaza por columnas faltantes, verifica que el CSV se cargó con UTF-8 (acentos correctos).
- Los protocolos numéricos con fórmulas requieren el flag `numeric_protocols` activo.
- El gráfico log-x de granulometría requiere flag `advanced_charts`.
- Para ver el mapa, el celular necesita conexión a internet (Google Maps tiles).

---

## Datos esperados de ejemplo (para llenar y validar)

### Compactación (COMP-001) — valores típicos OK

| Punto | Dens húmeda | Humedad % | → Dens seca | → % Compactación |
|---|---|---|---|---|
| PR0+050 | 2.18 | 8.5 | 2.009 | 95.7 ✅ |
| PR0+125 | 2.21 | 7.8 | 2.050 | 97.6 ✅ |
| PR0+200 | 2.15 | 9.0 | 1.972 | 93.9 ❌ |

Resultado: promedio = 95.7 ✅, mínimo = 93.9 ❌ → el sistema marca alerta.

### Granulometría (GRA-001)

Material bien graduado típico de base granular:

| Tamiz | % Pasa |
|---|---|
| 2" | 100 |
| 1½" | 98 |
| 1" | 92 |
| ¾" | 85 |
| ½" | 70 |
| 3/8" | 55 |
| N°4 | 40 |
| N°10 | 28 |
| N°40 | 15 |
| N°200 | 7 |

### Atterberg + CBR (CBR-001)

- LL = 28%, LP = 19% → IP automático = 9 ✅
- CBR 95% = 35 ✅ (dentro de [20:100])
- CBR 100% = 65 ✅
- Observaciones: "Material apto"

---

¡Listo para pruebas! Si encuentras algún error en algún CSV, avísame y lo regenero.
