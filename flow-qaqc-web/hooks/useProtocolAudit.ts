import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@lib/supabase/client';
import { pushProtocolApproved, pushProtocolRejected } from '@lib/pushNotification';

const supabase = createClient();

async function getProtocolContext(protocolId: string) {
  const { data: proto } = await supabase.from('protocols').select('project_id, location_id, protocol_number').eq('id', protocolId).single();
  if (!proto) return null;
  let locationOnly: string | null = null;
  let specialty: string | null = null;
  if (proto.location_id) {
    const { data: loc } = await supabase.from('locations').select('location_only, specialty').eq('id', proto.location_id).single();
    if (loc) { locationOnly = loc.location_only; specialty = loc.specialty; }
  }
  return { projectId: proto.project_id, protocolName: proto.protocol_number ?? '', locationOnly, specialty };
}

// ─────────────────────────────────────────────────────────────────────────────
// Aprobaciones jerárquicas (v23)
// ─────────────────────────────────────────────────────────────────────────────

export interface ProtocolApproval {
  id: string;
  protocol_id: string;
  level: 1 | 2 | 3;
  signer_id: string | null;
  signed_at: number | null;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  rejection_reason: string | null;
  created_at: number;
  updated_at: number;
  // Joined (cuando se carga con signer info)
  signer_name?: string;
  signer_apellido?: string | null;
}

/** Lee las filas de aprobación del protocolo, ordenadas por nivel.
 *  Incluye join con users para mostrar nombres. */
export function useProtocolApprovals(protocolId: string) {
  return useQuery({
    queryKey: ['protocol-approvals', protocolId],
    queryFn: async (): Promise<ProtocolApproval[]> => {
      const { data, error } = await supabase
        .from('protocol_approvals')
        .select('*, users:signer_id(name, apellido)')
        .eq('protocol_id', protocolId)
        .order('level', { ascending: true });
      if (error) throw error;
      return (data ?? []).map((r: any) => ({
        ...r,
        signer_name: r.users?.name,
        signer_apellido: r.users?.apellido,
      })) as ProtocolApproval[];
    },
    enabled: !!protocolId,
  });
}

/** Asegura que existen N filas PENDING para el protocolo (idempotente).
 *  Llamar al hacer SUBMIT con N = approval_levels del proyecto. */
export async function ensureApprovalRows(protocolId: string, levels: 1 | 2 | 3): Promise<void> {
  const { data: existing } = await supabase.from('protocol_approvals').select('level').eq('protocol_id', protocolId);
  const existingLevels = new Set((existing ?? []).map((r: any) => r.level as number));
  const toInsert: any[] = [];
  const now = Date.now();
  for (let lvl = 1; lvl <= levels; lvl++) {
    if (!existingLevels.has(lvl)) {
      toInsert.push({
        id: crypto.randomUUID(),
        protocol_id: protocolId,
        level: lvl,
        status: 'PENDING',
        created_at: now,
        updated_at: now,
      });
    }
  }
  if (toInsert.length > 0) {
    const { error } = await supabase.from('protocol_approvals').insert(toInsert);
    if (error) throw error;
  }
}

/** Aprobar el nivel pendiente actual del protocolo.
 *  - Si todos los niveles están APPROVED → marcar protocols.status = APPROVED.
 *  - Si quedan niveles pendientes → protocols.status sigue en SUBMITTED. */
export function useApproveLevel(protocolId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ signerId, level, reason }: { signerId: string; level: 1 | 2 | 3; reason?: string | null }) => {
      const now = Date.now();
      // 1. Actualizar la fila del nivel actual SOLO si está PENDING — evita que
      //    dos jefes aprobando "al mismo tiempo" pisen el firmante mutuo, y
      //    protege contra re-aprobaciones accidentales (idempotencia).
      const { data: updRows, error: e1 } = await supabase
        .from('protocol_approvals')
        .update({ signer_id: signerId, signed_at: now, status: 'APPROVED', updated_at: now })
        .eq('protocol_id', protocolId)
        .eq('level', level)
        .eq('status', 'PENDING')
        .select('id');
      if (e1) throw e1;
      if (!updRows || updRows.length === 0) {
        throw new Error('Este nivel ya no está pendiente — alguien más lo procesó. Recarga la página.');
      }
      // 2. Si todos los niveles ya están APPROVED → marcar protocol APPROVED
      const { data: rows } = await supabase
        .from('protocol_approvals')
        .select('status')
        .eq('protocol_id', protocolId);
      const allApproved = rows && rows.length > 0 && rows.every((r: any) => r.status === 'APPROVED');
      if (allApproved) {
        const { error: e2 } = await supabase
          .from('protocols')
          .update({
            status: 'APPROVED',
            signed_by_id: signerId,        // último firmante → compat con código legacy
            signed_at: now,
            is_locked: true,
            corrections_allowed: false,
            approval_reason: reason ?? null, // v33 — motivo del override (si aplica)
            updated_at: now,
          })
          .eq('id', protocolId);
        if (e2) throw e2;
        const ctx = await getProtocolContext(protocolId);
        if (ctx) pushProtocolApproved(ctx.projectId, ctx.locationOnly, ctx.specialty, ctx.protocolName, protocolId);
      }
      return { allApproved };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['protocol-fill', protocolId] });
      qc.invalidateQueries({ queryKey: ['protocol-approvals', protocolId] });
      qc.invalidateQueries({ queryKey: ['location-protocols'] });
      qc.invalidateQueries({ queryKey: ['location-progress'] });
    },
  });
}

