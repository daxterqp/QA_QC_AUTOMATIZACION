import { Model } from '@nozbe/watermelondb';
import { field, date, readonly, children } from '@nozbe/watermelondb/decorators';

export default class AnnotationComment extends Model {
  static table = 'annotation_comments';

  static associations = {
    plan_annotations: { type: 'belongs_to' as const, key: 'annotation_id' },
    annotation_comment_photos: { type: 'has_many' as const, foreignKey: 'annotation_comment_id' },
  };

  @field('annotation_id') annotationId!: string;
  @field('author_id') authorId!: string;
  @field('content') content!: string | null;
  /** false = el creador de la viñeta aún no leyó este comentario */
  @field('read_by_creator') readByCreator!: boolean;

  @readonly @date('created_at') createdAt!: Date;
  @readonly @date('updated_at') updatedAt!: Date;

  @children('annotation_comment_photos') photos!: any[];
}
