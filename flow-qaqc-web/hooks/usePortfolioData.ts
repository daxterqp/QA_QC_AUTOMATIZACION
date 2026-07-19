/**
 * usePortfolioData — Datos del dashboard GENERAL (portafolio de obras).
 *
 * - Métricas por obra: useQueries con fetchProjectMetrics y la MISMA queryKey
 *   ['project-metrics', id] que usa la lista de proyectos → caché compartida.
 * - Posición geográfica por obra (projects NO tiene lat/lng propia): se DERIVA
 *   con prioridad centroide de ortofoto → centroide de sectores → promedio de
 *   coords de sus ensayos. Obras sin nada de geo van a `sinUbicacion`.
 */

import { useMemo } from 'react';
import { useQueries, useQuery } from '@tanstack/react-query';
import { createClient } from '@lib/supabase/client';
import { fetchAllPages } from '@lib/pagedFetch';
import { useProjects } from './useProjects';
import { fetchProjectMetrics, type ProjectMetrics } from './useProjectMetrics';
import { progressBucket, type ProgressBucket } from '@lib/dashboardUtils';
import { normalizeBounds, buildOrthophotoSources, type LeafletBounds } from '@lib/orthophoto';
import type { Project } from '@/types';

const supabase = createClient();

interface ProjectGeo {
  pos: { lat: number; lng: number } | null;
  bounds: LeafletBounds | null;
}

const finiteCoord = (lat: number, lng: number) =>
  Number.isFinite(lat) && Number.isFinite(lng) && !(lat === 0 && lng === 0);

function bboxOf(lats: number[], lngs: number[]): LeafletBounds | null {
  if (lats.length === 0) return null;
  return [
    [Math.min(...lats), Math.min(...lngs)],
    [Math.max(...lats), Math.max(...lngs)],
  ];
}

const center = (b: LeafletBounds) => ({
  lat: (b[0][0] + b[1][0]) / 2,
  lng: (b[0][1] + b[1][1]) / 2,
});

/** Deriva posición+bounds por obra. Una query de sectores para TODO el
 *  portafolio + una de coords de ensayos solo para las obras aún sin posición. */
async function fetchPortfolioGeo(projects: Project[]): Promise<Record<string, ProjectGeo>> {
  const geo: Record<string, ProjectGeo> = {};
  const ids = projects.map(p => p.id);

  // 1. Ortofoto (ya viene en la fila del proyecto): bbox combinado de teselas.
  for (const p of projects) {
    const lats: number[] = [];
    const lngs: number[] = [];
    for (const src of buildOrthophotoSources(p)) {
      const b = normalizeBounds(src.bounds);
      if (b) { lats.push(b[0][0], b[1][0]); lngs.push(b[0][1], b[1][1]); }
    }
    const bbox = bboxOf(lats, lngs);
    geo[p.id] = bbox ? { pos: center(bbox), bounds: bbox } : { pos: null, bounds: null };
  }

  // 2. Sectores con polígono (una query paginada para todo el portafolio).
  if (ids.length > 0) {
    try {
      const rows = await fetchAllPages<{ project_id: string; points_json: { lat: number; lng: number }[] | null }>(
        (f, t) => supabase
          .from('project_sectors')
          .select('project_id, points_json')
          .in('project_id', ids)
          .order('id', { ascending: true })
          .range(f, t),
      );
      const byProject: Record<string, { lats: number[]; lngs: number[] }> = {};
      for (const r of rows) {
        if (!Array.isArray(r.points_json)) continue;
        const acc = (byProject[r.project_id] ??= { lats: [], lngs: [] });
        for (const pt of r.points_json) {
          if (pt && finiteCoord(pt.lat, pt.lng)) { acc.lats.push(pt.lat); acc.lngs.push(pt.lng); }
        }
      }
      for (const [pid, acc] of Object.entries(byProject)) {
        if (geo[pid]?.pos) continue; // la ortofoto manda
        const bbox = bboxOf(acc.lats, acc.lngs);
        if (bbox) geo[pid] = { pos: center(bbox), bounds: bbox };
      }
    } catch { /* sin sectores → siguiente fallback */ }
  }

  // 3. Fallback: promedio de coords de ensayos (solo obras aún sin posición).
  const missing = ids.filter(id => !geo[id]?.pos);
  if (missing.length > 0) {
    try {
      const { data } = await supabase
        .from('protocols')
        .select('project_id, latitude, longitude')
        .in('project_id', missing)
        .not('latitude', 'is', null)
        .not('longitude', 'is', null)
        .limit(1000);
      const byProject: Record<string, { lats: number[]; lngs: number[] }> = {};
      for (const r of (data ?? []) as { project_id: string; latitude: number; longitude: number }[]) {
        if (!finiteCoord(r.latitude, r.longitude)) continue;
        const acc = (byProject[r.project_id] ??= { lats: [], lngs: [] });
        acc.lats.push(r.latitude); acc.lngs.push(r.longitude);
      }
      for (const [pid, acc] of Object.entries(byProject)) {
        if (acc.lats.length === 0) continue;
        const lat = acc.lats.reduce((a, b) => a + b, 0) / acc.lats.length;
        const lng = acc.lngs.reduce((a, b) => a + b, 0) / acc.lngs.length;
        // Bounds mínimo alrededor del punto (~300 m) para que el flyTo tenga destino.
        geo[pid] = { pos: { lat, lng }, bounds: [[lat - 0.003, lng - 0.003], [lat + 0.003, lng + 0.003]] };
      }
    } catch { /* sin coords → la obra queda en sinUbicacion */ }
  }

  return geo;
}

