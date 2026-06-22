// Generador del EJEMPLO COMPLETO de un proyecto CARRETERO.
// Ejecutar:  npx -y tsx scripts/buildEjemploCarretero.ts
//
// Produce en ejemplo_carretero/:
//   01_actividades_carretera.xlsx   (protocolos/actividades — importar 1º)
//   02_ubicaciones_carretera.xlsx   (ubicaciones — importar 2º)
//   03_sectores_carretera.xlsx      (4 tramos con polígono WGS84 — importar 3º)
//   README.md
//
// Tres ensayos FIELES a los Excel base entregados (solo la parte de CÁLCULO,
// sin filas de entrada de datos personales/administrativos):
//   PRC-D698  Compactación Proctor (ASTM D698)
//   CAR-D1556 Densidad de campo — Cono de Arena (ASTM D1556)
//   GRA-D6913 Análisis granulométrico por tamizado (ASTM D6913)
//
// Cada ficha se valida con validateProtocolSpec ANTES de escribir el Excel.

import * as fs from 'fs';
import * as path from 'path';
import { createRequire } from 'module';
import { validateProtocolSpec } from '../src/utils/protocolValidator';

const ROOT = process.cwd();
const req = createRequire(path.join(ROOT, 'flow-qaqc-web', 'package.json'));
// eslint-disable-next-line @typescript-eslint/no-var-requires
const XLSX = req('xlsx');

const OUT = path.join(ROOT, 'ejemplo_carretero');
fs.mkdirSync(OUT, { recursive: true });

// ─── Tipos ──────────────────────────────────────────────────────────────────
// [partida, actividad, método, sección]
type Row = [string, string, string, string];
interface Proto { id: string; name: string; rows: Row[] }

