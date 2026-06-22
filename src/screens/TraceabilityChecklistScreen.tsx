/**
 * TraceabilityChecklistScreen (v30) — pantalla INTERMEDIA entre el wizard de
 * Nueva sesión y el cronómetro.
 *
 * Flujo:
 *   1. TraceabilityCaptureScreen slide-to-start → si la actividad tiene
 *      `form_template_id` → navega aquí con el snapshot de los items del
 *      template + el SessionInput.
 *   2. El operador completa Sí/No/N/A + comentario + foto opcional por item.
 *      Nada se persiste mientras está editando.
 *   3. Slide-to-confirm al final → startSession(input, formItemsConRespuestas)
 *      + crea evidences para fotos + navega a TraceabilityRunning.
 *
 * El reloj de la sesión empieza cuando se confirma este checklist.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity, ActivityIndicator,
  Modal, TextInput, Alert, Image,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Camera } from 'react-native-vision-camera';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@navigation/types';
import AppHeader from '@components/AppHeader';
import { Colors, Radius } from '../theme/colors';
import { SlideToConfirm } from '@components/SlideToConfirm';
import { showToast } from '@components/Toast';
import { useCamera } from '@hooks/useCamera';
import { database, evidencesCollection } from '@db/index';
import { enqueue as enqueueSync } from '@services/SyncQueueService';
import { startSessionWithChecklist } from '@services/WorkSessionService';
import { useTour } from '@context/TourContext';
import { useTourStep } from '@hooks/useTourStep';
import { useI18n } from '@i18n/index';

type Props = NativeStackScreenProps<RootStackParamList, 'TraceabilityChecklist'>;

interface ChecklistDraftItem {
  templateItemId: string | null;
  partidaItem: string | null;
  itemDescription: string;
  validationMethod: string | null;
  section: string | null;
  // Estado local:
  isCompliant: boolean | null; // true=Sí, false=No, null=sin responder
  isNa: boolean;
  comments: string;
  photoUri: string | null;
  // v31 — campo numérico cuando el item lo amerita (validation_method numérica)
  valueText: string;
}

// v31 — heurística para decidir si un item del checklist debe pedir VALOR
// NUMÉRICO además del Sí/No/N/A. Reglas:
//   - rangos: [10-20], (5,15), >=95, <=100, >n, <n, =n
//   - número suelto
//   - cualquier string con dígitos + unidad básica (mm/cm/°C/%/MPa…)
function isNumericValidation(method: string | null): boolean {
  if (!method) return false;
  const s = method.trim();
  if (!s) return false;
  if (/^[[(]\s*-?\d+(\.\d+)?\s*[-,]\s*-?\d+(\.\d+)?\s*[\])]$/.test(s)) return true;
  if (/^(>=|<=|>|<|=)\s*-?\d+(\.\d+)?\s*[a-zA-Z%°]*$/.test(s)) return true;
  if (/^-?\d+(\.\d+)?\s*[a-zA-Z%°]*$/.test(s)) return true;
  if (/\d/.test(s) && /[mc]?m|°C|°F|kg|MPa|kPa|psi|%|\bN\b/i.test(s)) return true;
  return false;
}

function newId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.floor(Math.random() * 1e9).toString(36)}`;
}

export default function TraceabilityChecklistScreen({ route, navigation }: Props) {
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const { sessionInput, templateName, items: templateItems } = route.params;
  const { jumpToStep, isActive: tourActive, isContextual, dismissTour } = useTour();
  const chkItemRef = useTourStep('trace_chk_item');
  const chkStartRef = useTourStep('trace_chk_start');

  useEffect(() => {
    const unsub = navigation.addListener('blur', () => {
      if (tourActive && isContextual) dismissTour();
    });
    return unsub;
  }, [navigation, tourActive, isContextual, dismissTour]);

  const [drafts, setDrafts] = useState<ChecklistDraftItem[]>(
    () => templateItems.map(t => ({
      templateItemId: t.templateItemId,
      partidaItem: t.partidaItem,
      itemDescription: t.itemDescription,
      validationMethod: t.validationMethod,
      section: t.section,
      isCompliant: null,
      isNa: false,
      comments: '',
      photoUri: null,
      valueText: '',
    })),
  );
  const [submitting, setSubmitting] = useState(false);
  const [cameraIdx, setCameraIdx] = useState<number | null>(null);

  const sections = useMemo(() => {
    const map = new Map<string, number[]>();
    drafts.forEach((d, idx) => {
      const sec = d.section ?? '';
      if (!map.has(sec)) map.set(sec, []);
      map.get(sec)!.push(idx);
    });
    return Array.from(map.entries()).map(([title, idxs]) => ({ title, idxs }));
  }, [drafts]);

  const answeredCount = useMemo(
    () => drafts.filter(d => {
      if (d.isCompliant !== null || d.isNa) return true;
      // Item numérico contestado por valor también cuenta como respondido.
      if (isNumericValidation(d.validationMethod) && d.valueText.trim()) return true;
      return false;
    }).length,
    [drafts],
  );

  const setItem = (idx: number, patch: Partial<ChecklistDraftItem>) => {
    setDrafts(s => s.map((d, i) => i === idx ? { ...d, ...patch } : d));
  };

  const handleConfirm = useCallback(async () => {
    if (submitting) return;
    const allAnswered = answeredCount === drafts.length;
    const proceed = async () => {
      setSubmitting(true);
      try {
        // Convertir drafts al shape que startSessionWithChecklist espera.
        const itemsForStart = drafts.map(d => {
          const numeric = isNumericValidation(d.validationMethod);
          const parsed = parseFloat((d.valueText ?? '').replace(',', '.'));
          const hasNumeric = numeric && isFinite(parsed);
          const hasTextValue = numeric && !!d.valueText.trim();
          return {
            templateItemId: d.templateItemId,
            partidaItem: d.partidaItem,
            itemDescription: d.itemDescription,
            validationMethod: d.validationMethod,
            valueText: hasNumeric ? null : (hasTextValue ? d.valueText.trim() : null),
            valueNumber: hasNumeric ? parsed : null,
            comments: d.comments.trim() || null,
            isCompliant: d.isCompliant,
            isNa: d.isNa,
            // v31 — Si es item numérico, también consideramos respondido cuando
            // hay valor (sin necesidad de Sí/No/N/A).
            hasAnswer: d.isCompliant !== null || d.isNa || hasNumeric || hasTextValue,
          };
        });
        const result = await startSessionWithChecklist({
          ...sessionInput,
          formItems: itemsForStart,
        });
        // Asociar fotos a los items recién creados (por orden — startSession
        // crea los items en el orden recibido).
        for (let i = 0; i < drafts.length; i++) {
          const d = drafts[i];
          if (!d.photoUri) continue;
          const sfiId = result.formItemIds[i];
          if (!sfiId) continue;
          try {
            const evId = newId('ev');
            await database.write(async () => {
              await evidencesCollection.create((r: any) => {
                r._raw.id = evId;
                // Marker convencional para no romper FK existente.
                r.protocolItemId = `CHECKLIST:${result.session.id}`;
                r.sessionFormItemId = sfiId;
                r.localUri = d.photoUri!;
                r.uploadStatus = 'PENDING';
                r.s3UrlPlaceholder = null;
              });
            });
            enqueueSync({ opType: 'UPLOAD_PHOTO', entityId: evId, projectId: sessionInput.projectId }).catch(() => {});
          } catch (e) {
            console.warn('[Checklist] foto no persistida:', e);
          }
        }
        showToast(t('traceChecklist.sessionStarted'), 'success');
        navigation.replace('TraceabilityRunning' as any, { sessionId: result.session.id });
      } catch (e) {
        showToast((e as Error).message || t('traceChecklist.couldNotStart'), 'danger');
      } finally {
        setSubmitting(false);
      }
    };
    if (!allAnswered) {
      Alert.alert(
        t('traceChecklist.unansweredTitle'),
        t('traceChecklist.unansweredMsg', { count: drafts.length - answeredCount }),
        [
          { text: t('traceChecklist.cancel'), style: 'cancel' },
          { text: t('traceChecklist.start'), onPress: () => proceed() },
        ],
      );
      return;
    }
    proceed();
  }, [submitting, answeredCount, drafts, navigation, sessionInput, t]);

  return (
    <View style={styles.container}>
      <AppHeader
        title={templateName ? t('traceChecklist.titleWithName', { name: templateName }) : t('traceChecklist.title')}
        subtitle={t('traceChecklist.subtitle', { answered: answeredCount, total: drafts.length })}
        onBack={() => navigation.goBack()}
        rightContent={
          <TouchableOpacity onPress={() => jumpToStep('trace_chk_item')} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="help-circle-outline" size={22} color={Colors.white} />
          </TouchableOpacity>
        }
      />
      <ScrollView contentContainerStyle={[styles.scroll, { paddingBottom: 160 }]}>
        <View style={styles.banner}>
          <Ionicons name="information-circle-outline" size={16} color={Colors.primary} />
          <Text style={styles.bannerText}>
            {t('traceChecklist.banner')}
          </Text>
        </View>

        {sections.map((sec, sIdx) => (
          <View key={sIdx} style={{ marginBottom: 10 }}>
            {sec.title ? <Text style={styles.sectionTitle}>{sec.title}</Text> : null}
            {sec.idxs.map((idx) => {
              const d = drafts[idx];
              return (
                <View key={idx} ref={idx === 0 ? chkItemRef : undefined} style={styles.itemCard}>
                  <View style={styles.itemHead}>
                    {d.partidaItem ? <Text style={styles.partida}>{d.partidaItem}</Text> : null}
                    <Text style={styles.desc}>{d.itemDescription}</Text>
                    {d.validationMethod ? (
                      <Text style={styles.hint}>{t('traceChecklist.method', { method: d.validationMethod })}</Text>
                    ) : null}
                  </View>

                  {/* v31 — input numérico ANTES de Sí/No/N/A cuando aplica */}
                  {isNumericValidation(d.validationMethod) && (
                    <View style={styles.numericRow}>
                      <Text style={styles.numericLabel}>{t('traceChecklist.value')}</Text>
                      <TextInput
                        style={styles.numericInput}
                        value={d.valueText}
                        onChangeText={(t) => setItem(idx, { valueText: t.replace(/[^\d.,-]/g, '') })}
                        keyboardType="numeric"
                        placeholder="—"
                        placeholderTextColor={Colors.textMuted}
                      />
                    </View>
                  )}

                  <View style={styles.answerRow}>
                    <AnswerBtn
                      label={t('traceChecklist.yes')}
                      tone={Colors.success}
                      active={d.isCompliant === true && !d.isNa}
                      onPress={() => setItem(idx, { isCompliant: true, isNa: false })}
                    />
                    <AnswerBtn
                      label={t('traceChecklist.no')}
                      tone={Colors.danger}
                      active={d.isCompliant === false && !d.isNa}
                      onPress={() => setItem(idx, { isCompliant: false, isNa: false })}
                    />
                    <AnswerBtn
                      label={t('traceChecklist.na')}
                      tone={Colors.textMuted}
                      active={d.isNa}
                      onPress={() => setItem(idx, { isNa: true, isCompliant: null })}
                    />
                  </View>

                  {/* v31 — comentario + cámara LADO A LADO (estilo protocolo subjetivo) */}
                  <View style={styles.commentsRow}>
                    <TextInput
                      style={[styles.commentsInput, { flex: 1 }]}
                      value={d.comments}
                      onChangeText={(text) => setItem(idx, { comments: text })}
                      placeholder={t('traceChecklist.commentsPlaceholder')}
                      placeholderTextColor={Colors.textMuted}
                      multiline
                    />
                    <TouchableOpacity
                      style={styles.cameraIconBtn}
                      onPress={() => setCameraIdx(idx)}
                      activeOpacity={0.7}
                    >
                      {d.photoUri ? (
                        <View style={styles.photoThumbWrap}>
                          <Image source={{ uri: d.photoUri }} style={styles.photoThumbSmall} />
                          <TouchableOpacity
                            style={styles.photoRemove}
                            onPress={(e) => { e.stopPropagation(); setItem(idx, { photoUri: null }); }}
                          >
                            <Ionicons name="close" size={12} color="#fff" />
                          </TouchableOpacity>
                        </View>
                      ) : (
                        <Ionicons name="camera-outline" size={22} color={Colors.primary} />
                      )}
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })}
          </View>
        ))}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: Math.max(12, insets.bottom + 8) }]}>
        <View ref={chkStartRef}>
        <SlideToConfirm
          label={submitting ? t('traceChecklist.starting') : t('traceChecklist.slideToStart')}
          tone="primary"
          disabled={submitting}
          onConfirm={handleConfirm}
        />
        </View>
      </View>

      <CameraCaptureModal
        visible={cameraIdx !== null}
        onClose={() => setCameraIdx(null)}
        onCapture={(uri) => {
          if (cameraIdx != null) setItem(cameraIdx, { photoUri: uri });
          setCameraIdx(null);
        }}
      />
    </View>
  );
}

