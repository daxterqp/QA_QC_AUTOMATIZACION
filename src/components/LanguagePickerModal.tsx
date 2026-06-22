/**
 * LanguagePickerModal (v46) — Selector de idioma (ES/EN/PT). El cambio es por
 * dispositivo (persistido en AsyncStorage por el LanguageProvider) y re-renderiza
 * toda la app al instante.
 */
import React from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useI18n, LANGS, LANG_LABEL, type Lang } from '@i18n/index';
import { Colors, Radius, Shadow } from '../theme/colors';

const FLAG: Record<Lang, string> = { es: '🇪🇸', en: '🇬🇧', pt: '🇧🇷' };

export default function LanguagePickerModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { lang, setLang, t } = useI18n();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={onClose}>
        <View style={styles.card} onStartShouldSetResponder={() => true}>
          <Text style={styles.title}>{t('language.title')}</Text>
          <Text style={styles.subtitle}>{t('language.subtitle')}</Text>
          {LANGS.map(l => {
            const selected = l === lang;
            return (
              <TouchableOpacity
                key={l}
                style={[styles.option, selected && styles.optionSelected]}
                onPress={() => { setLang(l); onClose(); }}
              >
                <Text style={styles.flag}>{FLAG[l]}</Text>
                <Text style={[styles.optionText, selected && styles.optionTextSelected]}>{LANG_LABEL[l]}</Text>
                {selected && <Ionicons name="checkmark-circle" size={20} color={Colors.primary} />}
              </TouchableOpacity>
            );
          })}
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center', padding: 28 },
  card: { width: '100%', maxWidth: 340, backgroundColor: Colors.white, borderRadius: Radius.lg, padding: 18, ...Shadow.card },
  title: { fontSize: 17, fontWeight: '900', color: Colors.navy },
  subtitle: { fontSize: 12.5, color: Colors.textSecondary, marginTop: 3, marginBottom: 12 },
  option: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 12, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border, marginTop: 8 },
  optionSelected: { borderColor: Colors.primary, backgroundColor: Colors.primary + '0F' },
  flag: { fontSize: 20 },
  optionText: { flex: 1, fontSize: 15, fontWeight: '700', color: Colors.textPrimary },
  optionTextSelected: { color: Colors.primary },
});
