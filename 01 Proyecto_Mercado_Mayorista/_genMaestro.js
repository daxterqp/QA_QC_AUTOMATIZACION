/**
 * Generador del EXCEL MAESTRO — Proyecto Mercado Mayorista Plaza Unicachi Huancayo.
 *
 * Fuente: 01 Excel Base/*.xls(x) — 13 protocolos únicos extraídos y normalizados.
 * Salida: 02 Excel Maestro/MAESTRO_Mercado_Mayorista_v1.xlsx (hoja "Actividades").
 *
 * Formato que lee la app (ExcelImporter.ts):
 *   ID_Protocolo | Protocolo | PartidaItem | Actividad realizada | Método de validación | Sección
 *
 * REGLA DE ORO: todas las preguntas en TODAS las secciones (no deduplicar).
 * PartidaItem = enteros secuenciales por protocolo, sin huecos (las pantallas ordenan por él).
 *
 * Ejecutar DESDE la raíz del repo:  node "01 Proyecto_Mercado_Mayorista/_genMaestro.js"
 */
const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

const OUT_DIR = path.join(__dirname, '02 Excel Maestro');
const OUT_FILE = path.join(OUT_DIR, 'MAESTRO_Mercado_Mayorista_v1.xlsx');

// Métodos de validación reutilizables
const M = {
  visual: 'Inspección visual',
  plano: 'Verificación contra plano',
  medicion: 'Medición en campo',
  topo: 'Medición topográfica',
  doc: 'Verificación documental',
  func: 'Prueba de funcionamiento',
  texto: 'texto-[]',
};

// Opciones de respuesta de los checklist clásicos del cliente
const SI_NO_NA = 'Inspección visual';   // el sistema ya provee SI/NO/NA en fichas clásicas

/** Helper: arma filas de un protocolo clásico a partir de secciones. */
function clasico(id, nombre, secciones) {
  const rows = [];
  let p = 1;
  for (const { seccion, items } of secciones) {
    for (const it of items) {
      const [texto, metodo] = Array.isArray(it) ? it : [it, M.visual];
      rows.push({
        ID_Protocolo: id,
        Protocolo: nombre,
        PartidaItem: String(p++),
        'Actividad realizada': texto,
        'Método de validación': metodo,
        'Sección': seccion || '',
      });
    }
  }
  return rows;
}

// ─────────────────────────────────────────────────────────────────────────────
// GRUPO A — Protocolos VRS 2026 (Plaza Unicachi / Grupo VRS)
// ─────────────────────────────────────────────────────────────────────────────

const PA = clasico('PA', 'PROTOCOLO DE ACERO', [{
  seccion: 'INSPECCIÓN',
  items: [
    ['CUMPLIMIENTO DEL PROCEDIMIENTO DE TRABAJO', M.doc],
    ['CONTRASTE DE ESPECIALIDADES (Arquitectura, Estructuras e Instalaciones)', M.plano],
    ['VERIFICACIÓN TOPOGRÁFICA (trazo, alineamiento y niveles)', M.topo],
    ['VERIFICACIÓN DE LOS DIÁMETROS DE ACERO, SEGÚN DETALLES DEL PLANO', M.medicion],
    ['VERIFICACIÓN DE LA DISTRIBUCIÓN DE ACERO (cantidad y espaciamiento entre barras)', M.medicion],
    ['CORRECTA UBICACIÓN DE EMPALMES (traslapes, según el RNE)', M.plano],
    ['CORRECTA EQUIDISTANCIA DE ESTRIBOS SEGÚN DETALLES', M.medicion],
    ['VERIFICACIÓN DE COLOCACIÓN DE MECHAS, ANCLAJES, FIJACIÓN Y ARRIOSTRE DE LAS ARMADURAS (según detalles de planos)', M.plano],
    ['VERIFICACIÓN DE LA LIMPIEZA DE LAS ARMADURAS (libre de rebabas, sin deformaciones)', M.visual],
    ['ÓPTIMAS CONDICIONES DE SEGURIDAD (líneas de vida, plataformas de acceso, barandas, etc.)', M.visual],
  ],
}]);