// ═══════════════════════════════════════════════════════════════════════════
//  ENSAYO 1 — PROCTOR (ASTM D698)
//  Réplica del Excel CV-QC-PR-260101-AB: molde (datos fijos), 4 puntos de
//  densidad húmeda, contenido de humedad por punto, densidad seca y resultados
//  (MDS / HOP) por máximo algebraico de la curva polinómica de grado 3.
// ═══════════════════════════════════════════════════════════════════════════
const PROCTOR: Proto = {
  id: 'PRC-D698', name: 'Compactación Proctor (ASTM D698)',
  rows: (() => {
    const fxCol = (col: string, expr: string, extra = '') =>
      `numerico-fx[${expr.split('?').join(col)}]${extra}`;
    const porCol = (mk: (c: string) => string) => ['A', 'B', 'C', 'D'].map(mk).join(' // ');
    return [
      // Constantes del molde como fórmula literal: una fila de un único `val-[]`
      // se parsea como matrix-data y NO entra al scope (no sería referenciable).
      ['1', 'Peso del molde (g)', 'numerico-fx[4111.7]:dec[1]', 'Datos del molde'],
      ['2', 'Volumen del molde (cm³)', 'numerico-fx[937.4]:dec[1]', 'Datos del molde'],
      ['', 'Encabezados de puntos', 'col-[A][Punto 1] // col-[B][Punto 2] // col-[C][Punto 3] // col-[D][Punto 4]', 'Determinación de densidad húmeda'],
      ['3', 'Peso molde + suelo compactado (g)', porCol(() => 'numerico-[4500:7000]:dec[1]'), 'Determinación de densidad húmeda'],
      ['4', 'Peso del suelo compactado (g)',
        porCol(c => fxCol(c, 'SI(NO(ESVACIO(CELDA(?, 3))), REDONDEAR(CELDA(?, 3) - #1A, 1))', ':dec[1]')),
        'Determinación de densidad húmeda'],
      ['5', 'Densidad húmeda (g/cm³)',
        porCol(c => fxCol(c, 'SI(NO(ESVACIO(CELDA(?, 4))), REDONDEAR(CELDA(?, 4)/#2A, 3))', ':[1.5:2.6]:dec[3]')),
        'Determinación de densidad húmeda'],
      ['6', 'Suelo húmedo + recipiente (g)', porCol(() => 'numerico-[100:2000]:dec[2]'), 'Determinación de contenido de humedad'],
      ['7', 'Suelo seco + recipiente (g)', porCol(() => 'numerico-[100:2000]:dec[2]'), 'Determinación de contenido de humedad'],
      ['8', 'Peso del recipiente (g)', porCol(() => 'numerico-[20:1000]:dec[2]'), 'Determinación de contenido de humedad'],
      ['9', 'Peso del agua (g)',
        porCol(c => fxCol(c, 'SI(Y(NO(ESVACIO(CELDA(?, 6))), NO(ESVACIO(CELDA(?, 7)))), REDONDEAR(CELDA(?, 6) - CELDA(?, 7), 2))', ':dec[2]')),
        'Determinación de contenido de humedad'],
      ['10', 'Peso del suelo seco (g)',
        porCol(c => fxCol(c, 'SI(Y(NO(ESVACIO(CELDA(?, 7))), NO(ESVACIO(CELDA(?, 8)))), REDONDEAR(CELDA(?, 7) - CELDA(?, 8), 2))', ':dec[2]')),
        'Determinación de contenido de humedad'],
      ['11', 'Contenido de humedad (%)',
        porCol(c => fxCol(c, 'SI(Y(NO(ESVACIO(CELDA(?, 9))), CELDA(?, 10)>0), REDONDEAR(CELDA(?, 9)/CELDA(?, 10)*100, 2))', ':[0:40]:dec[2]')),
        'Determinación de contenido de humedad'],
      ['12', 'Densidad seca (g/cm³)',
        porCol(c => fxCol(c, 'SI(Y(NO(ESVACIO(CELDA(?, 5))), NO(ESVACIO(CELDA(?, 11)))), REDONDEAR(CELDA(?, 5)/(1 + CELDA(?, 11)/100), 3))', ':[1.4:2.2]:dec[3]')),
        'Determinación de contenido de humedad'],
      ['13', '(interno) humedad óptima sin redondear',
        'numerico-fx[PUNTOMAXIMOX(#11A:#11D, #12A:#12D, 3)]:oculto', 'Resultados'],
      ['14', 'Máxima densidad seca — MDS (g/cm³)',
        'val-[MDS] // numerico-fx[REDONDEAR(PUNTOMAXIMOY(#11A:#11D, #12A:#12D, 3), 3)]:[1.5:2.4]:dec[3]:norma[ASTM D698]', 'Resultados'],
      ['15', 'Óptimo contenido de humedad — HOP (%)',
        'val-[HOP] // numerico-fx[REDONDEAR(#13A, 1)]:[5:25]:dec[1]', 'Resultados'],
      ['16', 'Curva de compactación',
        'numerico-gr1[x:#11A:#11D|y:#12A:#12D|ly:Curva Proctor|ajuste:poli3|alto:70|t:Curva de Compactación|xt:Contenido de humedad (%)|yt:Densidad seca (g/cm³)]',
        'Resultados'],
    ];
  })(),
};

