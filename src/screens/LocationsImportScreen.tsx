import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AppHeader from '@components/AppHeader';
import { useLocationsImport } from '@hooks/useLocationsImport';
import { LOCATIONS_REQUIRED_COLUMNS } from '@services/ExcelLocationsImporter';
import { Colors, Radius, Shadow } from '../theme/colors';

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
  const { importState, startImport, reset } = useLocationsImport(projectId, projectName);

  const isActive = importState.status === 'picking' || importState.status === 'importing';

  return (
    <View style={styles.container}>
      <AppHeader
        title="Cargar Ubicaciones"
        subtitle={projectName}
        rightContent={
          <TouchableOpacity onPress={onClose}>
            <Ionicons name="close" size={22} color={Colors.white} />
          </TouchableOpacity>
        }
      />

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
                  <Text style={styles.tableHeaderCell}>ID_Protocolos</Text>
                </View>
                {[
                  ['P1-Sector1-Cimiento', 'CIM', '1,2'],
                  ['P1-Sector2-Cimiento', 'CIM', '1,2'],
                  ['P1-Sector1-ARQ', 'ARQ-P1', '1,2,3'],
                ].map(([ub, plano, ids]) => (
                  <View key={ub} style={styles.tableRow}>
                    <Text style={styles.tableCell}>{ub}</Text>
                    <Text style={styles.tableCell}>{plano}</Text>
                    <Text style={styles.tableCell}>{ids}</Text>
                  </View>
                ))}
              </View>
              <Text style={styles.hint}>
                En ID_Protocolos coloca los ID_Protocolo del Excel maestro separados por coma.
                Cada ubicacion mostrara exactamente los protocolos vinculados.
              </Text>
            </View>
          </>
        )}

        {/* Estado: picking / importing */}
        {(importState.status === 'picking' || importState.status === 'importing') && (
          <View style={styles.stateBox}>
            <ActivityIndicator size="large" color={Colors.primary} />
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

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.surface },

  body: { padding: 16, gap: 16 },

  projectBadge: { backgroundColor: Colors.light, borderRadius: Radius.md, padding: 14 },
  projectBadgeLabel: { fontSize: 10, color: Colors.primary, fontWeight: '700', letterSpacing: 1 },
  projectBadgeName: { fontSize: 14, fontWeight: '700', color: Colors.navy, marginTop: 2 },

  section: { backgroundColor: Colors.white, borderRadius: Radius.md, padding: 16, gap: 8, ...Shadow.subtle },
  sectionTitle: { fontSize: 12, fontWeight: '700', color: Colors.navy, marginBottom: 4, letterSpacing: 0.5 },
  columnRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  columnBullet: { color: Colors.primary, fontSize: 10 },
  columnName: { fontSize: 13, color: Colors.textPrimary },
  hint: { fontSize: 12, color: Colors.textMuted, lineHeight: 18, marginTop: 4 },

  tableExample: { borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.sm, overflow: 'hidden' },
  tableHeader: { flexDirection: 'row', backgroundColor: Colors.light, borderBottomWidth: 1, borderBottomColor: Colors.divider },
  tableHeaderCell: { flex: 1, padding: 8, fontSize: 10, fontWeight: '700', color: Colors.navy },
  tableRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: Colors.divider },
  tableCell: { flex: 1, padding: 8, fontSize: 11, color: Colors.textSecondary },

  stateBox: { backgroundColor: Colors.white, borderRadius: Radius.lg, padding: 24, alignItems: 'center', gap: 12, ...Shadow.subtle },
  stateSuccess: { borderLeftWidth: 4, borderLeftColor: Colors.success },
  stateError: { borderLeftWidth: 4, borderLeftColor: Colors.danger },
  stateTitle: { fontSize: 15, fontWeight: '700', color: Colors.navy },
  stateText: { fontSize: 13, color: Colors.textSecondary, textAlign: 'center' },
  statNumber: { fontSize: 36, fontWeight: '800', color: Colors.primary },
  statLabel: { fontSize: 14, color: Colors.textSecondary },

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
