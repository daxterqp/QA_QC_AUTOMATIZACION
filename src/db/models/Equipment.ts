import { Model } from '@nozbe/watermelondb';
import { field, date, readonly } from '@nozbe/watermelondb/decorators';

export type EquipmentStatus = 'active' | 'inactive' | 'retired';
export type EquipmentCategory = 'laboratorio' | 'maquinaria_pesada';
export type EquipmentType  =
  // Laboratorio (calibrables)
  | 'balanza' | 'prensa' | 'horno' | 'tamiz' | 'termometro'
  // Maquinaria pesada (no calibrables, para Trazabilidad operacional)
  | 'excavadora' | 'compactador' | 'motoniveladora' | 'retroexcavadora'
  | 'cargador_frontal' | 'volquete' | 'cisterna' | 'rodillo'
  | 'otros';

/** Equipo del catálogo del proyecto. Dos categorías:
 *  - laboratorio: balanza, prensa, horno, tamiz, termómetro — vinculados a
 *    protocolos de QA/QC con validación de calibración por `next_calibration_at`.
 *  - maquinaria_pesada: excavadora, compactador, etc. — usados por el módulo
 *    de Trazabilidad operacional para registro de sesiones de trabajo. */
export default class Equipment extends Model {
  static table = 'equipment';

  static associations = {
    projects: { type: 'belongs_to' as const, key: 'project_id' },
  };

  @field('project_id') projectId!: string;
  @field('code') code!: string;
  @field('name') name!: string;
  @field('type') type!: EquipmentType;
  @field('category') category!: EquipmentCategory;
  @field('brand') brand!: string | null;
  @field('model') model!: string | null;
  @field('serial') serial!: string | null;
  @field('capacity') capacity!: string | null;
  @field('resolution') resolution!: string | null;
  @field('last_calibration_at') lastCalibrationAt!: number | null;
  @field('next_calibration_at') nextCalibrationAt!: number;
  @field('calibration_certificate_s3') calibrationCertificateS3!: string | null;
  @field('status') status!: EquipmentStatus;
  @field('notes') notes!: string | null;

  @readonly @date('created_at') createdAt!: Date;
  @readonly @date('updated_at') updatedAt!: Date;
}
