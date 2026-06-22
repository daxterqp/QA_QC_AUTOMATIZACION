/**
 * ForceOverrideModal — modal de confirmación cuando un operador intenta
 * usar un equipo que YA está siendo usado por otra persona.
 *
 * Flujo: warning + slide-to-confirm. Al confirmar, ejecuta `onConfirm` que
 * típicamente navega a la cámara para capturar la foto obligatoria del
 * equipo antes de hacer la toma forzada.
 *
 * NO aplica al mismo usuario reabriendo su propio equipo PAUSED.
 */
import React from 'react';
import { View, Text, Modal, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Radius } from '../theme/colors';
import { SlideToConfirm } from './SlideToConfirm';

interface Props {
  visible: boolean;
  equipmentLabel: string;
  ownerName?: string;
  startedAt?: number;
  onCancel: () => void;
  onConfirm: () => void;
}

function fmtSince(ms?: number): string {
  if (!ms) return '';
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function ForceOverrideModal({ visible, equipmentLabel, ownerName, startedAt, onCancel, onConfirm }: Props) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <View style={styles.iconCircle}>
            <Ionicons name="warning" size={28} color={Colors.warning} />
          </View>
          <Text style={styles.title}>Equipo en uso</Text>
          <Text style={styles.body}>
            El equipo <Text style={styles.bold}>{equipmentLabel}</Text>
            {ownerName ? <> está siendo usado por <Text style={styles.bold}>{ownerName}</Text></> : <> tiene una sesión activa</>}
            {startedAt ? <> desde <Text style={styles.bold}>{fmtSince(startedAt)}</Text></> : null}
            .
          </Text>
          <Text style={styles.warn}>
            Si continúas, esa sesión se cerrará automáticamente y se abrirá una
            nueva sesión a tu nombre. Tendrás que tomar una foto del equipo como
            evidencia antes de empezar.
          </Text>

          <View style={styles.actions}>
            <TouchableOpacity style={styles.cancelBtn} onPress={onCancel} activeOpacity={0.7}>
              <Text style={styles.cancelText}>Cancelar</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.sliderWrap}>
            <SlideToConfirm
              label="Desliza para continuar y tomar foto"
              tone="danger"
              onConfirm={onConfirm}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 16 },
  card: { backgroundColor: Colors.white, borderRadius: Radius.lg, padding: 18, alignItems: 'center', gap: 6 },
  iconCircle: {
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: Colors.warning + '20',
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 4,
  },
  title: { fontSize: 18, fontWeight: '900', color: Colors.textPrimary },
  body: { fontSize: 13, color: Colors.textPrimary, textAlign: 'center', lineHeight: 19, marginTop: 6 },
  warn: { fontSize: 12, color: Colors.warning, textAlign: 'center', fontWeight: '600', marginTop: 8 },
  bold: { fontWeight: '800' },
  actions: { flexDirection: 'row', marginTop: 12 },
  cancelBtn: { paddingVertical: 8, paddingHorizontal: 16 },
  cancelText: { color: Colors.textSecondary, fontWeight: '700' },
  sliderWrap: { width: '100%', marginTop: 8 },
});
