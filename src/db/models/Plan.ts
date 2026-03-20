import { Model } from '@nozbe/watermelondb';
import { field, date, readonly, children } from '@nozbe/watermelondb/decorators';
import type PlanAnnotation from './PlanAnnotation';

export default class Plan extends Model {
  static table = 'plans';
  static associations = {
    plan_annotations: { type: 'has_many' as const, foreignKey: 'plan_id' },
  };

  @field('project_id') projectId!: string;
  @field('location_id') locationId!: string | null;
  @field('name') name!: string;
  @field('file_uri') fileUri!: string;
  @field('uploaded_by_id') uploadedById!: string;

  @children('plan_annotations') annotations!: PlanAnnotation[];

  @readonly @date('created_at') createdAt!: Date;
  @readonly @date('updated_at') updatedAt!: Date;
}
