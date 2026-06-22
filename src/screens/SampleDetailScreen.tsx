/**
 * SampleDetailScreen (v43) — Pantalla de una MUESTRA física.
 *
 * Arriba: datos generales de la muestra. Abajo: ensayos vinculados (mismo flujo
 * de creación que los demás módulos, vía createInstances con sampleId) + botón
 * para añadir. Exporta estilo dossier (datos generales + lista de ensayos).
 */
import React, { useCallback, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Modal,
  ActivityIndicator, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Q } from '@nozbe/watermelondb';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import AppHeader from '@components/AppHeader';
import { Colors, Radius, Shadow } from '../theme/colors';
import type { RootStackParamList } from '@navigation/types';
import {
  samplesCollection, protocolsCollection, protocolTemplatesCollection,
  projectSectorsCollection, locationsCollection,
} from '@db/index';
import { createInstances } from '@services/ProtocolInstanceService';
import { todayEnsayoDate } from '@utils/protocolCode';
import { escapeHtml } from '@utils/htmlEscape';
import QrCodeView from '@components/QrCodeView';
import { buildSampleDeepLink, generateSampleQr } from '@utils/qrCode';
import { useI18n, tx } from '@i18n/index';

type Props = NativeStackScreenProps<RootStackParamList, 'SampleDetail'>;

// v43.3 — Mismo etiquetado que el resto de módulos: DRAFT = "En progreso" (no "Borrador").
const STATUS_LABEL: Record<string, string> = { DRAFT: tx('sampleDetail.status.inProgress'), IN_PROGRESS: tx('sampleDetail.status.inProgress'), SUBMITTED: tx('sampleDetail.status.inReview'), APPROVED: tx('sampleDetail.status.approved'), REJECTED: tx('sampleDetail.status.rejected') };
const STATUS_COLOR: Record<string, string> = { DRAFT: Colors.warning, IN_PROGRESS: Colors.warning, SUBMITTED: Colors.warning, APPROVED: Colors.success, REJECTED: Colors.danger };

