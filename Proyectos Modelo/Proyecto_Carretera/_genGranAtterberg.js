/* GRA — GRANULOMETRÍA + LÍMITES DE ATTERBERG (ASTM D422/D4318 · AASHTO T88/T89/T90).
 * Caracterización física: tamizado (%RP→%RA→%Pasa) con curva + HUSO (banda), y
 * límites de consistencia (LL por recta de flujo interpolada a 25 golpes, LP=promedio,
 * IP=LL−LP). Dictamen por capa (LLmax/IPmax de capas_pavimento). Patrón Base Granular A
 * (M=5000 g, %Pasa 100/83/56/41/29/15/6, LL=21.5, LP=17.5, IP=4.0) vía :ej[] congruente.
 */
let XLSX; for (const p of ['xlsx', './node_modules/xlsx', './flow-qaqc-web/node_modules/xlsx']) { try { XLSX = require(p); break; } catch (e) {} }
if (!XLSX) { console.error('NO_XLSX'); process.exit(1); }

const ID = 'GRA';
const NAME = 'GRANULOMETRIA Y ATTERBERG';
const COLS = ['A', 'B', 'C', 'D'];
const H = ['ID_Protocolo', 'Protocolo', 'PartidaItem', 'Actividad realizada', 'Método de validación', 'Sección'];
const rows = [H];
let p = 0;
const row = (act, met, sec) => { p += 1; rows.push([ID, NAME, p, act, met, sec]); return p; };
const header = (met, sec) => { p += 1; rows.push([ID, NAME, p, '', met, sec]); return p; };
const perCol = (tpl, n) => COLS.slice(0, n).map(c => tpl.replace(/\{c\}/g, c)).join(' // ');
const inEj = (base, ejs) => ejs.map(e => `${base}:ej[${e}]`).join(' // ');

// ── S0 — Datos generales ──
const S0 = 'Datos generales';
const pMtot = row('Masa inicial de la muestra seca (g)', 'numerico-[2000:6000]:dec[1]:ej[5000]', S0); // 1
const pCapa = row('Capa evaluada', 'list-[@capas_pavimento[Capa]]:ej[Base Granular]', S0);            // 2

// ── S1 — Análisis granulométrico por tamizado ──
const S1 = 'Análisis granulométrico por tamizado';
header('col-[A][Abertura (mm)] // col-[B][Masa retenida (g)] // col-[C][% Ret. parcial] // col-[D][% Ret. acum.] // col-[E][% Pasa] // col-[F][Huso inf.] // col-[G][Huso sup.]', S1); // 3
// [nombre, abertura, masa:ej, husoInf, husoSup]
const sieves = [
  ['Tamiz 2" (50.80 mm)', 50.80, 0, 100, 100],
  ['Tamiz 1" (25.40 mm)', 25.40, 850, 70, 100],
  ['Tamiz 3/8" (9.51 mm)', 9.51, 1350, 50, 80],
  ['Tamiz N° 4 (4.75 mm)', 4.75, 750, 35, 65],
  ['Tamiz N° 10 (2.00 mm)', 2.00, 600, 25, 50],
  ['Tamiz N° 40 (0.425 mm)', 0.425, 700, 15, 30],
  ['Tamiz N° 200 (0.075 mm)', 0.075, 450, 5, 13],
];
const sP = []; let prev = null;
for (const [name, ab, masa, lo, hi] of sieves) {
  const np = p + 1;
  const acum = prev == null ? `numerico-fx[#${np}C]:dec[2]` : `numerico-fx[#${prev}D+#${np}C]:dec[2]`;
  const cells = [
    `val-[${ab}]:dec[3]`,
    `numerico-[0:2000]:dec[1]:ej[${masa}]`,
    `numerico-fx[#${np}B/#${pMtot}A*100]:dec[2]`,
    acum,
    `numerico-fx[100-#${np}D]:dec[2]`,
    `val-[${lo}]:dec[0]`,
    `val-[${hi}]:dec[0]`,
  ].join(' // ');
  const pp = row(name, cells, S1); sP.push(pp); prev = pp;
}
const pN200 = sP[6];
// Bandeja (cierre de masa; sin huso, fuera del gráfico).
const pBand = row('Bandeja (fondo)', [
  'val-[0.001]:dec[3]',
  `numerico-[0:2000]:dec[1]:ej[300]`,
  `numerico-fx[#${p + 1}B/#${pMtot}A*100]:dec[2]`,
  `numerico-fx[#${prev}D+#${p + 1}C]:dec[2]`,
  `numerico-fx[100-#${p + 1}D]:dec[2]`,
  '', '',
].join(' // '), S1);
// Curva granulométrica + huso (banda) en semi-log.
row('Curva granulométrica (con huso Base A)',
  `numerico-gr5[x:#${sP[0]}A:#${pN200}A|y:#${sP[0]}E:#${pN200}E|bandalo:#${sP[0]}F:#${pN200}F|bandahi:#${sP[0]}G:#${pN200}G|alto:70|t:Curva Granulométrica|xt:Abertura (mm)|yt:% Pasa|ly:Muestra|ly2:Huso Base A]`, S1);

