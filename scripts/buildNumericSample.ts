// Generador del paquete de prueba del módulo NUMÉRICO (proyecto carretero).
// Ejecutar:  npx -y tsx scripts/buildNumericSample.ts
//
// Produce en sample_numerico_v33/:
//   01_protocolos_numericos.xlsx  (Excel de actividades — importar primero)
//   02_ubicaciones.xlsx           (Excel de ubicaciones — importar después)
//   README.md                     (qué prueba cada ficha)
//
// Cada ficha numérica se valida con validateProtocolSpec ANTES de escribir el
// Excel: si el generador introduce un error de sintaxis, falla aquí y no en
// la app. (Dogfooding del validador.)

import * as fs from 'fs';
import * as path from 'path';
import { createRequire } from 'module';
import { validateProtocolSpec } from '../src/utils/protocolValidator';

const ROOT = process.cwd();
const req = createRequire(path.join(ROOT, 'flow-qaqc-web', 'package.json'));
// eslint-disable-next-line @typescript-eslint/no-var-requires
const XLSX = req('xlsx');

const OUT = path.join(ROOT, 'sample_numerico_v33');
fs.mkdirSync(OUT, { recursive: true });

// ─── Definición de fichas ───────────────────────────────────────────────────
// [partida, actividad, método, sección]
type Row = [string, string, string, string];
interface Proto { id: string; name: string; rows: Row[] }

