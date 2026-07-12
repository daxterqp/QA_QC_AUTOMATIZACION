/**
 * AIQuickBubble — Burbuja flotante ARRASTRABLE de acceso rápido a FLOW (v76).
 *
 * Overlay global (montada una sola vez en AppNavigator): aparece en cualquier
 * pantalla del proyecto cuyos params traigan `projectId`, si el proyecto tiene
 * `module_ai_assistant` ON y `ai_quick_button` no está apagado (default ON).
 * Se arrastra a donde no estorbe, hace snap al borde más cercano y RECUERDA su
 * posición (AsyncStorage, global del dispositivo). Tap = abrir el chat de FLOW.
 */
import React, { useEffect, useRef, useState } from 'react';
import { Animated, Dimensions, PanResponder, StyleSheet } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SharkLogo } from './FlowSharkLogo';
import { projectsCollection } from '@db/index';
import { parseFeatureFlagsJson } from '@utils/featureFlags';
import { Colors, Shadow } from '../theme/colors';

const SIZE = 52;
const MARGIN = 10;
const POS_KEY = 'ai_bubble_pos_v1';

/** Pantallas donde la burbuja NUNCA aparece (cámara, visores, el propio chat…). */
const HIDDEN_ROUTES = new Set([
  'Login', 'AIChat', 'Camera', 'QRScanner', 'DossierPreview', 'PlanViewer',
  'Measurement', 'ForceTakeoverPhoto', 'Signature',
]);

export interface ActiveRouteInfo {
  name: string;
  // deno-lint-ignore no-explicit-any
  params?: Record<string, unknown>;
}

interface Props {
  route: ActiveRouteInfo | null;
  navigate: (screen: string, params: Record<string, unknown>) => void;
}

export function AIQuickBubble({ route, navigate }: Props) {
  const [visibleFor, setVisibleFor] = useState<{ projectId: string; projectName: string } | null>(null);

  const win = Dimensions.get('window');
  const pos = useRef(new Animated.ValueXY({ x: win.width - SIZE - MARGIN, y: win.height * 0.74 })).current;
  const posRaw = useRef({ x: win.width - SIZE - MARGIN, y: win.height * 0.74 });
  const dragTotal = useRef(0);

  // Posición persistida (una sola carga).
  useEffect(() => {
    AsyncStorage.getItem(POS_KEY).then(raw => {
      if (!raw) return;
      try {
        const p = JSON.parse(raw);
        if (typeof p?.x === 'number' && typeof p?.y === 'number') {
          const clamped = clampPos(p.x, p.y);
          posRaw.current = clamped;
          pos.setValue(clamped);
        }
      } catch { /* posición corrupta: default */ }
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Visibilidad según ruta activa + flags del proyecto (base local, barato).
  useEffect(() => {
    let alive = true;
    const projectId = route?.params?.projectId;
    if (!route || HIDDEN_ROUTES.has(route.name) || typeof projectId !== 'string' || !projectId) {
      setVisibleFor(null);
      return;
    }
    projectsCollection.find(projectId)
      .then((p: unknown) => {
        if (!alive) return;
        // deno-lint-ignore no-explicit-any
        const proj = p as any;
        const flags = parseFeatureFlagsJson(proj?.featureFlags ?? null);
        if (flags.module_ai_assistant === true && flags.ai_quick_button !== false) {
          setVisibleFor({ projectId, projectName: String(proj?.name ?? '') });
        } else {
          setVisibleFor(null);
        }
      })
      .catch(() => { if (alive) setVisibleFor(null); });
    return () => { alive = false; };
  }, [route]);

  // Suelta el gesto en su posición actual: clamp + snap al borde + persistir.
  const settle = (dx: number, dy: number) => {
    const next = clampPos(posRaw.current.x + dx, posRaw.current.y + dy);
    const w = Dimensions.get('window').width;
    next.x = next.x + SIZE / 2 < w / 2 ? MARGIN : w - SIZE - MARGIN;
    posRaw.current = next;
    Animated.spring(pos, { toValue: next, useNativeDriver: false, friction: 6 }).start();
    AsyncStorage.setItem(POS_KEY, JSON.stringify(next)).catch(() => {});
  };
  const settleRef = useRef(settle);
  settleRef.current = settle;

  const grantAtRef = useRef(0);
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dx) + Math.abs(g.dy) > 6,
      onPanResponderGrant: () => { dragTotal.current = 0; grantAtRef.current = Date.now(); },
      onPanResponderMove: (_e, g) => {
        // MÁXIMO recorrido (no el neto): arrastrar y volver al origen NO es un tap.
        dragTotal.current = Math.max(dragTotal.current, Math.abs(g.dx) + Math.abs(g.dy));
        pos.setValue({ x: posRaw.current.x + g.dx, y: posRaw.current.y + g.dy });
      },
      onPanResponderRelease: (_e, g) => {
        const moved = Math.max(dragTotal.current, Math.abs(g.dx) + Math.abs(g.dy));
        settleRef.current(g.dx, g.dy);
        if (moved <= 6) {
          const target = targetRef.current;
          if (!target) return;
          // Tap: abrir a FLOW. LONG-press (≥280ms): abrir DICTANDO (autoMic).
          const longPress = Date.now() - grantAtRef.current >= 280;
          navigate('AIChat', {
            projectId: target.projectId,
            projectName: target.projectName,
            ...(longPress ? { autoMic: true } : {}),
          });
        }
      },
      // Si el sistema u otro responder roba el gesto a mitad de arrastre, la
      // burbuja igual se asienta (sin esto quedaba flotando sin clamp/persistir).
      onPanResponderTerminate: (_e, g) => { settleRef.current(g.dx, g.dy); },
    }),
  ).current;

  // Cambio de tamaño de ventana (split-screen / plegables): re-clamp para que
  // la burbuja nunca quede fuera de la pantalla.
  useEffect(() => {
    const sub = Dimensions.addEventListener('change', () => {
      const next = clampPos(posRaw.current.x, posRaw.current.y);
      posRaw.current = next;
      pos.setValue(next);
    });
    return () => sub.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // El PanResponder se crea una vez: el destino vive en un ref siempre fresco.
  const targetRef = useRef(visibleFor);
  targetRef.current = visibleFor;

  if (!visibleFor) return null;

  return (
    <Animated.View
      style={[styles.bubble, { transform: pos.getTranslateTransform() }]}
      {...panResponder.panHandlers}
    >
      <SharkLogo size={40} color={Colors.white} />
    </Animated.View>
  );
}

function clampPos(x: number, y: number): { x: number; y: number } {
  const { width, height } = Dimensions.get('window');
  return {
    x: Math.min(Math.max(x, MARGIN), width - SIZE - MARGIN),
    y: Math.min(Math.max(y, 60), height - SIZE - 30),
  };
}

const styles = StyleSheet.create({
  bubble: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    backgroundColor: Colors.navy,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: Colors.primary + '88',
    ...Shadow.card,
    elevation: 8,
    zIndex: 60,
  },
});
