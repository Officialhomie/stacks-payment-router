'use client';

import React, { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

/**
 * React Query Provider
 * Provides TanStack Query (React Query) to the app
 */
export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // Stale time: How long data is considered fresh
            staleTime: 60 * 1000, // 1 minute
            // Cache time: How long inactive data stays in cache
            gcTime: 5 * 60 * 1000, // 5 minutes
            // Retry failed requests
            retry: 2,
            // Refetch on window focus
            refetchOnWindowFocus: false,
          },
          mutations: {
            // Retry failed mutations
            retry: 1,
          },
        },
      })
  );

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
