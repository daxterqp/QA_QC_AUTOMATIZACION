# v43 — Ensayos por muestra · QR · Módulos opcionales · Usuarios · Mejoras

Resumen de todo lo implementado en esta tanda y lo que falta correr/saber. Decisiones
tomadas contigo antes de empezar: **QR global**, **prioridad módulo muestras + QR**,
alta de usuario = Nombre/Apellido/Rol (contraseña inicial = nombre), soft-delete =
usuario inactivo pero visible.

---

## ⚠️ MIGRACIONES A CORRER (tú las corres)

1. **Móvil (WatermelonDB):** automática al abrir la app nueva — esquema **v42 → v43**
   (tabla `samples`, `protocols.sample_id`, `users.is_active`, `projects.sample_identifier`).
   No haces nada; migra sola en el primer arranque.

2. **Supabase (SQL Editor):** corre **`supabase/v46_samples_module.sql`** (idempotente).
   Agrega `users.is_active`, `projects.sample_identifier`, `protocols.sample_id` y crea
   la tabla `samples` con su RLS.

   > Importante: corre v46 **antes** de usar el módulo de muestras y antes de guardar la
   > Configuración del proyecto en la app nueva (la config ahora incluye `sample_identifier`;
   > si la columna no existe aún, el guardado de config fallaría). El resto de la app
   > funciona sin v46 (el sync tolera la tabla `samples` ausente: no rompe ni borra datos).

3. **Rebuild desktop** (`flow-qaqc-desktop` → `npm run build`) cuando quieras desplegar web.

---

## ✅ Implementado

### Módulos opcionales por proyecto (propagados a todos)
- Nuevos flags en `feature_flags`: `module_protocols_by_location` (ON por defecto),
  `module_plans`, `module_contacts`, `module_summary_tables` (OFF), `fill_by_sample` (OFF).
- Se configuran en **Configuración del proyecto** (solo Creador) y se propagan vía
  `feature_flags` (cloud-wins) a todos los usuarios.
- El menú del proyecto oculta/muestra cada módulo según su flag.

### Ensayos por muestra (módulo nuevo)
- **Configuración:** activar `fill_by_sample` + definir **Identificador del proyecto**
  (editable, ej. "123").
- **Código de muestra:** `M{identificador}{ddmmyy}-{####}` (secuencial de 4 díg. por
  proyecto, arranca en 0001). Util: `src/utils/sampleCode.ts`.
- **Pantalla lista** (`SamplesScreen`): 0 tarjetas al inicio + "Añadir muestra".
  Filtro por **rango de correlativo (desde/hasta)** + sector.
- **Modal de alta:** filas activables (Switch): fecha (hoy por defecto), ubicación/sector
  (se desactiva si el proyecto no usa sectores), tipo de material, alterada/inalterada,
  profundidad inicial/final, coordenadas (datum + Este/Norte/Cota + **botón GPS automático**
  reusando `useGpsCapture`), recojo de capas.
- **Pantalla de muestra** (`SampleDetailScreen`): datos generales arriba + lista de ensayos
  vinculados (`protocols.sample_id`) + "Añadir ensayo" (mismo flujo `createInstances`) +
  **exportar PDF** estilo dossier (datos generales + lista de ensayos + QR de la muestra).
- Tabla `samples` + modelo + sync (push/pull) en `SupabaseSyncService`.

### Códigos QR
- **Generación** (`src/utils/qrCode.ts`, lib `qrcode` JS puro) + componente `QrCodeView`
  (render SVG con react-native-svg).
- **Audit header** (ensayos En revisión / Aprobados): banda más alta — proyecto a la
  izquierda, **QR a la derecha**, debajo el código y el estado.
- **QR en PDF**: protocolo (Dossier móvil + export individual) y muestra.
- **Escáner GLOBAL** (ya existía `QRScannerScreen`, accesible desde la lista de proyectos):
  extendido para resolver también muestras (`flow://sample/<código>` → pantalla de muestra).
  Protocolos siguen con `flow://protocol/<id>`.

