# PRV1 — Ensayo Proctor (Compactación) · Propuesta de estructuración v1

> **Archivo fuente:** `EjemplosFichasComplejas/CV-QC-PR-260101-AB (0).xlsx`, hoja **"Curva Proctor"**.
> **Límites de la ficha principal:** columnas **B–M**, filas **16–62**.
> **Código asignado:** `PRV1` (este archivo se corrige in situ hasta que indiques subir a v2).
> **Reglas aplicadas:** copia total y ordenada · réplica exacta de cálculos (incluidos los ocultos) ·
> se omiten los Datos Generales del encabezado (filas 1–15).
>
> Esta es la **primera propuesta para iterar** — espera tus correcciones.

---

## 1. Mapa de la ficha principal (B16:M62), en orden

Clasificación: **[T]** título/sección · **[I]** ingreso (dato de campo/lab) · **[C]** calculado.

### Bloque 1 — Determinación de densidad máxima seca (4 puntos de compactación)
| Fila | Etiqueta (col B) | Tipo | Celdas | Cálculo replicado |
|---|---|---|---|---|
| 16 | DETERMINACION DE DENSIDAD MAXIMA SECA | [T] | — | — |
| 17 | AGUA AÑADIDA (ml) | [I] | E17:H17 | texto/dato (aquí "-") |
| 18 | PESO MOLDE+SUELO | [I] | E18:H18 | — |
| 19 | PESO MOLDE | [C] | E19:H19 | `= E15` (peso del molde, ver §3.1) |
| 20 | PESO SUELO COMPACTADO | [C] | E20:H20 | `= E18 − E19` |
| 21 | DENSIDAD HUMEDA (g/cm³) | [C] | E21:H21 | `= E20 / K15` (volumen del molde, §3.1) |

### Bloque 2 — Contenido de humedad y densidad seca (por punto)
| Fila | Etiqueta | Tipo | Celdas | Cálculo |
|---|---|---|---|---|
| 22 | DETERMINACION DE CONTENIDO DE HUMEDAD | [T] | — | — |
| 23 | RECIPIENTE N° | [I] | E23:H23 | texto |
| 24 | SUELO HUMEDO + RECIPIENTE | [I] | E24:H24 | — |
| 25 | SUELO SECO + RECIPIENTE | [I] | E25:H25 | — |
| 26 | PESO RECIPIENTE | [I] | E26:H26 | — |
| 27 | PESO DE AGUA | [C] | E27:H27 | `= E24 − E25` |
| 28 | PESO DE SUELO SECO | [C] | E28:H28 | `= E25 − E26` |
| 29 | CONTENIDO DE HUMEDAD (%) | [C] | E29:H29 | `= E27 / E28 × 100` |
| 30 | DENSIDAD SECA (g/cm³) | [C] | E30:H30 | `= IF(E18=0, "", (E21/(100+E29))×100)` |

**Resultados (lado derecho, mismas filas):**
- `M29` = **Densidad Máxima Seca (MDS)** = `Q34` = `BC115` (ver curva, §3.2).
- `M30` = **% Óptimo de Humedad (OCH)** = `IF(R34=0,"",R34)` = `BC116`.

### Bloque 3 — Granulometría (lado izquierdo F + tamices H–M)
| Fila | Etiqueta | Tipo | Celdas | Cálculo |
|---|---|---|---|---|
| 31 | ENSAYO DE GRANULOMETRIA Y GRAVEDAD ESPECIFICA | [T] | — | — |
| 33 | Contenido de Humedad y % de Sólidos / cabecera tamices | [T] | H33:M34 | encabezados |
| 35 | N° Tara | [I] | F35 | — |
| 36 | Peso suelo húmedo + tara (g) | [I] | F36 | — |
| 37 | Peso suelo seco + tara (g) | [I] | F37 | — |
| 38 | Peso de la tara (g) | [I] | F38 | — |
| 39 | Peso del agua (g) | [C] | F39 | `= F36 − F37` |
| 40 | Peso del suelo seco (g) | [C] | F40 | `= F37 − F38` |
| 41 | Contenido de humedad (%) | [C] | F41 | `= F39 / F40 × 100` |
| 42 | Peso inicial de muestra (g) | [C] | F42 | `= F36 − F38` |
| 43 | % de sólidos | [C] | F43 | `= F40 / F42` |
| 44 | Peso seco total (g) | [C] | F44 | `= F40` |

