import { Model } from '@nozbe/watermelondb';
import { field, date, readonly, relation } from '@nozbe/watermelondb/decorators';
import type Project from './Project';

export default class Location extends Model {
  static table = 'locations';

  static associations = {
    projects: { type: 'belongs_to' as const, key: 'project_id' },
  };

  @field('project_id') projectId!: string;
  /** Nombre completo, ej: "P1-Sector1-Cimiento" */
  @field('name') name!: string;
  /** Solo la parte de ubicación, ej: "P1-Sector1" */
  @field('location_only') locationOnly!: string | null;
  /** DISCIPLINA, ej: "Estructuras", "Sanitarias", "Eléctricas" */
  @field('specialty') specialty!: string | null;
  /** v104 — ELEMENTO físico que se libera, ej: "Losa", "C-1", "VA-202".
   *  Va aparte de `specialty` porque son ejes distintos: una ubicación puede
   *  filtrarse por disciplina, por elemento, o por ambos. */
  @field('element') element!: string | null;
  /** Plano de referencia asociado, ej: "CIM,DetalleCimientos" */
  @field('reference_plan') referencePlan!: string;
  /** IDs de plantillas requeridas, separados por coma, ej: "1,2,3" */
  @field('template_ids') templateIds!: string | null;

  @readonly @date('created_at') createdAt!: Date;
  @readonly @date('updated_at') updatedAt!: Date;

  @relation('projects', 'project_id') project!: Project;
}
