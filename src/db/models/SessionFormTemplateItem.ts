import { Model } from '@nozbe/watermelondb';
import { field, date, readonly } from '@nozbe/watermelondb/decorators';

/** Ítem de una plantilla de formulario inicial.
 *  `validation_method` usa MISMA sintaxis que `protocol_template_items`:
 *  `numerico-[min:max]`, `numerico-fx[expr]`, `list-[a,b,c]`, `comment-[...]`,
 *  `numerico-grN[...]`, etc. — reusa todo el motor de protocolos. */
export default class SessionFormTemplateItem extends Model {
  static table = 'session_form_template_items';

  @field('template_id') templateId!: string;
  @field('partida_item') partidaItem!: string | null;
  @field('item_description') itemDescription!: string;
  @field('validation_method') validationMethod!: string | null;
  @field('section') section!: string | null;

  @readonly @date('created_at') createdAt!: Date;
  @readonly @date('updated_at') updatedAt!: Date;
}
