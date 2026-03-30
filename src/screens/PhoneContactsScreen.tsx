import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  TextInput, Alert, Linking, Modal, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import * as XLSX from 'xlsx';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@navigation/types';
import AppHeader from '@components/AppHeader';
import { Colors, Radius, Shadow } from '../theme/colors';
import { database, phoneContactsCollection } from '@db/index';
import { Q } from '@nozbe/watermelondb';
import type PhoneContact from '@models/PhoneContact';
import { useAuth } from '@context/AuthContext';
import { pushPhoneContact, deletePhoneContactRemote, pullPhoneContacts } from '@services/SupabaseSyncService';

type Props = NativeStackScreenProps<RootStackParamList, 'PhoneContacts'>;

interface ContactForm {
  name: string;
  phone: string;
  role: string;
}

const EMPTY_FORM: ContactForm = { name: '', phone: '', role: '' };

export default function PhoneContactsScreen({ navigation, route }: Props) {
  const { projectId, projectName } = route.params;
  const { currentUser } = useAuth();
  const isJefe = currentUser?.role === 'RESIDENT' || currentUser?.role === 'CREATOR';

  const [contacts, setContacts] = useState<PhoneContact[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [editingContact, setEditingContact] = useState<PhoneContact | null>(null);
  const [form, setForm] = useState<ContactForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    // Bajar contactos desde Supabase al abrir
    pullPhoneContacts(projectId).catch(() => {});

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
      let saved: PhoneContact | null = null;
      await database.write(async () => {
        if (editingContact) {
          await editingContact.update(c => {
            c.name = form.name.trim();
            c.phone = form.phone.trim();
            c.role = form.role.trim() || null;
          });
          saved = editingContact;
        } else {
          saved = await phoneContactsCollection.create(c => {
            c.projectId = projectId;
            c.name = form.name.trim();
            c.phone = form.phone.trim();
            c.role = form.role.trim() || null;
            c.sortOrder = contacts.length;
          });
        }
      });
      if (saved) pushPhoneContact(saved).catch(() => {});
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
            const id = contact.id;
            await database.write(async () => { await contact.destroyPermanently(); });
            deletePhoneContactRemote(id).catch(() => {});
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

  // ── Importar desde Excel ─────────────────────────────────────────────────
  // Columnas esperadas:
  //   A: Nombre y apellido
  //   B: Rol / Cargo
  //   C: Prefijo (ej: +51)
  //   D: Número de celular

  const handleImportExcel = async () => {
    setImporting(true);
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
               'application/vnd.ms-excel', '*/*'],
        copyToCacheDirectory: true,
      });
      if (result.canceled || !result.assets?.[0]) return;

      const asset = result.assets[0];
      const b64 = await FileSystem.readAsStringAsync(asset.uri, {
        encoding: FileSystem.EncodingType.Base64,
      });

      const wb = XLSX.read(b64, { type: 'base64' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1 });

      // Filtrar filas vacías y saltar encabezado si la primera celda no es un número/texto de nombre
      const dataRows = rows.filter(r => r.length >= 1 && String(r[0] ?? '').trim() !== '');

      if (dataRows.length === 0) {
        Alert.alert('Sin datos', 'El archivo no contiene filas válidas.');
        return;
      }

      let imported = 0;
      let skipped = 0;

      const created: PhoneContact[] = [];
      await database.write(async () => {
        for (let i = 0; i < dataRows.length; i++) {
          const row = dataRows[i];
          const name = String(row[0] ?? '').trim();
          const role = String(row[1] ?? '').trim();
          const prefix = String(row[2] ?? '').trim();
          const number = String(row[3] ?? '').trim();

          if (!name || !number) { skipped++; continue; }

          const phone = prefix ? `${prefix}${number}` : number;

          const c = await phoneContactsCollection.create(ct => {
            ct.projectId = projectId;
            ct.name = name;
            ct.phone = phone;
            ct.role = role || null;
            ct.sortOrder = contacts.length + imported;
          });
          created.push(c);
          imported++;
        }
      });
      // Subir a Supabase en background
      for (const c of created) pushPhoneContact(c).catch(() => {});

      Alert.alert(
        'Importación completada',
        `${imported} contacto${imported !== 1 ? 's' : ''} importado${imported !== 1 ? 's' : ''}.${skipped > 0 ? ` (${skipped} fila${skipped !== 1 ? 's' : ''} omitida${skipped !== 1 ? 's' : ''} por datos incompletos)` : ''}`,
      );
    } catch (err) {
      Alert.alert('Error', `No se pudo importar el archivo.\n${String(err)}`);
    } finally {
      setImporting(false);
    }
  };

  return (
    <View style={styles.container}>
      <AppHeader
        title="Contactos"
        subtitle={projectName}
        onBack={() => navigation.goBack()}
        rightContent={
          isJefe ? (
            <View style={styles.headerActions}>
              <TouchableOpacity
                onPress={handleImportExcel}
                disabled={importing}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                {importing
                  ? <ActivityIndicator size="small" color={Colors.white} />
                  : <Ionicons name="document-text-outline" size={24} color={Colors.white} />
                }
              </TouchableOpacity>
              <TouchableOpacity onPress={openAdd} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Ionicons name="add-circle-outline" size={26} color={Colors.white} />
              </TouchableOpacity>
            </View>
          ) : undefined
        }
      />

      <FlatList
        data={contacts}
        keyExtractor={c => c.id}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          contacts.length === 0 ? null : (
            <Text style={styles.hint}>
              Toca <Ionicons name="document-text-outline" size={12} /> para importar desde Excel · Columnas: Nombre | Rol | Prefijo | Teléfono
            </Text>
          )
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="call-outline" size={40} color={Colors.textMuted} />
            <Text style={styles.emptyText}>Sin contactos aún.</Text>
            <Text style={styles.emptyHint}>Toca + para agregar manualmente</Text>
            <Text style={styles.emptyHint}>o 📄 para importar desde Excel.</Text>
            <Text style={styles.excelFormat}>Formato Excel:{'\n'}Col A: Nombre y Apellido{'\n'}Col B: Rol / Cargo{'\n'}Col C: Prefijo (ej: +51){'\n'}Col D: Número de celular</Text>
          </View>
        }
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={styles.cardBody}>
              <Text style={styles.cardName}>{item.name}</Text>
              {item.role ? <Text style={styles.cardRole}>{item.role}</Text> : null}
              <Text style={styles.cardPhone}>{item.phone}</Text>
            </View>

            <View style={styles.cardActions}>
              <TouchableOpacity onPress={() => callContact(item.phone)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="call-outline" size={18} color={Colors.primary} />
              </TouchableOpacity>
              {isJefe && (
                <>
                  <TouchableOpacity onPress={() => openEdit(item)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Ionicons name="pencil-outline" size={18} color={Colors.textSecondary} />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => deleteContact(item)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Ionicons name="trash-outline" size={18} color={Colors.danger} />
                  </TouchableOpacity>
                </>
              )}
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

            <Text style={styles.fieldLabel}>Teléfono * (con prefijo)</Text>
            <TextInput
              style={styles.input}
              value={form.phone}
              onChangeText={v => setForm(f => ({ ...f, phone: v }))}
              placeholder="+51 9 XXXX XXXX"
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

  headerActions: { flexDirection: 'row', gap: 14, alignItems: 'center' },

  list: { padding: 16, gap: 10, paddingBottom: 40 },

  hint: { fontSize: 11, color: Colors.textMuted, textAlign: 'center', marginBottom: 8 },

  empty: { alignItems: 'center', paddingTop: 60, gap: 8 },
  emptyText: { fontSize: 15, color: Colors.textMuted, fontWeight: '600' },
  emptyHint: { fontSize: 12, color: Colors.textMuted, textAlign: 'center' },
  excelFormat: {
    marginTop: 12, fontSize: 11, color: Colors.textMuted, textAlign: 'center',
    backgroundColor: Colors.white, borderRadius: Radius.md, padding: 12,
    lineHeight: 18, borderWidth: 1, borderColor: Colors.border,
  },

  card: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: Colors.white, borderRadius: Radius.md,
    padding: 14, gap: 12, ...Shadow.subtle,
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
