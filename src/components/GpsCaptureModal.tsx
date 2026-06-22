/**
 * GpsCaptureModal — Captura de coordenadas de MÁXIMA PRECISIÓN por promediado de
 * waypoints. Inicio MANUAL ("Comenzar medición"); promedia en vivo varias
 * lecturas de alta precisión, muestra la precisión que converge, y si el usuario
 * se ALEJA del punto sin guardar (olvidó el botón) corta y descarta las lecturas
 * de la huida — conservando el cúmulo estable.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Modal, View, Text, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Radius } from '../theme/colors';
import { startGpsAveraging } from '@hooks/useGpsCapture';
import type { TrackingHandle } from '@hooks/useGpsCapture';
import {
  emptyState, addSample, liveStats, isConverged, detectDeparture, finalizeResult,
  type AveragingState, type GpsAveragedResult,
} from '@utils/gpsAveraging';
import { formatCoords, type CoordinateSystem } from '@utils/CoordinateSystem';

const CAP_MS = 90000; // tope de medición

type Phase = 'idle' | 'measuring' | 'departed' | 'capped';

interface Props {
  visible: boolean;
  coordSystem: CoordinateSystem;
  onCancel: () => void;
  onSave: (r: GpsAveragedResult) => void;
}

function qualityPct(p: number | null): number {
  if (p == null) return 6;
  return Math.max(6, Math.min(100, 100 - p * 10)); // ±1m≈90%, ±3m≈70%, ±8m≈20%
}

export function GpsCaptureModal({ visible, coordSystem, onCancel, onSave }: Props) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [state, setState] = useState<AveragingState>(emptyState());
  const [error, setError] = useState<string | null>(null);
  const [departedTrim, setDepartedTrim] = useState<number | null>(null);
  const [, setTick] = useState(0); // refresca el cronómetro cada 1s
  const handleRef = useRef<TrackingHandle | null>(null);
  const startedAtRef = useRef<number>(0);

  const stopStream = useCallback(() => { handleRef.current?.stop(); handleRef.current = null; }, []);

  const reset = useCallback(() => {
    stopStream();
    setState(emptyState()); setPhase('idle'); setError(null); setDepartedTrim(null);
  }, [stopStream]);

  // Limpiar al cerrar / desmontar.
  useEffect(() => {
    if (!visible) reset();
    return () => stopStream();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const begin = useCallback(async () => {
    setError(null); setDepartedTrim(null); setState(emptyState());
    setPhase('measuring'); startedAtRef.current = Date.now();
    handleRef.current = await startGpsAveraging({
      onSample: (s) => setState(prev => addSample(prev, s)),
      onError: (msg) => { setError(msg); setPhase('idle'); stopStream(); },
    });
  }, [stopStream]);

  // Cronómetro 1s + tope máximo.
  useEffect(() => {
    if (phase !== 'measuring') return;
    const id = setInterval(() => {
      setTick(t => t + 1);
      if (Date.now() - startedAtRef.current >= CAP_MS) { stopStream(); setPhase('capped'); }
    }, 1000);
    return () => clearInterval(id);
  }, [phase, stopStream]);

  // Detección de alejamiento conforme llegan muestras.
  useEffect(() => {
    if (phase !== 'measuring') return;
    const dep = detectDeparture(state);
    if (dep.departed) { stopStream(); setDepartedTrim(dep.trimFromIndex); setPhase('departed'); }
  }, [state, phase, stopStream]);

  const stats = liveStats(state);
  const converged = phase === 'measuring' && isConverged(state);
  const elapsedS = phase === 'idle' ? 0 : Math.floor((Date.now() - startedAtRef.current) / 1000);
  const trim = phase === 'departed' ? (departedTrim ?? undefined) : undefined;
  const discarded = phase === 'departed' && departedTrim != null ? state.all.length - departedTrim : 0;
  const canSave = phase !== 'idle' && finalizeResult(state, trim) != null;

  const p = stats.precisionM;
  const precColor = p == null ? Colors.textMuted : p <= 3 ? Colors.success : p <= 8 ? '#f59e0b' : Colors.danger;
  const coordsText = stats.centroid ? formatCoords(stats.centroid.lat, stats.centroid.lng, coordSystem) : '—';

  const handleSave = () => { const r = finalizeResult(state, trim); if (r) { stopStream(); onSave(r); } };
  const handleCancel = () => { stopStream(); onCancel(); };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleCancel}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <Text style={styles.title}>Medir ubicación (precisión)</Text>

          {phase === 'idle' && (
            <>
              <View style={styles.tips}>
                <Text style={styles.tipsText}>
                  • Párate sobre el punto del ensayo, a cielo abierto.{'\n'}
                  • Mueve el teléfono en forma de “8” para calibrar la brújula.{'\n'}
                  • Promediaremos varias lecturas para la máxima precisión.
                </Text>
              </View>
              {error && <Text style={styles.error}>{error}</Text>}
              <TouchableOpacity style={styles.startBtn} onPress={begin}>
                <Ionicons name="locate" size={18} color="#fff" />
                <Text style={styles.startBtnText}>Comenzar medición</Text>
              </TouchableOpacity>
            </>
          )}

          {phase !== 'idle' && (
            <>
              <Text style={styles.coords} numberOfLines={1}>{coordsText}</Text>
              <View style={styles.precRow}>
                <Text style={[styles.prec, { color: precColor }]}>{p != null ? `± ${p.toFixed(1)} m` : 'calculando…'}</Text>
                <Text style={styles.meta}>{stats.sampleCount} muestras · {elapsedS}s</Text>
              </View>
              <View style={styles.barTrack}>
                <View style={[styles.barFill, { width: `${qualityPct(p)}%`, backgroundColor: precColor }]} />
              </View>

              {phase === 'measuring' && converged && <Text style={styles.okMsg}>✓ Convergido — listo para guardar</Text>}
              {phase === 'measuring' && !converged && (
                <View style={styles.measuringRow}>
                  <ActivityIndicator size="small" color={Colors.primary} />
                  <Text style={styles.meta}>Midiendo… mantente sobre el punto</Text>
                </View>
              )}
              {phase === 'capped' && <Text style={styles.okMsg}>Tiempo máximo alcanzado — puedes guardar.</Text>}
              {phase === 'departed' && (
                <Text style={styles.warn}>
                  Parece que te alejaste del punto sin guardar. Conservamos la medición estable
                  (se descartaron {discarded} lectura{discarded === 1 ? '' : 's'} al alejarte).
                </Text>
              )}

              <View style={styles.actions}>
                <TouchableOpacity style={styles.secondaryBtn} onPress={reset}>
                  <Text style={styles.secondaryText}>Reiniciar</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.saveBtn, !canSave && styles.disabled, (converged || phase === 'departed' || phase === 'capped') && styles.saveBtnReady]}
                  onPress={handleSave}
                  disabled={!canSave}
                >
                  <Text style={styles.saveText}>Guardar medición</Text>
                </TouchableOpacity>
              </View>
            </>
          )}

          <TouchableOpacity style={styles.cancel} onPress={handleCancel}>
            <Text style={styles.cancelText}>Cancelar</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  card: { backgroundColor: Colors.white, borderTopLeftRadius: 18, borderTopRightRadius: 18, padding: 18, paddingBottom: 26, gap: 10 },
  title: { fontSize: 15, fontWeight: '800', color: Colors.textPrimary },
  tips: { backgroundColor: Colors.surface, borderRadius: Radius.md, padding: 10 },
  tipsText: { fontSize: 12, color: Colors.textSecondary, lineHeight: 19 },
  error: { fontSize: 12, color: Colors.danger, fontWeight: '600' },
  startBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: Colors.primary, paddingVertical: 13, borderRadius: Radius.md },
  startBtnText: { color: Colors.white, fontSize: 14, fontWeight: '800' },
  coords: { fontSize: 15, fontWeight: '700', color: Colors.textPrimary, textAlign: 'center', marginTop: 2 },
  precRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  prec: { fontSize: 22, fontWeight: '800' },
  meta: { fontSize: 12, color: Colors.textSecondary },
  barTrack: { height: 8, borderRadius: 4, backgroundColor: '#e9edf3', overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 4 },
  okMsg: { fontSize: 12, fontWeight: '700', color: Colors.success },
  warn: { fontSize: 12, fontWeight: '600', color: '#b45309', backgroundColor: '#fef6e7', padding: 8, borderRadius: Radius.sm },
  measuringRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 4 },
  secondaryBtn: { flex: 1, alignItems: 'center', paddingVertical: 12, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border },
  secondaryText: { fontSize: 13, fontWeight: '700', color: Colors.textSecondary },
  saveBtn: { flex: 2, alignItems: 'center', paddingVertical: 12, borderRadius: Radius.md, backgroundColor: Colors.primary },
  saveBtnReady: { backgroundColor: Colors.success },
  saveText: { fontSize: 13, fontWeight: '800', color: Colors.white },
  disabled: { opacity: 0.45 },
  cancel: { alignItems: 'center', paddingVertical: 8, marginTop: 2 },
  cancelText: { fontSize: 13, color: Colors.textSecondary, fontWeight: '600' },
});
