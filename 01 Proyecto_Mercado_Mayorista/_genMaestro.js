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
 * REDACCIÓN (v2, ago-2026) — regla permanente del servicio: NO se copian los
 * textos del cliente tal cual. Cada ítem se reescribe como PREGUNTA CERRADA
 * verificable en campo, en frase normal (nunca TODO EN MAYÚSCULAS), con el
 * criterio de aceptación explícito entre paréntesis cuando aporta. Los ítems
 * que en el original eran instrucciones ("Utiliza un rotomartillo…") pasan a
 * verificación del resultado ("¿La perforación se ejecutó con…?"), porque lo
 * que se firma es la CONFORMIDAD, no el instructivo.
 * Se conservan la cantidad y el orden de partidas del cliente: renumerar
 * rompería los ensayos ya creados.
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

// Preguntas que se repiten literalmente en varias secciones/protocolos.
// Centralizadas para que una mejora de redacción se propague a todas.
const Q = {
  limpieza: '¿El área de trabajo quedó limpia y ordenada?',
  seguridad: '¿El frente de trabajo cuenta con las protecciones de seguridad requeridas?',
  ubicPuntos: '¿Los puntos están ubicados según el plano?',
  cantSalidas: '¿La cantidad de puntos de salida coincide con el plano?',
  diamRecorrido: '¿El diámetro y el recorrido de la tubería corresponden al plano?',
  cantTuberias: '¿La cantidad de tuberías coincide con el plano?',
  sepTuberias: '¿La separación entre tuberías cumple el detalle?',
  soporte: '¿Las tuberías y accesorios están adecuadamente soportados y fijados?',
};

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
    ['¿Se ejecutó el trabajo conforme al procedimiento aprobado?', M.doc],
    ['¿Se contrastaron los planos de las especialidades y se resolvieron las interferencias? (arquitectura, estructuras e instalaciones)', M.plano],
    ['¿Se realizó la verificación topográfica? (trazo, alineamiento y niveles)', M.topo],
    ['¿Los diámetros del acero corresponden a los detalles del plano?', M.medicion],
    ['¿La distribución del acero cumple lo indicado? (cantidad y espaciamiento entre barras)', M.medicion],
    ['¿Los empalmes están ubicados donde corresponde? (traslapes según el RNE)', M.plano],
    ['¿El espaciamiento de estribos coincide con los detalles del plano?', M.medicion],
    ['¿Las armaduras están correctamente ancladas, fijadas y arriostradas? (mechas, anclajes y arriostres según planos)', M.plano],
    ['¿Las armaduras están limpias y sin defectos? (libres de óxido suelto, rebabas y deformaciones)', M.visual],
    [Q.seguridad + ' (líneas de vida, plataformas de acceso y barandas)', M.visual],
  ],
}]);

const PE = clasico('PE', 'PROTOCOLO DE ENCOFRADO', [{
  seccion: 'INSPECCIÓN',
  items: [
    ['¿Se ejecutó el trabajo conforme al procedimiento aprobado?', M.doc],
    ['¿El trazo y la ubicación del encofrado coinciden con el plano? (ejes, alineamiento, distancias y niveles)', M.topo],
    ['¿El encofrado está alineado, aplomado y sin deformaciones?', M.medicion],
    ['¿Se colocaron los dados y separadores laterales que garantizan el recubrimiento?', M.visual],
    ['¿El encofrado está montado, fijado y arriostrado de forma estable?', M.visual],
    ['¿Las dimensiones internas del encofrado corresponden a lo especificado?', M.medicion],
    ['¿Se aplicó desmoldante y el interior del encofrado quedó limpio?', M.visual],
    ['¿Están colocados los pases y tubos de instalaciones sanitarias según plano?', M.plano],
    ['¿Están colocados los pases y tubos de instalaciones eléctricas según plano?', M.plano],
    ['¿Se colocaron los soportes y anclajes para los pases e instalaciones varias?', M.plano],
    [Q.seguridad, M.visual],
  ],
}]);

