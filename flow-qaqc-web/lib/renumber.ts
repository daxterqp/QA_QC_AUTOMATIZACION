/**
 * renumber (v63) — "Restablecer numeración" (modo B). Espejo de src/services/RenumberService.ts.
 *
 * Reasigna los protocol_code desde 1 dentro de cada grupo de correlativo (tipo|año[|sector][|mes]),
 * ordenando por FECHA DE ENSAYO (asc) → elimina los huecos de los borrados. Seguro por id. El RPC
 * transaccional v63 aplica los códigos en 2 fases (temporal → final).
 */
import { createClient } from '@lib/supabase/client';
import { mergeFeatureFlags } from '@/types';
import { pickMask, buildProtocolCode, parseEnsayoDate } from '@lib/protocolCode';
import { buildSampleCode } from '@lib/sampleCode';

const supabase = createClient();

export async function renumberProject(projectId: string): Promise<{ ok: boolean; count?: number; reason?: string }> {
  try {
    const { data: project } = await supabase.from('projects').select('feature_flags').eq('id', projectId).single();
    const flags = mergeFeatureFlags(((project as any)?.feature_flags ?? null));
    if (!flags.protocol_codes) return { ok: false, reason: 'no_coding' };
    const resetScope = flags.coding_seq_reset === 'year_sector' ? { sector: true }
      : flags.coding_seq_reset === 'year_month' ? { month: true } : {};

    const { data: protos } = await supabase
      .from('protocols').select('id, protocol_code, template_id, sector_id, ensayo_date, created_at')
      .eq('project_id', projectId);
    const list = (protos ?? []) as any[];
    const tmplIds = Array.from(new Set(list.map(p => p.template_id).filter(Boolean)));
    const [{ data: tpls }, { data: secs }] = await Promise.all([
      tmplIds.length ? supabase.from('protocol_templates').select('id, id_protocolo').in('id', tmplIds) : Promise.resolve({ data: [] as any[] }),
      supabase.from('project_sectors').select('id, name').eq('project_id', projectId),
    ]);
    const tplById = new Map(((tpls ?? []) as any[]).map(t => [t.id, t]));
    const secById = new Map(((secs ?? []) as any[]).map(s => [s.id, s]));
    const sectorNameOf = (p: any): string | null => (p.sector_id ? (secById.get(p.sector_id)?.name ?? null) : null);

    const groups = new Map<string, any[]>();
    const tipoOf = new Map<string, string>();
    for (const p of list) {
      const tipo = p.template_id ? (tplById.get(p.template_id)?.id_protocolo ?? null) : null;
      if (!tipo) continue;
      const date = parseEnsayoDate(p.ensayo_date) ?? new Date();
      const sectorPart = resetScope.sector ? `|${(sectorNameOf(p) ?? '').trim().toUpperCase().replace(/\s+/g, '')}` : '';
      const monthPart = resetScope.month ? `|M${date.getMonth() + 1}` : '';
      const gk = `${tipo}|${date.getFullYear()}${sectorPart}${monthPart}`;
      if (!groups.has(gk)) { groups.set(gk, []); tipoOf.set(gk, tipo); }
      groups.get(gk)!.push(p);
    }

    const codes: { id: string; code: string }[] = [];
    const counters: { group_key: string; last_seq: number }[] = [];
    for (const [gk, g] of Array.from(groups)) {
      const tipo = tipoOf.get(gk)!;
      const mask = pickMask(flags.coding_mask_default, flags.coding_mask_by_type, tipo);
      g.sort((a: any, b: any) => {
        const da = parseEnsayoDate(a.ensayo_date)?.getTime() ?? 0;
        const db = parseEnsayoDate(b.ensayo_date)?.getTime() ?? 0;
        return (da - db) || ((Number(a.created_at) || 0) - (Number(b.created_at) || 0));
      });
      g.forEach((p: any, i: number) => {
        const date = parseEnsayoDate(p.ensayo_date) ?? new Date();
        codes.push({ id: p.id, code: buildProtocolCode(mask, { tipo, date, seq: i + 1, sector: sectorNameOf(p) }) });
      });
      counters.push({ group_key: gk, last_seq: g.length });
    }
    if (codes.length === 0) return { ok: true, count: 0 };

    const { data, error } = await supabase.rpc('renumber_protocols', { p_project_id: projectId, p_codes: codes, p_counters: counters });
    if (error) return { ok: false, reason: error.message };
    return { ok: true, count: (data as any)?.renumbered ?? codes.length };
  } catch (e: any) {
    return { ok: false, reason: e?.message ?? 'error' };
  }
}

/** v65 — "Restablecer numeración" de MUESTRAS (modo B). Seq global por proyecto: reasigna desde 1
 *  ordenando por FECHA DE MUESTRA. Espejo de RenumberService.renumberSamples. */
export async function renumberSamples(projectId: string): Promise<{ ok: boolean; count?: number; reason?: string }> {
  try {
    const { data: project } = await supabase.from('projects').select('sample_identifier').eq('id', projectId).single();
    const sampleIdentifier = (((project as any)?.sample_identifier ?? '') as string).trim();
    const { data: samples } = await supabase.from('samples').select('id, sample_date, created_at').eq('project_id', projectId);
    const list = (samples ?? []) as any[];
    if (list.length === 0) return { ok: true, count: 0 };
    list.sort((a, b) => {
      const da = parseEnsayoDate(a.sample_date)?.getTime() ?? 0;
      const db = parseEnsayoDate(b.sample_date)?.getTime() ?? 0;
      return (da - db) || ((Number(a.created_at) || 0) - (Number(b.created_at) || 0));
    });
    const codes = list.map((s, i) => ({ id: s.id, code: buildSampleCode(sampleIdentifier, s.sample_date ?? undefined, i + 1), seq: i + 1 }));
    const { data, error } = await supabase.rpc('renumber_samples', { p_project_id: projectId, p_codes: codes });
    if (error) return { ok: false, reason: error.message };
    return { ok: true, count: (data as any)?.renumbered ?? codes.length };
  } catch (e: any) {
    return { ok: false, reason: e?.message ?? 'error' };
  }
}
