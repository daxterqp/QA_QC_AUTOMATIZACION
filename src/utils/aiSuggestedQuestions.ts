/**
 * aiSuggestedQuestions — Preguntas sugeridas del Asistente IA (chips de inicio).
 *
 * Fase 2: dinámicas — si el proyecto tiene sectores reales, se incluye una
 * pregunta "amarrada" al primer sector (garantiza que la consulta de ejemplo
 * tenga sentido contra los datos reales del proyecto).
 */
export const AI_SUGGESTED_QUESTIONS: string[] = [
  '¿Cómo van los ensayos de la semana?',
  '¿Cuántos ensayos hemos hecho hoy?',
  '¿Qué ensayos están pendientes de aprobación?',
  '¿Hay no conformidades abiertas?',
  '¿Cómo va el proyecto?',
];

/** Chips finales: base + pregunta con el primer sector real (si existe). */
export function buildSuggestedQuestions(firstSectorName?: string | null): string[] {
  const out = [...AI_SUGGESTED_QUESTIONS];
  const name = firstSectorName?.trim();
  if (name) {
    // Después de la 2ª pregunta, para que quede entre las de conteo.
    out.splice(2, 0, `¿Cuántos ensayos se hicieron ayer en ${name}?`);
  }
  return out;
}

// ── Saludo de la bienvenida (feedback: "Hola {nombre}, ¿por dónde empezamos?"
// era muy genérico) — variantes cortas, cercanas, según la hora del día.
// Diseñado para poder crecer POR PROYECTO más adelante (parámetro opcional
// `variants`): hoy basta un puñado de frases que ya rotan y personalizan.

interface GreetingBucket { saludo: string; frases: string[] }

const GREETING_BUCKETS: GreetingBucket[] = [
  { // madrugada/mañana (0-11h)
    saludo: 'Buenos días',
    frases: ['¿comenzamos el día con calidad?', '¿verificamos el avance?', '¿por dónde empezamos?', '¿revisamos la calidad de hoy?'],
  },
  { // tarde (12-18h)
    saludo: 'Buenas tardes',
    frases: ['¿cómo va la obra?', '¿revisamos la calidad?', '¿verificamos el avance del día?', '¿por dónde seguimos?'],
  },
  { // noche (19-23h)
    saludo: 'Buenas noches',
    frases: ['¿cerramos el día revisando los ensayos?', '¿un vistazo antes de terminar?', '¿revisamos cómo quedó todo hoy?'],
  },
];

/** Saludo cálido de la bienvenida, variado según la hora de Lima y con el
 *  nombre del usuario. `seed` opcional fija la variante (p.ej. por sesión) —
 *  sin seed, rota al azar cada vez que se muestra. */
export function buildGreeting(firstName: string | null, hour: number, seed?: number): string {
  const bucket = hour < 12 ? GREETING_BUCKETS[0] : hour < 19 ? GREETING_BUCKETS[1] : GREETING_BUCKETS[2];
  const idx = seed != null ? seed % bucket.frases.length : Math.floor(Math.random() * bucket.frases.length);
  const frase = bucket.frases[idx];
  return firstName ? `${bucket.saludo}, ${firstName}. ${frase[0].toUpperCase()}${frase.slice(1)}` : `${bucket.saludo}. ${frase[0].toUpperCase()}${frase.slice(1)}`;
}
