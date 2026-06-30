/* CAD — Cono de Arena DEMO (mínimo). Densidad de campo por cono de arena:
 *  arena calibrada → volumen del hueco → densidad húmeda → seca; humedad; luego
 *  SELECCIONA un ensayo Proctor (xref a PRD) para traer su MDS y calcular el
 *  % de compactación; y granulometría con curva.
 *  Requiere que el Proctor demo (PRD) tenga MDS en la partida 19 y OCH en la 20.
 */
const fs = require('fs');
let XLSX; for (const p of ['xlsx', './node_modules/xlsx', './flow-qaqc-web/node_modules/xlsx']) { try { XLSX = require(p); break; } catch (e) {} }
if (!XLSX) { console.error('NO_XLSX'); process.exit(1); }

const PROCTOR_ID = 'PRD';     // tipo de ficha Proctor que el Cono podrá seleccionar
const PROCTOR_MDS_PARTIDA = 19;
const PROCTOR_OCH_PARTIDA = 20;

const ID = 'CAD';
const NAME = 'CONO DE ARENA (DEMO)';
const H = ['ID_Protocolo', 'Protocolo', 'PartidaItem', 'Actividad realizada', 'Método de validación', 'Sección'];
const rows = [H];
let p = 0;
const row = (act, met, sec) => { p += 1; rows.push([ID, NAME, p, act, met, sec]); return p; };

// S0 — Datos del ensayo (densidad de campo por cono de arena)
const S0 = 'Datos del ensayo (cono de arena)';
const pCono = row('N° de cono', 'list-[@arena_cono[Codigo]]', S0);                                         // 1
const pBruto = row('Peso del material bruto (g)', 'numerico-[0:1000000]:dec[1]', S0);                       // 2
const pTaraB = row('Peso de la tara (g)', 'numerico-[0:100000]:dec[1]', S0);                                // 3
const pHumSoil = row('Peso del suelo húmedo (g)', `numerico-fx[#${pBruto}A-#${pTaraB}A]:dec[1]`, S0);       // 4
const pArenaFr = row('Peso de la arena + frasco (g)', 'numerico-[0:1000000]:dec[1]', S0);                   // 5
const pArenaCono = row('Peso de la arena del cono (g)', `numerico-fx[BUSCAR(arena_cono, #${pCono}A, PesoCono)]:dec[1]`, S0); // 6
const pArenaResto = row('Peso de la arena restante + frasco (g)', 'numerico-[0:1000000]:dec[1]', S0);       // 7
const pArenaNeta = row('Peso neto de la arena empleada (g)', `numerico-fx[#${pArenaFr}A-#${pArenaCono}A-#${pArenaResto}A]:dec[1]`, S0); // 8
const pDensArena = row('Densidad de la arena (g/cm³)', `numerico-fx[BUSCAR(arena_cono, #${pCono}A, Densidad)]:dec[3]`, S0); // 9
const pVolHueco = row('Volumen del hueco (cm³)', `numerico-fx[#${pArenaNeta}A/#${pDensArena}A]:dec[2]`, S0); // 10
const pDhum = row('Densidad del suelo húmedo (g/cm³)', `numerico-fx[#${pHumSoil}A/#${pVolHueco}A]:dec[3]`, S0); // 11

// S1 — Contenido de humedad
const S1 = 'Contenido de humedad';
const pTara = row('N° de tara', 'list-[@taras[Codigo]]', S1);                                              // 12
const pSH = row('Peso suelo húmedo + tara (g)', 'numerico-[0:100000]:dec[1]', S1);                          // 13
const pSS = row('Peso suelo seco + tara (g)', 'numerico-[0:100000]:dec[1]', S1);                            // 14
const pPTara = row('Peso de la tara (g)', `numerico-fx[BUSCAR(taras, #${pTara}A, Peso)]:dec[1]`, S1);       // 15
const pAgua = row('Peso del agua (g)', `numerico-fx[#${pSH}A-#${pSS}A]:dec[1]`, S1);                        // 16
const pSeco = row('Peso del suelo seco (g)', `numerico-fx[#${pSS}A-#${pPTara}A]:dec[1]`, S1);               // 17
const pHumPct = row('Contenido de humedad (%)', `numerico-fx[#${pAgua}A/#${pSeco}A*100]:dec[2]`, S1);       // 18
const pDseca = row('Densidad del suelo seco (g/cm³)', `numerico-fx[#${pDhum}A/(1+#${pHumPct}A/100)]:dec[3]`, S1); // 19

