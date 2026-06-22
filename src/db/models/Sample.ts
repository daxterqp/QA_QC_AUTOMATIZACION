import { Model } from '@nozbe/watermelondb';
import { field, date, readonly } from '@nozbe/watermelondb/decorators';

/**
 * Sample (v43) — Muestra física del módulo "ensayos por muestra".
 *
 * Agrupa varios protocolos (protocols.sample_id apunta aquí). Su código
 * correlativo es `M{sample_identifier}{ddmmyy}-{seq:4}` por proyecto (ver
 * `sampleCode.ts`). Las filas del formulario son opcionales (nullable): el
 * usuario activa/desactiva según el uso. Coordenadas = datum + Este/Norte/Cota
 * + GPS (medición automática reutilizada).
 */
export default class Sample extends Model {
  static table = 'samples';

  @field('project_id') projectId!: string;
  @field('sample_code') sampleCode!: string;
  @field('seq') seq!: number | null;
  @field('sample_date') sampleDate!: string | null;
  @field('location_id') locationId!: string | null;
  @field('sector_id') sectorId!: string | null;
  @field('material_type') materialType!: string | null;
  @field('condition') condition!: string | null;       // ALTERADA | INALTERADA
  @field('depth_from') depthFrom!: number | null;
  @field('depth_to') depthTo!: number | null;
  @field('coord_system') coordSystem!: string | null;  // datum
  @field('latitude') latitude!: number | null;
  @field('longitude') longitude!: number | null;
  @field('coord_east') coordEast!: number | null;
  @field('coord_north') coordNorth!: number | null;
  @field('coord_elevation') coordElevation!: number | null;
  @field('coord_captured_at') coordCapturedAt!: number | null;
  @field('coord_accuracy_m') coordAccuracyM!: number | null;
  @field('layer_info_json') layerInfoJson!: string | null;
  @field('notes') notes!: string | null;
  @field('created_by_id') createdById!: string | null;
  @field('upload_status') uploadStatus!: string | null;

  @readonly @date('created_at') createdAt!: Date;
  @readonly @date('updated_at') updatedAt!: Date;
}
