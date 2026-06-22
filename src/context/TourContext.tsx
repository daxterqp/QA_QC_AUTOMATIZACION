/**
 * TourContext — Tour guiado Flow-QA/QC
 *
 * 28 pasos con navegación automática entre secciones.
 * El estado "waiting" muestra una píldora flotante no bloqueante.
 * Auto-inicia desde ProjectListScreen la primera vez tras login.
 */

import React, {
  createContext, useCallback, useContext,
  useEffect, useRef, useState,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { CommonActions } from '@react-navigation/native';
import type { NavigationContainerRef } from '@react-navigation/native';
import type { RootStackParamList } from '@navigation/types';
import { useAuth } from '@context/AuthContext';

export const TOUR_DONE_KEY = '@scua_tour_done_v1';

// ── Tipos ────────────────────────────────────────────────────────────────────

export interface HighlightMeasure {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface TourStep {
  id: string;
  screen?: keyof RootStackParamList;
  elementId?: string;
  title: string;
  message: string;
  tooltipPosition?: 'above' | 'below' | 'auto';
  /** Mensaje que aparece en la píldora cuando el elemento no está en pantalla */
  waitingHint?: string;
  /** elementId de un elemento en pantalla sobre el que mostrar el cursor mientras se espera */
  waitingElementId?: string;
  /** Dirección en la que apunta la mano en estado waiting (default: 'left') */
  waitingHandDirection?: 'left' | 'right';
  /** Ajuste vertical en px del cursor de mano (positivo = abajo, negativo = arriba) */
  waitingHandOffsetY?: number;
  /** Muestra cursor de mano encima del elemento destacado en el spotlight */
  showHandCursor?: boolean;
  /** Dirección del cursor de mano en spotlight: 'left' apunta desde derecha (default), 'right' apunta desde izquierda */
  handCursorDirection?: 'left' | 'right';
  /** Fracción de la altura del elemento que cubre el spotlight (0.67 = solo 2/3 superiores, tooltip cabe abajo) */
  highlightHeightFraction?: number;
  /** Paso puente: se muestra como píldora de espera sin elementId (no modal centrado) */
  isBridge?: boolean;
  /** Si true, useTourStep NO pre-mide este elemento como upcomingStep.
   *  Usar cuando el elemento requiere scroll previo para estar en pantalla. */
  noPreMeasure?: boolean;
  /** Navega automáticamente a esta pantalla cuando el paso se activa */
  autoNavigate?: { screen: keyof RootStackParamList };
  /** Si se define, el paso solo aparece para los roles indicados */
  roles?: Array<'CREATOR' | 'RESIDENT' | 'SUPERVISOR' | 'OPERATOR'>;
  /** Último paso del tramo contextual de esta sección.
   *  Cuando el tour se inició en modo contextual (jumpToStep), al presionar "Siguiente"
   *  desde aquí el tour se cierra en lugar de avanzar al puente de la siguiente sección. */
  contextEnd?: boolean;
  /** v32d — Paso SOLO contextual (accesible por el botón de ayuda de su pantalla
   *  vía jumpToStep), excluido del tour lineal de bienvenida y de su contador.
   *  Los pasos de los módulos opcionales (ensayos, trazabilidad, GIS, config,
   *  contactos) usan esto: no alargan el recorrido inicial. */
  contextOnly?: boolean;
}

export interface TourContextType {
  isActive: boolean;
  currentStepIndex: number;
  currentStep: TourStep | null;
  /** Paso siguiente (pre-medición en background para transición sin flash) */
  upcomingStep: TourStep | null;
  totalSteps: number;
  measures: Record<string, HighlightMeasure>;
  registerMeasure: (id: string, m: HighlightMeasure) => void;
  unregisterMeasure: (id: string) => void;
  startTour: () => void;
  startTourIfFirstTime: () => void;
  jumpToStep: (id: string) => void;
  nextStep: () => void;
  prevStep: () => void;
  skipTour: () => void;
  completeTour: () => void;
  dismissTour: () => void;
  isContextual: boolean;
  navigationRef: React.RefObject<NavigationContainerRef<RootStackParamList>>;
}

// ── Pasos del tour ───────────────────────────────────────────────────────────

const TOUR_STEPS: TourStep[] = [
  // ── 0: Bienvenida ──────────────────────────────────────────────────────────
  {
    id: 'welcome',
    title: '¡Bienvenido a Flow-QA/QC!',
    message: 'Sistema de Control de Calidad para proyectos de construcción. Te guiaremos por todas las funciones principales paso a paso.',
  },

  // ── 1-7: Pantalla Proyectos ────────────────────────────────────────────────
  {
    id: 'nav_new_btn',
    screen: 'ProjectList',
    elementId: 'nav_new_btn',
    title: 'Crear Nuevo Proyecto',
    message: 'Los Jefes de Obra y Creadores pueden iniciar un nuevo proyecto de calidad. Se define nombre y contraseña de acceso.',
    roles: ['CREATOR', 'RESIDENT'],
  },
  {
    id: 'nav_join_btn',
    screen: 'ProjectList',
    elementId: 'nav_join_btn',
    title: 'Ingresar a un Proyecto',
    message: 'Si un Jefe de Obra ya creó el proyecto, únete usando el nombre exacto del proyecto y su contraseña de acceso.',
  },
  {
    id: 'nav_dashboard_btn',
    screen: 'ProjectList',
    elementId: 'nav_dashboard_btn',
    title: 'Dashboard de Estadísticas',
    message: 'Accede al resumen estadístico de todos tus proyectos: protocolos aprobados, pendientes, no conformidades y avance semanal.',
  },
  {
    id: 'project_card',
    screen: 'ProjectList',
    elementId: 'project_card',
    title: 'Tarjeta de Proyecto',
    message: 'Cada tarjeta representa un proyecto. Toca el nombre para entrar y explorar sus ubicaciones de inspección.',
  },
  {
    id: 'project_observaciones_chip',
    screen: 'ProjectList',
    elementId: 'project_observaciones_chip',
    title: 'Observaciones del Proyecto',
    message: 'Accede directamente al tablón de observaciones del plano: comentarios entre supervisores QC y el Jefe de Obra.',
  },
  {
    id: 'project_dosier_chip',
    screen: 'ProjectList',
    elementId: 'project_dosier_chip',
    title: 'Dosier del Proyecto',
    message: 'El expediente de calidad: todos los protocolos aprobados organizados por especialidad, listos para exportar en PDF.',
  },
  {
    id: 'project_cargar_chip',
    // v29 — Cargar archivos se accede desde el menú interno del proyecto.
    screen: 'ProjectMenu',
    elementId: 'menu_file_upload',
    title: 'Cargar Archivos',
    message: 'Al entrar al proyecto, tap en "Cargar archivos" para subir protocolos, ubicaciones, equipos, sectores y planos.',
  },

  // ── 8-10: LocationList ─────────────────────────────────────────────────────
  {
    id: 'location_item',
    screen: 'LocationList',
    elementId: 'location_item',
    title: 'Ubicaciones del Proyecto',
    message: 'Cada ubicación es un sector o área del proyecto con sus propios protocolos de control de calidad asignados.',
    waitingHint: 'Toca el nombre del proyecto para ingresar',
    waitingElementId: 'project_card',
    waitingHandOffsetY: -25,
  },
  {
    id: 'location_filters',
    screen: 'LocationList',
    elementId: 'location_filters',
    title: 'Filtros de Ubicación',
    message: 'Filtra las ubicaciones por nombre o por especialidad para encontrar rápidamente el sector que necesitas inspeccionar.',
  },
  {
    id: 'location_progress_bar',
    screen: 'LocationList',
    elementId: 'location_progress_bar',
    title: 'Progreso de Protocolos',
    message: 'El indicador numérico muestra cuántos protocolos han sido aprobados del total asignado a esta ubicación. Toca la ubicación para ver sus protocolos.',
  },

  // ── 11: LocationProtocols ──────────────────────────────────────────────────
  {
    id: 'protocol_row',
    screen: 'LocationProtocols',
    elementId: 'protocol_row',
    title: 'Protocolos de Inspección',
    message: 'Cada fila es un protocolo. La barra de color izquierda indica el estado: naranja = pendiente, verde = aprobado, rojo = rechazado.',
    waitingHint: 'Toca una ubicación para ver sus protocolos',
    waitingElementId: 'location_item',
  },

  // ── 12-14: ProtocolFill ────────────────────────────────────────────────────
  {
    id: 'protocol_item_row',
    screen: 'ProtocolFill',
    elementId: 'protocol_item_row',
    title: 'Ítems de Inspección',
    message: 'Cada ítem es un punto de control. Márcalo con: Sí ✔ si cumple, No ✗ si no cumple, o N/A cuando la pregunta no aplica a este proyecto específico.',
    waitingHint: 'Toca un protocolo para llenarlo',
    waitingElementId: 'protocol_row',
  },
  {
    id: 'protocol_camera_btn',
    screen: 'ProtocolFill',
    elementId: 'protocol_camera_btn',
    title: 'Evidencia Fotográfica',
    message: 'Toma una foto como evidencia del ítem. Se estampa automáticamente con fecha, hora y logo del proyecto.',
  },
  {
    id: 'protocol_submit_btn',
    screen: 'ProtocolFill',
    elementId: 'protocol_submit_btn',
    title: 'Enviar para Aprobación',
    message: 'Con todos los ítems completados, envía el protocolo al Jefe de Obra para su revisión y aprobación formal.',
  },

  // ── 15-22: PlanViewer ──────────────────────────────────────────────────────
  {
    id: 'plan_viewer_draw_toggle',
    screen: 'PlanViewer',
    elementId: 'plan_viewer_draw_toggle',
    title: 'Anotar el Plano',
    message: 'Activa el botón "+ Anotar plano" para marcar observaciones:\n• Toca el plano → crea un punto de observación puntual\n• Arrastra en el plano → dibuja un recuadro de área\nCada anotación queda numerada y genera un hilo de comentarios para el equipo.',
    waitingHint: 'Toca el botón "Planos" para abrir el visor',
    waitingElementId: 'protocol_planos_btn',
    waitingHandDirection: 'right',
  },
  {
    id: 'plan_measurement_btn',
    screen: 'PlanViewer',
    elementId: 'plan_measurement_btn',
    title: 'Medición sobre el Plano',
    message: 'El botón con icono de cinta métrica abre el módulo de Medición para este mismo plano. Podrás calibrar, medir distancias, áreas y calcular ladrillos, volumen y locetas sin salir del visor.',
    waitingHint: 'Permanece en el visor de planos para ver esta opción',
  },
  {
    id: 'plan_zoom_options',
    screen: 'PlanViewer',
    elementId: 'plan_zoom_options',
    title: 'Control de Zoom',
    message: 'Cambia la escala con los botones de la barra superior derecha:\n• 1x → vista normal\n• 1.5x / 2x → detalle medio\n• 3x → máximo detalle para inspección fina',
    waitingHint: 'Permanece en el visor de planos para ver esta opción',
  },
  {
    id: 'plan_selector',
    screen: 'PlanViewer',
    elementId: 'plan_selector',
    noPreMeasure: true,
    tooltipPosition: 'below',
    title: 'Cambiar entre Planos',
    message: 'El selector "PLANO ACTIVO" debajo del encabezado muestra el plano actual. Si la ubicación tiene varios planos PDF cargados:\n• Toca el selector → se despliega la lista con todos los planos disponibles\n• Elige otro plano → el visor lo carga sin salir de la pantalla\nSolo aparece cuando hay más de un plano asociado a la ubicación.',
    waitingHint: 'Solo aparece si la ubicación tiene más de un plano. Toca Siguiente si no aparece.',
  },
  {
    id: 'plan_viewer_annotation_list',
    screen: 'PlanViewer',
    elementId: 'plan_viewer_annotation_list',
    title: 'Lista de Observaciones del Plano',
    message: 'La sección "OBSERVACIONES" al final de la pantalla lista todas las marcas del plano. Cada tarjeta muestra el número, comentario y estado (pendiente/cerrado).',
  },
  {
    id: 'plan_reply_btn',
    screen: 'PlanViewer',
    elementId: 'plan_reply_btn',
    title: 'Agregar Comentario',
    message: 'El botón "+ Responder" abre el formulario para escribir un comentario y adjuntar fotos como evidencia. Toda la conversación queda registrada para el equipo.',
    waitingHint: 'Toca la observación para desplegarla',
    waitingElementId: 'plan_annotation_expand',
    showHandCursor: true,
  },
  {
    id: 'plan_reply_form',
    screen: 'PlanViewer',
    elementId: 'plan_reply_form',
    title: 'Comentarios y Evidencia Fotográfica',
    message: 'Escribe tu comentario y adjunta fotos como evidencia. El ícono de cámara captura la evidencia fotográfica. Toda la conversación queda registrada formando un hilo de información del equipo.',
    waitingHint: 'Toca "+ Responder" para abrir el formulario',
    waitingElementId: 'plan_reply_btn',
  },
  {
    id: 'plan_dwg_btn',
    screen: 'PlanViewer',
    elementId: 'plan_dwg_btn',
    title: 'Archivo DWG',
    message: 'El botón "DWG" en la esquina superior derecha abre el archivo técnico del plano en formato DWG. Solo aparece cuando el proyecto tiene un archivo DWG cargado en esa ubicación.',
    waitingHint: 'Solo aparece si el proyecto tiene archivo DWG cargado. Toca Siguiente para continuar si no aparece.',
  },

  // ── Puente → AnnotationComments ────────────────────────────────────────────
  {
    id: 'bridge_to_observaciones',
    isBridge: true,
    title: '¡Sigamos explorando funcionalidades!',
    message: 'Ahora veremos el Tablón de Observaciones del plano.',
    autoNavigate: { screen: 'ProjectList' },
  },

  // ── AnnotationComments ─────────────────────────────────────────────────────
  {
    id: 'annotation_row',
    screen: 'AnnotationComments',
    elementId: 'annotation_row',
    title: 'Tablón de Observaciones',
    message: 'Aquí se listan todas las observaciones marcadas sobre los planos. Cada tarjeta muestra el número de protocolo, ubicación, comentario inicial y la última respuesta del equipo.',
    waitingHint: 'Toca "Observaciones" en la tarjeta del proyecto',
    waitingElementId: 'project_observaciones_chip',
  },
  {
    id: 'annotation_status_badge',
    screen: 'AnnotationComments',
    elementId: 'annotation_status_badge',
    title: 'Estado de la Observación',
    message: 'El borde de color indica el estado: rojo = abierta/pendiente, verde = cerrada/resuelta. El Jefe de Obra puede marcarla como "Completado" cuando el equipo resuelve el problema.',
  },
  {
    id: 'annotation_tap_row',
    screen: 'AnnotationComments',
    elementId: 'annotation_row',
    title: 'Acceso Directo al Plano',
    message: 'Toca cualquier observación para ir directamente al plano PDF donde fue marcada. Verás la anotación resaltada con su número y contexto exacto.',
    showHandCursor: true,
  },
  {
    id: 'plan_header_info',
    screen: 'PlanViewer',
    elementId: 'plan_header_info',
    title: 'Plano de la Observación',
    message: 'Nos lleva directamente al plano donde se realizó la observación. El encabezado superior muestra el número de protocolo y la ubicación exacta.',
    waitingHint: 'Toca la observación para ir al plano',
    waitingElementId: 'annotation_row',
  },

  // ── Puente → Planos (medición) ──────────────────────────────────────────────
  {
    id: 'bridge_to_planos',
    isBridge: true,
    title: 'Exploremos el apartado de Planos',
    message: 'Vamos al módulo de Planos donde puedes medir distancias, áreas y volúmenes directamente sobre los PDFs.',
    autoNavigate: { screen: 'ProjectList' },
  },
  {
    id: 'planos_button',
    // v29 — Planos se accede desde el menú interno del proyecto (ProjectMenu),
    // ya no desde la tarjeta. Se mantiene el step pero apuntando al ProjectMenu.
    screen: 'ProjectMenu',
    elementId: 'menu_planos',
    title: 'Acceso a Planos',
    message: 'Al entrar a un proyecto, tap en "Planos" en el menú intermedio para ver todos los planos disponibles.',
    showHandCursor: true,
    waitingHint: 'Toca un proyecto y luego "Planos"',
  },
  {
    id: 'planos_list_card',
    screen: 'PlansManagement',
    elementId: 'planos_list_card',
    noPreMeasure: true,
    tooltipPosition: 'below',
    title: 'Lista de Planos por Especialidad',
    message: 'Los planos están agrupados por especialidad (Arquitectura, Cimentación, Estructuras, etc.). Toca el encabezado de cada especialidad para desplegar u ocultar sus planos. Dentro de cada grupo, toca un plano para entrar al modo de medición.',
    showHandCursor: true,
    waitingHint: 'Despliega una especialidad y toca un plano',
    waitingElementId: 'planos_button',
  },

  // ── Medición: herramientas ──────────────────────────────────────────────────
  {
    id: 'measurement_pan',
    screen: 'Measurement',
    elementId: 'measurement_pan',
    title: 'Mover (Pan)',
    message: 'Herramienta por defecto. Arrastra con un dedo para mover el plano y pellizca con dos dedos para hacer zoom hasta 20x.',
    waitingHint: 'Toca un plano para abrir modo medición',
    waitingElementId: 'planos_list_card',
  },
  {
    id: 'measurement_calibrate',
    screen: 'Measurement',
    elementId: 'measurement_calibrate',
    title: 'Calibración',
    message: 'Paso obligatorio antes de medir. Arrastra una línea sobre una medida conocida del plano (por ejemplo 5 m), escribe esa medida real en el recuadro y pulsa ✓. La app convertirá píxeles a metros para todas las mediciones.',
  },
  {
    id: 'measurement_measure',
    screen: 'Measurement',
    elementId: 'measurement_measure',
    title: 'Medir distancia',
    message: 'Arrastra dos puntos para crear una cota. Al tocar un segmento existente puedes editar sus extremos. Para eliminar, selecciona la línea y toca el icono de papelera.',
  },
  {
    id: 'measurement_polyline',
    screen: 'Measurement',
    elementId: 'measurement_polyline',
    title: 'Trazo (Polilínea)',
    message: 'Toca en secuencia para agregar vértices. Toca cerca del primer punto para cerrar la figura. Usa "Atrás" para deshacer el último vértice y "Listo" para finalizar. Al seleccionar un trazo puedes extenderlo, calcular ladrillos/volumen o eliminarlo.',
  },
  {
    id: 'measurement_sketch',
    screen: 'Measurement',
    elementId: 'measurement_sketch',
    title: 'Dibujar a mano alzada',
    message: 'Traza con el dedo como si fuera un lápiz. Al soltar, la app simplifica y suaviza el contorno automáticamente para convertirlo en un trazo editable.',
  },
  {
    id: 'measurement_print',
    screen: 'Measurement',
    elementId: 'measurement_print',
    title: 'Imprimir',
    message: 'Genera un PDF del plano con TODAS las anotaciones visibles (cotas, trazos, áreas) y abre el diálogo para compartirlo o guardarlo.',
  },
  {
    id: 'measurement_toggle_area',
    screen: 'Measurement',
    elementId: 'measurement_toggle_area',
    title: 'Mostrar / Ocultar Áreas',
    message: 'Activa este toggle (letra A) para que se muestre el relleno y la etiqueta de m² en todos los polígonos cerrados. Útil para verificar superficies de losas, habitaciones o zonas de trabajo. Desactívalo si quieres ver el plano sin sombras.',
  },
  {
    id: 'measurement_toggle_angles',
    screen: 'Measurement',
    elementId: 'measurement_toggle_angles',
    title: 'Mostrar / Ocultar Ángulos',
    message: 'Activa el toggle de ángulos (θ°) para ver el ángulo interior en cada vértice de polilíneas y polígonos. Ideal para verificar esquinas a 90°, alineamientos o ángulos de diseño. Los arcos dibujan siempre el ángulo interno (el más corto).',
  },
  {
    id: 'measurement_fab_bricks',
    screen: 'Measurement',
    elementId: 'measurement_fab_bricks',
    title: 'Metrado de Ladrillos',
    message: 'Selecciona primero un trazo (polilínea = perímetro de muro) o un área (polígono) y toca este botón. Ingresa altura de pared, tipo de ladrillo (KK18, pandereta, caravista, hueco…), junta y % de desperdicio, y la app calcula el total de unidades. El resultado queda guardado en el elemento.',
    waitingHint: 'Primero traza un polígono o polilínea y selecciónalo',
  },
  {
    id: 'measurement_fab_volume',
    screen: 'Measurement',
    elementId: 'measurement_fab_volume',
    title: 'Metrado de Volumen',
    message: 'Con un trazo o área seleccionado, este botón calcula volumen en m³:\n• Polígono: área × altura (útil para losas, zapatas, falsos techos)\n• Polilínea: perímetro × altura × espesor (útil para sobrecimientos y muros de concreto)\nEl valor queda persistido en el elemento.',
  },
  {
    id: 'measurement_fab_tiles',
    screen: 'Measurement',
    elementId: 'measurement_fab_tiles',
    title: 'Metrado de Locetas / Cerámicos',
    message: 'Con un área (polígono) seleccionada, calcula cuántas piezas de cerámico, porcelanato o loseta necesitas según el formato elegido (30×30, 45×45, 60×60, etc.), considerando junta y % de desperdicio. Ideal para pisos y enchapes.',
  },
  {
    id: 'measurement_fab_calc',
    screen: 'Measurement',
    elementId: 'measurement_fab_calc',
    title: 'Calculadora flotante',
    message: 'Abre una calculadora simple con operaciones + − × ÷ y paréntesis, útil para sumar metrados sin salir del plano.',
    contextEnd: true,
  },

  // ── Puente → Dossier ────────────────────────────────────────────────────────
  {
    id: 'bridge_to_dossier',
    isBridge: true,
    title: '¡Sigamos explorando funcionalidades!',
    message: 'Ahora veremos el Dosier del proyecto.',
    autoNavigate: { screen: 'ProjectList' },
  },

  // ── Dossier ────────────────────────────────────────────────────────────────
  {
    id: 'dossier_protocol_list',
    screen: 'Dossier',
    elementId: 'dossier_item_0',
    title: 'Dosier del Proyecto',
    message: 'Reúne todos los protocolos enviados a revisión organizados por fecha.\nLa franja de color indica el estado:\n• Naranja: pendiente de aprobación\n• Verde: aprobado por el Jefe de Obra\n• Rojo: rechazado, requiere correcciones\nToca cualquier tarjeta para ver el protocolo completo con sus ítems y evidencias.',
    waitingHint: 'Toca "Dosier" en la tarjeta del proyecto',
    waitingElementId: 'project_dosier_chip',
    showHandCursor: true,
  },
  {
    id: 'dossier_protocol_header',
    screen: 'ProtocolAudit',
    elementId: 'dossier_protocol_header',
    title: 'Protocolo Realizado',
    message: 'Nos lleva directamente al protocolo realizado. El encabezado muestra el número de protocolo, la ubicación inspeccionada y su estado actual.',
    waitingHint: 'Toca una tarjeta del Dosier para ver el protocolo',
    waitingElementId: 'dossier_item_0',
  },
  {
    id: 'dossier_protocol_back_btn',
    screen: 'ProtocolAudit',
    title: 'Volver al Dosier',
    message: 'Toca la flecha ← para regresar al Dosier y continuar con el flujo de exportación del expediente.',
    waitingHint: 'Toca la flecha ← para regresar al Dosier',
    waitingElementId: 'dossier_protocol_back_btn',
  },
  {
    id: 'dossier_export_btn',
    screen: 'Dossier',
    elementId: 'dossier_export_btn',
    title: 'Exportar Dosier PDF',
    message: 'Genera el PDF oficial del Dosier con carátula, índice y todos los protocolos. Toca para generar y abrir la vista previa.',
    showHandCursor: true,
    handCursorDirection: 'right',
    roles: ['CREATOR', 'RESIDENT'],
  },
  {
    id: 'dossier_preview_pdf',
    screen: 'DossierPreview',
    elementId: 'dossier_preview_pdf',
    title: 'Vista Previa del Dosier',
    message: 'El PDF generado incluye carátula del proyecto, índice y todos los protocolos aprobados con sus evidencias. Desliza hacia abajo para navegar entre páginas.',
    waitingHint: 'Toca el botón exportar para abrir la vista previa',
    waitingElementId: 'dossier_export_btn',
    highlightHeightFraction: 0.5,
  },
  {
    id: 'dossier_preview_actions',
    screen: 'DossierPreview',
    elementId: 'dossier_preview_actions',
    title: 'Descargar y Compartir',
    message: 'Los botones en la esquina superior derecha permiten:\n• Descargar ↓: guarda el PDF en una carpeta del dispositivo\n• Compartir ↯: envía por WhatsApp, correo u otras apps instaladas',
    roles: ['CREATOR', 'RESIDENT'],
  },

  // ── Puente → Dashboard ──────────────────────────────────────────────────────
  {
    id: 'bridge_to_dashboard',
    isBridge: true,
    title: '¡Sigamos explorando funcionalidades!',
    message: 'Ahora veremos el Dashboard de estadísticas.',
    autoNavigate: { screen: 'ProjectList' },
  },

  // ── Dashboard / Historical ─────────────────────────────────────────────────
  {
    id: 'dashboard_project_filter',
    screen: 'Historical',
    elementId: 'dashboard_project_filter',
    title: 'Filtro por Proyecto',
    message: 'Selecciona un proyecto para ver sus estadísticas específicas o deja "Todos" para el resumen general.',
    waitingHint: 'Toca "Dashboard" en la barra inferior',
    waitingElementId: 'nav_dashboard_btn',
  },
  {
    id: 'dashboard_first_project',
    screen: 'Historical',
    title: 'Seleccionar un Proyecto',
    message: 'Toca el nombre del proyecto para filtrar todas las secciones del dashboard con sus datos específicos. El chip activo aparece en azul navy.',
    waitingHint: 'Toca el nombre de un proyecto para filtrar el dashboard',
    waitingElementId: 'dashboard_first_project',
  },
  {
    id: 'dashboard_date_filters',
    screen: 'Historical',
    elementId: 'dashboard_date_filters',
    title: 'Filtros por Fecha',
    message: 'Define un rango de fechas para acotar el análisis. Los filtros afectan todos los gráficos: aprobados/rechazados y observaciones abiertas/resueltas.',
  },
  {
    id: 'dashboard_approved_rejected',
    screen: 'Historical',
    elementId: 'dashboard_approved_rejected',
    title: 'Aprobados vs Rechazados',
    message: 'Muestra la proporción de protocolos aprobados frente a rechazados en el período seleccionado. Toca la tarjeta para ir directamente al Dosier del proyecto.',
  },
  {
    id: 'dashboard_obs_status',
    screen: 'Historical',
    elementId: 'dashboard_obs_status',
    title: 'Observaciones Abiertas vs Resueltas',
    message: 'Estado de las observaciones marcadas en los planos: abiertas (pendientes de resolución) vs resueltas. Toca para ir al Tablón de Observaciones.',
  },
  {
    id: 'dashboard_weekly',
    screen: 'Historical',
    elementId: 'dashboard_weekly',
    title: 'Avance Semanal',
    message: 'El gráfico de barras muestra los protocolos aprobados por semana desde el inicio del proyecto. Toca cualquier barra para ver el detalle de esa semana específica.',
  },
  {
    id: 'dashboard_specialty',
    screen: 'Historical',
    elementId: 'dashboard_specialty',
    noPreMeasure: true,
    title: 'Avance por Especialidad',
    message: 'Distribución de protocolos por especialidad o categoría. Permite identificar qué áreas del proyecto tienen mayor actividad de control de calidad.',
  },
  {
    id: 'dashboard_notes',
    screen: 'Historical',
    elementId: 'dashboard_notes',
    noPreMeasure: true,
    title: 'Anotaciones del Dashboard',
    message: 'Registra observaciones generales del proyecto: avances, incidencias o acuerdos del equipo. Las anotaciones quedan guardadas con fecha y autor para el historial del proyecto.',
  },

  // ── Puente → Cargar Archivos ─────────────────────────────────────────────────
  {
    id: 'bridge_to_cargar',
    isBridge: true,
    title: '¡Sigamos explorando funcionalidades!',
    message: 'Ahora veremos cómo cargar archivos al proyecto: actividades, ubicaciones, planos PDF, DWG y configuración.',
    autoNavigate: { screen: 'ProjectList' },
    roles: ['CREATOR', 'RESIDENT'],
  },

  // ── FileUpload ────────────────────────────────────────────────────────────────
  {
    id: 'fileupload_entry',
    // v29 — Cargar archivos vive en el menú interno del proyecto.
    screen: 'ProjectMenu',
    elementId: 'menu_file_upload',
    title: 'Cargar Archivos al Proyecto',
    message: 'Al entrar al proyecto, tap en "Cargar archivos" para acceder al módulo con sus secciones especializadas.',
    waitingHint: 'Toca un proyecto y luego "Cargar archivos" en el menú',
    roles: ['CREATOR', 'RESIDENT'],
  },
  {
    id: 'fileupload_tab_activities',
    screen: 'FileUpload',
    elementId: 'fileupload_tab_activities',
    title: 'Actividades / Protocolos',
    message: 'Importa el listado de actividades desde Excel (.xlsx). Define los tipos de protocolo que se inspeccionarán en el proyecto. Sin esto no habrá protocolos para llenar.',
    waitingHint: 'Toca un proyecto y luego "Cargar archivos" en el menú',
    waitingElementId: 'menu_file_upload',
    roles: ['CREATOR', 'RESIDENT'],
  },
  {
    id: 'fileupload_tab_locations',
    screen: 'FileUpload',
    elementId: 'fileupload_tab_locations',
    title: 'Ubicaciones',
    message: 'Importa las ubicaciones del proyecto desde Excel (.xlsx). Cada ubicación es un sector físico (piso, bloque, área) al que se asignan protocolos de inspección.',
    roles: ['CREATOR', 'RESIDENT'],
  },
  {
    id: 'fileupload_tab_pdf',
    screen: 'FileUpload',
    elementId: 'fileupload_tab_pdf',
    title: 'Planos PDF',
    message: 'Sube los planos del proyecto en formato PDF. Vincúlalos a ubicaciones específicas para acceder desde el protocolo y anotar observaciones georreferenciadas.',
    roles: ['CREATOR', 'RESIDENT'],
  },
  {
    id: 'fileupload_tab_dwg',
    screen: 'FileUpload',
    elementId: 'fileupload_tab_dwg',
    title: 'Planos DWG',
    message: 'Sube archivos técnicos en formato DWG. Se abren con DWG FastView (app externa). Solo aparecen en el visor si la ubicación tiene un DWG cargado.',
    roles: ['CREATOR', 'RESIDENT'],
  },
  {
    id: 'fileupload_tab_settings',
    screen: 'FileUpload',
    elementId: 'fileupload_tab_settings',
    title: 'Configuración del Proyecto',
    message: 'Personaliza el proyecto: nombre visible, logo de empresa, imagen de portada y firma digital del Jefe de Obra. Todo esto se estampa en los PDFs exportados.',
    roles: ['CREATOR', 'RESIDENT'],
  },

  // ── Puente → cierre ─────────────────────────────────────────────────────────
  {
    id: 'bridge_to_finish',
    isBridge: true,
    title: '¡Ya casi terminamos!',
    message: 'Regresamos a la lista de proyectos para mostrarte dónde encontrar el tutorial cuando lo necesites.',
    autoNavigate: { screen: 'ProjectList' },
  },

  // ── Cierre ─────────────────────────────────────────────────────────────────
  {
    id: 'tour_help_button',
    screen: 'ProjectList',
    elementId: 'tour_help_button',
    title: '¡Tutorial Siempre Disponible!',
    message: 'Puedes reiniciar este tutorial en cualquier momento tocando "Tutorial" en el encabezado. ¡Ya estás listo para usar Flow-QA/QC!',
    waitingHint: 'Regresa a la lista de proyectos para finalizar',
  },

  // ════════════════════════════════════════════════════════════════════════════
  // v32d — TOURS CONTEXTUALES de los módulos opcionales (sector/tipo/fecha,
  // geolocalización, trazabilidad, config, contactos). TODOS con `contextOnly`:
  // solo se alcanzan con el botón de ayuda (?) de cada pantalla (jumpToStep) y
  // NO forman parte del recorrido lineal de bienvenida. Cada bloque cierra con
  // `contextEnd`.
  // ════════════════════════════════════════════════════════════════════════════

  // ── Ensayos por sector / tipo / fecha ───────────────────────────────────────
  {
    id: 'ens_search', screen: 'Ensayos', elementId: 'ens_search', contextOnly: true,
    title: 'Buscar ensayos',
    message: 'Filtra al instante por código (ej. PR-260001), tipo de ensayo o referencia. Útil cuando un sector o una fecha acumulan muchos ensayos.',
  },
  {
    id: 'ens_filters', screen: 'Ensayos', elementId: 'ens_filters', contextOnly: true,
    title: 'Filtros cruzados',
    message: 'Acota por rango de fechas y por uno o varios tipos o sectores a la vez. Por defecto se muestran todos.',
  },
  {
    id: 'ens_group', screen: 'Ensayos', elementId: 'ens_group', contextOnly: true, contextEnd: true,
    title: 'Grupos desplegables',
    message: 'Cada tarjeta agrupa los ensayos. Tócala para desplegarla: dentro podrás "Adicionar ensayo" y, manteniendo presionado un ensayo, editar su fecha/hora o eliminarlo.',
    waitingHint: 'Abre una pestaña de Ensayos para verlo',
  },

  // ── Geolocalización · Mapa del proyecto ─────────────────────────────────────
  {
    id: 'map_filters', screen: 'ProjectMap', elementId: 'map_filters', contextOnly: true,
    title: 'Filtrar por estado',
    message: 'Muestra u oculta los ensayos según su estado (aprobado, en revisión, etc.). Sirve también de leyenda de colores.',
  },
  {
    id: 'map_view', screen: 'ProjectMap', elementId: 'map_view', contextOnly: true,
    title: 'Mapa del proyecto',
    message: 'Cada pin es un ensayo georreferenciado y cada polígono un sector. Toca un pin para abrir su ensayo.',
  },
  {
    id: 'map_layer_toggle', screen: 'ProjectMap', elementId: 'map_layer_toggle', contextOnly: true, contextEnd: true,
    title: 'Capa del mapa',
    message: 'Alterna entre Google Maps y la ortofoto del cliente (si el proyecto la tiene configurada).',
    waitingHint: 'Abre el mapa para verlo',
  },

  // ── Geolocalización · Sectores ──────────────────────────────────────────────
  {
    id: 'sectors_import', screen: 'ProjectSectors', elementId: 'sectors_import', contextOnly: true,
    title: 'Importar sectores',
    message: 'Carga los sectores del proyecto desde Excel/CSV: solo nombres, o con coordenadas para dibujar su polígono en el mapa.',
  },
  {
    id: 'sectors_card', screen: 'ProjectSectors', elementId: 'sectors_card', contextOnly: true,
    title: 'Sectores cargados',
    message: 'Cada sector con su color y geometría. Edita su nombre/color o elimínalo desde los iconos de la tarjeta.',
    waitingHint: 'Importa sectores para verlos aquí',
  },
  {
    id: 'sectors_recalc', screen: 'ProjectSectors', elementId: 'sectors_recalc', contextOnly: true, contextEnd: true,
    title: 'Recalcular asignaciones',
    message: 'Reasigna cada ensayo con coordenadas al sector cuyo polígono lo contiene (point-in-polygon).',
  },

  // ── Configurar módulos ──────────────────────────────────────────────────────
  {
    id: 'config_protocols', screen: 'ProjectConfig', elementId: 'config_protocols', contextOnly: true,
    title: 'Configuración de protocolos',
    message: 'Activa protocolos clásicos/numéricos, plantillas paramétricas, carga de históricos, aprobación multinivel y los modos de llenado por sector/tipo/fecha con codificación correlativa.',
  },
  {
    id: 'config_traceability', screen: 'ProjectConfig', elementId: 'config_traceability', contextOnly: true,
    title: 'Módulo de Trazabilidad',
    message: 'Habilita el seguimiento de actividades de equipos con cronómetro y GPS, y sus vistas analíticas.',
  },
  {
    id: 'config_geo', screen: 'ProjectConfig', elementId: 'config_geo', contextOnly: true,
    title: 'Módulo de Geolocalización',
    message: 'Activa el mapa del proyecto, los sectores GIS y la captura de coordenadas en los ensayos.',
  },
  {
    id: 'config_save', screen: 'ProjectConfig', elementId: 'config_save', contextOnly: true, contextEnd: true,
    title: 'Guardar cambios',
    message: 'Aplica la configuración: se sincroniza a la nube y a todos los celulares del proyecto.',
  },

  // ── Contactos ───────────────────────────────────────────────────────────────
  {
    id: 'contacts_card', screen: 'PhoneContacts', elementId: 'contacts_card', contextOnly: true,
    title: 'Directorio del equipo',
    message: 'Los contactos del proyecto. Toca el icono de teléfono de una tarjeta para llamar directamente.',
    waitingHint: 'Aún no hay contactos cargados',
  },
  {
    id: 'contacts_add', screen: 'PhoneContacts', elementId: 'contacts_add', contextOnly: true, contextEnd: true,
    title: 'Agregar contacto',
    message: 'Con el botón + del encabezado registras un nuevo contacto (nombre, rol, teléfono). Disponible para el Jefe de Obra.',
    waitingHint: 'Disponible para el Jefe de Obra',
  },

  // ── Trazabilidad · Inicio ───────────────────────────────────────────────────
  {
    id: 'trace_home_new', screen: 'TraceabilityHome', elementId: 'trace_home_new', contextOnly: true,
    title: 'Nueva actividad',
    message: 'Inicia una sesión de trabajo: eliges equipo, actividad y sector, y arranca el cronómetro.',
  },
  {
    id: 'trace_home_analytics', screen: 'TraceabilityHome', elementId: 'trace_home_analytics', contextOnly: true,
    title: 'Análisis de resultados',
    message: 'Reportes por sector, equipo y cronología, con exportación del PDF de trazabilidad (jefatura).',
    waitingHint: 'Disponible para el Jefe de Obra',
  },
  {
    id: 'trace_home_session', screen: 'TraceabilityHome', elementId: 'trace_home_session', contextOnly: true, contextEnd: true,
    title: 'Tus sesiones',
    message: 'Aquí ves la sesión activa (con cronómetro en vivo) y el historial de sesiones cerradas. Tócalas para ver el detalle.',
    waitingHint: 'Inicia una actividad para verla aquí',
  },

  // ── Trazabilidad · Nueva sesión ─────────────────────────────────────────────
  {
    id: 'trace_cap_equipo', screen: 'TraceabilityCapture', elementId: 'trace_cap_equipo', contextOnly: true,
    title: 'Elige el equipo',
    message: 'Selecciona la máquina o equipo sobre el que registrarás la actividad.',
  },
  {
    id: 'trace_cap_actividad', screen: 'TraceabilityCapture', elementId: 'trace_cap_actividad', contextOnly: true,
    title: 'Elige la actividad',
    message: 'Se habilita tras elegir el equipo: indica qué se está haciendo (productiva, mantenimiento, etc.).',
  },
  {
    id: 'trace_cap_start', screen: 'TraceabilityCapture', elementId: 'trace_cap_start', contextOnly: true, contextEnd: true,
    title: 'Iniciar la sesión',
    message: 'Desliza para comenzar. Si la actividad tiene checklist, lo completas antes de arrancar el cronómetro.',
  },

  // ── Trazabilidad · Checklist previo ─────────────────────────────────────────
  {
    id: 'trace_chk_item', screen: 'TraceabilityChecklist', elementId: 'trace_chk_item', contextOnly: true,
    title: 'Verificaciones previas',
    message: 'Responde cada punto (Sí/No/N.A.) y agrega comentario o foto si aplica, antes de iniciar la sesión.',
  },
  {
    id: 'trace_chk_start', screen: 'TraceabilityChecklist', elementId: 'trace_chk_start', contextOnly: true, contextEnd: true,
    title: 'Iniciar la sesión',
    message: 'Con el checklist completo, desliza para arrancar el cronómetro de la actividad.',
  },

  // ── Trazabilidad · Sesión activa ────────────────────────────────────────────
  {
    id: 'trace_run_timer', screen: 'TraceabilityRunning', elementId: 'trace_run_timer', contextOnly: true,
    title: 'Cronómetro de la sesión',
    message: 'Muestra el tiempo efectivo trabajado. Las pausas no cuentan en el total.',
  },
  {
    id: 'trace_run_actions', screen: 'TraceabilityRunning', elementId: 'trace_run_actions', contextOnly: true, contextEnd: true,
    title: 'Pausar / Reanudar / Finalizar',
    message: 'Desliza el control para pausar la actividad, reanudarla o finalizar la sesión cuando termines.',
  },

  // ── Trazabilidad · Análisis ─────────────────────────────────────────────────
  {
    id: 'trace_an_tabs', screen: 'TraceabilityAnalytics', elementId: 'trace_an_tabs', contextOnly: true,
    title: 'Vistas de análisis',
    message: 'Cambia entre análisis por sector, por equipo, checklists y el resumen exportable a PDF.',
  },
  {
    id: 'trace_an_filters', screen: 'TraceabilityAnalytics', elementId: 'trace_an_filters', contextOnly: true, contextEnd: true,
    title: 'Rango de fechas',
    message: 'Acota los datos a un periodo; cada vista recalcula sus indicadores al cambiarlo.',
  },

  // ── Trazabilidad · Detalle de sesión cerrada ────────────────────────────────
  {
    id: 'wsd_summary', screen: 'WorkSessionDetail', elementId: 'wsd_summary', contextOnly: true,
    title: 'Resumen de la sesión',
    message: 'Duración efectiva y tiempo en pausa de esta sesión cerrada.',
  },
  {
    id: 'wsd_info', screen: 'WorkSessionDetail', elementId: 'wsd_info', contextOnly: true,
    title: 'Datos de la sesión',
    message: 'Equipo, actividad, sector y fechas registradas.',
  },
  {
    id: 'wsd_notes', screen: 'WorkSessionDetail', elementId: 'wsd_notes', contextOnly: true, contextEnd: true,
    title: 'Notas administrativas',
    message: 'El Jefe de Obra puede agregar observaciones de cierre a la sesión.',
    waitingHint: 'Disponible para el Jefe de Obra',
  },
];

// ── Context ──────────────────────────────────────────────────────────────────

const TourContext = createContext<TourContextType | null>(null);

export function useTour(): TourContextType {
  const ctx = useContext(TourContext);
  if (!ctx) throw new Error('useTour debe usarse dentro de TourProvider');
  return ctx;
}

// ── Provider ─────────────────────────────────────────────────────────────────

interface TourProviderProps {
  children: React.ReactNode;
  navigationRef: React.RefObject<NavigationContainerRef<RootStackParamList>>;
}

export function TourProvider({ children, navigationRef }: TourProviderProps) {
  const { currentUser } = useAuth();
  const activeSteps = TOUR_STEPS.filter(
    (s) => !s.roles || (currentUser?.role && s.roles.includes(currentUser.role as any))
  );
  // v32d — Conteo de pasos del recorrido LINEAL (bienvenida): excluye los
  // pasos `contextOnly`, que viven al final del array y solo se alcanzan con el
  // botón de ayuda de cada pantalla. Así el contador "X / N" y la detección del
  // último paso del welcome no se ven afectados por los tours de módulos.
  const linearCount = activeSteps.filter((s) => !s.contextOnly).length;
  const [isActive, setIsActive] = useState(false);
  const [isContextual, setIsContextual] = useState(false);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [measures, setMeasures] = useState<Record<string, HighlightMeasure>>({});
  const firstTimeChecked = useRef(false);

  const registerMeasure = useCallback((id: string, m: HighlightMeasure) => {
    setMeasures((prev) => ({ ...prev, [id]: m }));
  }, []);

  const unregisterMeasure = useCallback((id: string) => {
    setMeasures((prev) => {
      if (!prev[id]) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }, []);

  const startTour = useCallback(() => {
    setMeasures({});
    setCurrentStepIndex(0);
    setIsContextual(false);
    setIsActive(true);
  }, []);

  const startTourIfFirstTime = useCallback(() => {
    if (firstTimeChecked.current) return;
    firstTimeChecked.current = true;
    AsyncStorage.getItem(TOUR_DONE_KEY).then((val) => {
      if (val === null) {
        setTimeout(() => {
          setCurrentStepIndex(0);
          setIsActive(true);
        }, 700);
      }
    }).catch(() => {});
  }, []);

  const jumpToStep = useCallback((id: string) => {
    const idx = activeSteps.findIndex((s) => s.id === id);
    if (idx < 0) return;
    setMeasures({});
    setCurrentStepIndex(idx);
    setIsContextual(true);
    setIsActive(true);
  }, [activeSteps]);

  const nextStep = useCallback(() => {
    setCurrentStepIndex((prev) => {
      const cur = activeSteps[prev];
      // En modo contextual, si el paso actual marca el fin del tramo, cerramos el tour
      // en lugar de saltar al puente de la siguiente sección.
      if (isContextual && cur?.contextEnd) {
        setIsActive(false);
        setIsContextual(false);
        return prev;
      }
      const next = prev + 1;
      if (next >= activeSteps.length) return prev;
      // v32d — En el recorrido LINEAL, al toparse con el primer paso contextOnly
      // (inicio de los tours de módulos) el welcome termina y se marca como visto.
      if (!isContextual && activeSteps[next]?.contextOnly) {
        setIsActive(false);
        AsyncStorage.setItem(TOUR_DONE_KEY, 'true').catch(() => {});
        return prev;
      }
      return next;
    });
  }, [activeSteps, isContextual]);

  const prevStep = useCallback(() => {
    setCurrentStepIndex((prev) => Math.max(0, prev - 1));
  }, []);

  const skipTour = useCallback(() => {
    setIsActive(false);
    setIsContextual(false);
    AsyncStorage.setItem(TOUR_DONE_KEY, 'true').catch(() => {});
  }, []);

  const dismissTour = useCallback(() => {
    setIsActive(false);
    setIsContextual(false);
  }, []);

  const completeTour = useCallback(() => {
    setIsActive(false);
    AsyncStorage.setItem(TOUR_DONE_KEY, 'true').catch(() => {});
  }, []);

  // Auto-navegación cuando un paso tiene autoNavigate
  useEffect(() => {
    if (!isActive) return;
    const step = activeSteps[currentStepIndex];
    if (!step?.autoNavigate) return;
    const timer = setTimeout(() => {
      try {
        navigationRef.current?.dispatch(
          CommonActions.reset({
            index: 0,
            routes: [{ name: step.autoNavigate!.screen as any }],
          })
        );
      } catch { /* navegación no disponible aún */ }
    }, 350);
    return () => clearTimeout(timer);
  }, [isActive, currentStepIndex]);

  const currentStep = isActive ? (activeSteps[currentStepIndex] ?? null) : null;
  const upcomingStep = isActive ? (activeSteps[currentStepIndex + 1] ?? null) : null;

  return (
    <TourContext.Provider
      value={{
        isActive,
        isContextual,
        currentStepIndex,
        currentStep,
        upcomingStep,
        totalSteps: linearCount,
        measures,
        registerMeasure,
        unregisterMeasure,
        startTour,
        startTourIfFirstTime,
        jumpToStep,
        nextStep,
        prevStep,
        skipTour,
        completeTour,
        dismissTour,
        navigationRef,
      }}
    >
      {children}
    </TourContext.Provider>
  );
}
