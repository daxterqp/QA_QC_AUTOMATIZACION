import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  TextInput, Alert, ActivityIndicator,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@navigation/types';
import {
  database, protocolsCollection, protocolItemsCollection,
  locationsCollection,
} from '@db/index';
import { Q } from '@nozbe/watermelondb';
import { useAuth } from '@context/AuthContext';
import type Protocol from '@models/Protocol';
import type ProtocolItem from '@models/Protocol';
import type Location from '@models/Location';

type Props = NativeStackScreenProps<RootStackParamList, 'ProtocolFill'>;

export default function ProtocolFillScreen({ navigation, route }: Props) {
  const { protocolId } = route.params;
  const { currentUser } = useAuth();
  const [protocol, setProtocol] = useState<Protocol | null>(null);
  const [items, setItems] = useState<ProtocolItem[]>([]);
  const [location, setLocation] = useState<Location | null>(null);
  const [saving, setSaving] = useState(false);

  // Estado local de edicion de items (no guarda en BD hasta "Enviar")
  const [itemState, setItemState] = useState<
    Record<string, { isCompliant: boolean | null; comments: string }>
  >({});

  useEffect(() => {
    protocolsCollection.find(protocolId).then(setProtocol);
    protocolItemsCollection
      .query(Q.where('protocol_id', protocolId))
      .fetch()
      .then((fetched) => {
        setItems(fetched as unknown as ProtocolItem[]);
        // Inicializar estado local con valores guardados
        const initial: Record<string, { isCompliant: boolean | null; comments: string }> = {};
        for (const item of fetched) {
          initial[item.id] = {
            isCompliant: (item as any).isCompliant ?? null,
            comments: (item as any).comments ?? '',
          };
        }
        setItemState(initial);
      });
  }, [protocolId]);

  useEffect(() => {
    if (protocol?.locationId) {
      locationsCollection.find(protocol.locationId).then(setLocation).catch(() => null);
    }
  }, [protocol]);

  const setCompliant = (itemId: string, value: boolean) => {
    setItemState((prev) => ({
      ...prev,
      [itemId]: { ...prev[itemId], isCompliant: value },
    }));
  };

  const setComment = (itemId: string, text: string) => {
    setItemState((prev) => ({
      ...prev,
      [itemId]: { ...prev[itemId], comments: text },
    }));
  };

  const allAnswered = items.every((item) => itemState[item.id]?.isCompliant !== null);

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
        });
      });

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
        <ActivityIndicator size="large" color="#1a73e8" />
      </View>
    );
  }

  const isReadOnly =
    (protocol as any).status === 'APPROVED' ||
    (protocol as any).isLocked ||
    ((protocol as any).status === 'SUBMITTED');

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>‹</Text>
        </TouchableOpacity>
        <View style={styles.headerInfo}>
          <Text style={styles.protocolNum}>{(protocol as any).protocolNumber}</Text>
          <Text style={styles.locationText}>
            {location ? `${location.name} · ${location.referencePlan}` : 'Sin ubicacion'}
          </Text>
          <Text style={styles.dateText}>
            Fecha: {new Date().toLocaleDateString('es-PE')}
          </Text>
        </View>
      </View>

      {/* Lista de items */}
      <FlatList
        data={items}
        keyExtractor={(item) => (item as any).id}
        contentContainerStyle={styles.list}
        renderItem={({ item, index }) => {
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
                    <Text style={styles.cameraBtnText}>📷</Text>
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
                      {i.isCompliant === true ? 'Si ✓' : i.isCompliant === false ? 'No ✗' : '—'}
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
                  ? '✓ Protocolo aprobado y bloqueado'
                  : '⏳ En revision por el Jefe'}
              </Text>
            </View>
          )
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8f9fa' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 12,
    paddingHorizontal: 16, paddingTop: 56, paddingBottom: 14,
    backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e0e0e0',
  },
  backBtn: { paddingTop: 2 },
  backText: { fontSize: 28, color: '#1a73e8', lineHeight: 32 },
  headerInfo: { flex: 1 },
  protocolNum: { fontSize: 17, fontWeight: '700', color: '#1a1a2e' },
  locationText: { fontSize: 13, color: '#555', marginTop: 2 },
  dateText: { fontSize: 12, color: '#aaa', marginTop: 2 },
  list: { padding: 16, gap: 10, paddingBottom: 40 },
  itemCard: {
    backgroundColor: '#fff', borderRadius: 12, padding: 14,
    gap: 8, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 4, elevation: 1,
  },
  itemHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  itemNum: {
    width: 24, height: 24, borderRadius: 12, backgroundColor: '#1a73e8',
    color: '#fff', textAlign: 'center', lineHeight: 24, fontSize: 12, fontWeight: '700',
  },
  partida: { fontSize: 11, color: '#777', fontFamily: 'monospace' },
  methodBadge: {
    backgroundColor: '#e8f0fe', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2,
    marginLeft: 'auto',
  },
  methodText: { fontSize: 11, color: '#1a73e8', fontWeight: '600' },
  itemDesc: { fontSize: 14, color: '#333', lineHeight: 20 },
  siNoRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  siNoBtn: {
    flex: 1, paddingVertical: 10, borderRadius: 8, borderWidth: 1.5,
    borderColor: '#e0e0e0', alignItems: 'center',
  },
  siNoBtnYes: { backgroundColor: '#e6f4ea', borderColor: '#1e8e3e' },
  siNoBtnNo: { backgroundColor: '#fce8e6', borderColor: '#d93025' },
  siNoText: { fontWeight: '700', color: '#aaa', fontSize: 15 },
  siNoTextActive: { fontWeight: '700', color: '#333', fontSize: 15 },
  cameraBtn: {
    width: 44, height: 44, borderRadius: 22, backgroundColor: '#f1f3f4',
    alignItems: 'center', justifyContent: 'center',
  },
  cameraBtnText: { fontSize: 20 },
  commentInput: {
    backgroundColor: '#f8f9fa', borderRadius: 8, padding: 10,
    fontSize: 13, color: '#333', borderWidth: 1, borderColor: '#e8e8e8',
    minHeight: 36,
  },
  submitBtn: {
    backgroundColor: '#1a73e8', borderRadius: 12, padding: 16,
    alignItems: 'center', margin: 16,
  },
  submitBtnDisabled: { backgroundColor: '#bdc1c6' },
  submitBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  readOnlyBanner: {
    margin: 16, padding: 14, backgroundColor: '#f1f3f4', borderRadius: 10,
    alignItems: 'center',
  },
  readOnlyText: { color: '#555', fontSize: 14, fontWeight: '600' },
});
