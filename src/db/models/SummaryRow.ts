import { Model } from '@nozbe/watermelondb';
import { field, date, readonly } from '@nozbe/watermelondb/decorators';

/**
 * SummaryRow (v37) — Una fila por ENSAYO para el módulo "Tablas Resumen".
 * Se construye/actualiza al guardar el ensayo (no se recalcula en masa). La
 * vista de Tablas Resumen solo lee y ordena por código. `valuesJson` mapea
 * columna → valor según la config embebida en la plantilla (hoja RESUMEN).
 */
export default class SummaryRow extends Model {
  static table = 'summary_rows';

  @field('project_id') projectId!: string;
  @field('template_id') templateId!: string | null;
  @field('protocol_id') protocolId!: string;
  @field('protocol_code') protocolCode!: string | null;
  @field('protocol_number') protocolNumber!: string | null;
  @field('ensayo_date') ensayoDate!: string | null;
  @field('sector_id') sectorId!: string | null;
  @field('sector_name') sectorName!: string | null;
  @field('location_id') locationId!: string | null;
  @field('location_name') locationName!: string | null;
  @field('status') status!: string | null;
  /** JSON: { "<colKey>": valor, ... } */
  @field('values_json') valuesJson!: string | null;

  @readonly @date('created_at') createdAt!: Date;
  @readonly @date('updated_at') updatedAt!: Date;
}
