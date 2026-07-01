/* TMA — CONTROL DE TEMPERATURA de mezclas asfálticas in situ (ASTM D3666).
 * Perfil térmico en 5 etapas (planta → arribo → descarga → inicio compactación → cierre),
 * gradientes de enfriamiento, curva de enfriamiento, y dictamen: arribo ≥135°C, inicio en
 * 120–140°C, cierre ≥110°C. Patrón (km 14+200, PEN 60/70): 155/145/140/130/115 °C
 * (ΔT transporte 10, tendido 10, compactación 15). Vía :ej[] congruente.
 */
let XLSX; for (const p of ['xlsx', './node_modules/xlsx', './flow-qaqc-web/node_modules/xlsx']) { try { XLSX = require(p); break; } catch (e) {} }
if (!XLSX) { console.error('NO_XLSX'); process.exit(1); }

const ID = 'TMA';
const NAME = 'TEMPERATURA MEZCLA ASFALTICA';
const H = ['ID_Protocolo', 'Protocolo', 'PartidaItem', 'Actividad realizada', 'Método de validación', 'Sección'];
const rows = [H];
let p = 0;
const row = (act, met, sec) => { p += 1; rows.push([ID, NAME, p, act, met, sec]); return p; };
const header = (met, sec) => { p += 1; rows.push([ID, NAME, p, '', met, sec]); return p; };

// ── S0 — Perfil de temperaturas (col A = N° etapa para el gráfico; col B = temperatura) ──
const S0 = 'Perfil de temperaturas in situ';
header('col-[A][N° etapa] // col-[B][Temperatura (°C)]', S0);                                              // 1
const pPlanta = row('Temperatura de salida de planta', `val-[1] // numerico-[150:165]:dec[1]:ej[155]`, S0);   // 2
const pArribo = row('Temperatura de arribo en obra', `val-[2] // numerico-[140:155]:dec[1]:ej[145]`, S0);     // 3
const pDesc = row('Temperatura de descarga en pavimentadora', `val-[3] // numerico-[135:145]:dec[1]:ej[140]`, S0); // 4
const pInicio = row('Temperatura de inicio de compactación', `val-[4] // numerico-[120:140]:dec[1]:ej[130]`, S0); // 5
const pFinal = row('Temperatura de cierre de compactación', `val-[5] // numerico-[110:120]:dec[1]:ej[115]`, S0);  // 6
// Curva de enfriamiento (temperatura vs etapa).
row('Perfil térmico (curva de enfriamiento)',
  `numerico-gr1[x:#${pPlanta}A:#${pFinal}A|y:#${pPlanta}B:#${pFinal}B|alto:60|t:Perfil Térmico del Tramo|xt:Etapa (1=Planta … 5=Cierre)|yt:Temperatura (°C)|ly:Temperatura]`, S0); // 7

// ── S1 — Gradientes de enfriamiento ──
const S1 = 'Gradientes de enfriamiento';
row('ΔT en transporte (planta − arribo) (°C)', `numerico-fx[#${pPlanta}B-#${pArribo}B]:dec[1]`, S1);       // 8
row('ΔT en tendido (descarga − inicio) (°C)', `numerico-fx[#${pDesc}B-#${pInicio}B]:dec[1]`, S1);          // 9
row('Ventana de compactación (inicio − cierre) (°C)', `numerico-fx[#${pInicio}B-#${pFinal}B]:dec[1]`, S1); // 10
row('Gradiente de enfriamiento total (planta − cierre) (°C)', `numerico-fx[#${pPlanta}B-#${pFinal}B]:dec[1]`, S1); // 11

// ── S2 — Evaluación de cumplimiento ──
const S2 = 'Evaluación de cumplimiento';
const pCumArr = row('¿Arribo ≥ 135 °C? (1=Sí, 0=No)', `numerico-fx[SI(#${pArribo}B>=135,1,0)]:dec[0]`, S2);  // 12
const pCumIni = row('¿Inicio entre 120 y 140 °C? (1=Sí, 0=No)', `numerico-fx[SI(Y(#${pInicio}B>=120,#${pInicio}B<=140),1,0)]:dec[0]`, S2); // 13
const pCumFin = row('¿Cierre ≥ 110 °C? (1=Sí, 0=No)', `numerico-fx[SI(#${pFinal}B>=110,1,0)]:dec[0]`, S2);   // 14
row('Dictamen final (1=CONFORME, 0=NO CONFORME)', `numerico-fx[SI(Y(#${pCumArr}A>=1,#${pCumIni}A>=1,#${pCumFin}A>=1),1,0)]:dec[0]`, S2); // 15

const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'Actividades');
XLSX.writeFile(wb, 'Proyectos Modelo/Proyecto_Carretera/TMA_TemperaturaAsfaltica.xlsx');
console.log(`OK TMA: ${rows.length - 1} filas. Temps=part ${pPlanta}-${pFinal}, dictamen=part ${p}.`);