const PE = clasico('PE', 'PROTOCOLO DE ENCOFRADO', [{
  seccion: 'INSPECCIÓN',
  items: [
    ['CUMPLIMIENTO DEL PROCEDIMIENTO DE TRABAJO', M.doc],
    ['VERIFICACIÓN DE TRAZO Y UBICACIÓN (ejes, alineamiento, distancias, coordenadas y niveles)', M.topo],
    ['VERIFICACIÓN DE ENCOFRADOS (alineamiento, verticalidad y sin deformaciones)', M.medicion],
    ['CORRECTA COLOCACIÓN DE DADOS Y SEPARADORES LATERALES', M.visual],
    ['CORRECTO MONTAJE, FIJACIÓN Y ARRIOSTRE DEL ENCOFRADO', M.visual],
    ['DIMENSIONES DEL ENCOFRADO DE ACUERDO A LO ESPECIFICADO', M.medicion],
    ['VERIFICACIÓN DE COLOCACIÓN DE DESMOLDANTE Y LIMPIEZA INTERIOR DE LOS ENCOFRADOS', M.visual],
    ['VERIFICACIÓN DE PASES O TUBOS DE INSTALACIONES SANITARIAS', M.plano],
    ['VERIFICACIÓN DE PASES O TUBOS DE INSTALACIONES ELÉCTRICAS', M.plano],
    ['VERIFICACIÓN DE COLOCACIÓN DE SOPORTES Y/O ANCLAJES PARA PASES E INSTALACIONES VARIAS', M.plano],
    ['CONDICIONES DE SEGURIDAD ADECUADAS', M.visual],
  ],
}]);

// ⚠ Código propio (PAA): en el Excel original compartía PE-VRS-2026-004 con Encofrado.
const PAA = clasico('PAA', 'PROTOCOLO DE PERFORACIÓN Y ANCLAJE DE ACERO', [{
  seccion: 'INSPECCIÓN',
  items: [
    ['Alinea y centra la columna o varilla en la posición definitiva', M.topo],
    ['Respeta siempre un recubrimiento de concreto mínimo de 2 cm en los bordes para evitar la oxidación futura del acero', M.medicion],
    ['Utiliza un rotomartillo con broca para concreto (punta de carburo)', M.visual],
    ['Diámetro del agujero: debe ser más grande que el diámetro de la varilla', M.medicion],
    ['Debe penetrar al menos 200 mm en el concreto estructural', M.medicion],
    ['Limpieza: soplar con aire comprimido, limpiar con escobilla y volver a soplar', M.visual],
    ['Inyectar desde el fondo hasta los 2/3 del volumen', M.visual],
    ['Insertar girando hasta el fondo para que la resina llegue a cubrir todo el corrugado', M.visual],
    ['El tiempo de curado dependerá de la temperatura del día (20 °C - 24 horas, 10 °C - 48 horas y <5 °C - 72 horas)', M.doc],
    ['Condiciones de seguridad adecuadas', M.visual],
  ],
}]);

const PIS = clasico('PIS', 'PROTOCOLO DE TUBERÍA (INSTALACIONES SANITARIAS)', [{
  seccion: 'DESCRIPCIÓN DE ACTIVIDADES',
  items: [
    ['Instalación de tuberías y accesorios de acuerdo a planos', M.plano],
    ['Material especificado (PVC)', M.visual],
    ['Verificar diámetro de tubería, de acuerdo al plano', M.medicion],
    ['Material libre de defectos (inspección visual)', M.visual],
    ['Soportada adecuadamente (fijación de tuberías y accesorios)', M.visual],
    ['Taponear los terminales expuestos de la tubería así como las cajas de pase', M.visual],
  ],
}]);

const PIE = clasico('PIE', 'PROTOCOLO DE INSTALACIONES ELÉCTRICAS', [{
  seccion: 'DESCRIPCIÓN DE ACTIVIDADES',
  items: [
    ['Correcta ubicación de puntos, según plano', M.plano],
    ['Las tuberías están libres de aplastamientos, roturas o dobleces excesivos que reduzcan su diámetro interior', M.visual],
    ['Los accesorios (uniones, conectores y curvas) son del mismo material y clase que la tubería (PVC)', M.visual],
    ['Colocación de las cajas (octogonales, rectangulares, de paso) según trazo topográfico', M.topo],
    ['Soporte adecuado (fijación de tuberías y accesorios)', M.visual],
    ['Limpieza de área de trabajo', M.visual],
    ['Diámetro de tubería de acuerdo al plano', M.medicion],
    ['Condición en buen estado (tuberías, accesorios)', M.visual],
  ],
}]);

