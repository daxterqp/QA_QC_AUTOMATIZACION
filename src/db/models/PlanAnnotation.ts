import { Model } from '@nozbe/watermelondb';
import { field, date, readonly } from '@nozbe/watermelondb/decorators';

export default class PlanAnnotation extends Model {
  static table = 'plan_annotations';
  static associations = {
    plans: { type: 'belongs_to' as const, key: 'plan_id' },
  };

  @field('plan_id') planId!: string;
  @field('protocol_id') protocolId!: string | null;
  @field('rect_x') rectX!: number;
  @field('rect_y') rectY!: number;
  @field('rect_width') rectWidth!: number;
  @field('rect_height') rectHeight!: number;
  @field('comment') comment!: string | null;
  @field('sequence_number') sequenceNumber!: number;
  @field('is_ok') isOk!: boolean;
  /** 'OPEN' | 'CLOSED' — para el tablero de trazabilidad */
  @field('status') status!: string;
  @field('created_by_id') createdById!: string;

  @readonly @date('created_at') createdAt!: Date;
  @readonly @date('updated_at') updatedAt!: Date;
}
