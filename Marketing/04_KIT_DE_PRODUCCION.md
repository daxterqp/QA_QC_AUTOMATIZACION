# 04 — Kit de producción (checklist técnico)

Todo lo que hay que preparar UNA vez para grabar el video madre, los 8 cortos
y las demos de venta con calidad consistente.

---

## 1. El proyecto demo: "Edificio Aurora" (preparar UNA vez)

Un proyecto real dentro de la app, bonito y creíble, que sirve para videos,
demos en vivo y para los VIEWERs demo (la app ya soporta proyectos demo con
`is_demo`). Crear con estos datos:

- **Nombre:** `Edificio Aurora — Torre B` (multifamiliar, 12 pisos).
- **Descripción del proyecto (para FLOW):** "Edificio multifamiliar de 12
  pisos + 2 sótanos, 4 departamentos por piso. Estructuras de concreto
  armado; acabados desde el piso 3." (así FLOW responde con contexto en cámara).
- **Ubicaciones:** cargar el Excel de ubicaciones con P1–P4, sectores 1–4 y
  especialidades Cimiento / ARQ / IIEE / IISS / Estructuras (como el
  Proyecto_Modelo actual). Suficiente para que el dashboard muestre ~180+
  esperados.
- **Datos vivos:** ~25–40 ensayos repartidos: la mayoría aprobados, 5–7 en
  revisión (para la demo de aprobar), 1–2 rechazados, 2–3 NC (1 abierta),
  fotos de evidencia REALES de obra (pedidas/con permiso o propias) ya
  estampadas, algunas fichas numéricas con curvas bonitas (Proctor con su
  gráfico). GPS: puntos dentro de los sectores dibujados.
- **Usuarios demo:** "Joseph Yauri — Creador", "María Torres — Jefe de obra",
  "Luis Quispe — Técnico" (con firmas cargadas; nombres genéricos, NO clientes).
- Mantenerlo **congelado**: nadie experimenta ahí; es el set de filmación.

## 2. Grabación de pantalla

**Celular (Android real, no emulador):**
- `scrcpy` por USB para espejo en PC: `scrcpy --max-size 1920 --max-fps 60 --record demo.mp4` (o grabar con el grabador nativo de Samsung a 1080p/60).
- **Modo No molestar** + brillo fijo 80% + desactivar el teclado con sugerencias (se ve limpio) + idioma ES.
- Barra de estado: batería >80%, hora "9:41" si se puede (o recortarla en edición).
- Para las tomas de VOZ de FLOW: grabar el AUDIO del teléfono por cable/aparte
  (el TTS de FLOW debe oírse nítido — es el gancho del video madre).
- Gestos visibles: activar "mostrar toques" en opciones de desarrollador.

**PC (web):**
- Ventana del navegador a 1920×1080 exactos, zoom 125% (la UI se lee en video),
  perfil de navegador limpio (sin favoritos ni extensiones visibles).
- OBS Studio para capturar (o el grabador de Windows Game Bar).

**Obra (b-roll):**
- 10–15 clips de 5 s: manos con guantes + celular, casco, el hueco del ensayo,
  el cono de arena/densímetro, la camioneta, la oficina técnica. Con permiso
  de la obra; sin rostros identificables de terceros sin autorización.
- Si no hay obra disponible aún: banco de stock (Pexels/Storyblocks) SOLO para
  la escena del dolor; todo lo demás debe ser la app real.

## 3. Branding en video

- Colores: navy `#0e213d`, primario `#394e7d`, acento `#668abc`, blanco.
- Tipografía: **Montserrat** (ExtraBold para títulos, SemiBold para subtítulos).
- Logo: tiburón FLOW (SVG en `Logo_Flow_IA_v2.svg`) y logotipo Flow QA/QC.
- Súper de texto: caja navy 85% opacidad, texto blanco, esquinas 12 px
  (consistente con la UI real).
- Plantilla de intro/outro (3 s): logo sobre navy con la onda de agua — se hace
  una vez en CapCut/Premiere y se reusa en todos los cortos.

## 4. Audio

- **Música:** electrónica suave con pulso (100–110 BPM). Fuentes sin copyright:
  YouTube Audio Library, Pixabay Music, Uppbeat (verificar licencia comercial).
- **Locución:** una sola voz para toda la serie (consistencia de marca). Puede
  ser el propio TTS de ElevenLabs con una voz distinta a la de FLOW — FLOW debe
  sonar DIFERENTE a la locución (la voz de FLOW ya la tiene la app).
- Niveles: locución -6 dB, música -18 a -24 dB bajo la voz, la voz de FLOW
  protagonista en los ganchos.

## 5. Herramientas de edición

| Tarea | Herramienta | Nota |
|---|---|---|
| Edición cortos 9:16 | CapCut (PC) | Subtítulos automáticos en ES + plantillas |
| Edición video madre | CapCut o DaVinci Resolve (gratis) | Multi-pista, corrección de color |
| Zooms/resaltados de UI | La propia edición (keyframes de escala 130–150%) | Nunca mostrar la pantalla completa sin foco |
| Miniaturas/artes | Canva (plantilla con navy+Montserrat) | Una plantilla, N variaciones |
| Subtítulos | CapCut auto + corrección manual | SIEMPRE revisar tildes y términos (dossier, Proctor) |

## 6. Checklist pre-grabación (imprimir)

- [ ] Proyecto "Edificio Aurora" cargado, congelado y verificado (dashboard con números bonitos: 6/193 estilo).
- [ ] Descripción del proyecto cargada (FLOW con contexto).
- [ ] Celular: No molestar ON, toques visibles ON, batería >80%, ES, APK release actualizado.
- [ ] FLOW probado: la pregunta del gancho responde bien Y con la tarjeta al Dashboard (ensayar 3 veces; grabar la MEJOR toma).
- [ ] Voz de FLOW audible y grabada limpia.
- [ ] Web abierta en el mismo proyecto, 1920×1080, zoom 125%.
- [ ] Modo avión listo para la escena offline (verificar que la ficha guarda).
- [ ] B-roll de obra en carpeta, seleccionado.
- [ ] Música elegida con licencia verificada.

## 7. Organización de archivos

```
Marketing/
  media/
    brutos/         ← capturas de pantalla y clips sin editar (por fecha)
    broll/          ← clips de obra
    audio/          ← música + locuciones
    exportados/     ← videos finales por versión (madre_16-9.mp4, corto1_9-16.mp4…)
    miniaturas/
```
(La carpeta `media/` se crea al empezar a grabar; los brutos NO van al git —
agregar `Marketing/media/` al .gitignore.)
