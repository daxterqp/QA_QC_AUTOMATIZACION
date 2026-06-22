'use client';

/**
 * useSummaryRows — Lectura de las "Tablas Resumen" desde la CACHÉ LOCAL,
 * alimentada por sync INCREMENTAL contra Supabase (orquestadora). No recarga
 * toda la tabla en cada consulta: solo trae lo nuevo/cambiado. El backfill
 * garantiza que no falte ningún ensayo.
 */
import { useQuery } from '@tanstack/react-query';
import { createClient } from '@lib/supabase/client';
import { parseSummaryConfig, type SummaryConfig } from '@lib/summaryTable';
import { loadSummary, type SummaryRowData } from '@lib/summarySync';

const supabase = createClient();
export type { SummaryRowData } from '@lib/summarySync';

export interface SummaryTemplate {
  id: string;
  id_protocolo: string;
  name: string | null;
  config: SummaryConfig | null;
  count: number;
}

/** Sync incremental + backfill → todas las filas del proyecto (caché local). */
export function useSummarySync(projectId: string) {
  return useQuery({
    queryKey: ['summary-sync', projectId],
    queryFn: () => loadSummary(projectId),
    enabled: !!projectId,
    staleTime: 15_000,        // incremental y barato; no spamea la red
    refetchOnMount: true,
  });
}

/** Tipos de ensayo (plantillas) que YA tienen filas resumen en este proyecto. */
export function useSummaryTemplates(projectId: string) {
  const { data: rows = [], isLoading: syncing } = useSummarySync(projectId);
  const labels = useQuery({
    queryKey: ['summary-template-labels', projectId],
    queryFn: async () => {
      const { data } = await supabase
        .from('protocol_templates')
        .select('id, id_protocolo, name, summary_config_json')
        .eq('project_id', projectId);
      return (data ?? []) as { id: string; id_protocolo: string; name: string | null; summary_config_json: unknown }[];
    },
    enabled: !!projectId,
    staleTime: 5 * 60 * 1000,
  });
  const counts = new Map<string, number>();
  for (const r of rows) if (r.template_id) counts.set(r.template_id, (counts.get(r.template_id) ?? 0) + 1);
  const byId = new Map((labels.data ?? []).map(t => [t.id, t]));
  const templates: SummaryTemplate[] = Array.from(counts, ([id, count]) => {
    const t = byId.get(id);
    return {
      id,
      id_protocolo: t?.id_protocolo ?? id,
      name: t?.name ?? null,
      config: parseSummaryConfig(t?.summary_config_json),
      count,
    };
  }).sort((a, b) => a.id_protocolo.localeCompare(b.id_protocolo));
  return { data: templates, isLoading: syncing || labels.isLoading };
}

/** Items de la plantilla (estructura de la ficha) — para construir columnas
 *  ORDENADAS y con encabezados limpios. Cacheado (la estructura no cambia seguido). */
export function useTemplateItems(templateId: string | null) {
  return useQuery({
    queryKey: ['template-items', templateId],
    queryFn: async () => {
      if (!templateId) return [];
      // Orden de la ficha = orden de inserción del Excel (created_at asc), igual
      // que useEnsayos. Así la tabla (izq→der) refleja la ficha (arriba→abajo).
      const { data } = await supabase
        .from('protocol_template_items')
        .select('id, partida_item, item_description, validation_method, section, created_at')
        .eq('template_id', templateId)
        .order('created_at', { ascending: true });
      return (data ?? []) as Array<{ id: string; partida_item: string | null; item_description: string; validation_method: string | null; section: string | null; created_at: string }>;
    },
    enabled: !!templateId,
    staleTime: 5 * 60 * 1000,
  });
}

/** Filas resumen de un tipo de ensayo (ordenadas por código), desde la caché. */
export function useSummaryRows(projectId: string, templateId: string | null) {
  const { data: rows = [], isLoading } = useSummarySync(projectId);
  const filtered = (templateId ? rows.filter(r => r.template_id === templateId) : [])
    .slice()
    .sort((a, b) => (a.protocol_code ?? '').localeCompare(b.protocol_code ?? '', undefined, { numeric: true }));
  return { data: filtered as SummaryRowData[], isLoading };
}
