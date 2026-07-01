import { $, useCleanup, useEffect, useMemo, untrack } from 'voby';
import { useQueryClient } from './queryClient.ts';
import { QueryObserver } from './queryObserver.ts';
import type { QueryClient as QC, QueryKey, QueryOptions, UseQueryResult } from './types.ts';
import { CancelledError } from './query.ts';
import { hashQueryKeyByOptions, shouldThrowError } from './utils.ts';

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
  const observerQueryHash = useMemo(() => {
    const queryDefaults = client.getQueryDefaults(options.queryKey) as QueryOptions<
      TQueryFnData,
      TError,
      TData,
      TQueryKey
    >;
    const queryKeyHashFn =
      options.queryKeyHashFn ??
      queryDefaults.queryKeyHashFn ??
      client.getDefaultOptions().queries.queryKeyHashFn;

    return hashQueryKeyByOptions(options.queryKey, { queryKeyHashFn });
  });

  const observer = useMemo(() => {
    observerQueryHash();
    const q = untrack(() =>
      client.cache.build<TQueryFnData, TError, TData, TQueryKey>(client, options),
    );
    useCleanup((q as any).addInstance());
    const obs = untrack(
      () => new QueryObserver<TQueryFnData, TError, TData, TQueryKey>(q, options),
    );
    useCleanup(obs.subscribe(() => {}));
    useCleanup(() => obs.destroy());
    return obs;
  });

  useEffect(() => {
    client.cache.build<TQueryFnData, TError, TData, TQueryKey>(client, options);
    observer().setOptions(options);
  });

  return useMemo(() => {
    const obs = observer();
    const currentQuery = obs.query;
    const state = currentQuery.state;
    const obsOptions = obs.resolvedOptions;

    // Snapshot the update counts at mount time so isFetchedAfterMount
    // reflects fetches that happened *after* this observer mounted.
    const mountedAtCounts = {
      dataUpdateCount: untrack(() => state.dataUpdateCount()),
      errorUpdateCount: untrack(() => state.errorUpdateCount()),
    };

    const placeholderValue = useMemo(() => {
      if (!state.isPending()) return undefined;
      if (typeof obsOptions.placeholderData === 'function') {
        return (
          obsOptions.placeholderData as (prev: TQueryFnData | undefined) => TQueryFnData | undefined
        )(lastData());
      }
      return obsOptions.placeholderData;
    });

    const hasPlaceholderValue = useMemo(() => placeholderValue() !== undefined);

    const shouldThrow =
      state.isError() && shouldThrowError(obsOptions.throwOnError, [state.error()!, currentQuery]);

    const result = {
      ...state,
      status: useMemo(() => (hasPlaceholderValue() ? 'success' : state.status())),
      isFetchedAfterMount: useMemo(
        (): boolean =>
          state.dataUpdateCount() > mountedAtCounts.dataUpdateCount ||
          state.errorUpdateCount() > mountedAtCounts.errorUpdateCount,
      ),
      isSuccess: useMemo(() => (hasPlaceholderValue() ? true : state.isSuccess())),
      isPending: useMemo(() => (hasPlaceholderValue() ? false : state.isPending())),
      isPlaceholderData: useMemo(() => hasPlaceholderValue()),
      isLoading: useMemo(() => !hasPlaceholderValue() && state.isLoading()),
      isInitialLoading: useMemo(() => !hasPlaceholderValue() && state.isInitialLoading()),
      isRefetching: useMemo(() => {
        const fetchStatus = state.fetchStatus();
        if (fetchStatus !== 'fetching') return false;
        if (hasPlaceholderValue()) return true;
        return state.isRefetching();
      }),
      isLoadingError: useMemo(() => {
        if (hasPlaceholderValue()) return false;
        return state.isLoadingError();
      }),
      data: useMemo(() => {
        const pv = placeholderValue();
        if (pv !== undefined) {
          if (obsOptions.select) {
            return obsOptions.select(pv as any) as Awaited<TData>;
          }
          return pv as Awaited<TData>;
        }

        const data = state.data();

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
