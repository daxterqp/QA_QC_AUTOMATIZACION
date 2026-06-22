/**
 * SlideToConfirm — slider horizontal "Desliza para confirmar" (v29).
 *
 * Diseño gráfico, no textual:
 *  - Knob izquierdo: flecha → indica dirección del gesto.
 *  - Centro/derecha del track: icono target grande (Play / Pause / Stop) en
 *    outline tenue. Cuando el knob avanza, se va destapando hasta cubrirlo.
 *  - Debajo del track: ayuda corta tipo "Desliza para iniciar / pausar / finalizar".
 *
 * Snap-back si suelta antes del threshold; snap-forward + onConfirm() si completa.
 */
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, LayoutChangeEvent } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  Gesture,
  GestureDetector,
  GestureHandlerRootView,
} from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  runOnJS,
} from 'react-native-reanimated';
import { Colors, Radius } from '../theme/colors';

type Tone = 'primary' | 'warning' | 'success' | 'danger';
type Action = 'play' | 'pause' | 'stop';

interface Props {
  /** Helper text mostrado DEBAJO del track (ej. "Desliza para iniciar"). */
  label: string;
  /** Icono target dentro del track. Por defecto se infiere del tone:
   *  primary→play, warning→pause, danger→stop. */
  action?: Action;
  onConfirm: () => void;
  tone?: Tone;
  disabled?: boolean;
  /** Mensaje opcional debajo (ej. razón de bloqueo). Reemplaza label si presente. */
  hint?: string;
  /** Threshold de confirmación: 0..1 del ancho útil. Default 0.9. */
  threshold?: number;
}

const KNOB_SIZE = 48;
const TRACK_HEIGHT = 56;

const TONE_COLORS: Record<Tone, { track: string; fill: string; knob: string; text: string; arrow: string }> = {
  primary: { track: Colors.surface, fill: Colors.primary + '30', knob: Colors.primary, text: Colors.primary, arrow: Colors.white },
  warning: { track: Colors.surface, fill: Colors.warning + '30', knob: Colors.warning, text: Colors.warning, arrow: Colors.white },
  success: { track: Colors.surface, fill: Colors.success + '30', knob: Colors.success, text: Colors.success, arrow: Colors.white },
  danger:  { track: Colors.surface, fill: Colors.danger  + '30', knob: Colors.danger,  text: Colors.danger,  arrow: Colors.white },
};

const ACTION_BY_TONE: Record<Tone, Action> = {
  primary: 'play',
  warning: 'pause',
  success: 'play',
  danger:  'stop',
};

const ACTION_ICON: Record<Action, keyof typeof Ionicons.glyphMap> = {
  play:  'play',
  pause: 'pause',
  stop:  'stop',
};

export function SlideToConfirm({
  label, action, onConfirm, tone = 'primary', disabled = false, hint, threshold = 0.9,
}: Props) {
  const [trackWidth, setTrackWidth] = useState(0);
  const translateX = useSharedValue(0);
  const confirmedRef = useRef(false);

  const maxX = Math.max(0, trackWidth - KNOB_SIZE - 8);
  const colors = TONE_COLORS[tone];
  const resolvedAction = action ?? ACTION_BY_TONE[tone];
  const actionIconName = ACTION_ICON[resolvedAction];
  const helperText = hint ?? label;

  useEffect(() => {
    translateX.value = 0;
    confirmedRef.current = false;
  }, [threshold, translateX]);

  const handleConfirm = () => {
    if (confirmedRef.current) return;
    confirmedRef.current = true;
    onConfirm();
    setTimeout(() => {
      confirmedRef.current = false;
      translateX.value = 0;
    }, 600);
  };

  const startX = useSharedValue(0);
  const panGesture = Gesture.Pan()
    .enabled(!disabled)
    .onBegin(() => { startX.value = translateX.value; })
    .onUpdate((e) => {
      'worklet';
      if (disabled) return;
      const next = startX.value + e.translationX;
      translateX.value = Math.max(0, Math.min(maxX, next));
    })
    .onEnd(() => {
      'worklet';
      if (disabled || maxX === 0) { translateX.value = withSpring(0); return; }
      if (translateX.value >= maxX * threshold) {
        translateX.value = withSpring(maxX, { damping: 18, stiffness: 180 }, () => {
          runOnJS(handleConfirm)();
        });
      } else {
        translateX.value = withSpring(0, { damping: 18, stiffness: 180 });
      }
    });

  const knobStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  const fillStyle = useAnimatedStyle(() => ({
    width: translateX.value + KNOB_SIZE / 2,
  }));

  // El icono target se desvanece a medida que el knob lo cubre — feedback de
  // progreso sin necesidad de texto.
  const targetIconStyle = useAnimatedStyle(() => ({
    opacity: maxX === 0 ? 0.35 : Math.max(0.05, 0.35 - (translateX.value / maxX) * 0.35),
  }));

  const handleLayout = (e: LayoutChangeEvent) => setTrackWidth(e.nativeEvent.layout.width);

  if (disabled) {
    return (
      <View style={styles.wrapper}>
        <View style={[styles.track, { backgroundColor: Colors.border + '40' }]}>
          <View style={[styles.knob, { backgroundColor: Colors.textMuted, opacity: 0.6 }]}>
            <Ionicons name="lock-closed" size={20} color={Colors.white} />
          </View>
          <View style={styles.targetIcon}>
            <Ionicons name={actionIconName} size={26} color={Colors.textMuted} />
          </View>
        </View>
        <Text style={[styles.helper, { color: Colors.textMuted, fontStyle: 'italic' }]}>
          {helperText}
        </Text>
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={styles.wrapper}>
      <View
        onLayout={handleLayout}
        style={[styles.track, { backgroundColor: colors.track, borderColor: colors.knob + '60' }]}
      >
        <Animated.View
          style={[styles.fill, fillStyle, { backgroundColor: colors.fill }]}
          pointerEvents="none"
        />
        <Animated.View style={[styles.targetIcon, targetIconStyle]} pointerEvents="none">
          <Ionicons name={actionIconName} size={26} color={colors.knob} />
        </Animated.View>
        <GestureDetector gesture={panGesture}>
          <Animated.View style={[styles.knob, { backgroundColor: colors.knob }, knobStyle]}>
            <Ionicons name="chevron-forward" size={22} color={colors.arrow} />
          </Animated.View>
        </GestureDetector>
      </View>
      <Text style={[styles.helper, { color: colors.text }]}>{helperText}</Text>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    width: '50%',
    minWidth: 220,
    alignSelf: 'center',
  },
  track: {
    width: '100%',
    height: TRACK_HEIGHT,
    borderRadius: TRACK_HEIGHT / 2,
    borderWidth: 1.5,
    overflow: 'hidden',
    position: 'relative',
    paddingHorizontal: 4,
  },
  fill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    borderRadius: TRACK_HEIGHT / 2,
  },
  knob: {
    position: 'absolute',
    top: (TRACK_HEIGHT - KNOB_SIZE) / 2 - 1.5, // compensa el borderWidth del track
    left: 4,
    width: KNOB_SIZE,
    height: KNOB_SIZE,
    borderRadius: KNOB_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 3,
  },
  /** Icono target — flotante a la derecha del track, semi-transparente. */
  targetIcon: {
    position: 'absolute',
    right: 16,
    top: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  helper: {
    fontSize: 12,
    fontWeight: '700',
    marginTop: 8,
    textAlign: 'center',
    letterSpacing: 0.3,
  },
});
