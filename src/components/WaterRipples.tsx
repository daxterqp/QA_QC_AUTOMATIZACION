import React, { forwardRef, useImperativeHandle, useRef, useState } from 'react';
import { View, StyleSheet, Animated, Easing, GestureResponderEvent } from 'react-native';

/**
 * WaterRipples — efecto de "gota en el agua" al tocar/arrastrar.
 * Envuelve el contenido y captura los toques SIN bloquear los controles
 * (onTouchStart/Move burbujean aunque un hijo sea el responder). Las ondas se
 * dibujan en una capa con pointerEvents="none". El estado vive en un overlay
 * imperativo para NO re-renderizar el contenido (forms) en cada toque.
 */
const RIPPLE = 180;

type OverlayHandle = { spawn: (x: number, y: number) => void };

const RippleOverlay = forwardRef<OverlayHandle, { color: string }>(({ color }, ref) => {
  const [ripples, setRipples] = useState<{ id: number; x: number; y: number; anim: Animated.Value }[]>([]);
  const idRef = useRef(0);

  useImperativeHandle(ref, () => ({
    spawn(x: number, y: number) {
      const id = idRef.current++;
      const anim = new Animated.Value(0);
      setRipples(prev => [...prev, { id, x, y, anim }]);
      Animated.timing(anim, { toValue: 1, duration: 700, easing: Easing.out(Easing.ease), useNativeDriver: true })
        .start(() => setRipples(prev => prev.filter(r => r.id !== id)));
    },
  }));

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {ripples.map(r => (
        <Animated.View
          key={r.id}
          style={{
            position: 'absolute', left: r.x - RIPPLE / 2, top: r.y - RIPPLE / 2,
            width: RIPPLE, height: RIPPLE, borderRadius: RIPPLE / 2,
            borderWidth: 2, borderColor: color,
            backgroundColor: 'rgba(255,255,255,0.06)',
            opacity: r.anim.interpolate({ inputRange: [0, 1], outputRange: [0.55, 0] }),
            transform: [{ scale: r.anim.interpolate({ inputRange: [0, 1], outputRange: [0, 1] }) }],
          }}
        />
      ))}
    </View>
  );
});
RippleOverlay.displayName = 'RippleOverlay';

export default function WaterRipples({
  children, color = 'rgba(255,255,255,0.6)', onInteract,
}: { children: React.ReactNode; color?: string; onInteract?: () => void }) {
  const overlay = useRef<OverlayHandle>(null);
  const last = useRef({ x: 0, y: 0 });

  const onStart = (e: GestureResponderEvent) => {
    const { locationX, locationY } = e.nativeEvent;
    last.current = { x: locationX, y: locationY };
    overlay.current?.spawn(locationX, locationY);
    onInteract?.();
  };
  const onMove = (e: GestureResponderEvent) => {
    const { locationX, locationY } = e.nativeEvent;
    if (Math.hypot(locationX - last.current.x, locationY - last.current.y) > 38) {
      last.current = { x: locationX, y: locationY };
      overlay.current?.spawn(locationX, locationY);
      onInteract?.();
    }
  };

  return (
    <View style={styles.flex} onTouchStart={onStart} onTouchMove={onMove}>
      {children}
      <RippleOverlay ref={overlay} color={color} />
    </View>
  );
}

const styles = StyleSheet.create({ flex: { flex: 1 } });
