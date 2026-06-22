/**
 * fonts.ts — Tipografía global Montserrat para TODA la app.
 *
 * Estrategia: parche del render de `Text`/`TextInput` que inyecta la variante
 * correcta de Montserrat según el `fontWeight` del estilo (regular/semibold/bold/
 * extrabold). NO toca textos que ya declaran `fontFamily` (p.ej. los íconos de
 * @expo/vector-icons o el login, que usa Montserrat explícito). Reversible: quitar
 * la llamada a `applyGlobalMontserrat()` en App.tsx.
 *
 * Las fuentes se cargan al arranque con `useFonts(MONTSERRAT_FONTS)`.
 */
import React from 'react';
import { Text, TextInput, StyleSheet } from 'react-native';
import {
  Montserrat_400Regular, Montserrat_500Medium, Montserrat_600SemiBold,
  Montserrat_700Bold, Montserrat_800ExtraBold,
} from '@expo-google-fonts/montserrat';

export const MONTSERRAT_FONTS = {
  Montserrat_400Regular, Montserrat_500Medium, Montserrat_600SemiBold,
  Montserrat_700Bold, Montserrat_800ExtraBold,
};

/** Elige la familia Montserrat según el fontWeight; null si el texto ya trae fontFamily. */
function pickFamily(style: unknown): string | null {
  const flat = (StyleSheet.flatten(style as any) || {}) as { fontFamily?: string; fontWeight?: string | number };
  if (flat.fontFamily) return null; // respeta fuentes explícitas (íconos, login, etc.)
  const w = String(flat.fontWeight ?? '400');
  if (w === '800' || w === '900') return 'Montserrat_800ExtraBold';
  if (w === 'bold' || w === '700') return 'Montserrat_700Bold';
  if (w === '600') return 'Montserrat_600SemiBold';
  if (w === '500') return 'Montserrat_500Medium';
  return 'Montserrat_400Regular';
}

let patched = false;

/** Aplica Montserrat como fuente base de todos los Text/TextInput. Idempotente. */
export function applyGlobalMontserrat(): void {
  if (patched) return;
  patched = true;
  for (const Comp of [Text, TextInput] as any[]) {
    const orig = Comp.render;
    if (typeof orig !== 'function') continue;
    Comp.render = function patchedRender(...args: any[]) {
      const el = orig.apply(this, args);
      if (!el || !el.props) return el;
      const fam = pickFamily(el.props.style);
      if (!fam) return el;
      return React.cloneElement(el, { style: [{ fontFamily: fam }, el.props.style] });
    };
  }
}