**Tabla de tamices (H35:M43), una fila por malla (N°8…Fondo):**
- `I` = abertura (µm) [I/constante] · `J` = Peso Retenido (g) [I]
- `K` = % Retenido = `J / $F$44 × 100`
- `L` = % Acumulado = `K(fila) + L(fila−1)` (acumulación; L35 = K35)
- `M` = % Pasa = `100 − L`
- Fondo (fila 43): `J43 = F44 − SUM(J35:J42)`

### Bloque 4 — Gravedad específica (método del picnómetro/fiola)
| Fila | Etiqueta | Tipo | Celda | Cálculo |
|---|---|---|---|---|
| 45 | Gravedad específica | [T] | — | — |
| 48 | N° de Picnómetro | [I] | F48 | — |
| 49 | Gravedad específica del material < tamiz #4 | [T] | — | — |
| 50 | Peso frasco seco calibrado Pf (g) | [C] | F50 | `= VLOOKUP(F48, 'Datos fiola'!C3:E6, 2)` (§3.3) |
| 51 | Volumen frasco calibrado Vf (cm³) | [C] | F51 | `= VLOOKUP(F48, 'Datos fiola'!C3:E6, 3)` |
| 52 | Temperatura de ensayo °C (T) | [I] | F52 | — |
| 53 | Densidad del agua a T° (ρt1) | [C] | F53 | `= VLOOKUP(F52, 'Datos fiola'!C10:D169, 2, 0)` |
| 54 | Peso frasco y agua a T° (Pfw) | [C] | F54 | `= F50 + F51 × F53` |
| 55 | Peso frasco+agua+suelo a T° (Pfws) | [I] | F55 | — |
| 56 | Peso del suelo seco (Pss) | [I] | F56 | — |
| 57 | Gravedad esp. sólidos a T° (Gst) | [C] | F57 | `= F56 / (F54 − (F55 − F56))` |
| 58 | Densidad del agua a 20°C (ρ20°C) | [I] | F58 | constante 0.99821 |
| 59 | Factor de corrección K1 | [C] | F59 | `= F53 / F58` |
| 60 | Gravedad esp. sólidos a 20°C (Gs20°C) | [C] | F60 | `= F57 × F59` |
| 61 | Observaciones | [I] | — | texto libre |

---

## 2. Insumos de campo/lab vs. resultados (resumen)
- **Ingresos del operador:** pesos molde+suelo (18), recipientes y pesos húmedo/seco/tara (23–26),
  N° molde (R12, oculto), pesos de tamices (J35:J42), datos de picnómetro (F48, F52, F55, F56),
  N° tara y pesos de granulometría (F35:F38).
- **Resultados del ensayo:** **MDS** (M29) y **OCH** (M30), curva de compactación, granulometría
  (% pasa por malla), y **Gs20°C** (F60).

---

## 3. Cálculos OCULTOS / auxiliares (fuera de B16:M62) — a replicar

> Regla del usuario: "estas hojas usan datos/cálculos auxiliares fuera de la ficha principal; analiza
> la hoja, comprende esos cálculos ocultos y reordénalos lógicamente para que el resultado sea idéntico".

### 3.1. Tabla de moldes (P14:T17) → peso y volumen del molde
La ficha usa el molde **N°13** (`R12=13`). Una mini-tabla auxiliar guarda 3 moldes:

| | Molde 12 | Molde 13 | Molde 14 |
|---|---|---|---|
| Peso (g)  | 4118.4 | **4111.7** | 4285.1 |
| Volumen (cm³) | 938.7 | **937.4** | 940.8 |

- `E15 (peso molde) = HLOOKUP(R12, R14:T16, 2)` → 4111.7
- `K15 (volumen)    = HLOOKUP(R12, R14:T16, 3)` → 937.4