export default function SampleDetailScreen({ route, navigation }: Props) {
  const { t } = useI18n();
  const { projectId, projectName, sampleId } = route.params;
  const [loading, setLoading] = useState(true);
  const [sample, setSample] = useState<any | null>(null);
  const [placeName, setPlaceName] = useState<string>('—');
  const [protos, setProtos] = useState<any[]>([]);
  const [templates, setTemplates] = useState<any[]>([]);
  const [tplName, setTplName] = useState<Record<string, string>>({});

  const [showAdd, setShowAdd] = useState(false);
  const [selTpl, setSelTpl] = useState<string>('');
  const [countText, setCountText] = useState('1');
  const [creating, setCreating] = useState(false);
  const [exporting, setExporting] = useState(false);

  const load = useCallback(async () => {
    try {
      const s = await samplesCollection.find(sampleId).catch(() => null);
      setSample(s);
      if (s) {
        if ((s as any).sectorId) {
          const sec = await projectSectorsCollection.find((s as any).sectorId).catch(() => null);
          setPlaceName((sec as any)?.name ?? '—');
        } else if ((s as any).locationId) {
          const loc = await locationsCollection.find((s as any).locationId).catch(() => null);
          setPlaceName((loc as any)?.name ?? '—');
        } else setPlaceName('—');
      }
      const [ps, tpls] = await Promise.all([
        protocolsCollection.query(Q.where('sample_id', sampleId)).fetch().catch(() => [] as any[]),
        protocolTemplatesCollection.query(Q.where('project_id', projectId)).fetch().catch(() => [] as any[]),
      ]);
      const nameMap: Record<string, string> = {};
      for (const t of tpls as any[]) nameMap[t.id] = t.idProtocolo ?? t.name;
      setTplName(nameMap);
      setTemplates((tpls as any[]).filter(t => !t.isHidden));
      setProtos([...ps].sort((a: any, b: any) => (b.createdAt?.getTime?.() ?? 0) - (a.createdAt?.getTime?.() ?? 0)));
    } finally {
      setLoading(false);
    }
  }, [sampleId, projectId]);

  useFocusEffect(useCallback(() => { setLoading(true); load(); }, [load]));

  const addEnsayo = async () => {
    if (creating) return;
    const template = templates.find(t => t.id === selTpl);
    if (!template) { Alert.alert(t('sampleDetail.alert.missingTypeTitle'), t('sampleDetail.alert.missingTypeMsg')); return; }
    const count = Math.max(1, Math.min(50, parseInt(countText, 10) || 1));
    setCreating(true);
    try {
      await createInstances({
        projectId,
        template: { id: template.id, name: template.name, idProtocolo: template.idProtocolo },
        count,
        sampleId,
        sectorId: sample?.sectorId ?? null,
        locationId: sample?.locationId ?? null,
        ensayoDate: sample?.sampleDate ?? todayEnsayoDate(),
      });
      setShowAdd(false); setSelTpl(''); setCountText('1');
      await load();
    } catch (e: any) {
      Alert.alert(t('sampleDetail.alert.errorTitle'), e?.message ?? t('sampleDetail.alert.createFailed'));
    } finally {
      setCreating(false);
    }
  };

  const openProto = (p: any) => {
    if (p.status === 'DRAFT' || p.status === 'REJECTED') navigation.navigate('ProtocolFill', { protocolId: p.id });
    else navigation.navigate('ProtocolAudit', { protocolId: p.id });
  };

  const exportPdf = async () => {
    if (!sample || exporting) return;
    setExporting(true);
    try {
      const row = (l: string, v: string | null | undefined) => v ? `<tr><td class="k">${escapeHtml(l)}</td><td>${escapeHtml(String(v))}</td></tr>` : '';
      const coords = sample.coordEast != null || sample.latitude != null
        ? `${sample.coordSystem ?? ''} E:${sample.coordEast ?? '—'} N:${sample.coordNorth ?? '—'} Cota:${sample.coordElevation ?? '—'}${sample.latitude != null ? ` (GPS ${Number(sample.latitude).toFixed(6)}, ${Number(sample.longitude).toFixed(6)})` : ''}`
        : null;
      const ensayosRows = protos.map((p, i) => `<tr><td>${i + 1}</td><td>${escapeHtml(p.protocolCode ?? p.protocolNumber ?? '—')}</td><td>${escapeHtml(tplName[p.templateId] ?? '—')}</td><td>${escapeHtml(STATUS_LABEL[p.status] ?? p.status)}</td><td>${escapeHtml(p.ensayoDate ?? '—')}</td></tr>`).join('');
      let qrSvg = '';
      try { qrSvg = (await generateSampleQr({ sampleCode: sample.sampleCode, size: 110 })).svg; } catch { /* QR opcional */ }
      const html = `<!doctype html><html><head><meta charset="utf-8"><style>
        body{font-family:Arial,Helvetica,sans-serif;color:#222;padding:24px;}
        h1{color:#0e213d;font-size:20px;margin:0 0 4px;} h2{color:#394e7d;font-size:14px;margin:18px 0 6px;}
        table{width:100%;border-collapse:collapse;font-size:12px;} td,th{border:1px solid #cbd5e1;padding:6px 8px;text-align:left;}
        th{background:#0e213d;color:#fff;} .k{font-weight:bold;width:38%;background:#f1f5f9;}
        .sub{color:#666;font-size:12px;} .hdr{display:flex;justify-content:space-between;align-items:flex-start;}
        .qr{width:110px;height:110px;}</style></head><body>
        <div class="hdr">
          <div><h1>${escapeHtml(t('sampleDetail.pdf.sampleTitle', { code: sample.sampleCode }))}</h1><div class="sub">${escapeHtml(projectName)}</div></div>
          <div class="qr">${qrSvg}</div>
        </div>
        <h2>${escapeHtml(t('sampleDetail.pdf.generalData'))}</h2>
        <table>
          ${row(t('sampleDetail.field.code'), sample.sampleCode)}
          ${row(t('sampleDetail.field.date'), sample.sampleDate)}
          ${row(sample.sectorId ? t('sampleDetail.field.sector') : t('sampleDetail.field.location'), placeName)}
          ${row(t('sampleDetail.field.materialType'), sample.materialType)}
          ${row(t('sampleDetail.field.condition'), sample.condition === 'ALTERADA' ? t('sampleDetail.condition.altered') : sample.condition === 'INALTERADA' ? t('sampleDetail.condition.unaltered') : null)}
          ${row(t('sampleDetail.field.depth'), sample.depthFrom != null || sample.depthTo != null ? t('sampleDetail.pdf.depthValue', { from: sample.depthFrom ?? '—', to: sample.depthTo ?? '—' }) : null)}
          ${row(t('sampleDetail.field.coordinates'), coords)}
        </table>
        <h2>${escapeHtml(t('sampleDetail.pdf.testsOfSample', { count: protos.length }))}</h2>
        <table><thead><tr><th>${escapeHtml(t('sampleDetail.pdf.colNumber'))}</th><th>${escapeHtml(t('sampleDetail.pdf.colCode'))}</th><th>${escapeHtml(t('sampleDetail.pdf.colType'))}</th><th>${escapeHtml(t('sampleDetail.pdf.colStatus'))}</th><th>${escapeHtml(t('sampleDetail.pdf.colDate'))}</th></tr></thead>
        <tbody>${ensayosRows || `<tr><td colspan="5">${escapeHtml(t('sampleDetail.pdf.noTests'))}</td></tr>`}</tbody></table>
        </body></html>`;
      const { uri } = await Print.printToFileAsync({ html, base64: false });
      if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: t('sampleDetail.pdf.sampleTitle', { code: sample.sampleCode }) });
    } catch (e: any) {
      Alert.alert(t('sampleDetail.alert.errorTitle'), e?.message ?? t('sampleDetail.alert.exportFailed'));
    } finally {
      setExporting(false);
    }
  };

  if (loading) return <View style={styles.container}><AppHeader title={t('sampleDetail.title')} subtitle={projectName} onBack={() => navigation.goBack()} /><View style={styles.center}><ActivityIndicator color={Colors.primary} /></View></View>;
  if (!sample) return <View style={styles.container}><AppHeader title={t('sampleDetail.title')} subtitle={projectName} onBack={() => navigation.goBack()} /><View style={styles.center}><Text style={styles.emptyText}>{t('sampleDetail.notFound')}</Text></View></View>;

  return (
    <View style={styles.container}>
      <AppHeader title={sample.sampleCode} subtitle={projectName} onBack={() => navigation.goBack()}
        rightContent={
          <TouchableOpacity onPress={exportPdf} disabled={exporting} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name={exporting ? 'hourglass-outline' : 'share-outline'} size={20} color={Colors.white} />
          </TouchableOpacity>
        } />
      <ScrollView contentContainerStyle={{ padding: 12, gap: 12 }}>
        {/* Datos generales — MISMO formato/estilo del Audit Page (título + QR + grid). */}
        <View style={styles.dossierHeader}>
          <View style={styles.dossierTopBar}>
            <View style={{ flex: 1 }}>
              <Text style={styles.dossierTitle}>{sample.sampleCode}</Text>
              <Text style={styles.dossierHint}>{projectName}</Text>
            </View>
            <View style={{ alignItems: 'center' }}>
              <QrCodeView value={buildSampleDeepLink(sample.sampleCode)} size={84} />
            </View>
          </View>
          <View style={styles.infoGrid}>
            {(() => {
              const cells: { label: string; value: string }[] = [
                { label: t('sampleDetail.field.date'), value: sample.sampleDate ?? '—' },
                { label: sample.sectorId ? t('sampleDetail.field.sector') : t('sampleDetail.field.location'), value: placeName },
              ];
              if (sample.materialType) cells.push({ label: t('sampleDetail.field.materialType'), value: sample.materialType });
              if (sample.condition) cells.push({ label: t('sampleDetail.field.condition'), value: sample.condition === 'ALTERADA' ? t('sampleDetail.condition.altered') : t('sampleDetail.condition.unaltered') });
              if (sample.depthFrom != null || sample.depthTo != null) cells.push({ label: t('sampleDetail.field.depthM'), value: `${sample.depthFrom ?? '—'} a ${sample.depthTo ?? '—'}` });
              if (sample.coordEast != null || sample.latitude != null) cells.push({ label: t('sampleDetail.field.coordinates'), value: `E:${sample.coordEast ?? '—'} N:${sample.coordNorth ?? '—'} Cota:${sample.coordElevation ?? '—'}` });
              if (sample.layerInfoJson) { try { const c = JSON.parse(sample.layerInfoJson)?.capa; if (c) cells.push({ label: t('sampleDetail.field.layer'), value: t('sampleDetail.layerValue', { value: c }) }); } catch { /* */ } }
              const rows: { label: string; value: string }[][] = [];
              for (let i = 0; i < cells.length; i += 2) rows.push(cells.slice(i, i + 2));
              return rows.map((r, ri) => (
                <View key={ri} style={styles.infoRow}>
                  {r.map((c, ci) => (
                    <View key={ci} style={styles.infoCell}>
                      <Text style={styles.infoLabel}>{c.label}</Text>
                      <Text style={styles.infoValue} numberOfLines={2}>{c.value}</Text>
                    </View>
                  ))}
                  {r.length === 1 ? <View style={[styles.infoCell, { backgroundColor: 'transparent' }]} /> : null}
                </View>
              ));
            })()}
          </View>
        </View>

        {/* Ensayos */}
        <Text style={styles.sectionTitle}>{t('sampleDetail.tests', { count: protos.length })}</Text>
        <TouchableOpacity style={styles.ghostBtn} onPress={() => setShowAdd(true)} activeOpacity={0.7}>
          <Ionicons name="add-circle-outline" size={18} color={Colors.primary} />
          <Text style={styles.ghostBtnText}>{t('sampleDetail.addTest')}</Text>
        </TouchableOpacity>
        {protos.length === 0 ? (
          <Text style={styles.emptyText}>{t('sampleDetail.noTests')}</Text>
        ) : protos.map(p => (
          <TouchableOpacity key={p.id} style={styles.protoCard} onPress={() => openProto(p)} activeOpacity={0.85}>
            <View style={{ flex: 1 }}>
              <Text style={styles.protoCode}>{p.protocolCode ?? p.protocolNumber ?? '—'}</Text>
              <Text style={styles.protoSub}>{tplName[p.templateId] ?? '—'} · {p.ensayoDate ?? '—'}</Text>
            </View>
            <View style={[styles.statusBadge, { backgroundColor: (STATUS_COLOR[p.status] ?? Colors.textMuted) + '22' }]}>
              <Text style={[styles.statusText, { color: STATUS_COLOR[p.status] ?? Colors.textMuted }]}>{STATUS_LABEL[p.status] ?? p.status}</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Modal añadir ensayo */}
      <Modal visible={showAdd} transparent animationType="fade" onRequestClose={() => setShowAdd(false)}>
        <View style={styles.modalBg}>
          <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={() => setShowAdd(false)} />
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{t('sampleDetail.modal.title')}</Text>
            <Text style={styles.fieldLabel}>{t('sampleDetail.modal.testType')}</Text>
            <ScrollView style={{ maxHeight: 240 }}>
              {templates.length === 0 ? <Text style={styles.emptyText}>{t('sampleDetail.modal.noTypes')}</Text> : templates.map(t => (
                <TouchableOpacity key={t.id} style={[styles.optionRow, selTpl === t.id && styles.optionRowOn]} onPress={() => setSelTpl(t.id)}>
                  <Text style={[styles.optionText, selTpl === t.id && { color: Colors.primary, fontWeight: '800' }]}>{t.idProtocolo ?? t.name}</Text>
                  {selTpl === t.id ? <Ionicons name="checkmark" size={16} color={Colors.primary} /> : null}
                </TouchableOpacity>
              ))}
            </ScrollView>
            <Text style={styles.fieldLabel}>{t('sampleDetail.modal.quantity')}</Text>
            <TextInput style={styles.input} value={countText} onChangeText={setCountText} keyboardType="number-pad" />
            <TouchableOpacity style={[styles.saveBtn, creating && { opacity: 0.5 }]} onPress={addEnsayo} disabled={creating}>
              <Text style={styles.saveBtnText}>{creating ? t('sampleDetail.modal.creating') : t('sampleDetail.modal.create')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.surface },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  emptyText: { color: Colors.textSecondary, fontSize: 14, textAlign: 'center', padding: 8 },
  sectionTitle: { fontSize: 14, fontWeight: '800', color: Colors.navy, marginTop: 4 },
  // ── Datos generales: mismo formato del Audit Page ──
  dossierHeader: { backgroundColor: Colors.white, borderRadius: Radius.md, padding: 14, borderWidth: 1, borderColor: Colors.border, ...Shadow.subtle, gap: 10 },
  dossierTopBar: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  dossierTitle: { fontSize: 18, fontWeight: '800', color: Colors.navy, letterSpacing: 0.3 },
  dossierHint: { fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
  infoGrid: { gap: 5 },
  infoRow: { flexDirection: 'row', gap: 5 },
  infoCell: { flex: 1, minWidth: 120, backgroundColor: '#f4f6f9', borderRadius: 6, paddingHorizontal: 10, paddingVertical: 6 },
  infoLabel: { fontSize: 9, fontWeight: '700', color: '#888', letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 2 },
  infoValue: { fontSize: 13, fontWeight: '600', color: Colors.navy },
  ghostBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 13, borderRadius: Radius.md, borderWidth: 1.5, borderColor: Colors.primary, backgroundColor: Colors.white },
  ghostBtnText: { color: Colors.primary, fontWeight: '800', fontSize: 15 },
  protoCard: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: Colors.white, borderRadius: Radius.md, padding: 12, borderWidth: 1, borderColor: Colors.border },
  protoCode: { fontSize: 14, fontWeight: '800', color: Colors.navy },
  protoSub: { fontSize: 11, color: Colors.textSecondary, marginTop: 2 },
  statusBadge: { paddingVertical: 3, paddingHorizontal: 8, borderRadius: 10 },
  statusText: { fontSize: 10, fontWeight: '800' },
  modalBg: { flex: 1, backgroundColor: 'rgba(14,33,61,0.55)', justifyContent: 'center', padding: 14 },
  modalCard: { backgroundColor: Colors.white, borderRadius: Radius.lg, padding: 16, gap: 8 },
  modalTitle: { fontSize: 16, fontWeight: '800', color: Colors.navy, marginBottom: 6 },
  fieldLabel: { fontSize: 12, fontWeight: '700', color: Colors.textSecondary, marginTop: 4 },
  input: { borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.sm, paddingHorizontal: 10, paddingVertical: 9, fontSize: 14, color: Colors.textPrimary },
  optionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: Colors.divider },
  optionRowOn: { backgroundColor: '#f5f8fd' },
  optionText: { fontSize: 14, color: Colors.textPrimary },
  saveBtn: { backgroundColor: Colors.success, paddingVertical: 12, borderRadius: Radius.md, alignItems: 'center', marginTop: 10 },
  saveBtnText: { color: Colors.white, fontWeight: '800', fontSize: 15 },
});
