'use client';

/**
 * PortfolioDashboard — Vista GENERAL del dashboard (todas las obras) con
 * drill-down: mapa protagonista con una BURBUJA por obra (color + % de avance
 * según protocolos aprobados), KPIs agregados a la izquierda y ranking "Avance
 * por proyecto" a la derecha. Clic en burbuja o fila → flyTo animado (el zoom)
 * → se monta el ProjectDashboard de esa obra con "← Portafolio" para volver.
 */

import { useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import {
  Loader2, Building2, ClipboardList, TrendingUp, Clock, AlertTriangle, MapPinOff, Map as MapIcon,
} from 'lucide-react';
import { useI18n, tx } from '@lib/i18n';
import { usePortfolioData } from '@hooks/usePortfolioData';
import { PROGRESS_BUCKET_COLORS } from '@lib/dashboardUtils';
import type { LeafletBounds } from '@lib/orthophoto';
import KpiTile from './KpiTile';
import ProjectDashboard from './ProjectDashboard';

const SectorMap = dynamic(() => import('@components/sectors/SectorMap'), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-full min-h-[240px] bg-surface rounded-xl text-xs text-gray-400">
      {tx('webDash.mapLoading')}
    </div>
  ),
});

/** Duración del flyTo (0.8s en SectorMap) + margen antes de montar el detalle. */
const FLY_MS = 900;

export default function PortfolioDashboard() {
  const { t } = useI18n();
  const { projects, bubbles, ranking, boundsByProject, kpis, isLoading } = usePortfolioData();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [flyBounds, setFlyBounds] = useState<LeafletBounds | null>(null);
  const flyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (flyTimer.current) clearTimeout(flyTimer.current); }, []);

  function openProject(id: string) {
    if (flyTimer.current) clearTimeout(flyTimer.current);
    const b = boundsByProject[id];
    if (!b) {
      // Obra sin geo: drill-down directo sin animación.
      setSelectedId(id);
      setFlyBounds(null);
      return;
    }
    setFlyBounds(b);
    flyTimer.current = setTimeout(() => {
      setSelectedId(id);
      setFlyBounds(null);
    }, FLY_MS);
  }

  function backToPortfolio() {
    if (flyTimer.current) clearTimeout(flyTimer.current);
    setSelectedId(null);
    setFlyBounds(null);
  }

  // ── Drill-down: el dashboard de la obra elegida (su mapa abre ya encuadrado) ──
  if (selectedId) {
    return <ProjectDashboard key={selectedId} projectId={selectedId} onBack={backToPortfolio} />;
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  if (projects.length === 0) {
    return (
      <div className="bg-white rounded-xl shadow-subtle p-6 text-center text-sm text-gray-400">
        {t('webDash.noProjects')}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
      {/* IZQ — KPIs agregados del portafolio */}
      <div className="order-2 lg:order-1 lg:col-span-3 xl:col-span-2 grid grid-cols-2 lg:grid-cols-1 gap-3 auto-rows-min">
        <KpiTile label={t('webDash.kpiProjects')} value={kpis.projectCount} icon={Building2} />
        <KpiTile label={t('webDash.kpiTotalTests')} value={kpis.totalTests} icon={ClipboardList} />
        <KpiTile label={t('webDash.kpiAvgProgress')} value={`${kpis.avgProgress}%`} icon={TrendingUp} />
        <KpiTile label={t('webDash.kpiPendingReview')} value={kpis.pendingReview} icon={Clock} tone="warning" />
        <KpiTile label={t('webDash.kpiOpenObs')} value={kpis.obsOpen} icon={AlertTriangle}
          tone={kpis.obsOpen > 0 ? 'danger' : 'default'} />
      </div>

      {/* CENTRO — mapa de portafolio (burbujas por obra) */}
      <div className="order-1 lg:order-2 lg:col-span-6 xl:col-span-7">
        {bubbles.length === 0 ? (
          <div className="bg-white rounded-xl shadow-subtle h-full min-h-[300px] flex flex-col items-center justify-center gap-3 p-6 text-center">
            <div className="w-14 h-14 rounded-full bg-light flex items-center justify-center">
              <MapIcon className="w-7 h-7 text-primary" />
            </div>
            <p className="text-sm font-bold text-navy">{t('webDash.portfolioNoGeoTitle')}</p>
            <p className="text-xs text-gray-500 max-w-sm">{t('webDash.portfolioNoGeoBody')}</p>
          </div>
        ) : (
          // z-0 + isolate: los panes de Leaflet no flotan sobre modales.
          <div className="relative z-0 isolate bg-white rounded-xl shadow-subtle overflow-hidden h-[420px] lg:h-[62vh] lg:min-h-[480px]">
            <SectorMap
              sectors={[]}
              bubbles={bubbles}
              onBubbleClick={openProject}
              focusBounds={flyBounds}
              height="100%"
            />
          </div>
        )}
      </div>

      {/* DER — ranking "Avance por proyecto" (clic = mismo drill-down) */}
      <div className="order-3 lg:col-span-3 flex flex-col gap-3">
        <div className="bg-white rounded-xl shadow-subtle p-4 flex flex-col gap-1.5">
          <p className="text-xs font-bold text-gray-700 mb-1">{t('webDash.rankingTitle')}</p>
          {ranking.map(r => (
            <button
              key={r.id}
              onClick={() => openProject(r.id)}
              className="flex flex-col gap-1 p-1.5 -mx-1.5 rounded-lg hover:bg-light text-left transition-colors"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-navy truncate flex items-center gap-1.5 min-w-0">
                  {!r.hasGeo && (
                    <MapPinOff className="w-3 h-3 text-gray-400 shrink-0" aria-label={t('webDash.noLocation')} />
                  )}
                  <span className="truncate">{r.name}</span>
                </span>
                <span className="text-xs font-bold text-navy shrink-0">
                  {r.totalExpected > 0 ? `${r.percent}%` : '—'}
                </span>
              </div>
              <div className="h-2 rounded-full bg-surface overflow-hidden">
                <div
                  className="h-full rounded-full transition-[width] duration-300 ease-smooth-in-out"
                  style={{
                    width: `${Math.min(Math.max(r.percent, r.totalExpected > 0 ? 2 : 0), 100)}%`,
                    backgroundColor: PROGRESS_BUCKET_COLORS[r.bucket],
                  }}
                />
              </div>
              <span className="text-[10px] text-gray-400">
                {r.totalExpected > 0
                  ? t('webDash.kpiOfExpected', { done: r.approved, total: r.totalExpected })
                  : t('webDash.testCountMany', { n: r.totalTests })}
              </span>
            </button>
          ))}
          <p className="text-[10px] text-gray-400 mt-1">{t('webDash.rankingHint')}</p>
        </div>
      </div>
    </div>
  );
}
