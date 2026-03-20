import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@navigation/types';
import {
  locationsCollection,
  protocolTemplatesCollection,
  protocolTemplateItemsCollection,
  protocolsCollection,
  protocolItemsCollection,
  database,
} from '@db/index';
import { Q } from '@nozbe/watermelondb';
import { useAuth } from '@context/AuthContext';
import type ProtocolTemplate from '@models/ProtocolTemplate';
import type Protocol from '@models/Protocol';
import type { ProtocolStatus } from '@models/Protocol';
import { Colors, Radius, Shadow } from '../theme/colors';

type Props = NativeStackScreenProps<RootStackParamList, 'LocationProtocols'>;

interface TemplateRow {
  template: ProtocolTemplate;
  instance: Protocol | null;
}

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

export default function LocationProtocolsScreen({ navigation, route }: Props) {
  const { locationId, locationName, projectId, projectName } = route.params;
  const { currentUser } = useAuth();
  const [rows, setRows] = useState<TemplateRow[]>([]);
  const [loading, setLoading] = useState(true);

  const isJefe = currentUser?.role === 'RESIDENT';
  const isCreator = currentUser?.role === 'CREATOR';
  const isSupervisor = currentUser?.role === 'SUPERVISOR';

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      // 1. Obtener la ubicación para leer sus templateIds
      const location = await locationsCollection.find(locationId);
      const templateIdList = location.templateIds
        ? location.templateIds.split(',').map((s) => s.trim()).filter(Boolean)
        : [];

      if (templateIdList.length === 0) {
        setRows([]);
        setLoading(false);
        return;
      }

      // 2. Cargar las plantillas del proyecto que coinciden con los IDs
      const allTemplates = await protocolTemplatesCollection
        .query(Q.where('project_id', projectId))
        .fetch();

      const matchingTemplates = allTemplates.filter((t) =>
        templateIdList.includes(t.idProtocolo)
      );

      // 3. Cargar instancias existentes para esta ubicación
      const existingInstances = await protocolsCollection
        .query(
          Q.where('location_id', locationId),
          Q.where('project_id', projectId)
        )
        .fetch();

      // 4. Construir filas: template + su instancia (si existe)
      const built: TemplateRow[] = matchingTemplates.map((tmpl) => ({
        template: tmpl,
        instance: existingInstances.find((p) => p.templateId === tmpl.id) ?? null,
      }));

      setRows(built);
    } finally {
      setLoading(false);
    }
  }, [locationId, projectId]);

  useEffect(() => {
    loadData();
    // Recargar al volver a esta pantalla
    const unsubscribe = navigation.addListener('focus', loadData);
    return unsubscribe;
  }, [loadData, navigation]);

  const handleOpenProtocol = async (row: TemplateRow) => {
    let instanceId = row.instance?.id;

    // Si no existe instancia, crearla copiando la plantilla
    if (!instanceId) {
      const templateItems = await protocolTemplateItemsCollection
        .query(Q.where('template_id', row.template.id))
        .fetch();

      await database.write(async () => {
        const protocol = await protocolsCollection.create((p) => {
          p.projectId = projectId;
          p.locationId = locationId;
          p.templateId = row.template.id;
          p.protocolNumber = row.template.name;
          p.locationReference = locationName;
          p.status = 'DRAFT';
          p.isLocked = false;
          p.correctionsAllowed = false;
          p.uploadStatus = 'PENDING';
          p.latitude = null;
          p.longitude = null;
          p.templateId = row.template.id;
        });

        for (const tmplItem of templateItems) {
          await protocolItemsCollection.create((item) => {
            item.protocolId = protocol.id;
            item.partidaItem = tmplItem.partidaItem ?? null;
            item.itemDescription = tmplItem.itemDescription;
            item.validationMethod = tmplItem.validationMethod ?? null;
            (item as any).section = (tmplItem as any).section ?? null;
            item.isCompliant = false;
            item.comments = null;
          });
        }

        instanceId = protocol.id;
      });
    }

    // Navegar según rol
    const status = row.instance?.status ?? 'DRAFT';
    const correctionsAllowed = (row.instance as any)?.correctionsAllowed ?? false;
    const canFillStatus = status === 'DRAFT' || status === 'IN_PROGRESS' || (status === 'REJECTED' && correctionsAllowed);

    if (isCreator || isSupervisor || isJefe) {
      // CREATOR, SUPERVISOR, RESIDENT: editan DRAFT/REJECTED, auditan SUBMITTED/APPROVED
      if (canFillStatus) {
        navigation.navigate('ProtocolFill', { protocolId: instanceId! });
      } else {
        navigation.navigate('ProtocolAudit', { protocolId: instanceId! });
      }
    } else {
      navigation.navigate('ProtocolFill', { protocolId: instanceId! });
    }
  };

  const renderItem = ({ item }: { item: TemplateRow }) => {
    const status = item.instance?.status;
    const correctionsAllowed = (item.instance as any)?.correctionsAllowed ?? false;
    const canFill = (isCreator || isSupervisor || isJefe) &&
      (!status || status === 'DRAFT' || status === 'IN_PROGRESS' || (status === 'REJECTED' && correctionsAllowed));
    return (
      <TouchableOpacity style={styles.card} onPress={() => handleOpenProtocol(item)}>
        <View style={styles.cardLeft}>
          <Text style={styles.templateName}>{item.template.name}</Text>
          <Text style={styles.templateId}>ID: {item.template.idProtocolo}</Text>
          {canFill && <Text style={styles.fillHint}>Toca para rellenar ›</Text>}
        </View>
        <View style={styles.cardRight}>
          {status ? (
            <View style={[styles.statusBadge, { backgroundColor: STATUS_COLORS[status] }]}>
              <Text style={styles.statusText}>{STATUS_LABELS[status]}</Text>
            </View>
          ) : (
            <View style={[styles.statusBadge, { backgroundColor: Colors.border }]}>
              <Text style={[styles.statusText, { color: Colors.textMuted }]}>Sin iniciar</Text>
            </View>
          )}
          <Text style={styles.chevron}>›</Text>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backBtnText}>‹ {projectName}</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>{locationName}</Text>
        <Text style={styles.headerSub}>Protocolos requeridos</Text>
      </View>

      {loading ? (
        <View style={styles.loadingBox}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(item) => item.template.id}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyText}>
                Esta ubicación no tiene protocolos vinculados.{'\n'}
                Revisa la columna ID_Protocolos en el Excel de ubicaciones.
              </Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.surface },

  header: {
    backgroundColor: Colors.navy,
    paddingTop: 52,
    paddingBottom: 16,
    paddingHorizontal: 16,
  },
  backBtn: { marginBottom: 4 },
  backBtnText: { color: Colors.light, fontSize: 13 },
  headerTitle: { fontSize: 18, fontWeight: '700', color: Colors.white },
  headerSub: { fontSize: 11, color: Colors.light, marginTop: 2 },

  loadingBox: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  list: { padding: 16, gap: 10 },

  card: {
    backgroundColor: Colors.white,
    borderRadius: Radius.md,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    ...Shadow.subtle,
  },
  cardLeft: { flex: 1, marginRight: 12 },
  templateName: { fontSize: 14, fontWeight: '600', color: Colors.navy },
  templateId: { fontSize: 11, color: Colors.textMuted, marginTop: 2 },
  fillHint: { fontSize: 11, color: Colors.primary, fontWeight: '700', marginTop: 4 },

  cardRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  statusBadge: {
    borderRadius: Radius.sm,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  statusText: { fontSize: 11, fontWeight: '700', color: Colors.white },
  chevron: { fontSize: 22, color: Colors.textMuted },

  empty: { padding: 40, alignItems: 'center' },
  emptyText: { fontSize: 13, color: Colors.textMuted, textAlign: 'center', lineHeight: 20 },
});
