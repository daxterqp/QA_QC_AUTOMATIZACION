import React, { useCallback, useEffect, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  View, Text, StyleSheet, SectionList, TouchableOpacity, Alert, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AppHeader from '@components/AppHeader';
import { Colors, Radius, Shadow } from '../theme/colors';
import { database, protocolsCollection, usersCollection } from '@db/index';
import { useAuth } from '@context/AuthContext';
import { useTour } from '@context/TourContext';
import { useTourStep } from '@hooks/useTourStep';
import { Q } from '@nozbe/watermelondb';
import type Protocol from '@models/Protocol';
import { exportDossierPdf } from '@services/DossierExportService';
import { pushProtocolStatus } from '@services/SupabaseSyncService';

interface Props {
  projectId: string;
  projectName: string;
  onBack: () => void;
  onOpenProtocol: (protocolId: string) => void;
  onPreviewPdf?: (pdfUri: string) => void;
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

export default function DossierScreen({ projectId, projectName, onBack, onOpenProtocol, onPreviewPdf }: Props) {
  const { currentUser } = useAuth();
  const [sections, setSections] = useState<DaySection[]>([]);
  const [userNames, setUserNames] = useState<Record<string, string>>({});

  const isJefe = currentUser?.role === 'RESIDENT' || currentUser?.role === 'CREATOR';

  const { isActive: tourActive, currentStep: tourStep, nextStep: tourNextStep, jumpToStep } = useTour();

  // Tour refs
  const dossierExportBtnRef = useTourStep('dossier_export_btn');
  const dossierItem0Ref = useTourStep('dossier_item_0');
  const [exporting, setExporting] = useState(false);

  const handleExportPdf = async () => {
    if (!currentUser) return;
    setExporting(true);
    if (tourActive && tourStep?.id === 'dossier_export_btn') tourNextStep();
    try {
      const uri = await exportDossierPdf(projectId, projectName, currentUser.id);
      if (onPreviewPdf) {
        onPreviewPdf(uri);
      }
    } catch (e) {
      Alert.alert('Error', `No se pudo generar el PDF.\n${String(e)}`);
    } finally {
      setExporting(false);
    }
  };

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
          let updated: Protocol | null = null;
          await database.write(async () => {
            updated = await protocol.update((p) => {
              p.status = 'APPROVED';
              p.isLocked = true;
              p.signedById = currentUser?.id ?? null;
              (p as any).signedAt = Date.now();
            });
          });
          if (updated) pushProtocolStatus(updated).catch(() => {});
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
            let updated: Protocol | null = null;
            await database.write(async () => {
              updated = await protocol.update((p) => {
                p.status = 'REJECTED';
                p.correctionsAllowed = true;
              });
            });
            if (updated) pushProtocolStatus(updated).catch(() => {});
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
      <AppHeader
        title="Dosier de Protocolos"
        subtitle={projectName}
        onBack={onBack}
        rightContent={
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            {isJefe && (
              <TouchableOpacity
                ref={dossierExportBtnRef}
                onPress={handleExportPdf}
                disabled={exporting}
                style={styles.exportBtn}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                {exporting
                  ? <ActivityIndicator color={Colors.white} size="small" />
                  : <Ionicons name="document-text-outline" size={24} color={Colors.white} />
                }
              </TouchableOpacity>
            )}
            <TouchableOpacity onPress={() => jumpToStep('dossier_protocol_list')} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons name="help-circle-outline" size={22} color={Colors.white} />
            </TouchableOpacity>
          </View>
        }
      />

      <View style={{ flex: 1 }}>
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
        renderItem={({ item, index, section }) => {
          const isFirst = index === 0 && sections[0]?.title === section.title;
          const filledBy = item.filledById ? userNames[item.filledById] : 'Desconocido';
          const signedBy = item.signedById ? userNames[item.signedById] : null;
          const color = statusColor[item.status] ?? '#666';
          const isPending = item.status === 'SUBMITTED';

          return (
            <TouchableOpacity
              ref={isFirst ? dossierItem0Ref : undefined}
              style={[styles.card, { borderLeftColor: color }]}
              onPress={() => {
                if (isFirst && tourActive && tourStep?.id === 'dossier_protocol_list') tourNextStep();
                onOpenProtocol(item.id);
              }}
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.surface },
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
    flex: 1, backgroundColor: '#eaf7ee', borderRadius: Radius.md,
    padding: 10, alignItems: 'center', borderWidth: 1, borderColor: '#1e8e3e',
  },
  approveBtnText: { color: '#1e8e3e', fontWeight: '700', fontSize: 12, letterSpacing: 0.3 },
  rejectBtn: {
    flex: 1, backgroundColor: '#fdf0ef', borderRadius: Radius.md,
    padding: 10, alignItems: 'center', borderWidth: 1, borderColor: '#d93025',
  },
  rejectBtnText: { color: '#d93025', fontWeight: '700', fontSize: 12, letterSpacing: 0.3 },
  exportBtn: { padding: 4 },
  emptyContainer: { alignItems: 'center', paddingTop: 60, gap: 10 },
  empty: { fontSize: 15, fontWeight: '600', color: Colors.textSecondary },
  emptyHint: { fontSize: 13, color: Colors.textMuted, textAlign: 'center', paddingHorizontal: 32 },
});
