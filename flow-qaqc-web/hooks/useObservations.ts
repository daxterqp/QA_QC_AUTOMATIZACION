import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@lib/supabase/client';
import { pushAnnotationClosed } from '@lib/pushNotification';
import type { Plan, PlanAnnotation, AnnotationComment } from '@/types';

const supabase = createClient();

// ── Tipos ─────────────────────────────────────────────────────────────────────

export interface ObservationRow {
  annotation: PlanAnnotation;
  sequenceNumber: number;
  isOk: boolean;
  page: number | null;
  type: 'dot' | 'rect';
  comment: string | null;
  comments: AnnotationComment[];
  plan: Plan;
  protocolNumber: string | null;
  locationName: string | null;
  locationOnly: string | null;
  specialty: string | null;
  authorName: string | null;
}

// ── Hook principal ────────────────────────────────────────────────────────────

export function useProjectObservations(projectId: string) {
  return useQuery({
    queryKey: ['project-observations', projectId],
    queryFn: async (): Promise<ObservationRow[]> => {
      // 1. Planos del proyecto
      const { data: plans, error: plansErr } = await supabase
        .from('plans')
        .select('*')
        .eq('project_id', projectId);
      if (plansErr) throw plansErr;
      if (!plans || plans.length === 0) return [];

      // 2. Todas las anotaciones de esos planos (más recientes primero)
      const planIds = (plans as Plan[]).map(p => p.id);
      const { data: anns, error: annsErr } = await supabase
        .from('plan_annotations')
        .select('*')
        .in('plan_id', planIds)
        .order('created_at', { ascending: false });
      if (annsErr) throw annsErr;
      if (!anns || anns.length === 0) return [];

      const annotations = anns as PlanAnnotation[];

      // 3. Comentarios de todas las anotaciones
      const annIds = annotations.map(a => a.id);
      const { data: comments } = await supabase
        .from('annotation_comments')
        .select('*')
        .in('annotation_id', annIds)
        .order('created_at', { ascending: true });
      const allComments = (comments ?? []) as AnnotationComment[];

      // 4. Protocolos únicos referenciados
      const protocolIds = Array.from(new Set(
        annotations.filter(a => a.protocol_id).map(a => a.protocol_id as string)
      ));
      let protocolMap: Record<string, { protocol_number: string | null; location_id: string | null }> = {};
      if (protocolIds.length > 0) {
        const { data: protos } = await supabase
          .from('protocols')
          .select('id, protocol_number, location_id')
          .in('id', protocolIds);
        for (const p of (protos ?? [])) {
          protocolMap[p.id] = { protocol_number: p.protocol_number, location_id: p.location_id };
        }
      }

      // 5. Ubicaciones únicas referenciadas
      const locationIds = Array.from(new Set(
        Object.values(protocolMap).filter(p => p.location_id).map(p => p.location_id as string)
      ));
      type LocInfo = { name: string; locationOnly: string | null; specialty: string | null };
      let locationMap: Record<string, LocInfo> = {};
      if (locationIds.length > 0) {
        const { data: locs } = await supabase
          .from('locations')
          .select('id, name, location_only, specialty')
          .in('id', locationIds);
        for (const l of (locs ?? [])) {
          locationMap[l.id] = { name: l.name, locationOnly: l.location_only, specialty: l.specialty };
        }
      }

      // 5b. Autores de anotaciones
      const authorIds = Array.from(new Set(
        annotations.filter(a => a.created_by_id).map(a => a.created_by_id as string)
      ));
      let authorMap: Record<string, string> = {};
      if (authorIds.length > 0) {
        const { data: authors } = await supabase
          .from('users')
          .select('id, name, apellido')
          .in('id', authorIds);
        for (const u of (authors ?? []) as { id: string; name: string; apellido?: string | null }[]) {
          authorMap[u.id] = [u.name, u.apellido].filter(Boolean).join(' ');
        }
      }

      // 6. Construir filas
      const planMap: Record<string, Plan> = {};
      for (const p of (plans as Plan[])) planMap[p.id] = p;

      const commentsByAnn: Record<string, AnnotationComment[]> = {};
      for (const c of allComments) {
        if (!commentsByAnn[c.annotation_id]) commentsByAnn[c.annotation_id] = [];
        commentsByAnn[c.annotation_id].push(c);
      }

      return annotations.map(ann => {
        const isDot = (ann.rect_width ?? 0) === 0 && (ann.rect_height ?? 0) === 0;
        const proto = ann.protocol_id ? protocolMap[ann.protocol_id] : null;
        const locInfo = proto?.location_id ? (locationMap[proto.location_id] ?? null) : null;
        return {
          annotation: ann,
          sequenceNumber: ann.sequence_number,
          isOk: ann.is_ok,
          page: ann.page,
          type: (isDot ? 'dot' : 'rect') as 'dot' | 'rect',
          comment: ann.comment,
          comments: commentsByAnn[ann.id] ?? [],
          plan: planMap[ann.plan_id],
          protocolNumber: proto?.protocol_number ?? null,
          locationName:  locInfo?.name ?? null,
          locationOnly:  locInfo?.locationOnly ?? null,
          specialty:     locInfo?.specialty ?? null,
          authorName:    ann.created_by_id ? (authorMap[ann.created_by_id] ?? null) : null,
        };
      }).filter(r => r.plan); // descartar si el plano fue eliminado
    },
    enabled: !!projectId,
    staleTime: 30_000,
  });
}

// ── Toggle isOk ───────────────────────────────────────────────────────────────

export function useToggleObservationOk(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ annotationId, isOk, locationOnly, specialty }: {
      annotationId: string; isOk: boolean; locationOnly?: string | null; specialty?: string | null;
    }) => {
      const { error } = await supabase
        .from('plan_annotations')
        .update({ is_ok: isOk, status: isOk ? 'CLOSED' : 'OPEN', updated_at: Date.now() })
        .eq('id', annotationId);
      if (error) throw error;
      // Send push notification when closing observation
      if (isOk) pushAnnotationClosed(projectId, locationOnly ?? null, specialty ?? null);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['project-observations', projectId] }),
  });
}

// ── Eliminar anotación ────────────────────────────────────────────────────────

export function useDeleteObservation(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (annotationId: string) => {
      await supabase.from('annotation_comments').delete().eq('annotation_id', annotationId);
      const { error } = await supabase.from('plan_annotations').delete().eq('id', annotationId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['project-observations', projectId] }),
  });
}
