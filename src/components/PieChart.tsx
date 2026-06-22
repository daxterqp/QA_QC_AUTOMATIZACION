/**
 * PieChart — gráfico circular SVG simple. Sin animaciones (mantiene
 * complejidad baja). Usa `react-native-svg`.
 *
 * Props:
 *   slices: array de {label, value, color}
 *   size: lado en px (default 160)
 *
 * Si total = 0, muestra un círculo gris (placeholder "Sin datos").
 */
import React from 'react';
import { View, StyleSheet } from 'react-native';
import Svg, { Path, Circle, Text as SvgText } from 'react-native-svg';
import { buildPieSlicePaths, type PieSlice } from '@utils/svgHelpers';

interface Props {
  slices: PieSlice[];
  size?: number;
  /** v31 — Mostrar % dentro de cada slice (oculta si la fracción es muy chica). */
  showPercents?: boolean;
}

// Decide color de texto legible sobre el fondo (luminancia simple).
function readableTextColor(bgHex: string): string {
  const h = bgHex.replace('#', '');
  if (h.length !== 6) return '#fff';
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.6 ? '#1f2937' : '#ffffff';
}

export function PieChart({ slices, size = 160, showPercents = true }: Props) {
  const total = slices.reduce((a, s) => a + Math.max(0, s.value), 0);
  if (total <= 0) {
    return (
      <View style={[styles.wrap, { width: size, height: size }]}>
        <Svg width={size} height={size}>
          <Circle cx={size / 2} cy={size / 2} r={size / 2} fill="#E5E7EB" />
        </Svg>
      </View>
    );
  }
  const paths = buildPieSlicePaths(slices, size);
  const cx = size / 2;
  const cy = size / 2;
  const labelR = size * 0.32; // anillo donde poner las etiquetas
  // Ángulos para posicionar texto en el centro angular de cada slice.
  let accum = -Math.PI / 2;
  const labels = paths.map((p) => {
    const sweep = p.percent * Math.PI * 2;
    const mid = accum + sweep / 2;
    accum += sweep;
    return {
      pct: Math.round(p.percent * 100),
      x: cx + Math.cos(mid) * labelR,
      y: cy + Math.sin(mid) * labelR,
      color: readableTextColor(p.color),
      visible: p.percent >= 0.06, // 6% mínimo para mostrar etiqueta
    };
  });

  return (
    <View style={[styles.wrap, { width: size, height: size }]}>
      <Svg width={size} height={size}>
        {paths.filter(p => p.pathD).map((p, i) => (
          <Path key={`p${i}`} d={p.pathD} fill={p.color} stroke="#fff" strokeWidth={0.5} />
        ))}
        {showPercents && labels.map((l, i) =>
          l.visible ? (
            <SvgText
              key={`t${i}`}
              x={l.x}
              y={l.y + 3}
              fill={l.color}
              fontSize={Math.max(9, Math.round(size * 0.075))}
              fontWeight="700"
              textAnchor="middle"
            >{`${l.pct}%`}</SvgText>
          ) : null,
        )}
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center' },
});