// ═══════════════════════════════════════════════════════════════════════════
//  ENSAYO 2 — CONO DE ARENA (ASTM D1556)
//  Réplica del Excel SGS-CA12-Z3-045: volumen del hoyo por arena calibrada,
//  densidad húmeda in situ, contenido de humedad (D2216), densidad seca in
//  situ y grado de compactación contra la MDS del Proctor de referencia.
//  Todo en una sola columna (referencias #nA entre filas).
// ═══════════════════════════════════════════════════════════════════════════
const CONO: Proto = {
  id: 'CAR-D1556', name: 'Densidad de Campo — Cono de Arena (ASTM D1556)',
  rows: [
    ['1', 'Peso inicial (arena + frasco) (g)', 'numerico-[2000:25000]:dec[1]', 'Volumen del hoyo'],
    ['2', 'Peso final (arena remanente + frasco) (g)', 'numerico-[1000:25000]:dec[1]', 'Volumen del hoyo'],
    ['3', 'Peso de arena empleada (g)',
      'numerico-fx[SI(Y(NO(ESVACIO(#1A)), NO(ESVACIO(#2A))), REDONDEAR(#1A - #2A, 1))]:dec[1]', 'Volumen del hoyo'],
    ['4', 'Peso de arena en cono y placa base (g)', 'numerico-[300:5000]:dec[1]', 'Volumen del hoyo'],
    ['5', 'Peso de arena en el hoyo (g)',
      'numerico-fx[SI(Y(NO(ESVACIO(#3A)), NO(ESVACIO(#4A))), REDONDEAR(#3A - #4A, 1))]:dec[1]', 'Volumen del hoyo'],
    ['6', 'Densidad de la arena calibrada (g/cm³)', 'numerico-[1:2]:dec[3]', 'Volumen del hoyo'],
    ['7', 'Volumen del hoyo (cm³)',
      'numerico-fx[SI(Y(NO(ESVACIO(#5A)), #6A>0), REDONDEAR(#5A/#6A, 1))]:dec[1]', 'Volumen del hoyo'],

    ['8', 'Peso de muestra húmeda extraída + recipiente (g)', 'numerico-[1000:30000]:dec[1]', 'Densidad húmeda in situ'],
    ['9', 'Peso del recipiente (g)', 'numerico-[0:5000]:dec[1]', 'Densidad húmeda in situ'],
    ['10', 'Peso de muestra húmeda (g)',
      'numerico-fx[SI(Y(NO(ESVACIO(#8A)), NO(ESVACIO(#9A))), REDONDEAR(#8A - #9A, 1))]:dec[1]', 'Densidad húmeda in situ'],
    ['11', 'Densidad húmeda in situ (g/cm³)',
      'numerico-fx[SI(Y(NO(ESVACIO(#10A)), #7A>0), REDONDEAR(#10A/#7A, 3))]:[1.5:2.6]:dec[3]', 'Densidad húmeda in situ'],

    ['12', 'Peso de muestra húmeda + tara (g)', 'numerico-[50:5000]:dec[2]', 'Contenido de humedad (ASTM D2216)'],
    ['13', 'Peso de muestra seca + tara (g)', 'numerico-[50:5000]:dec[2]', 'Contenido de humedad (ASTM D2216)'],
    ['14', 'Peso del agua (g)',
      'numerico-fx[SI(Y(NO(ESVACIO(#12A)), NO(ESVACIO(#13A))), REDONDEAR(#12A - #13A, 2))]:dec[2]', 'Contenido de humedad (ASTM D2216)'],
    ['15', 'Peso de la tara (g)', 'numerico-[0:2000]:dec[2]', 'Contenido de humedad (ASTM D2216)'],
    ['16', 'Peso de muestra seca (g)',
      'numerico-fx[SI(Y(NO(ESVACIO(#13A)), NO(ESVACIO(#15A))), REDONDEAR(#13A - #15A, 2))]:dec[2]', 'Contenido de humedad (ASTM D2216)'],
    ['17', 'Contenido de humedad (%)',
      'numerico-fx[SI(Y(NO(ESVACIO(#14A)), #16A>0), REDONDEAR(#14A/#16A*100, 2))]:[0:40]:dec[2]', 'Contenido de humedad (ASTM D2216)'],

    ['18', 'Densidad seca in situ (g/cm³)',
      'numerico-fx[SI(Y(NO(ESVACIO(#11A)), NO(ESVACIO(#17A))), REDONDEAR(#11A/(1 + #17A/100), 3))]:[1.4:2.4]:dec[3]', 'Resultados'],
    ['19', 'Máxima densidad seca del Proctor de referencia (g/cm³)', 'numerico-[1.5:2.5]:dec[3]', 'Resultados'],
    ['20', 'Grado de compactación (%)',
      'numerico-fx[SI(Y(NO(ESVACIO(#18A)), #19A>0), REDONDEAR(#18A/#19A*100, 1))]:[98:105]:dec[1]:norma[ASTM D1556]', 'Resultados'],
  ],
};

