/**
 * TimelineBar — barra horizontal con segmentos coloreados (v29).
 *
 * Usado en TraceabilityAnalyticsScreen para visualizar la utilización por
 * sector / por equipo. Renderiza la barra completa del rango [fromMs, toMs]
 * y pinta los segmentos donde hubo actividad. Los huecos quedan grises
 * (sin etiqueta — la palabra "No trabajado" va en la leyenda del padre).
 *
 * Ejes:
 *   - Si el rango es ≤1 día → muestra horas (00, 06, 12, 18, 24).
 *   - Si es >1 día → muestra fechas (dd/mm).
 *
 * El padre puede pasar segmentos solapados; el componente NO los fusiona —
 * los pinta en orden, así que el último gana visualmente.
 */
import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors } from '../theme/colors';

export interface TimelineSegment {
  startMs: number;
  endMs: number;
  /** Índice en la paleta — el padre escoge el color. */
  colorIdx: number;
  /** Tooltip opcional. */
  label?: string;
}

/** Paleta secuencial agradable. El padre asigna `colorIdx` al equipo/sector
 *  según orden de aparición; el componente usa colorAt(idx) para resolver. */
export const TIMELINE_PALETTE = [
  '#3B82F6', // blue
  '#10B981', // emerald
  '#F59E0B', // amber
  '#EF4444', // red
  '#8B5CF6', // violet
  '#EC4899', // pink
  '#14B8A6', // teal
  '#F97316', // orange
  '#6366F1', // indigo
  '#84CC16', // lime
];
export const TIMELINE_EMPTY = '#D1D5DB'; // gris plomo discreto

export function colorAt(idx: number): string {
  return TIMELINE_PALETTE[idx % TIMELINE_PALETTE.length];
}

interface Props {
  fromMs: number;
  toMs: number;
  segments: TimelineSegment[];
  /** Altura de la barra en px. Default 18. */
  height?: number;
  /** Mostrar eje horario debajo. Default true. */
  showAxis?: boolean;
}

export function TimelineBar({ fromMs, toMs, segments, height = 18, showAxis = true }: Props) {
  const span = Math.max(1, toMs - fromMs);

  // Clipear segmentos al rango y descartar los que no intersectan.
  const clipped = useMemo(() => {
    const out: { left: number; width: number; color: string; label?: string }[] = [];
    for (const s of segments) {
      const a = Math.max(s.startMs, fromMs);
      const b = Math.min(s.endMs, toMs);
      if (b <= a) continue;
      out.push({
        left: ((a - fromMs) / span) * 100,
        width: ((b - a) / span) * 100,
        color: colorAt(s.colorIdx),
        label: s.label,
      });
    }
    return out;
  }, [segments, fromMs, toMs, span]);

  const axisLabels = useMemo(() => {
    const oneDayMs = 86400000;
    const days = span / oneDayMs;
    if (days <= 1.01) {
      // Eje horario 00, 06, 12, 18, 24
      return [0, 6, 12, 18, 24].map(h => ({
        pos: (h / 24) * 100,
        text: h === 24 ? '24h' : `${String(h).padStart(2, '0')}h`,
      }));
    }
    // Eje de fechas: 5 marcas equidistantes
    const N = 5;
    const out = [];
    for (let i = 0; i < N; i++) {
      const t = fromMs + (span * i) / (N - 1);
      const d = new Date(t);
      out.push({
        pos: (i / (N - 1)) * 100,
        text: `${pad(d.getDate())}/${pad(d.getMonth() + 1)}`,
      });
    }
    return out;
  }, [fromMs, span]);

  return (
    <View>
      <View style={[styles.track, { height, backgroundColor: TIMELINE_EMPTY }]}>
        {clipped.map((s, i) => (
          <View
            key={i}
            style={{
              position: 'absolute',
              top: 0,
              bottom: 0,
              left: `${s.left}%`,
              width: `${Math.max(0.4, s.width)}%`,
              backgroundColor: s.color,
            }}
          />
        ))}
      </View>
      {showAxis && (
        <View style={styles.axis}>
          {axisLabels.map((a, i) => (
            <Text
              key={i}
              style={[
                styles.axisLabel,
                {
                  left: `${a.pos}%`,
                  marginLeft: i === 0 ? 0 : i === axisLabels.length - 1 ? -28 : -14,
                },
              ]}
            >
              {a.text}
            </Text>
          ))}
        </View>
      )}
    </View>
  );
}

function pad(n: number) { return String(n).padStart(2, '0'); }

const styles = StyleSheet.create({
  track: {
    width: '100%',
    borderRadius: 4,
    overflow: 'hidden',
    position: 'relative',
  },
  axis: {
    position: 'relative',
    height: 14,
    marginTop: 2,
  },
  axisLabel: {
    position: 'absolute',
    top: 0,
    fontSize: 9,
    color: Colors.textMuted,
    fontWeight: '700',
  },
});
