import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  Alert, ActivityIndicator, ScrollView,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@navigation/types';
import {
  database, protocolsCollection, protocolItemsCollection, locationsCollection,
} from '@db/index';
import { Q } from '@nozbe/watermelondb';
import { useAuth } from '@context/AuthContext';
import type Protocol from '@models/Protocol';
import type Location from '@models/Location';

type Props = NativeStackScreenProps<RootStackParamList, 'ProtocolAudit'>;

export default function ProtocolAuditScreen({ navigation, route }: Props) {
  const { protocolId } = route.params;
  const { currentUser } = useAuth();
  const [protocol, setProtocol] = useState<Protocol | null>(null);
  const [items, setItems] = useState<any[]>([]);
  const [location, setLocation] = useState<Location | null>(null);
  const [saving, setSaving] = useState(false);

  const isJefe = currentUser?.role === 'RESIDENT';

  useEffect(() => {
    protocolsCollection.find(protocolId).then(setProtocol);
    protocolItemsCollection
      .query(Q.where('protocol_id', protocolId))
      .fetch()
      .then(setItems);
  }, [protocolId]);

  useEffect(() => {
    if ((protocol as any)?.locationId) {
      locationsCollection.find((protocol as any).locationId).then(setLocation).catch(() => null);
    }
  }, [protocol]);

  const approve = useCallback(async () => {
    Alert.alert('Aprobar Protocolo', '¿Confirmas la aprobacion? El protocolo quedara bloqueado.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Aprobar y Firmar',
        onPress: async () => {
          setSaving(true);
          await database.write(async () => {
            await (protocol as any).update((p: any) => {
              p.status = 'APPROVED';
              p.isLocked = true;
              p.correctionsAllowed = false;
              p.signedById = currentUser?.id ?? null;
              p.signedAt = Date.now();
            });
          });
          setSaving(false);
          Alert.alert('Aprobado', 'El protocolo fue aprobado y firmado.', [
            { text: 'OK', onPress: () => navigation.goBack() },
          ]);
        },
      },
    ]);
  }, [protocol, currentUser, navigation]);

  const reject = useCallback(async () => {
    Alert.alert('Rechazar', '¿Rechazar el protocolo? El supervisor podra corregirlo si autorizas.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Rechazar',
        style: 'destructive',
        onPress: async () => {
          setSaving(true);
          await database.write(async () => {
            await (protocol as any).update((p: any) => {
              p.status = 'REJECTED';
              p.correctionsAllowed = true; // Autoriza correccion por defecto al rechazar
            });
          });
          setSaving(false);
          navigation.goBack();
        },
      },
    ]);
  }, [protocol, navigation]);

  const raiseNC = useCallback(() => {
    navigation.navigate('NonConformity', {
      protocolId,
      projectId: (protocol as any)?.projectId ?? '',
    });
  }, [protocol, protocolId, navigation]);

  if (!protocol) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#1a73e8" />
      </View>
    );
  }

  const p = protocol as any;
  const compliant = items.filter((i) => i.isCompliant).length;
  const nonCompliant = items.filter((i) => i.isCompliant === false).length;

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>‹</Text>
        </TouchableOpacity>
        <View style={styles.headerInfo}>
          <Text style={styles.protocolNum}>{p.protocolNumber}</Text>
          <Text style={styles.locationText}>
            {location ? `${location.name} · ${location.referencePlan}` : 'Sin ubicacion'}
          </Text>
        </View>
        <View style={[styles.statusBadge, { backgroundColor: statusColor(p.status) }]}>
          <Text style={styles.statusText}>{statusLabel(p.status)}</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        {/* Resumen */}
        <View style={styles.summaryRow}>
          <View style={[styles.summaryCard, { borderColor: '#1e8e3e' }]}>
            <Text style={[styles.summaryNum, { color: '#1e8e3e' }]}>{compliant}</Text>
            <Text style={styles.summaryLabel}>Cumple</Text>
          </View>
          <View style={[styles.summaryCard, { borderColor: '#d93025' }]}>
            <Text style={[styles.summaryNum, { color: '#d93025' }]}>{nonCompliant}</Text>
            <Text style={styles.summaryLabel}>No Cumple</Text>
          </View>
          <View style={[styles.summaryCard, { borderColor: '#aaa' }]}>
            <Text style={[styles.summaryNum, { color: '#aaa' }]}>{items.length - compliant - nonCompliant}</Text>
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
              <Text style={styles.comment}>💬 {item.comments}</Text>
            ) : null}
          </View>
        ))}

        {/* Acciones del Jefe */}
        {isJefe && p.status === 'SUBMITTED' && (
          <View style={styles.actions}>
            <TouchableOpacity
              style={[styles.actionBtn, styles.actionBtnNC]}
              onPress={raiseNC}
              disabled={saving}
            >
              <Text style={styles.actionBtnText}>Levantar No Conformidad</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionBtn, styles.actionBtnReject]}
              onPress={reject}
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
                ? <ActivityIndicator color="#fff" />
                : <Text style={styles.actionBtnText}>Aprobar y Firmar ✓</Text>
              }
            </TouchableOpacity>
          </View>
        )}

        {p.status === 'APPROVED' && (
          <View style={styles.signedBanner}>
            <Text style={styles.signedText}>
              ✓ Firmado digitalmente por {currentUser?.name}
            </Text>
            {p.signedAt && (
              <Text style={styles.signedDate}>
                {new Date(p.signedAt).toLocaleString('es-PE')}
              </Text>
            )}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

function statusColor(status: string) {
  const map: Record<string, string> = {
    DRAFT: '#e37400', SUBMITTED: '#1a73e8', APPROVED: '#1e8e3e', REJECTED: '#d93025',
  };
  return map[status] ?? '#aaa';
}
function statusLabel(status: string) {
  const map: Record<string, string> = {
    DRAFT: 'Pendiente', SUBMITTED: 'En revision', APPROVED: 'Aprobado', REJECTED: 'Rechazado',
  };
  return map[status] ?? status;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8f9fa' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 16, paddingTop: 56, paddingBottom: 14,
    backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e0e0e0',
  },
  backBtn: { padding: 4 },
  backText: { fontSize: 28, color: '#1a73e8', lineHeight: 32 },
  headerInfo: { flex: 1 },
  protocolNum: { fontSize: 16, fontWeight: '700', color: '#1a1a2e' },
  locationText: { fontSize: 12, color: '#777', marginTop: 2 },
  statusBadge: { borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4 },
  statusText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  body: { padding: 16, gap: 12, paddingBottom: 60 },
  summaryRow: { flexDirection: 'row', gap: 10 },
  summaryCard: {
    flex: 1, borderWidth: 2, borderRadius: 12, padding: 14,
    alignItems: 'center', backgroundColor: '#fff',
  },
  summaryNum: { fontSize: 28, fontWeight: '800' },
  summaryLabel: { fontSize: 12, color: '#777', marginTop: 2 },
  metaBox: {
    backgroundColor: '#fff', borderRadius: 10, padding: 12, gap: 4,
  },
  metaText: { fontSize: 12, color: '#777' },
  itemCard: {
    backgroundColor: '#fff', borderRadius: 10, padding: 12,
    gap: 6, shadowColor: '#000', shadowOpacity: 0.03, shadowRadius: 3, elevation: 1,
  },
  itemHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  itemNum: {
    width: 22, height: 22, borderRadius: 11, backgroundColor: '#e8f0fe',
    color: '#1a73e8', textAlign: 'center', lineHeight: 22, fontSize: 11, fontWeight: '700',
  },
  itemDesc: { flex: 1, fontSize: 13, color: '#333' },
  resultBadge: {
    borderRadius: 8, paddingHorizontal: 10, paddingVertical: 3, backgroundColor: '#f1f3f4',
  },
  resultBadgeYes: { backgroundColor: '#e6f4ea' },
  resultBadgeNo: { backgroundColor: '#fce8e6' },
  resultText: { fontSize: 12, fontWeight: '700', color: '#555' },
  comment: { fontSize: 12, color: '#777', paddingLeft: 30 },
  actions: { gap: 10, marginTop: 8 },
  actionBtn: {
    padding: 15, borderRadius: 12, alignItems: 'center',
  },
  actionBtnApprove: { backgroundColor: '#1e8e3e' },
  actionBtnReject: { backgroundColor: '#d93025' },
  actionBtnNC: { backgroundColor: '#e37400' },
  actionBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  signedBanner: {
    backgroundColor: '#e6f4ea', borderRadius: 12, padding: 16,
    alignItems: 'center', gap: 4,
  },
  signedText: { color: '#1e8e3e', fontWeight: '700', fontSize: 14 },
  signedDate: { color: '#555', fontSize: 12 },
});
