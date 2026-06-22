# Paquete de prueba — módulo numérico (proyecto carretero)

## Cómo importar
1. Crea (o abre) un proyecto en la web.
2. **Cargar → Importar Excel de Actividades** → `01_protocolos_numericos_v35.xlsx`
   (el validador integrado revisa las fichas al subir).
3. **Importar Excel de Ubicaciones** → `02_ubicaciones.xlsx`.
4. Sincroniza el celular (pull) y abre cualquier ubicación.

## Qué prueba cada ficha

| Ficha | Cubre |
|---|---|
| **VIS-100** Inspección Visual | Protocolo CLÁSICO (Sí/No/NA) + secciones — convive con los numéricos. |
| **GRA-101** Granulometría (huso) | Headers multi-columna, `val-`+`numerico-` mixtos, **banda de especificación** (`bandalo/bandahi`), **ajuste loglog**, `alto:75`, leyenda, **D50/P80 con INTERPXLOG**, guardas `SI/ESVACIO`, `:norma[]`, conformidad con rango `[1:1]`. |
| **PES-102** Pesos Retenidos | **Acumulado fila-a-fila** (`CELDA(C, FILA()-1)` — la misma fórmula en las 8 filas), **`COLUMNA(B)`** usada correctamente (columna 100% manual), `SUMA/CONTAR/PROMEDIO/CV/SIERROR`, celdas `blank`, gráfico de **barras** `alto:60`. |
| **PRO-103** Proctor Modificado | Densidad seca calculada por fila (`CELDA` misma fila), **óptimo de curva** (`PUNTOMAXIMOX/Y` → HOP y MDS), `REDONDEAR`, rangos, gráfico con **ajuste poli2** `alto:70`. |
| **PRC-201** Compactación Proctor (ASTM D698) | Réplica del Excel base CV: datos fijos del molde (`val-` suelto), 4 puntos por columnas (`CELDA(?, n)` por columna), **`:dec[n]`** por celda, intermedio **`:oculto`** (`PUNTOMAXIMOX` poli3), curva con **ajuste poli3** `alto:70`. |
| **DEN-104** Cono de Arena | **Matriz auxiliar** (catálogo Conos) + `list-[Conos[A]]` + `lookup-`, celda **`equipo-[]`**, **`porcentaje-[]`**, **`bool-[]`**, `comment-[]`, % compactación validado `[95:105]`. |
| **VER-105** Verificación Previa | **`fecha-[]`**, **`hora-[]`**, `equipo-[]`, `bool-[]` consumido por fórmula (`#4A==1`), `list-` inline, conformidad `[1:1]`. |

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

> Nota (A8): las celdas en blanco `// //` DEFINEN columnas de la sección —
> úsalas solo cuando quieras reservar la columna a propósito.

Generado por `scripts/buildNumericSample.ts` (las fichas pasan `validateProtocolSpec`).