// ═══════════════════════════════════════════════════════════════════════════
//  ENSAYO 3 — GRANULOMETRÍA POR TAMIZADO (ASTM D6913)
//  Réplica del Excel SGS-C-Z3-025: peso retenido por tamiz → % retenido
//  parcial → % retenido acumulado → % que pasa, total de masa, parámetros
//  D60/D30/D10 (Cu, Cc) por interpolación log y curva granulométrica log-x.
// ═══════════════════════════════════════════════════════════════════════════
const GRANULO: Proto = {
  id: 'GRA-D6913', name: 'Análisis Granulométrico por Tamizado (ASTM D6913)',
  rows: (() => {
    const nombres   = ['2"', '1 1/2"', '1"', '3/4"', '1/2"', '3/8"', 'N°4', 'N°10', 'N°40', 'N°200'];
    const aberturas = [50.8, 38.1, 25.4, 19.0, 12.7, 9.5, 4.75, 2.00, 0.425, 0.075];
    const n = nombres.length;
    // %Ret parcial = peso ret / masa total retenida × 100
    const pRet  = 'numerico-fx[SI(Y(NO(ESVACIO(CELDA(C))), SUMA(COLUMNA(C))>0), REDONDEAR(CELDA(C)/SUMA(COLUMNA(C))*100, 1))]:dec[1]';
    // %Ret acumulado = acumulado de la fila anterior + %Ret de esta fila
    const pAcum = 'numerico-fx[SI(FILA()>1, REDONDEAR(CELDA(E, FILA()-1) + CELDA(D), 1), CELDA(D))]:dec[1]';
    // %Que pasa = 100 − %Ret acumulado
    const pPasa = 'numerico-fx[SI(NO(ESVACIO(CELDA(E))), REDONDEAR(100 - CELDA(E), 1))]:[0:100]:dec[1]';
    const rows: Row[] = [
      ['', 'Encabezados de tabla',
        'col-[A][Tamiz] // col-[B][Abertura (mm)] // col-[C][Peso retenido (g)] // col-[D][% Retenido] // col-[E][% Ret. acum.] // col-[F][% Que pasa]',
        'Tamizado'],
    ];
    nombres.forEach((nm, i) => {
      const norma = i === n - 1 ? ':norma[ASTM D6913]' : '';
      rows.push([
        String(i + 1), `Tamiz ${nm}`,
        `val-[${nm}] // val-[${aberturas[i]}] // numerico-[0:50000]:dec[1]${norma} // ${pRet} // ${pAcum} // ${pPasa}`,
        'Tamizado',
      ]);
    });
    rows.push(
      // Total en columna B (no en C): SUMA(COLUMNA(C)) NO debe incluir su propio
      // resultado, o el %Ret parcial de cada fila se calcularía contra el doble.
      ['11', 'Masa total retenida (g)',
        'val-[TOTAL] // numerico-fx[REDONDEAR(SUMA(COLUMNA(C)), 1)]:dec[1]', 'Tamizado'],
      ['12', 'D60 — tamaño al 60% que pasa (mm)',
        `numerico-fx[REDONDEAR(INTERPXLOG(#1B:#${n}B, #1F:#${n}F, 60), 3)]:dec[3]`, 'Parámetros'],
      ['13', 'D30 — tamaño al 30% que pasa (mm)',
        `numerico-fx[REDONDEAR(INTERPXLOG(#1B:#${n}B, #1F:#${n}F, 30), 3)]:dec[3]`, 'Parámetros'],
      ['14', 'D10 — tamaño al 10% que pasa (mm)',
        `numerico-fx[REDONDEAR(INTERPXLOG(#1B:#${n}B, #1F:#${n}F, 10), 3)]:dec[3]`, 'Parámetros'],
      ['15', 'Coeficiente de uniformidad  Cu = D60/D10',
        'numerico-fx[SI(#14A>0, REDONDEAR(#12A/#14A, 2))]:dec[2]', 'Parámetros'],
      ['16', 'Coeficiente de curvatura  Cc = D30² / (D60·D10)',
        'numerico-fx[SI(Y(#12A>0, #14A>0), REDONDEAR(#13A*#13A/(#12A*#14A), 2))]:dec[2]', 'Parámetros'],
      ['17', 'Curva granulométrica',
        `numerico-gr5[x:#1B:#${n}B|y:#1F:#${n}F|ly:% que pasa|ajuste:loglog|alto:75|t:Curva Granulométrica|xt:Abertura del tamiz (mm)|yt:% que pasa]`,
        'Parámetros'],
    );
    return rows;
  })(),
};

const PROTOS: Proto[] = [PROCTOR, CONO, GRANULO];

