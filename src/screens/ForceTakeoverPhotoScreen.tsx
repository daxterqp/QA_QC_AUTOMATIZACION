/**
 * ForceTakeoverPhotoScreen — pantalla full-screen para capturar la foto
 * obligatoria del equipo durante una toma forzada (v30 Trazabilidad).
 *
 * Flujo:
 *   1. Usuario confirmó tomar el equipo (ForceOverrideModal).
 *   2. Esta pantalla abre la cámara via useCamera (mismo hook que CameraScreen).
 *   3. Al tomar la foto → llama forceTakeover() (cierra sesión ajena + abre
 *      nueva propia + asocia foto como evidence).
 *   4. Reemplaza navegación con TraceabilityRunning de la nueva sesión.
 *
 *  Sin compresión/stamp para no demorar el handoff. La cola UPLOAD_PHOTO los
 *  subirá igual a S3. */
import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Camera } from 'react-native-vision-camera';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@navigation/types';
import { useCamera } from '@hooks/useCamera';
import { forceTakeover } from '@services/WorkSessionService';
import { showToast } from '@components/Toast';
import { useI18n } from '@i18n/index';

type Props = NativeStackScreenProps<RootStackParamList, 'ForceTakeoverPhoto'>;

export default function ForceTakeoverPhotoScreen({ route, navigation }: Props) {
  const { t } = useI18n();
  const { prevSessionId, newSessionInput } = route.params;
  const { cameraRef, device, hasPermission, isLoading, requestPermission, takePhoto } = useCamera();
  const [busy, setBusy] = useState(false);

  const handleCapture = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try {
      const photo = await takePhoto();
      if (!photo) { setBusy(false); return; }
      const photoUri = photo.path.startsWith('file://') ? photo.path : `file://${photo.path}`;
      const session = await forceTakeover(prevSessionId, newSessionInput, photoUri);
      showToast(t('forcePhoto.toastSuccess'), 'success');
      navigation.replace('TraceabilityRunning' as any, { sessionId: session.id });
    } catch (e) {
      showToast((e as Error).message || t('forcePhoto.toastError'), 'danger');
      setBusy(false);
    }
  }, [busy, takePhoto, prevSessionId, newSessionInput, navigation, t]);

  if (isLoading) return <Center><ActivityIndicator size="large" color="#fff" /></Center>;
  if (!hasPermission) {
    return (
      <Center>
        <Text style={styles.lbl}>{t('forcePhoto.noPermission')}</Text>
        <TouchableOpacity style={styles.btn} onPress={requestPermission}>
          <Text style={styles.btnText}>{t('forcePhoto.grantPermission')}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.btn, styles.btnGhost]} onPress={() => navigation.goBack()}>
          <Text style={styles.btnText}>{t('forcePhoto.cancel')}</Text>
        </TouchableOpacity>
      </Center>
    );
  }
  if (!device) {
    return (
      <Center>
        <Text style={styles.lbl}>{t('forcePhoto.noCamera')}</Text>
        <TouchableOpacity style={styles.btn} onPress={() => navigation.goBack()}>
          <Text style={styles.btnText}>{t('forcePhoto.back')}</Text>
        </TouchableOpacity>
      </Center>
    );
  }

  return (
    <View style={styles.container}>
      <Camera ref={cameraRef} style={StyleSheet.absoluteFill} device={device} isActive photo />
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={10} disabled={busy}>
          <Ionicons name="close" size={28} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.topText}>{t('forcePhoto.topTitle')}</Text>
        <View style={{ width: 28 }} />
      </View>
      <View style={styles.bottomBar}>
        <Text style={styles.helpText}>{t('forcePhoto.helpText')}</Text>
        <TouchableOpacity style={styles.shutter} onPress={handleCapture} disabled={busy}>
          {busy
            ? <ActivityIndicator color="#000" />
            : <Ionicons name="camera" size={32} color="#000" />}
        </TouchableOpacity>
      </View>
    </View>
  );
}

function Center({ children }: { children: React.ReactNode }) {
  return <View style={styles.center}>{children}</View>;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  center: { flex: 1, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center', gap: 12, padding: 16 },
  lbl: { color: '#fff', fontSize: 14, textAlign: 'center' },
  btn: { backgroundColor: '#fff', paddingVertical: 10, paddingHorizontal: 16, borderRadius: 8 },
  btnGhost: { backgroundColor: 'transparent', borderWidth: 1, borderColor: '#fff' },
  btnText: { color: '#000', fontWeight: '800' },
  topBar: {
    position: 'absolute', top: 0, left: 0, right: 0,
    paddingTop: 40, paddingHorizontal: 16, paddingBottom: 12,
    backgroundColor: 'rgba(0,0,0,0.45)',
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  topText: { color: '#fff', fontWeight: '800', fontSize: 13 },
  bottomBar: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    padding: 16, paddingBottom: 28,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center', gap: 12,
  },
  helpText: { color: '#fff', fontSize: 12, textAlign: 'center' },
  shutter: {
    width: 70, height: 70, borderRadius: 35,
    backgroundColor: '#fff',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 4, borderColor: 'rgba(255,255,255,0.6)',
  },
});
