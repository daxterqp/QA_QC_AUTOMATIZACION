/**
 * TourOverlay
 *
 * - Paso 0 (sin elementId): Welcome card Modal centrada
 * - Pasos con elementId medido: Spotlight 4 tiras + tooltip
 * - Pasos con elementId SIN medir (waiting): Píldora flotante no bloqueante
 *   → el usuario puede navegar libremente; la píldora indica adónde ir
 */

import React, { useEffect, useRef } from 'react';
import {
  Animated, Modal, Platform, StatusBar, StyleSheet,
  Text, TouchableOpacity, useWindowDimensions, View,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useTour } from '@context/TourContext';
import { Colors, Radius, Shadow } from '../theme/colors';

const PAD = 10;

export default function TourOverlay() {
  const {
    isActive, currentStep, currentStepIndex, totalSteps,
    measures, nextStep, prevStep, skipTour, completeTour,
  } = useTour();

  const { width: SW, height: SH } = useWindowDimensions();

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.92)).current;
  const pulseAnim = useRef(new Animated.Value(0)).current;
  const bounceAnim = useRef(new Animated.Value(0)).current;
  const ringAnim1 = useRef(new Animated.Value(0)).current;
  const ringAnim2 = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!isActive) { fadeAnim.setValue(0); return; }
    fadeAnim.setValue(0);
    scaleAnim.setValue(0.92);
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 220, useNativeDriver: true }),
      Animated.timing(scaleAnim, { toValue: 1, duration: 220, useNativeDriver: true }),
    ]).start();
  }, [isActive]);

  useEffect(() => {
    if (!isActive) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1, duration: 800, useNativeDriver: false }),
        Animated.timing(pulseAnim, { toValue: 0, duration: 800, useNativeDriver: false }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [isActive]);

  // Bounce del cursor en estado waiting
  useEffect(() => {
    if (!isActive) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(bounceAnim, { toValue: -10, duration: 380, useNativeDriver: true }),
        Animated.timing(bounceAnim, { toValue: 0, duration: 380, useNativeDriver: true }),
        Animated.delay(200),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [isActive, currentStepIndex]);

  // Anillos pulsantes del cursor (desfasados entre sí)
  useEffect(() => {
    if (!isActive) return;
    ringAnim1.setValue(0);
    ringAnim2.setValue(0);
    const loop1 = Animated.loop(
      Animated.sequence([
        Animated.timing(ringAnim1, { toValue: 1, duration: 1100, useNativeDriver: true }),
        Animated.timing(ringAnim1, { toValue: 0, duration: 0, useNativeDriver: true }),
      ])
    );
    const loop2 = Animated.loop(
      Animated.sequence([
        Animated.delay(550),
        Animated.timing(ringAnim2, { toValue: 1, duration: 1100, useNativeDriver: true }),
        Animated.timing(ringAnim2, { toValue: 0, duration: 0, useNativeDriver: true }),
      ])
    );
    loop1.start();
    loop2.start();
    return () => { loop1.stop(); loop2.stop(); };
  }, [isActive, currentStepIndex]);

  if (!isActive || !currentStep) return null;

  const TEAL = '#20b2aa';
  // isWelcome solo si no tiene elementId NI waitingElementId (welcome/bridge puro)
  const isWelcome = !currentStep.elementId && !currentStep.waitingElementId;
  const measure = currentStep.elementId ? measures[currentStep.elementId] : undefined;
  const isWaiting = !isWelcome && !measure;
  const isLastStep = currentStepIndex === totalSteps - 1;
  const stepLabel = `${currentStepIndex} / ${totalSteps - 1}`;

  // ── Welcome Card (paso 0) ──────────────────────────────────────────────────
  if (isWelcome) {
    return (
      <Modal transparent visible animationType="none" statusBarTranslucent>
        <Animated.View style={[styles.centeredOverlay, { opacity: fadeAnim }]}>
          <Animated.View style={[styles.welcomeCard, { transform: [{ scale: scaleAnim }] }]}>
            <View style={styles.welcomeIconCircle}>
              <Ionicons name="shield-checkmark" size={40} color={Colors.white} />
            </View>
            <Text style={styles.welcomeTitle}>{currentStep.title}</Text>
            <Text style={styles.welcomeMessage}>{currentStep.message}</Text>
            <View style={styles.rowBtns}>
              <TouchableOpacity onPress={skipTour} style={styles.skipBtn}>
                <Text style={styles.skipText}>Saltar tutorial</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={nextStep} style={styles.primaryBtn}>
                <Text style={styles.primaryBtnText}>Empezar</Text>
                <Ionicons name="arrow-forward" size={16} color={Colors.white} />
              </TouchableOpacity>
            </View>
          </Animated.View>
        </Animated.View>
      </Modal>
    );
  }

  // ── Waiting: Tarjeta flotante NO bloqueante ───────────────────────────────
  // El usuario puede navegar libremente. La tarjeta indica adónde ir.
  // Con pre-medición en useTourStep (upcomingStep), este estado solo aparece
  // cuando el siguiente paso está en una pantalla diferente (navegación real necesaria).
  if (isWaiting) {
    const hint = currentStep.waitingHint ?? 'Navega a la pantalla del siguiente paso';
    const sbOffset2 = Platform.OS === 'android' ? (StatusBar.currentHeight ?? 0) : 0;
    const wm = currentStep.waitingElementId ? measures[currentStep.waitingElementId] : undefined;
    const ringScale = pulseAnim.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1.35] });
    const ringOpacity = pulseAnim.interpolate({ inputRange: [0, 1], outputRange: [0.8, 0.15] });
    const isRight = currentStep.waitingHandDirection === 'right';
    const handOffsetY = currentStep.waitingHandOffsetY ?? 0;

    return (
      <View style={StyleSheet.absoluteFill} pointerEvents="box-none">

        {/* Mano apuntando flotante — solo cuando el elemento está en pantalla */}
        {wm && (
          <Animated.View
            style={[
              styles.floatingCursor,
              {
                left: isRight ? wm.x - 52 : wm.x + wm.width * 0.67,
                top: wm.y + sbOffset2 + wm.height / 2 - 18 + handOffsetY,
                opacity: fadeAnim,
                transform: [{
                  translateX: isRight
                    ? bounceAnim.interpolate({ inputRange: [-10, 0], outputRange: [10, 0] })
                    : bounceAnim,
                }],
              },
            ]}
            pointerEvents="none"
          >
            {/* Anillo pulsante 1 */}
            <Animated.View style={[styles.pulseRing, {
              opacity: ringAnim1.interpolate({ inputRange: [0, 0.3, 1], outputRange: [0.7, 0.4, 0] }),
              transform: [{ scale: ringAnim1.interpolate({ inputRange: [0, 1], outputRange: [0.4, 2.0] }) }],
            }]} />
            {/* Anillo pulsante 2 (desfasado) */}
            <Animated.View style={[styles.pulseRing, {
              opacity: ringAnim2.interpolate({ inputRange: [0, 0.3, 1], outputRange: [0.7, 0.4, 0] }),
              transform: [{ scale: ringAnim2.interpolate({ inputRange: [0, 1], outputRange: [0.4, 2.0] }) }],
            }]} />
            <MaterialCommunityIcons
              name={isRight ? 'hand-pointing-right' : 'hand-pointing-left'}
              size={36}
              color={TEAL}
            />
          </Animated.View>
        )}

        {/* Píldora de guía — solo texto, sin cursor */}
        <Animated.View style={[styles.waitingPill, { opacity: fadeAnim }]} pointerEvents="auto">
          {/* Cabecera teal */}
          <View style={styles.waitingPillHeader}>
            <Ionicons name="navigate-circle" size={18} color={Colors.white} />
            <Text style={styles.waitingPillStep}>SIGUIENTE PASO — {stepLabel}</Text>
            <View style={{ flex: 1 }} />
            {currentStepIndex > 0 && (
              <TouchableOpacity onPress={prevStep} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Ionicons name="arrow-back" size={18} color={Colors.white} />
              </TouchableOpacity>
            )}
            <TouchableOpacity onPress={isLastStep ? completeTour : nextStep} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} style={{ marginLeft: 12 }}>
              <Ionicons name={isLastStep ? 'checkmark' : 'arrow-forward'} size={18} color={Colors.white} />
            </TouchableOpacity>
            <TouchableOpacity onPress={skipTour} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} style={{ marginLeft: 12 }}>
              <Ionicons name="close" size={18} color="rgba(255,255,255,0.8)" />
            </TouchableOpacity>
          </View>
          {/* Cuerpo — título e indicación */}
          <View style={styles.waitingPillBody}>
            <Text style={styles.waitingPillTitle}>{currentStep.title}</Text>
            <Text style={styles.waitingPillHint}>{hint}</Text>
          </View>
        </Animated.View>
      </View>
    );
  }

  // ── Spotlight + Tooltip ───────────────────────────────────────────────────
  const mx = measure!;
  // En Android, measureInWindow devuelve Y relativo al tope de la ventana de la app
  // (debajo del status bar), pero el Modal con statusBarTranslucent parte desde Y=0
  // (tope absoluto de la pantalla). Hay que sumar statusBarHeight para alinear.
  const sbOffset = Platform.OS === 'android' ? (StatusBar.currentHeight ?? 0) : 0;
  const absY = mx.y + sbOffset;
  const hy = Math.max(0, absY - PAD);
  const hx = Math.max(0, mx.x - PAD);
  const heightFraction = currentStep.highlightHeightFraction ?? 1;
  const hh = (mx.height + PAD * 2) * heightFraction;
  const hw = mx.width + PAD * 2;

  // spaceBelow basado en hh (altura real del spotlight, no la del elemento completo)
  const spaceBelow = SH - (hy + hh + PAD);
  const showAbove = spaceBelow < 260;

  const borderColor = pulseAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [`${TEAL}99`, TEAL],
  });

  // showAbove: tooltip encima del elemento.
  // SH - hy + 12 posiciona el borde inferior del tooltip 12px arriba del elemento.
  // Clamp [80, SH-200] para que nunca salga de pantalla por arriba ni quede muy alto.
  const tooltipStyle = showAbove
    ? { bottom: Math.min(SH - 200, Math.max(80, SH - hy + 12)) }
    : { top: Math.min(hy + hh + 12, SH - 210) };

  // Caret: centro horizontal del elemento destacado, relativo al tooltip (left=16)
  const caretAbsCenter = hx + hw / 2;
  const caretRelLeft = Math.max(8, Math.min(SW - 64, caretAbsCenter - 16));

  return (
    <Modal transparent visible animationType="none" statusBarTranslucent>
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: fadeAnim }]}>

        {/* 4 tiras oscuras */}
        <View style={[styles.strip, { top: 0, left: 0, right: 0, height: hy }]} />
        <View style={[styles.strip, { top: hy + hh, left: 0, right: 0, bottom: 0 }]} />
        <View style={[styles.strip, { top: hy, left: 0, width: hx, height: hh }]} />
        <View style={[styles.strip, { top: hy, left: hx + hw, right: 0, height: hh }]} />

        {/* Borde pulsante */}
        <Animated.View
          style={[styles.highlightBorder, { top: hy, left: hx, width: hw, height: hh, borderColor }]}
        />

        {/* Cursor de mano sobre el elemento (opcional) */}
        {currentStep.showHandCursor && (() => {
          const fromRight = currentStep.handCursorDirection === 'right';
          const handLeft = fromRight ? mx.x - 44 : mx.x + mx.width * 0.67;
          const handBounce = fromRight
            ? bounceAnim.interpolate({ inputRange: [-10, 0], outputRange: [10, 0] })
            : bounceAnim;
          return (
            <Animated.View
              style={[styles.floatingCursor, {
                left: handLeft,
                top: absY + mx.height / 2 - 18,
                opacity: fadeAnim,
                transform: [{ translateX: handBounce }],
              }]}
              pointerEvents="none"
            >
              <MaterialCommunityIcons
                name={fromRight ? 'hand-pointing-right' : 'hand-pointing-left'}
                size={36}
                color={TEAL}
              />
            </Animated.View>
          );
        })()}

        {/* Tooltip */}
        <View style={[styles.tooltip, { width: SW - 32, left: 16, ...tooltipStyle }]}>
          {!showAbove && <View style={[styles.caret, styles.caretUp, { left: caretRelLeft }]} />}
          {showAbove  && <View style={[styles.caret, styles.caretDown, { left: caretRelLeft }]} />}

          <Text style={styles.tooltipCounter}>{stepLabel}</Text>
          <Text style={styles.tooltipTitle}>{currentStep.title}</Text>
          <Text style={styles.tooltipMessage}>{currentStep.message}</Text>

          <View style={styles.tooltipBtns}>
            <TouchableOpacity onPress={skipTour} style={styles.skipBtnSmall}>
              <Text style={styles.skipText}>Salir</Text>
            </TouchableOpacity>
            <View style={styles.rowBtns}>
              {currentStepIndex > 0 && (
                <TouchableOpacity onPress={prevStep} style={styles.backBtn}>
                  <Ionicons name="arrow-back" size={14} color="#20b2aa" />
                  <Text style={styles.backBtnText}>Atrás</Text>
                </TouchableOpacity>
              )}
              {isLastStep ? (
                <TouchableOpacity onPress={completeTour} style={styles.finishBtn}>
                  <Text style={styles.primaryBtnText}>Finalizar</Text>
                  <Ionicons name="checkmark" size={14} color={Colors.white} />
                </TouchableOpacity>
              ) : (
                <TouchableOpacity onPress={nextStep} style={styles.primaryBtn}>
                  <Text style={styles.primaryBtnText}>Siguiente</Text>
                  <Ionicons name="arrow-forward" size={14} color={Colors.white} />
                </TouchableOpacity>
              )}
            </View>
          </View>
        </View>

      </Animated.View>
    </Modal>
  );
}

