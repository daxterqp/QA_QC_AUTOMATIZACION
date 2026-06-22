/**
 * CroquisCapture (v43.5) — Renderiza un MapView (Google) con los SECTORES del proyecto
 * y el/los ENSAYO(s) ploteados, sobre una capa geográfica (satélite/híbrido/…) +
 * ortofoto opcional, y lo CAPTURA a PNG (base64) con react-native-view-shot para
 * embeberlo en el PDF del dossier.
 *
 * Debe renderizarse VISIBLE (en un overlay) para que el motor cargue las teselas antes
 * de capturar. Tras `onMapReady` + un settle (~1.8s) dispara `captureRef`.
 */
import React, { useRef, useCallback, useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import MapView, { Marker, Polygon, PROVIDER_GOOGLE, UrlTile } from 'react-native-maps';
import Svg, { Polygon as SvgPolygon, Circle } from 'react-native-svg';
import { captureRef } from 'react-native-view-shot';
import type { CroquisMapType } from '@utils/featureFlags';

export interface CroquisSector { points: { lat: number; lng: number }[]; color?: string | null; active?: boolean }
export interface CroquisPoint { lat: number; lng: number; color?: string; label?: string }

interface Props {
  sectors: CroquisSector[];
  points: CroquisPoint[];
  mapType: CroquisMapType;
  mapTileUrl?: string | null;   // ortofoto XYZ (opcional)
  showOrthophoto?: boolean;
  baseOpacity?: number;         // 0.3–1 (scrim blanco = 1 - baseOpacity)
  pointSize?: number;           // diámetro del ícono del ensayo (px). default 14
  width: number;
  height: number;
  /** Devuelve el PNG base64 (data URI) o null si falló. */
  onResult: (dataUri: string | null) => void;
}

/** Región (centro + deltas) que encuadra sectores + puntos, con padding. */
function regionFor(sectors: CroquisSector[], points: CroquisPoint[]) {
  const all: { lat: number; lng: number }[] = [...points];
  for (const s of sectors) for (const p of s.points) all.push(p);
  if (all.length === 0) return { latitude: -12.046374, longitude: -77.042793, latitudeDelta: 0.05, longitudeDelta: 0.05 };
  const lats = all.map(p => p.lat), lngs = all.map(p => p.lng);
  const minLat = Math.min(...lats), maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs), maxLng = Math.max(...lngs);
  return {
    latitude: (minLat + maxLat) / 2,
    longitude: (minLng + maxLng) / 2,
    latitudeDelta: Math.max((maxLat - minLat) * 1.4, 0.003),
    longitudeDelta: Math.max((maxLng - minLng) * 1.4, 0.003),
  };
}

/** Proyecta lat/lng → x/y dentro de width×height conservando proporción (modo 'none'). */
function projectorFor(sectors: CroquisSector[], points: CroquisPoint[], width: number, height: number) {
  const all: { lat: number; lng: number }[] = [...points];
  for (const s of sectors) for (const p of s.points) all.push(p);
  const pad = 14;
  if (all.length === 0) return (_p: { lat: number; lng: number }) => ({ x: width / 2, y: height / 2 });
  const lats = all.map(p => p.lat), lngs = all.map(p => p.lng);
  const minLat = Math.min(...lats), maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs), maxLng = Math.max(...lngs);
  const spanLat = (maxLat - minLat) || 1e-6, spanLng = (maxLng - minLng) || 1e-6;
  const cosLat = Math.cos(((minLat + maxLat) / 2) * Math.PI / 180) || 1;
  const geoW = spanLng * cosLat, geoH = spanLat;
  const innerW = width - pad * 2, innerH = height - pad * 2;
  const scale = Math.min(innerW / geoW, innerH / geoH);
  const offX = pad + (innerW - geoW * scale) / 2, offY = pad + (innerH - geoH * scale) / 2;
  return (p: { lat: number; lng: number }) => ({ x: offX + (p.lng - minLng) * cosLat * scale, y: offY + (maxLat - p.lat) * scale });
}

