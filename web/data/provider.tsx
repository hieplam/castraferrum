// Data provider: puts LoopsApi + LiveEvents in context (the layers above know only the interface - web/main.tsx creates the Http/Sse versions,
// tests plug in the Fake versions), wraps TanStack Query, opens the live connection and wires events -> cache.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { LiveEvents } from '../api/live-events';
import type { LoopsApi } from '../api/loops-api';
import { connectLiveToCache } from './live-sync';

type Deps = { api: LoopsApi; live: LiveEvents };
const DepsContext = createContext<Deps | null>(null);

/** Default QueryClient of the app: no reload on tab change (SSE already exists), retry once, no retry on a 4xx error. */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        refetchOnWindowFocus: false,
        retry: (count, err) => {
          const status = (err as unknown as { status?: number }).status ?? 0;
          return count < 1 && !(status >= 400 && status < 500);
        },
        staleTime: 1_000,
      },
    },
  });
}

export function DataProvider({ api, live, client, children }: Deps & { client?: QueryClient; children: ReactNode }) {
  const [queryClient] = useState(() => client ?? createQueryClient());
  const [deps] = useState<Deps>(() => ({ api, live }));
  useEffect(() => {
    const off = connectLiveToCache(deps.live, queryClient);
    deps.live.connect();
    return () => {
      off();
      deps.live.close();
    };
  }, [deps, queryClient]);
  return (
    <DepsContext.Provider value={deps}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </DepsContext.Provider>
  );
}

function useDeps(): Deps {
  const d = useContext(DepsContext);
  if (!d) throw new Error('Data hooks must be inside <DataProvider>');
  return d;
}
export const useApi = (): LoopsApi => useDeps().api;
export const useLive = (): LiveEvents => useDeps().live;
