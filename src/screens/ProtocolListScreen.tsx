import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, TextInput,
} from 'react-native';
import AppHeader from '@components/AppHeader';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@navigation/types';
import { protocolsCollection, locationsCollection } from '@db/index';
import { Q } from '@nozbe/watermelondb';
import { useAuth } from '@context/AuthContext';
import type Protocol from '@models/Protocol';
import type Location from '@models/Location';
import type { ProtocolStatus } from '@models/Protocol';
import { Colors, Radius, Shadow } from '../theme/colors';

type Props = NativeStackScreenProps<RootStackParamList, 'ProtocolList'>;

const STATUS_COLORS: Record<ProtocolStatus, string> = {
  DRAFT: Colors.warning,
  IN_PROGRESS: Colors.warning,
  SUBMITTED: Colors.primary,
  APPROVED: Colors.success,
  REJECTED: Colors.danger,
};

const STATUS_LABELS: Record<ProtocolStatus, string> = {
  DRAFT: 'Pendiente',
  IN_PROGRESS: 'En progreso',
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
  const isCreator = currentUser?.role === 'CREATOR';
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
    const canFillStatus = protocol.status === 'DRAFT' || protocol.status === 'IN_PROGRESS' ||
      (protocol.status === 'REJECTED' && (protocol as any).correctionsAllowed);
    if (isCreator || isSupervisor || isJefe) {
      // CREATOR, SUPERVISOR, RESIDENT: editan DRAFT/REJECTED, auditan SUBMITTED/APPROVED
      if (canFillStatus) {
        navigation.navigate('ProtocolFill', { protocolId: protocol.id });
      } else {
        navigation.navigate('ProtocolAudit', { protocolId: protocol.id });
      }
    } else {
      // OPERATOR: solo vista
      navigation.navigate('ProtocolAudit', { protocolId: protocol.id });
    }
  };

  const FILTER_OPTIONS: (ProtocolStatus | 'ALL')[] = ['ALL', 'DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED'];

  return (
    <View style={styles.container}>
      <AppHeader
        title={projectName}
        subtitle={`${filtered.length} protocolo${filtered.length !== 1 ? 's' : ''}`}
        onBack={() => navigation.goBack()}
      />

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
            (isSupervisor || isCreator || isJefe) &&
            (item.status === 'DRAFT' || item.status === 'IN_PROGRESS' ||
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
                {new Date(item.createdAt).toLocaleString('es-PE')}
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
  container: { flex: 1, backgroundColor: Colors.surface },
  searchBar: { paddingHorizontal: 16, paddingVertical: 10, backgroundColor: Colors.white, borderBottomWidth: 1, borderBottomColor: Colors.divider },
  searchInput: {
    backgroundColor: Colors.surface, borderRadius: Radius.md, paddingHorizontal: 14,
    paddingVertical: 10, fontSize: 14, borderWidth: 1, borderColor: Colors.border, color: Colors.textPrimary,
  },
  filterRow: {
    flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 10,
    gap: 8, flexWrap: 'wrap', backgroundColor: Colors.white,
    borderBottomWidth: 1, borderBottomColor: Colors.divider,
  },
  filterChip: {
    paddingHorizontal: 12, paddingVertical: 5, borderRadius: Radius.xl,
    backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border,
  },
  filterChipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  filterChipText: { fontSize: 11, color: Colors.textSecondary, fontWeight: '600' },
  filterChipTextActive: { color: Colors.white },
  list: { padding: 16, gap: 10, paddingBottom: 40 },
  empty: { color: Colors.textMuted, textAlign: 'center', marginTop: 40 },
  card: {
    backgroundColor: Colors.white, borderRadius: Radius.lg, padding: 16,
    ...Shadow.subtle, gap: 4,
  },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardNumber: { fontSize: 14, fontWeight: '700', color: Colors.navy, flex: 1 },
  badge: { borderRadius: Radius.sm, paddingHorizontal: 10, paddingVertical: 3 },
  badgeText: { color: Colors.white, fontSize: 10, fontWeight: '700' },
  cardLoc: { fontSize: 12, color: Colors.textSecondary },
  cardDate: { fontSize: 11, color: Colors.textMuted },
  fillHint: { fontSize: 11, color: Colors.primary, fontWeight: '700', marginTop: 4 },
});
