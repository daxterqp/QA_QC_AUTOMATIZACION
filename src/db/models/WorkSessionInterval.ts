import { Model } from '@nozbe/watermelondb';
import { field, date, readonly } from '@nozbe/watermelondb/decorators';

export type WorkSessionIntervalKind = 'active' | 'paused';

/** Intervalo dentro de una sesión: alterna 'active' y 'paused'.
 *  Solo el ÚLTIMO interval de la sesión puede tener `ended_at = null` (abierto).
 *  Append-only: una vez cerrado (`ended_at` set), no se modifica. */
export default class WorkSessionInterval extends Model {
  static table = 'work_session_intervals';

  @field('session_id') sessionId!: string;
  @field('kind') kind!: WorkSessionIntervalKind;
  @field('started_at') startedAt!: number;
  @field('ended_at') endedAt!: number | null;

  @readonly @date('created_at') createdAt!: Date;

  /** Duración en ms; usa `now` si está abierto. */
  durationMs(now: number = Date.now()): number {
    const end = this.endedAt ?? now;
    return Math.max(0, end - this.startedAt);
  }
}
