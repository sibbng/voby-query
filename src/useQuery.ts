import { $, useCleanup, useEffect, useMemo, untrack } from 'voby';
import { useQueryClient } from './queryClient.ts';
import { QueryObserver } from './queryObserver.ts';
import type { QueryClient as QC, QueryKey, QueryOptions, UseQueryResult } from './types.ts';
import { CancelledError, type Query } from './query.ts';
import { hashQueryKeyByOptions, replaceData, shouldThrowError } from './utils.ts';

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
  const tick = $(0);
  const promiseTick = $(0);
  let currentPromise: Promise<Awaited<TData>> | undefined;
  let lastQueryWithDefinedData: Query<TQueryFnData, TError, TData, TQueryKey> | undefined;
  let pinnedPlaceholder:
    | {
        option: QueryOptions<TQueryFnData, TError, TData, TQueryKey>['placeholderData'];
        value: unknown;
      }
    | undefined;
  let lastResultData: unknown;
  let lastResultStateData: unknown;
  let selectCache: { fn: unknown; result: unknown } = { fn: undefined, result: undefined };
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
    useCleanup(
      obs.subscribe(() => {
        const nextPromise = untrack(
          () => obs.getCurrentResult().promise as Promise<Awaited<TData>>,
        );
        if (nextPromise !== currentPromise) {
          currentPromise = nextPromise;
          promiseTick((v) => v + 1);
        }
        tick((v) => v + 1);
      }),
    );
    useCleanup(() => obs.destroy());
    return obs;
  });

  let mountedAtQuery: Query<TQueryFnData, TError, TData, TQueryKey> | undefined;
  let mountedAtCounts: { dataUpdateCount: number; errorUpdateCount: number } | undefined;

  useEffect(() => {
    client.cache.build<TQueryFnData, TError, TData, TQueryKey>(client, options);
    observer().setOptions(options);
  });

  return useMemo(() => {
    const obs = observer();
    promiseTick();
    const currentQuery = obs.query;
    const observerResult = untrack(() => obs.getCurrentResult());
    const state = currentQuery.state;
    const obsOptions = obs.resolvedOptions;

    if (mountedAtQuery !== currentQuery) {
      mountedAtQuery = currentQuery;
      mountedAtCounts = {
        dataUpdateCount: untrack(() => state.dataUpdateCount()),
        errorUpdateCount: untrack(() => state.errorUpdateCount()),
      };
    }

    const placeholderValue = useMemo(() => {
      if (!state.isPending()) {
        pinnedPlaceholder = undefined;
        return undefined;
      }

      const option = obsOptions.placeholderData;

      // Memoize placeholder data: reuse the previous result while the same
      // placeholderData option is active, skipping the function and select
      if (
        option !== undefined &&
        pinnedPlaceholder !== undefined &&
        pinnedPlaceholder.option === option
      ) {
        return pinnedPlaceholder.value;
      }

      let placeholder: unknown;
      if (typeof option === 'function') {
        placeholder = (
          option as unknown as (
            prev: TQueryFnData | undefined,
            prevQuery: Query<TQueryFnData, TError, TData, TQueryKey> | undefined,
          ) => TQueryFnData | undefined
        )(lastData(), lastQueryWithDefinedData);
      } else {
        placeholder = option;
      }

      if (placeholder === undefined) return undefined;

      placeholder = replaceData(lastResultData, placeholder, {
        structuralSharing: obsOptions.structuralSharing,
      });

      if (obsOptions.select) {
        const select = obsOptions.select as unknown as (data: unknown) => unknown;
        if (placeholder === lastResultStateData && selectCache.fn === obsOptions.select) {
          placeholder = selectCache.result;
        } else {
          placeholder = select(placeholder);
          selectCache = { fn: obsOptions.select, result: placeholder };
        }
        lastResultStateData = state.data();
      }

      pinnedPlaceholder = { option, value: placeholder };
      return placeholder;
    });

    const hasPlaceholderValue = useMemo(() => placeholderValue() !== undefined);

    const shouldThrow =
      state.isError() && shouldThrowError(obsOptions.throwOnError, [state.error()!, currentQuery]);

    const resultPromise = observerResult.promise as Promise<Awaited<TData>>;
    currentPromise = resultPromise;

    const result = {
      ...state,
      status: useMemo(() => (hasPlaceholderValue() ? 'success' : state.status())),
      isFetchedAfterMount: useMemo(
        (): boolean =>
          state.dataUpdateCount() > mountedAtCounts!.dataUpdateCount ||
          state.errorUpdateCount() > mountedAtCounts!.errorUpdateCount,
      ),
      isStale: useMemo(() => {
        tick();
        return obs.isStale();
      }),
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
          lastResultData = pv;
          return pv as Awaited<TData>;
        }

        const data = state.data();

        if (state.isSuccess() && data !== undefined) {
          lastData(data as TQueryFnData);
          lastQueryWithDefinedData = currentQuery;
        }

        if (obsOptions.select && data !== undefined) {
          const selected = (obsOptions.select as unknown as (d: unknown) => unknown)(
            data as unknown,
          ) as Awaited<TData>;
          selectCache = { fn: obsOptions.select, result: selected };
          lastResultStateData = data;
          lastResultData = selected;
          return selected;
        }

        lastResultData = data;
        return data as Awaited<TData>;
      }),
      refetch: currentQuery.refetch,
      cancel: currentQuery.cancel,
      promise: resultPromise,
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
