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
  KeyboardAvoidingView, Platform, Animated, ScrollView, Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@navigation/types';
import AppHeader from '@components/AppHeader';
import { Colors, Radius, Shadow } from '../theme/colors';
import {
  type AIChatMessage, type AIChatSession, deleteSession, loadSessions,
  newSessionId, saveSession, sendChatMessage, sessionTitleFrom,
} from '@services/AIAssistantService';
import { AI_SUGGESTED_QUESTIONS } from '@utils/aiSuggestedQuestions';

type Props = NativeStackScreenProps<RootStackParamList, 'AIChat'>;

const fmtTime = (ms: number) => {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};
const fmtDay = (ms: number) => new Date(ms).toLocaleDateString('es-PE', { day: '2-digit', month: 'short' });

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

  const [session, setSession] = useState<AIChatSession | null>(null);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [pastSessions, setPastSessions] = useState<AIChatSession[]>([]);
  const listRef = useRef<FlatList<AIChatMessage>>(null);

  const messages = session?.messages ?? [];
  // Saludo formal SOLO en el primer intercambio de la sesión.
  const isFirstTurn = useMemo(() => !messages.some(m => m.role === 'assistant'), [messages]);

  const startNewSession = useCallback(() => {
    setSession({ id: newSessionId(), titulo: 'Nueva conversación', createdAt: Date.now(), updatedAt: Date.now(), messages: [] });
  }, []);

  useEffect(() => { startNewSession(); }, [startNewSession]);

  const openHistory = useCallback(async () => {
    setPastSessions(await loadSessions(projectId));
    setShowHistory(true);
  }, [projectId]);

  const resumeSession = useCallback((s: AIChatSession) => {
    setSession(s);
    setShowHistory(false);
  }, []);

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

  const send = useCallback(async (text: string) => {
    const msg = text.trim();
    if (!msg || sending || !session) return;
    setInput('');
    setSending(true);

    const userMsg: AIChatMessage = { id: `u-${Date.now()}`, role: 'user', text: msg, at: Date.now() };
    const base: AIChatSession = {
      ...session,
      titulo: session.messages.length === 0 ? sessionTitleFrom(msg) : session.titulo,
      messages: [...session.messages, userMsg],
      updatedAt: Date.now(),
    };
    setSession(base);

    try {
      const history = base.messages.slice(0, -1).map(m => ({ role: m.role, content: m.text }));
      const res = await sendChatMessage({ projectId, message: msg, history, isFirstTurn });
      const aiMsg: AIChatMessage = { id: `a-${Date.now()}`, role: 'assistant', text: res.reply, at: Date.now() };
      const next = { ...base, messages: [...base.messages, aiMsg], updatedAt: Date.now() };
      setSession(next);
      saveSession(projectId, next).catch(() => {});
    } catch (e) {
      const errMsg: AIChatMessage = {
        id: `e-${Date.now()}`, role: 'assistant',
        text: `⚠ ${e instanceof Error ? e.message : 'No pude responder. Intente de nuevo.'}`,
        at: Date.now(),
      };
      const next = { ...base, messages: [...base.messages, errMsg], updatedAt: Date.now() };
      setSession(next);
      saveSession(projectId, next).catch(() => {});
    } finally {
      setSending(false);
    }
  }, [projectId, session, sending, isFirstTurn]);

  const renderMessage = useCallback(({ item }: { item: AIChatMessage }) => {
    const isUser = item.role === 'user';
    const isError = !isUser && item.text.startsWith('⚠');
    return (
      <View style={[styles.msgRow, isUser ? styles.msgRowUser : styles.msgRowAI]}>
        {!isUser && (
          <View style={styles.avatar}>
            <Ionicons name="sparkles" size={13} color={Colors.white} />
          </View>
        )}
        <View style={[styles.bubble, isUser ? styles.bubbleUser : styles.bubbleAI, isError && styles.bubbleError]}>
          <Text style={[styles.msgText, isUser ? styles.msgTextUser : styles.msgTextAI, isError && styles.msgTextError]}>
            {isError ? item.text.slice(1).trim() : item.text}
          </Text>
          <Text style={[styles.msgTime, isUser ? styles.msgTimeUser : styles.msgTimeAI]}>{fmtTime(item.at)}</Text>
        </View>
      </View>
    );
  }, []);

  return (
    <View style={styles.container}>
      <AppHeader
        title="Asistente IA"
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
        {messages.length === 0 ? (
          /* ── Estado inicial: bienvenida + chips de preguntas sugeridas ── */
          <ScrollView contentContainerStyle={styles.emptyWrap}>
            <View style={styles.emptyBadge}>
              <Ionicons name="sparkles" size={30} color={Colors.primary} />
            </View>
            <Text style={styles.emptyTitle}>Pregúntele a su obra</Text>
            <Text style={styles.emptyText}>
              Consultas en lenguaje natural sobre los ensayos, sectores y avance de{' '}
              <Text style={{ fontWeight: '800' }}>{projectName}</Text>. Las respuestas salen de los datos reales del proyecto.
            </Text>
            <View style={styles.chipsWrap}>
              {AI_SUGGESTED_QUESTIONS.map(q => (
                <TouchableOpacity key={q} style={styles.chip} onPress={() => send(q)} disabled={sending} activeOpacity={0.75}>
                  <Ionicons name="chatbubble-ellipses-outline" size={13} color={Colors.primary} />
                  <Text style={styles.chipText}>{q}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>
        ) : (
          <FlatList
            ref={listRef}
            data={messages}
            keyExtractor={m => m.id}
            renderItem={renderMessage}
            contentContainerStyle={styles.listContent}
            onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
            ListFooterComponent={sending ? (
              <View style={[styles.msgRow, styles.msgRowAI]}>
                <View style={styles.avatar}><Ionicons name="sparkles" size={13} color={Colors.white} /></View>
                <View style={[styles.bubble, styles.bubbleAI, { paddingVertical: 14 }]}>
                  <TypingDots />
                </View>
              </View>
            ) : null}
          />
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
                  <TouchableOpacity onPress={() => removeSession(s)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Ionicons name="trash-outline" size={17} color={Colors.textMuted} />
                  </TouchableOpacity>
                </View>
              ))}
            </ScrollView>
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
  msgText: { fontSize: 14, lineHeight: 20 },
  msgTextUser: { color: Colors.white },
  msgTextAI: { color: Colors.textPrimary },
  msgTextError: { color: Colors.danger },
  msgTime: { fontSize: 9.5, marginTop: 4, alignSelf: 'flex-end' },
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
  historyItem: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 10, paddingHorizontal: 8, borderRadius: Radius.sm,
    borderBottomWidth: 1, borderBottomColor: Colors.surface,
  },
  historyItemActive: { backgroundColor: Colors.primary + '0D' },
  historyItemTitle: { fontSize: 13.5, fontWeight: '700', color: Colors.textPrimary },
  historyItemMeta: { fontSize: 11, color: Colors.textMuted, marginTop: 2 },
});
