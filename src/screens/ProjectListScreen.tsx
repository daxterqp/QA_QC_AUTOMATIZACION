import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  TextInput, Modal, Alert, RefreshControl, Platform, StatusBar, Animated,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@navigation/types';
import {
  database, projectsCollection, annotationCommentsCollection,
  planAnnotationsCollection, userProjectAccessCollection,
  protocolsCollection, plansCollection,
} from '@db/index';
import { Q } from '@nozbe/watermelondb';
import { useAuth } from '@context/AuthContext';
import { DEFAULT_FEATURE_FLAGS } from '@utils/featureFlags';
import { Colors, Radius, Shadow } from '../theme/colors';
import { syncProjectFromS3 } from '@services/S3SyncService';
import { initProjectFolders } from '@services/S3Service';
import {
  findProjectInSupabase,
  pullProjectFromCloud,
  pushProjectToSupabase,
} from '@services/SupabaseSyncService';
import { supabase } from '@config/supabase';
import { useTour } from '@context/TourContext';
import { useTourStep, useTourStepWithLayout } from '@hooks/useTourStep';
import SideDrawer, { type SideDrawerItem } from '@components/SideDrawer';
import LanguagePickerModal from '@components/LanguagePickerModal';
import { useI18n, LANG_LABEL } from '@i18n/index';

type Props = NativeStackScreenProps<RootStackParamList, 'ProjectList'>;

