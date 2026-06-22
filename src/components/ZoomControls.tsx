import React, { useState, useCallback } from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../theme/colors';

/**
 * v42d — Zoom de la ficha (llenado + Audit). El usuario necesita a veces un paneo
 * total del ensayo (zoom out para ver todo) y volver a encuadrar. Se aplica como
 * `transform:[{scale}]` al contenido del ScrollView. Botones en el encabezado:
 *   −/+ : alejar/acercar · re-encuadrar (volver a 1.0) · bloquear (fija el zoom).
 * Implementación por botones (no pinch) para no chocar con el scroll del ScrollView.
 */
export interface ZoomState {
  scale: number;
  locked: boolean;
  zoomIn: () => void;
  zoomOut: () => void;
  reset: () => void;
  toggleLock: () => void;
}

const MIN = 0.5, MAX = 1.6, STEP = 0.1;

export function useEnsayoZoom(): ZoomState {
  const [scale, setScale] = useState(1);
  const [locked, setLocked] = useState(false);
  const zoomOut = useCallback(() => setScale(s => (locked ? s : Math.max(MIN, +(s - STEP).toFixed(2)))), [locked]);
  const zoomIn = useCallback(() => setScale(s => (locked ? s : Math.min(MAX, +(s + STEP).toFixed(2)))), [locked]);
  const reset = useCallback(() => setScale(1), []);
  const toggleLock = useCallback(() => setLocked(l => !l), []);
  return { scale, locked, zoomIn, zoomOut, reset, toggleLock };
}

/** Botones para el encabezado (sobre fondo navy). */
export function ZoomHeaderButtons({ z }: { z: ZoomState }) {
  return (
    <View style={styles.row}>
      <TouchableOpacity style={styles.btn} onPress={z.zoomOut} disabled={z.locked} hitSlop={HS}>
        <Ionicons name="remove-outline" size={18} color={z.locked ? Colors.light : Colors.white} />
      </TouchableOpacity>
      <TouchableOpacity style={styles.btn} onPress={z.zoomIn} disabled={z.locked} hitSlop={HS}>
        <Ionicons name="add-outline" size={18} color={z.locked ? Colors.light : Colors.white} />
      </TouchableOpacity>
      <TouchableOpacity style={styles.btn} onPress={z.reset} hitSlop={HS}>
        <Ionicons name="scan-outline" size={17} color={Colors.white} />
      </TouchableOpacity>
      <TouchableOpacity style={[styles.btn, z.locked && styles.btnActive]} onPress={z.toggleLock} hitSlop={HS}>
        <Ionicons name={z.locked ? 'lock-closed' : 'lock-open-outline'} size={16} color={z.locked ? Colors.navy : Colors.white} />
      </TouchableOpacity>
    </View>
  );
}

const HS = { top: 8, bottom: 8, left: 6, right: 6 };
const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  btn: { padding: 5, borderRadius: 6 },
  btnActive: { backgroundColor: Colors.white },
});
