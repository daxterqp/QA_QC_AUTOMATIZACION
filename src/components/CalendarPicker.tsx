/**
 * CalendarPicker — Calendario mensual puro en RN (sin dependencia nativa).
 * Navega meses y selecciona un día → onSelect('YYYY-MM-DD').
 */
import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Radius } from '../theme/colors';

const MONTHS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const WEEKDAYS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
const pad = (n: number) => String(n).padStart(2, '0');

export default function CalendarPicker({ value, onSelect, onClear }: {
  value?: string; onSelect: (d: string) => void; onClear?: () => void;
}) {
  const init = value ? new Date(value + 'T12:00:00') : new Date();
  const [view, setView] = useState({ y: init.getFullYear(), m: init.getMonth() });

  const first = new Date(view.y, view.m, 1);
  const startWd = (first.getDay() + 6) % 7; // lunes = 0
  const daysInMonth = new Date(view.y, view.m + 1, 0).getDate();
  const cells: (number | null)[] = [...Array(startWd).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];
  while (cells.length % 7 !== 0) cells.push(null);

  const key = (d: number) => `${view.y}-${pad(view.m + 1)}-${pad(d)}`;
  const prev = () => setView(v => (v.m === 0 ? { y: v.y - 1, m: 11 } : { y: v.y, m: v.m - 1 }));
  const next = () => setView(v => (v.m === 11 ? { y: v.y + 1, m: 0 } : { y: v.y, m: v.m + 1 }));

  return (
    <View>
      <View style={styles.head}>
        <TouchableOpacity onPress={prev} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}><Ionicons name="chevron-back" size={20} color={Colors.primary} /></TouchableOpacity>
        <Text style={styles.title}>{MONTHS[view.m]} {view.y}</Text>
        <TouchableOpacity onPress={next} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}><Ionicons name="chevron-forward" size={20} color={Colors.primary} /></TouchableOpacity>
      </View>
      <View style={styles.row}>
        {WEEKDAYS.map((w, i) => <Text key={i} style={styles.wd}>{w}</Text>)}
      </View>
      {Array.from({ length: cells.length / 7 }, (_, r) => (
        <View key={r} style={styles.row}>
          {cells.slice(r * 7, r * 7 + 7).map((d, i) => {
            if (d == null) return <View key={i} style={styles.cell} />;
            const sel = value === key(d);
            return (
              <TouchableOpacity key={i} style={[styles.cell, sel && styles.cellSel]} onPress={() => onSelect(key(d))}>
                <Text style={[styles.day, sel && styles.daySel]}>{d}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      ))}
      {onClear && (
        <TouchableOpacity onPress={onClear} style={styles.clear}><Text style={styles.clearText}>Cualquiera (sin límite)</Text></TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 6, paddingHorizontal: 4 },
  title: { fontSize: 15, fontWeight: '800', color: Colors.textPrimary },
  row: { flexDirection: 'row' },
  wd: { flex: 1, textAlign: 'center', fontSize: 11, fontWeight: '800', color: Colors.textMuted, paddingVertical: 4 },
  cell: { flex: 1, aspectRatio: 1, alignItems: 'center', justifyContent: 'center', margin: 1, borderRadius: Radius.sm },
  cellSel: { backgroundColor: Colors.primary },
  day: { fontSize: 14, color: Colors.textPrimary },
  daySel: { color: Colors.white, fontWeight: '800' },
  clear: { marginTop: 8, paddingVertical: 10, alignItems: 'center', borderTopWidth: 1, borderTopColor: Colors.border },
  clearText: { fontSize: 13, color: Colors.primary, fontWeight: '700' },
});
