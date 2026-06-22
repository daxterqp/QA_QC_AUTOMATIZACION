'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@lib/supabase/client';
import type { Equipment, EquipmentType, EquipmentStatus, ProtocolEquipment } from '@/types';

const supabase = createClient();
const EQUIPMENT_KEY            = (projectId: string)  => ['equipment', projectId];
const PROTOCOL_EQUIPMENT_KEY   = (protocolId: string) => ['protocol-equipment', protocolId];

// ── Listado de equipos por proyecto ─────────────────────────────────────────

export function useEquipment(projectId: string) {
  return useQuery<Equipment[]>({
    queryKey: EQUIPMENT_KEY(projectId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('equipment')
        .select('*')
        .eq('project_id', projectId)
        .order('code', { ascending: true });
      if (error) throw error;
      return (data ?? []) as Equipment[];
    },
    enabled: !!projectId,
    staleTime: 30_000,
  });
}

// ── Mutations ────────────────────────────────────────────────────────────────

export interface EquipmentInput {
  code: string;
  name: string;
  type: EquipmentType;
  brand?: string | null;
  model?: string | null;
  serial?: string | null;
  capacity?: string | null;
  resolution?: string | null;
  last_calibration_at: number | null;
  next_calibration_at: number;
  status?: EquipmentStatus;
  notes?: string | null;
  calibration_certificate_s3?: string | null;
}

export function useCreateEquipment(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: EquipmentInput) => {
      const now = Date.now();
      const { data, error } = await supabase
        .from('equipment')
        .insert({
          id: crypto.randomUUID(),
          project_id: projectId,
          code: input.code.trim(),
          name: input.name.trim(),
          type: input.type,
          brand: input.brand ?? null,
          model: input.model ?? null,
          serial: input.serial ?? null,
          capacity: input.capacity ?? null,
          resolution: input.resolution ?? null,
          last_calibration_at: input.last_calibration_at,
          next_calibration_at: input.next_calibration_at,
          calibration_certificate_s3: input.calibration_certificate_s3 ?? null,
          status: input.status ?? 'active',
          notes: input.notes ?? null,
          created_at: now,
          updated_at: now,
        })
        .select()
        .single();
      if (error) throw error;
      return data as Equipment;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: EQUIPMENT_KEY(projectId) }),
  });
}

export function useUpdateEquipment(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...input }: { id: string } & Partial<EquipmentInput>) => {
      const patch: Record<string, unknown> = { updated_at: Date.now() };
      if (input.code !== undefined) patch.code = input.code.trim();
      if (input.name !== undefined) patch.name = input.name.trim();
      if (input.type !== undefined) patch.type = input.type;
      if (input.brand !== undefined) patch.brand = input.brand;
      if (input.model !== undefined) patch.model = input.model;
      if (input.serial !== undefined) patch.serial = input.serial;
      if (input.capacity !== undefined) patch.capacity = input.capacity;
      if (input.resolution !== undefined) patch.resolution = input.resolution;
      if (input.last_calibration_at !== undefined) patch.last_calibration_at = input.last_calibration_at;
      if (input.next_calibration_at !== undefined) patch.next_calibration_at = input.next_calibration_at;
      if (input.calibration_certificate_s3 !== undefined) patch.calibration_certificate_s3 = input.calibration_certificate_s3;
      if (input.status !== undefined) patch.status = input.status;
      if (input.notes !== undefined) patch.notes = input.notes;
      const { error } = await supabase.from('equipment').update(patch).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: EQUIPMENT_KEY(projectId) }),
  });
}

// ── v29 — Actividades asociadas a equipos del proyecto ─────────────────────

export interface EquipmentActivityInfo {
  name: string;
  kind: string;
  templateName: string | null;
}

/** Devuelve un map `{ equipment_id → [actividades] }` con todas las
 *  activities vinculadas a los equipos del proyecto, vía equipment_activities. */
