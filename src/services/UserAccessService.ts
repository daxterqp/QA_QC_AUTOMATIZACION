/**
 * UserAccessService (v44) — Gestión de accesos usuario↔proyecto (`user_project_access`).
 *
 * Supabase es la FUENTE DE VERDAD: cada dispositivo lee SU acceso desde ahí, así que las
 * altas/bajas se escriben directo a Supabase (no requiere tocar el WatermelonDB local de
 * otros usuarios). La tabla tiene `id TEXT PK` SIN default ni unique por par → generamos
 * un id y verificamos existencia antes de insertar (idempotente, sin duplicados). Los
 * borrados son SIEMPRE acotados por (user_id, project_id) explícitos — nunca masivos.
 */
import { supabase } from '@config/supabase';

function uuidv4(): string {
  const b = new Uint8Array(16);
  (globalThis.crypto ?? (global as any).crypto).getRandomValues(b);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, x => x.toString(16).padStart(2, '0'));
  return `${h.slice(0, 4).join('')}-${h.slice(4, 6).join('')}-${h.slice(6, 8).join('')}-${h.slice(8, 10).join('')}-${h.slice(10, 16).join('')}`;
}

export interface AccessSnapshot {
  projects: { id: string; name: string }[];
  /** userId → set de projectIds con acceso. */
  byUser: Record<string, Set<string>>;
}

/** Carga proyectos + todos los accesos (para pintar tarjetas y prellenar selecciones). */
export async function loadAccessSnapshot(): Promise<AccessSnapshot> {
  const [accRes, projRes] = await Promise.all([
    supabase.from('user_project_access').select('user_id, project_id'),
    supabase.from('projects').select('id, name').order('created_at', { ascending: true }),
  ]);
  const projects = ((projRes.data ?? []) as { id: string; name: string }[]);
  const byUser: Record<string, Set<string>> = {};
  for (const a of (accRes.data ?? []) as { user_id: string; project_id: string }[]) {
    (byUser[a.user_id] ??= new Set()).add(a.project_id);
  }
  return { projects, byUser };
}

const now = () => Date.now();

/** Otorga acceso a CADA usuario para CADA proyecto (idempotente: omite los ya existentes). */
export async function grantAccess(userIds: string[], projectIds: string[]): Promise<number> {
  if (userIds.length === 0 || projectIds.length === 0) return 0;
  // Existentes para estos usuarios → evita duplicados (no hay unique en BD).
  const { data: existing } = await supabase
    .from('user_project_access').select('user_id, project_id').in('user_id', userIds);
  const have = new Set((existing ?? []).map((r: any) => `${r.user_id}|${r.project_id}`));
  const rows: { id: string; user_id: string; project_id: string; created_at: number; updated_at: number }[] = [];
  for (const uid of userIds) for (const pid of projectIds) {
    if (!have.has(`${uid}|${pid}`)) rows.push({ id: uuidv4(), user_id: uid, project_id: pid, created_at: now(), updated_at: now() });
  }
  if (rows.length === 0) return 0;
  const { error } = await supabase.from('user_project_access').insert(rows);
  if (error) throw new Error(error.message);
  return rows.length;
}

/** Revoca el acceso de varios usuarios a UN proyecto (borrado acotado y explícito). */
export async function revokeAccess(userIds: string[], projectId: string): Promise<void> {
  if (userIds.length === 0 || !projectId) return;
  const { error } = await supabase
    .from('user_project_access').delete().eq('project_id', projectId).in('user_id', userIds);
  if (error) throw new Error(error.message);
}

/** Sincroniza el acceso de UN usuario a EXACTAMENTE `desiredProjectIds`: agrega los que
 *  falten y revoca los que sobren. Usado por la re-importación de Excel. Solo toca las
 *  filas de ESE usuario. */
export async function syncUserAccess(userId: string, desiredProjectIds: string[]): Promise<{ added: number; removed: number }> {
  const desired = new Set(desiredProjectIds);
  const { data: cur } = await supabase
    .from('user_project_access').select('project_id').eq('user_id', userId);
  const current = new Set((cur ?? []).map((r: any) => r.project_id as string));

  const toAdd = [...desired].filter(p => !current.has(p));
  const toRemove = [...current].filter(p => !desired.has(p));

  if (toAdd.length > 0) {
    const rows = toAdd.map(pid => ({ id: uuidv4(), user_id: userId, project_id: pid, created_at: now(), updated_at: now() }));
    const { error } = await supabase.from('user_project_access').insert(rows);
    if (error) throw new Error(error.message);
  }
  if (toRemove.length > 0) {
    const { error } = await supabase.from('user_project_access').delete().eq('user_id', userId).in('project_id', toRemove);
    if (error) throw new Error(error.message);
  }
  return { added: toAdd.length, removed: toRemove.length };
}