// ─── Validación previa (dogfooding del validador) ───────────────────────────
let totalIssues = 0;
for (const p of PROTOS) {
  const res = validateProtocolSpec(p.rows.map(([partida, desc, metodo]) => ({
    partida_item: partida || null,
    item_description: desc,
    validation_method: metodo || null,
  })));
  const errs = res.issues.filter(i => i.severity === 'error');
  const warns = res.issues.filter(i => i.severity === 'warning');
  console.log(`${p.id}  numérico=${res.isNumeric}  errores=${errs.length}  avisos=${warns.length}`);
  for (const i of errs) console.error(`   ✗ [${i.code}] ${i.message}`);
  for (const i of warns) console.warn(`   ⚠ [${i.code}] ${i.message}`);
  totalIssues += errs.length;
}
if (totalIssues > 0) {
  console.error(`\nABORTADO: ${totalIssues} errores de ficha — corregir el generador.`);
  process.exit(1);
}

// ─── 01_actividades_carretera.xlsx ──────────────────────────────────────────
const headerA = ['ID_Protocolo', 'Protocolo', 'PartidaItem', 'Actividad realizada', 'Método de validación', 'Sección'];
const aoaA: string[][] = [headerA];
for (const p of PROTOS) {
  for (const [partida, desc, metodo, seccion] of p.rows) {
    aoaA.push([p.id, p.name, partida, desc, metodo, seccion]);
  }
}
const wbA = XLSX.utils.book_new();
const wsA = XLSX.utils.aoa_to_sheet(aoaA);
wsA['!cols'] = [{ wch: 12 }, { wch: 40 }, { wch: 10 }, { wch: 48 }, { wch: 120 }, { wch: 30 }];
XLSX.utils.book_append_sheet(wbA, wsA, 'Actividades');
XLSX.writeFile(wbA, path.join(OUT, '01_actividades_carretera.xlsx'));

// ─── 02_ubicaciones_carretera.xlsx ──────────────────────────────────────────
const headerU = ['Ubicación', 'Ubicación_Sola', 'Especialidad_Sola', 'PLANO DE REFERENCIA', 'ID_Protocolos'];
const TODOS = 'PRC-D698,CAR-D1556,GRA-D6913';
const aoaU = [
  headerU,
  ['Tramo 1 / Subrasante PR0+000', 'T1 PR0+000', 'Movimiento de tierras', 'PL-CARR-T1-001', TODOS],
  ['Tramo 1 / Subrasante PR0+200', 'T1 PR0+200', 'Movimiento de tierras', 'PL-CARR-T1-001', 'CAR-D1556'],
  ['Tramo 2 / Subbase PR0+400',    'T2 PR0+400', 'Pavimentos',            'PL-CARR-T2-001', TODOS],
  ['Tramo 2 / Subbase PR0+600',    'T2 PR0+600', 'Pavimentos',            'PL-CARR-T2-001', 'CAR-D1556,GRA-D6913'],
  ['Tramo 3 / Base PR0+800',       'T3 PR0+800', 'Pavimentos',            'PL-CARR-T3-001', TODOS],
  ['Tramo 4 / Base PR1+000',       'T4 PR1+000', 'Pavimentos',            'PL-CARR-T4-001', 'CAR-D1556,GRA-D6913'],
];
const wbU = XLSX.utils.book_new();
const wsU = XLSX.utils.aoa_to_sheet(aoaU);
wsU['!cols'] = [{ wch: 32 }, { wch: 14 }, { wch: 22 }, { wch: 18 }, { wch: 30 }];
XLSX.utils.book_append_sheet(wbU, wsU, 'Ubicaciones');
XLSX.writeFile(wbU, path.join(OUT, '02_ubicaciones_carretera.xlsx'));