const PROTOS: Proto[] = [
  // ── VIS-100: protocolo CLÁSICO (Sí/No/NA) — sanity de coexistencia ────────
  {
    id: 'VIS-100', name: 'Inspección Visual de Capa',
    rows: [
      ['1', 'Superficie uniforme, sin segregación visible', '', 'Superficie'],
      ['2', 'Bordes confinados y compactados', '', 'Superficie'],
      ['3', 'Sin acumulación de agua en la plataforma', '', 'Drenaje'],
      ['4', 'Señalización temporal de obra instalada', '', 'Seguridad'],
    ],
  },

  // ── GRA-101: granulometría con HUSO + curva log + D50/P80 ─────────────────
  // Prueba: headers multi-col, filas val+manual, banda de especificación,
  // ajuste loglog, alto:, leyenda, INTERPXLOG, SI/ESVACIO, norma, secciones.
  {
    id: 'GRA-101', name: 'Granulometría por Tamizado (Huso)',
    rows: (() => {
      const tamices = [50.8, 38.1, 25.4, 19.0, 12.7, 9.5, 4.75, 2.00, 0.425, 0.075];
      const nombres = ['2"', '1 1/2"', '1"', '3/4"', '1/2"', '3/8"', 'N°4', 'N°10', 'N°40', 'N°200'];
      const husoLo  = [100, 90, 75, 60, 45, 35, 25, 15, 5, 0];
      const husoHi  = [100, 100, 95, 85, 70, 60, 45, 30, 15, 8];
      const rows: Row[] = [
        ['', 'Encabezados de tabla', 'col-[A][Tamaño (mm)] // col-[B][% Pasa] // col-[C][Huso inf.] // col-[D][Huso sup.]', 'Tamizado'],
      ];
      tamices.forEach((t, i) => {
        const norma = i === tamices.length - 1 ? ':norma[MTC E-107]' : '';
        rows.push([
          String(i + 1), `Tamiz ${nombres[i]}`,
          `val-[${t}] // numerico-[0:100]${norma} // val-[${husoLo[i]}] // val-[${husoHi[i]}]`,
          'Tamizado',
        ]);
      });
      rows.push(
        ['11', 'D50 — tamaño al 50% que pasa (mm)',
          'numerico-fx[REDONDEAR(INTERPXLOG(#1A:#10A, #1B:#10B, 50), 2)]', 'Resultados'],
        ['12', 'P80 — tamaño al 80% que pasa (mm)',
          'numerico-fx[REDONDEAR(INTERPXLOG(#1A:#10A, #1B:#10B, 80), 2)]', 'Resultados'],
        ['13', 'Conformidad D50 ≥ 2 mm (1 = cumple)',
          'numerico-fx[SI(ESVACIO(#11A), 0, SI(#11A>=2, 1, 0))]:[1:1]', 'Resultados'],
        ['14', 'Curva granulométrica con huso de especificación',
          'numerico-gr5[x:#1A:#10A|y:#1B:#10B|ly:Muestra|bandalo:#1C:#10C|bandahi:#1D:#10D|ajuste:loglog|alto:75|t:Curva Granulométrica|xt:Tamaño de partícula (mm)|yt:% que pasa]',
          'Resultados'],
      );
      return rows;
    })(),
  },

  // ── PES-102: pesos retenidos — ACUMULADOR fila-a-fila + COLUMNA + stats ───
  // Prueba: FILA()/CELDA() (acumulado con la MISMA fórmula en todas las filas),
  // COLUMNA() bien usado (columna B 100% manual), CONTAR, PROMEDIO, CV,
  // SIERROR, Y/NO/ESVACIO, celdas blank, gráfico de barras con alto:.
  {
    id: 'PES-102', name: 'Granulometría por Pesos Retenidos',
    rows: (() => {
      const tamices = [25.4, 19.0, 12.7, 9.5, 4.75, 2.00, 0.425, 0.075];
      const acum = 'numerico-fx[SI(FILA()>1, CELDA(C, FILA()-1) + CELDA(B), CELDA(B))]';
      const pasa = 'numerico-fx[SI(Y(NO(ESVACIO(CELDA(C))), #9C>0), REDONDEAR(100 - CELDA(C)/#9C*100, 1))]:[0:100]';
      const rows: Row[] = [
        ['', 'Encabezados de tabla', 'col-[A][Tamiz (mm)] // col-[B][Peso ret. (g)] // col-[C][Ret. acum. (g)] // col-[D][% Pasa]', 'Pesos'],
      ];
      tamices.forEach((t, i) => {
        rows.push([String(i + 1), `Tamiz ${t} mm`, `val-[${t}] // numerico-[0:5000] // ${acum} // ${pasa}`, 'Pesos']);
      });
      rows.push(
        ['9', 'Resumen — masa total y tamices pesados',
          'val-[RESUMEN] // // numerico-fx[SUMA(COLUMNA(B))] // numerico-fx[CONTAR(COLUMNA(B))]', 'Resumen'],
        ['10', 'Estadística — promedio y CV de pesos (no va al reporte)',
          'val-[Estadística]:nopdf // // numerico-fx[REDONDEAR(PROMEDIO(#1B:#8B), 1)]:nopdf // numerico-fx[REDONDEAR(SIERROR(CV(#1B:#8B), 0), 1)]:nopdf', 'Resumen'],
        ['11', 'Pesos retenidos por tamiz',
          'numerico-gr3[x:#1A:#8A|y:#1B:#8B|t:Pesos retenidos por tamiz|xt:Tamiz (mm)|yt:Peso (g)|alto:60]', 'Resumen'],
      );
      return rows;
    })(),
  },

  // ── PRO-103: Proctor — densidad seca calculada + óptimo + ajuste poli2 ────
  // Prueba: fórmula por fila con CELDA() misma-fila, PUNTOMAXIMOX/Y (HOP/MDS),
  // REDONDEAR, rangos de validación, gráfico con ajuste poli2 y alto:.
  {
    id: 'PRO-103', name: 'Compactación Proctor Modificado',
    rows: (() => {
      const dseca = 'numerico-fx[SI(Y(NO(ESVACIO(CELDA(B))), NO(ESVACIO(CELDA(C)))), REDONDEAR(CELDA(C)/(1+CELDA(B)/100), 3))]:[1.4:2.4]';
      const rows: Row[] = [
        ['', 'Encabezados de tabla', 'col-[A][Punto] // col-[B][Humedad (%)] // col-[C][Dens. húmeda (g/cm³)] // col-[D][Dens. seca (g/cm³)]', 'Puntos'],
      ];
      for (let i = 1; i <= 5; i++) {
        rows.push([String(i), `Punto de compactación ${i}`, `val-[${i}] // numerico-[4:20] // numerico-[1.5:2.6] // ${dseca}`, 'Puntos']);
      }
      rows.push(
        // v34 — Cálculo intermedio OCULTO (Mejora 6): existe solo para calcular;
        // ni la app ni el PDF lo muestran. El máximo es ALGEBRAICO (derivada=0).
        ['6', '(interno) HOP sin redondear',
          'numerico-fx[PUNTOMAXIMOX(#1B:#5B, #1D:#5D, 3)]:oculto', 'Resultados'],
        // A8 — SIN `// //` de relleno: las celdas blank también declaran columnas
        // y la sección Resultados salía con 4 cols (A-D) teniendo solo 2.
        ['7', 'Humedad óptima (%) — máximo algebraico de la polinómica g3',
          'val-[HOP] // numerico-fx[REDONDEAR(#6A, 1)]:[4:20]:dec[1]', 'Resultados'],
        ['8', 'Máxima densidad seca (g/cm³)',
          'val-[MDS] // numerico-fx[REDONDEAR(PUNTOMAXIMOY(#1B:#5B, #1D:#5D, 3), 3)]:[1.6:2.4]:dec[3]', 'Resultados'],
        // Dato auxiliar visible en app pero EXCLUIDO del PDF (Mejora 6: :nopdf).
        ['9', 'Condición del ensayo (no va al reporte)',
          'comment-[Normal, Repetido, Con observación]:nopdf', 'Resultados'],
        ['10', 'Curva de compactación — puntos sueltos + polinómica g3 + punto máximo',
          'numerico-gr1[x:#1B:#5B|y:#1D:#5D|ly:Puntos de ensayo|ajuste:poli3|alto:70|t:Curva de Compactación|xt:Contenido de humedad (%)|yt:Densidad seca (g/cm³)]',
          'Resultados'],
      );
      return rows;
    })(),
  },

  // ── PRC-201: ENSAYO DE EJEMPLO convertido (Excel base CV — ASTM D698) ─────
  // Réplica del formato real: molde (datos fijos), 4 puntos de densidad máxima
  // seca, contenido de humedad por punto, y resultados con máximo algebraico.
  // Usa: secciones con columnas variables (1→4→4→2), :dec por celda, :oculto.
  {
    id: 'PRC-201', name: 'Compactación Proctor (ASTM D698)',
    rows: (() => {
      const fxCol = (col: string, expr: string, extra = '') =>
        `numerico-fx[${expr.split('?').join(col)}]${extra}`;
      const porCol = (mk: (c: string) => string) => ['A', 'B', 'C', 'D'].map(mk).join(' // ');
      const rows: Row[] = [
        ['1', 'Fecha de ensayo', 'fecha-[]', 'Datos de muestreo'],
        // Constantes referenciables (#2A/#3A): una fila de un único `val-[]` se
        // parsea como matrix-data y NO entra al scope → usar fórmula literal.
        ['2', 'Peso del molde (g)', 'numerico-fx[4111.7]:dec[1]', 'Datos de muestreo'],
        ['3', 'Volumen del molde (cm³)', 'numerico-fx[937.4]:dec[1]', 'Datos de muestreo'],
        ['', 'Encabezados puntos', 'col-[A][Punto 1] // col-[B][Punto 2] // col-[C][Punto 3] // col-[D][Punto 4]', 'Determinación de densidad máxima seca'],
        ['4', 'Peso molde + suelo (g)', porCol(() => 'numerico-[4500:7000]:dec[1]'), 'Determinación de densidad máxima seca'],
        ['5', 'Peso suelo compactado (g)',
          porCol(c => fxCol(c, 'SI(NO(ESVACIO(CELDA(?, 4))), REDONDEAR(CELDA(?, 4) - #2A, 1))', ':dec[1]')),
          'Determinación de densidad máxima seca'],
        ['6', 'Densidad húmeda (g/cm³)',
          porCol(c => fxCol(c, 'SI(NO(ESVACIO(CELDA(?, 5))), REDONDEAR(CELDA(?, 5)/#3A, 3))', ':[1.5:2.6]:dec[3]')),
          'Determinación de densidad máxima seca'],
        ['7', 'Suelo húmedo + recipiente (g)', porCol(() => 'numerico-[100:2000]:dec[2]'), 'Determinación de contenido de humedad'],
        ['8', 'Suelo seco + recipiente (g)', porCol(() => 'numerico-[100:2000]:dec[2]'), 'Determinación de contenido de humedad'],
        ['9', 'Peso del recipiente (g)', porCol(() => 'numerico-[50:1000]:dec[2]'), 'Determinación de contenido de humedad'],
        ['10', 'Peso del agua (g)',
          porCol(c => fxCol(c, 'SI(Y(NO(ESVACIO(CELDA(?, 7))), NO(ESVACIO(CELDA(?, 8)))), REDONDEAR(CELDA(?, 7) - CELDA(?, 8), 2))', ':dec[2]')),
          'Determinación de contenido de humedad'],
        ['11', 'Peso del suelo seco (g)',
          porCol(c => fxCol(c, 'SI(Y(NO(ESVACIO(CELDA(?, 8))), NO(ESVACIO(CELDA(?, 9)))), REDONDEAR(CELDA(?, 8) - CELDA(?, 9), 2))', ':dec[2]')),
          'Determinación de contenido de humedad'],
        ['12', 'Contenido de humedad (%)',
          porCol(c => fxCol(c, 'SI(Y(NO(ESVACIO(CELDA(?, 10))), CELDA(?, 11)>0), REDONDEAR(CELDA(?, 10)/CELDA(?, 11)*100, 2))', ':[0:40]:dec[2]')),
          'Determinación de contenido de humedad'],
        ['13', 'Densidad seca (g/cm³)',
          porCol(c => fxCol(c, 'SI(Y(NO(ESVACIO(CELDA(?, 6))), NO(ESVACIO(CELDA(?, 12)))), REDONDEAR(CELDA(?, 6)/(1 + CELDA(?, 12)/100), 3))', ':[1.4:2.2]:dec[3]')),
          'Determinación de contenido de humedad'],
        ['14', '(interno) óptimo sin redondear',
          'numerico-fx[PUNTOMAXIMOX(#12A:#12D, #13A:#13D, 3)]:oculto', 'Resultados'],
        ['15', 'Densidad máx (g/cm³)',
          'val-[MDS] // numerico-fx[REDONDEAR(PUNTOMAXIMOY(#12A:#12D, #13A:#13D, 3), 3)]:[1.5:2.0]:dec[3]', 'Resultados'],
        ['16', '% Óptimo de humedad',
          'val-[HOP] // numerico-fx[REDONDEAR(#14A, 1)]:[5:25]:dec[1]', 'Resultados'],
        ['17', 'Curva de compactación',
          'numerico-gr1[x:#12A:#12D|y:#13A:#13D|ly:Curva Proctor|ajuste:poli3|alto:70|t:Curva de Compactación|xt:Humedad %|yt:Densidad Seca (gr/cm³)]',
          'Resultados'],
      ];
      return rows;
    })(),
  },

  // ── DEN-104: Cono de Arena — matriz + lookup + list + equipo + bool ───────
  // Prueba: matriz auxiliar (catálogo de conos), list desde matriz, lookup,
  // celda equipo-[], porcentaje-[], bool-[], comment-[], guardas SI/Y/ESVACIO,
  // % compactación con rango, norma, secciones.
  {
    id: 'DEN-104', name: 'Densidad de Campo — Cono de Arena',
    rows: [
      ['1', 'Código del cono utilizado (módulo Equipos)', 'equipo-[Cono de arena]', 'Datos del equipo'],
      ['2', 'N° de cono según catálogo', 'list-[Conos[A]]', 'Datos del equipo'],
      ['3', 'Densidad de la arena calibrada (g/cm³)', 'lookup-[#2A, Conos, A, B]', 'Datos del equipo'],
      ['4', 'Peso de arena empleada (g)', 'numerico-[1000:9000]:norma[ASTM D1556]', 'Ensayo'],
      ['5', 'Volumen del hoyo (cm³)', 'numerico-fx[SI(Y(NO(ESVACIO(#4A)), #3A>0), REDONDEAR(#4A/#3A, 1))]', 'Ensayo'],
      ['6', 'Peso del material extraído (g)', 'numerico-[1000:15000]', 'Ensayo'],
      ['7', 'Humedad del material', 'porcentaje-[0:25]:norma[ASTM D2216]', 'Ensayo'],
      ['8', 'Densidad seca in situ (g/cm³)',
        'numerico-fx[SI(Y(#5A>0, NO(ESVACIO(#6A))), REDONDEAR(#6A/#5A/(1+#7A/100), 3))]:[1.5:2.4]', 'Ensayo'],
      ['9', '% Compactación (MDS laboratorio = 2.10 g/cm³)',
        'numerico-fx[SI(ESVACIO(#8A), 0, REDONDEAR(#8A/2.10*100, 1))]:[95:105]', 'Resultados'],
      ['10', '¿Cumple compactación mínima?', 'bool-[]', 'Resultados'],
      ['11', 'Dictamen del ensayo', 'comment-[Conforme, Observado, Reensayo]', 'Resultados'],
      ['', 'Catálogo de conos calibrados', 'matrix-[Conos] // col-[A][N° Cono] // col-[B][Densidad arena]', 'Resultados'],
      ['', 'Cono C-01', 'val-[C-01] // val-[1.42]', 'Resultados'],
      ['', 'Cono C-02', 'val-[C-02] // val-[1.45]', 'Resultados'],
      ['', 'Cono C-03', 'val-[C-03] // val-[1.39]', 'Resultados'],
    ],
  },

  // ── VER-105: tipos v32 puros — fecha/hora/equipo/bool/list/percent ────────
  // Prueba: cada tipo nuevo en fila simple, fórmula que consume bool (1/0) y
  // valida con rango exacto [1:1].
  {
    id: 'VER-105', name: 'Verificación Previa de Campo',
    rows: [
      ['1', 'Fecha de ensayo', 'fecha-[]', 'Trazabilidad'],
      ['2', 'Hora de inicio', 'hora-[]', 'Trazabilidad'],
      ['3', 'Balanza utilizada (código)', 'equipo-[Balanza]', 'Trazabilidad'],
      ['4', '¿Calibración del equipo vigente?', 'bool-[]', 'Trazabilidad'],
      ['5', 'Condición climática', 'list-[Soleado, Nublado, Lluvia ligera]', 'Condiciones'],
      ['6', 'Temperatura ambiente (°C)', 'numerico-[5:45]', 'Condiciones'],
      ['7', 'Apto para ensayar (1 = Sí)', 'numerico-fx[SI(Y(#4A==1, #6A>=5), 1, 0)]:[1:1]', 'Condiciones'],
      ['8', 'Observación', 'comment-[Sin observaciones, Ver nota en bitácora]', 'Condiciones'],
    ],
  },
];

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