// ─────────────────────────────────────────────────────────────────────────────
// GRUPO B — Topográficos
// ─────────────────────────────────────────────────────────────────────────────

const CTTR = clasico('CTTR', 'CONTROL TOPOGRÁFICO TRAZO Y REPLANTEO', [
  {
    seccion: 'TRAZO INICIAL',
    items: [
      ['Personal calificado - Topógrafo', M.doc],
      ['Terreno liberado', M.doc],
      ['Verificación de alineamiento, medidas y escuadra', M.topo],
      ['Modificación al plano base', M.plano],
    ],
  },
  {
    seccion: 'TRAZO REPLANTEADO',
    items: [
      ['Verificación de dimensiones de estructura', M.topo],
      ['Trazo de vértices en campo', M.topo],
      ['Trazo final de estructura', M.topo],
      ['Equipo topográfico calibrado', M.doc],
    ],
  },
]);

const CTPT = clasico('CTPT', 'CONTROL TOPOGRÁFICO LEVANTAMIENTO DEL TERRENO', [
  {
    seccion: 'TRAZO INICIAL',
    items: [
      ['Personal calificado - Topógrafo', M.doc],
      ['Terreno liberado', M.doc],
      ['Verificación de alineamiento, medidas y escuadra', M.topo],
      ['Modificación al plano base', M.plano],
    ],
  },
  {
    seccion: 'TRAZO REPLANTEADO',
    items: [
      ['Verificación de dimensiones de estructura', M.topo],
      ['Trazo de vértices en campo', M.topo],
      ['Trazo final de estructura', M.topo],
      ['Señalización de espacios', M.visual],
    ],
  },
]);

// ─────────────────────────────────────────────────────────────────────────────
// GRUPO C — Protocolos MEP (formato SOLARA/GRV5, adoptados para esta obra)
//   Traen el MISMO set de preguntas repetido por sistema → todas las secciones.
// ─────────────────────────────────────────────────────────────────────────────

const PPIS = clasico('PPIS', 'PROTOCOLO DE COLOCACIÓN DE PUNTOS DE INSTALACIONES SANITARIAS', [
  {
    seccion: 'VERIFICACIÓN PUNTOS DE AGUA',
    items: [
      ['Verificación de red: agua fría / agua caliente', M.plano],
      ['Material de red: PVC / PPR / acero', M.visual],
      ['Correcta ubicación de puntos, según plano', M.plano],
      ['Cantidad de puntos de salida', M.medicion],
      ['Inspección visual de diámetro y recorrido de tubería', M.visual],
      ['Tipo de salida de agua: ovalín / inodoro', M.visual],
      ['Válvula de paso', M.visual],
      ['Limpieza de área de trabajo', M.visual],
    ],
  },
  {
    seccion: 'VERIFICACIÓN PUNTOS DE DESAGÜE',
    items: [
      ['Correcta ubicación de puntos, según plano', M.plano],
      ['Material de red: PVC / PPR', M.visual],
      ['Cantidad de puntos de salida', M.medicion],
      ['Inspección visual de diámetro y recorrido de tubería', M.visual],
      ['Tipo de salida de desagüe: ovalín / inodoro', M.visual],
      ['Urinario / registro / sumidero', M.visual],
      ['Limpieza de área de trabajo', M.visual],
    ],
  },
  {
    seccion: 'VERIFICACIÓN PUNTOS DE VENTILACIÓN',
    items: [
      ['Correcta ubicación de puntos, según plano', M.plano],
      ['Material de red: PVC / PPR', M.visual],
      ['Cantidad de puntos de salida', M.medicion],
      ['Inspección visual de diámetro y recorrido de tubería', M.visual],
      ['Limpieza de área de trabajo', M.visual],
    ],
  },
]);

