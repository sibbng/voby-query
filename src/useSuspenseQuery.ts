import { $, useCleanup, useMemo, useResource } from 'voby';
import { useQueryClient } from './queryClient.ts';
import { QueryObserver } from './queryObserver.ts';
import type {
  QueryClient as QC,
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
  queryClient?: QC,
): UseSuspenseQueryResult<Awaited<TData>, TError> {
  const client = useQueryClient(queryClient ?? options.queryClient);

  // Suspense queries use staleTime: Infinity to prevent re-fetching on re-render
  const suspenseOptions = ensureSuspenseTimers(options) as QueryOptions<
    TQueryFnData,
    TError,
    TData,
    TQueryKey
  >;

  const tick = $(0);

  const observer = useMemo(() => {
    const q = client.cache.build<TQueryFnData, TError, TData, TQueryKey>(client, suspenseOptions);
    useCleanup((q as any).addInstance());
    const obs = new QueryObserver<TQueryFnData, TError, TData, TQueryKey>(q, suspenseOptions);
    useCleanup(obs.subscribe(() => tick((v) => v + 1)));
    useCleanup(() => obs.destroy());
    return obs;
  });

  const resource = useResource<Awaited<TData>>(() => {
    const obs = observer();
    const currentQuery = obs.query;

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
    tick(); // depend on observer notifications
    const obs = observer();
    const currentQuery = obs.query;
    const stateObservable = currentQuery.state;
    const obsOptions = obs.resolvedOptions;

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

        if (obsOptions.select && currentData !== undefined) {
          return obsOptions.select(currentData as any) as Awaited<TData>;
        }

        return currentData as Awaited<TData>;
      }),
      refetch: currentQuery.refetch,
      cancel: currentQuery.cancel,
    });
  }) as unknown as UseSuspenseQueryResult<Awaited<TData>, TError>;
}
