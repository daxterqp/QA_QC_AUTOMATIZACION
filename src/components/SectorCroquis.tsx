/**
 * SectorCroquis (móvil) — Mini-croquis de un sector con react-native-svg.
 * Proyecta los vértices lat/lng a un viewBox normalizado conservando la
 * proporción geográfica. Vista rápida de la FORMA; el GIS real es ProjectMapScreen.
 */
import React from 'react';
import { View, Text } from 'react-native';
import Svg, { Polygon, Circle } from 'react-native-svg';
import { Colors } from '../theme/colors';

type Pt = { lat: number; lng: number };

export function SectorCroquis({
  points,
  color = Colors.primary,
  width = 260,
  height = 160,
}: {
  points: Pt[];
  color?: string;
  width?: number;
  height?: number;
}) {
  if (!points || points.length < 3) {
    return (
      <View style={{ width, height, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f1f4f8', borderRadius: 6 }}>
        <Text style={{ fontSize: 11, color: Colors.textMuted }}>Sin geometría para dibujar</Text>
      </View>
    );
  }

  const pad = 14;
  const lats = points.map(p => p.lat);
  const lngs = points.map(p => p.lng);
  const minLat = Math.min(...lats), maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs), maxLng = Math.max(...lngs);
  const spanLat = maxLat - minLat || 1e-6;
  const spanLng = maxLng - minLng || 1e-6;

  const cosLat = Math.cos(((minLat + maxLat) / 2) * Math.PI / 180) || 1;
  const geoW = spanLng * cosLat;
  const geoH = spanLat;
  const innerW = width - pad * 2;
  const innerH = height - pad * 2;
  const scale = Math.min(innerW / geoW, innerH / geoH);
  const offX = pad + (innerW - geoW * scale) / 2;
  const offY = pad + (innerH - geoH * scale) / 2;

  const proj = points.map(p => ({
    x: offX + (p.lng - minLng) * cosLat * scale,
    y: offY + (maxLat - p.lat) * scale,
  }));
  const polyStr = proj.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');

  return (
    <Svg width={width} height={height} style={{ backgroundColor: '#f1f4f8', borderRadius: 6 }}>
      <Polygon points={polyStr} fill={color + '33'} stroke={color} strokeWidth={1.5} strokeLinejoin="round" />
      {proj.map((p, i) => (
        <Circle key={i} cx={p.x} cy={p.y} r={2.8} fill={color} />
      ))}
    </Svg>
  );
}
