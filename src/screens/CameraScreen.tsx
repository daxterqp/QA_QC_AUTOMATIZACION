import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  Text,
  ActivityIndicator,
  Image,
  Modal,
  TextInput,
  Pressable,
} from 'react-native';
import { Camera } from 'react-native-vision-camera';
import { useCamera } from '@hooks/useCamera';
import { database, annotationCommentPhotosCollection, evidencesCollection, protocolItemsCollection, protocolsCollection } from '@db/index';
import { uploadAnnotationCommentPhoto, uploadEvidencePhoto, uploadExtraPhoto } from '@services/S3PhotoService';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { enqueue as enqueueSync } from '@services/SyncQueueService';
import { compressImage } from '@services/ImageCompressor';
import { applyPhotoStamps } from '@services/PhotoStampService';
import { loadStampContext, type StampContext } from '@services/StampContext';
import * as Location from 'expo-location';
import { useI18n } from '@i18n/index';

/** v68 — Coordenadas GPS crudas (lat/lng WGS84) del celular para estampar en la foto. Best-effort:
 *  no pide permiso (no interrumpe la captura) ni bloquea — si no hay permiso/fix devuelve null y la
 *  foto se estampa igual sin coords. Prefiere el fix actual; cae a la última conocida. */
async function getStampCoords(): Promise<{ lat: number; lng: number } | null> {
  try {
    const perm = await Location.getForegroundPermissionsAsync();
    if (!perm.granted) return null;
    const fresh = await Promise.race([
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
      new Promise<null>((res) => setTimeout(() => res(null), 4000)),
    ]).catch(() => null);
    const pos: any = fresh ?? (await Location.getLastKnownPositionAsync().catch(() => null));
    if (!pos?.coords) return null;
    return { lat: pos.coords.latitude, lng: pos.coords.longitude };
  } catch {
    return null;
  }
}

interface CameraScreenProps {
  protocolItemId?: string;
  annotationCommentId?: string;
  /** v32 — Modo "evidencia fotográfica EXTRA" del protocolo: la foto se procesa
   *  con el MISMO pipeline (compresión + estampado de logo/fecha/hora) y se
   *  guarda en la lista de fotos extra del protocolo (AsyncStorage + S3). */
  extraPhotoProtocolId?: string;
  projectId?: string;
  onClose: () => void;
  onPhotoSaved?: (id: string) => void;
}

