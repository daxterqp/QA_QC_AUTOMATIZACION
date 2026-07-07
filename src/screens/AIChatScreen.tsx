/**
 * AIChatScreen — Asistente de IA del proyecto (v75, Fase 1).
 *
 * Chat en lenguaje natural sobre los datos REALES del proyecto (Edge Function
 * `ai-chat` con tools sobre protocol_summary_rows/sectores/tipos). UI profesional:
 * burbujas diferenciadas, indicador de escritura animado, chips de preguntas
 * sugeridas, historial de sesiones LOCAL (AsyncStorage) con retomar/eliminar.
 *
 * Módulo intencionalmente en español (sin i18n) — decisión del usuario.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, TextInput, TouchableOpacity, Modal,
  KeyboardAvoidingView, Platform, Animated, ScrollView, Alert, useWindowDimensions,
  ActivityIndicator, type StyleProp, type TextStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { SvgXml } from 'react-native-svg';
import { Q } from '@nozbe/watermelondb';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@navigation/types';
import { useAuth } from '@context/AuthContext';
import AppHeader from '@components/AppHeader';
import { Colors, Radius, Shadow } from '../theme/colors';
import {
  projectSectorsCollection, protocolsCollection,
  protocolTemplatesCollection, protocolTemplateItemsCollection,
} from '@db/index';
import { repairCloudSummaryOnce } from '@services/SummaryRowService';
import { createInstances } from '@services/ProtocolInstanceService';
import WaterRipplesGL, { type WaterGLHandle } from '@components/WaterRipplesGL';
import {
  type AIChatMessage, type AIChatSession, deleteNarrationFile, deleteSession,
  loadSessions, newSessionId, requestNarration, saveSession, sendChatMessage,
  sessionTitleFrom,
} from '@services/AIAssistantService';
import { AI_SUGGESTED_QUESTIONS, buildSuggestedQuestions } from '@utils/aiSuggestedQuestions';

// ── expo-audio con require DIFERIDO ──────────────────────────────────────────
// El módulo es NATIVO: un dev client construido antes de agregarlo no lo tiene.
// Cargarlo recién al tocar "escuchar" evita que la pantalla entera reviente en
// builds viejas (ahí se muestra un error amable pidiendo reinstalar).
interface AudioPlayerLite {
  play: () => void;
  remove: () => void;
  addListener: (event: 'playbackStatusUpdate', cb: (status: { didJustFinish?: boolean; isLoaded?: boolean }) => void) => { remove: () => void };
}
function loadExpoAudio(): {
  createAudioPlayer: (source: { uri: string }) => AudioPlayerLite;
  setAudioModeAsync: (mode: Record<string, unknown>) => Promise<void>;
} | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require('expo-audio');
  } catch {
    return null;
  }
}

/** Mapa destino → pantalla real para las tarjetas "abrir_pantalla" de Flo.
 *  Debe cubrir los DESTINOS que declara la tool preparar_accion del backend. */
const DESTINO_SCREEN: Record<string, { screen: string; params?: Record<string, unknown> }> = {
  ensayos: { screen: 'Ensayos', params: { mode: 'date' } },
  dossier: { screen: 'Dossier' },
  muestras: { screen: 'Samples' },
  mapa: { screen: 'ProjectMap' },
  sectores: { screen: 'ProjectSectors' },
  trazabilidad: { screen: 'TraceabilityHome' },
  tablas_resumen: { screen: 'SummaryTables' },
  configuracion: { screen: 'ProjectConfig' },
  papelera: { screen: 'RecycleBin' },
  topografia: { screen: 'TopoCargas' },
  planos: { screen: 'PlansManagement' },
  contactos: { screen: 'PhoneContacts' },
};

/** Config de audio para el TTS. La clave en Android es shouldRouteThroughEarpiece:
 *  false — si otra parte de la app dejó el AudioManager en modo comunicación
 *  (grabación/cámara), el audio saldría por el AURICULAR a volumen bajísimo y
 *  "no se escucha" (clásico en Samsung). Esto lo resetea a altavoz multimedia. */
const TTS_AUDIO_MODE = {
  playsInSilentMode: true,             // iOS: sonar aunque el switch esté en silencio
  interruptionMode: 'duckOthers',      // iOS
  interruptionModeAndroid: 'duckOthers',
  shouldPlayInBackground: false,
  shouldRouteThroughEarpiece: false,   // Android: altavoz multimedia, no auricular
};

type Props = NativeStackScreenProps<RootStackParamList, 'AIChat'>;

const fmtTime = (ms: number) => {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};
const fmtDay = (ms: number) => new Date(ms).toLocaleDateString('es-PE', { day: '2-digit', month: 'short' });

/** Render mínimo de markdown en burbujas: **negritas**. El prompt pide texto
 *  plano, pero los modelos a veces igual emiten asteriscos — mejor pintarlos
 *  como negrita que mostrarlos literales. */
function RichText({ text, style }: { text: string; style: StyleProp<TextStyle> }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return (
    <Text style={style}>
      {parts.map((p, i) =>
        p.startsWith('**') && p.endsWith('**') && p.length > 4
          ? <Text key={i} style={{ fontWeight: '800' }}>{p.slice(2, -2)}</Text>
          : p)}
    </Text>
  );
}

/** Pulso de entrada del avatar (una onda al llegar cada respuesta). Solo anima
 *  mensajes FRESCOS (recién llegados) — al retomar una sesión no pulsa todo. */
