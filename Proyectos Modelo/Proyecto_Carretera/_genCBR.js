/* CBR — CALIFORNIA BEARING RATIO (ASTM D1883 / AASHTO T193) — Proyecto Carretera.
 * 3 moldes compactados a 56/25/12 golpes (a la humedad del OCH). Por molde: expansión,
 * esfuerzo de penetración (área pistón 3.0 pulg²) → CBR a 0.1" (patrón 1000 psi) y 0.2"
 * (1500 psi). SELECCIONA (xref) un Proctor PRM y HEREDA su DMS; interpola el CBR y la
 * expansión al NIVEL DE COMPACTACIÓN de la capa (100%/95% de la DMS). Dictamen por capa.
 * Patrón Base A: moldes (ρd, CBR0.1) = (2.215,98)/(2.144,65)/(2.055,38) → CBR≈95%, Exp 0.05%.
 */
let XLSX; for (const p of ['xlsx', './node_modules/xlsx', './flow-qaqc-web/node_modules/xlsx']) { try { XLSX = require(p); break; } catch (e) {} }
if (!XLSX) { console.error('NO_XLSX'); process.exit(1); }

const PROCTOR_ID = 'PRM';
const PROCTOR_DMS_PARTIDA = 14;

const ID = 'CBR';
const NAME = 'CBR (CALIFORNIA BEARING RATIO)';
const COLS = ['A', 'B', 'C'];
const H = ['ID_Protocolo', 'Protocolo', 'PartidaItem', 'Actividad realizada', 'Método de validación', 'Sección'];
const rows = [H];
let p = 0;
const row = (act, met, sec) => { p += 1; rows.push([ID, NAME, p, act, met, sec]); return p; };
const header = (met, sec) => { p += 1; rows.push([ID, NAME, p, '', met, sec]); return p; };
const perCol = (tpl) => COLS.map(c => tpl.replace(/\{c\}/g, c)).join(' // ');
const inEj = (base, ejs) => ejs.map(e => `${base}:ej[${e}]`).join(' // ');

// ── S0 — Datos generales / capa ──
const S0 = 'Datos generales';
const pCapa = row('Capa evaluada', 'list-[@capas_pavimento[Capa]]:ej[Base Granular]', S0);   // 1

// ── S1 — Referencia Proctor (xref) ──
const S1 = 'Referencia de laboratorio (Proctor Modificado)';
const pSel = row('Ensayo Proctor de referencia (seleccionar)', `xref-[${PROCTOR_ID}]`, S1);  // 2
const pDMS = row('DMS heredada del Proctor (g/cm³)', `xref-[#${pSel}A].${PROCTOR_DMS_PARTIDA}A:dec[3]`, S1); // 3

// ── S2 — Moldes CBR (3 moldes) — entradas + cálculos por molde ──
const S2 = 'Ensaye de los 3 moldes (56 / 25 / 12 golpes)';
header('col-[A][Molde 1 (56 golpes)] // col-[B][Molde 2 (25 golpes)] // col-[C][Molde 3 (12 golpes)]', S2); // 4
const pVol = row('Volumen del molde (cm³)', inEj('numerico-[2124:2125]:dec[1]', [2124, 2124, 2124]), S2);  // 5
const pHi = row('Altura inicial de la muestra (mm)', inEj('numerico-[116.4:116.5]:dec[2]', [116.45, 116.45, 116.45]), S2); // 6
const pDi = row('Lectura inicial del dial de expansión (mm)', inEj('numerico-[0:30]:dec[3]', [0, 0, 0]), S2); // 7
const pDf = row('Lectura final del dial (tras 96 h) (mm)', inEj('numerico-[0:30]:dec[3]', [0.058, 0.093, 0.140]), S2); // 8
const pRd = row('Densidad seca del molde (g/cm³)', inEj('numerico-[1.8:2.35]:dec[3]', [2.215, 2.144, 2.055]), S2); // 9
const pC01 = row('Carga de penetración a 0.1" (lb)', inEj('numerico-[150:4000]:dec[0]', [2940, 1950, 1140]), S2); // 10
const pC02 = row('Carga de penetración a 0.2" (lb)', inEj('numerico-[250:6000]:dec[0]', [4200, 2700, 1560]), S2); // 11
const pExp = row('Expansión (%)', perCol(`numerico-fx[(#${pDf}{c}-#${pDi}{c})/#${pHi}{c}*100]:dec[3]`), S2); // 12
const pE01 = row('Esfuerzo a 0.1" (psi)', perCol(`numerico-fx[#${pC01}{c}/3.0]:dec[1]`), S2);                 // 13
const pE02 = row('Esfuerzo a 0.2" (psi)', perCol(`numerico-fx[#${pC02}{c}/3.0]:dec[1]`), S2);                 // 14
const pR01 = row('CBR a 0.1" (%)', perCol(`numerico-fx[#${pE01}{c}/1000*100]:dec[1]`), S2);                    // 15
const pR02 = row('CBR a 0.2" (%)', perCol(`numerico-fx[#${pE02}{c}/1500*100]:dec[1]`), S2);                    // 16
const pCbrM = row('CBR del molde (%)', perCol(`numerico-fx[MAX(#${pR01}{c}, #${pR02}{c})]:dec[1]`), S2);       // 17