export interface PortfolioBubbleData {
  id: string;
  lat: number;
  lng: number;
  percent: number;
  bucket: ProgressBucket;
  name: string;
  sub?: string;
}

export interface PortfolioRankingRow {
  id: string;
  name: string;
  percent: number;
  bucket: ProgressBucket;
  approved: number;
  totalExpected: number;
  totalTests: number;
  hasGeo: boolean;
}

export interface PortfolioKpis {
  projectCount: number;
  totalTests: number;
  avgProgress: number;     // ponderado por esperados
  pendingReview: number;
  obsOpen: number;
}

export function usePortfolioData() {
  const { data: projects = [], isLoading: loadingProjects } = useProjects();

  // Refetch de geo cuando cambia CUALQUIER fila de proyecto (ej. suben ortofoto).
  const geoKey = useMemo(
    () => projects.map(p => `${p.id}:${p.updated_at ?? ''}`).join('|'),
    [projects],
  );

  const { data: geo = {}, isLoading: loadingGeo } = useQuery({
    queryKey: ['portfolio-geo', geoKey],
    queryFn: () => fetchPortfolioGeo(projects),
    enabled: projects.length > 0,
    staleTime: 60 * 1000,
  });

  // Misma queryKey que useProjectMetrics → caché compartida con la lista.
  const metricsQueries = useQueries({
    queries: projects.map(p => ({
      queryKey: ['project-metrics', p.id],
      queryFn: () => fetchProjectMetrics(p.id),
      staleTime: 30 * 1000,
    })),
  });

  // Dep estable (un string) — un spread de N resultados cambiaría el TAMAÑO del
  // array de deps entre renders y React lo prohíbe.
  const metricsStamp = metricsQueries.map(q => q.dataUpdatedAt ?? 0).join(',');

  const combined = useMemo(() => {
    const bubbles: PortfolioBubbleData[] = [];
    const ranking: PortfolioRankingRow[] = [];
    const sinUbicacion: PortfolioRankingRow[] = [];
    const boundsByProject: Record<string, LeafletBounds> = {};

    let totalTests = 0, pendingReview = 0, obsOpen = 0;
    let expectedSum = 0, weightedProgress = 0;

    projects.forEach((p, i) => {
      const m: ProjectMetrics | undefined = metricsQueries[i]?.data;
      const g = geo[p.id];
      const percent = m?.progressPercent ?? 0;
      const totalExpected = m?.totalExpected ?? 0;
      const bucket = progressBucket(percent, totalExpected);

      totalTests += m?.totalProtocols ?? 0;
      pendingReview += m?.pendingReview ?? 0;
      obsOpen += m?.openObservations ?? 0;
      if (totalExpected > 0) {
        expectedSum += totalExpected;
        weightedProgress += percent * totalExpected;
      }

      const row: PortfolioRankingRow = {
        id: p.id,
        name: p.name,
        percent,
        bucket,
        approved: m?.approvedProtocols ?? 0,
        totalExpected,
        totalTests: m?.totalProtocols ?? 0,
        hasGeo: !!g?.pos,
      };
      ranking.push(row);

      if (g?.pos) {
        if (g.bounds) boundsByProject[p.id] = g.bounds;
        bubbles.push({
          id: p.id,
          lat: g.pos.lat,
          lng: g.pos.lng,
          percent,
          bucket,
          name: p.name,
          sub: totalExpected > 0 ? `${m?.approvedProtocols ?? 0}/${totalExpected}` : undefined,
        });
      } else {
        sinUbicacion.push(row);
      }
    });

    ranking.sort((a, b) => b.percent - a.percent || a.name.localeCompare(b.name));

    const kpis: PortfolioKpis = {
      projectCount: projects.length,
      totalTests,
      avgProgress: expectedSum > 0 ? Math.round(weightedProgress / expectedSum) : 0,
      pendingReview,
      obsOpen,
    };

    return { bubbles, ranking, sinUbicacion, boundsByProject, kpis };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projects, geo, metricsStamp]);

  return {
    projects,
    ...combined,
    isLoading: loadingProjects || (projects.length > 0 && loadingGeo),
    metricsLoading: metricsQueries.some(q => q.isLoading),
  };
}
