# Plan 001 — Motion móvil (React Native)

Valores canónicos (de AUDIT.md — copiar exacto):
- ease-out fuerte: `Easing.bezier(0.23, 1, 0.32, 1)`
- ease-in-out fuerte: `Easing.bezier(0.77, 0, 0.175, 1)`
- drawer iOS: `Easing.bezier(0.32, 0.72, 0, 1)`
- press feedback: scale 0.97, 120–160ms, ease-out, native driver
- entradas: opacity 0→1 + scale 0.95–0.97 (nunca scale(0), nunca fade puro)
- UI ≤ 300ms

## Pasos

1. **Tokens** — `src/theme/motion.ts` (nuevo): `Motion = { fast: 140, base: 200,
   slow: 260, easeOut, easeInOut, easeDrawer, pressScale: 0.97 }` con los
   beziers de arriba. Exportar también `useReducedMotion()` en
   `src/hooks/useReducedMotion.ts` (AccessibilityInfo.isReduceMotionEnabled +
   listener `reduceMotionChanged`).
2. **TourOverlay.tsx:62** (ALTA perf) — separar el Animated.Value del pulso en
   dos: `pulseNative` (scale/opacity de los anillos, `useNativeDriver: true`)
   y `pulseColor` (borderColor, JS). Dos loops en paralelo, mismos tiempos.
3. **AIQuickBubble.tsx:93** — spring del snap con `useNativeDriver: true`
   (solo anima transform). Velocity del gesto: pendiente de feel-check en
   dispositivo (unidades de PanResponder ambiguas) — NO adivinar.
4. **SlideToConfirm.tsx:123** — fill: `width` → `transform: [{ scaleX }]` con
   `transformOrigin: 'left center'` (Reanimated 3.17 lo soporta) sobre un View
   de ancho completo. `onEnd`: pasar `velocity: e.velocityX` al withSpring.
5. **Toast.tsx:55-57** — entrada: opacity + `translateY(-8→0)`, 180ms,
   `Motion.easeOut`; salida: 160ms `Motion.easeOut` (era `Easing.in` — finding).
6. **SideDrawer.tsx:75-81** — easing explícito: abrir `Motion.easeDrawer`
   260ms, cerrar `Motion.easeOut` 200ms.
7. **AIChatScreen.tsx:206-209** (avatar) — `scale 0.4→1` pasa a `0.92→1` +
   opacity 0→1 (mismo spring).
8. **AIChatScreen.tsx TypingDots** — 320ms → 260ms por medio ciclo.
9. **Press feedback** — `src/components/PressableScale.tsx` (nuevo): wrapper
   Animated con scale 0.97 in 120ms/out 160ms easeOut native. Aplicar a los
   CTAs del chat (enviar/stop/modo voz) y al botón de la tarjeta de acción.
10. **Reduce motion** — gatear con `useReducedMotion()`: agua GL de bienvenida
    FLOW (`glOk && !reduceMotion`), agua del Login, y el breathing del glow de
    voz (opacidad fija 0.55 sin loop). El resto de transiciones cortas se
    mantienen (reduced ≠ cero).
11. **LoginScreen.tsx:108** — salida `Easing.inOut` → `Easing.out(Easing.cubic)`;
    `hintPulse` (l.83-87): guardar el loop y `stop()` en cleanup del effect.
12. **OfflineBanner.tsx** (oportunidad #1) — montaje del pill con opacity+scale
    0.92→1, 180ms easeOut, native driver (Animated.View wrapper).

## Verificación
`npx tsc --noEmit` = 0. Feel-check en dispositivo: tour sin frames caídos,
drawer con curva iOS, toast que baja al entrar, slider con inercia, chat con
press físico. Reduce motion ON (Ajustes Android) → sin agua ni breathing.

## Fuera de alcance
contactPulse/PulsingBadge (deliberados), stagger de listas móvil (riesgo de
jank en FlatList), velocity de la burbuja (feel-check pendiente).
