import { Model } from '@nozbe/watermelondb';
import { field, date, readonly, children } from '@nozbe/watermelondb/decorators';
import type Protocol from './Protocol';
import type Location from './Location';

export type ProjectStatus = 'ACTIVE' | 'CLOSED';

export default class Project extends Model {
  static table = 'projects';

  static associations = {
    protocols: { type: 'has_many' as const, foreignKey: 'project_id' },
    locations: { type: 'has_many' as const, foreignKey: 'project_id' },
  };

  @field('name') name!: string;
  @field('status') status!: ProjectStatus;
  @field('password') password!: string | null;
  @field('created_by_id') createdById!: string | null;

  @readonly @date('created_at') createdAt!: Date;
  @readonly @date('updated_at') updatedAt!: Date;

  @children('protocols') protocols!: Protocol[];
  @children('locations') locations!: Location[];
}
