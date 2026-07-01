/* DCC — DENSIDAD DE CAMPO POR CONO DE ARENA (ASTM D1556 / AASHTO T191) — Proyecto Carretera.
 * Fase de obra (verificación). NO opera aislado: SELECCIONA (xref) un ensayo Proctor PRM
 * aprobado y HEREDA su DMS (part 14) y OCH (part 15) para calcular el Grado de Compactación:
 *   GC = (Densidad seca de campo / DMS del Proctor) × 100.
 * El selector de CAPA (Base/Subbase/Subrasante) fija dinámicamente el GC mínimo y la
 * tolerancia de humedad (tabla aux capas_pavimento) y emite el dictamen.
 * Entradas con :ej[] del patrón Base Granular A → "Llenado Automático" congruente (GC 100–101.5%).
 */
let XLSX; for (const p of ['xlsx', './node_modules/xlsx', './flow-qaqc-web/node_modules/xlsx']) { try { XLSX = require(p); break; } catch (e) {} }
if (!XLSX) { console.error('NO_XLSX'); process.exit(1); }

const PROCTOR_ID = 'PRM';       // tipo de ficha Proctor que el Cono puede seleccionar
const PROCTOR_DMS_PARTIDA = 14; // partida de la DMS en el Proctor
const PROCTOR_OCH_PARTIDA = 15; // partida del OCH en el Proctor

const ID = 'DCC';
const NAME = 'CONO DE ARENA';
const H = ['ID_Protocolo', 'Protocolo', 'PartidaItem', 'Actividad realizada', 'Método de validación', 'Sección'];
const rows = [H];
let p = 0;
const row = (act, met, sec) => { p += 1; rows.push([ID, NAME, p, act, met, sec]); return p; };

// ── S0 — Datos generales / capa ──
const S0 = 'Datos generales';
const pCapa = row('Capa evaluada', 'list-[@capas_pavimento[Capa]]:ej[Base Granular]', S0);   // 1

// ── S1 — Referencia de laboratorio (Proctor) por xref ──
const S1 = 'Referencia de laboratorio (Proctor Modificado)';
const pSel = row('Ensayo Proctor de referencia (seleccionar)', `xref-[${PROCTOR_ID}]`, S1);  // 2  selector
const pDMS = row('DMS heredada del Proctor (g/cm³)', `xref-[#${pSel}A].${PROCTOR_DMS_PARTIDA}A:dec[3]`, S1); // 3  get
const pOCH = row('OCH heredado del Proctor (%)', `xref-[#${pSel}A].${PROCTOR_OCH_PARTIDA}A:dec[2]`, S1);     // 4  get

// ── S2 — Mediciones de campo (cono de arena) ──
const S2 = 'Mediciones de campo (cono de arena)';
const pPi = row('Peso inicial del frasco + arena (g)', 'numerico-[5000:7000]:dec[1]:ej[6500]', S2);   // 5
const pPf = row('Peso final del frasco + arena (g)', 'numerico-[2000:4500]:dec[1]:ej[2872]', S2);     // 6
const pK = row('Constante del cono — K (g)', 'numerico-[1300:1700]:dec[1]:ej[1420]', S2);             // 7
const pRhoA = row('Densidad de la arena de Ottawa (g/cm³)', 'numerico-[1.3:1.45]:dec[3]:ej[1.380]', S2); // 8
const pPh = row('Peso del suelo húmedo extraído (g)', 'numerico-[2500:4500]:dec[1]:ej[3784]', S2);    // 9
const pWc = row('Contenido de humedad de campo (%)', 'numerico-[4:12]:dec[1]:ej[6.5]', S2);           // 10

// ── S3 — Procesamiento ──
const S3 = 'Procesamiento de datos';
const pMasaTot = row('Masa total de arena empleada (g)', `numerico-fx[#${pPi}A-#${pPf}A]:dec[1]`, S3);        // 11
const pMasaHueco = row('Masa de arena en la excavación (g)', `numerico-fx[#${pMasaTot}A-#${pK}A]:dec[1]`, S3); // 12
const pVol = row('Volumen del hueco (cm³)', `numerico-fx[#${pMasaHueco}A/#${pRhoA}A]:dec[1]`, S3);            // 13
const pRhoH = row('Densidad húmeda de campo (g/cm³)', `numerico-fx[#${pPh}A/#${pVol}A]:dec[3]`, S3);          // 14
const pRhoD = row('Densidad seca de campo (g/cm³)', `numerico-fx[#${pRhoH}A/(1+#${pWc}A/100)]:dec[3]`, S3);   // 15
const pGC = row('Grado de compactación — GC (%)', `numerico-fx[#${pRhoD}A/#${pDMS}A*100]:dec[1]`, S3);        // 16

// ── S4 — Evaluación de cumplimiento (dinámica por capa) ──
const S4 = 'Evaluación de cumplimiento';
const pGCmin = row('GC mínimo requerido por la capa (%)', `numerico-fx[BUSCAR(capas_pavimento, #${pCapa}A, GCmin)]:dec[1]`, S4); // 17
const pTolH = row('Tolerancia de humedad de la capa (± %)', `numerico-fx[BUSCAR(capas_pavimento, #${pCapa}A, TolHumedad)]:dec[1]`, S4); // 18
const pDesv = row('Desviación de humedad de campo vs OCH (%)', `numerico-fx[ABS(#${pWc}A-#${pOCH}A)]:dec[2]`, S4);   // 19
const pCumpleGC = row('¿Cumple compactación? (1=Sí, 0=No)', `numerico-fx[SI(#${pGC}A>=#${pGCmin}A,1,0)]:dec[0]`, S4); // 20
const pCumpleH = row('¿Cumple humedad? (1=Sí, 0=No)', `numerico-fx[SI(#${pDesv}A<=#${pTolH}A,1,0)]:dec[0]`, S4);      // 21
row('Dictamen final (1=CONFORME, 0=NO CONFORME)', `numerico-fx[SI(Y(#${pCumpleGC}A>=1,#${pCumpleH}A>=1),1,0)]:dec[0]`, S4);      // 22

const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'Actividades');
XLSX.writeFile(wb, 'Proyectos Modelo/Proyecto_Carretera/DCC_ConoArena.xlsx');
console.log(`OK DCC: ${rows.length - 1} filas. Selector=part ${pSel}, DMS xref=part ${pDMS}, GC=part ${pGC}, dictamen=part ${p}.`);