// ⚠ Código propio (PAA): en el Excel original compartía PE-VRS-2026-004 con Encofrado.
// El original venía redactado como instructivo (imperativo); aquí se verifica el RESULTADO.
const PAA = clasico('PAA', 'PROTOCOLO DE PERFORACIÓN Y ANCLAJE DE ACERO', [{
  seccion: 'INSPECCIÓN',
  items: [
    ['¿La varilla quedó alineada y centrada en su posición definitiva?', M.topo],
    ['¿Se respetó el recubrimiento mínimo de 2 cm respecto al borde del concreto?', M.medicion],
    ['¿La perforación se ejecutó con rotomartillo y broca de carburo para concreto?', M.visual],
    ['¿El diámetro de la perforación es mayor que el de la varilla, según la ficha técnica del anclaje?', M.medicion],
    ['¿La perforación alcanza al menos 200 mm de profundidad en el concreto estructural?', M.medicion],
    ['¿Se limpió la perforación con aire comprimido y escobilla antes de inyectar?', M.visual],
    ['¿El adhesivo se inyectó desde el fondo hasta dos tercios del volumen de la perforación?', M.visual],
    ['¿La varilla se insertó girando hasta el fondo, cubriendo todo el corrugado con resina?', M.visual],
    ['¿Se respetó el tiempo de curado según la temperatura ambiente? (20 °C: 24 h · 10 °C: 48 h · menos de 5 °C: 72 h)', M.doc],
    [Q.seguridad, M.visual],
  ],
}]);

const PIS = clasico('PIS', 'PROTOCOLO DE TUBERÍA (INSTALACIONES SANITARIAS)', [{
  seccion: 'DESCRIPCIÓN DE ACTIVIDADES',
  items: [
    ['¿Las tuberías y accesorios se instalaron según el plano?', M.plano],
    ['¿El material instalado corresponde al especificado? (PVC)', M.visual],
    ['¿El diámetro de la tubería corresponde al indicado en el plano?', M.medicion],
    ['¿El material está libre de defectos? (fisuras, deformaciones o golpes)', M.visual],
    [Q.soporte, M.visual],
    ['¿Los terminales expuestos de tubería y las cajas de paso quedaron taponeados?', M.visual],
  ],
}]);

const PIE = clasico('PIE', 'PROTOCOLO DE INSTALACIONES ELÉCTRICAS', [{
  seccion: 'DESCRIPCIÓN DE ACTIVIDADES',
  items: [
    [Q.ubicPuntos, M.plano],
    ['¿Las tuberías están libres de aplastamientos, roturas o dobleces que reduzcan su diámetro interior?', M.visual],
    ['¿Los accesorios son del mismo material y clase que la tubería? (uniones, conectores y curvas en PVC)', M.visual],
    ['¿Las cajas se colocaron según el trazo topográfico? (octogonales, rectangulares y de paso)', M.topo],
    [Q.soporte, M.visual],
    [Q.limpieza, M.visual],
    ['¿El diámetro de la tubería corresponde al indicado en el plano?', M.medicion],
    ['¿Las tuberías y accesorios están en buen estado?', M.visual],
  ],
}]);

// ─────────────────────────────────────────────────────────────────────────────
// GRUPO B — Topográficos
// ─────────────────────────────────────────────────────────────────────────────

const CTTR = clasico('CTTR', 'CONTROL TOPOGRÁFICO TRAZO Y REPLANTEO', [
  {
    seccion: 'TRAZO INICIAL',
    items: [
      ['¿El trazo lo ejecutó un topógrafo calificado?', M.doc],
      ['¿El terreno fue liberado y entregado para iniciar el trazo?', M.doc],
      ['¿Se verificaron el alineamiento, las medidas y la escuadra del trazo?', M.topo],
      ['¿El trazo coincide con el plano base, sin modificaciones? (de haberlas, detallarlas en observaciones)', M.plano],
    ],
  },
  {
    seccion: 'TRAZO REPLANTEADO',
    items: [
      ['¿Las dimensiones replanteadas de la estructura coinciden con el plano?', M.topo],
      ['¿Se materializaron en campo los vértices de la estructura?', M.topo],
      ['¿El trazo final de la estructura quedó marcado y verificado?', M.topo],
      ['¿El equipo topográfico cuenta con certificado de calibración vigente?', M.doc],
    ],
  },
]);

