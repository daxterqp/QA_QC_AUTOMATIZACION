import { Model } from '@nozbe/watermelondb';
import { field, date, readonly } from '@nozbe/watermelondb/decorators';

/** Turno del proyecto. `end_hour < start_hour` significa que cruza medianoche
 *  (ej. start=22, end=6 → 22:00-06:00 del día siguiente). */
export default class WorkShift extends Model {
  static table = 'work_shifts';

  @field('project_id') projectId!: string;
  @field('name') name!: string;
  @field('start_hour') startHour!: number;
  @field('end_hour') endHour!: number;

  @readonly @date('created_at') createdAt!: Date;
  @readonly @date('updated_at') updatedAt!: Date;

  /** True si la hora actual (0-23) cae dentro de este turno. */
  containsHour(h: number): boolean {
    if (this.startHour <= this.endHour) return h >= this.startHour && h < this.endHour;
    // Cruza medianoche
    return h >= this.startHour || h < this.endHour;
  }
}
