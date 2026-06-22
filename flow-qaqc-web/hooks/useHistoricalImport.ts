/**
 * useHistoricalImport — orquestador del flujo de importación de protocolos históricos.
 *
 * Fases (alineadas con el plan):
 *   1. parseAndValidate(file): parsea Excel + valida → ValidationResult + reverse lookup de matrices/locations.
 *   2. resolveUsers(unknownUsers, resolutions): crea users nuevos / mapea a existentes → userMap.
 *   3. dedup(validInstances): consulta external_id existentes en DB.
 *   4. executeImport(instances, userMap): inserta protocols + protocol_items por instancia + snapshot.
 *   5. devuelve summary { created, skipped, warnings }.
 */

import { useState, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { createClient } from '@lib/supabase/client';
import { parseHistoricalExcel } from '@lib/historicalExcelParser';
import {
  buildTemplateContext, validateImport, assembleProtocolItems, userKey,
  type HistoricalImportInstance, type TemplateContext, type ValidationResult,
  type UnknownUser, type ImportWarning, type ImportError,
} from '@lib/historicalImport';

const supabase = createClient();

/**
 * Invoca la Edge Function `admin-users` y propaga el `{ error }` del body cuando la
 * respuesta es no-2xx (mismo patrón que hooks/useUsers.ts). El INSERT directo a
 * `users` está denegado por RLS, así que el alta de usuarios nuevos durante el
 * import histórico debe pasar por aquí.
 */
async function invokeAdminUsers<T = { ok: true; id?: string }>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('admin-users', { body });
  if (error) {
    let message = error.message ?? String(error);
    const ctx = (error as { context?: unknown }).context;
    if (ctx && typeof (ctx as Response).json === 'function') {
      try {
        const parsed = await (ctx as Response).json();
        if (parsed?.error) message = parsed.error;
      } catch { /* body no era JSON */ }
    }
    throw new Error(message);
  }
  return data as T;
}

