/**
 * ProjectSectorsContent — Contenido reutilizable del módulo de sectores.
 * Embebible en cualquier contenedor (pantalla independiente o tab).
 *
 * No incluye AppHeader: el padre se encarga de su propio chrome.
 * CREATOR-only — el caller valida el rol antes de montarlo.
 */

import React, { useEffect, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, Alert,
  Modal, TextInput, ActivityIndicator, ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import { Colors, Radius } from '../theme/colors';
import { database, projectSectorsCollection, protocolsCollection } from '@db/index';
import { Q } from '@nozbe/watermelondb';
import type ProjectSector from '@models/ProjectSector';
import { parseSectorFile, type ParsedSector } from '@services/SectorImporter';
import { pullProjectSectors } from '@services/SupabaseSyncService';
import { enqueue as enqueueSync } from '@services/SyncQueueService';
import { findSectorByPoint } from '@utils/CoordinateSystem';
import { SectorCroquis } from './SectorCroquis';
import { useTourStep } from '@hooks/useTourStep';
import { useI18n, tx } from '@i18n/index';

// Paleta de SECTORES — morados/teales/magentas/marrones. Deliberadamente DISTINTA
// de los colores de estado de ensayo (gris/azul/ámbar/verde/rojo) para no
// confundir polígonos de sector con marcadores de ensayo en el mapa.
const PALETTE = ['#7E57C2', '#00897B', '#C2185B', '#8D6E63', '#5E35B1', '#0097A7', '#AD1457', '#6D4C41'];
const newSectorId = () => `sec_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;

interface Props {
  projectId: string;
}

export default function ProjectSectorsContent({ projectId }: Props) {
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const sectorsImportRef = useTourStep('sectors_import');
  const sectorsCardRef = useTourStep('sectors_card');
  const sectorsRecalcRef = useTourStep('sectors_recalc');

  const [sectors, setSectors] = useState<ProjectSector[]>([]);
  const [importing, setImporting] = useState(false);
  const [recalculating, setRecalculating] = useState(false);
  const [previewResult, setPreviewResult] = useState<{ format: string; sectors: ParsedSector[]; warnings: string[] } | null>(null);
  const [editing, setEditing] = useState<{ id: string; name: string; color: string } | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    pullProjectSectors(projectId).catch(() => {});
    const sub = projectSectorsCollection
      .query(Q.where('project_id', projectId), Q.sortBy('name', Q.asc))
      .observe()
      .subscribe(setSectors);
    return () => sub.unsubscribe();
  }, [projectId]);

  const handlePickFile = async () => {
    setImporting(true);
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: '*/*',
        copyToCacheDirectory: true,
      });
      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0];
      const isCsv = /\.csv$/i.test(asset.name);
      const isXlsx = /\.xlsx?$/i.test(asset.name);
      if (!isCsv && !isXlsx) {
        Alert.alert(t('sectorsContent.invalidFormatTitle'), t('sectorsContent.invalidFormatMsg'));
        return;
      }
      const data = isCsv
        ? await FileSystem.readAsStringAsync(asset.uri, { encoding: FileSystem.EncodingType.UTF8 })
        : await FileSystem.readAsStringAsync(asset.uri, { encoding: FileSystem.EncodingType.Base64 });
      let parsed;
      if (isCsv) {
        parsed = parseSectorFile(data, asset.name);
      } else {
        const raw = atob(data);
        const buf = new Uint8Array(raw.length);
        for (let i = 0; i < raw.length; i++) buf[i] = raw.charCodeAt(i);
        parsed = parseSectorFile(buf.buffer, asset.name);
      }
      setPreviewResult(parsed);
    } catch (e) {
      Alert.alert(t('sectorsContent.readFileError'), e instanceof Error ? e.message : String(e));
    } finally {
      setImporting(false);
    }
  };

  const handleConfirmImport = async () => {
    if (!previewResult) return;
    setImporting(true);
    try {
      const existing = await projectSectorsCollection.query(Q.where('project_id', projectId)).fetch();
      const byName = new Map<string, ProjectSector>();
      for (const s of existing) byName.set(s.name.toLowerCase(), s);

      const toPush: any[] = [];
      await database.write(async () => {
        const ops: any[] = [];
        let colorIdx = byName.size;
        // v29 — sort_order = posición en el array (orden del Excel). Tanto al
        // crear como al actualizar, así re-importar reordena sin perder data.
        for (let i = 0; i < previewResult.sectors.length; i++) {
          const p = previewResult.sectors[i];
          const sortOrder = i + 1;
          const existingRec = byName.get(p.name.toLowerCase());
          if (existingRec) {
            ops.push(existingRec.prepareUpdate((r: any) => {
              r.pointsJson = p.points ? JSON.stringify(p.points) : null;
              if (p.sourceSystem) r.sourceSystem = p.sourceSystem;
              r.sortOrder = sortOrder;
            }));
            toPush.push(existingRec);
          } else {
            const color = PALETTE[colorIdx % PALETTE.length]; colorIdx++;
            const rec = projectSectorsCollection.prepareCreate((r: any) => {
              r._raw.id = newSectorId();
              r.projectId = projectId;
              r.name = p.name;
              r.pointsJson = p.points ? JSON.stringify(p.points) : null;
              r.displayColor = color;
              r.sourceSystem = p.sourceSystem ?? null;
              r.sortOrder = sortOrder;
            });
            ops.push(rec);
            toPush.push(rec);
          }
        }
        await database.batch(ops);
      });

      await Promise.all(toPush.map((s: any) => enqueueSync({
        opType: 'PUSH_PROJECT_SECTOR',
        entityId: s.id,
        projectId,
      })));

      const newCount = previewResult.sectors.length - Math.min(byName.size, previewResult.sectors.length);
      Alert.alert(
        t('sectorsContent.importDoneTitle'),
        t('sectorsContent.importDoneSectorsProcessed', {
          count: previewResult.sectors.length,
          newInfo: newCount > 0 ? t('sectorsContent.importDoneNewCount', { count: newCount }) : t('sectorsContent.importDoneNewZero'),
        }) +
        (previewResult.warnings.length ? t('sectorsContent.importWarnings', { count: previewResult.warnings.length, list: previewResult.warnings.slice(0, 5).join('\n') }) : ''),
      );
      setPreviewResult(null);
    } catch (e) {
      Alert.alert(t('sectorsContent.errorTitle'), e instanceof Error ? e.message : t('sectorsContent.saveImportError'));
    } finally {
      setImporting(false);
    }
  };

  const handleDelete = async (sector: ProjectSector) => {
    const assigned = await protocolsCollection.query(Q.where('sector_id', sector.id)).fetch();
    Alert.alert(
      t('sectorsContent.deleteTitle', { name: sector.name }),
      assigned.length > 0
        ? t('sectorsContent.deleteAssignedMsg', { count: assigned.length })
        : t('sectorsContent.deleteConfirmMsg'),
      [
        { text: t('sectorsContent.cancel'), style: 'cancel' },
        {
          text: t('sectorsContent.delete'), style: 'destructive',
          onPress: async () => {
            try {
              await database.write(async () => {
                const ops: any[] = [];
                for (const p of assigned) {
                  ops.push((p as any).prepareUpdate((r: any) => { r.sectorId = null; }));
                }
                ops.push((sector as any).prepareDestroyPermanently());
                await database.batch(ops);
              });
              await Promise.all(assigned.map((p: any) => enqueueSync({
                opType: 'PUSH_PROTOCOL_STATUS', entityId: p.id, projectId,
              })));
              await enqueueSync({
                opType: 'DELETE_PROJECT_SECTOR', entityId: sector.id, projectId,
              });
            } catch (e) {
              Alert.alert(t('sectorsContent.errorTitle'), e instanceof Error ? e.message : t('sectorsContent.deleteError'));
            }
          },
        },
      ],
    );
  };

  const handleSaveEdit = async () => {
    if (!editing) return;
    const trimmed = editing.name.trim();
    if (!trimmed) { Alert.alert(t('sectorsContent.nameRequired')); return; }
    const rec = await projectSectorsCollection.find(editing.id).catch(() => null);
    if (!rec) { setEditing(null); return; }
    try {
      await database.write(async () => {
        await (rec as any).update((r: any) => {
          r.name = trimmed;
          r.displayColor = editing.color;
        });
      });
      await enqueueSync({ opType: 'PUSH_PROJECT_SECTOR', entityId: rec.id, projectId });
      setEditing(null);
    } catch (e) {
      Alert.alert(t('sectorsContent.errorTitle'), e instanceof Error ? e.message : t('sectorsContent.saveError'));
    }
  };

  const handleRecalculate = async () => {
    const withGeom = sectors.filter(s => s.points && s.points.length >= 3);
    if (withGeom.length === 0) { Alert.alert(t('sectorsContent.noGeometryTitle'), t('sectorsContent.noGeometryMsg')); return; }
    setRecalculating(true);
    try {
      const protos = await protocolsCollection
        .query(
          Q.where('project_id', projectId),
          Q.or(
            Q.where('sector_assigned_manually', false),
            Q.where('sector_assigned_manually', Q.eq(null)),
          ),
        )
        .fetch();
      const sectorsForLookup = withGeom.map(s => ({ id: s.id, name: s.name, points: s.points }));
      let updated = 0;
      const toPush: any[] = [];
      await database.write(async () => {
        const ops: any[] = [];
        for (const p of protos as any[]) {
          if (p.latitude == null || p.longitude == null) continue;
          const match = findSectorByPoint({ lat: p.latitude, lng: p.longitude }, sectorsForLookup);
          const newSectorId = match ? match.id : null;
          if (newSectorId !== p.sectorId) {
            ops.push(p.prepareUpdate((r: any) => { r.sectorId = newSectorId; }));
            toPush.push(p);
            updated++;
          }
        }
        if (ops.length > 0) await database.batch(ops);
      });
      await Promise.all(toPush.map((p: any) => enqueueSync({
        opType: 'PUSH_PROTOCOL_STATUS', entityId: p.id, projectId,
      })));
      Alert.alert(t('sectorsContent.recalcDoneTitle'), t('sectorsContent.recalcDoneMsg', { updated, total: protos.length }));
    } catch (e) {
      Alert.alert(t('sectorsContent.errorTitle'), e instanceof Error ? e.message : t('sectorsContent.recalcError'));
    } finally {
      setRecalculating(false);
    }
  };

  const renderItem = ({ item, index }: { item: ProjectSector; index: number }) => {
    const points = item.points;
    const hasGeom = points && points.length >= 3;
    const expanded = expandedId === item.id;
    return (
      <View ref={index === 0 ? sectorsCardRef : undefined}>
        <TouchableOpacity
          activeOpacity={hasGeom ? 0.6 : 1}
          onPress={() => hasGeom && setExpandedId(expanded ? null : item.id)}
          style={styles.row}
        >
          {hasGeom
            ? <Ionicons name={expanded ? 'chevron-down' : 'chevron-forward'} size={14} color={Colors.textMuted} style={{ marginRight: 4 }} />
            : <View style={{ width: 18 }} />}
          <View style={[styles.colorChip, { backgroundColor: item.displayColor ?? Colors.textMuted }]} />
          <View style={{ flex: 1 }}>
            <Text style={styles.rowName}>{item.name}</Text>
            <Text style={styles.rowMeta}>
              {hasGeom ? t('sectorsContent.rowGeometryMeta', { count: points.length }) : t('sectorsContent.rowNameOnly')}
              {item.sourceSystem ? ` · ${item.sourceSystem}` : ''}
            </Text>
          </View>
          <TouchableOpacity onPress={() => setEditing({ id: item.id, name: item.name, color: item.displayColor ?? PALETTE[0] })} style={styles.iconBtn}>
            <Ionicons name="pencil" size={16} color={Colors.primary} />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => handleDelete(item)} style={styles.iconBtn}>
            <Ionicons name="trash-outline" size={16} color={Colors.danger} />
          </TouchableOpacity>
        </TouchableOpacity>
        {expanded && hasGeom && (
          <View style={styles.croquisWrap}>
            <SectorCroquis points={points as { lat: number; lng: number }[]} color={item.displayColor ?? Colors.primary} />
          </View>
        )}
      </View>
    );
  };

  const summary = useMemo(() => {
    const withGeom = sectors.filter(s => {
      const pts = s.points;
      return pts && pts.length >= 3;
    }).length;
    return { total: sectors.length, withGeom, namesOnly: sectors.length - withGeom };
  }, [sectors]);

  return (
    <View style={styles.container}>
      <View style={styles.statsBar}>
        <Text style={styles.statsText}>{t('sectorsContent.statTotal')}<Text style={styles.statsNum}>{summary.total}</Text></Text>
        <Text style={styles.statsText}>{t('sectorsContent.statWithGeometry')}<Text style={styles.statsNum}>{summary.withGeom}</Text></Text>
        <Text style={styles.statsText}>{t('sectorsContent.statNamesOnly')}<Text style={styles.statsNum}>{summary.namesOnly}</Text></Text>
      </View>

      <View style={styles.actionsBar}>
        <TouchableOpacity ref={sectorsImportRef} onPress={handlePickFile} style={styles.actionBtn} disabled={importing}>
          <Ionicons name="cloud-upload-outline" size={16} color={Colors.white} />
          <Text style={styles.actionBtnText}>{t('sectorsContent.importExcelCsv')}</Text>
        </TouchableOpacity>
        <TouchableOpacity ref={sectorsRecalcRef} onPress={handleRecalculate} style={[styles.actionBtn, { backgroundColor: Colors.warning }]} disabled={recalculating}>
          <Ionicons name="refresh" size={16} color={Colors.white} />
          <Text style={styles.actionBtnText}>{recalculating ? t('sectorsContent.recalculating') : t('sectorsContent.recalcAssignments')}</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={sectors}
        keyExtractor={s => s.id}
        renderItem={renderItem}
        contentContainerStyle={{ padding: 12, gap: 6, paddingBottom: Math.max(12, insets.bottom + 12) }}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="map-outline" size={36} color={Colors.textMuted} />
            <Text style={styles.emptyText}>{t('sectorsContent.emptyText')}</Text>
            <Text style={styles.emptyHint}>{t('sectorsContent.emptyHint')}</Text>
          </View>
        }
      />

      <Modal visible={!!previewResult} animationType="slide" transparent>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{t('sectorsContent.previewTitle')}</Text>
            {previewResult && (
              <ScrollView style={{ maxHeight: 360 }}>
                <Text style={styles.modalMeta}>
                  {t('sectorsContent.previewFormatDetected')}<Text style={{ fontWeight: '700' }}>{formatLabel(previewResult.format)}</Text>
                </Text>
                <Text style={styles.modalMeta}>
                  {t('sectorsContent.previewSectorsToImport')}<Text style={{ fontWeight: '700' }}>{previewResult.sectors.length}</Text>
                </Text>
                {previewResult.sectors.slice(0, 20).map((s, i) => (
                  <Text key={i} style={styles.previewLine}>
                    • {s.name} {s.points ? t('sectorsContent.previewLinePts', { count: s.points.length }) : t('sectorsContent.previewLineNameOnly')}
                  </Text>
                ))}
                {previewResult.sectors.length > 20 && (
                  <Text style={styles.previewLine}>{t('sectorsContent.previewMore', { count: previewResult.sectors.length - 20 })}</Text>
                )}
                {previewResult.warnings.length > 0 && (
                  <View style={styles.warnBox}>
                    <Text style={styles.warnTitle}>{t('sectorsContent.previewWarningsTitle', { count: previewResult.warnings.length })}</Text>
                    {previewResult.warnings.slice(0, 8).map((w, i) => (
                      <Text key={i} style={styles.warnText}>⚠ {w}</Text>
                    ))}
                  </View>
                )}
              </ScrollView>
            )}
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
              <TouchableOpacity onPress={() => setPreviewResult(null)} style={styles.modalCancelBtn}>
                <Text style={styles.modalCancelText}>{t('sectorsContent.cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleConfirmImport} style={styles.modalConfirmBtn} disabled={importing}>
                {importing ? <ActivityIndicator color={Colors.white} /> : <Text style={styles.modalConfirmText}>{t('sectorsContent.confirmImport')}</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={!!editing} animationType="fade" transparent>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{t('sectorsContent.editTitle')}</Text>
            {editing && (
              <>
                <Text style={styles.fieldLabel}>{t('sectorsContent.fieldName')}</Text>
                <TextInput
                  value={editing.name}
                  onChangeText={t => setEditing({ ...editing, name: t })}
                  style={styles.modalInput}
                />
                <Text style={styles.fieldLabel}>{t('sectorsContent.fieldColor')}</Text>
                <View style={styles.palette}>
                  {PALETTE.map(c => (
                    <TouchableOpacity
                      key={c}
                      onPress={() => setEditing({ ...editing, color: c })}
                      style={[
                        styles.paletteSwatch,
                        { backgroundColor: c },
                        editing.color === c && styles.paletteSwatchActive,
                      ]}
                    />
                  ))}
                </View>
              </>
            )}
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
              <TouchableOpacity onPress={() => setEditing(null)} style={styles.modalCancelBtn}>
                <Text style={styles.modalCancelText}>{t('sectorsContent.cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleSaveEdit} style={styles.modalConfirmBtn}>
                <Text style={styles.modalConfirmText}>{t('sectorsContent.save')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function formatLabel(f: string): string {
  switch (f) {
    case 'names-only': return tx('sectorsContent.formatNamesOnly');
    case 'wgs84-flat': return tx('sectorsContent.formatWgs84Flat');
    case 'projected':  return tx('sectorsContent.formatProjected');
    default: return f;
  }
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.surface },
  statsBar: { flexDirection: 'row', justifyContent: 'space-around', padding: 10, backgroundColor: Colors.white, borderBottomWidth: 1, borderBottomColor: Colors.border },
  statsText: { fontSize: 12, color: Colors.textSecondary },
  statsNum: { fontWeight: '700', color: Colors.textPrimary },
  actionsBar: { flexDirection: 'row', gap: 8, padding: 10, backgroundColor: Colors.white, borderBottomWidth: 1, borderBottomColor: Colors.border },
  actionBtn: { flex: 1, flexDirection: 'row', gap: 6, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.primary, padding: 10, borderRadius: Radius.md },
  actionBtnText: { color: Colors.white, fontWeight: '700', fontSize: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, backgroundColor: Colors.white, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border },
  colorChip: { width: 14, height: 14, borderRadius: 7 },
  croquisWrap: { alignItems: 'center', paddingVertical: 8, backgroundColor: Colors.white, borderBottomLeftRadius: Radius.md, borderBottomRightRadius: Radius.md, borderWidth: 1, borderTopWidth: 0, borderColor: Colors.border, marginTop: -1 },
  rowName: { fontSize: 14, fontWeight: '700', color: Colors.textPrimary },
  rowMeta: { fontSize: 11, color: Colors.textMuted, marginTop: 2 },
  iconBtn: { padding: 6 },
  empty: { alignItems: 'center', padding: 40, gap: 8 },
  emptyText: { color: Colors.textSecondary, fontWeight: '700' },
  emptyHint: { color: Colors.textMuted, fontSize: 12 },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 16 },
  modalCard: { backgroundColor: Colors.white, borderRadius: Radius.lg, padding: 16, width: '100%', maxWidth: 480 },
  modalTitle: { fontSize: 16, fontWeight: '800', color: Colors.textPrimary, marginBottom: 12 },
  modalMeta: { fontSize: 13, color: Colors.textSecondary, marginBottom: 6 },
  previewLine: { fontSize: 12, color: Colors.textSecondary, paddingVertical: 2 },
  warnBox: { marginTop: 8, padding: 8, backgroundColor: Colors.warning + '15', borderRadius: 4, borderWidth: 1, borderColor: Colors.warning + '50' },
  warnTitle: { fontSize: 12, fontWeight: '700', color: Colors.warning, marginBottom: 4 },
  warnText: { fontSize: 11, color: Colors.textSecondary, marginVertical: 1 },
  fieldLabel: { fontSize: 12, fontWeight: '700', color: Colors.textPrimary, marginBottom: 4, marginTop: 8 },
  modalInput: { borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.sm, padding: 10, fontSize: 14, color: Colors.textPrimary },
  palette: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  paletteSwatch: { width: 30, height: 30, borderRadius: 15, borderWidth: 2, borderColor: 'transparent' },
  paletteSwatchActive: { borderColor: Colors.textPrimary },
  modalCancelBtn: { flex: 1, padding: 12, alignItems: 'center', borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border },
  modalCancelText: { color: Colors.textSecondary, fontWeight: '700' },
  modalConfirmBtn: { flex: 1, padding: 12, alignItems: 'center', borderRadius: Radius.md, backgroundColor: Colors.primary },
  modalConfirmText: { color: Colors.white, fontWeight: '700' },
});
