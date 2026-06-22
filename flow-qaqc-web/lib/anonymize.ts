/**
 * anonymize — helper para mostrar nombres de usuarios anónimos en las vistas
 * de trazabilidad cuando `project.feature_flags.anonymize_traceability === true`.
 *
 * Mapeo determinístico por proyecto: el primer user que aparece (orden por
 * created_at del primer registro suyo en el proyecto, tie-break por user_id)
 * es "Técnico 1", el siguiente "Técnico 2", etc.
 *
 * Decisión #3 del plan: aplica a TODOS los displays sin distinción de rol
 * (incluso CREATOR/JEFE en las vistas analíticas). Los queries internas
 * siguen usando user_id real para integridad referencial.
 */

import type { User, WorkSession } from '@/types';

export interface AnonymizeOptions {
  enabled: boolean;
  /** Sesiones del proyecto en orden cronológico (para construir el mapeo). */
  sessions: WorkSession[];
  /** Lista de usuarios conocidos (para nombre real si no anónimo). */
  users: User[];
}

export class AnonymizeMap {
  private aliasById = new Map<string, string>();
  private userById = new Map<string, User>();
  public enabled: boolean;

  constructor(opts: AnonymizeOptions) {
    this.enabled = opts.enabled;
    for (const u of opts.users) this.userById.set(u.id, u);

    if (!opts.enabled) return;
    // Mapping estable por proyecto: ordenamos los USERS (no las sesiones filtradas)
    // por created_at asc, tie-break por id. Así el alias "Técnico N" no cambia
    // cuando el usuario aplica filtros de fecha sobre las sesiones.
    // Filtramos a los users que efectivamente aparecen en sesiones del proyecto.
    const userIdsInSessions = new Set<string>();
    for (const s of opts.sessions) userIdsInSessions.add(s.user_id);
    const sortedUsers = [...opts.users]
      .filter(u => userIdsInSessions.has(u.id))
      .sort((a, b) => {
        const aCreated = (a as any).created_at ?? 0;
        const bCreated = (b as any).created_at ?? 0;
        if (aCreated !== bCreated) return aCreated - bCreated;
        return a.id.localeCompare(b.id);
      });
    let n = 1;
    for (const u of sortedUsers) {
      if (!this.aliasById.has(u.id)) {
        this.aliasById.set(u.id, `Técnico ${n++}`);
      }
    }
  }

  /** Devuelve el nombre a mostrar para un user. */
  display(userId: string): string {
    if (this.enabled) return this.aliasById.get(userId) ?? `Técnico ?`;
    const u = this.userById.get(userId);
    if (!u) return '— Desconocido —';
    return [u.name, u.apellido].filter(Boolean).join(' ').trim() || u.name;
  }
}
