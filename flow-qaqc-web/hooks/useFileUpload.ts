import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@lib/supabase/client';
import { uploadBlobToS3, sanitizeSegment } from '@lib/s3-upload';
import type { ProtocolTemplate, ProtocolTemplateItem, Location, Plan, Equipment, EquipmentType, EquipmentCategory } from '@/types';
import type { ExcelProtocolGroup, ExcelLocation, ExcelEquipment } from '@lib/excelParser';

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

// ── Tablas auxiliares de laboratorio (v41) → mapa para BUSCAR() ─────────────────
import type { AuxTables } from '@lib/formulaEval';

export function useLabAuxTables(projectId: string) {
  return useQuery({
    queryKey: ['lab-aux-tables', projectId],
    queryFn: async (): Promise<AuxTables> => {
      const { data } = await supabase
        .from('lab_aux_tables')
        .select('group_key, columns_json, rows_json')
        .eq('project_id', projectId);
      const map: AuxTables = {};
      for (const t of (data ?? []) as { group_key: string; columns_json: unknown; rows_json: unknown }[]) {
        map[String(t.group_key).toLowerCase()] = {
          columns: Array.isArray(t.columns_json) ? (t.columns_json as string[]) : [],
          rows: Array.isArray(t.rows_json) ? (t.rows_json as string[][]) : [],
        };
      }
      return map;
    },
    enabled: !!projectId,
    staleTime: 5 * 60 * 1000,
  });
}

// ── Ocultar / mostrar tipo de ensayo (v39) ─────────────────────────────────────
// No elimina nada: solo marca is_hidden. Un tipo oculto no aparece en los
// selectores de ensayo NUEVO ni se puede crear, pero sus registros siguen visibles.
export function useToggleTemplateHidden(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, hidden }: { id: string; hidden: boolean }) => {
      const { error } = await supabase
        .from('protocol_templates')
        .update({ is_hidden: hidden })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['templates', projectId] });
      qc.invalidateQueries({ queryKey: ['ensayos-data', projectId] });
      qc.invalidateQueries({ queryKey: ['location-protocols'] });
    },
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

// ── Local plans list (filesystem as source of truth) ─────────────────────────

export interface LocalPlanFile {
  filename:  string;
  planName:  string;
  localPath: string;
  s3Key:     string | null;
  locations: string[];
}

export function useLocalPlans(projectId: string, projectName: string, fileType: 'pdf' | 'dwg') {
  return useQuery({
    queryKey: ['local-plans', projectId, fileType],
    queryFn: async (): Promise<LocalPlanFile[]> => {
      if (!projectName) return [];
      const params = new URLSearchParams({ projectName, projectId, type: fileType });
      const res = await fetch(`/api/plans/local-list?${params}`);
      if (!res.ok) return [];
      const { files } = await res.json();
      return files as LocalPlanFile[];
    },
    enabled: !!projectId && !!projectName,
    staleTime: 0,
  });
}