const CTPT = clasico('CTPT', 'CONTROL TOPOGRÁFICO LEVANTAMIENTO DEL TERRENO', [
  {
    seccion: 'TRAZO INICIAL',
    items: [
      ['¿El levantamiento lo ejecutó un topógrafo calificado?', M.doc],
      ['¿El terreno fue liberado y entregado para iniciar el levantamiento?', M.doc],
      ['¿Se verificaron el alineamiento, las medidas y la escuadra del levantamiento?', M.topo],
      ['¿El levantamiento coincide con el plano base, sin modificaciones? (de haberlas, detallarlas en observaciones)', M.plano],
    ],
  },
  {
    seccion: 'TRAZO REPLANTEADO',
    items: [
      ['¿Las dimensiones levantadas de la estructura coinciden con el plano?', M.topo],
      ['¿Se materializaron en campo los vértices de la estructura?', M.topo],
      ['¿El trazo final de la estructura quedó marcado y verificado?', M.topo],
      ['¿Los espacios levantados quedaron señalizados en campo?', M.visual],
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
      ['¿La red instalada corresponde al tipo previsto? (agua fría o agua caliente)', M.plano],
      ['¿El material de la red corresponde al especificado? (PVC, PPR o acero)', M.visual],
      ['¿Los puntos de agua están ubicados según el plano?', M.plano],
      [Q.cantSalidas, M.medicion],
      [Q.diamRecorrido, M.visual],
      ['¿El tipo de salida corresponde al aparato previsto? (ovalín, inodoro u otro)', M.visual],
      ['¿Se instaló la válvula de paso donde indica el plano?', M.visual],
      [Q.limpieza, M.visual],
    ],
  },
  {
    seccion: 'VERIFICACIÓN PUNTOS DE DESAGÜE',
    items: [
      ['¿Los puntos de desagüe están ubicados según el plano?', M.plano],
      ['¿El material de la red corresponde al especificado? (PVC o PPR)', M.visual],
      [Q.cantSalidas, M.medicion],
      [Q.diamRecorrido, M.visual],
      ['¿El tipo de salida corresponde al aparato previsto? (ovalín, inodoro u otro)', M.visual],
      ['¿Se instalaron los puntos de urinario, registro y sumidero previstos?', M.visual],
      [Q.limpieza, M.visual],
    ],
  },
  {
    seccion: 'VERIFICACIÓN PUNTOS DE VENTILACIÓN',
    items: [
      ['¿Los puntos de ventilación están ubicados según el plano?', M.plano],
      ['¿El material de la red corresponde al especificado? (PVC o PPR)', M.visual],
      [Q.cantSalidas, M.medicion],
      [Q.diamRecorrido, M.visual],
      [Q.limpieza, M.visual],
    ],
  },
]);

// PPIE — 9 secciones × 4 preguntas = 36 filas (REGLA DE ORO)
const PPIE_SECCIONES = [
  ['VERIFICACIÓN SISTEMA DE PUESTA A TIERRA', '¿La caja equipotencial y las cajas de paso están ubicadas según el plano?'],
  ['VERIFICACIÓN PUNTOS DE FUERZA', Q.ubicPuntos],
  ['ALUMBRADO', Q.ubicPuntos],
  ['TOMACORRIENTES', Q.ubicPuntos],
  ['LUZ DE EMERGENCIA', Q.ubicPuntos],
  ['SISTEMA DE ALARMA', '¿Los puntos están ubicados según el plano? (ACI y plano de intrusión)'],
  ['SISTEMA DE AIRE ACONDICIONADO', Q.ubicPuntos],
  ['DATA', Q.ubicPuntos],
  ['CIRCUITO CERRADO TV - CCTV', Q.ubicPuntos],
];
const PPIE = clasico('PPIE', 'PROTOCOLO DE PUNTOS EN INSTALACIONES ELÉCTRICAS',
  PPIE_SECCIONES.map(([seccion, primera]) => ({
    seccion,
    items: [
      [primera, M.plano],
      ['¿El diámetro, el recorrido de la tubería, la caja y la altura corresponden al plano?', M.visual],
      [Q.cantSalidas, M.medicion],
      [Q.limpieza, M.visual],
    ],
  })),
);

