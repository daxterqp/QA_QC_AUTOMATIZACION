/* CCD — Resistencia a Compresión de Cilindros de Concreto (DEMO) · ASTM C39.
 * Acorde a las capacidades del sistema:
 *  - Inputs medidos en lab (geometría, peso, carga de rotura, edad).
 *  - Outputs calculados: área, volumen, peso unitario, f'c, % del diseño.
 *  - Tipo de falla (lista ASTM C39).
 *  - 2 gráficas con sus tablas de datos:
 *      · Curva esfuerzo–deformación (lecturas carga/acortamiento de máquina instrumentada).
 *      · Ganancia de resistencia vs edad (probetas testigo a varias edades).
 * Unidades: cm, kgf, kg/cm² (estándar Perú). Sin tablas auxiliares (todo input/fórmula).
 */
let XLSX; for (const p of ['xlsx', './node_modules/xlsx', './flow-qaqc-web/node_modules/xlsx']) { try { XLSX = require(p); break; } catch (e) {} }
if (!XLSX) { console.error('NO_XLSX'); process.exit(1); }

const ID = 'CCD';
const NAME = 'RESISTENCIA A COMPRESIÓN DE CONCRETO (DEMO)';
const H = ['ID_Protocolo', 'Protocolo', 'PartidaItem', 'Actividad realizada', 'Método de validación', 'Sección'];
const rows = [H];
let p = 0;
const row = (act, met, sec) => { p += 1; rows.push([ID, NAME, p, act, met, sec]); return p; };

// S0 — Datos del espécimen
const S0 = 'Datos del espécimen';
const pProbeta = row('N° de probeta', 'texto-[]', S0);                                   // 1
row('Fecha de vaciado', 'fecha-[]', S0);                                                 // 2
row('Fecha de ensayo', 'fecha-[]', S0);                                                  // 3
const pEdad = row('Edad de curado (días)', 'numerico-[0:1000]:dec[0]', S0);               // 4
const pDiseno = row("Resistencia de diseño f'c (kg/cm²)", 'numerico-[0:2000]:dec[0]', S0); // 5

// S1 — Geometría y masa
const S1 = 'Geometría y masa';
const pD1 = row('Diámetro 1 (cm)', 'numerico-[0:100]:dec[2]', S1);                        // 6
const pD2 = row('Diámetro 2 (cm)', 'numerico-[0:100]:dec[2]', S1);                        // 7
const pDprom = row('Diámetro promedio (cm)', `numerico-fx[(#${pD1}A+#${pD2}A)/2]:dec[2]`, S1); // 8
const pAltura = row('Altura (cm)', 'numerico-[0:200]:dec[2]', S1);                        // 9
const pPeso = row('Peso de la probeta (kg)', 'numerico-[0:100]:dec[3]', S1);              // 10

// S2 — Resultados
const S2 = 'Resultados';
const pArea = row('Área de la sección (cm²)', `numerico-fx[PI()*#${pDprom}A*#${pDprom}A/4]:dec[2]`, S2); // 11
const pVol = row('Volumen (cm³)', `numerico-fx[#${pArea}A*#${pAltura}A]:dec[1]`, S2);     // 12
const pPU = row('Peso unitario (g/cm³)', `numerico-fx[#${pPeso}A*1000/#${pVol}A]:dec[3]`, S2); // 13
const pCarga = row('Carga máxima de rotura (kgf)', 'numerico-[0:500000]:dec[0]', S2);     // 14
const pFc = row("Resistencia a compresión f'c (kg/cm²)", `numerico-fx[#${pCarga}A/#${pArea}A]:dec[1]`, S2); // 15
row("% de la resistencia de diseño", `numerico-fx[#${pFc}A/#${pDiseno}A*100]:dec[1]`, S2); // 16
row('Tipo de falla (ASTM C39)', 'list-[Tipo 1: Cónica, Tipo 2: Cónica y hendida, Tipo 3: Columnar, Tipo 4: Diagonal, Tipo 5: Conos en extremos, Tipo 6: Punta de un extremo]', S2); // 17

// S3 — Curva esfuerzo–deformación (máquina instrumentada; opcional)
const S3 = 'Curva esfuerzo - deformación';
row('', 'col-[A][Carga (kgf)] // col-[B][Acortamiento (mm)] // col-[C][Esfuerzo (kg/cm²)] // col-[D][Def. unitaria (‰)]', S3); // 18
const ssP = [];
for (let i = 0; i < 6; i++) {
  const np = p + 1;
  const m = [
    'numerico-[0:500000]:dec[0]',                                  // carga (input)
    'numerico-[0:50]:dec[3]',                                      // acortamiento mm (input)
    `numerico-fx[#${np}A/#${pArea}A]:dec[1]`,                       // esfuerzo = carga/área
    `numerico-fx[#${np}B/#${pAltura}A*100]:dec[3]`,                 // def. unitaria (‰) = ΔL/(h·10)·1000
  ].join(' // ');
  ssP.push(row(`Lectura ${i + 1}`, m, S3));                         // 19..24
}
row('Gráfico esfuerzo - deformación', `numerico-gr2[x:#${ssP[0]}D:#${ssP[5]}D|y:#${ssP[0]}C:#${ssP[5]}C|alto:70|t:Curva Esfuerzo - Deformación|xt:Deformación unitaria (‰)|yt:Esfuerzo (kg/cm²)|ly:Probeta]`, S3); // 25

// S4 — Ganancia de resistencia vs edad (probetas testigo a varias edades)
const S4 = 'Ganancia de resistencia vs edad';
row('', "col-[A][Edad (días)] // col-[B][f'c (kg/cm²)]", S4);                         // 26
const ageP = [];
for (let i = 0; i < 5; i++) {
  ageP.push(row(`Testigo ${i + 1}`, ['numerico-[0:1000]:dec[0]', 'numerico-[0:2000]:dec[1]'].join(' // '), S4)); // 27..31
}
row('Gráfico ganancia de resistencia', `numerico-gr2[x:#${ageP[0]}A:#${ageP[4]}A|y:#${ageP[0]}B:#${ageP[4]}B|alto:70|t:Ganancia de Resistencia vs Edad|xt:Edad (días)|yt:f'c (kg/cm²)|ly:Resistencia]`, S4); // 32

// S5 — Observaciones
row('Observaciones', 'texto-[]', 'Observaciones');                                        // 33

const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'Actividades');
XLSX.writeFile(wb, 'Actividadesv1/CCD_Concreto_Demo.xlsx');
console.log(`OK CCD: ${rows.length - 1} filas. Área=part ${pArea}, f'c=part ${pFc}.`);
