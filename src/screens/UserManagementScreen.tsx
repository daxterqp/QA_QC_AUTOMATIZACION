import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  Alert, ActivityIndicator, Modal, TextInput, ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AppHeader from '@components/AppHeader';
import { Colors, Radius, Shadow } from '../theme/colors';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@navigation/types';
import { database, usersCollection } from '@db/index';
import { useAuth } from '@context/AuthContext';
import { useNetwork } from '@context/NetworkContext';
import { importUsersFromExcel, bulkCreateUsersViaEdgeFunction, UserImportError } from '@services/UserExcelImporter';
import { supabase } from '@config/supabase';
import { loadAccessSnapshot, grantAccess, revokeAccess } from '@services/UserAccessService';
import type User from '@models/User';
import { useI18n, tx } from '@i18n/index';

type Props = NativeStackScreenProps<RootStackParamList, 'UserManagement'>;
type Role = 'CREATOR' | 'RESIDENT' | 'SUPERVISOR' | 'OPERATOR';

const ROLE_LABELS: Record<string, { label: string; color: string }> = {
  CREATOR:    { label: tx('usersMgmt.role.creator'),    color: '#5b2d8e' },
  RESIDENT:   { label: tx('usersMgmt.role.resident'),       color: Colors.primary },
  SUPERVISOR: { label: tx('usersMgmt.role.supervisor'), color: Colors.secondary },
  OPERATOR:   { label: tx('usersMgmt.role.operator'),    color: Colors.warning },
};
// El Creador puede asignar estos roles (no puede crear otros Creadores desde aquí).
const ASSIGNABLE_ROLES: Role[] = ['RESIDENT', 'SUPERVISOR', 'OPERATOR'];

