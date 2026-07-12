/**
 * OfflineBanner (v29) — Chip flotante en esquina superior derecha.
 *
 * Antes era una barra superior que empujaba todo el contenido al aparecer.
 * Ahora es un pill compacto con position:absolute que NO mueve el layout.
 *
 * Estados:
 *   - Oculto: online + cola vacía + no sincronizando.
 *   - Ámbar: sin conexión (con o sin cola).
 *   - Azul:  sincronizando ahora (con spinner).
 *   - Gris:  online + cola pendiente sin sincronizar (toca para reintentar).
 *
 * Tap → abre SyncStatusModal con detalle por op_type + acciones de retry.
 */

import React, { useEffect, useRef, useState } from 'react';
import { Animated, View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Platform, StatusBar } from 'react-native';
import { Motion } from '../theme/motion';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNetwork } from '@context/NetworkContext';
import { useSyncQueue } from '@hooks/useSyncQueue';
import { SyncStatusModal } from './SyncStatusModal';

export function OfflineBanner() {
  const insets = useSafeAreaInsets();
  const { isOnline, isResolving } = useNetwork();
  const { pending, failed, syncing } = useSyncQueue();
  const [showModal, setShowModal] = useState(false);

  if (isResolving) return null;

  // v29 — Prioridad de estados (de más urgente a menos):
  //  1. Offline (ámbar)
  //  2. Fallidos permanentes (rojo) — preferido sobre "subiendo"
  //  3. Sincronizando (azul + spinner) — solo si hay pending real
  //  4. Pendientes ociosos (gris)
  //  5. Oculto
  const showOffline = !isOnline;
  const showFailed = isOnline && failed > 0;
  const showSyncing = isOnline && syncing && pending > 0; // ← guard: solo si hay algo
  const showPendingOnly = isOnline && !syncing && pending > 0;

  if (!showOffline && !showFailed && !showSyncing && !showPendingOnly) return null;

  const colorStyle = showOffline
    ? styles.amber
    : showFailed
      ? styles.red
      : showSyncing
        ? styles.blue
        : styles.gray;

  const count = pending + failed;
  const showBadge = count > 0;

  // En Android la status bar puede estar dentro del layout — usamos el mayor
  // entre safe-area insets.top y StatusBar.currentHeight para que el chip
  // siempre quede DEBAJO de la barra del sistema, no detrás de ella.
  const topOffset = Math.max(insets.top, Platform.OS === 'android' ? (StatusBar.currentHeight ?? 0) : 0) + 6;

  return (
    <>
      <View pointerEvents="box-none" style={[styles.container, { top: topOffset }]}>
        <ChipIn>
        <TouchableOpacity
          onPress={() => setShowModal(true)}
          activeOpacity={0.85}
          style={[styles.chip, colorStyle]}
        >
          {showSyncing
            ? <ActivityIndicator size="small" color="#fff" />
            : <Ionicons
                name={showOffline
                  ? 'cloud-offline-outline'
                  : showFailed
                    ? 'alert-circle-outline'
                    : 'cloud-upload-outline'}
                size={14}
                color="#fff"
              />
          }
          {showBadge && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{count > 99 ? '99+' : count}</Text>
            </View>
          )}
        </TouchableOpacity>
        </ChipIn>
      </View>

      {showModal && <SyncStatusModal onClose={() => setShowModal(false)} />}
    </>
  );
}

/** v89 — Entrada del pill con fade+scale (antes se teletransportaba al
 *  cambiar de estado oculto→visible). Salida instantanea: aceptable. */
function ChipIn({ children }: { children: React.ReactNode }) {
  const scale = useRef(new Animated.Value(0.92)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 180, easing: Motion.easeOut, useNativeDriver: true }),
      Animated.timing(scale, { toValue: 1, duration: 180, easing: Motion.easeOut, useNativeDriver: true }),
    ]).start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return <Animated.View style={{ opacity, transform: [{ scale }] }}>{children}</Animated.View>;
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    right: 8,
    zIndex: 9999,
    elevation: 9999,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 16,
    minHeight: 28,
    minWidth: 28,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
    elevation: 4,
  },
  badge: {
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderRadius: 8,
    minWidth: 16,
    paddingHorizontal: 4,
    paddingVertical: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { fontSize: 10, fontWeight: '900', color: '#0f172a' },
  amber: { backgroundColor: '#d97706' },  // ámbar — offline
  blue:  { backgroundColor: '#2563eb' },  // azul — sincronizando
  gray:  { backgroundColor: '#6b7280' },  // gris — pending sin sincronizar
  red:   { backgroundColor: '#dc2626' },  // rojo — errores permanentes
});
