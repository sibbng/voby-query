import { useEffect } from 'voby';
import { useQueryClient } from './queryClient.ts';
import type { QueryClient, QueryKey, UsePrefetchInfiniteQueryOptions } from './types.ts';

export function usePrefetchInfiniteQuery<
  TQueryFnData = unknown,
  TError = Error,
  TQueryKey extends QueryKey = QueryKey,
  TPageParam = unknown,
>(
  options: UsePrefetchInfiniteQueryOptions<TQueryFnData, TError, TQueryKey, TPageParam>,
  queryClient?: QueryClient,
) {
  const client = useQueryClient(queryClient);

  if (!client.getQueryState(options.queryKey)) {
    client.prefetchInfiniteQuery(options as any);
  }

  useEffect(() => {
    if (!client.getQueryState(options.queryKey)) {
      client.prefetchInfiniteQuery(options as any);
    }
  });
}
