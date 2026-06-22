# Mapeo de capacidades — fichas de ensayo robustas y AI-authorable

> Análisis de brechas entre el sistema VxP QAQC y un motor de fichas de laboratorio
> de referencia (SimpleLab/Geolabor, `EjemplosFichasComplejas/`), con la arquitectura
> recomendada y el roadmap. **Las Fases A–E ya están implementadas (v32)** — ver
> [RESUMEN_MEJORAS.md](RESUMEN_MEJORAS.md). La Fase F queda como evolución futura.

---

## 1. Principio rector

El formato de fichas lo va a **generar una IA** a partir del Excel del ensayo. Por eso el
diseño optimiza tres cosas, en este orden:

1. **Fácil de emitir para un LLM** — declarativo, compacto, sin ceremonia (nada de
   ObjectIds de 24 chars, workflows publicados, ni dependencias declaradas dos veces
   como exige SimpleLab).
2. **Validable con errores accionables** — la salida de la IA se chequea con
   `validateProtocolSpec()` y los errores dicen fila/celda/causa exacta para que la IA
   se auto-corrija en un pase.
3. **Fail-safe** — una fila que no parsea degrada el protocolo a modo clásico (Sí/No/NA),
   nunca rompe la app.

---

## 2. Qué hace el sistema de referencia (abstraído a capacidades)

Del análisis de las 5 fichas objetivo (Cono de Arena, Densidad Nuclear, Granulometría de
Descarga/Verificación, Proctor — 50 procedimientos, 306 campos, 154 fórmulas, 5 gráficos):

| Capacidad | Uso real en las fichas objetivo |
|---|---|
| Multi-procedimiento + grupos + dependencias | 6–16 procs por ficha, DAG explícito |
| Tablas de determinaciones (filas dinámicas) | DINDEX/DATTR para acumulados — patrón dominante |
| Lógica condicional con guardas | 80 IF + 56 AND; EMPTY ubicuo |
| Tablas auxiliares normativas | tamices, densidad-agua-temperatura |
| Interpolación/óptimo de curva | Proctor: fit polinómico g3 + raíces; P50/P80 log-log |
| Tipos de campo ricos | Numérico, Porcentagem (fracción), Lista, Booleano, Data, Hora |
| Gráficos log-x + interpolación + filtro de puntos | curvas granulométricas y de compactación |
| Visibilidad ejecución vs resultados + operativo/efectivo | en todos los procs |

**Lo que NO copiamos de SimpleLab** (ceremonia que una IA rompe fácil): ObjectIds
manuales, identificadores sanitizados a mano, doble declaración de dependencias
(proc + workflow), publicación de versiones para que las refs funcionen, JSON de 3000
líneas por ficha.

---

## 3. Tabla maestra de brechas → estado

| # | Capacidad | Antes (v31) | Ahora (v32) | Fase |
|---|---|---|---|---|
| 1 | Tablas dinámicas fila-a-fila (acumulados) | ✗ solo refs absolutas | ✅ `FILA()`, `CELDA(Col, fila)`, `COLUMNA(Col)` | A |
| 2 | Agregación filtrada | ✗ | ✅ `SUMARSI`, `PROMEDIOSI`, `CONTARSI`, `CONTAR` | A |
| 3 | Guardas reales en fórmulas | ✗ `SI` eager (div/0 aunque la condición proteja) | ✅ `SI` lazy + `ESVACIO` + `SIERROR` + `Y/O/NO` | A |
| 4 | Interpolación a objetivo (P50/P80/D60) | ✗ | ✅ `INTERPX`, `INTERPXLOG`, `INTERPY` | B |
| 5 | Óptimo de curva (Proctor MDS/HOP) | ✗ | ✅ `PUNTOMAXIMOX/Y` (fit polinómico g2/g3 centrado) | B |
| 6 | Regresión accesible en fórmulas | solo visual en gr7 | ✅ `PENDIENTE`, `INTERSECCION`, `R2` | B |
| 7 | Gráficos multi-serie | ✗ 1 serie | ✅ `y2:`/`y3:` + leyenda (`ly:`) | B |
| 8 | Banda de especificación (husos) | ✗ | ✅ `bandalo:`/`bandahi:` (área sombreada) | B |
| 9 | Curva ajustada superpuesta | ✗ | ✅ `ajuste: lineal\|poli2\|poli3\|spline\|loglog` | B |
| 10 | Tipos Booleano/Fecha/Hora/Porcentaje | ✗ | ✅ `bool-[]`, `fecha-[]`, `hora-[]`, `porcentaje-[a:b]` | C |
| 11 | Referencia a equipo (trazabilidad) | módulo existe, desconectado | ✅ celda `equipo-[tipo]` (código; dropdown del catálogo: fase F) | C |
| 12 | Matemática (log base, trig, etc.) | ✗ | ✅ `LOG(x,base)`, `LN`, `EXP`, `PI`, `SENO/COSENO/TAN/ATAN`, `ENTERO`, `RESIDUO`, `MODA` | D |
| 13 | Validación de ficha con errores accionables | ✗ (fail-safe silencioso) | ✅ `protocolValidator.ts` + integrado al import web | E |
| 14 | Paridad web/mobile del motor | ⚠ divergencias (val- mixto roto en web) | ✅ espejo 1:1 verificado por diff + tests | E |
| 15 | Multi-procedimiento / secciones enlazadas | ✗ lista plana | ⏳ **Fase F** | F |
| 16 | Visibilidad ejecución vs resultados por campo | ✗ | ⏳ Fase F | F |
| 17 | Operativo/efectivo (override manual de cálculo) | ✗ | ⏳ Fase F (workaround hoy: celda manual + `SI(ESVACIO(op), oficial, op)`) | F |
| 18 | Etapas / cuerpos de prueba múltiples | ✗ | ⏳ Fase F | F |
| 19 | Dropdown de equipos desde el catálogo en la celda | texto libre | ⏳ Fase F | F |

