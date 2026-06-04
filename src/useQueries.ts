import { $, type ObservableReadonly, useCleanup, useMemo } from 'voby';
import { noop } from './utils.ts';
import { useQueryClient } from './queryClient.ts';
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

  const queries = useMemo(
    () => {
      return options.queries.map((opts) => {
        const query = client.cache.build(client, opts as any);
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
          if (q.state.isPending() && opts.placeholderData !== undefined) {
            return opts.placeholderData;
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
    const results = queries().map((q: any, i: number) => ({
      ...q.state,
      data: dataMemos[i],
      refetch: q.refetch,
      cancel: q.cancel,
    }));

    if (options.combine) {
      return options.combine(results as any) as TCombinedResult;
    }

    return results as TCombinedResult;
  }) as unknown as ObservableReadonly<TCombinedResult>;
}
