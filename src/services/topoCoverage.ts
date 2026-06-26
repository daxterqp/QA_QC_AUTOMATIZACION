/**
 * topoCoverage.ts — carga los ensayos del proyecto con las señales de coordenadas
 * (topo / GPS) para el recuadro de cobertura y la pantalla de detalle. Espejo del
 * hook web useTopoCoverageItems.
 */
import { Q } from '@nozbe/watermelondb';
import { protocolsCollection } from '@db/index';
import { hasTopoData, type TopoCoverageItem } from '@utils/topoVisibility';

export async function loadTopoCoverageItems(projectId: string): Promise<TopoCoverageItem[]> {
  const protos = await protocolsCollection.query(Q.where('project_id', projectId)).fetch().catch(() => [] as any[]);
  return (protos as any[]).map((p) => ({
    id: p.id,
    code: (p.protocolCode ?? p.externalId ?? p.id) as string,
    hasTopo: hasTopoData({ east: p.topoCoordEast, north: p.topoCoordNorth, elevation: p.topoCoordElevation, valuesJson: p.topoValuesJson }),
    hasGps: p.latitude != null && p.longitude != null,
  }));
}
