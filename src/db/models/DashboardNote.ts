import { Model } from '@nozbe/watermelondb';
import { field, date, readonly } from '@nozbe/watermelondb/decorators';

export default class DashboardNote extends Model {
  static table = 'dashboard_notes';

  @field('project_id') projectId!: string | null;
  @field('content') content!: string;
  @field('created_by_id') createdById!: string;

  @readonly @date('created_at') createdAt!: Date;
  @readonly @date('updated_at') updatedAt!: Date;
}
