import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  TextInput, Modal, Alert, RefreshControl,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@navigation/types';
import {
  database, projectsCollection, annotationCommentsCollection,
  planAnnotationsCollection, userProjectAccessCollection,
} from '@db/index';
import { Q } from '@nozbe/watermelondb';
import { useAuth } from '@context/AuthContext';
import type Project from '@models/Project';
import { Colors, Radius, Shadow } from '../theme/colors';
import { syncProjectFromS3 } from '@services/S3SyncService';
import {
  syncProject as syncProjectSupabase,
  findProjectInSupabase,
  pullProjectFromCloud,
  restoreUserProjectsFromCloud,
  pushProjectToSupabase,
} from '@services/SupabaseSyncService';
import { supabase } from '@config/supabase';

type Props = NativeStackScreenProps<RootStackParamList, 'ProjectList'>;

export default function ProjectListScreen({ navigation }: Props) {
  const { currentUser, logout } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [unreadCount, setUnreadCount] = useState(0);

  // Modal ingresar a proyecto
  const [showJoin, setShowJoin] = useState(false);
  const [joinName, setJoinName] = useState('');
  const [joinPassword, setJoinPassword] = useState('');
  const [joinLoading, setJoinLoading] = useState(false);

  const [refreshing, setRefreshing] = useState(false);

  // Proyectos ocultos (eliminados de vista, solo local)
  const [hiddenProjectIds, setHiddenProjectIds] = useState<Set<string>>(new Set());
  // Modal de propiedades de tarjeta
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);

  // Cargar lista de proyectos ocultos desde AsyncStorage
  useEffect(() => {
    if (!currentUser) return;
    AsyncStorage.getItem(`hidden_projects_${currentUser.id}`)
      .then((val) => { if (val) setHiddenProjectIds(new Set(JSON.parse(val))); })
      .catch(() => {});
  }, [currentUser]);

  const isJefe = currentUser?.role === 'RESIDENT' || currentUser?.role === 'CREATOR';
  const isCreator = currentUser?.role === 'CREATOR';
  const isSupervisor = currentUser?.role === 'SUPERVISOR';

  // ── Cargar proyectos según rol ──────────────────────────────────────────────
  useEffect(() => {
    if (!currentUser) return;

    if (isCreator) {
      const sub = projectsCollection.query().observe().subscribe(setProjects);
      return () => sub.unsubscribe();
    }

    const accessSub = userProjectAccessCollection
      .query(Q.where('user_id', currentUser.id))
      .observe()
      .subscribe(async (accesses) => {
        const accessProjectIds = accesses.map((a) => (a as any).projectId as string);

        if (currentUser.role === 'RESIDENT') {
          const all = await projectsCollection.query().fetch();
          const visible = all.filter(
            (p) => p.createdById === currentUser.id || accessProjectIds.includes(p.id)
          );
          setProjects(visible);
        } else {
          if (accessProjectIds.length === 0) { setProjects([]); return; }
          const visible = await projectsCollection
            .query(Q.where('id', Q.oneOf(accessProjectIds)))
            .fetch();
          setProjects(visible);
        }
      });

    return () => accessSub.unsubscribe();
  }, [currentUser]);

  // ── Contador de respuestas no leídas ───────────────────────────────────────
  useEffect(() => {
    if (!currentUser) return;
    const sub = annotationCommentsCollection
      .query(Q.where('read_by_creator', false))
      .observe()
      .subscribe(async (unreadComments) => {
        if (unreadComments.length === 0) { setUnreadCount(0); return; }
        let count = 0;
        for (const c of unreadComments) {
          if ((c as any).authorId === currentUser.id) continue;
          try {
            const ann = await planAnnotationsCollection.find((c as any).annotationId);
            if ((ann as any).createdById === currentUser.id) count++;
          } catch { /* */ }
        }
        setUnreadCount(count);
      });
    return () => sub.unsubscribe();
  }, [currentUser]);

  // ── Auto-pull + restaurar proyectos en reinstalación ─────────────────────
  useFocusEffect(useCallback(() => {
    if (!currentUser) return;
    // Pull proyectos locales existentes
    projectsCollection.query().fetch().then((all) => {
      for (const p of all) pullProjectFromCloud(p.id).catch(() => {});
    }).catch(() => {});
    // Restaurar proyectos desde Supabase (cubre reinstalaciones)
    restoreUserProjectsFromCloud(currentUser.id).catch(() => {});
  }, [currentUser]));

  // ── Pull-to-refresh (Opcion B) ───────────────────────────────────────────
  const handleRefresh = async () => {
    if (!currentUser || refreshing) return;
    setRefreshing(true);
    try {
      const all = await projectsCollection.query().fetch();
      await Promise.all(
        all.map((p) => syncProjectSupabase(p.id).catch(() => {}))
      );
    } catch { /* sin conectividad, ignorar */ }
    setRefreshing(false);
  };

  // ── Crear proyecto ─────────────────────────────────────────────────────────
  const createProject = async () => {
    if (!newName.trim() || !newPassword.trim()) return;
    let newProjectId = '';
    await database.write(async () => {
      const proj = await projectsCollection.create((p) => {
        p.name = newName.trim();
        p.status = 'ACTIVE';
        (p as any).password = newPassword.trim();
        p.createdById = currentUser?.id ?? null;
      });
      newProjectId = proj.id;
    });
    // Push inmediato para que otros dispositivos puedan encontrarlo
    if (newProjectId) pushProjectToSupabase(newProjectId).catch(() => {});
    setNewName('');
    setNewPassword('');
    setShowCreate(false);
  };

  // ── Eliminar proyecto de vista (solo local, S3/Supabase intactos) ──────────
  const handleDeleteFromView = (project: Project) => {
    setSelectedProject(null);
    Alert.alert(
      'Eliminar proyecto',
      `¿Estás seguro de que deseas eliminar "${project.name}" de tu vista? El proyecto seguirá disponible en la nube para el resto del equipo.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar', style: 'destructive',
          onPress: async () => {
            if (!currentUser) return;
            // 1. Eliminar user_project_access local + Supabase
            const accesses = await userProjectAccessCollection
              .query(Q.where('user_id', currentUser.id), Q.where('project_id', project.id))
              .fetch();
            if (accesses.length > 0) {
              await database.write(async () => {
                for (const a of accesses) await a.destroyPermanently();
              });
              supabase.from('user_project_access')
                .delete()
                .eq('user_id', currentUser.id)
                .eq('project_id', project.id)
                .then(() => {});
            }
            // 2. Marcar como oculto localmente (cubre proyectos propios del CREATOR/RESIDENT)
            const newHidden = new Set(hiddenProjectIds);
            newHidden.add(project.id);
            setHiddenProjectIds(newHidden);
            AsyncStorage.setItem(
              `hidden_projects_${currentUser.id}`,
              JSON.stringify([...newHidden])
            ).catch(() => {});
          },
        },
      ]
    );
  };

  // ── Ingresar a proyecto ────────────────────────────────────────────────────
  const handleJoin = async () => {
    if (!joinName.trim() || !joinPassword.trim() || !currentUser) return;
    setJoinLoading(true);
    try {
      // Siempre verificar contraseña contra Supabase (fuente de verdad)
      const remote = await findProjectInSupabase(joinName.trim());
      if (!remote) {
        Alert.alert('Proyecto no encontrado', 'No existe un proyecto con ese nombre.');
        setJoinLoading(false);
        return;
      }
      if ((remote.password ?? '').toLowerCase().trim() !== joinPassword.toLowerCase().trim()) {
        Alert.alert('Contraseña incorrecta', 'La contraseña del proyecto no es correcta.');
        setJoinLoading(false);
        return;
      }

      // Buscar proyecto localmente (puede que restoreUserProjectsFromCloud ya lo haya descargado)
      const findLocal = async () => {
        const res = await projectsCollection.query(Q.where('id', remote.id)).fetch();
        return res.length > 0 ? res[0] : null;
      };

      let found = await findLocal();
      let fromCloud = false;
      if (!found) {
        // pull con deduplicación (si ya está en curso, espera ese mismo Promise)
        await pullProjectFromCloud(remote.id);
        try { await syncProjectFromS3(remote.id, remote.name, currentUser.id); } catch { /* */ }
        fromCloud = true;
        found = await findLocal();
        if (!found) {
          await new Promise((r) => setTimeout(r, 800));
          found = await findLocal();
        }
        if (!found) {
          // Fallback definitivo: crear el proyecto localmente desde los datos remotos
          try {
            await database.write(async () => {
              await projectsCollection.create((p: any) => {
                p._raw.id = remote.id;
                p.name = remote.name ?? joinName.trim();
                p.status = remote.status ?? 'ACTIVE';
                p.password = remote.password ?? null;
                p.createdById = remote.created_by_id ?? null;
              });
            });
            found = await findLocal();
          } catch { /* el proyecto puede haber sido creado por una escritura concurrente */ }
          // Último intento después del fallback
          if (!found) found = await findLocal();
        }
        if (!found) {
          Alert.alert('Error', 'No se pudo descargar el proyecto. Desliza la lista hacia abajo para sincronizar e intenta de nuevo.');
          setJoinLoading(false);
          return;
        }
      }

      // 3. Verificar si ya tiene acceso
      const existing = await userProjectAccessCollection
        .query(Q.where('user_id', currentUser.id), Q.where('project_id', found.id))
        .fetch();
      const alreadyHasAccess = existing.length > 0 || (found as any).createdById === currentUser.id;

      if (alreadyHasAccess) {
        // Si el proyecto estaba oculto, simplemente restaurarlo en la vista
        if (hiddenProjectIds.has(found.id)) {
          const newHidden = new Set(hiddenProjectIds);
          newHidden.delete(found.id);
          setHiddenProjectIds(newHidden);
          AsyncStorage.setItem(`hidden_projects_${currentUser.id}`, JSON.stringify([...newHidden])).catch(() => {});
          setJoinName(''); setJoinPassword(''); setShowJoin(false);
          Alert.alert('Proyecto restaurado', `"${found.name}" vuelve a aparecer en tu lista.`);
        } else {
          Alert.alert('Ya tienes acceso', 'Este proyecto ya está en tu lista.');
        }
        setJoinLoading(false);
        return;
      }

      // 4. Crear registro de acceso
      await database.write(async () => {
        await userProjectAccessCollection.create((a: any) => {
          a.userId = currentUser.id;
          a.projectId = found.id;
        });
      });

      // Si estaba oculto (eliminado de vista), restaurarlo
      if (hiddenProjectIds.has(found.id)) {
        const newHidden = new Set(hiddenProjectIds);
        newHidden.delete(found.id);
        setHiddenProjectIds(newHidden);
        AsyncStorage.setItem(`hidden_projects_${currentUser.id}`, JSON.stringify([...newHidden])).catch(() => {});
      }

      setJoinName('');
      setJoinPassword('');
      setShowJoin(false);
      const msg = fromCloud
        ? `El proyecto "${found.name}" fue descargado desde la nube y ya aparece en tu lista.`
        : `El proyecto "${found.name}" ya aparece en tu lista.`;
      Alert.alert('Acceso concedido', msg);
    } catch (err: any) {
      Alert.alert('Error', `Ocurrió un error al ingresar al proyecto.\n\n${err?.message ?? String(err)}`);
    }
    setJoinLoading(false);
  };

  const handleLogout = () => {
    Alert.alert('Cerrar sesion', 'Desea salir del sistema?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Salir', style: 'destructive', onPress: logout },
    ]);
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <View style={styles.userInfo}>
            <Text style={styles.userName}>
              {currentUser?.name} {currentUser?.apellido}
            </Text>
            <View style={[styles.roleBadge, { backgroundColor: roleColor(currentUser?.role) }]}>
              <Text style={styles.roleBadgeText}>{roleLabel(currentUser?.role)}</Text>
            </View>
          </View>
          <View style={styles.headerActions}>
            {unreadCount > 0 && (
              <View style={styles.notifBadge}>
                <Text style={styles.notifBadgeText}>{unreadCount} nueva{unreadCount !== 1 ? 's' : ''}</Text>
              </View>
            )}
            {isCreator && (
              <TouchableOpacity
                style={styles.headerBtn}
                onPress={() => navigation.navigate('UserManagement')}
              >
                <Text style={styles.headerBtnText}>Usuarios</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={styles.headerBtn}
              onPress={() => navigation.navigate('ChangePassword')}
            >
              <Text style={styles.headerBtnText}>Contrasena</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
              <Text style={styles.logoutBtnText}>Salir</Text>
            </TouchableOpacity>
          </View>
        </View>
        <Text style={styles.headerTitle}>Proyectos</Text>
      </View>

      <FlatList
        data={projects.filter((p) => !hiddenProjectIds.has(p.id))}
        keyExtractor={(p) => p.id}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={Colors.primary} />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyTitle}>Sin proyectos</Text>
            <Text style={styles.emptyDesc}>
              {isJefe
                ? 'Cree un proyecto con el botón + o ingrese a uno existente.'
                : 'Ingrese a un proyecto usando su nombre y contraseña.'}
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <View style={styles.card}>
            <TouchableOpacity
              style={styles.cardHeader}
              onPress={() => navigation.navigate('LocationList', { projectId: item.id, projectName: item.name })}
              onLongPress={() => setSelectedProject(item)}
              activeOpacity={0.85}
            >
              <View style={styles.cardHeaderLeft}>
                <Text style={styles.cardName}>{item.name}</Text>
                <View style={[
                  styles.statusChip,
                  { backgroundColor: item.status === 'ACTIVE' ? Colors.success : Colors.textMuted },
                ]}>
                  <Text style={styles.statusChipText}>
                    {item.status === 'ACTIVE' ? 'ACTIVO' : 'CERRADO'}
                  </Text>
                </View>
              </View>
              <Text style={styles.chevron}>›</Text>
            </TouchableOpacity>

            <View style={styles.actionsRow}>
              <TouchableOpacity
                style={styles.actionChip}
                onPress={() => navigation.navigate('Historical', { projectId: item.id })}
              >
                <Text style={styles.actionChipText}>Historico</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.actionChip, styles.actionChipAccent]}
                onPress={() => navigation.navigate('AnnotationComments', { projectId: item.id, projectName: item.name })}
              >
                <Text style={[styles.actionChipText, styles.actionChipTextLight]}>Observaciones</Text>
              </TouchableOpacity>

              {(isJefe || isSupervisor) && (
                <>
                  <TouchableOpacity
                    style={[styles.actionChip, styles.actionChipAccent]}
                    onPress={() => navigation.navigate('Dossier', { projectId: item.id, projectName: item.name })}
                  >
                    <Text style={[styles.actionChipText, styles.actionChipTextLight]}>Dosier</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.actionChip, styles.actionChipAccent]}
                    onPress={() => navigation.navigate('PlansManagement', { projectId: item.id, projectName: item.name })}
                  >
                    <Text style={[styles.actionChipText, styles.actionChipTextLight]}>Planos</Text>
                  </TouchableOpacity>
                </>
              )}

              {isJefe && (
                <>
                  <TouchableOpacity
                    style={styles.actionChip}
                    onPress={() => navigation.navigate('ExcelImport', { projectId: item.id, projectName: item.name })}
                  >
                    <Text style={styles.actionChipText}>Actividades</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.actionChip}
                    onPress={() => navigation.navigate('LocationsImport', { projectId: item.id, projectName: item.name })}
                  >
                    <Text style={styles.actionChipText}>Ubicaciones</Text>
                  </TouchableOpacity>
                </>
              )}
            </View>
          </View>
        )}
      />

      {/* Botón ingresar a proyecto */}
      <TouchableOpacity style={styles.joinBtn} onPress={() => setShowJoin(true)}>
        <Text style={styles.joinBtnText}>Ingresar a un proyecto</Text>
      </TouchableOpacity>

      {/* Histórico global */}
      <TouchableOpacity
        style={styles.globalHistBtn}
        onPress={() => navigation.navigate('Historical', {})}
      >
        <Text style={styles.globalHistBtnText}>Ver Historico General</Text>
      </TouchableOpacity>

      {/* FAB crear proyecto */}
      {isJefe && (
        <TouchableOpacity style={styles.fab} onPress={() => setShowCreate(true)}>
          <Text style={styles.fabText}>+</Text>
        </TouchableOpacity>
      )}

      {/* Modal nuevo proyecto */}
      <Modal visible={showCreate} transparent animationType="slide">
        <View style={styles.overlay}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>NUEVO PROYECTO</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Nombre del proyecto"
              placeholderTextColor={Colors.textMuted}
              value={newName}
              onChangeText={setNewName}
              autoFocus
              returnKeyType="next"
            />
            <TextInput
              style={styles.modalInput}
              placeholder="Contraseña del proyecto"
              placeholderTextColor={Colors.textMuted}
              value={newPassword}
              onChangeText={setNewPassword}
              secureTextEntry
              returnKeyType="done"
              onSubmitEditing={createProject}
            />
            <Text style={styles.modalHint}>
              Comparte esta contraseña con tu equipo para que puedan acceder al proyecto.
            </Text>
            <View style={styles.modalBtns}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => { setShowCreate(false); setNewName(''); setNewPassword(''); }}
              >
                <Text style={styles.modalCancelText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalConfirmBtn, (!newName.trim() || !newPassword.trim()) && styles.modalBtnDisabled]}
                onPress={createProject}
                disabled={!newName.trim() || !newPassword.trim()}
              >
                <Text style={styles.modalConfirmText}>Crear</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Modal propiedades de proyecto */}
      <Modal visible={!!selectedProject} transparent animationType="fade" onRequestClose={() => setSelectedProject(null)}>
        <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={() => setSelectedProject(null)}>
          <View style={[styles.modal, { gap: 0 }]}>
            <Text style={[styles.modalTitle, { marginBottom: 16 }]}>{selectedProject?.name}</Text>
            <TouchableOpacity
              style={styles.propDeleteBtn}
              onPress={() => selectedProject && handleDeleteFromView(selectedProject)}
            >
              <Text style={styles.propDeleteText}>Eliminar proyecto de mi vista</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.propCancelBtn} onPress={() => setSelectedProject(null)}>
              <Text style={styles.propCancelText}>Cancelar</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Modal ingresar a proyecto */}
      <Modal visible={showJoin} transparent animationType="slide">
        <View style={styles.overlay}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>INGRESAR A PROYECTO</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Nombre del proyecto"
              placeholderTextColor={Colors.textMuted}
              value={joinName}
              onChangeText={setJoinName}
              autoFocus
              returnKeyType="next"
            />
            <TextInput
              style={styles.modalInput}
              placeholder="Contraseña del proyecto"
              placeholderTextColor={Colors.textMuted}
              value={joinPassword}
              onChangeText={setJoinPassword}
              secureTextEntry
              returnKeyType="done"
              onSubmitEditing={handleJoin}
            />
            <View style={styles.modalBtns}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => { setShowJoin(false); setJoinName(''); setJoinPassword(''); }}
              >
                <Text style={styles.modalCancelText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalConfirmBtn, (!joinName.trim() || !joinPassword.trim() || joinLoading) && styles.modalBtnDisabled]}
                onPress={handleJoin}
                disabled={!joinName.trim() || !joinPassword.trim() || joinLoading}
              >
                <Text style={styles.modalConfirmText}>{joinLoading ? 'Verificando...' : 'Ingresar'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function roleLabel(role?: string) {
  if (role === 'CREATOR') return 'Creador';
  if (role === 'RESIDENT') return 'Jefe de Obra';
  if (role === 'SUPERVISOR') return 'Supervisor QC';
  return 'Visualizador';
}

function roleColor(role?: string) {
  if (role === 'CREATOR') return '#5b2d8e';
  if (role === 'RESIDENT') return Colors.primary;
  if (role === 'SUPERVISOR') return Colors.secondary;
  return Colors.textMuted;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.surface },

  header: {
    backgroundColor: Colors.navy,
    paddingHorizontal: 20,
    paddingTop: 52,
    paddingBottom: 20,
    gap: 12,
  },
  headerTop: {
    flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between',
  },
  userInfo: { gap: 6 },
  userName: { fontSize: 16, fontWeight: '700', color: Colors.white },
  roleBadge: {
    borderRadius: 4, paddingHorizontal: 8, paddingVertical: 3, alignSelf: 'flex-start',
  },
  roleBadgeText: { color: Colors.white, fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },
  headerActions: { flexDirection: 'row', gap: 6, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' },
  notifBadge: {
    backgroundColor: Colors.danger, borderRadius: 10,
    paddingHorizontal: 8, paddingVertical: 4,
  },
  notifBadgeText: { color: Colors.white, fontSize: 10, fontWeight: '700' },
  headerBtn: {
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: Radius.sm,
    borderWidth: 1, borderColor: Colors.secondary,
  },
  headerBtnText: { color: Colors.light, fontSize: 11, fontWeight: '600' },
  logoutBtn: {
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: Radius.sm,
    backgroundColor: 'rgba(192,57,43,0.2)', borderWidth: 1, borderColor: '#c0392b',
  },
  logoutBtnText: { color: '#e57373', fontSize: 11, fontWeight: '600' },
  headerTitle: {
    fontSize: 22, fontWeight: '900', color: Colors.white, letterSpacing: 1,
  },

  list: { padding: 16, paddingBottom: 210, gap: 12 },

  emptyContainer: { alignItems: 'center', paddingTop: 64, gap: 8 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: Colors.textSecondary },
  emptyDesc: { fontSize: 13, color: Colors.textMuted, textAlign: 'center', maxWidth: 280 },

  card: {
    backgroundColor: Colors.white, borderRadius: Radius.lg,
    overflow: 'hidden', ...Shadow.card,
    borderTopWidth: 3, borderTopColor: Colors.primary,
  },
  cardHeader: {
    flexDirection: 'row', alignItems: 'center',
    padding: 16, paddingBottom: 10, gap: 8,
  },
  cardHeaderLeft: { flex: 1, gap: 6 },
  cardName: { fontSize: 16, fontWeight: '700', color: Colors.navy },
  statusChip: {
    alignSelf: 'flex-start', borderRadius: 3,
    paddingHorizontal: 6, paddingVertical: 2,
  },
  statusChipText: { color: Colors.white, fontSize: 9, fontWeight: '700', letterSpacing: 0.8 },
  chevron: { fontSize: 24, color: Colors.light, fontWeight: '300' },

  actionsRow: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 6,
    paddingHorizontal: 12, paddingBottom: 12,
    borderTopWidth: 1, borderTopColor: Colors.divider,
    paddingTop: 10,
  },
  actionChip: {
    borderRadius: Radius.sm, paddingHorizontal: 10, paddingVertical: 6,
    borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surface,
  },
  actionChipAccent: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  actionChipSync: { borderColor: Colors.secondary, backgroundColor: Colors.white },
  actionChipDisabled: { opacity: 0.5 },
  actionChipText: { fontSize: 11, fontWeight: '600', color: Colors.textSecondary },
  actionChipTextLight: { color: Colors.white },
  actionChipTextSync: { color: Colors.secondary },

  joinBtn: {
    position: 'absolute', bottom: 160, left: 16, right: 16,
    backgroundColor: Colors.navy, borderRadius: Radius.md,
    padding: 13, alignItems: 'center', ...Shadow.subtle,
    borderWidth: 1, borderColor: Colors.secondary,
  },
  joinBtnText: { color: Colors.light, fontWeight: '700', fontSize: 13, letterSpacing: 0.5 },

  globalHistBtn: {
    position: 'absolute', bottom: 108, left: 16, right: 16,
    backgroundColor: Colors.secondary, borderRadius: Radius.md,
    padding: 13, alignItems: 'center', ...Shadow.subtle,
  },
  globalHistBtnText: { color: Colors.white, fontWeight: '700', fontSize: 13, letterSpacing: 0.5 },

  fab: {
    position: 'absolute', bottom: 32, right: 24,
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center',
    ...Shadow.card,
  },
  fabText: { color: Colors.white, fontSize: 30, lineHeight: 34 },

  overlay: { flex: 1, backgroundColor: 'rgba(14,33,61,0.5)', justifyContent: 'flex-end' },
  modal: {
    backgroundColor: Colors.white, borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl, padding: 28, gap: 16,
  },
  modalTitle: {
    fontSize: 12, fontWeight: '700', color: Colors.primary, letterSpacing: 2,
  },
  modalInput: {
    backgroundColor: Colors.surface, borderRadius: Radius.md, padding: 14,
    fontSize: 16, borderWidth: 1, borderColor: Colors.border, color: Colors.textPrimary,
  },
  modalHint: { fontSize: 12, color: Colors.textMuted, fontStyle: 'italic' },
  modalBtns: { flexDirection: 'row', gap: 12, justifyContent: 'flex-end' },
  modalCancelBtn: { padding: 12 },
  modalCancelText: { color: Colors.textSecondary, fontWeight: '600' },
  modalConfirmBtn: {
    backgroundColor: Colors.primary, borderRadius: Radius.md,
    paddingHorizontal: 28, paddingVertical: 12,
  },
  modalBtnDisabled: { backgroundColor: Colors.light },
  modalConfirmText: { color: Colors.white, fontWeight: '700' },

  propDeleteBtn: {
    padding: 16, borderRadius: Radius.md, backgroundColor: '#fdecea',
    alignItems: 'center', marginBottom: 8,
  },
  propDeleteText: { color: Colors.danger, fontWeight: '700', fontSize: 14 },
  propCancelBtn: { padding: 14, alignItems: 'center' },
  propCancelText: { color: Colors.textSecondary, fontWeight: '600', fontSize: 14 },
});