// ── S3 — Resultados (interpolación al nivel de compactación de la capa) ──
const S3 = 'Resultados (CBR de diseño)';
const pPct = row('Nivel de compactación de la capa (% DMS)', `numerico-fx[BUSCAR(capas_pavimento, #${pCapa}A, PctDMS)]:dec[0]`, S3); // 18
const pDobj = row('Densidad objetivo del diseño (g/cm³)', `numerico-fx[#${pDMS}A*#${pPct}A/100]:dec[3]`, S3);  // 19
const pCbrF = row('CBR de diseño (interpolado a la densidad objetivo) (%)', `numerico-fx[INTERPY(#${pRd}A:#${pRd}C, #${pCbrM}A:#${pCbrM}C, #${pDobj}A)]:dec[1]`, S3); // 20
const pExpF = row('Expansión de diseño (interpolada) (%)', `numerico-fx[INTERPY(#${pRd}A:#${pRd}C, #${pExp}A:#${pExp}C, #${pDobj}A)]:dec[3]`, S3); // 21
// Gráfico: CBR vs Densidad seca (3 moldes + ajuste) — dentro de S3, antes del dictamen.
row('Curva CBR vs Densidad seca',
  `numerico-gr1[x:#${pRd}A:#${pRd}C|y:#${pCbrM}A:#${pCbrM}C|ajuste:poli2|alto:70|t:CBR vs Densidad seca|xt:Densidad seca (g/cm³)|yt:CBR (%)|ly:Moldes]`, S3); // 22

// ── S4 — Evaluación de cumplimiento ──
const S4 = 'Evaluación de cumplimiento';
const pCbrMin = row('CBR mínimo por la capa (%)', `numerico-fx[BUSCAR(capas_pavimento, #${pCapa}A, CBRmin)]:dec[1]`, S4); // 22
const pExpMax = row('Expansión máxima por la capa (%)', `numerico-fx[BUSCAR(capas_pavimento, #${pCapa}A, ExpMax)]:dec[2]`, S4); // 23
const pCumpleCbr = row('¿Cumple CBR? (1=Sí, 0=No)', `numerico-fx[SI(#${pCbrF}A>=#${pCbrMin}A,1,0)]:dec[0]`, S4); // 24
const pCumpleExp = row('¿Cumple expansión? (1=Sí, 0=No)', `numerico-fx[SI(#${pExpF}A<=#${pExpMax}A,1,0)]:dec[0]`, S4); // 26
row('Dictamen final (1=CONFORME, 0=NO CONFORME)', `numerico-fx[SI(Y(#${pCumpleCbr}A>=1,#${pCumpleExp}A>=1),1,0)]:dec[0]`, S4); // 27

const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'Actividades');
XLSX.writeFile(wb, 'Proyectos Modelo/Proyecto_Carretera/CBR_CaliforniaBearingRatio.xlsx');
console.log(`OK CBR: ${rows.length - 1} filas. Selector=part ${pSel}, DMS xref=part ${pDMS}, CBR final=part ${pCbrF}, dictamen=part ${p}.`);
