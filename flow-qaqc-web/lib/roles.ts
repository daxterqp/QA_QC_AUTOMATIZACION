/**
 * Etiquetas y permisos de rol (web) — paridad con la app móvil v44.
 * Enum interno sin cambios; "OPERATOR" se muestra como "Técnico".
 */
import type { UserRole } from '@/types';

export const ROLE_LABEL: Record<UserRole, string> = {
  CREATOR: 'Creador',
  RESIDENT: 'Jefe',
  SUPERVISOR: 'Supervisor',
  OPERATOR: 'Técnico',
};

export function roleLabel(role?: string | null): string {
  return ROLE_LABEL[role as UserRole] ?? role ?? '';
}

/** La firma personal es solo para Jefe / Supervisor / Creador (firman protocolos). */
export function canSignature(role?: string | null): boolean {
  return role === 'CREATOR' || role === 'RESIDENT' || role === 'SUPERVISOR';
}
