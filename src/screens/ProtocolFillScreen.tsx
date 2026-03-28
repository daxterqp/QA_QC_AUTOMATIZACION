import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  TextInput, Alert, ActivityIndicator, ScrollView, Image, Modal, Dimensions,
  useWindowDimensions,
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
  locationsCollection, plansCollection, evidencesCollection,
} from '@db/index';
import { Q } from '@nozbe/watermelondb';
import { useAuth } from '@context/AuthContext';
import { useTourStep } from '@hooks/useTourStep';
import { useTour } from '@context/TourContext';
import type Protocol from '@models/Protocol';
import type ProtocolItem from '@models/ProtocolItem';
import type Location from '@models/Location';
import type Plan from '@models/Plan';
import type Evidence from '@models/Evidence';
import { Colors, Radius, Shadow } from '../theme/colors';
import { Ionicons } from '@expo/vector-icons';
import { pushProjectToSupabase, pushProtocolStatus, pushProtocolItem } from '@services/SupabaseSyncService';
import { supabase } from '@config/supabase';
import { notifyProtocolSubmitted } from '@services/NotificationService';
import AppHeader from '@components/AppHeader';

type Props = NativeStackScreenProps<RootStackParamList, 'ProtocolFill'>;

export default function ProtocolFillScreen({ navigation, route }: Props) {
  const { protocolId } = route.params;
  const { currentUser } = useAuth();

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
  const [items, setItems] = useState<ProtocolItem[]>([]);
  const [location, setLocation] = useState<Location | null>(null);
  const [saving, setSaving] = useState(false);

  // Buscador de lugares + planos asociados
  const [locationSearch, setLocationSearch] = useState('');
  const [allLocations, setAllLocations] = useState<Location[]>([]);
  const [locationPlans, setLocationPlans] = useState<Plan[]>([]);

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
      const result = await DocumentPicker.getDocumentAsync({
        type: ['image/jpeg', 'image/png', 'image/*'],
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
      Alert.alert('Error', `No se pudo adjuntar la foto.\n${String(e)}`);
    } finally {
      setAddingExtraPhoto(false);
    }
  };

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
      const fetched = await protocolItemsCollection
        .query(Q.where('protocol_id', protocolId))
        .fetch();
      setItems(fetched as unknown as ProtocolItem[]);

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
    if (protocol?.locationId) {
      locationsCollection.find(protocol.locationId).then((loc) => {
        setLocation(loc);
        setLocationSearch(loc.name);
        // Cargar el plano asociado a esta ubicación
        plansCollection
          .query(Q.where('location_id', loc.id))
          .fetch()
          .then((plans) => setLocationPlans(plans as Plan[]))
          .catch(() => {});
      }).catch(() => null);
    }
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
    // Actualizar el locationId del protocolo
    await database.write(async () => {
      await (protocol as any)?.update((p: any) => {
        p.locationId = loc.id;
        p.locationReference = loc.name;
      });
    });
    // Buscar planos asociados
    const plans = await plansCollection.query(Q.where('location_id', loc.id)).fetch();
    setLocationPlans(plans as Plan[]);
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
    if (saved) pushProtocolItem(saved).catch(() => {});
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
      if (saved) pushProtocolItem(saved).catch(() => {});
    }, 600);
  };

  const allAnswered = items.every((item) => {
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
      Alert.alert('Incompleto', 'Debes responder Sí, No o N/A en todos los ítems.');
      return;
    }
    if ((protocol as any)?.isLocked) {
      Alert.alert('Bloqueado', 'Este protocolo ya fue aprobado y no puede modificarse.');
      return;
    }

    setSaving(true);
    try {
      let updatedProtocol: any = null;

      await database.write(async () => {
        // Re-fetch fresh desde DB para evitar "deleted record" si hubo sync
        const freshItems = await protocolItemsCollection
          .query(Q.where('protocol_id', protocolId))
          .fetch();
        for (const item of freshItems) {
          const state = itemState[(item as any).id];
          if (!state) continue;
          await (item as any).update((i: any) => {
            i.isCompliant = state.isCompliant ?? false;
            i.isNa = state.isNa ?? false;
            i.hasAnswer = state.isCompliant !== null || state.isNa === true;
            i.comments = state.comments || null;
          });
        }

        // Marcar protocolo como SUBMITTED (re-fetch para evitar stale)
        const freshProtocol = await protocolsCollection.find(protocolId);
        updatedProtocol = await (freshProtocol as any).update((p: any) => {
          p.status = 'SUBMITTED';
          p.filledById = currentUser?.id ?? null;
          p.filledAt = Date.now();
          p.submittedAt = Date.now();
        });
      });

      // Push inmediato a Supabase para que el sync no revierta el estado
      if (updatedProtocol) {
        pushProtocolStatus(updatedProtocol).catch(() => {});
      }

      // Push completo del proyecto en background
      if (protocol?.projectId) {
        pushProjectToSupabase(protocol.projectId).catch(() => {});
        const locRef = (protocol as any).locationReference ?? (protocol as any).protocolNumber ?? '';
        const protNum = (protocol as any).protocolNumber ?? '';
        notifyProtocolSubmitted(protocol.projectId, '', locRef, protNum);
      }

      Alert.alert(
        'Enviado',
        'El protocolo fue enviado para revisión del Jefe.',
        [{ text: 'OK', onPress: () => navigation.goBack() }]
      );
    } catch (e) {
      Alert.alert('Error al enviar', `No se pudo enviar el protocolo.\n${String(e)}`);
    } finally {
      setSaving(false);
    }
  }, [allAnswered, protocol, items, itemState, currentUser, navigation]);

  if (!protocol) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={Colors.primary} />
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
      <AppHeader
        title={(protocol as any).protocolNumber}
        subtitle={`Fecha: ${new Date().toLocaleDateString('es-PE')}`}
        onBack={() => navigation.goBack()}
        rightContent={
          <TouchableOpacity onPress={() => jumpToStep('protocol_item_row')} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="help-circle-outline" size={22} color={Colors.white} />
          </TouchableOpacity>
        }
      />

      {/* Buscador de ubicaciones + botón plano */}
      <View style={styles.locationSection}>
        <View style={styles.locationRow}>
          <View style={styles.searchBox}>
            <Text style={styles.searchLabel}>UBICACION</Text>
            {location ? (
              <Text style={styles.locationFixed}>{location.name}</Text>
            ) : (
              <TextInput
                style={styles.searchInput}
                placeholder="Buscar..."
                placeholderTextColor={Colors.textMuted}
                value={locationSearch}
                onChangeText={setLocationSearch}
                editable={!isReadOnly}
              />
            )}
          </View>
          {locationPlans.length > 0 && location && (
            <TouchableOpacity
              ref={protocolPlanosBtnRef}
              style={styles.planBtn}
              onPress={() => {
                navigation.navigate('PlanViewer', {
                  planId: locationPlans[0].id,
                  planName: locationPlans[0].name,
                  protocolId: protocolId,
                  locationId: location.id,
                });
              }}
            >
              <Ionicons name="map-outline" size={14} color={Colors.white} />
              <Text style={styles.planBtnText}>Planos</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Dropdown de resultados */}
        {showDropdown && (
          <ScrollView
            style={styles.dropdown}
            keyboardShouldPersistTaps="handled"
            nestedScrollEnabled
          >
            {locationResults.map((loc) => (
              <TouchableOpacity
                key={loc.id}
                style={styles.dropdownItem}
                onPress={() => handleSelectLocation(loc)}
              >
                <Text style={styles.dropdownItemText}>{loc.name}</Text>
                {loc.referencePlan ? (
                  <Text style={styles.dropdownItemSub}>{loc.referencePlan}</Text>
                ) : null}
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}

        {locationPlans.length === 0 && location && (
          <Text style={styles.noPlanHint}>Sin plano asociado a esta ubicacion.</Text>
        )}
      </View>

      {/* Banner de rechazo — visible cuando el supervisor abre un protocolo rechazado */}
      {(protocol as any).status === 'REJECTED' && (protocol as any).rejectionReason && (
        <View style={styles.rejectionBanner}>
          <Text style={styles.rejectionTitle}>Protocolo rechazado</Text>
          <Text style={styles.rejectionReason}>{(protocol as any).rejectionReason}</Text>
        </View>
      )}

      {/* Lista de items */}
      <FlatList
        ref={mainListRef}
        data={listData}
        keyExtractor={(row) => row.type === 'section' ? `sec-${row.title}` : (row.item as any).id}
        contentContainerStyle={styles.list}
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
                    <Text style={[styles.siNoText, state.isCompliant === true && !state.isNa && styles.siNoTextYes]}>Sí</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.siNoBtn, state.isCompliant === false && !state.isNa && styles.siNoBtnNo]}
                    onPress={() => setAnswer((item as any).id, false)}
                  >
                    <Text style={[styles.siNoText, state.isCompliant === false && !state.isNa && styles.siNoTextNo]}>No</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.siNoBtn, state.isNa && styles.siNoBtnNa]}
                    onPress={() => setAnswer((item as any).id, 'na')}
                  >
                    <Text style={[styles.siNoText, state.isNa && styles.siNoTextNa]}>N/A</Text>
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
                      {(i as any).isNa ? 'N/A' : i.isCompliant === true ? 'Sí' : i.isCompliant === false ? 'No' : '—'}
                    </Text>
                  </View>
                </View>
              )}

              {/* Observacion */}
              {(!isReadOnly || state.comments) && (
                <TextInput
                  style={styles.commentInput}
                  placeholder="Observacion (opcional)"
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
                        Alert.alert('Eliminar foto', '¿Eliminar esta foto?', [
                          { text: 'Cancelar', style: 'cancel' },
                          {
                            text: 'Eliminar', style: 'destructive',
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
            {!isReadOnly ? (
              <TouchableOpacity
                ref={protocolSubmitBtnRef}
                style={[styles.submitBtn, !allAnswered && styles.submitBtnDisabled, saving && styles.submitBtnDisabled]}
                onPress={handleSubmit}
                disabled={!allAnswered || saving}
              >
                {saving
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={styles.submitBtnText}>Enviar para aprobacion</Text>
                }
              </TouchableOpacity>
            ) : (
              <View style={styles.readOnlyBanner}>
                <Text style={styles.readOnlyText}>
                  {(protocol as any).status === 'APPROVED'
                    ? 'Protocolo aprobado y bloqueado'
                    : 'En revision por el Jefe'}
                </Text>
              </View>
            )}
            {/* Fotos adicionales — solo jefe, siempre visible */}
            {isJefe && (
              <View style={styles.extraPhotoSection}>
                <TouchableOpacity
                  style={[styles.extraPhotoBtn, addingExtraPhoto && styles.submitBtnDisabled]}
                  onPress={handleAddExtraPhoto}
                  disabled={addingExtraPhoto}
                >
                  {addingExtraPhoto
                    ? <ActivityIndicator color={Colors.primary} size="small" />
                    : <>
                        <Ionicons name="camera-outline" size={16} color={Colors.primary} />
                        <Text style={styles.extraPhotoBtnText}>Adjuntar evidencia fotográfica extra</Text>
                      </>
                  }
                </TouchableOpacity>
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
                          Alert.alert('Eliminar foto', '¿Eliminar esta foto extra?', [
                            { text: 'Cancelar', style: 'cancel' },
                            { text: 'Eliminar', style: 'destructive', onPress: async () => {
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
});
