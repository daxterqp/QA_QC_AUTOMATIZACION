/**
 * Toast — feedback breve no bloqueante. Sin libs externas.
 *
 * Uso:
 *   <ToastHost />   // monta UNA vez en el root del navigator
 *   showToast('Sesión iniciada', 'success')
 *
 * Internamente usa un emitter simple. Auto-cierra a los 1500ms con fade-in/out
 * usando Animated.timing (suficiente para este caso de uso; no requiere
 * react-native-reanimated).
 */
import React, { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, View, Text, Easing } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Radius } from '../theme/colors';
import { Motion } from '../theme/motion';

export type ToastTone = 'success' | 'info' | 'warning' | 'danger';

interface ToastEvent {
  id: number;
  message: string;
  tone: ToastTone;
}

type Listener = (ev: ToastEvent) => void;

const listeners = new Set<Listener>();
let nextId = 1;

export function showToast(message: string, tone: ToastTone = 'info'): void {
  const ev: ToastEvent = { id: nextId++, message, tone };
  for (const l of listeners) l(ev);
}

const TONE_STYLE: Record<ToastTone, { bg: string; icon: string }> = {
  success: { bg: Colors.success, icon: 'checkmark-circle' },
  info:    { bg: Colors.primary, icon: 'information-circle' },
  warning: { bg: Colors.warning, icon: 'warning' },
  danger:  { bg: Colors.danger,  icon: 'close-circle' },
};

export function ToastHost() {
  const [current, setCurrent] = useState<ToastEvent | null>(null);
  const opacity = useRef(new Animated.Value(0)).current;
  // v89 — El toast baja desde su anclaje (top) al entrar: fade puro se
  // materializaba de la nada (sin fisicalidad).
  const translateY = useRef(new Animated.Value(-8)).current;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const queueRef = useRef<ToastEvent[]>([]);
  const currentRef = useRef<ToastEvent | null>(null);

  useEffect(() => {
    // Muestra ev: fade-in, espera 1500ms, fade-out; al terminar fade-out, si hay
    // siguiente en la cola lo muestra; sino limpia current.
    const present = (ev: ToastEvent) => {
      currentRef.current = ev;
      setCurrent(ev);
      translateY.setValue(-8);
      Animated.parallel([
        Animated.timing(opacity, { toValue: 1, duration: 180, easing: Motion.easeOut, useNativeDriver: true }),
        Animated.timing(translateY, { toValue: 0, duration: 180, easing: Motion.easeOut, useNativeDriver: true }),
      ]).start();
      timerRef.current = setTimeout(() => {
        // v89 — salida ease-OUT (Easing.in arranca lento justo cuando el ojo mira).
        Animated.timing(opacity, { toValue: 0, duration: 160, easing: Motion.easeOut, useNativeDriver: true })
          .start(({ finished }) => {
            if (!finished) return;
            const next = queueRef.current.shift();
            if (next) {
              present(next);
            } else {
              currentRef.current = null;
              setCurrent(null);
            }
          });
        timerRef.current = null;
      }, 1500);
    };

    const onShow: Listener = (ev) => {
      // Cola FIFO: si ya hay un toast visible, encolar; si no, mostrar ahora.
      if (currentRef.current !== null) {
        queueRef.current.push(ev);
        return;
      }
      present(ev);
    };
    listeners.add(onShow);
    return () => {
      listeners.delete(onShow);
      if (timerRef.current) clearTimeout(timerRef.current);
      queueRef.current = [];
      currentRef.current = null;
    };
  }, [opacity]);

  if (!current) return null;
  const t = TONE_STYLE[current.tone];

  return (
    <View pointerEvents="none" style={styles.host}>
      <Animated.View style={[styles.bubble, { backgroundColor: t.bg, opacity, transform: [{ translateY }] }]}>
        <Ionicons name={t.icon as any} size={16} color={Colors.white} />
        <Text style={styles.text} numberOfLines={2}>{current.message}</Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  host: {
    position: 'absolute',
    top: 60,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 9999,
    elevation: 9999,
  },
  bubble: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: Radius.md,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 6,
    maxWidth: '90%',
  },
  text: {
    color: Colors.white,
    fontSize: 13,
    fontWeight: '700',
    flexShrink: 1,
  },
});
