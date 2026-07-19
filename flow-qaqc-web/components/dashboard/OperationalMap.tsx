'use client';

/**
 * OperationalMap — Mapa operativo del dashboard POR PROYECTO: ortofoto +
 * polígonos de sectores + pines de ensayos coloreados por estado (popup con
 * "Abrir ensayo"). Wrapper de datos sobre SectorMap (cargado ssr:false —
 * Leaflet toca `window`).
 *
 * Si el proyecto no tiene NADA de geo (sin pines, sin sectores con polígono,
 * sin ortofoto) el padre debe pasar `showPlaceholder` y aquí se pinta la
 * tarjeta con CTA a Geolocalización en lugar del mapa (el dashboard no se
 * rompe para proyectos sin GIS).
 */

import { useMemo } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Map as MapIcon } from 'lucide-react';
import { useI18n, tx } from '@lib/i18n';
import { cn } from '@lib/utils';
import { colorForStatus, protocolCoord } from '@lib/dashboardUtils';
import { buildOrthophotoSources } from '@lib/orthophoto';
import type { MapMarker, MapSector } from '@components/sectors/SectorMap';
import type { SectorRow } from '@hooks/useFileUpload';
import type { Protocol, Project, Location } from '@/types';

// v94 — motor GL (MapLibre: basemap oscuro + 3D + animaciones). Leaflet queda
// solo en SectoresTab. Los tipos de datos siguen viviendo en SectorMap.
const GLMap = dynamic(() => import('@components/map/GLMap'), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-full min-h-[240px] bg-surface rounded-xl text-xs text-gray-400">
      {tx('webDash.mapLoading')}
    </div>
  ),
});

export default function OperationalMap({
  protocols, sectors, project, locMap, projectId, showPlaceholder, className,
}: {
  protocols: Protocol[];
  sectors: SectorRow[];
  project: Project | undefined;
  locMap: Record<string, Location>;
  projectId: string;
  showPlaceholder: boolean;
  className?: string;
}) {
  const { t } = useI18n();
  const router = useRouter();

  const statusLabel = (s: string) =>
    s === 'APPROVED' ? t('webDash.statusApproved')
    : s === 'REJECTED' ? t('webDash.statusRejected')
    : s === 'SUBMITTED' ? t('webDash.statusSubmittedShort')
    : t('webDash.statusDraftShort');

  const markers = useMemo<MapMarker[]>(() => {
    const out: MapMarker[] = [];
    for (const p of protocols) {
      const c = protocolCoord(p);
      if (!c) continue;
      const loc = p.location_id ? locMap[p.location_id] : null;
      out.push({
        id: p.id,
        lat: c.lat,
        lng: c.lng,
        color: colorForStatus(p.status),
        label: p.protocol_code ?? p.protocol_number ?? p.id,
        sublabel: loc?.name ?? p.location_reference ?? undefined,
        statusLabel: statusLabel(p.status),
        href: p.status === 'DRAFT' || p.status === 'IN_PROGRESS'
          ? `/app/projects/${projectId}/protocols/${p.id}/fill`
          : `/app/projects/${projectId}/protocols/${p.id}/audit`,
      });
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [protocols, locMap, projectId]);

  const mapSectors = useMemo<MapSector[]>(
    () => sectors
      .filter(s => Array.isArray(s.points_json) && s.points_json.length >= 3)
      .map(s => ({
        id: s.id,
        name: s.name,
        color: s.display_color ?? '#1976D2',
        points: s.points_json as { lat: number; lng: number }[],
      })),
    [sectors],
  );

  const orthophotos = useMemo(
    () => buildOrthophotoSources(project),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [project?.orthophoto_tiles_json, project?.orthophoto_s3_key, project?.orthophoto_bounds_json, project?.updated_at],
  );

  if (showPlaceholder) {
    return (
      <div className={cn('bg-white rounded-xl shadow-subtle flex flex-col items-center justify-center gap-3 p-6 text-center', className)}>
        <div className="w-14 h-14 rounded-full bg-light flex items-center justify-center">
          <MapIcon className="w-7 h-7 text-primary" />
        </div>
        <p className="text-sm font-bold text-navy">{t('webDash.mapNoGeoTitle')}</p>
        <p className="text-xs text-gray-500 max-w-sm">{t('webDash.mapNoGeoBody')}</p>
        <Link
          href={`/app/projects/${projectId}/file-upload?tab=sectores`}
          className="mt-1 px-4 py-2 rounded-lg bg-primary text-white text-xs font-bold hover:bg-primary/90 transition-colors"
        >
          {t('webDash.mapNoGeoCta')}
        </Link>
      </div>
    );
  }

  return (
    // z-0 + isolate: los panes internos de Leaflet (z ~1000) quedan atrapados en
    // este stacking context y no flotan sobre los modales fixed z-50 de los charts.
    <div className={cn('relative z-0 isolate bg-white rounded-xl shadow-subtle overflow-hidden', className)}>
      <GLMap
        sectors={mapSectors}
        orthophotos={orthophotos}
        markers={markers}
        onMarkerNavigate={(href) => router.push(href)}
        height="100%"
      />
    </div>
  );
}