// PPIE — 9 secciones × 4 preguntas = 36 filas (REGLA DE ORO)
const PPIE_SECCIONES = [
  ['VERIFICACIÓN SISTEMA DE PUESTA A TIERRA', 'Ubicación de caja equipotencial y caja de paso, según plano'],
  ['VERIFICACIÓN PUNTOS DE FUERZA', 'Correcta ubicación de puntos, según plano'],
  ['ALUMBRADO', 'Correcta ubicación de puntos, según plano'],
  ['TOMACORRIENTES', 'Correcta ubicación de puntos, según plano'],
  ['LUZ DE EMERGENCIA', 'Correcta ubicación de puntos, según plano'],
  ['SISTEMA DE ALARMA', 'Correcta ubicación de puntos, según plano (ACI / plano de intrusión)'],
  ['SISTEMA DE AIRE ACONDICIONADO', 'Correcta ubicación de puntos, según plano'],
  ['DATA', 'Correcta ubicación de puntos, según plano'],
  ['CIRCUITO CERRADO TV - CCTV', 'Correcta ubicación de puntos, según plano'],
];
const PPIE = clasico('PPIE', 'PROTOCOLO DE PUNTOS EN INSTALACIONES ELÉCTRICAS',
  PPIE_SECCIONES.map(([seccion, primera]) => ({
    seccion,
    items: [
      [primera, M.plano],
      ['Inspección visual: diámetro, recorrido de tubería, caja y altura', M.visual],
      ['Cantidad de puntos de salida', M.medicion],
      ['Limpieza de área de trabajo', M.visual],
    ],
  })),
);

const PRE = clasico('PRE', 'PROTOCOLO DE REDES ELÉCTRICAS', [
  {
    seccion: 'TRABAJOS EN TERRENO',
    items: [
      ['Ubicación de zanja', M.plano],
      ['Verificación de corte de zanja', M.medicion],
      ['Altura de cama de arena (según detalle)', M.medicion],
      ['Inspección visual de diámetro y recorrido de tubería', M.visual],
      ['Verificación de cantidad de tuberías', M.medicion],
      ['Separación entre tuberías según detalle', M.medicion],
      ['Señalización según detalle', M.visual],
      ['Limpieza de área de trabajo', M.visual],
    ],
  },
  {
    seccion: 'TRABAJOS EN BUZÓN',
    items: [
      ['Inspección visual de diámetro de tubería', M.visual],
      ['Verificación de cantidad de tuberías', M.medicion],
      ['Separación entre tuberías según detalle', M.medicion],
      ['Distancia mínima entre NPT y tubería', M.medicion],
      ['Verificación de sumidero (según detalle)', M.plano],
      ['Limpieza de área de trabajo', M.visual],
    ],
  },
  {
    seccion: 'REDES COLGADAS',
    items: [
      ['Trazo y replanteo', M.topo],
      ['Inspección visual de diámetro de tubería / bandeja', M.visual],
      ['Verificación de cantidad de tuberías / bandejas', M.medicion],
      ['Separación entre tuberías / bandeja según detalle', M.medicion],
      ['Distancia mínima entre NPT y tubería / bandeja', M.medicion],
      ['Limpieza de área de trabajo', M.visual],
    ],
  },
]);

// PDA — el original repite el bloque por Departamento (5 veces). Se generaliza a
// AMBIENTE 1..5: cada ambiente es una sección con las mismas 4 verificaciones.
const PDA = clasico('PDA', 'PROTOCOLO DE DETECCIÓN Y ALARMAS CONTRA INCENDIO',
  [1, 2, 3, 4, 5].map(n => ({
    seccion: `AMBIENTE ${n}`,
    items: [
      ['Ubicación correcta según detalles y plano (sensor de temperatura, detector de humo, luz estroboscópica, estación manual, sirena)', M.plano],
      ['Correcto funcionamiento de sirena al detectar el sensor de temperatura y activación de alarma contra incendios', M.func],
      ['Correcto funcionamiento de sirena al detectar el detector de humo y activación de alarma contra incendios', M.func],
      ['Reconocimiento y correspondencia del tablero de control detector del circuito de alarmas contra incendios', M.func],
    ],
  })),
);

// ─────────────────────────────────────────────────────────────────────────────
// FICHAS NUMÉRICAS
// ─────────────────────────────────────────────────────────────────────────────

