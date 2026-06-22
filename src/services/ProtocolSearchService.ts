/**
 * ProtocolSearchService (v45) — Autocompletado de "llamadas a otras fichas".
 *
 * Lee de la base LOCAL (WatermelonDB) → instantáneo y SIN costo de red (regla:
 * consultas a la nube puntuales; el móvil ya tiene sus datos sincronizados).
 * Devuelve los últimos ensayos APROBADOS del proyecto que coinciden con el tipo
 * (id_protocolo de la plantilla) y el texto escrito (prefijo del código).
 */
import { Q } from '@nozbe/watermelondb';
import { protocolsCollection, protocolTemplatesCollection } from '@db/index';

export interface RecentProtocol {
  id: string;
  code: string;        // protocol_code (o external_id histórico)
  number: string;      // protocol_number (descriptivo)
  date: string | null; // ensayo_date (YYYY-MM-DD) si existe
}

function sortKey(p: any): number {
  // Recientes primero: ensayo_date (si hay) o created_at.
  if (p.ensayoDate) { const t = Date.parse(p.ensayoDate); if (isFinite(t)) return t; }
  return p.createdAt instanceof Date ? p.createdAt.getTime() : (p._raw?.created_at ?? 0);
}

/**
 * @param projectId  proyecto del ensayo que hace la llamada (scope de la búsqueda).
 * @param opts.tipo  id_protocolo permitido (acota por tipo de ensayo). Opcional.
 * @param opts.codePrefix  texto escrito por el técnico (coincidencia por inclusión).
 * @param opts.limit  máximo de resultados (def 10 — consulta puntual).
 */
export async function searchRecentProtocols(
  projectId: string,
  opts: { tipo?: string; codePrefix?: string; limit?: number } = {},
): Promise<RecentProtocol[]> {
  if (!projectId) return [];
  const limit = opts.limit ?? 10;

  const clauses: any[] = [
    Q.where('project_id', projectId),
    Q.where('status', 'APPROVED'),
  ];

  // Filtro por tipo: resolver las plantillas con ese id_protocolo y acotar por template_id.
  if (opts.tipo) {
    const tpls: any[] = await protocolTemplatesCollection
      .query(Q.where('id_protocolo', opts.tipo)).fetch().catch(() => []);
    const ids = tpls.map(t => t.id);
    // Si no hay plantillas de ese tipo, fuerza 0 resultados (no abrir el filtro).
    clauses.push(Q.where('template_id', Q.oneOf(ids.length ? ids : ['__none__'])));
  }

  let rows: any[] = await protocolsCollection.query(...clauses).fetch().catch(() => []);

  const pref = (opts.codePrefix ?? '').trim().toLowerCase();
  if (pref) {
    rows = rows.filter(p => {
      const code = (p.protocolCode ?? p.externalId ?? '').toLowerCase();
      const num = (p.protocolNumber ?? '').toLowerCase();
      return code.includes(pref) || num.includes(pref);
    });
  }

  rows.sort((a, b) => sortKey(b) - sortKey(a));

  return rows
    .map(p => ({
      id: p.id,
      code: (p.protocolCode ?? p.externalId ?? '').trim(),
      number: (p.protocolNumber ?? '').trim(),
      date: p.ensayoDate ?? null,
    }))
    .filter(r => r.code)
    .slice(0, limit);
}
