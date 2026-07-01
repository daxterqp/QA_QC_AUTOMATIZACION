/* PRM — ENSAYO PROCTOR MODIFICADO (ASTM D1557 / AASHTO T180) — Proyecto Carretera.
 * Fase de laboratorio (fijación de metas). 4 puntos de control (2 secos, 2 húmedos)
 * que ENCIERRAN el pico; DMS y OCH salen del VÉRTICE de la parábola ajustada (grado 2).
 * Cada entrada trae `:ej[]` con el patrón físico Base Granular Tipo A → el "Llenado
 * Automático" genera corridas congruentes. DMS = partida 14, OCH = partida 15
 * (las hereda el Cono de Arena DCC por xref).
 */
let XLSX; for (const p of ['xlsx', './node_modules/xlsx', './flow-qaqc-web/node_modules/xlsx']) { try { XLSX = require(p); break; } catch (e) {} }
if (!XLSX) { console.error('NO_XLSX'); process.exit(1); }

const ID = 'PRM';
const NAME = 'PROCTOR MODIFICADO';
const COLS = ['A', 'B', 'C', 'D'];
const H = ['ID_Protocolo', 'Protocolo', 'PartidaItem', 'Actividad realizada', 'Método de validación', 'Sección'];
const rows = [H];
let p = 0;
const row = (act, met, sec) => { p += 1; rows.push([ID, NAME, p, act, met, sec]); return p; };
const header = (met, sec) => { p += 1; rows.push([ID, NAME, p, '', met, sec]); return p; };
const perCol = (tpl, n = 4) => COLS.slice(0, n).map(c => tpl.replace(/\{c\}/g, c)).join(' // ');
// Entrada por columna con valor de ejemplo (:ej) distinto por punto.
const inEj = (base, ejs) => ejs.map(e => `${base}:ej[${e}]`).join(' // ');

// ── S0 — Datos del molde y la muestra ──
const S0 = 'Datos del molde y la muestra';
const pV = row('Volumen del molde (cm³)', 'numerico-[943:2124]:dec[1]:ej[2124]', S0);          // 1
const pWm = row('Peso del molde vacío (g)', 'numerico-[2500:6500]:dec[1]:ej[5350]', S0);       // 2

// ── S1 — Compactación (4 puntos) — entradas + cálculos por punto ──
const S1 = 'Determinación de la curva de compactación (4 puntos)';
header('col-[A][Punto 1 (seco)] // col-[B][Punto 2 (óptimo)] // col-[C][Punto 3 (húmedo)] // col-[D][Punto 4 (saturado)]', S1); // 3
// Entradas (con patrón Base Granular A back-solved a pesos crudos):
const pWmh = row('Peso molde + suelo húmedo (g)', inEj('numerico-[4500:11500]:dec[1]', [10260.7, 10362.6, 10364.8, 10307.4]), S1); // 4
const pWt = row('Peso de la tara (g)', inEj('numerico-[15:100]:dec[2]', [25, 25, 25, 25]), S1);        // 5
const pWth = row('Peso tara + suelo húmedo (g)', inEj('numerico-[100:500]:dec[2]', [151.96, 153.16, 154.36, 155.56]), S1); // 6
const pWts = row('Peso tara + suelo seco (g)', inEj('numerico-[90:480]:dec[2]', [145, 145, 145, 145]), S1); // 7
// Cálculos por punto:
const pWh = row('Peso del suelo húmedo compactado (g)', perCol(`numerico-fx[#${pWmh}{c}-#${pWm}A]:dec[1]`), S1);   // 8
const pRhoH = row('Densidad húmeda (g/cm³)', perCol(`numerico-fx[#${pWh}{c}/#${pV}A]:dec[3]`), S1);                // 9
const pWw = row('Peso del agua (g)', perCol(`numerico-fx[#${pWth}{c}-#${pWts}{c}]:dec[2]`), S1);                   // 10
const pWs = row('Peso del suelo seco (g)', perCol(`numerico-fx[#${pWts}{c}-#${pWt}{c}]:dec[2]`), S1);              // 11
const pW = row('Contenido de humedad (%)', perCol(`numerico-fx[#${pWw}{c}/#${pWs}{c}*100]:dec[2]`), S1);           // 12
const pRhoD = row('Densidad seca (g/cm³)', perCol(`numerico-fx[#${pRhoH}{c}/(1+#${pW}{c}/100)]:dec[3]`), S1);      // 13

// ── S2 — Resultados (vértice de la parábola grado 2) ──
const S2 = 'Resultados de laboratorio (metas de compactación)';
const pDMS = row('Densidad máxima seca — DMS (g/cm³)', `numerico-fx[PUNTOMAXIMOY(#${pW}A:#${pW}D, #${pRhoD}A:#${pRhoD}D, 2)]:dec[3]`, S2); // 14
const pOCH = row('Óptimo contenido de humedad — OCH (%)', `numerico-fx[PUNTOMAXIMOX(#${pW}A:#${pW}D, #${pRhoD}A:#${pRhoD}D, 2)]:dec[2]`, S2); // 15

// ── S3 — Gráfico obligatorio (4 puntos + parábola + vértice DMS/OCH) ──
const S3 = 'Curva de compactación';
row('Curva de compactación (Densidad seca vs Humedad)',
  `numerico-gr1[x:#${pW}A:#${pW}D|y:#${pRhoD}A:#${pRhoD}D|ajuste:poli2|alto:75|t:Curva de Compactación — Proctor Modificado|xt:Contenido de humedad (%)|yt:Densidad seca (g/cm³)|ly:Puntos de laboratorio]`, S3); // 16

const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'Actividades');
XLSX.writeFile(wb, 'Proyectos Modelo/Proyecto_Carretera/PRM_ProctorModificado.xlsx');
console.log(`OK PRM: ${rows.length - 1} filas. DMS=part ${pDMS}, OCH=part ${pOCH}, w=part ${pW}, dSeca=part ${pRhoD}.`);
