/* PRV5 — Proctor real, refinado tras feedback:
 *  - Incluye TODAS las filas (se agregan "Agua añadida" y "Peso molde" del Proc 1).
 *  - Proc 4 (% sólidos) usa OTRA tara: tabla nueva `taras2` (tara 33, peso 721.8).
 *  - Decimales IGUALADOS al Excel original (densidad húmeda/seca = 3, pesos = 2, etc.).
 *  - Curva granulométrica SIN `ajuste:loglog` (evita el eje Y que explota a 100000).
 *  - Puntos en COLUMNAS, cada procedimiento su sección, partidas secuenciales.
 */
const fs = require('fs');
let XLSX; for (const p of ['xlsx', './node_modules/xlsx', './flow-qaqc-web/node_modules/xlsx']) { try { XLSX = require(p); break; } catch (e) {} }
if (!XLSX) { console.error('NO_XLSX'); process.exit(1); }

const ID = 'PRV5';
const NAME = 'PROCTOR MODIFICADO';
const COLS = ['A', 'B', 'C', 'D'];
const H = ['ID_Protocolo', 'Protocolo', 'PartidaItem', 'Actividad realizada', 'Método de validación', 'Sección'];
const rows = [H];
let p = 0;
const row = (act, met, sec) => { p += 1; rows.push([ID, NAME, p, act, met, sec]); return p; };
const header = (met, sec) => { p += 1; rows.push([ID, NAME, p, '', met, sec]); return p; };
const perCol = (tpl, n = 4) => COLS.slice(0, n).map(c => tpl.replace(/\{c\}/g, c)).join(' // ');
const same = (m, n = 4) => Array(n).fill(m).join(' // ');

// ── S0 — Datos del molde ──────────────────────────────────────────────────────
const S0 = 'Datos del molde';
const pMolde = row('N° de molde', 'list-[@moldes[Codigo]]', S0);
const pPesoMolde = row('Peso del molde (g)', `numerico-fx[BUSCAR(moldes, #${pMolde}A, Peso)]:dec[1]`, S0);
const pVolMolde = row('Volumen del molde (cm³)', `numerico-fx[BUSCAR(moldes, #${pMolde}A, Volumen)]:dec[1]`, S0);

// ── S1 — Determinación de densidades húmedas (4 puntos en COLUMNAS) ───────────
const S1 = 'Determinación de densidades húmedas';
header('col-[A][Punto 1] // col-[B][Punto 2] // col-[C][Punto 3] // col-[D][Punto 4]', S1);
const pAgua1 = row('Agua añadida (ml)', same('numerico-[0:100000]'), S1);
const pMS = row('Peso molde + suelo húmedo (g)', same('numerico-[0:200000]'), S1);
const pPM = row('Peso del molde (g)', perCol(`numerico-fx[#${pPesoMolde}A]:dec[1]`), S1);
const pComp = row('Peso suelo compactado (g)', perCol(`numerico-fx[#${pMS}{c}-#${pPM}{c}]:dec[1]`), S1);
const pDhum = row('Densidad húmeda (g/cm³)', perCol(`numerico-fx[#${pComp}{c}/#${pVolMolde}A]:dec[3]`), S1);

// ── S2 — Determinación de contenido de humedad (4 puntos en COLUMNAS) ─────────
const S2 = 'Determinación de contenido de humedad';
header('col-[A][Punto 1] // col-[B][Punto 2] // col-[C][Punto 3] // col-[D][Punto 4]', S2);
const pRec = row('Recipiente N°', same('list-[@taras[Codigo]]'), S2);
const pSH = row('Suelo húmedo + recipiente (g)', same('numerico-[0:100000]:dec[2]'), S2);
const pSS = row('Suelo seco + recipiente (g)', same('numerico-[0:100000]:dec[2]'), S2);
const pPRec = row('Peso del recipiente (g)', perCol(`numerico-fx[BUSCAR(taras, #${pRec}{c}, Peso)]:dec[2]`), S2);
const pAgua = row('Peso de agua (g)', perCol(`numerico-fx[#${pSH}{c}-#${pSS}{c}]:dec[2]`), S2);
const pSeco = row('Peso de suelo seco (g)', perCol(`numerico-fx[#${pSS}{c}-#${pPRec}{c}]:dec[2]`), S2);
const pHum = row('Contenido de humedad (%)', perCol(`numerico-fx[#${pAgua}{c}/#${pSeco}{c}*100]:dec[2]`), S2);
const pDseca = row('Densidad seca (g/cm³)', perCol(`numerico-fx[#${pDhum}{c}/(1+#${pHum}{c}/100)]:dec[3]`), S2);

