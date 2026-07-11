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
  ActivityIndicator, Share, AppState, type StyleProp, type TextStyle,
} from 'react-native';
import { captureRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Path, SvgXml } from 'react-native-svg';
import { Q } from '@nozbe/watermelondb';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@navigation/types';
import { useAuth } from '@context/AuthContext';
import { Colors, Radius, Shadow } from '../theme/colors';
import {
  database, nonConformitiesCollection, projectSectorsCollection, protocolsCollection,
  protocolTemplatesCollection, protocolTemplateItemsCollection,
} from '@db/index';
import { repairCloudSummaryOnce } from '@services/SummaryRowService';
import { createInstances } from '@services/ProtocolInstanceService';
import { pushProjectToSupabase } from '@services/SupabaseSyncService';
import WaterRipplesGL, { type WaterGLHandle } from '@components/WaterRipplesGL';
import {
  type AIChatMessage, type AIChatSession, type AIEnsayoLink, addPref,
  deleteNarrationFile, deleteSession, getFillerAudioUri, loadPrefs, loadSessions,
  newSessionId, removePref, requestNarration, saveSession, sendChatMessage,
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

// ── expo-speech-recognition con require DIFERIDO (mismo motivo que expo-audio:
// módulo NATIVO nuevo — un dev client viejo no lo tiene y no debe reventar). ──
interface SpeechModuleLite {
  requestPermissionsAsync: () => Promise<{ granted: boolean }>;
  start: (opts: { lang: string; interimResults?: boolean; continuous?: boolean }) => void;
  stop: () => void;
  abort: () => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  addListener: (event: string, cb: (e: any) => void) => { remove: () => void };
}
function loadSpeech(): SpeechModuleLite | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const m = require('expo-speech-recognition');
    return m.ExpoSpeechRecognitionModule ?? null;
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

/** v78 — Logo de FLOW: gota SVG limpia (contorno + brillo interior), centrada
 *  en la parte superior de la bienvenida. */
function DropLogo({ size = 88 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Path
        d="M50 6 C50 6 19 44 19 65 a31 31 0 0 0 62 0 C81 44 50 6 50 6 Z"
        fill="rgba(255,255,255,0.14)"
        stroke="#ffffff"
        strokeWidth={2.6}
      />
      <Path
        d="M34 64 a16 16 0 0 0 11 17"
        stroke="#ffffff"
        strokeWidth={3.2}
        strokeLinecap="round"
        fill="none"
        opacity={0.85}
      />
    </Svg>
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

// Dimensiones del carrusel de sugerencias (v78): 3 tarjetas visibles.
const SUG_H = 50;
const SUG_GAP = 10;
const CAROUSEL_H = SUG_H * 3 + SUG_GAP * 2;

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
  // Montaje vivo (gates de callbacks diferidos: narración manos-libres, etc.).
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const [session, setSession] = useState<AIChatSession | null>(null);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
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
  // v78 — Velo blanco de la transición bienvenida→chat (0=transparente).
  const whiteVeil = useRef(new Animated.Value(0)).current;
  const [welcomeLeaving, setWelcomeLeaving] = useState(false);

  // ── Dictado por voz (E4): micrófono del sistema, es-PE, resultados en vivo ──
  const [micActive, setMicActive] = useState(false);
  const micSubsRef = useRef<{ remove: () => void }[]>([]);
  const micBaseTextRef = useRef('');
  const micPulse = useRef(new Animated.Value(1)).current;
  // Guard SÍNCRONO: hay un await (permisos) antes de setMicActive — dos taps
  // rápidos iniciarían el reconocedor dos veces.
  const micBusyRef = useRef(false);

  const clearMicSubs = useCallback(() => {
    micSubsRef.current.forEach(s => { try { s.remove(); } catch { /* ya removido */ } });
    micSubsRef.current = [];
  }, []);

  const stopMic = useCallback((abort = false) => {
    const speech = loadSpeech();
    try { if (abort) speech?.abort(); else speech?.stop(); } catch { /* no estaba activo */ }
    clearMicSubs();
    setMicActive(false);
  }, [clearMicSubs]);

  const startMic = useCallback(async () => {
    if (micActive) { stopMic(); return; }
    if (micBusyRef.current) return;
    const speech = loadSpeech();
    if (!speech) {
      Alert.alert('Función no disponible', 'El dictado por voz requiere reinstalar la aplicación (nuevo módulo de voz).');
      return;
    }
    micBusyRef.current = true;
    try {
      const perm = await speech.requestPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('Micrófono', 'Sin permiso de micrófono no se puede dictar. Actívelo en los ajustes del sistema.');
        return;
      }
      // Conserva lo ya escrito y dicta a continuación.
      micBaseTextRef.current = input.trim() ? `${input.trim()} ` : '';
      clearMicSubs();
      micSubsRef.current = [
        speech.addListener('result', e => {
          const txt = e?.results?.[0]?.transcript ?? '';
          if (txt) setInput(micBaseTextRef.current + txt);
        }),
        speech.addListener('end', () => { clearMicSubs(); setMicActive(false); }),
        speech.addListener('error', e => {
          clearMicSubs();
          setMicActive(false);
          const code = String(e?.error ?? '');
          if (code !== 'aborted' && code !== 'no-speech') {
            Alert.alert('Dictado', 'No se pudo reconocer la voz. Intente de nuevo.');
          }
        }),
      ];
      speech.start({ lang: 'es-PE', interimResults: true, continuous: false });
      setMicActive(true);
    } catch {
      clearMicSubs();
      setMicActive(false);
      Alert.alert('Dictado', 'No se pudo iniciar el dictado.');
    } finally {
      micBusyRef.current = false;
    }
  }, [micActive, input, stopMic, clearMicSubs]);

  // Pulso del botón de mic mientras escucha + liberación al salir.
  useEffect(() => {
    if (!micActive) { micPulse.setValue(1); return; }
    const anim = Animated.loop(Animated.sequence([
      Animated.timing(micPulse, { toValue: 1.18, duration: 550, useNativeDriver: true }),
      Animated.timing(micPulse, { toValue: 1, duration: 550, useNativeDriver: true }),
    ]));
    anim.start();
    return () => anim.stop();
  }, [micActive, micPulse]);
  useEffect(() => () => { stopMic(true); }, [stopMic]);

  // Dictado directo desde la burbuja (long-press) → autoMic en los params.
  // El param se LIMPIA tras usarse (setParams) para que un nuevo long-press
  // sobre la pantalla ya montada vuelva a disparar el mic.
  const autoMicParam = (route.params as { autoMic?: boolean }).autoMic;
  useEffect(() => {
    if (!booting && autoMicParam) {
      const t = setTimeout(() => {
        startMic();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        navigation.setParams({ autoMic: undefined } as any);
      }, 400);
      return () => clearTimeout(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [booting, autoMicParam]);

  // ══ MODO SOLO VOZ (v78) — conversación natural inmersiva ══════════════════
  // Pantalla overlay tipo asistente: círculo de agua (quieta al escuchar, viva
  // al hablar), loop escuchar→pensar→hablar→escuchar. Todo queda registrado
  // como chat normal (send() de siempre). Muletillas cacheadas tapan el tiempo
  // de respuesta del modelo. Regla: escribe→se le responde por texto; habla→voz.
  const [voiceMode, setVoiceMode] = useState(false);
  const [voicePhase, setVoicePhase] = useState<'listening' | 'thinking' | 'speaking'>('listening');
  const [voiceTranscript, setVoiceTranscript] = useState('');
  const [voiceReply, setVoiceReply] = useState('');
  const voiceModeRef = useRef(false);
  const voiceBusyRef = useRef(false);
  const voiceSubsRef = useRef<{ remove: () => void }[]>([]);
  const voicePlayerRef = useRef<AudioPlayerLite | null>(null);
  const voiceFinishRef = useRef<(() => void) | null>(null);
  const fillerPlayerRef = useRef<AudioPlayerLite | null>(null);
  const fillerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Contador de errores reales consecutivos del reconocedor + ref de salida
  // (exitVoiceMode se declara más abajo; el listener lo usa vía ref).
  const voiceErrorsRef = useRef(0);
  const exitVoiceModeRef = useRef<() => void>(() => {});

  // Franja de iluminación inferior: "respira" (pulso suave) mientras escucha
  // o habla; queda fija y tenue al pensar. Sin GL — barato en batería/CPU.
  const voiceGlowAnim = useRef(new Animated.Value(0.5)).current;
  const voiceGlowLoopRef = useRef<Animated.CompositeAnimation | null>(null);
  const startVoiceGlow = useCallback((mode: 'listening' | 'speaking') => {
    voiceGlowLoopRef.current?.stop();
    const [lo, hi, dur] = mode === 'speaking' ? [0.55, 1, 420] : [0.35, 0.75, 900];
    voiceGlowLoopRef.current = Animated.loop(Animated.sequence([
      Animated.timing(voiceGlowAnim, { toValue: hi, duration: dur, useNativeDriver: true }),
      Animated.timing(voiceGlowAnim, { toValue: lo, duration: dur, useNativeDriver: true }),
    ]));
    voiceGlowLoopRef.current.start();
  }, [voiceGlowAnim]);
  const stopVoiceGlow = useCallback(() => {
    voiceGlowLoopRef.current?.stop();
    voiceGlowLoopRef.current = null;
    Animated.timing(voiceGlowAnim, { toValue: 0.4, duration: 300, useNativeDriver: true }).start();
  }, [voiceGlowAnim]);

  const clearVoiceSubs = useCallback(() => {
    voiceSubsRef.current.forEach(s => { try { s.remove(); } catch { /* ya removido */ } });
    voiceSubsRef.current = [];
  }, []);

  const stopFiller = useCallback(() => {
    try { fillerPlayerRef.current?.remove(); } catch { /* ya liberado */ }
    fillerPlayerRef.current = null;
  }, []);

  /** Muletilla SOLO si la respuesta tarda de verdad (feedback: sonaba en TODAS
   *  las consultas, incómodo). Se arma un timer; si `send` resuelve antes,
   *  se cancela y nunca suena — solo tapa consultas genuinamente largas. */
  const armFillerTimer = useCallback(() => {
    if (fillerTimerRef.current) clearTimeout(fillerTimerRef.current);
    fillerTimerRef.current = setTimeout(async () => {
      fillerTimerRef.current = null;
      if (!voiceBusyRef.current || !voiceModeRef.current) return;
      const audio = loadExpoAudio();
      if (!audio) return;
      try {
        const uri = await getFillerAudioUri(projectId);
        if (!uri || !voiceModeRef.current || !voiceBusyRef.current) return;
        stopFiller();
        const player = audio.createAudioPlayer({ uri });
        fillerPlayerRef.current = player;
        player.play();
      } catch { /* sin muletilla */ }
    }, 1300);
  }, [projectId, stopFiller]);
  const disarmFillerTimer = useCallback(() => {
    if (fillerTimerRef.current) { clearTimeout(fillerTimerRef.current); fillerTimerRef.current = null; }
  }, []);

  /** Narra `text` y espera a que TERMINE (el loop de voz necesita el fin). */
  const voicePlayNarration = useCallback(async (text: string): Promise<void> => {
    const audio = loadExpoAudio();
    if (!audio) return;
    try {
      const uri = await requestNarration(projectId, text);
      if (!voiceModeRef.current) { deleteNarrationFile(uri); return; }
      stopFiller();
      await audio.setAudioModeAsync(TTS_AUDIO_MODE).catch(() => {});
      await new Promise<void>(resolve => {
        const player = audio.createAudioPlayer({ uri });
        voicePlayerRef.current = player;
        let done = false;
        let sub: { remove: () => void } | null = null;
        const finish = () => {
          if (done) return;
          done = true;
          try { sub?.remove(); } catch { /* ya removido */ }
          try { player.remove(); } catch { /* ya liberado */ }
          deleteNarrationFile(uri);
          voicePlayerRef.current = null;
          voiceFinishRef.current = null;
          resolve();
        };
        voiceFinishRef.current = finish; // corte inmediato al salir del modo voz
        sub = player.addListener('playbackStatusUpdate', s => { if (s?.didJustFinish) finish(); });
        player.play();
        setTimeout(finish, 150_000); // seguridad (didJustFinish puede no llegar)
      });
    } catch { /* sin voz: la respuesta igual quedó en el chat */ }
  }, [projectId, stopFiller]);

  /** (Re)abre el reconocedor en modo conversación. */
  const voiceListen = useCallback(() => {
    if (!voiceModeRef.current || voiceBusyRef.current) return;
    const speech = loadSpeech();
    if (!speech) { setVoiceMode(false); voiceModeRef.current = false; return; }
    clearVoiceSubs();
    setVoicePhase('listening');
    setVoiceTranscript('');
    startVoiceGlow('listening');
    voiceSubsRef.current = [
      speech.addListener('result', e => {
        voiceErrorsRef.current = 0; // hay reconocimiento: resetear el contador
        const txt = String(e?.results?.[0]?.transcript ?? '');
        if (txt) setVoiceTranscript(txt);
        if (e?.isFinal && txt.trim()) void handleVoiceUtteranceRef.current(txt.trim());
      }),
      speech.addListener('end', () => {
        // Silencio sin frase final → reabrir mientras siga el modo voz.
        if (voiceModeRef.current && !voiceBusyRef.current) {
          try { speech.start({ lang: 'es-PE', interimResults: true, continuous: false }); } catch { /* reintenta al próximo end */ }
        }
      }),
      speech.addListener('error', e => {
        const code = String(e?.error ?? '');
        if (code === 'no-speech' || code === 'aborted' || !voiceModeRef.current) return;
        // Errores REALES consecutivos (permiso revocado, servicio caído): sin
        // este corte el 'end' reabriría en bucle infinito gastando batería.
        voiceErrorsRef.current += 1;
        if (voiceErrorsRef.current >= 3) {
          exitVoiceModeRef.current();
          Alert.alert('Modo voz', 'El reconocimiento de voz no está disponible en este momento. Puede seguir escribiendo con normalidad.');
        }
      }),
    ];
    try { speech.start({ lang: 'es-PE', interimResults: true, continuous: false }); }
    catch { /* el próximo end reintenta */ }
  }, [clearVoiceSubs, startVoiceGlow]);

  /** Frase final del usuario → pensar (muletilla) → responder → hablar → escuchar.
   *  `send` se declara MÁS ABAJO en el componente → se usa vía ref (sendRef)
   *  para no romper el orden de declaración. */
  const sendRef = useRef<((text: string) => Promise<AIChatMessage | null>) | null>(null);
  const handleVoiceUtterance = useCallback(async (text: string) => {
    if (voiceBusyRef.current || !voiceModeRef.current) return;
    voiceBusyRef.current = true;
    try {
      try { loadSpeech()?.abort(); } catch { /* no activo */ }
      clearVoiceSubs();
      setVoiceTranscript(text);
      setVoicePhase('thinking');
      setVoiceReply('');
      stopVoiceGlow(); // "pensando": franja tenue y fija, sin pulso
      armFillerTimer(); // solo suena si la respuesta tarda de verdad (1.3s+)
      const aiMsg = await sendRef.current?.(text) ?? null;
      disarmFillerTimer();
      stopFiller();
      if (!voiceModeRef.current) return;
      if (aiMsg) {
        setVoiceReply(aiMsg.text.startsWith('⚠') ? aiMsg.text.slice(1).trim() : aiMsg.text);
        if (!aiMsg.text.startsWith('⚠')) {
          setVoicePhase('speaking');
          startVoiceGlow('speaking');
          await voicePlayNarration(aiMsg.text);
        }
      }
    } finally {
      voiceBusyRef.current = false;
      if (voiceModeRef.current) voiceListen();
    }
  }, [armFillerTimer, disarmFillerTimer, stopFiller, voicePlayNarration, startVoiceGlow, stopVoiceGlow, voiceListen, clearVoiceSubs]);
  // Ref para el listener (evita closure obsoleto dentro del reconocedor).
  const handleVoiceUtteranceRef = useRef(handleVoiceUtterance);
  useEffect(() => { handleVoiceUtteranceRef.current = handleVoiceUtterance; }, [handleVoiceUtterance]);

  const exitVoiceMode = useCallback(() => {
    voiceModeRef.current = false;
    voiceErrorsRef.current = 0;
    voiceBusyRef.current = false;
    try { loadSpeech()?.abort(); } catch { /* no activo */ }
    clearVoiceSubs();
    disarmFillerTimer();
    stopFiller();
    stopVoiceGlow();
    voiceFinishRef.current?.();
    setVoiceMode(false);
    setVoicePhase('listening');
    setVoiceTranscript('');
    setVoiceReply('');
  }, [clearVoiceSubs, disarmFillerTimer, stopFiller, stopVoiceGlow]);
  exitVoiceModeRef.current = exitVoiceMode;

  // stopMic/stopSpeech se declaran en otros bloques del componente → refs.
  const stopMicRef = useRef<(abort?: boolean) => void>(() => {});
  const stopSpeechRef = useRef<() => void>(() => {});
  const enterVoiceMode = useCallback(async () => {
    const speech = loadSpeech();
    if (!speech) {
      Alert.alert('Función no disponible', 'El modo voz requiere reinstalar la aplicación (nuevo módulo de voz).');
      return;
    }
    try {
      const perm = await speech.requestPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('Micrófono', 'Sin permiso de micrófono no se puede usar el modo voz.');
        return;
      }
    } catch { return; }
    stopMicRef.current(true);   // apagar dictado del input si estaba activo
    stopSpeechRef.current();    // cortar narración en curso
    voiceModeRef.current = true;
    setVoiceMode(true);
    setTimeout(() => voiceListen(), 350);
  }, [voiceListen]);

  // Apagar el modo voz al salir de la pantalla / backgroundear.
  useEffect(() => () => { exitVoiceMode(); }, [exitVoiceMode]);
  useEffect(() => {
    const sub = AppState.addEventListener('change', s => {
      if (s !== 'active' && voiceModeRef.current) exitVoiceMode();
    });
    return () => sub.remove();
  }, [exitVoiceMode]);

  // ── Modo manos libres (E2): narra sola cada respuesta nueva ──
  const [handsFree, setHandsFree] = useState(false);
  const handsFreeRef = useRef(false);
  useEffect(() => {
    AsyncStorage.getItem('ai_hands_free').then(v => {
      const on = v === '1';
      setHandsFree(on);
      handsFreeRef.current = on;
    }).catch(() => {});
  }, []);
  const toggleHandsFree = useCallback(() => {
    setHandsFree(prev => {
      const next = !prev;
      handsFreeRef.current = next;
      AsyncStorage.setItem('ai_hands_free', next ? '1' : '0').catch(() => {});
      return next;
    });
  }, []);

  // ── Compartir respuestas (E1): texto vía Share nativo; gráfico como PNG ──
  const chartShotRefs = useRef<Map<string, View>>(new Map());
  const shareMessage = useCallback(async (item: AIChatMessage) => {
    try {
      if (item.chartSvg) {
        const node = chartShotRefs.current.get(item.id);
        if (node) {
          const uri = await captureRef(node, { format: 'png', quality: 1, result: 'tmpfile' });
          const fileUri = uri.startsWith('file://') ? uri : `file://${uri}`;
          await Sharing.shareAsync(fileUri, { mimeType: 'image/png', dialogTitle: 'Compartir gráfico' });
          return;
        }
      }
      await Share.share({ message: item.text });
    } catch { /* usuario canceló el share sheet */ }
  }, []);

  // ── Preferencias de FLOW (E3): gestión desde el modal de historial ──
  const [prefs, setPrefs] = useState<string[]>([]);
  useEffect(() => { loadPrefs(projectId).then(setPrefs).catch(() => {}); }, [projectId]);
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

  // ── v78 — Carrusel VERTICAL de preguntas sugeridas (bienvenida): tarjetas de
  // ancho uniforme, alto de 3 visibles, auto-scroll lento ida-y-vuelta. Se
  // pausa unos segundos si el usuario lo toca/arrastra. ──
  const carouselRef = useRef<ScrollView>(null);
  const carouselPosRef = useRef(0);
  const carouselDirRef = useRef(1);
  const carouselPauseUntilRef = useRef(0);

  // Arco de agua al mostrar la bienvenida (transición marca de la casa).
  const isEmptyChat = (session?.messages.length ?? 0) === 0;

  useEffect(() => {
    if (booting || !isEmptyChat) return;
    const id = setInterval(() => {
      if (Date.now() < carouselPauseUntilRef.current) return;
      const max = Math.max(0, suggested.length * (SUG_H + SUG_GAP) - SUG_GAP - CAROUSEL_H);
      if (max <= 0) return;
      let pos = carouselPosRef.current + carouselDirRef.current * 0.5; // lento y fluido
      if (pos >= max) { pos = max; carouselDirRef.current = -1; carouselPauseUntilRef.current = Date.now() + 1200; }
      if (pos <= 0) { pos = 0; carouselDirRef.current = 1; carouselPauseUntilRef.current = Date.now() + 1200; }
      carouselPosRef.current = pos;
      carouselRef.current?.scrollTo({ y: pos, animated: false });
    }, 28);
    return () => clearInterval(id);
  }, [booting, isEmptyChat, suggested]);
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
  // Refs para el modo voz (declarado ANTES que estos bloques en el componente).
  stopSpeechRef.current = stopSpeech;
  stopMicRef.current = stopMic;

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
    // Snapshot FRESCO del storage (no el de pastSessions al abrir el modal):
    // si llegó un guardado más nuevo mientras el modal estaba abierto, un
    // snapshot viejo pisaría esos mensajes.
    const all = await loadSessions(projectId).catch(() => [] as AIChatSession[]);
    const target = all.find(s => s.id === renaming.id);
    if (target) {
      const updated = { ...target, titulo: nuevo }; // sin bumpear updatedAt: no reordena
      await saveSession(projectId, updated).catch(() => {});
      setPastSessions(prev => prev.map(s => (s.id === renaming.id ? updated : s)));
    }
    setSession(prev => (prev && prev.id === renaming.id ? { ...prev, titulo: nuevo } : prev));
    setRenaming(null);
  }, [renaming, projectId]);

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

  const send = useCallback(async (text: string): Promise<AIChatMessage | null> => {
    const msg = text.trim();
    if (!msg || sendingRef.current || !session) return null;
    sendingRef.current = true;
    setInput('');
    setSending(true);
    setSendingSessionId(session.id);

    const stamp = () => `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const userMsg: AIChatMessage = { id: `u-${stamp()}`, role: 'user', text: msg, at: Date.now() };
    // Primer mensaje de la sesión → TRANSICIÓN de marca (v78): el barrido de
    // olas del login + un velo que pasa de transparente a BLANCO, se desmonta
    // la bienvenida bajo el velo y el blanco se desvanece revelando el chat.
    if (session.messages.length === 0) {
      setWelcomeLeaving(true);
      glRef.current?.bigWave();
      Animated.timing(whiteVeil, { toValue: 1, duration: 620, delay: 280, useNativeDriver: true }).start(() => {
        setWelcomeLeaving(false);
        Animated.timing(whiteVeil, { toValue: 0, duration: 300, useNativeDriver: true }).start();
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
      // recordar_preferencia es SILENCIOSA: se guarda local, sin tarjeta
      // (no es destructiva y FLOW ya la confirma en el texto).
      let action = res.action;
      if (action?.kind === 'recordar_preferencia') {
        addPref(projectId, action.texto).then(setPrefs).catch(() => {});
        action = undefined;
      }
      const aiMsg: AIChatMessage = {
        id: `a-${stamp()}`, role: 'assistant', text: res.reply,
        ...(res.chartSvg ? { chartSvg: res.chartSvg } : {}),
        ...(action ? { action } : {}),
        ...(res.links?.length ? { links: res.links } : {}),
        at: Date.now(),
      };
      applyResult(aiMsg);
      // Manos libres: narrar sola la respuesta nueva (E2) — SOLO si la pantalla
      // sigue montada Y el usuario sigue en ESTA conversación. En MODO VOZ la
      // narración la maneja el propio loop de voz (no duplicar).
      if (handsFreeRef.current && res.reply && !voiceModeRef.current) {
        setTimeout(() => {
          if (!mountedRef.current || sessionIdRef.current !== base.id) return;
          toggleSpeech(aiMsg);
        }, 250);
      }
      return aiMsg;
    } catch (e) {
      const errMsg: AIChatMessage = {
        id: `e-${stamp()}`, role: 'assistant',
        text: `⚠ ${e instanceof Error ? e.message : 'No pude responder. Intente de nuevo.'}`,
        at: Date.now(),
      };
      applyResult(errMsg);
      return errMsg;
    } finally {
      sendingRef.current = false;
      setSending(false);
      setSendingSessionId(null);
    }
  }, [projectId, session, isFirstTurn, whiteVeil, toggleSpeech]);
  // El loop del modo voz llama a send vía ref (send se declara aquí, el loop arriba).
  sendRef.current = send;

  // ── Ejecución de tarjetas de acción (one-shot, con confirmación del usuario) ──
  const [runningActionId, setRunningActionId] = useState<string | null>(null);
  // Guard SÍNCRONO (el estado del closure llega tarde ante doble tap — misma
  // clase de bug que sendingRef en send).
  const runningActionRef = useRef(false);
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

  /** Abre un ensayo con la MISMA lógica de EnsayosScreen (Fill si se puede
   *  llenar, Audit si está enviado/aprobado; el rol manda). Local-first: si el
   *  ensayo aún no está sincronizado en este teléfono, avisa. */
  const openEnsayo = useCallback(async (protocolId: string): Promise<boolean> => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const p: any = await protocolsCollection.find(protocolId).catch(() => null);
    if (!p) {
      Alert.alert('Ensayo sin sincronizar', 'Ese ensayo aún no está descargado en este teléfono. Entre a Ensayos para sincronizar e intente de nuevo.');
      return false;
    }
    const role = (currentUser as any)?.role;
    const canFillStatus = p.status === 'DRAFT' || p.status === 'IN_PROGRESS' || (p.status === 'REJECTED' && (p.correctionsAllowed ?? false));
    if (role === 'CREATOR' || role === 'SUPERVISOR' || role === 'RESIDENT') {
      if (canFillStatus) navigation.navigate('ProtocolFill', { protocolId: p.id });
      else navigation.navigate('ProtocolAudit', { protocolId: p.id });
    } else {
      navigation.navigate('ProtocolFill', { protocolId: p.id });
    }
    return true;
  }, [navigation, currentUser]);

  const executeAction = useCallback(async (item: AIChatMessage) => {
    const action = item.action;
    const sessionId = sessionIdRef.current;
    if (!action || item.actionDone || runningActionRef.current || !sessionId) return;
    runningActionRef.current = true;
    try {
      if (action.kind === 'abrir_ensayo') {
        if (await openEnsayo(action.protocolId)) markActionDone(sessionId, item.id);
        return;
      }
      if (action.kind === 'abrir_dossier') {
        markActionDone(sessionId, item.id);
        navigation.navigate('Dossier', {
          projectId, projectName,
          initialFilters: {
            ...(action.desde ? { desde: action.desde } : {}),
            ...(action.hasta ? { hasta: action.hasta } : {}),
            ...(action.templateId ? { templateId: action.templateId } : {}),
            ...(action.sectorId ? { sectorId: action.sectorId } : {}),
          },
        });
        return;
      }
      if (action.kind === 'crear_nc') {
        setRunningActionId(item.id);
        // Mismo guardado que NonConformityScreen (validación de 10+ chars ya
        // hecha server-side) + push del proyecto para que la nube la vea.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const proto: any = await protocolsCollection.find(action.protocolId).catch(() => null);
        if (!proto) {
          Alert.alert('Ensayo sin sincronizar', 'Ese ensayo aún no está descargado en este teléfono. Sincronice e intente de nuevo.');
          return;
        }
        await database.write(async () => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await nonConformitiesCollection.create((nc: any) => {
            nc.projectId = projectId;
            nc.protocolId = action.protocolId;
            nc.description = action.descripcion;
            nc.status = 'OPEN';
            nc.raisedById = (currentUser as any)?.id ?? '';
            nc.resolutionNotes = null;
          });
        });
        pushProjectToSupabase(projectId).catch(() => {});
        markActionDone(sessionId, item.id);
        Alert.alert('No conformidad registrada', `NC abierta sobre ${action.codigo ?? 'el ensayo'}.`);
        return;
      }
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
      runningActionRef.current = false;
      setRunningActionId(null);
    }
  }, [projectId, projectName, navigation, markActionDone, openEnsayo, currentUser]);

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
            <View
              style={styles.chartBox}
              collapsable={false}
              ref={node => { if (node) chartShotRefs.current.set(item.id, node); else chartShotRefs.current.delete(item.id); }}
            >
              <SvgXml xml={item.chartSvg!} width={chartW} height={chartW * (360 / 640)} />
            </View>
          )}
          <RichText
            style={[styles.msgText, isUser ? styles.msgTextUser : styles.msgTextAI, isError && styles.msgTextError]}
            text={isError ? item.text.slice(1).trim() : item.text}
          />
          {/* ── Chips de ensayos listados (tocables → abren el ensayo) ── */}
          {!isUser && !!item.links?.length && (
            <View style={styles.linksWrap}>
              {item.links.map((lk: AIEnsayoLink) => (
                <TouchableOpacity
                  key={lk.protocolId}
                  style={styles.linkChip}
                  onPress={() => { openEnsayo(lk.protocolId); }}
                  activeOpacity={0.7}
                >
                  <Ionicons name="open-outline" size={12} color={Colors.primary} />
                  <Text style={styles.linkChipText} numberOfLines={1}>{lk.codigo ?? 'Ensayo'}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
          {/* ── Tarjeta de acción (confirmación explícita del usuario) ── */}
          {!isUser && item.action && (
            <TouchableOpacity
              style={[styles.actionCard, item.actionDone && styles.actionCardDone]}
              onPress={() => executeAction(item)}
              disabled={!!item.actionDone || runningActionId === item.id}
              activeOpacity={0.75}
            >
              <Ionicons
                name={
                  item.action.kind === 'crear_ensayo' ? 'flask-outline'
                  : item.action.kind === 'crear_muestra' ? 'archive-outline'
                  : item.action.kind === 'crear_nc' ? 'alert-circle-outline'
                  : item.action.kind === 'abrir_ensayo' ? 'document-text-outline'
                  : item.action.kind === 'abrir_dossier' ? 'folder-open-outline'
                  : 'navigate-outline'
                }
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
                    {item.actionDone ? 'Hecho ✓'
                      : item.action.kind === 'crear_ensayo' || item.action.kind === 'crear_muestra' ? 'Crear'
                      : item.action.kind === 'crear_nc' ? 'Registrar'
                      : 'Abrir'}
                  </Text>
                </View>
              )}
            </TouchableOpacity>
          )}
          <View style={styles.msgFooter}>
            {!isUser && !isError && (
              <TouchableOpacity onPress={() => shareMessage(item)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="share-social-outline" size={15} color={Colors.textMuted} />
              </TouchableOpacity>
            )}
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
  }, [winWidth, speakingId, loadingSpeechId, toggleSpeech, runningActionId, executeAction, openEnsayo, shareMessage]);

  return (
    <View style={styles.container}>
      {/* v79 — SIN encabezado sólido: difuminado superior (mismo color que el
          fondo de cada pantalla) + controles flotantes. Volver a la izquierda;
          "Nueva conversación" siempre visible (reinicio rápido) + menú "⋮" con
          Historial y Leer respuestas a la derecha. */}
      <View style={[styles.headerFade, { height: insets.top + 64 }]} pointerEvents="none">
        {(() => {
          const fadeColor = (messages.length === 0 || welcomeLeaving) ? Colors.navy : Colors.surface;
          return (
            <>
              <View style={[styles.headerFadeLayer, { opacity: 0.55, backgroundColor: fadeColor }]} />
              <View style={[styles.headerFadeLayer, { opacity: 0.3, top: 10, backgroundColor: fadeColor }]} />
              <View style={[styles.headerFadeLayer, { opacity: 0.12, top: 20, backgroundColor: fadeColor }]} />
            </>
          );
        })()}
      </View>
      <View style={[styles.floatBar, { top: insets.top + 8 }]} pointerEvents="box-none">
        <TouchableOpacity style={styles.floatBtn} onPress={() => navigation.goBack()} activeOpacity={0.8}>
          <Ionicons name="chevron-back" size={20} color={Colors.white} />
        </TouchableOpacity>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <TouchableOpacity style={styles.floatBtn} onPress={startNewSession} activeOpacity={0.8}>
            <Ionicons name="create-outline" size={18} color={Colors.white} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.floatBtn} onPress={() => setShowMenu(true)} activeOpacity={0.8}>
            <Ionicons name="ellipsis-vertical" size={18} color={Colors.white} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Menú "⋮": Historial + Leer respuestas (reemplaza los botones sueltos). */}
      <Modal visible={showMenu} transparent animationType="fade" onRequestClose={() => setShowMenu(false)}>
        <TouchableOpacity style={styles.menuOverlay} activeOpacity={1} onPress={() => setShowMenu(false)}>
          <View style={[styles.menuCard, { top: insets.top + 52 }]}>
            <TouchableOpacity style={styles.menuItem} onPress={() => { setShowMenu(false); openHistory(); }} activeOpacity={0.7}>
              <Ionicons name="time-outline" size={17} color={Colors.textPrimary} />
              <Text style={styles.menuItemText}>Historial</Text>
            </TouchableOpacity>
            <View style={styles.menuDivider} />
            <TouchableOpacity style={styles.menuItem} onPress={() => { toggleHandsFree(); }} activeOpacity={0.7}>
              <Ionicons name={handsFree ? 'headset' : 'headset-outline'} size={17} color={handsFree ? Colors.primary : Colors.textPrimary} />
              <Text style={styles.menuItemText}>Leer respuestas</Text>
              <View style={[styles.menuToggle, handsFree && styles.menuToggleOn]}>
                <View style={[styles.menuToggleKnob, handsFree && styles.menuToggleKnobOn]} />
              </View>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

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
                contentContainerStyle={[styles.listContent, { paddingTop: insets.top + 56 }]}
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
              <View
                style={StyleSheet.absoluteFill}
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
                  {/* v78 — Bienvenida LIMPIA: gota SVG arriba-centro, saludo con
                      nombre y carrusel vertical lento de sugerencias (3 visibles,
                      ida y vuelta). Sin párrafos que saturen. */}
                  <View style={[styles.emptyWrap, !glOk && { backgroundColor: Colors.navy }]}>
                    <DropLogo size={86} />
                    <Text style={styles.flowLogoText}>
                      FLOW <Text style={styles.flowLogoIA}>IA</Text>
                    </Text>
                    <Text style={styles.flowSlogan}>La inteligencia de su obra</Text>
                    <Text style={[styles.emptyTitle, styles.emptyTitleDark]}>
                      {firstName ? `Hola ${firstName}, ¿por dónde empezamos?` : 'Hola, ¿por dónde empezamos?'}
                    </Text>
                    {insight && <Text style={[styles.insightText, styles.insightTextDark]}>{insight}</Text>}
                    <View style={styles.carouselBox}>
                      <ScrollView
                        ref={carouselRef}
                        style={{ height: CAROUSEL_H }}
                        showsVerticalScrollIndicator={false}
                        nestedScrollEnabled
                        onScrollBeginDrag={() => { carouselPauseUntilRef.current = Date.now() + 4000; }}
                        onScroll={e => { carouselPosRef.current = e.nativeEvent.contentOffset.y; }}
                        scrollEventThrottle={32}
                      >
                        {suggested.map(q => (
                          <TouchableOpacity
                            key={q}
                            style={styles.sugCard}
                            onPress={() => { carouselPauseUntilRef.current = Date.now() + 6000; send(q); }}
                            disabled={sending}
                            activeOpacity={0.75}
                          >
                            <Ionicons name="chatbubble-ellipses-outline" size={14} color={Colors.white} />
                            <Text style={styles.sugCardText} numberOfLines={1}>{q}</Text>
                          </TouchableOpacity>
                        ))}
                      </ScrollView>
                    </View>
                  </View>
                </View>
              </View>
            )}
          </View>
        )}

        {/* ── Barra de entrada ── */}
        <View style={[styles.inputBar, { paddingBottom: Math.max(insets.bottom, 10) }]}>
          <TextInput
            style={styles.input}
            value={input}
            onChangeText={setInput}
            placeholder={micActive ? 'Escuchando…' : 'Escriba su consulta…'}
            placeholderTextColor={micActive ? Colors.primary : Colors.textMuted}
            multiline
            maxLength={2000}
            // Mientras dicta, el teclado queda bloqueado: una edición manual
            // sería pisada por el próximo resultado del reconocedor.
            editable={!sending && !micActive}
          />
          {/* v79 — Mientras NO hay texto: mic (dictar al cuadro) + modo voz
              (conversación continua), lado a lado. Al escribir, ambos se
              esconden y solo queda enviar — igual que Claude. */}
          {!input.trim() && (
            <>
              <Animated.View style={{ transform: [{ scale: micPulse }] }}>
                <TouchableOpacity
                  style={[styles.micBtn, micActive && styles.micBtnActive]}
                  onPress={startMic}
                  disabled={sending}
                  activeOpacity={0.8}
                >
                  <Ionicons name={micActive ? 'mic' : 'mic-outline'} size={19} color={micActive ? Colors.white : Colors.primary} />
                </TouchableOpacity>
              </Animated.View>
              <TouchableOpacity
                style={styles.voiceModeBtn}
                onPress={enterVoiceMode}
                disabled={sending}
                activeOpacity={0.8}
              >
                <Ionicons name="radio" size={19} color={Colors.white} />
              </TouchableOpacity>
            </>
          )}
          {!!input.trim() && (
            <TouchableOpacity
              style={[styles.sendBtn, sending && styles.sendBtnDisabled]}
              onPress={() => { stopMic(); send(input); }}
              disabled={sending}
              activeOpacity={0.8}
            >
              <Ionicons name="arrow-up" size={19} color={Colors.white} />
            </TouchableOpacity>
          )}
        </View>
      </KeyboardAvoidingView>

      {/* v78 — Velo blanco de la transición bienvenida→chat (sobre todo menos
          los controles flotantes y el modo voz). */}
      <Animated.View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, { backgroundColor: '#ffffff', opacity: whiteVeil, zIndex: 45 }]}
      />

      {/* ══ v79 — MODO SOLO VOZ: el chat queda VISIBLE completo (feedback del
          usuario: "no es bueno para una app donde necesito visualizar datos").
          Solo se ILUMINA la franja inferior — sin animaciones pesadas, un
          degradado que respira según la fase (escuchar/pensar/hablar),
          igual al modo voz de referencia que se mandó. ══ */}
      {voiceMode && (
        <View style={styles.voiceDock} pointerEvents="box-none">
          <Animated.View
            pointerEvents="none"
            style={[
              styles.voiceGlow,
              {
                opacity: voiceGlowAnim,
                backgroundColor: voicePhase === 'speaking' ? 'rgba(66,143,255,0.9)' : voicePhase === 'thinking' ? 'rgba(120,150,190,0.75)' : 'rgba(94,170,255,0.85)',
              },
            ]}
          />
          <View style={[styles.voiceBar, { paddingBottom: Math.max(insets.bottom, 12) }]}>
            <Text style={styles.voiceBarStatus} numberOfLines={1}>
              {voicePhase === 'listening'
                ? (voiceTranscript ? `"${voiceTranscript}"` : 'Escuchando…')
                : voicePhase === 'thinking' ? 'Pensando…' : (voiceReply || 'Hablando…')}
            </Text>
            <TouchableOpacity style={styles.voiceCloseBtn} onPress={exitVoiceMode} activeOpacity={0.85}>
              <Ionicons name="close" size={20} color={Colors.white} />
            </TouchableOpacity>
          </View>
        </View>
      )}

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
              {/* ── Preferencias que FLOW recuerda (locales, editables) ── */}
              {prefs.length > 0 && (
                <View style={styles.prefsSection}>
                  <Text style={styles.prefsTitle}>FLOW recuerda</Text>
                  {prefs.map(p => (
                    <View key={p} style={styles.prefRow}>
                      <Ionicons name="bookmark-outline" size={13} color={Colors.primary} />
                      <Text style={styles.prefText} numberOfLines={2}>{p}</Text>
                      <TouchableOpacity
                        onPress={() => { removePref(projectId, p).then(setPrefs).catch(() => {}); }}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        <Ionicons name="close-circle" size={15} color={Colors.textMuted} />
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
              )}
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

  // v78 — Controles flotantes (reemplazan al encabezado completo).
  floatBar: {
    position: 'absolute', left: 12, right: 12, zIndex: 60, elevation: 12,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  floatBtn: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: 'rgba(14,33,61,0.42)',
    alignItems: 'center', justifyContent: 'center',
  },

  // Estado inicial (bienvenida limpia v78)
  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 10 },
  flowLogoText: { fontSize: 34, fontWeight: '900', color: Colors.white, letterSpacing: 4, marginTop: 4 },
  flowLogoIA: { fontSize: 20, fontWeight: '800', color: '#9fc3ee', letterSpacing: 2 },
  flowSlogan: { fontSize: 12, fontWeight: '700', color: '#bcd0ea', letterSpacing: 1.5, textTransform: 'uppercase', marginTop: -6 },
  emptyTitle: { fontSize: 19, fontWeight: '900', color: Colors.navy, marginTop: 10 },
  emptyTitleDark: { color: Colors.white },
  insightText: { fontSize: 12, fontWeight: '700', color: Colors.textSecondary, marginTop: 2 },
  insightTextDark: { color: '#bcd0ea' },

  // Carrusel vertical de sugerencias (3 visibles, mismo ancho)
  carouselBox: { width: '88%', marginTop: 16, height: CAROUSEL_H, overflow: 'hidden' },
  sugCard: {
    width: '100%', height: SUG_H, marginBottom: SUG_GAP,
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 16, borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.34)',
  },
  sugCardText: { flex: 1, fontSize: 13, fontWeight: '700', color: Colors.white },

  // v79 — Modo solo voz: chat visible + franja de iluminación inferior.
  voiceDock: { position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 55, elevation: 15 },
  voiceGlow: {
    position: 'absolute', left: -20, right: -20, bottom: -40, height: 120,
    borderTopLeftRadius: 60, borderTopRightRadius: 60,
    shadowColor: '#4f9bff', shadowOpacity: 0.9, shadowRadius: 30, shadowOffset: { width: 0, height: -6 },
  },
  voiceBar: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingTop: 12,
    backgroundColor: 'rgba(11,24,48,0.92)',
    borderTopLeftRadius: 22, borderTopRightRadius: 22,
  },
  voiceBarStatus: { flex: 1, fontSize: 13.5, fontWeight: '700', color: Colors.white },
  voiceCloseBtn: {
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: 'rgba(255,255,255,0.14)',
    alignItems: 'center', justifyContent: 'center',
  },

  // v79 — Difuminado superior (sin encabezado sólido) + menú "⋮"
  headerFade: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 40, elevation: 10 },
  headerFadeLayer: { position: 'absolute', top: 0, left: 0, right: 0, height: 56, backgroundColor: Colors.navy },
  menuOverlay: { flex: 1, backgroundColor: 'transparent' },
  menuCard: {
    position: 'absolute', right: 14, minWidth: 210,
    backgroundColor: Colors.white, borderRadius: Radius.md, paddingVertical: 6, ...Shadow.card,
  },
  menuItem: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 12 },
  menuItemText: { flex: 1, fontSize: 13.5, fontWeight: '700', color: Colors.textPrimary },
  menuDivider: { height: 1, backgroundColor: Colors.surface, marginHorizontal: 8 },
  menuToggle: { width: 38, height: 22, borderRadius: 11, backgroundColor: Colors.border, padding: 2, justifyContent: 'center' },
  menuToggleOn: { backgroundColor: Colors.primary },
  menuToggleKnob: { width: 18, height: 18, borderRadius: 9, backgroundColor: Colors.white },
  menuToggleKnobOn: { alignSelf: 'flex-end' },
  voiceModeBtn: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.navy,
    alignItems: 'center', justifyContent: 'center',
  },

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

  // Chips de ensayos listados
  linksWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  linkChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    borderWidth: 1, borderColor: Colors.primary + '55', borderRadius: 12,
    paddingHorizontal: 9, paddingVertical: 5, backgroundColor: Colors.primary + '0A',
    maxWidth: 170,
  },
  linkChipText: { fontSize: 11.5, fontWeight: '700', color: Colors.primary },

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
  micBtn: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.white,
    borderWidth: 1.5, borderColor: Colors.primary,
    alignItems: 'center', justifyContent: 'center',
  },
  micBtnActive: { backgroundColor: Colors.danger, borderColor: Colors.danger },

  // Preferencias de FLOW
  prefsSection: { marginTop: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: Colors.surface, gap: 6 },
  prefsTitle: { fontSize: 11, fontWeight: '800', color: Colors.textMuted, letterSpacing: 0.6, textTransform: 'uppercase' },
  prefRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 },
  prefText: { flex: 1, fontSize: 12.5, color: Colors.textPrimary },

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
