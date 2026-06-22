/**
 * TraceabilityCaptureScreen — wizard de selección de Equipo+Actividad+Sector+
 * Turno + formulario inicial + slider "Desliza para iniciar".
 *
 * Flujo:
 *  1. Cargar catálogos del proyecto (equipos, actividades, sectores, turnos).
 *  2. User elige Equipo → filtra actividades válidas (equipment_activities).
 *  3. User elige Actividad → si tiene template, carga form items para snapshot.
 *  4. User elige Sector (opcional) y Turno (auto-sugerido por hora).
 *  5. Si template hay → render NumericTable readOnly=false para captar valores.
 *  6. Validar lock de equipo antes del Iniciar.
 *  7. Swipe → startSession() → navegar a TraceabilityRunning.
 */

import React, { useEffect, useMemo, useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity, ActivityIndicator, Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Q } from '@nozbe/watermelondb';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@navigation/types';
import AppHeader from '@components/AppHeader';
import { Colors, Radius } from '../theme/colors';
import { SlideToConfirm } from '@components/SlideToConfirm';
import { showToast } from '@components/Toast';
import { PickerField } from '@components/PickerModal';
import {
  equipmentCollection, activitiesCollection,
  equipmentActivitiesCollection, projectSectorsCollection,
  workShiftsCollection, sessionFormTemplateItemsCollection, sessionFormTemplatesCollection,
  projectsCollection, workSessionsCollection,
} from '@db/index';
import { useAuth } from '@context/AuthContext';
import { useTour } from '@context/TourContext';
import { useTourStep } from '@hooks/useTourStep';
import { getDeviceId } from '@utils/deviceId';
import {
  isEquipmentLocked,
  pullEquipment, pullActivities, pullWorkShifts,
  pullSessionFormTemplates, pullSessionFormTemplateItems,
  pullEquipmentActivities, pullProjectSectors,
} from '@services/SupabaseSyncService';
import { startSession } from '@services/WorkSessionService';
import { parseFeatureFlagsJson } from '@utils/featureFlags';
import { ForceOverrideModal } from '@components/ForceOverrideModal';
import { useI18n } from '@i18n/index';

type Props = NativeStackScreenProps<RootStackParamList, 'TraceabilityCapture'>;

interface PickerItem { id: string; label: string; sublabel?: string }