// S2 — Punto Proctor (xref) + % de compactación
const S2 = 'Punto Proctor y compactación';
const pSel = row('Ensayo Proctor (seleccionar)', `xref-[${PROCTOR_ID}]`, S2);                              // 20  selector
const pMDS = row('Máxima densidad seca del Proctor (g/cm³)', `xref-[#${pSel}A].${PROCTOR_MDS_PARTIDA}A`, S2); // 21  get
const pOCH = row('Humedad óptima del Proctor (%)', `xref-[#${pSel}A].${PROCTOR_OCH_PARTIDA}A`, S2); // 22  get
const pEspec = row('Compactación especificada (%)', 'val-[98]:dec[0]', S2);                                // 23
row('Porcentaje de compactación (%)', `numerico-fx[#${pDseca}A/#${pMDS}A*100]:dec[1]`, S2);               // 24

// S3 — Granulometría (peso seco total como ingreso + tamices + curva)
const S3 = 'Ensayo de granulometría';
const pSecoTot = row('Peso seco total de la muestra (g)', 'numerico-[0:1000000]:dec[1]', S3);              // 25
row('', 'col-[A][Abertura (mm)] // col-[B][Peso retenido (g)] // col-[C][% Retenido] // col-[D][% Acumulado] // col-[E][% Pasa]', S3); // 26
const meshP = [];
const mesh = (ab, label, prevP, retB) => {
  const np = p + 1;
  const acum = prevP == null ? `numerico-fx[#${np}C]:dec[2]` : `numerico-fx[#${prevP}D+#${np}C]:dec[2]`;
  const m = [`val-[${ab}]:dec[3]`, retB, `numerico-fx[#${np}B/#${pSecoTot}A*100]:dec[2]`, acum, `numerico-fx[100-#${np}D]:dec[2]`].join(' // ');
  const pp = row(label, m, S3); meshP.push(pp); return pp;
};
mesh('4.75', 'Tamiz 4.75 mm (N° 4)', null, 'numerico-[0:100000]:dec[1]');        // 27
mesh('2.0', 'Tamiz 2.0 mm (N° 10)', meshP[0], 'numerico-[0:100000]:dec[1]');     // 28
mesh('0.60', 'Tamiz 0.60 mm (N° 30)', meshP[1], 'numerico-[0:100000]:dec[1]');   // 29
mesh('0.425', 'Tamiz 0.425 mm (N° 40)', meshP[2], 'numerico-[0:100000]:dec[1]'); // 30
mesh('0.150', 'Tamiz 0.150 mm (N° 100)', meshP[3], 'numerico-[0:100000]:dec[1]'); // 31
mesh('0.075', 'Tamiz 0.075 mm (N° 200)', meshP[4], 'numerico-[0:100000]:dec[1]'); // 32
const fondoRet = `numerico-fx[#${pSecoTot}A-(${meshP.map(mp => `#${mp}B`).join('+')})]:dec[1]`;
mesh('0.001', 'Fondo', meshP[5], fondoRet);                                       // 33
row('Curva granulométrica', `numerico-gr5[x:#${meshP[0]}A:#${meshP[6]}A|y:#${meshP[0]}E:#${meshP[6]}E|alto:70|t:Curva Granulométrica|xt:Abertura (mm)|yt:% Pasa|ly:Muestra]`, S3); // 34

const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'Actividades');
XLSX.writeFile(wb, 'Actividadesv1/CAD_ConoArena_Demo.xlsx');
console.log(`OK CAD: ${rows.length - 1} filas. Selector Proctor=part ${pSel}, MDS xref=part ${pMDS}, %comp=part ${p - 1}.`);
