import { Model } from '@nozbe/watermelondb';
import { field, date, readonly } from '@nozbe/watermelondb/decorators';

/** Sector/zona de un proyecto.
 *  - Con geometría: `pointsJson` contiene array JSON de `{lat,lng}` en WGS84.
 *    Participa en auto-asignación por GPS (point-in-polygon).
 *  - Solo nombre: `pointsJson = null`. Solo aparece en el dropdown del ensayo
 *    para selección manual. */
export default class ProjectSector extends Model {
  static table = 'project_sectors';

  static associations = {
    projects: { type: 'belongs_to' as const, key: 'project_id' },
  };

  @field('project_id') projectId!: string;
  @field('name') name!: string;
  @field('points_json') pointsJson!: string | null;
  @field('display_color') displayColor!: string | null;
  @field('source_system') sourceSystem!: string | null;
  // v29 — Orden del Excel (rowIndex+1 al importar). null para legacy.
  @field('sort_order') sortOrder!: number | null;

  @readonly @date('created_at') createdAt!: Date;
  @readonly @date('updated_at') updatedAt!: Date;

  /** Parsea `pointsJson` a array de puntos. Devuelve null si no tiene geometría
   *  o si el JSON tiene una forma inesperada (L2 — evita polígonos con NaN que
   *  rompen pointInPolygon y el croquis SVG). */
  get points(): { lat: number; lng: number }[] | null {
    if (!this.pointsJson) return null;
    try {
      const parsed = JSON.parse(this.pointsJson);
      if (!Array.isArray(parsed)) return null;
      if (!parsed.every(p => p && typeof p.lat === 'number' && typeof p.lng === 'number'
        && Number.isFinite(p.lat) && Number.isFinite(p.lng))) return null;
      return parsed;
    } catch { return null; }
  }
}