function AnswerBtn({ label, tone, active, onPress }: { label: string; tone: string; active: boolean; onPress: () => void }) {
  // v31 — Mismo estilo que el formulario normal de protocolos: fondo blanco,
  // borde y texto del color tono cuando ACTIVO; gris plomo si no seleccionado.
  const borderColor = active ? tone : Colors.border;
  const textColor = active ? tone : Colors.textMuted;
  return (
    <TouchableOpacity
      style={[styles.ansBtn, { borderColor, backgroundColor: '#FFFFFF' }]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <Text style={[styles.ansBtnText, { color: textColor }]}>{label}</Text>
    </TouchableOpacity>
  );
}

function CameraCaptureModal({ visible, onClose, onCapture }: { visible: boolean; onClose: () => void; onCapture: (uri: string) => void }) {
  const { t } = useI18n();
  const { cameraRef, device, hasPermission, isLoading, requestPermission, takePhoto } = useCamera();
  const [busy, setBusy] = useState(false);
  const handle = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const photo = await takePhoto();
      if (photo) {
        const uri = photo.path.startsWith('file://') ? photo.path : `file://${photo.path}`;
        onCapture(uri);
      }
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={camStyles.container}>
        {isLoading ? (
          <View style={camStyles.center}><ActivityIndicator color="#fff" /></View>
        ) : !hasPermission ? (
          <View style={camStyles.center}>
            <Text style={camStyles.lbl}>{t('traceChecklist.cameraNoPermission')}</Text>
            <TouchableOpacity style={camStyles.btn} onPress={requestPermission}>
              <Text style={camStyles.btnText}>{t('traceChecklist.grantPermission')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[camStyles.btn, { backgroundColor: 'transparent', borderWidth: 1, borderColor: '#fff' }]} onPress={onClose}>
              <Text style={camStyles.btnText}>{t('traceChecklist.cancel')}</Text>
            </TouchableOpacity>
          </View>
        ) : !device ? (
          <View style={camStyles.center}>
            <Text style={camStyles.lbl}>{t('traceChecklist.noCamera')}</Text>
            <TouchableOpacity style={camStyles.btn} onPress={onClose}>
              <Text style={camStyles.btnText}>{t('traceChecklist.close')}</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            <Camera ref={cameraRef} style={StyleSheet.absoluteFill} device={device} isActive photo />
            <View style={camStyles.top}>
              <TouchableOpacity onPress={onClose} hitSlop={10} disabled={busy}>
                <Ionicons name="close" size={28} color="#fff" />
              </TouchableOpacity>
              <Text style={camStyles.topText}>{t('traceChecklist.itemPhoto')}</Text>
              <View style={{ width: 28 }} />
            </View>
            <View style={camStyles.bottom}>
              <TouchableOpacity style={camStyles.shutter} onPress={handle} disabled={busy}>
                {busy ? <ActivityIndicator color="#000" /> : <Ionicons name="camera" size={32} color="#000" />}
              </TouchableOpacity>
            </View>
          </>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.surface },
  scroll: { padding: 12 },
  banner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    padding: 10, marginBottom: 10,
    backgroundColor: Colors.primary + '10', borderRadius: Radius.sm,
    borderWidth: 1, borderColor: Colors.primary + '30',
  },
  bannerText: { fontSize: 12, color: Colors.primary, flex: 1, lineHeight: 16 },
  sectionTitle: { fontSize: 10, fontWeight: '800', color: Colors.textMuted, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 6, marginTop: 4 },
  itemCard: {
    backgroundColor: Colors.white, borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.border,
    padding: 10, marginBottom: 8,
  },
  itemHead: { marginBottom: 8 },
  partida: { fontSize: 10, fontWeight: '900', color: Colors.textMuted, letterSpacing: 0.5, marginBottom: 2 },
  desc: { fontSize: 13, color: Colors.textPrimary, fontWeight: '600', lineHeight: 18 },
  hint: { fontSize: 10, color: Colors.textMuted, marginTop: 4, fontStyle: 'italic' },
  // v31 — input numérico
  numericRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  numericLabel: { fontSize: 10, fontWeight: '800', color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 1 },
  numericInput: {
    flex: 1, borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.sm,
    paddingVertical: 7, paddingHorizontal: 10, fontSize: 14, fontWeight: '700',
    color: Colors.textPrimary, backgroundColor: '#fff',
    fontVariant: ['tabular-nums'], textAlign: 'right',
  },
  answerRow: { flexDirection: 'row', gap: 6 },
  ansBtn: {
    flex: 1, paddingVertical: 9, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, borderRadius: Radius.sm,
  },
  ansBtnText: { fontSize: 13, fontWeight: '800', letterSpacing: 0.3 },
  // v31 — comentario + cámara en la misma fila
  commentsRow: { flexDirection: 'row', alignItems: 'stretch', gap: 6, marginTop: 8 },
  commentsInput: {
    borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.sm,
    paddingVertical: 6, paddingHorizontal: 10, minHeight: 44, maxHeight: 100,
    fontSize: 11, color: Colors.textPrimary, backgroundColor: Colors.surface,
    textAlignVertical: 'top',
  },
  cameraIconBtn: {
    width: 44, minHeight: 44,
    borderWidth: 1, borderColor: Colors.primary + '40',
    backgroundColor: Colors.primary + '10',
    borderRadius: Radius.sm,
    alignItems: 'center', justifyContent: 'center',
  },
  photoThumbWrap: { position: 'relative' },
  photoThumbSmall: { width: 38, height: 38, borderRadius: 4, backgroundColor: Colors.border },
  photoRemove: {
    position: 'absolute', top: -5, right: -5,
    width: 18, height: 18, borderRadius: 9,
    backgroundColor: Colors.danger, alignItems: 'center', justifyContent: 'center',
  },
  footer: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    paddingHorizontal: 12, paddingTop: 12,
    backgroundColor: Colors.white,
    borderTopWidth: 1, borderTopColor: Colors.border,
  },
});

const camStyles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 16 },
  lbl: { color: '#fff', fontSize: 14, textAlign: 'center' },
  btn: { backgroundColor: '#fff', paddingVertical: 10, paddingHorizontal: 16, borderRadius: 8 },
  btnText: { color: '#000', fontWeight: '800' },
  top: {
    position: 'absolute', top: 0, left: 0, right: 0,
    paddingTop: 40, paddingHorizontal: 16, paddingBottom: 12,
    backgroundColor: 'rgba(0,0,0,0.45)',
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  topText: { color: '#fff', fontWeight: '800', fontSize: 13 },
  bottom: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    padding: 16, paddingBottom: 28,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
  },
  shutter: {
    width: 70, height: 70, borderRadius: 35,
    backgroundColor: '#fff',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 4, borderColor: 'rgba(255,255,255,0.6)',
  },
});
