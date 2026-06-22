import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  KeyboardAvoidingView, Platform, Alert,
} from 'react-native';
import AppHeader from '@components/AppHeader';
import { Colors, Radius, Shadow } from '../theme/colors';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@navigation/types';
import { useAuth } from '@context/AuthContext';
import { useI18n } from '@i18n/index';
import { supabase } from '@config/supabase';

type Props = NativeStackScreenProps<RootStackParamList, 'ChangePassword'>;

export default function ChangePasswordScreen({ navigation }: Props) {
  const { t } = useI18n();
  const { currentUser, changePassword, deleteAccount, isDemo } = useAuth();
  const [current, setCurrent] = useState('');
  const [newPass, setNewPass] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);

  const canSave = current.length >= 1 && newPass.length >= 4 && newPass === confirm;

  const handleSave = async () => {
    if (!currentUser) return;
    if (isDemo) {
      Alert.alert(t('changePass.demoTitle'), t('changePass.demoMessage'));
      return;
    }

    if (newPass.length < 4) {
      Alert.alert(t('changePass.errorTitle'), t('changePass.errorTooShort'));
      return;
    }

    setLoading(true);
    // Verificar la contraseña ACTUAL re-autenticando contra Supabase Auth
    // (ya no se compara contra el valor legacy de users.password).
    const { data: { user: authUser } } = await supabase.auth.getUser();
    const email = authUser?.email ?? undefined;
    const reauth = email
      ? await supabase.auth.signInWithPassword({ email, password: current })
      : { error: { message: 'no-email' } };
    if (reauth.error) {
      setLoading(false);
      Alert.alert(t('changePass.errorTitle'), t('changePass.errorCurrentWrong'));
      return;
    }
    await changePassword(currentUser.id, newPass);
    setLoading(false);

    Alert.alert(t('changePass.doneTitle'), t('changePass.doneMessage'), [
      { text: t('changePass.ok'), onPress: () => navigation.goBack() },
    ]);
  };

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <AppHeader title={t('changePass.title')} onBack={() => navigation.goBack()} />

      <View style={styles.container}>
        <View style={styles.card}>
          <Text style={styles.userLabel}>
            {currentUser?.name} {currentUser?.apellido}
          </Text>
          <Text style={styles.idLabel}>{t('changePass.idLabel', { id: currentUser?.id ?? '' })}</Text>

          <Text style={styles.label}>{t('changePass.currentLabel')}</Text>
          <View style={styles.row}>
            <TextInput
              style={[styles.input, styles.flex]}
              placeholder={t('changePass.currentPlaceholder')}
              placeholderTextColor="#aaa"
              value={current}
              onChangeText={setCurrent}
              secureTextEntry={!showCurrent}
            />
            <TouchableOpacity onPress={() => setShowCurrent(!showCurrent)} style={styles.eye}>
              <Text style={styles.eyeText}>{showCurrent ? t('changePass.hide') : t('changePass.show')}</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.label}>{t('changePass.newLabel')}</Text>
          <View style={styles.row}>
            <TextInput
              style={[styles.input, styles.flex]}
              placeholder={t('changePass.newPlaceholder')}
              placeholderTextColor="#aaa"
              value={newPass}
              onChangeText={setNewPass}
              secureTextEntry={!showNew}
            />
            <TouchableOpacity onPress={() => setShowNew(!showNew)} style={styles.eye}>
              <Text style={styles.eyeText}>{showNew ? t('changePass.hide') : t('changePass.show')}</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.label}>{t('changePass.confirmLabel')}</Text>
          <TextInput
            style={[styles.input, confirm && newPass !== confirm && styles.inputError]}
            placeholder={t('changePass.confirmPlaceholder')}
            placeholderTextColor="#aaa"
            value={confirm}
            onChangeText={setConfirm}
            secureTextEntry
          />
          {confirm.length > 0 && newPass !== confirm && (
            <Text style={styles.errorText}>{t('changePass.mismatch')}</Text>
          )}

          <TouchableOpacity
            style={[styles.btn, !canSave && styles.btnDisabled]}
            onPress={handleSave}
            disabled={!canSave || loading}
          >
            <Text style={styles.btnText}>
              {loading ? t('changePass.saving') : t('changePass.save')}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Eliminar cuenta */}
        <View style={styles.dangerCard}>
          <Text style={styles.dangerTitle}>{t('changePass.deleteSectionTitle')}</Text>
          <Text style={styles.dangerDesc}>
            {t('changePass.deleteSectionDesc')}
          </Text>
          <TouchableOpacity
            style={styles.dangerBtn}
            onPress={() => {
              Alert.alert(
                t('changePass.deleteConfirmTitle'),
                t('changePass.deleteConfirmMessage'),
                [
                  { text: t('changePass.cancel'), style: 'cancel' },
                  {
                    text: t('changePass.delete'), style: 'destructive',
                    onPress: async () => {
                      await deleteAccount();
                    },
                  },
                ],
              );
            }}
          >
            <Text style={styles.dangerBtnText}>{t('changePass.deleteBtn')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: Colors.surface },
  container: { padding: 20, gap: 16 },
  card: {
    backgroundColor: Colors.white, borderRadius: Radius.lg, padding: 24, gap: 12,
    ...Shadow.card,
  },
  userLabel: { fontSize: 15, fontWeight: '700', color: Colors.primary, marginBottom: 2 },
  idLabel: { fontSize: 10, color: Colors.textSecondary, fontFamily: 'monospace', marginBottom: 4 },
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
  dangerCard: {
    backgroundColor: Colors.white, borderRadius: Radius.lg, padding: 24, gap: 10,
    borderWidth: 1, borderColor: '#fecaca',
    ...Shadow.card,
  },
  dangerTitle: { fontSize: 13, fontWeight: '700', color: Colors.danger },
  dangerDesc: { fontSize: 11, color: Colors.textSecondary, lineHeight: 16 },
  dangerBtn: {
    backgroundColor: Colors.danger, borderRadius: Radius.md,
    padding: 14, alignItems: 'center', marginTop: 4,
  },
  dangerBtnText: { color: Colors.white, fontSize: 12, fontWeight: '700', letterSpacing: 1.5 },
});
