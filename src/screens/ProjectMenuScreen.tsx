/**
 * ProjectMenuScreen — pantalla intermedia que se abre al entrar a un proyecto.
 *
 * v29 — Se añadieron Planos, Cargar archivos y Contactos (movidos desde la
 * tarjeta de proyecto). "Ver mapa" se renombró a "Geolocalización" (gateado
 * por map_enabled). Trazabilidad sigue gateada por traceability_module.
 */
import React, { useCallback, useRef, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@navigation/types';
import AppHeader from '@components/AppHeader';
import { Colors, Radius, Shadow } from '../theme/colors';
import { Q } from '@nozbe/watermelondb';
import { projectsCollection, protocolsCollection } from '@db/index';
import { parseFeatureFlagsJson, isTraceabilityEnabled, isGeolocationEnabled } from '@utils/featureFlags';
import { pullProjectSettings, pullProjectFromCloud } from '@services/SupabaseSyncService';
import { useTourStep } from '@hooks/useTourStep';
import { useAuth } from '@context/AuthContext';
import { useI18n } from '@i18n/index';

type Props = NativeStackScreenProps<RootStackParamList, 'ProjectMenu'>;

interface MenuOption {
  key: string;
  title: string;
  subtitle: string;
  icon: string;
  tone: string;
  onPress: () => void;
  /** Si true, opción visible solo cuando el flag corresponde está activo. */
  flagKey?: keyof ReturnType<typeof parseFeatureFlagsJson>;
}

export default function ProjectMenuScreen({ route, navigation }: Props) {
  const { projectId, projectName } = route.params;
  const insets = useSafeAreaInsets();
  const { currentUser } = useAuth();
  const { t } = useI18n();
  // v29 — Solo CREATOR y RESIDENT pueden subir archivos al proyecto.
  // SUPERVISOR/OPERATOR ven el resto del menú pero no esta opción.
  const canUploadFiles = currentUser?.role === 'CREATOR' || currentUser?.role === 'RESIDENT';
  const [flags, setFlags] = useState<ReturnType<typeof parseFeatureFlagsJson> | null>(null);
  // Refs para el tour — anclan los pasos planos_button / fileupload_entry.
  const planosRef = useTourStep('menu_planos');
  const fileUploadRef = useTourStep('menu_file_upload');

  // Parte C — contadores de la tarjeta "Dossier de calidad" (mismos estados
  // que los mini-badges de la lista de proyectos).
  const [dossierCounts, setDossierCounts] = useState({ approved: 0, submitted: 0, rejected: 0 });

  const loadFlags = useCallback(() => projectsCollection.find(projectId).then((p: any) => {
    setFlags(parseFeatureFlagsJson(p?.featureFlags));
  }).catch(() => {}), [projectId]);

  const recountDossier = useCallback(() => protocolsCollection.query(Q.where('project_id', projectId)).fetch().then(protos => {
    setDossierCounts({
      approved: protos.filter(pr => (pr as any).status === 'APPROVED').length,
      submitted: protos.filter(pr => (pr as any).status === 'SUBMITTED').length,
      rejected: protos.filter(pr => (pr as any).status === 'REJECTED').length,
    });
  }).catch(() => {}), [projectId]);

  // v43 — En CADA focus (volver de aprobar/enviar un ensayo) recontamos LOCAL al
  // instante → los contadores del "Dossier de calidad" se actualizan. El pull
  // completo de la nube se hace UNA vez al ENTRAR al proyecto (no en cada regreso
  // de subpantalla, para no recargar la red innecesariamente).
  const didPullRef = useRef(false);
  useFocusEffect(useCallback(() => {
    loadFlags();
    recountDossier();
    if (!didPullRef.current) {
      didPullRef.current = true;
      pullProjectSettings(projectId).then(loadFlags).catch(() => {});
      pullProjectFromCloud(projectId).then(recountDossier).catch(() => {});
    }
  }, [projectId, loadFlags, recountDossier]));

  const options: MenuOption[] = [
    {
      key: 'locations',
      title: t('projectMenu.locationsTitle'),
      subtitle: t('projectMenu.locationsSubtitle'),
      icon: 'list-outline',
      tone: Colors.primary,
      onPress: () => navigation.navigate('LocationList', { projectId, projectName }),
      flagKey: 'module_protocols_by_location',
    },
    // ── v31 (Parte D) — modos de llenado adicionales (conviven entre sí) ──
    {
      key: 'ensayos-sector',
      title: t('projectMenu.ensayosSectorTitle'),
      subtitle: t('projectMenu.ensayosSectorSubtitle'),
      icon: 'grid-outline',
      tone: Colors.success,
      onPress: () => navigation.navigate('Ensayos', { projectId, projectName, mode: 'sector' }),
      flagKey: 'fill_by_sector',
    },
    {
      key: 'ensayos-type',
      title: t('projectMenu.ensayosTypeTitle'),
      subtitle: t('projectMenu.ensayosTypeSubtitle'),
      icon: 'flask-outline',
      tone: Colors.secondary,
      onPress: () => navigation.navigate('Ensayos', { projectId, projectName, mode: 'type' }),
      flagKey: 'fill_by_type',
    },
    {
      key: 'ensayos-date',
      title: t('projectMenu.ensayosDateTitle'),
      subtitle: t('projectMenu.ensayosDateSubtitle'),
      icon: 'calendar-outline',
      tone: Colors.warning,
      onPress: () => navigation.navigate('Ensayos', { projectId, projectName, mode: 'date' }),
      flagKey: 'fill_by_date',
    },
    {
      key: 'ensayos-sample',
      title: t('projectMenu.ensayosSampleTitle'),
      subtitle: t('projectMenu.ensayosSampleSubtitle'),
      icon: 'cube-outline',
      tone: Colors.primary,
      onPress: () => navigation.navigate('Samples', { projectId, projectName }),
      flagKey: 'fill_by_sample',
    },
    {
      key: 'summary',
      title: t('projectMenu.summaryTitle'),
      subtitle: t('projectMenu.summarySubtitle'),
      icon: 'grid-outline',
      tone: Colors.secondary,
      onPress: () => navigation.navigate('SummaryTables', { projectId, projectName }),
      flagKey: 'module_summary_tables',
    },
    {
      key: 'plans',
      title: t('projectMenu.plansTitle'),
      subtitle: t('projectMenu.plansSubtitle'),
      icon: 'document-outline',
      tone: Colors.navy,
      onPress: () => navigation.navigate('PlansManagement', { projectId, projectName, mode: 'measure' }),
      flagKey: 'module_plans',
    },
    ...(canUploadFiles ? [{
      key: 'file-upload',
      title: t('projectMenu.fileUploadTitle'),
      subtitle: t('projectMenu.fileUploadSubtitle'),
      icon: 'cloud-upload-outline',
      tone: Colors.secondary,
      onPress: () => navigation.navigate('FileUpload', { projectId, projectName }),
    } as MenuOption] : []),
    // v43 — Papelera de Reciclaje: ensayos eliminados (solo Jefe/Creador).
    ...(canUploadFiles ? [{
      key: 'recycle-bin',
      title: 'Papelera de Reciclaje',
      subtitle: 'Historial de respaldo de ensayos eliminados (solo lectura)',
      icon: 'trash-outline',
      tone: Colors.textMuted,
      onPress: () => navigation.navigate('RecycleBin', { projectId, projectName }),
    } as MenuOption] : []),
    {
      key: 'contacts',
      title: 'Contactos',
      subtitle: 'Directorio del equipo del proyecto',
      icon: 'call-outline',
      tone: Colors.warning,
      onPress: () => navigation.navigate('PhoneContacts', { projectId, projectName }),
      flagKey: 'module_contacts',
    },
    {
      key: 'traceability',
      title: 'Trazabilidad',
      subtitle: 'Sesiones de trabajo con cronómetro y GPS',
      icon: 'timer-outline',
      tone: Colors.warning,
      onPress: () => navigation.navigate('TraceabilityHome', { projectId, projectName }),
      flagKey: 'traceability_module',
    },
    {
      key: 'map',
      title: 'Geolocalización',
      subtitle: 'Mapa del proyecto, sectores GIS y pines de ensayos',
      icon: 'map-outline',
      tone: Colors.success,
      onPress: () => navigation.navigate('ProjectMap', { projectId, projectName }),
      flagKey: 'map_enabled',
    },
  ];

  // v29 — Usamos helpers padre-hijo para gateo consistente. Mientras flags
  // está cargando, mostramos todo (evita parpadeo).
  const visible = options.filter(o => {
    if (!o.flagKey || !flags) return true;
    if (o.flagKey === 'traceability_module') return isTraceabilityEnabled(flags);
    if (o.flagKey === 'map_enabled')         return isGeolocationEnabled(flags);
    return !!flags[o.flagKey];
  });

  return (
    <View style={styles.container}>
      <AppHeader title={projectName} subtitle="Inicio del proyecto" onBack={() => navigation.goBack()} />

      <ScrollView contentContainerStyle={[styles.scroll, { paddingBottom: Math.max(24, insets.bottom + 16) }]}>
        <View style={styles.heroCard}>
          <Ionicons name="folder-open" size={26} color={Colors.primary} />
          <View style={{ flex: 1 }}>
            <Text style={styles.heroTitle}>¿Qué quieres hacer?</Text>
            <Text style={styles.heroSubtitle}>Elige una opción para continuar.</Text>
          </View>
        </View>

        {/* Parte C — Dossier de calidad SIEMPRE primero: enlaza al Dossier
            existente (sin duplicarlo) con el estado del proyecto a la vista. */}
        <TouchableOpacity
          style={styles.option}
          onPress={() => navigation.navigate('Dossier', { projectId, projectName })}
          activeOpacity={0.75}
        >
          <View style={[styles.optionIcon, { backgroundColor: Colors.success + '15', borderColor: Colors.success + '40' }]}>
            <Ionicons name="book-outline" size={26} color={Colors.success} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.optionTitle}>Dossier de calidad</Text>
            <Text style={styles.optionSubtitle}>Protocolos del proyecto y exportación del dosier PDF</Text>
            {/* v32 — chips outline (solo borde de color) para no robar atención */}
            <View style={styles.dossierChipsRow}>
              <View style={[styles.dossierChip, { borderColor: Colors.success }]}>
                <Text style={[styles.dossierChipText, { color: Colors.success }]}>{dossierCounts.approved} aprobados</Text>
              </View>
              <View style={[styles.dossierChip, { borderColor: Colors.primary }]}>
                <Text style={[styles.dossierChipText, { color: Colors.primary }]}>{dossierCounts.submitted} en revisión</Text>
              </View>
              <View style={[styles.dossierChip, { borderColor: Colors.danger }]}>
                <Text style={[styles.dossierChipText, { color: Colors.danger }]}>{dossierCounts.rejected} rechazados</Text>
              </View>
            </View>
          </View>
          <Ionicons name="chevron-forward" size={20} color={Colors.textMuted} />
        </TouchableOpacity>

        {visible.map(opt => (
          <TouchableOpacity
            key={opt.key}
            ref={opt.key === 'plans' ? planosRef : opt.key === 'file-upload' ? fileUploadRef : undefined}
            style={styles.option}
            onPress={opt.onPress}
            activeOpacity={0.75}
          >
            <View style={[styles.optionIcon, { backgroundColor: opt.tone + '15', borderColor: opt.tone + '40' }]}>
              <Ionicons name={opt.icon as any} size={26} color={opt.tone} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.optionTitle}>{opt.title}</Text>
              <Text style={styles.optionSubtitle}>{opt.subtitle}</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={Colors.textMuted} />
          </TouchableOpacity>
        ))}

        {flags && visible.length < options.length && (
          <View style={styles.hint}>
            <Ionicons name="information-circle-outline" size={14} color={Colors.textMuted} />
            <Text style={styles.hintText}>
              Algunas opciones están ocultas porque sus módulos no están activos (modos de llenado, Trazabilidad, Geolocalización). Actívalos desde Configuración del proyecto.
            </Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.surface },
  scroll: { padding: 12, gap: 10 },

  heroCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: Colors.white,
    padding: 14,
    borderRadius: Radius.lg,
    borderWidth: 1, borderColor: Colors.border,
    marginBottom: 4,
  },
  heroTitle: { fontSize: 14, fontWeight: '800', color: Colors.textPrimary },
  heroSubtitle: { fontSize: 12, color: Colors.textSecondary, marginTop: 2 },

  option: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: Colors.white,
    padding: 14,
    borderRadius: Radius.lg,
    borderWidth: 1, borderColor: Colors.border,
    ...Shadow.subtle,
  },
  optionIcon: {
    width: 52, height: 52, borderRadius: Radius.md,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1,
  },
  optionTitle: { fontSize: 14, fontWeight: '800', color: Colors.textPrimary, letterSpacing: 0.2 },
  optionSubtitle: { fontSize: 12, color: Colors.textSecondary, marginTop: 3, lineHeight: 16 },

  dossierChipsRow: { flexDirection: 'row', gap: 5, marginTop: 7, flexWrap: 'wrap' },
  dossierChip: { borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2, borderWidth: 1, backgroundColor: Colors.white },
  dossierChipText: { fontSize: 10, fontWeight: '800' },

  hint: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 6,
    padding: 10, marginTop: 6,
    backgroundColor: Colors.surface,
    borderRadius: Radius.sm,
    borderWidth: 1, borderColor: Colors.border,
  },
  hintText: { fontSize: 11, color: Colors.textMuted, flex: 1, fontStyle: 'italic', lineHeight: 14 },
});