> El patrón **operativo/efectivo** (fila #17) ya es expresable HOY con el DSL v32:
> `numerico-fx[…]` (oficial) `// numerico-[a:b]` (operativo) `// numerico-fx[SI(ESVACIO(#nB), #nA, #nB)]` (efectivo).

---

## 4. Arquitectura recomendada (3 capas)

- **Capa 1 — DSL de celda (implementada, v32).** El lenguaje compacto por celda. Es la
  unidad que la IA emite por fila del Excel. Cubre granulometrías, Proctor, densidades,
  humedad y cualquier ensayo tabular de N filas con acumulados/curvas.

- **Capa 2 — Esquema declarativo de ficha (Fase F).** Cuando un ensayo exija secciones
  enlazadas (estilo Cono de Arena con 12 procedimientos), levantar la ficha a un
  documento declarativo: `secciones[] → bloques[]` (formulario | tabla | gráfico), con
  visibilidad por campo y dependencias explícitas entre secciones. Las celdas internas
  siguen siendo el MISMO DSL v32 — la capa 2 solo agrega estructura, no otro lenguaje.

- **Capa 3 — Contrato de autoría IA (implementada la base, v32).** El pipeline
  Excel → IA → ficha → `validateProtocolSpec()` → errores accionables → IA corrige →
  import idempotente (reconciliación no destructiva ya existente). Para automatizarlo
  end-to-end solo falta envolver el loop (la validación y el import ya están).

**Por qué así y no como SimpleLab:** SimpleLab obliga a duplicar dependencias, generar
ObjectIds válidos, sanitizar identificadores y publicar versiones — su knowledge base
documenta horas perdidas en cada uno. Nuestro formato no tiene NINGUNO de esos pasos:
los identificadores son posicionales (fila/columna), las dependencias se infieren de las
fórmulas, y el validador da el feedback que SimpleLab da con un "-" silencioso.

---

## 5. Mapa ficha-objetivo → cobertura

| Ficha objetivo | Qué exige | Cobertura |
|---|---|---|
| GD/GV — Granulometrías | tabla tamices, acumulados, % pasa, curva log, P50/P80, huso | ✅ completa con v32 (1 protocolo DSL) |
| PR — Proctor | tabla puntos, densidad seca calc., fit g2/g3, MDS/HOP, curva con óptimo | ✅ completa con v32 |
| DN — Densidad Nuclear | formularios + espejos + % compactación vs Proctor ref | ✅ v32 (xref `@PROCTOR-X.nC` para el Proctor de referencia) |
| CA — Cono de Arena | 12 procs, equipos (conos/taras), humedad+densidad+corrección | ⚠ expresable como 1–2 protocolos DSL; la separación visual en secciones llega con Fase F |
| Cualquier ensayo multi-etapa (3 puntos × N mediciones) | etapas / cuerpos de prueba | ⏳ Fase F (hoy: filas repetidas con `repeat-[…]`) |

---

## 6. Fase F — diseño breve (para cuando se necesite)

1. Tabla `protocol_sections` (o campo `section` ya existente + metadatos JSON en la
   plantilla) para agrupar items en secciones colapsables con título.
2. Flags de visibilidad por item: `show_execution` / `show_results` (default true/true,
   regla #21 de SimpleLab: todo visible salvo flags internos).
3. Celda `equipo-[tipo]` → dropdown poblado del módulo `equipment` filtrado por tipo y
   proyecto; al elegir, guarda el `code` (el valor actual ya es compatible).
4. Etapas: `repeat-[…]` a nivel de bloque con partidas compuestas estables.
5. Esquema declarativo serializado (JSON) generable por IA + validador extendido.
