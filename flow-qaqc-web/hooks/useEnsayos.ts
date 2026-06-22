/**
 * useEnsayos — modos de llenado de protocolos (v31, Parte D) + creación con
 * codificación correlativa (Parte E), lado web.
 *
 * - `useEnsayosData(projectId)`: protocolos + plantillas + sectores del
 *   proyecto (las 3 vistas agrupan client-side sobre los MISMOS datos).
 * - `createEnsayoInstances(...)`: núcleo de creación de N instancias SIN
 *   ubicación (o con ella — lo reusa el flujo clásico), con código correlativo
 *   si el proyecto lo tiene activo y retry ante colisión 23505 del índice
 *   único (otro dispositivo ganó el seq): re-lee los códigos remotos,
 *   re-secuencia y reintenta (máx 5).
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@lib/supabase/client';
import { mergeFeatureFlags, type Protocol, type ProjectSector, type ProtocolTemplate, type ProtocolTemplateItem } from '@/types';
import {
  buildProtocolCode, nextSeq, validateMask, todayEnsayoDate, parseEnsayoDate,
} from '@lib/protocolCode';

const supabase = createClient();

export type EnsayosMode = 'sector' | 'type' | 'date';

// ─────────────────────────── Datos para las vistas ───────────────────────────

export interface EnsayosData {
  protocols: Protocol[];
  templates: ProtocolTemplate[];
  sectors: ProjectSector[];
}

export function useEnsayosData(projectId: string) {
  return useQuery({
    queryKey: ['ensayos-data', projectId],
    queryFn: async (): Promise<EnsayosData> => {
      const [protosRes, tmplsRes, sectorsRes] = await Promise.all([
        supabase.from('protocols')
          .select('id, project_id, location_id, template_id, protocol_number, location_reference, status, protocol_code, ensayo_date, ensayo_time, sector_id, created_at')
          .eq('project_id', projectId),
        supabase.from('protocol_templates')
          .select('id, project_id, id_protocolo, name, is_hidden')
          .eq('project_id', projectId)
          .order('id_protocolo'),
        supabase.from('project_sectors')
          .select('id, project_id, name, sort_order')
          .eq('project_id', projectId),
      ]);
      const sectors = ((sectorsRes.data ?? []) as (ProjectSector & { sort_order?: number | null })[])
        .sort((a, b) => ((a.sort_order ?? 9999) - (b.sort_order ?? 9999)) || a.name.localeCompare(b.name));
      return {
        protocols: (protosRes.data ?? []) as Protocol[],
        templates: (tmplsRes.data ?? []) as ProtocolTemplate[],
        sectors,
      };
    },
    enabled: !!projectId,
    staleTime: 0,
  });
}

// ─────────────────────────── Creación de instancias ──────────────────────────

export interface CreateEnsayosArgs {
  projectId: string;
  templateId: string;
  templateName: string;
  templateIdProtocolo?: string | null;
  count?: number;
  locationId?: string | null;
  locationName?: string | null;
  sectorId?: string | null;
  sectorName?: string | null;
  /** YYYY-MM-DD. Default hoy. */
  ensayoDate?: string | null;
  /** v32 — HH:MM. Default: hora del sistema al guardar. */
  ensayoTime?: string | null;
  repeatChoices?: Record<string, number>;
}

export interface CreateEnsayosResult {
  protocols: Protocol[];
  codes: (string | null)[];
  warnings: string[];
}

function isCodeUniqueViolation(err: { code?: string; message?: string; details?: string } | null): boolean {
  if (!err) return false;
  return err.code === '23505' && `${err.message ?? ''} ${err.details ?? ''}`.includes('protocols_code_uniq');
}

async function fetchProjectCodes(projectId: string): Promise<string[]> {
  const { data } = await supabase
    .from('protocols')
    .select('protocol_code')
    .eq('project_id', projectId)
    .not('protocol_code', 'is', null);
  return ((data ?? []) as { protocol_code: string | null }[]).map(r => r.protocol_code!).filter(Boolean);
}

