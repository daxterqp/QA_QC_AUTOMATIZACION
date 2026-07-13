# 03 — Plan iOS (conceptual, listo para ejecutar)

Objetivo: la misma app móvil (Expo 53 bare, RN 0.79) corriendo en iPhone/iPad,
publicada por TestFlight primero y App Store después. Este plan deja TODO
decidido; ejecutar toma ~2–4 semanas de calendario (la mayor parte es espera
de Apple y ajustes por dispositivo).

---

## 1. Los tres prerrequisitos (sin esto no hay iOS)

| Qué | Costo | Nota |
|---|---|---|
| **Apple Developer Program** | USD 99/año | Cuenta de la empresa (no personal) — pedir D-U-N-S si es cuenta de organización (demora ~1–2 semanas la 1ª vez) |
| **Builds**: Mac (o EAS Build) | Mac usado M1 ≈ USD 500+ · **EAS Build en la nube: sin Mac, ~USD 0–99/mes** | **Recomendación: EAS Build** — nuestro flujo es Windows; EAS compila iOS en la nube con el mismo repo. El "sin EAS" de Android fue por control local; en iOS no hay opción local sin Mac |
| **Dispositivo de prueba** | 1 iPhone físico | El GPS/cámara/micrófono no se validan en simulador |

## 2. Compatibilidad de los módulos nativos (auditada)

**Todo el stack tiene soporte iOS.** Estado por módulo crítico:

| Módulo | iOS | Acción |
|---|---|---|
| WatermelonDB (JSI/SQLite) | ✅ | Pod nativo; correr las migraciones igual |
| expo-gl (agua GL) | ✅ | Idéntico |
| expo-speech-recognition | ✅ usa SFSpeechRecognizer | Permisos: `NSSpeechRecognitionUsageDescription` + `NSMicrophoneUsageDescription` |
| expo-audio (TTS FLOW) | ✅ | Categoría de audio: playback con duckOthers (ya configurado en código) |
| react-native-vision-camera | ✅ | `NSCameraUsageDescription` |
| expo-location (+task-manager, tracking en background de trazabilidad) | ✅ | `NSLocationWhenInUse…` y `NSLocationAlways…` + UIBackgroundModes `location`. ⚠️ Es LO que App Review más cuestiona — ver §5 |
| react-native-maps | ✅ | En iOS usa **Apple Maps por defecto** (sin API key): mantener default. La ortofoto como overlay funciona igual |
| react-native-image-marker (estampado) | ✅ | Verificar en device el render de fuentes/logo (difiere de Android/Coil) |
| expo-local-authentication | ✅ Face ID | `NSFaceIDUsageDescription` |
| expo-print (PDF dossier) | ✅ | El HTML espejo renderiza con WebKit — validar paginación en device |
| expo-notifications (push) | ✅ APNs | Requiere capability Push + key APNs en el panel de Expo/EAS |
| react-native-pdf, webview, svg, reanimated, gesture-handler, screens, blob-util, compressor, view-shot | ✅ | Estándar |

**Único trabajo real de código:** los 2–3 sitios con `Platform.OS === 'android'`
(ToastAndroid del sync v86, StatusBar.currentHeight, permisos Android):
agregar la rama iOS (toast → alerta breve/overlay propio; insets ya usan
safe-area). Grep guía: `grep -rn "Platform.OS" src | grep -v web`.

## 3. Flujo de build (con EAS, sin Mac)

1. `npx expo prebuild -p ios` (genera `ios/` desde el mismo repo; NO se toca a
   mano — config por `app.json` + `expo-build-properties`).
2. `app.json`: agregar el bloque iOS — `bundleIdentifier: com.vxp.flowqaqc`,
   `buildNumber`, permisos (los `NS…UsageDescription` de §2 con textos en
   español orientados a obra: "Flow usa su ubicación para asignar el sector
   del ensayo"), `UIBackgroundModes: [location]`, `ITSAppUsesNonExemptEncryption: false`.
3. `eas build --platform ios --profile production` (EAS gestiona certificados
   y provisioning automáticamente con la cuenta Apple).
4. `eas submit -p ios` → TestFlight.
5. Firma/perfiles: dejar que EAS los administre (no manual) — cero fricción
   desde Windows.

## 4. Plan de validación en device (1 semana)

Checklist de paridad (lo que difiere de Android):
- [ ] Offline completo: crear→llenar→foto→enviar en modo avión + reconexión.
- [ ] Estampado de fotos: logo/fuentes idénticos (image-marker en iOS).
- [ ] GPS: primer fix, sector automático, tracking en background con la app
      minimizada (trazabilidad) y su indicador azul de iOS.
- [ ] FLOW voz completa: dictado (es-PE en SFSpeech), TTS por altavoz,
      modo manos libres, interrupciones por llamada.
- [ ] PDF del dossier: paginación y numeración vs Android (WebKit vs Chrome).
- [ ] Face ID (bloqueo), teclado decimal en fichas numéricas (separador
      decimal del locale iOS: forzar punto como en Android).
- [ ] Push de prueba vía APNs.
- [ ] Deep links `flow://` (associated domains si se quiere universal links).

## 5. App Store Review — los 3 puntos que van a preguntar (respuestas listas)

1. **Background location**: justificar en las notas de revisión: "app de
   control de calidad de obra; el tracking registra el recorrido del personal
   DURANTE su jornada iniciada voluntariamente (trazabilidad laboral), se
   apaga al cerrar la sesión de trabajo". Mostrar el toggle y el aviso al
   usuario. (Igual que apps de field-service aprobadas.)
2. **Cuenta demo para el revisor**: crear usuario `review@flowqaqc.com` con un
   proyecto DEMO poblado (flag is_demo ya existe) — obligatorio porque el
   login exige credenciales.
3. **Compras**: la app NO vende dentro (B2B por contrato externo) → no
   requiere IAP; declarar que el registro/cobro es corporativo externo
   (permitido para apps B2B, como Slack/Notion).

## 6. Costos y tiempos resumidos

| Fase | Tiempo | Costo |
|---|---|---|
| Cuenta Apple + D-U-N-S | 1–2 semanas (trámite, en paralelo) | USD 99/año |
| Prebuild + permisos + ramas iOS de código | 2–3 días | — |
| Primer build EAS + TestFlight interno | 1–2 días | plan EAS (free tier alcanza al inicio) |
| Validación en device (checklist §4) + fixes | 1 semana | iPhone de prueba |
| App Review | 1–3 días (reintentos posibles) | — |
| **Total calendario** | **~3–4 semanas** | **~USD 100–200 + iPhone** |

## 7. Decisiones ya tomadas (no reabrir)

- **EAS Build** en vez de Mac propio (somos Windows-first; el control local
  que valoramos en Android no existe como opción en iOS sin Mac).
- **Apple Maps** por defecto (cero llaves nuevas); Google Maps solo si un
  cliente lo exige.
- TestFlight como canal del piloto iOS (hasta 10k testers, sin review
  completa) ANTES de App Store — igual que el APK directo en Android.
- El dossier/PDF y los renderers espejo NO se tocan: son HTML/SVG puros y
  WebKit los renderiza; solo se VALIDA la paginación.

## 8. Disparador para ejecutar

Ejecutar este plan cuando: (a) haya 1 cliente pagando que use iPhone, o
(b) el piloto Android esté estable 1 mes. Antes de eso, iOS es costo sin
aprendizaje nuevo.
