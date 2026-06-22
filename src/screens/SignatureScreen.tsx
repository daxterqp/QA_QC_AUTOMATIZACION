/**
 * SignatureScreen (v44) — "Ingresar firma" PERSONAL del usuario (antes vivía dentro del
 * módulo de cargar archivos del proyecto). La firma es por usuario (`users.signature_uri`
 * + S3 `signatures/{userId}/signature.jpg`) y se reutiliza en todos los PDFs donde el
 * usuario firma. Visible solo para Jefe/Supervisor/Creador (gateado en el menú lateral).
 */
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, ActivityIndicator, Alert, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@navigation/types';
import AppHeader from '@components/AppHeader';
import { useAuth } from '@context/AuthContext';
import { Colors, Radius, Shadow } from '../theme/colors';
import { uploadToS3 } from '@services/S3Service';
import { saveUserSignature, saveUserSignatureS3Key, getOrDownloadSignatureUri } from '@services/UserSignatureService';
import { supabase } from '@config/supabase';
import { useI18n } from '@i18n/index';

type Props = NativeStackScreenProps<RootStackParamList, 'Signature'>;

export default function SignatureScreen({ navigation }: Props) {
  const { t } = useI18n();
  const { currentUser } = useAuth();
  const [uri, setUri] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (currentUser?.id) getOrDownloadSignatureUri(currentUser.id).then(setUri).catch(() => {});
  }, [currentUser?.id]);

  const handlePick = async () => {
    if (!currentUser?.id) return;
    setLoading(true);
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: 'image/*', copyToCacheDirectory: true });
      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0];
      const destUri = await saveUserSignature(currentUser.id, asset.uri);
      setUri(destUri);
      const sigS3Key = `signatures/${currentUser.id}/signature.jpg`;
      await uploadToS3(asset.uri, sigS3Key, 'image/jpeg');
      await saveUserSignatureS3Key(currentUser.id, sigS3Key);
      try { await supabase.from('users').update({ signature_uri: sigS3Key }).eq('id', currentUser.id); } catch { /* offline */ }
      Alert.alert(t('signature.savedTitle'), t('signature.savedMsg'));
    } catch {
      Alert.alert(t('signature.errorTitle'), t('signature.errorMsg'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.flex}>
      <AppHeader title={t('signature.headerTitle')} onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.card}>
          <View style={styles.iconCircle}><Ionicons name="create-outline" size={26} color={Colors.primary} /></View>
          <Text style={styles.title}>{t('signature.cardTitle')}</Text>
          <Text style={styles.desc}>{t('signature.cardDesc')}</Text>

          <View style={styles.preview}>
            {uri ? (
              <Image source={{ uri }} style={styles.previewImg} resizeMode="contain" />
            ) : (
              <View style={styles.placeholder}>
                <Ionicons name="create-outline" size={34} color={Colors.border} />
                <Text style={styles.placeholderText}>{t('signature.noSignature')}</Text>
              </View>
            )}
          </View>

          <TouchableOpacity style={[styles.btn, loading && styles.btnDisabled]} onPress={handlePick} disabled={loading} activeOpacity={0.85}>
            {loading
              ? <ActivityIndicator color={Colors.white} />
              : <><Ionicons name="cloud-upload-outline" size={18} color={Colors.white} /><Text style={styles.btnText}>{uri ? t('signature.changeBtn') : t('signature.uploadBtn')}</Text></>}
          </TouchableOpacity>
        </View>

        <View style={styles.hintCard}>
          <Ionicons name="information-circle-outline" size={18} color={Colors.secondary} />
          <Text style={styles.hintText}>{t('signature.hint')}</Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: Colors.surface },
  container: { padding: 16, gap: 14 },
  card: { backgroundColor: Colors.white, borderRadius: Radius.lg, padding: 20, alignItems: 'center', ...Shadow.card },
  iconCircle: { width: 54, height: 54, borderRadius: 27, backgroundColor: Colors.divider, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  title: { fontSize: 18, fontWeight: '800', color: Colors.navy },
  desc: { fontSize: 13, color: Colors.textSecondary, textAlign: 'center', marginTop: 6, lineHeight: 19 },
  preview: { width: '100%', height: 150, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border, backgroundColor: '#fbfcfe', alignItems: 'center', justifyContent: 'center', marginTop: 16, overflow: 'hidden' },
  previewImg: { width: '90%', height: '90%' },
  placeholder: { alignItems: 'center', gap: 6 },
  placeholderText: { fontSize: 12, color: Colors.textMuted },
  btn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: Colors.primary, paddingVertical: 14, borderRadius: Radius.md, marginTop: 16, width: '100%' },
  btnDisabled: { opacity: 0.6 },
  btnText: { color: Colors.white, fontWeight: '800', fontSize: 15 },
  hintCard: { flexDirection: 'row', gap: 10, backgroundColor: '#eef3fb', borderRadius: Radius.md, padding: 14, alignItems: 'flex-start' },
  hintText: { flex: 1, fontSize: 12, color: Colors.textSecondary, lineHeight: 17 },
});
