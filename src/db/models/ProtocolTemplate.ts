import { Model } from '@nozbe/watermelondb';
import { field, date, readonly, children } from '@nozbe/watermelondb/decorators';
import type ProtocolTemplateItem from './ProtocolTemplateItem';

export default class ProtocolTemplate extends Model {
  static table = 'protocol_templates';

  static associations = {
    projects: { type: 'belongs_to' as const, key: 'project_id' },
    protocol_template_items: { type: 'has_many' as const, foreignKey: 'template_id' },
  };

  @field('project_id') projectId!: string;
  /** ID único del Excel, ej: "1", "C1", "CIM-001" */
  @field('id_protocolo') idProtocolo!: string;
  /** Nombre del protocolo, ej: "PROTOCOLO DE CIMENTACIÓN" */
  @field('name') name!: string;
  /** v38 — config de Tabla Resumen (hoja RESUMEN del Excel), JSON string. */
  @field('summary_config_json') summaryConfigJson!: string | null;
  /** v39 — tipo de ensayo oculto: no creable, pero sus registros siguen visibles. */
  @field('is_hidden') isHidden!: boolean | null;

  @readonly @date('created_at') createdAt!: Date;
  @readonly @date('updated_at') updatedAt!: Date;

  @children('protocol_template_items') items!: ProtocolTemplateItem[];
}