export default function CroquisCapture({ sectors, points, mapType, mapTileUrl, showOrthophoto, baseOpacity = 1, pointSize = 14, width, height, onResult }: Props) {
  const shotRef = useRef<View | null>(null);
  const doneRef = useRef(false);
  const region = regionFor(sectors, points);
  const scrim = Math.max(0, Math.min(0.7, 1 - baseOpacity));   // atenúa la base para resaltar ensayos
  const noMap = mapType === 'none';

  const capture = useCallback(async () => {
    if (doneRef.current) return;
    doneRef.current = true;
    try {
      // Captura a resolución NATIVA del dispositivo (pixelRatio) → PNG nítido.
      const uri = await captureRef(shotRef, { format: 'png', quality: 1, result: 'data-uri' });
      onResult(uri);
    } catch {
      onResult(null);
    }
  }, [onResult]);
  // Dispara la captura tras `delay` ms (solo el primero gana, vía doneRef).
  const captureAfter = useCallback((delay: number) => { setTimeout(() => { capture(); }, delay); }, [capture]);

  // v43.6 — Modo 'Ninguno': sin mapa (no hay teselas que esperar) → captura tras un settle corto.
  useEffect(() => { if (noMap) captureAfter(450); }, [noMap, captureAfter]);

  // ── Modo 'Ninguno': fondo blanco, solo los croquis (sectores + ensayo) en SVG ──
  if (noMap) {
    const project = projectorFor(sectors, points, width, height);
    const r = Math.max(3, pointSize / 2);
    return (
      <View ref={shotRef} collapsable={false} style={[styles.box, { width, height, backgroundColor: '#ffffff' }]}>
        <Svg width={width} height={height}>
          {sectors.map((s, i) => {
            if (s.points.length < 3) return null;
            const col = s.active ? (s.color || '#1a4f7a') : '#9ca3af';
            const pts = s.points.map(p => { const q = project(p); return `${q.x.toFixed(1)},${q.y.toFixed(1)}`; }).join(' ');
            return <SvgPolygon key={`sec-${i}`} points={pts} fill={col + (s.active ? '40' : '22')} stroke={col} strokeWidth={s.active ? 2 : 1.2} strokeLinejoin="round" />;
          })}
          {points.map((p, i) => { const q = project(p); return <Circle key={`pt-${i}`} cx={q.x} cy={q.y} r={r} fill={p.color || '#c0392b'} stroke="#fff" strokeWidth={Math.max(1.5, r / 3.5)} />; })}
        </Svg>
      </View>
    );
  }

  return (
    <View ref={shotRef} collapsable={false} style={[styles.box, { width, height }]}>
      <MapView
        style={StyleSheet.absoluteFill}
        provider={PROVIDER_GOOGLE}
        mapType={mapType}
        initialRegion={region}
        liteMode={false}
        scrollEnabled={false}
        zoomEnabled={false}
        rotateEnabled={false}
        pitchEnabled={false}
        toolbarEnabled={false}
        // onMapLoaded = teselas YA renderizadas (disparador principal, settle corto).
        // onMapReady = mapa listo pero quizá sin teselas → fallback con settle largo.
        onMapReady={() => captureAfter(3000)}
        onMapLoaded={() => captureAfter(600)}
      >
        {showOrthophoto && mapTileUrl ? <UrlTile urlTemplate={mapTileUrl} maximumZ={20} zIndex={-1} /> : null}
        {sectors.map((s, i) => {
          if (s.points.length < 3) return null;
          // v43.6 — Solo el/los sector(es) que CONTIENEN el ensayo se pintan de su color;
          // los demás van en plomo para no resaltar.
          const col = s.active ? (s.color || '#1a4f7a') : '#9ca3af';
          return (
            <Polygon
              key={`sec-${i}`}
              coordinates={s.points.map(p => ({ latitude: p.lat, longitude: p.lng }))}
              strokeColor={col}
              fillColor={col + (s.active ? '40' : '22')}
              strokeWidth={s.active ? 2.5 : 1.5}
            />
          );
        })}
        {points.map((p, i) => (
          <Marker key={`pt-${i}`} coordinate={{ latitude: p.lat, longitude: p.lng }} title={p.label} anchor={{ x: 0.5, y: 0.5 }}>
            <View style={styles.pin}><View style={{ width: pointSize, height: pointSize, borderRadius: pointSize / 2, borderWidth: Math.max(1.5, pointSize / 7), borderColor: '#fff', backgroundColor: p.color || '#c0392b' }} /></View>
          </Marker>
        ))}
      </MapView>
      {scrim > 0 ? <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: '#ffffff', opacity: scrim }]} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { overflow: 'hidden', backgroundColor: '#e8edf4' },
  pin: { alignItems: 'center', justifyContent: 'center' },
  pinDot: { width: 14, height: 14, borderRadius: 7, borderWidth: 2, borderColor: '#fff' },
});
