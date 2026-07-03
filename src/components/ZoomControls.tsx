import React, { useState, useCallback } from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../theme/colors';

/**
 * v42d — Zoom de la ficha (llenado + Audit). El usuario necesita a veces un paneo
 * total del ensayo (zoom out para ver todo) y volver a encuadrar. Se aplica como
 * `transform:[{scale}]` al contenido del ScrollView. Botones en el encabezado:
 *   −/+ : alejar/acercar · re-encuadrar (volver a 1.0) · imprimir etiqueta.
 * Implementación por botones (no pinch) para no chocar con el scroll del ScrollView.
 *
 * v74 — El CANDADO (fijar zoom) se eliminó por pedido del usuario (no se usaba);
 * su lugar lo ocupa el botón de IMPRIMIR ETIQUETA (opcional vía `onPrint`).
 */
export interface ZoomState {
  scale: number;
  zoomIn: () => void;
  zoomOut: () => void;
  reset: () => void;
}

const MIN = 0.5, MAX = 1.6, STEP = 0.1;

export function useEnsayoZoom(): ZoomState {
  const [scale, setScale] = useState(1);
  const zoomOut = useCallback(() => setScale(s => Math.max(MIN, +(s - STEP).toFixed(2))), []);
  const zoomIn = useCallback(() => setScale(s => Math.min(MAX, +(s + STEP).toFixed(2))), []);
  const reset = useCallback(() => setScale(1), []);
  return { scale, zoomIn, zoomOut, reset };
}

/** Botones para el encabezado (sobre fondo navy). `onPrint` agrega el botón de
 *  imprimir etiqueta (con reloj de arena mientras `printing`). */
export function ZoomHeaderButtons({ z, onPrint, printing }: { z: ZoomState; onPrint?: () => void; printing?: boolean }) {
  return (
    <View style={styles.row}>
      <TouchableOpacity style={styles.btn} onPress={z.zoomOut} hitSlop={HS}>
        <Ionicons name="remove-outline" size={18} color={Colors.white} />
      </TouchableOpacity>
      <TouchableOpacity style={styles.btn} onPress={z.zoomIn} hitSlop={HS}>
        <Ionicons name="add-outline" size={18} color={Colors.white} />
      </TouchableOpacity>
      <TouchableOpacity style={styles.btn} onPress={z.reset} hitSlop={HS}>
        <Ionicons name="scan-outline" size={17} color={Colors.white} />
      </TouchableOpacity>
      {onPrint && (
        <TouchableOpacity style={styles.btn} onPress={onPrint} disabled={printing} hitSlop={HS}>
          <Ionicons name={printing ? 'hourglass-outline' : 'print-outline'} size={17} color={Colors.white} />
        </TouchableOpacity>
      )}
    </View>
  );
}

const HS = { top: 8, bottom: 8, left: 6, right: 6 };
const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  btn: { padding: 5, borderRadius: 6 },
});