const PRE = clasico('PRE', 'PROTOCOLO DE REDES ELÉCTRICAS', [
  {
    seccion: 'TRABAJOS EN TERRENO',
    items: [
      ['¿La zanja está ubicada según el plano?', M.plano],
      ['¿Las dimensiones de corte de la zanja cumplen el detalle? (ancho y profundidad)', M.medicion],
      ['¿La cama de arena tiene la altura indicada en el detalle?', M.medicion],
      [Q.diamRecorrido, M.visual],
      [Q.cantTuberias, M.medicion],
      [Q.sepTuberias, M.medicion],
      ['¿Se colocó la señalización de la red según el detalle? (cinta o malla de advertencia)', M.visual],
      [Q.limpieza, M.visual],
    ],
  },
  {
    seccion: 'TRABAJOS EN BUZÓN',
    items: [
      ['¿El diámetro de la tubería que llega al buzón corresponde al plano?', M.visual],
      [Q.cantTuberias, M.medicion],
      [Q.sepTuberias, M.medicion],
      ['¿Se respeta la distancia mínima entre el NPT y la tubería?', M.medicion],
      ['¿El sumidero del buzón se ejecutó según el detalle?', M.plano],
      [Q.limpieza, M.visual],
    ],
  },
  {
    seccion: 'REDES COLGADAS',
    items: [
      ['¿El trazo y replanteo de la red colgada fue verificado?', M.topo],
      ['¿El diámetro de la tubería o bandeja corresponde al plano?', M.visual],
      ['¿La cantidad de tuberías o bandejas coincide con el plano?', M.medicion],
      ['¿La separación entre tuberías o bandejas cumple el detalle?', M.medicion],
      ['¿Se respeta la distancia mínima entre el NPT y la tubería o bandeja?', M.medicion],
      [Q.limpieza, M.visual],
    ],
  },
]);

// PDA — el original repite el bloque por Departamento (5 veces). Se generaliza a
// AMBIENTE 1..5: cada ambiente es una sección con las mismas 4 verificaciones.
const PDA = clasico('PDA', 'PROTOCOLO DE DETECCIÓN Y ALARMAS CONTRA INCENDIO',
  [1, 2, 3, 4, 5].map(n => ({
    seccion: `AMBIENTE ${n}`,
    items: [
      ['¿Los dispositivos están ubicados según el plano? (sensor de temperatura, detector de humo, luz estroboscópica, estación manual y sirena)', M.plano],
      ['¿La sirena se activa al operar el sensor de temperatura?', M.func],
      ['¿La sirena se activa al operar el detector de humo?', M.func],
      ['¿El tablero de control reconoce e identifica correctamente el circuito de alarma?', M.func],
    ],
  })),
);

// ─────────────────────────────────────────────────────────────────────────────
// FICHAS NUMÉRICAS
//   En las numéricas el "Método de validación" es el DSL de celdas: NO se toca.
//   Los ítems de captura de datos siguen siendo etiquetas de campo (sustantivos),
//   porque no se responden con SÍ/NO — solo los checklist son preguntas.
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
    '¿Se ejecutó el trabajo conforme al procedimiento aprobado?',
    '¿Se verificaron los niveles y el alineamiento antes del vaciado?',
    '¿Las juntas fueron preparadas y verificadas?',
    '¿El acero de refuerzo fue liberado?',
    '¿El encofrado fue liberado?',
    '¿Las instalaciones sanitarias embebidas fueron verificadas?',
    '¿Las instalaciones eléctricas embebidas fueron verificadas?',
    '¿Las instalaciones mecánicas embebidas fueron verificadas?',
    '¿Los anclajes para estructuras metálicas fueron verificados?',
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
    '¿El acabado superficial corresponde a lo especificado?',
    '¿El nivel y el aplomo final del elemento cumplen lo indicado en planos?',
    '¿Los elementos embebidos quedaron en su posición final correcta?',
    '¿El área quedó ordenada y limpia tras el vaciado?',
    '¿Se aplicó el curado especificado? (agua, membrana u otro)',
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
    '¿La base de la plancha metálica está correctamente ejecutada?',
    '¿Los pernos de anclaje tienen la longitud y el diámetro especificados?',
    '¿La plancha metálica está alineada según el plano?',
    '¿La plancha metálica y los pernos están nivelados?',
    '¿La plancha y los pernos de anclaje guardan el alineamiento entre sí?',
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
  // Guardas de redacción v2: ningún texto puede volver a quedar TODO EN MAYÚSCULAS.
  // Se exceptúan las numéricas, cuyos ítems de captura son etiquetas de campo.
  for (const r of rows) {
    const t = r['Actividad realizada'];
    if (/[A-ZÁÉÍÓÚÑ]{6,}/.test(t) && !/^col-\[/.test(t) && t === t.toUpperCase()) {
      console.error(`✗ ${id} #${r.PartidaItem}: texto en MAYÚSCULAS → "${t}"`);
      errores++;
    }
  }
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

// Export para el generador de UPDATEs (_genUpdateTextos.js). Al requerirlo desde
// otro script se ejecuta también la escritura del Excel, que es idempotente.
module.exports = { ALL };
