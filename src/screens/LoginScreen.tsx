import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  KeyboardAvoidingView, Platform, ScrollView, Alert, Image, Modal,
  ImageBackground, ActivityIndicator, Animated, Dimensions, Pressable, Easing,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@context/AuthContext';
import { useI18n } from '@i18n/index';
import { Colors, Radius, Shadow } from '../theme/colors';

const { height: SCREEN_H } = Dimensions.get('window');
const CARD_BG = '#f7f9fb'; // color sólido de la tarjeta (para "cortar" el borde con la etiqueta)

export default function LoginScreen() {
  const { t } = useI18n();
  const { login, resetPassword } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [focused, setFocused] = useState<'email' | 'password' | null>(null);
  const [entered, setEntered] = useState(false);

  // Modal "olvidé mi contraseña"
  const [showReset, setShowReset] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetting, setResetting] = useState(false);

  const enterAnim = useRef(new Animated.Value(0)).current;   // 0 = intro (solo logo), 1 = login visible
  const breathe = useRef(new Animated.Value(0)).current;     // drift sutil del fondo
  const hintPulse = useRef(new Animated.Value(0)).current;   // pulso del "toca para comenzar"

  useEffect(() => {
    Animated.loop(Animated.sequence([
      Animated.timing(breathe, { toValue: 1, duration: 9000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      Animated.timing(breathe, { toValue: 0, duration: 9000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
    ])).start();
    Animated.loop(Animated.sequence([
      Animated.timing(hintPulse, { toValue: 1, duration: 1100, useNativeDriver: true }),
      Animated.timing(hintPulse, { toValue: 0, duration: 1100, useNativeDriver: true }),
    ])).start();
  }, [breathe, hintPulse]);

  const enterApp = () => {
    if (entered) return;
    setEntered(true);
    Animated.timing(enterAnim, { toValue: 1, duration: 650, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  };

  const canContinue = /\S+@\S+\.\S+/.test(email.trim()) && password.length >= 1;
  const resetValid = /\S+@\S+\.\S+/.test(resetEmail.trim());

  const handleLogin = async () => {
    if (!canContinue) return;
    setLoading(true);
    const result = await login(email.trim(), password);
    setLoading(false);
    if (result !== 'ok') Alert.alert(t('login.accessErrorTitle'), t('login.accessErrorMsg'));
  };

  const openReset = () => { setResetEmail(email.trim()); setShowReset(true); };
  const handleReset = async () => {
    if (!resetValid || resetting) return;
    setResetting(true);
    try {
      await resetPassword(resetEmail.trim());
      setShowReset(false);
      Alert.alert(t('login.resetSentTitle'), t('login.resetSentMsg'));
    } catch {
      Alert.alert(t('login.resetErrorTitle'), t('login.resetErrorMsg'));
    } finally { setResetting(false); }
  };

  // Placeholders (se activan en el próximo paso).
  const handleGoogle = () => Alert.alert(t('login.googleSetupTitle'), t('login.googleSetupMsg'));
  const handleCreateAccount = () => Alert.alert(t('login.signupSoonTitle'), t('login.signupSoonMsg'));

  // Interpolaciones de la animación.
  const logoTranslateY = enterAnim.interpolate({ inputRange: [0, 1], outputRange: [SCREEN_H * 0.24, 0] });
  const logoScale = enterAnim.interpolate({ inputRange: [0, 1], outputRange: [1.55, 1] });
  const introOpacity = enterAnim.interpolate({ inputRange: [0, 0.5], outputRange: [1, 0], extrapolate: 'clamp' });
  const cardOpacity = enterAnim.interpolate({ inputRange: [0.35, 1], outputRange: [0, 1], extrapolate: 'clamp' });
  const cardTranslateY = enterAnim.interpolate({ inputRange: [0, 1], outputRange: [28, 0] });
  const bgScale = breathe.interpolate({ inputRange: [0, 1], outputRange: [1, 1.06] });
  const hintOpacity = hintPulse.interpolate({ inputRange: [0, 1], outputRange: [0.45, 1] });

  return (
    <View style={styles.root}>
      {/* Fondo con drift sutil (líneas en movimiento) */}
      <Animated.View style={[StyleSheet.absoluteFill, { transform: [{ scale: bgScale }] }]}>
        <ImageBackground source={require('../../assets/login-bg.png')} style={styles.flex} resizeMode="cover" />
      </Animated.View>

      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" scrollEnabled={entered}>

          <Animated.View style={[styles.logoWrap, { transform: [{ translateY: logoTranslateY }, { scale: logoScale }] }]}>
            <Image source={require('../../assets/logo-login.png')} style={styles.logo} resizeMode="contain" />
            <Animated.Text style={[styles.tagline, { opacity: introOpacity }]}>{t('login.subtitle')}</Animated.Text>
          </Animated.View>

          {!entered && (
            <Animated.Text style={[styles.tapHint, { opacity: Animated.multiply(introOpacity, hintOpacity) }]}>
              {t('login.tapToStart')}
            </Animated.Text>
          )}

          <Animated.View
            style={[styles.card, { opacity: cardOpacity, transform: [{ translateY: cardTranslateY }] }]}
            pointerEvents={entered ? 'auto' : 'none'}
          >
            {/* Correo (etiqueta sobre el borde) */}
            <View style={styles.field}>
              <View style={styles.fieldLabelChip}><Text style={styles.fieldLabel}>{t('login.emailLabel')}</Text></View>
              <View style={[styles.fieldBox, focused === 'email' && styles.fieldBoxFocused]}>
                <TextInput
                  style={styles.fieldInput}
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
            </View>

            {/* Contraseña (etiqueta sobre el borde + ojo) */}
            <View style={styles.field}>
              <View style={styles.fieldLabelChip}><Text style={styles.fieldLabel}>{t('login.passwordLabel')}</Text></View>
              <View style={[styles.fieldBox, focused === 'password' && styles.fieldBoxFocused]}>
                <TextInput
                  style={styles.fieldInput}
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
              {loading ? <ActivityIndicator color={Colors.white} /> : <Text style={styles.btnText}>{t('login.submit')}</Text>}
            </TouchableOpacity>

            {/* Divisor "o" */}
            <View style={styles.divider}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>{t('login.or')}</Text>
              <View style={styles.dividerLine} />
            </View>

            {/* Google */}
            <TouchableOpacity style={styles.googleBtn} onPress={handleGoogle} activeOpacity={0.85}>
              <Ionicons name="logo-google" size={18} color="#4285F4" />
              <Text style={styles.googleBtnText}>{t('login.continueGoogle')}</Text>
            </TouchableOpacity>

            {/* Crear cuenta */}
            <TouchableOpacity onPress={handleCreateAccount} style={styles.createBtn}>
              <Text style={styles.createText}>{t('login.createAccount')}</Text>
            </TouchableOpacity>
          </Animated.View>

          {entered && (
            <Animated.View style={{ opacity: cardOpacity }}>
              <Text style={styles.footer}>{t('login.footer')}</Text>
              <TouchableOpacity onPress={() => {
                const { Linking } = require('react-native');
                Linking.openURL('https://docs.google.com/document/d/e/2PACX-1vSFl7nP_Va4GvTQsMAdTaQ_85f_UEYZjQk7R7VrYskfprVCjUTHuKceMQTFyuuXcA/pub');
              }}>
                <Text style={styles.privacyLink}>{t('login.privacyPolicy')}</Text>
              </TouchableOpacity>
            </Animated.View>
          )}

        </ScrollView>
      </KeyboardAvoidingView>

      {/* Capa de toque del intro (solo logo → tocar para entrar) */}
      {!entered && <Pressable style={StyleSheet.absoluteFill} onPress={enterApp} accessibilityLabel={t('login.tapToStart')} />}

      {/* Modal: olvidé mi contraseña */}
      <Modal visible={showReset} transparent animationType="fade" onRequestClose={() => setShowReset(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{t('login.resetTitle')}</Text>
            <Text style={styles.modalSubtitle}>{t('login.resetSubtitle')}</Text>
            <View style={styles.fieldBox}>
              <TextInput
                style={styles.fieldInput}
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
                <Text style={styles.modalConfirmText}>{resetting ? t('login.resetSending') : t('login.resetSend')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.navy },
  flex: { flex: 1 },
  scroll: { flexGrow: 1, justifyContent: 'flex-start', alignItems: 'stretch', paddingHorizontal: 24, paddingTop: SCREEN_H * 0.13, paddingBottom: 36 },

  logoWrap: { alignItems: 'center', marginBottom: 10 },
  logo: { width: 300, height: 188 },
  tagline: { fontSize: 13, color: Colors.light, textAlign: 'center', marginTop: 2, letterSpacing: 0.3 },
  tapHint: { fontSize: 12.5, color: Colors.white, textAlign: 'center', marginTop: 18, letterSpacing: 1, textTransform: 'uppercase' },

  // Tarjeta translúcida (más compacta, sin título)
  card: {
    backgroundColor: CARD_BG,
    borderRadius: Radius.lg,
    paddingHorizontal: 20, paddingTop: 22, paddingBottom: 18,
    marginTop: 18,
    gap: 14,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.6)',
    ...Shadow.card, shadowOpacity: 0.35, shadowRadius: 24, elevation: 12,
  },

  // Campo con etiqueta sobre el borde (notched outline)
  field: { position: 'relative' },
  fieldLabelChip: {
    position: 'absolute', top: -8, left: 14, zIndex: 2,
    backgroundColor: CARD_BG, paddingHorizontal: 6,
  },
  fieldLabel: { fontSize: 11, fontWeight: '600', color: Colors.textSecondary, letterSpacing: 0.3 },
  fieldBox: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    borderWidth: 1.5, borderColor: Colors.border, borderRadius: 22,
    paddingHorizontal: 18, backgroundColor: Colors.white,
  },
  fieldBoxFocused: { borderColor: Colors.primary },
  fieldInput: { flex: 1, paddingVertical: 14, fontSize: 15, color: Colors.textPrimary },

  forgotBtn: { alignSelf: 'flex-end', paddingVertical: 2 },
  forgotText: { fontSize: 12.5, color: Colors.primary, fontWeight: '600' },

  btn: { backgroundColor: Colors.primary, borderRadius: 24, paddingVertical: 15, alignItems: 'center', justifyContent: 'center', minHeight: 50 },
  btnDisabled: { backgroundColor: Colors.light },
  btnText: { color: Colors.white, fontSize: 14, fontWeight: '700', letterSpacing: 2 },

  divider: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  dividerLine: { flex: 1, height: 1, backgroundColor: Colors.border },
  dividerText: { fontSize: 12, color: Colors.textMuted },

  googleBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    borderWidth: 1.5, borderColor: Colors.border, borderRadius: 24,
    paddingVertical: 13, backgroundColor: Colors.white,
  },
  googleBtnText: { fontSize: 14, fontWeight: '700', color: Colors.textPrimary },

  createBtn: { alignItems: 'center', paddingVertical: 4 },
  createText: { fontSize: 13.5, color: Colors.primary, fontWeight: '700' },

  footer: { textAlign: 'center', color: Colors.light, fontSize: 11, paddingTop: 22, paddingHorizontal: 12, lineHeight: 18 },
  privacyLink: { textAlign: 'center', color: Colors.light, fontSize: 11, textDecorationLine: 'underline', paddingTop: 8 },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(14,33,61,0.78)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  modalCard: { backgroundColor: Colors.white, borderRadius: Radius.lg, padding: 24, width: '100%', gap: 14 },
  modalTitle: { fontSize: 17, fontWeight: '800', color: Colors.navy, textAlign: 'center' },
  modalSubtitle: { fontSize: 13, color: Colors.textSecondary, textAlign: 'center', lineHeight: 19 },
  modalActions: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 },
  modalCancel: { fontSize: 13, color: Colors.textMuted, padding: 8, fontWeight: '600' },
  modalConfirm: { backgroundColor: Colors.primary, borderRadius: Radius.md, paddingHorizontal: 22, paddingVertical: 12 },
  modalConfirmText: { color: Colors.white, fontWeight: '700', fontSize: 13 },
});