/** PCC — Colocación de concreto: checklist previo/posterior + datos + tabla de batches. */
function buildPCC() {
  const id = 'PCC', nombre = 'PROTOCOLO DE COLOCACIÓN DE CONCRETO';
  const rows = [];
  let p = 1;
  const add = (act, met, sec) => rows.push({
    ID_Protocolo: id, Protocolo: nombre, PartidaItem: String(p++),
    'Actividad realizada': act, 'Método de validación': met, 'Sección': sec,
  });

  const S1 = 'INSPECCIÓN PREVIA AL VACIADO';
  const previa = [
    'Cumplimiento del procedimiento de trabajo',
    'Verificación topográfica',
    'Preparación y verificación de juntas',
    'Verificación acero de refuerzo',
    'Verificación encofrado',
    'Verificación instalaciones sanitarias',
    'Verificación instalaciones eléctricas',
    'Verificación instalaciones mecánicas',
    'Verificación anclajes de estructuras metálicas',
  ];
  for (const it of previa) add(it, 'list-[SI, NO, NA]', S1);

  const S2 = 'DATOS DE LA COLOCACIÓN';
  add('N° de batch', 'texto-[]', S2);
  add('Tipo de concreto', 'list-[HECHO EN OBRA, PREMEZCLADO]', S2);
  add("f'c de diseño (kg/cm²)", 'numerico-[100:700]:dec[0]', S2);
  add('Slump de diseño (pulg)', 'numerico-[1:10]:dec[1]', S2);
  add('Volumen total (m³)', 'numerico-[0:500]:dec[2]', S2);
  add('Tipo de colocación', 'list-[DIRECTO, CON BOMBA, OTROS]', S2);
  add('Tipo de acabado', 'list-[CARAVISTA, FROTACHADO, OTROS]', S2);

  const S3 = 'REGISTRO DE BATCHES';
  add('col-[A][Guía / Batch] // col-[B][Hora inicio] // col-[C][Hora fin] // col-[D][Slump (pulg)] // col-[E][Volumen (m³)] // col-[F][Código de testigos]', '', S3);
  for (let i = 1; i <= 6; i++) {
    add(`Batch ${i}`,
      'texto-[] // hora-[] // hora-[] // numerico-[1:10]:dec[1] // numerico-[0:100]:dec[2] // texto-[]',
      S3);
  }
  // Total de volumen colocado (suma de la columna E de los 6 batches)
  const primeraFilaBatch = p - 6;              // partida de "Batch 1"
  const ultimaFilaBatch = p - 1;               // partida de "Batch 6"
  add('Volumen total colocado (m³)',
    `numerico-fx[SUMA(#${primeraFilaBatch}E:#${ultimaFilaBatch}E)]:dec[2]`, S3);

  const S4 = 'INSPECCIÓN POSTERIOR AL VACIADO';
  const posterior = [
    'Acabado superficial de acuerdo a lo especificado',
    'Nivel y aplomo final del elemento de acuerdo a lo indicado en planos',
    'Correcta posición final de elementos embebidos',
    'Verificación del orden y limpieza',
    'Curado adecuado (agua / membrana / otros)',
  ];
  for (const it of posterior) add(it, 'list-[SI, NO, NA]', S4);

  return rows;
}

