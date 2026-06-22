/**
 * GPSCaptureBar — Barra superior del ensayo para captura de coords + sector.
 *
 * Comportamiento:
 *  - Auto-fetch del GPS al montar si el protocolo no tiene `coordCapturedAt` (primera vez).
 *  - Botón "Capturar coordenadas":
 *      • Sin coords previas: captura directa.
 *      • Con coords previas: modal "¿estás seguro?" → confirma → mueve current a backup.
 *  - Dropdown de sector:
 *      • Sin geometría en ningún sector: cambio directo sin modal.
 *      • Con geometría + auto-asignación previa: modal "¿estás seguro?" al cambiar.
 *      • Con cambio manual previo: cambio directo sin modal.
 *  - Warning si GPS cae fuera de cualquier sector con geometría.
 *
 * Read-only si el protocolo está APPROVED/locked.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, Modal, ScrollView, Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Q } from '@nozbe/watermelondb';
import { database, projectSectorsCollection, projectsCollection } from '@db/index';
import { type GpsResult } from '@hooks/useGpsCapture';
import { GpsCaptureModal } from './GpsCaptureModal';
import { ManualCoordModal } from './ManualCoordModal';
import type { GpsAveragedResult } from '@utils/gpsAveraging';
import { useAuth } from '@context/AuthContext';
import { enqueue as enqueueSync } from '@services/SyncQueueService';
import { pullProjectSectors, pullProjectSettings } from '@services/SupabaseSyncService';
import { formatCoords, findSectorByPoint, type LatLng } from '@utils/CoordinateSystem';
import { parseFeatureFlagsJson } from '@utils/featureFlags';
import { useI18n } from '@i18n/index';
import { Colors, Radius } from '../theme/colors';
import type ProjectSector from '@db/models/ProjectSector';

interface Props {
  protocol: any; // WMDB model — accedido vía any por simplicidad
  readOnly?: boolean;
  /** v32b — El sector viene FIJO (entrada desde "Ensayos por sector"): se
   *  muestra pero no se puede cambiar ni lo recalcula el GPS. */
  sectorLocked?: boolean;
  /** v33 — Título de la tarjeta (default "Coordenadas"). */
  title?: string;
  /** v33 — Modo embebido: fondo blanco sin tarjeta propia, para integrarse
   *  dentro de la tarjeta de Datos Generales. */
  embedded?: boolean;
}

