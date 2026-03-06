import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { useExcelImport } from '@hooks/useExcelImport';
import { REQUIRED_COLUMNS } from '@services/ExcelImporter';

interface ExcelImportScreenProps {
  projectId: string;
  projectName: string;
  onClose: () => void;
  /** Callback al importar exitosamente — para navegar a la lista de protocolos */
  onImportSuccess?: () => void;
}

/**
 * Pantalla de importacion del Excel maestro.
 *
 * Permite al usuario:
 * 1. Ver que columnas requiere el Excel
 * 2. Seleccionar el archivo .xlsx desde el dispositivo
 * 3. Ver progreso de importacion en tiempo real
 * 4. Ver resumen del resultado o el error detallado
 */
export default function ExcelImportScreen({
  projectId,
  projectName,
  onClose,
  onImportSuccess,
}: ExcelImportScreenProps) {
  const { importState, startImport, reset } = useExcelImport(projectId);

  const isActive =
    importState.status === 'picking' || importState.status === 'importing';

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Cargar Excel Maestro</Text>
        <TouchableOpacity onPress={onClose} disabled={isActive} style={styles.closeBtn}>
          <Text style={styles.closeBtnText}>✕</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        {/* Info del proyecto */}
        <View style={styles.projectBadge}>
          <Text style={styles.projectBadgeLabel}>Proyecto</Text>
          <Text style={styles.projectBadgeName}>{projectName}</Text>
        </View>

        {/* Instrucciones / columnas requeridas */}
        {importState.status === 'idle' && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Columnas requeridas en el Excel</Text>
            {REQUIRED_COLUMNS.map((col: string) => (
              <View key={col} style={styles.columnRow}>
                <Text style={styles.columnBullet}>●</Text>
                <Text style={styles.columnName}>{col}</Text>
              </View>
            ))}
            <Text style={styles.hint}>
              La columna "Protocolo" agrupa las actividades. Cada valor unico
              genera un protocolo independiente en el sistema.
            </Text>
          </View>
        )}

        {/* Estado: picking */}
        {importState.status === 'picking' && (
          <View style={styles.stateBox}>
            <ActivityIndicator size="large" color="#1a73e8" />
            <Text style={styles.stateText}>Seleccionando archivo...</Text>
          </View>
        )}

        {/* Estado: importando */}
        {importState.status === 'importing' && (
          <View style={styles.stateBox}>
            <ActivityIndicator size="large" color="#1a73e8" />
            <Text style={styles.stateText}>
              Importando protocolo {importState.current} de {importState.total}...
            </Text>
            <View style={styles.progressBar}>
              <View
                style={[
                  styles.progressFill,
                  { width: `${(importState.current / importState.total) * 100}%` },
                ]}
              />
            </View>
          </View>
        )}

        {/* Estado: exito */}
        {importState.status === 'success' && (
          <View style={[styles.stateBox, styles.stateSuccess]}>
            <Text style={styles.stateIcon}>✓</Text>
            <Text style={styles.stateTitle}>Importacion exitosa</Text>
            <Text style={styles.statStat}>
              {importState.totalProtocols} protocolo{importState.totalProtocols !== 1 ? 's' : ''}
            </Text>
            <Text style={styles.statStat}>
              {importState.totalActivities} actividade{importState.totalActivities !== 1 ? 's' : ''}
            </Text>
            <TouchableOpacity
              style={[styles.btn, styles.btnPrimary]}
              onPress={() => { reset(); onImportSuccess?.(); }}
            >
              <Text style={styles.btnText}>Ver protocolos</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.btn, styles.btnSecondary]} onPress={reset}>
              <Text style={styles.btnText}>Cargar otro archivo</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Estado: error */}
        {importState.status === 'error' && (
          <View style={[styles.stateBox, styles.stateError]}>
            <Text style={styles.stateIcon}>✕</Text>
            <Text style={styles.stateTitle}>Error al importar</Text>
            <Text style={styles.errorMessage}>{importState.message}</Text>
            {importState.missingColumns && importState.missingColumns.length > 0 && (
              <View style={styles.missingCols}>
                <Text style={styles.missingColsLabel}>Columnas faltantes:</Text>
                {importState.missingColumns.map((col: string) => (
                  <Text key={col} style={styles.missingColItem}>• {col}</Text>
                ))}
              </View>
            )}
            <TouchableOpacity style={[styles.btn, styles.btnPrimary]} onPress={reset}>
              <Text style={styles.btnText}>Intentar de nuevo</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>

      {/* Boton principal */}
      {(importState.status === 'idle') && (
        <View style={styles.footer}>
          <TouchableOpacity style={[styles.btn, styles.btnPrimary, styles.btnFull]} onPress={startImport}>
            <Text style={styles.btnText}>Seleccionar archivo Excel</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

// ─── Estilos ──────────────────────────────────────────────────────────────────

const BLUE = '#1a73e8';
const GREEN = '#1e8e3e';
const RED = '#d93025';

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8f9fa' },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 56,
    paddingBottom: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#1a1a2e' },
  closeBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: '#f1f3f4',
    alignItems: 'center', justifyContent: 'center',
  },
  closeBtnText: { fontSize: 16, color: '#555' },

  body: { padding: 20, gap: 16 },

  projectBadge: {
    backgroundColor: '#e8f0fe',
    borderRadius: 10,
    padding: 14,
  },
  projectBadgeLabel: { fontSize: 11, color: BLUE, fontWeight: '600', textTransform: 'uppercase' },
  projectBadgeName: { fontSize: 16, fontWeight: '700', color: '#1a1a2e', marginTop: 2 },

  section: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 16,
    gap: 8,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: '#333', marginBottom: 4 },
  columnRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  columnBullet: { color: BLUE, fontSize: 10 },
  columnName: { fontSize: 14, color: '#222', fontFamily: 'monospace' },
  hint: {
    marginTop: 8,
    fontSize: 12,
    color: '#777',
    lineHeight: 18,
  },

  stateBox: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 24,
    alignItems: 'center',
    gap: 12,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  stateSuccess: { borderLeftWidth: 4, borderLeftColor: GREEN },
  stateError: { borderLeftWidth: 4, borderLeftColor: RED },
  stateIcon: { fontSize: 40 },
  stateTitle: { fontSize: 18, fontWeight: '700', color: '#1a1a2e' },
  stateText: { fontSize: 15, color: '#555', textAlign: 'center' },
  statStat: { fontSize: 22, fontWeight: '700', color: BLUE },

  progressBar: {
    width: '100%', height: 6, backgroundColor: '#e0e0e0', borderRadius: 3, overflow: 'hidden',
  },
  progressFill: { height: '100%', backgroundColor: BLUE, borderRadius: 3 },

  errorMessage: { fontSize: 14, color: RED, textAlign: 'center', lineHeight: 20 },
  missingCols: { alignSelf: 'stretch', backgroundColor: '#fce8e6', borderRadius: 8, padding: 12, gap: 4 },
  missingColsLabel: { fontSize: 12, fontWeight: '700', color: RED, marginBottom: 4 },
  missingColItem: { fontSize: 13, color: '#c5221f', fontFamily: 'monospace' },

  footer: {
    padding: 20,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
  },
  btn: {
    paddingHorizontal: 24,
    paddingVertical: 13,
    borderRadius: 8,
    alignItems: 'center',
  },
  btnPrimary: { backgroundColor: BLUE },
  btnSecondary: { backgroundColor: '#5f6368' },
  btnFull: { width: '100%' },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});
