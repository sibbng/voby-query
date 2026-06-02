import { $, type ObservableReadonly, useCleanup, useMemo } from 'voby';
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
  const tick = $(0);

  useCleanup(cache.subscribe(() => {
    tick(v => v + 1);
  }));

  return useMemo((): number => {
    tick();
    const allMutations = cache.getAll();
    for (const mutation of allMutations) {
      mutation.state.status();
    }
    return queryClient.isMutating({ status: 'pending', ...filters } as MutationFilters);
  }) as ObservableReadonly<number>;
}
