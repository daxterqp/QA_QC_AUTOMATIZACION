/**
 * ActiveSessionPrompt — al login, busca sesiones ACTIVE/PAUSED del user
 * actual y muestra modal con 3 acciones: Continuar / Pausar / Cerrar ahora.
 *
 * Reglas (decisiones #12 y #13):
 *  - Si la sesión se inició en otro device → solo informa, sin acciones.
 *  - Si >24h sin actividad → ya fue auto-cerrada por closeStaleSessions() previo.
 *
 * Se monta UNA vez en AppNavigator dentro del stack con sesión. Re-evalúa al
 * cambiar currentUser.
 */
import React, { useEffect, useState } from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Q } from '@nozbe/watermelondb';
import { workSessionsCollection, equipmentCollection } from '@db/index';
import { useAuth } from '@context/AuthContext';
import { Colors, Radius } from '../theme/colors';
import { getDeviceId } from '@utils/deviceId';
import { pauseSession, closeSession } from '@services/WorkSessionService';
import { showToast } from './Toast';
import type WorkSession from '@models/WorkSession';
import { closeStaleSessions } from '@services/SupabaseSyncService';

interface Props {
  /** Función de navegación inyectada desde AppNavigator (usa navigationRef). */
  navigate: (screen: string, params?: any) => void;
}

