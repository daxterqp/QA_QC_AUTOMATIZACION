import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, StyleProp, ViewStyle, Modal, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export type Priority = 'low' | 'medium' | 'high';

export const PRIORITY_META: Record<Priority, { label: string; color: string; bg: string; icon: keyof typeof Ionicons.glyphMap }> = {
  low:    { label: 'Baja',  color: '#ffffff', bg: '#1976d2', icon: 'arrow-down-circle' }, // azul
  medium: { label: 'Media', color: '#ffffff', bg: '#e67e22', icon: 'remove-circle' },     // naranja
  high:   { label: 'Alta',  color: '#ffffff', bg: '#c0392b', icon: 'alert-circle' },      // rojo
};

export function isPriority(v: any): v is Priority {
  return v === 'low' || v === 'medium' || v === 'high';
}

/**
 * Chip compacto que muestra la prioridad de una observación.
 * Si value es null/undefined, renderiza un chip "Sin prioridad" tenue.
 */
export function PriorityChip({
  value,
  size = 'md',
  style,
}: {
  value: Priority | null | undefined;
  size?: 'sm' | 'md';
  style?: StyleProp<ViewStyle>;
}) {
  const small = size === 'sm';
  if (!value || !isPriority(value)) {
    return (
      <View
        style={[
          styles.chip,
          small ? styles.chipSm : null,
          { backgroundColor: '#e6ebf4' },
          style,
        ]}
      >
        <Text style={[styles.txt, small && styles.txtSm, { color: '#6b7a8c' }]}>
          Sin prioridad
        </Text>
      </View>
    );
  }
  const meta = PRIORITY_META[value];
  return (
    <View
      style={[
        styles.chip,
        small ? styles.chipSm : null,
        { backgroundColor: meta.bg, flexDirection: 'row', alignItems: 'center', gap: small ? 3 : 4 },
        style,
      ]}
    >
      <Ionicons name={meta.icon} size={small ? 11 : 13} color={meta.color} />
      <Text style={[styles.txt, small && styles.txtSm, { color: meta.color }]}>
        {meta.label}
      </Text>
    </View>
  );
}

/**
 * Selector de prioridad con 3 opciones (Baja/Media/Alta) + limpiar.
 */