export default function CameraScreen({
  protocolItemId,
  annotationCommentId,
  extraPhotoProtocolId,
  projectId,
  onClose,
  onPhotoSaved,
}: CameraScreenProps) {
  const { t } = useI18n();
  const { cameraRef, device, hasPermission, isLoading, requestPermission, takePhoto } =
    useCamera();

  const [isTaking, setIsTaking] = useState(false);
  const [lastPhotoUri, setLastPhotoUri] = useState<string | null>(null);
  const [photoCount, setPhotoCount] = useState(0);

  // ── Estampado: carga COMPLETA y verificada del contexto (logo descargado de S3 +
  //    nombre del proyecto + comentario) ANTES de plotear. Guardamos la PROMESA en un ref
  //    y la await-eamos en cada captura → nunca se estampa una foto sin la marca por un
  //    problema de carga (el miedo del usuario). `stampEnabled` es solo para el badge UI. ──
  const stampCtxRef = useRef<Promise<StampContext> | null>(null);
  const [stampEnabled, setStampEnabled] = useState(false);

  // Comentario POR FOTO (se ingresa en la cámara) — se plotea debajo del nombre del
  // proyecto. Es "pegajoso": se mantiene entre fotos hasta que se cambie o se quite.
  const [photoComment, setPhotoComment] = useState('');
  const [commentModal, setCommentModal] = useState(false);
  const [commentDraft, setCommentDraft] = useState('');

  useEffect(() => {
    if (!projectId) { stampCtxRef.current = null; setStampEnabled(false); return; }
    const p = loadStampContext(projectId);
    stampCtxRef.current = p;
    p.then((ctx) => setStampEnabled(ctx.stampEnabled)).catch(() => {});
  }, [projectId]);

  // El comentario por-foto es "pegajoso" dentro de una sesión, pero NO debe filtrarse a
  // otro ensayo/observación si la pantalla se reutiliza con otro objetivo sin desmontar.
  useEffect(() => { setPhotoComment(''); }, [protocolItemId, annotationCommentId, extraPhotoProtocolId]);

  // Comprime + AWAIT del contexto (logo garantizado cargado) + estampa. Devuelve el URI final.
  const processAndStamp = useCallback(async (rawUri: string, pid?: string | null): Promise<string> => {
    const ctxP = stampCtxRef.current ?? loadStampContext(pid ?? projectId);
    const [{ uri: compressed }, ctx] = await Promise.all([compressImage(rawUri), ctxP]);
    // Si el estampado está activo pero el logo NO cargó (offline en la 1ª foto), forzar un
    // refresco del contexto para que la PRÓXIMA foto reintente la descarga (si no, el ref
    // quedaría con la promesa sin-logo y todas las fotos saldrían sin logo).
    if (ctx.stampEnabled && !ctx.logoUri) {
      stampCtxRef.current = loadStampContext(pid ?? projectId, { force: true });
    }
    if (!ctx.stampEnabled) return compressed;
    const coords = ctx.stampGps ? await getStampCoords() : null;
    return applyPhotoStamps({
      imageUri: compressed,
      logoUri: ctx.logoUri,
      comment: ctx.comment,
      projectName: ctx.projectName,
      photoComment: photoComment.trim() || null,
      coords,
      size: ctx.stampSize,
    });
  }, [projectId, photoComment]);

  const openCommentModal = () => { setCommentDraft(photoComment); setCommentModal(true); };
  const saveComment = () => { setPhotoComment(commentDraft.trim()); setCommentModal(false); };
  const clearComment = () => { setPhotoComment(''); setCommentDraft(''); setCommentModal(false); };

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

        // Background: compresión + stamp (AWAIT contexto cargado) + update DB + upload S3
        (async () => {
          try {
            const finalUri = await processAndStamp(rawUri);

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

        // v25 — Enqueue UPLOAD_PHOTO. Si projectId no fue pasado como prop,
        // resolvemos via item→protocol (H4: evita que la op quede con
        // projectId='' y los filtros per-proyecto la omitan).
        let resolvedPid = projectId ?? '';
        if (!resolvedPid) {
          try {
            const item = await protocolItemsCollection.find(protocolItemId);
            if ((item as any).protocolId) {
              const proto = await protocolsCollection.find((item as any).protocolId);
              resolvedPid = (proto as any).projectId ?? '';
            }
          } catch { /* dejarlo vacío como fallback */ }
        }
        enqueueSync({ opType: 'UPLOAD_PHOTO', entityId: evidenceId, projectId: resolvedPid }).catch(() => {});

        // Background: comprimir → stamp (AWAIT contexto cargado) → update DB → upload S3
        (async () => {
          try {
            const finalUri = await processAndStamp(rawUri, resolvedPid || projectId);
            await database.write(async () => {
              const r2 = await evidencesCollection.find(evidenceId);
              await r2.update((ev) => { ev.localUri = finalUri; });
            });
            await uploadEvidencePhoto(evidenceId, finalUri);
            // Éxito inline: el worker verá uploadStatus='SYNCED' y limpiará la cola.
          } catch (err) {
            console.warn('[CameraScreen] procesamiento protocolo falló (queda en cola):', err);
            // No reintentamos aquí — el worker lo hace con backoff.
          }
        })();
      } else if (extraPhotoProtocolId) {
        // ── v32: Foto EXTRA del protocolo ──────────────────────────────────
        // Mismo pipeline de los ensayos tradicionales (compresión + estampado
        // de logo/fecha/hora); la foto entra a la lista de evidencias extra
        // (AsyncStorage, misma key que usa ProtocolFillScreen) y sube a S3.
        (async () => {
          try {
            const finalUri = await processAndStamp(rawUri);
            const key = `protocol_extra_photos_${extraPhotoProtocolId}`;
            const prev: string[] = JSON.parse((await AsyncStorage.getItem(key)) ?? '[]');
            const updated = [...prev, finalUri];
            await AsyncStorage.setItem(key, JSON.stringify(updated));
            uploadExtraPhoto(extraPhotoProtocolId, finalUri, updated.length).catch(() => {});
          } catch (err) {
            console.warn('[CameraScreen] foto extra falló:', err);
          }
        })();
      }
    } finally {
      setIsTaking(false);
    }
  }, [
    isTaking, takePhoto,
    protocolItemId, annotationCommentId, extraPhotoProtocolId, onPhotoSaved,
    processAndStamp, projectId,
  ]);

  // ── Sin permisos ─────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#fff" />
        <Text style={styles.label}>{t('camera.requestingPermission')}</Text>
      </View>
    );
  }

  if (!hasPermission) {
    return (
      <View style={styles.centered}>
        <Text style={styles.label}>{t('camera.noPermission')}</Text>
        <TouchableOpacity style={styles.btn} onPress={requestPermission}>
          <Text style={styles.btnText}>{t('camera.grantPermission')}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.btn, styles.btnSecondary]} onPress={onClose}>
          <Text style={styles.btnText}>{t('camera.back')}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!device) {
    return (
      <View style={styles.centered}>
        <Text style={styles.label}>
          {t('camera.noRearCamera')}{'\n'}
          {t('camera.checkPermission')}
        </Text>
        <TouchableOpacity style={styles.btn} onPress={requestPermission}>
          <Text style={styles.btnText}>{t('camera.retryPermission')}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.btn, styles.btnSecondary]} onPress={onClose}>
          <Text style={styles.btnText}>{t('camera.back')}</Text>
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
          <Text style={styles.counterText}>{photoCount !== 1 ? t('camera.photoCountPlural', { count: photoCount }) : t('camera.photoCountSingular', { count: photoCount })}</Text>
        </View>
        {stampEnabled && (
          <View style={styles.stampBadge}>
            <Text style={styles.stampBadgeText}>{t('camera.stampBadge')}</Text>
          </View>
        )}
      </View>

      {/* Miniatura última foto */}
      {lastPhotoUri && (
        <View style={styles.thumbnail}>
          <Image source={{ uri: lastPhotoUri }} style={styles.thumbnailImage} />
        </View>
      )}

      {/* Botón "Agregar comentario" (comentario por foto). Solo si el estampado está activo. */}
      {stampEnabled && (
      <View style={styles.commentBar}>
        <TouchableOpacity style={styles.commentBtn} onPress={openCommentModal} activeOpacity={0.8}>
          <Text style={styles.commentBtnIcon}>💬</Text>
          <Text style={styles.commentBtnText} numberOfLines={1}>
            {photoComment ? photoComment : t('camera.addComment')}
          </Text>
          {!!photoComment && (
            <TouchableOpacity onPress={clearComment} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text style={styles.commentClearX}>✕</Text>
            </TouchableOpacity>
          )}
        </TouchableOpacity>
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

      {/* Modal de comentario por foto */}
      <Modal visible={commentModal} transparent animationType="fade" onRequestClose={() => setCommentModal(false)}>
        <Pressable style={styles.commentOverlay} onPress={() => setCommentModal(false)}>
          <Pressable style={styles.commentCard} onPress={() => {}}>
            <Text style={styles.commentTitle}>{t('camera.commentTitle')}</Text>
            <Text style={styles.commentHint}>{t('camera.commentHint')}</Text>
            <TextInput
              style={styles.commentInput}
              value={commentDraft}
              onChangeText={setCommentDraft}
              placeholder={t('camera.commentPlaceholder')}
              placeholderTextColor="#9aa3b2"
              multiline
              autoFocus
            />
            <View style={styles.commentActions}>
              <TouchableOpacity style={[styles.commentActionBtn, styles.commentClearBtn]} onPress={clearComment}>
                <Text style={styles.commentClearText}>{t('camera.commentClear')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.commentActionBtn, styles.commentSaveBtn]} onPress={saveComment}>
                <Text style={styles.commentSaveText}>{t('camera.commentSave')}</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
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
  commentBar: {
    position: 'absolute', bottom: 130, left: 24, right: 24, alignItems: 'center',
  },
  commentBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8, maxWidth: '100%',
    backgroundColor: 'rgba(0,0,0,0.6)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)',
    borderRadius: 22, paddingHorizontal: 16, paddingVertical: 10,
  },
  commentBtnIcon: { fontSize: 16 },
  commentBtnText: { color: '#fff', fontSize: 14, fontWeight: '700', flexShrink: 1 },
  commentClearX: { color: '#fff', fontSize: 14, fontWeight: '900', paddingLeft: 2 },
  commentOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', paddingHorizontal: 24 },
  commentCard: { backgroundColor: '#fff', borderRadius: 16, padding: 20, gap: 10 },
  commentTitle: { fontSize: 17, fontWeight: '800', color: '#0e213d' },
  commentHint: { fontSize: 12, color: '#64748b', lineHeight: 16 },
  commentInput: {
    borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 10, paddingHorizontal: 12,
    paddingVertical: 10, fontSize: 15, color: '#0e213d', minHeight: 70, textAlignVertical: 'top',
  },
  commentActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 4 },
  commentActionBtn: { borderRadius: 10, paddingHorizontal: 18, paddingVertical: 11 },
  commentClearBtn: { backgroundColor: '#f1f5f9' },
  commentClearText: { color: '#64748b', fontWeight: '800', fontSize: 14 },
  commentSaveBtn: { backgroundColor: '#394e7d' },
  commentSaveText: { color: '#fff', fontWeight: '800', fontSize: 14 },
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