function PulseIn({ children, fresh }: { children: React.ReactNode; fresh: boolean }) {
  const scale = useRef(new Animated.Value(fresh ? 0.4 : 1)).current;
  useEffect(() => {
    if (fresh) {
      Animated.spring(scale, { toValue: 1, friction: 4, tension: 110, useNativeDriver: true }).start();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return <Animated.View style={{ transform: [{ scale }] }}>{children}</Animated.View>;
}

const ymdLocal = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Indicador "escribiendo…" — 3 puntos con opacidad animada en cascada. */
function TypingDots() {
  const dots = [useRef(new Animated.Value(0.25)).current, useRef(new Animated.Value(0.25)).current, useRef(new Animated.Value(0.25)).current];
  useEffect(() => {
    const anims = dots.map((v, i) =>
      Animated.loop(Animated.sequence([
        Animated.delay(i * 180),
        Animated.timing(v, { toValue: 1, duration: 320, useNativeDriver: true }),
        Animated.timing(v, { toValue: 0.25, duration: 320, useNativeDriver: true }),
        Animated.delay((2 - i) * 180),
      ])));
    anims.forEach(a => a.start());
    return () => anims.forEach(a => a.stop());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <View style={styles.typingRow}>
      {dots.map((v, i) => <Animated.View key={i} style={[styles.typingDot, { opacity: v }]} />)}
    </View>
  );
}

export default function AIChatScreen({ navigation, route }: Props) {
  const { projectId, projectName } = route.params;
  const insets = useSafeAreaInsets();
  const { width: winWidth } = useWindowDimensions();
  const { currentUser } = useAuth();
  // Primer nombre para el saludo de la bienvenida ("Hola Joseph, ¿por dónde empezamos?").
  const firstName = ((currentUser as any)?.name ?? '').trim().split(/\s+/)[0] || null;

  const [session, setSession] = useState<AIChatSession | null>(null);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [pastSessions, setPastSessions] = useState<AIChatSession[]>([]);
  const [suggested, setSuggested] = useState<string[]>(AI_SUGGESTED_QUESTIONS);
  const listRef = useRef<FlatList<AIChatMessage>>(null);

  // ── FLOW visual: agua GL en la bienvenida (se desmonta al conversar) ──
  const glRef = useRef<WaterGLHandle>(null);
  const [glOk, setGlOk] = useState(true);
  // true mientras se decide si hay sesión que retomar (evita el flash de
  // bienvenida). Se declara AQUÍ porque el efecto del bigWave la lee.
  const [booting, setBooting] = useState(true);

  // Agua TÁCTIL (feedback QA: "no tiene la misma física que el login") — mismo
  // patrón del login: captura en fase capture SIN robar el responder, coords
  // normalizadas al área del agua (medida con measureInWindow, no pageX crudo:
  // este contenedor arranca debajo del header).
  const waterBoxRef = useRef<View>(null);
  const waterBox = useRef({ x: 0, y: 0, w: 1, h: 1 });
  const lastDrop = useRef({ x: 0, y: 0 });
  const measureWaterBox = useCallback(() => {
    waterBoxRef.current?.measureInWindow((x, y, w, h) => {
      waterBox.current = { x, y, w: w || 1, h: h || 1 };
    });
  }, []);
  const dropAt = useCallback((pageX: number, pageY: number, isMove: boolean) => {
    const b = waterBox.current;
    glRef.current?.drop((pageX - b.x) / b.w, (pageY - b.y) / b.h, isMove);
  }, []);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const onWaterTouch = useCallback((e: any) => {
    const { pageX, pageY } = e.nativeEvent;
    lastDrop.current = { x: pageX, y: pageY };
    dropAt(pageX, pageY, false);
  }, [dropAt]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const onWaterMove = useCallback((e: any) => {
    const { pageX, pageY } = e.nativeEvent;
    if (Math.hypot(pageX - lastDrop.current.x, pageY - lastDrop.current.y) > 8) {
      lastDrop.current = { x: pageX, y: pageY };
      dropAt(pageX, pageY, true);
    }
  }, [dropAt]);

  // Transición suave bienvenida → chat (feedback QA: "muy brusco"): la
  // bienvenida queda como overlay que se DESVANECE sobre la lista.
  const welcomeFade = useRef(new Animated.Value(1)).current;
  const [welcomeLeaving, setWelcomeLeaving] = useState(false);
  // Insight local del día (cero tokens: sale de la base local del celular).
  const [insight, setInsight] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const now = new Date();
        const hoy = ymdLocal(now);
        const ayer = ymdLocal(new Date(now.getTime() - 86_400_000));
        const [nHoy, nAyer] = await Promise.all([
          protocolsCollection.query(Q.where('project_id', projectId), Q.where('status', Q.notEq('DRAFT')), Q.where('ensayo_date', hoy)).fetchCount(),
          protocolsCollection.query(Q.where('project_id', projectId), Q.where('status', Q.notEq('DRAFT')), Q.where('ensayo_date', ayer)).fetchCount(),
        ]);
        if (!alive) return;
        if (nHoy > 0 || nAyer > 0) {
          setInsight(`Hoy: ${nHoy} ensayo${nHoy === 1 ? '' : 's'} registrado${nHoy === 1 ? '' : 's'} · Ayer: ${nAyer}`);
        }
      } catch { /* sin insight */ }
    })();
    return () => { alive = false; };
  }, [projectId]);

  // Arco de agua al mostrar la bienvenida (transición marca de la casa).
  const isEmptyChat = (session?.messages.length ?? 0) === 0;
  useEffect(() => {
    if (!booting && isEmptyChat && glOk) {
      const t = setTimeout(() => glRef.current?.bigWave(), 450);
      return () => clearTimeout(t);
    }
  }, [booting, isEmptyChat, glOk]);

  // ── Narración por voz (Fase 3) ──
  const [speakingId, setSpeakingId] = useState<string | null>(null);   // reproduciendo
  const [loadingSpeechId, setLoadingSpeechId] = useState<string | null>(null); // generando
  const playerRef = useRef<AudioPlayerLite | null>(null);
  const playerSubRef = useRef<{ remove: () => void } | null>(null);
  const audioUriRef = useRef<string | null>(null);
  // Token de vuelo: stop/unmount lo incrementa → una narración que resuelva
  // DESPUÉS queda invalidada (no crea reproductor fantasma). También hace de
  // guard síncrono contra doble tap (el estado React llega tarde).
  const speechReqRef = useRef(0);
  const speechBusyRef = useRef(false);
  // Timeout de seguridad: en Android didJustFinish puede dejar de llegar
  // (issue conocido de expo-audio) — se libera solo tras un tope generoso.
  const speechTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stopSpeech = useCallback(() => {
    speechReqRef.current++;
    if (speechTimerRef.current) { clearTimeout(speechTimerRef.current); speechTimerRef.current = null; }
    playerSubRef.current?.remove();
    playerSubRef.current = null;
    try { playerRef.current?.remove(); } catch { /* ya liberado */ }
    playerRef.current = null;
    if (audioUriRef.current) { deleteNarrationFile(audioUriRef.current); audioUriRef.current = null; }
    setSpeakingId(null);
  }, []);

  // Liberar el reproductor (e invalidar narraciones en vuelo) al salir.
  useEffect(() => stopSpeech, [stopSpeech]);

  const toggleSpeech = useCallback(async (item: AIChatMessage) => {
    if (speakingId === item.id) { stopSpeech(); return; }
    if (speechBusyRef.current) return; // ya hay una narración generándose
    const audio = loadExpoAudio();
    if (!audio) {
      Alert.alert('Función no disponible', 'La voz requiere reinstalar la aplicación (nuevo módulo de audio).');
      return;
    }
    stopSpeech();
    speechBusyRef.current = true;
    const reqId = speechReqRef.current;
    setLoadingSpeechId(item.id);
    try {
      const uri = await requestNarration(projectId, item.text);
      if (speechReqRef.current !== reqId) { deleteNarrationFile(uri); return; } // stop/back durante la espera
      await audio.setAudioModeAsync(TTS_AUDIO_MODE).catch(() => {});
      // Re-validar tras CADA await: un stop/back durante setAudioModeAsync crearía
      // un reproductor fantasma que nada apaga (el timeout ya no le corresponde).
      if (speechReqRef.current !== reqId) { deleteNarrationFile(uri); return; }
      const player = audio.createAudioPlayer({ uri });
      playerRef.current = player;
      audioUriRef.current = uri;
      // Patrón defensivo: play() inmediato + re-play cuando isLoaded llegue
      // (evita la carrera "play antes de cargar" que deja el audio mudo).
      let started = false;
      playerSubRef.current = player.addListener('playbackStatusUpdate', s => {
        if (s?.isLoaded && !started) { started = true; try { player.play(); } catch { /* ya sonando */ } }
        if (s?.didJustFinish) stopSpeech();
      });
      setSpeakingId(item.id);
      player.play();
      // Liberación de seguridad (texto ≤1200 chars ≈ ~90 s de audio).
      speechTimerRef.current = setTimeout(() => {
        if (speechReqRef.current === reqId) stopSpeech();
      }, 150_000);
    } catch (e) {
      if (speechReqRef.current === reqId) {
        stopSpeech();
        Alert.alert('Voz', e instanceof Error ? e.message : 'No se pudo generar la narración.');
      }
    } finally {
      speechBusyRef.current = false;
      setLoadingSpeechId(prev => (prev === item.id ? null : prev));
    }
  }, [speakingId, projectId, stopSpeech]);

  // AUTO-REPARACIÓN de datos del asistente: los valores numéricos que consulta
  // la IA viven en protocol_summary_rows (nube), una tabla derivada que puede
  // quedar incompleta (pushes fallidos / aprobaciones viejas). Al abrir el chat
  // se regeneran las filas faltantes y (una vez por proyecto) se re-empujan
  // TODAS a la nube vía la cola de sync — en segundo plano, no bloquea nada.
  useEffect(() => {
    repairCloudSummaryOnce(projectId).catch(() => {});
  }, [projectId]);

  // Chips dinámicos: la pregunta de ejemplo usa el PRIMER sector real del
  // proyecto (base local) para que la consulta siempre tenga sentido.
  useEffect(() => {
    let alive = true;
    projectSectorsCollection.query(Q.where('project_id', projectId)).fetch()
      .then(sectors => {
        if (!alive || sectors.length === 0) return;
        const first = [...sectors].sort((a, b) => (a.sortOrder ?? 1e9) - (b.sortOrder ?? 1e9))[0];
        setSuggested(buildSuggestedQuestions(first?.name));
      })
      .catch(() => {});
    return () => { alive = false; };
  }, [projectId]);

  const messages = session?.messages ?? [];
  // Las burbujas de error ("⚠ …") NO son respuestas reales del asistente:
  // no cuentan para el saludo ni viajan al modelo como historial.
  const isErrorMsg = (m: AIChatMessage) => m.role === 'assistant' && m.text.startsWith('⚠');
  // Saludo formal SOLO en el primer intercambio de la sesión.
  const isFirstTurn = useMemo(() => !messages.some(m => m.role === 'assistant' && !isErrorMsg(m)), [messages]);

  const startNewSession = useCallback(() => {
    stopSpeech();
    setSession({ id: newSessionId(), titulo: 'Nueva conversación', createdAt: Date.now(), updatedAt: Date.now(), messages: [] });
  }, [stopSpeech]);

  // Al entrar: RETOMAR la última conversación guardada (abrir siempre en blanco
  // hacía sentir que "se perdía todo"). "Nueva conversación" sigue en el header.
  // `booting` (declarada arriba) evita el FLASH de bienvenida mientras se decide.
  useEffect(() => {
    let alive = true;
    loadSessions(projectId)
      .then(all => {
        if (!alive) return;
        const latest = all.find(s => s.messages.length > 0);
        if (latest) setSession(latest);
        else startNewSession();
      })
      .catch(() => { if (alive) startNewSession(); })
      .finally(() => { if (alive) setBooting(false); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  const openHistory = useCallback(async () => {
    setPastSessions(await loadSessions(projectId));
    setShowHistory(true);
  }, [projectId]);

  const resumeSession = useCallback((s: AIChatSession) => {
    stopSpeech();
    setSession(s);
    setShowHistory(false);
  }, [stopSpeech]);

  // Feedback QA: renombrar conversaciones (el título automático del primer
  // mensaje no siempre describe de qué se habló). Android no tiene
  // Alert.prompt → mini-modal propio con TextInput.
  const [renaming, setRenaming] = useState<{ id: string; titulo: string } | null>(null);
  const applyRename = useCallback(async () => {
    if (!renaming) return;
    const nuevo = renaming.titulo.trim() || 'Conversación';
    const target = pastSessions.find(s => s.id === renaming.id);
    if (target) {
      const updated = { ...target, titulo: nuevo }; // sin bumpear updatedAt: no reordena
      await saveSession(projectId, updated).catch(() => {});
      setPastSessions(prev => prev.map(s => (s.id === renaming.id ? updated : s)));
    }
    setSession(prev => (prev && prev.id === renaming.id ? { ...prev, titulo: nuevo } : prev));
    setRenaming(null);
  }, [renaming, pastSessions, projectId]);

  const removeSession = useCallback((s: AIChatSession) => {
    Alert.alert('Eliminar conversación', `¿Eliminar "${s.titulo}" del historial?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar', style: 'destructive',
        onPress: async () => {
          await deleteSession(projectId, s.id);
          setPastSessions(prev => prev.filter(x => x.id !== s.id));
          if (session?.id === s.id) startNewSession();
        },
      },
    ]);
  }, [projectId, session?.id, startNewSession]);

  // Guard SÍNCRONO contra doble envío (dos taps en el mismo frame ven el
  // estado `sending` todavía en false) + id de la sesión con envío en vuelo
  // (los TypingDots solo se muestran en ESA sesión).
  const sendingRef = useRef(false);
  const [sendingSessionId, setSendingSessionId] = useState<string | null>(null);

  const send = useCallback(async (text: string) => {
    const msg = text.trim();
    if (!msg || sendingRef.current || !session) return;
    sendingRef.current = true;
    setInput('');
    setSending(true);
    setSendingSessionId(session.id);

    const stamp = () => `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const userMsg: AIChatMessage = { id: `u-${stamp()}`, role: 'user', text: msg, at: Date.now() };
    // Primer mensaje de la sesión → desvanecer la bienvenida sobre el chat
    // (crossfade) en vez del corte seco.
    if (session.messages.length === 0) {
      setWelcomeLeaving(true);
      Animated.timing(welcomeFade, { toValue: 0, duration: 450, useNativeDriver: true }).start(() => {
        setWelcomeLeaving(false);
        welcomeFade.setValue(1); // lista para la próxima bienvenida (nueva conversación)
      });
    }
    const base: AIChatSession = {
      ...session,
      titulo: session.messages.length === 0 ? sessionTitleFrom(msg) : session.titulo,
      messages: [...session.messages, userMsg],
      updatedAt: Date.now(),
    };
    setSession(base);

    // Anexar la respuesta SOBRE la sesión VIVA (prev), no sobre el `base`
    // congelado: entre el envío y la respuesta pudo cambiar el estado de un
    // mensaje (p.ej. actionDone de una tarjeta ejecutada) y pisarlo con base lo
    // revertiría — reabriendo una acción ya ejecutada (ensayo duplicado).
    // Si el usuario cambió de sesión, se persiste igual al historial.
    const applyResult = (aiMsg: AIChatMessage) => {
      setSession(prev => {
        if (prev && prev.id === base.id) {
          const next = { ...prev, messages: [...prev.messages, aiMsg], updatedAt: Date.now() };
          saveSession(projectId, next).catch(() => {});
          return next;
        }
        const stored = { ...base, messages: [...base.messages, aiMsg], updatedAt: Date.now() };
        saveSession(projectId, stored).catch(() => {});
        return prev;
      });
    };

    try {
      const history = base.messages.slice(0, -1)
        .filter(m => !isErrorMsg(m))
        .map(m => ({ role: m.role, content: m.text }));
      const res = await sendChatMessage({ projectId, message: msg, history, isFirstTurn });
      applyResult({
        id: `a-${stamp()}`, role: 'assistant', text: res.reply,
        ...(res.chartSvg ? { chartSvg: res.chartSvg } : {}),
        ...(res.action ? { action: res.action } : {}),
        at: Date.now(),
      });
    } catch (e) {
      applyResult({
        id: `e-${stamp()}`, role: 'assistant',
        text: `⚠ ${e instanceof Error ? e.message : 'No pude responder. Intente de nuevo.'}`,
        at: Date.now(),
      });
    } finally {
      sendingRef.current = false;
      setSending(false);
      setSendingSessionId(null);
    }
  }, [projectId, session, isFirstTurn]);

  // ── Ejecución de tarjetas de acción (one-shot, con confirmación del usuario) ──
  const [runningActionId, setRunningActionId] = useState<string | null>(null);
  // Id de la sesión visible, siempre fresco (para el guard de markActionDone).
  const sessionIdRef = useRef<string | null>(null);
  sessionIdRef.current = session?.id ?? null;

  /** Marca la tarjeta como ejecutada EN SU SESIÓN: si la sesión visible cambió
   *  durante la espera, actualiza el historial persistido directamente (sin
   *  tocar la sesión actual ni bumpear su updatedAt — no reordena nada). */
  const markActionDone = useCallback((sessionId: string, msgId: string) => {
    setSession(prev => {
      if (!prev || prev.id !== sessionId) {
        loadSessions(projectId).then(all => {
          const s = all.find(x => x.id === sessionId);
          if (!s) return;
          const stored = { ...s, messages: s.messages.map(m => (m.id === msgId ? { ...m, actionDone: true } : m)) };
          saveSession(projectId, stored).catch(() => {});
        }).catch(() => {});
        return prev;
      }
      const next = {
        ...prev,
        messages: prev.messages.map(m => (m.id === msgId ? { ...m, actionDone: true } : m)),
        updatedAt: Date.now(),
      };
      saveSession(projectId, next).catch(() => {});
      return next;
    });
  }, [projectId]);

  const executeAction = useCallback(async (item: AIChatMessage) => {
    const action = item.action;
    const sessionId = sessionIdRef.current;
    if (!action || item.actionDone || runningActionId || !sessionId) return;
    try {
      if (action.kind === 'abrir_pantalla') {
        const dest = DESTINO_SCREEN[action.destino];
        if (!dest) { Alert.alert('Acción', 'Ese destino no está disponible en esta versión de la app.'); return; }
        markActionDone(sessionId, item.id);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        navigation.navigate(dest.screen as any, { projectId, projectName, ...(dest.params ?? {}) } as any);
        return;
      }
      if (action.kind === 'crear_muestra') {
        markActionDone(sessionId, item.id);
        navigation.navigate('Samples', { projectId, projectName });
        return;
      }
      if (action.kind === 'crear_ensayo') {
        setRunningActionId(item.id);
        // El templateId viene del catálogo de la NUBE: verificar que la plantilla
        // (y sus ítems) existan LOCALMENTE — si no, createInstances crearía en
        // silencio una ficha VACÍA y consumiría un correlativo.
        const tplLocal = await protocolTemplatesCollection.find(action.templateId).catch(() => null);
        const itemCount = tplLocal
          ? await protocolTemplateItemsCollection.query(Q.where('template_id', action.templateId)).fetchCount().catch(() => 0)
          : 0;
        if (!tplLocal || itemCount === 0) {
          Alert.alert(
            'Plantilla sin sincronizar',
            `El tipo "${action.templateNombre}" aún no está sincronizado en este teléfono. Entre a Ensayos o sincronice el proyecto e intente de nuevo.`,
          );
          return; // NO marcar hecho: la tarjeta queda disponible para reintentar
        }
        // MISMO motor que la UI (numeración correlativa, reserva atómica online,
        // push + cola). createInstances es dueño del database.write.
        const res = await createInstances({
          projectId,
          template: { id: action.templateId, name: action.templateNombre, idProtocolo: action.templateCodigo ?? null },
          sectorId: action.sectorId ?? null,
          sectorName: action.sectorNombre ?? null,
          ensayoDate: action.fecha ?? null,
        });
        markActionDone(sessionId, item.id);
        const newId = res.ids[0];
        if (newId) navigation.navigate('ProtocolFill', { protocolId: newId });
        else Alert.alert('Acción', 'No se pudo crear el ensayo. Intente desde la pantalla de Ensayos.');
      }
    } catch (e) {
      Alert.alert('Acción', e instanceof Error ? e.message : 'No se pudo ejecutar la acción.');
    } finally {
      setRunningActionId(null);
    }
  }, [projectId, projectName, navigation, runningActionId, markActionDone]);

  const renderMessage = useCallback(({ item }: { item: AIChatMessage }) => {
    const isUser = item.role === 'user';
    const isError = !isUser && item.text.startsWith('⚠');
    const hasChart = !isUser && !!item.chartSvg;
    // Ancho del gráfico (viewBox 640×360): ancho de pantalla menos padding de la
    // lista (14×2), avatar+gap (33) y padding de la burbuja (12×2) — sin desborde.
    const chartW = Math.min(winWidth - 28 - 33 - 24 - 2, 640);
    return (
      <View style={[styles.msgRow, isUser ? styles.msgRowUser : styles.msgRowAI]}>
        {!isUser && (
          <PulseIn fresh={Date.now() - item.at < 4000}>
            <View style={styles.avatar}>
              <Ionicons name="water" size={13} color={Colors.white} />
            </View>
          </PulseIn>
        )}
        <View style={[styles.bubble, isUser ? styles.bubbleUser : styles.bubbleAI, isError && styles.bubbleError, hasChart && styles.bubbleChart]}>
          {hasChart && (
            <View style={styles.chartBox}>
              <SvgXml xml={item.chartSvg!} width={chartW} height={chartW * (360 / 640)} />
            </View>
          )}
          <RichText
            style={[styles.msgText, isUser ? styles.msgTextUser : styles.msgTextAI, isError && styles.msgTextError]}
            text={isError ? item.text.slice(1).trim() : item.text}
          />
          {/* ── Tarjeta de acción (confirmación explícita del usuario) ── */}
          {!isUser && item.action && (
            <TouchableOpacity
              style={[styles.actionCard, item.actionDone && styles.actionCardDone]}
              onPress={() => executeAction(item)}
              disabled={!!item.actionDone || runningActionId === item.id}
              activeOpacity={0.75}
            >
              <Ionicons
                name={item.action.kind === 'crear_ensayo' ? 'flask-outline' : item.action.kind === 'crear_muestra' ? 'archive-outline' : 'navigate-outline'}
                size={17}
                color={item.actionDone ? Colors.success : Colors.primary}
              />
              <Text style={[styles.actionLabel, item.actionDone && { color: Colors.textMuted }]} numberOfLines={2}>
                {item.action.etiqueta}
              </Text>
              {runningActionId === item.id ? (
                <ActivityIndicator size={14} color={Colors.primary} />
              ) : (
                <View style={[styles.actionBtn, item.actionDone && styles.actionBtnDone]}>
                  <Text style={styles.actionBtnText}>
                    {item.actionDone ? 'Hecho ✓' : item.action.kind === 'abrir_pantalla' ? 'Abrir' : 'Crear'}
                  </Text>
                </View>
              )}
            </TouchableOpacity>
          )}
          <View style={styles.msgFooter}>
            {!isUser && !isError && (
              loadingSpeechId === item.id ? (
                <ActivityIndicator size={13} color={Colors.primary} />
              ) : (
                <TouchableOpacity onPress={() => toggleSpeech(item)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Ionicons
                    name={speakingId === item.id ? 'stop-circle' : 'volume-medium-outline'}
                    size={16}
                    color={speakingId === item.id ? Colors.primary : Colors.textMuted}
                  />
                </TouchableOpacity>
              )
            )}
            <Text style={[styles.msgTime, isUser ? styles.msgTimeUser : styles.msgTimeAI]}>{fmtTime(item.at)}</Text>
          </View>
        </View>
      </View>
    );
  }, [winWidth, speakingId, loadingSpeechId, toggleSpeech, runningActionId, executeAction]);

  return (
    <View style={styles.container}>
      <AppHeader
        title="FLOW IA"
        subtitle={projectName}
        onBack={() => navigation.goBack()}
        rightContent={
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 18 }}>
            <TouchableOpacity onPress={openHistory} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="time-outline" size={21} color={Colors.white} />
            </TouchableOpacity>
            <TouchableOpacity onPress={startNewSession} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="create-outline" size={21} color={Colors.white} />
            </TouchableOpacity>
          </View>
        }
      />

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {booting ? (
          /* Cargando la última sesión: nada de bienvenida hasta decidir. */
          <View style={{ flex: 1 }} />
        ) : (
          <View style={{ flex: 1 }}>
            {messages.length > 0 && (
              <FlatList
                ref={listRef}
                data={messages}
                keyExtractor={m => m.id}
                renderItem={renderMessage}
                contentContainerStyle={styles.listContent}
                onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
                ListFooterComponent={sending && sendingSessionId === session?.id ? (
                  <View style={[styles.msgRow, styles.msgRowAI]}>
                    <View style={styles.avatar}><Ionicons name="water" size={13} color={Colors.white} /></View>
                    <View style={[styles.bubble, styles.bubbleAI, { paddingVertical: 14 }]}>
                      <TypingDots />
                    </View>
                  </View>
                ) : null}
              />
            )}
            {/* ── Bienvenida de FLOW: agua viva TÁCTIL (motor GL del login).
                  Es un OVERLAY que se desvanece al primer mensaje (crossfade
                  sobre la lista) y se desmonta al conversar (batería). ── */}
            {(messages.length === 0 || welcomeLeaving) && (
              <Animated.View
                style={[StyleSheet.absoluteFill, { opacity: welcomeFade }]}
                pointerEvents={welcomeLeaving ? 'none' : 'auto'}
              >
                <View
                  ref={waterBoxRef}
                  style={{ flex: 1 }}
                  onLayout={measureWaterBox}
                  onStartShouldSetResponderCapture={(e) => { onWaterTouch(e); return false; }}
                  onMoveShouldSetResponderCapture={(e) => { onWaterMove(e); return false; }}
                >
                  {glOk && <WaterRipplesGL ref={glRef} onUnsupported={() => setGlOk(false)} />}
                  <ScrollView contentContainerStyle={styles.emptyWrap}>
                    <View style={[styles.emptyBadge, glOk && styles.emptyBadgeDark]}>
                      <Ionicons name="water" size={30} color={glOk ? Colors.white : Colors.primary} />
                    </View>
                    <Text style={[styles.flowLogoText, !glOk && { color: Colors.navy }]}>
                      FLOW <Text style={styles.flowLogoIA}>IA</Text>
                    </Text>
                    <Text style={[styles.flowSlogan, !glOk && { color: Colors.textSecondary }]}>La inteligencia de su obra</Text>
                    <Text style={[styles.emptyTitle, glOk && styles.emptyTitleDark]}>
                      {firstName ? `Hola ${firstName}, ¿por dónde empezamos?` : 'Hola, ¿por dónde empezamos?'}
                    </Text>
                    <Text style={[styles.emptyText, glOk && styles.emptyTextDark]}>
                      Pregúntele en lenguaje natural por los ensayos, sectores y avance de{' '}
                      <Text style={{ fontWeight: '800' }}>{projectName}</Text>.
                    </Text>
                    {insight && (
                      <Text style={[styles.insightText, glOk && styles.insightTextDark]}>{insight}</Text>
                    )}
                    <View style={styles.chipsWrap}>
                      {suggested.map(q => (
                        <TouchableOpacity key={q} style={[styles.chip, glOk && styles.chipDark]} onPress={() => send(q)} disabled={sending} activeOpacity={0.75}>
                          <Ionicons name="chatbubble-ellipses-outline" size={13} color={glOk ? Colors.white : Colors.primary} />
                          <Text style={[styles.chipText, glOk && styles.chipTextDark]}>{q}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </ScrollView>
                </View>
              </Animated.View>
            )}
          </View>
        )}

        {/* ── Barra de entrada ── */}
        <View style={[styles.inputBar, { paddingBottom: Math.max(insets.bottom, 10) }]}>
          <TextInput
            style={styles.input}
            value={input}
            onChangeText={setInput}
            placeholder="Escriba su consulta…"
            placeholderTextColor={Colors.textMuted}
            multiline
            maxLength={2000}
            editable={!sending}
          />
          <TouchableOpacity
            style={[styles.sendBtn, (!input.trim() || sending) && styles.sendBtnDisabled]}
            onPress={() => send(input)}
            disabled={!input.trim() || sending}
            activeOpacity={0.8}
          >
            <Ionicons name="arrow-up" size={19} color={Colors.white} />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

      {/* ── Modal: historial de conversaciones (LOCAL) ── */}
      <Modal visible={showHistory} transparent animationType="fade" onRequestClose={() => setShowHistory(false)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setShowHistory(false)}>
          <TouchableOpacity activeOpacity={1} style={styles.historyCard} onPress={() => {}}>
            <View style={styles.historyHeader}>
              <Text style={styles.historyTitle}>Conversaciones</Text>
              <TouchableOpacity onPress={() => setShowHistory(false)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Ionicons name="close" size={20} color={Colors.textPrimary} />
              </TouchableOpacity>
            </View>
            <TouchableOpacity style={styles.newChatBtn} onPress={() => { startNewSession(); setShowHistory(false); }} activeOpacity={0.8}>
              <Ionicons name="add-circle-outline" size={17} color={Colors.white} />
              <Text style={styles.newChatBtnText}>Nueva conversación</Text>
            </TouchableOpacity>
            <ScrollView style={{ maxHeight: 380 }}>
              {pastSessions.length === 0 ? (
                <Text style={styles.historyEmpty}>Sin conversaciones guardadas en este dispositivo.</Text>
              ) : pastSessions.map(s => (
                <View key={s.id} style={[styles.historyItem, session?.id === s.id && styles.historyItemActive]}>
                  <TouchableOpacity style={{ flex: 1 }} onPress={() => resumeSession(s)} activeOpacity={0.7}>
                    <Text style={styles.historyItemTitle} numberOfLines={1}>{s.titulo}</Text>
                    <Text style={styles.historyItemMeta}>
                      {fmtDay(s.updatedAt)} · {fmtTime(s.updatedAt)} · {s.messages.length} mensajes
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => setRenaming({ id: s.id, titulo: s.titulo })} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Ionicons name="pencil-outline" size={16} color={Colors.textMuted} />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => removeSession(s)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Ionicons name="trash-outline" size={17} color={Colors.textMuted} />
                  </TouchableOpacity>
                </View>
              ))}
            </ScrollView>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* ── Modal: renombrar conversación ── */}
      <Modal visible={renaming != null} transparent animationType="fade" onRequestClose={() => setRenaming(null)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setRenaming(null)}>
          <TouchableOpacity activeOpacity={1} style={styles.historyCard} onPress={() => {}}>
            <Text style={styles.historyTitle}>Renombrar conversación</Text>
            <TextInput
              style={styles.renameInput}
              value={renaming?.titulo ?? ''}
              onChangeText={txt => setRenaming(prev => (prev ? { ...prev, titulo: txt } : prev))}
              placeholder="Nombre de la conversación"
              placeholderTextColor={Colors.textMuted}
              maxLength={60}
              autoFocus
            />
            <TouchableOpacity style={styles.newChatBtn} onPress={applyRename} activeOpacity={0.8}>
              <Ionicons name="checkmark" size={17} color={Colors.white} />
              <Text style={styles.newChatBtnText}>Guardar</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.surface },

  // Estado inicial
  emptyWrap: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 10 },
  flowLogoText: { fontSize: 34, fontWeight: '900', color: Colors.white, letterSpacing: 4 },
  flowLogoIA: { fontSize: 20, fontWeight: '800', color: '#9fc3ee', letterSpacing: 2 },
  flowSlogan: { fontSize: 12, fontWeight: '700', color: '#bcd0ea', letterSpacing: 1.5, textTransform: 'uppercase', marginTop: -6 },
  emptyBadge: {
    width: 64, height: 64, borderRadius: 32, backgroundColor: Colors.primary + '14',
    alignItems: 'center', justifyContent: 'center', marginBottom: 2,
    borderWidth: 1.5, borderColor: Colors.primary + '33',
  },
  emptyTitle: { fontSize: 19, fontWeight: '900', color: Colors.navy },
  emptyText: { fontSize: 13, color: Colors.textSecondary, textAlign: 'center', lineHeight: 19, maxWidth: 320 },
  chipsWrap: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8, marginTop: 14 },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: Colors.white, borderWidth: 1.2, borderColor: Colors.primary + '55',
    borderRadius: 18, paddingHorizontal: 12, paddingVertical: 8, ...Shadow.subtle,
  },
  chipText: { fontSize: 12.5, fontWeight: '700', color: Colors.primary },
  // Variante OSCURA de la bienvenida (sobre el agua GL navy del login).
  emptyBadgeDark: { backgroundColor: 'rgba(255,255,255,0.14)', borderColor: 'rgba(255,255,255,0.38)' },
  emptyTitleDark: { color: Colors.white },
  emptyTextDark: { color: '#d8e1ef' },
  chipDark: { backgroundColor: 'rgba(255,255,255,0.13)', borderColor: 'rgba(255,255,255,0.42)' },
  chipTextDark: { color: Colors.white },
  insightText: { fontSize: 12, fontWeight: '700', color: Colors.textSecondary, marginTop: 2 },
  insightTextDark: { color: '#bcd0ea' },

  // Mensajes
  listContent: { padding: 14, gap: 10, paddingBottom: 18 },
  msgRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 7 },
  msgRowUser: { justifyContent: 'flex-end' },
  msgRowAI: { justifyContent: 'flex-start' },
  avatar: {
    width: 26, height: 26, borderRadius: 13, backgroundColor: Colors.navy,
    alignItems: 'center', justifyContent: 'center', marginBottom: 2,
  },
  bubble: { maxWidth: '78%', borderRadius: Radius.md, paddingHorizontal: 12, paddingVertical: 9 },
  bubbleUser: { backgroundColor: Colors.navy, borderBottomRightRadius: 4 },
  bubbleAI: { backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.border, borderBottomLeftRadius: 4, ...Shadow.subtle },
  bubbleError: { borderColor: Colors.danger + '66', backgroundColor: Colors.danger + '0D' },
  bubbleChart: { maxWidth: '92%' },
  chartBox: {
    borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.sm,
    overflow: 'hidden', marginBottom: 8, backgroundColor: Colors.white,
  },

  // Tarjeta de acción
  actionCard: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginTop: 8, paddingHorizontal: 10, paddingVertical: 9,
    borderRadius: Radius.sm, borderWidth: 1.2, borderColor: Colors.primary + '55',
    backgroundColor: Colors.primary + '0A',
  },
  actionCardDone: { borderColor: Colors.border, backgroundColor: Colors.surface },
  actionLabel: { flex: 1, fontSize: 12.5, fontWeight: '700', color: Colors.textPrimary },
  actionBtn: {
    backgroundColor: Colors.primary, borderRadius: 14,
    paddingHorizontal: 12, paddingVertical: 6,
  },
  actionBtnDone: { backgroundColor: Colors.success },
  actionBtnText: { color: Colors.white, fontSize: 11.5, fontWeight: '800' },
  msgText: { fontSize: 14, lineHeight: 20 },
  msgTextUser: { color: Colors.white },
  msgTextAI: { color: Colors.textPrimary },
  msgTextError: { color: Colors.danger },
  msgFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 8, marginTop: 4 },
  msgTime: { fontSize: 9.5 },
  msgTimeUser: { color: Colors.white + '99' },
  msgTimeAI: { color: Colors.textMuted },

  // Typing
  typingRow: { flexDirection: 'row', gap: 5, alignItems: 'center' },
  typingDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: Colors.textSecondary },

  // Input
  inputBar: {
    flexDirection: 'row', alignItems: 'flex-end', gap: 8,
    paddingHorizontal: 12, paddingTop: 10,
    backgroundColor: Colors.white, borderTopWidth: 1, borderTopColor: Colors.border,
  },
  input: {
    flex: 1, minHeight: 40, maxHeight: 110,
    backgroundColor: Colors.surface, borderRadius: 20, borderWidth: 1, borderColor: Colors.border,
    paddingHorizontal: 14, paddingVertical: 10, fontSize: 14, color: Colors.textPrimary,
  },
  sendBtn: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.primary,
    alignItems: 'center', justifyContent: 'center', ...Shadow.subtle,
  },
  sendBtnDisabled: { backgroundColor: Colors.textMuted },

  // Historial
  modalOverlay: { flex: 1, backgroundColor: 'rgba(14,33,61,0.55)', justifyContent: 'center', padding: 22 },
  historyCard: { backgroundColor: Colors.white, borderRadius: Radius.md, padding: 16, ...Shadow.card },
  historyHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  historyTitle: { fontSize: 16, fontWeight: '900', color: Colors.navy },
  newChatBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7,
    backgroundColor: Colors.primary, borderRadius: Radius.sm, paddingVertical: 10, marginBottom: 10,
  },
  newChatBtnText: { color: Colors.white, fontWeight: '800', fontSize: 13 },
  historyEmpty: { fontSize: 12.5, color: Colors.textMuted, textAlign: 'center', paddingVertical: 18 },
  renameInput: {
    borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.sm,
    paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: Colors.textPrimary,
    marginVertical: 12, backgroundColor: Colors.surface,
  },
  historyItem: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 10, paddingHorizontal: 8, borderRadius: Radius.sm,
    borderBottomWidth: 1, borderBottomColor: Colors.surface,
  },
  historyItemActive: { backgroundColor: Colors.primary + '0D' },
  historyItemTitle: { fontSize: 13.5, fontWeight: '700', color: Colors.textPrimary },
  historyItemMeta: { fontSize: 11, color: Colors.textMuted, marginTop: 2 },
});
