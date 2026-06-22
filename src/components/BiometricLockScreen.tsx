import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, ImageBackground, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@context/AuthContext';
import { Colors, Radius } from '../theme/colors';

/**
 * Pantalla de bloqueo de re-entrada: aparece cuando hay sesión guardada y el
 * usuario activó el ingreso por huella/rostro. Lanza el prompt al montar.
 */
export default function BiometricLockScreen() {
  const { unlockBiometric, logout, currentUser } = useAuth();
  const [busy, setBusy] = useState(false);
  const triedRef = useRef(false);

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

  return (
    <ImageBackground source={require('../../assets/login-bg.png')} style={styles.bg} resizeMode="cover">
      <View style={styles.center}>
        <Image source={require('../../assets/logo-login.png')} style={styles.logo} resizeMode="contain" />
        <Text style={styles.hello}>{currentUser?.name ? `Hola, ${currentUser.name}` : 'Bienvenido'}</Text>

        <TouchableOpacity style={styles.unlockBtn} onPress={tryUnlock} disabled={busy} activeOpacity={0.85}>
          {busy ? <ActivityIndicator color={Colors.white} /> : (
            <>
              <Ionicons name="finger-print" size={22} color={Colors.white} />
              <Text style={styles.unlockText}>Desbloquear</Text>
            </>
          )}
        </TouchableOpacity>

        <TouchableOpacity onPress={() => logout()} style={styles.otherBtn}>
          <Text style={styles.otherText}>Usar otra cuenta</Text>
        </TouchableOpacity>
      </View>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1, backgroundColor: Colors.navy },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28, gap: 16 },
  logo: { width: 240, height: 150 },
  hello: { color: Colors.white, fontSize: 16, fontWeight: '700', marginBottom: 6 },
  unlockBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    backgroundColor: Colors.primary, borderRadius: 26, paddingVertical: 15, paddingHorizontal: 36, minWidth: 220,
  },
  unlockText: { color: Colors.white, fontSize: 14, fontWeight: '700', letterSpacing: 1.5 },
  otherBtn: { paddingVertical: 8 },
  otherText: { color: Colors.light, fontSize: 13, textDecorationLine: 'underline' },
});
