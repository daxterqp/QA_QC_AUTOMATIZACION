import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@lib/supabase/client';
import { uploadBlobToS3, sanitizeSegment } from '@lib/s3-upload';
import type { ProtocolTemplate, ProtocolTemplateItem, Location, Plan } from '@/types';
import type { ExcelProtocolGroup, ExcelLocation } from '@lib/excelParser';

const supabase = createClient();

// ── Templates list ────────────────────────────────────────────────────────────

export function useTemplates(projectId: string) {
  return useQuery({
    queryKey: ['templates', projectId],
    queryFn: async (): Promise<ProtocolTemplate[]> => {
      const { data, error } = await supabase
        .from('protocol_templates')
        .select('*')
        .eq('project_id', projectId)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data ?? []) as ProtocolTemplate[];
    },
    enabled: !!projectId,
  });
}

// ── Locations list ────────────────────────────────────────────────────────────

export function useLocationsList(projectId: string) {
  return useQuery({
    queryKey: ['locations-list', projectId],
    queryFn: async (): Promise<Location[]> => {
      const { data, error } = await supabase
        .from('locations')
        .select('*')
        .eq('project_id', projectId)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data ?? []) as Location[];
    },
    enabled: !!projectId,
  });
}

// ── Plans list ────────────────────────────────────────────────────────────────

