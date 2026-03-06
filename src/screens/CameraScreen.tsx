import React, { useCallback, useState } from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  Text,
  ActivityIndicator,
  Image,
} from 'react-native';
import { Camera } from 'react-native-vision-camera';
import { useCamera } from '@hooks/useCamera';
import { useEvidence } from '@hooks/useEvidence';

interface CameraScreenProps {
  /** ID del item de protocolo al que pertenecen las fotos */
  protocolItemId: string;
  /** Callback al cerrar la pantalla */
  onClose: () => void;
  /** Callback opcional al guardar una foto exitosamente */
  onPhotoSaved?: (evidenceId: string) => void;
}

/**
 * Pantalla de camara de alta velocidad para S-CUA.
 *
 * Diseno de "3 clics maximo":
 *   Clic 1 — Abrir pantalla (camara ya esta en standby, isActive=true)
 *   Clic 2 — Obturador: foto guardada INSTANTANEAMENTE en WatermelonDB
 *   Clic 3 — Cerrar o tomar otra foto
 *
 * La compresion ocurre en segundo plano sin bloquear esta pantalla.
 */
export default function CameraScreen({
  protocolItemId,
  onClose,
  onPhotoSaved,
}: CameraScreenProps) {
  const { cameraRef, device, hasPermission, isLoading, requestPermission, takePhoto } =
    useCamera();
  const { saveEvidence } = useEvidence();

  const [isTaking, setIsTaking] = useState(false);
  const [lastPhotoUri, setLastPhotoUri] = useState<string | null>(null);
  const [photoCount, setPhotoCount] = useState(0);

  const handleCapture = useCallback(async () => {
    if (isTaking) return; // Evitar doble disparo
    setIsTaking(true);

    try {
      const photo = await takePhoto();
      if (!photo) return;

      // Prefijo de URI segun plataforma (vision-camera v4 retorna path sin prefijo en Android)
      const uri = photo.path.startsWith('file://') ? photo.path : `file://${photo.path}`;

      // Guardar en WatermelonDB de forma INSTANTANEA (sin esperar compresion)
      const { evidenceId } = await saveEvidence({ protocolItemId, localUri: uri });

      setLastPhotoUri(uri);
      setPhotoCount((n) => n + 1);
      onPhotoSaved?.(evidenceId);
    } finally {
      setIsTaking(false);
    }
  }, [isTaking, takePhoto, saveEvidence, protocolItemId, onPhotoSaved]);

  // ── Sin permisos ─────────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#fff" />
        <Text style={styles.label}>Solicitando permisos de camara...</Text>
      </View>
    );
  }

  if (!hasPermission) {
    return (
      <View style={styles.centered}>
        <Text style={styles.label}>Camara sin permisos</Text>
        <TouchableOpacity style={styles.btn} onPress={requestPermission}>
          <Text style={styles.btnText}>Conceder permiso</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.btn, styles.btnSecondary]} onPress={onClose}>
          <Text style={styles.btnText}>Volver</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!device) {
    return (
      <View style={styles.centered}>
        <Text style={styles.label}>No se encontro camara trasera</Text>
      </View>
    );
  }

  // ── Pantalla principal ───────────────────────────────────────────────────────
  return (
    <View style={styles.container}>
      {/*
        isActive=true: el sensor queda en standby desde que se monta el componente.
        Esto garantiza "cero tiempos de carga" al presionar el obturador.
      */}
      <Camera
        ref={cameraRef}
        style={StyleSheet.absoluteFill}
        device={device}
        isActive={true}
        photo={true}
      />

      {/* Contador de fotos tomadas */}
      <View style={styles.topBar}>
        <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
          <Text style={styles.closeBtnText}>✕</Text>
        </TouchableOpacity>
        <View style={styles.counter}>
          <Text style={styles.counterText}>{photoCount} foto{photoCount !== 1 ? 's' : ''}</Text>
        </View>
      </View>

      {/* Miniatura de la ultima foto */}
      {lastPhotoUri && (
        <View style={styles.thumbnail}>
          <Image source={{ uri: lastPhotoUri }} style={styles.thumbnailImage} />
        </View>
      )}

      {/* Obturador */}
      <View style={styles.bottomBar}>
        <TouchableOpacity
          style={[styles.shutter, isTaking && styles.shutterDisabled]}
          onPress={handleCapture}
          activeOpacity={0.7}
          disabled={isTaking}
        >
          {isTaking ? (
            <ActivityIndicator color="#000" />
          ) : (
            <View style={styles.shutterInner} />
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  centered: {
    flex: 1,
    backgroundColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  label: {
    color: '#fff',
    fontSize: 16,
    textAlign: 'center',
    paddingHorizontal: 24,
  },
  btn: {
    backgroundColor: '#1a73e8',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  btnSecondary: {
    backgroundColor: '#555',
  },
  btnText: {
    color: '#fff',
    fontWeight: '600',
  },
  topBar: {
    position: 'absolute',
    top: 48,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  closeBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeBtnText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  counter: {
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  counterText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  thumbnail: {
    position: 'absolute',
    bottom: 110,
    left: 24,
    width: 64,
    height: 64,
    borderRadius: 8,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: '#fff',
  },
  thumbnailImage: {
    width: '100%',
    height: '100%',
  },
  bottomBar: {
    position: 'absolute',
    bottom: 40,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  shutter: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 4,
    borderColor: 'rgba(255,255,255,0.4)',
  },
  shutterDisabled: {
    opacity: 0.5,
  },
  shutterInner: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: '#ccc',
  },
});
