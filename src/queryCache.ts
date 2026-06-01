import type { Observable } from 'voby';
import { createCacheState } from './cache.ts';
import { createQuery, resolveQueryOptions, type Query } from './query.ts';
import type {
  QueryCache as QueryCacheType,
  QueryClient,
  QueryFilters,
  QueryKey,
  QueryOptions,
} from './types.ts';
import { partialMatchKey } from './utils.ts';

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

export class QueryCache<TQuery extends Query<any, any, any, any> = Query<any, any, any, any>> {
  readonly version: Observable<number>;

  private readonly queries: Map<string, TQuery>;
  private readonly bump: () => void;

  constructor(cache?: Map<string, TQuery>) {
    const { map, version, bump } = createCacheState(
      cache as (Map<string, TQuery> & { version?: Observable<number> }) | undefined,
    );
    this.queries = map;
    this.version = version;
    this.bump = bump;
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
    this.bump();
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
    this.bump();
  }

  clear() {
    const queries = this.getAll();
    if (queries.length === 0) return;

    this.queries.clear();
    for (const query of queries) {
      query.destroy();
    }
    this.bump();
  }
}

export const createQueryCache = <TQuery extends Query<any, any, any, any>>(
  cache?: QueryCache<TQuery> | Map<string, TQuery>,
) => {
  return cache instanceof QueryCache ? cache : new QueryCache(cache);
};
