import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  KeyboardAvoidingView, Platform, ScrollView, Alert, Image, Modal,
  ImageBackground, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@context/AuthContext';
import { useI18n } from '@i18n/index';
import { Colors, Radius, Shadow } from '../theme/colors';

export default function LoginScreen() {
  const { t } = useI18n();
  const { login, resetPassword } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [focused, setFocused] = useState<'email' | 'password' | null>(null);

  // Modal "olvidé mi contraseña"
  const [showReset, setShowReset] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetting, setResetting] = useState(false);

  const canContinue = /\S+@\S+\.\S+/.test(email.trim()) && password.length >= 1;
  const resetValid = /\S+@\S+\.\S+/.test(resetEmail.trim());

  const handleLogin = async () => {
    if (!canContinue) return;
    setLoading(true);
    const result = await login(email.trim(), password);
    setLoading(false);
    if (result !== 'ok') {
      Alert.alert(t('login.accessErrorTitle'), t('login.accessErrorMsg'));
    }
  };

  const openReset = () => {
    setResetEmail(email.trim());
    setShowReset(true);
  };

  const handleReset = async () => {
    if (!resetValid || resetting) return;
    setResetting(true);
    try {
      await resetPassword(resetEmail.trim());
      setShowReset(false);
      Alert.alert(t('login.resetSentTitle'), t('login.resetSentMsg'));
    } catch {
      Alert.alert(t('login.resetErrorTitle'), t('login.resetErrorMsg'));
    } finally {
      setResetting(false);
    }
  };

  return (
    <ImageBackground
      source={require('../../assets/login-bg.png')}
      style={styles.bg}
      resizeMode="cover"
    >
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">

          <View style={styles.logoWrap}>
            <Image source={require('../../assets/logo-login.png')} style={styles.logo} resizeMode="contain" />
            <Text style={styles.tagline}>{t('login.subtitle')}</Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.title}>{t('login.title')}</Text>

            {/* Correo */}
            <Text style={styles.label}>{t('login.emailLabel')}</Text>
            <View style={[styles.inputRow, focused === 'email' && styles.inputRowFocused]}>
              <Ionicons name="mail-outline" size={18} color={focused === 'email' ? Colors.primary : Colors.textMuted} />
              <TextInput
                style={styles.input}
                placeholder={t('login.emailPlaceholder')}
                placeholderTextColor={Colors.textMuted}
                value={email}
                onChangeText={setEmail}
                onFocus={() => setFocused('email')}
                onBlur={() => setFocused(null)}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="email"
                textContentType="emailAddress"
                returnKeyType="next"
              />
            </View>

            {/* Contraseña */}
            <Text style={styles.label}>{t('login.passwordLabel')}</Text>
            <View style={[styles.inputRow, focused === 'password' && styles.inputRowFocused]}>
              <Ionicons name="lock-closed-outline" size={18} color={focused === 'password' ? Colors.primary : Colors.textMuted} />
              <TextInput
                style={styles.input}
                placeholder={t('login.passwordPlaceholder')}
                placeholderTextColor={Colors.textMuted}
                value={password}
                onChangeText={setPassword}
                onFocus={() => setFocused('password')}
                onBlur={() => setFocused(null)}
                secureTextEntry={!showPassword}
                returnKeyType="done"
                onSubmitEditing={handleLogin}
              />
              <TouchableOpacity onPress={() => setShowPassword(!showPassword)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={20} color={Colors.textMuted} />
              </TouchableOpacity>
            </View>

            <TouchableOpacity onPress={openReset} style={styles.forgotBtn}>
              <Text style={styles.forgotText}>{t('login.forgotPassword')}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.btn, !canContinue && styles.btnDisabled]}
              onPress={handleLogin}
              disabled={!canContinue || loading}
              activeOpacity={0.85}
            >
              {loading
                ? <ActivityIndicator color={Colors.white} />
                : <Text style={styles.btnText}>{t('login.submit')}</Text>}
            </TouchableOpacity>

            <Text style={styles.hint}>{t('login.firstTimeHint')}</Text>
          </View>

          <Text style={styles.footer}>{t('login.footer')}</Text>
          <TouchableOpacity onPress={() => {
            const { Linking } = require('react-native');
            Linking.openURL('https://docs.google.com/document/d/e/2PACX-1vSFl7nP_Va4GvTQsMAdTaQ_85f_UEYZjQk7R7VrYskfprVCjUTHuKceMQTFyuuXcA/pub');
          }}>
            <Text style={styles.privacyLink}>{t('login.privacyPolicy')}</Text>
          </TouchableOpacity>

        </ScrollView>
      </KeyboardAvoidingView>

      {/* Modal: olvidé mi contraseña */}
      <Modal visible={showReset} transparent animationType="fade" onRequestClose={() => setShowReset(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{t('login.resetTitle')}</Text>
            <Text style={styles.modalSubtitle}>{t('login.resetSubtitle')}</Text>
            <View style={styles.inputRow}>
              <Ionicons name="mail-outline" size={18} color={Colors.textMuted} />
              <TextInput
                style={styles.input}
                placeholder={t('login.resetEmailPlaceholder')}
                placeholderTextColor={Colors.textMuted}
                value={resetEmail}
                onChangeText={setResetEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="done"
                onSubmitEditing={handleReset}
                autoFocus
              />
            </View>
            <View style={styles.modalActions}>
              <TouchableOpacity onPress={() => setShowReset(false)}>
                <Text style={styles.modalCancel}>{t('login.cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalConfirm, (!resetValid || resetting) && styles.btnDisabled]}
                onPress={handleReset}
                disabled={!resetValid || resetting}
              >
                <Text style={styles.modalConfirmText}>
                  {resetting ? t('login.resetSending') : t('login.resetSend')}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1, backgroundColor: Colors.navy },
  flex: { flex: 1 },
  scroll: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 22, paddingVertical: 36 },

  logoWrap: { alignItems: 'center', marginBottom: 18 },
  logo: { width: 220, height: 132 },
  tagline: {
    fontSize: 12.5, color: Colors.light, textAlign: 'center',
    marginTop: 2, letterSpacing: 0.3,
  },

  // Tarjeta "vidrio" translúcida sobre el gradiente.
  card: {
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderRadius: Radius.lg,
    paddingHorizontal: 22, paddingVertical: 24,
    gap: 8,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.55)',
    ...Shadow.card,
    shadowOpacity: 0.35, shadowRadius: 24, elevation: 12,
  },
  title: {
    fontSize: 20, fontWeight: '800', color: Colors.navy,
    letterSpacing: 0.5, marginBottom: 6,
  },
  label: {
    fontSize: 10, fontWeight: '700', color: Colors.textSecondary,
    letterSpacing: 1.5, marginTop: 6,
  },
  inputRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: Colors.surface, borderRadius: Radius.md,
    borderWidth: 1.5, borderColor: Colors.border,
    paddingHorizontal: 14, marginTop: 2,
  },
  inputRowFocused: { borderColor: Colors.primary, backgroundColor: Colors.white },
  input: {
    flex: 1, paddingVertical: 13, fontSize: 15, color: Colors.textPrimary,
  },
  forgotBtn: { alignSelf: 'flex-end', paddingVertical: 6 },
  forgotText: { fontSize: 12.5, color: Colors.primary, fontWeight: '600' },
  btn: {
    backgroundColor: Colors.primary, borderRadius: Radius.md,
    paddingVertical: 16, alignItems: 'center', marginTop: 6, minHeight: 52, justifyContent: 'center',
  },
  btnDisabled: { backgroundColor: Colors.light },
  btnText: { color: Colors.white, fontSize: 14, fontWeight: '700', letterSpacing: 2 },
  hint: { fontSize: 11.5, color: Colors.textMuted, fontStyle: 'italic', textAlign: 'center', marginTop: 8 },

  footer: {
    textAlign: 'center', color: Colors.light, fontSize: 11,
    paddingTop: 26, paddingHorizontal: 12, lineHeight: 18,
  },
  privacyLink: {
    textAlign: 'center', color: Colors.light, fontSize: 11,
    textDecorationLine: 'underline', paddingTop: 8,
  },

  // Modal reset
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(14,33,61,0.78)',
    justifyContent: 'center', alignItems: 'center', padding: 24,
  },
  modalCard: {
    backgroundColor: Colors.white, borderRadius: Radius.lg,
    padding: 24, width: '100%', gap: 14,
  },
  modalTitle: { fontSize: 17, fontWeight: '800', color: Colors.navy, textAlign: 'center' },
  modalSubtitle: { fontSize: 13, color: Colors.textSecondary, textAlign: 'center', lineHeight: 19 },
  modalActions: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 },
  modalCancel: { fontSize: 13, color: Colors.textMuted, padding: 8, fontWeight: '600' },
  modalConfirm: {
    backgroundColor: Colors.primary, borderRadius: Radius.md,
    paddingHorizontal: 22, paddingVertical: 12,
  },
  modalConfirmText: { color: Colors.white, fontWeight: '700', fontSize: 13 },
});
