import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  Alert, ActivityIndicator,
} from 'react-native';
import AppHeader from '@components/AppHeader';
import { useI18n } from '@i18n/index';
import { useTourStep } from '@hooks/useTourStep';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Colors, Radius, Shadow } from '../theme/colors';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import { database, plansCollection, locationsCollection } from '@db/index';
import { useAuth } from '@context/AuthContext';
import { useNetwork } from '@context/NetworkContext';
import type Plan from '@models/Plan';
import type Location from '@models/Location';
import { Q } from '@nozbe/watermelondb';
import { uploadToS3 } from '@services/S3Service';
import { s3ProjectPrefix } from '@config/aws';
import { downloadPlansFromS3 } from '@services/S3SyncService';
import { pushPlansToSupabase } from '@services/SupabaseSyncService';

interface Props {
  projectId: string;
  projectName: string;
  mode?: 'viewer' | 'measure';
  onBack: () => void;
  onOpenPlan: (planId: string, planName: string) => void;
}

// Deduplica por nombre quedándose con el plano más antiguo (mismo criterio que usa MeasurementScreen)
function dedupePlansByName(list: Plan[]): Plan[] {
  const byName = new Map<string, Plan>();
  for (const p of list) {
    const key = p.name.trim().toLowerCase();
    const prev = byName.get(key);
    if (!prev || p.createdAt < prev.createdAt) byName.set(key, p);
  }
  return Array.from(byName.values());
}

// ─── Metadata visual por especialidad ────────────────────────────────────────
type SpecialtyVisual = {
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  color: string;
  bg: string;
};

// ─── Normalización robusta de especialidades ────────────────────────────────
// Todas las especialidades se agrupan por las PRIMERAS 3 LETRAS del texto normalizado
// (minúsculas, sin acentos, sin espacios iniciales). Así "ARQ", "Arquitectura", "arq "
// y "arq_fachada" caen en el mismo grupo con nombre canónico "ARQUITECTURA".

