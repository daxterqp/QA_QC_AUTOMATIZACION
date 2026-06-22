import { Model } from '@nozbe/watermelondb';
import { field, date, readonly } from '@nozbe/watermelondb/decorators';

/** Vínculo protocolo ↔ equipo usado. created_at viene de WatermelonDB; used_at
 *  es el timestamp del momento en que el supervisor declaró el uso. */
export default class ProtocolEquipment extends Model {
  static table = 'protocol_equipment';

  static associations = {
    protocols: { type: 'belongs_to' as const, key: 'protocol_id' },
    equipment: { type: 'belongs_to' as const, key: 'equipment_id' },
  };

  @field('protocol_id') protocolId!: string;
  @field('equipment_id') equipmentId!: string;
  @field('used_at') usedAt!: number;

  @readonly @date('created_at') createdAt!: Date;
}
