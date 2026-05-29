import { createQueryClient } from 'voby-query';

export const queryClient = createQueryClient({
  defaultOptions: {
    queries: { refetchOnWindowFocus: false, refetchInterval: 0, staleTime: 15_000 },
  },
});
