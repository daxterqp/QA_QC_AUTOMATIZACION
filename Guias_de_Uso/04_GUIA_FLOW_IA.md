# 04 — Guía de FLOW, la inteligencia de su obra

FLOW es el asistente de IA del proyecto (solo en el celular). Responde con los
**datos reales de la obra** — nunca inventa cifras — y sus "manos" son
**botones**: le propone acciones que usted confirma con un toque; jamás
ejecuta nada solo.

## 1. Cómo abrir FLOW

- Desde el menú del proyecto → tarjeta **Asistente IA**, o
- Con la **burbuja flotante del tiburón** que aparece en las pantallas del
  proyecto: **tóquela** para abrir el chat, **arrástrela** si estorba
  (recuerda su posición), o **manténgala presionada** un instante para entrar
  directamente dictando por voz.

Requisito: el Creador debe tener activado el módulo "Asistente de IA" en la
configuración del proyecto.

## 2. Qué preguntarle (ejemplos que funcionan muy bien)

**Conteos y estados**
- "¿Cuántos ensayos hicimos hoy / esta semana / en junio?"
- "¿Qué está pendiente de aprobación?"
- "¿Hay no conformidades abiertas?"
- "¿Cómo va el proyecto?" / "Dame el parte del día"

**Cuánto falta (obras por pisos/ubicaciones)**
- "¿Cuántos protocolos faltan?"
- "¿Qué falta en el piso 1?" / "¿Qué falta en P1-Sector2?"
- FLOW responde agrupado por ubicación y especialidad ("faltan 3 de
  arquitectura y 2 de IIEE en P1-Sector1") y le deja el botón al Dashboard.

**Valores y gráficos**
- "Grafícame el grado de compactación de la última semana"
- "¿Cómo viene la densidad en el sector 3?" / "Compárame los sectores"
- "¿Qué está fuera de norma?"

**Un ensayo puntual**
- "¿Quién aprobó el PRD-260003?" / "Ábreme el PRD-260012"

**Regla de la casa:** FLOW responde con cantidades y agrupaciones, no con
listas interminables — y **siempre adjunta el botón** a la pantalla donde está
el detalle (Dossier con los filtros ya puestos, Dashboard, Ensayos…). Toque el
botón y siga su flujo.

## 3. Las tarjetas de acción (los "botones-mano")

Cuando le pida hacer algo, FLOW prepara una **tarjeta** en el chat:
- "Créame un ensayo de densidad en el sector 2" → tarjeta *Crear ensayo* (si
  falta el tipo, se lo pregunta con los tipos reales del proyecto).
- "Quiero sacar una muestra aquí" → usa su **GPS** para proponer el sector
  donde está parado y prepara la tarjeta.
- "Regístrale una NC al PRD-5 porque…" → tarjeta *Registrar NC* (solo Creador
  y Jefe de obra).
- "Llévame al dossier de esta semana" → tarjeta *Abrir Dossier* filtrado.

**Nada ocurre hasta que usted toca el botón de la tarjeta.** Si cambia de
opinión, simplemente no lo toque.

## 4. Voz

- **Dictar al cuadro de texto:** botón del micrófono junto al cuadro. Hable;
  el texto aparece; envíe.
- **Modo conversación (manos libres):** el botón de barritas verticales abre
  el modo voz — la barra azul-morada de abajo con el tiburón girando. Hable,
  FLOW escucha ("Escuchando…"), piensa y **le responde con voz**, y vuelve a
  escuchar. Ideal con guantes. Se sale con la **X** (corta la voz al instante).
- **Leer respuestas:** en el menú ⋮ del chat puede activar que FLOW narre cada
  respuesta; también puede tocar el parlante de cualquier burbuja.
- En la **ficha numérica** también hay dictado por celda: toque el micrófono
  de la ficha, diga el valor ("dos punto quince") y pasa a la siguiente celda.

## 5. Detalles útiles

- **Contexto de la obra:** si el Creador escribió la *Descripción del proyecto*
  (Configuración → Asistente IA), FLOW la usa como fuente de verdad ("¿de qué
  trata la obra?"). Sin ella, interpreta con cautela desde el nombre y las
  ubicaciones (P1, Piso 2…) y se lo dice.
- **Preferencias:** dígale "recuerda que siempre quiero los resúmenes por
  sector" — lo guarda (en su teléfono) y lo aplica en adelante. Se gestionan
  y borran desde el menú ⋮ → Historial.
- **Historial:** las conversaciones viven en SU teléfono (no en el servidor).
  Menú ⋮ → *Conversaciones* para retomar, renombrar o iniciar una nueva.
- **Reintentar / detener:** mientras FLOW responde, el botón se vuelve un
  **cuadrado** (deténgalo cuando quiera). En la última respuesta aparece el
  ícono de **reintentar** para regenerarla.
- **Compartir:** cada respuesta tiene botón de compartir (texto o el gráfico
  como imagen).
- **Cifras con asterisco:** si FLOW le avisa "hay ensayos sin sincronizar sus
  resultados numéricos", los promedios pueden ser parciales — abra Tablas
  Resumen o sincronice y vuelva a preguntar.

## 6. Lo que FLOW no hace (a propósito)

- No inventa datos: si algo no existe, se lo dice.
- No ejecuta acciones sin su confirmación.
- No lista 50 códigos en el chat: le da el resumen y el botón al detalle.
- No responde de otros proyectos: solo ve el proyecto abierto, con sus
  permisos.

## 7. Para el Creador: configuración de FLOW

En **Configuración del proyecto → Asistente de IA** (celular o PC):
activar el módulo, elegir **proveedor** (Claude/Gemini) y **nivel del modelo**
(Económico/Potente/Máximo — controla costo y calidad), activar la **burbuja
flotante**, y escribir la **Descripción del proyecto** (tipo de obra, pisos,
detalles clave) — 2 minutos que mejoran todas las respuestas.
