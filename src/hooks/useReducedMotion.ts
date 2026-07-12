/**
 * useReducedMotion — v89: respeta "Eliminar animaciones / Reduce motion" del
 * sistema (Android: Ajustes → Accesibilidad). Reducido NO significa cero:
 * se apagan los loops ambientales (agua GL, breathing, pulsos infinitos) y
 * se conservan las transiciones cortas que ayudan a comprender la UI.
 */
import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

export function useReducedMotion(): boolean {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then(v => { if (alive) setReduce(!!v); })
      .catch(() => { /* sin señal → animar normal */ });
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', v => setReduce(!!v));
    return () => { alive = false; sub.remove(); };
  }, []);
  return reduce;
}
