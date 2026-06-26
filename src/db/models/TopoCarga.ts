import { Model } from '@nozbe/watermelondb';
import { field, date, readonly } from '@nozbe/watermelondb/decorators';

/**
 * TopoCarga (v44) — Una CARGA de datos topográficos (tarjeta del módulo).
 *
 * `rowsJson` es la FUENTE DE VERDAD: snapshot de las filas subidas por **código**
 * de ensayo (`[{code, c1, c2, cota, custom:{colId:value}}]`). Se conservan aunque
 * el ensayo aún no exista → binding diferido (se enlazan al protocolo cuando aparece).
 * `columnsJson` = layout de columnas activo al momento de subir. Código `T<ddmmaa>-<seq>`.
 *
 * JSON locales como string (jsonb en Supabase — parsear antes del push, igual que
 * `xref_snapshot_json`).
 */
export default class TopoCarga extends Model {
  static table = 'topo_cargas';

  @field('project_id') projectId!: string;
  @field('carga_code') cargaCode!: string;
  @field('seq') seq!: number | null;
  @field('carga_date') cargaDate!: string | null;       // YYYY-MM-DD
  @field('input_method') inputMethod!: string | null;   // 'manual' | 'csv'
  @field('created_by_id') createdById!: string | null;
  @field('upload_status') uploadStatus!: string | null;
  @field('applied_at') appliedAt!: number | null;
  @field('rows_json') rowsJson!: string;
  @field('columns_json') columnsJson!: string | null;

  @readonly @date('created_at') createdAt!: Date;
  @readonly @date('updated_at') updatedAt!: Date;
}
