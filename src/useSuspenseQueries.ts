import { $, type ObservableReadonly, useCleanup, useMemo, useResource } from 'voby';
import { useQueryClient } from './queryClient.ts';
import { QueryObserver } from './queryObserver.ts';
import { ensureSuspenseTimers } from './utils.ts';
import type { QueryClient, QueriesResultItem, UseQueriesOptions } from './types.ts';

export type { UseQueriesOptions } from './types.ts';

export type SuspenseQueriesOptions<T extends Array<any>> = UseQueriesOptions<T>;
export type SuspenseQueriesResults<T extends Array<any>> = {
  [K in keyof T]: QueriesResultItem;
};

export function useSuspenseQueries<
  T extends Array<any>,
  TCombinedResult = SuspenseQueriesResults<T>,
>(
  options: Omit<UseQueriesOptions<T, TCombinedResult>, 'subscribed'>,
  queryClient?: QueryClient,
): ObservableReadonly<TCombinedResult> {
  const client = useQueryClient(queryClient ?? options.queryClient);
  const tick = $(0);

  useCleanup(client.cache.subscribe(() => tick((v) => v + 1)));

  const observers = useMemo(
    () => {
      return options.queries.map((opts) => {
        const suspenseOpts = ensureSuspenseTimers(opts as any);
        const query = client.cache.build(client, suspenseOpts);
        useCleanup((query as any).addInstance());
        const obs = new QueryObserver(query, suspenseOpts);
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
        const q = obs.query;
        const opts = q.resolvedOptions;
        return useMemo(() => {
          const rawData = q.state.data();
          if (opts.select && rawData !== undefined) {
            return opts.select(rawData);
          }
          return rawData;
        });
      });
    },
    { sync: true },
  );

  const resource = useResource<TCombinedResult>(() => {
    const currentObservers = observers();
    const pending: Promise<void>[] = [];

    for (const obs of currentObservers) {
      const q = (obs as any).query;
      if (q.state.data() !== undefined) continue;
      if (q.state.error() !== null) throw q.state.error();

      pending.push(q.fetchPromise ?? q.fetch());
    }

    const buildResults = () => {
      const dataMemos = queryDataMemos();
      const results = currentObservers.map((obs: any, i: number) => {
        const q = obs.query;
        return {
          ...q.state,
          data: dataMemos[i],
          refetch: q.refetch,
          cancel: q.cancel,
        };
      });

      if (options.combine) {
        return options.combine(results as any) as TCombinedResult;
      }
      return results as TCombinedResult;
    };

    if (pending.length === 0) {
      return buildResults();
    }

    return Promise.all(pending).then(() => buildResults());
  });

  return useMemo(() => {
    tick();

    const currentObservers = observers();
    for (const obs of currentObservers) {
      const q = (obs as any).query;
      if (q.state.status() === 'error') {
        throw q.state.error()!;
      }
    }

    const dataMemos = queryDataMemos();
    const results = currentObservers.map((obs: any, i: number) => {
      const q = obs.query;
      return {
        ...q.state,
        data: dataMemos[i],
        refetch: q.refetch,
        cancel: q.cancel,
      };
    });

    const combined: TCombinedResult = options.combine
      ? (options.combine(results as any) as TCombinedResult)
      : (results as TCombinedResult);

    // Trigger suspension if resource is still pending
    const r = resource();
    if ((r as any).pending) {
      void (r as any).value;
    }

    return combined;
  }) as unknown as ObservableReadonly<TCombinedResult>;
}
