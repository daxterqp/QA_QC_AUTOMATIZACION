import { useQuery, type QueryClient } from '@tanstack/react-query';
import { createClient } from '@lib/supabase/client';
import { fetchAllPages } from '@lib/pagedFetch';
import type { ProtocolItem, Evidence } from '@/types';

const supabase = createClient();

export interface PreloadedProjectData {
  itemsByProtocol: Record<string, ProtocolItem[]>;
  evidencesByProtocol: Record<string, Evidence[]>;
}

const PRELOAD_STALE = 10 * 60 * 1000; // 10 min
const PRELOAD_GC = 30 * 60 * 1000;    // 30 min

/** Núcleo del preload (reutilizado por el hook y por el prefetch al hover). */
async function fetchProjectPreload(projectId: string): Promise<PreloadedProjectData> {
      // 1. Get all protocol IDs for this project (non-draft) — v88 PAGINADO
      const protocols = await fetchAllPages<{ id: string }>((f, t) => supabase
        .from('protocols')
        .select('id')
        .eq('project_id', projectId)
        .in('status', ['SUBMITTED', 'APPROVED', 'REJECTED'])
        .order('id', { ascending: true })
        .range(f, t)).catch(() => [] as { id: string }[]);

      const protocolIds = protocols.map((p: { id: string }) => p.id);
      if (protocolIds.length === 0) return { itemsByProtocol: {}, evidencesByProtocol: {} };

      // 2. Batch-load ALL protocol items for all protocols
      const CHUNK = 50;
      const allItems: ProtocolItem[] = [];
      for (let i = 0; i < protocolIds.length; i += CHUNK) {
        const batch = protocolIds.slice(i, i + CHUNK);
        // v88 — PAGINADO: 50 protocolos × ~100 items superan el cap de 1000 y
        // el export del dossier salía con fichas VACÍAS en silencio.
        const data = await fetchAllPages<ProtocolItem>((f, t) => supabase
          .from('protocol_items')
          .select('*')
          .in('protocol_id', batch)
          .order('created_at', { ascending: true })
          .order('id', { ascending: true })
          .range(f, t)).catch(() => [] as ProtocolItem[]);
        allItems.push(...data);
      }

      // 3. Batch-load ALL evidences for all items
      const allItemIds = allItems.map(i => i.id);
      const allEvidences: Evidence[] = [];
      for (let i = 0; i < allItemIds.length; i += CHUNK) {
        const batch = allItemIds.slice(i, i + CHUNK);
        const data = await fetchAllPages<Evidence>((f, t) => supabase
          .from('evidences')
          .select('*')
          .in('protocol_item_id', batch)
          .order('id', { ascending: true })
          .range(f, t)).catch(() => [] as Evidence[]);
        allEvidences.push(...data);
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
}

/**
 * Preloads ALL protocol items and evidences for a project in a single batch.
 * Called once when user enters a project — data stays in cache for the session.
 */
export function useProjectPreload(projectId: string) {
  return useQuery({
    queryKey: ['project-preload', projectId],
    queryFn: () => fetchProjectPreload(projectId),
    enabled: !!projectId,
    staleTime: PRELOAD_STALE,
    gcTime: PRELOAD_GC,
  });
}

/** Prefetch del preload (p.ej. al pasar el mouse por la tarjeta del proyecto).
 *  No-op si ya está en caché y fresco; calienta la caché antes de entrar. */
export function prefetchProjectPreload(qc: QueryClient, projectId: string): void {
  if (!projectId) return;
  qc.prefetchQuery({
    queryKey: ['project-preload', projectId],
    queryFn: () => fetchProjectPreload(projectId),
    staleTime: PRELOAD_STALE,
    gcTime: PRELOAD_GC,
  });
}
