import { Model } from '@nozbe/watermelondb';
import { field, date, readonly, relation, children } from '@nozbe/watermelondb/decorators';
import type Protocol from './Protocol';
import type Evidence from './Evidence';

export default class ProtocolItem extends Model {
  static table = 'protocol_items';

  static associations = {
    protocols: { type: 'belongs_to' as const, key: 'protocol_id' },
    evidences: { type: 'has_many' as const, foreignKey: 'protocol_item_id' },
  };

  @field('protocol_id') protocolId!: string;
  /** Partida o item del Excel maestro, ej: "C1-P1" */
  @field('partida_item') partidaItem!: string | null;
  /** Actividad realizada / descripcion del item */
  @field('item_description') itemDescription!: string;
  /** Metodo de validacion, ej: "In Situ", "Nivel", "Plano" */
  @field('validation_method') validationMethod!: string | null;
  @field('is_compliant') isCompliant!: boolean;
  @field('comments') comments!: string | null;

  @readonly @date('created_at') createdAt!: Date;
  @readonly @date('updated_at') updatedAt!: Date;

  @relation('protocols', 'protocol_id') protocol!: Protocol;
  @children('evidences') evidences!: Evidence[];
}