### Gestión de usuarios
- Botón **(+)** para alta manual (Nombre/Apellido/Rol; 1ª contraseña = nombre). Solo Creador.
- **Editar rol** (tocar la etiqueta de rol → selector). Solo Creador.
- **Soft-delete:** "Desactivar" marca `is_active=false` (NO borra). El usuario pierde el
  login (bloqueado en `AuthContext.login`), pero sus firmas/aprobaciones se conservan y
  sigue **visible tachado/"Inactivo"** con opción "Reactivar".

### Mejoras varias
- **Tarjetas Ensayos por sector/tipo:** ~2× más altas + mayor separación.
- **Papelera:** ya no se queda cargando (fallback + manejo de error en la suscripción);
  al tocar un ensayo abre **preview de su ficha** (NumericTable frozen si es numérico, si
  no lista read-only) en vez de descargar CSV.
- **Dossier de calidad:** recarga al **entrar/volver al proyecto** (`useFocusEffect` +
  pull de nube) → los contadores se actualizan.
- **Cargar archivos:** opciones en **2 filas** (wrap a 4 por fila).
- **Reporte de calibración:** mantiene su estructura y ahora incluye los **valores de las
  tablas** auxiliares de cada equipo.

---

## 🧪 Verificación
- `tsc --noEmit` móvil → 0 · web → 0.
- `engineTests.ts` → 182/182. PRV5 → 0 errores.
- APK release v2.0.3 (versionCode 23) firmada.

---

## ✅ Completado en la 2ª tanda (cierre del alcance)
- **GPS de la muestra = como el módulo existente:** el botón "Medir GPS" captura lat/lng
  (WGS84) y **auto-reproyecta a Este/Norte** según el **datum del proyecto**
  (`coordinate_system`, igual que GPSCaptureBar) usando `CoordinateSystem.ts` (proj4).
  Se quitó el selector de datum por muestra. Cota se ingresa a mano (altitud GPS poco
  confiable). Precisión correcta por sistema (UTM 2 dec / Lat-Lng 6 dec).
- **Filtro de muestras (por datos de la muestra):** rango de correlativo + sector + **rango
  de fecha de muestreo**. Sin filtro de "tipo" (no aplica a muestras).
- **Config WEB:** los toggles de módulos (ubicación/planos/contactos/tablas resumen/muestras)
  + el identificador de muestra se agregaron también al modal de Configuración de la web.
- **3 rondas de revisión de bugs** hechas; correcciones aplicadas (precisión LAT/LNG del GPS;
  pull de nube una sola vez al ENTRAR al proyecto en vez de en cada regreso de subpantalla).

## ✅ Auditoría de alcance (3ª revisión) — hueco corregido
- **Auto-eliminación de cuenta = soft-delete:** antes `deleteAccount` (el usuario cierra
  SU propia cuenta desde "Cambiar contraseña") hacía HARD delete. Ahora marca `is_active=false`
  (móvil + Supabase), cierra sesión y **conserva firmas/aprobaciones/ensayos**. El login
  bloquea cuentas inactivas en ambas rutas (local y remota). Textos actualizados.

## ⚠️ Nota de migración para PROYECTOS EXISTENTES
Como los módulos ahora son opcionales con **default OFF** (salvo "por ubicación"), los
proyectos creados ANTES de esta versión mostrarán solo "Protocolos por ubicación" hasta que
el **Creador active** en Configuración los módulos que use (Planos, Contactos, Tablas
Resumen, Ensayos por muestra). Es el comportamiento pedido ("todos los demás apagados"),
no un bug.

## 📌 Pendiente / simplificado (menor, para una próxima iteración)
- **"Recojo automático de capas":** queda como campo/nota editable (no hay fuente de datos
  de capas automatizada todavía).
- **Cota:** manual (no se usa la altitud del GPS por imprecisión).
- **Menú WEB:** la web aún no oculta módulos por flag (sí los configura); el móvil sí. La
  web preserva los flags.