/** Badge con efecto "respirando" (pulso rojo) */
function PulsingBadge({ count }: { count: number }) {
  const anim = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(anim, { toValue: 0.45, duration: 900, useNativeDriver: true }),
        Animated.timing(anim, { toValue: 1, duration: 900, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [anim]);
  return (
    <Animated.Text style={{ color: Colors.danger, fontWeight: '900', fontSize: 12, opacity: anim }}>
      {count}!
    </Animated.Text>
  );
}

/** Fila de proyecto tal como viene de Supabase */
type ProjectRow = { id: string; name: string; status: string };

export default function ProjectListScreen({ navigation }: Props) {
  const { currentUser, logout, isDemo } = useAuth();
  const insets = useSafeAreaInsets();
  const { startTour, startTourIfFirstTime, jumpToStep, isActive: tourActive, currentStep: tourStep, nextStep: tourNextStep } = useTour();

  // Tour refs
  const tourHelpRef = useTourStep('tour_help_button');
  const projectCardRef = useTourStep('project_card');
  const actionChipsRef = useTourStep('project_action_chips');
  const observacionesChipRef = useTourStep('project_observaciones_chip');
  const dosierChipRef = useTourStep('project_dosier_chip');
  // v29 — cargarChipRef y planosChipRef eliminados: esos botones se movieron
  // al menú interno del proyecto; el tour debe re-anclarse ahí cuando aplique.
  const { ref: bottomNavRef, onLayout: bottomNavLayout } = useTourStepWithLayout('bottom_nav');
  const { ref: joinBtnRef, onLayout: joinBtnLayout } = useTourStepWithLayout('nav_join_btn');
  const { ref: newBtnRef, onLayout: newBtnLayout } = useTourStepWithLayout('nav_new_btn');
  const { ref: dashboardBtnRef, onLayout: dashboardBtnLayout } = useTourStepWithLayout('nav_dashboard_btn');

  // Auto-iniciar tour la primera vez que el usuario llega a esta pantalla
  const tourInitRef = useRef(false);
  useEffect(() => {
    if (tourInitRef.current) return;
    tourInitRef.current = true;
    startTourIfFirstTime();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [projectCounts, setProjectCounts] = useState<Record<string, {
    openObs: number; approved: number; submitted: number; rejected: number;
  }>>({});
  const [showCreate, setShowCreate] = useState(false);
  const [showDrawer, setShowDrawer] = useState(false);   // v44 — menú lateral
  const [showLangPicker, setShowLangPicker] = useState(false);   // v46 — selector de idioma
  const { t, lang } = useI18n();
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
  const [selectedProject, setSelectedProject] = useState<ProjectRow | null>(null);
  const [debugInfo, setDebugInfo] = useState<string>('...');

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

  // ── Cargar proyectos directamente desde Supabase (fuente de verdad) ────────
  const loadProjectsFromCloud = useCallback(async () => {
    if (!currentUser) return;
    setDebugInfo('Consultando Supabase...');
    try {
      let data: ProjectRow[] = [];

      if (currentUser.role === 'CREATOR') {
        const { data: res } = await supabase.from('projects').select('id,name,status').order('created_at', { ascending: true });
        data = (res ?? []) as ProjectRow[];
      } else {
        const [{ data: accessRes }, { data: createdRes }] = await Promise.all([
          supabase.from('user_project_access').select('project_id').eq('user_id', currentUser.id),
          supabase.from('projects').select('id,name,status').eq('created_by_id', currentUser.id),
        ]);
        const ids = new Set([
          ...(accessRes ?? []).map((a: any) => a.project_id as string),
          ...(createdRes ?? []).map((p: any) => p.id as string),
        ]);
        if (ids.size > 0) {
          const { data: projRes } = await supabase
            .from('projects').select('id,name,status').in('id', Array.from(ids)).order('created_at', { ascending: true });
          data = (projRes ?? []) as ProjectRow[];
        }
      }

      setProjects(data);
      setDebugInfo(`${data.length} proyectos`);

      // Limpiar localmente proyectos que ya no existen en Supabase
      const remoteIds = new Set(data.map((p) => p.id));
      const localProjects = await projectsCollection.query().fetch().catch(() => []);
      const toDelete = localProjects.filter((p) => !remoteIds.has(p.id));
      if (toDelete.length > 0) {
        await database.write(async () => {
          for (const p of toDelete) await p.destroyPermanently();
        });
      }

      // Pull en background secuencial (precarga datos para entrar a proyecto)
      (async () => {
        for (const p of data) {
          await pullProjectFromCloud(p.id).catch(() => {});
        }
        // Load counts after pull
        const counts: typeof projectCounts = {};
        for (const p of data) {
          try {
            const plans = await plansCollection.query(Q.where('project_id', p.id)).fetch();
            const planIds = plans.map(pl => pl.id);
            let openObs = 0;
            if (planIds.length > 0) {
              const anns = await planAnnotationsCollection
                .query(Q.where('plan_id', Q.oneOf(planIds)), Q.where('is_ok', false))
                .fetch();
              openObs = anns.length;
            }
            const protos = await protocolsCollection
              .query(Q.where('project_id', p.id), Q.where('status', Q.notEq('DRAFT')))
              .fetch();
            counts[p.id] = {
              openObs,
              approved: protos.filter(pr => (pr as any).status === 'APPROVED').length,
              submitted: protos.filter(pr => (pr as any).status === 'SUBMITTED').length,
              rejected: protos.filter(pr => (pr as any).status === 'REJECTED').length,
            };
          } catch { counts[p.id] = { openObs: 0, approved: 0, submitted: 0, rejected: 0 }; }
        }
        setProjectCounts(counts);
      })();
    } catch {
      setDebugInfo('Sin conexión');
    }
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

  // ── Cargar al enfocar la pantalla ─────────────────────────────────────────
  useFocusEffect(useCallback(() => {
    loadProjectsFromCloud();
  }, [loadProjectsFromCloud]));

  // ── Pull-to-refresh ──────────────────────────────────────────────────────
  const handleRefresh = async () => {
    if (!currentUser || refreshing) return;
    setRefreshing(true);
    await loadProjectsFromCloud();
    setRefreshing(false);
  };

  // ── Crear proyecto ─────────────────────────────────────────────────────────
  const createProject = async () => {
    if (!newName.trim() || !newPassword.trim()) return;
    // Validar nombre duplicado
    const duplicate = projects.find(p => p.name.toLowerCase().trim() === newName.toLowerCase().trim());
    if (duplicate) {
      Alert.alert(t('alerts.duplicateNameTitle'), t('alerts.duplicateNameMsg'));
      return;
    }
    let newProjectId = '';
    await database.write(async () => {
      const proj = await projectsCollection.create((p) => {
        p.name = newName.trim();
        p.status = 'ACTIVE';
        (p as any).password = newPassword.trim();
        p.createdById = currentUser?.id ?? null;
        // v22 — Seed feature_flags con los defaults para protocolos numéricos
        // (clásicos+planos+normas+contactos+numéricos+gráficos ON, históricos OFF).
        // Sin esto el proyecto subido a Supabase tendría feature_flags = null y
        // el CREATOR tendría que activar los módulos manualmente desde web antes
        // de poder llenar protocolos numéricos.
        (p as any).featureFlags = JSON.stringify({
          ...DEFAULT_FEATURE_FLAGS,
          // Habilitamos numéricos por default en proyectos creados desde móvil
          // — el flujo móvil principal hoy es numérico/clásico, y obligar a
          // pasar por web rompería la UX.
          numeric_protocols: true,
          advanced_charts: true,
        });
      });
      newProjectId = proj.id;
    });
    // Push inmediato, crear carpetas S3 y refrescar lista
    if (newProjectId) {
      const name = newName.trim();
      try {
        const result = await pushProjectToSupabase(newProjectId);
        if (result.errors.length > 0) {
          Alert.alert(t('alerts.syncProjectErrorTitle'), result.errors.join('\n'));
        }
      } catch (e: any) {
        Alert.alert(t('alerts.networkErrorTitle'), t('alerts.networkSyncProjectMsg', { message: e.message }));
      }
      initProjectFolders(name).catch((e) => console.warn('[S3] initProjectFolders:', e));
      await loadProjectsFromCloud();
    }
    setNewName('');
    setNewPassword('');
    setShowCreate(false);
  };

  // ── Eliminar proyecto de vista (solo local, S3/Supabase intactos) ──────────
  const handleDeleteFromView = (project: ProjectRow) => {
    setSelectedProject(null);
    Alert.alert(
      t('alerts.deleteProjectTitle'),
      t('alerts.deleteProjectMsg'),
      [
        { text: t('alerts.cancel'), style: 'cancel' },
        {
          text: t('alerts.delete'), style: 'destructive',
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
        Alert.alert(t('alerts.projectNotFoundTitle'), t('alerts.projectNotFoundMsg'));
        setJoinLoading(false);
        return;
      }
      if ((remote.password ?? '').toLowerCase().trim() !== joinPassword.toLowerCase().trim()) {
        Alert.alert(t('alerts.wrongPasswordTitle'), t('alerts.wrongPasswordMsg'));
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
          Alert.alert(t('alerts.error'), t('alerts.downloadProjectFailedMsg'));
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
          Alert.alert(t('alerts.projectRestoredTitle'), t('alerts.projectRestoredMsg', { name: found.name }));
        } else {
          Alert.alert(t('alerts.alreadyHasAccessTitle'), t('alerts.alreadyHasAccessMsg'));
        }
        setJoinLoading(false);
        return;
      }

      // 4. Crear registro de acceso
      const foundId = found!.id;
      await database.write(async () => {
        await userProjectAccessCollection.create((a: any) => {
          a.userId = currentUser.id;
          a.projectId = foundId;
        });
      });
      // Push el registro de acceso a Supabase para que sea visible desde otros dispositivos
      pushProjectToSupabase(foundId).catch(() => {});

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
      loadProjectsFromCloud();
      const msg = fromCloud
        ? t('alerts.accessGrantedFromCloudMsg', { name: found.name })
        : t('alerts.accessGrantedLocalMsg', { name: found.name });
      Alert.alert(t('alerts.accessGrantedTitle'), msg);
    } catch (err: any) {
      Alert.alert(t('alerts.error'), t('alerts.joinProjectErrorMsg', { message: err?.message ?? String(err) }));
    }
    setJoinLoading(false);
  };

  const handleLogout = () => {
    Alert.alert(t('alerts.logoutTitle'), t('alerts.logoutMsg'), [
      { text: t('alerts.cancel'), style: 'cancel' },
      { text: t('alerts.logoutConfirm'), style: 'destructive', onPress: logout },
    ]);
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: (StatusBar.currentHeight ?? 24) + 16 }]}>
        <View style={styles.headerTop}>
          {/* Izquierda: identidad (avatar lo más a la izquierda + nombre/rol). Toca para abrir el menú. */}
          <TouchableOpacity style={styles.userInfo} activeOpacity={0.8} onPress={() => setShowDrawer(true)}>
            <View style={[styles.avatarBtn, { backgroundColor: roleColor(currentUser?.role) }]}>
              <Text style={styles.avatarText}>
                {(currentUser?.name?.[0] ?? '') + (currentUser?.apellido?.[0] ?? '')}
              </Text>
            </View>
            <View style={{ flexShrink: 1 }}>
              <Text style={styles.userName} numberOfLines={1}>
                {currentUser?.name} {currentUser?.apellido}
              </Text>
              <View style={[styles.roleBadge, { backgroundColor: roleColor(currentUser?.role) }]}>
                <Text style={styles.roleBadgeText}>{roleLabel(currentUser?.role)}</Text>
              </View>
            </View>
          </TouchableOpacity>
          {/* Derecha: tutorial + menú hamburguesa (lo demás se movió al menú lateral) */}
          <View style={styles.headerActions}>
            {unreadCount > 0 && (
              <View style={styles.notifBadge}>
                <Text style={styles.notifBadgeText}>{unreadCount}</Text>
              </View>
            )}
            <TouchableOpacity
              ref={tourHelpRef}
              style={styles.iconBtn}
              onPress={startTour}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityLabel="Tutorial"
            >
              <Ionicons name="school-outline" size={23} color={Colors.white} />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.iconBtn}
              onPress={() => setShowDrawer(true)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityLabel="Abrir menú"
            >
              <Ionicons name="menu" size={28} color={Colors.white} />
            </TouchableOpacity>
          </View>
        </View>
      </View>

      <FlatList
        data={projects.filter((p) => !hiddenProjectIds.has(p.id))}
        keyExtractor={(p) => p.id}
        contentContainerStyle={[styles.list, { paddingBottom: 100 + Math.max(insets.bottom, 8) }]}
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
        renderItem={({ item, index }) => (
          <View ref={index === 0 ? projectCardRef : undefined} style={styles.card}>
            <TouchableOpacity
              style={styles.cardHeader}
              onPress={() => {
                pullProjectFromCloud(item.id).catch(() => {});
                // v28 — Tap → menú intermedio (no directo a Ubicaciones).
                navigation.navigate('ProjectMenu', { projectId: item.id, projectName: item.name });
              }}
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
              <Ionicons name="chevron-forward" size={20} color={Colors.light} />
            </TouchableOpacity>

            <View ref={index === 0 ? actionChipsRef : undefined} style={styles.actionsRow}>
              <TouchableOpacity
                ref={index === 0 ? observacionesChipRef : undefined}
                style={styles.actionChipCompact}
                onPress={() => {
                  pullProjectFromCloud(item.id).catch(() => {});
                  navigation.navigate('AnnotationComments', { projectId: item.id, projectName: item.name });
                }}
              >
                <Text style={styles.actionChipTextSm}>Obs </Text>
                {(projectCounts[item.id]?.openObs ?? 0) > 0 ? (
                  <PulsingBadge count={projectCounts[item.id].openObs} />
                ) : (
                  <Text style={styles.obsZero}>0</Text>
                )}
              </TouchableOpacity>

              {(isJefe || isSupervisor) && (
                <TouchableOpacity
                  ref={index === 0 ? dosierChipRef : undefined}
                  style={styles.actionChip}
                  onPress={() => {
                  pullProjectFromCloud(item.id).catch(() => {});
                  navigation.navigate('Dossier', { projectId: item.id, projectName: item.name });
                }}
                >
                  <Text style={styles.actionChipText}>Dosier: </Text>
                  <View style={styles.dossierCounts}>
                    <View style={[styles.dossierBadge, { backgroundColor: Colors.success }]}>
                      <Text style={styles.dossierBadgeText}>{projectCounts[item.id]?.approved ?? 0}</Text>
                    </View>
                    <View style={[styles.dossierBadge, { backgroundColor: Colors.primary }]}>
                      <Text style={styles.dossierBadgeText}>{projectCounts[item.id]?.submitted ?? 0}</Text>
                    </View>
                    <View style={[styles.dossierBadge, { backgroundColor: Colors.danger }]}>
                      <Text style={styles.dossierBadgeText}>{projectCounts[item.id]?.rejected ?? 0}</Text>
                    </View>
                  </View>
                </TouchableOpacity>
              )}

              {/* v29 — Planos y Cargar archivos se accedan desde el menú interno del proyecto. */}
              <TouchableOpacity
                style={styles.actionChipPhone}
                onPress={() => navigation.navigate('PhoneContacts', { projectId: item.id, projectName: item.name })}
              >
                <Ionicons name="call-outline" size={15} color={Colors.white} />
              </TouchableOpacity>
            </View>
          </View>
        )}
      />

      {/* Bottom navigation bar */}
      <View ref={bottomNavRef} onLayout={bottomNavLayout}
        style={[styles.bottomNav, { paddingBottom: Math.max(insets.bottom, 8) + 8 }]}>
        <View style={[styles.navItem, styles.navItemActive]}>
          <Ionicons name="folder-open" size={24} color={Colors.primary} />
          <Text style={[styles.navLabel, styles.navLabelActive]}>Proyectos</Text>
        </View>

        <TouchableOpacity
          ref={dashboardBtnRef}
          onLayout={dashboardBtnLayout}
          style={styles.navItem}
          onPress={() => navigation.navigate('Historical', {})}
          activeOpacity={0.7}
        >
          <Ionicons name="bar-chart-outline" size={24} color={Colors.textMuted} />
          <Text style={styles.navLabel}>Dashboard</Text>
        </TouchableOpacity>

        <TouchableOpacity
          ref={joinBtnRef}
          onLayout={joinBtnLayout}
          style={styles.navItem}
          onPress={() => setShowJoin(true)}
          activeOpacity={0.7}
        >
          <Ionicons name="log-in-outline" size={24} color={Colors.textMuted} />
          <Text style={styles.navLabel}>Ingresar</Text>
        </TouchableOpacity>

        {isJefe && (
          <TouchableOpacity
            ref={newBtnRef}
            onLayout={newBtnLayout}
            style={styles.navItem}
            onPress={() => {
              if (isDemo) {
                Alert.alert(t('alerts.demoUnavailableTitle'), t('alerts.demoUnavailableMsg'));
              } else if (!isCreator) {
                Alert.alert(t('alerts.restrictedAccessTitle'), t('alerts.restrictedAccessMsg'));
              } else {
                setShowCreate(true);
              }
            }}
            activeOpacity={0.7}
          >
            <Ionicons name="add-circle-outline" size={24} color={Colors.textMuted} />
            <Text style={styles.navLabel}>Nuevo</Text>
          </TouchableOpacity>
        )}

        {/* v44 — QR movido del encabezado al pie, como opción más a la derecha. */}
        <TouchableOpacity
          style={styles.navItem}
          onPress={() => navigation.navigate('QRScanner')}
          activeOpacity={0.7}
          accessibilityLabel="Escanear QR de protocolo"
        >
          <Ionicons name="qr-code-outline" size={24} color={Colors.textMuted} />
          <Text style={styles.navLabel}>QR</Text>
        </TouchableOpacity>
      </View>

      {/* Modal nuevo proyecto */}
      <Modal visible={showCreate} transparent animationType="slide">
        <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={() => { setShowCreate(false); setNewName(''); setNewPassword(''); }}>
          <TouchableOpacity style={styles.modal} activeOpacity={1}>
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
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* Modal propiedades de proyecto */}
      <Modal visible={!!selectedProject} transparent animationType="fade" onRequestClose={() => setSelectedProject(null)}>
        <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={() => setSelectedProject(null)}>
          <View style={[styles.modal, { gap: 0 }]}>
            <Text style={[styles.modalTitle, { marginBottom: 16 }]}>{selectedProject?.name}</Text>
            {isCreator && (
              <TouchableOpacity
                style={styles.propConfigBtn}
                onPress={() => {
                  if (!selectedProject) return;
                  const proj = selectedProject;
                  setSelectedProject(null);
                  (navigation as any).navigate('ProjectConfig', { projectId: proj.id, projectName: proj.name });
                }}
              >
                <Text style={styles.propConfigText}>Configurar módulos</Text>
              </TouchableOpacity>
            )}
            {/* v29 — Geolocalización y Trazabilidad se acceden únicamente desde el
               menú intermedio del proyecto (gateadas ahí por sus flags). El long-press
               modal sólo expone acciones administrativas: configurar módulos, eliminar
               vista, cancelar. La gestión de sectores vive en Cargar archivos → Sectores. */}
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
        <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={() => { setShowJoin(false); setJoinName(''); setJoinPassword(''); }}>
          <TouchableOpacity style={styles.modal} activeOpacity={1}>
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
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* v44 — Menú lateral (overlay). Reúne lo que se sacó del encabezado. */}
      <SideDrawer
        visible={showDrawer}
        onClose={() => setShowDrawer(false)}
        userName={`${currentUser?.name ?? ''} ${currentUser?.apellido ?? ''}`.trim()}
        roleLabel={roleLabel(currentUser?.role)}
        roleColor={roleColor(currentUser?.role)}
        initials={(currentUser?.name?.[0] ?? '') + (currentUser?.apellido?.[0] ?? '')}
        sections={[
          { title: t('drawer.preferences'), items: [
            { icon: 'language-outline', label: `${t('drawer.language')} · ${LANG_LABEL[lang]}`, onPress: () => setShowLangPicker(true) },
          ] },
          { title: t('drawer.account'), items: [
            ...((currentUser?.role === 'CREATOR' || currentUser?.role === 'RESIDENT' || currentUser?.role === 'SUPERVISOR')
              ? [{ icon: 'create-outline', label: t('drawer.signature'), onPress: () => navigation.navigate('Signature') } as SideDrawerItem] : []),
            { icon: 'key-outline', label: t('drawer.changePassword'), onPress: () => navigation.navigate('ChangePassword') },
            ...((isCreator && !isDemo)
              ? [{ icon: 'people-circle-outline', label: t('drawer.userManagement'), onPress: () => navigation.navigate('UserManagement') } as SideDrawerItem] : []),
          ] },
          { title: t('drawer.information'), items: [
            { icon: 'information-circle-outline', label: t('drawer.about'), onPress: () => navigation.navigate('Info', { kind: 'about' }) },
            { icon: 'mail-outline', label: t('drawer.contact'), onPress: () => navigation.navigate('Info', { kind: 'contact' }) },
          ] },
        ]}
        footerItem={{ icon: 'power-outline', label: t('drawer.logout'), onPress: handleLogout, danger: true }}
      />
      <LanguagePickerModal visible={showLangPicker} onClose={() => setShowLangPicker(false)} />
    </View>
  );
}

