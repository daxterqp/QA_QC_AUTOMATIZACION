import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Modal,
  Alert, ActivityIndicator, ScrollView, Image, TextInput,
  FlatList, useWindowDimensions,
} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { applyPhotoStamps } from '@services/PhotoStampService';
import { getProjectSettings } from '@services/ProjectSettings';
import { downloadFromS3, s3FileExists, getSignedReadUrl } from '@services/S3Service';
import { uploadExtraPhoto } from '@services/S3PhotoService';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@navigation/types';
import {
  database, protocolsCollection, protocolItemsCollection, locationsCollection,
  evidencesCollection, plansCollection, projectsCollection, usersCollection,
  protocolTemplatesCollection, labAuxTablesCollection,
} from '@db/index';
import { Q } from '@nozbe/watermelondb';
import { useAuth } from '@context/AuthContext';
import { GPSCaptureBar } from '@components/GPSCaptureBar';
import { parseFeatureFlagsJson } from '@utils/featureFlags';
import { useTour } from '@context/TourContext';
import { useTourStep, useTourStepWithLayout } from '@hooks/useTourStep';
import type Protocol from '@models/Protocol';
import type Location from '@models/Location';
import type Evidence from '@models/Evidence';
import type Plan from '@models/Plan';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Radius, Shadow } from '../theme/colors';
import { notifyProtocolApproved, notifyProtocolRejected } from '@services/NotificationService';
import { pushProjectToSupabase, pushProtocolStatus } from '@services/SupabaseSyncService';
import { enqueue as enqueueSync } from '@services/SyncQueueService';
import { SyncWorker } from '@services/SyncWorker';
import { Linking } from 'react-native';
import AppHeader from '@components/AppHeader';
import QrCodeView from '@components/QrCodeView';
import { buildQrIdentifier, buildProtocolDeepLink } from '@utils/qrCode';
import NumericTable from '@components/NumericTable';
import {
  isNumericProtocol, parseNumericRow, parseNumeric, inRange,
  splitRowComments, scopeKeyFor, extractMatrices, isValidDateText, isValidTimeText,
} from '@utils/numericProtocol';
import { resolveScopeCells, extractRefs, type ScopeCell } from '@utils/formulaEval';
import { checkProtocolXrefStale, refreshProtocolXrefs } from '@services/XrefRefresh';
import { useEnsayoZoom, ZoomHeaderButtons } from '@components/ZoomControls';
import { useI18n, tx } from '@i18n/index';

function sanitizeS3Seg(s: string): string {
  return s.toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9._-]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '').slice(0, 60);
}
function normS3Key(projectName: string, idProtocolo: string): string {
  return `projects/${sanitizeS3Seg(projectName)}/norms/${sanitizeS3Seg(idProtocolo)}.pdf`;
}
async function openNorm(projectName: string, idProtocolo: string) {
  const key = normS3Key(projectName, idProtocolo);
  try {
    const exists = await s3FileExists(key);
    if (!exists) {
      Alert.alert(tx('protoAudit.norm.missingTitle'), tx('protoAudit.norm.missingMsg'));
      return;
    }
    const url = await getSignedReadUrl(key, 600);
    await Linking.openURL(url);
  } catch (e: any) {
    Alert.alert(tx('protoAudit.error'), tx('protoAudit.norm.openError', { detail: e?.message ?? e }));
  }
}

type Props = NativeStackScreenProps<RootStackParamList, 'ProtocolAudit'>;

// Celda compacta del grid del encabezado — replica el aspecto de `.proto-info-cell` del PDF
function InfoCell({ label, value }: { label: string; value: string }) {
  return (
    <View style={infoCellStyles.cell}>
      <Text style={infoCellStyles.label}>{label}</Text>
      <Text style={infoCellStyles.value} numberOfLines={2}>{value}</Text>
    </View>
  );
}

const infoCellStyles = StyleSheet.create({
  cell: {
    flex: 1, minWidth: 120,
    backgroundColor: '#f4f6f9', borderRadius: 6,
    paddingHorizontal: 10, paddingVertical: 6,
  },
  label: {
    fontSize: 9, fontWeight: '700', color: '#888', letterSpacing: 0.6,
    textTransform: 'uppercase', marginBottom: 2,
  },
  value: { fontSize: 12, fontWeight: '700', color: '#1a1a2e' },
});

