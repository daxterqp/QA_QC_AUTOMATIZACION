/**
 * RtkProvider — ESCENARIO FUTURO (no implementado): vinculación a un receptor
 * RTK externo (p.ej. Emlid Reach por Bluetooth) para precisión centimétrica.
 *
 * El camino realista NO es el chip interno del celular (raw-GNSS/RTK requiere
 * módulo nativo solo-Android + correcciones NTRIP + doble frecuencia). En su
 * lugar, un receptor externo entrega NMEA YA CORREGIDO por Bluetooth; un módulo
 * nativo/lib lo lee y alimenta el MISMO flujo de guardado de coordenadas con
 * `method: 'rtk'` (ya soportado por el esquema v35 y por GPSCaptureBar.saveCoords).
 *
 * Aquí dejamos solo el CONTRATO y un registro enchufable: el día que se integre
 * el receptor, se implementa `RtkProvider` y se registra con `setRtkProvider`.
 * La UI (GpsCaptureModal) puede entonces ofrecer "Usar receptor RTK" si
 * `getRtkProvider()?.isAvailable()` es true — sin cambiar el resto del pipeline.
 */

export interface RtkFix {
  lat: number;
  lng: number;
  /** Precisión horizontal estimada (m). RTK fijo ≈ 0.01–0.05 m. */
  accuracyM: number | null;
  /** 'fix' (ambigüedades resueltas, cm) | 'float' (dm) | 'single' (sin corrección). */
  solution?: 'fix' | 'float' | 'single';
  capturedAt: number;
}

export interface RtkProvider {
  /** ¿Hay un receptor RTK disponible/emparejado ahora mismo? */
  isAvailable(): boolean;
  /** Suscribe el stream de fixes corregidos. Devuelve un unsubscribe. */
  subscribe(onFix: (f: RtkFix) => void, onError?: (msg: string) => void): () => void;
}

let provider: RtkProvider | null = null;

/** Registra la implementación del receptor RTK (cuando se integre el hardware). */
export function setRtkProvider(p: RtkProvider | null): void { provider = p; }

/** Provider actual, o null si no hay RTK (caso por defecto hoy). */
export function getRtkProvider(): RtkProvider | null { return provider; }
