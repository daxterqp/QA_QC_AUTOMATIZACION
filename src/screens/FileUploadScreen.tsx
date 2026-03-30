/**
 * FileUploadScreen
 *
 * Hub unificado para cargar archivos a un proyecto.
 * Tabs: Actividades | Ubicaciones | Planos PDF | Planos DWG | Personalizar
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, FlatList,
  Alert, ActivityIndicator, ScrollView, Switch, Image, TextInput,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AppHeader from '@components/AppHeader';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@navigation/types';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import * as IntentLauncher from 'expo-intent-launcher';
import { Colors, Radius, Shadow } from '../theme/colors';
import { database, plansCollection, protocolTemplatesCollection, locationsCollection, projectsCollection } from '@db/index';
import { Q } from '@nozbe/watermelondb';
import type Plan from '@models/Plan';
import type ProtocolTemplate from '@db/models/ProtocolTemplate';
import type Location from '@db/models/Location';
import { uploadToS3, downloadFromS3, s3FileExists } from '@services/S3Service';
import { s3ProjectPrefix } from '@config/aws';
import { useExcelImport } from '@hooks/useExcelImport';
import { useLocationsImport } from '@hooks/useLocationsImport';
import { getProjectSettings, saveProjectSettings } from '@services/ProjectSettings';
import { saveUserSignature, saveUserSignatureS3Key } from '@services/UserSignatureService';
import { useAuth } from '@context/AuthContext';
import { useTourStep } from '@hooks/useTourStep';
import { useTour } from '@context/TourContext';
import { downloadPlansFromS3, downloadDwgFromS3 } from '@services/S3SyncService';
import { pushPlansToSupabase } from '@services/SupabaseSyncService';

type Props = NativeStackScreenProps<RootStackParamList, 'FileUpload'>;
type Tab = 'actividades' | 'ubicaciones' | 'planos_pdf' | 'planos_dwg' | 'personalizar';

interface DwgFile {
  name: string;
  uri: string;
}

function formatDate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}

export default function FileUploadScreen({ navigation, route }: Props) {
  const { projectId, projectName } = route.params;
  const { currentUser } = useAuth();
  const [activeTab, setActiveTab] = useState<Tab>('actividades');

  const { jumpToStep, isActive: tourActive, isContextual, dismissTour } = useTour();

  useEffect(() => {
    const unsub = navigation.addListener('blur', () => {
      if (tourActive && isContextual) dismissTour();
    });
    return unsub;
  }, [navigation, tourActive, isContextual, dismissTour]);

  // Tour refs
  const tabBarRef = useTourStep('fileupload_tab_bar');
  const actionBtnRef = useTourStep('fileupload_action_btn');
  const tabActivitiesRef = useTourStep('fileupload_tab_activities');
  const tabLocationsRef = useTourStep('fileupload_tab_locations');
  const tabPdfRef = useTourStep('fileupload_tab_pdf');
  const tabDwgRef = useTourStep('fileupload_tab_dwg');
  const tabSettingsRef = useTourStep('fileupload_tab_settings');
  const tabRefs: Record<string, React.RefObject<any>> = {
    actividades: tabActivitiesRef,
    ubicaciones: tabLocationsRef,
    planos_pdf: tabPdfRef,
    planos_dwg: tabDwgRef,
    personalizar: tabSettingsRef,
  };

  // ── Planos PDF ─────────────────────────────────────────────────────────────
  const [plans, setPlans] = useState<Plan[]>([]);
  const [pdfLocations, setPdfLocations] = useState<Location[]>([]);
  const [uploading, setUploading] = useState(false);
  const [pulling, setPulling] = useState(false);
  const [expandedPlanNames, setExpandedPlanNames] = useState<Set<string>>(new Set());
  const planCount = plans.length;

  // Grupos de planos por nombre (único por nombre)
  const planGroups = useMemo(() => {
    const map = new Map<string, Plan[]>();
    for (const plan of plans) {
      const key = plan.name;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(plan);
    }
    return Array.from(map.entries()).map(([name, planList]) => ({ name, planList }));
  }, [plans]);

  useEffect(() => {
    const sub1 = plansCollection.query(Q.where('project_id', projectId)).observe().subscribe(setPlans);
    const sub2 = locationsCollection.query(Q.where('project_id', projectId)).observe().subscribe(setPdfLocations);
    return () => { sub1.unsubscribe(); sub2.unsubscribe(); };
  }, [projectId]);

  const getLocationName = (locationId: string | null) => {
    if (!locationId) return null;
    return pdfLocations.find((l) => l.id === locationId)?.name ?? null;
  };

  const findMatchingLocations = (planName: string, locs: Location[]) =>
    locs.filter((loc) => {
      const refs = (loc.referencePlan ?? '');
      const names = refs.split(/[,;]/).map((s) => s.trim().toLowerCase()).filter(Boolean);
      return names.includes(planName.toLowerCase().trim());
    });

  /** Re-vincula silenciosamente planos sin ubicación. Se llama automáticamente tras subir/descargar. */
  const relinkSilent = async () => {
    try {
      const freshPlans = await plansCollection.query(Q.where('project_id', projectId)).fetch();
      const freshLocs = await locationsCollection.query(Q.where('project_id', projectId)).fetch();
      const plansByName = new Map<string, Plan[]>();
      for (const plan of freshPlans) {
        const key = plan.name.toLowerCase().trim();
        if (!plansByName.has(key)) plansByName.set(key, []);
        plansByName.get(key)!.push(plan);
      }
      let linked = 0;
      for (const [planNameLower, plansForName] of plansByName) {
        const matchingLocs = freshLocs.filter((loc) => {
          const refs = (loc.referencePlan ?? '');
          const names = refs.split(/[,;]/).map((s) => s.trim().toLowerCase()).filter(Boolean);
          return names.includes(planNameLower);
        });
        if (matchingLocs.length === 0) continue;
        const existingLocIds = new Set(plansForName.map((p) => (p as any).locationId).filter(Boolean));
        const fileUri = plansForName[0].fileUri;
        const unlinkedPlan = plansForName.find((p) => !(p as any).locationId);
        let usedUnlinked = false;
        for (const loc of matchingLocs) {
          if (existingLocIds.has(loc.id)) continue;
          if (unlinkedPlan && !usedUnlinked) {
            await database.write(async () => { await unlinkedPlan.update((p: any) => { p.locationId = loc.id; }); });
            usedUnlinked = true;
          } else {
            await database.write(async () => {
              await plansCollection.create((p) => {
                p.projectId = projectId;
                p.locationId = loc.id;
                p.name = plansForName[0].name;
                p.fileUri = fileUri;
                p.uploadedById = plansForName[0].uploadedById;
              });
            });
          }
          existingLocIds.add(loc.id);
          linked++;
        }
      }
      if (linked > 0) pushPlansToSupabase(projectId).catch(() => {});
    } catch { /* silent */ }
  };

  const processAsset = async (
    asset: { uri: string; name?: string | null },
    destDir: string,
    linked: string[], unlinked: string[], skipped: string[]
  ) => {
    const fileName = asset.name ?? `plan_${Date.now()}.pdf`;
    const planName = fileName.replace(/\.pdf$/i, '');
    const destUri = `${destDir}${fileName}`;
    const existingPlans = plans.filter((p) => p.name.toLowerCase() === planName.toLowerCase());
    const existingLocIds = new Set(existingPlans.map((p) => (p as any).locationId).filter(Boolean));
    const freshLocs = await locationsCollection.query(Q.where('project_id', projectId)).fetch();
    const matchingLocs = findMatchingLocations(planName, freshLocs);
    const newLocs = matchingLocs.filter((loc) => !existingLocIds.has(loc.id));
    if (newLocs.length === 0 && existingPlans.length > 0) { skipped.push(planName); return; }
    const fileExists = existingPlans.length > 0;
    const finalUri = fileExists ? existingPlans[0].fileUri : destUri;
    if (!fileExists) {
      await FileSystem.copyAsync({ from: asset.uri, to: finalUri });
      try { await uploadToS3(finalUri, `${s3ProjectPrefix(projectName)}/plans/${fileName}`, 'application/pdf'); } catch { /* sin red */ }
    }
    if (newLocs.length > 0) {
      for (const loc of newLocs) {
        await database.write(async () => {
          await plansCollection.create((p) => {
            p.projectId = projectId; p.locationId = loc.id;
            p.name = planName; p.fileUri = finalUri;
            p.uploadedById = currentUser?.id ?? '';
          });
        });
        linked.push(planName);
      }
    } else if (!fileExists) {
      await database.write(async () => {
        await plansCollection.create((p) => {
          p.projectId = projectId; p.locationId = null;
          p.name = planName; p.fileUri = finalUri;
          p.uploadedById = currentUser?.id ?? '';
        });
      });
      unlinked.push(planName);
    }
  };

  const handleUploadPdf = async () => {
    setUploading(true);
    const destDir = `${FileSystem.documentDirectory}plans/`;
    await FileSystem.makeDirectoryAsync(destDir, { intermediates: true });
    const linked: string[] = []; const unlinked: string[] = []; const skipped: string[] = [];
    let keepGoing = true;
    while (keepGoing) {
      try {
        const result = await DocumentPicker.getDocumentAsync({ type: 'application/pdf', copyToCacheDirectory: true });
        if (result.canceled || !result.assets?.length) { keepGoing = false; break; }
        await processAsset(result.assets[0], destDir, linked, unlinked, skipped);
      } catch { Alert.alert('Error', 'No se pudo cargar el plano.'); break; }
      keepGoing = await new Promise<boolean>((resolve) => {
        Alert.alert('Plano agregado', `Total: ${linked.length + unlinked.length}. ¿Agregar otro?`, [
          { text: 'Terminar', style: 'cancel', onPress: () => resolve(false) },
          { text: 'Agregar otro', onPress: () => resolve(true) },
        ]);
      });
    }
    setUploading(false);
    if (linked.length + unlinked.length > 0) {
      pushPlansToSupabase(projectId).catch(() => {});
      await relinkSilent();
    }
    if (linked.length + unlinked.length + skipped.length > 0) {
      const lines: string[] = [];
      if (linked.length) lines.push(`Vinculados (${linked.length}): ${linked.join(', ')}`);
      if (unlinked.length) lines.push(`Sin ubicación (${unlinked.length}): ${unlinked.join(', ')}`);
      if (skipped.length) lines.push(`Ya existían (${skipped.length})`);
      Alert.alert('Resumen', lines.join('\n'));
    }
  };

  const handleRecargarPdf = async () => {
    if (!currentUser) return;
    setPulling(true);
    try {
      const result = await downloadPlansFromS3(projectId, projectName, currentUser.id);
      await relinkSilent();
      const lines: string[] = [];
      if (result.downloaded > 0) lines.push(`Descargados: ${result.downloaded}`);
      if (result.skipped > 0) lines.push(`Ya existían: ${result.skipped}`);
      if (result.error) lines.push(`Error: ${result.error}`);
      Alert.alert('Recargar PDF', lines.length ? lines.join('\n') : 'No se encontraron planos nuevos.');
    } catch (e) { Alert.alert('Error', String(e)); }
    finally { setPulling(false); }
  };

  /** Revincula un plano específico con sus ubicaciones (re-link manual) */
  const handleRelinkPlan = async (planName: string) => {
    try {
      const freshPlans = await plansCollection.query(Q.where('project_id', projectId)).fetch();
      const freshLocs = await locationsCollection.query(Q.where('project_id', projectId)).fetch();
      const plansForName = freshPlans.filter(p => p.name.toLowerCase() === planName.toLowerCase());
      const matchingLocs = freshLocs.filter((loc) => {
        const refs = (loc.referencePlan ?? '');
        const names = refs.split(/[,;]/).map((s) => s.trim().toLowerCase()).filter(Boolean);
        return names.includes(planName.toLowerCase().trim());
      });
      if (matchingLocs.length === 0) {
        Alert.alert('Sin coincidencias', `No se encontraron ubicaciones que referencien "${planName}".`);
        return;
      }
      const existingLocIds = new Set(plansForName.map((p) => (p as any).locationId).filter(Boolean));
      const fileUri = plansForName[0]?.fileUri ?? '';
      let linked = 0;
      for (const loc of matchingLocs) {
        if (existingLocIds.has(loc.id)) continue;
        const unlinked = plansForName.find(p => !(p as any).locationId);
        if (unlinked) {
          await database.write(async () => { await unlinked.update((p: any) => { p.locationId = loc.id; }); });
        } else {
          await database.write(async () => {
            await plansCollection.create((p) => {
              p.projectId = projectId; p.locationId = loc.id;
              p.name = planName; p.fileUri = fileUri;
              p.uploadedById = currentUser?.id ?? '';
            });
          });
        }
        existingLocIds.add(loc.id);
        linked++;
      }
      if (linked > 0) pushPlansToSupabase(projectId).catch(() => {});
      Alert.alert('Revínculo completado', linked > 0 ? `${linked} ubicación(es) vinculadas.` : 'Ya estaba completamente vinculado.');
    } catch (e) {
      Alert.alert('Error', String(e));
    }
  };

  const handleDeletePlan = (plan: Plan) => {
    Alert.alert('Eliminar plano', `¿Eliminar "${plan.name}"?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar', style: 'destructive',
        onPress: async () => {
          const shared = plans.filter((p) => p.fileUri === plan.fileUri);
          if (shared.length <= 1) { try { await FileSystem.deleteAsync(plan.fileUri, { idempotent: true }); } catch { /* */ } }
          await database.write(async () => { await plan.destroyPermanently(); });
        },
      },
    ]);
  };

  // ── DWG ───────────────────────────────────────────────────────────────────
  const dwgDir = `${FileSystem.documentDirectory}plansdwg_${projectId}/`;
  const [dwgFiles, setDwgFiles] = useState<DwgFile[]>([]);
  const [dwgLoading, setDwgLoading] = useState(false);
  const [dwgPulling, setDwgPulling] = useState(false);

  useEffect(() => {
    if (activeTab === 'planos_dwg') loadDwgFiles();
  }, [activeTab]);

  const loadDwgFiles = async () => {
    try {
      await FileSystem.makeDirectoryAsync(dwgDir, { intermediates: true });
      const files = await FileSystem.readDirectoryAsync(dwgDir);
      const dwg = files.filter((f) => f.toLowerCase().endsWith('.dwg'));
      setDwgFiles(dwg.map((f) => ({ name: f.replace(/\.dwg$/i, ''), uri: dwgDir + f })));
    } catch {
      setDwgFiles([]);
    }
  };

  const handlePickDwg = async () => {
    setDwgLoading(true);
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: '*/*',
        copyToCacheDirectory: true,
        multiple: true,
      });
      if (result.canceled || !result.assets?.length) return;
      await FileSystem.makeDirectoryAsync(dwgDir, { intermediates: true });
      const added: string[] = [];
      for (const asset of result.assets) {
        const fileName = asset.name ?? `archivo_${Date.now()}.dwg`;
        const destUri = dwgDir + fileName;
        await FileSystem.copyAsync({ from: asset.uri, to: destUri });
        added.push(fileName.replace(/\.dwg$/i, ''));
        try {
          await uploadToS3(destUri, `${s3ProjectPrefix(projectName)}/plansdwg/${fileName}`, 'application/octet-stream');
        } catch { /* sin conectividad, ignorar */ }
      }
      await loadDwgFiles();
      Alert.alert('Cargado', `${added.length} archivo(s) DWG guardado(s).`);
    } catch {
      Alert.alert('Error', 'No se pudo cargar el archivo DWG.');
    } finally {
      setDwgLoading(false);
    }
  };

  const openDwg = async (fileUri: string, _fileName: string) => {
    try {
      const contentUri = await FileSystem.getContentUriAsync(fileUri);
      await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
        data: contentUri,
        type: 'application/dwg',
        flags: 1,
      });
    } catch {
      Alert.alert('No se pudo abrir el archivo DWG', 'Asegúrate de tener una app compatible instalada.');
    }
  };

  const deleteDwg = (file: DwgFile) => {
    Alert.alert('Eliminar DWG', `¿Eliminar "${file.name}.dwg"?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar', style: 'destructive',
        onPress: async () => {
          await FileSystem.deleteAsync(file.uri, { idempotent: true });
          setDwgFiles((prev) => prev.filter((f) => f.uri !== file.uri));
        },
      },
    ]);
  };

  const handleRecargarDwg = async () => {
    setDwgPulling(true);
    try {
      const result = await downloadDwgFromS3(projectName, dwgDir);
      await loadDwgFiles();
      const lines: string[] = [];
      if (result.downloaded > 0) lines.push(`Descargados: ${result.downloaded}`);
      if (result.skipped > 0) lines.push(`Ya existían: ${result.skipped}`);
      if (result.error) lines.push(`Error: ${result.error}`);
      Alert.alert('Recargar DWG', lines.length ? lines.join('\n') : 'No se encontraron archivos nuevos.');
    } catch (e) { Alert.alert('Error', String(e)); }
    finally { setDwgPulling(false); }
  };

  // ── Actividades ───────────────────────────────────────────────────────────
  const { importState: actState, startImport: startActImport } = useExcelImport(projectId, projectName);
  const [templates, setTemplates] = useState<ProtocolTemplate[]>([]);

  const loadTemplates = useCallback(async () => {
    const res = await protocolTemplatesCollection
      .query(Q.where('project_id', projectId), Q.sortBy('created_at', Q.asc))
      .fetch();
    setTemplates(res);
  }, [projectId]);

  useEffect(() => {
    if (activeTab === 'actividades') loadTemplates();
  }, [activeTab, actState.status]);

  // ── Ubicaciones ───────────────────────────────────────────────────────────
  const { importState: locState, startImport: startLocImport } = useLocationsImport(projectId, projectName);
  const [locationList, setLocationList] = useState<Location[]>([]);

  const loadLocations = useCallback(async () => {
    const res = await locationsCollection
      .query(Q.where('project_id', projectId), Q.sortBy('created_at', Q.asc))
      .fetch();
    setLocationList(res);
  }, [projectId]);

  useEffect(() => {
    if (activeTab === 'ubicaciones') loadLocations();
  }, [activeTab, locState.status]);

  // ── Personalizar ──────────────────────────────────────────────────────────
  const [stampEnabled, setStampEnabled] = useState(true);
  const [stampPhotoUri, setStampPhotoUri] = useState<string | null>(null);
  const [stampLoading, setStampLoading] = useState(false);
  const [signatureUri, setSignatureUri] = useState<string | null>(null);
  const [signatureLoading, setSignatureLoading] = useState(false);
  const [stampComment, setStampComment] = useState('');
  const [stampCommentSaving, setStampCommentSaving] = useState(false);

  // S3 key for global project logo
  const LOGO_S3_KEY = `logos/project_${projectId}/logo.jpg`;

  useEffect(() => {
    if (activeTab !== 'personalizar') return;
    getProjectSettings(projectId).then((s) => {
      setStampEnabled(s.stampEnabled);
      setStampComment(s.stampComment ?? '');
      setSignatureUri(s.signatureUri);
    });
    // Try to load global logo from S3 into a local cache
    const localLogoUri = `${FileSystem.cacheDirectory}project_logo_${projectId}.jpg`;
    s3FileExists(LOGO_S3_KEY).then(exists => {
      if (!exists) return;
      downloadFromS3(LOGO_S3_KEY, localLogoUri)
        .then(() => setStampPhotoUri(localLogoUri))
        .catch(() => {});
    }).catch(() => {});
  }, [activeTab, projectId]);

  const toggleStamp = async (val: boolean) => {
    setStampEnabled(val);
    await saveProjectSettings(projectId, { stampEnabled: val });
  };

  const saveStampComment = async () => {
    setStampCommentSaving(true);
    await saveProjectSettings(projectId, { stampComment: stampComment.trim() || null });
    setStampCommentSaving(false);
    Alert.alert('Guardado', 'El comentario se estampará en las fotos.');
  };

  const handlePickStampPhoto = async () => {
    setStampLoading(true);
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['image/jpeg', 'image/png'],
        copyToCacheDirectory: true,
      });
      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0];
      // Upload to S3 (global for all users)
      await uploadToS3(asset.uri, LOGO_S3_KEY, 'image/jpeg');
      // Update Project.logoS3Key in WatermelonDB
      try {
        const project = await projectsCollection.find(projectId);
        await database.write(async () => {
          await project.update(p => { (p as any).logoS3Key = LOGO_S3_KEY; });
        });
      } catch { /* project may not exist locally */ }
      // Cache locally
      const localUri = `${FileSystem.cacheDirectory}project_logo_${projectId}.jpg`;
      await FileSystem.copyAsync({ from: asset.uri, to: localUri });
      setStampPhotoUri(localUri);
      Alert.alert('Logo guardado', 'El logo del proyecto está disponible para todos los usuarios.');
    } catch {
      Alert.alert('Error', 'No se pudo cargar el logo.');
    } finally {
      setStampLoading(false);
    }
  };

  const handlePickSignature = async () => {
    if (!currentUser?.id) return;
    setSignatureLoading(true);
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['image/jpeg', 'image/png'],
        copyToCacheDirectory: true,
      });
      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0];
      // Save locally per user
      const destUri = await saveUserSignature(currentUser.id, asset.uri);
      setSignatureUri(destUri);
      await saveProjectSettings(projectId, { signatureUri: destUri });
      // Upload to S3 per user (key: signatures/{userId}/signature.jpg)
      const sigS3Key = `signatures/${currentUser.id}/signature.jpg`;
      await uploadToS3(asset.uri, sigS3Key, 'image/jpeg');
      await saveUserSignatureS3Key(currentUser.id, sigS3Key);
      Alert.alert('Firma guardada', 'La firma se incluirá en los reportes PDF exportados.');
    } catch {
      Alert.alert('Error', 'No se pudo cargar la firma.');
    } finally {
      setSignatureLoading(false);
    }
  };

  // ── Render tabs ───────────────────────────────────────────────────────────

  const renderActividades = () => (
    <ScrollView contentContainerStyle={styles.tabContent}>
      <View style={styles.actionCard}>
        <TouchableOpacity
          ref={actionBtnRef}
          style={[
            styles.importBtn,
            (actState.status === 'picking' || actState.status === 'importing') && styles.btnDisabled,
          ]}
          onPress={startActImport}
          disabled={actState.status === 'picking' || actState.status === 'importing'}
          activeOpacity={0.85}
        >
          {(actState.status === 'picking' || actState.status === 'importing') ? (
            <ActivityIndicator color={Colors.white} size="small" />
          ) : (
            <>
              <Ionicons name="cloud-upload-outline" size={18} color={Colors.white} />
              <Text style={styles.importBtnText}>Importar Excel de Actividades</Text>
            </>
          )}
        </TouchableOpacity>

        {actState.status === 'success' && (
          <View style={styles.successBadge}>
            <Ionicons name="checkmark-circle" size={16} color={Colors.success} />
            <Text style={styles.successText}>
              {actState.totalProtocols} protocolo{actState.totalProtocols !== 1 ? 's' : ''} importado{actState.totalProtocols !== 1 ? 's' : ''}
            </Text>
          </View>
        )}
        {actState.status === 'error' && (
          <View style={styles.errorBadge}>
            <Ionicons name="alert-circle" size={16} color={Colors.danger} />
            <Text style={styles.errorText}>{actState.message}</Text>
          </View>
        )}
      </View>

      {templates.length > 0 && (
        <View style={styles.listSection}>
          <Text style={styles.listTitle}>Protocolos cargados ({templates.length})</Text>
          {templates.map((t) => (
            <View key={t.id} style={styles.listRow}>
              <View style={styles.listRowLeft}>
                <Text style={styles.listRowId}>{t.idProtocolo}</Text>
                <Text style={styles.listRowName} numberOfLines={2}>{t.name}</Text>
              </View>
              <Text style={styles.listRowDate}>{formatDate(new Date(t.createdAt))}</Text>
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );

  const renderUbicaciones = () => (
    <ScrollView contentContainerStyle={styles.tabContent}>
      <View style={styles.actionCard}>
        <TouchableOpacity
          style={[
            styles.importBtn,
            (locState.status === 'picking' || locState.status === 'importing') && styles.btnDisabled,
          ]}
          onPress={startLocImport}
          disabled={locState.status === 'picking' || locState.status === 'importing'}
          activeOpacity={0.85}
        >
          {(locState.status === 'picking' || locState.status === 'importing') ? (
            <ActivityIndicator color={Colors.white} size="small" />
          ) : (
            <>
              <Ionicons name="cloud-upload-outline" size={18} color={Colors.white} />
              <Text style={styles.importBtnText}>Importar Excel de Ubicaciones</Text>
            </>
          )}
        </TouchableOpacity>

        {locState.status === 'success' && (
          <View style={styles.successBadge}>
            <Ionicons name="checkmark-circle" size={16} color={Colors.success} />
            <Text style={styles.successText}>
              {locState.totalLocations} ubicación{locState.totalLocations !== 1 ? 'es' : ''} importada{locState.totalLocations !== 1 ? 's' : ''}
            </Text>
          </View>
        )}
        {locState.status === 'error' && (
          <View style={styles.errorBadge}>
            <Ionicons name="alert-circle" size={16} color={Colors.danger} />
            <Text style={styles.errorText}>{locState.message}</Text>
          </View>
        )}
      </View>

      {locationList.length > 0 && (
        <View style={styles.listSection}>
          <Text style={styles.listTitle}>Ubicaciones cargadas ({locationList.length})</Text>
          {locationList.map((loc) => (
            <View key={loc.id} style={styles.listRow}>
              <View style={styles.listRowLeft}>
                <Text style={styles.listRowName} numberOfLines={2}>{loc.name}</Text>
                {loc.specialty ? (
                  <Text style={styles.listRowSub}>{loc.specialty}</Text>
                ) : null}
              </View>
              <Text style={styles.listRowDate}>{formatDate(new Date(loc.createdAt))}</Text>
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );

  const renderPlanosPdf = () => (
    <View style={styles.pdfContainer}>
      {/* Barra de acciones */}
      <View style={styles.pdfActions}>
        <TouchableOpacity
          style={[styles.pdfActionBtn, styles.pdfUploadBtn, uploading && styles.btnDisabled]}
          onPress={handleUploadPdf}
          disabled={uploading}
          activeOpacity={0.85}
        >
          {uploading ? <ActivityIndicator color={Colors.white} size="small" /> : (
            <>
              <Ionicons name="cloud-upload-outline" size={22} color={Colors.white} />
              <Text style={styles.pdfActionBtnText}>Subir PDF</Text>
            </>
          )}
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.pdfActionBtn, styles.pdfPullBtn, pulling && styles.btnDisabled]}
          onPress={handleRecargarPdf}
          disabled={pulling}
          activeOpacity={0.85}
        >
          {pulling ? <ActivityIndicator color={Colors.white} size="small" /> : (
            <>
              <Ionicons name="cloud-download-outline" size={22} color={Colors.white} />
              <Text style={styles.pdfActionBtnText}>Recargar PDF</Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      {/* Lista de planos agrupados por nombre */}
      <FlatList
        data={planGroups}
        keyExtractor={(g) => g.name}
        contentContainerStyle={styles.pdfList}
        ListEmptyComponent={
          <View style={styles.emptyWrap}>
            <Ionicons name="document-outline" size={44} color={Colors.border} />
            <Text style={styles.emptyText}>Sin planos PDF cargados</Text>
            <Text style={styles.emptySubText}>
              El nombre del PDF debe coincidir con el "Plano de referencia" de la ubicación.
            </Text>
          </View>
        }
        renderItem={({ item: group }) => {
          const isExpanded = expandedPlanNames.has(group.name);
          const linkedLocs = group.planList
            .map(p => getLocationName((p as any).locationId))
            .filter(Boolean) as string[];
          const firstPlan = group.planList[0];

          return (
            <View style={styles.pdfCard}>
              {/* Cabecera del plano */}
              <TouchableOpacity
                style={styles.pdfCardRow}
                onPress={() => {
                  const next = new Set(expandedPlanNames);
                  if (isExpanded) next.delete(group.name); else next.add(group.name);
                  setExpandedPlanNames(next);
                }}
                activeOpacity={0.8}
              >
                <View style={styles.pdfIconBadge}>
                  <Text style={styles.pdfIconBadgeText}>PDF</Text>
                </View>
                <View style={styles.pdfCardInfo}>
                  <Text style={styles.pdfCardName} numberOfLines={1}>{group.name}</Text>
                  {linkedLocs.length > 0
                    ? <Text style={styles.pdfCardLoc}>{linkedLocs.length} ubicación(es)</Text>
                    : <Text style={styles.pdfCardNoLoc}>Sin ubicación vinculada</Text>
                  }
                </View>
                <View style={styles.pdfCardRight}>
                  {/* Re-link */}
                  <TouchableOpacity
                    onPress={() => handleRelinkPlan(group.name)}
                    style={styles.pdfRelinkBtn}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Ionicons name="refresh-outline" size={16} color={Colors.primary} />
                  </TouchableOpacity>
                  <Ionicons name={isExpanded ? 'chevron-up' : 'chevron-down'} size={16} color={Colors.textMuted} />
                </View>
              </TouchableOpacity>

              {/* Ubicaciones expandidas */}
              {isExpanded && (
                <View style={styles.pdfLocList}>
                  {group.planList.map((plan) => {
                    const locName = getLocationName((plan as any).locationId);
                    return (
                      <View key={plan.id} style={styles.pdfLocRow}>
                        <TouchableOpacity
                          style={styles.pdfLocInfo}
                          onPress={() => navigation.navigate('PlanViewer', { planId: plan.id, planName: plan.name })}
                        >
                          <Ionicons name="location-outline" size={13} color={locName ? Colors.success : Colors.textMuted} />
                          <Text style={[styles.pdfLocName, !locName && styles.pdfLocNameNone]}>
                            {locName ?? 'Sin ubicación'}
                          </Text>
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => handleDeletePlan(plan)} style={styles.pdfDelBtn}>
                          <Ionicons name="trash-outline" size={14} color={Colors.danger} />
                        </TouchableOpacity>
                      </View>
                    );
                  })}
                </View>
              )}
            </View>
          );
        }}
      />
    </View>
  );

  const renderPlanosDwg = () => (
    <View style={styles.dwgContainer}>
      <View style={styles.pdfActions}>
        <TouchableOpacity
          style={[styles.pdfActionBtn, styles.pdfUploadBtn, dwgLoading && styles.btnDisabled]}
          onPress={handlePickDwg}
          disabled={dwgLoading}
          activeOpacity={0.85}
        >
          {dwgLoading
            ? <ActivityIndicator color={Colors.white} size="small" />
            : <><Ionicons name="cloud-upload-outline" size={22} color={Colors.white} /><Text style={styles.pdfActionBtnText}>Cargar DWG</Text></>
          }
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.pdfActionBtn, styles.pdfPullBtn, dwgPulling && styles.btnDisabled]}
          onPress={handleRecargarDwg}
          disabled={dwgPulling}
          activeOpacity={0.85}
        >
          {dwgPulling
            ? <ActivityIndicator color={Colors.white} size="small" />
            : <><Ionicons name="cloud-download-outline" size={22} color={Colors.white} /><Text style={styles.pdfActionBtnText}>Recargar DWG</Text></>
          }
        </TouchableOpacity>
      </View>

      <FlatList
        data={dwgFiles}
        keyExtractor={(f) => f.uri}
        contentContainerStyle={styles.dwgList}
        ListEmptyComponent={
          <View style={styles.emptyWrap}>
            <Ionicons name="layers-outline" size={40} color={Colors.border} />
            <Text style={styles.emptyText}>Sin archivos DWG cargados.</Text>
            <Text style={styles.emptySubText}>Carga archivos .dwg para verlos en DWG FastView.</Text>
          </View>
        }
        renderItem={({ item }) => (
          <View style={styles.dwgCard}>
            <View style={styles.dwgIconWrap}>
              <Text style={styles.dwgIconText}>DWG</Text>
            </View>
            <View style={styles.dwgInfo}>
              <Text style={styles.dwgName}>{item.name}</Text>
              <Text style={styles.dwgSub}>{item.name}.dwg</Text>
            </View>
            <View style={styles.dwgCardRight}>
              <TouchableOpacity
                style={styles.dwgOpenBtn}
                onPress={() => openDwg(item.uri, item.name)}
                activeOpacity={0.8}
              >
                <Ionicons name="eye-outline" size={14} color={Colors.white} />
                <Text style={styles.dwgOpenBtnText}>Ver DWG</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.dwgDelBtn}
                onPress={() => deleteDwg(item)}
              >
                <Ionicons name="trash-outline" size={14} color={Colors.danger} />
              </TouchableOpacity>
            </View>
          </View>
        )}
      />
    </View>
  );

  const renderPersonalizar = () => (
    <ScrollView contentContainerStyle={styles.tabContent}>
      {/* Stamp toggle */}
      <View style={styles.settingCard}>
        <View style={styles.settingRow}>
          <View style={styles.settingInfo}>
            <Text style={styles.settingTitle}>Estampado de fotos</Text>
            <Text style={styles.settingDesc}>
              Agrega timestamp y logo del proyecto en cada foto capturada.
            </Text>
          </View>
          <Switch
            value={stampEnabled}
            onValueChange={toggleStamp}
            trackColor={{ false: Colors.border, true: Colors.primary }}
            thumbColor={stampEnabled ? Colors.white : Colors.textMuted}
          />
        </View>

        {stampEnabled && (
          <View style={styles.stampDetails}>
            <View style={styles.stampPreviewRow}>
              <View style={styles.stampPreviewBox}>
                {stampPhotoUri ? (
                  <Image source={{ uri: stampPhotoUri }} style={styles.stampPreviewImg} resizeMode="cover" />
                ) : (
                  <View style={styles.stampPreviewPlaceholder}>
                    <Ionicons name="image-outline" size={28} color={Colors.border} />
                    <Text style={styles.stampPreviewPlaceholderText}>Sin logo</Text>
                  </View>
                )}
              </View>
              <View style={styles.stampPreviewLabels}>
                <Text style={styles.stampPreviewTitle}>Logo del proyecto</Text>
                <Text style={styles.stampPreviewSub}>
                  Se muestra en la esquina superior derecha con 25% de opacidad.
                </Text>
                <TouchableOpacity
                  style={[styles.stampPickBtn, stampLoading && styles.btnDisabled]}
                  onPress={handlePickStampPhoto}
                  disabled={stampLoading}
                  activeOpacity={0.85}
                >
                  {stampLoading
                    ? <ActivityIndicator color={Colors.white} size="small" />
                    : <>
                        <Ionicons name="image-outline" size={16} color={Colors.white} />
                        <Text style={styles.stampPickBtnText}>
                          {stampPhotoUri ? 'Cambiar foto' : 'Subir foto'}
                        </Text>
                      </>
                  }
                </TouchableOpacity>
              </View>
            </View>

          </View>
        )}

        {stampEnabled && (
          <View style={styles.stampCommentRow}>
            <Text style={styles.stampCommentLabel}>Comentario en fotos</Text>
            <Text style={styles.settingDesc}>Texto que aparece bajo el timestamp en cada foto.</Text>
            <View style={styles.stampCommentInputRow}>
              <TextInput
                style={styles.stampCommentInput}
                value={stampComment}
                onChangeText={setStampComment}
                placeholder="Ej: Proyecto Edificio Norte — Fase 2"
                placeholderTextColor={Colors.textMuted}
              />
              <TouchableOpacity
                style={[styles.stampPickBtn, stampCommentSaving && styles.btnDisabled]}
                onPress={saveStampComment}
                disabled={stampCommentSaving}
              >
                {stampCommentSaving
                  ? <ActivityIndicator color={Colors.white} size="small" />
                  : <Text style={styles.stampPickBtnText}>Guardar</Text>
                }
              </TouchableOpacity>
            </View>
          </View>
        )}
      </View>

      {/* ── Firma del Jefe de Calidad ─────────────────────────────────────── */}
      <View style={styles.settingCard}>
        <View style={styles.settingRow}>
          <View style={styles.settingInfo}>
            <Text style={styles.settingTitle}>Firma del Jefe de Calidad</Text>
            <Text style={styles.settingDesc}>
              Aparece al pie de cada protocolo en el dossier PDF exportado.
            </Text>
          </View>
        </View>
        <View style={styles.stampPreviewRow}>
          <View style={styles.signaturePreviewBox}>
            {signatureUri ? (
              <Image source={{ uri: signatureUri }} style={styles.stampPreviewImg} resizeMode="contain" />
            ) : (
              <View style={styles.stampPreviewPlaceholder}>
                <Ionicons name="create-outline" size={28} color={Colors.border} />
                <Text style={styles.stampPreviewPlaceholderText}>Sin firma</Text>
              </View>
            )}
          </View>
          <View style={styles.stampPreviewLabels}>
            <Text style={styles.stampPreviewSub}>
              Sube una imagen de la firma (JPEG o PNG). Se mostrará en todos los reportes de este proyecto.
            </Text>
            <TouchableOpacity
              style={[styles.stampPickBtn, signatureLoading && styles.btnDisabled]}
              onPress={handlePickSignature}
              disabled={signatureLoading}
              activeOpacity={0.85}
            >
              {signatureLoading
                ? <ActivityIndicator color={Colors.white} size="small" />
                : <>
                    <Ionicons name="create-outline" size={16} color={Colors.white} />
                    <Text style={styles.stampPickBtnText}>
                      {signatureUri ? 'Cambiar firma' : 'Subir firma'}
                    </Text>
                  </>
              }
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </ScrollView>
  );

  const tabs: { key: Tab; label: string; icon: string }[] = [
    { key: 'actividades',  label: 'Activ.',      icon: 'document-text-outline' },
    { key: 'ubicaciones',  label: 'Ubic.',        icon: 'location-outline' },
    { key: 'planos_pdf',   label: 'PDF',          icon: 'document-outline' },
    { key: 'planos_dwg',   label: 'DWG',          icon: 'layers-outline' },
    { key: 'personalizar', label: 'Config.',      icon: 'settings-outline' },
  ];

  return (
    <View style={styles.container}>
      <AppHeader
        title="Cargar Archivos"
        subtitle={projectName}
        onBack={() => navigation.goBack()}
        rightContent={
          <TouchableOpacity onPress={() => jumpToStep('fileupload_tab_activities')} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="help-circle-outline" size={22} color={Colors.white} />
          </TouchableOpacity>
        }
      />

      <View ref={tabBarRef} style={styles.tabBar}>
        {tabs.map((t) => (
          <TouchableOpacity
            key={t.key}
            ref={tabRefs[t.key]}
            style={[styles.tabItem, activeTab === t.key && styles.tabItemActive]}
            onPress={() => setActiveTab(t.key)}
            activeOpacity={0.75}
          >
            <Ionicons
              name={t.icon as any}
              size={16}
              color={activeTab === t.key ? Colors.primary : Colors.textMuted}
            />
            <Text style={[styles.tabLabel, activeTab === t.key && styles.tabLabelActive]}>
              {t.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.content}>
        {activeTab === 'actividades'  && renderActividades()}
        {activeTab === 'ubicaciones'  && renderUbicaciones()}
        {activeTab === 'planos_pdf'   && renderPlanosPdf()}
        {activeTab === 'planos_dwg'   && renderPlanosDwg()}
        {activeTab === 'personalizar' && renderPersonalizar()}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.surface },

  tabBar: {
    flexDirection: 'row',
    backgroundColor: Colors.white,
    borderBottomWidth: 1,
    borderBottomColor: Colors.divider,
  },
  tabItem: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    paddingVertical: 10, gap: 3,
    borderBottomWidth: 2, borderBottomColor: 'transparent',
  },
  tabItemActive: { borderBottomColor: Colors.primary },
  tabLabel: { fontSize: 9, fontWeight: '600', color: Colors.textMuted, letterSpacing: 0.3 },
  tabLabelActive: { color: Colors.primary, fontWeight: '800' },

  content: { flex: 1 },

  // ── Action cards (Actividades, Ubicaciones) ───────────────────────────────
  tabContent: { padding: 16, gap: 16 },

  actionCard: {
    backgroundColor: Colors.white, borderRadius: Radius.lg,
    padding: 16, gap: 10, ...Shadow.card,
  },

  importBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: Colors.primary, borderRadius: Radius.md,
    paddingHorizontal: 20, paddingVertical: 14,
    justifyContent: 'center',
  },
  importBtnText: { color: Colors.white, fontWeight: '700', fontSize: 14 },
  btnDisabled: { opacity: 0.5 },

  successBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#e8f5e9', borderRadius: Radius.sm,
    padding: 8,
  },
  successText: { color: Colors.success, fontSize: 13, fontWeight: '600', flex: 1 },
  errorBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#fff0f0', borderRadius: Radius.sm,
    padding: 8,
  },
  errorText: { color: Colors.danger, fontSize: 12, flex: 1 },

  // ── Preview list ──────────────────────────────────────────────────────────
  listSection: {
    backgroundColor: Colors.white, borderRadius: Radius.lg,
    overflow: 'hidden', ...Shadow.subtle,
  },
  listTitle: {
    fontSize: 12, fontWeight: '700', color: Colors.textSecondary,
    paddingHorizontal: 14, paddingVertical: 10,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1, borderBottomColor: Colors.divider,
  },
  listRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 14, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: Colors.divider,
    gap: 10,
  },
  listRowLeft: { flex: 1, gap: 2 },
  listRowId: { fontSize: 10, fontWeight: '800', color: Colors.primary, letterSpacing: 0.5 },
  listRowName: { fontSize: 13, fontWeight: '600', color: Colors.navy },
  listRowSub: { fontSize: 11, color: Colors.textMuted },
  listRowDate: { fontSize: 11, color: Colors.textMuted, minWidth: 60, textAlign: 'right' },

  // ── Planos PDF inline ─────────────────────────────────────────────────────
  pdfContainer: { flex: 1 },
  pdfActions: {
    flexDirection: 'row', gap: 10, padding: 14,
    backgroundColor: Colors.white,
    borderBottomWidth: 1, borderBottomColor: Colors.divider,
  },
  pdfActionBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, borderRadius: Radius.md, paddingVertical: 14,
  },
  pdfUploadBtn: { backgroundColor: Colors.primary },
  pdfPullBtn: { backgroundColor: '#1a7f4b' },
  pdfActionBtnText: { color: Colors.white, fontWeight: '700', fontSize: 13 },
  pdfList: { padding: 14, gap: 10 },
  pdfCard: {
    backgroundColor: Colors.white, borderRadius: Radius.lg,
    overflow: 'hidden', ...Shadow.subtle,
  },
  pdfCardRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    padding: 14,
  },
  pdfLocList: {
    borderTopWidth: 1, borderTopColor: Colors.divider,
  },
  pdfLocRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 14, paddingVertical: 10,
    borderTopWidth: 1, borderTopColor: Colors.divider,
  },
  pdfLocInfo: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6,
  },
  pdfLocName: { fontSize: 13, fontWeight: '600', color: Colors.navy, flex: 1 },
  pdfLocNameNone: { color: Colors.textMuted, fontStyle: 'italic' },
  pdfRelinkBtn: { padding: 6 },
  pdfIconBadge: {
    width: 44, height: 44, borderRadius: Radius.md, backgroundColor: Colors.danger,
    alignItems: 'center', justifyContent: 'center',
  },
  pdfIconBadgeText: { color: Colors.white, fontSize: 10, fontWeight: '900', letterSpacing: 0.5 },
  pdfCardInfo: { flex: 1, gap: 2 },
  pdfCardName: { fontSize: 14, fontWeight: '700', color: Colors.navy },
  pdfCardLoc: { fontSize: 11, color: Colors.success, fontWeight: '600' },
  pdfCardNoLoc: { fontSize: 11, color: Colors.textMuted },
  pdfCardDate: { fontSize: 10, color: Colors.textMuted },
  pdfCardRight: { alignItems: 'center', gap: 8 },
  pdfDelBtn: { padding: 6 },

  // ── DWG ───────────────────────────────────────────────────────────────────
  dwgContainer: { flex: 1 },
  dwgActions: {
    backgroundColor: Colors.white, padding: 16, gap: 8,
    borderBottomWidth: 1, borderBottomColor: Colors.divider,
  },
  dwgHint: { fontSize: 11, color: Colors.textMuted, textAlign: 'center' },
  dwgList: { padding: 16, gap: 10 },
  emptyWrap: { alignItems: 'center', paddingTop: 48, gap: 10 },
  emptyText: { fontSize: 15, fontWeight: '700', color: Colors.textSecondary },
  emptySubText: { fontSize: 12, color: Colors.textMuted, textAlign: 'center', maxWidth: 260 },
  dwgCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: Colors.white, borderRadius: Radius.lg, padding: 14,
    ...Shadow.subtle,
  },
  dwgIconWrap: {
    width: 44, height: 44, borderRadius: Radius.md,
    backgroundColor: Colors.navy, alignItems: 'center', justifyContent: 'center',
  },
  dwgIconText: { color: Colors.white, fontSize: 10, fontWeight: '900', letterSpacing: 0.5 },
  dwgInfo: { flex: 1 },
  dwgName: { fontSize: 14, fontWeight: '700', color: Colors.navy },
  dwgSub: { fontSize: 11, color: Colors.textMuted, marginTop: 2 },
  dwgCardRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dwgOpenBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: Colors.navy, borderRadius: Radius.sm,
    paddingHorizontal: 10, paddingVertical: 7,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)',
  },
  dwgOpenBtnText: { color: Colors.white, fontSize: 11, fontWeight: '700' },
  dwgDelBtn: {
    padding: 8, borderRadius: Radius.sm,
    borderWidth: 1, borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },

  // ── Personalizar ──────────────────────────────────────────────────────────
  settingCard: {
    backgroundColor: Colors.white, borderRadius: Radius.lg,
    padding: 18, gap: 14, ...Shadow.card,
  },
  settingRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
  },
  settingInfo: { flex: 1 },
  settingTitle: { fontSize: 15, fontWeight: '700', color: Colors.navy },
  settingDesc: { fontSize: 12, color: Colors.textSecondary, marginTop: 2, lineHeight: 17 },
  stampDetails: { gap: 12 },
  stampPreviewRow: { flexDirection: 'row', gap: 14, alignItems: 'flex-start' },
  stampPreviewBox: {
    width: 80, height: 60, borderRadius: Radius.md, overflow: 'hidden',
    borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.light,
  },
  stampPreviewImg: { width: '100%', height: '100%' },
  stampPreviewPlaceholder: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 2 },
  stampPreviewPlaceholderText: { fontSize: 9, color: Colors.textMuted, fontWeight: '600' },
  stampPreviewLabels: { flex: 1, gap: 6 },
  stampPreviewTitle: { fontSize: 13, fontWeight: '700', color: Colors.navy },
  stampPreviewSub: { fontSize: 11, color: Colors.textSecondary, lineHeight: 16 },
  stampPickBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: Colors.primary, borderRadius: Radius.sm,
    paddingHorizontal: 12, paddingVertical: 8, alignSelf: 'flex-start',
  },
  stampPickBtnText: { color: Colors.white, fontWeight: '700', fontSize: 12 },
  signaturePreviewBox: {
    width: 160, height: 80, borderRadius: Radius.md, overflow: 'hidden',
    borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.light,
  },
  stampExampleRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 6,
    backgroundColor: Colors.surface, borderRadius: Radius.sm, padding: 8,
  },
  stampExampleText: { fontSize: 11, color: Colors.textMuted, flex: 1, lineHeight: 16 },
  stampCommentRow: { marginTop: 12, gap: 6 },
  stampCommentLabel: { fontSize: 13, fontWeight: '700', color: Colors.navy },
  stampCommentInputRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  stampCommentInput: {
    flex: 1, backgroundColor: Colors.surface, borderRadius: Radius.sm,
    paddingHorizontal: 12, paddingVertical: 8, fontSize: 13,
    borderWidth: 1, borderColor: Colors.border, color: Colors.textPrimary,
  },
});