export function PrioritySelector({
  value,
  onChange,
  allowClear = true,
  compact = false,
}: {
  value: Priority | null | undefined;
  onChange: (p: Priority | null) => void;
  allowClear?: boolean;
  /** Versión compacta en una sola fila (ideal para espacios angostos) */
  compact?: boolean;
}) {
  const options: Priority[] = ['low', 'medium', 'high'];
  return (
    <View style={[styles.selectorRow, compact && styles.selectorRowCompact]}>
      {options.map((p) => {
        const meta = PRIORITY_META[p];
        const active = value === p;
        return (
          <TouchableOpacity
            key={p}
            style={[
              styles.selectorOpt,
              compact && styles.selectorOptCompact,
              { borderColor: meta.bg, flexDirection: 'row', alignItems: 'center', gap: compact ? 3 : 5 },
              active && { backgroundColor: meta.bg },
            ]}
            onPress={() => onChange(p)}
            activeOpacity={0.75}
          >
            <Ionicons name={meta.icon} size={compact ? 12 : 14} color={active ? meta.color : meta.bg} />
            <Text
              style={[
                styles.selectorOptText,
                compact && styles.selectorOptTextCompact,
                { color: active ? meta.color : meta.bg },
              ]}
            >
              {meta.label}
            </Text>
          </TouchableOpacity>
        );
      })}
      {allowClear && value ? (
        <TouchableOpacity
          style={[styles.selectorClearIcon, compact && styles.selectorClearIconCompact]}
          onPress={() => onChange(null)}
          activeOpacity={0.7}
          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
        >
          <Ionicons name="close" size={compact ? 14 : 16} color="#6b7a8c" />
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

/**
 * Modal para elegir prioridad mediante long-press sobre una tarjeta.
 * Bottom-sheet sobrio con las 3 opciones + "Sin prioridad".
 */
export function PriorityPickerModal({
  visible,
  value,
  onSelect,
  onClose,
  title = 'Prioridad de la observación',
}: {
  visible: boolean;
  value: Priority | null | undefined;
  onSelect: (p: Priority | null) => void;
  onClose: () => void;
  title?: string;
}) {
  const options: Priority[] = ['low', 'medium', 'high'];
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={modalStyles.backdrop} onPress={onClose}>
        <Pressable style={modalStyles.sheet} onPress={() => { /* swallow */ }}>
          <View style={modalStyles.handle} />
          <Text style={modalStyles.title}>{title}</Text>
          <Text style={modalStyles.subtitle}>Selecciona el nivel de urgencia</Text>

          <View style={modalStyles.optionsCol}>
            {options.map((p) => {
              const meta = PRIORITY_META[p];
              const active = value === p;
              return (
                <TouchableOpacity
                  key={p}
                  style={[
                    modalStyles.optionRow,
                    { borderColor: meta.bg },
                    active && { backgroundColor: meta.bg },
                  ]}
                  onPress={() => { onSelect(p); onClose(); }}
                  activeOpacity={0.8}
                >
                  <Ionicons name={meta.icon} size={20} color={active ? meta.color : meta.bg} />
                  <Text
                    style={[
                      modalStyles.optionText,
                      { color: active ? meta.color : meta.bg },
                    ]}
                  >
                    {meta.label}
                  </Text>
                  {active ? (
                    <Ionicons name="checkmark" size={18} color={meta.color} />
                  ) : null}
                </TouchableOpacity>
              );
            })}

            <TouchableOpacity
              style={modalStyles.clearRow}
              onPress={() => { onSelect(null); onClose(); }}
              activeOpacity={0.8}
            >
              <Ionicons name="close-circle-outline" size={18} color="#6b7a8c" />
              <Text style={modalStyles.clearText}>Sin prioridad</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity style={modalStyles.cancelBtn} onPress={onClose} activeOpacity={0.8}>
            <Text style={modalStyles.cancelText}>Cancelar</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const modalStyles = StyleSheet.create({
  backdrop: {
    flex: 1, backgroundColor: 'rgba(14,33,61,0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 18, borderTopRightRadius: 18,
    paddingHorizontal: 18, paddingTop: 8, paddingBottom: 22,
  },
  handle: {
    alignSelf: 'center', width: 40, height: 4,
    borderRadius: 2, backgroundColor: '#d4dde8', marginBottom: 12,
  },
  title: { fontSize: 16, fontWeight: '800', color: '#0e213d', letterSpacing: 0.2 },
  subtitle: { fontSize: 12, color: '#6b7a8c', marginTop: 2, marginBottom: 14 },
  optionsCol: { gap: 8 },
  optionRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 14, paddingVertical: 12,
    borderRadius: 10, borderWidth: 1.5,
    backgroundColor: 'transparent',
  },
  optionDot: { width: 12, height: 12, borderRadius: 6 },
  optionText: { flex: 1, fontSize: 14, fontWeight: '700', letterSpacing: 0.3 },
  clearRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 14, paddingVertical: 12,
    borderRadius: 10, borderWidth: 1, borderColor: '#d4dde8',
    marginTop: 2,
  },
  clearText: { fontSize: 13, fontWeight: '600', color: '#6b7a8c' },
  cancelBtn: {
    marginTop: 14, paddingVertical: 12,
    borderRadius: 10, alignItems: 'center',
    backgroundColor: '#f3f5f6',
  },
  cancelText: { fontSize: 13, fontWeight: '700', color: '#0e213d', letterSpacing: 0.3 },
});

const styles = StyleSheet.create({
  chip: {
    paddingHorizontal: 10, paddingVertical: 4,
    borderRadius: 10, alignSelf: 'flex-start',
  },
  chipSm: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 },
  txt: { fontSize: 11, fontWeight: '800', letterSpacing: 0.3 },
  txtSm: { fontSize: 10 },

  selectorRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  selectorRowCompact: { flexWrap: 'nowrap', gap: 4 },
  selectorOpt: {
    paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: 8, borderWidth: 1.5,
    backgroundColor: 'transparent',
  },
  selectorOptCompact: {
    flex: 1,
    paddingHorizontal: 4, paddingVertical: 5,
    justifyContent: 'center',
  },
  selectorOptText: { fontSize: 12, fontWeight: '700', letterSpacing: 0.3 },
  selectorOptTextCompact: { fontSize: 11, letterSpacing: 0.1 },
  selectorClear: {
    paddingHorizontal: 10, paddingVertical: 6,
    borderRadius: 8, borderWidth: 1, borderColor: '#d4dde8',
  },
  selectorClearText: { fontSize: 11, fontWeight: '600', color: '#6b7a8c' },
  selectorClearIcon: {
    width: 28, height: 28, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: '#d4dde8',
  },
  selectorClearIconCompact: {
    width: 24, height: 24, borderRadius: 12,
  },
});
