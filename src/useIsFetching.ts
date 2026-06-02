import { $, type ObservableReadonly, useCleanup, useMemo } from 'voby';
import { useQueryClient } from './queryClient.ts';
import type { QueryClient, QueryFilters } from './types.ts';

export function useIsFetching({
  filters,
  queryClient: overrideClient,
}: {
  filters?: QueryFilters;
  queryClient?: QueryClient;
} = {}): ObservableReadonly<number> {
  const queryClient = useQueryClient(overrideClient);
  const cache = queryClient.cache;
  const tick = $(0);

  useCleanup(
    cache.subscribe(() => {
      tick((v) => v + 1);
    }),
  );

  return useMemo((): number => {
    tick();
    const queries = cache.findAll(filters);
    let count = 0;
    for (const query of queries) {
      if (query.state.isFetching()) {
        count++;
      }
    }
    return count;
  }) as ObservableReadonly<number>;
}
