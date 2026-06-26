/**
 * TopoColumnsEditor (móvil) — Editor de columnas del módulo topográfico en la config.
 * Cada fila: nombre + origen (Manual / Fórmula / Evaluar dentro del área) con su detalle
 * (fórmula o tolerancia) + toggles "Habilitar" y "Mostrar en ficha". Espejo del web.
 */
import React from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Radius } from '../../theme/colors';
import { defaultTopoColumns, type TopoColumn } from '@utils/featureFlags';

interface Props {
  columns: TopoColumn[] | undefined;
  onChange: (cols: TopoColumn[]) => void;
}

const SOURCES: { key: TopoColumn['source']; label: string }[] = [
  { key: 'manual', label: 'Manual' },
  { key: 'formula', label: 'Fórmula' },
  { key: 'area', label: 'Área' },
];

function genId(): string { return `c${Math.random().toString(36).slice(2, 9)}`; }

function Checkbox({ value, label, onToggle }: { value: boolean; label: string; onToggle: () => void }) {
  return (
    <TouchableOpacity style={styles.cb} onPress={onToggle} activeOpacity={0.7}>
      <Ionicons name={value ? 'checkbox' : 'square-outline'} size={18} color={value ? Colors.primary : Colors.textMuted} />
      <Text style={styles.cbText}>{label}</Text>
    </TouchableOpacity>
  );
}

export function TopoColumnsEditor({ columns, onChange }: Props) {
  const cols = (columns && columns.length > 0) ? columns : defaultTopoColumns();
  const update = (id: string, patch: Partial<TopoColumn>) => onChange(cols.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  const remove = (id: string) => onChange(cols.filter((c) => c.id !== id));
  const add = () => onChange([...cols, { id: genId(), name: 'Nueva columna', source: 'manual', enabled: true, show_in_ficha: false }]);

  return (
    <View style={{ gap: 8, marginTop: 8 }}>
      <Text style={styles.heading}>Columnas de la carga</Text>
      {cols.map((c) => {
        const lockSource = c.builtin === 'coord1' || c.builtin === 'coord2' || c.builtin === 'cota';
        return (
          <View key={c.id} style={styles.card}>
            <View style={styles.rowTop}>
              {c.builtin ? (
                <Text style={styles.nameFixed}>{c.name}</Text>
              ) : (
                <TextInput style={styles.nameInput} value={c.name} onChangeText={(v) => update(c.id, { name: v })} placeholder="Nombre" placeholderTextColor={Colors.textMuted} />
              )}
              {!c.builtin && (
                <TouchableOpacity onPress={() => remove(c.id)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Ionicons name="trash-outline" size={16} color={Colors.danger} />
                </TouchableOpacity>
              )}
            </View>

            <View style={styles.sourceRow}>
              {SOURCES.map((s) => {
                const active = c.source === s.key;
                const disabled = lockSource && s.key !== 'manual';
                return (
                  <TouchableOpacity key={s.key} disabled={disabled}
                    style={[styles.chip, active && styles.chipActive, disabled && styles.chipDisabled]}
                    onPress={() => update(c.id, { source: s.key })}>
                    <Text style={[styles.chipText, active && styles.chipTextActive]}>{s.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {c.source === 'formula' && (
              <TextInput style={styles.formulaInput} value={c.formula ?? ''} onChangeText={(v) => update(c.id, { formula: v })}
                placeholder="BUSCAR(tabla, #1A, Columna) * 2" placeholderTextColor={Colors.textMuted} autoCapitalize="none" />
            )}
            {c.source === 'area' && (
              <View style={styles.areaRow}>
                <Text style={styles.areaLabel}>Áreas: sectores · Tolerancia (m):</Text>
                <TextInput style={styles.tolInput} value={String(c.tolerance_m ?? 0)} onChangeText={(v) => update(c.id, { tolerance_m: Number(v) || 0 })} keyboardType="numeric" />
              </View>
            )}

            <View style={styles.toggles}>
              <Checkbox value={c.enabled} label="Habilitar" onToggle={() => update(c.id, { enabled: !c.enabled })} />
              <Checkbox value={c.show_in_ficha} label="Mostrar en ficha" onToggle={() => update(c.id, { show_in_ficha: !c.show_in_ficha })} />
            </View>
          </View>
        );
      })}
      <TouchableOpacity style={styles.addBtn} onPress={add}>
        <Ionicons name="add" size={16} color={Colors.primary} />
        <Text style={styles.addText}>Agregar columna</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  heading: { fontSize: 11, fontWeight: '800', color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },
  card: { backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.md, padding: 10, gap: 8 },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  nameFixed: { flex: 1, fontSize: 14, fontWeight: '700', color: Colors.navy },
  nameInput: { flex: 1, borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.sm, paddingHorizontal: 10, paddingVertical: 7, fontSize: 14, color: Colors.navy, backgroundColor: Colors.white },
  sourceRow: { flexDirection: 'row', gap: 6 },
  chip: { borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.sm, paddingHorizontal: 10, paddingVertical: 6, backgroundColor: Colors.white },
  chipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  chipDisabled: { opacity: 0.4 },
  chipText: { fontSize: 12, fontWeight: '700', color: Colors.textSecondary },
  chipTextActive: { color: Colors.white },
  formulaInput: { borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.sm, paddingHorizontal: 10, paddingVertical: 7, fontSize: 12, color: Colors.navy, backgroundColor: Colors.white, fontFamily: undefined },
  areaRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  areaLabel: { fontSize: 11, color: Colors.textMuted, flex: 1 },
  tolInput: { width: 70, borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.sm, paddingHorizontal: 8, paddingVertical: 6, fontSize: 12, color: Colors.navy, backgroundColor: Colors.white },
  toggles: { flexDirection: 'row', gap: 18 },
  cb: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  cbText: { fontSize: 12, color: Colors.navy },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', paddingVertical: 4 },
  addText: { fontSize: 13, fontWeight: '800', color: Colors.primary },
});
