import { Model } from '@nozbe/watermelondb';
import { field, date, readonly } from '@nozbe/watermelondb/decorators';

/**
 * LabAuxTable (v40) — Tabla auxiliar de laboratorio a NIVEL PROYECTO.
 * Un registro por GRUPO (taras, moldes, fiolas, densidad-agua). Se sube una vez
 * (hoja 2 del Excel del catálogo Lab.) y cualquier ficha la llama por `groupKey`
 * con BUSCAR(@grupo, valor, "columna"). La 1ª columna es la LLAVE.
 *
 * `columnsJson` = JSON string `["Codigo","Malla","Abertura"]`.
 * `rowsJson`    = JSON string `[["1","N1","45"], ...]` (orientado a filas).
 */
export default class LabAuxTable extends Model {
  static table = 'lab_aux_tables';

  @field('project_id') projectId!: string;
  /** Identificador del grupo/tabla, ej. 'taras'. Único por proyecto. */
  @field('group_key') groupKey!: string;
  @field('name') name!: string | null;
  @field('columns_json') columnsJson!: string;
  @field('rows_json') rowsJson!: string;
  @field('last_calibration_at') lastCalibrationAt!: number | null;
  @field('next_calibration_at') nextCalibrationAt!: number | null;

  @readonly @date('created_at') createdAt!: Date;
  @readonly @date('updated_at') updatedAt!: Date;
}
