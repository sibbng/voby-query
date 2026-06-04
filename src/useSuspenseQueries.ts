import { $, type ObservableReadonly, useCleanup, useMemo, useResource } from 'voby';
import { useQueryClient } from './queryClient.ts';
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

  const queries = useMemo(
    () => {
      return options.queries.map((opts) => {
        const suspenseOpts = ensureSuspenseTimers(opts as any);
        const query = client.cache.build(client, suspenseOpts);
        useCleanup(query.addInstance());
        return query;
      });
    },
    { sync: true },
  );

  const queryDataMemos = useMemo(
    () => {
      return queries().map((q: any) => {
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
    const currentQueries = queries();
    const pending: Promise<void>[] = [];

    for (const q of currentQueries) {
      if (q.state.data() !== undefined) continue;
      if (q.state.error() !== null) throw q.state.error();

      pending.push(q.fetchPromise ?? q.fetch());
    }

    const buildResults = () => {
      const dataMemos = queryDataMemos();
      const results = currentQueries.map((q: any, i: number) => ({
        ...q.state,
        data: dataMemos[i],
        refetch: q.refetch,
        cancel: q.cancel,
      }));

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

    const currentQueries = queries();
    for (const q of currentQueries) {
      if (q.state.status() === 'error') {
        throw q.state.error()!;
      }
    }

    const dataMemos = queryDataMemos();
    const results = currentQueries.map((q: any, i: number) => ({
      ...q.state,
      data: dataMemos[i],
      refetch: q.refetch,
      cancel: q.cancel,
    }));

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
