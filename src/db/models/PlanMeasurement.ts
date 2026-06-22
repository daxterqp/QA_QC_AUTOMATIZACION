import { Model } from '@nozbe/watermelondb';
import { field, date, readonly } from '@nozbe/watermelondb/decorators';

/**
 * Medición guardada sobre un plano PDF.
 * Se vincula al plan_id (no al protocolo) para que sea compartida
 * entre todos los protocolos que usen el mismo plano.
 * Solo se guarda localmente — no se sincroniza con Supabase.
 *
 * type: 'line' | 'calibration' | 'polygon'
 * data: JSON string con las coordenadas y medidas
 *   - line/calibration: {ax,ay,bx,by,distPx,distReal}
 *   - polygon: {points:[{x,y}], areaPx, areaReal, perimPx, perimReal}
 */
export default class PlanMeasurement extends Model {
  static table = 'plan_measurements';
  static associations = {
    plans: { type: 'belongs_to' as const, key: 'plan_id' },
  };

  @field('plan_id') planId!: string;
  @field('type') type!: string; // 'line' | 'calibration' | 'polygon'
  @field('data') data!: string; // JSON
  @field('calibration_scale') calibrationScale!: number; // px per meter at baseScale
  @field('page') page!: number; // página del PDF

  @readonly @date('created_at') createdAt!: Date;
  @readonly @date('updated_at') updatedAt!: Date;
}
