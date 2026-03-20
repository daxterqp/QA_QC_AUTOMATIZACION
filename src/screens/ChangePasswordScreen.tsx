import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  KeyboardAvoidingView, Platform, Alert,
} from 'react-native';
import { Colors, Radius, Shadow } from '../theme/colors';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@navigation/types';
import { useAuth } from '@context/AuthContext';

type Props = NativeStackScreenProps<RootStackParamList, 'ChangePassword'>;

export default function ChangePasswordScreen({ navigation }: Props) {
  const { currentUser, changePassword } = useAuth();
  const [current, setCurrent] = useState('');
  const [newPass, setNewPass] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);

  const canSave = current.length >= 1 && newPass.length >= 4 && newPass === confirm;

  const handleSave = async () => {
    if (!currentUser) return;

    // Verificar contraseña actual
    const storedPassword = currentUser.password ?? currentUser.name;
    if (current !== storedPassword) {
      Alert.alert('Error', 'La contraseña actual no es correcta.');
      return;
    }

    if (newPass.length < 4) {
      Alert.alert('Error', 'La nueva contraseña debe tener al menos 4 caracteres.');
      return;
    }

    setLoading(true);
    await changePassword(currentUser.id, newPass);
    setLoading(false);

    Alert.alert('Listo', 'Contraseña actualizada correctamente.', [
      { text: 'OK', onPress: () => navigation.goBack() },
    ]);
  };

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>Volver</Text>
        </TouchableOpacity>
        <Text style={styles.title}>CAMBIAR CONTRASENA</Text>
        <View style={{ width: 60 }} />
      </View>

      <View style={styles.container}>
        <View style={styles.card}>
          <Text style={styles.userLabel}>
            {currentUser?.name} {currentUser?.apellido}
          </Text>

          <Text style={styles.label}>Contraseña actual</Text>
          <View style={styles.row}>
            <TextInput
              style={[styles.input, styles.flex]}
              placeholder="Contraseña actual"
              placeholderTextColor="#aaa"
              value={current}
              onChangeText={setCurrent}
              secureTextEntry={!showCurrent}
            />
            <TouchableOpacity onPress={() => setShowCurrent(!showCurrent)} style={styles.eye}>
              <Text style={styles.eyeText}>{showCurrent ? 'Ocultar' : 'Ver'}</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.label}>Nueva contraseña</Text>
          <View style={styles.row}>
            <TextInput
              style={[styles.input, styles.flex]}
              placeholder="Mínimo 4 caracteres"
              placeholderTextColor="#aaa"
              value={newPass}
              onChangeText={setNewPass}
              secureTextEntry={!showNew}
            />
            <TouchableOpacity onPress={() => setShowNew(!showNew)} style={styles.eye}>
              <Text style={styles.eyeText}>{showNew ? 'Ocultar' : 'Ver'}</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.label}>Confirmar nueva contraseña</Text>
          <TextInput
            style={[styles.input, confirm && newPass !== confirm && styles.inputError]}
            placeholder="Repite la contraseña"
            placeholderTextColor="#aaa"
            value={confirm}
            onChangeText={setConfirm}
            secureTextEntry
          />
          {confirm.length > 0 && newPass !== confirm && (
            <Text style={styles.errorText}>Las contraseñas no coinciden</Text>
          )}

          <TouchableOpacity
            style={[styles.btn, !canSave && styles.btnDisabled]}
            onPress={handleSave}
            disabled={!canSave || loading}
          >
            <Text style={styles.btnText}>
              {loading ? 'Guardando...' : 'GUARDAR CONTRASENA'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: Colors.surface },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: 52, paddingBottom: 16,
    backgroundColor: Colors.navy,
  },
  backBtn: { padding: 4, minWidth: 60 },
  backText: { color: Colors.light, fontSize: 14, fontWeight: '600' },
  title: { fontSize: 15, fontWeight: '700', color: Colors.white, letterSpacing: 1 },
  container: { padding: 20, gap: 16 },
  card: {
    backgroundColor: Colors.white, borderRadius: Radius.lg, padding: 24, gap: 12,
    ...Shadow.card,
  },
  userLabel: { fontSize: 15, fontWeight: '700', color: Colors.primary, marginBottom: 4 },
  label: { fontSize: 10, fontWeight: '700', color: Colors.textSecondary, letterSpacing: 1.5 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  input: {
    backgroundColor: Colors.surface, borderRadius: Radius.md, padding: 14,
    fontSize: 15, borderWidth: 1, borderColor: Colors.border, color: Colors.textPrimary,
  },
  inputError: { borderColor: Colors.danger },
  eye: {
    paddingHorizontal: 10, paddingVertical: 10, borderWidth: 1, borderColor: Colors.border,
    borderRadius: Radius.md, backgroundColor: Colors.surface, minWidth: 60, alignItems: 'center',
  },
  eyeText: { fontSize: 11, color: Colors.primary, fontWeight: '600' },
  errorText: { fontSize: 12, color: Colors.danger },
  btn: {
    backgroundColor: Colors.primary, borderRadius: Radius.md,
    padding: 16, alignItems: 'center', marginTop: 4,
  },
  btnDisabled: { backgroundColor: Colors.light },
  btnText: { color: Colors.white, fontSize: 13, fontWeight: '700', letterSpacing: 1.5 },
});
