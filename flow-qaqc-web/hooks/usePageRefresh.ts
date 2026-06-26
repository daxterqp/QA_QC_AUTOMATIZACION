'use client';

import { useState, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';

/**
 * #7C — Recarga reutilizable para el botón "Recargar" del PageHeader.
 *
 * Refetchea TODAS las queries activas de la página actual (las que están
 * montadas), sin invalidar el resto de la caché. Es el equivalente web del
 * pull-to-refresh móvil: fuerza traer datos frescos de Supabase de lo que se
 * está viendo (dossier, observaciones, estado de ensayos, etc.).
 *
 * Uso:
 *   const { refreshing, onRefresh } = usePageRefresh();
 *   <PageHeader ... onRefresh={onRefresh} refreshing={refreshing} />
 */
export function usePageRefresh() {
  const qc = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await qc.refetchQueries({ type: 'active' });
    } finally {
      setRefreshing(false);
    }
  }, [qc]);
  return { refreshing, onRefresh };
}
