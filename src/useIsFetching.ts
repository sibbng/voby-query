import { type ObservableReadonly, useMemo } from 'voby';
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

  return useMemo((): number => {
    cache.version();
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
