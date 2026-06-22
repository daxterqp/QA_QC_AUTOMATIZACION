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
import { useI18n } from '@i18n/index';
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
  const { t } = useI18n();
  const { importState, startImport, reset } = useExcelImport(projectId, projectName);

  const isActive =
    importState.status === 'picking' || importState.status === 'importing';

  return (
    <View style={styles.container}>
      <AppHeader
        title={t('excelImport.title')}
        subtitle={projectName}
        rightContent={
          <TouchableOpacity onPress={onClose} disabled={isActive} style={{ opacity: isActive ? 0.4 : 1 }}>
            <Ionicons name="close" size={22} color={Colors.white} />
          </TouchableOpacity>
        }
      />

      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        {/* Info del proyecto */}
        <View style={styles.projectBadge}>
          <Text style={styles.projectBadgeLabel}>{t('excelImport.projectLabel')}</Text>
          <Text style={styles.projectBadgeName}>{projectName}</Text>
        </View>

        {/* Instrucciones / columnas requeridas */}
        {importState.status === 'idle' && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t('excelImport.requiredColumnsTitle')}</Text>
            {REQUIRED_COLUMNS.map((col: string) => (
              <View key={col} style={styles.columnRow}>
                <Text style={styles.columnBullet}>●</Text>
                <Text style={styles.columnName}>{col}</Text>
              </View>
            ))}
            <Text style={styles.hint}>
              {t('excelImport.protocolHint')}
            </Text>
          </View>
        )}

        {/* Estado: picking */}
        {importState.status === 'picking' && (
          <View style={styles.stateBox}>
            <ActivityIndicator size="large" color={Colors.primary} />
            <Text style={styles.stateText}>{t('excelImport.pickingFile')}</Text>
          </View>
        )}

        {/* Estado: importando */}
        {importState.status === 'importing' && (
          <View style={styles.stateBox}>
            <ActivityIndicator size="large" color={Colors.primary} />
            <Text style={styles.stateText}>
              {t('excelImport.importingProgress', { current: importState.current, total: importState.total })}
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
            <Text style={styles.stateTitle}>{t('excelImport.successTitle')}</Text>
            <Text style={styles.statStat}>
              {t(importState.totalProtocols !== 1 ? 'excelImport.protocolsCount' : 'excelImport.protocolsCount_one', { count: importState.totalProtocols })}
            </Text>
            <Text style={styles.statStat}>
              {t(importState.totalActivities !== 1 ? 'excelImport.activitiesCount' : 'excelImport.activitiesCount_one', { count: importState.totalActivities })}
            </Text>
            <TouchableOpacity
              style={[styles.btn, styles.btnPrimary]}
              onPress={() => { reset(); onImportSuccess?.(); }}
            >
              <Text style={styles.btnText}>{t('excelImport.viewProtocols')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.btn, styles.btnSecondary]} onPress={reset}>
              <Text style={styles.btnText}>{t('excelImport.loadAnotherFile')}</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Estado: error */}
        {importState.status === 'error' && (
          <View style={[styles.stateBox, styles.stateError]}>
            <Text style={styles.stateTitle}>{t('excelImport.errorTitle')}</Text>
            <Text style={styles.errorMessage}>{importState.message}</Text>
            {importState.missingColumns && importState.missingColumns.length > 0 && (
              <View style={styles.missingCols}>
                <Text style={styles.missingColsLabel}>{t('excelImport.missingColumnsLabel')}</Text>
                {importState.missingColumns.map((col: string) => (
                  <Text key={col} style={styles.missingColItem}>• {col}</Text>
                ))}
              </View>
            )}
            <TouchableOpacity style={[styles.btn, styles.btnPrimary]} onPress={reset}>
              <Text style={styles.btnText}>{t('excelImport.tryAgain')}</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>

      {/* Boton principal */}
      {(importState.status === 'idle') && (
        <View style={styles.footer}>
          <TouchableOpacity style={[styles.btn, styles.btnPrimary, styles.btnFull]} onPress={startImport}>
            <Text style={styles.btnText}>{t('excelImport.selectExcelFile')}</Text>
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
