/**
 * QRScannerScreen — Scanner de QR de protocolos (FASE 7).
 *
 * Usa el `useCodeScanner` de react-native-vision-camera v4.
 * Cuando detecta un QR `flow://protocol/<identifier>`, lo resuelve contra
 * los protocolos locales y navega a ProtocolAudit (SUBMITTED/APPROVED) o
 * ProtocolFill (DRAFT/IN_PROGRESS/REJECTED).
 *
 * El identifier tiene el formato:
 *   <id_protocolo>-<external_id>            (protocolo histórico)
 *   <id_protocolo>-<UUIDshort8>             (protocolo creado in-app)
 *
 * Si no se encuentra el protocolo: mensaje claro al usuario.
 * Si el QR es de otra app (no `flow://`): se ignora (sigue escaneando).
 */

import React, { useCallback, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Alert, ActivityIndicator, Linking,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import {
  Camera,
  useCameraDevice,
  useCameraPermission,
  useCodeScanner,
  type Code,
} from 'react-native-vision-camera';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Q } from '@nozbe/watermelondb';
import { protocolsCollection, protocolTemplatesCollection, samplesCollection, projectsCollection } from '@db/index';
import type { RootStackParamList } from '@navigation/types';
import { Colors, Radius } from '../theme/colors';
import { useI18n } from '@i18n/index';

type Props = NativeStackScreenProps<RootStackParamList, 'QRScanner'>;

