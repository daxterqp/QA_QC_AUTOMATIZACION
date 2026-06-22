/* Genera PRV3 (Proctor real completo) + sus Tablas auxiliares en el formato que
 * lee la app (hoja "Actividades" / hoja "Tablas auxiliares").
 * Curva: ajuste polinómico NATIVO (PUNTOMAXIMOY=MDS, PUNTOMAXIMOX=OCH, grado 3).
 * Puntos como FILAS (reordenado lógico; resultado idéntico al Excel original).
 * Códigos de tablas auxiliares NUMÉRICOS (para que BUSCAR resuelva por #ref).
 */
const fs = require('fs');
let XLSX; for (const p of ['xlsx', './node_modules/xlsx', './flow-qaqc-web/node_modules/xlsx']) { try { XLSX = require(p); break; } catch (e) {} }
if (!XLSX) { console.error('NO_XLSX'); process.exit(1); }

const ID = 'PRV3';
const NAME = 'PROCTOR MODIFICADO (real)';
const H = ['ID_Protocolo', 'Protocolo', 'PartidaItem', 'Actividad realizada', 'Método de validación', 'Sección'];
const rows = [H];
const row = (partida, actividad, metodo, seccion) => rows.push([ID, NAME, partida, actividad, metodo, seccion]);
const hdr = (metodo, seccion) => rows.push([ID, NAME, '', '', metodo, seccion]);

// ── Datos del molde ─────────────────────────────────────────────────────────
const S1 = 'Datos del molde';
row(1, 'N° de molde', 'list-[@moldes[Codigo]]', S1);
row(2, 'Peso del molde (g)', 'numerico-fx[BUSCAR(moldes, #1A, Peso)]:dec[1]', S1);
row(3, 'Volumen del molde (cm³)', 'numerico-fx[BUSCAR(moldes, #1A, Volumen)]:dec[1]', S1);

// ── Compactación y humedad por punto (4 puntos = 4 filas, 12 columnas) ───────
const S2 = 'Compactación y humedad por punto';
hdr([
  'col-[A][Agua añadida (ml)]', 'col-[B][Molde+suelo húmedo (g)]', 'col-[C][Suelo compactado (g)]',
  'col-[D][Densidad húmeda (g/cm³)]', 'col-[E][N° tara]', 'col-[F][Húmedo+tara (g)]',
  'col-[G][Seco+tara (g)]', 'col-[H][Peso tara (g)]', 'col-[I][Peso agua (g)]',
  'col-[J][Suelo seco (g)]', 'col-[K][Humedad (%)]', 'col-[L][Densidad seca (g/cm³)]',
].join(' // '), S2);
const ptMetodo = (r) => [
  'numerico-[0:100000]',
  'numerico-[0:200000]',
  `numerico-fx[#${r}B-#2A]:dec[1]`,
  `numerico-fx[#${r}C/#3A]:dec[4]`,
  'list-[@taras[Codigo]]',
  'numerico-[0:100000]',
  'numerico-[0:100000]',
  `numerico-fx[BUSCAR(taras, #${r}E, Peso)]:dec[1]`,
  `numerico-fx[#${r}F-#${r}G]:dec[1]`,
  `numerico-fx[#${r}G-#${r}H]:dec[1]`,
  `numerico-fx[#${r}I/#${r}J*100]:dec[2]`,
  `numerico-fx[#${r}D/(100+#${r}K)*100]:dec[3]`,
].join(' // ');
row(4, 'Punto 1', ptMetodo(4), S2);
row(5, 'Punto 2', ptMetodo(5), S2);
row(6, 'Punto 3', ptMetodo(6), S2);
row(7, 'Punto 4', ptMetodo(7), S2);

// ── Resultados de compactación (ajuste nativo grado 3) ───────────────────────
const S3 = 'Resultados de compactación';
row(8, 'Máxima densidad seca MDS (g/cm³)', 'numerico-fx[PUNTOMAXIMOY(#4K:#7K, #4L:#7L, 3)]:dec[3]', S3);
row(9, 'Óptimo contenido de humedad OCH (%)', 'numerico-fx[PUNTOMAXIMOX(#4K:#7K, #4L:#7L, 3)]:dec[2]', S3);
row(10, 'Curva de compactación', 'numerico-gr1[x:#4K:#7K|y:#4L:#7L|ajuste:poli3|alto:70|t:Curva de Compactación|xt:Humedad (%)|yt:Densidad seca (g/cm³)|ly:Puntos]', S3);

