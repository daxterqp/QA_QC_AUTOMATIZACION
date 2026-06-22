# Rediseño del Tutorial — flujo guiado por página (todas las pantallas)

## Objetivo (pedido del usuario)
Las **primeras tarjetas** del recorrido lineal son las buenas: guían con claridad — *"tocá acá", "hacé
esto para seguir"*. Llevar **TODO** el tutorial (lo nuevo y lo que falta) a ese mismo estándar, con la
lógica de que **cada tutorial vive en su propia pantalla** (tours contextuales por página), para no
alargar el recorrido principal. Luego traducir todo a ES/EN/PT.

## El motor ya lo soporta (no hay que construir infra)
`TourContext.tsx` + `TourOverlay.tsx` ya tienen: tours contextuales (`contextOnly` + `jumpToStep` desde
un botón `(?)` + cierre con `contextEnd`), spotlight sobre `elementId`, píldora de espera con `waitingHint`,
mano apuntadora (`showHandCursor`/`waitingElementId`), puentes (`isBridge`+`autoNavigate`), y restricción
por `roles`. i18n vía `tour.<id>.title/message/waitingHint` (ES/EN/PT) con fallback al literal embebido.

## El PATRÓN "tarjeta buena" a replicar en cada paso
1. **Spotlight sobre el elemento exacto** (`elementId`) → muestra QUÉ tocar.
2. **`message`** que explica la función **y anticipa el resultado** de la próxima acción.
3. **`waitingHint` imperativo** ("Toca X para…") cuando el objetivo está en otra pantalla.
4. **`waitingElementId` + `showHandCursor`** → mano que señala físicamente el control que avanza.
5. **Encadenar** acciones (paso N apunta al control que abre el paso N+1); puentes entre módulos.
Referencias modelo: `location_item`, `protocol_row`, `protocol_item_row`, `plan_viewer_draw_toggle`, `dossier_protocol_list`.

## Trabajo A — Mejorar los tours contextuales POBRES (ya existen, les falta el patrón)
Reescribir mensajes + agregar `waitingHint` guía + `waitingElementId`/`showHandCursor` + encadenar, en:
- **Ensayos** (`ens_*`), **Mapa** (`map_*`), **Sectores** (`sectors_*`), **Config** (`config_*`),
  **Contactos** (`contacts_*`), **Trazabilidad** (`trace_home_*`, `trace_cap_*`, `trace_chk_*`,
  `trace_run_*`, `trace_an_*`), **WorkSessionDetail** (`wsd_*`).
- Arreglar el mal uso de `waitingHint` como aviso de permiso (contactos/trace) → moverlo a guía de navegación;
  los avisos de rol van en el `message`.
- Módulo **Medición**: aunque es lineal, varios pasos no tienen `waitingHint`; agregar guía donde aplique.

## Trabajo B — Tours NUEVOS por pantalla (faltan por completo)
Crear tour contextual (con botón `(?)` → `jumpToStep`, `contextOnly`, `contextEnd`, patrón guiado) en:
- **SamplesScreen** + **SampleDetailScreen** (Muestras / código de muestra / QR).
- **SummaryTablesScreen** (Tablas Resumen: KPIs, filtros, export).
- **RecycleBinScreen** (papelera: restaurar / eliminar definitivo).
- **UserManagementScreen** (usuarios/roles/firma/accesos — OJO: ahora alta por email+password vía Edge Function).
- **ProtocolListScreen**, **NonConformityScreen**.
- **Motor xref entre fichas** (celda de consulta) — dentro del flujo de llenado numérico.
- **Codificación correlativa** — paso propio (hoy solo se menciona en `config_protocols`).
- **Selector de idiomas** (menú/Preferencias).
- **Equipos / lab-aux** (catálogo de equipos, tablas auxiliares de calibración).

Por cada pantalla nueva: (1) agregar `useTourStep('id')` a los 2-4 elementos clave, (2) botón de ayuda `(?)`
que llame `jumpToStep('<primer id>')`, (3) entradas en `TOUR_STEPS` (`contextOnly:true`, último con `contextEnd:true`),
(4) literal ES embebido + (5) claves i18n.

## Trabajo C — Limpieza
Refs huérfanos (`useTourStep` sin paso): `audit_items_list`, `audit_action_buttons`, `project_action_chips`,
`plan_viewer_pdf_area`, `fileupload_tab_bar`, `fileupload_action_btn` → convertir en pasos reales o quitar el ref.

## Trabajo D — i18n (al final)
Cada paso nuevo/cambiado necesita `tour.<id>.title` + `.message` (+ `.waitingHint` si guía) en **ES/EN/PT**
en `src/i18n/screens/tour.ts`. El literal embebido en el `TourStep` se escribe SIEMPRE en ES (fallback).
Verificar con el chequeo de claves usadas-vs-definidas (script de i18n ya usado).

## Verificación
`npx tsc --noEmit` móvil 0; abrir cada pantalla y su botón `(?)` → el tour contextual guía con spotlight +
waitingHint + mano; el recorrido lineal principal NO se alarga (los nuevos son contextuales). i18n: 0 claves
faltantes; probar en EN/PT que no aparezcan literales crudos.

## Orden sugerido de implementación (por módulo, paralelizable)
1. Mejorar contextuales existentes (A) — por módulo (ensayos, mapa, sectores, config, contactos, trazabilidad, wsd).
2. Tours nuevos (B) — por pantalla.
3. Limpieza de huérfanos (C).
4. i18n ES/EN/PT (D) + verificación.
