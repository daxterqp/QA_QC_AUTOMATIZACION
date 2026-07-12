/**
 * PressableScale — v89: feedback FÍSICO de press (scale 0.97) para CTAs
 * importantes, en reemplazo de TouchableOpacity (que solo baja la opacidad).
 * Playbook: press 120ms / release 160ms, ease-out fuerte, native driver.
 */
import React, { useRef } from 'react';
import { Animated, Pressable, type Insets, type StyleProp, type ViewStyle } from 'react-native';
import { Motion } from '../theme/motion';

export function PressableScale({ style, onPress, disabled, hitSlop, children }: {
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
  disabled?: boolean;
  hitSlop?: Insets;
  children: React.ReactNode;
}) {
  const scale = useRef(new Animated.Value(1)).current;
  const to = (v: number, d: number) =>
    Animated.timing(scale, { toValue: v, duration: d, easing: Motion.easeOut, useNativeDriver: true }).start();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={hitSlop}
      onPressIn={() => to(Motion.pressScale, 120)}
      onPressOut={() => to(1, 160)}
    >
      <Animated.View style={[style, { transform: [{ scale }] }]}>{children}</Animated.View>
    </Pressable>
  );
}