export async function createEnsayoInstances(args: CreateEnsayosArgs): Promise<CreateEnsayosResult> {
  const count = Math.max(1, Math.min(50, args.count ?? 1));
  const now = Date.now();
  const warnings: string[] = [];
  const ensayoDate = args.ensayoDate ?? todayEnsayoDate();

  // 1. Flags del proyecto (codificación).
  const { data: projData } = await supabase.from('projects').select('feature_flags').eq('id', args.projectId).single();
  const flags = mergeFeatureFlags((projData?.feature_flags ?? null) as Parameters<typeof mergeFeatureFlags>[0]);
  const codesOn = flags.protocol_codes && validateMask(flags.coding_mask_default).length === 0;
  // {TIPO} = id_protocolo de la plantilla; si el caller no lo pasó (flujo
  // clásico por ubicación), se consulta — el código debe salir SIEMPRE del
  // mismo tipo para que el ámbito del correlativo sea estable.
  let tipo = (args.templateIdProtocolo ?? '').trim();
  if (!tipo && codesOn) {
    const { data: t } = await supabase.from('protocol_templates').select('id_protocolo').eq('id', args.templateId).single();
    tipo = ((t?.id_protocolo as string | null) ?? '').trim();
  }
  if (!tipo) tipo = (args.templateName ?? '').trim();
  // Sin tipo no hay ámbito de correlativo: mejor crear SIN código (y avisar)
  // que generar un código malformado tipo "-260001" que colisiona entre tipos.
  const effectiveCodesOn = codesOn && !!tipo;
  if (codesOn && !tipo) warnings.push('Plantilla sin id_protocolo ni nombre: el ensayo se creó sin código.');
  const date = parseEnsayoDate(ensayoDate) ?? new Date();

  // 2. Items de la plantilla + expansión paramétrica (una vez para el lote).
  const { data: templateItems, error: itemsErr } = await supabase
    .from('protocol_template_items')
    .select('*')
    .eq('template_id', args.templateId)
    .order('created_at', { ascending: true });
  if (itemsErr) throw itemsErr;
  const { expandTemplateItems } = await import('@lib/parametricExpand');
  const { items: expanded, warnings: expWarnings } = expandTemplateItems(
    ((templateItems ?? []) as ProtocolTemplateItem[]).map(ti => ({
      partida_item: ti.partida_item,
      item_description: ti.item_description,
      validation_method: ti.validation_method,
      section: ti.section,
    })),
    args.repeatChoices ?? {},
  );
  warnings.push(...expWarnings);

  // 3. Secuencia inicial del ámbito (tipo+año+proyecto).
  let knownCodes: string[] = effectiveCodesOn ? await fetchProjectCodes(args.projectId) : [];
  let seq = effectiveCodesOn ? nextSeq(knownCodes, flags.coding_mask_default, tipo, date) : 0;

  const createdProtocols: Protocol[] = [];
  const codes: (string | null)[] = [];

  for (let i = 0; i < count; i++) {
    let protocol: Protocol | null = null;
    let code: string | null = null;
    // Retry ante colisión del índice único de códigos (máx 5 por instancia).
    for (let attempt = 0; attempt < 5; attempt++) {
      code = effectiveCodesOn
        ? buildProtocolCode(flags.coding_mask_default, { tipo, date, seq, sector: args.sectorName ?? null })
        : null;
      const { data, error } = await supabase
        .from('protocols')
        .insert({
          id: crypto.randomUUID(),
          project_id: args.projectId,
          location_id: args.locationId ?? null,
          template_id: args.templateId,
          protocol_number: args.templateName,
          location_reference: args.locationName ?? args.sectorName ?? '',
          status: 'DRAFT',
          sector_id: args.sectorId ?? null,
          ...(args.sectorId ? { sector_assigned_manually: true } : {}),
          protocol_code: code,
          ensayo_date: ensayoDate,
          ensayo_time: args.ensayoTime
            ?? `${String(new Date().getHours()).padStart(2, '0')}:${String(new Date().getMinutes()).padStart(2, '0')}`,
          created_at: now,
          updated_at: now,
        })
        .select()
        .single();
      if (!error) { protocol = data as Protocol; break; }
      if (effectiveCodesOn && isCodeUniqueViolation(error)) {
        // Otro dispositivo tomó este seq: re-leer y re-secuenciar.
        knownCodes = await fetchProjectCodes(args.projectId);
        seq = nextSeq(knownCodes, flags.coding_mask_default, tipo, date);
        continue;
      }
      throw error;
    }
    if (!protocol) throw new Error('No se pudo asignar un código único tras 5 intentos.');
    if (effectiveCodesOn) { knownCodes.push(code!); seq++; }

    if (expanded.length > 0) {
      const itemsToInsert = expanded.map(ti => ({
        id: crypto.randomUUID(),
        protocol_id: protocol!.id,
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
      const { error: insertErr } = await supabase.from('protocol_items').insert(itemsToInsert);
      if (insertErr) throw insertErr;
    }
    createdProtocols.push(protocol);
    codes.push(code);
  }

  return { protocols: createdProtocols, codes, warnings };
}

export function useCreateEnsayos(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: Omit<CreateEnsayosArgs, 'projectId'>) =>
      createEnsayoInstances({ ...args, projectId }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ensayos-data', projectId] });
      qc.invalidateQueries({ queryKey: ['location-progress', projectId] });
      qc.invalidateQueries({ queryKey: ['project-metrics', projectId] });
    },
  });
}
