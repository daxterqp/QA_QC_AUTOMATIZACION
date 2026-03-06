import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  TextInput, KeyboardAvoidingView, Platform, ScrollView,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@navigation/types';
import { useAuth } from '@context/AuthContext';
import type { UserRole } from '@models/User';

type Props = NativeStackScreenProps<RootStackParamList, 'RoleSelect'>;

const ROLES: { role: UserRole; label: string; desc: string; color: string }[] = [
  {
    role: 'RESIDENT',
    label: 'El Jefe',
    desc: 'Crea proyectos · Audita y firma protocolos · Levanta no conformidades',
    color: '#1a73e8',
  },
  {
    role: 'SUPERVISOR',
    label: 'Supervisor QC',
    desc: 'Rellena protocolos · Agrega fotos · Envia para aprobacion',
    color: '#1e8e3e',
  },
  {
    role: 'OPERATOR',
    label: 'Otros',
    desc: 'Visualiza y filtra protocolos',
    color: '#e37400',
  },
];

export default function RoleSelectScreen({ navigation }: Props) {
  const { login } = useAuth();
  const [selectedRole, setSelectedRole] = useState<UserRole | null>(null);
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);

  const canContinue = !!selectedRole && name.trim().length >= 2;

  const handleContinue = async () => {
    if (!canContinue || !selectedRole) return;
    setLoading(true);
    await login(name.trim(), selectedRole);
    navigation.replace('ProjectList');
    setLoading(false);
  };

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.appName}>S-CUA</Text>
        <Text style={styles.subtitle}>Control de Calidad en Obra</Text>

        <Text style={styles.sectionLabel}>¿Quién eres?</Text>
        <TextInput
          style={styles.input}
          placeholder="Tu nombre completo"
          value={name}
          onChangeText={setName}
          autoCapitalize="words"
          returnKeyType="done"
        />

        <Text style={styles.sectionLabel}>Selecciona tu rol</Text>
        {ROLES.map(({ role, label, desc, color }) => (
          <TouchableOpacity
            key={role}
            style={[styles.roleCard, selectedRole === role && { borderColor: color, borderWidth: 2 }]}
            onPress={() => setSelectedRole(role)}
            activeOpacity={0.8}
          >
            <View style={[styles.roleIndicator, { backgroundColor: color }]} />
            <View style={styles.roleText}>
              <Text style={styles.roleLabel}>{label}</Text>
              <Text style={styles.roleDesc}>{desc}</Text>
            </View>
            {selectedRole === role && (
              <Text style={[styles.checkmark, { color }]}>✓</Text>
            )}
          </TouchableOpacity>
        ))}

        <TouchableOpacity
          style={[styles.btn, !canContinue && styles.btnDisabled]}
          onPress={handleContinue}
          disabled={!canContinue || loading}
        >
          <Text style={styles.btnText}>
            {loading ? 'Entrando...' : 'Ingresar'}
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: '#f8f9fa' },
  container: { padding: 24, paddingTop: 72, gap: 12 },
  appName: { fontSize: 40, fontWeight: '900', color: '#1a1a2e', textAlign: 'center' },
  subtitle: { fontSize: 14, color: '#777', textAlign: 'center', marginBottom: 16 },
  sectionLabel: { fontSize: 13, fontWeight: '700', color: '#555', textTransform: 'uppercase', marginTop: 8 },
  input: {
    backgroundColor: '#fff', borderRadius: 10, padding: 14,
    fontSize: 16, borderWidth: 1, borderColor: '#e0e0e0',
  },
  roleCard: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff',
    borderRadius: 12, padding: 16, gap: 12, borderWidth: 1, borderColor: '#e0e0e0',
  },
  roleIndicator: { width: 6, height: 48, borderRadius: 3 },
  roleText: { flex: 1 },
  roleLabel: { fontSize: 16, fontWeight: '700', color: '#1a1a2e' },
  roleDesc: { fontSize: 12, color: '#777', marginTop: 2, lineHeight: 17 },
  checkmark: { fontSize: 22, fontWeight: '700' },
  btn: {
    backgroundColor: '#1a73e8', borderRadius: 10, padding: 16,
    alignItems: 'center', marginTop: 16,
  },
  btnDisabled: { backgroundColor: '#bdc1c6' },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
