/**
 * useTraceability — hooks de fetch para el módulo de trazabilidad web.
 *
 * Fetchea sesiones + intervals + catálogos del proyecto. Devuelve estructuras
 * listas para alimentar las funciones de `lib/traceabilityAggregates.ts`.
 *
 * Filtros opcionales: rango de fechas (`from`, `to` en ms epoch).
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
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

// ── Fase 1: CAPTURAR sesión desde la PC (sin cronómetro; se crea ya CERRADA) ───
export interface CaptureCatalogs {
  equipment: { id: string; code: string; name: string }[];
  activities: { id: string; name: string }[];
  equipmentActivities: { equipment_id: string; activity_id: string; form_template_id: string | null }[];
  shifts: WorkShift[];
  sectors: ProjectSector[];
}

/** Catálogos para el wizard de captura: equipos (maquinaria pesada) + actividades
 *  válidas por equipo (equipment_activities) + turnos + sectores del proyecto. */
export function useCaptureCatalogs(projectId: string) {
  return useQuery({
    queryKey: ['trace-capture-catalogs', projectId],
    enabled: !!projectId,
    queryFn: async (): Promise<CaptureCatalogs> => {
      const [eRes, aRes, eaRes, shRes, secRes] = await Promise.all([
        supabase.from('equipment').select('id, code, name, category').eq('project_id', projectId),
        supabase.from('activities').select('id, name').eq('project_id', projectId),
        supabase.from('equipment_activities').select('equipment_id, activity_id, form_template_id'),
        supabase.from('work_shifts').select('*').eq('project_id', projectId),
        supabase.from('project_sectors').select('*').eq('project_id', projectId),
      ]);
      const eq = ((eRes.data ?? []) as Array<{ id: string; code: string; name: string; category?: string | null }>)
        .filter(e => (e.category ?? 'maquinaria_pesada') === 'maquinaria_pesada');
      const eqIds = new Set(eq.map(e => e.id));
      const ea = ((eaRes.data ?? []) as Array<{ equipment_id: string; activity_id: string; form_template_id: string | null }>)
        .filter(x => eqIds.has(x.equipment_id));
      return {
        equipment: eq.map(e => ({ id: e.id, code: e.code, name: e.name })),
        activities: (aRes.data ?? []) as { id: string; name: string }[],
        equipmentActivities: ea,
        shifts: (shRes.data ?? []) as WorkShift[],
        sectors: (secRes.data ?? []) as ProjectSector[],
      };
    },
  });
}

export interface CreateWorkSessionArgs {
  userId: string;
  equipmentId: string;
  activityId: string;
  sectorId: string | null;
  shiftId: string | null;
  startedAt: number;  // ms epoch
  endedAt: number;    // ms epoch
}

/** Crea una sesión de tareo ya CERRADA (capturada desde la oficina) + su intervalo
 *  activo [started_at, ended_at]. Mismo modelo que el móvil; sin pausa/reanudar ni GPS. */
export function useCreateWorkSession(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: CreateWorkSessionArgs): Promise<string> => {
      const id = crypto.randomUUID();
      const now = Date.now();
      const { error: e1 } = await supabase.from('work_sessions').insert({
        id, project_id: projectId, user_id: args.userId, equipment_id: args.equipmentId,
        activity_id: args.activityId, sector_id: args.sectorId, shift_id: args.shiftId,
        started_at: args.startedAt, ended_at: args.endedAt, status: 'CLOSED',
        started_on_device_id: 'web', auto_closed: false, created_at: now, updated_at: now,
      });
      if (e1) throw new Error(e1.message);
      const { error: e2 } = await supabase.from('work_session_intervals').insert({
        id: crypto.randomUUID(), session_id: id, kind: 'active',
        started_at: args.startedAt, ended_at: args.endedAt, created_at: now,
      });
      if (e2) throw new Error(e2.message);
      return id;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['traceability', projectId] }); },
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