function roleLabel(role?: string) {
  if (role === 'CREATOR') return 'Creador';
  if (role === 'RESIDENT') return 'Jefe';
  if (role === 'SUPERVISOR') return 'Supervisor';
  return 'Técnico';   // OPERATOR → Técnico (v44)
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
    paddingHorizontal: 16,
    paddingBottom: 16,
    minHeight: 60,
  },
  headerTop: {
    flexDirection: 'row', alignItems: 'center',
  },
  userInfo: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  userName: { fontSize: 14, fontWeight: '700', color: Colors.white },
  roleBadge: {
    borderRadius: 3, paddingHorizontal: 7, paddingVertical: 2, alignSelf: 'flex-start',
  },
  roleBadgeText: { color: Colors.white, fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },
  headerActions: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  iconBtn: { padding: 2 },
  qrScanBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  notifBadge: {
    backgroundColor: Colors.danger, borderRadius: 10,
    paddingHorizontal: 7, paddingVertical: 3,
  },
  notifBadgeText: { color: Colors.white, fontSize: 11, fontWeight: '700' },
  headerBtn: {
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: Radius.sm,
    borderWidth: 1, borderColor: Colors.secondary,
  },
  headerBtnText: { color: Colors.light, fontSize: 11, fontWeight: '600' },
  avatarBtn: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { color: Colors.white, fontSize: 12, fontWeight: '800' },
  powerBtn: { padding: 4 },
  tutorialBtn: {
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: Radius.sm,
    borderWidth: 1.5, borderColor: '#20b2aa',
    backgroundColor: 'rgba(32,178,170,0.15)',
  },
  tutorialBtnText: { color: '#20b2aa', fontSize: 11, fontWeight: '700' },
  headerTitle: {
    fontSize: 17, fontWeight: '900', color: Colors.white, letterSpacing: 0.5, textAlign: 'center',
  },

  list: { padding: 16, paddingBottom: 100, gap: 12 },

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

  actionsRow: {
    flexDirection: 'row', flexWrap: 'nowrap', gap: 5,
    paddingHorizontal: 12, paddingBottom: 12,
    borderTopWidth: 1, borderTopColor: Colors.divider,
    paddingTop: 10,
  },
  actionChip: {
    flex: 1, borderRadius: Radius.sm, paddingHorizontal: 8, paddingVertical: 6,
    borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.white,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
  },
  actionChipCompact: {
    flex: 0, borderRadius: Radius.sm, paddingHorizontal: 7, paddingVertical: 5,
    borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.white,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
  },
  actionChipPlans: {
    flex: 0, backgroundColor: Colors.navy, borderColor: Colors.navy,
    alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 9, paddingVertical: 6,
    borderWidth: 1, borderRadius: Radius.sm,
  },
  actionChipTextSm: { fontSize: 10, fontWeight: '700', color: Colors.textSecondary },
  actionChipUpload: {
    flex: 0, borderRadius: Radius.sm, paddingHorizontal: 10, paddingVertical: 6,
    borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surface,
    alignItems: 'center', justifyContent: 'center',
  },
  obsZero: { fontSize: 12, fontWeight: '700', color: Colors.textMuted },
  dossierCounts: { flexDirection: 'row', gap: 3, marginLeft: 2 },
  dossierBadge: {
    borderRadius: 4, minWidth: 16, height: 16,
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4,
  },
  dossierBadgeText: { color: Colors.white, fontSize: 8, fontWeight: '800' },
  actionChipAccent: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  actionChipPhone: {
    flex: 0,
    backgroundColor: Colors.secondary, borderColor: Colors.secondary,
    alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 9, paddingVertical: 6,
    borderWidth: 1, borderRadius: Radius.sm,
  },
  actionChipSync: { borderColor: Colors.secondary, backgroundColor: Colors.white },
  actionChipDisabled: { opacity: 0.5 },
  actionChipText: { fontSize: 11, fontWeight: '600', color: Colors.textSecondary },
  actionChipTextLight: { color: Colors.white },
  actionChipTextSync: { color: Colors.secondary },

  bottomNav: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    flexDirection: 'row', backgroundColor: Colors.white,
    borderTopWidth: 1, borderTopColor: Colors.divider,
    // paddingBottom se aplica inline con useSafeAreaInsets (cubre gestos Android nuevos)
    paddingTop: 8,
    ...Shadow.card,
  },
  navItem: {
    flex: 1, alignItems: 'center', justifyContent: 'center', gap: 3, paddingVertical: 4,
  },
  navItemActive: {
    borderTopWidth: 2, borderTopColor: Colors.primary, marginTop: -1,
  },
  navLabel: { fontSize: 10, color: Colors.textMuted, fontWeight: '500' },
  navLabelActive: { color: Colors.primary, fontWeight: '700' },

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

  propConfigBtn: {
    padding: 16, borderRadius: Radius.md, backgroundColor: '#eef2fa',
    alignItems: 'center', marginBottom: 8, borderWidth: 1, borderColor: Colors.primary + '40',
  },
  propConfigText: { color: Colors.primary, fontWeight: '700', fontSize: 14 },
  propDeleteBtn: {
    padding: 16, borderRadius: Radius.md, backgroundColor: '#fdecea',
    alignItems: 'center', marginBottom: 8,
  },
  propDeleteText: { color: Colors.danger, fontWeight: '700', fontSize: 14 },
  propCancelBtn: { padding: 14, alignItems: 'center' },
  propCancelText: { color: Colors.textSecondary, fontWeight: '600', fontSize: 14 },
});
