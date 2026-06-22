import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity,
  Alert, KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator,
} from 'react-native';
import AppHeader from '@components/AppHeader';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@navigation/types';
import { database, nonConformitiesCollection } from '@db/index';
import { useAuth } from '@context/AuthContext';
import { useI18n } from '@i18n/index';
import { Colors, Radius, Shadow } from '../theme/colors';

type Props = NativeStackScreenProps<RootStackParamList, 'NonConformity'>;

export default function NonConformityScreen({ navigation, route }: Props) {
  const { protocolId, projectId } = route.params;
  const { currentUser } = useAuth();
  const { t } = useI18n();
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);

  const canSave = description.trim().length >= 10;

  const handleSave = useCallback(async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      await database.write(async () => {
        await nonConformitiesCollection.create((nc) => {
          nc.projectId = projectId;
          nc.protocolId = protocolId;
          nc.description = description.trim();
          nc.status = 'OPEN';
          nc.raisedById = currentUser?.id ?? '';
          nc.resolutionNotes = null;
        });
      });

      Alert.alert(
        t('nonConf.savedTitle'),
        t('nonConf.savedMessage'),
        [{ text: t('nonConf.ok'), onPress: () => navigation.goBack() }]
      );
    } finally {
      setSaving(false);
    }
  }, [canSave, description, protocolId, projectId, currentUser, navigation]);

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <AppHeader title={t('nonConf.headerTitle')} onBack={() => navigation.goBack()} />

      <ScrollView contentContainerStyle={styles.body}>
        <View style={styles.infoBox}>
          <Text style={styles.infoTitle}>{t('nonConf.infoTitle')}</Text>
          <Text style={styles.infoText}>
            {t('nonConf.infoText')}
          </Text>
        </View>

        <Text style={styles.label}>{t('nonConf.descriptionLabel')}</Text>
        <TextInput
          style={styles.textArea}
          placeholder={t('nonConf.descriptionPlaceholder')}
          value={description}
          onChangeText={setDescription}
          multiline
          numberOfLines={6}
          textAlignVertical="top"
        />
        <Text style={styles.charCount}>{t('nonConf.charCount', { count: description.length })}</Text>

        <TouchableOpacity
          style={[styles.saveBtn, !canSave && styles.saveBtnDisabled]}
          onPress={handleSave}
          disabled={!canSave || saving}
        >
          {saving
            ? <ActivityIndicator color="#fff" />
            : <Text style={styles.saveBtnText}>{t('nonConf.submit')}</Text>
          }
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: Colors.surface },
  body: { padding: 20, gap: 14 },
  infoBox: {
    backgroundColor: '#fef9f0', borderRadius: Radius.md, padding: 14,
    borderLeftWidth: 4, borderLeftColor: Colors.warning,
  },
  infoTitle: { fontSize: 12, fontWeight: '700', color: Colors.warning, marginBottom: 6 },
  infoText: { fontSize: 12, color: Colors.textSecondary, lineHeight: 19 },
  label: { fontSize: 11, fontWeight: '700', color: Colors.textSecondary, letterSpacing: 1 },
  textArea: {
    backgroundColor: Colors.white, borderRadius: Radius.md, padding: 14,
    fontSize: 13, borderWidth: 1, borderColor: Colors.border, color: Colors.textPrimary,
    minHeight: 140,
  },
  charCount: { fontSize: 11, color: Colors.textMuted, textAlign: 'right', marginTop: -8 },
  saveBtn: {
    backgroundColor: Colors.warning, borderRadius: Radius.lg, padding: 16,
    alignItems: 'center', marginTop: 8,
  },
  saveBtnDisabled: { backgroundColor: Colors.light },
  saveBtnText: { color: Colors.white, fontWeight: '700', fontSize: 13, letterSpacing: 0.5 },
});
