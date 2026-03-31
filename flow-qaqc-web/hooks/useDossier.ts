import { useQuery } from '@tanstack/react-query';
import { createClient } from '@lib/supabase/client';
import type { Protocol, ProtocolItem, Evidence, Location, User } from '@/types';

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
        .in('status', ['IN_PROGRESS', 'APPROVED', 'REJECTED'])
        .order('updated_at', { ascending: false });
      if (error) throw error;

      const ps = (protocols ?? []) as Protocol[];
      if (ps.length === 0) return [];

      // Batch-load locations and users
      const locationIds = Array.from(new Set(ps.map(p => p.location_id).filter(Boolean) as string[]));
      const userIds     = Array.from(new Set([
        ...ps.map(p => p.created_by_id),
        ...ps.map(p => p.signed_by_id),
      ].filter(Boolean) as string[]));

      const [{ data: locs }, { data: users }] = await Promise.all([
        locationIds.length > 0
          ? supabase.from('locations').select('*').in('id', locationIds)
          : Promise.resolve({ data: [] }),
        userIds.length > 0
          ? supabase.from('users').select('id, full_name').in('id', userIds)
          : Promise.resolve({ data: [] }),
      ]);

      const locMap: Record<string, Location> = {};
      for (const l of locs ?? []) locMap[l.id] = l as Location;
      const userMap: Record<string, string> = {};
      for (const u of users ?? []) userMap[u.id] = u.full_name;

      return ps.map(p => ({
        ...p,
        location: p.location_id ? (locMap[p.location_id] ?? null) : null,
        filledByName:  p.created_by_id ? (userMap[p.created_by_id] ?? null) : null,
        signedByName:  p.signed_by_id  ? (userMap[p.signed_by_id]  ?? null) : null,
      }));
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
): Promise<DossierProtocolFull> {
  const [
    { data: proto },
    { data: items },
  ] = await Promise.all([
    supabase.from('protocols').select('*').eq('id', protocolId).single(),
    supabase.from('protocol_items').select('*').eq('protocol_id', protocolId).order('sort_order'),
  ]);
  if (!proto) throw new Error('Protocol not found');

  const p = proto as Protocol;
  const its = (items ?? []) as ProtocolItem[];
  const itemIds = its.map(i => i.id);

  let evidences: Evidence[] = [];
  if (itemIds.length > 0) {
    const { data: evs } = await supabase
      .from('evidences').select('*').in('protocol_item_id', itemIds);
    evidences = (evs ?? []) as Evidence[];
  }

  const dossierProto: DossierProtocol = {
    ...p,
    location: p.location_id ? (locMap[p.location_id] ?? null) : null,
    filledByName:  p.created_by_id ? (userMap[p.created_by_id] ?? null) : null,
    signedByName:  p.signed_by_id  ? (userMap[p.signed_by_id]  ?? null) : null,
  };

  return { protocol: dossierProto, items: its, evidences };
}
