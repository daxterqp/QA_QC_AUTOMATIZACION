/* MAR — ENSAYO MARSHALL para mezclas asfálticas (ASTM D6927 / AASHTO T245).
 * Control de la carpeta de rodadura (briqueta única, 75 golpes/cara = tráfico pesado):
 * estabilidad corregida = carga leída × factor de corrección (por espesor, de la tabla ASTM);
 * vacíos de aire Va = [1 − Gmb/Gmm]·100. Dictamen Tráfico Pesado: Estab≥1800 lb, Flujo 8–14,
 * Va 3–5%. Patrón (km 14+200): h=2.44"→FC 1.04, carga 2350 → Estab 2444 lb, Gmb/Gmm=2.352/2.450
 * → Va 4.0%. Todo vía :ej[] congruente.
 */
let XLSX; for (const p of ['xlsx', './node_modules/xlsx', './flow-qaqc-web/node_modules/xlsx']) { try { XLSX = require(p); break; } catch (e) {} }
if (!XLSX) { console.error('NO_XLSX'); process.exit(1); }

const ID = 'MAR';
const NAME = 'MARSHALL (MEZCLA ASFALTICA)';
const H = ['ID_Protocolo', 'Protocolo', 'PartidaItem', 'Actividad realizada', 'Método de validación', 'Sección'];
const rows = [H];
let p = 0;
const row = (act, met, sec) => { p += 1; rows.push([ID, NAME, p, act, met, sec]); return p; };

// ── S0 — Datos de la briqueta y lecturas de laboratorio ──
const S0 = 'Datos de la briqueta y lecturas de laboratorio';
const pH = row('Espesor real de la briqueta (pulg)', 'numerico-[2.20:2.80]:dec[2]:ej[2.44]', S0);       // 1
const pFC = row('Factor de corrección por espesor (tabla ASTM)', 'numerico-[0.80:1.50]:dec[2]:ej[1.04]', S0); // 2
const pP = row('Carga de rotura leída en la prensa (lb)', 'numerico-[1200:4500]:dec[1]:ej[2350]', S0);  // 3
const pFluj = row('Flujo — deformación acumulada (centésimas de pulg)', 'numerico-[8:16]:dec[1]:ej[11.5]', S0); // 4
const pGmb = row('Gravedad específica bulk — Gmb', 'numerico-[2.25:2.45]:dec[3]:ej[2.352]', S0);        // 5
const pGmm = row('Gravedad específica teórica máxima — Gmm (Rice)', 'numerico-[2.35:2.55]:dec[3]:ej[2.450]', S0); // 6

// ── S1 — Procesamiento ──
const S1 = 'Procesamiento';
const pEst = row('Estabilidad Marshall corregida (lb)', `numerico-fx[#${pP}A*#${pFC}A]:dec[1]`, S1);    // 7
const pVa = row('Porcentaje de vacíos de aire — Va (%)', `numerico-fx[(1-#${pGmb}A/#${pGmm}A)*100]:dec[1]`, S1); // 8

// ── S2 — Evaluación de cumplimiento (Tráfico Pesado) ──
const S2 = 'Evaluación de cumplimiento (Tráfico Pesado)';
const pCumEst = row('¿Estabilidad ≥ 1800 lb? (1=Sí, 0=No)', `numerico-fx[SI(#${pEst}A>=1800,1,0)]:dec[0]`, S2); // 9
const pCumFluj = row('¿Flujo entre 8 y 14? (1=Sí, 0=No)', `numerico-fx[SI(Y(#${pFluj}A>=8,#${pFluj}A<=14),1,0)]:dec[0]`, S2); // 10
const pCumVa = row('¿Vacíos entre 3% y 5%? (1=Sí, 0=No)', `numerico-fx[SI(Y(#${pVa}A>=3,#${pVa}A<=5),1,0)]:dec[0]`, S2); // 11
row('Dictamen final (1=CONFORME, 0=NO CONFORME)', `numerico-fx[SI(Y(#${pCumEst}A>=1,#${pCumFluj}A>=1,#${pCumVa}A>=1),1,0)]:dec[0]`, S2); // 12

const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'Actividades');
XLSX.writeFile(wb, 'Proyectos Modelo/Proyecto_Carretera/MAR_Marshall.xlsx');
console.log(`OK MAR: ${rows.length - 1} filas. Estab=part ${pEst}, Va=part ${pVa}, dictamen=part ${p}.`);
