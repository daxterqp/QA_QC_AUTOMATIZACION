import { Model } from '@nozbe/watermelondb';
import { field, date, readonly, children } from '@nozbe/watermelondb/decorators';
import type SessionFormTemplateItem from './SessionFormTemplateItem';

/** Plantilla de formulario inicial. Asignable a una combinación
 *  (equipment_id, activity_id) vía `equipment_activities.form_template_id`. */
export default class SessionFormTemplate extends Model {
  static table = 'session_form_templates';
  static associations = {
    session_form_template_items: { type: 'has_many' as const, foreignKey: 'template_id' },
  };

  @field('project_id') projectId!: string;
  @field('name') name!: string;

  @readonly @date('created_at') createdAt!: Date;
  @readonly @date('updated_at') updatedAt!: Date;

  @children('session_form_template_items') items!: SessionFormTemplateItem[];
}