// ─── 03_sectores_carretera.xlsx ─────────────────────────────────────────────
// Formato wgs84-flat (name, lat, lng): una fila por vértice; SectorImporter
// arma el polígono en sentido de lectura y cierra el anillo automáticamente.
// Coordenadas DMS del documento «Coordenadas Tramo 1-4». S y Oeste → negativo.
const dms = (d: number, m: number, s: number) => -(d + m / 60 + s / 3600); // S / O
const TRAMOS: Record<string, Array<[number, number, number, number, number, number]>> = {
  // [latD, latM, latS, lngD, lngM, lngS]
  'Tramo 1': [
    [16, 20, 56.73, 71, 32, 37.19], [16, 20, 57.25, 71, 32, 33.21],
    [16, 21, 1.02, 71, 32, 33.54], [16, 21, 0.99, 71, 32, 37.59],
  ],
  'Tramo 2': [
    [16, 20, 57.25, 71, 32, 33.23], [16, 20, 57.65, 71, 32, 30.83],
    [16, 21, 1.14, 71, 32, 31.14], [16, 21, 1.01, 71, 32, 33.51],
  ],
  'Tramo 3': [
    [16, 20, 57.64, 71, 32, 30.87], [16, 20, 58.04, 71, 32, 28.72],
    [16, 21, 1.28, 71, 32, 29.01], [16, 21, 1.11, 71, 32, 31.15],
  ],
  'Tramo 4': [
    [16, 20, 58.05, 71, 32, 28.66], [16, 20, 58.45, 71, 32, 26.29],
    [16, 21, 1.65, 71, 32, 26.62], [16, 21, 1.34, 71, 32, 29.02],
  ],
};
const headerS = ['name', 'lat', 'lng'];
const aoaS: (string | number)[][] = [headerS];
for (const [name, verts] of Object.entries(TRAMOS)) {
  for (const [ld, lm, ls, gd, gm, gs] of verts) {
    aoaS.push([name, Number(dms(ld, lm, ls).toFixed(7)), Number(dms(gd, gm, gs).toFixed(7))]);
  }
}
const wbS = XLSX.utils.book_new();
const wsS = XLSX.utils.aoa_to_sheet(aoaS);
wsS['!cols'] = [{ wch: 12 }, { wch: 14 }, { wch: 14 }];
XLSX.utils.book_append_sheet(wbS, wsS, 'Sectores');
XLSX.writeFile(wbS, path.join(OUT, '03_sectores_carretera.xlsx'));

// ─── README.md ──────────────────────────────────────────────────────────────
fs.writeFileSync(path.join(OUT, 'README.md'), `# Ejemplo completo — Proyecto carretero

Juego de Excels para cargar un proyecto de control de calidad vial de punta a punta
(ubicaciones + sectores + ensayos). **No incluye el módulo de trazabilidad.**

## Orden de importación

1. **Crear el proyecto** (tipo carretero) en la app o la web.
2. **Importar Excel de Actividades** → \`01_actividades_carretera.xlsx\`
   (define los 3 ensayos numéricos y sus secciones/fórmulas).
3. **Importar Excel de Ubicaciones** → \`02_ubicaciones_carretera.xlsx\`
   (6 ubicaciones por progresiva; la columna ID_Protocolos indica qué ensayo se
   instancia en cada una).
4. **Importar Excel de Sectores** → \`03_sectores_carretera.xlsx\`
   (4 tramos con polígono WGS84 a partir de las coordenadas DMS del documento
   «Coordenadas Tramo 1-4»).
5. Sincroniza el celular (pull) y abre cualquier ubicación para llenar los ensayos.

## Ensayos incluidos (solo la parte de cálculo)

| ID | Ensayo | Norma | Resultado clave |
|----|--------|-------|-----------------|
| **PRC-D698**  | Compactación Proctor | ASTM D698  | MDS y HOP por máximo algebraico de la curva polinómica g3. |
| **CAR-D1556** | Densidad de campo — Cono de Arena | ASTM D1556 | Densidad seca in situ y grado de compactación vs MDS Proctor (≥ 98 %). |
| **GRA-D6913** | Granulometría por tamizado | ASTM D6913 | % que pasa por tamiz, D60/D30/D10, Cu, Cc y curva granulométrica. |

> Cada ficha contiene únicamente las filas de **cálculo**: las celdas de entrada
> (peso del molde, pesos retenidos, pesos húmedos/secos, etc.) se llenan en campo
> dentro de la app y el resto se calcula y valida automáticamente.

## Sectores

Tramo 1–4, polígono cuadrilátero (4 vértices) cada uno, convertidos de DMS a
decimal WGS84 (hemisferio Sur y meridiano Oeste → coordenadas negativas).
`);

console.log('\nGenerado en', OUT);
console.log('  01_actividades_carretera.xlsx');
console.log('  02_ubicaciones_carretera.xlsx');
console.log('  03_sectores_carretera.xlsx');
console.log('  README.md');
