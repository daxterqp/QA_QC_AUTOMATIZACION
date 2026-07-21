/**
 * useDashboardData — Compositor de datos del dashboard POR PROYECTO.
 * NO lanza queries nuevas de protocolos: compone las cachés React Query que el
 * dashboard ya pagaba (useHistorical*) + sectores + proyecto, y deriva
 * KPIs/filtrados client-side con la fórmula v31 compartida (dashboardUtils).
 *
 * Filtros: fecha + especialidad + sector afectan KPIs y charts; `status` SOLO
 * afecta los pines del mapa (los charts necesitan la composición completa de
 * estados para tener sentido).
 */

import { useMemo } from 'react';
import {
  useHistoricalProtocols,
  useHistoricalLocations,
  useHistoricalAnnotations,
} from './useHistorical';
import { useProjectSectors } from './useFileUpload';
import { sectorsForDate } from '@lib/sectorSets';
import { useProjects } from './useProjects';
import { computeTotalExpected, protocolCoord } from '@lib/dashboardUtils';
import { buildOrthophotoSources } from '@lib/orthophoto';
import type { Location, PlanAnnotation, Protocol } from '@/types';

export interface DashboardFiltersState {
  dateFrom: string;   // 'YYYY-MM-DD' | ''
  dateTo: string;     // 'YYYY-MM-DD' | ''
  specialty: string;  // '' = todas
  sectorId: string;   // '' = todos
  status: string;     // '' | DRAFT | SUBMITTED | APPROVED | REJECTED (solo mapa)
}

export const EMPTY_DASHBOARD_FILTERS: DashboardFiltersState = {
  dateFrom: '', dateTo: '', specialty: '', sectorId: '', status: '',
};

export interface DashboardKpis {
  total: number;
  approved: number;
  rejected: number;
  pendingReview: number;
  obsOpen: number;
  obsClosed: number;
  totalExpected: number;
  progressPercent: number;
}

export function useDashboardData(projectId: string, filters: DashboardFiltersState) {
  const { data: projects = [] } = useProjects();
  const { data: protocols = [], isLoading: loadingP } = useHistoricalProtocols(projectId);
  const { data: locations = [], isLoading: loadingL } = useHistoricalLocations(projectId);
  const { data: annotations = [] } = useHistoricalAnnotations(projectId);
  const { data: sectors = [] } = useProjectSectors(projectId);

  const project = projects.find(p => p.id === projectId);

  const locMap = useMemo(() => {
    const m: Record<string, Location> = {};
    locations.forEach(l => { m[l.id] = l; });
    return m;
  }, [locations]);

  const specialties = useMemo(
    () => Array.from(new Set(locations.map(l => l.specialty).filter(Boolean) as string[])),
    [locations],
  );

  // v102 — el dashboard muestra el juego de sectores VIGENTE hoy (los juegos
  // anteriores quedan congelados para los ensayos de su periodo).
  const vigenteSectors = useMemo(() => sectorsForDate(sectors, null), [sectors]);
  const sectorOptions = useMemo(
    () => vigenteSectors.map(s => ({ id: s.id, name: s.name })),
    [vigenteSectors],
  );

  const fromMs = filters.dateFrom ? new Date(filters.dateFrom + 'T00:00:00').getTime() : null;
  const toMs   = filters.dateTo   ? new Date(filters.dateTo   + 'T23:59:59').getTime() : null;

  // Fecha + especialidad + sector → base de KPIs y charts.
  const filteredProtocols = useMemo(() => {
    const specLocIds = filters.specialty
      ? new Set(locations.filter(l => l.specialty === filters.specialty).map(l => l.id))
      : null;
    return protocols.filter(p => {
      if (fromMs || toMs) {
        const ts = new Date(p.updated_at).getTime();
        if (fromMs && ts < fromMs) return false;
        if (toMs && ts > toMs) return false;
      }
      if (specLocIds && !(p.location_id != null && specLocIds.has(p.location_id))) return false;
      if (filters.sectorId && p.sector_id !== filters.sectorId) return false;
      return true;
    });
  }, [protocols, locations, fromMs, toMs, filters.specialty, filters.sectorId]);

  // + estado → SOLO pines del mapa.
  const mapProtocols = useMemo(() => {
    if (!filters.status) return filteredProtocols;
    return filteredProtocols.filter(p => filters.status === 'DRAFT'
      ? (p.status === 'DRAFT' || p.status === 'IN_PROGRESS')
      : p.status === filters.status);
  }, [filteredProtocols, filters.status]);

  const filteredAnnotations = useMemo(() => {
    if (!fromMs && !toMs) return annotations;
    return annotations.filter((a: PlanAnnotation) => {
      const ts = new Date(a.created_at).getTime();
      if (fromMs && ts < fromMs) return false;
      if (toMs && ts > toMs) return false;
      return true;
    });
  }, [annotations, fromMs, toMs]);

  const kpis = useMemo<DashboardKpis>(() => {
    const approved = filteredProtocols.filter(p => p.status === 'APPROVED').length;
    const rejected = filteredProtocols.filter(p => p.status === 'REJECTED').length;
    const pendingReview = filteredProtocols.filter(p => p.status === 'SUBMITTED').length;
    const obsOpen = filteredAnnotations.filter((a: PlanAnnotation) => a.status === 'OPEN').length;
    const obsClosed = filteredAnnotations.filter((a: PlanAnnotation) => a.status === 'CLOSED').length;
    // Avance de obra: sobre el set COMPLETO (no depende del filtro de fecha) —
    // v31: solo aprobados location-bound cuentan contra el esperado.
    const totalExpected = computeTotalExpected(locations);
    const approvedLocationBound = protocols.filter(
      (p: Protocol) => p.status === 'APPROVED' && p.location_id != null,
    ).length;
    const progressPercent = totalExpected > 0
      ? Math.round((approvedLocationBound / totalExpected) * 100)
      : 0;
    return {
      total: filteredProtocols.length,
      approved, rejected, pendingReview, obsOpen, obsClosed,
      totalExpected, progressPercent,
    };
  }, [filteredProtocols, filteredAnnotations, protocols, locations]);

  // ¿Hay ALGO que pintar en el mapa? (pines, polígonos de sector u ortofoto)
  const hasGeo = useMemo(() => {
    if (protocols.some(p => protocolCoord(p) != null)) return true;
    if (sectors.some(s => Array.isArray(s.points_json) && s.points_json.length >= 3)) return true;
    return buildOrthophotoSources(project).length > 0;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [protocols, sectors, project?.orthophoto_tiles_json, project?.orthophoto_s3_key, project?.orthophoto_bounds_json]);

  const projectStart = useMemo(() => {
    if (!project) return null;
    const ts = new Date(project.created_at).getTime();
    return ts > 0 ? new Date(ts) : null;
  }, [project]);

  return {
    project,
    projectStart,
    protocols,
    locations,
    sectors: vigenteSectors, // v102 — el mapa dibuja el juego vigente
    filteredProtocols,
    mapProtocols,
    filteredAnnotations,
    kpis,
    specialties,
    sectorOptions,
    locMap,
    hasGeo,
    isLoading: loadingP || loadingL,
  };
}
