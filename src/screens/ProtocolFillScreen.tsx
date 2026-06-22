import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  TextInput, Alert, ActivityIndicator, ScrollView, Image, Modal, Dimensions,
  useWindowDimensions, Keyboard,
} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { applyPhotoStamps } from '@services/PhotoStampService';
import { getProjectSettings } from '@services/ProjectSettings';
import { uploadExtraPhoto } from '@services/S3PhotoService';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@navigation/types';
import {
  database, protocolsCollection, protocolItemsCollection,
  locationsCollection, plansCollection, evidencesCollection, projectsCollection,
  labAuxTablesCollection, protocolTemplatesCollection,
} from '@db/index';
import { Q } from '@nozbe/watermelondb';
import { useAuth } from '@context/AuthContext';
import { useTourStep } from '@hooks/useTourStep';
import { parseNumericRow, parseNumeric, splitRowComments, isNumericProtocol } from '@utils/numericProtocol';
import NumericTable from '@components/NumericTable';
import { useTour } from '@context/TourContext';
import type Protocol from '@models/Protocol';
import type ProtocolItem from '@models/ProtocolItem';
import type Location from '@models/Location';
import type Plan from '@models/Plan';
import type Evidence from '@models/Evidence';
import { Colors, Radius, Shadow } from '../theme/colors';
import { Ionicons } from '@expo/vector-icons';
import { pushProjectToSupabase, pushProtocolStatus, pushProtocolItem, pushPlansToSupabase } from '@services/SupabaseSyncService';
import { upsertSummaryRow } from '@services/SummaryRowService';
import { buildFrozenComments } from '@utils/freezeSnapshot';
import { resolveXrefs } from '@services/XrefResolver';
import { useEnsayoZoom, ZoomHeaderButtons } from '@components/ZoomControls';
import { enqueue as enqueueSync } from '@services/SyncQueueService';
import { SyncWorker } from '@services/SyncWorker';
import { GPSCaptureBar } from '@components/GPSCaptureBar';
import { parseFeatureFlagsJson } from '@utils/featureFlags';
import { supabase } from '@config/supabase';
import { listS3Keys, downloadFromS3 } from '@services/S3Service';
import { s3ProjectPrefix } from '@config/aws';
import { notifyProtocolSubmitted } from '@services/NotificationService';
import AppHeader from '@components/AppHeader';
import { useI18n } from '@i18n/index';

type Props = NativeStackScreenProps<RootStackParamList, 'ProtocolFill'>;

