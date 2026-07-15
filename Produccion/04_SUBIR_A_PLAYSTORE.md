# 04 — Subir a Google Play Store

Guía para publicar la versión **2.2.0 (versionCode 31)** — el AAB firmado.

## Artefactos generados (esta build)

| Archivo | Para qué | Ruta |
|---|---|---|
| **AAB** (Android App Bundle) | **Play Store** (obligatorio para publicar) | `android/app/build/outputs/bundle/release/app-release.aab` |
| **APK** | Instalación directa (WhatsApp, USB, pilotos sin Play) | `android/app/build/outputs/apk/release/app-release.apk` |

Firmados con `flow-qc-release.keystore` (alias `flow-qc`). **Ese keystore es
sagrado**: si se pierde, Google no deja volver a actualizar la app nunca.
Guardar una copia fuera de la PC (nube privada + USB).

---

## Paso 0 — Requisitos (una sola vez)

- **Cuenta de Google Play Console**: USD 25 pago único. Registrarse en
  https://play.google.com/console con la cuenta de la empresa.
- **Verificación de identidad/organización**: para cuentas nuevas de
  desarrollador Google exige verificar identidad (y, si es organización, datos
  de la empresa). Puede tardar días — hacerlo YA, en paralelo.
- Política de datos y privacidad: necesitarás una **URL de política de
  privacidad** pública (puede ser una página simple en el dominio de la web).

## Paso 1 — Crear la app en Play Console

1. **Crear app** → nombre "Flow QA/QC", idioma español, tipo App, gratis.
2. Aceptar las declaraciones (políticas, exportación).

## Paso 2 — Ficha de la tienda (usar el material de Marketing/)

- **Nombre**: Flow QA/QC — Control de calidad de obra
- **Descripción corta** (80 car.): "Control de calidad de construcción con o
  sin señal. Dossier automático e IA de obra."
- **Descripción completa**: adaptar de `Marketing/01_PRODUCTO_Y_MENSAJES.md`
  (el dolor + los 6 diferenciales).
- **Recursos gráficos** (obligatorios):
  - Ícono 512×512 PNG (el tiburón sobre navy).
  - Gráfico destacado 1024×500.
  - Mínimo 2 capturas de teléfono (usar las del proyecto demo "Edificio
    Aurora" — kit `Marketing/04`).
- **Categoría**: Empresa / Productividad.

## Paso 3 — Cuestionarios obligatorios (los que trancan el lanzamiento)

- **Clasificación de contenido**: cuestionario → apta para todos.
- **Seguridad de los datos**: declarar qué recopila la app — ubicación
  (para asignar sector del ensayo), fotos (evidencia), cuenta (email). Todo
  cifrado en tránsito, no se vende a terceros. Ser honesto y coincidir con la
  política de privacidad.
- **App de acceso restringido / cuenta de prueba**: como el login exige
  credenciales, dar a Google un **usuario de prueba** (`review@flowqaqc.com`
  con un proyecto DEMO) en "Acceso a la app" → si no, la rechazan por no poder
  entrar.
- Público objetivo: mayores de edad (herramienta profesional).

## Paso 4 — Firma de la app (Play App Signing)

- Al subir el primer AAB, Google ofrece **Play App Signing**: acéptalo (Google
  gestiona la clave final de firma; tú subes con la tuya de "upload").
- **Tu `flow-qc-release.keystore` queda como clave de subida (upload key)** —
  con ella firmas cada AAB que subas. Google re-firma con la clave de app.
- Guardar el certificado de la upload key por si hay que resetearla.

## Paso 5 — Subir el AAB y lanzar por fases

1. Menú **Prueba y lanzamiento**. Recomendado empezar por **Pruebas internas**
   (hasta 100 testers por email, sin revisión completa, publica en minutos) —
   ideal para tu piloto antes de producción.
2. Crear una versión → **subir el `app-release.aab`**.
3. **Notas de la versión** (español): resumen de novedades — p.ej. "FLOW, el
   asistente de IA de la obra: consultas por voz, protocolos faltantes por
   ubicación, aprobación desde el chat. Mejoras de fluidez y sincronización."
4. Revisar y **lanzar**.
5. Cuando esté validado con testers → promover la MISMA versión a **Producción**
   (ahí sí hay revisión de Google, 1–3 días la primera vez).

## Paso 6 — Después de publicar

- El **versionCode debe subir en cada actualización** (hoy 31 → la próxima 32).
  Play rechaza un AAB con un versionCode ya usado.
- Responder reseñas, mirar "Vitals" (ANR/crashes) — la primera semana es la
  clave.

---

## Sobre el requisito de 16 KB (contexto importante)

Google exige que las apps soporten páginas de memoria de 16 KB (dispositivos
Android nuevos). El bloqueo anterior era con Expo 52 / RN 0.76 (libs
precompiladas en 4 KB). **Este build es Expo 53 / RN 0.79.6** (rama
`chore/expo54-16kb`), que ya trae las librerías nativas alineadas a 16 KB —
por eso ahora el AAB pasa la validación de Play que antes rechazaba.
> Verificación opcional antes de subir: en Play Console, al cargar el AAB, la
> sección "Compatibilidad" avisa si alguna lib no cumple 16 KB. Si apareciera
> un warning, se resuelve actualizando esa dependencia nativa puntual.

## Comandos para regenerar (referencia)

```bash
# Desde la raíz del repo, con JAVA_HOME al JDK 17+ (jbr de Android Studio):
cd android
./gradlew.bat clean
./gradlew.bat bundleRelease    # AAB  → app/build/outputs/bundle/release/
./gradlew.bat assembleRelease  # APK  → app/build/outputs/apk/release/
```
