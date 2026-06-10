import { useMemo, useResource } from 'voby';
import { useBaseQuery } from './useBaseQuery.ts';
import type {
  QueryKey,
  QueryOptions,
  UseSuspenseQueryOptions,
  UseSuspenseQueryResult,
} from './types.ts';
import { ensureSuspenseTimers } from './utils.ts';

export function useSuspenseQuery<
  TQueryFnData = unknown,
  TError = Error,
  TData = TQueryFnData,
  TQueryKey extends QueryKey = QueryKey,
>(
  options: UseSuspenseQueryOptions<TQueryFnData, TError, TData, TQueryKey>,
  queryClient?: import('./types.ts').QueryClient,
): UseSuspenseQueryResult<Awaited<TData>, TError> {
  const query = useBaseQuery(queryClient ?? options.queryClient, (client) =>
    client.cache.build<TQueryFnData, TError, TData, TQueryKey>(
      client,
      ensureSuspenseTimers(options) as QueryOptions<TQueryFnData, TError, TData, TQueryKey>,
    ),
  );

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

    // Access `.value` to trigger suspend() in Voby's useResource
    // eslint-disable-next-line no-unused-expressions
    resource().value;
    const { isPlaceholderData: _isPlaceholderData, ...rest } = stateObservable;

    return Object.freeze({
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
    });
  }) as unknown as UseSuspenseQueryResult<Awaited<TData>, TError>;
}
