import { Model } from '@nozbe/watermelondb';
import { field, date, readonly, relation } from '@nozbe/watermelondb/decorators';
import type ProtocolItem from './ProtocolItem';

/** PENDING = nunca se intentó subir.
 *  UPLOADING = upload en curso (marca para que otro intento concurrente no duplique).
 *  SYNCED = subido y confirmado. */
export type UploadStatus = 'PENDING' | 'UPLOADING' | 'SYNCED';

export default class Evidence extends Model {
  static table = 'evidences';

  static associations = {
    protocol_items: { type: 'belongs_to' as const, key: 'protocol_item_id' },
  };

  @field('protocol_item_id') protocolItemId!: string;
  // v30 — Asociación opcional a item de checklist de Trazabilidad.
  @field('session_form_item_id') sessionFormItemId!: string | null;
  @field('s3_url_placeholder') s3UrlPlaceholder!: string | null;
  @field('local_uri') localUri!: string;
  @field('upload_status') uploadStatus!: UploadStatus;

  @readonly @date('created_at') createdAt!: Date;
  @readonly @date('updated_at') updatedAt!: Date;

  @relation('protocol_items', 'protocol_item_id') protocolItem!: ProtocolItem;
}
