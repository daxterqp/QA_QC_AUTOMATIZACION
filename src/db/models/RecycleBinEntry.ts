import { Model } from '@nozbe/watermelondb';
import { field, date, readonly } from '@nozbe/watermelondb/decorators';

/**
 * RecycleBinEntry (v41) — Papelera de Reciclaje.
 *
 * Copia ESTÁTICA y autocontenida de un ensayo ELIMINADO. Solo lectura; no
 * interactúa con el resto del sistema (sin FKs, sin cálculos). El `protocolCode`
 * puede repetirse (el correlativo del eliminado quedó liberado). `snapshotJson`
 * es el volcado completo (protocolo + items + evidencias + approvals + NC +
 * equipos + anotaciones + comentarios + fila de resumen).
 *
 * Se mantiene como espejo local (pull, nunca push) de la tabla Supabase
 * `recycle_bin`, para poder ver el historial sin conexión.
 */
export default class RecycleBinEntry extends Model {
  static table = 'recycle_bin';

  @field('project_id') projectId!: string;
  @field('protocol_id') protocolId!: string | null;
  @field('protocol_code') protocolCode!: string | null;
  @field('protocol_number') protocolNumber!: string | null;
  @field('template_id') templateId!: string | null;
  @field('template_name') templateName!: string | null;
  @field('location_name') locationName!: string | null;
  @field('sector_name') sectorName!: string | null;
  @field('status') status!: string | null;
  @field('ensayo_date') ensayoDate!: string | null;
  @field('snapshot_json') snapshotJson!: string;
  @field('deleted_at') deletedAt!: number;
  @field('deleted_by_id') deletedById!: string | null;
  @field('deleted_by_name') deletedByName!: string | null;

  @readonly @date('created_at') createdAt!: Date;
  @readonly @date('updated_at') updatedAt!: Date;
}
