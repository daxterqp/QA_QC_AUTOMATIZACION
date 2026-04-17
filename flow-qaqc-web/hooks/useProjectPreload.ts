import { useQuery } from '@tanstack/react-query';
import { createClient } from '@lib/supabase/client';
import type { ProtocolItem, Evidence } from '@/types';

const supabase = createClient();

export interface PreloadedProjectData {
  itemsByProtocol: Record<string, ProtocolItem[]>;
  evidencesByProtocol: Record<string, Evidence[]>;
}

/**
 * Preloads ALL protocol items and evidences for a project in a single batch.
 * Called once when user enters a project — data stays in cache for the session.
 */
export function useProjectPreload(projectId: string) {
  return useQuery({
    queryKey: ['project-preload', projectId],
    queryFn: async (): Promise<PreloadedProjectData> => {
      // 1. Get all protocol IDs for this project (non-draft)
      const { data: protocols } = await supabase
        .from('protocols')
        .select('id')
        .eq('project_id', projectId)
        .in('status', ['SUBMITTED', 'APPROVED', 'REJECTED']);

      const protocolIds = (protocols ?? []).map((p: { id: string }) => p.id);
      if (protocolIds.length === 0) return { itemsByProtocol: {}, evidencesByProtocol: {} };

      // 2. Batch-load ALL protocol items for all protocols
      const CHUNK = 50;
      const allItems: ProtocolItem[] = [];
      for (let i = 0; i < protocolIds.length; i += CHUNK) {
        const batch = protocolIds.slice(i, i + CHUNK);
        const { data } = await supabase
          .from('protocol_items')
          .select('*')
          .in('protocol_id', batch)
          .order('created_at', { ascending: true });
        if (data) allItems.push(...(data as ProtocolItem[]));
      }

      // 3. Batch-load ALL evidences for all items
      const allItemIds = allItems.map(i => i.id);
      const allEvidences: Evidence[] = [];
      for (let i = 0; i < allItemIds.length; i += CHUNK) {
        const batch = allItemIds.slice(i, i + CHUNK);
        const { data } = await supabase
          .from('evidences')
          .select('*')
          .in('protocol_item_id', batch);
        if (data) allEvidences.push(...(data as Evidence[]));
      }

      // 4. Index by protocol_id
      const itemsByProtocol: Record<string, ProtocolItem[]> = {};
      for (const item of allItems) {
        const pid = item.protocol_id;
        if (!itemsByProtocol[pid]) itemsByProtocol[pid] = [];
        itemsByProtocol[pid].push(item);
      }

      // Build item→protocol map for evidences
      const itemToProtocol: Record<string, string> = {};
      for (const item of allItems) {
        itemToProtocol[item.id] = item.protocol_id;
      }

      const evidencesByProtocol: Record<string, Evidence[]> = {};
      for (const ev of allEvidences) {
        const pid = itemToProtocol[ev.protocol_item_id];
        if (!pid) continue;
        if (!evidencesByProtocol[pid]) evidencesByProtocol[pid] = [];
        evidencesByProtocol[pid].push(ev);
      }

      console.log(`[Preload] ${protocolIds.length} protocolos, ${allItems.length} items, ${allEvidences.length} evidencias precargadas`);

      return { itemsByProtocol, evidencesByProtocol };
    },
    enabled: !!projectId,
    staleTime: 10 * 60 * 1000, // 10 min — stays fresh for the session
    gcTime: 30 * 60 * 1000,    // 30 min in memory
  });
}
