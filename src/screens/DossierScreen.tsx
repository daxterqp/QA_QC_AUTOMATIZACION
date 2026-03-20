import React, { useCallback, useEffect, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  View, Text, StyleSheet, SectionList, TouchableOpacity, Alert,
} from 'react-native';
import { Colors, Radius, Shadow } from '../theme/colors';
import { database, protocolsCollection, usersCollection } from '@db/index';
import { useAuth } from '@context/AuthContext';
import { Q } from '@nozbe/watermelondb';
import type Protocol from '@models/Protocol';

interface Props {
  projectId: string;
  projectName: string;
  onBack: () => void;
  onOpenProtocol: (protocolId: string) => void;
}

interface DaySection {
  title: string;   // fecha formateada
  data: Protocol[];
}

function formatDay(date: Date): string {
  return date.toLocaleDateString('es-CL', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
}

function toDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export default function DossierScreen({ projectId, projectName, onBack, onOpenProtocol }: Props) {
  const { currentUser } = useAuth();
  const [sections, setSections] = useState<DaySection[]>([]);
  const [userNames, setUserNames] = useState<Record<string, string>>({});

  const isJefe = currentUser?.role === 'RESIDENT' || currentUser?.role === 'CREATOR';

  const loadData = useCallback(async () => {
    const protocols = await protocolsCollection
      .query(
        Q.where('project_id', projectId),
        Q.where('status', Q.oneOf(['SUBMITTED', 'APPROVED', 'REJECTED']))
      )
      .fetch();

    const allUsers = await usersCollection.query().fetch();
    const names: Record<string, string> = {};
    allUsers.forEach((u) => { names[u.id] = u.fullName; });
    setUserNames(names);

    const grouped: Record<string, Protocol[]> = {};
    for (const p of protocols) {
      const ts = (p as any).submittedAt ?? p.updatedAt;
      const day = toDateKey(new Date(typeof ts === 'number' ? ts : ts?.getTime?.() ?? Date.now()));
      if (!grouped[day]) grouped[day] = [];
      grouped[day].push(p);
    }

    const days = Object.keys(grouped).sort((a, b) => b.localeCompare(a));
    const newSections: DaySection[] = days.map((day) => ({
      title: formatDay(new Date(day + 'T12:00:00')),
      data: grouped[day].sort((a, b) => {
        const ta = (a as any).submittedAt ?? a.updatedAt;
        const tb = (b as any).submittedAt ?? b.updatedAt;
        return (typeof tb === 'number' ? tb : tb?.getTime?.() ?? 0) -
               (typeof ta === 'number' ? ta : ta?.getTime?.() ?? 0);
      }),
    }));
    setSections(newSections);
  }, [projectId]);

  useEffect(() => { loadData(); }, [loadData]);

  // Recargar al volver de ProtocolAudit u otras pantallas
  useFocusEffect(useCallback(() => { loadData(); }, [loadData]));

  const handleApprove = (protocol: Protocol) => {
    Alert.alert('Aprobar protocolo', `¿Aprobar "${protocol.protocolNumber}"?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Aprobar',
        onPress: async () => {
          await database.write(async () => {
            await protocol.update((p) => {
              p.status = 'APPROVED';
              p.isLocked = true;
              p.signedById = currentUser?.id ?? null;
              (p as any).signedAt = Date.now();
            });
          });
          await loadData();
        },
      },
    ]);
  };

  const handleReject = (protocol: Protocol) => {
    Alert.alert(
      'Rechazar protocolo',
      `¿Rechazar "${protocol.protocolNumber}"? El supervisor deberá rehacerlo.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Rechazar', style: 'destructive',
          onPress: async () => {
            await database.write(async () => {
              await protocol.update((p) => {
                p.status = 'REJECTED';
                p.correctionsAllowed = true;
              });
            });
            await loadData();
          },
        },
      ]
    );
  };

  const statusColor: Record<string, string> = {
    SUBMITTED: '#e37400',
    APPROVED: '#1e8e3e',
    REJECTED: '#d93025',
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn}>
          <Text style={styles.backText}>Volver</Text>
        </TouchableOpacity>
        <View>
          <Text style={styles.title}>DOSIER DE PROTOCOLOS</Text>
          <Text style={styles.subtitle}>{projectName}</Text>
        </View>
        <View style={{ width: 60 }} />
      </View>

      <SectionList
        sections={sections}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.empty}>Sin protocolos enviados aun.</Text>
            <Text style={styles.emptyHint}>
              Los protocolos apareceran aqui cuando un supervisor los envie a revision.
            </Text>
          </View>
        }
        renderSectionHeader={({ section }) => (
          <View style={styles.dayHeader}>
            <Text style={styles.dayTitle}>{section.title}</Text>
            <Text style={styles.dayCount}>{section.data.length} protocolo(s)</Text>
          </View>
        )}
        renderItem={({ item }) => {
          const filledBy = item.filledById ? userNames[item.filledById] : 'Desconocido';
          const signedBy = item.signedById ? userNames[item.signedById] : null;
          const color = statusColor[item.status] ?? '#666';
          const isPending = item.status === 'SUBMITTED';

          return (
            <TouchableOpacity
              style={[styles.card, { borderLeftColor: color }]}
              onPress={() => onOpenProtocol(item.id)}
              activeOpacity={0.8}
            >
              <View style={styles.cardTop}>
                <Text style={styles.protocolNumber}>{item.protocolNumber}</Text>
              </View>

              <Text style={styles.filledBy}>
                Supervisor: {filledBy}
              </Text>
              {item.locationReference && (
                <Text style={styles.location}>Ubicacion: {item.locationReference}</Text>
              )}
              {signedBy && (
                <Text style={styles.signedBy}>Aprobado por: {signedBy}</Text>
              )}

              {isJefe && isPending && (
                <View style={styles.actions}>
                  <TouchableOpacity
                    style={styles.approveBtn}
                    onPress={() => handleApprove(item)}
                  >
                    <Text style={styles.approveBtnText}>Aprobar</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.rejectBtn}
                    onPress={() => handleReject(item)}
                  >
                    <Text style={styles.rejectBtnText}>Rechazar</Text>
                  </TouchableOpacity>
                </View>
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
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: 52, paddingBottom: 16,
    backgroundColor: Colors.navy,
  },
  backBtn: { padding: 4, minWidth: 60 },
  backText: { color: Colors.light, fontSize: 14, fontWeight: '600' },
  title: { fontSize: 14, fontWeight: '700', color: Colors.white, textAlign: 'center', letterSpacing: 1 },
  subtitle: { fontSize: 11, color: Colors.light, textAlign: 'center' },
  list: { padding: 16, paddingBottom: 40, gap: 8 },
  dayHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: Colors.light, borderRadius: Radius.md, padding: 10, marginBottom: 4,
  },
  dayTitle: { fontSize: 12, fontWeight: '700', color: Colors.navy, textTransform: 'capitalize' },
  dayCount: { fontSize: 11, color: Colors.primary },
  card: {
    backgroundColor: Colors.white, borderRadius: Radius.lg, padding: 14, gap: 6,
    borderLeftWidth: 3, ...Shadow.subtle,
  },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  protocolNumber: { fontSize: 15, fontWeight: '700', color: Colors.navy },
  statusBadge: { borderRadius: Radius.sm, paddingHorizontal: 8, paddingVertical: 3 },
  statusText: { color: Colors.white, fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },
  filledBy: { fontSize: 13, color: Colors.textSecondary },
  location: { fontSize: 12, color: Colors.textMuted },
  signedBy: { fontSize: 12, color: Colors.success, fontWeight: '600' },
  actions: { flexDirection: 'row', gap: 10, marginTop: 6 },
  approveBtn: {
    flex: 1, backgroundColor: Colors.success, borderRadius: Radius.md,
    padding: 11, alignItems: 'center',
  },
  approveBtnText: { color: Colors.white, fontWeight: '700', fontSize: 13, letterSpacing: 0.5 },
  rejectBtn: {
    flex: 1, backgroundColor: Colors.danger, borderRadius: Radius.md,
    padding: 11, alignItems: 'center',
  },
  rejectBtnText: { color: Colors.white, fontWeight: '700', fontSize: 13, letterSpacing: 0.5 },
  emptyContainer: { alignItems: 'center', paddingTop: 60, gap: 10 },
  empty: { fontSize: 15, fontWeight: '600', color: Colors.textSecondary },
  emptyHint: { fontSize: 13, color: Colors.textMuted, textAlign: 'center', paddingHorizontal: 32 },
});
