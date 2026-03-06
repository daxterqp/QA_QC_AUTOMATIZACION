import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, TextInput,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@navigation/types';
import { protocolsCollection, locationsCollection } from '@db/index';
import { Q } from '@nozbe/watermelondb';
import { useAuth } from '@context/AuthContext';
import type Protocol from '@models/Protocol';
import type Location from '@models/Location';
import type { ProtocolStatus } from '@models/Protocol';

type Props = NativeStackScreenProps<RootStackParamList, 'ProtocolList'>;

const STATUS_COLORS: Record<ProtocolStatus, string> = {
  DRAFT: '#e37400',
  SUBMITTED: '#1a73e8',
  APPROVED: '#1e8e3e',
  REJECTED: '#d93025',
};

const STATUS_LABELS: Record<ProtocolStatus, string> = {
  DRAFT: 'Pendiente',
  SUBMITTED: 'Enviado',
  APPROVED: 'Aprobado',
  REJECTED: 'Rechazado',
};

export default function ProtocolListScreen({ navigation, route }: Props) {
  const { projectId, projectName } = route.params;
  const { currentUser } = useAuth();
  const [protocols, setProtocols] = useState<Protocol[]>([]);
  const [locations, setLocations] = useState<Map<string, Location>>(new Map());
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<ProtocolStatus | 'ALL'>('ALL');

  const isJefe = currentUser?.role === 'RESIDENT';
  const isSupervisor = currentUser?.role === 'SUPERVISOR';

  useEffect(() => {
    const sub = protocolsCollection
      .query(Q.where('project_id', projectId))
      .observe()
      .subscribe(setProtocols);
    return () => sub.unsubscribe();
  }, [projectId]);

  useEffect(() => {
    locationsCollection
      .query(Q.where('project_id', projectId))
      .fetch()
      .then((locs) => {
        const map = new Map(locs.map((l) => [l.id, l]));
        setLocations(map);
      });
  }, [projectId]);

  const filtered = protocols.filter((p) => {
    const matchStatus = filterStatus === 'ALL' || p.status === filterStatus;
    const loc = p.locationId ? locations.get(p.locationId) : null;
    const matchSearch =
      !search ||
      p.protocolNumber.toLowerCase().includes(search.toLowerCase()) ||
      (loc?.name ?? '').toLowerCase().includes(search.toLowerCase());
    return matchStatus && matchSearch;
  });

  const handlePress = (protocol: Protocol) => {
    if (isJefe) {
      navigation.navigate('ProtocolAudit', { protocolId: protocol.id });
    } else if (isSupervisor) {
      navigation.navigate('ProtocolFill', { protocolId: protocol.id });
    } else {
      // OPERATOR: solo vista (usa ProtocolAudit en modo lectura)
      navigation.navigate('ProtocolAudit', { protocolId: protocol.id });
    }
  };

  const FILTER_OPTIONS: (ProtocolStatus | 'ALL')[] = ['ALL', 'DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED'];

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>‹</Text>
        </TouchableOpacity>
        <View style={styles.headerTitle}>
          <Text style={styles.title} numberOfLines={1}>{projectName}</Text>
          <Text style={styles.subtitle}>{filtered.length} protocolo{filtered.length !== 1 ? 's' : ''}</Text>
        </View>
      </View>

      {/* Buscador */}
      <View style={styles.searchBar}>
        <TextInput
          style={styles.searchInput}
          placeholder="Buscar por protocolo o ubicacion..."
          value={search}
          onChangeText={setSearch}
          clearButtonMode="while-editing"
        />
      </View>

      {/* Filtro por estado */}
      <View style={styles.filterRow}>
        {FILTER_OPTIONS.map((status) => (
          <TouchableOpacity
            key={status}
            style={[
              styles.filterChip,
              filterStatus === status && styles.filterChipActive,
            ]}
            onPress={() => setFilterStatus(status)}
          >
            <Text style={[
              styles.filterChipText,
              filterStatus === status && styles.filterChipTextActive,
            ]}>
              {status === 'ALL' ? 'Todos' : STATUS_LABELS[status]}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(p) => p.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <Text style={styles.empty}>No hay protocolos con ese filtro.</Text>
        }
        renderItem={({ item }) => {
          const loc = item.locationId ? locations.get(item.locationId) : null;
          const canFill =
            isSupervisor &&
            (item.status === 'DRAFT' ||
              (item.status === 'REJECTED' && item.correctionsAllowed));

          return (
            <TouchableOpacity style={styles.card} onPress={() => handlePress(item)}>
              <View style={styles.cardTop}>
                <Text style={styles.cardNumber}>{item.protocolNumber}</Text>
                <View style={[styles.badge, { backgroundColor: STATUS_COLORS[item.status] }]}>
                  <Text style={styles.badgeText}>{STATUS_LABELS[item.status]}</Text>
                </View>
              </View>
              {loc && (
                <Text style={styles.cardLoc}>{loc.name} · {loc.referencePlan}</Text>
              )}
              <Text style={styles.cardDate}>
                {new Date(item.createdAt).toLocaleDateString('es-PE')}
              </Text>
              {canFill && (
                <Text style={styles.fillHint}>Toca para rellenar ›</Text>
              )}
            </TouchableOpacity>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8f9fa' },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingTop: 56, paddingBottom: 12,
    backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e0e0e0',
  },
  backBtn: { padding: 4 },
  backText: { fontSize: 28, color: '#1a73e8', lineHeight: 32 },
  headerTitle: { flex: 1 },
  title: { fontSize: 17, fontWeight: '700', color: '#1a1a2e' },
  subtitle: { fontSize: 12, color: '#777' },
  searchBar: { paddingHorizontal: 16, paddingVertical: 10, backgroundColor: '#fff' },
  searchInput: {
    backgroundColor: '#f1f3f4', borderRadius: 10, paddingHorizontal: 14,
    paddingVertical: 10, fontSize: 15,
  },
  filterRow: {
    flexDirection: 'row', paddingHorizontal: 16, paddingBottom: 10,
    gap: 8, flexWrap: 'wrap', backgroundColor: '#fff',
  },
  filterChip: {
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20,
    backgroundColor: '#f1f3f4', borderWidth: 1, borderColor: '#e0e0e0',
  },
  filterChipActive: { backgroundColor: '#1a73e8', borderColor: '#1a73e8' },
  filterChipText: { fontSize: 12, color: '#555', fontWeight: '600' },
  filterChipTextActive: { color: '#fff' },
  list: { padding: 16, gap: 10, paddingBottom: 40 },
  empty: { color: '#aaa', textAlign: 'center', marginTop: 40 },
  card: {
    backgroundColor: '#fff', borderRadius: 12, padding: 16,
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4, elevation: 2,
    gap: 4,
  },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardNumber: { fontSize: 15, fontWeight: '700', color: '#1a1a2e', flex: 1 },
  badge: { borderRadius: 12, paddingHorizontal: 10, paddingVertical: 3 },
  badgeText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  cardLoc: { fontSize: 13, color: '#555' },
  cardDate: { fontSize: 11, color: '#aaa' },
  fillHint: { fontSize: 12, color: '#1a73e8', fontWeight: '600', marginTop: 4 },
});
