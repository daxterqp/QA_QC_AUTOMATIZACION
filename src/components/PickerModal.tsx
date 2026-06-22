/**
 * PickerModal — selector full-screen reutilizable con búsqueda.
 *
 * Uso:
 *   <PickerField
 *     label="Equipo"
 *     value={selectedId}
 *     items={[{ id, label, sublabel? }]}
 *     onChange={setSelectedId}
 *     placeholder="Seleccionar equipo…"
 *   />
 *
 *  El campo se renderiza como un select cerrado. Al tocarlo abre un modal full-screen
 *  con barra de búsqueda y lista de items. Funciona bien con catálogos grandes.
 */
import React, { useMemo, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Modal, TextInput, FlatList,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Radius } from '../theme/colors';

export interface PickerItem {
  id: string;
  label: string;
  sublabel?: string;
  /** Icono Ionicons opcional a la izquierda */
  icon?: string;
}

interface PickerFieldProps {
  label?: string;
  value: string | null;
  items: PickerItem[];
  onChange: (id: string | null) => void;
  placeholder?: string;
  /** Texto que se muestra cuando no hay items (empty state) */
  emptyHint?: string;
  /** Permite limpiar selección con un botón × */
  allowClear?: boolean;
  /** Deshabilita el field (gris, no clickeable) */
  disabled?: boolean;
  /** Mensaje de ayuda debajo del campo */
  helperText?: string;
}

export function PickerField({
  label, value, items, onChange, placeholder = 'Seleccionar…',
  emptyHint, allowClear, disabled, helperText,
}: PickerFieldProps) {
  const [open, setOpen] = useState(false);
  const selected = useMemo(() => items.find(i => i.id === value) ?? null, [items, value]);

  return (
    <View style={styles.fieldWrap}>
      {label && <Text style={styles.fieldLabel}>{label.toUpperCase()}</Text>}
      <TouchableOpacity
        style={[styles.field, disabled && styles.fieldDisabled]}
        onPress={() => !disabled && setOpen(true)}
        activeOpacity={0.7}
      >
        {selected ? (
          <View style={{ flex: 1 }}>
            <Text style={styles.fieldValue} numberOfLines={1}>{selected.label}</Text>
            {selected.sublabel && <Text style={styles.fieldSublabel} numberOfLines={1}>{selected.sublabel}</Text>}
          </View>
        ) : (
          <Text style={styles.fieldPlaceholder}>{placeholder}</Text>
        )}
        {allowClear && selected && !disabled ? (
          <TouchableOpacity
            onPress={(e) => { e.stopPropagation(); onChange(null); }}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="close-circle" size={18} color={Colors.textMuted} />
          </TouchableOpacity>
        ) : (
          <Ionicons name="chevron-down" size={16} color={disabled ? Colors.textMuted : Colors.textSecondary} />
        )}
      </TouchableOpacity>
      {helperText && <Text style={styles.helperText}>{helperText}</Text>}

      <PickerListModal
        visible={open}
        title={label ?? placeholder}
        items={items}
        selectedId={value}
        emptyHint={emptyHint}
        onCancel={() => setOpen(false)}
        onSelect={(id) => { onChange(id); setOpen(false); }}
      />
    </View>
  );
}

// ─── Modal interno ─────────────────────────────────────────────────────────

interface PickerListModalProps {
  visible: boolean;
  title: string;
  items: PickerItem[];
  selectedId: string | null;
  emptyHint?: string;
  onSelect: (id: string) => void;
  onCancel: () => void;
}

