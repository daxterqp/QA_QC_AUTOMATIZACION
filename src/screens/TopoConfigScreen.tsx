/**
 * TopoConfigScreen (móvil) — Configuración del módulo topográfico (pestaña propia,
 * se abre con el engranaje en la pantalla de Carga). Aquí vive TODO el detalle (la
 * config general de módulos solo deja el on/off): visualización GPS/topo (+ recuadro
 * de cobertura), tabla compacta de columnas, procesamiento, y el botón de subir Excel
 * (Fórmulas + Tablas Auxiliares, 2 hojas → requiere .xlsx).
 */
import React, { useCallback, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Q } from '@nozbe/watermelondb';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@navigation/types';
import AppHeader from '@components/AppHeader';
import { Colors, Radius } from '../theme/colors';
import { projectsCollection, labAuxTablesCollection, protocolsCollection } from '@db/index';
import { useAuth } from '@context/AuthContext';
import { parseFeatureFlagsJson, topoColumns, type ProjectFeatureFlags, type TopoColumn } from '@utils/featureFlags';
import { mergeAndSaveFeatureFlags } from '@services/SupabaseSyncService';
import { summarizeTopoCoverage, hasTopoData, type TopoCoverageItem } from '@utils/topoVisibility';
import { TopoColumnsEditor } from '@components/topo/TopoColumnsEditor';
import {
  pickAndImportTopoFormulas, TopoFormulasImportCancelled,
  type TopoFormulasImportSummary,
} from '@services/TopoFormulasImporter';

type Props = NativeStackScreenProps<RootStackParamList, 'TopoConfig'>;

interface AuxRow { id: string; name: string; columns: string[]; rowCount: number }

function CheckRow({ label, description, value, onToggle, disabled }: {
  label: string; description: string; value: boolean; onToggle: () => void; disabled?: boolean;
}) {
  return (
    <TouchableOpacity style={[styles.checkRow, value && styles.checkRowOn, disabled && { opacity: 0.5 }]} onPress={onToggle} disabled={disabled} activeOpacity={0.7}>
      <Ionicons name={value ? 'checkbox' : 'square-outline'} size={20} color={value ? Colors.primary : Colors.textMuted} style={{ marginTop: 1 }} />
      <View style={{ flex: 1 }}>
        <Text style={[styles.checkLabel, value && { color: Colors.primary }]}>{label}</Text>
        <Text style={styles.checkDesc}>{description}</Text>
      </View>
    </TouchableOpacity>
  );
}