export default function TraceabilityCaptureScreen({ route, navigation }: Props) {
  const { projectId, projectName } = route.params;
  const { t } = useI18n();
  const { currentUser } = useAuth();
  const insets = useSafeAreaInsets();
  const { jumpToStep, isActive: tourActive, isContextual, dismissTour } = useTour();
  const traceCapEquipoRef = useTourStep('trace_cap_equipo');
  const traceCapActividadRef = useTourStep('trace_cap_actividad');
  const traceCapStartRef = useTourStep('trace_cap_start');

  useEffect(() => {
    const unsub = navigation.addListener('blur', () => {
      if (tourActive && isContextual) dismissTour();
    });
    return unsub;
  }, [navigation, tourActive, isContextual, dismissTour]);

  const [equipos, setEquipos] = useState<PickerItem[]>([]);
  const [actividadesByEquipo, setActividadesByEquipo] = useState<Record<string, Array<{ id: string; name: string; templateId: string | null }>>>({});
  const [sectores, setSectores] = useState<PickerItem[]>([]);
  const [turnos, setTurnos] = useState<PickerItem[]>([]);
  const [allShifts, setAllShifts] = useState<Array<{ id: string; name: string; startHour: number; endHour: number }>>([]);

  const [selectedEquipo, setSelectedEquipo] = useState<string | null>(null);
  const [selectedActividad, setSelectedActividad] = useState<string | null>(null);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [selectedSector, setSelectedSector] = useState<string | null>(null);
  const [selectedShift, setSelectedShift] = useState<string | null>(null);

  const [lockInfo, setLockInfo] = useState<null | { userId: string; startedAt: number; sessionId?: string }>(null);
  // v30 — Modal de toma forzada cuando lockInfo.userId !== currentUser.id.
  const [forceModalOpen, setForceModalOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [gpsPolling, setGpsPolling] = useState<'off' | 'foreground' | 'background'>('off');
  const [gpsInterval, setGpsInterval] = useState<number>(3);

  // v29 — Guard: si el usuario ya tiene una sesión ACTIVE/PAUSED en este
  // proyecto, no permitimos abrir el wizard. Lo redirigimos a la sesión activa.
  useEffect(() => {
    if (!currentUser) return;
    (async () => {
      const existing = await workSessionsCollection.query(
        Q.where('project_id', projectId),
        Q.where('user_id', currentUser.id),
        Q.or(Q.where('status', 'ACTIVE'), Q.where('status', 'PAUSED')),
      ).fetch();
      if (existing.length > 0) {
        const sid = existing[0].id;
        Alert.alert(
          t('traceCapture.activeSessionTitle'),
          t('traceCapture.activeSessionMessage'),
          [
            { text: t('traceCapture.activeSessionBack'), style: 'cancel', onPress: () => navigation.goBack() },
            { text: t('traceCapture.activeSessionGo'), onPress: () => navigation.replace('TraceabilityRunning' as any, { sessionId: sid }) },
          ],
          { cancelable: false },
        );
      }
    })().catch(() => {});
  }, [currentUser, projectId, navigation]);

  // Cargar catálogos
  useEffect(() => {
    (async () => {
      try {
        // Best-effort pull de catálogos: si el xlsx se subió desde web, esto
        // es lo que trae los datos al móvil antes de leer el WMDB local.
        try {
          await Promise.all([
            pullEquipment(projectId),
            pullActivities(projectId),
            pullWorkShifts(projectId),
            pullSessionFormTemplates(projectId),
            pullProjectSectors(projectId),
          ]);
          await Promise.all([
            pullSessionFormTemplateItems(projectId),
            pullEquipmentActivities(projectId),
          ]);
        } catch { /* offline: usa lo que haya local */ }

        const [eqs, acts, eqActs, secs, shifts, proj] = await Promise.all([
          equipmentCollection.query(Q.where('project_id', projectId)).fetch(),
          activitiesCollection.query(Q.where('project_id', projectId)).fetch(),
          equipmentActivitiesCollection.query().fetch(), // filtramos por equipos del proyecto en JS
          projectSectorsCollection.query(Q.where('project_id', projectId)).fetch(),
          workShiftsCollection.query(Q.where('project_id', projectId)).fetch(),
          projectsCollection.find(projectId).catch(() => null),
        ]);
        // v28 — En el wizard de Trazabilidad solo se listan equipos de
        // maquinaria pesada (los de laboratorio no se operan por sesión).
        const equipPick = (eqs as any[])
          .filter(e => (e.category ?? 'laboratorio') === 'maquinaria_pesada')
          .map(e => ({ id: e.id, label: `${e.code} — ${e.name}`, sublabel: e.type }));
        const actsById: Record<string, { name: string }> = {};
        for (const a of acts as any[]) actsById[a.id] = { name: a.name };
        const equipIdsSet = new Set(equipPick.map(e => e.id));
        const map: Record<string, Array<{ id: string; name: string; templateId: string | null }>> = {};
        for (const link of eqActs as any[]) {
          if (!equipIdsSet.has(link.equipmentId)) continue;
          const aName = actsById[link.activityId]?.name;
          if (!aName) continue;
          if (!map[link.equipmentId]) map[link.equipmentId] = [];
          map[link.equipmentId].push({ id: link.activityId, name: aName, templateId: link.formTemplateId ?? null });
        }
        setEquipos(equipPick);
        setActividadesByEquipo(map);
        setSectores((secs as any[]).map(s => ({ id: s.id, label: s.name })));
        const shiftRaw = (shifts as any[]).map(s => ({ id: s.id, name: s.name, startHour: s.startHour, endHour: s.endHour }));
        setAllShifts(shiftRaw);
        setTurnos(shiftRaw.map(s => ({ id: s.id, label: s.name, sublabel: `${pad(s.startHour)}:00 – ${pad(s.endHour)}:00` })));
        // Auto-sugerir turno por hora actual
        const now = new Date().getHours();
        const auto = shiftRaw.find(s => containsHour(s.startHour, s.endHour, now));
        if (auto) setSelectedShift(auto.id);
        // Leer flags GPS del proyecto. Si traceability_module está OFF,
        // forzamos polling 'off' para no consumir batería con sub-flags zombi
        // de proyectos legacy (padre OFF + hijo ON).
        if (proj) {
          const flags = parseFeatureFlagsJson((proj as any).featureFlags);
          if (!flags.traceability_module) {
            setGpsPolling('off');
            setGpsInterval(3);
          } else {
            setGpsPolling(flags.traceability_gps_polling);
            setGpsInterval(Math.max(1, Math.min(30, flags.traceability_gps_interval_seconds || 3)));
          }
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [projectId]);

  // Validar lock al cambiar de equipo
  useEffect(() => {
    if (!selectedEquipo) { setLockInfo(null); return; }
    let cancelled = false;
    isEquipmentLocked(selectedEquipo).then(res => {
      if (cancelled) return;
      if (res.locked) setLockInfo({ userId: res.userId, startedAt: res.startedAt, sessionId: res.sessionId });
      else setLockInfo(null);
    }).catch(() => { if (!cancelled) setLockInfo(null); });
    return () => { cancelled = true; };
  }, [selectedEquipo]);

  const activitiesForEquipo = selectedEquipo ? actividadesByEquipo[selectedEquipo] ?? [] : [];

  const handleSelectActivity = (id: string) => {
    setSelectedActividad(id);
    const found = activitiesForEquipo.find(a => a.id === id);
    setSelectedTemplateId(found?.templateId ?? null);
  };

  // v29 — Sector/Campaña ahora es OBLIGATORIO. Si el proyecto no tiene
  // sectores cargados, no se exige (no se puede seleccionar lo que no existe).
  const sectorRequired = sectores.length > 0;
  const canStart = !!selectedEquipo
    && !!selectedActividad
    && (!sectorRequired || !!selectedSector)
    && !lockInfo
    && !starting;

  const handleStart = async () => {
    if (!canStart || !currentUser) return;
    // Validar que la actividad seleccionada sigue siendo válida para el equipo actual
    if (!activitiesForEquipo.find(a => a.id === selectedActividad)) {
      showToast(t('traceCapture.toastActivityInvalid'), 'warning');
      setSelectedActividad(null);
      setSelectedTemplateId(null);
      return;
    }
    setStarting(true);
    try {
      const deviceId = await getDeviceId();
      const baseInput = {
        projectId,
        userId: currentUser.id,
        equipmentId: selectedEquipo!,
        activityId: selectedActividad!,
        sectorId: selectedSector,
        shiftId: selectedShift,
        deviceId,
        gpsPolling,
        gpsIntervalSeconds: gpsInterval,
      };
      // v30 — Si la actividad tiene template, derivar al checklist intermedio.
      // El cronómetro arranca al confirmar el checklist, no aquí.
      if (selectedTemplateId) {
        const items = await sessionFormTemplateItemsCollection
          .query(Q.where('template_id', selectedTemplateId)).fetch();
        const tmplName = await sessionFormTemplatesCollection.find(selectedTemplateId)
          .then((t: any) => t?.name ?? null).catch(() => null);
        // v31 — Dedup defensivo: re-imports pasados pueden haber dejado items
        // duplicados con distinto id pero misma firma. Conservamos la primera
        // ocurrencia por (partida_item|item_description|validation_method).
        const seen = new Set<string>();
        const dedupedItems = (items as any[]).filter(it => {
          const key = `${it.partidaItem ?? ''}|${(it.itemDescription ?? '').trim()}|${it.validationMethod ?? ''}`;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
        navigation.navigate('TraceabilityChecklist' as any, {
          sessionInput: baseInput,
          templateName: tmplName,
          items: dedupedItems.map(it => ({
            templateItemId: it.id,
            partidaItem: it.partidaItem,
            itemDescription: it.itemDescription,
            validationMethod: it.validationMethod,
            section: it.section ?? null,
          })),
        });
        return;
      }
      // Sin template → start directo.
      const session = await startSession(baseInput);
      showToast(t('traceCapture.toastSessionStarted'), 'success');
      navigation.replace('TraceabilityRunning' as any, { sessionId: session.id });
    } catch (e) {
      showToast((e as Error).message || t('traceCapture.toastCouldNotStart'), 'danger');
    } finally {
      setStarting(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingWrap}>
        <ActivityIndicator color={Colors.primary} size="large" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <AppHeader
        title={t('traceCapture.header')}
        subtitle={projectName}
        onBack={() => navigation.goBack()}
        rightContent={
          <TouchableOpacity onPress={() => jumpToStep('trace_cap_equipo')} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="help-circle-outline" size={22} color={Colors.white} />
          </TouchableOpacity>
        }
      />

      {/* Contenido scrolleable. El slider está FUERA (sticky bottom). */}
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.card}>
          <View ref={traceCapEquipoRef}>
            <PickerField
              label={t('traceCapture.equipmentLabel')}
              value={selectedEquipo}
              items={equipos}
              onChange={(v) => { setSelectedEquipo(v); setSelectedActividad(null); setSelectedTemplateId(null); }}
              placeholder={t('traceCapture.equipmentPlaceholder')}
              emptyHint={t('traceCapture.equipmentEmptyHint')}
            />
          </View>

          {lockInfo && (
            <View style={styles.lockBanner}>
              <Ionicons name="lock-closed" size={16} color={Colors.warning} />
              <Text style={styles.lockText}>
                {t('traceCapture.lockText', { date: fmtDateTime(lockInfo.startedAt) })}
              </Text>
              {lockInfo.userId !== currentUser?.id && (
                <TouchableOpacity
                  style={styles.takeoverBtn}
                  onPress={() => {
                    if (!selectedActividad || (sectorRequired && !selectedSector)) {
                      Alert.alert(t('traceCapture.selectFirstTitle'), t('traceCapture.selectFirstMessage'));
                      return;
                    }
                    setForceModalOpen(true);
                  }}
                  activeOpacity={0.8}
                >
                  <Text style={styles.takeoverText}>{t('traceCapture.takeover')}</Text>
                </TouchableOpacity>
              )}
            </View>
          )}

          {selectedEquipo && (
            <View ref={traceCapActividadRef}>
              <PickerField
                label={t('traceCapture.activityLabel')}
                value={selectedActividad}
                items={activitiesForEquipo.map(a => ({ id: a.id, label: a.name }))}
                onChange={(v) => v && handleSelectActivity(v)}
                placeholder={t('traceCapture.activityPlaceholder')}
                emptyHint={t('traceCapture.activityEmptyHint')}
                disabled={activitiesForEquipo.length === 0}
              />
            </View>
          )}

          {sectores.length > 0 && (
            <PickerField
              label={t('traceCapture.sectorLabel')}
              value={selectedSector}
              items={sectores}
              onChange={setSelectedSector}
              placeholder={t('traceCapture.sectorPlaceholder')}
            />
          )}

          {/* v29 — Turno YA NO se selecciona: el sistema lo determina por hora actual.
             selectedShift se sigue calculando internamente y se persiste en la sesión. */}

          {selectedTemplateId && (
            <View style={styles.templateInfo}>
              <Ionicons name="document-text-outline" size={14} color={Colors.primary} />
              <Text style={styles.templateText}>
                {t('traceCapture.templateInfo')}
              </Text>
            </View>
          )}
        </View>
      </ScrollView>

      <ForceOverrideModal
        visible={forceModalOpen}
        equipmentLabel={equipos.find(e => e.id === selectedEquipo)?.label ?? t('traceCapture.equipmentFallback')}
        startedAt={lockInfo?.startedAt}
        onCancel={() => setForceModalOpen(false)}
        onConfirm={async () => {
          if (!currentUser || !selectedEquipo || !selectedActividad || !lockInfo?.sessionId) {
            setForceModalOpen(false);
            return;
          }
          setForceModalOpen(false);
          const deviceId = await getDeviceId();
          navigation.navigate('ForceTakeoverPhoto' as any, {
            prevSessionId: lockInfo.sessionId,
            newSessionInput: {
              projectId,
              userId: currentUser.id,
              equipmentId: selectedEquipo,
              activityId: selectedActividad,
              sectorId: selectedSector,
              shiftId: selectedShift,
              deviceId,
              gpsPolling,
              gpsIntervalSeconds: gpsInterval,
            },
          });
        }}
      />

      {/* Slider sticky bottom — siempre visible al final de la pantalla. */}
      <View style={[styles.footer, { paddingBottom: Math.max(12, insets.bottom + 8) }]}>
        <View ref={traceCapStartRef}>
        <SlideToConfirm
          label={t('traceCapture.slideLabel')}
          tone="primary"
          disabled={!canStart}
          hint={
            !selectedEquipo ? t('traceCapture.hintSelectEquipment')
            : !selectedActividad ? t('traceCapture.hintSelectActivity')
            : sectorRequired && !selectedSector ? t('traceCapture.hintSelectSector')
            : lockInfo ? t('traceCapture.hintLocked')
            : undefined
          }
          onConfirm={handleStart}
        />
        </View>
      </View>
    </View>
  );
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function pad(n: number) { return String(n).padStart(2, '0'); }
function containsHour(start: number, end: number, h: number) {
  if (start <= end) return h >= start && h < end;
  return h >= start || h < end;
}
function fmtDateTime(ts: number) {
  const d = new Date(ts);
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.surface },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll: { padding: 12, paddingBottom: 40 },
  card: { backgroundColor: 'transparent' },
  templateInfo: { flexDirection: 'row', alignItems: 'center', gap: 6, padding: 10, backgroundColor: Colors.primary + '10', borderRadius: Radius.sm, borderWidth: 1, borderColor: Colors.primary + '30' },
  templateText: { fontSize: 12, color: Colors.primary, flex: 1, fontWeight: '600' },
  helper: { fontSize: 11, color: Colors.textSecondary, padding: 8, backgroundColor: Colors.surface, borderRadius: Radius.sm },
  lockBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, marginBottom: 12, backgroundColor: Colors.warning + '15', borderRadius: Radius.sm, borderWidth: 1, borderColor: Colors.warning + '50' },
  lockText: { fontSize: 12, color: Colors.warning, flex: 1, fontWeight: '600' },
  takeoverBtn: {
    backgroundColor: Colors.warning,
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: Radius.sm,
  },
  takeoverText: { color: Colors.white, fontWeight: '800', fontSize: 12, letterSpacing: 0.3 },
  // v29 — Footer fijo con el slider iniciar (sticky bottom)
  footer: {
    paddingHorizontal: 12,
    paddingTop: 12,
    backgroundColor: Colors.white,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
});
