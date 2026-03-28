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
import { uploadExtraPhoto } from '@services/S3PhotoService';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@navigation/types';
import {
  database, protocolsCollection, protocolItemsCollection, locationsCollection,
  evidencesCollection, plansCollection,
} from '@db/index';
import { Q } from '@nozbe/watermelondb';
import { useAuth } from '@context/AuthContext';
import { useTour } from '@context/TourContext';
import { useTourStep, useTourStepWithLayout } from '@hooks/useTourStep';
import type Protocol from '@models/Protocol';
import type Location from '@models/Location';
import type Evidence from '@models/Evidence';
import type Plan from '@models/Plan';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Radius, Shadow } from '../theme/colors';
import { notifyProtocolApproved } from '@services/NotificationService';
import AppHeader from '@components/AppHeader';

type Props = NativeStackScreenProps<RootStackParamList, 'ProtocolAudit'>;

export default function ProtocolAuditScreen({ navigation, route }: Props) {
  const { protocolId } = route.params;
  const { currentUser } = useAuth();

  // Tour refs
  const auditItemsListRef = useTourStep('audit_items_list');
  const auditActionBtnsRef = useTourStep('audit_action_buttons');
  const { ref: headerRef, onLayout: headerLayout } = useTourStepWithLayout('dossier_protocol_header');
  const { ref: backBtnRef, onLayout: backBtnLayout } = useTourStepWithLayout('dossier_protocol_back_btn');
  const { isActive: tourActive, currentStep: tourStep, nextStep: tourNextStep } = useTour();

  const [protocol, setProtocol] = useState<Protocol | null>(null);
  const [items, setItems] = useState<any[]>([]);
  const [location, setLocation] = useState<Location | null>(null);
  const [saving, setSaving] = useState(false);
  // evidencias agrupadas por protocolItemId
  const [evidenceMap, setEvidenceMap] = useState<Record<string, Evidence[]>>({});
  // Planos vinculados a la ubicación del protocolo
  const [locationPlans, setLocationPlans] = useState<Plan[]>([]);
  // Modal de rechazo
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectReason, setRejectReason] = useState('');

  const isJefe = currentUser?.role === 'RESIDENT' || currentUser?.role === 'CREATOR';
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
      const result = await DocumentPicker.getDocumentAsync({
        type: ['image/jpeg', 'image/png', 'image/*'],
        copyToCacheDirectory: true,
      });
      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0];

      // Estampar fecha/hora/logo
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
      setAddingPhoto(false);
    }
  };

  useEffect(() => {
    protocolsCollection.find(protocolId).then(setProtocol).catch(() => {});
    protocolItemsCollection
      .query(Q.where('protocol_id', protocolId))
      .fetch()
      .then(async (fetchedItems) => {
        setItems(fetchedItems);
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

  const approve = useCallback(async () => {
    Alert.alert('Aprobar y Firmar', '¿Confirmas la aprobacion? El protocolo quedara bloqueado.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Aprobar y Firmar',
        onPress: async () => {
          setSaving(true);
          await database.write(async () => {
            await protocol!.update((p) => {
              p.status = 'APPROVED';
              p.isLocked = true;
              p.correctionsAllowed = false;
              p.signedById = currentUser?.id ?? null;
              (p as any).signedAt = Date.now();
            });
          });
          const locRef = (protocol as any).locationReference ?? '';
          const protNum = (protocol as any).protocolNumber ?? '';
          notifyProtocolApproved((protocol as any).projectId ?? '', '', locRef, protNum);
          setSaving(false);
          Alert.alert('Aprobado', 'El protocolo fue aprobado y firmado.', [
            { text: 'OK', onPress: () => navigation.goBack() },
          ]);
        },
      },
    ]);
  }, [protocol, currentUser, navigation]);

  const confirmReject = useCallback(async () => {
    if (!rejectReason.trim()) {
      Alert.alert('Motivo requerido', 'Debes indicar el motivo del rechazo.');
      return;
    }
    setSaving(true);
    setShowRejectModal(false);
    await database.write(async () => {
      await protocol!.update((p) => {
        p.status = 'REJECTED';
        p.correctionsAllowed = true;
        p.rejectionReason = rejectReason.trim();
      });
    });
    setSaving(false);
    setRejectReason('');
    navigation.goBack();
  }, [protocol, rejectReason, navigation]);

  if (!protocol) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  const p = protocol as any;
  const compliant = items.filter((i) => i.isCompliant).length;
  const nonCompliant = items.filter((i) => !i.isCompliant && (i as any).isNa !== true && i.hasAnswer).length;
  // Puede aprobar solo si todos los ítems respondidos son Sí o N/A (ningún No)
  const canApprove = items.length > 0 && items.every((i) => i.hasAnswer && (i.isCompliant || (i as any).isNa === true));
  const canEdit = isJefe && (p.status === 'DRAFT' || p.status === 'IN_PROGRESS' || (p.status === 'REJECTED' && p.correctionsAllowed));

  return (
    <View style={styles.container}>
      <View ref={headerRef} onLayout={headerLayout}>
      <AppHeader
        title={p.protocolNumber}
        subtitle={location ? location.name : 'Sin ubicacion'}
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
        rightContent={
          <View style={styles.headerRight}>
            {canEdit && (
              <TouchableOpacity
                style={styles.editBtn}
                onPress={() => navigation.replace('ProtocolFill', { protocolId })}
              >
                <Text style={styles.editBtnText}>Editar</Text>
              </TouchableOpacity>
            )}
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
                <Ionicons name="map-outline" size={14} color={Colors.white} />
                <Text style={styles.planBtnText}>Planos</Text>
              </TouchableOpacity>
            )}
            <View style={[styles.statusBadge, { backgroundColor: statusColor(p.status) }]}>
              <Text style={styles.statusText}>{statusLabel(p.status)}</Text>
            </View>
          </View>
        }
      />
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        {/* Resumen */}
        <View style={styles.summaryRow}>
          <View style={[styles.summaryCard, { borderColor: Colors.success }]}>
            <Text style={[styles.summaryNum, { color: Colors.success }]}>{compliant}</Text>
            <Text style={styles.summaryLabel}>Cumple</Text>
          </View>
          <View style={[styles.summaryCard, { borderColor: Colors.danger }]}>
            <Text style={[styles.summaryNum, { color: Colors.danger }]}>{nonCompliant}</Text>
            <Text style={styles.summaryLabel}>No Cumple</Text>
          </View>
          {(items.length - compliant - nonCompliant) > 0 && (
            <View style={[styles.summaryCard, { borderColor: Colors.textMuted }]}>
              <Text style={[styles.summaryNum, { color: Colors.textMuted }]}>{items.length - compliant - nonCompliant}</Text>
              <Text style={styles.summaryLabel}>Sin responder</Text>
            </View>
          )}
        </View>

        {/* Metadata */}
        {p.filledAt && (
          <View style={styles.metaBox}>
            <Text style={styles.metaText}>
              Enviado: {new Date(p.filledAt).toLocaleString('es-PE')}
            </Text>
            {p.signedAt && (
              <Text style={styles.metaText}>
                Firmado: {new Date(p.signedAt).toLocaleString('es-PE')}
              </Text>
            )}
          </View>
        )}

        {/* Items */}
        {items.map((item, index) => (
          <View key={item.id} ref={index === 0 ? auditItemsListRef : undefined} style={styles.itemCard}>
            <View style={styles.itemHeader}>
              <Text style={styles.itemNum}>{index + 1}</Text>
              <Text style={styles.itemDesc} numberOfLines={2}>{item.itemDescription}</Text>
              <View style={[
                styles.resultBadge,
                (item as any).isNa && styles.resultBadgeNa,
                item.isCompliant === true && !(item as any).isNa && styles.resultBadgeYes,
                item.isCompliant === false && !(item as any).isNa && styles.resultBadgeNo,
              ]}>
                <Text style={styles.resultText}>
                  {(item as any).isNa ? 'N/A' : item.isCompliant === true ? 'Sí' : item.isCompliant === false ? 'No' : '—'}
                </Text>
              </View>
            </View>
            {item.comments ? (
              <Text style={styles.comment}>Obs: {item.comments}</Text>
            ) : null}
            {/* Fotos del item */}
            {(evidenceMap[item.id] ?? []).length > 0 && (
              <View style={styles.photosRow}>
                {(evidenceMap[item.id] ?? []).map((ev) => (
                  <TouchableOpacity
                    key={ev.id}
                    onPress={() => {
                      const uris = (evidenceMap[item.id] ?? []).map(e => e.localUri);
                      const idx = uris.indexOf(ev.localUri);
                      setFullscreenPhotos(uris);
                      setFullscreenInitIdx(Math.max(0, idx));
                      setCurrentFullIdx(Math.max(0, idx));
                    }}
                    onLongPress={() => {
                      if (!isJefe) return;
                      Alert.alert('Eliminar foto', '¿Eliminar esta foto del protocolo?', [
                        { text: 'Cancelar', style: 'cancel' },
                        {
                          text: 'Eliminar', style: 'destructive',
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
        ))}

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
                    <Text style={styles.extraPhotoBtnText}>Adjuntar evidencia fotográfica extra</Text>
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

        {/* Acciones del Jefe — Aprobar (solo si canApprove) y Rechazar */}
        {isJefe && p.status === 'SUBMITTED' && (
          <View ref={auditActionBtnsRef} style={styles.actions}>
            {canApprove && (
              <TouchableOpacity
                style={[styles.actionBtn, styles.actionBtnApprove]}
                onPress={approve}
                disabled={saving}
              >
                {saving
                  ? <ActivityIndicator color={Colors.success} />
                  : <Text style={styles.actionBtnTextApprove}>Aprobar y Firmar</Text>
                }
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={[styles.actionBtn, styles.actionBtnReject]}
              onPress={() => setShowRejectModal(true)}
              disabled={saving}
            >
              <Text style={styles.actionBtnTextReject}>Rechazar</Text>
            </TouchableOpacity>
          </View>
        )}

        {p.status === 'APPROVED' && (
          <View style={styles.signedBanner}>
            <Text style={styles.signedText}>Firmado digitalmente</Text>
            {p.signedAt && (
              <Text style={styles.signedDate}>
                {new Date(p.signedAt).toLocaleString('es-PE')}
              </Text>
            )}
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
            <Text style={styles.modalTitle}>Motivo del rechazo</Text>
            <Text style={styles.modalSubtitle}>
              El supervisor vera este mensaje al abrir el protocolo rechazado.
            </Text>
            <TextInput
              style={styles.reasonInput}
              placeholder="Describe el motivo del rechazo..."
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
                <Text style={styles.cancelBtnText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.rejectConfirmBtn, !rejectReason.trim() && styles.btnDisabled]}
                onPress={confirmReject}
                disabled={!rejectReason.trim()}
              >
                <Text style={styles.rejectConfirmBtnText}>Confirmar rechazo</Text>
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
    DRAFT: 'Pendiente', SUBMITTED: 'En revision', APPROVED: 'Aprobado', REJECTED: 'Rechazado',
  };
  return map[status] ?? status;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.surface },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  headerRight: { alignItems: 'flex-end', gap: 4 },
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
  body: { padding: 16, gap: 12, paddingBottom: 60 },
  summaryRow: { flexDirection: 'row', gap: 10 },
  summaryCard: {
    flex: 1, borderWidth: 2, borderRadius: Radius.lg, padding: 14,
    alignItems: 'center', backgroundColor: Colors.white,
  },
  summaryNum: { fontSize: 26, fontWeight: '800' },
  summaryLabel: { fontSize: 11, color: Colors.textMuted, marginTop: 2 },
  metaBox: {
    backgroundColor: Colors.white, borderRadius: Radius.md, padding: 12, gap: 4, ...Shadow.subtle,
  },
  metaText: { fontSize: 12, color: Colors.textSecondary },
  itemCard: {
    backgroundColor: Colors.white, borderRadius: Radius.md, padding: 16,
    gap: 8, ...Shadow.subtle,
  },
  itemHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  itemNum: {
    width: 22, height: 22, borderRadius: 11, backgroundColor: Colors.light,
    color: Colors.primary, textAlign: 'center', lineHeight: 22, fontSize: 11, fontWeight: '700',
  },
  itemDesc: { flex: 1, fontSize: 12, color: Colors.textPrimary },
  resultBadge: {
    borderRadius: Radius.sm, paddingHorizontal: 10, paddingVertical: 3, backgroundColor: Colors.surface,
  },
  resultBadgeYes: { backgroundColor: '#e8f5ee' },
  resultBadgeNo: { backgroundColor: '#fdecea' },
  resultBadgeNa: { backgroundColor: '#fff3e0' },
  resultText: { fontSize: 11, fontWeight: '700', color: Colors.textSecondary },
  comment: { fontSize: 12, color: Colors.textMuted, paddingLeft: 30 },
  photosRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingLeft: 30, paddingTop: 4 },
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
  actionBtnReject: { backgroundColor: '#fdf0ef', borderColor: Colors.danger },
  actionBtnTextApprove: { color: Colors.success, fontWeight: '700', fontSize: 13, letterSpacing: 0.3 },
  actionBtnTextReject: { color: Colors.danger, fontWeight: '700', fontSize: 13, letterSpacing: 0.3 },
  signedBanner: {
    backgroundColor: '#e8f5ee', borderRadius: Radius.lg, padding: 16,
    alignItems: 'center', gap: 4,
  },
  signedText: { color: Colors.success, fontWeight: '700', fontSize: 13 },
  signedDate: { color: Colors.textSecondary, fontSize: 12 },

  // Extra photos
  extraPhotoSection: { gap: 10, marginTop: 4 },
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
