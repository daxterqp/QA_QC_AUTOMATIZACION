import React, { useEffect, useMemo, useState } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Alert,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { VolumeCalcState } from '@services/MetradosService';
import { Colors, Radius, Shadow } from '../theme/colors';
import { useI18n } from '@i18n/index';

type Props = {
  visible: boolean;
  kind: 'polyline' | 'polygon';
  perimeter?: number;
  area?: number;
  initialState?: VolumeCalcState;
  onSave: (state: VolumeCalcState) => void;
  onClose: () => void;
};

export default function VolumeCalculatorModal({
  visible,
  area,
  initialState,
  onSave,
  onClose,
}: Props) {
  const { t } = useI18n();
  const [heightInput, setHeightInput] = useState<string>(
    initialState?.heightM != null ? String(initialState.heightM) : ''
  );

  useEffect(() => {
    if (visible) {
      setHeightInput(initialState?.heightM != null ? String(initialState.heightM) : '');
    }
  }, [visible, initialState]);

  const parseNum = (s: string): number => {
    const n = parseFloat(s.replace(',', '.'));
    return isNaN(n) ? 0 : n;
  };

  const heightM = parseNum(heightInput);
  const baseArea = area ?? 0;

  const volume = useMemo(() => baseArea * heightM, [baseArea, heightM]);

  const handleSave = () => {
    if (heightM <= 0) {
      Alert.alert(t('alerts.incompleteDataTitle'), t('alerts.enterValidHeightMsg'));
      return;
    }
    if (baseArea <= 0) {
      Alert.alert(t('alerts.noAreaTitle'), t('alerts.noAreaMsg'));
      return;
    }
    const state: VolumeCalcState = {
      heightM,
      totalM3: volume,
      savedAt: Date.now(),
    };
    onSave(state);
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <TouchableOpacity style={styles.backdropTouch} activeOpacity={1} onPress={onClose} />
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <View style={styles.header}>
            <MaterialCommunityIcons name="cube-outline" size={22} color="#1565c0" />
            <Text style={styles.title}>Cálculo de volumen</Text>
            <TouchableOpacity onPress={onClose} style={styles.headerClose}>
              <Ionicons name="close" size={20} color={Colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.body} keyboardShouldPersistTaps="handled">
            <View style={styles.infoBox}>
              <Text style={styles.infoLabel}>Área base</Text>
              <Text style={styles.infoValue}>{baseArea.toFixed(2)} m²</Text>
            </View>

            <View style={styles.grid}>
              <View style={styles.cell}>
                <Text style={styles.label}>Altura (m)</Text>
                <TextInput
                  style={styles.input}
                  keyboardType="decimal-pad"
                  value={heightInput}
                  onChangeText={setHeightInput}
                  placeholder="Ej: 0.60"
                  placeholderTextColor={Colors.textMuted}
                  autoFocus
                />
              </View>
            </View>

            <View style={styles.resultCard}>
              <View style={[styles.resultRow, styles.resultTotal]}>
                <Text style={styles.resultTotalLabel}>Volumen</Text>
                <Text style={styles.resultTotalValue}>{volume.toFixed(3)} m³</Text>
              </View>
            </View>
          </ScrollView>

          <View style={styles.footer}>
            <TouchableOpacity
              style={[styles.borderBtn, { borderColor: Colors.danger, flex: 1 }]}
              onPress={onClose}
            >
              <Ionicons name="close" size={16} color={Colors.danger} />
              <Text style={[styles.borderBtnText, { color: Colors.danger }]}>Cerrar</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.borderBtn, { borderColor: Colors.success, flex: 1 }]}
              onPress={handleSave}
            >
              <Ionicons name="checkmark" size={16} color={Colors.success} />
              <Text style={[styles.borderBtnText, { color: Colors.success }]}>Guardar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  backdropTouch: { ...StyleSheet.absoluteFillObject },
  sheet: {
    backgroundColor: Colors.white,
    borderTopLeftRadius: Radius.lg,
    borderTopRightRadius: Radius.lg,
    paddingBottom: 16,
    maxHeight: '80%',
    ...Shadow.card,
  },
  handle: {
    width: 40, height: 4, borderRadius: 2, backgroundColor: Colors.border,
    alignSelf: 'center', marginTop: 8, marginBottom: 4,
  },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 16, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: Colors.divider,
  },
  title: { flex: 1, fontSize: 16, fontWeight: '700', color: Colors.textPrimary },
  headerClose: { padding: 4 },
  body: { paddingHorizontal: 16, paddingTop: 12 },

  infoBox: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 12, paddingVertical: 10,
    backgroundColor: Colors.surface, borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.border, marginBottom: 12,
  },
  infoLabel: { fontSize: 13, fontWeight: '600', color: Colors.textSecondary },
  infoValue: { fontSize: 16, fontWeight: '700', color: '#1565c0' },

  label: { fontSize: 12, fontWeight: '700', color: Colors.textSecondary, marginBottom: 4 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  cell: { flex: 1, minWidth: 120 },
  input: {
    backgroundColor: Colors.surface, borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.border,
    paddingHorizontal: 12, height: 40, fontSize: 15, fontWeight: '600',
    color: Colors.textPrimary, textAlign: 'center',
  },

  resultCard: {
    marginTop: 16, marginBottom: 12, padding: 14,
    backgroundColor: Colors.surface, borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.border,
    gap: 6,
  },
  resultRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  resultTotal: { paddingTop: 0 },
  resultTotalLabel: { fontSize: 13, color: Colors.textPrimary, fontWeight: '700' },
  resultTotalValue: { fontSize: 22, color: '#1565c0', fontWeight: '900' },

  footer: {
    flexDirection: 'row', gap: 10,
    paddingHorizontal: 16, paddingTop: 10, borderTopWidth: 1, borderTopColor: Colors.divider,
  },
  borderBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    borderWidth: 1.5, borderRadius: Radius.md,
    paddingHorizontal: 16, height: 42,
  },
  borderBtnText: { fontSize: 14, fontWeight: '700' },
});
