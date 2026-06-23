'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';

export function QueryProvider({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // Caché "caliente": las revisitas dentro de la ventana son INSTANTÁNEAS
            // (sin esqueleto). La frescura ante cambios desde otros dispositivos la
            // dan: (a) la invalidación tras cada mutación local, (b) el botón
            // "Actualizar" por proyecto. Sube mucho la fluidez del escritorio.
            staleTime: 3 * 60 * 1000,   // 3 min fresco
            gcTime: 30 * 60 * 1000,     // 30 min en memoria (sobrevive navegación)
            retry: false,
            refetchOnWindowFocus: false,
          },
        },
      })
  );

  return (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );
}
