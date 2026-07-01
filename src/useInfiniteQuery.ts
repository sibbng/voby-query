import { $, useCleanup, useMemo } from 'voby';
import {
  fetchInfiniteDataPage,
  hasNextPage,
  hasPreviousPage,
  refetchInfiniteData,
} from './infiniteQuery.ts';
import { QueryObserver } from './queryObserver.ts';
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
  const fetchingDirection = $<InfiniteQueryDirection | undefined>(undefined);
  const lastData = $<Awaited<InfiniteData<TQueryFnData, TPageParam>> | undefined>();

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
    useCleanup(obs.subscribe(() => {}));
    useCleanup(() => obs.destroy());
    return obs;
  });

  return useMemo(
    (): UseInfiniteQueryResultValue<
      Awaited<InfiniteData<TQueryFnData, TPageParam>> | undefined,
      TError
    > => {
      const obs = observer();
      const currentQuery = obs.query;
      const state = currentQuery.state;
      const resolvedOptions = currentQuery.resolvedOptions;
      const infiniteOptions = options;

      const fetchPage = async (
        direction: InfiniteQueryDirection,
        fetchOptions?: InfiniteQueryFetchPageOptions,
      ) => {
        const { throwOnError = resolvedOptions.throwOnError, cancelRefetch = true } =
          fetchOptions ?? {};
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
            fetchFn: ({ signal }: { signal: AbortSignal }) =>
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

      return Object.freeze({
        ...state,
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
        isFetchingNextPage: useMemo(() => state.isFetching() && fetchingDirection() === 'forward'),
        isFetchingPreviousPage: useMemo(
          () => state.isFetching() && fetchingDirection() === 'backward',
        ),
        fetchNextPage: (fetchOptions?: InfiniteQueryFetchPageOptions) =>
          fetchPage('forward', fetchOptions),
        fetchPreviousPage: (fetchOptions?: InfiniteQueryFetchPageOptions) =>
          fetchPage('backward', fetchOptions),
        refetch: currentQuery.refetch,
        cancel: currentQuery.cancel,
        promise: (): Promise<Awaited<InfiniteData<TQueryFnData, TPageParam>>> => {
          const d = state.data();
          if (d !== undefined)
            return Promise.resolve(d as Awaited<InfiniteData<TQueryFnData, TPageParam>>);
          return (currentQuery.fetchPromise ?? currentQuery.fetch()).then(
            () => state.data()! as Awaited<InfiniteData<TQueryFnData, TPageParam>>,
          );
        },
      });
    },
  );
}
