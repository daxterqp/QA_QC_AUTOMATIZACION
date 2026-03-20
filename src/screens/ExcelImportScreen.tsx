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
import { Colors, Radius, Shadow } from '../theme/colors';

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
  const { importState, startImport, reset } = useExcelImport(projectId, projectName);

  const isActive =
    importState.status === 'picking' || importState.status === 'importing';

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Cargar Excel Maestro</Text>
        <TouchableOpacity onPress={onClose} disabled={isActive} style={styles.closeBtn}>
          <Text style={styles.closeBtnText}>Cerrar</Text>
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
            <ActivityIndicator size="large" color={Colors.primary} />
            <Text style={styles.stateText}>Seleccionando archivo...</Text>
          </View>
        )}

        {/* Estado: importando */}
        {importState.status === 'importing' && (
          <View style={styles.stateBox}>
            <ActivityIndicator size="large" color={Colors.primary} />
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

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.surface },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: 52, paddingBottom: 16,
    backgroundColor: Colors.navy,
  },
  headerTitle: { fontSize: 14, fontWeight: '700', color: Colors.white, letterSpacing: 0.5 },
  closeBtn: { padding: 4 },
  closeBtnText: { fontSize: 13, color: Colors.light, fontWeight: '600' },

  body: { padding: 16, gap: 16 },

  projectBadge: { backgroundColor: Colors.light, borderRadius: Radius.md, padding: 14 },
  projectBadgeLabel: { fontSize: 10, color: Colors.primary, fontWeight: '700', letterSpacing: 1 },
  projectBadgeName: { fontSize: 14, fontWeight: '700', color: Colors.navy, marginTop: 2 },

  section: { backgroundColor: Colors.white, borderRadius: Radius.md, padding: 16, gap: 8, ...Shadow.subtle },
  sectionTitle: { fontSize: 12, fontWeight: '700', color: Colors.navy, marginBottom: 4, letterSpacing: 0.5 },
  columnRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  columnBullet: { color: Colors.primary, fontSize: 10 },
  columnName: { fontSize: 13, color: Colors.textPrimary },
  hint: { marginTop: 8, fontSize: 12, color: Colors.textMuted, lineHeight: 18 },

  stateBox: { backgroundColor: Colors.white, borderRadius: Radius.lg, padding: 24, alignItems: 'center', gap: 12, ...Shadow.subtle },
  stateSuccess: { borderLeftWidth: 4, borderLeftColor: Colors.success },
  stateError: { borderLeftWidth: 4, borderLeftColor: Colors.danger },
  stateTitle: { fontSize: 15, fontWeight: '700', color: Colors.navy },
  stateText: { fontSize: 13, color: Colors.textSecondary, textAlign: 'center' },
  statStat: { fontSize: 20, fontWeight: '700', color: Colors.primary },

  progressBar: { width: '100%', height: 6, backgroundColor: Colors.border, borderRadius: 3, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: Colors.primary, borderRadius: 3 },

  errorMessage: { fontSize: 13, color: Colors.danger, textAlign: 'center', lineHeight: 20 },
  missingCols: { alignSelf: 'stretch', backgroundColor: '#fdecea', borderRadius: Radius.sm, padding: 12, gap: 4 },
  missingColsLabel: { fontSize: 11, fontWeight: '700', color: Colors.danger, marginBottom: 4 },
  missingColItem: { fontSize: 12, color: Colors.danger },

  footer: { padding: 16, backgroundColor: Colors.white, borderTopWidth: 1, borderTopColor: Colors.divider },
  btn: { paddingHorizontal: 24, paddingVertical: 13, borderRadius: Radius.md, alignItems: 'center' },
  btnPrimary: { backgroundColor: Colors.primary },
  btnSecondary: { backgroundColor: Colors.secondary },
  btnFull: { width: '100%' },
  btnText: { color: Colors.white, fontWeight: '700', fontSize: 13, letterSpacing: 0.5 },
});
