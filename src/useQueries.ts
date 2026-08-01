import { $, type ObservableReadonly, useCleanup, useMemo, untrack } from 'voby';
import { noop } from './utils.ts';
import { useQueryClient } from './queryClient.ts';
import { QueryObserver } from './queryObserver.ts';
import type { QueryClient, QueriesResultItem, QueriesResults, UseQueriesOptions } from './types.ts';

export type { UseQueriesOptions } from './types.ts';
export type { QueriesOptions, QueriesResults, QueriesResultItem } from './types.ts';

export function useQueries<T extends Array<any>, TCombinedResult = QueriesResults<T>>(
  options: UseQueriesOptions<T, TCombinedResult>,
  queryClient?: QueryClient,
): ObservableReadonly<TCombinedResult> {
  const client = useQueryClient(queryClient ?? options.queryClient);
  const tick = $(0);

  const shouldSubscribe = options.subscribed !== false;
  useCleanup(shouldSubscribe ? client.cache.subscribe(() => tick((v) => v + 1)) : noop);

  const lastDataMap = new Map<string, unknown>();
  const mountedCountsMap = new Map<string, { dataUpdateCount: number; errorUpdateCount: number }>();

  const observers = useMemo(
    () => {
      return options.queries.map((opts) => {
        const query = client.cache.build(client, opts as any);
        useCleanup((query as any).addInstance());
        const obs = new QueryObserver(query, opts as any);
        useCleanup(obs.subscribe(() => tick((v) => v + 1)));
        useCleanup(() => obs.destroy());
        if (!mountedCountsMap.has(query.queryHash)) {
          mountedCountsMap.set(query.queryHash, {
            dataUpdateCount: untrack(() => query.state.dataUpdateCount()),
            errorUpdateCount: untrack(() => query.state.errorUpdateCount()),
          });
        }
        return obs;
      });
    },
    { sync: true },
  );

  const queryDataMemos = useMemo(
    () => {
      return observers().map((obs: any) => {
        const q = (obs as any).query;
        const opts = q.resolvedOptions;
        const placeholderValue = useMemo(() => {
          if (!q.state.isPending()) return undefined;
          if (typeof opts.placeholderData === 'function') {
            return (opts.placeholderData as (prev: unknown) => unknown)(
              lastDataMap.get(q.queryHash),
            );
          }
          return opts.placeholderData;
        });
        const data = useMemo(() => {
          const placeholder = placeholderValue();
          if (placeholder !== undefined) {
            if (opts.select) return opts.select(placeholder);
            return placeholder;
          }

          const rawData = q.state.data();
          if (q.state.isSuccess() && rawData !== undefined) {
            lastDataMap.set(q.queryHash, rawData);
          }
          if (opts.select && rawData !== undefined) {
            return opts.select(rawData);
          }
          return rawData;
        });

        return { data, placeholderValue };
      });
    },
    { sync: true },
  );

  return useMemo(() => {
    tick();

    const queryMemos = queryDataMemos();
    const results = observers().map((obs: any, i: number) => {
      const q = obs.query;
      const counts = mountedCountsMap.get(q.queryHash);
      const { data, placeholderValue } = queryMemos[i];
      const hasPlaceholderValue = useMemo(() => placeholderValue() !== undefined);
      return Object.freeze({
        ...q.state,
        isFetchedAfterMount: useMemo(
          (): boolean =>
            q.state.dataUpdateCount() > (counts?.dataUpdateCount ?? 0) ||
            q.state.errorUpdateCount() > (counts?.errorUpdateCount ?? 0),
        ),
        isStale: useMemo(() => obs.isStale()),
        status: useMemo(() => (hasPlaceholderValue() ? 'success' : q.state.status())),
        isPending: useMemo(() => (hasPlaceholderValue() ? false : q.state.isPending())),
        isSuccess: useMemo(() => (hasPlaceholderValue() ? true : q.state.isSuccess())),
        isPlaceholderData: useMemo(() => hasPlaceholderValue()),
        isLoading: useMemo(() => !hasPlaceholderValue() && q.state.isLoading()),
        isInitialLoading: useMemo(() => !hasPlaceholderValue() && q.state.isInitialLoading()),
        isRefetching: useMemo(() => {
          const fetchStatus = q.state.fetchStatus();
          if (fetchStatus !== 'fetching') return false;
          if (hasPlaceholderValue()) return true;
          return q.state.isRefetching();
        }),
        isLoadingError: useMemo(() => {
          if (hasPlaceholderValue()) return false;
          return q.state.isLoadingError();
        }),
        data,
        refetch: q.refetch,
        cancel: q.cancel,
        promise: obs.getCurrentResult().promise,
      });
    });

    if (options.combine) {
      return options.combine(results as any) as TCombinedResult;
    }

    return results as TCombinedResult;
  }) as unknown as ObservableReadonly<TCombinedResult>;
}
