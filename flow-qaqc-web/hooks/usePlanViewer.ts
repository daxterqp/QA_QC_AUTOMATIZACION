import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@lib/supabase/client';
import type { Plan, PlanAnnotation, AnnotationComment, AnnotationCommentPhoto } from '@/types';

const supabase = createClient();

// ── Types ─────────────────────────────────────────────────────────────────────

export interface AnnotationData {
  type: 'dot' | 'rect';   // dot = rect_width === 0 && rect_height === 0
  width?: number;          // rect_width %
  height?: number;         // rect_height %
  page?: number | null;
  sequenceNumber: number;
  isOk: boolean;
}

export interface AnnotationWithComments extends PlanAnnotation {
  parsedData: AnnotationData;
  comments: AnnotationComment[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Convierte una fila de Supabase a la forma que espera el visor */
function toAnnotationWithComments(
  ann: PlanAnnotation,
  comments: AnnotationComment[],
): AnnotationWithComments {
  const isDot = (ann.rect_width ?? 0) === 0 && (ann.rect_height ?? 0) === 0;
  const parsedData: AnnotationData = {
    type: isDot ? 'dot' : 'rect',
    width: isDot ? undefined : ann.rect_width,
    height: isDot ? undefined : ann.rect_height,
    page: ann.page,
    sequenceNumber: ann.sequence_number,
    isOk: ann.is_ok,
  };
  return { ...ann, parsedData, comments };
}

// ── Plans list ────────────────────────────────────────────────────────────────

export function usePlansList(projectId: string) {
  return useQuery({
    queryKey: ['plans', projectId],
    queryFn: async (): Promise<Plan[]> => {
      const { data, error } = await supabase
        .from('plans')
        .select('*')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as Plan[];
    },
    enabled: !!projectId,
  });
}

// ── Plans por reference_plan (string con nombres separados por coma) ──────────

export function usePlansByReference(projectId: string, referencePlan: string | null | undefined) {
  const names = (referencePlan ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  return useQuery({
    queryKey: ['plans-by-ref', projectId, referencePlan],
    queryFn: async (): Promise<Plan[]> => {
      if (names.length === 0) return [];
      const { data, error } = await supabase
        .from('plans')
        .select('*')
        .eq('project_id', projectId)
        .in('name', names)
        .order('created_at', { ascending: false });
      if (error) throw error;

      // Deduplicar: un plan por s3_key único
      const seen = new Set<string>();
      const deduped: Plan[] = [];
      for (const name of names) {
        const match = (data ?? []).find(
          (p) => p.name === name && !seen.has(p.s3_key ?? p.id)
        );
        if (match) {
          seen.add(match.s3_key ?? match.id);
          deduped.push(match as Plan);
        }
      }
      return deduped;
    },
    enabled: !!projectId && names.length > 0,
    staleTime: 60_000,
  });
}

// ── Single protocol header info (number + location name) ─────────────────────

export interface ProtocolHeaderInfo {
  protocolNumber: string | null;
  locationName: string | null;
  locationId: string | null;
  referencePlan: string | null;
}

export function useProtocolHeader(protocolId: string | null) {
  return useQuery({
    queryKey: ['protocol-header', protocolId],
    queryFn: async (): Promise<ProtocolHeaderInfo> => {
      if (!protocolId) return { protocolNumber: null, locationName: null, locationId: null, referencePlan: null };
      const { data: proto, error } = await supabase
        .from('protocols')
        .select('protocol_number, location_id')
        .eq('id', protocolId)
        .single();
      if (error) return { protocolNumber: null, locationName: null, locationId: null, referencePlan: null };
      const locationId = (proto as { location_id: string | null })?.location_id ?? null;
      if (!locationId) return { protocolNumber: (proto as { protocol_number: string | null }).protocol_number, locationName: null, locationId: null, referencePlan: null };
      const { data: loc } = await supabase
        .from('locations')
        .select('name, reference_plan')
        .eq('id', locationId)
        .single();
      return {
        protocolNumber: (proto as { protocol_number: string | null }).protocol_number ?? null,
        locationName: (loc as { name: string } | null)?.name ?? null,
        locationId,
        referencePlan: (loc as { reference_plan: string } | null)?.reference_plan ?? null,
      };
    },
    enabled: !!protocolId,
  });
}

// ── Single plan ───────────────────────────────────────────────────────────────

export function usePlan(planId: string) {
  return useQuery({
    queryKey: ['plan', planId],
    queryFn: async (): Promise<Plan | null> => {
      const { data, error } = await supabase
        .from('plans')
        .select('*')
        .eq('id', planId)
        .single();
      if (error) return null;
      return data as Plan;
    },
    enabled: !!planId,
  });
}

// ── Annotations + comments for a plan ────────────────────────────────────────

export function useAnnotations(planId: string, protocolId?: string | null) {
  return useQuery({
    queryKey: ['annotations', planId, protocolId ?? '__none__'],
    queryFn: async (): Promise<AnnotationWithComments[]> => {
      let query = supabase
        .from('plan_annotations')
        .select('*')
        .eq('plan_id', planId);

      // Filter by protocol context (same as APK PlanViewerScreen line 195-198)
      if (protocolId) {
        query = query.eq('protocol_id', protocolId);
      } else {
        query = query.is('protocol_id', null);
      }

      const { data: anns, error } = await query.order('sequence_number', { ascending: true });
      if (error) throw error;

      const annotations = (anns ?? []) as PlanAnnotation[];
      if (annotations.length === 0) return [];

      const annIds = annotations.map((a) => a.id);
      const { data: comments } = await supabase
        .from('annotation_comments')
        .select('*')
        .in('annotation_id', annIds)
        .order('created_at', { ascending: true });

      const allComments = (comments ?? []) as AnnotationComment[];
      const commentIds = allComments.map(c => c.id);

      // Load photos for all comments
      let photosByComment: Record<string, AnnotationCommentPhoto[]> = {};
      if (commentIds.length > 0) {
        const { data: photos } = await supabase
          .from('annotation_comment_photos')
          .select('*')
          .in('annotation_comment_id', commentIds)
          .order('created_at', { ascending: true });
        for (const p of (photos ?? []) as AnnotationCommentPhoto[]) {
          if (!photosByComment[p.annotation_comment_id]) photosByComment[p.annotation_comment_id] = [];
          photosByComment[p.annotation_comment_id].push(p);
        }
      }

      // Attach photos to comments
      const commentsByAnn: Record<string, AnnotationComment[]> = {};
      for (const c of allComments) {
        c.photos = photosByComment[c.id] ?? [];
        if (!commentsByAnn[c.annotation_id]) commentsByAnn[c.annotation_id] = [];
        commentsByAnn[c.annotation_id].push(c);
      }

      return annotations.map((ann) =>
        toAnnotationWithComments(ann, commentsByAnn[ann.id] ?? [])
      );
    },
    enabled: !!planId,
  });
}

// ── Create annotation ─────────────────────────────────────────────────────────

export function useCreateAnnotation(planId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      x: number;
      y: number;
      label: string | null;
      annotationData: AnnotationData;
      userId: string;
      protocolId?: string | null;
    }) => {
      const isDot = input.annotationData.type === 'dot';
      const now = Date.now(); // WatermelonDB guarda timestamps como números (ms)
      const base: Record<string, unknown> = {
        id: crypto.randomUUID(),
        plan_id: planId,
        created_by_id: input.userId,
        rect_x: input.x,
        rect_y: input.y,
        rect_width: isDot ? 0 : (input.annotationData.width ?? 0),
        rect_height: isDot ? 0 : (input.annotationData.height ?? 0),
        comment: input.label,
        sequence_number: input.annotationData.sequenceNumber,
        is_ok: false,
        status: 'OPEN',
        page: input.annotationData.page ?? null,
        created_at: now,
        updated_at: now,
      };

      if (input.protocolId) {
        const { error } = await supabase
          .from('plan_annotations')
          .insert({ ...base, protocol_id: input.protocolId });
        if (!error) return;
        // Si la columna protocol_id no existe, reintentar sin ella
      }

      const { error } = await supabase.from('plan_annotations').insert(base);
      if (error) throw new Error(error.message ?? error.details ?? JSON.stringify(error));
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['annotations', planId] }),
  });
}

