import { $, useCleanup, useMemo, useResource } from 'voby';
import {
  fetchInfiniteDataPage,
  hasNextPage,
  hasPreviousPage,
  refetchInfiniteData,
} from './infiniteQuery.ts';
import { useQueryClient } from './queryClient.ts';
import type { Query } from './query.ts';
import type {
  InfiniteData,
  InfiniteQueryDirection,
  InfiniteQueryOptions,
  QueryKey,
  QueryOptions,
  UseSuspenseInfiniteQueryResult,
} from './types.ts';

export type {
  InfiniteData,
  InfiniteQueryDirection,
  InfiniteQueryFunctionContext,
  InfiniteQueryOptions,
  UseSuspenseInfiniteQueryResult,
} from './types.ts';

export function useSuspenseInfiniteQuery<
  TQueryFnData = unknown,
  TError = Error,
  TQueryKey extends QueryKey = QueryKey,
  TPageParam = unknown,
>(
  options: Omit<
    InfiniteQueryOptions<TQueryFnData, TError, TQueryKey, TPageParam>,
    'enabled' | 'placeholderData' | 'throwOnError'
  >,
): UseSuspenseInfiniteQueryResult<Awaited<InfiniteData<TQueryFnData, TPageParam>>, TError> {
  const queryClient = useQueryClient(options.queryClient);
  const fetchingDirection = $<InfiniteQueryDirection | undefined>(undefined);

  const query = useMemo(() => {
    let nextQuery!: Query<
      InfiniteData<TQueryFnData, TPageParam>,
      TError,
      InfiniteData<TQueryFnData, TPageParam>,
      TQueryKey
    >;

    const infiniteQueryOptions = {
      ...options,
      queryFn: ({ signal }) =>
        refetchInfiniteData({
          options,
          signal,
          data: nextQuery?.state.data(),
        }),
    } as QueryOptions<
      InfiniteData<TQueryFnData, TPageParam>,
      TError,
      InfiniteData<TQueryFnData, TPageParam>,
      TQueryKey
    >;

    nextQuery = queryClient.cache.build<
      InfiniteData<TQueryFnData, TPageParam>,
      TError,
      InfiniteData<TQueryFnData, TPageParam>,
      TQueryKey
    >(queryClient, infiniteQueryOptions);
    useCleanup(nextQuery.addInstance());
    return nextQuery;
  });

  const resource = useResource<Awaited<InfiniteData<TQueryFnData, TPageParam>>>(() => {
    const currentQuery = query();

    if (currentQuery.state.data() !== undefined) {
      return currentQuery.state.data() as Awaited<InfiniteData<TQueryFnData, TPageParam>>;
    }

    if (currentQuery.state.error() !== null) {
      throw currentQuery.state.error();
    }

    if (currentQuery.fetchPromise) {
      return currentQuery.fetchPromise!.then(
        () => currentQuery.state.data()! as Awaited<InfiniteData<TQueryFnData, TPageParam>>,
      );
    }

    return currentQuery
      .fetch()
      .then(() => currentQuery.state.data()! as Awaited<InfiniteData<TQueryFnData, TPageParam>>);
  });

  return useMemo(() => {
    const currentQuery = query();
    const { state, resolvedOptions } = currentQuery;

    if (state.status() === 'error') {
      throw state.error()!;
    }

    const r = resource();
    const data = r.value;

    const fetchPage = async (
      direction: InfiniteQueryDirection,
      fetchOptions: { cancelRefetch?: boolean } = {},
    ) => {
      const { cancelRefetch = true } = fetchOptions;
      const data = state.data();

      if (direction === 'forward' && data && !hasNextPage(options, data)) return;
      if (direction === 'backward' && data && !hasPreviousPage(options, data)) return;

      if (cancelRefetch) {
        await currentQuery.cancel({ revert: false, silent: true });
      }

      fetchingDirection(direction);
      try {
        await currentQuery.fetch({
          force: true,
          fetchFn: ({ signal }) =>
            fetchInfiniteDataPage({
              options,
              signal,
              data: state.data(),
              direction,
            }),
        });
      } finally {
        if (fetchingDirection() === direction) {
          fetchingDirection(undefined);
        }
      }
    };

    const { isPlaceholderData: _isPlaceholderData, ...rest } = state;

    return {
      ...rest,
      data: useMemo(() => {
        const currentData = state.data();

        if (resolvedOptions.select && currentData !== undefined) {
          return resolvedOptions.select(currentData as any) as Awaited<
            InfiniteData<TQueryFnData, TPageParam>
          >;
        }

        return currentData as Awaited<InfiniteData<TQueryFnData, TPageParam>>;
      }),
      hasNextPage: useMemo(() => hasNextPage(options, state.data())),
      hasPreviousPage: useMemo(() => hasPreviousPage(options, state.data())),
      isFetchingNextPage: useMemo(() => state.isFetching() && fetchingDirection() === 'forward'),
      isFetchingPreviousPage: useMemo(
        () => state.isFetching() && fetchingDirection() === 'backward',
      ),
      fetchNextPage: (fetchOptions?: { cancelRefetch?: boolean }) =>
        fetchPage('forward', fetchOptions),
      fetchPreviousPage: (fetchOptions?: { cancelRefetch?: boolean }) =>
        fetchPage('backward', fetchOptions),
      refetch: currentQuery.refetch,
      cancel: currentQuery.cancel,
    };
  }) as unknown as UseSuspenseInfiniteQueryResult<
    Awaited<InfiniteData<TQueryFnData, TPageParam>>,
    TError
  >;
}
