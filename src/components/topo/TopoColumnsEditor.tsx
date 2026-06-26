/**
 * TopoColumnsEditor (móvil) — Editor COMPACTO (tabla) de las columnas del módulo
 * topográfico. Columnas: Encabezado · Habilitar · Mostrar en ficha · Origen
 * (desplegable, default Manual). Coordenadas/Cota quedan en "Manual" bloqueado; las
 * custom permiten Fórmula (campo de fórmula) o Área (tolerancia) en una fila de
 * detalle. Espejo de la tabla web.
 */
import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Modal, Pressable } from 'react-native';
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
  { key: 'area', label: 'Evaluar dentro del área' },
];
const SOURCE_LABEL: Record<TopoColumn['source'], string> = {
  manual: 'Manual', formula: 'Fórmula', area: 'Área',
};

function genId(): string { return `c${Math.random().toString(36).slice(2, 9)}`; }

function Check({ value, onToggle }: { value: boolean; onToggle: () => void }) {
  return (
    <TouchableOpacity onPress={onToggle} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} activeOpacity={0.7}>
      <Ionicons name={value ? 'checkbox' : 'square-outline'} size={20} color={value ? Colors.primary : Colors.textMuted} />
    </TouchableOpacity>
  );
}

/** Desplegable de origen (Manual/Fórmula/Área) con Modal. Bloqueado para columnas base. */
function SourceDropdown({ value, locked, onPick }: { value: TopoColumn['source']; locked: boolean; onPick: (s: TopoColumn['source']) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <TouchableOpacity
        style={[styles.ddBtn, locked && styles.ddBtnLocked]}
        onPress={() => !locked && setOpen(true)}
        disabled={locked}
        activeOpacity={0.7}
      >
        <Text style={styles.ddText} numberOfLines={1}>{SOURCE_LABEL[value]}</Text>
        {!locked && <Ionicons name="chevron-down" size={12} color={Colors.textSecondary} />}
      </TouchableOpacity>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.ddOverlay} onPress={() => setOpen(false)}>
          <View style={styles.ddMenu}>
            {SOURCES.map((s) => (
              <TouchableOpacity key={s.key} style={styles.ddItem} onPress={() => { onPick(s.key); setOpen(false); }}>
                <Text style={[styles.ddItemText, value === s.key && styles.ddItemActive]}>{s.label}</Text>
                {value === s.key && <Ionicons name="checkmark" size={16} color={Colors.primary} />}
              </TouchableOpacity>
            ))}
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

export function TopoColumnsEditor({ columns, onChange }: Props) {
  const cols = (columns && columns.length > 0) ? columns : defaultTopoColumns();
  const update = (id: string, patch: Partial<TopoColumn>) => onChange(cols.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  const remove = (id: string) => onChange(cols.filter((c) => c.id !== id));
  const add = () => onChange([...cols, { id: genId(), name: 'Nueva columna', source: 'manual', enabled: true, show_in_ficha: false }]);

  return (
    <View style={{ gap: 6, marginTop: 8 }}>
      <Text style={styles.heading}>Columnas de la carga</Text>
      <View style={styles.table}>
        {/* Encabezado */}
        <View style={styles.headerRow}>
          <Text style={[styles.hCell, styles.cName]}>Encabezado</Text>
          <Text style={[styles.hCell, styles.cChk]}>Hab.</Text>
          <Text style={[styles.hCell, styles.cChk]}>Ficha</Text>
          <Text style={[styles.hCell, styles.cSrc]}>Origen</Text>
        </View>
        {cols.map((c) => {
          const lockSource = c.builtin === 'coord1' || c.builtin === 'coord2' || c.builtin === 'cota';
          return (
            <View key={c.id} style={styles.rowWrap}>
              <View style={styles.row}>
                <View style={styles.cName}>
                  {c.builtin ? (
                    <Text style={styles.nameFixed} numberOfLines={2}>{c.name}</Text>
                  ) : (
                    <TextInput style={styles.nameInput} value={c.name} onChangeText={(v) => update(c.id, { name: v })} placeholder="Nombre" placeholderTextColor={Colors.textMuted} />
                  )}
                </View>
                <View style={[styles.cChk, styles.center]}><Check value={c.enabled} onToggle={() => update(c.id, { enabled: !c.enabled })} /></View>
                <View style={[styles.cChk, styles.center]}><Check value={c.show_in_ficha} onToggle={() => update(c.id, { show_in_ficha: !c.show_in_ficha })} /></View>
                <View style={[styles.cSrc, { flexDirection: 'row', alignItems: 'center', gap: 4 }]}>
                  <SourceDropdown value={c.source} locked={lockSource} onPick={(s) => update(c.id, { source: s })} />
                  {!c.builtin && (
                    <TouchableOpacity onPress={() => remove(c.id)} hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}>
                      <Ionicons name="trash-outline" size={15} color={Colors.danger} />
                    </TouchableOpacity>
                  )}
                </View>
              </View>
              {/* Detalle según origen */}
              {c.source === 'formula' && (
                <TextInput
                  style={styles.formulaInput}
                  value={c.formula ?? ''}
                  onChangeText={(v) => update(c.id, { formula: v })}
                  placeholder="BUSCAR(tabla, #1A, Columna) * 2"
                  placeholderTextColor={Colors.textMuted}
                  autoCapitalize="none"
                />
              )}
              {c.source === 'area' && (
                <View style={styles.areaRow}>
                  <Text style={styles.areaLabel}>Sectores · Tolerancia (m):</Text>
                  <TextInput style={styles.tolInput} value={String(c.tolerance_m ?? 0)} onChangeText={(v) => update(c.id, { tolerance_m: Number(v) || 0 })} keyboardType="numeric" />
                </View>
              )}
            </View>
          );
        })}
      </View>
      <TouchableOpacity style={styles.addBtn} onPress={add}>
        <Ionicons name="add" size={16} color={Colors.primary} />
        <Text style={styles.addText}>Agregar columna</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  heading: { fontSize: 11, fontWeight: '800', color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },
  table: { borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.md, overflow: 'hidden' },
  headerRow: { flexDirection: 'row', backgroundColor: Colors.surface, paddingVertical: 6, paddingHorizontal: 6, alignItems: 'center' },
  hCell: { fontSize: 10, fontWeight: '800', color: Colors.textMuted, textTransform: 'uppercase' },
  rowWrap: { borderTopWidth: 1, borderTopColor: Colors.border, paddingHorizontal: 6, paddingVertical: 5, gap: 5 },
  row: { flexDirection: 'row', alignItems: 'center' },
  cName: { flex: 1, paddingRight: 4 },
  cChk: { width: 42, textAlign: 'center' },
  cSrc: { width: 110 },
  center: { alignItems: 'center', justifyContent: 'center' },
  nameFixed: { fontSize: 13, fontWeight: '700', color: Colors.navy },
  nameInput: { borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.sm, paddingHorizontal: 8, paddingVertical: 5, fontSize: 13, color: Colors.navy, backgroundColor: Colors.white },
  ddBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 2, borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.sm, paddingHorizontal: 6, paddingVertical: 5, backgroundColor: Colors.white },
  ddBtnLocked: { opacity: 0.6, backgroundColor: Colors.surface },
  ddText: { fontSize: 11, color: Colors.navy, fontWeight: '600', flexShrink: 1 },
  ddOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.25)', justifyContent: 'center', alignItems: 'center' },
  ddMenu: { backgroundColor: Colors.white, borderRadius: Radius.md, paddingVertical: 4, minWidth: 240, borderWidth: 1, borderColor: Colors.border },
  ddItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12 },
  ddItemText: { fontSize: 14, color: Colors.navy },
  ddItemActive: { fontWeight: '800', color: Colors.primary },
  formulaInput: { borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.sm, paddingHorizontal: 8, paddingVertical: 6, fontSize: 12, color: Colors.navy, backgroundColor: Colors.white },
  areaRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  areaLabel: { fontSize: 11, color: Colors.textMuted, flex: 1 },
  tolInput: { width: 70, borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.sm, paddingHorizontal: 8, paddingVertical: 5, fontSize: 12, color: Colors.navy, backgroundColor: Colors.white },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', paddingVertical: 4 },
  addText: { fontSize: 13, fontWeight: '800', color: Colors.primary },
});