/** LIPMPP — Planchas metálicas y pernos: checklist + control de coordenadas con variaciones. */
function buildLIPMPP() {
  const id = 'LIPMPP', nombre = 'LIBERACIÓN DE INSTALACIÓN DE PLANCHAS METÁLICAS Y PERNOS PARA PEDESTAL';
  const rows = [];
  let p = 1;
  const add = (act, met, sec) => rows.push({
    ID_Protocolo: id, Protocolo: nombre, PartidaItem: String(p++),
    'Actividad realizada': act, 'Método de validación': met, 'Sección': sec,
  });

  const S1 = 'DATOS DEL ELEMENTO Y EQUIPO';
  add('Diámetro de pernos de anclaje', 'list-[3/8", 5/8", 3/4"]', S1);
  add('Equipo topográfico utilizado', 'texto-[]', S1);
  add('N° de serie del equipo', 'texto-[]', S1);
  add('Fecha de calibración del equipo', 'fecha-[]', S1);

  const S2 = 'CHECK LIST — INSTALACIÓN DE PLANCHAS Y PERNOS';
  const check = [
    'Base de planchas metálicas',
    'Pernos de anclaje (longitud y diámetro)',
    'Alineamiento de plancha metálica',
    'Nivelación de plancha metálica y pernos',
    'Alineamiento de plancha y pernos de anclaje',
  ];
  for (const it of check) add(it, 'list-[CONFORME, OBSERVADO, N/A]', S2);

  // Tolerancia ±2 cm. NOTA: el sufijo de rango `:[min:max]` NO admite números
  // negativos (el parser corta en el '-'), por eso el control va en una columna
  // de dictamen con ABS() en vez de un rango sobre la variación.
  const TOL = 0.02;
  const S3 = 'CONTROL DE COORDENADAS';
  add('col-[A][Eje / Elemento] // col-[B][Norte (plano)] // col-[C][Este (plano)] // col-[D][Z (plano)] // col-[E][Norte (campo)] // col-[F][Este (campo)] // col-[G][Z (campo)] // col-[H][Var. Norte (m)] // col-[I][Var. Este (m)] // col-[J][Var. Z (m)] // col-[K][Dentro de tolerancia (1=Sí)]',
    '', S3);
  for (let i = 1; i <= 5; i++) {
    const f = p;   // partida de esta fila de detalle
    add(`Detalle ${i}`,
      'texto-[] // ' +
      'numerico-[]:dec[3]:ej[8674250.000] // numerico-[]:dec[3]:ej[476320.000] // numerico-[]:dec[3]:ej[3260.000] // ' +
      'numerico-[]:dec[3]:ej[8674250.008] // numerico-[]:dec[3]:ej[476320.006] // numerico-[]:dec[3]:ej[3260.004] // ' +
      `numerico-fx[#${f}E-#${f}B]:dec[3] // ` +
      `numerico-fx[#${f}F-#${f}C]:dec[3] // ` +
      `numerico-fx[#${f}G-#${f}D]:dec[3] // ` +
      `numerico-fx[SI(Y(ABS(#${f}H)<=${TOL}, ABS(#${f}I)<=${TOL}, ABS(#${f}J)<=${TOL}), 1, 0)]:dec[0]`,
      S3);
  }
  return rows;
}

// ─────────────────────────────────────────────────────────────────────────────

const ALL = [
  ...CTTR, ...CTPT, ...buildLIPMPP(),
  ...PA, ...buildPCC(), ...PE, ...PAA, ...PIS, ...PIE,
  ...PPIS, ...PPIE, ...PRE, ...PDA,
];

// Validaciones antes de escribir
const porProto = new Map();
for (const r of ALL) {
  if (!porProto.has(r.ID_Protocolo)) porProto.set(r.ID_Protocolo, []);
  porProto.get(r.ID_Protocolo).push(r);
}
let errores = 0;
for (const [id, rows] of porProto) {
  const partidas = rows.map(r => Number(r.PartidaItem));
  const esperado = Array.from({ length: rows.length }, (_, i) => i + 1);
  if (JSON.stringify(partidas) !== JSON.stringify(esperado)) {
    console.error(`✗ ${id}: PartidaItem no es secuencial 1..${rows.length}`);
    errores++;
  }
  const nombres = new Set(rows.map(r => r.Protocolo));
  if (nombres.size !== 1) { console.error(`✗ ${id}: nombre inconsistente`); errores++; }
}
if (errores) { console.error(`\n${errores} error(es). No se escribe el archivo.`); process.exit(1); }

if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });
const ws = XLSX.utils.json_to_sheet(ALL, {
  header: ['ID_Protocolo', 'Protocolo', 'PartidaItem', 'Actividad realizada', 'Método de validación', 'Sección'],
});
ws['!cols'] = [{ wch: 12 }, { wch: 52 }, { wch: 11 }, { wch: 90 }, { wch: 38 }, { wch: 42 }];
const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, ws, 'Actividades');
XLSX.writeFile(wb, OUT_FILE);

console.log(`✓ ${OUT_FILE}`);
console.log(`  ${ALL.length} filas · ${porProto.size} protocolos\n`);
for (const [id, rows] of porProto) {
  const secs = [...new Set(rows.map(r => r['Sección']).filter(Boolean))];
  console.log(`  ${id.padEnd(7)} ${String(rows.length).padStart(3)} filas · ${secs.length || 1} secc. · ${rows[0].Protocolo}`);
}
