import { $, useMemo } from 'voby';
import { useBaseQuery } from './useBaseQuery.ts';
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
  const lastData = $<TQueryFnData | undefined>();

  const query = useBaseQuery(options.queryClient, (client) =>
    client.cache.build<TQueryFnData, TError, TData, TQueryKey>(client, options),
  );

  return useMemo(() => {
    const currentQuery = query();
    const { state, resolvedOptions } = currentQuery;

    return {
      ...state,
      data: useMemo(() => {
        const data = state.data();

        if (state.isPending()) {
          if (typeof resolvedOptions.placeholderData === 'function') {
            const placeholderValue = (
              resolvedOptions.placeholderData as (
                prev: TQueryFnData | undefined,
              ) => TQueryFnData | undefined
            )(lastData());
            if (placeholderValue !== undefined) {
              if (resolvedOptions.select) {
                return resolvedOptions.select(placeholderValue as any) as Awaited<TData>;
              }
              return placeholderValue as Awaited<TData>;
            }
          } else if (resolvedOptions.placeholderData !== undefined) {
            return resolvedOptions.placeholderData as Awaited<TData>;
          }
        }

        if (state.isSuccess() && data !== undefined) {
          lastData(data as TQueryFnData);
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
