/**
 * CroquisCaptureContext (v43.5) — Provee `captureMany(specs)` para capturar croquis
 * (mapas) a PNG antes de exportar el PDF. Monta UN MapView por vez en un overlay modal
 * VISIBLE (necesario para que carguen las teselas), captura con react-native-view-shot,
 * y devuelve `{ [id]: dataUriPNG }`. Si una captura falla, ese id queda sin imagen
 * (el PDF cae al fallback o la omite).
 */
import React, { createContext, useContext, useCallback, useRef, useState, type ReactNode } from 'react';
import { View, Text, Modal, ActivityIndicator, StyleSheet } from 'react-native';
import CroquisCapture, { type CroquisSector, type CroquisPoint } from '@components/CroquisCapture';
import type { CroquisMapType } from '@utils/featureFlags';
import { Colors } from '../theme/colors';

export interface CroquisSpec {
  id: string;                 // clave (protocolId o sampleId)
  sectors: CroquisSector[];
  points: CroquisPoint[];
  mapType: CroquisMapType;
  mapTileUrl?: string | null;
  showOrthophoto?: boolean;
  baseOpacity?: number;
  pointSize?: number;
  width?: number;
  height?: number;
}

interface Ctx { captureMany: (specs: CroquisSpec[]) => Promise<Record<string, string>> }
const CroquisCtx = createContext<Ctx | null>(null);

export function useCroquisCapture(): Ctx {
  const c = useContext(CroquisCtx);
  if (!c) return { captureMany: async () => ({}) };   // sin provider → no-op
  return c;
}

export function CroquisCaptureProvider({ children }: { children: ReactNode }) {
  const [active, setActive] = useState<CroquisSpec | null>(null);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const resolveRef = useRef<((uri: string | null) => void) | null>(null);

  const captureOne = useCallback((spec: CroquisSpec) => new Promise<string | null>(resolve => {
    const myResolve = resolve;
    resolveRef.current = myResolve;
    setActive(spec);
    // Timeout de seguridad: si el mapa nunca dispara onResult, resolver null. Se
    // protege por IDENTIDAD para no resolver por error una captura POSTERIOR (las
    // capturas son secuenciales y un timer viejo podría disparar durante otra).
    setTimeout(() => {
      if (resolveRef.current === myResolve) { resolveRef.current = null; setActive(null); myResolve(null); }
    }, 14000);
  }), []);

  const captureMany = useCallback(async (specs: CroquisSpec[]): Promise<Record<string, string>> => {
    const out: Record<string, string> = {};
    if (specs.length === 0) return out;
    setProgress({ done: 0, total: specs.length });
    for (let i = 0; i < specs.length; i++) {
      setProgress({ done: i, total: specs.length });
      const uri = await captureOne(specs[i]);
      if (uri) out[specs[i].id] = uri;
    }
    setActive(null);
    setProgress({ done: 0, total: 0 });
    return out;
  }, [captureOne]);

  const onResult = useCallback((uri: string | null) => {
    const r = resolveRef.current;
    resolveRef.current = null;
    // No limpiamos `active` aquí: la próxima captureOne lo reemplaza (sin flicker) y
    // captureMany lo pone a null al terminar todas.
    if (r) r(uri);
  }, []);

  return (
    <CroquisCtx.Provider value={{ captureMany }}>
      {children}
      <Modal visible={active != null} transparent animationType="fade">
        <View style={styles.overlay}>
          <Text style={styles.title}>Generando croquis… {progress.done + 1}/{progress.total}</Text>
          <ActivityIndicator color={Colors.white} style={{ marginVertical: 12 }} />
          {/* El mapa se renderiza VISIBLE (pequeño) para que cargue teselas y se capture. */}
          {active ? (
            <View style={[styles.mapHolder, { width: active.width ?? 360, height: active.height ?? 270 }]}>
              <CroquisCapture
                key={active.id}
                sectors={active.sectors}
                points={active.points}
                mapType={active.mapType}
                mapTileUrl={active.mapTileUrl}
                showOrthophoto={active.showOrthophoto}
                baseOpacity={active.baseOpacity}
                pointSize={active.pointSize}
                width={active.width ?? 360}
                height={active.height ?? 270}
                onResult={onResult}
              />
            </View>
          ) : null}
          <Text style={styles.hint}>No cierres la app. Si no hay señal, el croquis se omitirá.</Text>
        </View>
      </Modal>
    </CroquisCtx.Provider>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(14,33,61,0.92)', alignItems: 'center', justifyContent: 'center', padding: 20 },
  title: { color: Colors.white, fontWeight: '800', fontSize: 16 },
  hint: { color: 'rgba(255,255,255,0.75)', fontSize: 12, marginTop: 14, textAlign: 'center' },
  mapHolder: { borderRadius: 8, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)' },
});