// ── Delete annotation (cascades comments) ────────────────────────────────────

export function useDeleteAnnotation(planId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (annotationId: string) => {
      await supabase.from('annotation_comments').delete().eq('annotation_id', annotationId);
      const { error } = await supabase.from('plan_annotations').delete().eq('id', annotationId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['annotations', planId] }),
  });
}

// ── Toggle annotation resolved (isOk) ────────────────────────────────────────

export function useToggleAnnotationOk(planId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ annotationId, isOk }: { annotationId: string; isOk: boolean }) => {
      const { error } = await supabase
        .from('plan_annotations')
        .update({
          is_ok: isOk,
          status: isOk ? 'CLOSED' : 'OPEN',
          updated_at: Date.now(),
        })
        .eq('id', annotationId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['annotations', planId] }),
  });
}

// ── Add comment ───────────────────────────────────────────────────────────────

export function useAddComment(planId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { annotationId: string; text: string; userId: string }) => {
      const now = Date.now();
      const { error } = await supabase.from('annotation_comments').insert({
        id: crypto.randomUUID(),
        annotation_id: input.annotationId,
        author_id: input.userId,
        content: input.text,
        read_by_creator: false,
        created_at: now,
        updated_at: now,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['annotations', planId] }),
  });
}

// ── Add photo to comment ─────────────────────────────────────────────────────

export function useAddCommentPhoto(planId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { commentId: string; s3Key: string }) => {
      const now = Date.now();
      const { error } = await supabase.from('annotation_comment_photos').insert({
        id: crypto.randomUUID(),
        annotation_comment_id: input.commentId,
        local_uri: input.s3Key,
        storage_path: input.s3Key,
        created_at: now,
        updated_at: now,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['annotations', planId] }),
  });
}

// ── Delete comment ────────────────────────────────────────────────────────────

export function useDeleteComment(planId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (commentId: string) => {
      const { error } = await supabase
        .from('annotation_comments')
        .delete()
        .eq('id', commentId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['annotations', planId] }),
  });
}
