# Ejemplo completo — Proyecto carretero

Juego de Excels para cargar un proyecto de control de calidad vial de punta a punta
(ubicaciones + sectores + ensayos). **No incluye el módulo de trazabilidad.**

## Orden de importación

1. **Crear el proyecto** (tipo carretero) en la app o la web.
2. **Importar Excel de Actividades** → `01_actividades_carretera.xlsx`
   (define los 3 ensayos numéricos y sus secciones/fórmulas).
3. **Importar Excel de Ubicaciones** → `02_ubicaciones_carretera.xlsx`
   (6 ubicaciones por progresiva; la columna ID_Protocolos indica qué ensayo se
   instancia en cada una).
4. **Importar Excel de Sectores** → `03_sectores_carretera.xlsx`
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
