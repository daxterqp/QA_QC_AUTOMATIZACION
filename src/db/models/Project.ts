import { Model } from '@nozbe/watermelondb';
import { field, date, readonly, children } from '@nozbe/watermelondb/decorators';
import type Protocol from './Protocol';
import type Location from './Location';

export type ProjectStatus = 'ACTIVE' | 'CLOSED';

export default class Project extends Model {
  static table = 'projects';

  static associations = {
    protocols: { type: 'has_many' as const, foreignKey: 'project_id' },
    locations: { type: 'has_many' as const, foreignKey: 'project_id' },
  };

  @field('name') name!: string;
  @field('status') status!: ProjectStatus;
  @field('password') password!: string | null;
  @field('created_by_id') createdById!: string | null;
  @field('logo_s3_key') logoS3Key!: string | null;
  @field('stamp_comment') stampComment!: string | null;
  // v22 — feature flags JSON serializado. Usar parseFeatureFlags() del helper.
  @field('feature_flags') featureFlags!: string | null;
  // v43 — Identificador del proyecto para el código de muestras (ej. "123").
  @field('sample_identifier') sampleIdentifier!: string | null;
  // v26 — URL tile server custom para ortofoto. Si null, mapa usa Google Maps default.
  @field('map_tile_url') mapTileUrl!: string | null;
  // v34 — ortofoto liviana georreferenciada (imagen WebP en S3 + bbox WGS84).
  @field('orthophoto_s3_key') orthophotoS3Key!: string | null;
  @field('orthophoto_bounds_json') orthophotoBoundsJson!: string | null;
  @field('orthophoto_system') orthophotoSystem!: string | null;
  @field('orthophoto_tiles_json') orthophotoTilesJson!: string | null; // teselado: JSON [{s3Key,bounds}]

  @readonly @date('created_at') createdAt!: Date;
  @readonly @date('updated_at') updatedAt!: Date;

  @children('protocols') protocols!: Protocol[];
  @children('locations') locations!: Location[];
}
