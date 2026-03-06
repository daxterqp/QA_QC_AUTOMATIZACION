import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { useLocationsImport } from '@hooks/useLocationsImport';
import { LOCATIONS_REQUIRED_COLUMNS } from '@services/ExcelLocationsImporter';

interface LocationsImportScreenProps {
  projectId: string;
  projectName: string;
  onClose: () => void;
  onImportSuccess?: () => void;
}

/**
 * Pantalla de importacion del Excel de Ubicaciones.
 *
 * Permite cargar la lista de ubicaciones con sus planos de referencia,
 * que luego aparecen como lista desplegable al crear un protocolo en campo.
 *
 * Re-importar el mismo Excel es seguro: las ubicaciones duplicadas
 * (mismo nombre en el mismo proyecto) se omiten automaticamente.
 */
export default function LocationsImportScreen({
  projectId,
  projectName,
  onClose,
  onImportSuccess,
}: LocationsImportScreenProps) {
  const { importState, startImport, reset } = useLocationsImport(projectId);

  const isActive = importState.status === 'picking' || importState.status === 'importing';

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Cargar Ubicaciones</Text>
          <Text style={styles.headerSub}>Excel de Ubicaciones y Planos</Text>
        </View>
        <TouchableOpacity onPress={onClose} disabled={isActive} style={styles.closeBtn}>
          <Text style={styles.closeBtnText}>✕</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        {/* Badge del proyecto */}
        <View style={styles.projectBadge}>
          <Text style={styles.projectBadgeLabel}>Proyecto</Text>
          <Text style={styles.projectBadgeName}>{projectName}</Text>
        </View>

        {/* Instrucciones */}
        {importState.status === 'idle' && (
          <>
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Columnas requeridas</Text>
              {LOCATIONS_REQUIRED_COLUMNS.map((col: string) => (
                <View key={col} style={styles.columnRow}>
                  <Text style={styles.columnBullet}>●</Text>
                  <Text style={styles.columnName}>{col}</Text>
                </View>
              ))}
            </View>

            {/* Ejemplo visual */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Ejemplo de estructura</Text>
              <View style={styles.tableExample}>
                <View style={styles.tableHeader}>
                  <Text style={styles.tableHeaderCell}>Ubicación</Text>
                  <Text style={styles.tableHeaderCell}>PLANO DE REFERENCIA</Text>
                </View>
                {[
                  ['Cocina 1- Piso 1', 'Plano_Cocina_P1'],
                  ['Sala 2- Piso 1', 'Plano_Sala_P1'],
                  ['Dormitorio 3- Piso 2', 'Plano_Dorm_P2'],
                ].map(([ub, plano]) => (
                  <View key={ub} style={styles.tableRow}>
                    <Text style={styles.tableCell}>{ub}</Text>
                    <Text style={styles.tableCell}>{plano}</Text>
                  </View>
                ))}
              </View>
              <Text style={styles.hint}>
                Las ubicaciones cargadas apareceran como lista desplegable al
                crear o asignar un protocolo en campo.
              </Text>
            </View>
          </>
        )}

        {/* Estado: picking / importing */}
        {(importState.status === 'picking' || importState.status === 'importing') && (
          <View style={styles.stateBox}>
            <ActivityIndicator size="large" color={BLUE} />
            <Text style={styles.stateText}>
              {importState.status === 'picking'
                ? 'Seleccionando archivo...'
                : 'Importando ubicaciones...'}
            </Text>
          </View>
        )}

        {/* Estado: exito */}
        {importState.status === 'success' && (
          <View style={[styles.stateBox, styles.stateSuccess]}>
            <Text style={styles.stateIcon}>✓</Text>
            <Text style={styles.stateTitle}>Importacion exitosa</Text>
            <Text style={styles.statNumber}>{importState.totalLocations}</Text>
            <Text style={styles.statLabel}>
              ubicacion{importState.totalLocations !== 1 ? 'es' : ''} agregada{importState.totalLocations !== 1 ? 's' : ''}
            </Text>
            <Text style={styles.hint}>
              Las duplicadas fueron omitidas automaticamente.
            </Text>
            <TouchableOpacity
              style={[styles.btn, styles.btnPrimary]}
              onPress={() => { reset(); onImportSuccess?.(); }}
            >
              <Text style={styles.btnText}>Ver ubicaciones</Text>
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
      {importState.status === 'idle' && (
        <View style={styles.footer}>
          <TouchableOpacity
            style={[styles.btn, styles.btnPrimary, styles.btnFull]}
            onPress={startImport}
          >
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
  headerSub: { fontSize: 12, color: '#777', marginTop: 2 },
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
  hint: { fontSize: 12, color: '#777', lineHeight: 18, marginTop: 4 },

  // Tabla ejemplo
  tableExample: {
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 6,
    overflow: 'hidden',
  },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: '#f1f3f4',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  tableHeaderCell: {
    flex: 1,
    padding: 8,
    fontSize: 11,
    fontWeight: '700',
    color: '#333',
  },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  tableCell: {
    flex: 1,
    padding: 8,
    fontSize: 12,
    color: '#555',
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
  statNumber: { fontSize: 40, fontWeight: '800', color: BLUE },
  statLabel: { fontSize: 16, color: '#555' },

  errorMessage: { fontSize: 14, color: RED, textAlign: 'center', lineHeight: 20 },
  missingCols: {
    alignSelf: 'stretch', backgroundColor: '#fce8e6',
    borderRadius: 8, padding: 12, gap: 4,
  },
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
