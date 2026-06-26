import { useCallback, useRef } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { supabase } from '@config/supabase';
import { pullProjectFromCloud } from '@services/SupabaseSyncService';

/**
 * #7C — Tiempo real móvil (Supabase Realtime), con la app abierta.
 *
 * Mientras la pantalla está ENFOCADA, escucha cambios en la nube de las tablas
 * que importan (estados de ensayo, observaciones de plano + comentarios, no
 * conformidades). Al detectar un cambio, baja el proyecto (pullProjectFromCloud,
 * con un pequeño debounce). Las pantallas que observan WatermelonDB se refrescan
 * solas tras el pull; las que cargan a mano reciben `onChange` para recargar.
 *
 * RLS aplica también en Realtime → solo llegan cambios de filas accesibles.
 * Se suscribe/desuscribe por foco, así nunca queda más de un canal activo.
 */
const SCOPED = ['protocols', 'non_conformities', 'plans'];
const UNSCOPED = ['plan_annotations', 'annotation_comments'];

export function useRealtimeProjectPull(projectId: string, onChange?: () => void) {
  const cb = useRef(onChange);
  cb.current = onChange;

  useFocusEffect(
    useCallback(() => {
      if (!projectId) return;
      let timer: ReturnType<typeof setTimeout> | null = null;
      const bump = () => {
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => {
          pullProjectFromCloud(projectId).then(() => cb.current?.()).catch(() => {});
        }, 500);
      };

      const channel = supabase.channel(`rt-mobile-${projectId}`);
      for (const table of SCOPED) {
        channel.on(
          'postgres_changes',
          { event: '*', schema: 'public', table, filter: `project_id=eq.${projectId}` },
          bump,
        );
      }
      for (const table of UNSCOPED) {
        channel.on('postgres_changes', { event: '*', schema: 'public', table }, bump);
      }
      channel.subscribe();

      return () => {
        if (timer) clearTimeout(timer);
        supabase.removeChannel(channel);
      };
    }, [projectId]),
  );
}
