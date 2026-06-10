import { $, useCleanup, useMemo, untrack } from 'voby';
import { useQueryClient } from './queryClient.ts';
import { QueryObserver } from './queryObserver.ts';
import type { QueryClient as QC, QueryKey, QueryOptions, UseQueryResult } from './types.ts';
import { CancelledError } from './query.ts';

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
  queryClient?: QC,
): UseQueryResult<Awaited<TData>, TError> {
  const client = useQueryClient(queryClient ?? options.queryClient);
  const lastData = $<TQueryFnData | undefined>();

  const observer = useMemo(() => {
    const q = client.cache.build<TQueryFnData, TError, TData, TQueryKey>(client, options);
    useCleanup((q as any).addInstance());
    const obs = new QueryObserver<TQueryFnData, TError, TData, TQueryKey>(q, options);
    useCleanup(obs.subscribe(() => {}));
    useCleanup(() => obs.destroy());
    return obs;
  });

  return useMemo(() => {
    const obs = observer();
    const currentQuery = obs.query;
    const state = currentQuery.state;
    const obsOptions = currentQuery.resolvedOptions;

    // Snapshot the update counts at mount time so isFetchedAfterMount
    // reflects fetches that happened *after* this observer mounted.
    const mountedAtCounts = {
      dataUpdateCount: untrack(() => state.dataUpdateCount()),
      errorUpdateCount: untrack(() => state.errorUpdateCount()),
    };

    const shouldThrow = state.isError() && obsOptions.throwOnError;

    const result = {
      ...state,
      isFetchedAfterMount: useMemo(
        (): boolean =>
          state.dataUpdateCount() > mountedAtCounts.dataUpdateCount ||
          state.errorUpdateCount() > mountedAtCounts.errorUpdateCount,
      ),
      data: useMemo(() => {
        const data = state.data();

        if (state.isPending()) {
          if (typeof obsOptions.placeholderData === 'function') {
            const placeholderValue = (
              obsOptions.placeholderData as (
                prev: TQueryFnData | undefined,
              ) => TQueryFnData | undefined
            )(lastData());
            if (placeholderValue !== undefined) {
              if (obsOptions.select) {
                return obsOptions.select(placeholderValue as any) as Awaited<TData>;
              }
              return placeholderValue as Awaited<TData>;
            }
          } else if (obsOptions.placeholderData !== undefined) {
            return obsOptions.placeholderData as Awaited<TData>;
          }
        }

        if (state.isSuccess() && data !== undefined) {
          lastData(data as TQueryFnData);
        }

        if (obsOptions.select && data !== undefined) {
          return obsOptions.select(data as any) as Awaited<TData>;
        }

        return data as Awaited<TData>;
      }),
      refetch: currentQuery.refetch,
      cancel: currentQuery.cancel,
      promise: (): Promise<Awaited<TData>> => {
        const d = state.data();
        if (d !== undefined) return Promise.resolve(d as Awaited<TData>);
        return (currentQuery.fetchPromise ?? currentQuery.fetch()).then(
          () => state.data()! as Awaited<TData>,
        );
      },
    };

    Object.freeze(result);

    if (shouldThrow) {
      const error = state.error()!;
      return new Proxy(result, {
        get() {
          throw error;
        },
      });
    }

    return result;
  }) as UseQueryResult<Awaited<TData>, TError>;
}
