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
    queryFn: async (): Promise<Map<string, { done: number; total: number; submitted: number }>> => {
      // Cargar protocolos e instancias en paralelo
      const [{ data: protocols, error }, { data: locations, error: locErr }] = await Promise.all([
        supabase
          .from('protocols')
          .select('id, location_id, status')
          .eq('project_id', projectId)
          .in('status', ['DRAFT', 'IN_PROGRESS', 'SUBMITTED', 'APPROVED', 'REJECTED']),
        supabase
          .from('locations')
          .select('id, template_ids')
          .eq('project_id', projectId),
      ]);
      if (error) throw error;
      if (locErr) throw locErr;

      const map = new Map<string, { done: number; total: number; submitted: number }>();
      for (const loc of (locations ?? [])) {
        const templateCount = loc.template_ids
          ? loc.template_ids.split(',').filter((s: string) => s.trim()).length
          : 0;
        const locProtos = (protocols ?? []).filter(
          (p: { location_id: string }) => p.location_id === loc.id
        );
        const approved  = locProtos.filter((p: { status: string }) => p.status === 'APPROVED').length;
        const submitted = locProtos.filter((p: { status: string }) => p.status === 'SUBMITTED').length;
        map.set(loc.id, { done: approved, total: templateCount, submitted });
      }
      return map;
    },
    enabled: !!projectId,
    staleTime: 0,            // Siempre fresco al volver a la pantalla
    refetchOnWindowFocus: true,
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

      // 2. Plantillas + instancias en paralelo (filtrar en Supabase, no en JS)
      const [{ data: templates, error: tmplErr }, { data: instances, error: instErr }] =
        await Promise.all([
          supabase
            .from('protocol_templates')
            .select('*')
            .eq('project_id', projectId)
            .in('id_protocolo', templateIdList),   // Filtro en DB → mucho más rápido
          supabase
            .from('protocols')
            .select('*')
            .eq('location_id', locationId)
            .eq('project_id', projectId),
        ]);

      if (tmplErr) throw tmplErr;
      if (instErr) throw instErr;

      const matchingTemplates = (templates ?? []) as ProtocolTemplate[];
      const existingInstances = (instances ?? []) as Protocol[];

      // 3. Ordenar por el orden original de templateIdList para mantener el orden del Excel
      const ordered = templateIdList
        .map(idProt => matchingTemplates.find(t => t.id_protocolo === idProt))
        .filter((t): t is ProtocolTemplate => !!t);

      // 4. Emparejar cada template con su instancia
      return ordered.map(tmpl => ({
        template: tmpl,
        instance: existingInstances.find(p => p.template_id === tmpl.id) ?? null,
      }));
    },
    enabled: !!locationId && !!projectId,
    staleTime: 0,
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
      const now = Date.now();
      const { data: protocol, error: protoErr } = await supabase
        .from('protocols')
        .insert({
          id: crypto.randomUUID(),
          project_id: projectId,
          location_id: locationId,
          template_id: templateId,
          protocol_number: templateName,
          location_reference: locationName,
          status: 'DRAFT',
          created_at: now,
          updated_at: now,
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
        const itemsToInsert = (templateItems as ProtocolTemplateItem[]).map((ti) => ({
          id: crypto.randomUUID(),
          protocol_id: protocol.id,
          partida_item: ti.partida_item,
          item_description: ti.item_description,
          validation_method: ti.validation_method,
          section: ti.section,
          is_compliant: false,
          is_na: false,
          has_answer: false,
          comments: null,
          created_at: now,
          updated_at: now,
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

// ── Eliminar ubicaciones (cascade) ──────────────────────────────────────────

export function useDeleteLocations(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (locationIds: string[]) => {
      const res = await fetch('/api/locations/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, locationIds }),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['locations', projectId] });
      qc.invalidateQueries({ queryKey: ['location-progress', projectId] });
      qc.invalidateQueries({ queryKey: ['dossier-protocols', projectId] });
    },
  });
}

// ── Eliminar protocolos individuales (cascade) ──────────────────────────────

export function useDeleteProtocols(locationId: string, projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (protocolIds: string[]) => {
      const res = await fetch('/api/protocols/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ protocolIds }),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['location-protocols', locationId, projectId] });
      qc.invalidateQueries({ queryKey: ['location-progress', projectId] });
      qc.invalidateQueries({ queryKey: ['dossier-protocols', projectId] });
    },
  });
}