export default function ProtocolFillScreen({ navigation, route }: Props) {
  const { protocolId, sectorLocked } = route.params;
  const { currentUser } = useAuth();
  const { t } = useI18n();

  // Tour refs
  const protocolItemRowRef = useTourStep('protocol_item_row');
  const protocolCameraBtnRef = useTourStep('protocol_camera_btn');
  const protocolSubmitBtnRef = useTourStep('protocol_submit_btn');
  const protocolPlanosBtnRef = useTourStep('protocol_planos_btn');
  const { currentStep, isActive: tourActive, jumpToStep, isContextual, dismissTour, unregisterMeasure } = useTour();

  useEffect(() => {
    const unsub = navigation.addListener('blur', () => {
      if (tourActive && isContextual) dismissTour();
    });
    return unsub;
  }, [navigation, tourActive, isContextual, dismissTour]);

  // Auto-scroll al submit button cuando el tour llega a ese paso
  // Limpia primero la pre-medición obsoleta (tomada antes del scroll) para evitar flash
  useEffect(() => {
    if (tourActive && currentStep?.elementId === 'protocol_submit_btn') {
      unregisterMeasure('protocol_submit_btn');
      setTimeout(() => mainListRef.current?.scrollToEnd({ animated: false }), 80);
    }
  }, [tourActive, currentStep?.elementId]);
  const [protocol, setProtocol] = useState<Protocol | null>(null);
  // v26 — Feature flags del proyecto (para decidir si mostrar GPSCaptureBar)
  const [projectFlags, setProjectFlags] = useState<import('@utils/featureFlags').ProjectFeatureFlags | null>(null);
  const [idProtocolo, setIdProtocolo] = useState<string | null>(null);   // v45.3 — tipo de ficha (para agrupamientos)
  const [projectName, setProjectName] = useState('');   // v32 — "Datos generales"
  const zoom = useEnsayoZoom(); // v42d — zoom de la ficha (paneo total / re-encuadrar)
  const [items, setItems] = useState<ProtocolItem[]>([]);
  // v41 — Tablas auxiliares del proyecto (taras, moldes…) para BUSCAR() en fórmulas.
  const [auxTables, setAuxTables] = useState<import('@utils/formulaEval').AuxTables>({});
  // v32b — true cuando protocolo + items cargaron: hasta entonces se muestra un
  // SKELETON (evita el "flash" del formato clásico antes de detectar numérico).
  const [itemsLoaded, setItemsLoaded] = useState(false);
  const [location, setLocation] = useState<Location | null>(null);
  const [saving, setSaving] = useState(false);

  // Buscador de lugares + planos asociados
  const [locationSearch, setLocationSearch] = useState('');
  const [allLocations, setAllLocations] = useState<Location[]>([]);
  const [locationPlans, setLocationPlans] = useState<Plan[]>([]);
  const [planSearchDone, setPlanSearchDone] = useState(false); // true cuando ya se buscó en local + S3

  // Evidencias agrupadas por item
  const [evidenceMap, setEvidenceMap] = useState<Record<string, Evidence[]>>({});
  // (foto fullscreen manejada por fullscreenPhotos + fullscreenInitIdx)

  const { width: screenWidth, height: screenHeight } = useWindowDimensions();

  // Fullscreen photos (swipe entre fotos del mismo item)
  const [fullscreenPhotos, setFullscreenPhotos] = useState<string[]>([]);
  const [fullscreenInitIdx, setFullscreenInitIdx] = useState(0);
  const [currentFullIdx, setCurrentFullIdx] = useState(0);
  const fullscreenListRef = React.useRef<FlatList>(null);
  const mainListRef = React.useRef<FlatList>(null);

  // A4 — La casilla en edición SIEMPRE visible sobre el teclado: medimos la
  // celda al enfocar y, si cae bajo la franja del teclado, desplazamos la lista.
  const scrollOffsetRef = useRef(0);
  const kbHeightRef = useRef(320);
  // v35 (0.2) — flag de teclado visible: sin él, una altura "stale" de una
  // apertura anterior podía provocar un desplazamiento fantasma al enfocar
  // con el teclado aún cerrado (p.ej. tras navegar y volver).
  const kbVisibleRef = useRef(false);
  useEffect(() => {
    const subShow = Keyboard.addListener('keyboardDidShow', (e) => {
      kbVisibleRef.current = true;
      if (e?.endCoordinates?.height) kbHeightRef.current = e.endCoordinates.height;
    });
    const subHide = Keyboard.addListener('keyboardDidHide', () => { kbVisibleRef.current = false; });
    return () => { subShow.remove(); subHide.remove(); };
  }, []);
  const ensureCellVisible = useCallback((el: { measureInWindow?: (cb: (x: number, y: number, w: number, h: number) => void) => void } | null) => {
    if (!el?.measureInWindow) return;
    // Pequeño delay: deja que el teclado abra para medir contra su altura real.
    setTimeout(() => {
      if (!kbVisibleRef.current) return;   // el teclado no llegó a abrir: no desplazar
      el.measureInWindow?.((_x, y, _w, h) => {
        const winH = Dimensions.get('window').height;
        const kbTop = winH - kbHeightRef.current - 60;   // 60 = colchón (slot de rango + aire)
        if (y + h > kbTop) {
          const delta = (y + h) - kbTop;
          mainListRef.current?.scrollToOffset({ offset: Math.max(0, scrollOffsetRef.current + delta), animated: true });
        }
      });
    }, 150);
  }, []);

  // Estado local de edicion (se guarda en BD automáticamente)
  const [itemState, setItemState] = useState<
    Record<string, { isCompliant: boolean | null; isNa: boolean; comments: string }>
  >({});

  // Debounce refs para auto-save de comentarios
  const commentTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  // Fotos adicionales (solo jefe)
  const isJefe = currentUser?.role === 'RESIDENT' || currentUser?.role === 'CREATOR';
  const extraPhotosKey = `protocol_extra_photos_${protocolId}`;
  const [extraPhotos, setExtraPhotos] = useState<string[]>([]);
  const [addingExtraPhoto, setAddingExtraPhoto] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(extraPhotosKey)
      .then((val) => { if (val) setExtraPhotos(JSON.parse(val)); })
      .catch(() => {});
  }, [extraPhotosKey]);

  const handleAddExtraPhoto = async () => {
    if (!protocol) return;
    setAddingExtraPhoto(true);
    try {
      // Android SAF rinde mejor con un único type string.
      const result = await DocumentPicker.getDocumentAsync({
        type: 'image/*',
        copyToCacheDirectory: true,
      });
      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0];
      const projectId = (protocol as any).projectId ?? '';
      const settings = await getProjectSettings(projectId);
      const destDir = `${FileSystem.documentDirectory}extra_photos/`;
      await FileSystem.makeDirectoryAsync(destDir, { intermediates: true });
      const destUri = `${destDir}${protocolId}_${Date.now()}.jpg`;
      await FileSystem.copyAsync({ from: asset.uri, to: destUri });
      const stamped = await applyPhotoStamps(destUri, settings.stampEnabled ? settings.stampPhotoUri : null);
      const updated = [...extraPhotos, stamped];
      setExtraPhotos(updated);
      await AsyncStorage.setItem(extraPhotosKey, JSON.stringify(updated));

      // Subir a S3 en background
      const position = updated.length;
      uploadExtraPhoto(protocolId, stamped, position).catch(() => {});
    } catch (e) {
      Alert.alert(t('protoFill.error'), t('protoFill.extra.attachFailed.msg', { error: String(e) }));
    } finally {
      setAddingExtraPhoto(false);
    }
  };

  // v32 — Recargar fotos EXTRA al volver de la cámara (la cámara escribe la
  // misma key de AsyncStorage en el modo extraPhotoProtocolId).
  useFocusEffect(useCallback(() => {
    AsyncStorage.getItem(extraPhotosKey)
      .then((val) => { if (val) setExtraPhotos(JSON.parse(val)); })
      .catch(() => {});
  }, [extraPhotosKey]));

  // Recargar evidencias al volver de Camera
  useFocusEffect(useCallback(() => {
    if (items.length === 0) return;
    const itemIds = items.map((i) => (i as any).id);
    evidencesCollection
      .query(Q.where('protocol_item_id', Q.oneOf(itemIds)))
      .fetch()
      .then((evs) => {
        const map: Record<string, Evidence[]> = {};
        for (const ev of evs) {
          if (!map[ev.protocolItemId]) map[ev.protocolItemId] = [];
          map[ev.protocolItemId].push(ev);
        }
        setEvidenceMap(map);
      })
      .catch(() => {});
  }, [items]));

  useEffect(() => {
    const load = async () => {
      const proto = await protocolsCollection.find(protocolId);
      setProtocol(proto);
      // v45.3 — tipo de ficha (id_protocolo de la plantilla) para los agrupamientos.
      try { if ((proto as any).templateId) { const tpl = await protocolTemplatesCollection.find((proto as any).templateId); setIdProtocolo((tpl as any).idProtocolo ?? null); } } catch { /* sin plantilla → sin agrupamientos */ }
      // v26 — Cargar feature_flags del proyecto para gate del GPSCaptureBar
      try {
        const proj = await projectsCollection.find((proto as any).projectId);
        setProjectFlags(parseFeatureFlagsJson((proj as any).featureFlags));
        setProjectName((proj as any).name ?? '');   // v32 — para "Datos generales"
      } catch { /* sin feature_flags, gate falla → bar oculto, OK */ }
      // v41 — Tablas auxiliares del proyecto (taras, moldes…) para BUSCAR().
      try {
        const tbls = await labAuxTablesCollection
          .query(Q.where('project_id', (proto as any).projectId)).fetch();
        const map: import('@utils/formulaEval').AuxTables = {};
        for (const t of tbls as any[]) {
          try {
            map[String(t.groupKey).toLowerCase()] = {
              columns: JSON.parse(t.columnsJson ?? '[]'),
              rows: JSON.parse(t.rowsJson ?? '[]'),
            };
          } catch { /* tabla corrupta → se omite */ }
        }
        setAuxTables(map);
      } catch { /* sin tablas auxiliares → BUSCAR no disponible, OK */ }
      const fetched = await protocolItemsCollection
        .query(Q.where('protocol_id', protocolId))
        .fetch();
      // Orden natural por partida_item: "1, 2, 10" sale ordenado bien (no "1, 10, 2").
      // Si no hay partida_item, cae a created_at como desempate.
      const sorted = [...fetched].sort((x, y) => {
        const a = String((x as any).partidaItem ?? '').trim();
        const b = String((y as any).partidaItem ?? '').trim();
        const cmp = a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
        if (cmp !== 0) return cmp;
        return ((x as any).createdAt?.getTime?.() ?? 0) - ((y as any).createdAt?.getTime?.() ?? 0);
      });
      setItems(sorted as unknown as ProtocolItem[]);
      setItemsLoaded(true);   // v32b — gate del skeleton: ya sabemos el modo real

      // Cargar evidencias
      const itemIds = fetched.map((i) => i.id);
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

      // Inicializar estado: usar has_answer para saber si fue respondido
      const initial: Record<string, { isCompliant: boolean | null; isNa: boolean; comments: string }> = {};
      for (const item of fetched) {
        const i = item as any;
        const isNa = i.hasAnswer && i.isNa === true;
        initial[item.id] = {
          isCompliant: i.hasAnswer && !isNa ? i.isCompliant : null,
          isNa,
          comments: i.comments ?? '',
        };
      }
      setItemState(initial);
    };
    load();
  }, [protocolId]);

  useEffect(() => {
    if (!protocol?.locationId) return;
    let cancelled = false;

    (async () => {
      try {
        const loc = await locationsCollection.find(protocol.locationId!);
        if (cancelled) return;
        setLocation(loc);
        setLocationSearch(loc.name);

        // 1. Buscar planos en local
        const localPlans = await plansCollection.query(Q.where('location_id', loc.id)).fetch();
        if (cancelled) return;

        if (localPlans.length > 0) {
          setLocationPlans(localPlans as Plan[]);
          setPlanSearchDone(true);
          return;
        }

        // 2. No hay planos locales — buscar en S3 por reference_plan de la ubicación
        const referencePlan = (loc as any).referencePlan as string | undefined;
        if (!referencePlan) {
          setPlanSearchDone(true);
          return;
        }

        // Obtener nombre del proyecto para construir la ruta S3
        const projectId = protocol.projectId;
        let projectName = '';
        try {
          const proj = await projectsCollection.find(projectId);
          projectName = proj.name;
        } catch { /* fallback */ }

        if (!projectName || cancelled) {
          setPlanSearchDone(true);
          return;
        }

        const prefix = s3ProjectPrefix(projectName);
        const refNames = referencePlan.split(/[,;]/).map((s) => s.trim().toLowerCase()).filter(Boolean);

        // Listar planos disponibles en S3
        let planKeys: string[] = [];
        try {
          planKeys = await listS3Keys(`${prefix}/plans/`);
        } catch {
          setPlanSearchDone(true);
          return;
        }

        if (cancelled) return;

        // Buscar coincidencias por nombre
        const matchingKeys = planKeys.filter((key) => {
          const fileName = key.split('/').pop() ?? '';
          const planName = fileName.replace(/\.pdf$/i, '').toLowerCase().trim();
          return refNames.includes(planName);
        });

        if (matchingKeys.length === 0) {
          setPlanSearchDone(true);
          return;
        }

        // 3. Descargar y crear registros locales
        const destDir = `${FileSystem.documentDirectory}plans/`;
        await FileSystem.makeDirectoryAsync(destDir, { intermediates: true });

        const newPlans: Plan[] = [];
        for (const key of matchingKeys) {
          const fileName = key.split('/').pop()!;
          const planName = fileName.replace(/\.pdf$/i, '');
          const localUri = `${destDir}${fileName}`;

          try {
            await downloadFromS3(key, localUri);
            await database.write(async () => {
              const created = await plansCollection.create((p) => {
                p.projectId = projectId;
                p.locationId = loc.id;
                p.name = planName;
                p.fileUri = localUri;
                p.uploadedById = currentUser?.id ?? '';
              });
              newPlans.push(created as Plan);
            });
          } catch (e) {
            console.warn('[Plans] Error descargando plano S3:', e);
          }
        }

        if (cancelled) return;

        if (newPlans.length > 0) {
          setLocationPlans(newPlans);
          // Sincronizar los nuevos planos a Supabase
          pushPlansToSupabase(projectId).catch(() => {});
        }
        setPlanSearchDone(true);
      } catch {
        setPlanSearchDone(true);
      }
    })();

    return () => { cancelled = true; };
  }, [protocol]);

  // Cargar todas las ubicaciones del proyecto para el buscador
  useEffect(() => {
    if (!protocol) return;
    const projectId = protocol.projectId;
    if (!projectId) return;
    locationsCollection
      .query(Q.where('project_id', projectId))
      .fetch()
      .then((locs) => setAllLocations(locs as Location[]))
      .catch(() => {});
  }, [protocol]);

  const handleSelectLocation = async (loc: Location) => {
    setLocationSearch(loc.name);
    setLocation(loc);
    setLocationPlans([]);
    setPlanSearchDone(false);
    // Actualizar el locationId del protocolo
    await database.write(async () => {
      await (protocol as any)?.update((p: any) => {
        p.locationId = loc.id;
        p.locationReference = loc.name;
      });
    });
    // Buscar planos asociados en local
    const plans = await plansCollection.query(Q.where('location_id', loc.id)).fetch();
    if (plans.length > 0) {
      setLocationPlans(plans as Plan[]);
      setPlanSearchDone(true);
      return;
    }
    // No hay local — buscar en S3
    const referencePlan = (loc as any).referencePlan as string | undefined;
    if (!referencePlan || !protocol) { setPlanSearchDone(true); return; }
    try {
      let projectName = '';
      try { projectName = (await projectsCollection.find(protocol.projectId)).name; } catch {}
      if (!projectName) { setPlanSearchDone(true); return; }

      const prefix = s3ProjectPrefix(projectName);
      const refNames = referencePlan.split(/[,;]/).map((s) => s.trim().toLowerCase()).filter(Boolean);
      const planKeys = await listS3Keys(`${prefix}/plans/`);
      const matchingKeys = planKeys.filter((key) => {
        const fileName = key.split('/').pop() ?? '';
        return refNames.includes(fileName.replace(/\.pdf$/i, '').toLowerCase().trim());
      });

      if (matchingKeys.length === 0) { setPlanSearchDone(true); return; }

      const destDir = `${FileSystem.documentDirectory}plans/`;
      await FileSystem.makeDirectoryAsync(destDir, { intermediates: true });
      const newPlans: Plan[] = [];
      for (const key of matchingKeys) {
        const fileName = key.split('/').pop()!;
        const planName = fileName.replace(/\.pdf$/i, '');
        const localUri = `${destDir}${fileName}`;
        try {
          await downloadFromS3(key, localUri);
          await database.write(async () => {
            const created = await plansCollection.create((p) => {
              p.projectId = protocol.projectId;
              p.locationId = loc.id;
              p.name = planName;
              p.fileUri = localUri;
              p.uploadedById = currentUser?.id ?? '';
            });
            newPlans.push(created as Plan);
          });
        } catch {}
      }
      if (newPlans.length > 0) {
        setLocationPlans(newPlans);
        pushPlansToSupabase(protocol.projectId).catch(() => {});
      }
    } catch {}
    setPlanSearchDone(true);
  };

  // Persiste valor de un item numérico manual (mismo shape que setAnswer pero
   // para números: `comments` = valor textual, `isCompliant` = inRange).
  const saveNumericValue = async (input: { itemId: string; comments: string; isCompliant: boolean | null; hasAnswer: boolean }) => {
    setItemState(s => ({ ...s, [input.itemId]: { ...s[input.itemId], isCompliant: input.isCompliant, isNa: false, comments: input.comments } }));
    await database.write(async () => {
      const item = items.find(i => (i as any).id === input.itemId);
      if (item) {
        await (item as any).update((i: any) => {
          i.isCompliant = input.isCompliant ?? false;
          i.isNa = false;
          i.hasAnswer = input.hasAnswer;
          i.comments = input.comments;
        });
      }
    });
    // v25 — Enqueue para sync diferido. El worker drena cada 15s si hay red.
    // Antes este save NO se sincronizaba inmediatamente — el siguiente push
    // del proyecto entero (manual o tras SUBMIT) lo arrastraba. Ahora se
    // garantiza que llegue a Supabase sin acción del usuario.
    if (protocol?.projectId) {
      enqueueSync({ opType: 'PUSH_PROTOCOL_ITEM', entityId: input.itemId, projectId: protocol.projectId }).catch(() => {});
    }
  };

  // Guarda el comentario general del protocolo (sólo numéricos lo usan)
  const saveGeneralComment = async (text: string) => {
    await database.write(async () => {
      await (protocol as any).update((p: any) => { p.generalComment = text.trim() || null; });
    });
  };

  const setAnswer = async (itemId: string, value: true | false | 'na') => {
    const prev = itemState[itemId];
    // Tap en el mismo botón → desmarcar
    let newCompliant: boolean | null;
    let newNa: boolean;
    if (value === 'na') {
      if (prev?.isNa) { newCompliant = null; newNa = false; }
      else { newCompliant = null; newNa = true; }
    } else {
      const sameBtn = prev?.isCompliant === value && !prev?.isNa;
      if (sameBtn) { newCompliant = null; newNa = false; }
      else { newCompliant = value; newNa = false; }
    }
    setItemState((s) => ({ ...s, [itemId]: { ...s[itemId], isCompliant: newCompliant, isNa: newNa } }));
    let saved: any = null;
    await database.write(async () => {
      const item = items.find((i) => (i as any).id === itemId);
      if (item) {
        saved = await (item as any).update((i: any) => {
          i.isCompliant = newCompliant ?? false;
          i.isNa = newNa;
          i.hasAnswer = newCompliant !== null || newNa;
        });
      }
    });
    if (saved) {
      // v25 — Sync diferido garantizado vía cola. El push directo se mantiene
      // como optimización: si hay red, llega más rápido que el próximo tick
      // del worker; si no hay red, el worker lo recoge de la cola.
      pushProtocolItem(saved).catch(() => {});
      if (protocol?.projectId) {
        enqueueSync({ opType: 'PUSH_PROTOCOL_ITEM', entityId: itemId, projectId: protocol.projectId }).catch(() => {});
      }
    }
  };

  const setComment = (itemId: string, text: string) => {
    setItemState((s) => ({ ...s, [itemId]: { ...s[itemId], comments: text } }));
    // Debounce 600ms para no escribir en cada tecla
    if (commentTimers.current[itemId]) clearTimeout(commentTimers.current[itemId]);
    commentTimers.current[itemId] = setTimeout(async () => {
      let saved: any = null;
      await database.write(async () => {
        const item = items.find((i) => (i as any).id === itemId);
        if (item) saved = await (item as any).update((i: any) => { i.comments = text.trim() || null; });
      });
      if (saved) {
        pushProtocolItem(saved).catch(() => {});
        if (protocol?.projectId) {
          enqueueSync({ opType: 'PUSH_PROTOCOL_ITEM', entityId: itemId, projectId: protocol.projectId }).catch(() => {});
        }
      }
    }, 600);
  };

  // Detección de protocolo numérico (misma lógica que web)
  const numericMode = isNumericProtocol(items.map(it => ({ validation_method: (it as any).validationMethod ?? null })));

  const allAnswered = numericMode
    ? (() => {
        // v42e (M2) — un protocolo numérico NO se considera respondido si no tiene
        // NINGUNA celda de ingreso (p. ej. plantilla con typos que dejó todo como
        // headers/calculadas). Las reglas de completitud (manual + list) se mantienen
        // idénticas; solo se añade la exigencia de ≥1 celda de ingreso.
        let hasAnyInput = false;
        const allOk = items.every(it => {
          const spec = parseNumericRow((it as any).validationMethod ?? null);
          if (!spec) return false;
          if (spec.kind !== 'row') return true; // graph, header, matrix-* no requieren respuesta
          const cellVals = splitRowComments((it as any).comments ?? null, spec.cells.length);
          for (let i = 0; i < spec.cells.length; i++) {
            const ck = spec.cells[i].kind;
            if (ck === 'manual' || ck === 'percent' || ck === 'free' || ck === 'text'
              || ck === 'list' || ck === 'bool' || ck === 'equipment'
              || ck === 'date' || ck === 'time') hasAnyInput = true;
            if (ck === 'manual' && parseNumeric(cellVals[i]) == null) return false;
            if (ck === 'list' && (cellVals[i] ?? '').trim() === '') return false;
          }
          return true;
        });
        return allOk && hasAnyInput;
      })()
    : items.every((item) => {
        const s = itemState[(item as any).id];
        return s?.isCompliant !== null || s?.isNa === true;
      });

  // Construir lista plana con cabeceras de sección intercaladas
  type ListRow = { type: 'section'; title: string } | { type: 'item'; item: ProtocolItem; index: number };
  const listData: ListRow[] = [];
  let currentSection: string | undefined;
  let itemIndex = 0;
  for (const item of items) {
    const raw = (item as any).section as string | null | undefined;
    const sec = (raw && raw.trim() && raw.trim().toUpperCase() !== 'NA') ? raw.trim() : null;
    if (sec !== currentSection) {
      currentSection = sec ?? undefined;
      if (sec) listData.push({ type: 'section', title: sec });
    }
    listData.push({ type: 'item', item, index: itemIndex });
    itemIndex++;
  }

  // Índice del primer row de tipo 'item' en listData (para tour refs)
  const firstItemRowIndex = listData.findIndex((r) => r.type === 'item');

  const handleSubmit = useCallback(async () => {
    if (!allAnswered) {
      Alert.alert(t('protoFill.alert.incomplete.title'), t('protoFill.alert.incomplete.msg'));
      return;
    }
    if ((protocol as any)?.isLocked) {
      Alert.alert(t('protoFill.alert.locked.title'), t('protoFill.alert.locked.msg'));
      return;
    }

    setSaving(true);
    try {
      let updatedProtocol: any = null;

      // v42 — Resolver los llamados entre ensayos `@código.celda` ANTES de congelar
      // (lee de la base local; degrada solo: pendiente/ambiguo → null, nunca lanza).
      // `meta` se guarda en xref_snapshot_json para el doble check + frescura.
      let xrefVals: import('@utils/formulaEval').XrefValues = {};
      let xrefMeta: Record<string, unknown> = {};
      try {
        const r = await resolveXrefs(protocol?.projectId ?? '', items.map((it: any) => ({ validationMethod: it.validationMethod ?? null, comments: it.comments ?? null, partidaItem: it.partidaItem ?? null })));
        xrefVals = r.values; xrefMeta = r.meta;
      } catch { /* sin xrefs */ }

      await database.write(async () => {
        // Re-fetch fresh desde DB para evitar "deleted record" si hubo sync
        const freshItems = await protocolItemsCollection
          .query(Q.where('protocol_id', protocolId))
          .fetch();
        // v41/v42 — CONGELAR los valores computados (fórmula/lookup/BUSCAR + llamados
        // @código) en comments, usando tablas auxiliares + xrefValues. Así el
        // Audit/PDF/Resumen muestran lo que vio el usuario y NO se recalcula.
        // v42e (L8) — congelar sobre TODOS los items (no solo los que tienen entrada
        // en itemState). Un item llegado por sync tras montar la pantalla quedaba con
        // comments crudos mientras el resto se congelaba; además, las fórmulas cross-row
        // (p. ej. MDS que lee 4 puntos) perdían del scope los puntos no tocados. Para los
        // items sin estado, su comments de DB es la base.
        const frozen = buildFrozenComments(
          freshItems
            .map((it: any) => ({ id: it.id, partidaItem: it.partidaItem ?? null, validationMethod: it.validationMethod ?? null, comments: itemState[it.id]?.comments ?? it.comments ?? null })),
          auxTables,
          xrefVals,
        );
        for (const item of freshItems) {
          const state = itemState[(item as any).id];
          if (state) {
            await (item as any).update((i: any) => {
              i.isCompliant = state.isCompliant ?? false;
              i.isNa = state.isNa ?? false;
              i.hasAnswer = state.isCompliant !== null || state.isNa === true;
              i.comments = frozen.get((item as any).id) ?? (state.comments || null);
            });
          } else {
            // Item no tocado en esta sesión: congela igualmente sus celdas calculadas
            // (snapshot atómico del protocolo completo) SIN alterar su estado de respuesta.
            const fz = frozen.get((item as any).id);
            if (fz != null && fz !== (item as any).comments) {
              await (item as any).update((i: any) => { i.comments = fz; });
            }
          }
        }

        // Marcar protocolo como SUBMITTED (re-fetch para evitar stale)
        const freshProtocol = await protocolsCollection.find(protocolId);
        const wasResubmit = (freshProtocol as any).status === 'REJECTED' && (freshProtocol as any).filledById;
        updatedProtocol = await (freshProtocol as any).update((p: any) => {
          p.status = 'SUBMITTED';
          // Preservar `filled_by_id`/`filled_at` originales en re-submit (status REJECTED→SUBMITTED).
          // Solo set en la primera transición DRAFT/IN_PROGRESS → SUBMITTED — mantiene paridad con
          // `useResubmitProtocol` del web (no toca el firmante original al re-submitir).
          if (!wasResubmit) {
            p.filledById = currentUser?.id ?? null;
            p.filledAt = Date.now();
          }
          p.submittedAt = Date.now();
          // v42 — snapshot de los llamados entre ensayos (doble check + frescura).
          p.xrefSnapshotJson = Object.keys(xrefMeta).length ? JSON.stringify(xrefMeta) : null;
        });
      });

      // Push inmediato a Supabase + enqueue para garantizar retry si falla.
      // v25 — sin la cola, el SUBMIT offline quedaba solo local; ahora el
      // worker lo drena en cuanto vuelva la red.
      if (updatedProtocol) {
        pushProtocolStatus(updatedProtocol).catch(() => {});
        if (protocol?.projectId) {
          enqueueSync({ opType: 'PUSH_PROTOCOL_STATUS', entityId: protocolId, projectId: protocol.projectId })
            .then(() => SyncWorker.forceTick())
            .catch(() => {});
        }
      }

      // Tablas Resumen — construcción PROGRESIVA: actualiza la fila de este ensayo.
      // Reutiliza la MISMA resolución de xrefs del congelado (consistencia).
      upsertSummaryRow(protocolId, { xrefValues: xrefVals }).catch(() => {});

      // Push completo del proyecto en background
      if (protocol?.projectId) {
        pushProjectToSupabase(protocol.projectId).catch(() => {});
        const locOnly = (location as any)?.locationOnly ?? null;
        const spec = (location as any)?.specialty ?? null;
        const protName = (protocol as any).protocolNumber ?? '';
        notifyProtocolSubmitted(protocol.projectId, '', locOnly, spec, protName, protocol.id);
      }

      Alert.alert(
        t('protoFill.alert.sent.title'),
        t('protoFill.alert.sent.msg'),
        [{ text: t('protoFill.ok'), onPress: () => navigation.goBack() }]
      );
    } catch (e) {
      Alert.alert(t('protoFill.alert.sendFailed.title'), t('protoFill.alert.sendFailed.msg', { error: String(e) }));
    } finally {
      setSaving(false);
    }
  }, [allAnswered, protocol, items, itemState, currentUser, navigation, t]);

  if (!protocol || !itemsLoaded) {
    // v32b — Carga ESQUELÉTICA: franja superior + bloques grises mientras el
    // ensayo se arma en background. Al terminar, aparece directo el formato
    // correcto (sin flash del layout clásico).
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

  const isReadOnly =
    (protocol as any).status === 'APPROVED' ||
    (protocol as any).isLocked ||
    (protocol as any).status === 'SUBMITTED';

  // Filtrar ubicaciones según texto de búsqueda
  const searchTrimmed = locationSearch.trim().toLowerCase();
  const locationResults = searchTrimmed.length >= 1
    ? allLocations.filter(
        (l) =>
          l.name.toLowerCase().includes(searchTrimmed) &&
          l.id !== location?.id
      )
    : [];
  const showDropdown = locationResults.length > 0 && locationSearch !== location?.name;

  return (
    <View style={styles.container}>
      {/* v32b — En NUMÉRICOS: FRANJA compacta (back + nombre pequeño) en vez
          del header completo — ocupa lo mínimo. Los clásicos conservan su header. */}
      {!numericMode ? (
        <AppHeader
          title={(protocol as any).protocolNumber}
          subtitle={t('protoFill.header.date', { date: new Date().toLocaleDateString('es-PE') })}
          onBack={() => navigation.goBack()}
          rightContent={
            <TouchableOpacity onPress={() => jumpToStep('protocol_item_row')} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons name="help-circle-outline" size={22} color={Colors.white} />
            </TouchableOpacity>
          }
        />
      ) : (
        <View style={styles.miniHeader}>
          <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="arrow-back" size={20} color={Colors.white} />
          </TouchableOpacity>
          <Text style={[styles.miniHeaderTitle, { flex: 1 }]} numberOfLines={1}>
            {(protocol as any).protocolCode ? `${(protocol as any).protocolCode} · ` : ''}{(protocol as any).protocolNumber}
          </Text>
          {/* v42d — zoom (paneo total / re-encuadrar) también en el llenado. */}
          <ZoomHeaderButtons z={zoom} />
        </View>
      )}

      {/* Banner de rechazo — visible cuando el supervisor abre un protocolo rechazado */}
      {(protocol as any).status === 'REJECTED' && (protocol as any).rejectionReason && (
        <View style={styles.rejectionBanner}>
          <Text style={styles.rejectionTitle}>{t('protoFill.rejection.title')}</Text>
          <Text style={styles.rejectionReason}>{(protocol as any).rejectionReason}</Text>
        </View>
      )}

      {/* Lista de items */}
      <FlatList
        ref={mainListRef}
        onScroll={(e) => { scrollOffsetRef.current = e.nativeEvent.contentOffset.y; }}
        scrollEventThrottle={32}
        data={numericMode ? [] : listData}
        ListHeaderComponent={(
          <View style={{ paddingHorizontal: numericMode ? 8 : 12, gap: 12 }}>
            {/* v32 — "Datos generales": proyecto, código, ensayo, fecha/hora,
                ubicación (sin el recuadro "UBICACION") y el módulo GIS integrado. */}
          <View style={styles.dgCard}>
            <Text style={styles.dgTitle}>{t('protoFill.dg.title')}</Text>
            {/* v32 — Grid estructurado estilo Audit Page (celdas 2 por fila) */}
            <View style={styles.dgGrid}>
              <View style={styles.dgRow}>
                <View style={styles.dgCell}>
                  <Text style={styles.dgLabel}>{t('protoFill.dg.project')}</Text>
                  <Text style={styles.dgValue} numberOfLines={2}>{projectName || '—'}</Text>
                </View>
                <View style={styles.dgCell}>
                  <Text style={styles.dgLabel}>{t('protoFill.dg.code')}</Text>
                  <Text style={[styles.dgValue, (protocol as any)?.protocolCode && { color: Colors.navy, fontWeight: '900' }]} numberOfLines={1}>
                    {(protocol as any)?.protocolCode ?? '—'}
                  </Text>
                </View>
              </View>
              <View style={styles.dgRow}>
                <View style={styles.dgCell}>
                  <Text style={styles.dgLabel}>{t('protoFill.dg.test')}</Text>
                  <Text style={styles.dgValue} numberOfLines={2}>{(protocol as any)?.protocolNumber ?? '—'}</Text>
                </View>
                <View style={styles.dgCell}>
                  <Text style={styles.dgLabel}>{t('protoFill.dg.dateTime')}</Text>
                  <Text style={styles.dgValue} numberOfLines={1}>
                    {(protocol as any)?.ensayoDate
                      ? (protocol as any).ensayoDate.split('-').reverse().join('/')
                      : new Date().toLocaleDateString('es-PE')}
                    {(protocol as any)?.ensayoTime ? `  ·  ${(protocol as any).ensayoTime}` : ''}
                  </Text>
                </View>
              </View>
              {location && (
                <View style={styles.dgRow}>
                  <View style={styles.dgCell}>
                    <Text style={styles.dgLabel}>{t('protoFill.dg.location')}</Text>
                    <Text style={styles.dgValue} numberOfLines={2}>{location.name}</Text>
                  </View>
                  <TouchableOpacity
                    ref={protocolPlanosBtnRef}
                    style={[styles.planBtn, locationPlans.length === 0 && planSearchDone && { opacity: 0.5 }]}
                    onPress={() => {
                      if (locationPlans.length > 0) {
                        navigation.navigate('PlanViewer', {
                          planId: locationPlans[0].id,
                          planName: locationPlans[0].name,
                          protocolId: protocolId,
                          locationId: location.id,
                        });
                      } else if (!planSearchDone) {
                        Alert.alert(t('protoFill.plans.searchingAlert.title'), t('protoFill.plans.searchingAlert.msg'));
                      } else {
                        Alert.alert(t('protoFill.plans.none.title'), t('protoFill.plans.none.msg'));
                      }
                    }}
                  >
                    <Ionicons name="map-outline" size={14} color={Colors.white} />
                    <Text style={styles.planBtnText}>{t('protoFill.plans.btn')}</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>

            {locationPlans.length === 0 && location && !planSearchDone && (
              <Text style={styles.noPlanHint}>{t('protoFill.plans.searching')}</Text>
            )}

            {/* v32 — Módulo GIS integrado dentro de Datos generales */}
            {protocol && projectFlags && (
              (numericMode && projectFlags.gps_capture_numeric) ||
              (!numericMode && projectFlags.gps_capture_subjective)
            ) && (
              <GPSCaptureBar protocol={protocol} readOnly={isReadOnly} sectorLocked={sectorLocked} />
            )}
          </View>
            {numericMode && (
              <>
                <NumericTable
                  protocolCode={(protocol as any)?.protocolCode ?? null}
                  auxTables={auxTables}
                  projectId={(protocol as any)?.projectId ?? undefined}
                  items={items.map(it => ({
                    id: (it as any).id,
                    partida_item: (it as any).partidaItem ?? null,
                    item_description: (it as any).itemDescription ?? '',
                    validation_method: (it as any).validationMethod ?? null,
                    comments: (it as any).comments ?? null,
                    section: (it as any).section ?? null,
                  }))}
                  readOnly={isReadOnly}
                  cellScale={zoom.scale}
                  onChangeManual={(input) => { saveNumericValue(input); }}
                  onFocusCell={ensureCellVisible}
                  groupingPresets={(projectFlags?.grouping_presets && idProtocolo) ? projectFlags.grouping_presets[idProtocolo] : undefined}
                  groupingContext={{
                    projectId: (protocol as any)?.projectId ?? '',
                    tipoActual: idProtocolo,
                    sectorId: (protocol as any)?.sectorId ?? null,
                    sampleId: (protocol as any)?.sampleId ?? null,
                    locationId: (protocol as any)?.locationId ?? null,
                    ensayoDate: (protocol as any)?.ensayoDate ?? null,
                  }}
                />
              </>
            )}
          </View>
        )}

        keyExtractor={(row, index) => row.type === 'section' ? `sec-${row.title}-${index}` : (row.item as any).id}
        contentContainerStyle={[styles.list, numericMode && styles.listNumeric, (!numericMode && zoom.scale !== 1) ? { transform: [{ scale: zoom.scale }] } : null]}
        renderItem={({ item: row, index: rowIndex }) => {
          if (row.type === 'section') {
            return (
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionHeaderText}>{row.title}</Text>
              </View>
            );
          }
          const { item, index } = row;
          const state = itemState[(item as any).id] ?? { isCompliant: null, comments: '' };
          const i = item as any;
          return (
            <View ref={rowIndex === firstItemRowIndex ? protocolItemRowRef : undefined} style={styles.itemCard}>
              <View style={styles.itemHeader}>
                <Text style={styles.itemNum}>{index + 1}</Text>
                <Text style={styles.itemDesc}>{i.itemDescription}</Text>
                {i.validationMethod && (
                  <View style={styles.methodBadge}>
                    <Text style={styles.methodText}>{i.validationMethod}</Text>
                  </View>
                )}
              </View>

              {/* Sí / No / N/A */}
              {!isReadOnly && (
                <View style={styles.siNoRow}>
                  <TouchableOpacity
                    style={[styles.siNoBtn, state.isCompliant === true && !state.isNa && styles.siNoBtnYes]}
                    onPress={() => setAnswer((item as any).id, true)}
                  >
                    <Text style={[styles.siNoText, state.isCompliant === true && !state.isNa && styles.siNoTextYes]}>{t('protoFill.answer.yes')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.siNoBtn, state.isCompliant === false && !state.isNa && styles.siNoBtnNo]}
                    onPress={() => setAnswer((item as any).id, false)}
                  >
                    <Text style={[styles.siNoText, state.isCompliant === false && !state.isNa && styles.siNoTextNo]}>{t('protoFill.answer.no')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.siNoBtn, state.isNa && styles.siNoBtnNa]}
                    onPress={() => setAnswer((item as any).id, 'na')}
                  >
                    <Text style={[styles.siNoText, state.isNa && styles.siNoTextNa]}>{t('protoFill.answer.na')}</Text>
                  </TouchableOpacity>

                  {/* Camara */}
                  <TouchableOpacity
                    ref={rowIndex === firstItemRowIndex ? protocolCameraBtnRef : undefined}
                    style={styles.cameraBtn}
                    onPress={() =>
                      navigation.navigate('Camera', { protocolItemId: (item as any).id, projectId: protocol?.projectId })
                    }
                  >
                    <Ionicons name="camera-outline" size={18} color={Colors.primary} />
                  </TouchableOpacity>
                </View>
              )}

              {/* Vista de solo lectura */}
              {isReadOnly && (
                <View style={styles.siNoRow}>
                  <View style={[
                    styles.siNoBtn,
                    (i as any).isNa && styles.siNoBtnNa,
                    i.isCompliant === true && !(i as any).isNa && styles.siNoBtnYes,
                    i.isCompliant === false && !(i as any).isNa && styles.siNoBtnNo,
                  ]}>
                    <Text style={[
                      styles.siNoText,
                      (i as any).isNa && styles.siNoTextNa,
                      i.isCompliant === true && !(i as any).isNa && styles.siNoTextYes,
                      i.isCompliant === false && !(i as any).isNa && styles.siNoTextNo,
                    ]}>
                      {(i as any).isNa ? t('protoFill.answer.na') : i.isCompliant === true ? t('protoFill.answer.yes') : i.isCompliant === false ? t('protoFill.answer.no') : '—'}
                    </Text>
                  </View>
                </View>
              )}

              {/* Observacion */}
              {(!isReadOnly || state.comments) && (
                <TextInput
                  style={styles.commentInput}
                  placeholder={t('protoFill.item.commentPlaceholder')}
                  value={state.comments}
                  onChangeText={(t) => setComment((item as any).id, t)}
                  editable={!isReadOnly}
                  multiline
                />
              )}

              {/* Fotos del item */}
              {(evidenceMap[i.id] ?? []).length > 0 && (
                <View style={styles.photosRow}>
                  {(evidenceMap[i.id] ?? []).map((ev) => (
                    <TouchableOpacity
                      key={ev.id}
                      onPress={() => {
                        const uris = (evidenceMap[i.id] ?? []).map(e => e.localUri);
                        const idx = uris.indexOf(ev.localUri);
                        setFullscreenPhotos(uris);
                        setFullscreenInitIdx(Math.max(0, idx));
                        setCurrentFullIdx(Math.max(0, idx));
                      }}
                      onLongPress={() => {
                        Alert.alert(t('protoFill.photo.delete.title'), t('protoFill.photo.delete.msg'), [
                          { text: t('protoFill.cancel'), style: 'cancel' },
                          {
                            text: t('protoFill.delete'), style: 'destructive',
                            onPress: async () => {
                              const evId = ev.id;
                              await database.write(async () => { await ev.destroyPermanently(); });
                              // Eliminar de Supabase (el archivo S3 se conserva para mantener secuencia)
                              supabase.from('evidences').delete().eq('id', evId).then(() => {});
                              setEvidenceMap((prev) => {
                                const updated = { ...prev };
                                updated[i.id] = (updated[i.id] ?? []).filter((e) => e.id !== ev.id);
                                return updated;
                              });
                            },
                          },
                        ]);
                      }}
                    >
                      <Image source={{ uri: ev.localUri }} style={styles.photoThumb} resizeMode="cover" />
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>
          );
        }}
        ListFooterComponent={
          <View>
            {/* v32 — Orden de la base: (1) evidencia [archivos + cámara],
                (2) comentarios generales, (3) enviar para aprobación. */}
            {/* (1) Fotos adicionales — solo jefe, siempre visible */}
            {isJefe && (
              <View style={styles.extraPhotoSection}>
                <View style={styles.extraBtnsRow}>
                  <TouchableOpacity
                    style={[styles.extraPhotoBtn, { flex: 1 }, addingExtraPhoto && styles.submitBtnDisabled]}
                    onPress={handleAddExtraPhoto}
                    disabled={addingExtraPhoto}
                  >
                    {addingExtraPhoto
                      ? <ActivityIndicator color={Colors.primary} size="small" />
                      : <>
                          <Ionicons name="cloud-upload-outline" size={16} color={Colors.primary} />
                          <Text style={styles.extraPhotoBtnText}>{t('protoFill.extra.attach')}</Text>
                        </>
                    }
                  </TouchableOpacity>
                  {/* v32 — Cámara directa: misma cámara de los ensayos
                      tradicionales (logo + fecha/hora estampados); la foto se
                      guarda como evidencia extra. */}
                  <TouchableOpacity
                    style={styles.extraCameraBtn}
                    onPress={() => navigation.navigate('Camera', {
                      extraPhotoProtocolId: protocolId,
                      projectId: (protocol as any).projectId,
                    })}
                  >
                    <Ionicons name="camera-outline" size={18} color={Colors.primary} />
                  </TouchableOpacity>
                </View>
                {extraPhotos.length > 0 && (
                  <View style={styles.photosRow}>
                    {extraPhotos.map((uri) => (
                      <TouchableOpacity key={uri}
                        onPress={() => {
                          setFullscreenPhotos([uri]);
                          setFullscreenInitIdx(0);
                          setCurrentFullIdx(0);
                        }}
                        onLongPress={() => {
                          Alert.alert(t('protoFill.photo.delete.title'), t('protoFill.photo.deleteExtra.msg'), [
                            { text: t('protoFill.cancel'), style: 'cancel' },
                            { text: t('protoFill.delete'), style: 'destructive', onPress: async () => {
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

            {/* (2) Comentarios generales — numéricos */}
            {numericMode && (
              <View style={[styles.generalCommentBox, { marginHorizontal: 12, marginTop: 12 }]}>
                <Text style={styles.generalCommentLabel}>{t('protoFill.general.label')}</Text>
                <TextInput
                  style={styles.generalCommentInput}
                  value={(protocol as any).generalComment ?? ''}
                  editable={!isReadOnly}
                  multiline
                  numberOfLines={3}
                  placeholder={t('protoFill.general.placeholder')}
                  placeholderTextColor={Colors.textMuted}
                  onChangeText={(t) => {
                    // Optimistic local update — el modelo se actualiza al onEndEditing
                    (protocol as any).generalComment = t;
                  }}
                  onEndEditing={(e) => saveGeneralComment(e.nativeEvent.text)}
                />
              </View>
            )}

            {/* (3) Enviar para aprobación — al final de todo */}
            {!isReadOnly ? (
              <TouchableOpacity
                ref={protocolSubmitBtnRef}
                style={[styles.submitBtn, !allAnswered && styles.submitBtnDisabled, saving && styles.submitBtnDisabled]}
                onPress={handleSubmit}
                disabled={!allAnswered || saving}
              >
                {saving
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={styles.submitBtnText}>{t('protoFill.submit.btn')}</Text>
                }
              </TouchableOpacity>
            ) : (
              <View style={styles.readOnlyBanner}>
                <Text style={styles.readOnlyText}>
                  {(protocol as any).status === 'APPROVED'
                    ? t('protoFill.readOnly.approved')
                    : t('protoFill.readOnly.inReview')}
                </Text>
              </View>
            )}
          </View>
        }
      />

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
            keyExtractor={(uri) => uri}
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.surface },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  locationSection: {
    backgroundColor: Colors.white, paddingHorizontal: 14, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: Colors.border, gap: 6,
  },
  locationRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 10 },
  searchBox: { flex: 1, gap: 4 },

  // v32 — "Datos generales" (formato del Audit Page: celdas en grid, 2 por fila)
  dgCard: {
    backgroundColor: Colors.white, borderRadius: Radius.md, padding: 12, gap: 10,
    borderWidth: 1, borderColor: Colors.border, ...Shadow.subtle,
  },
  dgTitle: {
    fontSize: 11, fontWeight: '800', color: Colors.primary,
    textTransform: 'uppercase', letterSpacing: 0.8,
  },
  dgGrid: { gap: 5 },
  dgRow: { flexDirection: 'row', gap: 5, alignItems: 'stretch' },
  dgCell: {
    flex: 1, minWidth: 120,
    backgroundColor: '#f4f6f9', borderRadius: 6,
    paddingHorizontal: 10, paddingVertical: 6,
  },
  dgLabel: {
    fontSize: 9, fontWeight: '700', color: '#888', letterSpacing: 0.6,
    textTransform: 'uppercase', marginBottom: 2,
  },
  dgValue: { fontSize: 12, fontWeight: '700', color: '#1a1a2e' },
  searchLabel: { fontSize: 9, fontWeight: '700', color: Colors.textSecondary, letterSpacing: 1.5 },
  searchInput: {
    backgroundColor: Colors.surface, borderRadius: Radius.md, paddingHorizontal: 12, paddingVertical: 9,
    fontSize: 14, borderWidth: 1, borderColor: Colors.border, color: Colors.textPrimary,
  },
  locationFixed: {
    fontSize: 14, fontWeight: '600', color: Colors.navy, paddingVertical: 6,
  },
  planBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: Colors.navy, borderRadius: Radius.md,
    paddingHorizontal: 10, paddingVertical: 7,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)',
  },
  planBtnText: { color: Colors.white, fontSize: 11, fontWeight: '700', letterSpacing: 0.5 },
  planMenu: {
    position: 'absolute', top: '100%', right: 0, zIndex: 100,
    backgroundColor: Colors.white, borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.border, minWidth: 140, ...Shadow.card,
  },
  planMenuItem: { paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: Colors.border },
  planMenuItemText: { fontSize: 13, color: Colors.navy, fontWeight: '600' },
  dropdown: {
    maxHeight: 160, backgroundColor: Colors.white, borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.border, ...Shadow.subtle,
  },
  dropdownItem: { paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: Colors.border },
  dropdownItemText: { fontSize: 14, color: Colors.textPrimary, fontWeight: '600' },
  dropdownItemSub: { fontSize: 11, color: Colors.textMuted, marginTop: 1 },
  noPlanHint: { fontSize: 11, color: Colors.textMuted, fontStyle: 'italic' },

  rejectionBanner: {
    backgroundColor: '#fdecea', borderLeftWidth: 4, borderLeftColor: Colors.danger,
    paddingHorizontal: 16, paddingVertical: 12, gap: 4,
  },
  rejectionTitle: { fontSize: 12, fontWeight: '800', color: Colors.danger, letterSpacing: 0.5 },
  rejectionReason: { fontSize: 13, color: '#9b1c1c', lineHeight: 20 },

  list: { padding: 16, gap: 10, paddingBottom: 40 },
  // v32b — numéricos: márgenes reducidos pero con un poco de aire (offset 8)
  listNumeric: { paddingHorizontal: 8, paddingTop: 8 },
  // v32b — franja compacta superior (back + nombre) para numéricos
  miniHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: Colors.navy, paddingTop: 34, paddingBottom: 8, paddingHorizontal: 14,
  },
  miniHeaderTitle: { flex: 1, color: Colors.white, fontSize: 13, fontWeight: '800' },
  // v32b — skeleton de carga
  skelHeader: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: Colors.navy, paddingTop: 34, paddingBottom: 8, paddingHorizontal: 14,
  },
  skelBlock: { backgroundColor: '#e3e8ef', borderRadius: Radius.md, width: '100%' },
  skelSpinner: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  sectionHeader: {
    backgroundColor: Colors.navy, borderRadius: Radius.sm, paddingHorizontal: 14, paddingVertical: 8,
    marginTop: 4,
  },
  sectionHeaderText: { fontSize: 11, fontWeight: '800', color: Colors.white, letterSpacing: 1.5, textTransform: 'uppercase' },
  itemCard: {
    backgroundColor: Colors.white, borderRadius: Radius.lg, padding: 14,
    gap: 8, ...Shadow.subtle,
  },
  itemHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  itemNum: {
    width: 24, height: 24, borderRadius: 12, backgroundColor: Colors.primary,
    color: Colors.white, textAlign: 'center', lineHeight: 24, fontSize: 11, fontWeight: '700',
    flexShrink: 0, marginTop: 1,
  },
  partida: { fontSize: 11, color: Colors.textMuted },
  methodBadge: {
    backgroundColor: Colors.light, borderRadius: Radius.sm, paddingHorizontal: 8, paddingVertical: 2,
    flexShrink: 0,
  },
  methodText: { fontSize: 11, color: Colors.primary, fontWeight: '600' },
  itemDesc: { flex: 1, fontSize: 13, color: Colors.textPrimary, lineHeight: 20 },
  siNoRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  siNoBtn: {
    flex: 1, paddingVertical: 10, borderRadius: Radius.md, borderWidth: 1.5,
    borderColor: Colors.border, alignItems: 'center',
  },
  siNoBtnYes: { backgroundColor: '#e8f5ee', borderColor: Colors.success },
  siNoBtnNo: { backgroundColor: '#fdecea', borderColor: Colors.danger },
  siNoBtnNa: { backgroundColor: '#fff3e0', borderColor: '#e37400' },
  siNoText: { fontWeight: '700', color: Colors.textMuted, fontSize: 13 },
  siNoTextYes: { fontWeight: '700', color: Colors.success, fontSize: 13 },
  siNoTextNo: { fontWeight: '700', color: Colors.danger, fontSize: 13 },
  siNoTextNa: { fontWeight: '700', color: '#e37400', fontSize: 13 },
  siNoTextActive: { fontWeight: '700', color: Colors.textPrimary, fontSize: 13 },
  cameraBtn: {
    width: 44, height: 44, borderRadius: Radius.md, backgroundColor: Colors.light,
    alignItems: 'center', justifyContent: 'center',
  },
  commentInput: {
    backgroundColor: Colors.surface, borderRadius: Radius.md, padding: 10,
    fontSize: 13, color: Colors.textPrimary, borderWidth: 1, borderColor: Colors.border,
    minHeight: 36,
  },
  photosRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingTop: 4 },
  photoThumb: { width: 72, height: 72, borderRadius: Radius.sm, backgroundColor: Colors.surface },
  photoModalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.92)',
  },
  photoCounter: {
    position: 'absolute', bottom: 32, alignSelf: 'center',
    backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 6,
  },
  photoCounterText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  generalCommentBox: { backgroundColor: Colors.white, borderRadius: Radius.md, padding: 12, gap: 6, ...Shadow.subtle, borderWidth: 1, borderColor: Colors.border },
  generalCommentLabel: { fontSize: 11, fontWeight: '700', color: Colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5 },
  generalCommentInput: { backgroundColor: Colors.surface, borderRadius: Radius.sm, padding: 10, fontSize: 13, color: Colors.textPrimary, borderWidth: 1, borderColor: Colors.border, minHeight: 64, textAlignVertical: 'top' },
  submitBtn: {
    backgroundColor: Colors.primary, borderRadius: Radius.lg, padding: 16,
    alignItems: 'center', margin: 16,
  },
  submitBtnDisabled: { backgroundColor: Colors.light },
  submitBtnText: { color: Colors.white, fontWeight: '700', fontSize: 14, letterSpacing: 0.5 },
  readOnlyBanner: {
    margin: 16, padding: 14, backgroundColor: Colors.light, borderRadius: Radius.md,
    alignItems: 'center',
  },
  readOnlyText: { color: Colors.navy, fontSize: 13, fontWeight: '700' },
  extraPhotoSection: { marginHorizontal: 16, marginBottom: 32, gap: 10 },
  extraPhotoBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    borderWidth: 1.5, borderColor: Colors.primary, borderRadius: Radius.md,
    paddingVertical: 12, paddingHorizontal: 16, justifyContent: 'center',
  },
  extraPhotoBtnText: { color: Colors.primary, fontWeight: '700', fontSize: 13 },
  // v32 — fila de botones de evidencia (archivos + cámara)
  extraBtnsRow: { flexDirection: 'row', gap: 8, alignItems: 'stretch' },
  extraCameraBtn: {
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14,
    borderRadius: Radius.md, borderWidth: 1.5, borderColor: Colors.primary,
    backgroundColor: Colors.white,
  },
});