/** Epoch ms → fecha local YYYY-MM-DD (para protocols.ensayo_date, v31). */
function toYmd(ms: number): string {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// ───────────────────────────── Tipos públicos ────────────────────────────────

export interface UserResolution {
  /** Key del user a resolver (userKey(name, apellido)) */
  key: string;
  name: string;
  apellido?: string;
  action: 'create' | 'map' | 'skip';
  /** Si action='create': el rol nuevo */
  role?: 'CREATOR' | 'RESIDENT' | 'SUPERVISOR' | 'OPERATOR';
  /** Si action='map': el user_id existente */
  mapToUserId?: string;
}

export interface ImportSummary {
  created: number;
  skipped: number;
  errors: ImportError[];
  warnings: ImportWarning[];
}

export interface ParseAndValidateResult extends ValidationResult {
  /** Templates del proyecto cargados (para la fase de assemble) */
  templates: Map<string, TemplateContext>;
  /** Existing external_ids en el proyecto — para mostrar preview de dedup */
  existingExternalIds: Set<string>;
}

/** Catálogo del proyecto para validar un import (templates+items → contexts,
 *  nombres de ubicaciones, users existentes, external_ids para dedup).
 *  Compartido entre el import Excel histórico y el import CSV de ensayos. */
export interface ProjectImportCatalog {
  templates: Map<string, TemplateContext>;
  locationNames: Set<string>;
  existingUserKeys: Set<string>;
  existingExternalIds: Set<string>;
}

export async function loadProjectImportCatalog(projectId: string): Promise<ProjectImportCatalog> {
  // 1. Templates del proyecto + items
  const { data: tmplsData } = await supabase
    .from('protocol_templates')
    .select('id, id_protocolo, name')
    .eq('project_id', projectId);
  const tmpls = (tmplsData ?? []) as { id: string; id_protocolo: string; name: string }[];

  const templateIds = tmpls.map(t => t.id);
  let allItems: { id: string; template_id: string; partida_item: string | null; item_description: string; validation_method: string | null; section: string | null }[] = [];
  if (templateIds.length > 0) {
    const { data: itemsData } = await supabase
      .from('protocol_template_items')
      .select('id, template_id, partida_item, item_description, validation_method, section')
      .in('template_id', templateIds);
    allItems = (itemsData ?? []) as typeof allItems;
  }

  const templates = new Map<string, TemplateContext>();
  for (const t of tmpls) {
    const items = allItems.filter(i => i.template_id === t.id);
    templates.set(t.id_protocolo, buildTemplateContext(t, items));
  }

  // 2. Locations
  const { data: locsData } = await supabase
    .from('locations')
    .select('id, name')
    .eq('project_id', projectId);
  const locationNames = new Set(((locsData ?? []) as { name: string }[]).map(l => l.name.toLowerCase().trim()));

  // 3. Users existentes
  const { data: usersData } = await supabase
    .from('users')
    .select('id, name, apellido');
  const usersAll = (usersData ?? []) as { id: string; name: string; apellido: string | null }[];
  const existingUserKeys = new Set(usersAll.map(u => userKey(u.name, u.apellido ?? undefined)));

  // 4. external_ids existentes (dedup)
  const { data: existingData } = await supabase
    .from('protocols')
    .select('external_id')
    .eq('project_id', projectId)
    .not('external_id', 'is', null);
  const existingExternalIds = new Set((existingData ?? []).map((r: { external_id: string | null }) => r.external_id!).filter(Boolean));

  return { templates, locationNames, existingUserKeys, existingExternalIds };
}

// ───────────────────────────── Hook ──────────────────────────────────────────

export function useHistoricalImport(projectId: string, currentUserId: string) {
  const qc = useQueryClient();
  const [isParsing, setIsParsing] = useState(false);
  const [isImporting, setIsImporting] = useState(false);

  /** Fase 1+3 combinadas: parsea Excel, valida contra templates+locations, prepara dedup info. */
  const parseAndValidate = useCallback(async (file: File): Promise<ParseAndValidateResult> => {
    setIsParsing(true);
    try {
      // 1. Parse Excel
      const { instances, errors: parseErrors } = await parseHistoricalExcel(file);

      // 2. Catálogo del proyecto (compartido con el import CSV de ensayos)
      const { templates, locationNames, existingUserKeys, existingExternalIds } =
        await loadProjectImportCatalog(projectId);

      // 3. Validar instancias
      const validation = validateImport(instances, templates, locationNames, existingUserKeys);
      validation.errors = [...parseErrors, ...validation.errors];

      return { ...validation, templates, existingExternalIds };
    } finally {
      setIsParsing(false);
    }
  }, [projectId]);

  /** Fase 2: Aplica las resoluciones del modal de users.
   *  Crea users nuevos en `users` table; devuelve el userMap final.
   *  Si action='skip' → el user queda sin FK (filled_by_id=null), nombre va a general_comment. */
  const resolveUsers = useCallback(async (resolutions: UserResolution[]): Promise<{
    userMap: Map<string, string | null>;  // userKey → user_id | null
    createdCount: number;
  }> => {
    const userMap = new Map<string, string | null>();
    let createdCount = 0;

    // Cargar users existentes
    const { data: usersData } = await supabase.from('users').select('id, name, apellido');
    const usersAll = (usersData ?? []) as { id: string; name: string; apellido: string | null }[];

    for (const res of resolutions) {
      if (res.action === 'skip') {
        userMap.set(res.key, null);
        continue;
      }
      if (res.action === 'map' && res.mapToUserId) {
        userMap.set(res.key, res.mapToUserId);
        continue;
      }
      if (res.action === 'create' && res.role) {
        // INSERT directo a `users` denegado por RLS → alta vía Edge Function `admin-users`.
        // El import histórico no trae email/password; el login es por EMAIL, así que
        // generamos un placeholder + password temporal para satisfacer el alta de Auth.
        // TODO: cuando el Excel histórico incluya email real, usarlo en vez del placeholder
        // y permitir al CREATOR resetear la contraseña desde la gestión de usuarios.
        const slug = `${res.name}${res.apellido ? '.' + res.apellido : ''}`
          .toLowerCase().trim()
          .normalize('NFD').replace(/[̀-ͯ]/g, '')   // sin acentos
          .replace(/[^a-z0-9]+/g, '.').replace(/^\.+|\.+$/g, '') || 'usuario';
        const email = `${slug}.${crypto.randomUUID().slice(0, 8)}@flowqc.local`;
        const password = `Tmp-${crypto.randomUUID().slice(0, 12)}`;
        const created = await invokeAdminUsers<{ ok: true; id: string }>({
          action: 'create',
          email,
          password,
          name: res.name,
          apellido: res.apellido ?? null,
          role: res.role,
          projectIds: [],
        }).catch((e) => { throw new Error(`No se pudo crear user "${res.name}": ${(e as Error).message}`); });
        userMap.set(res.key, created.id);
        createdCount++;
      }
    }

    // Para users ya existentes en el archivo (que no necesitaban resolución),
    // resolver vía la base actualizada.
    for (const u of usersAll) {
      const k = userKey(u.name, u.apellido ?? undefined);
      if (!userMap.has(k)) userMap.set(k, u.id);
    }

    qc.invalidateQueries({ queryKey: ['users'] });
    return { userMap, createdCount };
  }, [qc]);

  /** Fase 4: Inserta protocolos + protocol_items. Skip por external_id duplicado. */
  const executeImport = useCallback(async (
    validInstances: HistoricalImportInstance[],
    templates: Map<string, TemplateContext>,
    userMap: Map<string, string | null>,
    existingExternalIds: Set<string>,
    accumulatedWarnings: ImportWarning[],
  ): Promise<ImportSummary> => {
    setIsImporting(true);
    try {
      let created = 0;
      let skipped = 0;
      const errors: ImportError[] = [];
      const warnings = [...accumulatedWarnings];

      // Cargar locations completos (necesitamos location_id)
      const { data: locsData } = await supabase
        .from('locations').select('id, name').eq('project_id', projectId);
      const locsByName = new Map<string, string>();
      for (const l of (locsData ?? []) as { id: string; name: string }[]) {
        locsByName.set(l.name.toLowerCase().trim(), l.id);
      }

      for (const inst of validInstances) {
        try {
          // Skip si external_id ya existe
          if (existingExternalIds.has(inst.external_id)) {
            skipped++;
            continue;
          }

          const template = templates.get(inst.template_id_protocolo);
          if (!template) {
            errors.push({ instance_external_id: inst.external_id, reason: `Template ${inst.template_id_protocolo} no encontrado (race condition?)` });
            continue;
          }
          const locationId = locsByName.get(inst.location_name.toLowerCase().trim());
          if (!locationId) {
            errors.push({ instance_external_id: inst.external_id, reason: `Location ${inst.location_name} no encontrada` });
            continue;
          }

          const filledById = userMap.get(userKey(inst.filled_by_name, inst.filled_by_apellido)) ?? null;
          const signedById = userMap.get(userKey(inst.signed_by_name, inst.signed_by_apellido)) ?? null;

          // Si filled/signed user no resuelto → annotar en general_comment
          let generalComment = inst.general_comment ?? '';
          if (!filledById) {
            generalComment += `\nLlenado por: ${inst.filled_by_name}${inst.filled_by_apellido ? ' ' + inst.filled_by_apellido : ''} (no registrado)`;
          }
          if (!signedById) {
            generalComment += `\nFirmado por: ${inst.signed_by_name}${inst.signed_by_apellido ? ' ' + inst.signed_by_apellido : ''} (no registrado)`;
          }
          generalComment = generalComment.trim();

          const protocolId = crypto.randomUUID();
          const now = Date.now();

          // Insert protocol
          const { error: pErr } = await supabase.from('protocols').insert({
            id: protocolId,
            project_id: projectId,
            location_id: locationId,
            template_id: template.id,
            external_id: inst.external_id,
            is_historical: true,
            protocol_number: template.name,
            location_reference: inst.location_name,
            status: 'APPROVED',
            is_locked: true,
            corrections_allowed: false,
            upload_status: 'SYNCED',
            filled_by_id: filledById,
            signed_by_id: signedById,
            filled_at: inst.filled_at,
            submitted_at: inst.submitted_at ?? inst.filled_at,
            signed_at: inst.signed_at ?? inst.filled_at,
            // v31 — fecha del ENSAYO derivada del llenado: así los históricos
            // agrupan bien en el modo "por fecha" (no caen en "Sin fecha").
            ensayo_date: toYmd(inst.filled_at),
            general_comment: generalComment || null,
            imported_at: now,
            imported_by_id: currentUserId,
            created_at: now,
            updated_at: now,
          });
          if (pErr) {
            errors.push({ instance_external_id: inst.external_id, reason: `Error insertando protocol: ${pErr.message}` });
            continue;
          }

          // Assemble protocol_items + snapshot
          const { items: assembled } = assembleProtocolItems(inst, template);
          const protocolItemsRows = assembled.map(a => ({
            id: crypto.randomUUID(),
            protocol_id: protocolId,
            partida_item: a.partida_item,
            item_description: a.item_description,
            validation_method: a.validation_method,
            section: a.section,
            comments: a.comments,
            is_compliant: a.is_compliant,
            is_na: a.is_na,
            has_answer: a.has_answer,
            created_at: now,
            updated_at: now,
          }));

          // Insert por lotes
          const BATCH = 500;
          for (let i = 0; i < protocolItemsRows.length; i += BATCH) {
            const batch = protocolItemsRows.slice(i, i + BATCH);
            const { error: iErr } = await supabase.from('protocol_items').insert(batch);
            if (iErr) {
              errors.push({ instance_external_id: inst.external_id, reason: `Error insertando items (lote ${i / BATCH + 1}): ${iErr.message}` });
              break;
            }
          }

          created++;
          existingExternalIds.add(inst.external_id);  // por si hay duplicados dentro del mismo executeImport
        } catch (e) {
          errors.push({ instance_external_id: inst.external_id, reason: (e as Error).message });
        }
      }

      qc.invalidateQueries({ queryKey: ['protocols'] });
      qc.invalidateQueries({ queryKey: ['historical', projectId] });

      return { created, skipped, errors, warnings };
    } finally {
      setIsImporting(false);
    }
  }, [projectId, currentUserId, qc]);

  return {
    parseAndValidate,
    resolveUsers,
    executeImport,
    isParsing,
    isImporting,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Helper externo: para descargar plantilla por template id
// ────────────────────────────────────────────────────────────────────────────

import { generateHistoricalTemplateExcel } from '@lib/historicalExcelParser';

export async function downloadHistoricalTemplate(projectId: string, templateIdProtocolo: string): Promise<void> {
  // Carga el template + items
  const { data: tData } = await supabase
    .from('protocol_templates')
    .select('id, id_protocolo, name')
    .eq('project_id', projectId)
    .eq('id_protocolo', templateIdProtocolo)
    .single();
  if (!tData) throw new Error(`Template "${templateIdProtocolo}" no encontrado`);

  const { data: itemsData } = await supabase
    .from('protocol_template_items')
    .select('id, template_id, partida_item, item_description, validation_method, section')
    .eq('template_id', tData.id);

  const ctx = buildTemplateContext(
    { id: tData.id, id_protocolo: tData.id_protocolo, name: tData.name },
    (itemsData ?? []) as { id: string; template_id: string; partida_item: string | null; item_description: string; validation_method: string | null; section: string | null }[],
  );
  const blob = generateHistoricalTemplateExcel(ctx);

  // Descargar
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `historico-${templateIdProtocolo}.xlsx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
