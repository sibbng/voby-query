import { createQuery, resolveQueryOptions, type Query } from './query.ts';
import { Subscribable } from './subscribable.ts';
import type {
  QueryCache as QueryCacheType,
  QueryClient,
  QueryFilters,
  QueryKey,
  QueryOptions,
} from './types.ts';
import { partialMatchKey } from './utils.ts';

export interface QueryCacheConfig {
  onError?: (error: unknown, query: Query<any, any, any, any>) => void;
  onSuccess?: (data: unknown, query: Query<any, any, any, any>) => void;
  onSettled?: (
    data: unknown | undefined,
    error: unknown | null,
    query: Query<any, any, any, any>,
  ) => void;
}

export type QueryCacheNotifyEvent =
  | { type: 'added'; query: Query<any, any, any, any> }
  | { type: 'removed'; query: Query<any, any, any, any> }
  | { type: 'updated'; query: Query<any, any, any, any> };

type QueryCacheListener = (event: QueryCacheNotifyEvent) => void;

const matchesQueryFilters = <TQuery extends Query<any, any, any, any>>(
  query: TQuery,
  filters?: QueryFilters,
) => {
  if (!filters) return true;

  const { queryKey, exact = false, type = 'all', stale, fetchStatus, predicate } = filters;

  if (queryKey) {
    const matchesKey = exact
      ? query.queryHash === query.resolvedOptions.queryKeyHashFn!(queryKey)
      : partialMatchKey(queryKey, query.resolvedOptions.queryKey);
    if (!matchesKey) return false;
  }
  if (type === 'active' && !query.isActive) return false;
  if (type === 'inactive' && query.isActive) return false;
  if (stale === true && !query.state.isStale()) return false;
  if (stale === false && query.state.isStale()) return false;
  if (fetchStatus && query.state.fetchStatus() !== fetchStatus) return false;
  if (predicate && !predicate(query)) return false;

  return true;
};

export class QueryCache<
  TQuery extends Query<any, any, any, any> = Query<any, any, any, any>,
> extends Subscribable<QueryCacheListener> {
  private readonly queries: Map<string, TQuery>;

  constructor(
    public config: QueryCacheConfig = {},
    cache?: Map<string, TQuery>,
  ) {
    super();
    this.queries = new Map(cache);
  }

  notify(event: QueryCacheNotifyEvent): void {
    for (const listener of this.listeners) {
      listener(event);
    }
  }

  get size() {
    return this.queries.size;
  }

  has(queryHash: string) {
    return this.queries.has(queryHash);
  }

  get(queryHash: string) {
    return this.queries.get(queryHash);
  }

  set(queryHash: string, query: TQuery) {
    this.queries.set(queryHash, query);
    this.notify({ type: 'added', query: query as Query<any, any, any, any> });
    return this;
  }

  delete(queryHash: string) {
    const query = this.queries.get(queryHash);
    if (!query) return false;

    this.remove(query);
    return true;
  }

  keys() {
    return this.queries.keys();
  }

  values() {
    return this.queries.values();
  }

  entries() {
    return this.queries.entries();
  }

  [Symbol.iterator]() {
    return this.entries();
  }

  getAll() {
    return Array.from(this.queries.values());
  }

  findAll(filters?: QueryFilters) {
    return this.getAll().filter((query) => matchesQueryFilters(query, filters));
  }

  build<
    TQueryFnData = unknown,
    TError = unknown,
    TData = TQueryFnData,
    TQueryKey extends QueryKey = QueryKey,
    TInitialData extends TQueryFnData | undefined = undefined,
    R = void,
  >(
    queryClient: QueryClient,
    options: QueryOptions<TQueryFnData, TError, TData, TQueryKey, TInitialData, R>,
  ) {
    const resolvedOptions = resolveQueryOptions(queryClient, options);
    const queryHash = resolvedOptions.queryKeyHashFn!(resolvedOptions.queryKey);
    const existingQuery = this.get(queryHash) as
      | Query<TQueryFnData, TError, TData, TQueryKey, TInitialData, R>
      | undefined;

    if (existingQuery) {
      existingQuery.resolvedOptions = resolvedOptions;
      return existingQuery;
    }

    const query = createQuery({
      cache: this as unknown as QueryCacheType,
      queryHash,
      resolvedOptions,
    });

    this.set(queryHash, query as unknown as TQuery);

    return query;
  }

  remove(query: TQuery) {
    const cachedQuery = this.queries.get(query.queryHash);
    if (cachedQuery !== query) return;

    this.queries.delete(query.queryHash);
    query.destroy();
    this.notify({ type: 'removed', query: query as Query<any, any, any, any> });
  }

  clear() {
    const queries = this.getAll();
    if (queries.length === 0) return;

    for (const query of queries) {
      this.remove(query);
    }
  }
}

export const createQueryCache = <TQuery extends Query<any, any, any, any>>(
  config?: QueryCacheConfig | QueryCache<TQuery> | Map<string, TQuery>,
  cache?: Map<string, TQuery>,
) => {
  if (config instanceof QueryCache) return config;
  if (typeof config === 'object' && !(config instanceof Map)) {
    return new QueryCache<TQuery>(config, cache);
  }
  return new QueryCache<TQuery>({}, config as Map<string, TQuery> | undefined);
};
