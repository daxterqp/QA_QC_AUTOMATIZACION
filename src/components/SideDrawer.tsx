/**
 * SideDrawer (v44) — Menú lateral izquierdo (overlay propio, sin dependencia nativa ni
 * reestructurar la navegación). Se abre SOLO con el botón hamburguesa (sin gestos de
 * borde que choquen con el contenido horizontal de la app). Animado con `Animated`.
 *
 * Encabezado: identidad del usuario + carrusel "Recomendaciones del día".
 * Secciones: Preferencias (idioma), Sobre nosotros, Cambiar contraseña, Contáctenos,
 * Ingresar firma (solo Jefe/Supervisor/Creador) y Gestión de usuarios (Creador).
 * Pie: Cerrar sesión.
 *
 * Fase 1: el cascarón + navegación a lo que ya existe (ChangePassword, UserManagement) +
 * carrusel funcional. Los destinos nuevos (Sobre nosotros, Contáctenos, Idioma, Firma)
 * se completan en la Fase 2 (hoy muestran un aviso "próximamente").
 */
import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Animated, Dimensions, ScrollView, Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Radius, Shadow } from '../theme/colors';
import { useI18n } from '@i18n/index';

const { width: SCREEN_W } = Dimensions.get('window');
const DRAWER_W = Math.min(330, Math.round(SCREEN_W * 0.84));

/** Recomendaciones / datos curiosos para el carrusel (Fase 2 puede ampliarlos / traerlos de la nube). */
const TIPS: { icon: keyof typeof Ionicons.glyphMap; textKey: string }[] = [
  { icon: 'bulb-outline', textKey: 'sideDrawer.tip.qr' },
  { icon: 'leaf-outline', textKey: 'sideDrawer.tip.compaction' },
  { icon: 'shield-checkmark-outline', textKey: 'sideDrawer.tip.calibration' },
  { icon: 'cloud-done-outline', textKey: 'sideDrawer.tip.sync' },
  { icon: 'sparkles-outline', textKey: 'sideDrawer.tip.printing' },
  { icon: 'albums-outline', textKey: 'sideDrawer.tip.grouping' },
  { icon: 'calculator-outline', textKey: 'sideDrawer.tip.formulas' },
  { icon: 'map-outline', textKey: 'sideDrawer.tip.geolocate' },
  { icon: 'alert-circle-outline', textKey: 'sideDrawer.tip.ranges' },
  { icon: 'people-outline', textKey: 'sideDrawer.tip.access' },
  { icon: 'document-text-outline', textKey: 'sideDrawer.tip.dossier' },
  { icon: 'phone-portrait-outline', textKey: 'sideDrawer.tip.parity' },
];

export interface SideDrawerItem {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  danger?: boolean;
}

interface Props {
  visible: boolean;
  onClose: () => void;
  userName: string;
  roleLabel: string;
  roleColor: string;
  initials: string;
  /** Secciones del cuerpo (cada una con título + items). */
  sections: { title?: string; items: SideDrawerItem[] }[];
  /** Item fijo al pie (cerrar sesión). */
  footerItem: SideDrawerItem;
}

