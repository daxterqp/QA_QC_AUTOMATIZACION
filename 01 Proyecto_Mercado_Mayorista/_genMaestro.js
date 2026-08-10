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
 *
 * ─── EVALUACIÓN REAL (v3, ago-2026) ─────────────────────────────────────────
 * Un protocolo solo aporta si sirve para ADVERTIR que algo va mal. Una pregunta
 * que siempre se responde SÍ no evalúa nada: es papeleo. Por eso:
 *
 *  1. CRITERIO CUANTIFICADO. "¿Está según plano?" no se puede reprobar; "¿la
 *     desviación está dentro de ±2 cm?" sí. Donde hay norma peruana aplicable
 *     se cita (RNE E.060, NTP 339.033/339.035, RNE IS.010, CNE). Donde el valor
 *     depende del proyecto se dice "según especificación técnica" en vez de
 *     inventar un número.
 *  2. MÉTODO Y MUESTRA. "verificado con calibrador en al menos 3 barras por
 *     lecho" convierte un vistazo en una medición repetible.
 *  3. MODO DE FALLA REAL. Se pregunta por lo que de verdad falla en obra
 *     (traslape en zona de confinamiento, desmoldante sobre el acero, fuga de
 *     lechada, ducto sin pasahilos), no por lo obvio.
 *  4. LO QUE FALTABA. Se añaden los controles sin los cuales no hay control de
 *     calidad: certificado de colada del acero, probetas por volumen vaciado,
 *     prueba hidráulica de sanitarias, continuidad de ductos eléctricos.
 *
 * Consecuencia: los protocolos cambian de CANTIDAD de partidas respecto al
 * original del cliente. Es seguro porque se hizo con el proyecto sin ensayos;
 * NO repetir sobre un proyecto con ensayos creados sin releer §7bis de
 * docs/FLUJO_EDICION_FICHAS.md.
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
  limpieza: '¿El área quedó libre de residuos, recortes y material sobrante que puedan obstruir el trabajo posterior?',
  ubicPuntos: '¿Los puntos están en la ubicación del plano, con desviación menor a 2 cm respecto al eje de referencia?',
  cantSalidas: '¿La cantidad de puntos de salida es EXACTAMENTE la del plano? (un punto de menos obliga a picar después)',
  diamRecorrido: '¿El diámetro y el recorrido de la tubería corresponden al plano, sin reducciones ni desvíos no autorizados?',
  cantTuberias: '¿La cantidad de tuberías es exactamente la del plano, contadas una a una en el tramo?',
  // "Cumple el detalle" sin decir CÓMO se comprueba vuelve a ser un vistazo: el
  // valor lo pone el proyecto, pero el método de medición lo ponemos nosotros.
  sepTuberias: '¿La separación entre tuberías cumple el detalle, medida en al menos 3 puntos del tramo?',
  soporte: '¿Los soportes están al espaciamiento especificado y sujetan la tubería sin deformarla ni impedir su dilatación?',
  // Los ductos sin guía ni tapa son el defecto que obliga a picar losa terminada:
  // se pregunta explícitamente porque es caro y se detecta tarde.
  pasahilos: '¿Los ductos quedaron con alambre guía y los extremos tapados, y se verificó que pasa la guía entre cajas?',
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

