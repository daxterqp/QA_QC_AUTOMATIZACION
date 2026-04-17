import React, { useCallback, useEffect, useRef, useState } from 'react';
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
import { database, annotationCommentPhotosCollection, evidencesCollection } from '@db/index';
import { uploadAnnotationCommentPhoto, uploadEvidencePhoto } from '@services/S3PhotoService';
import { compressImage } from '@services/ImageCompressor';
import { applyPhotoStamps } from '@services/PhotoStampService';
import { getProjectSettings, type ProjectStampSettings } from '@services/ProjectSettings';
import { downloadFromS3, s3FileExists } from '@services/S3Service';
import * as FileSystem from 'expo-file-system';

interface CameraScreenProps {
  protocolItemId?: string;
  annotationCommentId?: string;
  projectId?: string;
  onClose: () => void;
  onPhotoSaved?: (id: string) => void;
}

export default function CameraScreen({
  protocolItemId,
  annotationCommentId,
  projectId,
  onClose,
  onPhotoSaved,
}: CameraScreenProps) {
  const { cameraRef, device, hasPermission, isLoading, requestPermission, takePhoto } =
    useCamera();

  const [isTaking, setIsTaking] = useState(false);
  const [lastPhotoUri, setLastPhotoUri] = useState<string | null>(null);
  const [photoCount, setPhotoCount] = useState(0);

  // ── Configuración de stamps ──────────────────────────────────────────────
  const [settings, setSettings] = useState<ProjectStampSettings>({
    stampEnabled: false,
    stampPhotoUri: null,
    signatureUri: null,
    stampComment: null,
  });

  useEffect(() => {
    if (!projectId) return;
    getProjectSettings(projectId).then(async (s) => {
      // Read stamp_comment from synced project model (shared for all users)
      let sharedComment = s.stampComment;
      try {
        const proj = await database.get<any>('projects').find(projectId);
        if (proj?.stampComment) sharedComment = proj.stampComment;
      } catch { /* fallback to local */ }

      // Si no hay logo local, intentar descargarlo desde S3 (logo global del proyecto)
      let logoUri = s.stampPhotoUri;
      if (!logoUri && s.stampEnabled) {
        const s3Key = `logos/project_${projectId}/logo.jpg`;
        const localUri = `${FileSystem.cacheDirectory}project_logo_${projectId}.jpg`;
        try {
          const exists = await s3FileExists(s3Key);
          if (exists) {
            await downloadFromS3(s3Key, localUri);
            logoUri = localUri;
          }
        } catch { /* logo opcional */ }
      }
      setSettings({ ...s, stampPhotoUri: logoUri, stampComment: sharedComment });
    }).catch(() => {});
  }, [projectId]);

  // ── Captura ──────────────────────────────────────────────────────────────
  const handleCapture = useCallback(async () => {
    if (isTaking) return;
    setIsTaking(true);

    try {
      const photo = await takePhoto();
      if (!photo) return;

      const rawUri = photo.path.startsWith('file://') ? photo.path : `file://${photo.path}`;

      // Actualizar miniatura inmediatamente (respuesta visual instantánea)
      setLastPhotoUri(rawUri);
      setPhotoCount((n) => n + 1);

      if (annotationCommentId) {
        // ── Foto de observación ────────────────────────────────────────────
        // Guardar con URI original AHORA → el usuario puede seguir tomando fotos.
        // El procesamiento (stamp/compresión + upload) ocurre en background.
        let savedId = '';
        await database.write(async () => {
          const rec = await annotationCommentPhotosCollection.create((p) => {
            p.annotationCommentId = annotationCommentId;
            p.localUri = rawUri;
            p.storagePath = null;
          });
          savedId = rec.id;
        });
        onPhotoSaved?.(savedId);

        // Background: compresión + stamp + update DB + upload S3
        (async () => {
          try {
            const { uri: compressed } = await compressImage(rawUri);
            const finalUri = settings.stampEnabled
              ? await applyPhotoStamps(compressed, settings.stampPhotoUri, settings.stampComment)
              : compressed;

            await database.write(async () => {
              const rec = await annotationCommentPhotosCollection.find(savedId);
              await rec.update((p) => { p.localUri = finalUri; });
            });
            await uploadAnnotationCommentPhoto(savedId, finalUri);
          } catch (err) {
            console.warn('[CameraScreen] procesamiento background falló:', err);
            uploadAnnotationCommentPhoto(savedId, rawUri).catch(() => {});
          }
        })();
      } else if (protocolItemId) {
        // ── Foto de protocolo ──────────────────────────────────────────────
        // Guardar con URI original AHORA → el usuario puede seguir tomando fotos.
        // El procesamiento (compresión + stamp + upload) ocurre en background.
        let evidenceId = '';
        await database.write(async () => {
          const rec = await evidencesCollection.create((ev) => {
            ev.protocolItemId = protocolItemId;
            ev.localUri = rawUri;
            ev.uploadStatus = 'PENDING';
            ev.s3UrlPlaceholder = null;
          });
          evidenceId = rec.id;
        });
        onPhotoSaved?.(evidenceId);

        // Background: comprimir → stamp → update DB → upload S3
        (async () => {
          try {
            const { uri: compressed } = await compressImage(rawUri);
            const finalUri = settings.stampEnabled
              ? await applyPhotoStamps(compressed, settings.stampPhotoUri, settings.stampComment)
              : compressed;
            await database.write(async () => {
              const r2 = await evidencesCollection.find(evidenceId);
              await r2.update((ev) => { ev.localUri = finalUri; });
            });
            await uploadEvidencePhoto(evidenceId, finalUri);
          } catch (err) {
            console.warn('[CameraScreen] procesamiento protocolo falló:', err);
            uploadEvidencePhoto(evidenceId, rawUri).catch(() => {});
          }
        })();
      }
    } finally {
      setIsTaking(false);
    }
  }, [
    isTaking, takePhoto,
    protocolItemId, annotationCommentId, onPhotoSaved,
    settings,
  ]);

  // ── Sin permisos ─────────────────────────────────────────────────────────
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
        <Text style={styles.label}>
          No se encontró cámara trasera.{'\n'}
          Verifica que la app tenga permiso de Cámara en Ajustes del dispositivo.
        </Text>
        <TouchableOpacity style={styles.btn} onPress={requestPermission}>
          <Text style={styles.btnText}>Reintentar permisos</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.btn, styles.btnSecondary]} onPress={onClose}>
          <Text style={styles.btnText}>Volver</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ── Pantalla principal ───────────────────────────────────────────────────
  return (
    <View style={styles.container}>
      <Camera
        ref={cameraRef}
        style={StyleSheet.absoluteFill}
        device={device}
        isActive={true}
        photo={true}
      />

      {/* Barra superior */}
      <View style={styles.topBar}>
        <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
          <Text style={styles.closeBtnText}>X</Text>
        </TouchableOpacity>
        <View style={styles.counter}>
          <Text style={styles.counterText}>{photoCount} foto{photoCount !== 1 ? 's' : ''}</Text>
        </View>
        {settings.stampEnabled && (
          <View style={styles.stampBadge}>
            <Text style={styles.stampBadgeText}>STAMP</Text>
          </View>
        )}
      </View>

      {/* Miniatura última foto */}
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
  container: { flex: 1, backgroundColor: '#000' },
  centered: {
    flex: 1, backgroundColor: '#000',
    alignItems: 'center', justifyContent: 'center', gap: 16,
  },
  label: { color: '#fff', fontSize: 16, textAlign: 'center', paddingHorizontal: 24 },
  btn: {
    backgroundColor: '#394e7d', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 8,
  },
  btnSecondary: { backgroundColor: '#555' },
  btnText: { color: '#fff', fontWeight: '600' },
  topBar: {
    position: 'absolute', top: 48, left: 0, right: 0,
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', paddingHorizontal: 20,
  },
  closeBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center',
  },
  closeBtnText: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  counter: {
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12,
  },
  counterText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  stampBadge: {
    backgroundColor: 'rgba(255,180,0,0.85)',
    paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8,
  },
  stampBadgeText: { color: '#000', fontSize: 10, fontWeight: '900', letterSpacing: 1 },
  thumbnail: {
    position: 'absolute', bottom: 110, left: 24,
    width: 64, height: 64, borderRadius: 8, overflow: 'hidden',
    borderWidth: 2, borderColor: '#fff',
  },
  thumbnailImage: { width: '100%', height: '100%' },
  bottomBar: {
    position: 'absolute', bottom: 40, left: 0, right: 0, alignItems: 'center',
  },
  shutter: {
    width: 72, height: 72, borderRadius: 36, backgroundColor: '#fff',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 4, borderColor: 'rgba(255,255,255,0.4)',
  },
  shutterDisabled: { opacity: 0.5 },
  shutterInner: {
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: '#fff', borderWidth: 2, borderColor: '#ccc',
  },
});