// ── Granulometría ────────────────────────────────────────────────────────────
const S4 = 'Granulometría';
row(11, 'N° de tara (granulometría)', 'list-[@taras[Codigo]]', S4);
row(12, 'Suelo húmedo + tara (g)', 'numerico-[0:100000]', S4);
row(13, 'Suelo seco + tara (g)', 'numerico-[0:100000]', S4);
row(14, 'Peso de la tara (g)', 'numerico-fx[BUSCAR(taras, #11A, Peso)]:dec[1]', S4);
row(15, 'Peso de agua (g)', 'numerico-fx[#12A-#13A]:dec[1]', S4);
row(16, 'Peso del suelo seco (g)', 'numerico-fx[#13A-#14A]:dec[1]', S4);
row(17, 'Contenido de humedad granulometría (%)', 'numerico-fx[#15A/#16A*100]:dec[2]', S4);
row(18, 'Peso seco total (g)', 'numerico-fx[#16A]:dec[1]', S4);
hdr([
  'col-[A][Abertura (mm)]', 'col-[B][Peso retenido (g)]', 'col-[C][% Retenido]',
  'col-[D][% Acumulado]', 'col-[E][% Pasa]',
].join(' // '), S4);
// abertura como constante (numerico-fx[const]) · %ret = ret/seco*100 · %acum = prev+este · %pasa = 100-acum
const mesh = (r, ab, prevD, retFormula) => row(r, `Tamiz ${ab} mm`, [
  `numerico-fx[${ab}]:dec[3]`,
  retFormula,
  `numerico-fx[#${r}B/#18A*100]:dec[2]`,
  prevD == null ? `numerico-fx[#${r}C]:dec[2]` : `numerico-fx[#${prevD}D+#${r}C]:dec[2]`,
  `numerico-fx[100-#${r}D]:dec[2]`,
].join(' // '), S4);
mesh(19, 9.5, null, 'numerico-[0:100000]');
mesh(20, 4.75, 19, 'numerico-[0:100000]');
mesh(21, 2.0, 20, 'numerico-[0:100000]');
mesh(22, 0.425, 21, 'numerico-[0:100000]');
mesh(23, 0.075, 22, 'numerico-[0:100000]');
mesh(24, 0.01, 23, 'numerico-fx[#18A-(#19B+#20B+#21B+#22B+#23B)]:dec[1]'); // Fondo = residual
row(25, 'Curva granulométrica', 'numerico-gr5[x:#19A:#24A|y:#19E:#24E|ajuste:loglog|alto:70|t:Curva Granulométrica|xt:Abertura (mm)|yt:% Pasa|ly:Muestra]', S4);

// ── Gravedad específica (método del picnómetro/fiola) ────────────────────────
const S5 = 'Gravedad específica';
row(26, 'N° de picnómetro / fiola', 'list-[@fiola[Codigo]]', S5);
row(27, 'Peso frasco seco Pf (g)', 'numerico-fx[BUSCAR(fiola, #26A, Pf)]:dec[2]', S5);
row(28, 'Volumen frasco Vf (cm³)', 'numerico-fx[BUSCAR(fiola, #26A, Vf)]:dec[2]', S5);
row(29, 'Temperatura de ensayo (°C)', 'list-[@agua[Temperatura]]', S5);
row(30, 'Densidad del agua a T° (g/cm³)', 'numerico-fx[BUSCAR(agua, #29A, Densidad)]:dec[5]', S5);
row(31, 'Peso frasco + agua a T° Pfw (g)', 'numerico-fx[#27A+#28A*#30A]:dec[2]', S5);
row(32, 'Peso frasco + agua + suelo Pfws (g)', 'numerico-[0:100000]', S5);
row(33, 'Peso del suelo seco Pss (g)', 'numerico-[0:100000]', S5);
row(34, 'Gravedad específica de sólidos a T° (Gst)', 'numerico-fx[#33A/(#31A-(#32A-#33A))]:dec[3]', S5);
row(35, 'Densidad del agua a 20°C (ρ20°C)', 'numerico-fx[0.99821]:dec[5]', S5);
row(36, 'Factor de corrección K1', 'numerico-fx[#30A/#35A]:dec[5]', S5);
row(37, 'Gravedad específica de sólidos a 20°C (Gs20°C)', 'numerico-fx[#34A*#36A]:dec[3]', S5);

// ── Observaciones ────────────────────────────────────────────────────────────
row(38, 'Observaciones', 'texto-[]', 'Observaciones');

// ── Escribir PRV3 (Actividades) ──────────────────────────────────────────────
const wb1 = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb1, XLSX.utils.aoa_to_sheet(rows), 'Actividades');
XLSX.writeFile(wb1, 'Actividadesv1/PRV3_Proctor_v3.xlsx');

// ── Tablas auxiliares (códigos numéricos) ────────────────────────────────────
const aux = [
  ['tabla-moldes', 'Codigo', 12, 13, 14],
  ['tabla-moldes', 'Peso', 4118.4, 4111.7, 4285.1],
  ['tabla-moldes', 'Volumen', 938.7, 937.4, 940.8],
  ['tabla-taras', 'Codigo', 1, 2, 3, 4, 5, 6],
  ['tabla-taras', 'Peso', 45.2, 46.1, 44.8, 45.9, 47.0, 46.3],
  ['tabla-fiola', 'Codigo', 1, 2, 3],
  ['tabla-fiola', 'Pf', 165.32, 167.10, 164.88],
  ['tabla-fiola', 'Vf', 250.1, 250.3, 249.9],
  ['tabla-agua', 'Temperatura', 16, 18, 20, 21, 21.6, 22, 23, 24, 25, 26, 28, 30],
  ['tabla-agua', 'Densidad', 0.99897, 0.99862, 0.99821, 0.99799, 0.99786, 0.99777, 0.99754, 0.99730, 0.99705, 0.99678, 0.99624, 0.99565],
];
const wb2 = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb2, XLSX.utils.aoa_to_sheet(aux), 'Tablas auxiliares');
XLSX.writeFile(wb2, 'Actividadesv1/PRV3_TablasAuxiliares_v3.xlsx');

console.log('OK: PRV3_Proctor_v3.xlsx (' + (rows.length - 1) + ' filas) + PRV3_TablasAuxiliares_v3.xlsx');