// ── Plans list (Supabase — used by plan viewer, not by file-upload tab) ───────

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
  /** Warnings de validación (no bloquean). Ej: partida duplicada, gráfico con `//`. */
  warnings: string[];
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
  const warnings: string[] = [];
  // IDs de templates cuyos items cambiaron — los propagaremos a instancias DRAFT/IN_PROGRESS/REJECTED al final.
  const changedTemplateIds = new Set<string>();

  for (let i = 0; i < groups.length; i++) {
    onProgress?.(i + 1, groups.length);
    const group = groups[i];
    let template = templateByIdProtocolo.get(group.idProtocolo);
    let templateModified = false;

    if (!template) {
      // Insert new template
      const { data: newT, error } = await supabase
        .from('protocol_templates')
        .insert({ id: crypto.randomUUID(), project_id: projectId, id_protocolo: group.idProtocolo, name: group.protocolName, created_at: Date.now(), updated_at: Date.now() })
        .select().single();
      if (error) throw error;
      template = newT as ProtocolTemplate;
      added++;
    } else if (template.name !== group.protocolName && group.protocolName) {
      // Update template name if changed
      const { error: nameErr } = await supabase
        .from('protocol_templates')
        .update({ name: group.protocolName, updated_at: Date.now() })
        .eq('id', template.id);
      if (nameErr) console.warn('[importActivities] template name update error:', nameErr);
    }

    // Config de Tabla Resumen (hoja RESUMEN del Excel) → summary_config_json.
    // Best-effort: si la columna no existe (falta v38), solo se avisa.
    if (group.summaryConfig && template) {
      const { error: scErr } = await supabase
        .from('protocol_templates')
        .update({ summary_config_json: group.summaryConfig })
        .eq('id', template.id);
      if (scErr) console.warn('[importActivities] summary_config_json no guardado (¿corriste v38?):', scErr.message);
    }

    // ── Autoasignación de partida_item para filas de header (col-[…]) ────
    // Las filas de header van con partida_item vacío en el Excel y aquí se les
    // asigna `__hdr1__`, `__hdr2__`, … para evitar colisión en el upsert por
    // (template_id, partida_item). v34 — los headers pueden aparecer al inicio
    // de CADA sección (columnas variables), sin límite de 3 ni restricción de
    // posición.
    {
      let hdrCounter = 0;
      for (const act of group.activities) {
        const m = (act.validationMethod ?? '').trim();
        if (/^col-\[/i.test(m)) {
          hdrCounter++;
          if (!act.partidaItem) act.partidaItem = `__hdr${hdrCounter}__`;
        }
      }
    }
    // ── Autoasignación de partida_item para matrices `matrix-[Mx]` + `val-[…]` ──
    // matrix-[M1] → `__matrix_M1__`. Las val-[…] consecutivas → `__matrix_M1_1__`, `_2__`, etc.
    {
      let currentMatrix: string | null = null;
      let rowCounter = 0;
      for (const act of group.activities) {
        const m = (act.validationMethod ?? '').trim();
        const mh = m.match(/^matrix-\[([A-Za-z0-9_-]+)\]/i);
        if (mh) {
          currentMatrix = mh[1];
          rowCounter = 0;
          if (!act.partidaItem) act.partidaItem = `__matrix_${currentMatrix}__`;
          continue;
        }
        // Solo filas PURAS de matriz (todos los segmentos val-). Las filas MIXTAS
        // (`val-[50.8] // numerico-[…]`) son datos normales con valor fijo y no
        // pertenecen a una matriz — antes disparaban un falso warning.
        const isPureValRow = /^val-\[/i.test(m)
          && m.split('//').every(seg => seg.trim() === '' || /^val-\[[^\[\]]*\]$/i.test(seg.trim()));
        if (isPureValRow) {
          if (!currentMatrix) {
            if (!act.partidaItem) {
              warnings.push(`Protocolo "${group.idProtocolo}": fila val-[…] sin matriz declarada y sin partida → no se puede identificar.`);
            }
            continue;
          }
          rowCounter++;
          if (!act.partidaItem) act.partidaItem = `__matrix_${currentMatrix}_${rowCounter}__`;
        }
      }
    }
    // Validación extra: que un usuario no use accidentalmente `__hdrN__` como partida real
    for (const act of group.activities) {
      const m = (act.validationMethod ?? '').trim();
      if (!/^col-\[/i.test(m) && /^__hdr\d+__$/i.test(act.partidaItem ?? '')) {
        warnings.push(`Protocolo "${group.idProtocolo}": partida_item "${act.partidaItem}" colisiona con la convención reservada para encabezados.`);
      }
    }
    // ── Autoasignación de partida_item para directivas paramétricas (v25) ─────
    // `repeat-[grupo:min:max:default]` → directive partida `__repeat_<grupo>__`.
    // Las filas siguientes SIN partida_item explícito se asumen filas template
    // y reciben `__template_<grupo>_<offset>__` (offset 1,2,...). El bloque
    // termina al encontrar otra directiva o una fila con partida_item explícito.
    {
      let currentGroup: string | null = null;
      let tmplOffset = 0;
      for (const act of group.activities) {
        const m = (act.validationMethod ?? '').trim();
        const repeatM = m.match(/^repeat-\[\s*([A-Za-z][A-Za-z0-9_-]*)\s*:/i);
        if (repeatM) {
          currentGroup = repeatM[1];
          tmplOffset = 0;
          if (!act.partidaItem) act.partidaItem = `__repeat_${currentGroup}__`;
          continue;
        }
        if (currentGroup && !act.partidaItem) {
          tmplOffset++;
          act.partidaItem = `__template_${currentGroup}_${tmplOffset}__`;
        } else if (act.partidaItem && !/^__(template|repeat)_/.test(act.partidaItem)) {
          // partida explícita no-template → cierra el bloque del grupo actual.
          currentGroup = null;
          tmplOffset = 0;
        }
      }
    }

    // Validaciones (no bloqueantes) ────────────────────────────────────────
    // Partida duplicada dentro del mismo grupo (template)
    const seenPartidas = new Map<string, number>();
    for (const act of group.activities) {
      const p = (act.partidaItem ?? '').trim();
      if (!p) continue;
      const norm = p.toLowerCase();
      seenPartidas.set(norm, (seenPartidas.get(norm) ?? 0) + 1);
    }
    seenPartidas.forEach((count, p) => {
      if (count > 1) warnings.push(`Protocolo "${group.idProtocolo}": partida_item "${p}" aparece ${count} veces (la última sobreescribe).`);
    });
    // Gráfico mezclado con `//` (multi-celda no admitida para gráficos)
    for (const act of group.activities) {
      const m = (act.validationMethod ?? '').trim();
      if (/numerico-gr[12]\[/i.test(m) && m.includes('//')) {
        warnings.push(`Protocolo "${group.idProtocolo}", partida "${act.partidaItem}": un gráfico no admite columnas múltiples (\`//\`). El protocolo caerá al flujo clásico.`);
      }
    }

    // Upsert items
    for (const act of group.activities) {
      const key     = itemKey(template!.id, act.partidaItem);
      const existing = existingItemMap.get(key);

      if (!existing) {
        const now = Date.now();
        const { error: itemErr } = await supabase.from('protocol_template_items').insert({
          id:                crypto.randomUUID(),
          template_id:       template!.id,
          partida_item:      act.partidaItem || null,
          item_description:  act.itemDescription,
          validation_method: act.validationMethod || null,
          section:           act.section,
          created_at:        now,
          updated_at:        now,
        });
        if (itemErr) throw new Error(`Error insertando item: ${itemErr.message}`);
        templateModified = true;
      } else {
        const needsUpdate =
          existing.item_description  !== act.itemDescription ||
          existing.validation_method !== (act.validationMethod || null) ||
          existing.section           !== act.section;
        if (needsUpdate) {
          const { error: updErr } = await supabase.from('protocol_template_items')
            .update({
              item_description:  act.itemDescription,
              validation_method: act.validationMethod || null,
              section:           act.section,
              updated_at:        Date.now(),
            })
            .eq('id', existing.id);
          if (updErr) throw new Error(`Error actualizando item: ${updErr.message}`);
          templateModified = true;
        }
      }
    }

    if (templateModified && template) {
      changedTemplateIds.add(template.id);
      if (templateByIdProtocolo.has(group.idProtocolo)) modified++;
    }
  }

  // ── Propagar cambios a instancias existentes (DRAFT/IN_PROGRESS/REJECTED) ───
  if (changedTemplateIds.size > 0) {
    await propagateTemplateChangesToInstances(Array.from(changedTemplateIds));
  }

  return { added, modified, warnings };
}

/** Sincroniza las instancias DRAFT/IN_PROGRESS/REJECTED de cada template con la
 *  definición actual de sus protocol_template_items:
 *   - Inserta items nuevos del template que la instancia no tiene
 *   - Actualiza description/validation_method/section por match de partida_item
 *   - Elimina items que ya no están en el template
 *  No toca instancias SUBMITTED/APPROVED (son snapshot histórico). */
async function propagateTemplateChangesToInstances(templateIds: string[]) {
  // 1. Items finales de cada template
  const { data: tmplItems } = await supabase
    .from('protocol_template_items')
    .select('*')
    .in('template_id', templateIds);
  const itemsByTemplate = new Map<string, ProtocolTemplateItem[]>();
  for (const it of (tmplItems ?? []) as ProtocolTemplateItem[]) {
    const arr = itemsByTemplate.get(it.template_id) ?? [];
    arr.push(it);
    itemsByTemplate.set(it.template_id, arr);
  }

  // 2. Instancias DRAFT/IN_PROGRESS/REJECTED de esos templates
  const { data: instances } = await supabase
    .from('protocols')
    .select('id, template_id, status')
    .in('template_id', templateIds)
    .in('status', ['DRAFT', 'IN_PROGRESS', 'REJECTED']);

  if (!instances || instances.length === 0) return;
  const instanceIds = instances.map((p: { id: string }) => p.id);

  // 3. Items actuales de esas instancias
  type InstItem = {
    id: string; protocol_id: string; partida_item: string | null;
    item_description: string | null; validation_method: string | null; section: string | null;
  };
  const { data: instItems } = await supabase
    .from('protocol_items')
    .select('*')
    .in('protocol_id', instanceIds);
  const instItemsByProtocol = new Map<string, InstItem[]>();
  for (const ii of (instItems ?? []) as InstItem[]) {
    const arr = instItemsByProtocol.get(ii.protocol_id) ?? [];
    arr.push(ii);
    instItemsByProtocol.set(ii.protocol_id, arr);
  }

  const norm = (s: string | null) => (s ?? '').toLowerCase().trim();

  // 4. Por cada instancia: insertar/actualizar/eliminar para alinear con el template
  for (const inst of instances as Array<{ id: string; template_id: string }>) {
    const tItems = itemsByTemplate.get(inst.template_id) ?? [];
    const iItems = instItemsByProtocol.get(inst.id) ?? [];
    const tByKey = new Map(tItems.map(t => [norm(t.partida_item), t]));
    const iByKey = new Map(iItems.map(i => [norm(i.partida_item), i]));

    // Inserts (template tiene partida que instancia no tiene)
    const inserts = tItems.filter(t => !iByKey.has(norm(t.partida_item)));
    if (inserts.length > 0) {
      const now = Date.now();
      const rows = inserts.map(t => ({
        id: crypto.randomUUID(),
        protocol_id: inst.id,
        partida_item: t.partida_item,
        item_description: t.item_description,
        validation_method: t.validation_method,
        section: t.section,
        is_compliant: false,
        is_na: false,
        has_answer: false,
        comments: null,
        created_at: now,
        updated_at: now,
      }));
      await supabase.from('protocol_items').insert(rows);
    }

    // Updates (match por partida_item, actualizar campos descriptivos)
    // v32 — SOLO si algo cambió de verdad. Antes se actualizaba TODO item de
    // toda instancia con updated_at nuevo aunque nada hubiera cambiado; eso
    // hacía que el remoto pareciera "más fresco" que los valores llenados
    // offline en el celular y el siguiente pull los pisara sin necesidad.
    for (const ii of iItems) {
      const t = tByKey.get(norm(ii.partida_item));
      if (!t) continue;
      const needsUpdate =
        (ii.item_description ?? null)  !== (t.item_description ?? null) ||
        (ii.validation_method ?? null) !== (t.validation_method ?? null) ||
        (ii.section ?? null)           !== (t.section ?? null);
      if (!needsUpdate) continue;
      await supabase.from('protocol_items')
        .update({
          item_description:  t.item_description,
          validation_method: t.validation_method,
          section:           t.section,
          updated_at:        Date.now(),
        })
        .eq('id', ii.id);
    }

    // Deletes (instancia tiene partida que template ya no tiene)
    const toDelete = iItems.filter(i => !tByKey.has(norm(i.partida_item))).map(i => i.id);
    if (toDelete.length > 0) {
      await supabase.from('evidences').delete().in('protocol_item_id', toDelete);
      await supabase.from('protocol_items').delete().in('id', toDelete);
    }
  }
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
      const now = Date.now();
      const { error: locErr } = await supabase.from('locations').insert({
        id:            crypto.randomUUID(),
        project_id:    projectId,
        name:          loc.name,
        location_only: loc.locationOnly || null,
        specialty:     loc.specialty    || null,
        reference_plan: loc.referencePlan,
        template_ids:  loc.templateIds  || null,
        created_at:    now,
        updated_at:    now,
      });
      if (locErr) throw new Error(`Error insertando ubicación "${loc.name}": ${locErr.message}`);
      added++;
    } else {
      const needsUpdate =
        existing.location_only  !== (loc.locationOnly  || null) ||
        existing.specialty       !== (loc.specialty     || null) ||
        existing.reference_plan  !== loc.referencePlan          ||
        existing.template_ids    !== (loc.templateIds   || null);
      if (needsUpdate) {
        const { error: updErr } = await supabase.from('locations').update({
          location_only:  loc.locationOnly  || null,
          specialty:      loc.specialty     || null,
          reference_plan: loc.referencePlan,
          template_ids:   loc.templateIds   || null,
          updated_at:     Date.now(),
        }).eq('id', existing.id);
        if (updErr) throw new Error(`Error actualizando ubicación "${loc.name}": ${updErr.message}`);
        modified++;
      }
    }
  }

  return { added, modified };
}

// ── Equipos: upsert por (project_id, code) ────────────────────────────────────

export interface EquipmentImportSummary {
  added: number;
  modified: number;
  skipped: number;        // filas con tipo inválido o sin código
}

const VALID_EQ_TYPES: EquipmentType[] = [
  // Laboratorio
  'balanza', 'prensa', 'horno', 'tamiz', 'termometro',
  // Maquinaria pesada
  'excavadora', 'compactador', 'motoniveladora', 'retroexcavadora',
  'cargador_frontal', 'volquete', 'cisterna', 'rodillo',
  'otros',
];

export async function importEquipmentToSupabase(
  projectId: string,
  equipment: ExcelEquipment[],
  // v40 — La SECCIÓN que importa (Lab. / Maquinaria) decide la categoría; cuando
  // se pasa, sobreescribe la inferida por el parser (el usuario ya no necesita
  // una columna `Categoría`). Sin ella, se respeta la del parser (compat).
  forceCategory?: EquipmentCategory,
): Promise<EquipmentImportSummary> {
  const { data: existing } = await supabase
    .from('equipment')
    .select('*')
    .eq('project_id', projectId);

  const byCode = new Map<string, Equipment>(
    (existing ?? []).map((e: Equipment) => [e.code.trim().toLowerCase(), e]),
  );

  let added = 0, modified = 0, skipped = 0;
  for (const eq of equipment) {
    const code = eq.code.trim();
    if (!code) { skipped++; continue; }
    const typeNorm = (VALID_EQ_TYPES.includes(eq.type as EquipmentType) ? eq.type : 'otros') as EquipmentType;
    const category = forceCategory ?? eq.category;
    const prev = byCode.get(code.toLowerCase());
    // v28 — Para maquinaria pesada sin fecha de calibración, usar un sentinel
    // muy lejano (año 2099) — el campo es NOT NULL en Supabase. La UI sabe
    // ignorar la calibración cuando category=maquinaria_pesada.
    const calibMs = eq.nextCalibrationAt ?? Date.UTC(2099, 11, 31);
    if (!prev) {
      const now = Date.now();
      const { error } = await supabase.from('equipment').insert({
        id: crypto.randomUUID(),
        project_id: projectId,
        code,
        name: eq.name || code,
        type: typeNorm,
        category,
        brand: eq.brand,
        model: eq.model,
        serial: eq.serial,
        capacity: eq.capacity,
        resolution: eq.resolution,
        last_calibration_at: eq.lastCalibrationAt,
        next_calibration_at: calibMs,
        status: 'active',
        notes: eq.notes,
        created_at: now,
        updated_at: now,
      });
      if (error) throw new Error(`Error insertando equipo "${code}": ${error.message}`);
      added++;
    } else {
      const patch = {
        name: eq.name || prev.name,
        type: typeNorm,
        category,
        brand: eq.brand,
        model: eq.model,
        serial: eq.serial,
        capacity: eq.capacity,
        resolution: eq.resolution,
        last_calibration_at: eq.lastCalibrationAt,
        next_calibration_at: calibMs,
        notes: eq.notes,
        updated_at: Date.now(),
      };
      const { error } = await supabase.from('equipment').update(patch).eq('id', prev.id);
      if (error) throw new Error(`Error actualizando equipo "${code}": ${error.message}`);
      modified++;
    }
  }
  return { added, modified, skipped };
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

  const now = Date.now();
  const { data, error } = await supabase
    .from('plans')
    .insert({
      id:             crypto.randomUUID(),
      project_id:     projectId,
      name:           planName,
      file_uri:       '',
      s3_key:         s3Key,
      file_type:      'pdf',
      uploaded_by_id: '',
      created_at:     now,
      updated_at:     now,
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
    .update({ logo_s3_key: s3Key, updated_at: Date.now() })
    .eq('id', projectId);
  return s3Key;
}

// ── v27 — Trazabilidad Operacional importer ─────────────────────────────────

import type {
  TraceabilityImportResult, TraceabilityActivity,
  TraceabilityEquipActivity, TraceabilityShift, TraceabilityTemplateItem,
} from '@lib/excelParser';

export interface TraceabilityImportSummary {
  equipment:     { added: number; modified: number; skipped: number };
  activities:    { added: number; modified: number };
  links:         { added: number; modified: number; skipped: number };
  shifts:        { added: number; modified: number };
  templates:     { added: number; modified: number };
  templateItems: { added: number };
  warnings:      string[];
}

/** Upsert idempotente de todo el bundle del Excel de trazabilidad.
 *  - Equipos: upsert por (project_id, code) — reusa importEquipmentToSupabase.
 *  - Actividades: upsert por (project_id, name).
 *  - Equipo-Actividad: resuelve FK por nombre; warning si no resuelve.
 *  - Turnos: upsert por (project_id, name).
 *  - Plantillas: upsert por (project_id, name) + items (DELETE + INSERT al
 *    re-importar para mantener orden de filas del Excel). */
export async function importTraceabilityToSupabase(
  projectId: string,
  parsed: TraceabilityImportResult,
  // v40 — categoría forzada por la sección que importa (Lab. / Maquinaria).
  forceCategory?: EquipmentCategory,
): Promise<TraceabilityImportSummary> {
  const warnings = [...parsed.warnings];

  // Normaliza claves de dedup: NFD + sin diacríticos + lowercase + trim.
  // Evita duplicados por tildes/espacios (p. ej. "Compactacion" vs "Compactación").
  // Rango U+0300-U+036F = Combining Diacritical Marks.
  const DIACRITICS_RE = new RegExp(
    '[' + String.fromCharCode(0x0300) + '-' + String.fromCharCode(0x036f) + ']',
    'g',
  );
  const normalize = (s: string) =>
    s.normalize('NFD').replace(DIACRITICS_RE, '').toLowerCase().trim();

  // ── 1. Equipos (reusa importer existente) ───────────────────────────────
  let eqSummary = { added: 0, modified: 0, skipped: 0 };
  if (parsed.equipos.length > 0) {
    eqSummary = await importEquipmentToSupabase(projectId, parsed.equipos, forceCategory);
  }

  // ── 1b. Tablas auxiliares de laboratorio (v41) — upsert por (project, group_key).
  if (parsed.auxTables.length > 0) {
    const { data: existingAux } = await supabase
      .from('lab_aux_tables').select('id, group_key').eq('project_id', projectId);
    const auxByKey = new Map<string, string>((existingAux ?? []).map((t: any) => [t.group_key, t.id]));
    for (const t of parsed.auxTables) {
      const now = Date.now();
      const prevId = auxByKey.get(t.groupKey);
      const { error } = await supabase.from('lab_aux_tables').upsert({
        id: prevId ?? crypto.randomUUID(),
        project_id: projectId,
        group_key: t.groupKey,
        name: t.name,
        columns_json: t.columns,   // jsonb — supabase-js serializa el array
        rows_json: t.rows,
        ...(prevId ? {} : { created_at: now }),
        updated_at: now,
      }, { onConflict: 'project_id,group_key' });
      if (error) throw new Error(`Tabla auxiliar "${t.name}": ${error.message}`);
    }
  }

  // ── 2. Actividades ──────────────────────────────────────────────────────
  const { data: existingActs } = await supabase
    .from('activities').select('*').eq('project_id', projectId);
  const actsByName = new Map<string, any>(
    (existingActs ?? []).map((a: any) => [normalize(a.name), a]),
  );
  let actAdded = 0, actModified = 0;
  for (const a of parsed.actividades) {
    const prev = actsByName.get(normalize(a.name));
    const now = Date.now();
    if (!prev) {
      const id = crypto.randomUUID();
      const { error } = await supabase.from('activities').insert({
        id, project_id: projectId, name: a.name, kind: a.kind,
        created_at: now, updated_at: now,
      });
      if (error) throw new Error(`Actividad "${a.name}": ${error.message}`);
      actsByName.set(normalize(a.name), { id, name: a.name, kind: a.kind });
      actAdded++;
    } else if (prev.kind !== a.kind) {
      const { error } = await supabase.from('activities')
        .update({ kind: a.kind, updated_at: now }).eq('id', prev.id);
      if (error) throw new Error(`Actividad "${a.name}": ${error.message}`);
      actModified++;
    }
  }

  // ── 3. Turnos ───────────────────────────────────────────────────────────
  const { data: existingShifts } = await supabase
    .from('work_shifts').select('*').eq('project_id', projectId);
  const shiftsByName = new Map<string, any>(
    (existingShifts ?? []).map((s: any) => [normalize(s.name), s]),
  );
  let shiftAdded = 0, shiftModified = 0;
  for (const sh of parsed.turnos) {
    const prev = shiftsByName.get(normalize(sh.name));
    const now = Date.now();
    if (!prev) {
      const { error } = await supabase.from('work_shifts').insert({
        id: crypto.randomUUID(), project_id: projectId, name: sh.name,
        start_hour: sh.startHour, end_hour: sh.endHour,
        created_at: now, updated_at: now,
      });
      if (error) throw new Error(`Turno "${sh.name}": ${error.message}`);
      shiftAdded++;
    } else if (prev.start_hour !== sh.startHour || prev.end_hour !== sh.endHour) {
      const { error } = await supabase.from('work_shifts')
        .update({ start_hour: sh.startHour, end_hour: sh.endHour, updated_at: now })
        .eq('id', prev.id);
      if (error) throw new Error(`Turno "${sh.name}": ${error.message}`);
      shiftModified++;
    }
  }

  // ── 4. Plantillas + items ───────────────────────────────────────────────
  let tmplAdded = 0, tmplModified = 0, tmplItemAdded = 0;
  const tmplsByName = new Map<string, string>(); // name → templateId
  if (parsed.plantillas.length > 0) {
    const tmplNames = Array.from(new Set(parsed.plantillas.map(p => p.templateName)));
    const { data: existingTmpls } = await supabase
      .from('session_form_templates').select('*').eq('project_id', projectId);
    const existingByName = new Map<string, any>(
      (existingTmpls ?? []).map((t: any) => [normalize(t.name), t]),
    );
    for (const name of tmplNames) {
      const prev = existingByName.get(normalize(name));
      const now = Date.now();
      if (!prev) {
        const id = crypto.randomUUID();
        const { error } = await supabase.from('session_form_templates').insert({
          id, project_id: projectId, name, created_at: now, updated_at: now,
        });
        if (error) throw new Error(`Plantilla "${name}": ${error.message}`);
        tmplsByName.set(normalize(name), id);
        tmplAdded++;
      } else {
        tmplsByName.set(normalize(name), prev.id);
        // Re-import: borrar items previos y re-insertar (orden y completitud)
        const { error: delErr } = await supabase.from('session_form_template_items').delete().eq('template_id', prev.id);
        if (delErr) throw new Error('No se pudieron borrar items previos de plantilla ' + name + ': ' + delErr.message);
        await supabase.from('session_form_templates')
          .update({ updated_at: now }).eq('id', prev.id);
        tmplModified++;
      }
    }
    // Items
    for (const item of parsed.plantillas) {
      const tid = tmplsByName.get(normalize(item.templateName));
      if (!tid) continue;
      const now = Date.now();
      const { error } = await supabase.from('session_form_template_items').insert({
        id: crypto.randomUUID(), template_id: tid,
        partida_item: item.partidaItem,
        item_description: item.itemDescription,
        validation_method: item.validationMethod,
        section: item.section,
        created_at: now, updated_at: now,
      });
      if (error) throw new Error(`Item plantilla "${item.templateName}": ${error.message}`);
      tmplItemAdded++;
    }
  }

  // ── 5. Equipo-Actividad (resolución de FKs por nombre) ──────────────────
  let linkAdded = 0, linkModified = 0, linkSkipped = 0;
  if (parsed.equipoActividad.length > 0) {
    const { data: equipNow } = await supabase
      .from('equipment').select('id, code').eq('project_id', projectId);
    const equipByCode = new Map<string, string>(
      (equipNow ?? []).map((e: any) => [normalize(e.code), e.id]),
    );
    const { data: linksNow } = await supabase
      .from('equipment_activities').select('*')
      .in('equipment_id', (equipNow ?? []).map((e: any) => e.id));
    const linkKey = (eqId: string, actId: string) => `${eqId}::${actId}`;
    const linkByKey = new Map<string, any>(
      (linksNow ?? []).map((l: any) => [linkKey(l.equipment_id, l.activity_id), l]),
    );
    for (const ea of parsed.equipoActividad) {
      const eqId = equipByCode.get(normalize(ea.equipmentCode));
      const act = actsByName.get(normalize(ea.activityName));
      if (!eqId || !act) {
        warnings.push(`Equipo-Actividad "${ea.equipmentCode} / ${ea.activityName}": ${!eqId ? 'equipo no encontrado' : 'actividad no encontrada'} — omitido.`);
        linkSkipped++;
        continue;
      }
      const tmplId = ea.templateName ? (tmplsByName.get(normalize(ea.templateName)) ?? null) : null;
      if (ea.templateName && !tmplId) {
        warnings.push(`Equipo-Actividad "${ea.equipmentCode} / ${ea.activityName}": plantilla "${ea.templateName}" no encontrada — link creado sin plantilla.`);
      }
      const prev = linkByKey.get(linkKey(eqId, act.id));
      const now = Date.now();
      if (!prev) {
        const { error } = await supabase.from('equipment_activities').insert({
          id: crypto.randomUUID(), equipment_id: eqId, activity_id: act.id,
          form_template_id: tmplId, created_at: now, updated_at: now,
        });
        if (error) throw new Error(`Link "${ea.equipmentCode}/${ea.activityName}": ${error.message}`);
        linkAdded++;
      } else if (prev.form_template_id !== tmplId) {
        const { error } = await supabase.from('equipment_activities')
          .update({ form_template_id: tmplId, updated_at: now }).eq('id', prev.id);
        if (error) throw new Error(`Link "${ea.equipmentCode}/${ea.activityName}": ${error.message}`);
        linkModified++;
      }
    }
  }

  return {
    equipment: eqSummary,
    activities: { added: actAdded, modified: actModified },
    links: { added: linkAdded, modified: linkModified, skipped: linkSkipped },
    shifts: { added: shiftAdded, modified: shiftModified },
    templates: { added: tmplAdded, modified: tmplModified },
    templateItems: { added: tmplItemAdded },
    warnings,
  };
}

// ── v29 — Sectores GIS importer ─────────────────────────────────────────────

import type { ParsedSector, LatLng } from '@lib/sectorParser';

// Paleta de SECTORES (morados/teales/magentas/marrones) — distinta de los
// colores de ESTADO de ensayo (gris/azul/ámbar/verde/rojo) para no confundirlos.
const SECTOR_PALETTE = ['#7E57C2', '#00897B', '#C2185B', '#8D6E63', '#5E35B1', '#0097A7', '#AD1457', '#6D4C41'];

export interface SectorRow {
  id:             string;
  project_id:     string;
  name:           string;
  points_json:    LatLng[] | null;
  display_color:  string | null;
  source_system:  string | null;
  created_at:     number;
  updated_at:     number;
}

export interface SectorsImportSummary {
  added: number;
  modified: number;
}

export function useProjectSectors(projectId: string) {
  return useQuery({
    queryKey: ['project-sectors', projectId],
    queryFn: async (): Promise<SectorRow[]> => {
      const { data, error } = await supabase
        .from('project_sectors')
        .select('*')
        .eq('project_id', projectId)
        .order('name', { ascending: true });
      if (error) throw error;
      return (data ?? []) as SectorRow[];
    },
    enabled: !!projectId,
  });
}

/** Upsert idempotente por (project_id, name). Auto-asigna color de paleta para
 *  sectores nuevos. */
export async function importSectorsToSupabase(
  projectId: string,
  parsed: ParsedSector[],
): Promise<SectorsImportSummary> {
  const { data: existing } = await supabase
    .from('project_sectors').select('*').eq('project_id', projectId);
  const byName = new Map<string, SectorRow>(
    (existing ?? []).map((s: any) => [s.name.toLowerCase(), s]),
  );
  let added = 0, modified = 0;
  let colorIdx = byName.size;
  for (const p of parsed) {
    const prev = byName.get(p.name.toLowerCase());
    const now = Date.now();
    if (!prev) {
      const id = `sec_${now}_${Math.floor(Math.random() * 1e6).toString(36)}`;
      const color = SECTOR_PALETTE[colorIdx % SECTOR_PALETTE.length];
      colorIdx++;
      const { error } = await supabase.from('project_sectors').insert({
        id, project_id: projectId, name: p.name,
        points_json: p.points,
        display_color: color,
        source_system: p.sourceSystem,
        created_at: now, updated_at: now,
      });
      if (error) throw new Error(`Sector "${p.name}": ${error.message}`);
      added++;
    } else {
      const patch: any = { updated_at: now };
      if (p.points) patch.points_json = p.points;
      if (p.sourceSystem) patch.source_system = p.sourceSystem;
      const { error } = await supabase.from('project_sectors')
        .update(patch).eq('id', prev.id);
      if (error) throw new Error(`Sector "${p.name}": ${error.message}`);
      modified++;
    }
  }
  return { added, modified };
}

export async function updateSector(
  sectorId: string,
  patch: { name?: string; display_color?: string },
): Promise<void> {
  const { error } = await supabase.from('project_sectors')
    .update({ ...patch, updated_at: Date.now() })
    .eq('id', sectorId);
  if (error) throw new Error(error.message);
}

export async function deleteSector(sectorId: string): Promise<{ unassigned: number }> {
  // Cuenta cuántos protocolos quedarán sin sector (ON DELETE SET NULL en FK)
  const { count } = await supabase.from('protocols')
    .select('id', { count: 'exact', head: true })
    .eq('sector_id', sectorId);
  const { error } = await supabase.from('project_sectors')
    .delete().eq('id', sectorId);
  if (error) throw new Error(error.message);
  return { unassigned: count ?? 0 };
}

/** Recalcula sector_id para todos los protocolos con coords cuya asignación
 *  NO fue manual (sector_assigned_manually=false/null). */
export async function recalculateSectorAssignments(
  projectId: string,
): Promise<{ updated: number; total: number }> {
  const { data: sectorsData } = await supabase
    .from('project_sectors').select('id, name, points_json')
    .eq('project_id', projectId);
  const withGeom = (sectorsData ?? []).filter((s: any) =>
    Array.isArray(s.points_json) && s.points_json.length >= 3
  );
  if (withGeom.length === 0) return { updated: 0, total: 0 };

  const { data: protos } = await supabase
    .from('protocols').select('id, latitude, longitude, sector_id, sector_assigned_manually')
    .eq('project_id', projectId)
    .or('sector_assigned_manually.is.null,sector_assigned_manually.eq.false');
  const list = (protos ?? []).filter((p: any) =>
    p.latitude != null && p.longitude != null
  );

  let updated = 0;
  for (const p of list as any[]) {
    let matchId: string | null = null;
    for (const s of withGeom as any[]) {
      if (pointInPolygonWeb({ lat: p.latitude, lng: p.longitude }, s.points_json)) {
        matchId = s.id; break;
      }
    }
    if (matchId !== p.sector_id) {
      const { error } = await supabase.from('protocols')
        .update({ sector_id: matchId, updated_at: Date.now() })
        .eq('id', p.id);
      if (error) throw new Error(`Protocolo ${p.id}: ${error.message}`);
      updated++;
    }
  }
  return { updated, total: list.length };
}

function pointInPolygonWeb(point: LatLng, polygon: LatLng[]): boolean {
  if (polygon.length < 3) return false;
  let inside = false;
  const x = point.lng, y = point.lat;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].lng, yi = polygon[i].lat;
    const xj = polygon[j].lng, yj = polygon[j].lat;
    const intersect = ((yi > y) !== (yj > y)) &&
                       (x < ((xj - xi) * (y - yi)) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

// ── Signature upload ──────────────────────────────────────────────────────────

export async function uploadUserSignature(
  file: File,
  userId: string,
): Promise<string> {
  const s3Key = `signatures/${userId}/signature.jpg`;
  const blob  = new Blob([await file.arrayBuffer()], { type: 'image/jpeg' });
  await uploadBlobToS3(blob, s3Key, 'image/jpeg');
  // Note: signature is per-device. APK stores s3_key in AsyncStorage, not Supabase.
  // The web stores it in S3 at a known path: signatures/{userId}/signature.jpg
  return s3Key;
}