export default function TopoConfigScreen({ navigation, route }: Props) {
  const { projectId, projectName } = route.params;
  const insets = useSafeAreaInsets();
  const { currentUser } = useAuth();
  const canEdit = currentUser?.role === 'CREATOR';

  const [flags, setFlags] = useState<ProjectFeatureFlags | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [auxTables, setAuxTables] = useState<AuxRow[]>([]);
  const [topoItems, setTopoItems] = useState<TopoCoverageItem[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<TopoFormulasImportSummary | null>(null);

  const loadData = useCallback(async () => {
    const proj: any = await projectsCollection.find(projectId).catch(() => null);
    const ff = parseFeatureFlagsJson(proj?.featureFlags);
    setFlags(ff);
    setDirty(false);
    const aux = await labAuxTablesCollection.query(Q.where('project_id', projectId)).fetch().catch(() => [] as any[]);
    setAuxTables((aux as any[]).map((t) => {
      let columns: string[] = []; let rowCount = 0;
      try { columns = JSON.parse(t.columnsJson || '[]'); } catch { /* */ }
      try { rowCount = (JSON.parse(t.rowsJson || '[]') as unknown[]).length; } catch { /* */ }
      return { id: t.id, name: t.name ?? t.groupKey, columns, rowCount };
    }));
    const protos = await protocolsCollection.query(Q.where('project_id', projectId)).fetch().catch(() => [] as any[]);
    setTopoItems((protos as any[]).map((p) => ({
      id: p.id,
      code: (p.protocolCode ?? p.externalId ?? p.id) as string,
      hasTopo: hasTopoData({ east: p.topoCoordEast, north: p.topoCoordNorth, elevation: p.topoCoordElevation, valuesJson: p.topoValuesJson }),
      hasGps: p.latitude != null && p.longitude != null,
    })));
  }, [projectId]);

  // Carga inicial. Al volver de otra pantalla NO recargamos si hay cambios sin guardar.
  useFocusEffect(useCallback(() => { if (!dirty) loadData(); }, [loadData, dirty]));

  const setFlag = <K extends keyof ProjectFeatureFlags>(key: K, value: ProjectFeatureFlags[K]) => {
    setFlags((prev) => (prev ? { ...prev, [key]: value } : prev));
    setDirty(true);
  };
  const toggle = (key: keyof ProjectFeatureFlags) => setFlag(key, !(flags?.[key]) as never);

  // Cobertura recalculada EN VIVO con los flags actuales (sin re-fetch de protocolos).
  const coverage = (flags && topoItems) ? summarizeTopoCoverage(topoItems, flags) : null;

  const save = async () => {
    if (!flags || !canEdit) return;
    setSaving(true);
    try {
      await mergeAndSaveFeatureFlags(projectId, {
        topo_replace_gps: flags.topo_replace_gps,
        topo_keep_gps_fallback: flags.topo_keep_gps_fallback,
        topo_columns: topoColumns(flags),
      });
      setDirty(false);
    } catch (e) { Alert.alert('Error al guardar', (e as Error).message); }
    finally { setSaving(false); }
  };

  const onUpload = async () => {
    if (!canEdit || !flags) return;
    setBusy(true); setResult(null);
    try {
      // Guarda los cambios locales primero (para que el import los tome como base).
      if (dirty) {
        await mergeAndSaveFeatureFlags(projectId, {
          topo_replace_gps: flags.topo_replace_gps,
          topo_keep_gps_fallback: flags.topo_keep_gps_fallback,
          topo_columns: topoColumns(flags),
        });
        setDirty(false);
      }
      const res = await pickAndImportTopoFormulas(projectId);
      setResult(res);
      await loadData();
    } catch (e) {
      if (!(e instanceof TopoFormulasImportCancelled)) Alert.alert('Error al importar', (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={[styles.container, { paddingBottom: insets.bottom }]}>
      <AppHeader title="Configuración topográfica" subtitle={projectName} onBack={() => navigation.goBack()} />
      {!flags ? (
        <View style={styles.center}><ActivityIndicator size="large" color={Colors.primary} /></View>
      ) : (
        <>
          <ScrollView contentContainerStyle={styles.scroll}>
            {/* Coordenadas en la ficha */}
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Coordenadas en la ficha</Text>
              <CheckRow label="Reemplazar coordenadas GPS" description="En las fichas se oculta la tarjeta GPS y solo se usan topográficas."
                value={!!flags.topo_replace_gps} onToggle={() => toggle('topo_replace_gps')} disabled={!canEdit} />
              {flags.topo_replace_gps && (
                <CheckRow label="Seguir usando GPS cuando sea posible" description="Para ensayos sin topo, usar la tarjeta GPS como respaldo."
                  value={!!flags.topo_keep_gps_fallback} onToggle={() => toggle('topo_keep_gps_fallback')} disabled={!canEdit} />
              )}
              {flags.topo_replace_gps && flags.topo_keep_gps_fallback && coverage && (
                <View style={styles.alert}>
                  <Ionicons name="warning-outline" size={16} color="#B45309" style={{ marginTop: 1 }} />
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={styles.alertText}><Text style={styles.alertBold}>{coverage.withoutTopo.length}</Text> de <Text style={styles.alertBold}>{coverage.total}</Text> ensayos no tienen coordenadas topográficas.</Text>
                    <Text style={styles.alertText}><Text style={styles.alertBold}>{coverage.usingGps.length}</Text> usarán las coordenadas GPS como respaldo.</Text>
                    {coverage.withoutTopo.length > coverage.usingGps.length && (
                      <Text style={[styles.alertText, { color: '#92400E' }]}>{coverage.withoutTopo.length - coverage.usingGps.length} quedarán sin ninguna coordenada.</Text>
                    )}
                  </View>
                </View>
              )}
            </View>

            {/* Tabla de columnas */}
            <View style={styles.card}>
              <TopoColumnsEditor columns={flags.topo_columns} onChange={(cols) => setFlag('topo_columns', cols)} />
            </View>

            {/* Fórmulas + Tablas auxiliares (el procesamiento siempre está activo:
                si no se usa ninguna fórmula/área, simplemente no calcula nada). */}
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Fórmulas y tablas auxiliares</Text>
              <View style={{ gap: 10, marginTop: 4 }}>
                <Text style={styles.help}>
                  Sube un <Text style={styles.bold}>.xlsx</Text> con dos hojas (un .csv solo tiene una).{' '}
                  <Text style={styles.bold}>Hoja 1 «Fórmulas»</Text>: filas Columna | Fórmula.{' '}
                  <Text style={styles.bold}>Hoja 2 «Tablas Auxiliares»</Text>: tabla-&lt;nombre&gt; | columna | valores…
                </Text>
                <TouchableOpacity style={[styles.uploadBtn, (!canEdit || busy) && { opacity: 0.5 }]} onPress={onUpload} disabled={!canEdit || busy}>
                  {busy ? <ActivityIndicator size="small" color={Colors.white} /> : <Ionicons name="cloud-upload-outline" size={16} color={Colors.white} />}
                  <Text style={styles.uploadText}>{busy ? 'Procesando…' : 'Subir Excel (Fórmulas + Tablas)'}</Text>
                </TouchableOpacity>
                {result && (
                  <View style={styles.resultBox}>
                    <Text style={styles.resultTitle}>Importación completada</Text>
                    <Text style={styles.resultLine}>Fórmulas: {result.formulas.applied} asignadas · {result.formulas.created} nuevas · Tablas: {result.auxTables.upserted}</Text>
                    {result.warnings.map((w, i) => <Text key={i} style={styles.warn}>⚠ {w}</Text>)}
                  </View>
                )}
                <Text style={styles.subHead}>Tablas auxiliares</Text>
                {auxTables.length === 0 ? (
                  <Text style={styles.empty}>Ninguna cargada.</Text>
                ) : auxTables.map((t) => (
                  <View key={t.id} style={styles.auxRow}>
                    <Text style={styles.auxName}>{t.name}</Text>
                    <Text style={styles.auxMeta}>{t.columns.join(' · ')} — {t.rowCount} fila{t.rowCount !== 1 ? 's' : ''}</Text>
                  </View>
                ))}
              </View>
            </View>
          </ScrollView>

          {/* Footer guardar */}
          {canEdit && (
            <View style={[styles.footer, { paddingBottom: 10 + insets.bottom }]}>
              <TouchableOpacity style={[styles.saveBtn, (!dirty || saving) && { opacity: 0.5 }]} onPress={save} disabled={!dirty || saving}>
                {saving ? <ActivityIndicator size="small" color={Colors.white} /> : <Ionicons name="save-outline" size={16} color={Colors.white} />}
                <Text style={styles.saveText}>{saving ? 'Guardando…' : dirty ? 'Guardar configuración' : 'Guardado'}</Text>
              </TouchableOpacity>
            </View>
          )}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.surface },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll: { padding: 12, gap: 12, paddingBottom: 24 },
  card: { backgroundColor: Colors.white, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border, padding: 14, gap: 8 },
  cardTitle: { fontSize: 15, fontWeight: '800', color: Colors.navy },
  checkRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.md, padding: 10, backgroundColor: Colors.white },
  checkRowOn: { backgroundColor: Colors.primary + '0D', borderColor: Colors.primary + '4D' },
  checkLabel: { fontSize: 13, fontWeight: '700', color: Colors.navy },
  checkDesc: { fontSize: 11, color: Colors.textMuted, marginTop: 1, lineHeight: 15 },
  alert: { flexDirection: 'row', gap: 8, backgroundColor: '#FFFBEB', borderColor: '#FCD34D', borderWidth: 1, borderRadius: Radius.md, padding: 10 },
  alertText: { fontSize: 11, color: '#78350F', lineHeight: 15 },
  alertBold: { fontWeight: '800', color: '#78350F' },
  help: { fontSize: 12, color: Colors.textSecondary, lineHeight: 17 },
  bold: { fontWeight: '800', color: Colors.navy },
  uploadBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: Colors.primary, borderRadius: Radius.md, paddingVertical: 11, alignSelf: 'flex-start', paddingHorizontal: 16 },
  uploadText: { color: Colors.white, fontWeight: '800', fontSize: 13 },
  resultBox: { backgroundColor: '#ECFDF5', borderRadius: Radius.md, borderWidth: 1, borderColor: '#6EE7B7', padding: 10, gap: 3 },
  resultTitle: { fontSize: 13, fontWeight: '800', color: '#047857' },
  resultLine: { fontSize: 12, color: '#065F46' },
  warn: { fontSize: 11, color: '#B45309' },
  subHead: { fontSize: 11, fontWeight: '800', color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 2 },
  empty: { fontSize: 12, color: Colors.textMuted },
  auxRow: { paddingVertical: 4, borderTopWidth: 1, borderTopColor: Colors.border },
  auxName: { fontSize: 13, fontWeight: '700', color: Colors.navy },
  auxMeta: { fontSize: 11, color: Colors.textMuted, marginTop: 1 },
  footer: { borderTopWidth: 1, borderTopColor: Colors.border, backgroundColor: Colors.white, paddingHorizontal: 12, paddingTop: 10, alignItems: 'flex-end' },
  saveBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: Colors.primary, borderRadius: Radius.md, paddingVertical: 11, paddingHorizontal: 20 },
  saveText: { color: Colors.white, fontWeight: '800', fontSize: 14 },
});