export function useEquipmentActivities(projectId: string) {
  return useQuery<Record<string, EquipmentActivityInfo[]>>({
    queryKey: ['equipment-activities-map', projectId],
    queryFn: async () => {
      // 1) Trae todas las activities del proyecto
      const { data: acts } = await supabase
        .from('activities')
        .select('id, name, kind')
        .eq('project_id', projectId);
      const actsById: Record<string, { name: string; kind: string }> = {};
      for (const a of (acts ?? []) as any[]) actsById[a.id] = { name: a.name, kind: a.kind };

      // 2) Trae los ids de equipos del proyecto
      const { data: eqs } = await supabase
        .from('equipment')
        .select('id')
        .eq('project_id', projectId);
      const eqIds = (eqs ?? []).map((e: any) => e.id);
      if (eqIds.length === 0) return {};

      // 3) Trae los links + plantillas embebidas
      const { data: links } = await supabase
        .from('equipment_activities')
        .select('equipment_id, activity_id, form_template_id, session_form_templates:form_template_id(name)')
        .in('equipment_id', eqIds);

      const map: Record<string, EquipmentActivityInfo[]> = {};
      for (const l of (links ?? []) as any[]) {
        const act = actsById[l.activity_id];
        if (!act) continue;
        if (!map[l.equipment_id]) map[l.equipment_id] = [];
        map[l.equipment_id].push({
          name: act.name,
          kind: act.kind,
          templateName: l.session_form_templates?.name ?? null,
        });
      }
      return map;
    },
    enabled: !!projectId,
    staleTime: 30_000,
  });
}

export function useDeleteEquipment(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      // Soft-delete: marcar como retired (preserva histórico en protocol_equipment).
      const { error } = await supabase
        .from('equipment')
        .update({ status: 'retired', updated_at: Date.now() })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: EQUIPMENT_KEY(projectId) }),
  });
}

// ── Asociación protocolo ↔ equipo ───────────────────────────────────────────

/** Equipos asociados a un protocolo, con detalle del equipo embebido. */
export interface ProtocolEquipmentWithDetails extends ProtocolEquipment {
  equipment: Equipment | null;
}

export function useProtocolEquipment(protocolId: string) {
  return useQuery<ProtocolEquipmentWithDetails[]>({
    queryKey: PROTOCOL_EQUIPMENT_KEY(protocolId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('protocol_equipment')
        .select('*, equipment:equipment_id(*)')
        .eq('protocol_id', protocolId);
      if (error) throw error;
      return (data ?? []).map((r: any) => ({
        id: r.id,
        protocol_id: r.protocol_id,
        equipment_id: r.equipment_id,
        used_at: r.used_at,
        created_at: r.created_at,
        equipment: (r.equipment as Equipment) ?? null,
      }));
    },
    enabled: !!protocolId,
    staleTime: 15_000,
  });
}

export function useLinkProtocolEquipment(protocolId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ equipmentIds }: { equipmentIds: string[] }) => {
      // Estrategia: snapshot previo → delete → insert. Si el insert falla,
      // intentamos restaurar el snapshot (rollback best-effort) para no dejar
      // al protocolo con 0 equipos cuando tenía N. Supabase JS no soporta
      // transactions client-side, así que esto es lo más cerca posible sin
      // mover la lógica a un RPC del lado servidor.
      const now = Date.now();
      const { data: snapshot } = await supabase
        .from('protocol_equipment')
        .select('*')
        .eq('protocol_id', protocolId);

      const { error: delErr } = await supabase
        .from('protocol_equipment')
        .delete()
        .eq('protocol_id', protocolId);
      if (delErr) throw delErr;

      if (equipmentIds.length === 0) return;
      const rows = equipmentIds.map(eqId => ({
        id: crypto.randomUUID(),
        protocol_id: protocolId,
        equipment_id: eqId,
        used_at: now,
        created_at: now,
      }));
      const { error: insErr } = await supabase.from('protocol_equipment').insert(rows);
      if (insErr) {
        // Rollback best-effort: re-insertar el snapshot. Si esto también falla,
        // el usuario queda sin vínculos y debe re-asociar manualmente — pero al
        // menos sabe del error.
        if (snapshot && snapshot.length > 0) {
          await supabase.from('protocol_equipment').insert(snapshot).then(({ error }) => {
            if (error) console.warn('[useLinkProtocolEquipment] rollback falló:', error);
          });
        }
        throw insErr;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: PROTOCOL_EQUIPMENT_KEY(protocolId) }),
  });
}
