import { useEffect } from 'voby';
import { fetchInitialInfiniteData } from './infiniteQuery.ts';
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

  const wrappedOptions = {
    ...options,
    queryFn: (ctx: { signal: AbortSignal }) =>
      fetchInitialInfiniteData({
        options: options as any,
        signal: ctx.signal,
      }),
  };

  if (!client.getQueryState(options.queryKey)) {
    client.prefetchInfiniteQuery(wrappedOptions as any);
  }

  useEffect(() => {
    if (!client.getQueryState(options.queryKey)) {
      client.prefetchInfiniteQuery(wrappedOptions as any);
    }
  });
}