export function usePlans(projectId: string) {
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

// ── Activities Excel import ───────────────────────────────────────────────────

export interface ActivitiesImportSummary {
  added: number;
  modified: number;
}

export async function importActivitiesToSupabase(
  projectId: string,
  groups: ExcelProtocolGroup[],
  onProgress?: (current: number, total: number) => void,
): Promise<ActivitiesImportSummary> {
  // Load existing templates
  const { data: existingTemplates } = await supabase
    .from('protocol_templates')
    .select('*')
    .eq('project_id', projectId);

  const templateByIdProtocolo = new Map<string, ProtocolTemplate>(
    (existingTemplates ?? []).map((t: ProtocolTemplate) => [t.id_protocolo, t])
  );

  // Load all items of existing templates
  const existingTemplateIds = (existingTemplates ?? []).map((t: ProtocolTemplate) => t.id);
  let existingItems: ProtocolTemplateItem[] = [];
  if (existingTemplateIds.length > 0) {
    const { data: items } = await supabase
      .from('protocol_template_items')
      .select('*')
      .in('template_id', existingTemplateIds);
    existingItems = (items ?? []) as ProtocolTemplateItem[];
  }

  const itemKey = (templateId: string, partida: string | null) =>
    `${templateId}|${(partida ?? '').toLowerCase().trim()}`;

  const existingItemMap = new Map<string, ProtocolTemplateItem>(
    existingItems.map(item => [itemKey(item.template_id, item.partida_item), item])
  );

  let added = 0;
  let modified = 0;

  for (let i = 0; i < groups.length; i++) {
    onProgress?.(i + 1, groups.length);
    const group = groups[i];
    let template = templateByIdProtocolo.get(group.idProtocolo);
    let templateModified = false;

    if (!template) {
      // Insert new template
      const { data: newT, error } = await supabase
        .from('protocol_templates')
        .insert({ project_id: projectId, id_protocolo: group.idProtocolo, name: group.protocolName })
        .select().single();
      if (error) throw error;
      template = newT as ProtocolTemplate;
      added++;
    } else if (template.name !== group.protocolName && group.protocolName) {
      // Update template name if changed
      await supabase
        .from('protocol_templates')
        .update({ name: group.protocolName, updated_at: new Date().toISOString() })
        .eq('id', template.id);
    }

    // Upsert items
    let sortOrder = 0;
    for (const act of group.activities) {
      sortOrder++;
      const key     = itemKey(template!.id, act.partidaItem);
      const existing = existingItemMap.get(key);

      if (!existing) {
        await supabase.from('protocol_template_items').insert({
          template_id:       template!.id,
          partida_item:      act.partidaItem || null,
          item_description:  act.itemDescription,
          validation_method: act.validationMethod || null,
          section:           act.section,
          sort_order:        sortOrder,
        });
        templateModified = true;
      } else {
        const needsUpdate =
          existing.item_description  !== act.itemDescription ||
          existing.validation_method !== (act.validationMethod || null) ||
          existing.section           !== act.section;
        if (needsUpdate) {
          await supabase.from('protocol_template_items')
            .update({
              item_description:  act.itemDescription,
              validation_method: act.validationMethod || null,
              section:           act.section,
              updated_at:        new Date().toISOString(),
            })
            .eq('id', existing.id);
          templateModified = true;
        }
      }
    }

    if (templateModified && template && templateByIdProtocolo.has(group.idProtocolo)) {
      modified++;
    }
  }

  return { added, modified };
}

// ── Locations Excel import ────────────────────────────────────────────────────

export interface LocationsImportSummary {
  added: number;
  modified: number;
}

export async function importLocationsToSupabase(
  projectId: string,
  locations: ExcelLocation[],
): Promise<LocationsImportSummary> {
  const { data: existingLocs } = await supabase
    .from('locations')
    .select('*')
    .eq('project_id', projectId);

  const locationByName = new Map<string, Location>(
    (existingLocs ?? []).map((l: Location) => [l.name.toLowerCase().trim(), l])
  );

  let added = 0;
  let modified = 0;

  for (const loc of locations) {
    const nameKey  = loc.name.toLowerCase().trim();
    const existing = locationByName.get(nameKey);

    if (!existing) {
      await supabase.from('locations').insert({
        project_id:    projectId,
        name:          loc.name,
        location_only: loc.locationOnly || null,
        specialty:     loc.specialty    || null,
        reference_plan: loc.referencePlan,
        template_ids:  loc.templateIds  || null,
      });
      added++;
    } else {
      const needsUpdate =
        existing.location_only  !== (loc.locationOnly  || null) ||
        existing.specialty       !== (loc.specialty     || null) ||
        existing.reference_plan  !== loc.referencePlan          ||
        existing.template_ids    !== (loc.templateIds   || null);
      if (needsUpdate) {
        await supabase.from('locations').update({
          location_only:  loc.locationOnly  || null,
          specialty:      loc.specialty     || null,
          reference_plan: loc.referencePlan,
          template_ids:   loc.templateIds   || null,
          updated_at:     new Date().toISOString(),
        }).eq('id', existing.id);
        modified++;
      }
    }
  }

  return { added, modified };
}

// ── PDF plan upload ───────────────────────────────────────────────────────────

export async function uploadPlanToS3AndDB(
  file: File,
  projectId: string,
  projectName: string,
  uploadedById: string,
): Promise<Plan> {
  const planName = file.name.replace(/\.pdf$/i, '');
  const s3Key    = `projects/${sanitizeSegment(projectName)}/plans/${sanitizeSegment(planName)}.pdf`;

  const blob = new Blob([await file.arrayBuffer()], { type: 'application/pdf' });
  await uploadBlobToS3(blob, s3Key, 'application/pdf');

  const { data, error } = await supabase
    .from('plans')
    .insert({
      project_id:     projectId,
      name:           planName,
      s3_key:         s3Key,
      file_type:      'pdf',
    })
    .select().single();
  if (error) throw error;
  return data as Plan;
}

// ── Logo upload ───────────────────────────────────────────────────────────────

export async function uploadProjectLogo(
  file: File,
  projectId: string,
): Promise<string> {
  const s3Key = `logos/project_${projectId}/logo.jpg`;
  const blob  = new Blob([await file.arrayBuffer()], { type: 'image/jpeg' });
  await uploadBlobToS3(blob, s3Key, 'image/jpeg');
  // Save s3_key on the project row
  await supabase
    .from('projects')
    .update({ logo_s3_key: s3Key, updated_at: new Date().toISOString() })
    .eq('id', projectId);
  return s3Key;
}

// ── Signature upload ──────────────────────────────────────────────────────────

export async function uploadUserSignature(
  file: File,
  userId: string,
): Promise<string> {
  const s3Key = `signatures/${userId}/signature.jpg`;
  const blob  = new Blob([await file.arrayBuffer()], { type: 'image/jpeg' });
  await uploadBlobToS3(blob, s3Key, 'image/jpeg');
  return s3Key;
}
