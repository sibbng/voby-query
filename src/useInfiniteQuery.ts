import { $, useCleanup, useMemo, untrack } from 'voby';
import {
  fetchInfiniteDataPage,
  hasNextPage,
  hasPreviousPage,
  refetchInfiniteData,
} from './infiniteQuery.ts';
import { getQueryResultState, QueryObserver } from './queryObserver.ts';
import type { Query } from './query.ts';
import type {
  InfiniteData,
  InfiniteQueryDirection,
  InfiniteQueryFetchPageOptions,
  InfiniteQueryOptions,
  QueryClient as QC,
  QueryKey,
  UseInfiniteQueryResult,
  UseInfiniteQueryResultValue,
} from './types.ts';
import { useQueryClient } from './queryClient.ts';

export type {
  InfiniteData,
  InfiniteQueryDirection,
  InfiniteQueryFunctionContext,
  InfiniteQueryOptions,
  UseInfiniteQueryResult,
} from './types.ts';

export function useInfiniteQuery<
  TQueryFnData = unknown,
  TError = Error,
  TQueryKey extends QueryKey = QueryKey,
  TPageParam = unknown,
>(
  options: InfiniteQueryOptions<TQueryFnData, TError, TQueryKey, TPageParam>,
  queryClient?: QC,
): UseInfiniteQueryResult<Awaited<InfiniteData<TQueryFnData, TPageParam>>, TError> {
  const client = useQueryClient(queryClient ?? options.queryClient);
  const lastData = $<Awaited<InfiniteData<TQueryFnData, TPageParam>> | undefined>();
  const tick = $(0);
  const promiseTick = $(0);
  let currentPromise: Promise<Awaited<InfiniteData<TQueryFnData, TPageParam>>> | undefined;
  let currentResult:
    | UseInfiniteQueryResultValue<
        Awaited<InfiniteData<TQueryFnData, TPageParam>> | undefined,
        TError
      >
    | undefined;

  const observer = useMemo(() => {
    let nextQuery!: Query<
      InfiniteData<TQueryFnData, TPageParam>,
      TError,
      InfiniteData<TQueryFnData, TPageParam>,
      TQueryKey
    >;
    const wrappedOptions = {
      ...options,
      queryFn: ({ signal }: { signal: AbortSignal }) =>
        refetchInfiniteData({
          options,
          signal,
          data: nextQuery?.state.data(),
        }),
    } as const;

    nextQuery = client.cache.build<
      InfiniteData<TQueryFnData, TPageParam>,
      TError,
      InfiniteData<TQueryFnData, TPageParam>,
      TQueryKey
    >(client, wrappedOptions as any);
    useCleanup((nextQuery as any).addInstance());
    const obs = new QueryObserver(nextQuery, wrappedOptions as any);
    useCleanup(
      obs.subscribe(() => {
        const nextPromise = untrack(
          () =>
            obs.getCurrentResult().promise as Promise<
              Awaited<InfiniteData<TQueryFnData, TPageParam>>
            >,
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

  let mountedAtQuery:
    | Query<
        InfiniteData<TQueryFnData, TPageParam>,
        TError,
        InfiniteData<TQueryFnData, TPageParam>,
        TQueryKey
      >
    | undefined;
  let mountedAtCounts: { dataUpdateCount: number; errorUpdateCount: number } | undefined;

  return useMemo(
    (): UseInfiniteQueryResultValue<
      Awaited<InfiniteData<TQueryFnData, TPageParam>> | undefined,
      TError
    > => {
      const obs = observer();
      promiseTick();
      const currentQuery = obs.query;
      const observerResult = untrack(() => obs.getCurrentResult());
      const state = currentQuery.state;
      const resolvedOptions = currentQuery.resolvedOptions;
      const infiniteOptions = options;

      if (mountedAtQuery !== currentQuery) {
        mountedAtQuery = currentQuery;
        mountedAtCounts = {
          dataUpdateCount: untrack(() => state.dataUpdateCount()),
          errorUpdateCount: untrack(() => state.errorUpdateCount()),
        };
      }

      const fetchPage = async (
        direction: InfiniteQueryDirection,
        fetchOptions?: InfiniteQueryFetchPageOptions,
      ): Promise<
        UseInfiniteQueryResultValue<
          Awaited<InfiniteData<TQueryFnData, TPageParam>> | undefined,
          TError
        >
      > => {
        const { throwOnError = resolvedOptions.throwOnError, cancelRefetch = true } =
          fetchOptions ?? {};
        const data = state.data();

        if (direction === 'forward' && data && !hasNextPage(infiniteOptions, data)) {
          return currentResult!;
        }
        if (direction === 'backward' && data && !hasPreviousPage(infiniteOptions, data)) {
          return currentResult!;
        }

        if (cancelRefetch) {
          await currentQuery.cancel({ revert: false, silent: true });
        }

        await currentQuery.fetch({
          force: true,
          throwOnError,
          meta: { fetchMore: { direction } },
          fetchFn: ({ signal }: { signal: AbortSignal }) =>
            fetchInfiniteDataPage({
              options: infiniteOptions,
              signal,
              data: state.data(),
              direction,
            }),
        });

        return currentResult!;
      };

      const resultPromise = observerResult.promise as Promise<
        Awaited<InfiniteData<TQueryFnData, TPageParam>>
      >;
      currentPromise = resultPromise;

      const result = Object.freeze({
        ...getQueryResultState(state),
        isFetchedAfterMount: useMemo(
          (): boolean =>
            state.dataUpdateCount() > mountedAtCounts!.dataUpdateCount ||
            state.errorUpdateCount() > mountedAtCounts!.errorUpdateCount,
        ),
        isStale: useMemo(() => {
          tick();
          return obs.isStale();
        }),
        data: useMemo(() => {
          const data = state.data();

          if (state.isPending()) {
            if (typeof resolvedOptions.placeholderData === 'function') {
              const placeholderFn = resolvedOptions.placeholderData as (
                prev: Awaited<InfiniteData<TQueryFnData, TPageParam>> | undefined,
              ) => Awaited<InfiniteData<TQueryFnData, TPageParam>> | undefined;
              const placeholderValue = placeholderFn(lastData());
              if (placeholderValue !== undefined) {
                if (resolvedOptions.select) {
                  return resolvedOptions.select(placeholderValue as any) as Awaited<
                    InfiniteData<TQueryFnData, TPageParam>
                  >;
                }
                return placeholderValue as Awaited<InfiniteData<TQueryFnData, TPageParam>>;
              }
            } else if (resolvedOptions.placeholderData !== undefined) {
              return resolvedOptions.placeholderData as Awaited<
                InfiniteData<TQueryFnData, TPageParam>
              >;
            }
          }

          if (state.isSuccess() && data !== undefined) {
            lastData(data);
          }

          if (resolvedOptions.select && data !== undefined) {
            return resolvedOptions.select(data as any) as Awaited<
              InfiniteData<TQueryFnData, TPageParam>
            >;
          }

          return data as Awaited<InfiniteData<TQueryFnData, TPageParam>>;
        }),
        hasNextPage: useMemo(() => hasNextPage(infiniteOptions, state.data())),
        hasPreviousPage: useMemo(() => hasPreviousPage(infiniteOptions, state.data())),
        isFetchingNextPage: useMemo(
          () => state.isFetching() && state.fetchMeta()?.fetchMore?.direction === 'forward',
        ),
        isFetchingPreviousPage: useMemo(
          () => state.isFetching() && state.fetchMeta()?.fetchMore?.direction === 'backward',
        ),
        fetchNextPage: (fetchOptions?: InfiniteQueryFetchPageOptions) =>
          fetchPage('forward', fetchOptions),
        fetchPreviousPage: (fetchOptions?: InfiniteQueryFetchPageOptions) =>
          fetchPage('backward', fetchOptions),
        refetch: async (fetchOptions?: InfiniteQueryFetchPageOptions) => {
          await currentQuery.refetch(fetchOptions);
          return currentResult!;
        },
        promise: resultPromise,
      });

      currentResult = result;
      return result;
    },
  );
}
