import { $, useCleanup, useMemo } from 'voby';
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
  UseInfiniteQueryResult,
} from './types.ts';

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
): UseInfiniteQueryResult<Awaited<InfiniteData<TQueryFnData, TPageParam>>, TError> {
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

  return useMemo(() => {
    const currentQuery = query();
    const { state, resolvedOptions } = currentQuery;
    const infiniteOptions = options;

    const fetchPage = async (direction: InfiniteQueryDirection, fetchOptions = {}) => {
      const { throwOnError = resolvedOptions.throwOnError, cancelRefetch = true } =
        fetchOptions as {
          throwOnError?: boolean;
          cancelRefetch?: boolean;
        };
      const data = state.data();

      if (!resolvedOptions.enabled) return;
      if (direction === 'forward' && data && !hasNextPage(infiniteOptions, data)) return;
      if (direction === 'backward' && data && !hasPreviousPage(infiniteOptions, data)) return;

      if (cancelRefetch) {
        await currentQuery.cancel({ revert: false, silent: true });
      }

      fetchingDirection(direction);
      try {
        await currentQuery.fetch({
          force: true,
          throwOnError,
          fetchFn: ({ signal }) =>
            fetchInfiniteDataPage({
              options: infiniteOptions,
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

    return {
      ...state,
      data: useMemo(() => {
        const data = state.data();

        if (state.isPending() && resolvedOptions.placeholderData !== undefined) {
          return resolvedOptions.placeholderData as Awaited<InfiniteData<TQueryFnData, TPageParam>>;
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
      isFetchingNextPage: useMemo(() => state.isFetching() && fetchingDirection() === 'forward'),
      isFetchingPreviousPage: useMemo(
        () => state.isFetching() && fetchingDirection() === 'backward',
      ),
      fetchNextPage: (fetchOptions?: { throwOnError?: boolean; cancelRefetch?: boolean }) =>
        fetchPage('forward', fetchOptions),
      fetchPreviousPage: (fetchOptions?: { throwOnError?: boolean; cancelRefetch?: boolean }) =>
        fetchPage('backward', fetchOptions),
      refetch: currentQuery.refetch,
      cancel: currentQuery.cancel,
    };
  }) as UseInfiniteQueryResult<Awaited<InfiniteData<TQueryFnData, TPageParam>>, TError>;
}