export default function SideDrawer({ visible, onClose, userName, roleLabel, roleColor, initials, sections, footerItem }: Props) {
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const slide = useRef(new Animated.Value(-DRAWER_W)).current;   // posición X del panel
  const fade = useRef(new Animated.Value(0)).current;            // opacidad del backdrop
  const [mounted, setMounted] = useState(visible);
  const [tip, setTip] = useState(0);

  useEffect(() => {
    if (visible) {
      setMounted(true);
      Animated.parallel([
        Animated.timing(slide, { toValue: 0, duration: 240, useNativeDriver: true }),
        Animated.timing(fade, { toValue: 1, duration: 240, useNativeDriver: true }),
      ]).start();
    } else if (mounted) {
      Animated.parallel([
        Animated.timing(slide, { toValue: -DRAWER_W, duration: 200, useNativeDriver: true }),
        Animated.timing(fade, { toValue: 0, duration: 200, useNativeDriver: true }),
      ]).start(() => setMounted(false));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  // Carrusel automático de recomendaciones (solo mientras está abierto).
  useEffect(() => {
    if (!visible) return;
    const id = setInterval(() => setTip(t => (t + 1) % TIPS.length), 5000);
    return () => clearInterval(id);
  }, [visible]);

  const handle = useCallback((fn: () => void) => { onClose(); setTimeout(fn, 220); }, [onClose]);

  if (!mounted) return null;
  const curTip = TIPS[tip];

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      {/* Backdrop */}
      <Animated.View style={[StyleSheet.absoluteFill, styles.backdrop, { opacity: fade }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      </Animated.View>

      {/* Panel */}
      <Animated.View style={[styles.panel, { width: DRAWER_W, paddingTop: insets.top, transform: [{ translateX: slide }] }]}>
        {/* Identidad */}
        <View style={styles.identity}>
          <View style={[styles.avatar, { backgroundColor: roleColor }]}>
            <Text style={styles.avatarText}>{initials || '—'}</Text>
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.idName} numberOfLines={1}>{userName || '—'}</Text>
            <View style={[styles.roleBadge, { backgroundColor: roleColor }]}><Text style={styles.roleBadgeText}>{roleLabel}</Text></View>
          </View>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="close" size={24} color={Colors.white} />
          </TouchableOpacity>
        </View>

        {/* Recomendaciones del día (carrusel) */}
        <View style={styles.tipCard}>
          <View style={styles.tipHeaderRow}>
            <Ionicons name="sparkles" size={13} color={Colors.secondary} />
            <Text style={styles.tipHeader}>{t('sideDrawer.tipsHeader')}</Text>
          </View>
          <TouchableOpacity activeOpacity={0.8} onPress={() => setTip(t => (t + 1) % TIPS.length)} style={styles.tipBody}>
            <Ionicons name={curTip.icon} size={22} color={Colors.primary} style={{ marginTop: 1 }} />
            <Text style={styles.tipText}>{t(curTip.textKey)}</Text>
          </TouchableOpacity>
          <View style={styles.dots}>
            {TIPS.map((_, i) => <View key={i} style={[styles.dot, i === tip && styles.dotOn]} />)}
          </View>
        </View>

        {/* Secciones */}
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingVertical: 8 }} showsVerticalScrollIndicator={false}>
          {sections.map((sec, si) => (
            <View key={si} style={styles.section}>
              {sec.title ? <Text style={styles.sectionTitle}>{sec.title}</Text> : null}
              {sec.items.map((it, ii) => (
                <TouchableOpacity key={ii} style={styles.item} activeOpacity={0.7} onPress={() => handle(it.onPress)}>
                  <Ionicons name={it.icon} size={20} color={it.danger ? Colors.danger : Colors.primary} style={{ width: 26 }} />
                  <Text style={[styles.itemLabel, it.danger && { color: Colors.danger }]}>{it.label}</Text>
                  <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
                </TouchableOpacity>
              ))}
            </View>
          ))}
        </ScrollView>

        {/* Pie: cerrar sesión */}
        <TouchableOpacity style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 10) + 6 }]} activeOpacity={0.7} onPress={() => handle(footerItem.onPress)}>
          <Ionicons name={footerItem.icon} size={20} color={Colors.danger} style={{ width: 26 }} />
          <Text style={[styles.itemLabel, { color: Colors.danger, fontWeight: '800' }]}>{footerItem.label}</Text>
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: { backgroundColor: 'rgba(14,33,61,0.5)' },
  panel: { position: 'absolute', left: 0, top: 0, bottom: 0, backgroundColor: Colors.surface, ...Shadow.card, shadowOffset: { width: 4, height: 0 }, shadowOpacity: 0.18 },
  identity: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: Colors.navy, paddingHorizontal: 16, paddingVertical: 14 },
  avatar: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: Colors.white, fontWeight: '900', fontSize: 16 },
  idName: { color: Colors.white, fontWeight: '800', fontSize: 15 },
  roleBadge: { alignSelf: 'flex-start', borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2, marginTop: 3 },
  roleBadgeText: { color: Colors.white, fontSize: 10, fontWeight: '700', letterSpacing: 0.3 },
  tipCard: { margin: 12, backgroundColor: Colors.white, borderRadius: Radius.md, padding: 12, borderWidth: 1, borderColor: Colors.border, ...Shadow.subtle },
  tipHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 6 },
  tipHeader: { fontSize: 11, fontWeight: '800', color: Colors.secondary, textTransform: 'uppercase', letterSpacing: 0.4 },
  tipBody: { flexDirection: 'row', gap: 9, alignItems: 'flex-start', minHeight: 46 },
  tipText: { flex: 1, fontSize: 12.5, color: Colors.textSecondary, lineHeight: 17 },
  dots: { flexDirection: 'row', gap: 5, justifyContent: 'center', marginTop: 8 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.border },
  dotOn: { backgroundColor: Colors.primary, width: 16 },
  section: { paddingHorizontal: 8, marginBottom: 4 },
  sectionTitle: { fontSize: 11, fontWeight: '800', color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.4, paddingHorizontal: 8, marginTop: 10, marginBottom: 2 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 12, paddingHorizontal: 8, borderRadius: Radius.sm },
  itemLabel: { flex: 1, fontSize: 14, color: Colors.textPrimary, fontWeight: '600' },
  footer: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingTop: 12, borderTopWidth: 1, borderTopColor: Colors.border, backgroundColor: Colors.white },
});
