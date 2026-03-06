import { Model } from '@nozbe/watermelondb';
import { field, date, readonly, relation, children } from '@nozbe/watermelondb/decorators';
import type Project from './Project';
import type Location from './Location';
import type ProtocolItem from './ProtocolItem';

export type ProtocolStatus = 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'REJECTED';
export type UploadStatus = 'PENDING' | 'SYNCED';

export default class Protocol extends Model {
  static table = 'protocols';

  static associations = {
    projects: { type: 'belongs_to' as const, key: 'project_id' },
    locations: { type: 'belongs_to' as const, key: 'location_id' },
    protocol_items: { type: 'has_many' as const, foreignKey: 'protocol_id' },
  };

  @field('project_id') projectId!: string;
  @field('location_id') locationId!: string | null;
  @field('status') status!: ProtocolStatus;
  @field('protocol_number') protocolNumber!: string;
  @field('location_reference') locationReference!: string;
  @field('latitude') latitude!: number | null;
  @field('longitude') longitude!: number | null;
  @field('is_locked') isLocked!: boolean;
  @field('corrections_allowed') correctionsAllowed!: boolean;
  @field('signed_by_id') signedById!: string | null;
  @field('signed_at') signedAt!: number | null;
  @field('filled_by_id') filledById!: string | null;
  @field('filled_at') filledAt!: number | null;
  @field('upload_status') uploadStatus!: UploadStatus;

  @readonly @date('created_at') createdAt!: Date;
  @readonly @date('updated_at') updatedAt!: Date;

  @relation('projects', 'project_id') project!: Project;
  @relation('locations', 'location_id') location!: Location;
  @children('protocol_items') items!: ProtocolItem[];
}
