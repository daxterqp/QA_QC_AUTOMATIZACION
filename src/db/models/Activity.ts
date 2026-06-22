import { Model } from '@nozbe/watermelondb';
import { field, date, readonly } from '@nozbe/watermelondb/decorators';

export type ActivityKind = 'productive' | 'maintenance' | 'transport' | 'other';

/** Catálogo de actividades operacionales del proyecto.
 *  Reusable entre varios equipos via tabla puente `equipment_activities`. */
export default class Activity extends Model {
  static table = 'activities';

  @field('project_id') projectId!: string;
  @field('name') name!: string;
  @field('kind') kind!: ActivityKind;

  @readonly @date('created_at') createdAt!: Date;
  @readonly @date('updated_at') updatedAt!: Date;
}