export function ActiveSessionPrompt({ navigate }: Props) {
  const { currentUser } = useAuth();
  const [session, setSession] = useState<WorkSession | null>(null);
  const [equipLabel, setEquipLabel] = useState('');
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    getDeviceId().then(setDeviceId).catch(() => {});
  }, []);

  // Tick cada 60s para refrescar "hace X min" sin re-render manual.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!currentUser || !deviceId) return;
    setDismissed(false);
    let cancelled = false;
    (async () => {
      // Auto-cerrar sesiones stale (>24h) primero — awaiteado para evitar race
      try { await closeStaleSessions(currentUser.id, deviceId); } catch {}
      if (cancelled) return;
      // Luego buscar la primera activa/pausada
      try {
        const found = await workSessionsCollection.query(
          Q.where('user_id', currentUser.id),
          Q.or(Q.where('status', 'ACTIVE'), Q.where('status', 'PAUSED')),
          Q.sortBy('started_at', Q.desc),
          Q.take(1),
        ).fetch();
        if (cancelled) return;
        if (found.length === 0) { setSession(null); return; }
        const s = found[0] as WorkSession;
        setSession(s);
        try {
          const e = await equipmentCollection.find((s as any).equipmentId) as any;
          if (cancelled) return;
          setEquipLabel(`${e.code} — ${e.name}`);
        } catch { if (!cancelled) setEquipLabel('Equipo'); }
      } catch { if (!cancelled) setSession(null); }
    })();
    return () => { cancelled = true; };
  }, [currentUser, deviceId]);

  if (!currentUser || !session || dismissed) return null;
  const sAny = session as any;
  const isOtherDevice = sAny.startedOnDeviceId && sAny.startedOnDeviceId !== deviceId;
  const minutesSinceStart = Math.max(0, Math.round((now - sAny.startedAt) / 60000));
  const statusLabel = sAny.status === 'ACTIVE' ? 'activa' : 'pausada';

  // Re-lee la sesión fresh para evitar actuar sobre una sesión ya cerrada
  // (ej. closeStaleSessions o cierre desde otro device entre render y tap).
  const ensureFresh = async (): Promise<WorkSession | null> => {
    const fresh = await workSessionsCollection.find(session.id).catch(() => null);
    if (!fresh || (fresh as any).status === 'CLOSED') {
      setDismissed(true);
      showToast('Esta sesión ya fue cerrada', 'info');
      return null;
    }
    return fresh as WorkSession;
  };

  const navToRunning = async () => {
    const fresh = await ensureFresh();
    if (!fresh) return;
    setDismissed(true);
    navigate('TraceabilityRunning', { sessionId: session.id });
  };

  const handlePause = async () => {
    setBusy(true);
    try {
      const fresh = await ensureFresh();
      if (!fresh) return;
      if ((fresh as any).status === 'ACTIVE') await pauseSession(session.id);
      showToast('Sesión pausada', 'warning');
      setDismissed(true);
    } catch (e) {
      showToast((e as Error).message, 'danger');
    } finally { setBusy(false); }
  };
  const handleClose = async () => {
    setBusy(true);
    try {
      const fresh = await ensureFresh();
      if (!fresh) return;
      await closeSession(session.id);
      showToast('Sesión cerrada', 'success');
      setDismissed(true);
    } catch (e) {
      showToast((e as Error).message, 'danger');
    } finally { setBusy(false); }
  };

  return (
    <Modal visible animationType="fade" transparent>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Ionicons name="time-outline" size={28} color={Colors.primary} />
          <Text style={styles.title}>Sesión sin cerrar</Text>
          <Text style={styles.body}>
            Tienes una sesión {statusLabel} de hace {minutesSinceStart} min{'\n'}
            con el equipo <Text style={{ fontWeight: '700' }}>{equipLabel}</Text>.
          </Text>
          {isOtherDevice ? (
            <>
              <Text style={styles.note}>
                Esta sesión se inició en otro dispositivo. Solo desde ahí puedes pausarla o cerrarla.
              </Text>
              <View style={styles.row}>
                <TouchableOpacity style={[styles.btn, styles.btnGhost]} onPress={() => setDismissed(true)}>
                  <Text style={styles.btnGhostText}>Cerrar</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.btn, styles.btnPrimary]} onPress={navToRunning}>
                  <Text style={styles.btnPrimaryText}>Ver sesión</Text>
                </TouchableOpacity>
              </View>
            </>
          ) : (
            <View style={styles.col}>
              <TouchableOpacity style={[styles.btn, styles.btnPrimary]} onPress={navToRunning} disabled={busy}>
                <Text style={styles.btnPrimaryText}>Continuar</Text>
              </TouchableOpacity>
              {sAny.status === 'ACTIVE' && (
                <TouchableOpacity style={[styles.btn, styles.btnWarning]} onPress={handlePause} disabled={busy}>
                  {busy ? <ActivityIndicator color={Colors.white} size="small" /> : <Text style={styles.btnPrimaryText}>Pausar</Text>}
                </TouchableOpacity>
              )}
              <TouchableOpacity style={[styles.btn, styles.btnDanger]} onPress={handleClose} disabled={busy}>
                {busy ? <ActivityIndicator color={Colors.white} size="small" /> : <Text style={styles.btnPrimaryText}>Cerrar ahora</Text>}
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 16 },
  card: { backgroundColor: Colors.white, borderRadius: Radius.lg, padding: 22, width: '100%', maxWidth: 360, alignItems: 'center', gap: 10 },
  title: { fontSize: 16, fontWeight: '800', color: Colors.textPrimary },
  body: { fontSize: 13, color: Colors.textSecondary, textAlign: 'center', lineHeight: 18 },
  note: { fontSize: 12, color: Colors.textMuted, textAlign: 'center', fontStyle: 'italic' },
  col: { width: '100%', gap: 8, marginTop: 8 },
  row: { width: '100%', flexDirection: 'row', gap: 8, marginTop: 8 },
  btn: { padding: 12, borderRadius: Radius.md, alignItems: 'center', flex: 1 },
  btnPrimary: { backgroundColor: Colors.primary },
  btnWarning: { backgroundColor: Colors.warning },
  btnDanger: { backgroundColor: Colors.danger },
  btnGhost: { borderWidth: 1, borderColor: Colors.border },
  btnPrimaryText: { color: Colors.white, fontWeight: '800', fontSize: 13 },
  btnGhostText: { color: Colors.textSecondary, fontWeight: '700', fontSize: 13 },
});
