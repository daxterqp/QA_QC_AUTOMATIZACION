import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  TextInput, Alert, Linking, Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@navigation/types';
import AppHeader from '@components/AppHeader';
import { Colors, Radius, Shadow } from '../theme/colors';
import { database, phoneContactsCollection } from '@db/index';
import { Q } from '@nozbe/watermelondb';
import type PhoneContact from '@models/PhoneContact';

type Props = NativeStackScreenProps<RootStackParamList, 'PhoneContacts'>;

interface ContactForm {
  name: string;
  phone: string;
  role: string;
}

const EMPTY_FORM: ContactForm = { name: '', phone: '', role: '' };

export default function PhoneContactsScreen({ navigation, route }: Props) {
  const { projectId, projectName } = route.params;
  const [contacts, setContacts] = useState<PhoneContact[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [editingContact, setEditingContact] = useState<PhoneContact | null>(null);
  const [form, setForm] = useState<ContactForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const sub = phoneContactsCollection
      .query(Q.where('project_id', projectId), Q.sortBy('sort_order', Q.asc), Q.sortBy('created_at', Q.asc))
      .observe()
      .subscribe(setContacts);
    return () => sub.unsubscribe();
  }, [projectId]);

  const openAdd = () => {
    setEditingContact(null);
    setForm(EMPTY_FORM);
    setShowModal(true);
  };

  const openEdit = (contact: PhoneContact) => {
    setEditingContact(contact);
    setForm({ name: contact.name, phone: contact.phone, role: contact.role ?? '' });
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingContact(null);
    setForm(EMPTY_FORM);
  };

  const saveContact = async () => {
    if (!form.name.trim() || !form.phone.trim()) return;
    setSaving(true);
    try {
      await database.write(async () => {
        if (editingContact) {
          await editingContact.update(c => {
            c.name = form.name.trim();
            c.phone = form.phone.trim();
            c.role = form.role.trim() || null;
          });
        } else {
          await phoneContactsCollection.create(c => {
            c.projectId = projectId;
            c.name = form.name.trim();
            c.phone = form.phone.trim();
            c.role = form.role.trim() || null;
            c.sortOrder = contacts.length;
          });
        }
      });
      closeModal();
    } finally {
      setSaving(false);
    }
  };

  const deleteContact = (contact: PhoneContact) => {
    Alert.alert(
      'Eliminar contacto',
      `¿Eliminar a ${contact.name}?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar', style: 'destructive',
          onPress: async () => {
            await database.write(async () => { await contact.destroyPermanently(); });
          },
        },
      ],
    );
  };

  const callContact = (phone: string) => {
    Linking.openURL(`tel:${phone}`).catch(() => {
      Alert.alert('Error', 'No se puede abrir el marcador en este dispositivo.');
    });
  };

  return (
    <View style={styles.container}>
      <AppHeader
        title="Contactos"
        subtitle={projectName}
        onBack={() => navigation.goBack()}
        rightContent={
          <TouchableOpacity onPress={openAdd} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="add-circle-outline" size={26} color={Colors.white} />
          </TouchableOpacity>
        }
      />

      <FlatList
        data={contacts}
        keyExtractor={c => c.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="call-outline" size={40} color={Colors.textMuted} />
            <Text style={styles.emptyText}>Sin contactos aún.</Text>
            <Text style={styles.emptyHint}>Toca + para agregar un número importante.</Text>
          </View>
        }
        renderItem={({ item }) => (
          <View style={styles.card}>
            <TouchableOpacity style={styles.callBtn} onPress={() => callContact(item.phone)}>
              <Ionicons name="call" size={20} color={Colors.white} />
            </TouchableOpacity>

            <View style={styles.cardBody}>
              <Text style={styles.cardName}>{item.name}</Text>
              {item.role ? <Text style={styles.cardRole}>{item.role}</Text> : null}
              <Text style={styles.cardPhone}>{item.phone}</Text>
            </View>

            <View style={styles.cardActions}>
              <TouchableOpacity onPress={() => openEdit(item)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="pencil-outline" size={18} color={Colors.primary} />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => deleteContact(item)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="trash-outline" size={18} color={Colors.danger} />
              </TouchableOpacity>
            </View>
          </View>
        )}
      />

      <Modal visible={showModal} transparent animationType="slide" onRequestClose={closeModal}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{editingContact ? 'Editar contacto' : 'Nuevo contacto'}</Text>

            <Text style={styles.fieldLabel}>Nombre *</Text>
            <TextInput
              style={styles.input}
              value={form.name}
              onChangeText={v => setForm(f => ({ ...f, name: v }))}
              placeholder="Ej: Juan Pérez"
              placeholderTextColor={Colors.textMuted}
            />

            <Text style={styles.fieldLabel}>Teléfono *</Text>
            <TextInput
              style={styles.input}
              value={form.phone}
              onChangeText={v => setForm(f => ({ ...f, phone: v }))}
              placeholder="+56 9 XXXX XXXX"
              placeholderTextColor={Colors.textMuted}
              keyboardType="phone-pad"
            />

            <Text style={styles.fieldLabel}>Cargo / Rol</Text>
            <TextInput
              style={styles.input}
              value={form.role}
              onChangeText={v => setForm(f => ({ ...f, role: v }))}
              placeholder="Ej: Jefe de Obra"
              placeholderTextColor={Colors.textMuted}
            />

            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.cancelBtn} onPress={closeModal}>
                <Text style={styles.cancelBtnText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.saveBtn, (!form.name.trim() || !form.phone.trim() || saving) && styles.saveBtnDisabled]}
                onPress={saveContact}
                disabled={!form.name.trim() || !form.phone.trim() || saving}
              >
                <Text style={styles.saveBtnText}>{saving ? 'Guardando…' : 'Guardar'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.surface },

  list: { padding: 16, gap: 10, paddingBottom: 40 },

  empty: { alignItems: 'center', paddingTop: 60, gap: 10 },
  emptyText: { fontSize: 15, color: Colors.textMuted, fontWeight: '600' },
  emptyHint: { fontSize: 12, color: Colors.textMuted, textAlign: 'center' },

  card: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: Colors.white, borderRadius: Radius.md,
    padding: 14, gap: 12, ...Shadow.subtle,
  },
  callBtn: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: Colors.primary,
    justifyContent: 'center', alignItems: 'center',
  },
  cardBody: { flex: 1 },
  cardName: { fontSize: 14, fontWeight: '700', color: Colors.navy },
  cardRole: { fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
  cardPhone: { fontSize: 13, color: Colors.primary, marginTop: 3, fontWeight: '600' },
  cardActions: { flexDirection: 'row', gap: 14 },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(14,33,61,0.6)', justifyContent: 'flex-end' },
  modalCard: {
    backgroundColor: Colors.white, borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: 24, gap: 8,
  },
  modalTitle: { fontSize: 16, fontWeight: '800', color: Colors.navy, marginBottom: 8 },
  fieldLabel: { fontSize: 12, fontWeight: '700', color: Colors.textSecondary, letterSpacing: 0.5, marginTop: 8 },
  input: {
    backgroundColor: Colors.surface, borderRadius: Radius.md,
    padding: 12, fontSize: 14, color: Colors.textPrimary,
    borderWidth: 1, borderColor: Colors.border,
  },
  modalActions: { flexDirection: 'row', gap: 10, marginTop: 16 },
  cancelBtn: { flex: 1, borderRadius: Radius.md, paddingVertical: 14, alignItems: 'center', borderWidth: 1, borderColor: Colors.border },
  cancelBtnText: { fontSize: 14, fontWeight: '600', color: Colors.textSecondary },
  saveBtn: { flex: 1, borderRadius: Radius.md, paddingVertical: 14, alignItems: 'center', backgroundColor: Colors.primary },
  saveBtnDisabled: { opacity: 0.5 },
  saveBtnText: { fontSize: 14, fontWeight: '700', color: Colors.white },
});