// ── S3 — Determinación de densidad máxima seca (resultado + curva) ────────────
const S3 = 'Determinación de densidad máxima seca';
row('Máxima densidad seca MDS (g/cm³)', `numerico-fx[PUNTOMAXIMOY(#${pHum}A:#${pHum}D, #${pDseca}A:#${pDseca}D, 3)]:dec[3]`, S3);
row('Óptimo contenido de humedad OCH (%)', `numerico-fx[PUNTOMAXIMOX(#${pHum}A:#${pHum}D, #${pDseca}A:#${pDseca}D, 3)]:dec[2]`, S3);
row('Curva de compactación', `numerico-gr1[x:#${pHum}A:#${pHum}D|y:#${pDseca}A:#${pDseca}D|ajuste:poli3|alto:70|t:Curva de Compactación|xt:Humedad (%)|yt:Densidad seca (g/cm³)|ly:Puntos]`, S3);

// ── S4 — Contenido de humedad y % de sólidos (tara 33, tabla nueva taras2) ────
const S4 = 'Contenido de humedad y % de sólidos';
const pT2 = row('N° de tara', 'list-[@taras2[Codigo]]', S4);
const pSH2 = row('Peso suelo húmedo + tara (g)', 'numerico-[0:100000]:dec[1]', S4);
const pSS2 = row('Peso suelo seco + tara (g)', 'numerico-[0:100000]:dec[1]', S4);
const pPT2 = row('Peso de la tara (g)', `numerico-fx[BUSCAR(taras2, #${pT2}A, Peso)]:dec[1]`, S4);
const pAg2 = row('Peso del agua (g)', `numerico-fx[#${pSH2}A-#${pSS2}A]:dec[1]`, S4);
const pSe2 = row('Peso del suelo seco (g)', `numerico-fx[#${pSS2}A-#${pPT2}A]:dec[1]`, S4);
row('Contenido de humedad (%)', `numerico-fx[#${pAg2}A/#${pSe2}A*100]:dec[2]`, S4);
const pIni = row('Peso inicial de muestra (g)', `numerico-fx[#${pSH2}A-#${pPT2}A]:dec[1]`, S4);
row('% de sólidos', `numerico-fx[#${pSe2}A/#${pIni}A*100]:dec[2]`, S4);
const pSecoTot = row('Peso seco total (g)', `numerico-fx[#${pSe2}A]:dec[1]`, S4);

// ── S5 — Ensayo de granulometría (tabla tamices, 5 col) + curva (sin loglog) ──
const S5 = 'Ensayo de granulometría';
header('col-[A][Abertura (mm)] // col-[B][Peso retenido (g)] // col-[C][% Retenido] // col-[D][% Acumulado] // col-[E][% Pasa]', S5);
const meshP = [];
const mesh = (ab, label, prevP, retB) => {
  const np = p + 1;
  const acum = prevP == null ? `numerico-fx[#${np}C]:dec[2]` : `numerico-fx[#${prevP}D+#${np}C]:dec[2]`;
  const m = [`val-[${ab}]:dec[3]`, retB, `numerico-fx[#${np}B/#${pSecoTot}A*100]:dec[2]`, acum, `numerico-fx[100-#${np}D]:dec[2]`].join(' // ');
  const pp = row(label, m, S5); meshP.push(pp); return pp;
};
mesh('9.5', 'Tamiz 9.5 mm (3/8")', null, 'numerico-[0:100000]:dec[1]');
mesh('4.75', 'Tamiz 4.75 mm (N° 4)', meshP[0], 'numerico-[0:100000]:dec[1]');
mesh('2.0', 'Tamiz 2.0 mm (N° 10)', meshP[1], 'numerico-[0:100000]:dec[1]');
mesh('0.425', 'Tamiz 0.425 mm (N° 40)', meshP[2], 'numerico-[0:100000]:dec[1]');
mesh('0.150', 'Tamiz 0.150 mm (N° 100)', meshP[3], 'numerico-[0:100000]:dec[1]');
mesh('0.075', 'Tamiz 0.075 mm (N° 200)', meshP[4], 'numerico-[0:100000]:dec[1]');
const fondoRet = `numerico-fx[#${pSecoTot}A-(${meshP.map(mp => `#${mp}B`).join('+')})]:dec[1]`;
mesh('0.001', 'Fondo', meshP[5], fondoRet);
const pm1 = meshP[0], pm7 = meshP[6];
// SIN ajuste:loglog — solo puntos sobre eje X logarítmico (Y lineal 0–100).
row('Curva granulométrica', `numerico-gr5[x:#${pm1}A:#${pm7}A|y:#${pm1}E:#${pm7}E|alto:70|t:Curva Granulométrica|xt:Abertura (mm)|yt:% Pasa|ly:Muestra]`, S5);

