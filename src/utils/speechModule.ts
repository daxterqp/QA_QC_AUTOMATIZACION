/**
 * speechModule — carga DIFERIDA de expo-speech-recognition (módulo NATIVO).
 *
 * Igual que expo-audio en el chat de FLOW: un dev client construido antes de
 * agregar el módulo no lo tiene — require() al momento de usar evita que la
 * pantalla reviente (se muestra un aviso amable de reinstalar).
 * Lo usan AIChatScreen (dictar consultas) y ProtocolFillScreen (dictar celdas).
 */

export interface SpeechModuleLite {
  requestPermissionsAsync: () => Promise<{ granted: boolean }>;
  start: (opts: { lang: string; interimResults?: boolean; continuous?: boolean }) => void;
  stop: () => void;
  abort: () => void;
  addListener: (
    event: 'result' | 'end' | 'error',
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    cb: (e: any) => void,
  ) => { remove: () => void };
}

export function loadSpeech(): SpeechModuleLite | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const m = require('expo-speech-recognition');
    return m.ExpoSpeechRecognitionModule ?? null;
  } catch {
    return null;
  }
}

/** Normaliza un valor DICTADO para una celda numérica: "dos punto quince" suele
 *  llegar ya como "2.15" del reconocedor, pero cubre "coma"/"punto" hablados,
 *  comas decimales y puntuación final. Si no parece número, devuelve el texto
 *  tal cual (celdas de texto libre). */
export function parseSpokenValue(raw: string): string {
  let s = raw.trim()
    .replace(/\s*\b(coma|punto)\b\s*/gi, '.')
    .replace(/[.。]\s*$/, '')       // punto final de dictado ("2.15.")
    .replace(/\s+/g, ' ');
  // "2, 15" o "2,15" → decimal con punto.
  const numLike = s.replace(/\s/g, '').replace(',', '.');
  if (/^-?\d+(\.\d+)?$/.test(numLike)) return numLike;
  return s;
}
