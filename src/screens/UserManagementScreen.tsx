import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  Alert, ActivityIndicator,
} from 'react-native';
import { Colors, Radius, Shadow } from '../theme/colors';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@navigation/types';
import { database, usersCollection } from '@db/index';
import { useAuth } from '@context/AuthContext';
import { importUsersFromExcel, UserImportError } from '@services/UserExcelImporter';
import type User from '@models/User';

type Props = NativeStackScreenProps<RootStackParamList, 'UserManagement'>;

const ROLE_LABELS: Record<string, { label: string; color: string }> = {
  CREATOR:    { label: 'Creador',    color: '#5b2d8e' },
  RESIDENT:   { label: 'Jefe',       color: Colors.primary },
  SUPERVISOR: { label: 'Supervisor', color: Colors.secondary },
  OPERATOR:   { label: 'Operario',   color: Colors.warning },
};

export default function UserManagementScreen({ navigation }: Props) {
  const { currentUser } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    const sub = usersCollection.query().observe().subscribe(setUsers);
    return () => sub.unsubscribe();
  }, []);

  const handleImport = async () => {
    setImporting(true);
    try {
      const imported = await importUsersFromExcel();
      const all = await usersCollection.query().fetch();

      await database.write(async () => {
        for (const u of imported) {
          const exists = all.find(
            (ex) =>
              ex.name.toLowerCase() === u.name.toLowerCase() &&
              ex.apellido?.toLowerCase() === u.apellido.toLowerCase()
          );
          if (!exists) {
            await usersCollection.create((newUser) => {
              newUser.name = u.name;
              newUser.apellido = u.apellido;
              newUser.role = u.role;
              newUser.password = u.name; // Primera contraseña = nombre
              newUser.pin = null;
              newUser.signatureUri = null;
            });
          }
        }
      });

      Alert.alert('Importación completada', `${imported.length} usuarios procesados.`);
    } catch (err) {
      const msg = err instanceof UserImportError ? err.message : 'Error inesperado al importar.';
      Alert.alert('Error', msg);
    } finally {
      setImporting(false);
    }
  };

  const handleDelete = (user: User) => {
    if (user.id === currentUser?.id) {
      Alert.alert('No permitido', 'No puedes eliminar tu propio usuario.');
      return;
    }
    Alert.alert(
      'Eliminar usuario',
      `¿Eliminar a ${user.name} ${user.apellido ?? ''}?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar', style: 'destructive',
          onPress: async () => {
            await database.write(async () => {
              await user.destroyPermanently();
            });
          },
        },
      ]
    );
  };

  const handleResetPassword = (user: User) => {
    Alert.alert(
      'Resetear contraseña',
      `La contraseña de ${user.name} volverá a ser su nombre.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Resetear',
          onPress: async () => {
            await database.write(async () => {
              await user.update((u) => { u.password = u.name; });
            });
            Alert.alert('Listo', 'Contraseña reseteada.');
          },
        },
      ]
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>Volver</Text>
        </TouchableOpacity>
        <Text style={styles.title}>USUARIOS</Text>
        <View style={{ width: 60 }} />
      </View>

      <View style={styles.importBar}>
        <TouchableOpacity
          style={[styles.importBtn, importing && styles.btnDisabled]}
          onPress={handleImport}
          disabled={importing}
        >
          {importing
            ? <ActivityIndicator color="#fff" size="small" />
            : <Text style={styles.importBtnText}>+ Importar desde Excel</Text>
          }
        </TouchableOpacity>
        <Text style={styles.importHint}>Columnas: Nombre · Apellido · Rol</Text>
      </View>

      <FlatList
        data={users}
        keyExtractor={(u) => u.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={<Text style={styles.empty}>No hay usuarios registrados.</Text>}
        renderItem={({ item }) => {
          const roleInfo = ROLE_LABELS[item.role] ?? { label: item.role, color: '#666' };
          const isMe = item.id === currentUser?.id;
          return (
            <View style={[styles.card, isMe && styles.cardMe]}>
              <View style={[styles.roleTag, { backgroundColor: roleInfo.color }]}>
                <Text style={styles.roleTagText}>{roleInfo.label}</Text>
              </View>
              <View style={styles.cardInfo}>
                <Text style={styles.userName}>{item.name} {item.apellido}</Text>
                {isMe && <Text style={styles.meTag}>Usted</Text>}
              </View>
              <View style={styles.cardActions}>
                <TouchableOpacity
                  style={styles.actionBtn}
                  onPress={() => handleResetPassword(item)}
                >
                  <Text style={styles.actionText}>Reset</Text>
                </TouchableOpacity>
                {!isMe && (
                  <TouchableOpacity
                    style={[styles.actionBtn, styles.deleteBtn]}
                    onPress={() => handleDelete(item)}
                  >
                    <Text style={[styles.actionText, { color: Colors.danger }]}>Eliminar</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.surface },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: 52, paddingBottom: 16,
    backgroundColor: Colors.navy,
  },
  backBtn: { padding: 4, minWidth: 60 },
  backText: { color: Colors.light, fontSize: 14, fontWeight: '600' },
  title: { fontSize: 16, fontWeight: '700', color: Colors.white, letterSpacing: 1 },
  importBar: {
    padding: 16, gap: 6, backgroundColor: Colors.white,
    borderBottomWidth: 1, borderBottomColor: Colors.divider,
  },
  importBtn: {
    backgroundColor: Colors.primary, borderRadius: Radius.md, padding: 14,
    alignItems: 'center',
  },
  btnDisabled: { backgroundColor: Colors.light },
  importBtnText: { color: Colors.white, fontWeight: '700', fontSize: 13, letterSpacing: 1 },
  importHint: { fontSize: 11, color: Colors.textMuted, textAlign: 'center' },
  list: { padding: 16, gap: 10 },
  empty: { textAlign: 'center', color: Colors.textMuted, marginTop: 40 },
  card: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: Colors.white, borderRadius: Radius.lg, padding: 14,
    ...Shadow.subtle,
  },
  cardMe: { borderWidth: 2, borderColor: Colors.primary },
  roleTag: {
    borderRadius: Radius.sm, paddingHorizontal: 8, paddingVertical: 4, minWidth: 80, alignItems: 'center',
  },
  roleTagText: { color: Colors.white, fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },
  cardInfo: { flex: 1 },
  userName: { fontSize: 15, fontWeight: '600', color: Colors.navy },
  meTag: { fontSize: 11, color: Colors.primary, fontWeight: '600', marginTop: 2 },
  cardActions: { flexDirection: 'row', gap: 8 },
  actionBtn: {
    backgroundColor: Colors.surface, borderRadius: Radius.sm,
    paddingHorizontal: 10, paddingVertical: 8, borderWidth: 1, borderColor: Colors.border,
  },
  deleteBtn: { backgroundColor: '#fef2f2', borderColor: Colors.danger },
  actionText: { fontSize: 11, color: Colors.textSecondary, fontWeight: '600' },
});