**Mapeo propuesto al sistema:** **matriz auxiliar** `M_MOLDE` (3 columnas: #, peso, volumen) +
celdas `list/lookup` que seleccionan por N° de molde. El N° de molde pasa a ser un **ingreso**.

### 3.2. Curva de compactación → MDS y OCH (mínimos cuadrados, 3er grado)
Esta es la parte fina. El Excel ajusta una **polinómica de 3er grado** `y = a0 + a1·x + a2·x² + a3·x³`
a los 4 puntos (x = humedad `E29:H29`, y = densidad seca `E30:H30`) y luego **busca el máximo**.

1. **Sistema de ecuaciones normales** resuelto por **Cramer con determinantes** (`MDETERM`):
   - `a0 = BL24 = MDETERM(BF20:BI23) / MDETERM(BF25:BI28)`
   - `a1 = BL35 = MDETERM(BF31:BI34) / MDETERM(BF25:BI28)`  *(análogo)*
   - `a2 = BL46 = … / BK26`,  `a3 = BL59 = … / BK26`
   - (las matrices `BF:BO` acumulan Σx, Σx², …, Σx⁶, Σxy, Σx²y, Σx³y de los 4 puntos)
2. **Búsqueda del máximo** (tabla `AY13:BC112`, 100 pasos): genera x desde `0.98·x₁` con paso
   `BB114`, evalúa `BA = a0+a1x+a2x²+a3x³`, y toma:
   - **MDS** = `BC115 = MAX(BA13:BA112)` → **M29** (Densidad Máx)
   - **OCH** = `BC116 = MAX(BC13:BC112)` → **M30** (% Óptimo de Humedad), donde `BC` captura la x
     cuya y coincide con el máximo.

**Mapeo propuesto (3 opciones — a decidir contigo):**
- **(A) Nativo:** el sistema YA implementa ajuste polinómico por mínimos cuadrados (`polyfit`, usado
  en las líneas de tendencia de Tablas Resumen). Si exponemos ese ajuste como salida calculada,
  MDS/OCH salen sin replicar `MDETERM`. *(Preferida si el DSL lo permite.)*
- **(B) Réplica literal:** matrices auxiliares + fórmulas con `MDETERM` y una tabla iterativa de
  ~100 filas. Fiel al Excel pero pesada; depende de que el DSL soporte `MDETERM`/`MAX` sobre rangos.
- **(C) Cerrada:** derivar el máximo analíticamente (`dy/dx = a1 + 2a2x + 3a3x² = 0`, raíz válida en
  el rango) en vez de la búsqueda iterativa. Más limpio, resultado equivalente.

### 3.3. Hoja `Datos fiola` (picnómetro + densidad del agua)
- `F50/F51` (Pf, Vf) = `VLOOKUP(F48, 'Datos fiola'!C3:E6, 2|3)` → tabla de calibración de fiolas.
- `F53` (ρt1) = `VLOOKUP(F52, 'Datos fiola'!C10:D169, 2, 0)` → tabla densidad del agua vs. temperatura.

**Mapeo propuesto:** dos **matrices auxiliares** (`M_FIOLA`, `M_RHO_AGUA`) + celdas `lookup`.

---

## 4. Preguntas abiertas para tu corrección (antes de generar el Excel PRV1)
1. **Curva de compactación:** ¿opción A, B o C de §3.2? (define cuánto del cálculo oculto replicamos
   literalmente vs. usar el ajuste nativo del sistema).
2. **N° de molde y temperatura:** ¿se ingresan como dato del operador (recomendado) o se fijan?
3. **Granulometría:** ¿las aberturas de tamiz (col I) son constantes fijas de la plantilla o editables?
4. **Observaciones / técnicos:** ¿se incluyen en la ficha del sistema o se omiten como "Datos Generales"?
5. **`MDETERM`:** confirmar si el motor de fórmulas del sistema lo soporta (define la viabilidad de la
   opción B).

---

## 5. Aprendizajes para el Documento Guía (metodología)
Hallazgos de este primer caso, para alimentar la guía de conversión Excel→ficha del sistema:
1. **Leer SIEMPRE toda la hoja con fórmulas**, no solo el rango visible: los cálculos clave (curva,
   moldes, fiola) viven fuera de B16:M62, en columnas lejanas (P, AY:BC, BD:BO) y en otras hojas.
2. **Clasificar cada celda** en Título / Ingreso / Calculado y registrar la fórmula exacta.
3. **Detectar tablas auxiliares** (HLOOKUP/VLOOKUP/MDETERM) y convertirlas en **matrices** del sistema.
4. **Identificar las salidas** (MDS, OCH, Gs) y rastrear su cadena de dependencias hasta los ingresos.
5. **Reordenar lógicamente** los cálculos ocultos dentro de la ficha del sistema preservando el
   resultado numérico (no la posición original en el Excel).
