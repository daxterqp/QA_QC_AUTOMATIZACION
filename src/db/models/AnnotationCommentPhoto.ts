import { Model } from '@nozbe/watermelondb';
import { field, date, readonly } from '@nozbe/watermelondb/decorators';

export default class AnnotationCommentPhoto extends Model {
  static table = 'annotation_comment_photos';

  static associations = {
    annotation_comments: { type: 'belongs_to' as const, key: 'annotation_comment_id' },
  };

  @field('annotation_comment_id') annotationCommentId!: string;
  @field('local_uri') localUri!: string;
  @field('storage_path') storagePath!: string | null;

  @readonly @date('created_at') createdAt!: Date;
  @readonly @date('updated_at') updatedAt!: Date;
}
