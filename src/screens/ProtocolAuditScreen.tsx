import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Modal,
  Alert, ActivityIndicator, ScrollView, Image, TextInput,
  Dimensions,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@navigation/types';
import {
  database, protocolsCollection, protocolItemsCollection, locationsCollection,
  evidencesCollection, plansCollection,
} from '@db/index';
import { Q } from '@nozbe/watermelondb';
import { useAuth } from '@context/AuthContext';
import type Protocol from '@models/Protocol';
import type Location from '@models/Location';
import type Evidence from '@models/Evidence';
import type Plan from '@models/Plan';
import { Colors, Radius, Shadow } from '../theme/colors';
import { notifyProtocolApproved } from '@services/NotificationService';

type Props = NativeStackScreenProps<RootStackParamList, 'ProtocolAudit'>;

export default function ProtocolAuditScreen({ navigation, route }: Props) {
  const { protocolId } = route.params;
  const { currentUser } = useAuth();
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
  const [fullscreenPhoto, setFullscreenPhoto] = useState<string | null>(null);

  useEffect(() => {
    protocolsCollection.find(protocolId).then(setProtocol);
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
  const nonCompliant = items.filter((i) => i.isCompliant === false).length;
  const canEdit = isJefe && (p.status === 'DRAFT' || p.status === 'IN_PROGRESS' || (p.status === 'REJECTED' && p.correctionsAllowed));

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>Volver</Text>
        </TouchableOpacity>
        <View style={styles.headerInfo}>
          <Text style={styles.protocolNum}>{p.protocolNumber}</Text>
          <Text style={styles.locationText}>
            {location ? `${location.name}` : 'Sin ubicacion'}
          </Text>
        </View>
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
              <Text style={styles.planBtnText}>{'Ver\nPlanos'}</Text>
            </TouchableOpacity>
          )}
          <View style={[styles.statusBadge, { backgroundColor: statusColor(p.status) }]}>
            <Text style={styles.statusText}>{statusLabel(p.status)}</Text>
          </View>
        </View>
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
          <View style={[styles.summaryCard, { borderColor: Colors.textMuted }]}>
            <Text style={[styles.summaryNum, { color: Colors.textMuted }]}>{items.length - compliant - nonCompliant}</Text>
            <Text style={styles.summaryLabel}>Sin responder</Text>
          </View>
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
          <View key={item.id} style={styles.itemCard}>
            <View style={styles.itemHeader}>
              <Text style={styles.itemNum}>{index + 1}</Text>
              <Text style={styles.itemDesc} numberOfLines={2}>{item.itemDescription}</Text>
              <View style={[
                styles.resultBadge,
                item.isCompliant === true && styles.resultBadgeYes,
                item.isCompliant === false && styles.resultBadgeNo,
              ]}>
                <Text style={styles.resultText}>
                  {item.isCompliant === true ? 'Si' : item.isCompliant === false ? 'No' : '—'}
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
                    onPress={() => setFullscreenPhoto(ev.localUri)}
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

        {/* Acciones del Jefe — solo Rechazar y Aprobar y Firmar */}
        {isJefe && p.status === 'SUBMITTED' && (
          <View style={styles.actions}>
            <TouchableOpacity
              style={[styles.actionBtn, styles.actionBtnReject]}
              onPress={() => setShowRejectModal(true)}
              disabled={saving}
            >
              <Text style={styles.actionBtnText}>Rechazar</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionBtn, styles.actionBtnApprove]}
              onPress={approve}
              disabled={saving}
            >
              {saving
                ? <ActivityIndicator color={Colors.white} />
                : <Text style={styles.actionBtnText}>Aprobar y Firmar</Text>
              }
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

      {/* Modal foto fullscreen */}
      <Modal visible={!!fullscreenPhoto} transparent animationType="fade" onRequestClose={() => setFullscreenPhoto(null)}>
        <TouchableOpacity
          style={styles.photoModalOverlay}
          activeOpacity={1}
          onPress={() => setFullscreenPhoto(null)}
        >
          {fullscreenPhoto && (
            <Image
              source={{ uri: fullscreenPhoto }}
              style={styles.photoFullscreen}
              resizeMode="contain"
            />
          )}
        </TouchableOpacity>
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
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 16, paddingTop: 52, paddingBottom: 14,
    backgroundColor: Colors.navy,
  },
  backBtn: { padding: 4, minWidth: 60 },
  backText: { fontSize: 14, color: Colors.light, fontWeight: '600' },
  headerInfo: { flex: 1 },
  protocolNum: { fontSize: 14, fontWeight: '700', color: Colors.white },
  locationText: { fontSize: 11, color: Colors.light, marginTop: 2 },
  headerRight: { alignItems: 'flex-end', gap: 6 },
  planMenu: {
    position: 'absolute', top: '100%', right: 0, zIndex: 100,
    backgroundColor: Colors.white, borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.border, minWidth: 140, ...Shadow.card,
  },
  planMenuItem: { paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: Colors.border },
  planMenuItemText: { fontSize: 13, color: Colors.navy, fontWeight: '600' },
  editBtn: {
    backgroundColor: Colors.primary, borderRadius: Radius.md,
    paddingHorizontal: 12, paddingVertical: 6, alignItems: 'center',
  },
  editBtnText: { color: Colors.white, fontSize: 12, fontWeight: '700' },
  planBtn: {
    backgroundColor: Colors.secondary, borderRadius: Radius.md,
    paddingHorizontal: 10, paddingVertical: 6, alignItems: 'center',
  },
  planBtnText: { color: Colors.navy, fontSize: 10, fontWeight: '800', textAlign: 'center', lineHeight: 14 },
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
    backgroundColor: Colors.white, borderRadius: Radius.md, padding: 12,
    gap: 6, ...Shadow.subtle,
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
  resultText: { fontSize: 11, fontWeight: '700', color: Colors.textSecondary },
  comment: { fontSize: 12, color: Colors.textMuted, paddingLeft: 30 },
  photosRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingLeft: 30, paddingTop: 4 },
  photoThumb: { width: 72, height: 72, borderRadius: Radius.sm, backgroundColor: Colors.surface },
  photoModalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.92)',
    alignItems: 'center', justifyContent: 'center',
  },
  photoFullscreen: {
    width: Dimensions.get('window').width,
    height: Dimensions.get('window').height * 0.85,
  },
  actions: { gap: 10, marginTop: 8, flexDirection: 'row' },
  actionBtn: {
    flex: 1, padding: 14, borderRadius: Radius.lg, alignItems: 'center',
  },
  actionBtnApprove: { backgroundColor: Colors.success },
  actionBtnReject: { backgroundColor: Colors.danger },
  actionBtnText: { color: Colors.white, fontWeight: '700', fontSize: 13, letterSpacing: 0.5 },
  signedBanner: {
    backgroundColor: '#e8f5ee', borderRadius: Radius.lg, padding: 16,
    alignItems: 'center', gap: 4,
  },
  signedText: { color: Colors.success, fontWeight: '700', fontSize: 13 },
  signedDate: { color: Colors.textSecondary, fontSize: 12 },

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
  btnDisabled: { opacity: 0.4 },
  rejectConfirmBtnText: { color: Colors.white, fontWeight: '700', fontSize: 14 },
});
