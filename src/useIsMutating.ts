import { type ObservableReadonly, useMemo } from 'voby';
import { useQueryClient } from './queryClient.ts';
import type { MutationFilters, QueryClient } from './types.ts';

export function useIsMutating({
  filters,
  queryClient: overrideClient,
}: {
  filters?: MutationFilters;
  queryClient?: QueryClient;
} = {}): ObservableReadonly<number> {
  const queryClient = useQueryClient(overrideClient);
  const cache = queryClient.mutationCache;

  return useMemo((): number => {
    cache.version();
    const allMutations = cache.getAll();
    for (const mutation of allMutations) {
      mutation.state.status();
    }
    return queryClient.isMutating({ status: 'pending', ...filters } as MutationFilters);
  }) as ObservableReadonly<number>;
}
