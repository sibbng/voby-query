import { QueryClient } from 'voby-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { refetchOnWindowFocus: false, refetchInterval: 0, staleTime: 15_000 },
  },
});
