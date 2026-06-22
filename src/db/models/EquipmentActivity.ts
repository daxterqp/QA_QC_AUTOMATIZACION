import { Model } from '@nozbe/watermelondb';
import { field, date, readonly } from '@nozbe/watermelondb/decorators';

/** Tabla puente equipo↔actividad. Opcionalmente apunta a una plantilla de
 *  formulario inicial (session_form_templates) que el técnico debe completar
 *  antes de iniciar la sesión con esa combinación. */
export default class EquipmentActivity extends Model {
  static table = 'equipment_activities';

  @field('equipment_id') equipmentId!: string;
  @field('activity_id') activityId!: string;
  @field('form_template_id') formTemplateId!: string | null;

  @readonly @date('created_at') createdAt!: Date;
  @readonly @date('updated_at') updatedAt!: Date;
}
