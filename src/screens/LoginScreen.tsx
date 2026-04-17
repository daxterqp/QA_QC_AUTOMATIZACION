import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  KeyboardAvoidingView, Platform, ScrollView, Alert, Image, Modal,
} from 'react-native';
import { useAuth } from '@context/AuthContext';
import { Colors, Radius, Shadow } from '../theme/colors';

export default function LoginScreen() {
  const { login, loginDemo } = useAuth();
  const [showDemoModal, setShowDemoModal] = useState(false);
  const [demoPassword, setDemoPassword] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const canContinue = name.trim().length >= 2 && password.length >= 1;

  const demoExpired = new Date() > new Date('2026-04-30T23:59:59');

  const handleDemoAccess = () => {
    if (demoPassword === '2026flow') {
      setShowDemoModal(false);
      setDemoPassword('');
      loginDemo();
    } else {
      Alert.alert('Contraseña incorrecta', 'La contraseña de demo no es correcta.');
    }
  };

  const handleLogin = async () => {
    if (!canContinue) return;
    setLoading(true);
    const result = await login(name.trim(), password);
    setLoading(false);

    if (result !== 'ok') {
      Alert.alert(
        'Error de acceso',
        'Nombre o contraseña incorrectos. La primera vez, su contraseña es su nombre.'
      );
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">

        <View style={styles.topBand}>
          <Image source={require('../../assets/logo-login.png')} style={styles.logo} resizeMode="contain" />
        </View>

        <View style={styles.formCard}>
          <View style={styles.formTitleRow}>
            <Text style={styles.formTitle}>INICIAR SESIÓN</Text>
            <TouchableOpacity
              style={[styles.demoBadge, demoExpired && styles.demoBadgeExpired]}
              onPress={() => { if (!demoExpired) setShowDemoModal(true); }}
              activeOpacity={demoExpired ? 1 : 0.7}
            >
              <Text style={styles.demoBadgeText}>
                {demoExpired ? 'Demo expirada' : 'Ver demo'}
              </Text>
            </TouchableOpacity>
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.label}>NOMBRE</Text>
            <TextInput
              style={styles.input}
              placeholder="Ingrese su nombre"
              placeholderTextColor={Colors.textMuted}
              value={name}
              onChangeText={setName}
              autoCapitalize="words"
              returnKeyType="next"
            />
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.label}>CONTRASEÑA</Text>
            <View style={styles.passwordRow}>
              <TextInput
                style={[styles.input, styles.passwordInput]}
                placeholder="Ingrese su contraseña"
                placeholderTextColor={Colors.textMuted}
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
                returnKeyType="done"
                onSubmitEditing={handleLogin}
              />
              <TouchableOpacity
                style={styles.toggleBtn}
                onPress={() => setShowPassword(!showPassword)}
              >
                <Text style={styles.toggleBtnText}>
                  {showPassword ? 'Ocultar' : 'Mostrar'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          <Text style={styles.hint}>
            Primera vez: su contraseña es su nombre
          </Text>

          <TouchableOpacity
            style={[styles.btn, !canContinue && styles.btnDisabled]}
            onPress={handleLogin}
            disabled={!canContinue || loading}
          >
            <Text style={styles.btnText}>
              {loading ? 'Verificando...' : 'INGRESAR'}
            </Text>
          </TouchableOpacity>

        </View>

        <Text style={styles.footer}>
          Para solicitar acceso, contacte al administrador del sistema.
        </Text>
        <TouchableOpacity onPress={() => {
          const { Linking } = require('react-native');
          Linking.openURL('https://docs.google.com/document/d/e/2PACX-1vSFl7nP_Va4GvTQsMAdTaQ_85f_UEYZjQk7R7VrYskfprVCjUTHuKceMQTFyuuXcA/pub');
        }}>
          <Text style={styles.privacyLink}>Política de Privacidad</Text>
        </TouchableOpacity>

      </ScrollView>

      {/* Modal contraseña demo */}
      <Modal visible={showDemoModal} transparent animationType="fade" onRequestClose={() => { setShowDemoModal(false); setDemoPassword(''); }}>
        <View style={styles.demoOverlay}>
          <View style={styles.demoCard}>
            <Text style={styles.demoCardTitle}>Acceso Demo</Text>
            <Text style={styles.demoCardSubtitle}>Ingresa la contraseña de demostración</Text>
            <TextInput
              style={styles.demoInput}
              placeholder="Contraseña demo"
              placeholderTextColor={Colors.textMuted}
              value={demoPassword}
              onChangeText={setDemoPassword}
              secureTextEntry
              returnKeyType="done"
              onSubmitEditing={handleDemoAccess}
              autoFocus
            />
            <View style={styles.demoActions}>
              <TouchableOpacity onPress={() => { setShowDemoModal(false); setDemoPassword(''); }}>
                <Text style={styles.demoCancelText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.demoConfirmBtn} onPress={handleDemoAccess}>
                <Text style={styles.demoConfirmText}>Entrar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: Colors.navy },
  scroll: { flexGrow: 1 },

  topBand: {
    backgroundColor: Colors.navy,
    paddingTop: 60, paddingBottom: 0,
    paddingHorizontal: 32,
    alignItems: 'center',
    gap: 8,
  },
  formTitleRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  demoBadge: {
    backgroundColor: '#8a0659',
    borderRadius: Radius.md,
    paddingHorizontal: 12, paddingVertical: 6,
  },
  demoBadgeExpired: {
    backgroundColor: '#6b7280',
  },
  demoBadgeText: {
    color: Colors.white, fontWeight: '700', fontSize: 12, letterSpacing: 0.5,
  },
  logo: { width: 340, height: 260 },
  appTagline: {
    fontSize: 11, color: Colors.light, textAlign: 'center',
    letterSpacing: 1, textTransform: 'uppercase', lineHeight: 18,
  },
  dividerLine: {
    width: 48, height: 2, backgroundColor: Colors.secondary, marginTop: 8,
  },

  formCard: {
    backgroundColor: Colors.white,
    marginHorizontal: 20,
    marginTop: -16,
    borderRadius: Radius.lg,
    padding: 28,
    gap: 18,
    ...Shadow.card,
  },
  formTitle: {
    fontSize: 12, fontWeight: '700', color: Colors.primary,
    letterSpacing: 2.5, marginBottom: 4,
  },
  fieldGroup: { gap: 6 },
  label: {
    fontSize: 10, fontWeight: '700', color: Colors.textSecondary, letterSpacing: 1.5,
  },
  input: {
    backgroundColor: Colors.surface, borderRadius: Radius.md, padding: 14,
    fontSize: 15, borderWidth: 1, borderColor: Colors.border, color: Colors.textPrimary,
  },
  passwordRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  passwordInput: { flex: 1 },
  toggleBtn: {
    paddingHorizontal: 12, paddingVertical: 14, borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surface,
  },
  toggleBtnText: { fontSize: 11, color: Colors.textSecondary, fontWeight: '600' },
  hint: { fontSize: 12, color: Colors.textMuted, fontStyle: 'italic', textAlign: 'center' },
  btn: {
    backgroundColor: Colors.primary, borderRadius: Radius.md,
    padding: 16, alignItems: 'center', marginTop: 4,
  },
  btnDisabled: { backgroundColor: Colors.light },
  btnText: { color: Colors.white, fontSize: 13, fontWeight: '700', letterSpacing: 2 },

  footer: {
    textAlign: 'center', color: Colors.light, fontSize: 11,
    padding: 28, lineHeight: 18,
  },

  demoOverlay: {
    flex: 1, backgroundColor: 'rgba(14,33,61,0.75)',
    justifyContent: 'center', alignItems: 'center', padding: 24,
  },
  demoCard: {
    backgroundColor: Colors.white, borderRadius: Radius.lg,
    padding: 28, width: '100%', gap: 16,
  },
  demoCardTitle: {
    fontSize: 17, fontWeight: '700', color: Colors.navy, textAlign: 'center',
  },
  demoCardSubtitle: {
    fontSize: 13, color: Colors.textSecondary, textAlign: 'center',
  },
  demoInput: {
    backgroundColor: Colors.surface, borderRadius: Radius.md, padding: 14,
    fontSize: 15, borderWidth: 1, borderColor: Colors.border, color: Colors.textPrimary,
  },
  demoActions: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
  },
  demoCancelText: {
    fontSize: 13, color: Colors.textMuted, padding: 8,
  },
  demoConfirmBtn: {
    backgroundColor: Colors.primary, borderRadius: Radius.md,
    paddingHorizontal: 24, paddingVertical: 12,
  },
  demoConfirmText: {
    color: Colors.white, fontWeight: '700', fontSize: 13,
  },
  privacyLink: {
    textAlign: 'center', color: Colors.light, fontSize: 11,
    textDecorationLine: 'underline', paddingBottom: 24,
  },
});