export default function UserManagementScreen({ navigation }: Props) {
  const { t } = useI18n();
  const { currentUser } = useAuth();
  const { isOnline } = useNetwork();
  const isCreator = currentUser?.role === 'CREATOR';
  const [users, setUsers] = useState<User[]>([]);
  const [importing, setImporting] = useState(false);

  // Alta manual — v47 (RLS): el alta ahora exige email + contraseña (login por email)
  // y se realiza vía Edge Function `admin-users` (INSERT directo a users está denegado).
  const [showAdd, setShowAdd] = useState(false);
  const [fName, setFName] = useState('');
  const [fApellido, setFApellido] = useState('');
  const [fEmail, setFEmail] = useState('');
  const [fPassword, setFPassword] = useState('');
  const [fRole, setFRole] = useState<Role>('OPERATOR');
  const [fProjectIds, setFProjectIds] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  // Editar rol
  const [roleEditUser, setRoleEditUser] = useState<User | null>(null);

  // v44 — Accesos usuario↔proyecto (Supabase = fuente de verdad).
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);
  const [accessIdsByUser, setAccessIdsByUser] = useState<Record<string, Set<string>>>({});
  const projName = React.useMemo(() => Object.fromEntries(projects.map(p => [p.id, p.name])), [projects]);
  const loadAccess = useCallback(async () => {
    try {
      const snap = await loadAccessSnapshot();
      setProjects(snap.projects);
      setAccessIdsByUser(snap.byUser);
    } catch { /* offline → tarjetas sin proyectos */ }
  }, []);

  // v47 (RLS) — Las altas/bajas/edición ahora las hace la Edge Function `admin-users`
  // sobre la nube (INSERT/DELETE directo a `users` está denegado). Tras cada operación
  // OK refrescamos la lista local desde Supabase (crea los nuevos, actualiza rol/is_active)
  // para reflejar el cambio en la pantalla (la lista se observa desde WatermelonDB).
  const refreshUsersFromCloud = useCallback(async () => {
    const { data: remoteUsers, error } = await supabase.from('users').select('*');
    if (error || !remoteUsers) return;
    const local = await usersCollection.query().fetch();
    const localById = new Map<string, User>(local.map((u) => [u.id, u]));
    const rows = remoteUsers as any[];
    await database.write(async () => {
      // Crear los faltantes (nuevos usuarios dados de alta por la Edge Function).
      const toCreate = rows.filter((r) => !localById.has(r.id));
      if (toCreate.length > 0) {
        await database.batch(
          ...toCreate.map((r) => usersCollection.prepareCreate((u: any) => {
            u._raw.id = r.id;
            Object.assign(u._raw, r);
            u._raw._status = 'synced';
            u._raw._changed = '';
          })),
        );
      }
      // Actualizar rol / estado de los existentes (cambio de rol, soft-delete).
      for (const r of rows) {
        const existing = localById.get(r.id);
        if (!existing) continue;
        const remoteActive = r.is_active !== false;
        const localActive = (existing as any).isActive !== false;
        if (existing.role !== r.role || localActive !== remoteActive) {
          await existing.update((u: any) => { u.role = r.role; u.isActive = remoteActive; });
        }
      }
    });
  }, []);

  // v44 — Modales de gestión de accesos (asignar / quitar).
  const [showAssign, setShowAssign] = useState(false);
  const [showRemove, setShowRemove] = useState(false);
  const [selUsers, setSelUsers] = useState<Set<string>>(new Set());
  const [selProjects, setSelProjects] = useState<Set<string>>(new Set());
  const [removeProjectId, setRemoveProjectId] = useState<string | null>(null);
  const [accessBusy, setAccessBusy] = useState(false);
  const toggleSet = (setFn: React.Dispatch<React.SetStateAction<Set<string>>>, id: string) =>
    setFn(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const activeUsers = users.filter(u => (u as any).isActive !== false);

  const doAssign = async () => {
    if (selUsers.size === 0 || selProjects.size === 0) { Alert.alert(t('usersMgmt.alert.selectTitle'), t('usersMgmt.alert.selectUserProject')); return; }
    setAccessBusy(true);
    try {
      const n = await grantAccess([...selUsers], [...selProjects]);
      await loadAccess();
      setShowAssign(false); setSelUsers(new Set()); setSelProjects(new Set());
      Alert.alert(t('usersMgmt.alert.done'), n > 0 ? t('usersMgmt.alert.grantedSome', { count: n }) : t('usersMgmt.alert.grantedNone'));
    } catch (e: any) { Alert.alert(t('usersMgmt.alert.error'), e?.message ?? t('usersMgmt.alert.grantFailed')); }
    finally { setAccessBusy(false); }
  };

  const doRemove = async () => {
    if (!removeProjectId || selUsers.size === 0) { Alert.alert(t('usersMgmt.alert.selectTitle'), t('usersMgmt.alert.selectProjectUser')); return; }
    const pname = projName[removeProjectId] ?? t('usersMgmt.alert.theProject');
    Alert.alert(t('usersMgmt.alert.removeAccessTitle'), t('usersMgmt.alert.removeAccessMessage', { count: selUsers.size, project: pname }), [
      { text: t('usersMgmt.alert.cancel'), style: 'cancel' },
      { text: t('usersMgmt.alert.remove'), style: 'destructive', onPress: async () => {
        setAccessBusy(true);
        try {
          await revokeAccess([...selUsers], removeProjectId);
          await loadAccess();
          setShowRemove(false); setSelUsers(new Set()); setRemoveProjectId(null);
          Alert.alert(t('usersMgmt.alert.done'), t('usersMgmt.alert.accessRevoked'));
        } catch (e: any) { Alert.alert(t('usersMgmt.alert.error'), e?.message ?? t('usersMgmt.alert.removeFailed')); }
        finally { setAccessBusy(false); }
      } },
    ]);
  };

  useEffect(() => {
    const sub = usersCollection.query().observe().subscribe(setUsers);
    return () => sub.unsubscribe();
  }, []);
  useEffect(() => { loadAccess(); }, [loadAccess]);

  const handleImport = async () => {
    if (!isOnline) { Alert.alert(t('usersMgmt.alert.offlineTitle'), t('usersMgmt.alert.offlineImport')); return; }
    setImporting(true);
    try {
      const imported = await importUsersFromExcel();
      // Proyectos por nombre (case-insensitive) para mapear la columna "Proyectos".
      const snap = await loadAccessSnapshot();
      const projByName: Record<string, string> = {};
      for (const p of snap.projects) projByName[p.name.trim().toLowerCase()] = p.id;
      const unmatched = new Set<string>();
      const resolveProjectIds = (names: string[] | undefined): string[] => {
        if (!names) return [];
        return names
          .map(n => { const id = projByName[n.trim().toLowerCase()]; if (!id) unmatched.add(n); return id; })
          .filter(Boolean) as string[];
      };

      // v47 (RLS): el alta masiva va por la Edge Function `admin-users` (INSERT directo
      // a users denegado). Acumula errores por fila sin romper todo el import.
      const hadProjectsCol = imported.some(u => u.projects !== undefined);
      const { created, errors } = await bulkCreateUsersViaEdgeFunction(imported, resolveProjectIds);

      // Reflejar los nuevos usuarios/accesos en la pantalla.
      await refreshUsersFromCloud().catch(() => {});
      await loadAccess();

      let msg = t('usersMgmt.alert.usersProcessed', { count: created });
      if (hadProjectsCol) msg += t('usersMgmt.alert.projectAccessSynced');
      if (unmatched.size > 0) msg += t('usersMgmt.alert.unmatchedProjects', { projects: [...unmatched].join(', ') });
      if (errors.length > 0) msg += t('usersMgmt.alert.importErrors', { count: errors.length, details: errors.join('\n') });
      Alert.alert(t('usersMgmt.alert.importDoneTitle'), msg);
    } catch (err) {
      Alert.alert(t('usersMgmt.alert.error'), err instanceof UserImportError ? err.message : t('usersMgmt.alert.importUnexpected'));
    } finally { setImporting(false); }
  };

  const handleAddUser = async () => {
    if (saving) return;
    const name = fName.trim();
    const email = fEmail.trim();
    const password = fPassword;
    if (!name) { Alert.alert(t('usersMgmt.alert.missingNameTitle'), t('usersMgmt.alert.missingNameMessage')); return; }
    if (!email || !password) { Alert.alert(t('usersMgmt.alert.missingEmailTitle'), t('usersMgmt.alert.missingEmailMessage')); return; }
    setSaving(true);
    try {
      // v47 (RLS): el alta se hace por la Edge Function `admin-users` (crea la cuenta Auth,
      // la fila en `users` y los accesos). El SDK adjunta el JWT del usuario logueado.
      const { error } = await supabase.functions.invoke('admin-users', {
        body: {
          action: 'create',
          email,
          password,
          name,
          apellido: fApellido.trim(),
          role: fRole,
          projectIds: [...fProjectIds],
        },
      });
      if (error) {
        Alert.alert(t('usersMgmt.alert.error'), error.message ?? t('usersMgmt.alert.createUserFailed'));
        return;
      }
      await refreshUsersFromCloud().catch(() => {});
      await loadAccess();
      setShowAdd(false);
      setFName(''); setFApellido(''); setFEmail(''); setFPassword(''); setFRole('OPERATOR'); setFProjectIds(new Set());
      Alert.alert(t('usersMgmt.alert.userCreatedTitle'), t('usersMgmt.alert.userCreatedMessage', { name }));
    } catch (e: any) {
      Alert.alert(t('usersMgmt.alert.error'), e?.message ?? t('usersMgmt.alert.createUserFailed'));
    } finally { setSaving(false); }
  };

  const handleChangeRole = async (user: User, role: Role) => {
    setRoleEditUser(null);
    if (user.role === role) return;
    // v47 (RLS): el cambio de rol se hace por la Edge Function `admin-users`.
    const { error } = await supabase.functions.invoke('admin-users', {
      body: { action: 'update', userId: user.id, role },
    });
    if (error) { Alert.alert(t('usersMgmt.alert.error'), error.message ?? t('usersMgmt.alert.opFailed')); return; }
    await refreshUsersFromCloud().catch(() => {});
  };

  // v43 — Soft-delete: NO se borra de la base (conserva firmas/aprobaciones), solo
  // se marca inactivo (pierde acceso). Sigue visible, etiquetado "inactivo".
  // v47 (RLS): activar/desactivar se hace por la Edge Function `admin-users`
  // (`delete` = soft-delete is_active=false; `update` isActive=true para reactivar).
  const handleToggleActive = (user: User) => {
    if (user.id === currentUser?.id) { Alert.alert(t('usersMgmt.alert.notAllowedTitle'), t('usersMgmt.alert.cannotDeactivateSelf')); return; }
    const isActive = (user as any).isActive !== false;
    Alert.alert(
      isActive ? t('usersMgmt.alert.deactivateTitle') : t('usersMgmt.alert.reactivateTitle'),
      isActive
        ? t('usersMgmt.alert.deactivateMessage', { name: user.name })
        : t('usersMgmt.alert.reactivateMessage', { name: user.name }),
      [
        { text: t('usersMgmt.alert.cancel'), style: 'cancel' },
        {
          text: isActive ? t('usersMgmt.deactivate') : t('usersMgmt.reactivate'), style: isActive ? 'destructive' : 'default',
          onPress: async () => {
            const { error } = isActive
              ? await supabase.functions.invoke('admin-users', { body: { action: 'delete', userId: user.id } })
              : await supabase.functions.invoke('admin-users', { body: { action: 'update', userId: user.id, isActive: true } });
            if (error) { Alert.alert(t('usersMgmt.alert.error'), error.message ?? t('usersMgmt.alert.opFailed')); return; }
            await refreshUsersFromCloud().catch(() => {});
          },
        },
      ],
    );
  };

  const handleResetPassword = (user: User) => {
    Alert.alert(t('usersMgmt.alert.resetPasswordTitle'), t('usersMgmt.alert.resetPasswordMessage', { name: user.name }), [
      { text: t('usersMgmt.alert.cancel'), style: 'cancel' },
      {
        text: t('usersMgmt.alert.resetConfirm'),
        onPress: async () => {
          // v47 (RLS): el reset de contraseña pasa por la Edge Function `admin-users`
          // (no se puede escribir `users` directo). Temporal = el nombre del usuario.
          const { error } = await supabase.functions.invoke('admin-users', {
            body: { action: 'update', userId: user.id, password: user.name },
          });
          if (error) { Alert.alert(t('usersMgmt.alert.error'), error.message ?? t('usersMgmt.alert.opFailed')); return; }
          Alert.alert(t('usersMgmt.alert.done'), t('usersMgmt.alert.passwordReset'));
        },
      },
    ]);
  };

  return (
    <View style={styles.container}>
      <AppHeader title={t('usersMgmt.title')} onBack={() => navigation.goBack()} />

      {isCreator && (
        <View style={styles.importBar}>
          {/* v44 — Botón principal "Añadir usuario" (reemplaza el + del encabezado), encima de Importar. */}
          <TouchableOpacity style={styles.addBtn} onPress={() => setShowAdd(true)} activeOpacity={0.85}>
            <Ionicons name="person-add-outline" size={18} color={Colors.white} />
            <Text style={styles.addBtnText}>{t('usersMgmt.addUser')}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.importBtn, importing && styles.btnDisabled]} onPress={handleImport} disabled={importing} activeOpacity={0.85}>
            {importing ? <ActivityIndicator color="#fff" size="small" /> : <><Ionicons name="document-attach-outline" size={16} color={Colors.white} /><Text style={styles.importBtnText}>{t('usersMgmt.importFromExcel')}</Text></>}
          </TouchableOpacity>
          <Text style={styles.importHint}>{t('usersMgmt.importHint')}</Text>

          {/* v44 — Gestión de accesos en lote */}
          <View style={styles.accessRow}>
            <TouchableOpacity style={styles.accessBtn} onPress={() => { setSelUsers(new Set()); setSelProjects(new Set()); setShowAssign(true); }} activeOpacity={0.85}>
              <Ionicons name="person-add-outline" size={15} color={Colors.primary} />
              <Text style={styles.accessBtnText}>{t('usersMgmt.enterProject')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.accessBtn} onPress={() => { setSelUsers(new Set()); setRemoveProjectId(null); setShowRemove(true); }} activeOpacity={0.85}>
              <Ionicons name="person-remove-outline" size={15} color={Colors.danger} />
              <Text style={[styles.accessBtnText, { color: Colors.danger }]}>{t('usersMgmt.removeAccess')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      <FlatList
        data={users}
        keyExtractor={(u) => u.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={<Text style={styles.empty}>{t('usersMgmt.empty')}</Text>}
        renderItem={({ item }) => {
          const roleInfo = ROLE_LABELS[item.role] ?? { label: item.role, color: '#666' };
          const isMe = item.id === currentUser?.id;
          const inactive = (item as any).isActive === false;
          const projIds = accessIdsByUser[item.id];
          const projs = projIds ? [...projIds].map(id => projName[id]).filter(Boolean) as string[] : [];
          const isCreatorUser = item.role === 'CREATOR';
          return (
            <View style={[styles.card, isMe && styles.cardMe, inactive && styles.cardInactive]}>
              <View style={styles.cardTopRow}>
                <TouchableOpacity
                  style={[styles.roleTag, { backgroundColor: roleInfo.color }]}
                  disabled={!isCreator || item.role === 'CREATOR' || isMe}
                  onPress={() => setRoleEditUser(item)}
                >
                  <Text style={styles.roleTagText}>{roleInfo.label}</Text>
                  {isCreator && item.role !== 'CREATOR' && !isMe ? <Ionicons name="chevron-down" size={10} color="#fff" /> : null}
                </TouchableOpacity>
                <View style={styles.cardInfo}>
                  <Text style={[styles.userName, inactive && styles.userNameInactive]}>{item.name} {item.apellido}</Text>
                  {isMe ? <Text style={styles.meTag}>{t('usersMgmt.you')}</Text> : inactive ? <Text style={styles.inactiveTag}>{t('usersMgmt.inactive')}</Text> : null}
                </View>
                {isCreator && (
                  <View style={styles.cardActions}>
                    <TouchableOpacity style={styles.actionBtn} onPress={() => handleResetPassword(item)}>
                      <Text style={styles.actionText}>{t('usersMgmt.reset')}</Text>
                    </TouchableOpacity>
                    {!isMe && (
                      <TouchableOpacity style={[styles.actionBtn, inactive ? styles.reactivateBtn : styles.deleteBtn]} onPress={() => handleToggleActive(item)}>
                        <Text style={[styles.actionText, { color: inactive ? Colors.success : Colors.danger }]}>{inactive ? t('usersMgmt.reactivate') : t('usersMgmt.deactivate')}</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                )}
              </View>
              {/* v44 — Proyectos asignados */}
              <View style={styles.projectsRow}>
                <Ionicons name="folder-outline" size={13} color={Colors.textMuted} />
                {isCreatorUser ? (
                  <Text style={styles.allProjects}>{t('usersMgmt.allProjects')}</Text>
                ) : projs.length === 0 ? (
                  <Text style={styles.noProjects}>{t('usersMgmt.noProjectsAssigned')}</Text>
                ) : (
                  <View style={styles.chips}>
                    {projs.slice(0, 8).map((n, i) => (
                      <View key={i} style={styles.projChip}><Text style={styles.projChipText} numberOfLines={1}>{n}</Text></View>
                    ))}
                    {projs.length > 8 ? <Text style={styles.moreProjects}>+{projs.length - 8}</Text> : null}
                  </View>
                )}
              </View>
            </View>
          );
        }}
      />

      {/* Modal: alta manual */}
      <Modal visible={showAdd} transparent animationType="fade" onRequestClose={() => setShowAdd(false)}>
        <View style={styles.modalBg}>
          <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={() => setShowAdd(false)} />
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{t('usersMgmt.addModal.title')}</Text>
            <ScrollView style={{ maxHeight: 420 }} keyboardShouldPersistTaps="handled">
              <Text style={styles.fieldLabel}>{t('usersMgmt.field.name')}</Text>
              <TextInput style={styles.input} value={fName} onChangeText={setFName} placeholder={t('usersMgmt.field.name')} placeholderTextColor="#bbb" autoCapitalize="words" />
              <Text style={styles.fieldLabel}>{t('usersMgmt.field.lastName')}</Text>
              <TextInput style={styles.input} value={fApellido} onChangeText={setFApellido} placeholder={t('usersMgmt.field.lastName')} placeholderTextColor="#bbb" autoCapitalize="words" />
              {/* v47 (RLS) — email + contraseña obligatorios (login por email vía Edge Function). */}
              <Text style={styles.fieldLabel}>{t('usersMgmt.field.email')}</Text>
              <TextInput style={styles.input} value={fEmail} onChangeText={setFEmail} placeholder={t('usersMgmt.field.email')} placeholderTextColor="#bbb" autoCapitalize="none" keyboardType="email-address" autoComplete="email" />
              <Text style={styles.fieldLabel}>{t('usersMgmt.field.password')}</Text>
              <TextInput style={styles.input} value={fPassword} onChangeText={setFPassword} placeholder={t('usersMgmt.field.password')} placeholderTextColor="#bbb" secureTextEntry autoCapitalize="none" />
              <Text style={styles.fieldLabel}>{t('usersMgmt.field.role')}</Text>
              <View style={styles.roleRow}>
                {ASSIGNABLE_ROLES.map(r => (
                  <TouchableOpacity key={r} style={[styles.roleChip, fRole === r && { backgroundColor: ROLE_LABELS[r].color, borderColor: ROLE_LABELS[r].color }]} onPress={() => setFRole(r)}>
                    <Text style={[styles.roleChipText, fRole === r && { color: '#fff' }]}>{ROLE_LABELS[r].label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              {/* v47 — selección opcional de proyectos (se pasa como projectIds a la Edge Function). */}
              {projects.length > 0 && (
                <>
                  <Text style={styles.fieldLabel}>{t('usersMgmt.assignModal.projectsLabel', { count: fProjectIds.size })}</Text>
                  <View style={styles.pickList}>
                    <ScrollView nestedScrollEnabled keyboardShouldPersistTaps="handled">
                      {projects.map(p => (
                        <TouchableOpacity key={p.id} style={styles.pickRow} onPress={() => toggleSet(setFProjectIds, p.id)}>
                          <Ionicons name={fProjectIds.has(p.id) ? 'checkbox' : 'square-outline'} size={20} color={fProjectIds.has(p.id) ? Colors.primary : Colors.textMuted} />
                          <Text style={styles.pickText} numberOfLines={1}>{p.name}</Text>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  </View>
                </>
              )}
              <Text style={styles.hint}>{t('usersMgmt.addModal.passwordHint')}</Text>
            </ScrollView>
            <TouchableOpacity style={[styles.saveBtn, saving && { opacity: 0.5 }]} onPress={handleAddUser} disabled={saving}>
              <Text style={styles.saveBtnText}>{saving ? t('usersMgmt.creating') : t('usersMgmt.createUser')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Modal: editar rol */}
      <Modal visible={!!roleEditUser} transparent animationType="fade" onRequestClose={() => setRoleEditUser(null)}>
        <View style={styles.modalBg}>
          <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={() => setRoleEditUser(null)} />
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{t('usersMgmt.roleModal.title', { name: roleEditUser?.name ?? '' })}</Text>
            <ScrollView style={{ maxHeight: 260 }}>
              {ASSIGNABLE_ROLES.map(r => (
                <TouchableOpacity key={r} style={styles.optionRow} onPress={() => roleEditUser && handleChangeRole(roleEditUser, r)}>
                  <View style={[styles.roleDot, { backgroundColor: ROLE_LABELS[r].color }]} />
                  <Text style={styles.optionText}>{ROLE_LABELS[r].label}</Text>
                  {roleEditUser?.role === r ? <Ionicons name="checkmark" size={18} color={Colors.primary} /> : null}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Modal: Ingresar usuarios a proyecto (multi-usuario → multi-proyecto) */}
      <Modal visible={showAssign} transparent animationType="fade" onRequestClose={() => setShowAssign(false)}>
        <View style={styles.modalBg}>
          <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={() => setShowAssign(false)} />
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{t('usersMgmt.assignModal.title')}</Text>
            <Text style={styles.fieldLabel}>{t('usersMgmt.assignModal.usersLabel', { count: selUsers.size })}</Text>
            <ScrollView style={styles.pickList}>
              {activeUsers.map(u => (
                <TouchableOpacity key={u.id} style={styles.pickRow} onPress={() => toggleSet(setSelUsers, u.id)}>
                  <Ionicons name={selUsers.has(u.id) ? 'checkbox' : 'square-outline'} size={20} color={selUsers.has(u.id) ? Colors.primary : Colors.textMuted} />
                  <Text style={styles.pickText} numberOfLines={1}>{u.name} {u.apellido}</Text>
                  <Text style={styles.pickRole}>{(ROLE_LABELS[u.role]?.label ?? u.role)}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <Text style={styles.fieldLabel}>{t('usersMgmt.assignModal.projectsLabel', { count: selProjects.size })}</Text>
            <ScrollView style={styles.pickList}>
              {projects.map(p => (
                <TouchableOpacity key={p.id} style={styles.pickRow} onPress={() => toggleSet(setSelProjects, p.id)}>
                  <Ionicons name={selProjects.has(p.id) ? 'checkbox' : 'square-outline'} size={20} color={selProjects.has(p.id) ? Colors.primary : Colors.textMuted} />
                  <Text style={styles.pickText} numberOfLines={1}>{p.name}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TouchableOpacity style={[styles.saveBtn, accessBusy && { opacity: 0.5 }]} onPress={doAssign} disabled={accessBusy}>
              <Text style={styles.saveBtnText}>{accessBusy ? t('usersMgmt.assigning') : t('usersMgmt.assignAccess', { users: selUsers.size, projects: selProjects.size })}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Modal: Quitar accesos (1 proyecto → multi-usuario) */}
      <Modal visible={showRemove} transparent animationType="fade" onRequestClose={() => setShowRemove(false)}>
        <View style={styles.modalBg}>
          <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={() => setShowRemove(false)} />
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{t('usersMgmt.removeModal.title')}</Text>
            <Text style={styles.fieldLabel}>{t('usersMgmt.removeModal.projectLabel')}</Text>
            <ScrollView style={styles.pickList}>
              {projects.map(p => (
                <TouchableOpacity key={p.id} style={styles.pickRow} onPress={() => setRemoveProjectId(p.id)}>
                  <Ionicons name={removeProjectId === p.id ? 'radio-button-on' : 'radio-button-off'} size={20} color={removeProjectId === p.id ? Colors.primary : Colors.textMuted} />
                  <Text style={styles.pickText} numberOfLines={1}>{p.name}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <Text style={styles.fieldLabel}>{t('usersMgmt.removeModal.usersLabel', { count: selUsers.size })}</Text>
            <ScrollView style={styles.pickList}>
              {users.filter(u => removeProjectId ? accessIdsByUser[u.id]?.has(removeProjectId) : false).map(u => (
                <TouchableOpacity key={u.id} style={styles.pickRow} onPress={() => toggleSet(setSelUsers, u.id)}>
                  <Ionicons name={selUsers.has(u.id) ? 'checkbox' : 'square-outline'} size={20} color={selUsers.has(u.id) ? Colors.danger : Colors.textMuted} />
                  <Text style={styles.pickText} numberOfLines={1}>{u.name} {u.apellido}</Text>
                </TouchableOpacity>
              ))}
              {removeProjectId && users.filter(u => accessIdsByUser[u.id]?.has(removeProjectId)).length === 0
                ? <Text style={styles.pickEmpty}>{t('usersMgmt.removeModal.noAccess')}</Text> : null}
              {!removeProjectId ? <Text style={styles.pickEmpty}>{t('usersMgmt.removeModal.pickProjectFirst')}</Text> : null}
            </ScrollView>
            <TouchableOpacity style={[styles.removeBtn, accessBusy && { opacity: 0.5 }]} onPress={doRemove} disabled={accessBusy}>
              <Text style={styles.saveBtnText}>{accessBusy ? t('usersMgmt.removing') : t('usersMgmt.removeAccess')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.surface },
  importBar: { padding: 16, gap: 8, backgroundColor: Colors.white, borderBottomWidth: 1, borderBottomColor: Colors.divider },
  addBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: Colors.primary, borderRadius: Radius.md, paddingVertical: 14 },
  addBtnText: { color: Colors.white, fontWeight: '800', fontSize: 15 },
  importBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, backgroundColor: Colors.secondary, borderRadius: Radius.md, paddingVertical: 13 },
  btnDisabled: { backgroundColor: Colors.light },
  importBtnText: { color: Colors.white, fontWeight: '700', fontSize: 13, letterSpacing: 0.5 },
  importHint: { fontSize: 11, color: Colors.textMuted, textAlign: 'center' },
  accessRow: { flexDirection: 'row', gap: 8, marginTop: 4 },
  accessBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 11, borderRadius: Radius.md, borderWidth: 1.5, borderColor: Colors.border, backgroundColor: Colors.white },
  accessBtnText: { fontSize: 12.5, fontWeight: '800', color: Colors.primary },
  pickList: { maxHeight: 150, borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.sm, marginTop: 2 },
  pickRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9, paddingHorizontal: 10, borderBottomWidth: 1, borderBottomColor: Colors.divider },
  pickText: { flex: 1, fontSize: 13.5, color: Colors.textPrimary, fontWeight: '600' },
  pickRole: { fontSize: 10, color: Colors.textMuted, fontWeight: '700' },
  pickEmpty: { fontSize: 12, color: Colors.textMuted, fontStyle: 'italic', padding: 12, textAlign: 'center' },
  removeBtn: { backgroundColor: Colors.danger, paddingVertical: 13, borderRadius: Radius.md, alignItems: 'center', marginTop: 10 },
  list: { padding: 16, gap: 10 },
  empty: { textAlign: 'center', color: Colors.textMuted, marginTop: 40 },
  card: { backgroundColor: Colors.white, borderRadius: Radius.lg, padding: 14, gap: 10, ...Shadow.subtle },
  cardTopRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  projectsRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, borderTopWidth: 1, borderTopColor: Colors.divider, paddingTop: 9 },
  chips: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 5 },
  projChip: { backgroundColor: Colors.divider, borderRadius: 5, paddingHorizontal: 8, paddingVertical: 3, maxWidth: 150 },
  projChipText: { fontSize: 11, color: Colors.textSecondary, fontWeight: '600' },
  noProjects: { flex: 1, fontSize: 12, color: Colors.textMuted, fontStyle: 'italic' },
  allProjects: { flex: 1, fontSize: 12, color: Colors.primary, fontWeight: '700' },
  moreProjects: { fontSize: 11, color: Colors.textMuted, fontWeight: '700', alignSelf: 'center' },
  cardMe: { borderWidth: 2, borderColor: Colors.primary },
  cardInactive: { opacity: 0.6 },
  roleTag: { flexDirection: 'row', alignItems: 'center', gap: 3, borderRadius: Radius.sm, paddingHorizontal: 8, paddingVertical: 4, minWidth: 80, justifyContent: 'center' },
  roleTagText: { color: Colors.white, fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },
  cardInfo: { flex: 1 },
  userName: { fontSize: 15, fontWeight: '600', color: Colors.navy },
  userNameInactive: { textDecorationLine: 'line-through', color: Colors.textMuted },
  meTag: { fontSize: 11, color: Colors.primary, fontWeight: '600', marginTop: 2 },
  inactiveTag: { fontSize: 11, color: Colors.danger, fontWeight: '700', marginTop: 2 },
  cardActions: { flexDirection: 'row', gap: 8 },
  actionBtn: { backgroundColor: Colors.surface, borderRadius: Radius.sm, paddingHorizontal: 10, paddingVertical: 8, borderWidth: 1, borderColor: Colors.border },
  deleteBtn: { backgroundColor: '#fef2f2', borderColor: Colors.danger },
  reactivateBtn: { backgroundColor: '#ecfdf5', borderColor: Colors.success },
  actionText: { fontSize: 11, color: Colors.textSecondary, fontWeight: '600' },
  modalBg: { flex: 1, backgroundColor: 'rgba(14,33,61,0.55)', justifyContent: 'center', padding: 16 },
  modalCard: { backgroundColor: Colors.white, borderRadius: Radius.lg, padding: 18, gap: 8 },
  modalTitle: { fontSize: 17, fontWeight: '800', color: Colors.navy, marginBottom: 6 },
  fieldLabel: { fontSize: 12, fontWeight: '700', color: Colors.textSecondary, marginTop: 4 },
  input: { borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.sm, paddingHorizontal: 10, paddingVertical: 10, fontSize: 14, color: Colors.textPrimary },
  roleRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  roleChip: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 16, borderWidth: 1, borderColor: Colors.border },
  roleChipText: { fontSize: 12, fontWeight: '700', color: Colors.textSecondary },
  hint: { fontSize: 11, color: Colors.textMuted, marginTop: 4 },
  saveBtn: { backgroundColor: Colors.success, paddingVertical: 13, borderRadius: Radius.md, alignItems: 'center', marginTop: 10 },
  saveBtnText: { color: Colors.white, fontWeight: '800', fontSize: 15 },
  optionRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: Colors.divider },
  roleDot: { width: 12, height: 12, borderRadius: 6 },
  optionText: { flex: 1, fontSize: 14, color: Colors.textPrimary },
});