// ── S6 — Gravedad específica ──────────────────────────────────────────────────
const S6 = 'Gravedad específica';
const pFiola = row('N° de picnómetro / fiola', 'list-[@fiola[Codigo]]', S6);
const pPf = row('Peso frasco seco Pf (g)', `numerico-fx[BUSCAR(fiola, #${pFiola}A, Pf)]:dec[2]`, S6);
const pVf = row('Volumen frasco Vf (cm³)', `numerico-fx[BUSCAR(fiola, #${pFiola}A, Vf)]:dec[2]`, S6);
const pTemp = row('Temperatura de ensayo (°C)', 'list-[@agua[Temperatura]]', S6);
const pRhoT = row('Densidad del agua a T° (g/cm³)', `numerico-fx[BUSCAR(agua, #${pTemp}A, Densidad)]:dec[5]`, S6);
const pPfw = row('Peso frasco + agua a T° Pfw (g)', `numerico-fx[#${pPf}A+#${pVf}A*#${pRhoT}A]:dec[2]`, S6);
const pPfws = row('Peso frasco + agua + suelo Pfws (g)', 'numerico-[0:100000]:dec[2]', S6);
const pPss = row('Peso del suelo seco Pss (g)', 'numerico-[0:100000]:dec[2]', S6);
const pGst = row('Gravedad específica de sólidos a T° (Gst)', `numerico-fx[#${pPss}A/(#${pPfw}A-(#${pPfws}A-#${pPss}A))]:dec[3]`, S6);
const pRho20 = row('Densidad del agua a 20°C (ρ20°C)', 'val-[0.99821]:dec[5]', S6);
const pK1 = row('Factor de corrección K1', `numerico-fx[#${pRhoT}A/#${pRho20}A]:dec[5]`, S6);
row('Gravedad específica de sólidos a 20°C (Gs20°C)', `numerico-fx[#${pGst}A*#${pK1}A]:dec[3]`, S6);

// ── S7 — Observaciones ────────────────────────────────────────────────────────
row('Observaciones', 'texto-[]', 'Observaciones');

const wb1 = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb1, XLSX.utils.aoa_to_sheet(rows), 'Actividades');
XLSX.writeFile(wb1, 'Actividadesv1/PRV5_Proctor_v5.xlsx');

const aux = [
  ['tabla-moldes', 'Codigo', 12, 13, 14],
  ['tabla-moldes', 'Peso', 4118.4, 4111.7, 4285.1],
  ['tabla-moldes', 'Volumen', 938.7, 937.4, 940.8],
  ['tabla-taras', 'Codigo', 1, 2, 3, 4, 5, 6],
  ['tabla-taras', 'Peso', 269.9, 268.5, 269.7, 269.8, 270.1, 271.0],
  // Proc 4 (% sólidos) usa OTRA tara — catálogo separado (tara 33).
  ['tabla-taras2', 'Codigo', 33],
  ['tabla-taras2', 'Peso', 721.8],
  ['tabla-fiola', 'Codigo', 13, 15, 16, 17],
  ['tabla-fiola', 'Pf', 74.10, 75.20, 75.50, 75.97],
  ['tabla-fiola', 'Vf', 249.0, 248.0, 248.5, 248.72],
  ['tabla-agua', 'Temperatura', 16, 18, 20, 21, 21.6, 22, 23, 24, 25, 26, 28, 30],
  ['tabla-agua', 'Densidad', 0.99897, 0.99862, 0.99821, 0.99799, 0.99786, 0.99777, 0.99754, 0.99730, 0.99705, 0.99678, 0.99624, 0.99565],
];
const wb2 = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb2, XLSX.utils.aoa_to_sheet(aux), 'Tablas auxiliares');
XLSX.writeFile(wb2, 'Actividadesv1/PRV5_TablasAuxiliares_v5.xlsx');

console.log('OK PRV5: ' + (rows.length - 1) + ' filas, última partida ' + p);
