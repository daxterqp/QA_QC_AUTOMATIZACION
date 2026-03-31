import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@lib/supabase/client';
import type { Location, Protocol, ProtocolTemplate, ProtocolTemplateItem } from '@/types';

const supabase = createClient();

// ── Ubicaciones del proyecto ──────────────────────────────────────────────────

export function useLocations(projectId: string) {
  return useQuery({
    queryKey: ['locations', projectId],
    queryFn: async (): Promise<Location[]> => {
      const { data, error } = await supabase
        .from('locations')
        .select('*')
        .eq('project_id', projectId)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return data as Location[];
    },
    enabled: !!projectId,
  });
}

// ── Progreso de protocolos por ubicación ─────────────────────────────────────

export function useLocationProgress(projectId: string) {
  return useQuery({
    queryKey: ['location-progress', projectId],
    queryFn: async (): Promise<Map<string, { done: number; total: number }>> => {
      const { data: protocols, error } = await supabase
        .from('protocols')
        .select('id, location_id, status')
        .eq('project_id', projectId);
      if (error) throw error;

      const { data: locations, error: locErr } = await supabase
        .from('locations')
        .select('id, template_ids')
        .eq('project_id', projectId);
      if (locErr) throw locErr;

      const map = new Map<string, { done: number; total: number }>();
      for (const loc of (locations ?? [])) {
        const templateCount = loc.template_ids
          ? loc.template_ids.split(',').filter((s: string) => s.trim()).length
          : 0;
        const locProtos = (protocols ?? []).filter((p: { location_id: string; status: string }) => p.location_id === loc.id);
        const approved = locProtos.filter((p: { status: string }) => p.status === 'APPROVED').length;
        map.set(loc.id, { done: approved, total: templateCount });
      }
      return map;
    },
    enabled: !!projectId,
    staleTime: 10 * 1000,
  });
}

// ── Protocolos de una ubicación (templates + instancias) ─────────────────────

export interface TemplateRow {
  template: ProtocolTemplate;
  instance: Protocol | null;
}

export function useLocationProtocols(locationId: string, projectId: string) {
  return useQuery({
    queryKey: ['location-protocols', locationId, projectId],
    queryFn: async (): Promise<TemplateRow[]> => {
      // 1. Cargar la ubicación para leer sus templateIds
      const { data: location, error: locErr } = await supabase
        .from('locations')
        .select('template_ids')
        .eq('id', locationId)
        .single();
      if (locErr) throw locErr;

      const templateIdList: string[] = location?.template_ids
        ? location.template_ids.split(',').map((s: string) => s.trim()).filter(Boolean)
        : [];

      if (templateIdList.length === 0) return [];

      // 2. Plantillas del proyecto
      const { data: allTemplates, error: tmplErr } = await supabase
        .from('protocol_templates')
        .select('*')
        .eq('project_id', projectId);
      if (tmplErr) throw tmplErr;

      const matching = (allTemplates ?? []).filter((t: ProtocolTemplate) =>
        templateIdList.includes(t.id_protocolo)
      );

      // 3. Instancias existentes para esta ubicación
      const { data: instances, error: instErr } = await supabase
        .from('protocols')
        .select('*')
        .eq('location_id', locationId)
        .eq('project_id', projectId);
      if (instErr) throw instErr;

      // 4. Construir filas
      return matching.map((tmpl: ProtocolTemplate) => ({
        template: tmpl,
        instance: (instances ?? []).find((p: Protocol) => p.template_id === tmpl.id) ?? null,
      }));
    },
    enabled: !!locationId && !!projectId,
  });
}

// ── Crear instancia de protocolo desde plantilla ─────────────────────────────

export function useCreateProtocolInstance(locationId: string, projectId: string) {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({
      templateId,
      templateName,
      locationName,
    }: {
      templateId: string;
      templateName: string;
      locationName: string;
    }): Promise<Protocol> => {
      // Crear protocolo
      const { data: protocol, error: protoErr } = await supabase
        .from('protocols')
        .insert({
          project_id: projectId,
          location_id: locationId,
          template_id: templateId,
          protocol_number: templateName,
          location_reference: locationName,
          status: 'PENDING',
        })
        .select()
        .single();
      if (protoErr) throw protoErr;

      // Cargar items de la plantilla
      const { data: templateItems, error: itemsErr } = await supabase
        .from('protocol_template_items')
        .select('*')
        .eq('template_id', templateId)
        .order('created_at', { ascending: true });
      if (itemsErr) throw itemsErr;

      // Crear items del protocolo
      if (templateItems && templateItems.length > 0) {
        const itemsToInsert = (templateItems as ProtocolTemplateItem[]).map((ti, idx) => ({
          protocol_id: protocol.id,
          template_item_id: ti.id,
          partida_item: ti.partida_item,
          item_description: ti.item_description,
          validation_method: ti.validation_method,
          section: ti.section,
          status: 'PENDING' as const,
          sort_order: idx,
        }));

        const { error: insertErr } = await supabase
          .from('protocol_items')
          .insert(itemsToInsert);
        if (insertErr) throw insertErr;
      }

      return protocol as Protocol;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['location-protocols', locationId, projectId] });
      qc.invalidateQueries({ queryKey: ['location-progress', projectId] });
    },
  });
}
