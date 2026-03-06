import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  TextInput, Modal, Alert,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@navigation/types';
import { database, projectsCollection } from '@db/index';
import { useAuth } from '@context/AuthContext';
import type Project from '@models/Project';

type Props = NativeStackScreenProps<RootStackParamList, 'ProjectList'>;

export default function ProjectListScreen({ navigation }: Props) {
  const { currentUser, logout } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');

  const isJefe = currentUser?.role === 'RESIDENT';

  useEffect(() => {
    const subscription = projectsCollection.query().observe().subscribe(setProjects);
    return () => subscription.unsubscribe();
  }, []);

  const createProject = async () => {
    if (!newName.trim()) return;
    await database.write(async () => {
      await projectsCollection.create((p) => {
        p.name = newName.trim();
        p.status = 'ACTIVE';
        p.createdById = currentUser?.id ?? null;
      });
    });
    setNewName('');
    setShowCreate(false);
  };

  const handleLogout = () => {
    Alert.alert('Salir', '¿Cerrar sesión?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Salir', style: 'destructive', onPress: logout },
    ]);
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>Hola, {currentUser?.name}</Text>
          <Text style={styles.role}>{roleLabel(currentUser?.role)}</Text>
        </View>
        <TouchableOpacity onPress={handleLogout} style={styles.logoutBtn}>
          <Text style={styles.logoutText}>Salir</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.sectionTitle}>Proyectos</Text>

      <FlatList
        data={projects}
        keyExtractor={(p) => p.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <Text style={styles.empty}>
            {isJefe ? 'Crea tu primer proyecto.' : 'No hay proyectos disponibles.'}
          </Text>
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.card}
            onPress={() =>
              navigation.navigate('ProtocolList', {
                projectId: item.id,
                projectName: item.name,
              })
            }
          >
            <View style={styles.cardLeft}>
              <Text style={styles.cardName}>{item.name}</Text>
              <Text style={styles.cardStatus}>{item.status}</Text>
            </View>

            {/* Acciones rapidas para el Jefe */}
            {isJefe && (
              <View style={styles.cardActions}>
                <TouchableOpacity
                  style={styles.actionBtn}
                  onPress={() =>
                    navigation.navigate('ExcelImport', {
                      projectId: item.id,
                      projectName: item.name,
                    })
                  }
                >
                  <Text style={styles.actionBtnText}>Excel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.actionBtn, styles.actionBtnGreen]}
                  onPress={() =>
                    navigation.navigate('LocationsImport', {
                      projectId: item.id,
                      projectName: item.name,
                    })
                  }
                >
                  <Text style={styles.actionBtnText}>Ubic.</Text>
                </TouchableOpacity>
              </View>
            )}

            <Text style={styles.chevron}>›</Text>
          </TouchableOpacity>
        )}
      />

      {/* FAB: crear proyecto (solo Jefe) */}
      {isJefe && (
        <TouchableOpacity style={styles.fab} onPress={() => setShowCreate(true)}>
          <Text style={styles.fabText}>+</Text>
        </TouchableOpacity>
      )}

      {/* Modal crear proyecto */}
      <Modal visible={showCreate} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>Nuevo Proyecto</Text>
            <TextInput
              style={styles.input}
              placeholder="Nombre del proyecto"
              value={newName}
              onChangeText={setNewName}
              autoFocus
              returnKeyType="done"
              onSubmitEditing={createProject}
            />
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalBtn, styles.modalBtnCancel]}
                onPress={() => { setShowCreate(false); setNewName(''); }}
              >
                <Text style={styles.modalBtnText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtn, !newName.trim() && styles.modalBtnDisabled]}
                onPress={createProject}
                disabled={!newName.trim()}
              >
                <Text style={[styles.modalBtnText, styles.modalBtnTextPrimary]}>Crear</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function roleLabel(role?: string) {
  if (role === 'RESIDENT') return 'Jefe de Obra';
  if (role === 'SUPERVISOR') return 'Supervisor QC';
  return 'Visualizador';
}

const BLUE = '#1a73e8';
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8f9fa' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingTop: 56, paddingBottom: 16,
    backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e0e0e0',
  },
  greeting: { fontSize: 18, fontWeight: '700', color: '#1a1a2e' },
  role: { fontSize: 12, color: '#777', marginTop: 2 },
  logoutBtn: { padding: 8 },
  logoutText: { color: '#d93025', fontWeight: '600' },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#333', margin: 20, marginBottom: 8 },
  list: { paddingHorizontal: 20, paddingBottom: 100, gap: 10 },
  empty: { color: '#aaa', textAlign: 'center', marginTop: 40, fontSize: 15 },
  card: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff',
    borderRadius: 12, padding: 16, gap: 12,
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4, elevation: 2,
  },
  cardLeft: { flex: 1 },
  cardName: { fontSize: 16, fontWeight: '700', color: '#1a1a2e' },
  cardStatus: { fontSize: 12, color: '#777', marginTop: 2 },
  cardActions: { flexDirection: 'row', gap: 6 },
  actionBtn: {
    backgroundColor: BLUE, borderRadius: 6, paddingHorizontal: 10, paddingVertical: 6,
  },
  actionBtnGreen: { backgroundColor: '#1e8e3e' },
  actionBtnText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  chevron: { fontSize: 22, color: '#bbb' },
  fab: {
    position: 'absolute', bottom: 32, right: 24, width: 56, height: 56,
    borderRadius: 28, backgroundColor: BLUE, alignItems: 'center',
    justifyContent: 'center', elevation: 6,
    shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 6,
  },
  fabText: { color: '#fff', fontSize: 28, lineHeight: 32 },
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end',
  },
  modal: {
    backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: 24, gap: 16,
  },
  modalTitle: { fontSize: 18, fontWeight: '700', color: '#1a1a2e' },
  input: {
    backgroundColor: '#f8f9fa', borderRadius: 10, padding: 14,
    fontSize: 16, borderWidth: 1, borderColor: '#e0e0e0',
  },
  modalActions: { flexDirection: 'row', gap: 12, justifyContent: 'flex-end' },
  modalBtn: {
    backgroundColor: BLUE, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 8,
  },
  modalBtnCancel: { backgroundColor: '#f1f3f4' },
  modalBtnDisabled: { backgroundColor: '#bdc1c6' },
  modalBtnText: { fontWeight: '700', color: '#555' },
  modalBtnTextPrimary: { color: '#fff' },
});
