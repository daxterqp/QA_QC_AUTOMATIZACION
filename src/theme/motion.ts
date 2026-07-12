/**
 * motion.ts — v89: Tokens de MOTION de la app (duraciones + curvas), gemelos
 * conceptuales de Colors/Typography/Radius/Shadow de colors.ts.
 *
 * Curvas fuertes del playbook de animaciones (los easings built-in son
 * demasiado débiles para movimiento deliberado):
 *  - easeOut     → entradas/salidas de UI (arranca rápido = se siente responsivo)
 *  - easeInOut   → morphs/movimiento EN pantalla
 *  - easeDrawer  → drawers/sheets estilo iOS
 * Presupuesto: UI ≤ 300ms. Press feedback: scale 0.97 (sutil, 0.95-0.98).
 */
import { Easing } from 'react-native';

export const Motion = {
  /** Press feedback, micro-transiciones. */
  fast: 140,
  /** Transiciones estándar de UI (toasts, fades). */
  base: 200,
  /** Drawers, sheets, entradas grandes. */
  slow: 260,
  easeOut: Easing.bezier(0.23, 1, 0.32, 1),
  easeInOut: Easing.bezier(0.77, 0, 0.175, 1),
  easeDrawer: Easing.bezier(0.32, 0.72, 0, 1),
  /** Escala del feedback físico de press. */
  pressScale: 0.97,
} as const;
