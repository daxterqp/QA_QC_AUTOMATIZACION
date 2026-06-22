/**
 * NetworkContext — fuente única de verdad de conectividad para la app móvil.
 *
 * Basado en @react-native-community/netinfo. Estado inicial "unknown" se trata
 * como OFFLINE (más seguro: prefiere fallar visible cuando arranca sin red).
 *
 * Online efectivo = isConnected === true && isInternetReachable !== false.
 * (`isInternetReachable` puede ser null al inicio o en algunos devices; lo
 * tratamos como "asume online" porque el `isConnected` ya pasó.)
 */

import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import NetInfo, { NetInfoState, NetInfoStateType } from '@react-native-community/netinfo';

export type NetType = 'wifi' | 'cellular' | 'none' | 'unknown';

export interface NetworkContextValue {
  isOnline: boolean;
  type: NetType;
  /** True hasta que el primer evento NetInfo resuelva. Banner debe ocultarse
   *  durante esta ventana (~100-800ms en cold start) para no parpadear. */
  isResolving: boolean;
  /** Fuerza una re-verificación inmediata (útil al pulsar "Reintentar"). */
  forceRecheck: () => Promise<void>;
}

const NetworkContext = createContext<NetworkContextValue>({
  isOnline: false,
  type: 'unknown',
  isResolving: true,
  forceRecheck: async () => {},
});

function typeOf(state: NetInfoState): NetType {
  switch (state.type) {
    case NetInfoStateType.wifi:     return 'wifi';
    case NetInfoStateType.cellular: return 'cellular';
    case NetInfoStateType.none:     return 'none';
    case NetInfoStateType.unknown:  return 'unknown';
    default:                        return 'unknown';
  }
}

function isOnlineFrom(state: NetInfoState): boolean {
  if (!state.isConnected) return false;
  // Algunos devices reportan isInternetReachable=null al inicio; lo permitimos.
  if (state.isInternetReachable === false) return false;
  return true;
}

export function NetworkProvider({ children }: { children: React.ReactNode }) {
  const [isOnline, setIsOnline] = useState(false);
  const [type, setType] = useState<NetType>('unknown');
  /** Tri-estado: true hasta que el primer evento NetInfo resuelva. Evita el
   *  flash falso negativo del banner offline durante el cold start (H1). */
  const [isResolving, setIsResolving] = useState(true);
  /** Guardamos el último estado conocido para que `forceRecheck` no pise valores frescos. */
  const lastStateRef = useRef<NetInfoState | null>(null);

  useEffect(() => {
    const apply = (state: NetInfoState) => {
      lastStateRef.current = state;
      setIsOnline(isOnlineFrom(state));
      setType(typeOf(state));
      setIsResolving(false); // primer evento resuelto
    };
    // Fetch inicial
    NetInfo.fetch().then(apply).catch(() => setIsResolving(false));
    // Subscripción a cambios
    const unsub = NetInfo.addEventListener(apply);
    return () => unsub();
  }, []);

  const forceRecheck = useCallback(async () => {
    try {
      const state = await NetInfo.fetch();
      lastStateRef.current = state;
      setIsOnline(isOnlineFrom(state));
      setType(typeOf(state));
    } catch { /* sin red — mantener estado actual */ }
  }, []);

  return (
    <NetworkContext.Provider value={{ isOnline, type, isResolving, forceRecheck }}>
      {children}
    </NetworkContext.Provider>
  );
}

/** Hook principal: estado de conectividad reactivo. */
export function useNetwork(): NetworkContextValue {
  return useContext(NetworkContext);
}

/** Versión imperativa: lee el estado actual sin suscribirse a cambios.
 *  Útil para servicios y workers que necesitan consultar puntualmente. */
export async function getIsOnlineNow(): Promise<boolean> {
  try {
    const state = await NetInfo.fetch();
    return isOnlineFrom(state);
  } catch { return false; }
}
