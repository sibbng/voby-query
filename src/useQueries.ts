import { $, type ObservableReadonly, useCleanup, useMemo } from 'voby';
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

  const observers = useMemo(
    () => {
      return options.queries.map((opts) => {
        const query = client.cache.build(client, opts as any);
        useCleanup((query as any).addInstance());
        const obs = new QueryObserver(query, opts as any);
        useCleanup(obs.subscribe(() => tick((v) => v + 1)));
        useCleanup(() => obs.destroy());
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
        return useMemo(() => {
          const rawData = q.state.data();
          if (q.state.isPending()) {
            if (typeof opts.placeholderData === 'function') {
              const placeholderValue = (opts.placeholderData as (prev: unknown) => unknown)(
                lastDataMap.get(q.queryHash),
              );
              if (placeholderValue !== undefined) {
                if (opts.select) {
                  return opts.select(placeholderValue);
                }
                return placeholderValue;
              }
            } else if (opts.placeholderData !== undefined) {
              return opts.placeholderData;
            }
          }
          if (q.state.isSuccess() && rawData !== undefined) {
            lastDataMap.set(q.queryHash, rawData);
          }
          if (opts.select && rawData !== undefined) {
            return opts.select(rawData);
          }
          return rawData;
        });
      });
    },
    { sync: true },
  );

  return useMemo(() => {
    tick();

    const dataMemos = queryDataMemos();
    const results = observers().map((obs: any, i: number) => {
      const q = obs.query;
      return Object.freeze({
        ...q.state,
        data: dataMemos[i],
        refetch: q.refetch,
        cancel: q.cancel,
      });
    });

    if (options.combine) {
      return options.combine(results as any) as TCombinedResult;
    }

    return results as TCombinedResult;
  }) as unknown as ObservableReadonly<TCombinedResult>;
}
