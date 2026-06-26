'use client';

import { useParams } from 'next/navigation';
import { useRealtimeProject } from '@hooks/useRealtimeProject';

/**
 * #7C — Layout de proyecto: monta UNA suscripción de Realtime para todas las
 * páginas de `/app/projects/[id]/*`. Persiste mientras navegás dentro del
 * proyecto y se desmonta al salir. Solo cablea el tiempo real; no altera el
 * render (devuelve children tal cual).
 */
export default function ProjectLayout({ children }: { children: React.ReactNode }) {
  const { id } = useParams<{ id: string }>();
  useRealtimeProject(id);
  return <>{children}</>;
}
