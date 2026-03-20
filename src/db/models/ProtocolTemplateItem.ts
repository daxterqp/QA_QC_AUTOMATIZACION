import { Model } from '@nozbe/watermelondb';
import { field, date, readonly, relation } from '@nozbe/watermelondb/decorators';
import type ProtocolTemplate from './ProtocolTemplate';

export default class ProtocolTemplateItem extends Model {
  static table = 'protocol_template_items';

  static associations = {
    protocol_templates: { type: 'belongs_to' as const, key: 'template_id' },
  };

  @field('template_id') templateId!: string;
  @field('partida_item') partidaItem!: string | null;
  @field('item_description') itemDescription!: string;
  @field('validation_method') validationMethod!: string | null;
  @field('section') section!: string | null;

  @readonly @date('created_at') createdAt!: Date;
  @readonly @date('updated_at') updatedAt!: Date;

  @relation('protocol_templates', 'template_id') template!: ProtocolTemplate;
}
