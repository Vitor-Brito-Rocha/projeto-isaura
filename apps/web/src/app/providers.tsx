'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import { Toaster } from 'sonner';

export function Providers({ children }: { children: React.ReactNode }) {
  // Instância por montagem, não módulo: no App Router um client global vaza
  // cache entre requisições no servidor.
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            // Não repete 401: a sessão expirou e insistir só atrasa o redirect
            // para o login.
            retry: (tentativas, erro) =>
              (erro as { status?: number })?.status === 401 ? false : tentativas < 2,
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      {children}
      <Toaster position="top-center" richColors closeButton />
    </QueryClientProvider>
  );
}
