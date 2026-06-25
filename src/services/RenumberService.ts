/**
 * RenumberService (v63) — "Restablecer numeración" (modo B / in_list_reassignable).
 *
 * Reasigna los protocol_code del proyecto desde 1 dentro de cada grupo de correlativo
 * (tipo|año[|sector][|mes]), ordenando por FECHA DE ENSAYO (asc) → elimina los huecos que
 * dejaron los borrados intermedios. Seguro porque las referencias entre ensayos son por ID.
 *
 * El cómputo (máscara/ámbito) vive en el cliente (igual que la creación); el RPC transaccional
 * v63 aplica los códigos en 2 fases (temporal → final) para no chocar con el índice único.
 */
import { Q } from '@nozbe/watermelondb';
import { supabase } from '@config/supabase';
import { protocolsCollection, protocolTemplatesCollection, projectsCollection, projectSectorsCollection, samplesCollection } from '@db/index';
import { parseFeatureFlagsJson } from '@utils/featureFlags';
import { pickMask, buildProtocolCode, parseEnsayoDate, type SeqResetScope } from '@utils/protocolCode';
import { buildSampleCode } from '@utils/sampleCode';
import { pullProjectFromCloud } from '@services/SupabaseSyncService';

export type RenumberResult = { ok: boolean; count?: number; reason?: 'no_coding' | string };

export async function renumberProject(projectId: string): Promise<RenumberResult> {
  try {
    const projRow: any = await projectsCollection.find(projectId).catch(() => null);
    const flags = parseFeatureFlagsJson(projRow?.featureFlags);
    if (!flags.protocol_codes) return { ok: false, reason: 'no_coding' };
    const resetScope: SeqResetScope = flags.coding_seq_reset === 'year_sector' ? { sector: true }
      : flags.coding_seq_reset === 'year_month' ? { month: true } : {};

    const protos: any[] = await protocolsCollection.query(Q.where('project_id', projectId)).fetch();
    const tmplIds = Array.from(new Set(protos.map(p => p.templateId).filter(Boolean)));
    const [templates, sectors] = await Promise.all([
      tmplIds.length ? protocolTemplatesCollection.query(Q.where('id', Q.oneOf(tmplIds))).fetch().catch(() => [] as any[]) : Promise.resolve([] as any[]),
      projectSectorsCollection.query(Q.where('project_id', projectId)).fetch().catch(() => [] as any[]),
    ]);
    const tplById = new Map((templates as any[]).map(t => [t.id, t]));
    const secById = new Map((sectors as any[]).map(s => [s.id, s]));

    const sectorNameOf = (p: any): string | null => (p.sectorId ? (secById.get(p.sectorId)?.name ?? null) : null);
    const groupKeyOf = (p: any): { gk: string; tipo: string } | null => {
      const tipo = p.templateId ? (tplById.get(p.templateId)?.idProtocolo ?? null) : null;
      if (!tipo) return null;
      const date = parseEnsayoDate(p.ensayoDate) ?? new Date();
      const sectorPart = resetScope.sector ? `|${(sectorNameOf(p) ?? '').trim().toUpperCase().replace(/\s+/g, '')}` : '';
      const monthPart = resetScope.month ? `|M${date.getMonth() + 1}` : '';
      return { gk: `${tipo}|${date.getFullYear()}${sectorPart}${monthPart}`, tipo };
    };

    // Agrupar por correlativo.
    const groups = new Map<string, any[]>();
    const tipoOf = new Map<string, string>();
    for (const p of protos) {
      const info = groupKeyOf(p);
      if (!info) continue;   // sin tipo → no se recodifica
      if (!groups.has(info.gk)) { groups.set(info.gk, []); tipoOf.set(info.gk, info.tipo); }
      groups.get(info.gk)!.push(p);
    }

    const codes: { id: string; code: string }[] = [];
    const counters: { group_key: string; last_seq: number }[] = [];
    for (const [gk, list] of groups) {
      const tipo = tipoOf.get(gk)!;
      const mask = pickMask(flags.coding_mask_default, flags.coding_mask_by_type, tipo);
      // Orden por FECHA DE ENSAYO asc; desempate estable por creación.
      list.sort((a, b) => {
        const da = parseEnsayoDate(a.ensayoDate)?.getTime() ?? 0;
        const db = parseEnsayoDate(b.ensayoDate)?.getTime() ?? 0;
        return (da - db) || ((a._raw?.created_at ?? 0) - (b._raw?.created_at ?? 0));
      });
      list.forEach((p, i) => {
        const date = parseEnsayoDate(p.ensayoDate) ?? new Date();
        const code = buildProtocolCode(mask, { tipo, date, seq: i + 1, sector: sectorNameOf(p) });
        // Solo incluir si cambia (igual lo incluimos todo para que la fase-1 libere su código viejo).
        codes.push({ id: p.id, code });
      });
      counters.push({ group_key: gk, last_seq: list.length });
    }
    if (codes.length === 0) return { ok: true, count: 0 };

    const { data, error } = await supabase.rpc('renumber_protocols', { p_project_id: projectId, p_codes: codes, p_counters: counters });
    if (error) return { ok: false, reason: error.message };
    await pullProjectFromCloud(projectId).catch(() => {});
    return { ok: true, count: (data as any)?.renumbered ?? codes.length };
  } catch (e: any) {
    return { ok: false, reason: e?.message ?? 'error' };
  }
}

/**
 * v65 — "Restablecer numeración" de MUESTRAS (modo B). Las muestras usan un correlativo GLOBAL
 * por proyecto (sin group_key): reasigna seq + sample_code desde 1, ordenando por FECHA DE MUESTRA.
 */
export async function renumberSamples(projectId: string): Promise<RenumberResult> {
  try {
    const projRow: any = await projectsCollection.find(projectId).catch(() => null);
    const sampleIdentifier = ((projRow?.sampleIdentifier ?? '') as string).trim();
    const samples: any[] = await samplesCollection.query(Q.where('project_id', projectId)).fetch();
    if (samples.length === 0) return { ok: true, count: 0 };
    samples.sort((a, b) => {
      const da = parseEnsayoDate(a.sampleDate)?.getTime() ?? 0;
      const db = parseEnsayoDate(b.sampleDate)?.getTime() ?? 0;
      return (da - db) || ((a._raw?.created_at ?? 0) - (b._raw?.created_at ?? 0));
    });
    const codes = samples.map((s, i) => ({ id: s.id, code: buildSampleCode(sampleIdentifier, s.sampleDate ?? undefined, i + 1), seq: i + 1 }));
    const { data, error } = await supabase.rpc('renumber_samples', { p_project_id: projectId, p_codes: codes });
    if (error) return { ok: false, reason: error.message };
    await pullProjectFromCloud(projectId).catch(() => {});
    return { ok: true, count: (data as any)?.renumbered ?? codes.length };
  } catch (e: any) {
    return { ok: false, reason: e?.message ?? 'error' };
  }
}