// PA — El acero es el elemento que MÁS caro sale corregir después del vaciado:
// una vez cubierto por concreto, un recubrimiento insuficiente o un traslape mal
// ubicado ya no se ve y compromete la estructura por décadas. Por eso las
// preguntas exigen medición y no vistazo.
const PA = clasico('PA', 'PROTOCOLO DE ACERO', [{
  seccion: 'INSPECCIÓN',
  items: [
    // El certificado de colada es la ÚNICA prueba de que el acero es el grado
    // especificado. Sin él, todo lo demás se verifica sobre material sin respaldo.
    ['¿El acero cuenta con certificado de calidad del lote y corresponde al grado especificado? (grado y diámetro trazables a la colada)', M.doc],
    ['¿El procedimiento de habilitación y colocación vigente está disponible en el frente y el personal fue instruido en él?', M.doc],
    ['¿Se contrastaron los planos de las tres especialidades y NO quedan interferencias sin resolver? (listarlas en observaciones)', M.plano],
    ['¿Los ejes y niveles del elemento fueron verificados topográficamente, con desviación dentro de ±10 mm respecto al plano?', M.topo],
    ['¿Los diámetros de las barras coinciden con el plano, verificados por marca de laminado o calibrador en al menos 3 barras por lecho?', M.medicion],
    ['¿La cantidad de barras es EXACTAMENTE la del plano y el espaciamiento no se desvía más de ±2 cm?', M.medicion],
    // El traslape mal ubicado es el defecto estructural clásico: cumple la
    // longitud pero está en la zona donde el elemento trabaja al máximo.
    ['¿Los traslapes cumplen la longitud indicada en el plano?', M.medicion],
    ['¿NINGÚN traslape cae en zona de confinamiento ni donde el plano lo prohíbe? (RNE E.060 — cumplir la longitud no basta si está en la zona de máximo esfuerzo)', M.plano],
    ['¿El espaciamiento de estribos cumple ±2 cm y la longitud de la zona de confinamiento coincide con el detalle? (RNE E.060)', M.medicion],
    // El recubrimiento es el defecto más frecuente y el que provoca corrosión a
    // los pocos años: se verifica que los dados existan Y que no cedan al vaciar.
    ['¿El recubrimiento está garantizado con dados o separadores del espesor especificado, en cantidad suficiente para que la armadura no ceda durante el vaciado?', M.medicion],
    ['¿Las armaduras están ancladas, fijadas y arriostradas de modo que no se desplacen durante el vaciado y el vibrado?', M.visual],
    // El criterio real no es "limpieza" estética sino ADHERENCIA acero-concreto.
    ['¿Las barras están libres de óxido no adherente, grasa, aceite, pintura o lechada que reduzcan la adherencia con el concreto?', M.visual],
    ['¿El frente cuenta con las protecciones colectivas requeridas y las esperas verticales están tapadas? (líneas de vida, plataformas, barandas y tapas antiempalamiento)', M.visual],
  ],
}]);

// PE — El encofrado define la geometría final y sostiene el peso del concreto
// fresco. Sus dos fallas graves son el colapso del apuntalamiento (seguridad) y
// la fuga de lechada (cangrejeras); ambas se preguntan explícitamente.
const PE = clasico('PE', 'PROTOCOLO DE ENCOFRADO', [{
  seccion: 'INSPECCIÓN',
  items: [
    ['¿El diseño del encofrado y del apuntalamiento está aprobado y disponible en el frente, para las cargas de este elemento?', M.doc],
    ['¿El trazo y los niveles del encofrado fueron verificados topográficamente, con desviación dentro de ±10 mm?', M.topo],
    ['¿El desplome del encofrado es menor a 6 mm por cada 3 m de altura y no hay paneles alabeados ni deformados?', M.medicion],
    ['¿Las dimensiones internas están dentro de la tolerancia de la sección? (+12 mm / −6 mm respecto al plano)', M.medicion],
    // Sin apoyo firme el puntal se hunde durante el vaciado y el elemento pierde
    // nivel cuando ya no se puede corregir.
    ['¿El apuntalamiento está completo, arriostrado y apoyado sobre superficie firme y nivelada, capaz de resistir el concreto fresco sin asentarse?', M.visual],
    // Fuga de lechada = cangrejeras = reparación estructural. Es el defecto de
    // acabado más común y se origina aquí, no en el vaciado.
    ['¿Las juntas y encuentros del encofrado están sellados de modo que no se fugue lechada durante el vaciado?', M.visual],
    // Distinto del dado de armadura que revisa el protocolo de acero: aquí se
    // comprueba el separador LATERAL contra la cara del encofrado, que es el que
    // define el recubrimiento de costado.
    ['¿Los separadores laterales mantienen la armadura a la distancia correcta de la cara del encofrado en toda la altura?', M.medicion],
    ['¿El interior del encofrado está libre de recortes, alambres, aserrín y agua empozada?', M.visual],
    // Se separa del anterior a propósito: el desmoldante sobre el acero anula la
    // adherencia y es un fallo grave e invisible tras el vaciado, mientras que un
    // resto de aserrín es un defecto menor. Fundirlos en un solo SÍ/NO ocultaría
    // cuál de los dos ocurrió.
    ['¿El desmoldante se aplicó ANTES de montar la armadura, o sin contaminarla? (el desmoldante sobre las barras anula la adherencia con el concreto)', M.visual],
    ['¿Los pases y tubos de instalaciones sanitarias están según plano y fijados para no desplazarse durante el vaciado?', M.plano],
    ['¿Los pases y tubos de instalaciones eléctricas están según plano y fijados para no desplazarse durante el vaciado?', M.plano],
    ['¿Los soportes y anclajes para instalaciones y estructuras metálicas están en su posición final y asegurados?', M.plano],
    ['¿Está definido el plazo mínimo de desencofrado para este elemento y comunicado al personal? (evita el desencofrado prematuro)', M.doc],
    ['¿El frente cuenta con accesos seguros, barandas y protección de bordes, y la zona bajo el encofrado está señalizada?', M.visual],
  ],
}]);

