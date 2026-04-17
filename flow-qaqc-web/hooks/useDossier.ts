import { useQuery } from '@tanstack/react-query';
import { createClient } from '@lib/supabase/client';
import type { Protocol, ProtocolItem, Evidence, Location, User } from '@/types';
import type { PreloadedProjectData } from '@hooks/useProjectPreload';

const supabase = createClient();

export interface DossierProtocol extends Protocol {
  location: Location | null;
  filledByName: string | null;
  signedByName: string | null;
}

// ── Protocol list (non-draft) ─────────────────────────────────────────────────

export function useDossierProtocols(projectId: string) {
  return useQuery({
    queryKey: ['dossier-protocols', projectId],
    queryFn: async (): Promise<DossierProtocol[]> => {
      const { data: protocols, error } = await supabase
        .from('protocols')
        .select('*')
        .eq('project_id', projectId)
        .in('status', ['SUBMITTED', 'APPROVED', 'REJECTED'])
        .order('protocol_number', { ascending: true });
      if (error) throw error;

      const ps = (protocols ?? []) as Protocol[];
      if (ps.length === 0) return [];

      // Batch-load locations and users
      const locationIds = Array.from(new Set(ps.map(p => p.location_id).filter(Boolean) as string[]));
      const userIds     = Array.from(new Set([
        ...ps.map(p => p.filled_by_id),
        ...ps.map(p => p.signed_by_id),
      ].filter(Boolean) as string[]));

      // Fetch ALL locations + templates for the project (needed for correct ordering)
      const [{ data: allLocs }, { data: users }, { data: templates }] = await Promise.all([
        supabase.from('locations').select('*').eq('project_id', projectId).order('created_at', { ascending: true }),
        userIds.length > 0
          ? supabase.from('users').select('id, name, apellido').in('id', userIds)
          : Promise.resolve({ data: [] }),
        supabase.from('protocol_templates').select('id, id_protocolo').eq('project_id', projectId),
      ]);

      // Map template UUID → id_protocolo (e.g. "x5QPU..." → "PROY-ARQ-01")
      const tmplUuidToIdProto: Record<string, string> = {};
      for (const t of (templates ?? []) as { id: string; id_protocolo: string }[]) {
        if (t.id_protocolo) tmplUuidToIdProto[t.id] = t.id_protocolo;
      }

      const locMap: Record<string, Location> = {};
      for (const l of allLocs ?? []) locMap[l.id] = l as Location;
      const userMap: Record<string, string> = {};
      for (const u of (users ?? []) as { id: string; name: string; apellido?: string | null }[]) {
        userMap[u.id] = [u.name, u.apellido].filter(Boolean).join(' ');
      }

      // Build order index from location template_ids (order from Excel/activity table)
      // Each location has template_ids like "TRAZO,PRE-VACIADO,ACERO" — that defines the order
      // Group order: by first appearance of location_only in the sorted locations list
      const templateOrder: Record<string, number> = {};
      let orderIdx = 0;
      // allLocs already sorted by created_at (Excel import order)
      // Determine location_only group order by first appearance
      const locOnlyOrder: Record<string, number> = {};
      let groupIdx = 0;
      for (const loc of (allLocs ?? []) as Location[]) {
        const locOnly = loc.location_only ?? loc.name ?? '';
        if (!(locOnly in locOnlyOrder)) locOnlyOrder[locOnly] = groupIdx++;
      }
      // Sort all locations: group order first, then creation order within group
      const groupedLocs = [...((allLocs ?? []) as Location[])].sort((a, b) => {
        const gA = locOnlyOrder[a.location_only ?? a.name ?? ''] ?? 99999;
        const gB = locOnlyOrder[b.location_only ?? b.name ?? ''] ?? 99999;
        return gA - gB;
        // within same group, already in created_at order from query
      });
      for (const loc of groupedLocs) {
        const tids = loc.template_ids ? loc.template_ids.split(',').map(s => s.trim()).filter(Boolean) : [];
        for (const tid of tids) {
          const key = `${loc.id}__${tid}`;
          templateOrder[key] = orderIdx++;
        }
      }

      const dossierProtos = ps.map(p => ({
        ...p,
        location: p.location_id ? (locMap[p.location_id] ?? null) : null,
        filledByName:  p.filled_by_id ? (userMap[p.filled_by_id] ?? null) : null,
        signedByName:  p.signed_by_id ? (userMap[p.signed_by_id]  ?? null) : null,
      }));

      // Sort by location template_ids order (same as activity table)
      // Convert template UUID to id_protocolo for lookup (template_ids uses id_protocolo strings)
      dossierProtos.sort((a, b) => {
        const idProtoA = a.template_id ? (tmplUuidToIdProto[a.template_id] ?? a.template_id) : '';
        const idProtoB = b.template_id ? (tmplUuidToIdProto[b.template_id] ?? b.template_id) : '';
        const keyA = `${a.location_id}__${idProtoA}`;
        const keyB = `${b.location_id}__${idProtoB}`;
        const orderA = templateOrder[keyA] ?? 99999;
        const orderB = templateOrder[keyB] ?? 99999;
        return orderA - orderB;
      });

      return dossierProtos;
    },
    enabled: !!projectId,
  });
}

// ── Full protocol data for PDF export ────────────────────────────────────────

export interface DossierProtocolFull {
  protocol: DossierProtocol;
  items: ProtocolItem[];
  evidences: Evidence[];
}

export async function fetchDossierProtocolFull(
  protocolId: string,
  locMap: Record<string, Location>,
  userMap: Record<string, string>,
  preloaded?: PreloadedProjectData | null,
): Promise<DossierProtocolFull> {
  let p: Protocol;
  let its: ProtocolItem[];
  let evidences: Evidence[];

  if (preloaded && preloaded.itemsByProtocol[protocolId]) {
    // Use preloaded data — no Supabase queries needed
    const { data: proto } = await supabase.from('protocols').select('*').eq('id', protocolId).single();
    if (!proto) throw new Error('Protocol not found');
    p = proto as Protocol;
    its = preloaded.itemsByProtocol[protocolId] ?? [];
    evidences = preloaded.evidencesByProtocol[protocolId] ?? [];
  } else {
    // Fallback: fetch from Supabase (original behavior)
    const [{ data: proto }, { data: items }] = await Promise.all([
      supabase.from('protocols').select('*').eq('id', protocolId).single(),
      supabase.from('protocol_items').select('*').eq('protocol_id', protocolId).order('created_at', { ascending: true }),
    ]);
    if (!proto) throw new Error('Protocol not found');
    p = proto as Protocol;
    its = (items ?? []) as ProtocolItem[];

    const itemIds = its.map(i => i.id);
    evidences = [];
    if (itemIds.length > 0) {
      const CHUNK = 50;
      for (let i = 0; i < itemIds.length; i += CHUNK) {
        const batch = itemIds.slice(i, i + CHUNK);
        const { data: evs } = await supabase
          .from('evidences').select('*').in('protocol_item_id', batch);
        if (evs) evidences.push(...(evs as Evidence[]));
      }
    }
  }

  const dossierProto: DossierProtocol = {
    ...p,
    location: p.location_id ? (locMap[p.location_id] ?? null) : null,
    filledByName:  p.filled_by_id ? (userMap[p.filled_by_id] ?? null) : null,
    signedByName:  p.signed_by_id ? (userMap[p.signed_by_id]  ?? null) : null,
  };

  return { protocol: dossierProto, items: its, evidences };
}
