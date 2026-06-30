/* PRD — Proctor DEMO (mínimo, rápido, con 2 gráficas).
 * Recorte de PRV5: Datos del molde, densidades húmedas (4 pts), humedad (4 pts),
 * MDS+OCH+curva de compactación, y granulometría+curva. SIN % sólidos ni gravedad
 * específica (para pocos ingresos en la demo).
 * MDS queda en la partida 19 y OCH en la 20 (las usa el Cono de Arena por xref).
 */
const fs = require('fs');
let XLSX; for (const p of ['xlsx', './node_modules/xlsx', './flow-qaqc-web/node_modules/xlsx']) { try { XLSX = require(p); break; } catch (e) {} }
if (!XLSX) { console.error('NO_XLSX'); process.exit(1); }

const ID = 'PRD';
const NAME = 'PROCTOR (DEMO)';
const COLS = ['A', 'B', 'C', 'D'];
const H = ['ID_Protocolo', 'Protocolo', 'PartidaItem', 'Actividad realizada', 'Método de validación', 'Sección'];
const rows = [H];
let p = 0;
const row = (act, met, sec) => { p += 1; rows.push([ID, NAME, p, act, met, sec]); return p; };
const header = (met, sec) => { p += 1; rows.push([ID, NAME, p, '', met, sec]); return p; };
const perCol = (tpl, n = 4) => COLS.slice(0, n).map(c => tpl.replace(/\{c\}/g, c)).join(' // ');
const same = (m, n = 4) => Array(n).fill(m).join(' // ');

// S0 — Datos del molde
const S0 = 'Datos del molde';
const pMolde = row('N° de molde', 'list-[@moldes[Codigo]]', S0);                                   // 1
const pPesoMolde = row('Peso del molde (g)', `numerico-fx[BUSCAR(moldes, #${pMolde}A, Peso)]:dec[1]`, S0);   // 2
const pVolMolde = row('Volumen del molde (cm³)', `numerico-fx[BUSCAR(moldes, #${pMolde}A, Volumen)]:dec[1]`, S0); // 3

// S1 — Densidades húmedas (4 puntos en COLUMNAS)
const S1 = 'Determinación de densidades húmedas';
header('col-[A][Punto 1] // col-[B][Punto 2] // col-[C][Punto 3] // col-[D][Punto 4]', S1);        // 4
const pAgua1 = row('Agua añadida (ml)', same('numerico-[0:100000]'), S1);                          // 5
const pMS = row('Peso molde + suelo húmedo (g)', same('numerico-[0:200000]:dec[1]'), S1);          // 6
const pPM = row('Peso del molde (g)', perCol(`numerico-fx[#${pPesoMolde}A]:dec[1]`), S1);          // 7
const pComp = row('Peso suelo compactado (g)', perCol(`numerico-fx[#${pMS}{c}-#${pPM}{c}]:dec[1]`), S1); // 8
const pDhum = row('Densidad húmeda (g/cm³)', perCol(`numerico-fx[#${pComp}{c}/#${pVolMolde}A]:dec[3]`), S1); // 9

// S2 — Contenido de humedad (4 puntos en COLUMNAS)
const S2 = 'Determinación de contenido de humedad';
header('col-[A][Punto 1] // col-[B][Punto 2] // col-[C][Punto 3] // col-[D][Punto 4]', S2);        // 10
const pRec = row('Recipiente N°', same('list-[@taras[Codigo]]'), S2);                              // 11
const pSH = row('Suelo húmedo + recipiente (g)', same('numerico-[0:100000]:dec[2]'), S2);          // 12
const pSS = row('Suelo seco + recipiente (g)', same('numerico-[0:100000]:dec[2]'), S2);            // 13
const pPRec = row('Peso del recipiente (g)', perCol(`numerico-fx[BUSCAR(taras, #${pRec}{c}, Peso)]:dec[2]`), S2); // 14
const pAgua = row('Peso de agua (g)', perCol(`numerico-fx[#${pSH}{c}-#${pSS}{c}]:dec[2]`), S2);     // 15
const pSeco = row('Peso de suelo seco (g)', perCol(`numerico-fx[#${pSS}{c}-#${pPRec}{c}]:dec[2]`), S2); // 16
const pHum = row('Contenido de humedad (%)', perCol(`numerico-fx[#${pAgua}{c}/#${pSeco}{c}*100]:dec[2]`), S2); // 17
const pDseca = row('Densidad seca (g/cm³)', perCol(`numerico-fx[#${pDhum}{c}/(1+#${pHum}{c}/100)]:dec[3]`), S2); // 18

