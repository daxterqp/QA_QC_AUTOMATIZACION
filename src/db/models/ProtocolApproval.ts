import { Model } from '@nozbe/watermelondb';
import { field, date, readonly, relation } from '@nozbe/watermelondb/decorators';
import type Protocol from './Protocol';

export type ApprovalStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export default class ProtocolApproval extends Model {
  static table = 'protocol_approvals';

  static associations = {
    protocols: { type: 'belongs_to' as const, key: 'protocol_id' },
  };

  @field('protocol_id') protocolId!: string;
  @field('level') level!: 1 | 2 | 3;
  @field('signer_id') signerId!: string | null;
  @field('signed_at') signedAt!: number | null;
  @field('status') status!: ApprovalStatus;
  @field('rejection_reason') rejectionReason!: string | null;

  @readonly @date('created_at') createdAt!: Date;
  @readonly @date('updated_at') updatedAt!: Date;

  @relation('protocols', 'protocol_id') protocol!: Protocol;
}