// ── S2 — Límite Líquido (recta de flujo, 3 puntos) ──
const S2 = 'Límite Líquido (copa de Casagrande)';
header('col-[A][Punto 1] // col-[B][Punto 2] // col-[C][Punto 3]', S2);
const pNgol = row('N° de golpes', inEj('numerico-[15:35]:dec[0]', [19, 26, 33]), S2);
const pWll = row('Contenido de humedad (%)', inEj('numerico-[10:40]:dec[1]', [22.0, 21.4, 21.0]), S2);
const pLogN = row('log(N°) — auxiliar', perCol(`numerico-fx[LOG(#${pNgol}{c})]:dec[5]:oculto`, 3), S2);
const pLL = row('Límite Líquido — LL (%)', `numerico-fx[PENDIENTE(#${pLogN}A:#${pLogN}C, #${pWll}A:#${pWll}C)*LOG(25)+INTERSECCION(#${pLogN}A:#${pLogN}C, #${pWll}A:#${pWll}C)]:dec[1]`, S2);

// ── S3 — Límite Plástico + Índice de Plasticidad ──
const S3 = 'Límite Plástico e Índice de Plasticidad';
header('col-[A][Rollo 1] // col-[B][Rollo 2]', S3);
const pWlp = row('Contenido de humedad (%)', inEj('numerico-[10:40]:dec[1]', [17.6, 17.4]), S3);
const pLP = row('Límite Plástico — LP (%)', `numerico-fx[PROMEDIO(#${pWlp}A:#${pWlp}B)]:dec[1]`, S3);
const pIP = row('Índice de Plasticidad — IP (%)', `numerico-fx[#${pLL}A-#${pLP}A]:dec[1]`, S3);

// ── S4 — Evaluación de cumplimiento ──
const S4 = 'Evaluación de cumplimiento';
const pFinos = row('% de finos (pasa N° 200)', `numerico-fx[#${pN200}E]:dec[1]`, S4);
const pLLmax = row('LL máximo por la capa (%)', `numerico-fx[BUSCAR(capas_pavimento, #${pCapa}A, LLmax)]:dec[1]`, S4);
const pIPmax = row('IP máximo por la capa (%)', `numerico-fx[BUSCAR(capas_pavimento, #${pCapa}A, IPmax)]:dec[1]`, S4);
const pCumpleLL = row('¿Cumple Límite Líquido? (1=Sí, 0=No)', `numerico-fx[SI(#${pLL}A<=#${pLLmax}A,1,0)]:dec[0]`, S4);
const pCumpleIP = row('¿Cumple Índice de Plasticidad? (1=Sí, 0=No)', `numerico-fx[SI(#${pIP}A<=#${pIPmax}A,1,0)]:dec[0]`, S4);
row('Dictamen final (1=CONFORME, 0=NO CONFORME)', `numerico-fx[SI(Y(#${pCumpleLL}A>=1,#${pCumpleIP}A>=1),1,0)]:dec[0]`, S4);

const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'Actividades');
XLSX.writeFile(wb, 'Proyectos Modelo/Proyecto_Carretera/GRA_GranulometriaAtterberg.xlsx');
console.log(`OK GRA: ${rows.length - 1} filas. N200=part ${pN200}, LL=part ${pLL}, LP=part ${pLP}, IP=part ${pIP}, finos=part ${pFinos}.`);
