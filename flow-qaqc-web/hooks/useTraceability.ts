/**
 * useTraceability — hooks de fetch para el módulo de trazabilidad web.
 *
 * Fetchea sesiones + intervals + catálogos del proyecto. Devuelve estructuras
 * listas para alimentar las funciones de `lib/traceabilityAggregates.ts`.
 *
 * Filtros opcionales: rango de fechas (`from`, `to` en ms epoch).
 */

import { useQuery } from '@tanstack/react-query';
import { createClient } from '@lib/supabase/client';
import type {
  WorkSession, WorkSessionInterval, Activity, WorkShift,
  WorkSessionGpsPoint, ProjectSector, User,
} from '@/types';

const supabase = createClient();

export interface TraceabilityFilter {
  from?: number; // ms epoch
  to?:   number;
}

export interface TraceabilityData {
  sessions:        WorkSession[];
  intervals:       WorkSessionInterval[];
  activities:      Activity[];
  equipment:       Array<{ id: string; code: string; name: string; type: string }>;
  shifts:          WorkShift[];
  sectors:         ProjectSector[];
  users:           User[];
}

export function useTraceability(projectId: string, filter: TraceabilityFilter = {}) {
  return useQuery({
    queryKey: ['traceability', projectId, filter.from ?? null, filter.to ?? null],
    enabled: !!projectId,
    queryFn: async (): Promise<TraceabilityData> => {
      // Sesiones — intersección de intervalos. Una sesión [started_at, ended_at|now]
      // es relevante si intersecta [from, to]. Esto incluye turnos que cruzan medianoche.
      let q = supabase.from('work_sessions').select('*').eq('project_id', projectId);
      if (filter.from != null) q = q.or(`ended_at.is.null,ended_at.gte.${filter.from}`);
      if (filter.to != null)   q = q.lte('started_at', filter.to);
      const { data: sessions, error: e1 } = await q.order('started_at', { ascending: false });
      if (e1) throw e1;
      const sessionIds = (sessions ?? []).map((s: any) => s.id);

      // Intervals (en chunks para evitar URL muy larga)
      let intervals: WorkSessionInterval[] = [];
      if (sessionIds.length > 0) {
        const CHUNK = 80;
        for (let i = 0; i < sessionIds.length; i += CHUNK) {
          const slice = sessionIds.slice(i, i + CHUNK);
          const { data, error } = await supabase
            .from('work_session_intervals').select('*').in('session_id', slice);
          if (error) throw error;
          intervals = intervals.concat((data ?? []) as WorkSessionInterval[]);
        }
      }

      // Catálogos del proyecto
      const [aRes, eRes, shRes, secRes] = await Promise.all([
        supabase.from('activities').select('*').eq('project_id', projectId),
        supabase.from('equipment').select('id, code, name, type').eq('project_id', projectId),
        supabase.from('work_shifts').select('*').eq('project_id', projectId),
        supabase.from('project_sectors').select('*').eq('project_id', projectId),
      ]);
      if (aRes.error) throw aRes.error;
      if (eRes.error) throw eRes.error;
      if (shRes.error) throw shRes.error;
      if (secRes.error) throw secRes.error;

      // Users involucrados
      const userIds = Array.from(new Set((sessions ?? []).map((s: any) => s.user_id)));
      let users: User[] = [];
      if (userIds.length > 0) {
        const { data: u, error } = await supabase.from('users').select('*').in('id', userIds);
        if (error) throw error;
        users = (u ?? []) as User[];
      }

      return {
        sessions: (sessions ?? []) as WorkSession[],
        intervals,
        activities: (aRes.data ?? []) as Activity[],
        equipment: (eRes.data ?? []) as any[],
        shifts: (shRes.data ?? []) as WorkShift[],
        sectors: (secRes.data ?? []) as ProjectSector[],
        users,
      };
    },
  });
}

/** Fetch puntos GPS de una sesión específica (para detalle y mapa). */
export function useSessionGpsPoints(sessionId: string | null) {
  return useQuery({
    queryKey: ['session-gps', sessionId],
    enabled: !!sessionId,
    queryFn: async (): Promise<WorkSessionGpsPoint[]> => {
      if (!sessionId) return [];
      const { data, error } = await supabase
        .from('work_session_gps_points').select('*')
        .eq('session_id', sessionId)
        .order('captured_at', { ascending: true });
      if (error) throw error;
      return (data ?? []) as WorkSessionGpsPoint[];
    },
  });
}