// ⚠ Código propio (PAA): en el Excel original compartía PE-VRS-2026-004 con Encofrado.
// El original venía redactado como instructivo (imperativo); aquí se verifica el RESULTADO.
// PAA — Un anclaje químico mal ejecutado se ve idéntico a uno bueno: la falla
// solo aparece cuando se carga. La limpieza de la perforación es la causa nº 1
// de pérdida de capacidad, y no deja rastro. Por eso se pregunta por cada paso
// que condiciona la adherencia, y se añade el ensayo de arranque.
const PAA = clasico('PAA', 'PROTOCOLO DE PERFORACIÓN Y ANCLAJE DE ACERO', [{
  seccion: 'INSPECCIÓN',
  items: [
    ['¿El adhesivo está vigente (dentro de su fecha de caducidad) y se conservó según su ficha técnica?', M.doc],
    ['¿Se verificó con detector que la perforación NO corta armadura existente? (marcar los desvíos en observaciones)', M.func],
    ['¿La varilla quedó alineada y centrada en su posición definitiva?', M.topo],
    ['¿Se respetó el recubrimiento mínimo de 2 cm respecto al borde del concreto?', M.medicion],
    ['¿La perforación se ejecutó con rotomartillo y broca de carburo para concreto?', M.visual],
    ['¿El diámetro de la perforación es el que indica la ficha técnica del anclaje para esa varilla?', M.medicion],
    ['¿La perforación alcanza al menos 200 mm de profundidad en el concreto estructural, medida con sonda?', M.medicion],
    // Causa nº 1 de falla y totalmente invisible una vez inyectado el adhesivo.
    ['¿Se limpió la perforación con el ciclo completo (soplar, escobillar, soplar) hasta que sale sin polvo?', M.visual],
    ['¿El adhesivo se inyectó desde el fondo hacia afuera, sin dejar burbujas ni vacíos?', M.visual],
    ['¿La varilla se insertó girando hasta el fondo y rebosó adhesivo, señal de que el corrugado quedó cubierto?', M.visual],
    ['¿Se respetó el tiempo de curado según la temperatura ambiente MEDIDA? (20 °C: 24 h · 10 °C: 48 h · menos de 5 °C: 72 h)', M.medicion],
    ['¿Los anclajes se mantuvieron sin carga ni vibración durante todo el curado?', M.visual],
    // Es el único control que demuestra capacidad real; sin él, el protocolo
    // solo certifica que el procedimiento "se siguió".
    ['¿Se ejecutó el ensayo de arranque en la proporción especificada y todos alcanzaron la carga de prueba? (registrar valores en observaciones)', M.func],
    ['¿El frente de trabajo cuenta con las protecciones de seguridad requeridas y extracción de polvo?', M.visual],
  ],
}]);

// PIS — Una red sanitaria solo se puede dar por buena con DOS medidas: la
// pendiente (si no, no evacúa) y la prueba de estanqueidad (si no, filtra dentro
// de la losa). El protocolo original no pedía ninguna de las dos.
const PIS = clasico('PIS', 'PROTOCOLO DE TUBERÍA (INSTALACIONES SANITARIAS)', [{
  seccion: 'DESCRIPCIÓN DE ACTIVIDADES',
  items: [
    ['¿Las tuberías y accesorios siguen el trazo del plano y los diámetros coinciden, verificados tramo por tramo?', M.plano],
    ['¿El material y la clase corresponden a lo especificado, con marcado de fabricante y clase legible en la tubería?', M.doc],
    ['¿El material está libre de fisuras, deformaciones por calor o golpes que comprometan la estanqueidad?', M.visual],
    // Sin pendiente la red no evacúa: es el defecto que se descubre recién
    // cuando el edificio está en uso y ya no hay forma de corregirlo.
    ['¿La pendiente de los tramos de desagüe cumple el mínimo especificado (≥ 1 %), verificada con nivel en cada tramo?', M.medicion],
    ['¿Las uniones se ejecutaron con la técnica y el pegamento especificados, respetando el tiempo de fraguado antes de probar?', M.visual],
    // LA prueba de calidad de una red sanitaria. Sin ella, el protocolo no
    // evalúa nada: solo declara que las tuberías "se ven bien".
    ['¿Se ejecutó la prueba de estanqueidad del tramo y se mantuvo SIN pérdida durante el tiempo especificado? (registrar resultado en observaciones)', M.func],
    [Q.soporte, M.visual],
    ['¿Los terminales expuestos y las cajas de paso quedaron taponeados para impedir el ingreso de concreto o residuos?', M.visual],
  ],
}]);