// ─── 01_protocolos_numericos.xlsx ───────────────────────────────────────────
const headerA = ['ID_Protocolo', 'Protocolo', 'PartidaItem', 'Actividad realizada', 'Método de validación', 'Sección'];
const aoaA: (string)[][] = [headerA];
for (const p of PROTOS) {
  for (const [partida, desc, metodo, seccion] of p.rows) {
    aoaA.push([p.id, p.name, partida, desc, metodo, seccion]);
  }
}
const wbA = XLSX.utils.book_new();
const wsA = XLSX.utils.aoa_to_sheet(aoaA);
wsA['!cols'] = [{ wch: 12 }, { wch: 34 }, { wch: 10 }, { wch: 46 }, { wch: 110 }, { wch: 16 }];
XLSX.utils.book_append_sheet(wbA, wsA, 'Actividades');
XLSX.writeFile(wbA, path.join(OUT, '01_protocolos_numericos_v35.xlsx'));

// ─── 02_ubicaciones.xlsx ────────────────────────────────────────────────────
const headerU = ['Ubicación', 'Ubicación_Sola', 'Especialidad_Sola', 'PLANO DE REFERENCIA', 'ID_Protocolos'];
const aoaU = [
  headerU,
  ['Tramo 1 / Subrasante PR0+000', 'T1 PR0+000', 'Subrasante', 'PL-NUM-T1-001', 'VIS-100,GRA-101,PES-102,DEN-104,VER-105'],
  ['Tramo 1 / Subrasante PR0+150', 'T1 PR0+150', 'Subrasante', 'PL-NUM-T1-001', 'VIS-100,DEN-104,VER-105'],
  ['Tramo 2 / Subbase PR0+300',    'T2 PR0+300', 'Subbase',    'PL-NUM-T2-001', 'GRA-101,PRO-103,PRC-201,DEN-104,VER-105'],
  ['Tramo 3 / Base PR1+150',       'T3 PR1+150', 'Base',       'PL-NUM-T3-001', 'GRA-101,PES-102,PRO-103,VER-105'],
];
const wbU = XLSX.utils.book_new();
const wsU = XLSX.utils.aoa_to_sheet(aoaU);
wsU['!cols'] = [{ wch: 30 }, { wch: 14 }, { wch: 16 }, { wch: 18 }, { wch: 48 }];
XLSX.utils.book_append_sheet(wbU, wsU, 'Ubicaciones');
XLSX.writeFile(wbU, path.join(OUT, '02_ubicaciones.xlsx'));

