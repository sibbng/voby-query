import { useCleanup, useMemo } from 'voby';
import { useQueryClient } from './queryClient.ts';
import type { QueryKey, QueryOptions, UseQueryReturn } from './types.ts';

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
  UseQueryReturn,
} from './types.ts';

export function useQuery<
  TQueryFnData = unknown,
  TError = Error,
  TData = TQueryFnData,
  TQueryKey extends QueryKey = QueryKey,
  TInitialData extends TQueryFnData | undefined = undefined,
  R = void,
  D = R extends void ? (TInitialData extends TQueryFnData ? TInitialData : TQueryFnData) : R,
>(
  options: QueryOptions<TQueryFnData, TError, TData, TQueryKey, TInitialData, R>,
): UseQueryReturn<Awaited<D>, TError, TInitialData> {
  const queryClient = useQueryClient(options.queryClient);
  const query = useMemo(() => {
    const nextQuery = queryClient.cache.build<
      TQueryFnData,
      TError,
      TData,
      TQueryKey,
      TInitialData,
      R
    >(queryClient, options);
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
          return resolvedOptions.placeholderData as Awaited<D>;
        }
        if (resolvedOptions.select && data !== undefined) {
          return resolvedOptions.select(data as any) as Awaited<D>;
        }

        return data as Awaited<D>;
      }),
      refetch: currentQuery.refetch,
      cancel: currentQuery.cancel,
    };
  }) as UseQueryReturn<Awaited<D>, TError, TInitialData>;
}