function normalizeSpec(s: string): string {
  return s.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

function specGroupKey(s: string): string {
  const n = normalizeSpec(s);
  if (!n) return '';
  return n.slice(0, 3);
}

const CANONICAL_BY_KEY: Record<string, string> = {
  arq: 'ARQUITECTURA',
  cim: 'CIMENTACIÓN',
  est: 'ESTRUCTURAL',
  iie: 'IIEE',
  iis: 'IISS',
  ele: 'ELÉCTRICAS',
  san: 'SANITARIAS',
  gas: 'GAS',
  mec: 'MECÁNICA',
  com: 'COMUNICACIONES',
  tel: 'TELECOMUNICACIONES',
  dat: 'DATA',
  agu: 'AGUA',
  hid: 'HIDRÁULICA',
  aco: 'ACABADOS',
  aca: 'ACABADOS',
};

function canonicalSpecName(key: string, originals: string[]): string {
  if (!key) return 'Sin especialidad';
  const canon = CANONICAL_BY_KEY[key];
  if (canon) return canon;
  // Fallback: usar el primer original tal cual lo escribió el usuario (mayúsculas)
  const raw = originals[0]?.trim();
  return raw ? raw.toUpperCase() : key.toUpperCase();
}

// Icono por clave de 3 letras (más estable que regex sobre el texto completo).
const ICON_BY_KEY: Record<string, keyof typeof MaterialCommunityIcons.glyphMap> = {
  arq: 'floor-plan',
  cim: 'layers-triple',
  est: 'pillar',
  iie: 'lightning-bolt',
  iis: 'water',
  ele: 'lightning-bolt',
  san: 'water',
  agu: 'water',
  hid: 'water',
  gas: 'fire',
  mec: 'cog',
  com: 'wifi',
  tel: 'wifi',
  dat: 'server-network',
  aco: 'palette-outline',
  aca: 'palette-outline',
};

function iconForKey(key: string): keyof typeof MaterialCommunityIcons.glyphMap {
  return ICON_BY_KEY[key] || 'file-tree';
}

// ─── Lista agrupada por especialidad con secciones colapsables ───────────────
type GroupProps = {
  plans: Plan[];
  locations: Location[];
  mode: 'viewer' | 'measure';
  canManage: boolean;
  firstCardRef: React.RefObject<any>;
  onOpenPlan: (planId: string, planName: string) => void;
  onDelete: (p: Plan) => void;
  getLocationName: (id: string | null) => string | null;
};

function SpecialtyGroupedList({
  plans, locations, mode, canManage, firstCardRef, onOpenPlan, onDelete, getLocationName,
}: GroupProps) {
  const { t } = useI18n();
  const locById = React.useMemo(() => {
    const m = new Map<string, Location>();
    for (const l of locations) m.set(l.id, l);
    return m;
  }, [locations]);

  const rawSpecialtyOf = (p: Plan): string => {
    if (!p.locationId) return '';
    const loc = locById.get(p.locationId) as any;
    return (loc?.specialty ?? '').toString();
  };

  const groups = React.useMemo(() => {
    const byKey = new Map<string, { originals: string[]; plans: Plan[] }>();
    for (const p of plans) {
      const raw = rawSpecialtyOf(p);
      const k = specGroupKey(raw); // "" si no hay especialidad
      const entry = byKey.get(k);
      if (entry) {
        entry.plans.push(p);
        if (raw && !entry.originals.includes(raw)) entry.originals.push(raw);
      } else {
        byKey.set(k, { originals: raw ? [raw] : [], plans: [p] });
      }
    }
    const keys = Array.from(byKey.keys()).sort((a, b) => {
      if (a === '') return 1;
      if (b === '') return -1;
      return a.localeCompare(b);
    });
    return keys.map((k) => {
      const entry = byKey.get(k)!;
      return {
        key: k,
        specialty: canonicalSpecName(k, entry.originals),
        plans: entry.plans,
      };
    });
  }, [plans, locById]);

  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  // Por defecto: abiertas si hay una sola especialidad, si no, solo la primera
  useEffect(() => {
    setExpanded((prev) => {
      if (Object.keys(prev).length > 0) return prev;
      const init: Record<string, boolean> = {};
      groups.forEach((g, i) => { init[g.specialty] = i === 0; });
      return init;
    });
  }, [groups]);

  const toggle = (k: string) => setExpanded((p) => ({ ...p, [k]: !p[k] }));

  if (groups.length === 0) {
    return (
      <View style={styles.list}>
        <Text style={styles.empty}>
          {canManage ? t('plansMgmt.empty.canManage') : t('plansMgmt.empty.readonly')}
        </Text>
      </View>
    );
  }

  // Referencia del tour: la primera tarjeta del primer grupo
  let cardCounter = 0;

  return (
    <FlatList
      data={groups}
      keyExtractor={(g) => g.specialty}
      contentContainerStyle={styles.list}
      renderItem={({ item: group }) => {
        const isOpen = !!expanded[group.specialty];
        const icon = iconForKey(group.key);
        return (
          <View style={styles.groupWrap}>
            <TouchableOpacity
              style={styles.groupHeader}
              onPress={() => toggle(group.specialty)}
              activeOpacity={0.75}
            >
              <MaterialCommunityIcons name={icon} size={26} color={Colors.navy} />
              <View style={{ flex: 1 }}>
                <Text style={styles.groupTitle}>{group.specialty}</Text>
                <Text style={styles.groupSubtitle}>
                  {group.plans.length === 1
                    ? t('plansMgmt.group.countOne', { count: group.plans.length })
                    : t('plansMgmt.group.countOther', { count: group.plans.length })}
                </Text>
              </View>
              <View style={styles.groupCount}>
                <Text style={styles.groupCountText}>{group.plans.length}</Text>
              </View>
              <MaterialCommunityIcons
                name={isOpen ? 'chevron-down' : 'chevron-right'}
                size={22}
                color={Colors.textMuted}
              />
            </TouchableOpacity>
            {isOpen && (
              <View style={styles.groupBody}>
                {group.plans.map((item) => {
                  const locName = getLocationName(item.locationId);
                  const isFirst = cardCounter++ === 0;
                  return (
                    <TouchableOpacity
                      key={item.id}
                      ref={isFirst ? firstCardRef : undefined}
                      style={styles.card}
                      onPress={() => onOpenPlan(item.id, item.name)}
                      activeOpacity={0.8}
                    >
                      <View style={styles.pdfIcon}>
                        <Text style={styles.pdfIconText}>PDF</Text>
                      </View>
                      <View style={styles.cardInfo}>
                        <Text style={styles.planName}>{item.name}</Text>
                        {locName ? (
                          <Text style={styles.locationTag}>{t('plansMgmt.card.location', { name: locName })}</Text>
                        ) : (
                          <Text style={styles.noLocation}>{t('plansMgmt.card.noLocation')}</Text>
                        )}
                        <Text style={styles.date}>
                          {new Date(item.createdAt).toLocaleString('es-CL')}
                        </Text>
                      </View>
                      <View style={styles.cardRight}>
                        <Text style={styles.openText}>{mode === 'measure' ? t('plansMgmt.card.measure') : t('plansMgmt.card.open')}</Text>
                        {canManage && mode !== 'measure' && (
                          <TouchableOpacity onPress={() => onDelete(item)} style={styles.deleteBtn}>
                            <Text style={styles.deleteText}>{t('plansMgmt.card.delete')}</Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
          </View>
        );
      }}
    />
  );
}

export default function PlansManagementScreen({ projectId, projectName, mode = 'viewer', onBack, onOpenPlan }: Props) {
  const { t } = useI18n();
  const { currentUser } = useAuth();
  const { isOnline } = useNetwork();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [uploading, setUploading] = useState(false);
  const [relinking, setRelinking] = useState(false);
  const [pulling, setPulling] = useState(false);
  const firstCardRef = useTourStep('planos_list_card');

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

    // Consulta fresca para evitar usar el state desactualizado al momento de subir
    const freshLocs = await locationsCollection.query(Q.where('project_id', projectId)).fetch();
    const matchingLocs = findMatchingLocations(planName, freshLocs);

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
    if (linked.length > 0) {
      pushPlansToSupabase(projectId).catch(() => {});
    }
    const lines: string[] = [];
    if (linked.length) lines.push(t('plansMgmt.relink.linked', { count: linked.length, names: linked.join(', ') }));
    if (noMatch.length) lines.push(t('plansMgmt.relink.noMatch', { count: noMatch.length, names: noMatch.join(', ') }));
    Alert.alert(t('plansMgmt.relink.alertTitle'), lines.length ? lines.join('\n') : t('plansMgmt.relink.allLinked'));
  };

  /** Sincroniza planos: descarga PDFs nuevos desde S3 y luego revincula a sus ubicaciones. */
  const handleSyncPlans = async () => {
    if (!currentUser || pulling || relinking) return;
    setPulling(true);
    let pullSummary = '';
    try {
      const result = await downloadPlansFromS3(projectId, projectName, currentUser.id);
      const parts: string[] = [];
      if (result.downloaded > 0) parts.push(t('plansMgmt.syncAlert.downloaded', { count: result.downloaded }));
      if (result.skipped > 0) parts.push(t('plansMgmt.syncAlert.skipped', { count: result.skipped }));
      if (result.error) parts.push(t('plansMgmt.syncAlert.error', { error: result.error }));
      pullSummary = parts.length ? parts.join(' · ') : t('plansMgmt.syncAlert.noNew');
    } catch (e) {
      pullSummary = t('plansMgmt.syncAlert.s3Error', { error: String(e) });
    } finally {
      setPulling(false);
    }

    setRelinking(true);
    const linked: string[] = [];
    const noMatch: string[] = [];
    try {
      const freshPlans = await plansCollection.query(Q.where('project_id', projectId)).fetch();
      const freshLocations = await locationsCollection.query(Q.where('project_id', projectId)).fetch();
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
          if (existingLocIds.has(loc.id)) continue;
          if (unlinkedPlan && !usedUnlinked) {
            await database.write(async () => {
              await unlinkedPlan.update((p: any) => { p.locationId = (loc as any).id; });
            });
            usedUnlinked = true;
          } else {
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
    if (linked.length > 0) pushPlansToSupabase(projectId).catch(() => {});

    const lines: string[] = [pullSummary];
    if (linked.length) lines.push(t('plansMgmt.syncAlert.linkedCount', { count: linked.length }));
    if (noMatch.length) lines.push(t('plansMgmt.syncAlert.noMatchCount', { count: noMatch.length }));
    if (!linked.length && !noMatch.length) lines.push(t('plansMgmt.syncAlert.upToDate'));
    Alert.alert(t('plansMgmt.syncAlert.title'), lines.join('\n'));
  };

  const handlePullFromS3 = async () => {
    if (!currentUser) return;
    setPulling(true);
    try {
      const result = await downloadPlansFromS3(projectId, projectName, currentUser.id);
      const lines: string[] = [];
      if (result.downloaded > 0) lines.push(t('plansMgmt.pullAlert.downloaded', { count: result.downloaded }));
      if (result.skipped > 0) lines.push(t('plansMgmt.pullAlert.skipped', { count: result.skipped }));
      if (result.error) lines.push(t('plansMgmt.pullAlert.error', { error: result.error }));
      Alert.alert(t('plansMgmt.pullAlert.title'), lines.length ? lines.join('\n') : t('plansMgmt.pullAlert.none'));
    } catch (e) {
      Alert.alert(t('plansMgmt.errorTitle'), String(e));
    } finally {
      setPulling(false);
    }
  };

  const handleUpload = async () => {
    if (!isOnline) {
      Alert.alert(
        t('plansMgmt.upload.offlineTitle'),
        t('plansMgmt.upload.offlineMsg'),
      );
      return;
    }
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
        Alert.alert(t('plansMgmt.errorTitle'), t('plansMgmt.upload.loadError'));
        break;
      }

      // Preguntar si quiere agregar otro
      keepGoing = await new Promise<boolean>((resolve) => {
        Alert.alert(
          t('plansMgmt.upload.addedTitle'),
          t('plansMgmt.upload.addedMsg', { count: linked.length + unlinked.length }),
          [
            { text: t('plansMgmt.upload.finish'), style: 'cancel', onPress: () => resolve(false) },
            { text: t('plansMgmt.upload.addAnother'), onPress: () => resolve(true) },
          ]
        );
      });
    }

    setUploading(false);

    // Pushear inmediatamente a Supabase para que el siguiente pull no elimine los registros locales
    if (linked.length + unlinked.length > 0) {
      pushPlansToSupabase(projectId).catch(() => {});
    }

    if (linked.length + unlinked.length + skipped.length > 0) {
      const lines: string[] = [];
      if (linked.length) lines.push(t('plansMgmt.upload.summaryLinked', { count: linked.length, names: linked.join(', ') }));
      if (unlinked.length) lines.push(t('plansMgmt.upload.summaryUnlinked', { count: unlinked.length, names: unlinked.join(', ') }));
      if (skipped.length) lines.push(t('plansMgmt.upload.summarySkipped', { count: skipped.length, names: skipped.join(', ') }));
      Alert.alert(t('plansMgmt.upload.summaryTitle'), lines.join('\n'));
    }
  };

  const handleDelete = (plan: Plan) => {
    Alert.alert(t('plansMgmt.delete.title'), t('plansMgmt.delete.message', { name: plan.name }), [
      { text: t('plansMgmt.delete.cancel'), style: 'cancel' },
      {
        text: t('plansMgmt.delete.confirm'), style: 'destructive',
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
      <AppHeader title={mode === 'measure' ? t('plansMgmt.title.measure') : t('plansMgmt.title.viewer')} subtitle={projectName} onBack={onBack} />

      {mode === 'measure' && (
        <View style={styles.measureBar}>
          <TouchableOpacity
            style={[styles.syncBtn, (pulling || relinking) && styles.syncBtnDisabled]}
            onPress={handleSyncPlans}
            disabled={pulling || relinking}
            activeOpacity={0.85}
          >
            <View style={styles.syncBtnIcon}>
              {(pulling || relinking)
                ? <ActivityIndicator color={Colors.white} size="small" />
                : <MaterialCommunityIcons name="cloud-sync-outline" size={20} color={Colors.white} />}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.syncBtnTitle}>
                {pulling ? t('plansMgmt.sync.downloading') : relinking ? t('plansMgmt.sync.linking') : t('plansMgmt.sync.title')}
              </Text>
              <Text style={styles.syncBtnSubtitle} numberOfLines={1}>
                {t('plansMgmt.sync.subtitle')}
              </Text>
            </View>
            <MaterialCommunityIcons name="chevron-right" size={20} color={Colors.white} style={{ opacity: 0.85 }} />
          </TouchableOpacity>
        </View>
      )}

      {mode !== 'measure' && (
      <View style={styles.uploadBar}>
        {canManage && (
          <TouchableOpacity
            style={[styles.uploadBtn, uploading && styles.btnDisabled]}
            onPress={handleUpload}
            disabled={uploading}
          >
            {uploading
              ? <ActivityIndicator color="#fff" size="small" />
              : <Text style={styles.uploadBtnText}>{t('plansMgmt.upload.button')}</Text>
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
            : <Text style={styles.pullBtnText}>{t('plansMgmt.pull.button')}</Text>
          }
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.relinkBtn, relinking && styles.btnDisabled]}
          onPress={handleRelink}
          disabled={relinking}
        >
          {relinking
            ? <ActivityIndicator color={Colors.primary} size="small" />
            : <Text style={styles.relinkBtnText}>{t('plansMgmt.relink.button')}</Text>
          }
        </TouchableOpacity>
        {canManage && (
          <Text style={styles.hint}>
            {t('plansMgmt.hint')}
          </Text>
        )}
      </View>
      )}

      <SpecialtyGroupedList
        plans={mode === 'measure' ? dedupePlansByName(plans) : plans}
        locations={locations}
        mode={mode}
        canManage={canManage}
        firstCardRef={firstCardRef}
        onOpenPlan={onOpenPlan}
        onDelete={handleDelete}
        getLocationName={getLocationName}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.surface },
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
  groupWrap: {
    backgroundColor: Colors.white,
    borderRadius: Radius.lg, overflow: 'hidden',
    borderWidth: 1, borderColor: Colors.border,
    ...Shadow.card,
  },
  groupHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 14, paddingVertical: 14,
    backgroundColor: Colors.white,
  },
  groupTitle: {
    fontSize: 15, fontWeight: '800', color: Colors.navy,
    letterSpacing: 0.5, textTransform: 'uppercase',
  },
  groupSubtitle: {
    fontSize: 11, color: Colors.textMuted, fontWeight: '600', marginTop: 2,
  },
  groupCount: {
    minWidth: 28, height: 28, paddingHorizontal: 8,
    borderRadius: 14, alignItems: 'center', justifyContent: 'center',
    backgroundColor: Colors.navy,
  },
  groupCountText: { color: Colors.white, fontSize: 12, fontWeight: '900' },
  groupBody: {
    gap: 8, padding: 10,
    backgroundColor: Colors.surface,
    borderTopWidth: 1, borderTopColor: Colors.divider,
  },
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
  measureBar: {
    paddingHorizontal: 12, paddingTop: 10, paddingBottom: 4,
    backgroundColor: Colors.surface,
  },
  syncBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.navy,
    borderRadius: Radius.md,
    paddingVertical: 10,
    paddingHorizontal: 12,
    gap: 12,
    ...Shadow.subtle,
  },
  syncBtnDisabled: { opacity: 0.7 },
  syncBtnIcon: {
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: 'rgba(255,255,255,0.14)',
    alignItems: 'center', justifyContent: 'center',
  },
  syncBtnTitle: {
    color: Colors.white, fontSize: 14, fontWeight: '700', letterSpacing: 0.3,
  },
  syncBtnSubtitle: {
    color: 'rgba(255,255,255,0.78)', fontSize: 11, marginTop: 1,
  },
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
