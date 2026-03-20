import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  TextInput, Alert, ActivityIndicator, ScrollView, Image, Modal, Dimensions,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@navigation/types';
import {
  database, protocolsCollection, protocolItemsCollection,
  locationsCollection, plansCollection, evidencesCollection,
} from '@db/index';
import { Q } from '@nozbe/watermelondb';
import { useAuth } from '@context/AuthContext';
import type Protocol from '@models/Protocol';
import type ProtocolItem from '@models/Protocol';
import type Location from '@models/Location';
import type Plan from '@models/Plan';
import type Evidence from '@models/Evidence';
import { Colors, Radius, Shadow } from '../theme/colors';
import { pushProjectToSupabase } from '@services/SupabaseSyncService';
import { supabase } from '@config/supabase';
import { notifyProtocolSubmitted } from '@services/NotificationService';

type Props = NativeStackScreenProps<RootStackParamList, 'ProtocolFill'>;

export default function ProtocolFillScreen({ navigation, route }: Props) {
  const { protocolId } = route.params;
  const { currentUser } = useAuth();
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
  // Foto en pantalla completa
  const [fullscreenPhoto, setFullscreenPhoto] = useState<string | null>(null);

  // Estado local de edicion (se guarda en BD automáticamente)
  const [itemState, setItemState] = useState<
    Record<string, { isCompliant: boolean | null; comments: string }>
  >({});

  // Debounce refs para auto-save de comentarios
  const commentTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

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
      const initial: Record<string, { isCompliant: boolean | null; comments: string }> = {};
      for (const item of fetched) {
        const i = item as any;
        initial[item.id] = {
          isCompliant: i.hasAnswer ? i.isCompliant : null,
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

  const setCompliant = async (itemId: string, value: boolean) => {
    const prev = itemState[itemId]?.isCompliant;
    // Tap en el mismo botón → desmarcar
    const next: boolean | null = prev === value ? null : value;
    setItemState((s) => ({ ...s, [itemId]: { ...s[itemId], isCompliant: next } }));
    await database.write(async () => {
      const item = items.find((i) => (i as any).id === itemId);
      if (item) {
        await (item as any).update((i: any) => {
          i.isCompliant = next ?? false;
          i.hasAnswer = next !== null;
        });
      }
    });
  };

  const setComment = (itemId: string, text: string) => {
    setItemState((s) => ({ ...s, [itemId]: { ...s[itemId], comments: text } }));
    // Debounce 600ms para no escribir en cada tecla
    if (commentTimers.current[itemId]) clearTimeout(commentTimers.current[itemId]);
    commentTimers.current[itemId] = setTimeout(async () => {
      await database.write(async () => {
        const item = items.find((i) => (i as any).id === itemId);
        if (item) await (item as any).update((i: any) => { i.comments = text.trim() || null; });
      });
    }, 600);
  };

  const allAnswered = items.every((item) => itemState[(item as any).id]?.isCompliant !== null);

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

  const handleSubmit = useCallback(async () => {
    if (!allAnswered) {
      Alert.alert('Incompleto', 'Debes responder Si o No en todos los items.');
      return;
    }
    if ((protocol as any)?.isLocked) {
      Alert.alert('Bloqueado', 'Este protocolo ya fue aprobado y no puede modificarse.');
      return;
    }

    setSaving(true);
    try {
      await database.write(async () => {
        // Guardar cada item
        for (const item of items) {
          const state = itemState[item.id];
          if (!state) continue;
          await (item as any).update((i: any) => {
            i.isCompliant = state.isCompliant ?? false;
            i.comments = state.comments || null;
          });
        }

        // Marcar protocolo como SUBMITTED
        await (protocol as any)?.update((p: any) => {
          p.status = 'SUBMITTED';
          p.filledById = currentUser?.id ?? null;
          p.filledAt = Date.now();
          p.submittedAt = Date.now();
        });
      });

      // Push a Supabase solo al enviar formalmente el protocolo
      if (protocol?.projectId) {
        pushProjectToSupabase(protocol.projectId).catch(() => {});
        const locRef = (protocol as any).locationReference ?? (protocol as any).protocolNumber ?? '';
        const protNum = (protocol as any).protocolNumber ?? '';
        notifyProtocolSubmitted(protocol.projectId, '', locRef, protNum);
      }
      Alert.alert(
        'Enviado',
        'El protocolo fue enviado para revision del Jefe.',
        [{ text: 'OK', onPress: () => navigation.goBack() }]
      );
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
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>Volver</Text>
        </TouchableOpacity>
        <View style={styles.headerInfo}>
          <Text style={styles.protocolNum}>{(protocol as any).protocolNumber}</Text>
          <Text style={styles.dateText}>
            Fecha: {new Date().toLocaleString('es-PE')}
          </Text>
        </View>
      </View>

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
                placeholder="Buscar ubicacion..."
                placeholderTextColor={Colors.textMuted}
                value={locationSearch}
                onChangeText={setLocationSearch}
                editable={!isReadOnly}
              />
            )}
          </View>
          {locationPlans.length > 0 && location && (
            <TouchableOpacity
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
              <Text style={styles.planBtnText}>{'Ver\nPlanos'}</Text>
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
        data={listData}
        keyExtractor={(row) => row.type === 'section' ? `sec-${row.title}` : (row.item as any).id}
        contentContainerStyle={styles.list}
        renderItem={({ item: row }) => {
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
            <View style={styles.itemCard}>
              <View style={styles.itemHeader}>
                <Text style={styles.itemNum}>{index + 1}</Text>
                {i.partidaItem && (
                  <Text style={styles.partida}>{i.partidaItem}</Text>
                )}
                {i.validationMethod && (
                  <View style={styles.methodBadge}>
                    <Text style={styles.methodText}>{i.validationMethod}</Text>
                  </View>
                )}
              </View>

              <Text style={styles.itemDesc}>{i.itemDescription}</Text>

              {/* Si / No */}
              {!isReadOnly && (
                <View style={styles.siNoRow}>
                  <TouchableOpacity
                    style={[
                      styles.siNoBtn,
                      state.isCompliant === true && styles.siNoBtnYes,
                    ]}
                    onPress={() => setCompliant((item as any).id, true)}
                  >
                    <Text style={[
                      styles.siNoText,
                      state.isCompliant === true && styles.siNoTextActive,
                    ]}>Si</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.siNoBtn,
                      state.isCompliant === false && styles.siNoBtnNo,
                    ]}
                    onPress={() => setCompliant((item as any).id, false)}
                  >
                    <Text style={[
                      styles.siNoText,
                      state.isCompliant === false && styles.siNoTextActive,
                    ]}>No</Text>
                  </TouchableOpacity>

                  {/* Camara */}
                  <TouchableOpacity
                    style={styles.cameraBtn}
                    onPress={() =>
                      navigation.navigate('Camera', { protocolItemId: (item as any).id })
                    }
                  >
                    <Text style={styles.cameraBtnText}>CAM</Text>
                  </TouchableOpacity>
                </View>
              )}

              {/* Vista de solo lectura */}
              {isReadOnly && (
                <View style={styles.siNoRow}>
                  <View style={[
                    styles.siNoBtn,
                    i.isCompliant === true && styles.siNoBtnYes,
                    i.isCompliant === false && styles.siNoBtnNo,
                  ]}>
                    <Text style={styles.siNoTextActive}>
                      {i.isCompliant === true ? 'Si' : i.isCompliant === false ? 'No' : '—'}
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
                      onPress={() => setFullscreenPhoto(ev.localUri)}
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
          !isReadOnly ? (
            <TouchableOpacity
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
          )
        }
      />

      {/* Modal foto fullscreen */}
      <Modal visible={!!fullscreenPhoto} transparent animationType="fade" onRequestClose={() => setFullscreenPhoto(null)}>
        <TouchableOpacity style={styles.photoModalOverlay} activeOpacity={1} onPress={() => setFullscreenPhoto(null)}>
          {fullscreenPhoto && (
            <Image source={{ uri: fullscreenPhoto }} style={styles.photoFullscreen} resizeMode="contain" />
          )}
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.surface },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 12,
    paddingHorizontal: 16, paddingTop: 52, paddingBottom: 14,
    backgroundColor: Colors.navy,
  },
  backBtn: { paddingTop: 2, minWidth: 60 },
  backText: { fontSize: 14, color: Colors.light, fontWeight: '600' },
  headerInfo: { flex: 1 },
  protocolNum: { fontSize: 14, fontWeight: '700', color: Colors.white },
  locationText: { fontSize: 12, color: Colors.light, marginTop: 2 },
  dateText: { fontSize: 11, color: Colors.light, marginTop: 2 },
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
    backgroundColor: Colors.primary, borderRadius: Radius.md,
    paddingHorizontal: 12, paddingVertical: 9, alignItems: 'center', justifyContent: 'center',
  },
  planBtnText: { color: Colors.white, fontSize: 11, fontWeight: '700', textAlign: 'center', lineHeight: 15 },
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
  itemHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  itemNum: {
    width: 24, height: 24, borderRadius: 12, backgroundColor: Colors.primary,
    color: Colors.white, textAlign: 'center', lineHeight: 24, fontSize: 11, fontWeight: '700',
  },
  partida: { fontSize: 11, color: Colors.textMuted },
  methodBadge: {
    backgroundColor: Colors.light, borderRadius: Radius.sm, paddingHorizontal: 8, paddingVertical: 2,
    marginLeft: 'auto',
  },
  methodText: { fontSize: 11, color: Colors.primary, fontWeight: '600' },
  itemDesc: { fontSize: 13, color: Colors.textPrimary, lineHeight: 20 },
  siNoRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  siNoBtn: {
    flex: 1, paddingVertical: 10, borderRadius: Radius.md, borderWidth: 1.5,
    borderColor: Colors.border, alignItems: 'center',
  },
  siNoBtnYes: { backgroundColor: '#e8f5ee', borderColor: Colors.success },
  siNoBtnNo: { backgroundColor: '#fdecea', borderColor: Colors.danger },
  siNoText: { fontWeight: '700', color: Colors.textMuted, fontSize: 14 },
  siNoTextActive: { fontWeight: '700', color: Colors.textPrimary, fontSize: 14 },
  cameraBtn: {
    width: 44, height: 44, borderRadius: Radius.md, backgroundColor: Colors.light,
    alignItems: 'center', justifyContent: 'center',
  },
  cameraBtnText: { fontSize: 9, fontWeight: '800', color: Colors.primary, letterSpacing: 0.5 },
  commentInput: {
    backgroundColor: Colors.surface, borderRadius: Radius.md, padding: 10,
    fontSize: 13, color: Colors.textPrimary, borderWidth: 1, borderColor: Colors.border,
    minHeight: 36,
  },
  photosRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingTop: 4 },
  photoThumb: { width: 72, height: 72, borderRadius: Radius.sm, backgroundColor: Colors.surface },
  photoModalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', alignItems: 'center', justifyContent: 'center',
  },
  photoFullscreen: {
    width: Dimensions.get('window').width,
    height: Dimensions.get('window').height * 0.85,
  },
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
});
