'use client';

import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { createClient } from '@lib/supabase/client';

/**
 * #7C — Tiempo real con la app abierta (Supabase Realtime).
 *
 * Se suscribe a los cambios de las tablas que importan para ver actualizaciones
 * en vivo (estados de ensayo aprobado/en revisión/rechazado, observaciones de
 * plano y sus comentarios, no conformidades). Ante cualquier cambio, invalida las
 * queries activas de react-query → la página visible se refresca sola, sin recargar.
 *
 * RLS aplica también en Realtime: solo se reciben cambios de filas accesibles
 * (org_guard + can_access_project), así que es seguro multi-empresa.
 */

// Tablas con project_id → se pueden filtrar por proyecto (menos ruido).
const SCOPED_TABLES = ['protocols', 'non_conformities', 'plans'];
// Tablas hijas SIN project_id (plan_annotations: plan_id; annotation_comments:
// annotation_id) → sin filtro; RLS limita a lo accesible y solo invalidamos.
const UNSCOPED_TABLES = ['plan_annotations', 'annotation_comments'];

export function useRealtimeProject(projectId?: string) {
  const qc = useQueryClient();
  useEffect(() => {
    if (!projectId) return;
    const supabase = createClient();
    const channel = supabase.channel(`rt-project-${projectId}`);
    const bump = () => { qc.invalidateQueries({ type: 'active' }); };

    for (const table of SCOPED_TABLES) {
      channel.on(
        'postgres_changes',
        { event: '*', schema: 'public', table, filter: `project_id=eq.${projectId}` },
        bump,
      );
    }
    for (const table of UNSCOPED_TABLES) {
      channel.on('postgres_changes', { event: '*', schema: 'public', table }, bump);
    }

    channel.subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [projectId, qc]);
}
