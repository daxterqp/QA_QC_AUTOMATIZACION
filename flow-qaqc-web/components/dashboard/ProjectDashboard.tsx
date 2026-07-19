'use client';

/**
 * ProjectDashboard — Dashboard POR PROYECTO estilo "Power BI territorial":
 * filtros arriba, KPIs grandes a la izquierda, MAPA operativo protagonista al
 * centro (ortofoto + sectores + pines de ensayos), panel de control a la
 * derecha (donut de avance + especialidades + semanal) y análisis abajo.
 *
 * Lo montan /app/dashboard (drill-down del portafolio, con onBack) y
 * /app/projects/[id]/historical — una sola fuente de verdad.
 */

import { useMemo, useState } from 'react';
import {
  Loader2, ArrowLeft, ClipboardList, TrendingUp, CheckCircle2, Clock, AlertTriangle,
} from 'lucide-react';
import { useI18n } from '@lib/i18n';
import { useDashboardData, EMPTY_DASHBOARD_FILTERS, type DashboardFiltersState } from '@hooks/useDashboardData';
import { DASH_COLORS, computeTotalExpected } from '@lib/dashboardUtils';
import DashboardFilters from './DashboardFilters';
import KpiTile from './KpiTile';
import ProgressDonut from './ProgressDonut';
import OperationalMap from './OperationalMap';
import AnalysisCard from './AnalysisCard';
import WeeklyBarChart from './WeeklyBarChart';
import SpecialtyBarChart from './SpecialtyBarChart';
import NotesSection from './NotesSection';

export default function ProjectDashboard({
  projectId, onBack,
}: {
  projectId: string;
  /** Presente en el drill-down del portafolio: pinta el chip "← Portafolio". */
  onBack?: () => void;
}) {
  const { t } = useI18n();
  const [filters, setFilters] = useState<DashboardFiltersState>(EMPTY_DASHBOARD_FILTERS);
  const patchFilters = (patch: Partial<DashboardFiltersState>) =>
    setFilters(prev => ({ ...prev, ...patch }));

  const {
    project, projectStart, locations, sectors,
    filteredProtocols, mapProtocols, kpis,
    specialties, sectorOptions, locMap, hasGeo, isLoading,
  } = useDashboardData(projectId, filters);

  // El badge "X/Y" del gráfico semanal respeta el filtro de especialidad
  // (antes lo hacían sus chips internos, hoy lifteados a DashboardFilters).
  const expectedForFilter = useMemo(() => {
    if (!filters.specialty) return kpis.totalExpected;
    return computeTotalExpected(locations.filter(l => l.specialty === filters.specialty));
  }, [filters.specialty, locations, kpis.totalExpected]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {onBack && (
        <button
          onClick={onBack}
          className="self-start flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white shadow-subtle
                     text-xs font-bold text-primary hover:shadow-card transition-shadow"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          {t('webDash.backToPortfolio')}
        </button>
      )}

      <DashboardFilters
        filters={filters}
        onChange={patchFilters}
        specialties={specialties}
        sectorOptions={sectorOptions}
      />

      {/* ── Grid principal: KPIs · MAPA · panel de control ── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* IZQ — KPIs (2 col en pantallas chicas, apilados en lg+) */}
        <div className="order-2 lg:order-1 lg:col-span-3 xl:col-span-2 grid grid-cols-2 lg:grid-cols-1 gap-3 auto-rows-min">
          <KpiTile label={t('webDash.kpiTotalTests')} value={kpis.total} icon={ClipboardList} />
          <KpiTile
            label={t('webDash.kpiProgress')}
            value={kpis.totalExpected > 0 ? `${kpis.progressPercent}%` : '—'}
            sub={t('webDash.kpiOfExpected', { done: kpis.approved, total: kpis.totalExpected })}
            icon={TrendingUp}
          />
          <KpiTile label={t('webDash.approved')} value={kpis.approved} icon={CheckCircle2}
            tone="success" href={`/app/projects/${projectId}/dossier`} />
          <KpiTile label={t('webDash.kpiPendingReview')} value={kpis.pendingReview} icon={Clock}
            tone="warning" href={`/app/projects/${projectId}/dossier`} />
          <KpiTile label={t('webDash.kpiOpenObs')} value={kpis.obsOpen} icon={AlertTriangle}
            tone={kpis.obsOpen > 0 ? 'danger' : 'default'}
            href={`/app/projects/${projectId}/observations`} />
        </div>

        {/* CENTRO — MAPA operativo protagonista */}
        <div className="order-1 lg:order-2 lg:col-span-6 xl:col-span-7">
          <OperationalMap
            protocols={mapProtocols}
            sectors={sectors}
            project={project}
            locMap={locMap}
            projectId={projectId}
            showPlaceholder={!hasGeo}
            className={hasGeo ? 'h-[420px] lg:h-[62vh] lg:min-h-[480px]' : 'h-full min-h-[300px]'}
          />
        </div>

        {/* DER — panel de control */}
        <div className="order-3 lg:col-span-3 flex flex-col gap-3">
          <ProgressDonut
            percent={kpis.progressPercent}
            totalExpected={kpis.totalExpected}
            approvedExpectedLabel={t('webDash.kpiOfExpected', { done: kpis.approved, total: kpis.totalExpected })}
          />
          {locations.length > 0 && (
            <SpecialtyBarChart
              protocols={filteredProtocols}
              locations={locations}
              projectId={projectId}
              compact
            />
          )}
          {projectStart && (
            <WeeklyBarChart
              protocols={filteredProtocols}
              projectStart={projectStart}
              locMap={locMap}
              projectId={projectId}
              totalExpected={expectedForFilter}
              compact
            />
          )}
        </div>
      </div>

      {/* ── Fila inferior: análisis + anotaciones ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        <AnalysisCard
          title={t('webDash.approvedVsRejected')}
          a={kpis.approved} b={kpis.rejected}
          labelA={t('webDash.approved')} labelB={t('webDash.rejected')}
          colorA={DASH_COLORS.success} colorB={DASH_COLORS.danger}
          href={`/app/projects/${projectId}/dossier`}
        />
        <AnalysisCard
          title={t('webDash.obsOpenVsClosed')}
          a={kpis.obsOpen} b={kpis.obsClosed}
          labelA={t('webDash.obsOpen')} labelB={t('webDash.obsClosed')}
          colorA={DASH_COLORS.warning} colorB={DASH_COLORS.secondary}
        />
        <div className="md:col-span-2 xl:col-span-1">
          <NotesSection projectId={projectId} />
        </div>
      </div>
    </div>
  );
}
