import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  Alert, ActivityIndicator,
} from 'react-native';
import { Colors, Radius, Shadow } from '../theme/colors';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import { database, plansCollection, locationsCollection } from '@db/index';
import { useAuth } from '@context/AuthContext';
import type Plan from '@models/Plan';
import type Location from '@models/Location';
import { Q } from '@nozbe/watermelondb';
import { uploadToS3 } from '@services/S3Service';
import { s3ProjectPrefix } from '@config/aws';
import { downloadPlansFromS3 } from '@services/S3SyncService';

interface Props {
  projectId: string;
  projectName: string;
  onBack: () => void;
  onOpenPlan: (planId: string, planName: string) => void;
}

export default function PlansManagementScreen({ projectId, projectName, onBack, onOpenPlan }: Props) {
  const { currentUser } = useAuth();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [uploading, setUploading] = useState(false);
  const [relinking, setRelinking] = useState(false);
  const [pulling, setPulling] = useState(false);

  const canManage = currentUser?.role === 'RESIDENT' || currentUser?.role === 'CREATOR';

  useEffect(() => {
    const sub1 = plansCollection.query(Q.where('project_id', projectId)).observe().subscribe(setPlans);
    const sub2 = locationsCollection.query(Q.where('project_id', projectId)).observe().subscribe(setLocations);
    return () => { sub1.unsubscribe(); sub2.unsubscribe(); };
  }, [projectId]);

  /** Devuelve TODAS las ubicaciones que referencian este nombre de plano */
  const findMatchingLocations = (planName: string, locs: typeof locations) =>
    locs.filter((loc) => {
      const refs = (loc.referencePlan ?? '');
      const names = refs.split(/[,;]/).map((s) => s.trim().toLowerCase()).filter(Boolean);
      return names.includes(planName.toLowerCase().trim());
    });

  // Procesa un PDF: crea un registro de plan por cada ubicación que lo referencia
  const processAsset = async (
    asset: { uri: string; name?: string | null },
    destDir: string,
    linked: string[], unlinked: string[], skipped: string[]
  ) => {
    const fileName = asset.name ?? `plan_${Date.now()}.pdf`;
    const planName = fileName.replace(/\.pdf$/i, '');
    const destUri = `${destDir}${fileName}`;

    // Planos ya existentes con este nombre (puede haber varios, uno por ubicación)
    const existingPlans = plans.filter((p) => p.name.toLowerCase() === planName.toLowerCase());
    const existingLocIds = new Set(existingPlans.map((p) => p.locationId).filter(Boolean));

    // Todas las ubicaciones que referencian este plano
    const matchingLocs = findMatchingLocations(planName, locations);

    // Ubicaciones que aún no tienen registro para este plano
    const newLocs = matchingLocs.filter((loc) => !existingLocIds.has(loc.id));

    if (newLocs.length === 0 && existingPlans.length > 0) {
      skipped.push(planName);
      return;
    }

    // Copiar el archivo solo si no existe aún en disco
    const fileExists = existingPlans.length > 0;
    const finalUri = fileExists ? existingPlans[0].fileUri : destUri;
    if (!fileExists) {
      await FileSystem.copyAsync({ from: asset.uri, to: finalUri });
      // Subir a S3 (no bloquea si falla)
      try {
        await uploadToS3(
          finalUri,
          `${s3ProjectPrefix(projectName)}/plans/${fileName}`,
          'application/pdf'
        );
      } catch (e) {
        console.warn('[S3] No se pudo subir plano:', e);
      }
    }

    if (newLocs.length > 0) {
      for (const loc of newLocs) {
        await database.write(async () => {
          await plansCollection.create((p) => {
            p.projectId = projectId;
            p.locationId = loc.id;
            p.name = planName;
            p.fileUri = finalUri;
            p.uploadedById = currentUser?.id ?? '';
          });
        });
        linked.push(planName);
      }
    } else if (!fileExists) {
      // Sin ubicación coincidente: guardar sin vincular
      await database.write(async () => {
        await plansCollection.create((p) => {
          p.projectId = projectId;
          p.locationId = null;
          p.name = planName;
          p.fileUri = finalUri;
          p.uploadedById = currentUser?.id ?? '';
        });
      });
      unlinked.push(planName);
    }
  };

  // Re-vincular: para cada plano sin ubicación, crea registros para TODAS las ubicaciones coincidentes
  const handleRelink = async () => {
    setRelinking(true);
    const linked: string[] = [];
    const noMatch: string[] = [];
    try {
      const freshPlans = await plansCollection.query(Q.where('project_id', projectId)).fetch();
      const freshLocations = await locationsCollection.query(Q.where('project_id', projectId)).fetch();

      // Agrupar planes existentes por nombre
      const plansByName = new Map<string, typeof freshPlans>();
      for (const plan of freshPlans) {
        const key = plan.name.toLowerCase().trim();
        if (!plansByName.has(key)) plansByName.set(key, []);
        plansByName.get(key)!.push(plan);
      }

      for (const [planNameLower, plansForName] of plansByName) {
        const matchingLocs = freshLocations.filter((loc) => {
          const refs = ((loc as any).referencePlan ?? '');
          const names = refs.split(/[,;]/).map((s: string) => s.trim().toLowerCase()).filter(Boolean);
          return names.includes(planNameLower);
        });

        if (matchingLocs.length === 0) {
          const hasUnlinked = plansForName.some((p) => !(p as any).locationId);
          if (hasUnlinked) noMatch.push(plansForName[0].name);
          continue;
        }

        const existingLocIds = new Set(plansForName.map((p) => (p as any).locationId).filter(Boolean));
        const fileUri = plansForName[0].fileUri;
        const unlinkedPlan = plansForName.find((p) => !(p as any).locationId);
        let usedUnlinked = false;

        for (const loc of matchingLocs) {
          if (existingLocIds.has(loc.id)) continue; // ya vinculado a esta ubicación

          if (unlinkedPlan && !usedUnlinked) {
            // Reutilizar el registro existente sin ubicación
            await database.write(async () => {
              await unlinkedPlan.update((p: any) => { p.locationId = (loc as any).id; });
            });
            usedUnlinked = true;
          } else {
            // Crear nuevo registro para esta ubicación (mismo archivo PDF)
            await database.write(async () => {
              await plansCollection.create((p) => {
                p.projectId = projectId;
                p.locationId = (loc as any).id;
                p.name = plansForName[0].name;
                p.fileUri = fileUri;
                p.uploadedById = plansForName[0].uploadedById;
              });
            });
          }
          existingLocIds.add(loc.id);
          linked.push(plansForName[0].name);
        }
      }
    } finally {
      setRelinking(false);
    }
    const lines: string[] = [];
    if (linked.length) lines.push(`Vinculados (${linked.length}): ${linked.join(', ')}`);
    if (noMatch.length) lines.push(`Sin coincidencia (${noMatch.length}): ${noMatch.join(', ')}`);
    Alert.alert('Re-vincular', lines.length ? lines.join('\n') : 'Todos los planos ya tienen ubicación.');
  };

  const handlePullFromS3 = async () => {
    if (!currentUser) return;
    setPulling(true);
    try {
      const result = await downloadPlansFromS3(projectId, projectName, currentUser.id);
      const lines: string[] = [];
      if (result.downloaded > 0) lines.push(`Descargados: ${result.downloaded}`);
      if (result.skipped > 0) lines.push(`Ya existían: ${result.skipped}`);
      if (result.error) lines.push(`Error: ${result.error}`);
      Alert.alert('Pull S3', lines.length ? lines.join('\n') : 'No se encontraron planos nuevos en S3.');
    } catch (e) {
      Alert.alert('Error', String(e));
    } finally {
      setPulling(false);
    }
  };

  const handleUpload = async () => {
    setUploading(true);
    const destDir = `${FileSystem.documentDirectory}plans/`;
    await FileSystem.makeDirectoryAsync(destDir, { intermediates: true });

    const linked: string[] = [];
    const unlinked: string[] = [];
    const skipped: string[] = [];

    // Bucle: sigue pidiendo archivos hasta que el usuario cancele
    let keepGoing = true;
    while (keepGoing) {
      try {
        const result = await DocumentPicker.getDocumentAsync({
          type: 'application/pdf',
          copyToCacheDirectory: true,
        });

        if (result.canceled || !result.assets?.length) {
          keepGoing = false;
          break;
        }

        await processAsset(result.assets[0], destDir, linked, unlinked, skipped);
      } catch {
        Alert.alert('Error', 'No se pudo cargar el plano.');
        break;
      }

      // Preguntar si quiere agregar otro
      keepGoing = await new Promise<boolean>((resolve) => {
        Alert.alert(
          'Plano agregado',
          `Total cargados: ${linked.length + unlinked.length}. ¿Agregar otro plano?`,
          [
            { text: 'Terminar', style: 'cancel', onPress: () => resolve(false) },
            { text: 'Agregar otro', onPress: () => resolve(true) },
          ]
        );
      });
    }

    setUploading(false);

    if (linked.length + unlinked.length + skipped.length > 0) {
      const lines: string[] = [];
      if (linked.length) lines.push(`Vinculados (${linked.length}): ${linked.join(', ')}`);
      if (unlinked.length) lines.push(`Sin ubicacion (${unlinked.length}): ${unlinked.join(', ')}`);
      if (skipped.length) lines.push(`Ya existian, omitidos (${skipped.length}): ${skipped.join(', ')}`);
      Alert.alert('Resumen', lines.join('\n'));
    }
  };

  const handleDelete = (plan: Plan) => {
    Alert.alert('Eliminar plano', `¿Eliminar "${plan.name}"?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar', style: 'destructive',
        onPress: async () => {
          // Solo borrar el archivo si ningún otro registro lo usa
          const sharedPlans = plans.filter((p) => p.fileUri === plan.fileUri);
          if (sharedPlans.length <= 1) {
            try { await FileSystem.deleteAsync(plan.fileUri, { idempotent: true }); } catch { /* */ }
          }
          await database.write(async () => { await plan.destroyPermanently(); });
        },
      },
    ]);
  };

  const getLocationName = (locationId: string | null) => {
    if (!locationId) return null;
    return locations.find((l) => l.id === locationId)?.name ?? null;
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn}>
          <Text style={styles.backText}>Volver</Text>
        </TouchableOpacity>
        <View>
          <Text style={styles.title}>PLANOS</Text>
          <Text style={styles.subtitle}>{projectName}</Text>
        </View>
        <View style={{ width: 60 }} />
      </View>

      <View style={styles.uploadBar}>
        {canManage && (
          <TouchableOpacity
            style={[styles.uploadBtn, uploading && styles.btnDisabled]}
            onPress={handleUpload}
            disabled={uploading}
          >
            {uploading
              ? <ActivityIndicator color="#fff" size="small" />
              : <Text style={styles.uploadBtnText}>Subir plano(s) PDF</Text>
            }
          </TouchableOpacity>
        )}
        <TouchableOpacity
          style={[styles.pullBtn, pulling && styles.btnDisabled]}
          onPress={handlePullFromS3}
          disabled={pulling}
        >
          {pulling
            ? <ActivityIndicator color="#fff" size="small" />
            : <Text style={styles.pullBtnText}>⬇ Pull PDFs desde S3</Text>
          }
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.relinkBtn, relinking && styles.btnDisabled]}
          onPress={handleRelink}
          disabled={relinking}
        >
          {relinking
            ? <ActivityIndicator color={Colors.primary} size="small" />
            : <Text style={styles.relinkBtnText}>Re-vincular planos existentes</Text>
          }
        </TouchableOpacity>
        {canManage && (
          <Text style={styles.hint}>
            El nombre del PDF debe coincidir con el "Plano de referencia" de la ubicación
          </Text>
        )}
      </View>

      <FlatList
        data={plans}
        keyExtractor={(p) => p.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <Text style={styles.empty}>
            {canManage ? 'Sube el primer plano con el botón de arriba.' : 'No hay planos disponibles.'}
          </Text>
        }
        renderItem={({ item }) => {
          const locName = getLocationName(item.locationId);
          return (
            <TouchableOpacity
              style={styles.card}
              onPress={() => onOpenPlan(item.id, item.name)}
              activeOpacity={0.8}
            >
              <View style={styles.pdfIcon}>
                <Text style={styles.pdfIconText}>PDF</Text>
              </View>
              <View style={styles.cardInfo}>
                <Text style={styles.planName}>{item.name}</Text>
                {locName && (
                  <Text style={styles.locationTag}>Ubicacion: {locName}</Text>
                )}
                {!locName && (
                  <Text style={styles.noLocation}>Sin ubicacion vinculada</Text>
                )}
                <Text style={styles.date}>
                  {new Date(item.createdAt).toLocaleString('es-CL')}
                </Text>
              </View>
              <View style={styles.cardRight}>
                <Text style={styles.openText}>Abrir ›</Text>
                {canManage && (
                  <TouchableOpacity
                    onPress={() => handleDelete(item)}
                    style={styles.deleteBtn}
                  >
                    <Text style={styles.deleteText}>Eliminar</Text>
                  </TouchableOpacity>
                )}
              </View>
            </TouchableOpacity>
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
  title: { fontSize: 14, fontWeight: '700', color: Colors.white, textAlign: 'center', letterSpacing: 1 },
  subtitle: { fontSize: 11, color: Colors.light, textAlign: 'center' },
  uploadBar: {
    padding: 16, gap: 6, backgroundColor: Colors.white,
    borderBottomWidth: 1, borderBottomColor: Colors.divider,
  },
  uploadBtn: {
    backgroundColor: Colors.primary, borderRadius: Radius.md, padding: 14, alignItems: 'center',
  },
  btnDisabled: { backgroundColor: Colors.light },
  uploadBtnText: { color: Colors.white, fontWeight: '700', fontSize: 13, letterSpacing: 0.5 },
  hint: { fontSize: 11, color: Colors.textMuted, textAlign: 'center' },
  list: { padding: 16, gap: 10 },
  empty: { textAlign: 'center', color: Colors.textMuted, marginTop: 40, lineHeight: 24 },
  card: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: Colors.white, borderRadius: Radius.lg, padding: 14,
    ...Shadow.subtle,
  },
  pdfIcon: {
    width: 44, height: 44, borderRadius: Radius.md, backgroundColor: Colors.navy,
    alignItems: 'center', justifyContent: 'center',
  },
  pdfIconText: { color: Colors.white, fontSize: 10, fontWeight: '900', letterSpacing: 0.5 },
  cardInfo: { flex: 1 },
  planName: { fontSize: 14, fontWeight: '700', color: Colors.navy },
  locationTag: { fontSize: 12, color: Colors.success, marginTop: 3 },
  noLocation: { fontSize: 12, color: Colors.textMuted, marginTop: 3 },
  date: { fontSize: 11, color: Colors.textMuted, marginTop: 3 },
  cardRight: { alignItems: 'center', gap: 8 },
  openText: { fontSize: 12, color: Colors.primary, fontWeight: '700', letterSpacing: 0.5 },
  deleteBtn: {
    paddingHorizontal: 8, paddingVertical: 4, borderRadius: Radius.sm,
    borderWidth: 1, borderColor: Colors.danger,
  },
  deleteText: { fontSize: 10, color: Colors.danger, fontWeight: '600' },
  pullBtn: {
    backgroundColor: '#1a7f4b', borderRadius: Radius.md, padding: 14, alignItems: 'center',
  },
  pullBtnText: { color: Colors.white, fontWeight: '700', fontSize: 13, letterSpacing: 0.5 },
  relinkBtn: {
    borderWidth: 1, borderColor: Colors.primary, borderRadius: Radius.md,
    padding: 12, alignItems: 'center',
  },
  relinkBtnText: { color: Colors.primary, fontWeight: '700', fontSize: 13 },
});
