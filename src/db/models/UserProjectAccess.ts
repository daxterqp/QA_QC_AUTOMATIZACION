import { Model } from '@nozbe/watermelondb';
import { field, date, readonly } from '@nozbe/watermelondb/decorators';

export default class UserProjectAccess extends Model {
  static table = 'user_project_access';

  @field('user_id') userId!: string;
  @field('project_id') projectId!: string;

  @readonly @date('created_at') createdAt!: Date;
  @readonly @date('updated_at') updatedAt!: Date;
}