export default function ProtocolAuditScreen({ navigation, route }: Props) {
  const { protocolId } = route.params;
  const { currentUser } = useAuth();
  const { t } = useI18n();

  // Tour refs
  const auditItemsListRef = useTourStep('audit_items_list');
  const auditActionBtnsRef = useTourStep('audit_action_buttons');
  const { ref: headerRef, onLayout: headerLayout } = useTourStepWithLayout('dossier_protocol_header');
  const { ref: backBtnRef, onLayout: backBtnLayout } = useTourStepWithLayout('dossier_protocol_back_btn');
  const { isActive: tourActive, currentStep: tourStep, nextStep: tourNextStep } = useTour();

  const [protocol, setProtocol] = useState<Protocol | null>(null);
  const [auxTables, setAuxTables] = useState<import('@utils/formulaEval').AuxTables>({}); // v41 — BUSCAR()
  // v26 — feature_flags (para decidir si mostrar GPSCaptureBar en read-only)
  const [projectFlags, setProjectFlags] = useState<import('@utils/featureFlags').ProjectFeatureFlags | null>(null);
  const [items, setItems] = useState<any[]>([]);
  const [itemsLoaded, setItemsLoaded] = useState(false);   // v46.1 — gate del skeleton (evita flash del layout clásico)
  const [location, setLocation] = useState<Location | null>(null);
  const [saving, setSaving] = useState(false);
  // evidencias agrupadas por protocolItemId
  const [evidenceMap, setEvidenceMap] = useState<Record<string, Evidence[]>>({});
  // Planos vinculados a la ubicación del protocolo
  const [locationPlans, setLocationPlans] = useState<Plan[]>([]);
  // Info extra para el encabezado tipo dossier
  const [projectName, setProjectName] = useState<string>('');
  const [filledByName, setFilledByName] = useState<string>('—');
  const [signedByName, setSignedByName] = useState<string>('—');
  const [idProtocolo, setIdProtocolo] = useState<string>('');
  // Modal de rechazo
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [showApproveModal, setShowApproveModal] = useState(false); // v33
  const [approvalReason, setApprovalReason] = useState('');         // v33 — motivo override

  const isJefe = currentUser?.role === 'RESIDENT' || currentUser?.role === 'CREATOR';

  const zoom = useEnsayoZoom(); // v42d — zoom de la ficha (paneo total / re-encuadrar)

  // v42 — Frescura de los llamados entre ensayos (@código): badge "desactualizado".
  const [xrefStale, setXrefStale] = useState(false);
  const [xrefReasons, setXrefReasons] = useState<string[]>([]);
  const [refreshingXref, setRefreshingXref] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const [fullscreenPhotos, setFullscreenPhotos] = useState<string[]>([]);
  const [fullscreenInitIdx, setFullscreenInitIdx] = useState(0);
  const [currentFullIdx, setCurrentFullIdx] = useState(0);
  const fullscreenListRef = useRef<FlatList>(null);
  const [extraPhotos, setExtraPhotos] = useState<string[]>([]);
  const [addingPhoto, setAddingPhoto] = useState(false);

  const extraPhotosKey = `protocol_extra_photos_${protocolId}`;

  // Cargar fotos extra al montar
  useEffect(() => {
    AsyncStorage.getItem(extraPhotosKey)
      .then((val) => { if (val) setExtraPhotos(JSON.parse(val)); })
      .catch(() => {});
  }, [extraPhotosKey]);

  const handleAddExtraPhoto = async () => {
    if (!protocol) return;
    setAddingPhoto(true);
    try {
      // Android SAF rinde mejor con un único type string.
      const result = await DocumentPicker.getDocumentAsync({
        type: 'image/*',
        copyToCacheDirectory: true,
      });
      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0];

      // Estampar fecha/hora/logo/comentario
      const projectId = (protocol as any).projectId ?? '';
      const settings = await getProjectSettings(projectId);
      const destDir = `${FileSystem.documentDirectory}extra_photos/`;
      await FileSystem.makeDirectoryAsync(destDir, { intermediates: true });
      const destUri = `${destDir}${protocolId}_${Date.now()}.jpg`;
      await FileSystem.copyAsync({ from: asset.uri, to: destUri });

      // Load logo: try local cache, then download from S3 (same as CameraScreen)
      let logoUri = settings.stampPhotoUri;
      if (!logoUri && settings.stampEnabled) {
        const s3Key = `logos/project_${projectId}/logo.jpg`;
        const localUri = `${FileSystem.cacheDirectory}project_logo_${projectId}.jpg`;
        try {
          const exists = await s3FileExists(s3Key);
          if (exists) { await downloadFromS3(s3Key, localUri); logoUri = localUri; }
        } catch { /* logo optional */ }
      }

      // Load shared comment from WatermelonDB project model
      let stampComment = settings.stampComment;
      try {
        const proj = await database.get<any>('projects').find(projectId);
        if (proj?.stampComment) stampComment = proj.stampComment;
      } catch { /* fallback to local */ }

      const stamped = await applyPhotoStamps(
        destUri,
        settings.stampEnabled ? logoUri : null,
        settings.stampEnabled ? stampComment : null,
      );

      const updated = [...extraPhotos, stamped];
      setExtraPhotos(updated);
      await AsyncStorage.setItem(extraPhotosKey, JSON.stringify(updated));

      // Subir a S3 en background
      const position = updated.length;
      uploadExtraPhoto(protocolId, stamped, position).catch(() => {});
    } catch (e) {
      Alert.alert(t('protoAudit.error'), t('protoAudit.photo.attachError', { detail: String(e) }));
    } finally {
      setAddingPhoto(false);
    }
  };

  useEffect(() => {
    protocolsCollection.find(protocolId).then((p: any) => {
      setProtocol(p);
      // v41 — Tablas auxiliares del proyecto para recomputar BUSCAR() en el audit.
      labAuxTablesCollection.query(Q.where('project_id', p.projectId)).fetch().then((tbls: any[]) => {
        const map: import('@utils/formulaEval').AuxTables = {};
        for (const t of tbls) { try { map[String(t.groupKey).toLowerCase()] = { columns: JSON.parse(t.columnsJson ?? '[]'), rows: JSON.parse(t.rowsJson ?? '[]') }; } catch { /* corrupta */ } }
        setAuxTables(map);
      }).catch(() => {});
    }).catch(() => {});
    protocolItemsCollection
      .query(Q.where('protocol_id', protocolId))
      .fetch()
      .then(async (fetchedItems) => {
        // Orden natural por partida_item ("1, 2, 10" en lugar de "1, 10, 2")
        const sorted = [...fetchedItems].sort((x, y) => {
          const a = String((x as any).partidaItem ?? '').trim();
          const b = String((y as any).partidaItem ?? '').trim();
          const cmp = a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
          if (cmp !== 0) return cmp;
          return ((x as any).createdAt?.getTime?.() ?? 0) - ((y as any).createdAt?.getTime?.() ?? 0);
        });
        setItems(sorted);
        setItemsLoaded(true);   // v46.1 — ya conocemos el modo real (numérico/clásico)
        // Cargar evidencias de todos los items de este protocolo
        const itemIds = fetchedItems.map((i) => i.id);
        if (itemIds.length > 0) {
          const evs = await evidencesCollection
            .query(Q.where('protocol_item_id', Q.oneOf(itemIds)))
            .fetch();
          const map: Record<string, Evidence[]> = {};
          for (const ev of evs) {
            if (!map[ev.protocolItemId]) map[ev.protocolItemId] = [];
            map[ev.protocolItemId].push(ev);
          }
          setEvidenceMap(map);
        }
      });
  }, [protocolId, reloadKey]);

  // v42 — Detectar si los llamados entre ensayos quedaron desactualizados.
  useEffect(() => {
    if (items.length === 0) { setXrefStale(false); return; }
    let cancelled = false;
    checkProtocolXrefStale(protocolId).then(s => {
      if (!cancelled) { setXrefStale(s.stale); setXrefReasons(s.reasons); }
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [protocolId, items.length, reloadKey]);

  const handleRefreshXref = useCallback(async () => {
    setRefreshingXref(true);
    try {
      await refreshProtocolXrefs(protocolId);
      setReloadKey(k => k + 1);   // re-lee items + re-evalúa staleness
    } catch (e: any) {
      Alert.alert(t('protoAudit.xref.refreshFailTitle'), e?.message ?? t('protoAudit.xref.refreshFailMsg'));
    } finally {
      setRefreshingXref(false);
    }
  }, [protocolId]);

  useEffect(() => {
    if (!protocol?.locationId) return;
    locationsCollection.find(protocol.locationId).then((loc) => {
      setLocation(loc);
      // Buscar plano vinculado a esta ubicación
      plansCollection
        .query(Q.where('location_id', loc.id))
        .fetch()
        .then((plans) => setLocationPlans(plans as Plan[]))
        .catch(() => {});
    }).catch(() => null);
  }, [protocol]);

  // Cargar nombre de proyecto, supervisor, aprobador, idProtocolo
  useEffect(() => {
    if (!protocol) return;
    const p = protocol as any;
    projectsCollection.find(p.projectId).then((proj: any) => {
      setProjectName(proj?.name ?? '');
      // v26 — Cargar feature_flags para gate del GPSCaptureBar
      try { setProjectFlags(parseFeatureFlagsJson(proj?.featureFlags)); } catch { /* OK */ }
    }).catch(() => {});
    if (p.filledById) {
      usersCollection.find(p.filledById).then((u: any) => {
        const name = [u?.name, u?.apellido].filter(Boolean).join(' ').trim();
        setFilledByName(name || u?.name || '—');
      }).catch(() => {});
    }
    if (p.signedById) {
      usersCollection.find(p.signedById).then((u: any) => {
        const name = [u?.name, u?.apellido].filter(Boolean).join(' ').trim();
        setSignedByName(name || u?.name || '—');
      }).catch(() => {});
    } else {
      setSignedByName('—');
    }
    if (p.templateId) {
      protocolTemplatesCollection.find(p.templateId).then((t: any) => {
        setIdProtocolo(t?.idProtocolo ?? '');
      }).catch(() => {});
    }
  }, [protocol]);

  // v33 — Ejecuta la aprobación. `reason` se guarda en approval_reason cuando
  // el ensayo se aprueba fuera de rango (override del jefe); null si conforme.
  const doApprove = useCallback(async (reason: string | null) => {
    setSaving(true);
    let updatedProto: any = null;
    await database.write(async () => {
      updatedProto = await protocol!.update((p) => {
        p.status = 'APPROVED';
        p.isLocked = true;
        p.correctionsAllowed = false;
        p.signedById = currentUser?.id ?? null;
        (p as any).signedAt = Date.now();
        (p as any).approvalReason = reason;
      });
    });
    // v25 — Push inmediato (si hay red) + enqueue (garantía offline).
    if (updatedProto) {
      pushProtocolStatus(updatedProto).catch(() => {});
      const pid = (protocol as any).projectId;
      if (pid) {
        enqueueSync({ opType: 'PUSH_PROTOCOL_STATUS', entityId: protocol!.id, projectId: pid })
          .then(() => SyncWorker.forceTick())
          .catch(() => {});
      }
    }
    const locOnly = (location as any)?.locationOnly ?? null;
    const spec = (location as any)?.specialty ?? null;
    const protName = ((protocol as any).protocolCode ? `${(protocol as any).protocolCode} · ` : '') + ((protocol as any).protocolNumber ?? '');
    notifyProtocolApproved((protocol as any).projectId ?? '', '', locOnly, spec, protName, protocol!.id);
    setSaving(false);
    setShowApproveModal(false);
    setApprovalReason('');
    Alert.alert(t('protoAudit.approve.doneTitle'), t('protoAudit.approve.doneMsg'), [
      { text: t('protoAudit.ok'), onPress: () => navigation.goBack() },
    ]);
  }, [protocol, currentUser, navigation, location]);

  const confirmReject = useCallback(async () => {
    if (!rejectReason.trim()) {
      Alert.alert(t('protoAudit.reasonRequiredTitle'), t('protoAudit.reject.reasonRequiredMsg'));
      return;
    }
    setSaving(true);
    setShowRejectModal(false);
    let updatedProto: any = null;
    await database.write(async () => {
      updatedProto = await protocol!.update((p) => {
        p.status = 'REJECTED';
        p.correctionsAllowed = true;
        p.rejectionReason = rejectReason.trim();
      });
    });
    const locOnly = (location as any)?.locationOnly ?? null;
    const spec = (location as any)?.specialty ?? null;
    const protName = ((protocol as any).protocolCode ? `${(protocol as any).protocolCode} · ` : '') + ((protocol as any).protocolNumber ?? '');
    notifyProtocolRejected((protocol as any).projectId ?? '', '', locOnly, spec, protName, protocol!.id);
    // v25 — Push inmediato + enqueue (garantía offline).
    if (updatedProto) {
      pushProtocolStatus(updatedProto).catch(() => {});
      const pid = (protocol as any).projectId;
      if (pid) {
        enqueueSync({ opType: 'PUSH_PROTOCOL_STATUS', entityId: protocol!.id, projectId: pid })
          .then(() => SyncWorker.forceTick())
          .catch(() => {});
      }
    }
    pushProjectToSupabase((protocol as any).projectId).catch(() => {});
    setSaving(false);
    setRejectReason('');
    navigation.goBack();
  }, [protocol, rejectReason, navigation]);

  if (!protocol || !itemsLoaded) {
    // v46.1 — Carga ESQUELÉTICA (igual que el llenado): bloques grises mientras se arma
    // el ensayo. Evita el "salto visual" donde el layout clásico aparece un instante
    // antes de detectar el modo numérico real.
    return (
      <View style={styles.container}>
        <View style={styles.skelHeader}>
          <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="arrow-back" size={20} color={Colors.white} />
          </TouchableOpacity>
        </View>
        <View style={{ padding: 12, gap: 10 }}>
          <View style={[styles.skelBlock, { height: 120 }]} />
          <View style={[styles.skelBlock, { height: 34, width: '55%' }]} />
          <View style={[styles.skelBlock, { height: 220 }]} />
          <View style={[styles.skelBlock, { height: 34, width: '40%' }]} />
          <View style={[styles.skelBlock, { height: 160 }]} />
        </View>
        <View style={styles.skelSpinner}>
          <ActivityIndicator size="small" color={Colors.primary} />
        </View>
      </View>
    );
  }

  const p = protocol as any;
  const compliant = items.filter((i) => i.isCompliant).length;
  const nonCompliant = items.filter((i) => !i.isCompliant && (i as any).isNa !== true && i.hasAnswer).length;
  // Puede aprobar solo si todos los ítems respondidos son Sí o N/A (ningún No).
  // En modo numérico re-evaluamos live (igual que web) — no dependemos de
  // hasAnswer/isCompliant de DB porque las celdas formula/lookup nunca pasan
  // por commit, lo que dejaría el botón Aprobar bloqueado falsamente.
  const numericMode = isNumericProtocol(items.map(it => ({ validation_method: (it as any).validationMethod ?? null })));
  // v33 — `isConforming` = cumple TODAS las restricciones. El botón Aprobar
  // está SIEMPRE disponible; si no es conforme, se exige motivo (override).
  const isConforming = (() => {
    if (items.length === 0) return false;
    if (!numericMode) {
      return items.every((i) => i.hasAnswer && (i.isCompliant || (i as any).isNa === true));
    }
    // Modo numérico: construir scope live con matrices y validar cada celda
    const parsedRows = items.map(it => ({
      item: it,
      spec: parseNumericRow((it as any).validationMethod ?? null),
    }));
    // v42e (M5) — usar `mainRows` (no `parsedRows`): extractMatrices reinterpreta una
    // fila `val-[]` previa a cualquier matriz como fila normal de datos (igual que el
    // congelado y NumericTable). Antes el audit la saltaba y una fórmula que la
    // referenciara daba "Referencia desconocida" → bloqueaba Aprobar falsamente.
    const { mainRows, matrices } = extractMatrices(parsedRows);
    const scopeCells: ScopeCell[] = [];
    for (const { item, spec } of mainRows) {
      if (spec?.kind !== 'row') continue;
      const partida = (item as any).partidaItem ?? '';
      const cellVals = splitRowComments((item as any).comments ?? null, spec.cells.length);
      for (let i = 0; i < spec.cells.length; i++) {
        const cell = spec.cells[i];
        const key = scopeKeyFor(partida, i);
        // Mismo mapeo de kinds que NumericTable (v32): percent/bool → manual,
        // date/time/equipment → list (texto). Sin esto, fórmulas que referencien
        // esas celdas darían "Referencia desconocida" y bloquearían el Aprobar.
        if (cell.kind === 'manual' || cell.kind === 'percent' || cell.kind === 'bool' || cell.kind === 'free') scopeCells.push({ key, kind: 'manual', raw: cellVals[i] ?? '' });
        else if (cell.kind === 'list' || cell.kind === 'date' || cell.kind === 'time' || cell.kind === 'equipment' || cell.kind === 'text') scopeCells.push({ key, kind: 'list', raw: cellVals[i] ?? '' });
        else if (cell.kind === 'lookup') scopeCells.push({ key, kind: 'lookup', refKey: cell.refKey, matrixId: cell.matrixId, searchCol: cell.searchCol, returnCol: cell.returnCol });
        // v42e (H4) — fórmulas con xref (@código) no se pueden re-evaluar en este
        // recompute (xref no disponible aquí) → lanzaban 'xref-unsupported' y
        // bloqueaban falsamente Aprobar en todo ensayo con llamados. En modo Audit
        // el valor ya está CONGELADO en comments: lo leemos como manual (igual que el
        // modo frozen de NumericTable). Las fórmulas SIN @ se recomputan igual que antes.
        else if (cell.kind === 'formula' && cell.expr?.includes('@')) scopeCells.push({ key, kind: 'manual', raw: cellVals[i] ?? '' });
        else if (cell.kind === 'formula') scopeCells.push({ key, kind: 'formula', expr: cell.expr });
        else if (cell.kind === 'val') scopeCells.push({ key, kind: 'manual', raw: cell.literal });
      }
    }
    // v46.1 — defensivo: si la resolución lanza, no se debe romper/blanquear el Audit
    // (incluido el gráfico). Degrada a scope vacío (las celdas computadas mostrarán '—').
    let scope: Record<string, number | null> = {};
    let errors: Record<string, string> = {};
    let textValues: Record<string, string> = {};
    try { const r = resolveScopeCells(scopeCells, matrices, undefined, auxTables); scope = r.scope; errors = r.errors; textValues = r.textValues; }
    catch { /* scope vacío */ }

    for (const { item, spec } of mainRows) {
      if (!spec) {
        // Items SIN método (encabezados de sección, v31) no bloquean la
        // aprobación — solo bloquea un método presente que NO parsea.
        if (((item as any).validationMethod ?? '').trim() !== '') return false;
        continue;
      }
      if (spec.kind !== 'row') continue;
      const partida = (item as any).partidaItem ?? '';
      for (let i = 0; i < spec.cells.length; i++) {
        const cell = spec.cells[i];
        const key = scopeKeyFor(partida, i);
        if (cell.hidden) continue;   // v34 — celdas de cálculo ocultas no bloquean
        if (errors[key]) return false;
        const v = scope[key];
        if (cell.kind === 'manual' || cell.kind === 'percent') {
          if (v == null) return false;
          if (!inRange(v, cell.range)) return false;
        } else if (cell.kind === 'list' || cell.kind === 'bool' || cell.kind === 'equipment') {
          if (!textValues[key]) return false;
        } else if (cell.kind === 'date' || cell.kind === 'time') {
          const txt = textValues[key];
          if (!txt) return false;
          if (!(cell.kind === 'date' ? isValidDateText(txt) : isValidTimeText(txt))) return false;
        } else if (cell.kind === 'lookup') {
          if (!textValues[key] && v == null) return false;
        } else if (cell.kind === 'formula') {
          if (v == null) return false;
          try {
            const deps = extractRefs(cell.expr);
            if (!deps.every(d => scope[d] != null)) return false;
          } catch { return false; }
          if (cell.range && !inRange(v, cell.range)) return false;
        }
      }
    }
    return true;
  })();
  const requiresApprovalReason = !isConforming;
  // Confirmación del modal: valida el motivo obligatorio si no es conforme.
  const confirmApprove = async () => {
    const reason = requiresApprovalReason ? approvalReason.trim() : null;
    if (requiresApprovalReason && !reason) {
      Alert.alert(t('protoAudit.reasonRequiredTitle'), t('protoAudit.approve.reasonRequiredMsg'));
      return;
    }
    await doApprove(reason);
  };
  const canEdit = isJefe && (p.status === 'DRAFT' || p.status === 'IN_PROGRESS' || (p.status === 'REJECTED' && p.correctionsAllowed));

  return (
    <View style={styles.container}>
      <View ref={headerRef} onLayout={headerLayout}>
      <AppHeader
        // v42d — Audit numérico: encabezado limpio (sin título/subtítulo/estado
        // duplicados). Solo back + "Ver norma" centrado + zoom a la derecha.
        title={numericMode ? '' : p.protocolNumber}
        subtitle={numericMode ? undefined : (location ? location.name : t('protoAudit.noLocation'))}
        leftContent={
          <View ref={backBtnRef} onLayout={backBtnLayout}>
            <TouchableOpacity
              onPress={() => {
                if (tourActive && tourStep?.id === 'dossier_protocol_back_btn') tourNextStep();
                navigation.goBack();
              }}
              style={styles.backBtn}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Ionicons name="arrow-back" size={24} color={Colors.white} />
            </TouchableOpacity>
          </View>
        }
        rightContent={numericMode ? (
          <View style={styles.headerRightNum}>
            {canEdit && (
              <TouchableOpacity style={styles.editBtn} onPress={() => navigation.replace('ProtocolFill', { protocolId })}>
                <Text style={styles.editBtnText}>{t('protoAudit.edit')}</Text>
              </TouchableOpacity>
            )}
            <ZoomHeaderButtons z={zoom} />
            {idProtocolo && projectName ? (
              <>
                <Text style={styles.headerSep}>|</Text>
                <TouchableOpacity style={styles.normaTextBtn} onPress={() => openNorm(projectName, idProtocolo)}>
                  <Ionicons name="document-text-outline" size={14} color={Colors.white} />
                  <Text style={styles.normaTextBtnLabel}>{t('protoAudit.viewNorm')}</Text>
                </TouchableOpacity>
              </>
            ) : null}
          </View>
        ) : (
          <View style={styles.headerRight}>
            {canEdit && (
              <TouchableOpacity style={styles.editBtn} onPress={() => navigation.replace('ProtocolFill', { protocolId })}>
                <Text style={styles.editBtnText}>{t('protoAudit.edit')}</Text>
              </TouchableOpacity>
            )}
            {locationPlans.length > 0 && location && (
              <TouchableOpacity
                style={styles.planBtn}
                onPress={() => navigation.navigate('PlanViewer', { planId: locationPlans[0].id, planName: locationPlans[0].name, protocolId, locationId: location.id })}
              >
                <Ionicons name="map-outline" size={14} color={Colors.white} />
                <Text style={styles.planBtnText}>{t('protoAudit.plans')}</Text>
              </TouchableOpacity>
            )}
            <View style={[styles.statusBadge, { backgroundColor: statusColor(p.status) }]}>
              <Text style={styles.statusText}>{statusLabel(p.status)}</Text>
            </View>
          </View>
        )}
      />
      </View>

      <ScrollView contentContainerStyle={[styles.body, (!numericMode && zoom.scale !== 1) ? { transform: [{ scale: zoom.scale }] } : null]}>
        {/* Encabezado formal tipo Dossier PDF */}
        <View style={styles.dossierHeader}>
          {/* Top bar — IZQ: nombre del ensayo + proyecto + estado debajo.
              DER: QR + código del ensayo debajo (QR también en RECHAZADO). */}
          <View style={styles.dossierTopBar}>
            <View style={{ flex: 1, paddingRight: 10 }}>
              <Text style={styles.dossierProtoNumber}>{p.protocolNumber}</Text>
              {!!projectName && <Text style={styles.dossierProjectHint}>{projectName}</Text>}
              <View style={[styles.dossierStatusBadge, { backgroundColor: statusColor(p.status), alignSelf: 'flex-start', marginTop: 6 }]}>
                <Text style={styles.dossierStatusText}>{statusLabel(p.status)}</Text>
              </View>
            </View>
            {(p.status === 'SUBMITTED' || p.status === 'APPROVED' || p.status === 'REJECTED') ? (
              <View style={{ alignItems: 'center' }}>
                <QrCodeView value={buildProtocolDeepLink(buildQrIdentifier({ idProtocolo, externalId: p.externalId ?? null, protocolUuid: p.id }))} size={92} />
                <Text style={styles.qrBandCode}>{p.protocolCode ?? p.protocolNumber ?? '—'}</Text>
              </View>
            ) : null}
          </View>

          {/* Grid de información — mismo orden que el PDF Dossier */}
          <View style={styles.infoGrid}>
            <View style={styles.infoRow}>
              <InfoCell label={t('protoAudit.field.project')} value={projectName || '—'} />
              <InfoCell label={t('protoAudit.field.date')} value={new Date().toLocaleDateString('es-PE')} />
            </View>
            <View style={styles.infoRow}>
              <InfoCell label={t('protoAudit.field.supervisor')} value={filledByName} />
              <InfoCell
                label={t('protoAudit.field.filledAt')}
                value={p.filledAt ? new Date(p.filledAt).toLocaleString('es-PE') : (p.submittedAt ? new Date(p.submittedAt).toLocaleString('es-PE') : '—')}
              />
            </View>
            <View style={styles.infoRow}>
              <InfoCell label={t('protoAudit.field.approver')} value={signedByName} />
              <InfoCell
                label={t('protoAudit.field.approvedAt')}
                value={p.signedAt ? new Date(p.signedAt).toLocaleString('es-PE') : '—'}
              />
            </View>
            <View style={styles.infoRow}>
              <InfoCell label={t('protoAudit.field.protocolId')} value={idProtocolo || p.protocolNumber} />
              {/* v33 — En protocolos NUMÉRICOS se quita la cartilla de ubicación
                  (ahora se trabaja con coordenadas/sector vía la tarjeta GPS de
                  abajo). En clásicos se mantiene. */}
              {!numericMode && (
                <InfoCell label={t('protoAudit.field.location')} value={(location as any)?.locationOnly ?? p.locationReference ?? '—'} />
              )}
              {!numericMode && !!(location as any)?.specialty && (
                <InfoCell label={t('protoAudit.field.specialty')} value={(location as any).specialty} />
              )}
            </View>
            {p.rejectionReason && p.status !== 'APPROVED' ? (
              <View style={styles.rejectionRow}>
                <Text style={styles.rejectionLabel}>{t('protoAudit.rejectionLabel')}</Text>
                <Text style={styles.rejectionText}>{p.rejectionReason}</Text>
              </View>
            ) : null}
          </View>

          {/* A9 — Resumen cumple/no-cumple SOLO para protocolos clásicos: en los
              numéricos contaba headers/ocultos y confundía (la tabla numérica ya
              trae su propio estado por fila). */}
          {!numericMode && (
            <View style={styles.statStrip}>
              <View style={styles.statCell}>
                <Text style={[styles.statNum, { color: Colors.success }]}>{compliant}</Text>
                <Text style={styles.statLabel}>{t('protoAudit.stat.compliant')}</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statCell}>
                <Text style={[styles.statNum, { color: Colors.danger }]}>{nonCompliant}</Text>
                <Text style={styles.statLabel}>{t('protoAudit.stat.nonCompliant')}</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statCell}>
                <Text style={[styles.statNum, { color: Colors.textMuted }]}>
                  {Math.max(0, items.length - compliant - nonCompliant)}
                </Text>
                <Text style={styles.statLabel}>{t('protoAudit.stat.unanswered')}</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statCell}>
                <Text style={[styles.statNum, { color: Colors.primary }]}>{items.length}</Text>
                <Text style={styles.statLabel}>{t('protoAudit.stat.total')}</Text>
              </View>
            </View>
          )}

          {/* v33 — Tarjeta de Coordenadas INTEGRADA dentro de Datos Generales
              (fondo blanco, embebida). Antes era una tarjeta gris separada. */}
          {protocol && projectFlags && (
            (numericMode && projectFlags.gps_capture_numeric) ||
            (!numericMode && projectFlags.gps_capture_subjective)
          ) && (
            <GPSCaptureBar protocol={protocol} readOnly embedded title={t('protoAudit.gpsTitle')} />
          )}
        </View>

        {/* v42 — Aviso de llamados entre ensayos desactualizados (frescura híbrida). */}
        {xrefStale && (
          <View style={styles.xrefStaleBanner}>
            <Ionicons name="sync-circle-outline" size={18} color={Colors.warning} />
            <View style={{ flex: 1 }}>
              <Text style={styles.xrefStaleTitle}>{t('protoAudit.xref.staleTitle')}</Text>
              <Text style={styles.xrefStaleSub} numberOfLines={2}>
                {isJefe ? t('protoAudit.xref.staleSubChief') : t('protoAudit.xref.staleSubOther')}
              </Text>
            </View>
            {isJefe && (
              <TouchableOpacity style={styles.xrefStaleBtn} onPress={handleRefreshXref} disabled={refreshingXref} activeOpacity={0.8}>
                {refreshingXref
                  ? <ActivityIndicator color={Colors.white} size="small" />
                  : <Text style={styles.xrefStaleBtnText}>{t('protoAudit.xref.update')}</Text>}
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* Modo numérico: NumericTable en lugar de la tabla clásica */}
        {numericMode ? (
          <View style={{ gap: 12 }} ref={auditItemsListRef}>
            <NumericTable
              protocolCode={(protocol as any)?.protocolCode ?? null}
              items={items.map(it => ({
                id: (it as any).id,
                partida_item: (it as any).partidaItem ?? null,
                item_description: (it as any).itemDescription ?? '',
                validation_method: (it as any).validationMethod ?? null,
                comments: (it as any).comments ?? null,
                section: (it as any).section ?? null,
              }))}
              readOnly
              frozen={true}
              cellScale={zoom.scale}
            />
            {!!(protocol as any).generalComment && (
              <View style={styles.generalCommentBlock}>
                <Text style={styles.generalCommentTitle}>{t('protoAudit.generalCommentsTitle')}</Text>
                <Text style={styles.generalCommentText}>{(protocol as any).generalComment}</Text>
              </View>
            )}
          </View>
        ) : (
        /* Tabla de items (formato tipo Dossier PDF) */
        <View style={styles.itemsTable} ref={auditItemsListRef}>
          <View style={styles.tableHeader}>
            <Text style={[styles.th, styles.thNum]}>#</Text>
            <Text style={[styles.th, styles.thDesc]}>{t('protoAudit.table.description')}</Text>
            <Text style={[styles.th, styles.thResult]}>{t('protoAudit.table.compliant')}</Text>
          </View>
          {items.map((item, index) => {
            const photos = evidenceMap[item.id] ?? [];
            const hasPhotos = photos.length > 0;
            const hasComment = !!item.comments;
            const hasSection = !!item.section;
            const prevSection = index > 0 ? items[index - 1].section : null;
            const newSection = hasSection && item.section !== prevSection;
            return (
              <React.Fragment key={item.id}>
                {newSection && (
                  <View style={styles.sectionHeader}>
                    <Text style={styles.sectionHeaderText}>{item.section}</Text>
                  </View>
                )}
                <View style={[styles.tableRow, index % 2 === 1 && styles.tableRowAlt]}>
                  <Text style={[styles.td, styles.thNum, styles.tdNum]}>{index + 1}</Text>
                  <Text style={[styles.td, styles.thDesc]}>{item.itemDescription}</Text>
                  <View style={[styles.thResult, { alignItems: 'center', justifyContent: 'center' }]}>
                    <View style={[
                      styles.resultBadge,
                      (item as any).isNa && styles.resultBadgeNa,
                      item.isCompliant === true && !(item as any).isNa && styles.resultBadgeYes,
                      item.isCompliant === false && !(item as any).isNa && styles.resultBadgeNo,
                    ]}>
                      <Text style={[
                        styles.resultText,
                        (item as any).isNa && { color: '#e37400' },
                        item.isCompliant === true && !(item as any).isNa && { color: Colors.success },
                        item.isCompliant === false && !(item as any).isNa && { color: Colors.danger },
                      ]}>
                        {(item as any).isNa ? 'N/A' : item.isCompliant === true ? '✓' : item.isCompliant === false ? '✗' : '—'}
                      </Text>
                    </View>
                  </View>
                </View>
                {(hasComment || hasPhotos) && (
                  <View style={[styles.rowExtras, index % 2 === 1 && styles.tableRowAlt]}>
                    {hasComment && (
                      <View style={styles.commentRow}>
                        <Text style={styles.commentLabel}>{t('protoAudit.obsLabel')}</Text>
                        <Text style={styles.commentText}>{item.comments}</Text>
                      </View>
                    )}
                    {hasPhotos && (
                      <View style={styles.photosRow}>
                        {photos.map((ev) => (
                          <TouchableOpacity
                            key={ev.id}
                            onPress={() => {
                              const uris = photos.map((e) => e.localUri);
                              const idx = uris.indexOf(ev.localUri);
                              setFullscreenPhotos(uris);
                              setFullscreenInitIdx(Math.max(0, idx));
                              setCurrentFullIdx(Math.max(0, idx));
                            }}
                            onLongPress={() => {
                              if (!isJefe) return;
                              Alert.alert(t('protoAudit.deletePhotoTitle'), t('protoAudit.deletePhotoMsg'), [
                                { text: t('protoAudit.cancel'), style: 'cancel' },
                                {
                                  text: t('protoAudit.delete'), style: 'destructive',
                                  onPress: async () => {
                                    await database.write(async () => { await ev.destroyPermanently(); });
                                    setEvidenceMap((prev) => {
                                      const updated = { ...prev };
                                      updated[item.id] = (updated[item.id] ?? []).filter((e) => e.id !== ev.id);
                                      return updated;
                                    });
                                  },
                                },
                              ]);
                            }}
                          >
                            <Image
                              source={{ uri: ev.localUri }}
                              style={styles.photoThumb}
                              resizeMode="cover"
                            />
                          </TouchableOpacity>
                        ))}
                      </View>
                    )}
                  </View>
                )}
              </React.Fragment>
            );
          })}
        </View>
        )}

        {/* Adjuntar evidencia fotográfica extra — solo jefe */}
        {isJefe && (
          <View style={styles.extraPhotoSection}>
            <TouchableOpacity
              style={[styles.extraPhotoBtn, addingPhoto && styles.btnDisabled]}
              onPress={handleAddExtraPhoto}
              disabled={addingPhoto}
            >
              {addingPhoto
                ? <ActivityIndicator color={Colors.primary} size="small" />
                : <>
                    <Ionicons name="camera-outline" size={16} color={Colors.primary} />
                    <Text style={styles.extraPhotoBtnText}>{t('protoAudit.attachExtraPhoto')}</Text>
                  </>
              }
            </TouchableOpacity>
            {extraPhotos.length > 0 && (
              <View style={styles.photosRow}>
                {extraPhotos.map((uri, idx) => (
                  <TouchableOpacity key={uri} onPress={() => {
                    setFullscreenPhotos(extraPhotos);
                    setFullscreenInitIdx(idx);
                    setCurrentFullIdx(idx);
                  }}
                    onLongPress={() => {
                      Alert.alert(t('protoAudit.deletePhotoTitle'), t('protoAudit.deleteExtraPhotoMsg'), [
                        { text: t('protoAudit.cancel'), style: 'cancel' },
                        { text: t('protoAudit.delete'), style: 'destructive', onPress: async () => {
                          const updated = extraPhotos.filter(u => u !== uri);
                          setExtraPhotos(updated);
                          await AsyncStorage.setItem(extraPhotosKey, JSON.stringify(updated));
                        }},
                      ]);
                    }}
                  >
                    <Image source={{ uri }} style={styles.photoThumb} resizeMode="cover" />
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>
        )}

        {/* Acciones del Jefe — Aprobar (solo si canApprove) y Rechazar */}
        {isJefe && p.status === 'SUBMITTED' && (
          <View ref={auditActionBtnsRef} style={styles.actions}>
            {/* v33 — El botón Aprobar SIEMPRE está disponible; si el ensayo no
                cumple, el modal exige un motivo de aprobación. */}
            <TouchableOpacity
              style={[styles.actionBtn, requiresApprovalReason ? styles.actionBtnApproveWarn : styles.actionBtnApprove]}
              onPress={() => setShowApproveModal(true)}
              disabled={saving}
            >
              {saving
                ? <ActivityIndicator color={requiresApprovalReason ? '#b45309' : Colors.success} />
                : <Text style={[styles.actionBtnTextApprove, requiresApprovalReason && styles.actionBtnTextApproveWarn]}>
                    {requiresApprovalReason ? t('protoAudit.approveWithObservation') : t('protoAudit.approveAndSign')}
                  </Text>
              }
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionBtn, styles.actionBtnReject]}
              onPress={() => setShowRejectModal(true)}
              disabled={saving}
            >
              <Text style={styles.actionBtnTextReject}>{t('protoAudit.rejectBtn')}</Text>
            </TouchableOpacity>
          </View>
        )}

        {p.status === 'APPROVED' && (
          <View style={styles.signedBanner}>
            <Text style={styles.signedText}>{t('protoAudit.signedDigitally')}</Text>
            {p.signedAt && (
              <Text style={styles.signedDate}>
                {new Date(p.signedAt).toLocaleString('es-PE')}
              </Text>
            )}
            {/* v33 — motivo si se aprobó fuera de rango */}
            {(p as any).approvalReason ? (
              <Text style={styles.approveWarnText}>{t('protoAudit.approvalReasonOutOfRange', { reason: (p as any).approvalReason })}</Text>
            ) : null}
          </View>
        )}
      </ScrollView>

      {/* Modal foto fullscreen con swipe */}
      <Modal visible={fullscreenPhotos.length > 0} transparent animationType="fade" onRequestClose={() => setFullscreenPhotos([])}>
        <View style={styles.photoModalOverlay}>
          <FlatList
            ref={fullscreenListRef}
            data={fullscreenPhotos}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            initialScrollIndex={fullscreenInitIdx}
            getItemLayout={(_, index) => ({ length: screenWidth, offset: screenWidth * index, index })}
            onMomentumScrollEnd={(e) => {
              const idx = Math.round(e.nativeEvent.contentOffset.x / screenWidth);
              setCurrentFullIdx(idx);
            }}
            keyExtractor={(uri, i) => `${uri}-${i}`}
            renderItem={({ item: uri }) => (
              <TouchableOpacity activeOpacity={1} onPress={() => setFullscreenPhotos([])} style={{ width: screenWidth, height: screenHeight, alignItems: 'center', justifyContent: 'center' }}>
                <Image source={{ uri }} style={{ width: screenWidth, height: screenHeight * 0.85 }} resizeMode="contain" />
              </TouchableOpacity>
            )}
          />
          {fullscreenPhotos.length > 1 && (
            <View style={styles.photoCounter}>
              <Text style={styles.photoCounterText}>{currentFullIdx + 1} / {fullscreenPhotos.length}</Text>
            </View>
          )}
        </View>
      </Modal>

      {/* Modal de rechazo con motivo */}
      <Modal visible={showRejectModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{t('protoAudit.rejectModal.title')}</Text>
            <Text style={styles.modalSubtitle}>
              {t('protoAudit.rejectModal.subtitle')}
            </Text>
            <TextInput
              style={styles.reasonInput}
              placeholder={t('protoAudit.rejectModal.placeholder')}
              placeholderTextColor={Colors.textMuted}
              value={rejectReason}
              onChangeText={setRejectReason}
              multiline
              numberOfLines={4}
              autoFocus
            />
            <View style={styles.modalBtns}>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={() => { setShowRejectModal(false); setRejectReason(''); }}
              >
                <Text style={styles.cancelBtnText}>{t('protoAudit.cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.rejectConfirmBtn, !rejectReason.trim() && styles.btnDisabled]}
                onPress={confirmReject}
                disabled={!rejectReason.trim()}
              >
                <Text style={styles.rejectConfirmBtnText}>{t('protoAudit.rejectModal.confirm')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* v33 — Modal de aprobación. Si el ensayo NO cumple, exige motivo. */}
      <Modal visible={showApproveModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{t('protoAudit.approveModal.title')}</Text>
            <Text style={styles.modalSubtitle}>
              {t('protoAudit.approveModal.subtitle')}
            </Text>
            {requiresApprovalReason && (
              <>
                <Text style={styles.approveWarnText}>
                  {t('protoAudit.approveModal.warn')}
                </Text>
                <TextInput
                  style={styles.reasonInput}
                  placeholder={t('protoAudit.approveModal.reasonPlaceholder')}
                  placeholderTextColor={Colors.textMuted}
                  value={approvalReason}
                  onChangeText={setApprovalReason}
                  multiline
                  numberOfLines={3}
                  autoFocus
                />
              </>
            )}
            <View style={styles.modalBtns}>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={() => { setShowApproveModal(false); setApprovalReason(''); }}
                disabled={saving}
              >
                <Text style={styles.cancelBtnText}>{t('protoAudit.cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.rejectConfirmBtn, { backgroundColor: Colors.success }, requiresApprovalReason && !approvalReason.trim() && styles.btnDisabled]}
                onPress={confirmApprove}
                disabled={saving || (requiresApprovalReason && !approvalReason.trim())}
              >
                {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.rejectConfirmBtnText}>{t('protoAudit.approveAndSign')}</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function statusColor(status: string) {
  const map: Record<string, string> = {
    DRAFT: Colors.warning, SUBMITTED: Colors.primary, APPROVED: Colors.success, REJECTED: Colors.danger,
  };
  return map[status] ?? Colors.textMuted;
}
function statusLabel(status: string) {
  const map: Record<string, string> = {
    DRAFT: tx('protoAudit.status.inProgress'),
    IN_PROGRESS: tx('protoAudit.status.inProgress'),
    SUBMITTED: tx('protoAudit.status.inReview'),
    APPROVED: tx('protoAudit.status.approved'),
    REJECTED: tx('protoAudit.status.rejected'),
  };
  return map[status] ?? status;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.surface },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  // v46.1 — carga esquelética (espejo del llenado).
  skelHeader: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.navy, paddingTop: 34, paddingBottom: 8, paddingHorizontal: 14 },
  skelBlock: { backgroundColor: '#e3e8ef', borderRadius: Radius.md, width: '100%' },
  skelSpinner: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  headerRight: { alignItems: 'flex-end', gap: 4 },
  headerRightNum: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  headerSep: { color: 'rgba(255,255,255,0.5)', fontSize: 18, fontWeight: '300' },
  normaTextBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  normaTextBtnLabel: { color: Colors.white, fontSize: 12, fontWeight: '700' },
  planMenu: {
    position: 'absolute', top: '100%', right: 0, zIndex: 100,
    backgroundColor: Colors.white, borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.border, minWidth: 140, ...Shadow.card,
  },
  planMenuItem: { paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: Colors.border },
  planMenuItemText: { fontSize: 13, color: Colors.navy, fontWeight: '600' },
  backBtn: { padding: 4 },
  editBtn: {
    backgroundColor: Colors.primary, borderRadius: Radius.md,
    paddingHorizontal: 12, paddingVertical: 6, alignItems: 'center',
  },
  editBtnText: { color: Colors.white, fontSize: 12, fontWeight: '700' },
  planBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: Colors.navy, borderRadius: Radius.md,
    paddingHorizontal: 10, paddingVertical: 6,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)',
  },
  planBtnText: { color: Colors.white, fontSize: 11, fontWeight: '700', letterSpacing: 0.5 },
  statusBadge: { borderRadius: Radius.sm, paddingHorizontal: 10, paddingVertical: 4 },
  statusText: { color: Colors.white, fontSize: 10, fontWeight: '700' },
  // v43 — Banda QR (en revisión / aprobado)
  qrBand: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.white, paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: Colors.border },
  qrBandLabel: { fontSize: 11, color: Colors.textMuted, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  qrBandProject: { fontSize: 18, color: Colors.navy, fontWeight: '800', marginTop: 2 },
  qrBandCode: { fontSize: 12, color: Colors.textPrimary, fontWeight: '800', marginTop: 6 },
  qrBandStatus: { borderRadius: Radius.sm, paddingHorizontal: 10, paddingVertical: 3, marginTop: 4 },
  qrBandStatusText: { color: Colors.white, fontSize: 10, fontWeight: '800' },
  body: { padding: 16, gap: 12, paddingBottom: 60 },
  // ── Encabezado tipo Dossier PDF ───────────────────────────────────────────
  dossierHeader: {
    backgroundColor: Colors.white, borderRadius: Radius.md, padding: 14, gap: 12,
    borderWidth: 1, borderColor: Colors.border, ...Shadow.subtle,
  },
  dossierTopBar: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingBottom: 10, borderBottomWidth: 2, borderBottomColor: Colors.border,
  },
  dossierProtoNumber: { fontSize: 18, fontWeight: '800', color: Colors.navy, letterSpacing: 0.3 },
  dossierProjectHint: { fontSize: 11, fontWeight: '600', color: Colors.textMuted, marginTop: 1 },
  dossierStatusBadge: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: Radius.sm },
  dossierStatusText: { color: Colors.white, fontSize: 10, fontWeight: '800', letterSpacing: 0.6 },
  infoGrid: { gap: 5 },
  infoRow: { flexDirection: 'row', gap: 5, flexWrap: 'wrap' },
  rejectionRow: {
    backgroundColor: '#fce8e6', borderRadius: 6, paddingHorizontal: 10, paddingVertical: 8,
    marginTop: 4, gap: 2,
  },
  rejectionLabel: { fontSize: 9, fontWeight: '800', color: '#d93025', letterSpacing: 0.6 },
  rejectionText: { fontSize: 12, fontWeight: '700', color: '#d93025' },
  statStrip: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: Colors.surface, borderRadius: Radius.sm,
    paddingVertical: 8,
  },
  statCell: { flex: 1, alignItems: 'center' },
  statNum: { fontSize: 18, fontWeight: '800' },
  statLabel: { fontSize: 10, color: Colors.textMuted, fontWeight: '600', marginTop: 1 },
  statDivider: { width: 1, height: 26, backgroundColor: Colors.border },

  // ── Tabla de items (estilo dossier) ──────────────────────────────────────
  itemsTable: {
    backgroundColor: Colors.white, borderRadius: Radius.md, overflow: 'hidden',
    borderWidth: 1, borderColor: Colors.border, ...Shadow.subtle,
  },
  tableHeader: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: Colors.navy, paddingVertical: 8, paddingHorizontal: 8,
  },
  th: { color: Colors.white, fontSize: 10, fontWeight: '800', letterSpacing: 0.6, textTransform: 'uppercase' },
  thNum: { width: 28, textAlign: 'center' },
  thDesc: { flex: 1, paddingHorizontal: 6 },
  thMethod: { width: 92, paddingHorizontal: 4 },
  thResult: { width: 62, textAlign: 'center' },
  tableRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 12, paddingHorizontal: 8,
    borderBottomWidth: 1, borderBottomColor: Colors.divider,
  },
  tableRowAlt: { backgroundColor: '#fafbfd' },
  td: { fontSize: 12, color: Colors.textPrimary },
  tdNum: { color: Colors.primary, fontWeight: '700', fontSize: 12 },
  tdMuted: { color: Colors.textMuted, fontSize: 11 },
  rowExtras: {
    paddingHorizontal: 12, paddingBottom: 10,
    borderBottomWidth: 1, borderBottomColor: Colors.divider,
    gap: 6,
  },
  sectionHeader: {
    backgroundColor: '#eef2fa', paddingVertical: 6, paddingHorizontal: 10,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  sectionHeaderText: {
    fontSize: 11, fontWeight: '800', color: Colors.primary,
    letterSpacing: 0.5, textTransform: 'uppercase',
  },
  commentRow: { flexDirection: 'row', gap: 6, alignItems: 'flex-start' },
  commentLabel: { fontSize: 10, fontWeight: '800', color: Colors.textMuted, marginTop: 1, letterSpacing: 0.4 },
  commentText: { flex: 1, fontSize: 12, color: Colors.textSecondary, fontStyle: 'italic' },
  resultBadge: {
    borderRadius: Radius.sm, paddingHorizontal: 8, paddingVertical: 2, backgroundColor: Colors.surface,
    minWidth: 30, alignItems: 'center',
  },
  resultBadgeYes: { backgroundColor: '#e8f5ee' },
  resultBadgeNo: { backgroundColor: '#fdecea' },
  resultBadgeNa: { backgroundColor: '#fff3e0' },
  resultText: { fontSize: 14, fontWeight: '800', color: Colors.textSecondary },
  photosRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingTop: 2 },
  photoThumb: { width: 72, height: 72, borderRadius: Radius.sm, backgroundColor: Colors.surface },
  photoModalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.92)' },
  photoCounter: {
    position: 'absolute', bottom: 32, alignSelf: 'center',
    backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 6,
  },
  photoCounterText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  actions: { gap: 10, marginTop: 8, flexDirection: 'row' },
  actionBtn: {
    flex: 1, padding: 13, borderRadius: Radius.lg, alignItems: 'center', borderWidth: 1.5,
  },
  actionBtnApprove: { backgroundColor: '#eaf7ee', borderColor: Colors.success },
  actionBtnApproveWarn: { backgroundColor: '#fef6e7', borderColor: '#f59e0b' }, // v33 override fuera de rango
  actionBtnReject: { backgroundColor: '#fdf0ef', borderColor: Colors.danger },
  actionBtnTextApprove: { color: Colors.success, fontWeight: '700', fontSize: 13, letterSpacing: 0.3 },
  actionBtnTextApproveWarn: { color: '#b45309' },
  actionBtnTextReject: { color: Colors.danger, fontWeight: '700', fontSize: 13, letterSpacing: 0.3 },
  approveWarnText: { color: '#b45309', fontWeight: '700', fontSize: 12, marginTop: 8, marginBottom: 4 },
  signedBanner: {
    backgroundColor: '#e8f5ee', borderRadius: Radius.lg, padding: 16,
    alignItems: 'center', gap: 4,
  },
  signedText: { color: Colors.success, fontWeight: '700', fontSize: 13 },
  signedDate: { color: Colors.textSecondary, fontSize: 12 },

  // Extra photos
  extraPhotoSection: { gap: 10, marginTop: 4 },
  generalCommentBlock: { backgroundColor: Colors.white, borderRadius: Radius.md, padding: 12, gap: 4, borderWidth: 1, borderColor: Colors.border, ...Shadow.subtle },
  generalCommentTitle: { fontSize: 10, fontWeight: '800', color: Colors.textMuted, letterSpacing: 0.6, textTransform: 'uppercase' },
  generalCommentText: { fontSize: 13, color: Colors.textPrimary, lineHeight: 19 },
  // v42 — banner de llamados entre ensayos desactualizados.
  xrefStaleBanner: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#fdf0d5', borderWidth: 1, borderColor: Colors.warning, borderRadius: Radius.md, padding: 12 },
  xrefStaleTitle: { fontSize: 13, fontWeight: '800', color: '#8a6d1f' },
  xrefStaleSub: { fontSize: 11, color: '#8a6d1f', marginTop: 1 },
  xrefStaleBtn: { backgroundColor: Colors.warning, paddingHorizontal: 14, paddingVertical: 8, borderRadius: Radius.sm },
  xrefStaleBtnText: { color: Colors.white, fontSize: 12, fontWeight: '800' },
  extraPhotoBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    borderWidth: 1.5, borderColor: Colors.primary, borderRadius: Radius.md,
    paddingVertical: 12, paddingHorizontal: 16, justifyContent: 'center',
  },
  extraPhotoBtnText: { color: Colors.primary, fontWeight: '700', fontSize: 13 },
  btnDisabled: { opacity: 0.5 },

  // Modal de rechazo
  modalOverlay: { flex: 1, backgroundColor: 'rgba(14,33,61,0.55)', justifyContent: 'flex-end' },
  modalCard: {
    backgroundColor: Colors.white, borderTopLeftRadius: Radius.xl, borderTopRightRadius: Radius.xl,
    padding: 24, gap: 14,
  },
  modalTitle: { fontSize: 17, fontWeight: '800', color: Colors.danger },
  modalSubtitle: { fontSize: 12, color: Colors.textMuted, lineHeight: 18 },
  reasonInput: {
    backgroundColor: Colors.surface, borderRadius: Radius.md, padding: 14,
    fontSize: 14, borderWidth: 1, borderColor: Colors.border,
    minHeight: 100, textAlignVertical: 'top', color: Colors.textPrimary,
  },
  modalBtns: { flexDirection: 'row', gap: 12, justifyContent: 'flex-end' },
  cancelBtn: { padding: 12 },
  cancelBtnText: { color: Colors.textSecondary, fontWeight: '600', fontSize: 14 },
  rejectConfirmBtn: {
    backgroundColor: Colors.danger, borderRadius: Radius.md,
    paddingHorizontal: 20, paddingVertical: 12,
  },
  rejectConfirmBtnText: { color: Colors.white, fontWeight: '700', fontSize: 14 },
});
