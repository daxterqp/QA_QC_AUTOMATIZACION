import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  KeyboardAvoidingView, Platform, ScrollView, Alert, Image,
} from 'react-native';
import { useAuth } from '@context/AuthContext';
import { Colors, Radius, Shadow } from '../theme/colors';

export default function LoginScreen() {
  const { login } = useAuth();
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const canContinue = name.trim().length >= 2 && password.length >= 1;

  const handleLogin = async () => {
    if (!canContinue) return;
    setLoading(true);
    const result = await login(name.trim(), password);
    setLoading(false);

    if (result === 'not_found') {
      Alert.alert(
        'Usuario no encontrado',
        'No existe un usuario con ese nombre. Contacte al administrador del sistema.'
      );
    } else if (result === 'wrong_password') {
      Alert.alert(
        'Contrasena incorrecta',
        'La contrasena ingresada no es correcta. La primera vez, su contrasena es su nombre.'
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
          <Text style={styles.formTitle}>INICIAR SESION</Text>

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
            <Text style={styles.label}>CONTRASENA</Text>
            <View style={styles.passwordRow}>
              <TextInput
                style={[styles.input, styles.passwordInput]}
                placeholder="Ingrese su contrasena"
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
            Primera vez: su contrasena es su nombre
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

      </ScrollView>
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
});