// PIE — Lo que hace inservible un ducto eléctrico embebido no es que "se vea
// mal", sino que no pase el cable: dobleces cerrados, aplastamientos o falta de
// guía. Todo eso se descubre al cablear, con la losa ya vaciada.
const PIE = clasico('PIE', 'PROTOCOLO DE INSTALACIONES ELÉCTRICAS', [{
  seccion: 'DESCRIPCIÓN DE ACTIVIDADES',
  items: [
    [Q.ubicPuntos, M.plano],
    ['¿El diámetro de la tubería corresponde al plano y el material y clase son los especificados?', M.medicion],
    ['¿Las tuberías están libres de aplastamientos y roturas, y los radios de curvatura son mayores a 6 veces el diámetro? (curvas cerradas impiden el cableado)', M.medicion],
    ['¿Los accesorios son del mismo material y clase que la tubería, con marcado legible? (uniones, conectores y curvas)', M.visual],
    ['¿Las cajas están en el trazo y a la altura especificada, con desviación menor a ±2 cm? (octogonales, rectangulares y de paso)', M.topo],
    [Q.soporte, M.visual],
    // Se comprueba ANTES de vaciar, que es la única oportunidad de corregir.
    [Q.pasahilos, M.func],
    ['¿Las tuberías y accesorios están en buen estado, sin tramos expuestos a golpes durante el vaciado?', M.visual],
    [Q.limpieza, M.visual],
  ],
}]);

// ─────────────────────────────────────────────────────────────────────────────
// GRUPO B — Topográficos
// ─────────────────────────────────────────────────────────────────────────────

// CTTR — El trazo es el origen del error acumulado: si arranca desviado, todo lo
// que se construya encima hereda la desviación y nadie la detecta hasta que dos
// elementos no encajan. Por eso se exige tolerancia y equipo calibrado.
const CTTR = clasico('CTTR', 'CONTROL TOPOGRÁFICO TRAZO Y REPLANTEO', [
  {
    seccion: 'TRAZO INICIAL',
    items: [
      ['¿El trazo lo ejecutó un topógrafo calificado, con habilitación vigente?', M.doc],
      // Sin certificado vigente, todas las medidas del protocolo quedan sin
      // respaldo: es el primer control, no el último.
      ['¿El equipo topográfico cuenta con certificado de calibración VIGENTE a la fecha del trabajo?', M.doc],
      ['¿Se partió de puntos de control (BM y ejes) verificados y no alterados desde el último uso?', M.topo],
      ['¿El terreno fue liberado y entregado, libre de obstrucciones que impidan el trazo?', M.doc],
      ['¿El alineamiento, las medidas y la escuadra cierran dentro de la tolerancia especificada? (registrar el error de cierre en observaciones)', M.topo],
      ['¿El trazo coincide con el plano base, sin modificaciones? (de haberlas, detallarlas en observaciones)', M.plano],
    ],
  },
  {
    seccion: 'TRAZO REPLANTEADO',
    items: [
      ['¿Las dimensiones replanteadas coinciden con el plano, con desviación dentro de ±10 mm?', M.topo],
      ['¿Se materializaron en campo TODOS los vértices de la estructura, con marca estable y protegida?', M.topo],
      ['¿Los niveles replanteados están dentro de ±10 mm respecto a la cota de proyecto?', M.topo],
      ['¿El trazo final quedó marcado, verificado y con referencias que permitan reponerlo si se borra?', M.topo],
    ],
  },
]);