// S3 — Densidad máxima seca (resultado + curva). MDS=19, OCH=20 (las usa el Cono).
const S3 = 'Determinación de densidad máxima seca';
const pMDS = row('Máxima densidad seca (g/cm³)', `numerico-fx[PUNTOMAXIMOY(#${pHum}A:#${pHum}D, #${pDseca}A:#${pDseca}D, 3)]:dec[3]`, S3); // 19
const pOCH = row('Humedad óptima (%)', `numerico-fx[PUNTOMAXIMOX(#${pHum}A:#${pHum}D, #${pDseca}A:#${pDseca}D, 3)]:dec[2]`, S3); // 20
row('Curva de compactación', `numerico-gr1[x:#${pHum}A:#${pHum}D|y:#${pDseca}A:#${pDseca}D|ajuste:poli3|alto:70|t:Curva de Compactación|xt:Humedad (%)|yt:Densidad seca (g/cm³)|ly:Puntos]`, S3); // 21

// S4 — Granulometría (peso seco total como ingreso + tamices + curva)
const S4 = 'Ensayo de granulometría';
const pSecoTot = row('Peso seco total de la muestra (g)', 'numerico-[0:1000000]:dec[1]', S4);      // 22
header('col-[A][Abertura (mm)] // col-[B][Peso retenido (g)] // col-[C][% Retenido] // col-[D][% Acumulado] // col-[E][% Pasa]', S4); // 23
const meshP = [];
const mesh = (ab, label, prevP, retB) => {
  const np = p + 1;
  const acum = prevP == null ? `numerico-fx[#${np}C]:dec[2]` : `numerico-fx[#${prevP}D+#${np}C]:dec[2]`;
  const m = [`val-[${ab}]:dec[3]`, retB, `numerico-fx[#${np}B/#${pSecoTot}A*100]:dec[2]`, acum, `numerico-fx[100-#${np}D]:dec[2]`].join(' // ');
  const pp = row(label, m, S4); meshP.push(pp); return pp;
};
mesh('4.75', 'Tamiz 4.75 mm (N° 4)', null, 'numerico-[0:100000]:dec[1]');       // 24
mesh('2.0', 'Tamiz 2.0 mm (N° 10)', meshP[0], 'numerico-[0:100000]:dec[1]');    // 25
mesh('0.85', 'Tamiz 0.85 mm (N° 20)', meshP[1], 'numerico-[0:100000]:dec[1]');  // 26
mesh('0.425', 'Tamiz 0.425 mm (N° 40)', meshP[2], 'numerico-[0:100000]:dec[1]'); // 27
mesh('0.150', 'Tamiz 0.150 mm (N° 100)', meshP[3], 'numerico-[0:100000]:dec[1]'); // 28
mesh('0.075', 'Tamiz 0.075 mm (N° 200)', meshP[4], 'numerico-[0:100000]:dec[1]'); // 29
const fondoRet = `numerico-fx[#${pSecoTot}A-(${meshP.map(mp => `#${mp}B`).join('+')})]:dec[1]`;
mesh('0.001', 'Fondo', meshP[5], fondoRet);                                      // 30
row('Curva granulométrica', `numerico-gr5[x:#${meshP[0]}A:#${meshP[6]}A|y:#${meshP[0]}E:#${meshP[6]}E|alto:70|t:Curva Granulométrica|xt:Abertura (mm)|yt:% Pasa|ly:Muestra]`, S4); // 31

const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'Actividades');
XLSX.writeFile(wb, 'Actividadesv1/PRD_Proctor_Demo.xlsx');
console.log(`OK PRD: ${rows.length - 1} filas. MDS=part ${pMDS}, OCH=part ${pOCH}, dSeca=part ${pDseca}.`);