export default function QRScannerScreen({ navigation }: Props) {
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const device = useCameraDevice('back');
  const { hasPermission, requestPermission } = useCameraPermission();
  const [isResolving, setIsResolving] = useState(false);
  /** Evita múltiples disparos del scanner mientras procesamos uno. */
  const lockRef = useRef(false);

  // ── Resolver ──────────────────────────────────────────────────────────────

  const resolveAndNavigate = useCallback(async (rawValue: string) => {
    if (lockRef.current) return;
    lockRef.current = true;
    setIsResolving(true);

    try {
      // v43 — QR de MUESTRA: flow://sample/<sampleCode> → pantalla de la muestra.
      const ms = rawValue.match(/^flow:\/\/sample\/(.+)$/);
      if (ms) {
        const code = decodeURIComponent(ms[1]).trim();
        const found = await samplesCollection.query(Q.where('sample_code', code)).fetch();
        const sample: any = found[0] ?? null;
        if (!sample) {
          Alert.alert(t('qr.sampleNotFoundTitle'), t('qr.sampleNotFoundMsg', { code }),
            [{ text: t('qr.ok'), onPress: () => { setIsResolving(false); lockRef.current = false; } }]);
          return;
        }
        const proj: any = await projectsCollection.find(sample.projectId).catch(() => null);
        navigation.replace('SampleDetail' as any, { projectId: sample.projectId, projectName: proj?.name ?? t('qr.projectFallback'), sampleId: sample.id });
        return;
      }

      const m = rawValue.match(/^flow:\/\/protocol\/(.+)$/);
      if (!m) {
        // QR no es del sistema → liberar lock y seguir escaneando
        setIsResolving(false);
        lockRef.current = false;
        return;
      }
      const identifier = decodeURIComponent(m[1]).trim();

      const protos = await protocolsCollection.query().fetch();
      const tIds = Array.from(new Set(
        protos.map((p: any) => p.templateId).filter(Boolean) as string[],
      ));
      const tmpls = tIds.length > 0
        ? await protocolTemplatesCollection.query(Q.where('id', Q.oneOf(tIds))).fetch()
        : [];
      const idProtoByTmpl: Record<string, string> = {};
      for (const t of tmpls as any[]) idProtoByTmpl[t.id] = t.idProtocolo;

      let matched: any = null;
      for (const p of protos as any[]) {
        const idProto = (p.templateId && idProtoByTmpl[p.templateId]) || 'PROTO';
        const candidate = p.externalId
          ? `${idProto}-${p.externalId}`
          : `${idProto}-${String(p.id).replace(/-/g, '').slice(0, 8).toUpperCase()}`;
        if (candidate === identifier) { matched = p; break; }
      }

      if (!matched) {
        Alert.alert(
          t('qr.protocolNotFoundTitle'),
          t('qr.protocolNotFoundMsg', { identifier }),
          [{
            text: t('qr.ok'),
            onPress: () => {
              setIsResolving(false);
              lockRef.current = false;
            },
          }],
        );
        return;
      }

      const status = matched.status;
      const targetScreen = (status === 'APPROVED' || status === 'SUBMITTED')
        ? 'ProtocolAudit'
        : 'ProtocolFill';
      // Reemplaza la pantalla del scanner por la del protocolo (back vuelve al origen).
      navigation.replace(targetScreen as any, { protocolId: matched.id });
    } catch (e) {
      console.warn('[QRScanner] resolveAndNavigate falló:', e);
      Alert.alert(t('qr.errorTitle'), t('qr.errorMsg'), [{
        text: t('qr.ok'),
        onPress: () => { setIsResolving(false); lockRef.current = false; },
      }]);
    }
  }, [navigation, t]);

  // ── Scanner ────────────────────────────────────────────────────────────────

  const codeScanner = useCodeScanner({
    codeTypes: ['qr'],
    onCodeScanned: (codes: Code[]) => {
      // El scanner puede emitir varios codes simultáneos; tomamos el primero válido.
      for (const c of codes) {
        if (c.value) {
          void resolveAndNavigate(c.value);
          return;
        }
      }
    },
  });

  // ── Permisos / device gates ────────────────────────────────────────────────

  if (!hasPermission) {
    return (
      <View style={[styles.gate, { paddingTop: insets.top + 20 }]}>
        <Ionicons name="camera-outline" size={56} color={Colors.textSecondary} />
        <Text style={styles.gateTitle}>{t('qr.permTitle')}</Text>
        <Text style={styles.gateText}>
          {t('qr.permText')}
        </Text>
        <TouchableOpacity style={styles.gateBtn} onPress={async () => {
          const ok = await requestPermission();
          if (!ok) Linking.openSettings();
        }}>
          <Text style={styles.gateBtnText}>{t('qr.grantPerm')}</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => navigation.goBack()} style={{ marginTop: 16 }}>
          <Text style={{ color: Colors.textSecondary, fontWeight: '600' }}>{t('qr.cancel')}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!device) {
    return (
      <View style={styles.gate}>
        <Text style={styles.gateText}>{t('qr.noCamera')}</Text>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.gateBtn}>
          <Text style={styles.gateBtnText}>{t('qr.back')}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ── Render scanner ─────────────────────────────────────────────────────────

  return (
    <View style={styles.root}>
      <Camera
        style={StyleSheet.absoluteFill}
        device={device}
        isActive={!isResolving}
        codeScanner={codeScanner}
      />

      {/* Overlay: ventana central + bordes oscuros */}
      <View style={styles.overlay} pointerEvents="none">
        <View style={styles.overlayBand} />
        <View style={styles.overlayMiddle}>
          <View style={styles.overlayBand} />
          <View style={styles.scanWindow}>
            {/* esquinas de marco */}
            <View style={[styles.corner, styles.cornerTL]} />
            <View style={[styles.corner, styles.cornerTR]} />
            <View style={[styles.corner, styles.cornerBL]} />
            <View style={[styles.corner, styles.cornerBR]} />
          </View>
          <View style={styles.overlayBand} />
        </View>
        <View style={styles.overlayBand}>
          <Text style={styles.hintText}>
            {isResolving ? t('qr.processing') : t('qr.hint')}
          </Text>
        </View>
      </View>

      {/* Top bar */}
      <View style={[styles.topBar, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.closeBtn}>
          <Ionicons name="close" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.topTitle}>Escanear QR</Text>
        <View style={{ width: 40 }} />
      </View>

      {isResolving && (
        <View style={styles.spinnerWrap}>
          <ActivityIndicator size="large" color="#fff" />
        </View>
      )}
    </View>
  );
}

const SCAN_SIZE = 250;
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  gate: {
    flex: 1, backgroundColor: Colors.surface,
    alignItems: 'center', justifyContent: 'center', padding: 24,
  },
  gateTitle: {
    fontSize: 18, fontWeight: '800', color: Colors.textPrimary, marginTop: 16, marginBottom: 4, textAlign: 'center',
  },
  gateText: {
    fontSize: 14, color: Colors.textSecondary, textAlign: 'center', marginBottom: 20,
  },
  gateBtn: {
    backgroundColor: Colors.primary, paddingHorizontal: 24, paddingVertical: 12,
    borderRadius: Radius.md,
  },
  gateBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },

  overlay: { ...StyleSheet.absoluteFillObject, justifyContent: 'center' },
  overlayMiddle: { flexDirection: 'row', alignItems: 'center' },
  overlayBand: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)' },
  scanWindow: {
    width: SCAN_SIZE, height: SCAN_SIZE,
    borderRadius: 16, position: 'relative',
  },
  corner: {
    position: 'absolute', width: 28, height: 28,
    borderColor: '#fff',
  },
  cornerTL: { top: -1, left: -1, borderTopWidth: 4, borderLeftWidth: 4, borderTopLeftRadius: 12 },
  cornerTR: { top: -1, right: -1, borderTopWidth: 4, borderRightWidth: 4, borderTopRightRadius: 12 },
  cornerBL: { bottom: -1, left: -1, borderBottomWidth: 4, borderLeftWidth: 4, borderBottomLeftRadius: 12 },
  cornerBR: { bottom: -1, right: -1, borderBottomWidth: 4, borderRightWidth: 4, borderBottomRightRadius: 12 },

  hintText: {
    color: '#fff', textAlign: 'center', fontSize: 14, fontWeight: '600',
    padding: 16, textShadowColor: 'rgba(0,0,0,0.8)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3,
  },

  topBar: {
    position: 'absolute', top: 0, left: 0, right: 0,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 12, paddingBottom: 12,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  closeBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center', justifyContent: 'center',
  },
  topTitle: { color: '#fff', fontSize: 16, fontWeight: '700' },

  spinnerWrap: {
    ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
});
