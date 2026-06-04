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
>(
  options: UseSuspenseQueryOptions<TQueryFnData, TError, TData, TQueryKey>,
): UseSuspenseQueryResult<Awaited<TData>, TError> {
  const queryClient = useQueryClient(options.queryClient);
  const query = useMemo(() => {
    const nextQuery = queryClient.cache.build<TQueryFnData, TError, TData, TQueryKey>(
      queryClient,
      options as QueryOptions<TQueryFnData, TError, TData, TQueryKey>,
    );
    useCleanup(nextQuery.addInstance());
    return nextQuery;
  });

  const resource = useResource<Awaited<TData>>(() => {
    const currentQuery = query();

    if (currentQuery.state.data() !== undefined) {
      return currentQuery.state.data() as Awaited<TData>;
    }

    if (currentQuery.state.error() !== null) {
      throw currentQuery.state.error();
    }

    if (currentQuery.fetchPromise) {
      return currentQuery.fetchPromise!.then(() => currentQuery.state.data()! as Awaited<TData>);
    }

    return currentQuery.fetch().then(() => currentQuery.state.data()! as Awaited<TData>);
  });

  return useMemo(() => {
    const currentQuery = query();
    const { state: stateObservable, resolvedOptions } = currentQuery;

    if (stateObservable.status() === 'error') {
      throw stateObservable.error()!;
    }

    const r = resource();
    const data = r.value;

    const { isPlaceholderData: _isPlaceholderData, ...rest } = stateObservable;

    return {
      ...rest,
      data: useMemo(() => {
        const currentData = stateObservable.data();

        if (resolvedOptions.select && currentData !== undefined) {
          return resolvedOptions.select(currentData as any) as Awaited<TData>;
        }

        return currentData as Awaited<TData>;
      }),
      refetch: currentQuery.refetch,
      cancel: currentQuery.cancel,
    };
  }) as unknown as UseSuspenseQueryResult<Awaited<TData>, TError>;
}
