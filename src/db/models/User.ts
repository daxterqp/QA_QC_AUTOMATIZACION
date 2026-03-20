import { Model } from '@nozbe/watermelondb';
import { field, date, readonly } from '@nozbe/watermelondb/decorators';

export type UserRole = 'CREATOR' | 'OPERATOR' | 'SUPERVISOR' | 'RESIDENT';

export default class User extends Model {
  static table = 'users';

  @field('name') name!: string;
  @field('apellido') apellido!: string | null;
  /** CREATOR = Super admin | RESIDENT = Jefe | SUPERVISOR = QC | OPERATOR = Otros */
  @field('role') role!: UserRole;
  @field('password') password!: string | null;
  @field('pin') pin!: string | null;
  @field('signature_uri') signatureUri!: string | null;

  @readonly @date('created_at') createdAt!: Date;
  @readonly @date('updated_at') updatedAt!: Date;

  get fullName(): string {
    return this.apellido ? `${this.name} ${this.apellido}` : this.name;
  }
}
