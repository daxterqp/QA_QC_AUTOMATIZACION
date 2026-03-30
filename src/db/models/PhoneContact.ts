import { Model } from '@nozbe/watermelondb';
import { field, date, readonly } from '@nozbe/watermelondb/decorators';

export default class PhoneContact extends Model {
  static table = 'phone_contacts';

  @field('project_id') projectId!: string;
  @field('name') name!: string;
  @field('phone') phone!: string;
  @field('role') role!: string | null;
  @field('sort_order') sortOrder!: number | null;

  @readonly @date('created_at') createdAt!: Date;
  @readonly @date('updated_at') updatedAt!: Date;
}
