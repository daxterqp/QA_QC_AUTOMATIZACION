import { Model } from '@nozbe/watermelondb';
import { field, date, readonly } from '@nozbe/watermelondb/decorators';

export type UserRole = 'OPERATOR' | 'SUPERVISOR' | 'RESIDENT';

export default class User extends Model {
  static table = 'users';

  @field('name') name!: string;
  /** OPERATOR = Otros | SUPERVISOR = Supervisor QC | RESIDENT = El Jefe */
  @field('role') role!: UserRole;
  @field('pin') pin!: string | null;
  @field('signature_uri') signatureUri!: string | null;

  @readonly @date('created_at') createdAt!: Date;
  @readonly @date('updated_at') updatedAt!: Date;
}
