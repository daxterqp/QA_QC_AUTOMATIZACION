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
