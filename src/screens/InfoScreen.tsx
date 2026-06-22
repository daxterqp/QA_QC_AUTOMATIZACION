/**
 * InfoScreen (v44) — Pantalla informativa parametrizada: "Sobre nosotros" y "Contáctenos".
 * Accesible desde el menú lateral. Estática y profesional (sin datos sensibles).
 */
import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Linking, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@navigation/types';
import AppHeader from '@components/AppHeader';
import { useI18n } from '@i18n/index';
import { Colors, Radius, Shadow } from '../theme/colors';

type Props = NativeStackScreenProps<RootStackParamList, 'Info'>;

const CONTACT_EMAIL = 'admin@teamvastoria.com';
const CONTACT_PHONE = '+51 973785282';

export default function InfoScreen({ route, navigation }: Props) {
  const { t } = useI18n();
  const kind = route.params?.kind ?? 'about';
  const isAbout = kind === 'about';

  const open = (url: string) => Linking.openURL(url).catch(() => Alert.alert(t('info.linkUnavailableTitle'), t('info.linkUnavailableMsg')));

  return (
    <View style={styles.flex}>
      <AppHeader title={isAbout ? t('info.aboutTitle') : t('info.contactTitle')} onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.hero}>
          <View style={styles.logoCircle}><Ionicons name={isAbout ? 'cube' : 'chatbubbles'} size={30} color={Colors.white} /></View>
          <Text style={styles.brand}>Flow QC</Text>
          <Text style={styles.tagline}>{t('info.tagline')}</Text>
        </View>

        {isAbout ? (
          <>
            <View style={styles.card}>
              <Text style={styles.h}>{t('info.whoTitle')}</Text>
              <Text style={styles.p}>{t('info.whoBody')}</Text>
            </View>
            <View style={styles.card}>
              <Text style={styles.h}>{t('info.companyTitle')}</Text>
              <Text style={styles.p}>{t('info.companyBody')}</Text>
            </View>
            <View style={styles.card}>
              <Text style={styles.h}>{t('info.missionTitle')}</Text>
              <Text style={styles.p}>{t('info.missionBody')}</Text>
            </View>
            <Text style={styles.version}>{t('info.version', { version: 44 })}</Text>
          </>
        ) : (
          <>
            <Text style={styles.intro}>¿Dudas, soporte o sugerencias? Escríbenos por cualquiera de estos medios:</Text>
            <TouchableOpacity style={styles.row} activeOpacity={0.8} onPress={() => open(`mailto:${CONTACT_EMAIL}`)}>
              <View style={styles.rowIcon}><Ionicons name="mail" size={20} color={Colors.primary} /></View>
              <View style={{ flex: 1 }}><Text style={styles.rowLabel}>Correo</Text><Text style={styles.rowValue}>{CONTACT_EMAIL}</Text></View>
              <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.row} activeOpacity={0.8} onPress={() => open(`https://wa.me/${CONTACT_PHONE.replace(/[^0-9]/g, '')}`)}>
              <View style={styles.rowIcon}><Ionicons name="logo-whatsapp" size={20} color={Colors.success} /></View>
              <View style={{ flex: 1 }}><Text style={styles.rowLabel}>WhatsApp</Text><Text style={styles.rowValue}>{CONTACT_PHONE}</Text></View>
              <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.row} activeOpacity={0.8} onPress={() => open(`tel:${CONTACT_PHONE.replace(/[^0-9+]/g, '')}`)}>
              <View style={styles.rowIcon}><Ionicons name="call" size={20} color={Colors.secondary} /></View>
              <View style={{ flex: 1 }}><Text style={styles.rowLabel}>Teléfono</Text><Text style={styles.rowValue}>{CONTACT_PHONE}</Text></View>
              <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
            </TouchableOpacity>
            <Text style={styles.version}>Horario de atención: L–V, 9:00–18:00</Text>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: Colors.surface },
  container: { padding: 16, gap: 12 },
  hero: { alignItems: 'center', paddingVertical: 18 },
  logoCircle: { width: 64, height: 64, borderRadius: 32, backgroundColor: Colors.navy, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  brand: { fontSize: 22, fontWeight: '900', color: Colors.navy, letterSpacing: 0.5 },
  tagline: { fontSize: 13, color: Colors.textSecondary, textAlign: 'center', marginTop: 4, paddingHorizontal: 20 },
  card: { backgroundColor: Colors.white, borderRadius: Radius.md, padding: 16, ...Shadow.subtle },
  h: { fontSize: 15, fontWeight: '800', color: Colors.navy, marginBottom: 6 },
  p: { fontSize: 13, color: Colors.textSecondary, lineHeight: 20 },
  intro: { fontSize: 13, color: Colors.textSecondary, lineHeight: 19, marginBottom: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: Colors.white, borderRadius: Radius.md, padding: 14, ...Shadow.subtle },
  rowIcon: { width: 38, height: 38, borderRadius: 19, backgroundColor: Colors.divider, alignItems: 'center', justifyContent: 'center' },
  rowLabel: { fontSize: 11, color: Colors.textMuted, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.3 },
  rowValue: { fontSize: 14, color: Colors.textPrimary, fontWeight: '600', marginTop: 1 },
  version: { fontSize: 11, color: Colors.textMuted, textAlign: 'center', marginTop: 10 },
});