// ─── README ─────────────────────────────────────────────────────────────────
fs.writeFileSync(path.join(OUT, 'README.md'), `# Paquete de prueba — módulo numérico (proyecto carretero)

## Cómo importar
1. Crea (o abre) un proyecto en la web.
2. **Cargar → Importar Excel de Actividades** → \`01_protocolos_numericos_v35.xlsx\`
   (el validador integrado revisa las fichas al subir).
3. **Importar Excel de Ubicaciones** → \`02_ubicaciones.xlsx\`.
4. Sincroniza el celular (pull) y abre cualquier ubicación.

## Qué prueba cada ficha

| Ficha | Cubre |
|---|---|
| **VIS-100** Inspección Visual | Protocolo CLÁSICO (Sí/No/NA) + secciones — convive con los numéricos. |
| **GRA-101** Granulometría (huso) | Headers multi-columna, \`val-\`+\`numerico-\` mixtos, **banda de especificación** (\`bandalo/bandahi\`), **ajuste loglog**, \`alto:75\`, leyenda, **D50/P80 con INTERPXLOG**, guardas \`SI/ESVACIO\`, \`:norma[]\`, conformidad con rango \`[1:1]\`. |
| **PES-102** Pesos Retenidos | **Acumulado fila-a-fila** (\`CELDA(C, FILA()-1)\` — la misma fórmula en las 8 filas), **\`COLUMNA(B)\`** usada correctamente (columna 100% manual), \`SUMA/CONTAR/PROMEDIO/CV/SIERROR\`, celdas \`blank\`, gráfico de **barras** \`alto:60\`. |
| **PRO-103** Proctor Modificado | Densidad seca calculada por fila (\`CELDA\` misma fila), **óptimo de curva** (\`PUNTOMAXIMOX/Y\` → HOP y MDS), \`REDONDEAR\`, rangos, gráfico con **ajuste poli2** \`alto:70\`. |
| **PRC-201** Compactación Proctor (ASTM D698) | Réplica del Excel base CV: datos fijos del molde (\`val-\` suelto), 4 puntos por columnas (\`CELDA(?, n)\` por columna), **\`:dec[n]\`** por celda, intermedio **\`:oculto\`** (\`PUNTOMAXIMOX\` poli3), curva con **ajuste poli3** \`alto:70\`. |
| **DEN-104** Cono de Arena | **Matriz auxiliar** (catálogo Conos) + \`list-[Conos[A]]\` + \`lookup-\`, celda **\`equipo-[]\`**, **\`porcentaje-[]\`**, **\`bool-[]\`**, \`comment-[]\`, % compactación validado \`[95:105]\`. |
| **VER-105** Verificación Previa | **\`fecha-[]\`**, **\`hora-[]\`**, \`equipo-[]\`, \`bool-[]\` consumido por fórmula (\`#4A==1\`), \`list-\` inline, conformidad \`[1:1]\`. |

## Guion de prueba sugerido
1. **GRA-101**: llena % Pasa (ej: 100,95,82,70,55,42,30,18,8,3) → la curva cae dentro
   del huso, D50≈11.4 y P80≈24.2; deja un valor fuera del huso para ver el banner.
2. **PES-102**: llena pesos → mira el acumulado correr fila a fila y el % Pasa
   aparecer cuando el TOTAL (fila 9) existe.
3. **PRO-103**: humedad 8,10,12,14,16 y densidades húmedas ~2.0,2.15,2.24,2.20,2.12
   → HOP≈12, MDS dentro de rango, curva con parábola punteada.
4. **DEN-104**: elige cono del catálogo → la densidad se autocompleta por lookup.
5. **VER-105**: marca el bool en "No" → la fila 7 valida 0∉[1:1] y muestra ✗.
6. Modifica este Excel (agrega un tamiz a GRA-101) y reimporta → la reconciliación
   agrega la fila sin borrar lo llenado (web propaga, celular reconcilia).
7. Genera el PDF del dossier → los numéricos salen con el formato del audit
   (secciones, letras, ✓ por celda) y gráficos numerados ("Gráfico 1 — …").

> Nota (A8): las celdas en blanco \`// //\` DEFINEN columnas de la sección —
> úsalas solo cuando quieras reservar la columna a propósito.

Generado por \`scripts/buildNumericSample.ts\` (las fichas pasan \`validateProtocolSpec\`).
`);

console.log(`\nOK → ${OUT}`);
console.log('  01_protocolos_numericos_v35.xlsx');
console.log('  02_ubicaciones.xlsx');
console.log('  README.md');