export function GPSCaptureBar({ protocol, readOnly, sectorLocked, title, embedded }: Props) {
  const { t } = useI18n();
  const { currentUser } = useAuth();
  const [showCaptureModal, setShowCaptureModal] = useState(false);
  const [showManualModal, setShowManualModal] = useState(false);
  const [sectors, setSectors] = useState<ProjectSector[]>([]);
  const [coordSystem, setCoordSystem] = useState<'WGS84_LATLNG' | 'WGS84_UTM' | 'PSAD56_LATLNG' | 'PSAD56_UTM'>('WGS84_LATLNG');
  const [showSectorPicker, setShowSectorPicker] = useState(false);
  /** Si true, ya hicimos auto-fetch o el usuario lo abrió manualmente; no re-disparar */
  const [autoFetchDone, setAutoFetchDone] = useState(false);

  // A5 — Suscripción reactiva a sectores: si el CREATOR importa polígonos
  // mientras el técnico está llenando un ensayo, el dropdown se actualiza solo.
  // C2 — Además, al montar disparamos pull liviano de sectores Y settings del
  // proyecto desde Supabase. Sin esto, el técnico en celular B solo ve la última
  // sincronización completa: cambios recientes del CREATOR (nuevos sectores,
  // cambio de coordinate_system, nuevo map_tile_url) no llegan hasta que el
  // técnico abra "Sincronizar proyecto". Best-effort: ignora errores de red.
  const [sectorsLoaded, setSectorsLoaded] = useState(false);
  useEffect(() => {
    const pid = protocol.projectId as string;
    if (!pid) return;

    // M1 — Sembrar coordSystem desde el flag LOCAL de inmediato (sin esperar al
    // pull de red): si el pull falla offline, igual mostramos el sistema correcto
    // configurado, no el default WGS84_LATLNG.
    projectsCollection.find(pid)
      .then((proj: any) => setCoordSystem(parseFeatureFlagsJson(proj?.featureFlags).coordinate_system))
      .catch(() => {});

    // Subscripción reactiva LOCAL (sirve también sin red)
    const sub = projectSectorsCollection
      .query(Q.where('project_id', pid))
      .observe()
      .subscribe((secs: any) => {
        setSectors(secs);
        setSectorsLoaded(true);
      });

    // Refresh remoto best-effort. Se ejecuta en paralelo a la subscripción.
    // pullProjectSectors actualizará la collection observada → sub re-emite.
    pullProjectSectors(pid).catch(() => {});
    pullProjectSettings(pid)
      .catch(() => {})
      .finally(() => {
        // Releer flags después del pull (puede haber cambiado coordinate_system)
        projectsCollection.find(pid)
          .then((proj: any) => {
            const flags = parseFeatureFlagsJson(proj?.featureFlags);
            setCoordSystem(flags.coordinate_system);
          })
          .catch(() => {});
      });

    return () => sub.unsubscribe();
  }, [protocol.projectId]);

  // A3 — Si lat/lng existen (incluso sin coordCapturedAt, p.ej. importados desde
  // un excel histórico), tratamos como "ya hay coords" para NO pisarlas con un
  // auto-fetch al entrar. El usuario puede recapturar explícitamente.
  // Reactividad: el `protocol` es un modelo WatermelonDB; leerlo directo NO
  // re-renderiza al mutarlo. Nos suscribimos a sus cambios para que al guardar
  // la medición las coords/precisión se reflejen al instante (antes solo se veía
  // al salir y volver a entrar al ensayo).
  const [, bumpCoordVersion] = useState(0);
  useEffect(() => {
    const sub = (protocol as any).observe?.().subscribe(() => bumpCoordVersion(v => v + 1));
    return () => { try { sub?.unsubscribe?.(); } catch { /* ya removida */ } };
  }, [protocol]);

  const hasManualCoords = protocol.latitude != null && protocol.longitude != null;
  const sectorsWithGeom = useMemo(() => sectors.filter(s => s.pointsJson != null), [sectors]);
  const hasGeomSectors = sectorsWithGeom.length > 0;
  const currentSector = useMemo(
    () => sectors.find(s => s.id === protocol.sectorId),
    [sectors, protocol.sectorId],
  );

  // ── Persistencia ──────────────────────────────────────────────────────────

  /** Guarda coords nuevas. Si `keepBackup`, mueve las actuales a backup_*.
   *  `meta` (v35): método de captura + nº de muestras + precisión del promediado. */
  const saveCoords = useCallback(async (
    gps: GpsResult,
    keepBackup: boolean,
    meta?: { method: string; sampleCount?: number | null; precisionM?: number | null },
  ) => {
    // M5/M6 — re-consultar los sectores FRESCOS al momento de guardar (no el
    // closure capturado en el último render). El auto-fetch de la 1ª captura
    // podía correr antes de que el pull remoto trajera sectores nuevos →
    // asignaba el sector equivocado o ninguno.
    let liveSectors = sectors;
    try {
      liveSectors = await projectSectorsCollection.query(Q.where('project_id', protocol.projectId)).fetch() as any;
    } catch { /* sin DB → usar el closure */ }
    const sectorAuto = findSectorByPoint(
      { lat: gps.lat, lng: gps.lng },
      liveSectors.map(s => ({ id: s.id, name: s.name, points: s.points })),
    );
    await database.write(async () => {
      await (protocol as any).update((p: any) => {
        if (keepBackup) {
          p.coordBackupLat = p.latitude;
          p.coordBackupLng = p.longitude;
          p.coordBackupCapturedAt = p.coordCapturedAt;
        }
        p.latitude = gps.lat;
        p.longitude = gps.lng;
        p.coordAccuracyM = gps.accuracyM;
        p.coordCapturedAt = gps.capturedAt;
        p.coordCapturedById = currentUser?.id ?? null;
        // v35 — método/calidad de la captura.
        p.coordMethod = meta?.method ?? 'single';
        p.coordSampleCount = meta?.sampleCount ?? null;
        p.coordPrecisionM = meta?.precisionM ?? null;
        // Auto-asignar por point-in-polygon SOLO si:
        //  (a) hay match con un polígono, Y
        //  (b) la asignación actual NO es manual (C4 — respetar la decisión del
        //      técnico que ya tocó el dropdown; cross-device el CREATOR pierde
        //      contexto si vemos su edit sobrescrito por un fix GPS posterior).
        if (sectorAuto && !p.sectorAssignedManually) {
          p.sectorId = sectorAuto.id;
          p.sectorAssignedManually = false;
        }
      });
    });
    // Sync diferido (también funciona offline)
    enqueueSync({ opType: 'PUSH_PROTOCOL_STATUS', entityId: protocol.id, projectId: protocol.projectId }).catch(() => {});
    return sectorAuto;
  }, [protocol, sectors, currentUser]);

  /** Asigna manualmente un sector. C3 — `sectorAssignedManually=true` SIEMPRE,
   *  incluso cuando el técnico elige "— Sin sector —". Sin esto, el
   *  "Recalcular asignaciones" del CREATOR (que filtra por manual=false) revierte
   *  silenciosamente la decisión deliberada del técnico de quedar sin sector. */
  const setSectorManual = useCallback(async (sectorId: string | null) => {
    await database.write(async () => {
      await (protocol as any).update((p: any) => {
        p.sectorId = sectorId;
        p.sectorAssignedManually = true;
      });
    });
    enqueueSync({ opType: 'PUSH_PROTOCOL_STATUS', entityId: protocol.id, projectId: protocol.projectId }).catch(() => {});
  }, [protocol]);

  // ── Handlers UI ───────────────────────────────────────────────────────────

  // v35 — Guardar el resultado del PROMEDIADO (modal). Reemplaza el shot único y
  // el auto-fetch al montar (ahora la medición es manual con "Comenzar medición").
  const handleSaveAveraged = useCallback(async (r: GpsAveragedResult) => {
    setShowCaptureModal(false);
    const keepBackup = hasManualCoords;
    const sectorAuto = await saveCoords(
      { lat: r.lat, lng: r.lng, accuracyM: r.precisionM, capturedAt: r.capturedAt },
      keepBackup,
      { method: r.method, sampleCount: r.sampleCount, precisionM: r.precisionM },
    );
    if (hasGeomSectors && !sectorAuto) {
      Alert.alert(
        t('gpsBar.outOfArea.title'),
        t('gpsBar.outOfArea.measured'),
      );
    }
  }, [hasManualCoords, hasGeomSectors, saveCoords]);

  // v35 — Guardar coordenadas INGRESADAS A MANO (anotadas de otro GPS).
  const handleSaveManual = useCallback(async (c: { lat: number; lng: number; accuracyM: number | null }) => {
    setShowManualModal(false);
    const sectorAuto = await saveCoords(
      { lat: c.lat, lng: c.lng, accuracyM: c.accuracyM, capturedAt: Date.now() },
      hasManualCoords,
      { method: 'manual', precisionM: c.accuracyM },
    );
    if (hasGeomSectors && !sectorAuto) {
      Alert.alert(
        t('gpsBar.outOfArea.title'),
        t('gpsBar.outOfArea.entered'),
      );
    }
  }, [hasManualCoords, hasGeomSectors, saveCoords]);

  const handleOpenSectorPicker = useCallback(() => {
    if (readOnly || sectorLocked) return;
    // Si tiene sectores con geometría Y la asignación actual fue automática:
    // mostrar modal de confirmación antes de permitir cambio manual.
    if (hasGeomSectors && protocol.sectorId && !protocol.sectorAssignedManually) {
      Alert.alert(
        t('gpsBar.changeSector.title'),
        t('gpsBar.changeSector.message'),
        [
          { text: t('gpsBar.changeSector.cancel'), style: 'cancel' },
          { text: t('gpsBar.changeSector.continue'), onPress: () => setShowSectorPicker(true) },
        ],
      );
      return;
    }
    setShowSectorPicker(true);
  }, [readOnly, sectorLocked, hasGeomSectors, protocol.sectorId, protocol.sectorAssignedManually]);

  // ── Render ────────────────────────────────────────────────────────────────

  const coordsLabel = hasManualCoords
    ? formatCoords(protocol.latitude, protocol.longitude, coordSystem)
    : t('gpsBar.noCoords');
  // v35 — sufijo de precisión: "± X m · N muestras" (antes la precisión se ocultaba).
  const precisionLabel = hasManualCoords && protocol.coordPrecisionM != null
    ? `± ${Number(protocol.coordPrecisionM).toFixed(1)} m${protocol.coordSampleCount ? t('gpsBar.samplesSuffix', { count: protocol.coordSampleCount }) : ''}`
    : (hasManualCoords && protocol.coordAccuracyM != null ? `± ${Number(protocol.coordAccuracyM).toFixed(0)} m` : null);

  // v32 — formato/datum visible bajo el título "Coordenadas".
  const datumLabel =
    coordSystem === 'WGS84_LATLNG' ? t('gpsBar.datum.wgs84LatLng')
    : coordSystem === 'WGS84_UTM' ? t('gpsBar.datum.wgs84Utm')
    : coordSystem === 'PSAD56_LATLNG' ? t('gpsBar.datum.psad56LatLng')
    : t('gpsBar.datum.psad56Utm');

  // v32 — sin sufijos "(manual)"/"(auto)": solo el sector/tramo.
  const sectorLabel = currentSector ? currentSector.name : t('gpsBar.sector.none');

  return (
    <View style={[styles.bar, embedded && styles.barEmbedded]}>
      {/* v32 — Título + datum */}
      <View style={styles.titleRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>{title ?? t('gpsBar.title')}</Text>
          <Text style={styles.datum}>{datumLabel}</Text>
        </View>
        {!readOnly && (
          <View style={{ flexDirection: 'row', gap: 6 }}>
            <TouchableOpacity onPress={() => setShowCaptureModal(true)} style={styles.btn}>
              <Ionicons name="locate" size={13} color={Colors.white} />
              <Text style={styles.btnText}>{hasManualCoords ? t('gpsBar.btn.recapture') : t('gpsBar.btn.measure')}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setShowManualModal(true)} style={styles.btnOutline}>
              <Ionicons name="create-outline" size={13} color={Colors.primary} />
              <Text style={styles.btnOutlineText}>{t('gpsBar.btn.manual')}</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* Coordenadas + precisión (v35) */}
      <Text style={styles.coords} numberOfLines={1}>{coordsLabel}</Text>
      {precisionLabel && (
        <Text style={[styles.precision, { color: (protocol.coordPrecisionM ?? protocol.coordAccuracyM ?? 99) <= 3 ? Colors.success : (protocol.coordPrecisionM ?? protocol.coordAccuracyM ?? 99) <= 8 ? '#b45309' : Colors.danger }]}>
          {precisionLabel}
        </Text>
      )}

      {/* Sector dropdown (sin icono, sin "(manual)") */}
      <TouchableOpacity onPress={handleOpenSectorPicker} disabled={readOnly || sectorLocked} style={styles.sectorRow}>
        <Text style={styles.sectorLabel}>{t('gpsBar.sector.label', { name: sectorLabel })}</Text>
        {!readOnly && !sectorLocked && <Ionicons name="chevron-down" size={12} color={Colors.textSecondary} />}
      </TouchableOpacity>

      {/* Modal picker de sector */}
      <Modal visible={showSectorPicker} transparent animationType="fade" onRequestClose={() => setShowSectorPicker(false)}>
        <Pressable style={styles.backdrop} onPress={() => setShowSectorPicker(false)}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.sheetTitle}>{t('gpsBar.sector.pickerTitle')}</Text>
            <ScrollView style={{ maxHeight: 360 }}>
              <TouchableOpacity style={styles.sectorItem} onPress={() => { setSectorManual(null); setShowSectorPicker(false); }}>
                <Text style={[styles.sectorItemText, { fontStyle: 'italic', color: Colors.textSecondary }]}>{t('gpsBar.sector.none')}</Text>
              </TouchableOpacity>
              {sectors.map(s => (
                <TouchableOpacity
                  key={s.id}
                  style={[
                    styles.sectorItem,
                    s.id === protocol.sectorId && { backgroundColor: Colors.primary + '15' },
                  ]}
                  onPress={() => { setSectorManual(s.id); setShowSectorPicker(false); }}
                >
                  {s.displayColor && <View style={[styles.colorDot, { backgroundColor: s.displayColor }]} />}
                  <Text style={styles.sectorItemText}>{s.name}</Text>
                  {!s.pointsJson && <Text style={styles.sectorTag}>{t('gpsBar.sector.nameOnly')}</Text>}
                </TouchableOpacity>
              ))}
              {sectors.length === 0 && (
                <Text style={styles.empty}>{t('gpsBar.sector.empty')}</Text>
              )}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      {/* v35 — Modal de captura por promediado (inicio manual + alejamiento). */}
      {!readOnly && (
        <GpsCaptureModal
          visible={showCaptureModal}
          coordSystem={coordSystem}
          onCancel={() => setShowCaptureModal(false)}
          onSave={handleSaveAveraged}
        />
      )}

      {/* v35 — Modal de ingreso manual de coordenadas. */}
      {!readOnly && (
        <ManualCoordModal
          visible={showManualModal}
          defaultSystem={coordSystem}
          onCancel={() => setShowManualModal(false)}
          onSave={handleSaveManual}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    padding: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 4,
  },
  // v33 — embebido en la tarjeta de Datos Generales: fondo blanco, sin tarjeta
  // propia, separado por una línea superior.
  barEmbedded: {
    backgroundColor: Colors.white,
    borderWidth: 0,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    borderRadius: 0,
    paddingHorizontal: 0,
    paddingBottom: 0,
    marginTop: 10,
    paddingTop: 10,
  },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  title: { fontSize: 12, fontWeight: '800', color: Colors.textPrimary, textTransform: 'uppercase', letterSpacing: 0.5 },
  datum: { fontSize: 10, color: Colors.textMuted, marginTop: 1 },
  coords: { fontSize: 13, fontWeight: '700', color: Colors.textPrimary },
  precision: { fontSize: 11, fontWeight: '700', marginTop: 1 },
  btn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: Colors.primary, paddingHorizontal: 10, paddingVertical: 5,
    borderRadius: Radius.sm,
  },
  btnText: { color: Colors.white, fontSize: 11, fontWeight: '700' },
  btnOutline: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: Colors.white, paddingHorizontal: 10, paddingVertical: 5,
    borderRadius: Radius.sm, borderWidth: 1, borderColor: Colors.primary,
  },
  btnOutlineText: { color: Colors.primary, fontSize: 11, fontWeight: '700' },
  sectorRow: {
    flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6, paddingVertical: 2,
  },
  sectorLabel: { flex: 1, fontSize: 11, color: Colors.textSecondary },
  // Modal
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 16, paddingBottom: 28 },
  sheetTitle: { fontSize: 14, fontWeight: '800', color: Colors.textPrimary, marginBottom: 8 },
  sectorItem: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingVertical: 12, paddingHorizontal: 8, borderRadius: Radius.sm,
  },
  colorDot: { width: 12, height: 12, borderRadius: 6 },
  sectorItemText: { flex: 1, fontSize: 13, color: Colors.textPrimary },
  sectorTag: {
    fontSize: 9, color: Colors.textSecondary, fontStyle: 'italic',
    paddingHorizontal: 6, paddingVertical: 2, backgroundColor: Colors.surface, borderRadius: 4,
  },
  empty: { fontSize: 12, color: Colors.textSecondary, fontStyle: 'italic', padding: 12, textAlign: 'center' },
});
