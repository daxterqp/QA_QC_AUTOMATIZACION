# Protocolos de ejemplo — Flow QA/QC

Esta carpeta tiene dos archivos `.csv` para probar el nuevo flujo de **protocolos numéricos**:

| Archivo | Qué importa | Ruta en la app |
|---|---|---|
| `actividades-protocolos-ejemplo.csv` | 4 plantillas de protocolo (1 clásico + 3 numéricos) | `/file-upload` → tab **Actividades** |
| `ubicaciones-ejemplo.csv` | 5 ubicaciones que asocian los protocolos | `/file-upload` → tab **Ubicaciones** |

## Cómo importar

1. Abre cada CSV en **Excel** y guarda como `.xlsx` (Archivo → Guardar como → Libro de Excel).
2. En la app web, entra a un proyecto vacío → **Cargar** → tab **Actividades** → arrastra el `.xlsx`.
3. Repite para el de ubicaciones.
4. Verifica en `/locations` que aparecen las 5 ubicaciones con sus protocolos.
5. Entra a una ubicación → click sobre el protocolo → debería abrir el modo correcto:
   - `ARQ-PISOS` → flujo clásico **Sí / No / NA**.
   - `LAB-CONCRETO-RC`, `LAB-SUELOS-GRAN`, `MIN-LEY-CU` → tabla numérica.

> **Importante**: si Excel cambia las comas por punto-y-coma al guardar, el importador puede no leer las columnas. Si pasa, abre el CSV con Bloc de notas y verifica que el separador sea `,` (coma).

## Qué prueba cada protocolo

### 1. `ARQ-PISOS` — Clásico (4 items Sí/No/NA)
Para confirmar que el flujo viejo sigue funcionando sin cambios.

### 2. `LAB-CONCRETO-RC` — Manual + fórmulas (Resistencia a la compresión)
PartidaItem `1..8`. Fórmulas referencian items con sigilo `#`:
- Filas `1..4`: resistencias de 4 probetas en MPa, rango `[18:50]`.
- Fila `5` (`prom`) = `PROMEDIO(#1,#2,#3,#4)` con rango `[21:50]`.
- Fila `6` (`disp`) = `MAX(#1,#2,#3,#4) - MIN(#1,#2,#3,#4)` con rango `[0:8]`.
- Fila `7` (`cv`) = dispersión relativa % con rango `[0:15]`.
- Fila `8` (`ok`) = `SI(#5 >= 21, 1, 0)` — referencia al promedio (fila 5), valida contra `[1:1]`.

### 3. `MIN-LEY-CU` — Minería (Ley de cobre)
PartidaItem `1..7`:
- Filas `1..3` manuales: peso inicial, peso final, peso de cobre.
- Fila `4` (recuperación) = `REDONDEAR(#2/#1*100, 2)` con rango `[70:100]`.
- Fila `5` (ley) = `REDONDEAR(#3/#2*100, 4)` con rango `[0.5:30]`.
- Fila `6` (ratio) = `REDONDEAR(#3/#1*100, 4)` con rango `[0.1:25]`.
- Fila `7` (ok) = `SI(#5 >= 5, 1, 0)` con `[1:1]`.

### 4. `LAB-SUELOS-GRAN` — Gráficos (Análisis granulométrico)
PartidaItem `1..12`:
- Filas `1..4`: aberturas de tamiz (mm).
- Filas `5..8`: % pasante por cada tamiz.
- Fila `9` = `numerico-gr1[x:1,2,3,4-y:5,6,7,8]` — gráfico de líneas rectas.
- Fila `10` = `numerico-gr2[x:1,2,3,4-y:5,6,7,8]` — curva Bézier (los gráficos NO usan `#`, solo el partida directo).
- Filas `11, 12`: índices D50 y Cu calculados.

## Casos a verificar manualmente

| Caso | Esperado |
|---|---|
| Dejar todos los manuales vacíos | Los `fx` muestran `—`. Botón Enviar deshabilitado. |
| Llenar todos los manuales válidos | Los `fx` se calculan en cascada. Botón Enviar activo. |
| Meter un valor fuera de rango (ej: `a=60`) | Input rojo + banner amarillo "N valores fuera de rango". |
| Borrar `pi` en `MIN-LEY-CU` | `recup` y `ratio` se quedan vacíos (propagación de null). |
| Subir norma `MIN-LEY-CU.pdf` en file-upload | Botón "Ver norma" aparece en la cabecera del audit. |
| Crear referencia circular `a: numerico-fx[b]`, `b: numerico-fx[a]` | Ambas celdas: error rojo "Referencia circular". |

## Prompt para generar más protocolos con IA

Si necesitas armar más plantillas (ej: ensayo Próctor, slump test, ensayo a tracción, etc.), usa este prompt:

```
Necesito una tabla CSV con la estructura del importador Flow QA/QC. Columnas EXACTAS:

  ID_Protocolo,Protocolo,PartidaItem,Actividad realizada,Método de validación,Sección

Donde "Método de validación" sigue esta gramática:

  - Item subjetivo (Sí/No/NA): texto libre describiendo el método (ej "Visual", "Regla de 3 m").
  - Item numérico manual: numerico-[min:max]   ej: numerico-[18:50]
  - Item con fórmula:       numerico-fx[expr]                 (sin rango)
                            numerico-fx[expr]:[min:max]       (con rango opcional)
  - Item gráfico:           numerico-gr1[x:p1,p2-y:p3,p4]   (línea recta)
                            numerico-gr2[x:p1,p2-y:p3,p4]   (curva suavizada)

REGLAS:
- PartidaItem es un identificador ÚNICO dentro del protocolo. Recomendación: usa números secuenciales 1, 2, 3, 4...
- En fórmulas las referencias usan sigilo `#`: `#1`, `#5`, etc. → "valor del item con partida 1".
  Ejemplo: numerico-fx[PROMEDIO(#1,#2,#3,#4)] = promedia los items 1 a 4.
  Sin `#`, los números son literales: numerico-fx[#1+10] = item1 + 10.
- En gráficos NO se usa `#` — los xRefs/yRefs son partidas directas:
  numerico-gr1[x:1,2,3,4-y:5,6,7,8] = puntos (item1, item5), (item2, item6), ...
- En un mismo ID_Protocolo, o TODOS los items son numéricos (manual + fx + gr) o TODOS son subjetivos. No se mezclan.
- Funciones disponibles: SUMA(...), PROMEDIO(...), MAX(...), MIN(...), ABS(x), REDONDEAR(x,n), RAIZ(x), POTENCIA(x,n), SI(cond,a,b).
- Operadores: + - * / ^ y comparaciones > < >= <= == !=
- Comas o puntos para decimales (ambos válidos en literales).

CONTEXTO: necesito una plantilla para [DESCRIBE TU ENSAYO]. Genera el CSV completo con encabezados y 5-12 filas. Incluye al menos 1 fórmula con SI() para evaluar cumplimiento global.
```

Después pega el CSV en `actividades-protocolos-ejemplo.csv` o como nuevo archivo y guárdalo como `.xlsx`.