// CTPT — El levantamiento define el estado REAL del terreno contra el que se
// medirán los metrados y las diferencias con el proyecto. Un levantamiento sin
// densidad suficiente de puntos oculta desniveles que aparecen luego como
// sobrecosto de movimiento de tierras.
const CTPT = clasico('CTPT', 'CONTROL TOPOGRÁFICO LEVANTAMIENTO DEL TERRENO', [
  {
    seccion: 'TRAZO INICIAL',
    items: [
      ['¿El levantamiento lo ejecutó un topógrafo calificado, con habilitación vigente?', M.doc],
      ['¿El equipo topográfico cuenta con certificado de calibración VIGENTE a la fecha del trabajo?', M.doc],
      ['¿Se partió de puntos de control (BM y ejes) verificados y no alterados desde el último uso?', M.topo],
      ['¿El terreno fue liberado y entregado, libre de obstrucciones que impidan el levantamiento?', M.doc],
      ['¿La densidad de puntos permite representar los quiebres reales del terreno, sin zonas interpoladas de más? (indicar zonas de baja densidad en observaciones)', M.topo],
      ['¿El cierre del levantamiento está dentro de la tolerancia especificada? (registrar el error en observaciones)', M.topo],
    ],
  },
  {
    seccion: 'TRAZO REPLANTEADO',
    items: [
      ['¿Las dimensiones levantadas coinciden con el plano, con desviación dentro de ±10 mm?', M.topo],
      ['¿Las diferencias entre el terreno levantado y el plano de proyecto están identificadas y cuantificadas? (afectan metrados y movimiento de tierras)', M.plano],
      ['¿Se materializaron en campo los vértices, con marca estable y protegida?', M.topo],
      ['¿Los espacios levantados quedaron señalizados en campo y con referencias reponibles?', M.visual],
    ],
  },
]);

// ─────────────────────────────────────────────────────────────────────────────
// GRUPO C — Protocolos MEP (formato SOLARA/GRV5, adoptados para esta obra)
//   Traen el MISMO set de preguntas repetido por sistema → todas las secciones.
// ─────────────────────────────────────────────────────────────────────────────

// PPIS — Los puntos definen dónde irá cada aparato sanitario: un punto a la
// altura equivocada obliga a picar tabique terminado. Se exige altura medida,
// no "ubicación correcta".
const PPIS = clasico('PPIS', 'PROTOCOLO DE COLOCACIÓN DE PUNTOS DE INSTALACIONES SANITARIAS', [
  {
    seccion: 'VERIFICACIÓN PUNTOS DE AGUA',
    items: [
      ['¿La red instalada corresponde al tipo previsto y está diferenciada en obra? (agua fría / agua caliente)', M.plano],
      ['¿El material y la clase de la red son los especificados? (PVC, PPR o acero, con marcado legible)', M.doc],
      ['¿Los puntos de agua están en la ubicación y a la ALTURA del plano, con desviación menor a ±2 cm?', M.medicion],
      [Q.cantSalidas, M.medicion],
      [Q.diamRecorrido, M.medicion],
      ['¿El tipo y la separación entre salidas corresponden al aparato previsto, medida entre ejes? (ovalín, inodoro, urinario u otro)', M.medicion],
      ['¿Se instaló la válvula de paso donde indica el plano y queda accesible para mantenimiento?', M.visual],
      ['¿El tramo pasó la prueba de presión sin pérdida durante el tiempo especificado? (registrar valor en observaciones)', M.func],
      [Q.limpieza, M.visual],
    ],
  },
  {
    seccion: 'VERIFICACIÓN PUNTOS DE DESAGÜE',
    items: [
      ['¿Los puntos de desagüe están en la ubicación y a la ALTURA del plano, con desviación menor a ±2 cm?', M.medicion],
      ['¿El material y la clase de la red son los especificados? (PVC o PPR, con marcado legible)', M.doc],
      [Q.cantSalidas, M.medicion],
      [Q.diamRecorrido, M.medicion],
      ['¿La pendiente de los ramales cumple el mínimo especificado (≥ 1 %), verificada con nivel?', M.medicion],
      ['¿El tipo de salida corresponde al aparato previsto? (ovalín, inodoro u otro)', M.visual],
      ['¿Se instalaron los puntos de urinario, registro y sumidero previstos, y los registros quedan accesibles?', M.visual],
      ['¿El tramo pasó la prueba de estanqueidad sin pérdida durante el tiempo especificado?', M.func],
      [Q.limpieza, M.visual],
    ],
  },
  {
    seccion: 'VERIFICACIÓN PUNTOS DE VENTILACIÓN',
    items: [
      ['¿Los puntos de ventilación están en la ubicación y altura del plano, con desviación menor a ±2 cm?', M.medicion],
      ['¿El material y la clase de la red son los especificados? (PVC o PPR)', M.doc],
      [Q.cantSalidas, M.medicion],
      [Q.diamRecorrido, M.medicion],
      // Sin ventilación los sifones se desceban y el ambiente toma olor: es el
      // motivo por el que existe esta red y nadie lo verifica.
      ['¿La ventilación remata según el plano y el recorrido queda libre de obstrucciones o tramos ahogados?', M.visual],
      [Q.limpieza, M.visual],
    ],
  },
]);

