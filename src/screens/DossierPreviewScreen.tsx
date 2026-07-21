/**
 * DossierPreviewScreen
 *
 * Previsualizador del PDF generado para el Dossier de Calidad.
 * Header: botón compartir + botón descargar (elige carpeta en Android).
 *
 * v100 — Cuando se abre para UN ensayo único (route.params.pdfConfig), el
 * Creador ve además un engranaje que abre el panel de configuración del PDF de
 * ESE tipo de ensayo (idProtocolo). Al ajustar, el PDF se regenera en vivo con
 * la config override (sin escribir a la BD); el botón "Guardar" persiste la
 * config para TODOS los ensayos de ese tipo. Es puramente ADITIVO: el editor de
 * config del Dosier completo (engranaje de DossierScreen) sigue intacto.
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  ActivityIndicator, Alert, Platform, Modal,
} from 'react-native';
import Pdf from 'react-native-pdf';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@navigation/types';
import AppHeader from '@components/AppHeader';
import PdfConfigPanel from '@components/PdfConfigPanel';
import { Colors, Radius, Shadow } from '../theme/colors';
import { useTourStepWithLayout } from '@hooks/useTourStep';
import { useI18n } from '@i18n/index';
import { useAuth } from '@context/AuthContext';
import { projectsCollection } from '@db/index';
import {
  parseFeatureFlagsJson, getTemplatePrintConfig,
  type TemplatePrintConfig, type CroquisConfig,
} from '@utils/featureFlags';
import { reexportSingleProtocolPdf } from '@services/DossierExportService';
import { mergeAndSaveFeatureFlags } from '@services/SupabaseSyncService';

type Props = NativeStackScreenProps<RootStackParamList, 'DossierPreview'>;
type ResolvedCfg = ReturnType<typeof getTemplatePrintConfig>;

export default function DossierPreviewScreen({ navigation, route }: Props) {
  const { t } = useI18n();
  const { projectName, pdfConfig } = route.params;
  const { currentUser } = useAuth();
  const isCreator = currentUser?.role === 'CREATOR';
  const canTune = !!pdfConfig && isCreator;

  // URI mostrada (puede cambiar al regenerar con una config nueva).
  const [pdfUri, setPdfUri] = useState(route.params.pdfUri);
  const [pdfKey, setPdfKey] = useState(0);          // fuerza remount del <Pdf> tras regenerar
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);

  // Panel de config (solo modo ensayo único + Creador).
  const [showCfg, setShowCfg] = useState(false);
  const [cfg, setCfg] = useState<ResolvedCfg | null>(null);
  const [cfgMap, setCfgMap] = useState<Record<string, TemplatePrintConfig>>({});
  const [regenerating, setRegenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  const { ref: pdfAreaRef, onLayout: pdfAreaLayout } = useTourStepWithLayout('dossier_preview_pdf');
  const { ref: actionsRef, onLayout: actionsLayout } = useTourStepWithLayout('dossier_preview_actions');

  // ── Carga inicial de la config guardada para este tipo ─────────────────────
  useEffect(() => {
    if (!pdfConfig) return;
    let alive = true;
    (async () => {
      try {
        const proj: any = await projectsCollection.find(pdfConfig.projectId).catch(() => null);
        const flags = parseFeatureFlagsJson(proj?.featureFlags);
        if (!alive) return;
        setCfgMap({ ...((flags.print_configs as any) ?? {}) });
        setCfg(getTemplatePrintConfig(flags, pdfConfig.idProtocolo));
      } catch { /* deja el PDF tal cual */ }
    })();
    return () => { alive = false; };
  }, [pdfConfig]);

  // ── Regeneración en vivo (debounce) al cambiar la config ───────────────────
  const regenTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const regenSeq = useRef(0);
  const lastBustRef = useRef<string | null>(null);   // archivo -vN mostrado (se limpia al regenerar)
  const skipFirst = useRef(true);   // el primer set (carga) no debe regenerar
  useEffect(() => {
    if (!pdfConfig || !cfg) return;
    if (skipFirst.current) { skipFirst.current = false; return; }
    if (regenTimer.current) clearTimeout(regenTimer.current);
    regenTimer.current = setTimeout(async () => {
      const seq = ++regenSeq.current;
      setRegenerating(true);
      try {
        const uri = await reexportSingleProtocolPdf(
          pdfConfig.protocolId, pdfConfig.projectId, projectName, currentUser?.id ?? '', cfg,
        );
        if (seq !== regenSeq.current) return;        // llegó una regeneración más nueva
        // Cache-bust REAL: el export escribe siempre al MISMO archivo y el visor
        // nativo no relee un path idéntico aunque remontemos. Copiamos cada
        // regeneración a un archivo NUEVO (-vN) para forzar la relectura.
        const base = (route.params.pdfUri.split('/').pop() ?? 'protocolo.pdf').replace(/\.pdf$/i, '');
        const bust = `${FileSystem.cacheDirectory}${base}-v${seq}.pdf`;
        try { await FileSystem.deleteAsync(bust, { idempotent: true }); } catch { /* noop */ }
        await FileSystem.copyAsync({ from: uri, to: bust });
        if (seq !== regenSeq.current) return;
        const prev = lastBustRef.current;
        lastBustRef.current = bust;
        setPdfUri(bust);
        setPdfKey(k => k + 1);
        if (prev) { FileSystem.deleteAsync(prev, { idempotent: true }).catch(() => {}); }
      } catch { /* conserva el último PDF bueno */ }
      finally { if (seq === regenSeq.current) setRegenerating(false); }
    }, 450);
    return () => { if (regenTimer.current) clearTimeout(regenTimer.current); };
  }, [cfg, pdfConfig, projectName, currentUser?.id]);

  const onCfg = useCallback((patch: Partial<TemplatePrintConfig>) => {
    setCfg(prev => (prev ? ({ ...prev, ...patch } as ResolvedCfg) : prev));
    setDirty(true);
  }, []);
  const onCroquis = useCallback((patch: Partial<CroquisConfig>) => {
    setCfg(prev => (prev ? ({ ...prev, croquis: { ...prev.croquis, ...patch } } as ResolvedCfg) : prev));
    setDirty(true);
  }, []);

  const handleSaveConfig = async () => {
    if (!pdfConfig || !cfg) return;
    setSaving(true);
    try {
      const nextMap = { ...cfgMap, [pdfConfig.idProtocolo]: cfg };
      await mergeAndSaveFeatureFlags(pdfConfig.projectId, { print_configs: nextMap });
      setCfgMap(nextMap);
      setDirty(false);
      Alert.alert(t('dossierPrev.cfgSavedTitle'), t('dossierPrev.cfgSavedMsg'));
    } catch (e) {
      Alert.alert(t('dossierPrev.errorTitle'), String(e));
    } finally {
      setSaving(false);
    }
  };

  const handleShare = async () => {
    try {
      await Sharing.shareAsync(pdfUri, {
        mimeType: 'application/pdf',
        dialogTitle: t('dossierPrev.shareDialogTitle'),
      });
    } catch (e) {
      Alert.alert(t('dossierPrev.errorTitle'), t('dossierPrev.shareError', { detail: String(e) }));
    }
  };

  const handleDownload = async () => {
    setDownloading(true);
    try {
      if (Platform.OS === 'android') {
        const { StorageAccessFramework } = FileSystem;
        const perms = await StorageAccessFramework.requestDirectoryPermissionsAsync();
        if (!perms.granted) { setDownloading(false); return; }

        // Extraer nombre del archivo del URI
        const fileName = pdfUri.split('/').pop() ?? 'dossier.pdf';

        // Crear el archivo en la carpeta elegida
        const destUri = await StorageAccessFramework.createFileAsync(
          perms.directoryUri,
          fileName,
          'application/pdf',
        );

        // Leer el PDF en base64 y escribirlo en destino
        const b64 = await FileSystem.readAsStringAsync(pdfUri, {
          encoding: FileSystem.EncodingType.Base64,
        });
        await FileSystem.writeAsStringAsync(destUri, b64, {
          encoding: FileSystem.EncodingType.Base64,
        });

        Alert.alert(t('dossierPrev.downloadedTitle'), t('dossierPrev.downloadedMessage'));
      } else {
        // iOS: compartir como alternativa
        await handleShare();
      }
    } catch (e) {
      Alert.alert(t('dossierPrev.errorTitle'), t('dossierPrev.saveError', { detail: String(e) }));
    } finally {
      setDownloading(false);
    }
  };

  return (
    <View style={styles.container}>
      <AppHeader
        title={t('dossierPrev.headerTitle')}
        subtitle={projectName}
        onBack={() => navigation.goBack()}
        rightContent={
          <View ref={actionsRef} onLayout={actionsLayout} style={styles.headerBtns}>
            {canTune && (
              <TouchableOpacity
                style={styles.headerBtn}
                onPress={() => setShowCfg(true)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name="options-outline" size={22} color={Colors.white} />
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={styles.headerBtn}
              onPress={handleDownload}
              disabled={downloading}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              {downloading
                ? <ActivityIndicator color={Colors.white} size="small" />
                : <Ionicons name="download-outline" size={22} color={Colors.white} />
              }
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.headerBtn}
              onPress={handleShare}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="share-social-outline" size={22} color={Colors.white} />
            </TouchableOpacity>
          </View>
        }
      />

      <View ref={pdfAreaRef} onLayout={pdfAreaLayout} style={styles.pdfWrap}>
        {loading && (
          <View style={styles.loadingOverlay}>
            <ActivityIndicator size="large" color={Colors.primary} />
            <Text style={styles.loadingText}>{t('dossierPrev.loading')}</Text>
          </View>
        )}
        {regenerating && !loading && (
          <View style={styles.regenChip} pointerEvents="none">
            <ActivityIndicator size="small" color={Colors.white} />
            <Text style={styles.regenText}>{t('dossierPrev.regenerating')}</Text>
          </View>
        )}
        <Pdf
          key={pdfKey}
          source={{ uri: pdfUri, cache: false }}
          style={styles.pdf}
          onLoadComplete={() => setLoading(false)}
          onError={() => {
            setLoading(false);
            Alert.alert(t('dossierPrev.errorTitle'), t('dossierPrev.previewError'));
          }}
          enablePaging
          horizontal={false}
          fitPolicy={0}
        />
      </View>

      {/* ── Panel de configuración del PDF (ensayo único, Creador) ───────────── */}
      <Modal visible={showCfg} transparent animationType="slide" onRequestClose={() => setShowCfg(false)}>
        <View style={styles.sheetBackdrop}>
          <View style={styles.sheet}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>{t('dossierPrev.cfgTitle')}</Text>
              <TouchableOpacity onPress={() => setShowCfg(false)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Ionicons name="chevron-down" size={24} color={Colors.white} />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.sheetBody} contentContainerStyle={{ padding: 12, paddingBottom: 40 }}>
              <Text style={styles.sheetHint}>{t('dossierPrev.cfgHint')}</Text>
              <Text style={styles.sheetHintMuted}>{t('dossierPrev.cfgCroquisHint')}</Text>
              {cfg
                ? <PdfConfigPanel cfg={cfg} onCfg={onCfg} onCroquis={onCroquis} />
                : <ActivityIndicator color={Colors.primary} style={{ marginTop: 20 }} />
              }
            </ScrollView>
            <View style={styles.sheetFooter}>
              <TouchableOpacity style={styles.footerGhost} onPress={() => setShowCfg(false)} activeOpacity={0.7}>
                <Text style={styles.footerGhostText}>{t('dossierPrev.cfgClose')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.footerPrimary, (!dirty || saving) && styles.footerPrimaryOff]}
                onPress={handleSaveConfig}
                disabled={!dirty || saving}
                activeOpacity={0.8}
              >
                {saving
                  ? <ActivityIndicator color={Colors.white} size="small" />
                  : <Text style={styles.footerPrimaryText}>{t('dossierPrev.cfgSave')}</Text>
                }
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.surface },
  headerBtns: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  headerBtn: { padding: 4 },
  pdfWrap: { flex: 1 },
  pdf: { flex: 1, backgroundColor: Colors.surface },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject, zIndex: 10,
    backgroundColor: Colors.surface, alignItems: 'center', justifyContent: 'center', gap: 12,
  },
  loadingText: { color: Colors.textSecondary, fontSize: 13 },
  regenChip: {
    position: 'absolute', top: 12, alignSelf: 'center', zIndex: 20,
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: 'rgba(20,28,46,0.92)', paddingVertical: 7, paddingHorizontal: 14,
    borderRadius: 999, ...Shadow.card,
  },
  regenText: { color: Colors.white, fontSize: 12, fontWeight: '700' },

  // Hoja de configuración
  sheetBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet: { maxHeight: '85%', backgroundColor: Colors.surface, borderTopLeftRadius: Radius.lg, borderTopRightRadius: Radius.lg, overflow: 'hidden' },
  sheetHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 12, paddingHorizontal: 16, backgroundColor: Colors.navy,
  },
  sheetTitle: { color: Colors.white, fontSize: 16, fontWeight: '800' },
  // flexShrink:1 — SIN esto, dentro de un contenedor con maxHeight el ScrollView
  // toma la altura de su CONTENIDO, empuja el footer (Cerrar/Guardar) fuera del
  // recorte y el scroll no llega al fondo (las opciones quedaban "enterradas").
  sheetBody: { paddingHorizontal: 4, flexShrink: 1 },
  sheetHint: { fontSize: 12, color: Colors.textSecondary, marginBottom: 4, paddingHorizontal: 8 },
  sheetHintMuted: { fontSize: 11, color: Colors.textMuted, marginBottom: 10, paddingHorizontal: 8 },
  sheetFooter: {
    flexDirection: 'row', gap: 10, padding: 12,
    borderTopWidth: 1, borderTopColor: Colors.border, backgroundColor: Colors.white,
  },
  footerGhost: { paddingVertical: 12, paddingHorizontal: 18, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center' },
  footerGhostText: { color: Colors.textSecondary, fontSize: 14, fontWeight: '700' },
  footerPrimary: { flex: 1, paddingVertical: 12, borderRadius: Radius.md, backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center' },
  footerPrimaryOff: { opacity: 0.5 },
  footerPrimaryText: { color: Colors.white, fontSize: 14, fontWeight: '800' },
});