// ── Estilos ───────────────────────────────────────────────────────────────────

const OVERLAY_BG = 'rgba(14,33,61,0.80)';

const styles = StyleSheet.create({
  centeredOverlay: {
    flex: 1,
    backgroundColor: OVERLAY_BG,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },

  // ── Welcome ───────────────────────────────────────────────────────────────
  welcomeCard: {
    backgroundColor: Colors.white,
    borderRadius: Radius.xl,
    padding: 28,
    alignItems: 'center',
    gap: 14,
    ...Shadow.card,
    width: '100%',
    maxWidth: 420,
  },
  welcomeIconCircle: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: Colors.navy,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  welcomeTitle: { fontSize: 22, fontWeight: '700', color: Colors.navy, textAlign: 'center' },
  welcomeMessage: { fontSize: 14, color: Colors.textSecondary, textAlign: 'center', lineHeight: 20 },

  // ── Waiting pill ──────────────────────────────────────────────────────────
  waitingPill: {
    position: 'absolute',
    bottom: 96,
    left: 16,
    right: 16,
    backgroundColor: Colors.white,
    borderRadius: Radius.lg,
    overflow: 'hidden',
    ...Shadow.card,
    borderWidth: 1.5,
    borderColor: '#20b2aa',
  },
  waitingPillHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#20b2aa',
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  waitingPillStep: { fontSize: 10, fontWeight: '700', color: Colors.white, letterSpacing: 1 },
  waitingPillBody: { paddingHorizontal: 14, paddingTop: 10, paddingBottom: 12 },
  waitingPillBodyRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  waitingPillTitle: { fontSize: 14, fontWeight: '700', color: Colors.navy },
  waitingPillHint: { fontSize: 12, color: Colors.textSecondary, marginTop: 3, lineHeight: 17 },
  waitingPillFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingBottom: 10,
    paddingTop: 4,
  },
  pillNextBtn: {
    flexDirection: 'row',
    gap: 4,
    backgroundColor: '#20b2aa',
    borderRadius: Radius.sm,
    paddingHorizontal: 14,
    paddingVertical: 7,
    alignItems: 'center',
  },
  pillNextBtnText: { color: Colors.white, fontWeight: '700', fontSize: 12 },
  pillAction: { padding: 2 },

  // ── Floating pointing hand (waiting + element on screen) ──────────────────
  floatingCursor: {
    position: 'absolute',
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 999,
  },
  pulseRing: {
    position: 'absolute',
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 2,
    borderColor: '#20b2aa',
    backgroundColor: 'rgba(32,178,170,0.15)',
  },
  floatingCursorRing: {
    position: 'absolute',
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 2.5,
    borderColor: '#20b2aa',
    backgroundColor: 'rgba(32,178,170,0.08)',
  },
  pointingHand: {
    transform: [{ rotate: '-90deg' }], // apunta hacia abajo (hacia el elemento)
  },

  // ── Spotlight ─────────────────────────────────────────────────────────────
  strip: { position: 'absolute', backgroundColor: OVERLAY_BG },
  highlightBorder: { position: 'absolute', borderWidth: 2.5, borderRadius: Radius.sm },

  // ── Tooltip ───────────────────────────────────────────────────────────────
  tooltip: {
    position: 'absolute',
    backgroundColor: Colors.white,
    borderRadius: Radius.lg,
    padding: 16,
    ...Shadow.card,
    gap: 6,
  },
  caret: {
    position: 'absolute',
    width: 0,
    height: 0,
    borderLeftWidth: 8,
    borderRightWidth: 8,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
  },
  caretUp: { top: -8, borderBottomWidth: 8, borderBottomColor: Colors.white },
  caretDown: { bottom: -8, borderTopWidth: 8, borderTopColor: Colors.white },
  tooltipCounter: { fontSize: 10, fontWeight: '700', color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 1.5 },
  tooltipTitle: { fontSize: 15, fontWeight: '700', color: Colors.navy },
  tooltipMessage: { fontSize: 13, color: Colors.textSecondary, lineHeight: 18 },
  tooltipBtns: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 },

  // ── Botones comunes ───────────────────────────────────────────────────────
  rowBtns: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  skipBtn: { padding: 12 },
  skipBtnSmall: { padding: 8 },
  skipText: { color: Colors.textMuted, fontWeight: '600', fontSize: 13 },
  backBtn: {
    flexDirection: 'row', gap: 4, paddingHorizontal: 14, paddingVertical: 8,
    borderRadius: Radius.md, borderWidth: 1.5, borderColor: '#20b2aa', alignItems: 'center',
  },
  backBtnText: { color: '#20b2aa', fontWeight: '600', fontSize: 13 },
  primaryBtn: {
    flexDirection: 'row', gap: 6, backgroundColor: '#20b2aa',
    borderRadius: Radius.md, paddingHorizontal: 20, paddingVertical: 11, alignItems: 'center',
  },
  primaryBtnText: { color: Colors.white, fontWeight: '700', fontSize: 14 },
  finishBtn: {
    flexDirection: 'row', gap: 6, backgroundColor: '#20b2aa',
    borderRadius: Radius.md, paddingHorizontal: 16, paddingVertical: 8, alignItems: 'center',
  },
});
