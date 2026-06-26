/**
 * TopoFormulasScreen (móvil) — Administrar Fórmulas y Tablas Auxiliares del módulo
 * topográfico. Sube un .xlsx con dos hojas ("Fórmulas" y "Tablas Auxiliares") vía
 * DocumentPicker; las fórmulas se asignan a las columnas de config por nombre y las
 * tablas auxiliares se upsertean en lab_aux_tables. Espejo de la página web.
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
import { projectsCollection, labAuxTablesCollection } from '@db/index';
import { useAuth } from '@context/AuthContext';
import { parseFeatureFlagsJson, topoColumns, type TopoColumn } from '@utils/featureFlags';
import {
  pickAndImportTopoFormulas, TopoFormulasImportCancelled,
  type TopoFormulasImportSummary,
} from '@services/TopoFormulasImporter';

type Props = NativeStackScreenProps<RootStackParamList, 'TopoFormulas'>;

interface AuxRow { id: string; name: string; columns: string[]; rowCount: number }

export default function TopoFormulasScreen({ navigation, route }: Props) {
  const { projectId, projectName } = route.params;
  const insets = useSafeAreaInsets();
  const { currentUser } = useAuth();
  const canEdit = currentUser?.role === 'CREATOR';

  const [formulaCols, setFormulaCols] = useState<TopoColumn[]>([]);
  const [auxTables, setAuxTables] = useState<AuxRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<TopoFormulasImportSummary | null>(null);

  const loadData = useCallback(async () => {
    const proj: any = await projectsCollection.find(projectId).catch(() => null);
    const flags = parseFeatureFlagsJson(proj?.featureFlags);
    setFormulaCols(topoColumns(flags).filter((c) => c.source === 'formula'));
    const aux = await labAuxTablesCollection.query(Q.where('project_id', projectId)).fetch().catch(() => [] as any[]);
    setAuxTables((aux as any[]).map((t) => {
      let columns: string[] = []; let rowCount = 0;
      try { columns = JSON.parse(t.columnsJson || '[]'); } catch { /* */ }
      try { rowCount = (JSON.parse(t.rowsJson || '[]') as unknown[]).length; } catch { /* */ }
      return { id: t.id, name: t.name ?? t.groupKey, columns, rowCount };
    }));
  }, [projectId]);

  useFocusEffect(useCallback(() => { loadData(); }, [loadData]));

  const onUpload = async () => {
    if (!canEdit) { Alert.alert('Permiso', 'Solo el rol CREATOR puede subir fórmulas/tablas.'); return; }
    setBusy(true); setResult(null);
    try {
      const res = await pickAndImportTopoFormulas(projectId);
      setResult(res);
      await loadData();
    } catch (e) {
      if (!(e instanceof TopoFormulasImportCancelled)) {
        Alert.alert('Error al importar', (e as Error).message);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={[styles.container, { paddingBottom: insets.bottom }]}>
      <AppHeader title="Fórmulas y Tablas Auxiliares" subtitle={projectName} onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={styles.scroll}>
        {/* Subir Excel */}
        <View style={styles.card}>
          <View style={styles.cardHead}>
            <Ionicons name="cloud-upload-outline" size={18} color={Colors.primary} />
            <Text style={styles.cardTitle}>Subir Excel (.xlsx)</Text>
          </View>
          <Text style={styles.help}>
            Un solo archivo con dos hojas. <Text style={styles.bold}>Fórmulas</Text>: filas Columna | Fórmula (la
            fórmula se asigna a la columna por nombre; usa BUSCAR(tabla, #1A, &quot;Columna&quot;)).{' '}
            <Text style={styles.bold}>Tablas Auxiliares</Text>: filas tabla-&lt;nombre&gt; | columna | valor1 | valor2 …
          </Text>
          <TouchableOpacity style={[styles.btn, (!canEdit || busy) && styles.btnDisabled]} onPress={onUpload} disabled={!canEdit || busy}>
            {busy ? <ActivityIndicator size="small" color={Colors.white} /> : <Ionicons name="cloud-upload-outline" size={16} color={Colors.white} />}
            <Text style={styles.btnText}>{busy ? 'Procesando…' : 'Seleccionar archivo'}</Text>
          </TouchableOpacity>
          {!canEdit && <Text style={styles.warn}>Solo el rol CREATOR puede subir fórmulas/tablas.</Text>}
        </View>

        {/* Resultado */}
        {result && (
          <View style={styles.resultBox}>
            <View style={styles.cardHead}>
              <Ionicons name="checkmark-circle" size={16} color="#047857" />
              <Text style={styles.resultTitle}>Importación completada</Text>
            </View>
            <Text style={styles.resultLine}>Fórmulas asignadas: <Text style={styles.bold}>{result.formulas.applied}</Text> · nuevas: <Text style={styles.bold}>{result.formulas.created}</Text></Text>
            <Text style={styles.resultLine}>Tablas auxiliares: <Text style={styles.bold}>{result.auxTables.upserted}</Text>{result.auxTables.names.length > 0 ? ` (${result.auxTables.names.join(', ')})` : ''}</Text>
            {result.warnings.map((w, i) => <Text key={i} style={styles.warn}>⚠ {w}</Text>)}
          </View>
        )}

        {/* Columnas con fórmula */}
        <View style={styles.card}>
          <View style={styles.cardHead}>
            <Ionicons name="calculator-outline" size={18} color={Colors.primary} />
            <Text style={styles.cardTitle}>Columnas con fórmula</Text>
          </View>
          {formulaCols.length === 0 ? (
            <Text style={styles.empty}>Ninguna columna usa fórmula todavía.</Text>
          ) : formulaCols.map((c) => (
            <View key={c.id} style={styles.row}>
              <Text style={styles.rowName}>{c.name}</Text>
              <Text style={styles.rowCode} numberOfLines={1}>{c.formula}</Text>
            </View>
          ))}
        </View>

        {/* Tablas auxiliares */}
        <View style={styles.card}>
          <View style={styles.cardHead}>
            <Ionicons name="grid-outline" size={18} color={Colors.primary} />
            <Text style={styles.cardTitle}>Tablas auxiliares</Text>
          </View>
          {auxTables.length === 0 ? (
            <Text style={styles.empty}>No hay tablas auxiliares cargadas.</Text>
          ) : auxTables.map((t) => (
            <View key={t.id} style={styles.auxRow}>
              <Text style={styles.rowName}>{t.name}</Text>
              <Text style={styles.auxMeta}>{t.columns.join(' · ')} — {t.rowCount} fila{t.rowCount !== 1 ? 's' : ''}</Text>
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.surface },
  scroll: { padding: 12, gap: 12 },
  card: { backgroundColor: Colors.white, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border, padding: 14, gap: 8 },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cardTitle: { fontSize: 15, fontWeight: '800', color: Colors.navy },
  help: { fontSize: 12, color: Colors.textSecondary, lineHeight: 17 },
  bold: { fontWeight: '800', color: Colors.navy },
  btn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: Colors.primary, borderRadius: Radius.md, paddingVertical: 11, marginTop: 4 },
  btnDisabled: { opacity: 0.5 },
  btnText: { color: Colors.white, fontWeight: '800', fontSize: 14 },
  warn: { fontSize: 11, color: '#B45309', marginTop: 2 },
  empty: { fontSize: 12, color: Colors.textMuted },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, paddingVertical: 6, borderTopWidth: 1, borderTopColor: Colors.border },
  rowName: { fontSize: 13, fontWeight: '700', color: Colors.navy, flexShrink: 0, maxWidth: '45%' },
  rowCode: { fontSize: 11, color: Colors.textMuted, fontFamily: undefined, flex: 1, textAlign: 'right' },
  auxRow: { paddingVertical: 6, borderTopWidth: 1, borderTopColor: Colors.border },
  auxMeta: { fontSize: 11, color: Colors.textMuted, marginTop: 2 },
  resultBox: { backgroundColor: '#ECFDF5', borderRadius: Radius.md, borderWidth: 1, borderColor: '#6EE7B7', padding: 12, gap: 4 },
  resultTitle: { fontSize: 13, fontWeight: '800', color: '#047857' },
  resultLine: { fontSize: 12, color: '#065F46' },
});
