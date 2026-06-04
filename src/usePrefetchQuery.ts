import { useEffect } from 'voby';
import { useQueryClient } from './queryClient.ts';
import type { QueryClient, QueryKey, UsePrefetchQueryOptions } from './types.ts';

export function usePrefetchQuery<
  TQueryFnData = unknown,
  TError = Error,
  TData = TQueryFnData,
  TQueryKey extends QueryKey = QueryKey,
>(
  options: UsePrefetchQueryOptions<TQueryFnData, TError, TData, TQueryKey>,
  queryClient?: QueryClient,
) {
  const client = useQueryClient(queryClient);

  if (!client.getQueryState(options.queryKey)) {
    client.prefetchQuery(options as any);
  }

  useEffect(() => {
    if (!client.getQueryState(options.queryKey)) {
      client.prefetchQuery(options as any);
    }
  });
}
