import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  KeyboardAvoidingView, Platform, ScrollView, Alert, Image, Modal,
  ImageBackground, ActivityIndicator, Animated, Dimensions, Pressable, Easing,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  useFonts,
  Montserrat_400Regular, Montserrat_600SemiBold, Montserrat_700Bold, Montserrat_800ExtraBold,
} from '@expo-google-fonts/montserrat';
import { useAuth } from '@context/AuthContext';
import { useI18n } from '@i18n/index';
import WaterRipples from '@components/WaterRipples';
import { getRecentEmails } from '@services/RecentAccountsService';
import { Colors, Radius, Shadow } from '../theme/colors';

const { height: SCREEN_H } = Dimensions.get('window');
const CARD_BG = '#f7f9fb';
const FF_REG = 'Montserrat_400Regular';
const FF_SEMI = 'Montserrat_600SemiBold';
const FF_BOLD = 'Montserrat_700Bold';
const FF_XBOLD = 'Montserrat_800ExtraBold';

export default function LoginScreen() {
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const { login, loginWithGoogle, signUp, resetPassword } = useAuth();
  const [fontsLoaded] = useFonts({ Montserrat_400Regular, Montserrat_600SemiBold, Montserrat_700Bold, Montserrat_800ExtraBold });

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [focused, setFocused] = useState<'email' | 'password' | null>(null);
  const [entered, setEntered] = useState(false);

  const [showReset, setShowReset] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetting, setResetting] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  // Modal "crear cuenta"
  const [showSignup, setShowSignup] = useState(false);
  const [suName, setSuName] = useState('');
  const [suEmail, setSuEmail] = useState('');
  const [suPassword, setSuPassword] = useState('');
  const [signingUp, setSigningUp] = useState(false);

  // Correos recordados en este dispositivo (acceso rápido en celular compartido).
  const [recentEmails, setRecentEmails] = useState<string[]>([]);
  useEffect(() => { getRecentEmails().then(setRecentEmails); }, []);

  // Inactividad: tras 1 min en el login, vuelve al intro ("toca para comenzar").
  const enteredRef = useRef(false);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const enterAnim = useRef(new Animated.Value(0)).current;
  const breathe = useRef(new Animated.Value(0)).current;
  const hintPulse = useRef(new Animated.Value(0)).current;
  const glowAnim = useRef(new Animated.Value(0)).current; // difuminado "cambiante"

  useEffect(() => {
    Animated.loop(Animated.sequence([
      Animated.timing(breathe, { toValue: 1, duration: 9000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      Animated.timing(breathe, { toValue: 0, duration: 9000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
    ])).start();
    Animated.loop(Animated.sequence([
      Animated.timing(hintPulse, { toValue: 1, duration: 1100, useNativeDriver: true }),
      Animated.timing(hintPulse, { toValue: 0, duration: 1100, useNativeDriver: true }),
    ])).start();
    Animated.loop(Animated.sequence([
      Animated.timing(glowAnim, { toValue: 1, duration: 13000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      Animated.timing(glowAnim, { toValue: 0, duration: 13000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
    ])).start();
  }, [breathe, hintPulse, glowAnim]);

  const resetIdle = () => {
    if (idleTimer.current) clearTimeout(idleTimer.current);
    idleTimer.current = setTimeout(() => { if (enteredRef.current) goToIntro(); }, 60000);
  };

  const enterApp = () => {
    if (entered) return;
    setEntered(true);
    enteredRef.current = true;
    Animated.timing(enterAnim, { toValue: 1, duration: 650, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
    resetIdle();
  };

  const goToIntro = () => {
    if (idleTimer.current) clearTimeout(idleTimer.current);
    enteredRef.current = false;
    setEntered(false);
    setFocused(null);
    Animated.timing(enterAnim, { toValue: 0, duration: 400, easing: Easing.inOut(Easing.ease), useNativeDriver: true }).start();
  };

  useEffect(() => () => { if (idleTimer.current) clearTimeout(idleTimer.current); }, []);

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

  const handleGoogle = async () => {
    if (googleLoading) return;
    setGoogleLoading(true);
    const res = await loginWithGoogle();
    setGoogleLoading(false);
    if (res === 'ok' || res === 'cancelled') return;
    if (res === 'no_account') {
      Alert.alert(t('login.googleNoAccountTitle'), t('login.googleNoAccountMsg'));
    } else {
      Alert.alert(t('login.googleErrorTitle'), t('login.googleErrorMsg'));
    }
  };
  const suValid = suName.trim().length >= 2 && /\S+@\S+\.\S+/.test(suEmail.trim()) && suPassword.length >= 6;
  const handleCreateAccount = () => {
    setSuName(''); setSuEmail(email.trim()); setSuPassword('');
    setShowSignup(true);
  };
  const handleSignup = async () => {
    if (!suValid || signingUp) return;
    setSigningUp(true);
    const res = await signUp(suEmail.trim(), suPassword, suName.trim());
    setSigningUp(false);
    if (res === 'ok') { setShowSignup(false); Alert.alert(t('login.signupOkTitle'), t('login.signupOkMsg')); return; }
    if (res === 'confirm_email') { setShowSignup(false); Alert.alert(t('login.signupConfirmTitle'), t('login.signupConfirmMsg')); return; }
    if (res === 'exists') { Alert.alert(t('login.signupExistsTitle'), t('login.signupExistsMsg')); return; }
    Alert.alert(t('login.signupErrorTitle'), t('login.signupErrorMsg'));
  };

  const logoTranslateY = enterAnim.interpolate({ inputRange: [0, 1], outputRange: [SCREEN_H * 0.27, 0] });
  const logoScale = enterAnim.interpolate({ inputRange: [0, 1], outputRange: [1.42, 1] });
  const introOpacity = enterAnim.interpolate({ inputRange: [0, 0.5], outputRange: [1, 0], extrapolate: 'clamp' });
  const cardOpacity = enterAnim.interpolate({ inputRange: [0.35, 1], outputRange: [0, 1], extrapolate: 'clamp' });
  const cardTranslateY = enterAnim.interpolate({ inputRange: [0, 1], outputRange: [28, 0] });
  const bgScale = breathe.interpolate({ inputRange: [0, 1], outputRange: [1, 1.05] });
  const hintOpacity = hintPulse.interpolate({ inputRange: [0, 1], outputRange: [0.45, 1] });
  const glowX = glowAnim.interpolate({ inputRange: [0, 1], outputRange: [-40, 70] });
  const glowY = glowAnim.interpolate({ inputRange: [0, 1], outputRange: [-30, 80] });
  const glowOpacity = glowAnim.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.35, 0.8, 0.35] });

  // Fondo siempre presente (también mientras cargan las fuentes) + glow que se
  // desplaza lento (difuminado "cambiante", sin deps nativas).
  const Background = (
    <Animated.View style={[StyleSheet.absoluteFill, { transform: [{ scale: bgScale }] }]}>
      <ImageBackground source={require('../../assets/login-bg.png')} style={styles.flex} resizeMode="cover">
        <Animated.Image
          source={require('../../assets/login-glow.png')}
          resizeMode="contain"
          style={[styles.glow, { opacity: glowOpacity, transform: [{ translateX: glowX }, { translateY: glowY }] }]}
        />
      </ImageBackground>
    </Animated.View>
  );

  if (!fontsLoaded) {
    return <View style={styles.root}>{Background}</View>;
  }

  return (
    <View style={styles.root}>
      {Background}

      <WaterRipples onInteract={resetIdle}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={[styles.scroll, { paddingBottom: 24 + insets.bottom, paddingTop: insets.top + SCREEN_H * 0.05 }]} keyboardShouldPersistTaps="handled" scrollEnabled={entered}>

          <Animated.View style={[styles.logoWrap, { transform: [{ translateY: logoTranslateY }, { scale: logoScale }] }]}>
            <Image source={require('../../assets/logo-login.png')} style={styles.logo} resizeMode="contain" />
          </Animated.View>

          <Animated.View
            style={[styles.card, { opacity: cardOpacity, transform: [{ translateY: cardTranslateY }] }]}
            pointerEvents={entered ? 'auto' : 'none'}
          >
            {/* Arriba: Google + Crear cuenta */}
            <TouchableOpacity style={styles.googleBtn} onPress={handleGoogle} disabled={googleLoading} activeOpacity={0.85}>
              {googleLoading ? <ActivityIndicator color={Colors.primary} /> : (
                <>
                  <Ionicons name="logo-google" size={18} color="#4285F4" />
                  <Text style={styles.googleBtnText}>{t('login.continueGoogle')}</Text>
                </>
              )}
            </TouchableOpacity>

            <TouchableOpacity onPress={handleCreateAccount} style={styles.createBtn}>
              <Text style={styles.createText}>{t('login.createAccount')}</Text>
            </TouchableOpacity>

            <View style={styles.divider}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>{t('login.or')}</Text>
              <View style={styles.dividerLine} />
            </View>

            {/* Abajo: correo + contraseña + ingresar */}
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

            {recentEmails.length > 0 && email.length === 0 && (
              <View style={styles.recentRow}>
                {recentEmails.map(re => (
                  <TouchableOpacity key={re} style={styles.recentChip} onPress={() => setEmail(re)} activeOpacity={0.8}>
                    <Ionicons name="person-circle-outline" size={14} color={Colors.primary} />
                    <Text style={styles.recentChipText} numberOfLines={1}>{re}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

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

            {/* Botón Ingresar — degradado (cara de la app) */}
            <TouchableOpacity
              style={[styles.btnWrap, !canContinue && styles.btnWrapDisabled]}
              onPress={handleLogin}
              disabled={!canContinue || loading}
              activeOpacity={0.9}
            >
              <ImageBackground source={require('../../assets/login-btn.png')} style={styles.btnBg} imageStyle={styles.btnBgImg} resizeMode="cover">
                {loading
                  ? <ActivityIndicator color={Colors.white} />
                  : (
                    <View style={styles.btnContent}>
                      <Text style={styles.btnText}>{t('login.submit')}</Text>
                      <Ionicons name="arrow-forward" size={18} color={Colors.white} />
                    </View>
                  )}
              </ImageBackground>
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

      {/* "Toca para comenzar" — abajo, sin tapar el logo */}
      {!entered && (
        <Animated.Text style={[styles.tapHint, { opacity: Animated.multiply(introOpacity, hintOpacity) }]}>
          {t('login.tapToStart')}
        </Animated.Text>
      )}

      {/* Capa de toque del intro */}
      {!entered && <Pressable style={StyleSheet.absoluteFill} onPress={enterApp} accessibilityLabel={t('login.tapToStart')} />}
      </WaterRipples>

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
                style={[styles.modalConfirm, (!resetValid || resetting) && styles.btnWrapDisabled]}
                onPress={handleReset}
                disabled={!resetValid || resetting}
              >
                <Text style={styles.modalConfirmText}>{resetting ? t('login.resetSending') : t('login.resetSend')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Modal: crear cuenta */}
      <Modal visible={showSignup} transparent animationType="fade" onRequestClose={() => setShowSignup(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{t('login.signupTitle')}</Text>
            <Text style={styles.modalSubtitle}>{t('login.signupSubtitle')}</Text>
            <View style={styles.fieldBox}>
              <TextInput
                style={styles.fieldInput}
                placeholder={t('login.signupName')}
                placeholderTextColor={Colors.textMuted}
                value={suName}
                onChangeText={setSuName}
                autoCapitalize="words"
                returnKeyType="next"
              />
            </View>
            <View style={styles.fieldBox}>
              <TextInput
                style={styles.fieldInput}
                placeholder={t('login.emailPlaceholder')}
                placeholderTextColor={Colors.textMuted}
                value={suEmail}
                onChangeText={setSuEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="next"
              />
            </View>
            <View style={styles.fieldBox}>
              <TextInput
                style={styles.fieldInput}
                placeholder={t('login.passwordPlaceholder')}
                placeholderTextColor={Colors.textMuted}
                value={suPassword}
                onChangeText={setSuPassword}
                secureTextEntry
                returnKeyType="done"
                onSubmitEditing={handleSignup}
              />
            </View>
            <View style={styles.modalActions}>
              <TouchableOpacity onPress={() => setShowSignup(false)}>
                <Text style={styles.modalCancel}>{t('login.cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalConfirm, (!suValid || signingUp) && styles.btnWrapDisabled]}
                onPress={handleSignup}
                disabled={!suValid || signingUp}
              >
                <Text style={styles.modalConfirmText}>{signingUp ? t('login.signupCreating') : t('login.signupCreate')}</Text>
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
  scroll: { flexGrow: 1, justifyContent: 'flex-start', alignItems: 'stretch', paddingHorizontal: 24, paddingTop: SCREEN_H * 0.07, paddingBottom: 32 },

  logoWrap: { alignItems: 'center', marginBottom: 0 },
  logo: { width: 408, height: 250 },

  tapHint: {
    position: 'absolute', bottom: 70, left: 0, right: 0, textAlign: 'center',
    fontFamily: FF_SEMI, fontSize: 12, color: Colors.white, letterSpacing: 2, textTransform: 'uppercase',
  },

  glow: { position: 'absolute', top: -120, left: -60, width: 700, height: 700 },

  // Tarjeta translúcida compacta
  card: {
    backgroundColor: CARD_BG,
    borderRadius: Radius.lg,
    paddingHorizontal: 20, paddingTop: 14, paddingBottom: 14,
    marginTop: -10,
    gap: 9,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.6)',
    ...Shadow.card, shadowOpacity: 0.35, shadowRadius: 24, elevation: 12,
  },

  googleBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    borderWidth: 1.5, borderColor: Colors.border, borderRadius: 24,
    paddingVertical: 11, backgroundColor: Colors.white,
  },
  googleBtnText: { fontFamily: FF_BOLD, fontSize: 14, color: Colors.textPrimary },
  createBtn: { alignItems: 'center', paddingVertical: 2 },
  createText: { fontFamily: FF_BOLD, fontSize: 13.5, color: Colors.primary },

  divider: { flexDirection: 'row', alignItems: 'center', gap: 12, marginVertical: 2 },
  dividerLine: { flex: 1, height: 1, backgroundColor: Colors.border },
  dividerText: { fontFamily: FF_REG, fontSize: 12, color: Colors.textMuted },

  field: { position: 'relative' },
  fieldLabelChip: { position: 'absolute', top: -8, left: 14, zIndex: 2, backgroundColor: CARD_BG, paddingHorizontal: 6 },
  fieldLabel: { fontFamily: FF_SEMI, fontSize: 9.5, color: Colors.textMuted, letterSpacing: 0.8 },
  fieldBox: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    borderWidth: 1.5, borderColor: Colors.border, borderRadius: 22,
    paddingHorizontal: 18, backgroundColor: Colors.white,
  },
  fieldBoxFocused: { borderColor: Colors.primary },
  fieldInput: { flex: 1, paddingVertical: 11, fontSize: 14, color: Colors.textPrimary, fontFamily: FF_REG },

  recentRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: -4 },
  recentChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    borderWidth: 1, borderColor: Colors.border, borderRadius: 14,
    paddingHorizontal: 9, paddingVertical: 4, backgroundColor: Colors.white,
  },
  recentChipText: { fontFamily: FF_REG, fontSize: 11, color: Colors.textSecondary, maxWidth: 200 },

  forgotBtn: { alignSelf: 'flex-end', paddingVertical: 2 },
  forgotText: { fontFamily: FF_SEMI, fontSize: 12.5, color: Colors.primary },

  // Botón Ingresar con degradado
  btnWrap: {
    borderRadius: 26, overflow: 'hidden', marginTop: 2,
    ...Shadow.card, shadowColor: Colors.navy, shadowOpacity: 0.4, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 8,
  },
  btnWrapDisabled: { opacity: 0.5 },
  btnBg: { minHeight: 50, alignItems: 'center', justifyContent: 'center' },
  btnBgImg: { borderRadius: 26 },
  btnContent: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  btnText: { fontFamily: FF_XBOLD, color: Colors.white, fontSize: 15, letterSpacing: 2.5 },

  footer: { fontFamily: FF_REG, textAlign: 'center', color: Colors.light, fontSize: 11, paddingTop: 20, paddingHorizontal: 12, lineHeight: 18 },
  privacyLink: { fontFamily: FF_REG, textAlign: 'center', color: Colors.light, fontSize: 11, textDecorationLine: 'underline', paddingTop: 8 },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(14,33,61,0.78)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  modalCard: { backgroundColor: Colors.white, borderRadius: Radius.lg, padding: 24, width: '100%', gap: 14 },
  modalTitle: { fontFamily: FF_XBOLD, fontSize: 17, color: Colors.navy, textAlign: 'center' },
  modalSubtitle: { fontFamily: FF_REG, fontSize: 13, color: Colors.textSecondary, textAlign: 'center', lineHeight: 19 },
  modalActions: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 },
  modalCancel: { fontFamily: FF_SEMI, fontSize: 13, color: Colors.textMuted, padding: 8 },
  modalConfirm: { backgroundColor: Colors.primary, borderRadius: Radius.md, paddingHorizontal: 22, paddingVertical: 12 },
  modalConfirmText: { fontFamily: FF_BOLD, color: Colors.white, fontSize: 13 },
});
