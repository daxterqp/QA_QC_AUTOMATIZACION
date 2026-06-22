import { Model } from '@nozbe/watermelondb';
import { field, date, readonly } from '@nozbe/watermelondb/decorators';

/** Respuesta al formulario inicial de una sesión.
 *  Snapshot de la pregunta (partida/description/validation_method) para que la
 *  edición posterior del template no rompa registros viejos. `template_item_id`
 *  queda como referencia opcional (SET NULL si se elimina el item). */
export default class WorkSessionFormItem extends Model {
  static table = 'work_session_form_items';

  @field('session_id') sessionId!: string;
  @field('template_item_id') templateItemId!: string | null;
  @field('partida_item') partidaItem!: string | null;
  @field('item_description') itemDescription!: string;
  @field('validation_method') validationMethod!: string | null;
  @field('value_text') valueText!: string | null;
  @field('value_number') valueNumber!: number | null;
  @field('comments') comments!: string | null;
  // v30 — Checklist Sí/No/N/A (espejo de protocol_items).
  @field('is_compliant') isCompliant!: boolean | null;
  @field('is_na') isNa!: boolean | null;
  @field('has_answer') hasAnswer!: boolean | null;

  @readonly @date('created_at') createdAt!: Date;
  @readonly @date('updated_at') updatedAt!: Date;
}
