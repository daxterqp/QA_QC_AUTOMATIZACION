import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity,
  Alert, KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@navigation/types';
import { database, nonConformitiesCollection } from '@db/index';
import { useAuth } from '@context/AuthContext';

type Props = NativeStackScreenProps<RootStackParamList, 'NonConformity'>;

export default function NonConformityScreen({ navigation, route }: Props) {
  const { protocolId, projectId } = route.params;
  const { currentUser } = useAuth();
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
        'No Conformidad Registrada',
        'La NC fue levantada y quedara asociada al protocolo.',
        [{ text: 'OK', onPress: () => navigation.goBack() }]
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
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Levantar No Conformidad</Text>
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        <View style={styles.infoBox}>
          <Text style={styles.infoTitle}>¿Qué es una No Conformidad?</Text>
          <Text style={styles.infoText}>
            Una NC documenta un incumplimiento o desviacion de los requisitos de calidad.
            Quedara registrada con estado ABIERTO hasta que sea resuelta.
          </Text>
        </View>

        <Text style={styles.label}>Descripcion de la no conformidad *</Text>
        <TextInput
          style={styles.textArea}
          placeholder="Describe detalladamente el incumplimiento detectado..."
          value={description}
          onChangeText={setDescription}
          multiline
          numberOfLines={6}
          textAlignVertical="top"
        />
        <Text style={styles.charCount}>{description.length} caracteres (minimo 10)</Text>

        <TouchableOpacity
          style={[styles.saveBtn, !canSave && styles.saveBtnDisabled]}
          onPress={handleSave}
          disabled={!canSave || saving}
        >
          {saving
            ? <ActivityIndicator color="#fff" />
            : <Text style={styles.saveBtnText}>Registrar No Conformidad</Text>
          }
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: '#f8f9fa' },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingTop: 56, paddingBottom: 14,
    backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e0e0e0',
  },
  backBtn: { padding: 4 },
  backText: { fontSize: 28, color: '#1a73e8', lineHeight: 32 },
  headerTitle: { fontSize: 17, fontWeight: '700', color: '#1a1a2e' },
  body: { padding: 20, gap: 14 },
  infoBox: {
    backgroundColor: '#fff3e0', borderRadius: 10, padding: 14,
    borderLeftWidth: 4, borderLeftColor: '#e37400',
  },
  infoTitle: { fontSize: 13, fontWeight: '700', color: '#bf5600', marginBottom: 6 },
  infoText: { fontSize: 13, color: '#5f4000', lineHeight: 19 },
  label: { fontSize: 13, fontWeight: '700', color: '#555' },
  textArea: {
    backgroundColor: '#fff', borderRadius: 10, padding: 14,
    fontSize: 15, borderWidth: 1, borderColor: '#e0e0e0',
    minHeight: 140,
  },
  charCount: { fontSize: 11, color: '#aaa', textAlign: 'right', marginTop: -8 },
  saveBtn: {
    backgroundColor: '#e37400', borderRadius: 12, padding: 16,
    alignItems: 'center', marginTop: 8,
  },
  saveBtnDisabled: { backgroundColor: '#bdc1c6' },
  saveBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
});
