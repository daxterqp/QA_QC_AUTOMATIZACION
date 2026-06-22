import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Image, ImageBackground, Animated, Easing, Pressable, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  useFonts, Montserrat_400Regular, Montserrat_600SemiBold, Montserrat_700Bold, Montserrat_800ExtraBold,
} from '@expo-google-fonts/montserrat';
import { useAuth } from '@context/AuthContext';
import WaterRipples from '@components/WaterRipples';
import { Colors } from '../theme/colors';

const FF_SEMI = 'Montserrat_600SemiBold';
const FF_BOLD = 'Montserrat_700Bold';

/**
 * Pantalla de desbloqueo (huella/rostro) — MISMO formato que el intro
 * "toca para comenzar": gradiente + logo grande centrado + texto abajo + ondas.
 * Solo desbloquea la sesión activa (no inicia sesión). Auto-lanza el prompt.
 */
export default function BiometricLockScreen() {
  const { unlockBiometric, logout, currentUser } = useAuth();
  const insets = useSafeAreaInsets();
  const [fontsLoaded] = useFonts({ Montserrat_400Regular, Montserrat_600SemiBold, Montserrat_700Bold, Montserrat_800ExtraBold });
  const [busy, setBusy] = useState(false);
  const triedRef = useRef(false);

  const breathe = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(Animated.sequence([
      Animated.timing(breathe, { toValue: 1, duration: 9000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      Animated.timing(breathe, { toValue: 0, duration: 9000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
    ])).start();
    Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 1, duration: 1100, useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 0, duration: 1100, useNativeDriver: true }),
    ])).start();
  }, [breathe, pulse]);

  const tryUnlock = async () => {
    if (busy) return;
    setBusy(true);
    await unlockBiometric();
    setBusy(false);
  };

  useEffect(() => {
    if (triedRef.current) return;
    triedRef.current = true;
    tryUnlock();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const bgScale = breathe.interpolate({ inputRange: [0, 1], outputRange: [1, 1.06] });
  const hintOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.45, 1] });

  return (
    <View style={styles.root}>
      <Animated.View style={[StyleSheet.absoluteFill, { transform: [{ scale: bgScale }] }]}>
        <ImageBackground source={require('../../assets/login-bg.png')} style={styles.flex} resizeMode="cover" />
      </Animated.View>

      <WaterRipples>
        <Pressable style={styles.center} onPress={tryUnlock}>
          <Image source={require('../../assets/logo-login.png')} style={styles.logo} resizeMode="contain" />
          {!!currentUser?.name && (
            <Text style={[styles.hello, fontsLoaded && { fontFamily: FF_BOLD }]}>Hola, {currentUser.name}</Text>
          )}
        </Pressable>

        <Animated.Text style={[styles.hint, fontsLoaded && { fontFamily: FF_SEMI }, { opacity: hintOpacity, bottom: 96 + insets.bottom }]}>
          Toca para desbloquear
        </Animated.Text>

        <TouchableOpacity style={[styles.otherBtn, { bottom: 52 + insets.bottom }]} onPress={() => logout()}>
          <Text style={[styles.otherText, fontsLoaded && { fontFamily: FF_SEMI }]}>Usar otra cuenta</Text>
        </TouchableOpacity>
      </WaterRipples>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.navy },
  flex: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  logo: { width: 320, height: 200 },
  hello: { color: Colors.white, fontSize: 17, fontWeight: '700' },
  hint: {
    position: 'absolute', bottom: 110, left: 0, right: 0, textAlign: 'center',
    color: Colors.white, fontSize: 12.5, letterSpacing: 2, textTransform: 'uppercase',
  },
  otherBtn: { position: 'absolute', bottom: 64, left: 0, right: 0, alignItems: 'center', paddingVertical: 8 },
  otherText: { color: Colors.light, fontSize: 12.5, textDecorationLine: 'underline' },
});
