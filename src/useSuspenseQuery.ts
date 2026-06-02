import { useCleanup, useMemo, useResource } from 'voby';
import { useQueryClient } from './queryClient.ts';
import type {
  QueryKey,
  QueryOptions,
  UseSuspenseQueryOptions,
  UseSuspenseQueryResult,
} from './types.ts';

export function useSuspenseQuery<
  TQueryFnData = unknown,
  TError = Error,
  TData = TQueryFnData,
  TQueryKey extends QueryKey = QueryKey,
  TInitialData extends TQueryFnData | undefined = undefined,
  R = void,
  D = R extends void ? (TInitialData extends TQueryFnData ? TInitialData : TQueryFnData) : R,
>(
  options: UseSuspenseQueryOptions<TQueryFnData, TError, TData, TQueryKey, TInitialData, R>,
): UseSuspenseQueryResult<Awaited<D>, TError> {
  const queryClient = useQueryClient(options.queryClient);
  const query = useMemo(() => {
    const nextQuery = queryClient.cache.build<
      TQueryFnData,
      TError,
      TData,
      TQueryKey,
      TInitialData,
      R
    >(queryClient, options as QueryOptions<TQueryFnData, TError, TData, TQueryKey, TInitialData, R>);
    useCleanup(nextQuery.addInstance());
    return nextQuery;
  });

  const resource = useResource<Awaited<D>>(() => {
    const currentQuery = query();

    if (currentQuery.state.data() !== undefined) {
      return currentQuery.state.data() as Awaited<D>;
    }

    if (currentQuery.state.error() !== null) {
      throw currentQuery.state.error();
    }

    if (currentQuery.fetchPromise) {
      return currentQuery.fetchPromise!.then(() => currentQuery.state.data()! as Awaited<D>);
    }

    return currentQuery.fetch().then(() => currentQuery.state.data()! as Awaited<D>);
  });

  return useMemo(() => {
    const currentQuery = query();
    const { state: stateObservable, resolvedOptions } = currentQuery;

    if (stateObservable.status() === 'error') {
      throw stateObservable.error()!;
    }

    const r = resource();
    const data = r.value;

    const {
      isPlaceholderData: _isPlaceholderData,
      ...rest
    } = stateObservable;

    return {
      ...rest,
      data: useMemo(() => {
        const currentData = stateObservable.data();

        if (resolvedOptions.select && currentData !== undefined) {
          return resolvedOptions.select(currentData as any) as Awaited<D>;
        }

        return currentData as Awaited<D>;
      }),
      refetch: currentQuery.refetch,
      cancel: currentQuery.cancel,
    };
  }) as unknown as UseSuspenseQueryResult<Awaited<D>, TError>;
}