// PPIE — 9 secciones × 4 preguntas = 36 filas (REGLA DE ORO)
const PPIE_SECCIONES = [
  // La resistencia del pozo NO se pide aquí: en esta etapa solo existen ductos y
  // cajas, el pozo se mide en otro momento y preguntarlo daría siempre "NA".
  ['VERIFICACIÓN SISTEMA DE PUESTA A TIERRA', '¿La caja equipotencial y las cajas de paso están ubicadas según el plano y quedan accesibles para su medición posterior?'],
  ['VERIFICACIÓN PUNTOS DE FUERZA', Q.ubicPuntos],
  ['ALUMBRADO', Q.ubicPuntos],
  ['TOMACORRIENTES', Q.ubicPuntos],
  ['LUZ DE EMERGENCIA', Q.ubicPuntos],
  ['SISTEMA DE ALARMA', '¿Los puntos están ubicados según el plano, con desviación menor a 2 cm? (ACI y plano de intrusión)'],
  ['SISTEMA DE AIRE ACONDICIONADO', Q.ubicPuntos],
  ['DATA', Q.ubicPuntos],
  ['CIRCUITO CERRADO TV - CCTV', Q.ubicPuntos],
];
// PPIE — 9 sistemas × 5 verificaciones. Se añade el pasahilos/continuidad a
// cada sistema: es la única comprobación que demuestra que el ducto SIRVE, y
// hacerla después del vaciado ya no sirve de nada.
const PPIE = clasico('PPIE', 'PROTOCOLO DE PUNTOS EN INSTALACIONES ELÉCTRICAS',
  PPIE_SECCIONES.map(([seccion, primera]) => ({
    seccion,
    items: [
      [primera, M.plano],
      ['¿El diámetro, el recorrido, la caja y la ALTURA corresponden al plano, con desviación menor a ±2 cm?', M.medicion],
      [Q.cantSalidas, M.medicion],
      [Q.pasahilos, M.func],
      [Q.limpieza, M.visual],
    ],
  })),
);

// PRE — Red enterrada: una vez tapada la zanja, cualquier error cuesta volver a
// excavar. La profundidad y la señalización no son detalles estéticos, son lo
// que evita que una retroexcavadora corte la red viva años después.
const PRE = clasico('PRE', 'PROTOCOLO DE REDES ELÉCTRICAS', [
  {
    seccion: 'TRABAJOS EN TERRENO',
    items: [
      ['¿La zanja está en el trazo del plano y libre de interferencias con otras redes? (registrar cruces en observaciones)', M.plano],
      ['¿El ancho y la PROFUNDIDAD de la zanja cumplen el detalle, medidos cada tramo? (la profundidad protege la red del tránsito superior)', M.medicion],
      ['¿La cama de arena tiene el espesor indicado y está libre de piedras que puedan dañar el ducto?', M.medicion],
      [Q.diamRecorrido, M.medicion],
      [Q.cantTuberias, M.medicion],
      [Q.sepTuberias, M.medicion],
      ['¿Se verificó que pasa la guía por cada ducto ANTES de tapar la zanja?', M.func],
      ['¿La cinta o malla de advertencia está a la altura del detalle sobre el ducto, medida antes de completar el relleno? (evita el corte accidental en excavaciones futuras)', M.medicion],
      ['¿El relleno y la compactación se ejecutaron por capas según especificación, sin dañar el ducto?', M.medicion],
      [Q.limpieza, M.visual],
    ],
  },
  {
    seccion: 'TRABAJOS EN BUZÓN',
    items: [
      ['¿El diámetro y la cantidad de tuberías que llegan al buzón corresponden al plano, contadas una a una?', M.medicion],
      [Q.sepTuberias, M.medicion],
      ['¿Se respeta la distancia mínima entre el NPT y la tubería, medida en el punto más desfavorable del tramo?', M.medicion],
      ['¿Las entradas al buzón quedaron selladas para impedir el ingreso de agua o tierra a los ductos?', M.visual],
      ['¿El sumidero del buzón drena sin empozar, verificado vertiendo agua?', M.func],
      ['¿La tapa instalada es de la clase especificada para el tránsito de esa zona y queda enrasada con el nivel de piso?', M.doc],
      [Q.limpieza, M.visual],
    ],
  },
  {
    seccion: 'REDES COLGADAS',
    items: [
      ['¿El trazo y replanteo de la red colgada fue verificado topográficamente, con desviación menor a ±2 cm?', M.topo],
      ['¿El diámetro y la cantidad de tuberías o bandejas corresponden al plano, contadas una a una?', M.medicion],
      ['¿La separación entre tuberías o bandejas cumple el detalle, medida en al menos 3 puntos?', M.medicion],
      ['¿Se respeta la distancia mínima entre el NPT y la tubería o bandeja, medida en el punto más desfavorable?', M.medicion],
      ['¿Los soportes están al espaciamiento especificado y anclados a elemento estructural, no a falso cielo ni a tabique?', M.medicion],
      ['¿Se verificó que pasa la guía por cada ducto antes de cerrar el falso cielo?', M.func],
      [Q.limpieza, M.visual],
    ],
  },
]);

