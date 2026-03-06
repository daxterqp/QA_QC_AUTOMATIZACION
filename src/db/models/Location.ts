import { Model } from '@nozbe/watermelondb';
import { field, date, readonly, relation } from '@nozbe/watermelondb/decorators';
import type Project from './Project';

export default class Location extends Model {
  static table = 'locations';

  static associations = {
    projects: { type: 'belongs_to' as const, key: 'project_id' },
  };

  @field('project_id') projectId!: string;
  /** Nombre de la ubicacion, ej: "Cocina 1- Piso 1" */
  @field('name') name!: string;
  /** Plano de referencia asociado, ej: "Plano_Cocina_P1" */
  @field('reference_plan') referencePlan!: string;

  @readonly @date('created_at') createdAt!: Date;
  @readonly @date('updated_at') updatedAt!: Date;

  @relation('projects', 'project_id') project!: Project;
}
