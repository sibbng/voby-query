import { useCleanup, useMemo } from 'voby';
import { useQueryClient } from './queryClient.ts';
import type { QueryKey, QueryOptions, UseQueryResult } from './types.ts';

export { CancelledError } from './query.ts';
export type {
  CancelOptions,
  FetchStatus,
  MutationCache,
  QueryCache,
  QueryClient,
  QueryFilters,
  QueryKey,
  QueryOptions,
  QueryRefetchOptions,
  QuerySnapshot,
  QueryStatus,
  UseQueryResult,
} from './types.ts';

export function useQuery<
  TQueryFnData = unknown,
  TError = Error,
  TData = TQueryFnData,
  TQueryKey extends QueryKey = QueryKey,
>(
  options: QueryOptions<TQueryFnData, TError, TData, TQueryKey>,
): UseQueryResult<Awaited<TData>, TError> {
  const queryClient = useQueryClient(options.queryClient);
  const query = useMemo(() => {
    const nextQuery = queryClient.cache.build<TQueryFnData, TError, TData, TQueryKey>(
      queryClient,
      options,
    );
    useCleanup(nextQuery.addInstance());
    return nextQuery;
  });

  return useMemo(() => {
    const currentQuery = query();
    const { state, resolvedOptions } = currentQuery;

    return {
      ...state,
      data: useMemo(() => {
        const data = state.data();

        if (state.isPending() && resolvedOptions.placeholderData !== undefined) {
          return resolvedOptions.placeholderData as Awaited<TData>;
        }
        if (resolvedOptions.select && data !== undefined) {
          return resolvedOptions.select(data as any) as Awaited<TData>;
        }

        return data as Awaited<TData>;
      }),
      refetch: currentQuery.refetch,
      cancel: currentQuery.cancel,
    };
  }) as UseQueryResult<Awaited<TData>, TError>;
}
