/**
 * TopoCoverageBox (móvil) — recuadro (siempre visible) con la cobertura de
 * coordenadas: cuántos ensayos no tienen topo, cuántos usan GPS de respaldo y
 * cuántos quedan sin ninguna coordenada. Incluye "Ver detalle". Espejo del web.
 */
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Radius } from '../../theme/colors';
import type { TopoCoverageSummary } from '@utils/topoVisibility';

export function TopoCoverageBox({ summary, onDetail }: { summary: TopoCoverageSummary; onDetail: () => void }) {
  return (
    <View style={styles.box}>
      <Ionicons name="location-outline" size={16} color="#B45309" style={{ marginTop: 1 }} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={styles.text}><Text style={styles.bold}>{summary.withoutTopo.length}</Text> de <Text style={styles.bold}>{summary.total}</Text> ensayos no tienen coordenadas topográficas.</Text>
        <Text style={styles.text}><Text style={styles.bold}>{summary.usingGps.length}</Text> usarán las coordenadas GPS como respaldo.</Text>
        <Text style={styles.text}><Text style={styles.bold}>{summary.noCoords.length}</Text> quedan sin ninguna coordenada.</Text>
        <TouchableOpacity onPress={onDetail} style={styles.detailBtn} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
          <Text style={styles.detailText}>Ver detalle</Text>
          <Ionicons name="chevron-forward" size={13} color="#92400E" />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { flexDirection: 'row', gap: 9, backgroundColor: '#FFFBEB', borderColor: '#FCD34D', borderWidth: 1, borderRadius: Radius.md, padding: 11 },
  text: { fontSize: 12, color: '#78350F', lineHeight: 16 },
  bold: { fontWeight: '800', color: '#78350F' },
  detailBtn: { flexDirection: 'row', alignItems: 'center', gap: 2, alignSelf: 'flex-start', marginTop: 3 },
  detailText: { fontSize: 12, fontWeight: '800', color: '#92400E' },
});