/** Rechazar el protocolo desde un nivel cualquiera. Marca el nivel rechazado +
 *  el protocolo entero como REJECTED. Los demás niveles ya no aplican. */
export function useRejectLevel(protocolId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ signerId, level, reason }: { signerId: string; level: 1 | 2 | 3; reason: string }) => {
      const now = Date.now();
      // 1. Actualizar la fila del nivel actual SOLO si está PENDING (idempotente).
      const { data: updRows, error: e1 } = await supabase
        .from('protocol_approvals')
        .update({ signer_id: signerId, signed_at: now, status: 'REJECTED', rejection_reason: reason, updated_at: now })
        .eq('protocol_id', protocolId)
        .eq('level', level)
        .eq('status', 'PENDING')
        .select('id');
      if (e1) throw e1;
      if (!updRows || updRows.length === 0) {
        throw new Error('Este nivel ya no está pendiente — alguien más lo procesó. Recarga la página.');
      }
      // 2. Marcar el protocolo como REJECTED
      const { error: e2 } = await supabase
        .from('protocols')
        .update({ status: 'REJECTED', rejection_reason: reason, updated_at: now })
        .eq('id', protocolId);
      if (e2) throw e2;
      const ctx = await getProtocolContext(protocolId);
      if (ctx) pushProtocolRejected(ctx.projectId, ctx.locationOnly, ctx.specialty, ctx.protocolName, protocolId);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['protocol-fill', protocolId] });
      qc.invalidateQueries({ queryKey: ['protocol-approvals', protocolId] });
      qc.invalidateQueries({ queryKey: ['location-protocols'] });
      qc.invalidateQueries({ queryKey: ['location-progress'] });
    },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Legacy hooks (single-level) — mantienen compatibilidad con código existente
// que aún no migra al flujo de niveles. Internamente usan ensureApprovalRows(1)
// + useApproveLevel(level=1) cuando approval_levels=1.
// ─────────────────────────────────────────────────────────────────────────────

export function useApproveProtocol(protocolId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (arg: string | { signedById: string; reason?: string | null }) => {
      // Compat: acepta el id directo (legacy) o un objeto con motivo (v33).
      const signedById = typeof arg === 'string' ? arg : arg.signedById;
      const reason = typeof arg === 'string' ? null : (arg.reason ?? null);
      // Garantizar al menos 1 nivel y aprobarlo.
      await ensureApprovalRows(protocolId, 1);
      const now = Date.now();
      // Actualiza level=1 + protocol en una sola pasada
      const { error: e1 } = await supabase
        .from('protocol_approvals')
        .update({ signer_id: signedById, signed_at: now, status: 'APPROVED', updated_at: now })
        .eq('protocol_id', protocolId)
        .eq('level', 1);
      if (e1) throw e1;
      const { error: e2 } = await supabase
        .from('protocols')
        .update({
          status: 'APPROVED',
          signed_by_id: signedById,
          signed_at: now,
          is_locked: true,
          corrections_allowed: false,
          // v33 — motivo de aprobación (override fuera de rango); null si conforme.
          approval_reason: reason,
          updated_at: now,
        })
        .eq('id', protocolId);
      if (e2) throw e2;
      const ctx = await getProtocolContext(protocolId);
      if (ctx) pushProtocolApproved(ctx.projectId, ctx.locationOnly, ctx.specialty, ctx.protocolName, protocolId);
      // Tablas Resumen — refresca el estado en la fila resumen del ensayo.
      const { upsertSummaryRowWeb } = await import('@lib/summaryRow');
      void upsertSummaryRowWeb(protocolId);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['protocol-fill', protocolId] });
      qc.invalidateQueries({ queryKey: ['protocol-approvals', protocolId] });
      qc.invalidateQueries({ queryKey: ['location-protocols'] });
      qc.invalidateQueries({ queryKey: ['location-progress'] });
    },
  });
}

export function useRejectProtocol(protocolId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (reason: string) => {
      const now = Date.now();
      const { error } = await supabase
        .from('protocols')
        .update({ status: 'REJECTED', rejection_reason: reason, updated_at: now })
        .eq('id', protocolId);
      if (error) throw error;
      const ctx = await getProtocolContext(protocolId);
      if (ctx) pushProtocolRejected(ctx.projectId, ctx.locationOnly, ctx.specialty, ctx.protocolName, protocolId);
      // Tablas Resumen — refresca el estado en la fila resumen del ensayo.
      const { upsertSummaryRowWeb } = await import('@lib/summaryRow');
      void upsertSummaryRowWeb(protocolId);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['protocol-fill', protocolId] });
      qc.invalidateQueries({ queryKey: ['protocol-approvals', protocolId] });
      qc.invalidateQueries({ queryKey: ['location-protocols'] });
      qc.invalidateQueries({ queryKey: ['location-progress'] });
    },
  });
}