function PickerListModal({ visible, title, items, selectedId, emptyHint, onSelect, onCancel }: PickerListModalProps) {
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter(i =>
      i.label.toLowerCase().includes(q)
      || (i.sublabel ?? '').toLowerCase().includes(q),
    );
  }, [items, search]);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onCancel}>
      <View style={styles.modalContainer}>
        <View style={styles.modalHeader}>
          <TouchableOpacity onPress={onCancel} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Ionicons name="close" size={24} color={Colors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.modalTitle} numberOfLines={1}>{title}</Text>
          <View style={{ width: 24 }} />
        </View>

        <View style={styles.searchWrap}>
          <Ionicons name="search" size={16} color={Colors.textMuted} />
          <TextInput
            style={styles.searchInput}
            value={search}
            onChangeText={setSearch}
            placeholder="Buscar…"
            placeholderTextColor={Colors.textMuted}
            autoFocus={false}
            returnKeyType="search"
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="close-circle" size={16} color={Colors.textMuted} />
            </TouchableOpacity>
          )}
        </View>

        <FlatList
          data={filtered}
          keyExtractor={(it) => it.id}
          contentContainerStyle={filtered.length === 0 ? styles.emptyListContainer : undefined}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name={items.length === 0 ? 'archive-outline' : 'search'} size={32} color={Colors.textMuted} />
              <Text style={styles.emptyText}>
                {items.length === 0 ? (emptyHint ?? 'No hay elementos.') : 'Sin resultados para tu búsqueda.'}
              </Text>
            </View>
          }
          renderItem={({ item }) => {
            const isActive = item.id === selectedId;
            return (
              <TouchableOpacity
                style={[styles.row, isActive && styles.rowActive]}
                onPress={() => onSelect(item.id)}
                activeOpacity={0.7}
              >
                {item.icon && (
                  <Ionicons
                    name={item.icon as any}
                    size={18}
                    color={isActive ? Colors.primary : Colors.textSecondary}
                    style={{ marginRight: 10 }}
                  />
                )}
                <View style={{ flex: 1 }}>
                  <Text style={[styles.rowLabel, isActive && { color: Colors.primary, fontWeight: '800' }]}>
                    {item.label}
                  </Text>
                  {item.sublabel && (
                    <Text style={styles.rowSublabel} numberOfLines={1}>{item.sublabel}</Text>
                  )}
                </View>
                {isActive && <Ionicons name="checkmark" size={20} color={Colors.primary} />}
              </TouchableOpacity>
            );
          }}
        />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fieldWrap: { gap: 6, marginBottom: 12 },
  fieldLabel: { fontSize: 10, fontWeight: '800', color: Colors.textMuted, letterSpacing: 1 },
  field: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 12, paddingVertical: 12,
    backgroundColor: Colors.white, borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.border,
    minHeight: 48,
  },
  fieldDisabled: { backgroundColor: Colors.surface, opacity: 0.6 },
  fieldValue: { fontSize: 14, fontWeight: '600', color: Colors.textPrimary },
  fieldSublabel: { fontSize: 11, color: Colors.textMuted, marginTop: 1 },
  fieldPlaceholder: { fontSize: 14, color: Colors.textMuted, flex: 1 },
  helperText: { fontSize: 11, color: Colors.textMuted, marginTop: 2 },

  modalContainer: { flex: 1, backgroundColor: Colors.surface },
  modalHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14,
    backgroundColor: Colors.white,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  modalTitle: {
    flex: 1, fontSize: 15, fontWeight: '800', color: Colors.textPrimary,
    textAlign: 'center', textTransform: 'uppercase', letterSpacing: 0.8,
  },
  searchWrap: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    margin: 12, paddingHorizontal: 12, paddingVertical: 8,
    backgroundColor: Colors.white, borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.border,
  },
  searchInput: { flex: 1, fontSize: 14, color: Colors.textPrimary, paddingVertical: 0 },

  row: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 14,
    backgroundColor: Colors.white,
    borderBottomWidth: 1, borderBottomColor: Colors.divider,
  },
  rowActive: { backgroundColor: Colors.primary + '08' },
  rowLabel: { fontSize: 14, color: Colors.textPrimary, fontWeight: '600' },
  rowSublabel: { fontSize: 11, color: Colors.textMuted, marginTop: 2 },

  emptyListContainer: { flexGrow: 1, justifyContent: 'center' },
  empty: { alignItems: 'center', padding: 30, gap: 8 },
  emptyText: { fontSize: 13, color: Colors.textSecondary, textAlign: 'center' },
});