// PDA — el original repite el bloque por Departamento (5 veces). Se generaliza a
// AMBIENTE 1..5: cada ambiente es una sección con las mismas 4 verificaciones.
// PDA — Es un sistema de vida: no basta con que "funcione", tiene que funcionar
// CUANDO haga falta y en el ambiente correcto. Se añaden la audibilidad (una
// sirena que no se oye no evacúa a nadie), la identificación en tablero (si el
// tablero no dice DÓNDE es la alarma, la respuesta llega tarde) y el respaldo de
// energía (los incendios suelen cortar la corriente).
const PDA = clasico('PDA', 'PROTOCOLO DE DETECCIÓN Y ALARMAS CONTRA INCENDIO',
  [1, 2, 3, 4, 5].map(n => ({
    seccion: `AMBIENTE ${n}`,
    items: [
      ['¿Los dispositivos están ubicados según el plano, respetando las distancias a muros y difusores de aire? (sensor de temperatura, detector de humo, luz estroboscópica, estación manual y sirena)', M.plano],
      ['¿La sirena se activa al operar el sensor de temperatura?', M.func],
      ['¿La sirena se activa al operar el detector de humo?', M.func],
      ['¿El tablero identifica la zona CORRECTA al activarse el dispositivo? (una alarma sin zona correcta retrasa la respuesta)', M.func],
      ['¿La alarma es audible y la luz estroboscópica visible desde todo el ambiente, incluso con las puertas cerradas?', M.func],
      ['¿El sistema siguió operando al simular corte de energía, con la autonomía de respaldo especificada?', M.func],
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

  // El vaciado es IRREVERSIBLE: es el único momento del proceso en que un error
  // no se corrige, se demuele. Por eso la inspección previa exige que cada
  // especialidad esté LIBERADA (protocolo aprobado), no solo "verificada", y se
  // añade el estado del equipo: una falla de vibrador a media losa deja
  // cangrejeras estructurales.
  const S1 = 'INSPECCIÓN PREVIA AL VACIADO';
  const previa = [
    '¿El procedimiento de vaciado está definido para este elemento, incluyendo qué hacer ante lluvia, falla de bomba o junta fría no prevista?',
    '¿Los niveles de vaciado están marcados en el elemento y verificados topográficamente?',
    '¿Las juntas de construcción están en la ubicación prevista, con la superficie rugosa, limpia y saturada pero sin agua libre?',
    '¿El acero de refuerzo está LIBERADO con su protocolo aprobado?',
    '¿El encofrado está LIBERADO con su protocolo aprobado?',
    '¿Las instalaciones sanitarias embebidas están liberadas, tapadas y aseguradas para que no se desplacen durante el vaciado?',
    '¿Las instalaciones eléctricas embebidas están liberadas, con guía y tapadas para que no se llenen de concreto?',
    '¿Las instalaciones mecánicas embebidas están liberadas y aseguradas?',
    '¿Los anclajes para estructuras metálicas están en posición, con plantilla y nivel verificados?',
    '¿El equipo de vaciado está operativo y se cuenta con vibrador de RESERVA en el frente? (una falla a media losa deja cangrejeras)',
    '¿Las condiciones de clima y temperatura permiten vaciar según especificación, y se previó el manejo si cambian?',
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

  // La tabla de batches es donde el protocolo deja de ser un checklist y pasa a
  // ser un REGISTRO con el que se puede auditar el vaciado después: slump fuera
  // de rango, temperatura alta o exceso de tiempo entre mezclado y colocación
  // explican una resistencia baja a los 28 días.
  const S3 = 'REGISTRO DE BATCHES';
  add('col-[A][Guía / Batch] // col-[B][Hora mezclado] // col-[C][Hora colocación] // col-[D][Slump (pulg)] // col-[E][Temp. (°C)] // col-[F][Volumen (m³)] // col-[G][Código de testigos]', '', S3);
  for (let i = 1; i <= 6; i++) {
    add(`Batch ${i}`,
      'texto-[] // hora-[] // hora-[] // numerico-[1:10]:dec[1] // numerico-[5:40]:dec[1] // numerico-[0:100]:dec[2] // texto-[]',
      S3);
  }
  // Total de volumen colocado = suma de la columna de VOLUMEN de los 6 batches.
  // ⚠ La letra se deriva del encabezado, NO se escribe a mano: al insertar la
  // columna de temperatura, el volumen pasó de E a F y una letra hardcodeada
  // habría hecho que el total sumara temperaturas sin que nada fallara.
  const COL_VOLUMEN = 'F';                     // A guía · B/C horas · D slump · E temp · F volumen · G testigos
  const primeraFilaBatch = p - 6;              // partida de "Batch 1"
  const ultimaFilaBatch = p - 1;               // partida de "Batch 6"
  add('Volumen total colocado (m³)',
    `numerico-fx[SUMA(#${primeraFilaBatch}${COL_VOLUMEN}:#${ultimaFilaBatch}${COL_VOLUMEN})]:dec[2]`, S3);

  // Sin probetas no existe control de calidad del concreto: es la única prueba
  // objetiva de que el elemento alcanza el f'c de diseño, y se toma AQUÍ o no se
  // toma nunca. Igual el curado: la resistencia final depende de él tanto como
  // de la dosificación.
  const S4 = 'INSPECCIÓN POSTERIOR AL VACIADO';
  const posterior = [
    '¿Se tomaron las probetas según norma (un juego por cada 50 m³ o fracción, mínimo uno por día de vaciado), identificadas y protegidas en obra? (NTP 339.033)',
    '¿El slump de cada batch se mantuvo dentro de la tolerancia del diseño y se rechazó el que no cumplía? (registrar rechazos en observaciones)',
    '¿El acabado superficial corresponde al especificado y está libre de cangrejeras, segregación o juntas frías? (describir y ubicar cualquier defecto en observaciones)',
    '¿El desplome del elemento terminado es menor a 6 mm por cada 3 m de altura y los niveles cumplen ±10 mm?',
    '¿Los elementos embebidos quedaron en su posición final, sin desplazamiento respecto al plano?',
    '¿El curado se inició apenas el acabado lo permitió y se mantendrá al menos 7 días? (RNE E.060 — sin curado no se alcanza el f\'c)',
    '¿El área quedó ordenada y los residuos de concreto se retiraron antes de fraguar?',
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

  // Una plancha fuera de posición se descubre el día del montaje, con la
  // estructura metálica ya en obra y la grúa contratada: corregirla implica
  // demoler el pedestal. De ahí que el control sea por coordenadas medidas y no
  // por apreciación.
  const S2 = 'CHECK LIST — INSTALACIÓN DE PLANCHAS Y PERNOS';
  const check = [
    '¿La superficie de apoyo de la plancha está limpia, nivelada y sin lechada suelta?',
    '¿Los pernos de anclaje tienen la longitud, el diámetro y el grado especificados, con rosca útil suficiente?',
    '¿La rosca de los pernos está protegida y sin daños ni concreto adherido?',
    '¿La plancha está alineada según el plano, con desviación dentro de la tolerancia de montaje?',
    '¿La plancha y los pernos están nivelados, verificados con nivel de precisión?',
    '¿La plantilla mantuvo la separación entre pernos durante el vaciado, sin desplazamiento?',
    '¿Las coordenadas medidas en campo están dentro de la tolerancia de ±2 cm registrada en la tabla?',
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
