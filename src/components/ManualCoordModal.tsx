/**
 * ManualCoordModal — Ingreso MANUAL de coordenadas. Caso de uso: alguien tomó la
 * medida con su propio GPS y la anota aquí. Acepta el sistema de coordenadas
 * (WGS84/PSAD56 · Lat-Lng o UTM) y convierte a WGS84 (canónico del sistema).
 */
import React, { useState } from 'react';
import { Modal, View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { Colors, Radius } from '../theme/colors';
import { utmToWgs84, psad56LatLngToWgs84, type CoordinateSystem } from '@utils/CoordinateSystem';
import { useI18n } from '@i18n/index';

type Sys = CoordinateSystem;
const SYSTEMS: { key: Sys; label: string }[] = [
  { key: 'WGS84_LATLNG', label: 'WGS84 Lat/Lng' },
  { key: 'PSAD56_LATLNG', label: 'PSAD56 Lat/Lng' },
  { key: 'WGS84_UTM', label: 'WGS84 UTM' },
  { key: 'PSAD56_UTM', label: 'PSAD56 UTM' },
];
const isUtm = (s: Sys) => s === 'WGS84_UTM' || s === 'PSAD56_UTM';

interface Props {
  visible: boolean;
  defaultSystem: Sys;
  onCancel: () => void;
  onSave: (coords: { lat: number; lng: number; accuracyM: number | null }) => void;
}

export function ManualCoordModal({ visible, defaultSystem, onCancel, onSave }: Props) {
  const { t } = useI18n();
  const [sys, setSys] = useState<Sys>(defaultSystem);
  const [a, setA] = useState('');   // lat  | northing
  const [b, setB] = useState('');   // lng  | easting
  const [zone, setZone] = useState('18');
  const [hemisphere, setHemisphere] = useState<'N' | 'S'>('S');
  const [acc, setAcc] = useState(''); // precisión declarada (opcional)
  const [error, setError] = useState<string | null>(null);

  const utm = isUtm(sys);
  const num = (s: string) => parseFloat(s.replace(',', '.'));

  const handleSave = () => {
    setError(null);
    const va = num(a), vb = num(b);
    if (!isFinite(va) || !isFinite(vb)) { setError(t('manualCoord.error.invalidNumbers')); return; }
    let lat: number, lng: number;
    try {
      if (sys === 'WGS84_LATLNG') { lat = va; lng = vb; }
      else if (sys === 'PSAD56_LATLNG') { const w = psad56LatLngToWgs84(va, vb); lat = w.lat; lng = w.lng; }
      else {
        const z = parseInt(zone, 10);
        if (!Number.isInteger(z) || z < 1 || z > 60) { setError(t('manualCoord.error.invalidZone')); return; }
        const w = utmToWgs84(vb, va, z, sys === 'PSAD56_UTM' ? 'PSAD56' : 'WGS84', hemisphere); // (easting=b, northing=a)
        lat = w.lat; lng = w.lng;
      }
    } catch (e) { setError(t('manualCoord.error.convertFailed', { detail: (e as Error).message })); return; }
    if (Math.abs(lat) > 90 || Math.abs(lng) > 180) { setError(t('manualCoord.error.outOfRange')); return; }
    const accNum = acc.trim() ? num(acc) : NaN;
    onSave({ lat, lng, accuracyM: isFinite(accNum) ? accNum : null });
  };

  const labA = utm ? t('manualCoord.coord.north') : t('manualCoord.coord.latitude');
  const labB = utm ? t('manualCoord.coord.east') : t('manualCoord.coord.longitude');

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onCancel}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <ScrollView keyboardShouldPersistTaps="handled">
            <Text style={styles.title}>{t('manualCoord.title')}</Text>
            <Text style={styles.help}>{t('manualCoord.help')}</Text>

            <Text style={styles.label}>{t('manualCoord.label.system')}</Text>
            <View style={styles.sysRow}>
              {SYSTEMS.map(s => (
                <TouchableOpacity key={s.key} onPress={() => setSys(s.key)}
                  style={[styles.sysChip, sys === s.key && styles.sysChipOn]}>
                  <Text style={[styles.sysChipText, sys === s.key && styles.sysChipTextOn]}>{s.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {utm && (
              <View style={styles.row}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.label}>{t('manualCoord.label.utmZone')}</Text>
                  <TextInput style={styles.input} value={zone} onChangeText={setZone} keyboardType="number-pad" placeholder="18" placeholderTextColor="#bbb" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.label}>{t('manualCoord.label.hemisphere')}</Text>
                  <View style={styles.sysRow}>
                    {(['S', 'N'] as const).map(h => (
                      <TouchableOpacity key={h} onPress={() => setHemisphere(h)} style={[styles.sysChip, hemisphere === h && styles.sysChipOn]}>
                        <Text style={[styles.sysChipText, hemisphere === h && styles.sysChipTextOn]}>{h === 'S' ? t('manualCoord.hemisphere.south') : t('manualCoord.hemisphere.north')}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              </View>
            )}

            <Text style={styles.label}>{labA}</Text>
            <TextInput style={styles.input} value={a} onChangeText={setA} keyboardType="numbers-and-punctuation" placeholder={labA} placeholderTextColor="#bbb" />
            <Text style={styles.label}>{labB}</Text>
            <TextInput style={styles.input} value={b} onChangeText={setB} keyboardType="numbers-and-punctuation" placeholder={labB} placeholderTextColor="#bbb" />

            <Text style={styles.label}>{t('manualCoord.label.accuracy')}</Text>
            <TextInput style={styles.input} value={acc} onChangeText={setAcc} keyboardType="numbers-and-punctuation" placeholder={t('manualCoord.accuracy.placeholder')} placeholderTextColor="#bbb" />

            {error && <Text style={styles.error}>{error}</Text>}

            <View style={styles.actions}>
              <TouchableOpacity style={styles.secondaryBtn} onPress={onCancel}><Text style={styles.secondaryText}>{t('manualCoord.btn.cancel')}</Text></TouchableOpacity>
              <TouchableOpacity style={styles.saveBtn} onPress={handleSave}><Text style={styles.saveText}>{t('manualCoord.btn.save')}</Text></TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  card: { backgroundColor: Colors.white, borderTopLeftRadius: 18, borderTopRightRadius: 18, padding: 18, paddingBottom: 26, maxHeight: '85%' },
  title: { fontSize: 15, fontWeight: '800', color: Colors.textPrimary },
  help: { fontSize: 12, color: Colors.textSecondary, marginTop: 2, marginBottom: 6 },
  label: { fontSize: 11, fontWeight: '700', color: Colors.textSecondary, marginTop: 10, marginBottom: 3 },
  sysRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  sysChip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 14, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.white },
  sysChipOn: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  sysChipText: { fontSize: 11, fontWeight: '700', color: Colors.textSecondary },
  sysChipTextOn: { color: Colors.white },
  row: { flexDirection: 'row', gap: 10 },
  input: { borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.sm, paddingHorizontal: 10, paddingVertical: 9, fontSize: 14, color: Colors.textPrimary },
  error: { fontSize: 12, color: Colors.danger, fontWeight: '600', marginTop: 8 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 16 },
  secondaryBtn: { flex: 1, alignItems: 'center', paddingVertical: 12, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border },
  secondaryText: { fontSize: 13, fontWeight: '700', color: Colors.textSecondary },
  saveBtn: { flex: 2, alignItems: 'center', paddingVertical: 12, borderRadius: Radius.md, backgroundColor: Colors.primary },
  saveText: { fontSize: 13, fontWeight: '800', color: Colors.white },
});
