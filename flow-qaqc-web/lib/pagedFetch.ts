/**
 * pagedFetch — v88: PostgREST devuelve MÁXIMO 1000 filas por request aunque no
 * se pida .limit(). Todo listado "sin límite" sobre tablas que pueden crecer
 * (protocols, protocol_items, evidences, samples, summary_rows) debe paginar:
 * orden ESTABLE + range() hasta agotar — si no, un proyecto grande exporta
 * dossiers incompletos o calcula correlativos sobre la primera página.
 *
 * Espejo conceptual del fetchAllPaged del móvil (SupabaseSyncService v86).
 */

export const PG_PAGE = 1000;

// `data: unknown` a propósito: el builder de supabase-js infiere un row-type
// estrecho desde el string del select que rara vez coincide con el tipo de
// dominio — el caller declara T y aquí se castea (mismo patrón que los hooks).
interface PageResult {
  data: unknown;
  error: { message: string } | null;
}

/** Ejecuta `build(from, to)` con rangos crecientes hasta agotar los resultados.
 *  El builder DEBE incluir un .order() estable (id o similar) y su .range(from, to).
 *  Lanza en el primer error (el caller decide el fallback). */
export async function fetchAllPages<T>(
  build: (from: number, to: number) => PromiseLike<PageResult>,
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PG_PAGE) {
    const { data, error } = await build(from, from + PG_PAGE - 1);
    if (error) throw new Error(error.message);
    const rows = (Array.isArray(data) ? data : []) as T[];
    out.push(...rows);
    if (rows.length < PG_PAGE) break;
  }
  return out;
}
