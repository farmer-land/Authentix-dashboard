'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';

export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // Data stays fresh for 60s — avoids duplicate API calls when navigating
            // between pages that share query keys (e.g. contacts count in sidebar)
            staleTime: 60 * 1000,
            // Keep unused data in cache for 10 minutes so back-navigation is instant
            gcTime: 10 * 60 * 1000,
            // Retry once on transient network errors; more retries hammer the API
            retry: 1,
            // Don't refetch on tab focus — our data doesn't change that frequently
            // and this causes a burst of Supabase queries every time user alt-tabs
            refetchOnWindowFocus: false,
            // Do refetch on reconnect (user regains internet)
            refetchOnReconnect: true,
          },
        },
      }),
  );

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
