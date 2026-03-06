import { Model } from '@nozbe/watermelondb';
import { field, date, readonly, relation } from '@nozbe/watermelondb/decorators';
import type Protocol from './Protocol';

export type NCStatus = 'OPEN' | 'RESOLVED';

export default class NonConformity extends Model {
  static table = 'non_conformities';

  static associations = {
    protocols: { type: 'belongs_to' as const, key: 'protocol_id' },
  };

  @field('project_id') projectId!: string;
  @field('protocol_id') protocolId!: string;
  @field('description') description!: string;
  @field('status') status!: NCStatus;
  @field('raised_by_id') raisedById!: string;
  @field('resolution_notes') resolutionNotes!: string | null;

  @readonly @date('created_at') createdAt!: Date;
  @readonly @date('updated_at') updatedAt!: Date;

  @relation('protocols', 'protocol_id') protocol!: Protocol;
}
