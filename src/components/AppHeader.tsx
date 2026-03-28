import React from 'react';
import {
  View, Text, TouchableOpacity, StatusBar, StyleSheet, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../theme/colors';

/** Altura del status bar del dispositivo (siempre disponible en Android) */
const STATUS_H = StatusBar.currentHeight ?? (Platform.OS === 'android' ? 24 : 44);

interface AppHeaderProps {
  title: string;
  subtitle?: string;
  /** Si se provee, muestra la flecha ← a la izquierda */
  onBack?: () => void;
  /** Reemplaza la flecha por contenido custom (ej: info de usuario en ProjectList) */
  leftContent?: React.ReactNode;
  /** Contenido de la sección derecha (botones adicionales, badges, etc.) */
  rightContent?: React.ReactNode;
}

export default function AppHeader({
  title, subtitle, onBack, leftContent, rightContent,
}: AppHeaderProps) {
  return (
    <View style={[styles.container, { paddingTop: STATUS_H + 16 }]}>
      {/* ── Izquierda ── */}
      <View style={styles.left}>
        {leftContent ?? (
          onBack
            ? (
              <TouchableOpacity
                onPress={onBack}
                style={styles.backBtn}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Ionicons name="arrow-back" size={24} color={Colors.white} />
              </TouchableOpacity>
            )
            : null
        )}
      </View>

      {/* ── Centro ── */}
      <View style={styles.center}>
        <Text style={styles.title} numberOfLines={2}>{title}</Text>
        {subtitle ? (
          <Text style={styles.subtitle} numberOfLines={1}>{subtitle}</Text>
        ) : null}
      </View>

      {/* ── Derecha ── */}
      <View style={styles.right}>
        {rightContent ?? null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: Colors.navy,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingBottom: 16,
    minHeight: 60,
  },
  left: {
    minWidth: 48,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  right: {
    minWidth: 48,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  backBtn: {
    padding: 4,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.white,
    textAlign: 'center',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  subtitle: {
    fontSize: 12,
    color: Colors.light,
    textAlign: 'center',
    marginTop: 3,
  },
});
