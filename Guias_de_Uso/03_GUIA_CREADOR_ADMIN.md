# 03 — Guía del Administrador (rol Creador)

Cómo dejar un proyecto listo para que el equipo trabaje. El orden importa:
**crear → cargar → configurar → invitar**. Con los Excel a la mano, un
proyecto queda operativo en menos de una hora.

## 1. Crear el proyecto

Desde *Mis proyectos* (celular o PC) → crear proyecto con nombre y datos
generales. El nombre es visible en todos los reportes: use el formal
("Edificio Aurora — Torre B").

## 2. Cargar los archivos base (pantalla "Cargar Archivos")

Pestañas de carga (cada una con su plantilla Excel):

| Pestaña | Qué se sube | Nota |
|---|---|---|
| **Activ.** (Actividades/Fichas) | Las plantillas de protocolos: checklists clásicos y **fichas numéricas con fórmulas** | El corazón del sistema: una fila de Excel por celda de la ficha. Cualquier ensayo nuevo = editar el Excel y re-importar (mismo día, sin programadores) |
| **Ubic.** (Ubicaciones) | El plan de la obra por pisos: cada fila = ubicación física × especialidad con SUS protocolos esperados | De aquí salen el "cuánto falta", el avance por ubicación y el orden del dossier |
| **Sectores** | Sectores/zonas, con o sin polígono en el mapa | Con polígono, el GPS asigna el sector solo |
| **Maquinaria / Equipos** | Catálogo de equipos con calibraciones | La app avisa vencimientos |
| **Config.** | Personalizaciones (columnas topo, tablas auxiliares…) | Según módulos activos |

También aquí: **planos** (PDF/DWG) y **ortofoto** para el mapa.
Las importaciones son **re-ejecutables**: corregir el Excel y volver a subir
actualiza sin duplicar ni borrar lo que el equipo ya agregó.

> 📌 Los Excel de ejemplo están en el repo (`ArchivosBaseEjemploCompleto/`,
> `Proyectos Modelo/`) — parta siempre de uno que funciona.

## 3. Configurar el proyecto (los módulos y reglas)

En **Configuración del proyecto** (solo usted la ve; celular o PC — se
sincroniza sola y manda sobre todos los dispositivos):

- **Módulos** (prenda solo lo que la obra usa; el menú se adapta): llenado por
  ubicación / por muestra, Geolocalización (mapa, captura GPS), Trazabilidad
  (+ catálogo de equipos), Tablas Resumen, Planos, Contactos, Topografía,
  Reportes por correo, **Asistente de IA**.
- **Codificación de ensayos**: la máscara del código ({TIPO}-{AA}{SEQ:4}…),
  por tipo si hace falta, y el ámbito de reinicio (año/sector/mes). Los
  correlativos son únicos aunque dos equipos trabajen sin señal.
- **Eliminación de ensayos**: "Solo el último creado" (default, sin huecos) |
  "Dentro de la lista — rígido" | "flexible (renumera)" con el botón
  Restablecer numeración.
- **Estampado de fotos**: logo y tamaño de la marca de agua de las evidencias.
- **Asistente de IA**: proveedor, nivel del modelo, burbuja flotante y la
  **Descripción del proyecto** (escríbala: es el contexto que FLOW usa para
  entender su obra).
- **Proyecto demo** (`is_demo`): márquelo para que los Visualizadores nuevos
  sin proyecto real puedan ver este proyecto de muestra.

## 4. Usuarios y accesos

- Cree los usuarios y asigne **rol**: Creador, Jefe de obra, Supervisor de
  calidad, Técnico, Visualizador.
- Asigne **accesos por proyecto** (quién ve qué proyecto) — desde la web
  (gestión de usuarios, con export a Excel) o el menú lateral del celular.
- Cada usuario carga su **firma personal** una vez (menú lateral) — con ella
  se firman las aprobaciones.
- Regla práctica: los técnicos solo necesitan su proyecto; el rol define lo
  que pueden hacer (los botones peligrosos ni les aparecen).

## 5. Respaldos y seguridad (lo que ya está cuidado)

- **Backup automático diario** de toda la base (retención 15 copias).
- **Export del proyecto (.zip)**: base + archivos, restaurable con un clic
  ("Importar proyecto") — sáquelo antes de cualquier operación grande.
- **Papelera** por ensayo/muestra (usted es el único que puede purgar
  definitivamente — eso sí libera las fotos).
- **Borrar un proyecto** exige 4 llaves: respaldo verificado + ser Creador +
  escribir el nombre exacto + confirmar el impacto. Sin atajos.
- Aislamiento por empresa a nivel de base de datos (multi-tenant con RLS).

## 6. Checklist de arranque de proyecto (imprimir)

- [ ] Proyecto creado con nombre formal
- [ ] Fichas (Activ.) importadas y probadas: crear 1 ensayo de cada tipo clave
- [ ] Ubicaciones importadas → el Dashboard muestra el total esperado correcto
- [ ] Sectores con polígono (si usan GPS) → probar que asigna solo
- [ ] Máscara de codificación revisada con 1 ensayo de prueba
- [ ] Módulos: solo los necesarios prendidos
- [ ] Estampado con el logo del cliente
- [ ] Descripción del proyecto escrita (para FLOW)
- [ ] Usuarios creados, roles y accesos asignados, firmas cargadas
- [ ] Ensayo de prueba: llenar → foto → enviar → aprobar → verlo en el dossier
- [ ] Borrar los ensayos de prueba (Papelera) antes de arrancar en serio
