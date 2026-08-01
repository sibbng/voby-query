import { useCleanup, useContext } from 'voby';
import { QueryClientContext } from './context.ts';
import { fetchInitialInfiniteData } from './infiniteQuery.ts';
import { createMutationCache } from './mutationCache.ts';
import { focusManager } from './focusManager.ts';
import { onlineManager } from './onlineManager.ts';
import { resolveStaleTime, setQuerySuccessData, type Query } from './query.ts';
import { createQueryCache } from './queryCache.ts';
import type { Mutation } from './mutation.ts';
import type {
  CancelOptions,
  InferDataFromTag,
  InferErrorFromTag,
  InfiniteData,
  InfiniteQueryOptions,
  MutationCache,
  MutationFilters,
  MutationKey,
  MutationOptions,
  QueryCache,
  QueryDefaultsOptions,
  QueryFilters,
  QueryKey,
  QueryOptions,
  QueryRefetchOptions,
  QueryState,
  SetDataOptions,
  Updater,
} from './types.ts';
import { functionalUpdate, hashFn, noop, partialMatchKey } from './utils.ts';

type QueryLike = Query<any, any, any, any>;

export type QueryClientConfig = {
  queryCache?: QueryCache | Map<string, QueryLike>;
  mutationCache?: MutationCache | Map<string, Mutation<any, any, any, any>>;
  jobQueue?: Map<string, number[]>;
  defaultOptions?: {
    queries?: Omit<QueryOptions, 'queryKey'>;
    mutations?: MutationOptions;
  };
};

const buildQueryClient = (options?: QueryClientConfig): QueryClient => {
  const baseDefaultOptions: {
    queries: Omit<QueryOptions, 'queryKey'>;
    mutations: MutationOptions;
  } = {
    queries: {
      queryKeyHashFn: hashFn,
      enabled: true,
      throwOnError: false,
      gcTime: 1000 * 60 * 5,
      staleTime: 0,
      refetchInterval: undefined as number | undefined,
      networkMode: 'online' as const,
      retry: 3,
      retryOnMount: true,
      retryDelay: (attempt: number) => Math.min(1000 * 2 ** attempt, 30000),
      cancelRefetch: true,
      refetchOnWindowFocus: true,
      structuralSharing: true,
      refetchOnMount: true,
      ...options?.defaultOptions?.queries,
    },
    mutations: {
      retry: 0,
      gcTime: 5 * 60 * 1000,
      networkMode: 'online' as const,
      throwOnError: false,
      ...options?.defaultOptions?.mutations,
    },
  };

  let defaultOptions = baseDefaultOptions;
  let queryDefaults = defaultOptions.queries;
  let mutationDefaults = defaultOptions.mutations;

  const getDefaultOptions = () => defaultOptions;

  const setDefaultOptions = (newOptions: {
    queries?: Partial<Omit<QueryOptions, 'queryKey'>>;
    mutations?: Partial<MutationOptions>;
  }) => {
    queryDefaults = { ...baseDefaultOptions.queries, ...newOptions.queries };
    mutationDefaults = { ...baseDefaultOptions.mutations, ...newOptions.mutations };
    defaultOptions = { queries: queryDefaults, mutations: mutationDefaults };
  };

  const queryDefaultsMap = new Map<
    string,
    { queryKey: QueryKey; defaults: Partial<QueryDefaultsOptions> }
  >();

  const getQueryKeyHashFn = () => defaultOptions.queries.queryKeyHashFn ?? hashFn;

  const getQueryDefaults = (queryKey: QueryKey) => {
    const queryHash = getQueryKeyHashFn()(queryKey);
    let result: Partial<QueryDefaultsOptions> = {};
    for (const [key, { queryKey: defaultQueryKey, defaults }] of queryDefaultsMap.entries()) {
      if (queryHash === key || partialMatchKey(defaultQueryKey, queryKey)) {
        result = { ...result, ...defaults };
      }
    }
    return result;
  };

  const setQueryDefaults = (queryKey: QueryKey, defaults: Partial<QueryDefaultsOptions>) => {
    const queryHash = getQueryKeyHashFn()(queryKey);
    queryDefaultsMap.set(queryHash, { queryKey, defaults });
  };

  const mutationDefaultsMap = new Map<
    string,
    { mutationKey: MutationKey; defaults: Partial<MutationOptions> }
  >();

  const getMutationDefaults = (mutationKey?: MutationKey) => {
    let result: Partial<MutationOptions> = {};
    if (mutationKey) {
      const mutationHash = getQueryKeyHashFn()(mutationKey);
      for (const [
        key,
        { mutationKey: defaultMutationKey, defaults },
      ] of mutationDefaultsMap.entries()) {
        if (mutationHash === key || partialMatchKey(defaultMutationKey, mutationKey)) {
          result = { ...result, ...defaults };
        }
      }
    }
    return result;
  };

  const setMutationDefaults = (mutationKey: MutationKey, defaults: Partial<MutationOptions>) => {
    const mutationHash = getQueryKeyHashFn()(mutationKey);
    mutationDefaultsMap.set(mutationHash, { mutationKey, defaults });
  };

  const cache = createQueryCache(options?.queryCache) as QueryCache;
  const mutationCache = createMutationCache(options?.mutationCache) as MutationCache;
  const jobQueue = options?.jobQueue ?? new Map<string, number[]>();
  const queueResolvers = new Map<string, () => void>();

  let mountCount = 0;
  let unsubscribeFocus: (() => void) | undefined;
  let unsubscribeOnline: (() => void) | undefined;

  const mount = () => {
    mountCount++;
    if (mountCount !== 1) return;

    unsubscribeFocus = focusManager.subscribe(async () => {
      if (focusManager.isFocused()) {
        await mutationCache.resumePausedMutations();
        cache.onFocus();
      }
    });

    unsubscribeOnline = onlineManager.subscribe(async () => {
      if (onlineManager.isOnline()) {
        await mutationCache.resumePausedMutations();
        cache.onOnline();
      }
    });
  };

  const unmount = () => {
    mountCount--;
    if (mountCount !== 0) return;

    unsubscribeFocus?.();
    unsubscribeFocus = undefined;
    unsubscribeOnline?.();
    unsubscribeOnline = undefined;
  };

  const startQueueJob = async (queueKey: string) => {
    const queue = jobQueue.get(queueKey) ?? [];
    const queueId = Date.now();
    queue.push(queueId);
    jobQueue.set(queueKey, queue);

    if (queue[0] === queueId) return;

    await new Promise<void>((resolve) => {
      queueResolvers.set(`${queueKey}:${queueId}`, resolve);
    });
  };

  const finishQueueJob = (queueKey: string) => {
    const queue = jobQueue.get(queueKey);
    if (!queue) return;

    queue.shift();
    if (queue.length === 0) {
      jobQueue.delete(queueKey);
    } else {
      const nextId = queue[0];
      const resolve = queueResolvers.get(`${queueKey}:${nextId}`);
      queueResolvers.delete(`${queueKey}:${nextId}`);
      resolve?.();
    }
  };

  const getQueryData: QueryClient['getQueryData'] = <
    TQueryFnData = unknown,
    TTaggedQueryKey extends QueryKey = QueryKey,
  >(
    queryKey: TTaggedQueryKey,
  ) => {
    const queryHash = getQueryKeyHashFn()(queryKey);
    return cache.get(queryHash)?.state.data() as TQueryFnData | undefined;
  };

  const setQueryData: QueryClient['setQueryData'] = <
    TQueryFnData = unknown,
    TTaggedQueryKey extends QueryKey = QueryKey,
  >(
    queryKey: TTaggedQueryKey,
    data: TQueryFnData | ((previous: TQueryFnData | undefined) => TQueryFnData | undefined),
  ) => {
    const queryHash = getQueryKeyHashFn()(queryKey);
    let query = cache.get(queryHash) as QueryLike | undefined;
    const resolvedData = functionalUpdate(data as any, query?.state.data());

    if (resolvedData === undefined) {
      return;
    }

    if (!query) {
      query = cache.build(queryClient, {
        queryKey,
      });
    }

    setQuerySuccessData(query, resolvedData);
    cache.notify({ type: 'updated', query: query as QueryLike, action: { type: 'success' } });
  };

  const getQueriesData: QueryClient['getQueriesData'] = <TQueryFnData = unknown>(
    filters: QueryFilters,
  ) => {
    return cache.findAll(filters).map((query) => {
      return [query.resolvedOptions.queryKey, query.state.data() as TQueryFnData | undefined] as [
        QueryKey,
        TQueryFnData | undefined,
      ];
    });
  };

  const setQueriesData: QueryClient['setQueriesData'] = <TQueryFnData>(
    filters: QueryFilters,
    updater: Updater<TQueryFnData, TQueryFnData | undefined>,
    options?: SetDataOptions,
  ) => {
    cache.findAll(filters).forEach((query) => {
      const resolvedData = functionalUpdate(updater, query.state.data());
      if (resolvedData === undefined) return;
      const updatedAt = options?.updatedAt ?? Date.now();
      setQuerySuccessData(query, resolvedData, updatedAt);
      cache.notify({ type: 'updated', query: query as QueryLike, action: { type: 'success' } });
    });
  };

  const invalidateQueries: QueryClient['invalidateQueries'] = async (
    filters,
    { throwOnError = false, cancelRefetch = true } = {},
  ) => {
    const { refetchType, ...queryFilters } = filters || {};
    const effectiveRefetchType = refetchType ?? queryFilters.type ?? 'active';
    const queriesToInvalidate = cache.findAll(queryFilters);

    for (const query of queriesToInvalidate) {
      query.state.isInvalidated(true);
      query.state.isStale(true);
      cache.notify({ type: 'updated', query: query as QueryLike, action: { type: 'invalidate' } });
    }

    if (effectiveRefetchType === 'none') return;

    // Upstream queryClient.ts:295-310: the refetch itself goes through
    // refetchQueries (filtering out disabled/static/paused queries).
    await refetchQueries(
      {
        ...queryFilters,
        type: effectiveRefetchType,
      },
      { throwOnError, cancelRefetch },
    );
  };

  const refetchQueries = async (
    filters?: QueryFilters,
    options?: QueryRefetchOptions,
  ): Promise<void> => {
    const { throwOnError = false, cancelRefetch = true } = options || {};

    // Upstream queryClient.ts:313-337: skip disabled, static, and paused
    // queries (isDisabled/isStatic per query.ts:281-302).
    const queriesToRefetch = cache
      .findAll(filters)
      .filter((query) => !query.isDisabled() && !query.isStatic())
      .filter((query) => query.state.fetchStatus() !== 'paused');

    if (cancelRefetch) {
      await Promise.all(
        queriesToRefetch.map((query) => query.cancel({ revert: false, silent: true })),
      );
    }

    const refetchPromises = queriesToRefetch.map((query) => {
      let promise = query.fetch({ throwOnError, force: true });
      if (!throwOnError) {
        promise = promise.catch(noop);
      }
      return promise;
    });

    await Promise.all(refetchPromises);
  };

  const cancelQueries: QueryClient['cancelQueries'] = async (
    filters,
    { silent = false, revert = true } = {},
  ): Promise<void> => {
    const queriesToCancel = cache.findAll(filters);

    await Promise.all(queriesToCancel.map((query) => query.cancel({ silent, revert }))).catch(noop);
  };

  const removeQueries: QueryClient['removeQueries'] = (filters) => {
    for (const query of cache.findAll(filters)) {
      cache.remove(query as QueryLike);
    }
  };

  const resetQueries: QueryClient['resetQueries'] = async (
    filters,
    options?: QueryRefetchOptions,
  ): Promise<void> => {
    const { throwOnError = false, cancelRefetch = true } = options || {};

    const queriesToReset = cache.findAll(filters);

    const resetPromises = queriesToReset.map(async (query) => {
      query.reset();
      cache.notify({ type: 'updated', query: query as QueryLike, action: { type: 'setState' } });
      if (query.isActive) {
        try {
          await query.refetch({ throwOnError, cancelRefetch });
        } catch (error) {
          if (throwOnError) {
            throw error;
          }
        }
      }
    });

    await Promise.all(resetPromises);
  };

  const ensureQueryData = async <
    TQueryFnData = unknown,
    TError = unknown,
    TData = TQueryFnData,
    TQueryKey extends QueryKey = QueryKey,
  >(
    options: QueryOptions<TQueryFnData, TError, TData, TQueryKey> & {
      revalidateIfStale?: boolean;
    },
  ): Promise<TData> => {
    const { queryKey, revalidateIfStale = false, ...restOptions } = options;
    const query = cache.build(queryClient, { queryKey, ...restOptions } as QueryOptions<
      TQueryFnData,
      TError,
      TData,
      TQueryKey
    >);
    const currentData = query.state.data();

    if (currentData !== undefined) {
      if (revalidateIfStale && query.state.isStale()) {
        query.fetch({ force: true }).catch(noop);
      }
      return currentData as TData;
    }

    return fetchQuery({ queryKey, ...restOptions } as QueryOptions<
      TQueryFnData,
      TError,
      TData,
      TQueryKey
    >);
  };

  const ensureInfiniteQueryData = async <
    TQueryFnData = unknown,
    TError = unknown,
    TQueryKey extends QueryKey = QueryKey,
    TPageParam = unknown,
  >(
    options: InfiniteQueryOptions<TQueryFnData, TError, TQueryKey, TPageParam> & {
      revalidateIfStale?: boolean;
    },
  ): Promise<InfiniteData<TQueryFnData, TPageParam>> => {
    const { revalidateIfStale = false, ...restOptions } = options;
    const wrappedOptions = {
      ...restOptions,
      queryFn: ({ signal }: { signal: AbortSignal }) =>
        fetchInitialInfiniteData({ options: restOptions, signal }),
    } as unknown as QueryOptions<
      InfiniteData<TQueryFnData, TPageParam>,
      TError,
      InfiniteData<TQueryFnData, TPageParam>,
      TQueryKey
    >;

    const query = cache.build(queryClient, wrappedOptions) as QueryLike;
    const currentData = query.state.data() as InfiniteData<TQueryFnData, TPageParam> | undefined;

    if (currentData !== undefined) {
      if (revalidateIfStale && query.state.isStale()) {
        query.fetch({ force: true }).catch(noop);
      }
      return currentData;
    }

    return fetchInfiniteQuery(
      restOptions as InfiniteQueryOptions<TQueryFnData, TError, TQueryKey, TPageParam>,
    );
  };

  const getQueryState: QueryClient['getQueryState'] = <
    TQueryFnData = unknown,
    TError = Error,
    TTaggedQueryKey extends QueryKey = QueryKey,
  >(
    queryKey: TTaggedQueryKey,
  ) => {
    const queryHash = getQueryKeyHashFn()(queryKey);
    const query = cache.get(queryHash);
    return query?.state as QueryState<TQueryFnData, TError> | undefined;
  };

  const fetchInfiniteQuery = async <
    TQueryFnData = unknown,
    TError = unknown,
    TQueryKey extends QueryKey = QueryKey,
    TPageParam = unknown,
  >(
    options: InfiniteQueryOptions<TQueryFnData, TError, TQueryKey, TPageParam>,
  ): Promise<InfiniteData<TQueryFnData, TPageParam>> => {
    const wrappedOptions = {
      ...options,
      queryFn: ({ signal }: { signal: AbortSignal }) =>
        fetchInitialInfiniteData({ options, signal }),
    } as unknown as QueryOptions<
      InfiniteData<TQueryFnData, TPageParam>,
      TError,
      InfiniteData<TQueryFnData, TPageParam>,
      TQueryKey
    >;

    const query = cache.build(queryClient, wrappedOptions) as QueryLike;

    if (!query.isStaleByTime(resolveStaleTime(query))) {
      return query.state.data() as InfiniteData<TQueryFnData, TPageParam>;
    }

    if (options.retry === undefined) {
      const originalRetry = (query as any).resolvedOptions.retry;
      (query as any).resolvedOptions.retry = false;
      try {
        await query.fetch({ force: true, awaitChain: true });
      } finally {
        (query as any).resolvedOptions.retry = originalRetry;
      }
    } else {
      await query.fetch({ force: true, awaitChain: true });
    }
    if (query.state.error()) {
      throw query.state.error();
    }
    return query.state.data() as InfiniteData<TQueryFnData, TPageParam>;
  };

  const prefetchInfiniteQuery = async <
    TQueryFnData = unknown,
    TError = unknown,
    TQueryKey extends QueryKey = QueryKey,
    TPageParam = unknown,
  >(
    options: InfiniteQueryOptions<TQueryFnData, TError, TQueryKey, TPageParam>,
  ): Promise<void> => {
    await fetchInfiniteQuery(options).catch(noop);
  };

  const fetchQuery = async <
    TQueryFnData = unknown,
    TError = unknown,
    TData = TQueryFnData,
    TQueryKey extends QueryKey = QueryKey,
  >(
    options: QueryOptions<TQueryFnData, TError, TData, TQueryKey>,
  ): Promise<TData> => {
    const query = cache.build(
      queryClient,
      options as QueryOptions<TQueryFnData, TError, TData, TQueryKey>,
    ) as QueryLike;

    if (!query.isStaleByTime(resolveStaleTime(query))) {
      return query.state.data() as TData;
    }

    // TanStack: fetchQuery doesn't retry by default
    // https://github.com/tannerlinsley/react-query/issues/652
    if (options.retry === undefined) {
      const originalRetry = query.resolvedOptions.retry;
      query.resolvedOptions.retry = false;
      try {
        await query.fetch({ force: true, awaitChain: true });
      } finally {
        query.resolvedOptions.retry = originalRetry;
      }
    } else {
      await query.fetch({ force: true, awaitChain: true });
    }
    // Propagate error when fetchQuery forced retry=false (TanStack behavior)
    if (query.state.error()) {
      throw query.state.error();
    }
    return query.state.data() as TData;
  };

  const prefetchQuery = async <
    TQueryFnData = unknown,
    TError = unknown,
    TData = TQueryFnData,
    TQueryKey extends QueryKey = QueryKey,
  >(
    options: QueryOptions<TQueryFnData, TError, TData, TQueryKey>,
  ): Promise<void> => {
    await fetchQuery(options).catch(noop);
  };

  const isFetching = (filters?: QueryFilters): number => {
    return cache.findAll(filters).filter((query) => query.state.isFetching()).length;
  };

  const isMutating = (filters?: MutationFilters): number => {
    return mutationCache.findAll({ ...filters, status: 'pending' }).length;
  };

  const getQueryCache = (): QueryCache => {
    return cache;
  };

  const getMutationCache = (): MutationCache => {
    return mutationCache;
  };

  const resumePausedMutations = (): Promise<unknown> => {
    if (onlineManager.isOnline()) {
      return mutationCache.resumePausedMutations();
    }
    return Promise.resolve();
  };

  const clear = (): void => {
    cache.clear();
    mutationCache.clear();
  };

  const queryClient = {
    setDefaultOptions,
    getDefaultOptions,
    setQueryDefaults,
    getQueryDefaults,
    setMutationDefaults,
    getMutationDefaults,
    isFetching,
    isMutating,
    fetchQuery,
    fetchInfiniteQuery,
    prefetchQuery,
    prefetchInfiniteQuery,
    getQueryState,
    ensureInfiniteQueryData,
    removeQueries,
    cancelQueries,
    refetchQueries,
    ensureQueryData,
    getQueryData,
    setQueryData,
    getQueriesData,
    setQueriesData,
    invalidateQueries,
    cache,
    mutationCache,
    getQueryCache,
    getMutationCache,
    resumePausedMutations,
    clear,
    resetQueries,
    jobQueue,
    startQueueJob,
    finishQueueJob,
    mount,
    unmount,
  } as QueryClient;

  return queryClient;
};

export class QueryClient {
  declare cache: QueryCache;
  declare mutationCache: MutationCache;
  declare jobQueue: Map<string, number[]>;
  declare startQueueJob: (queueKey: string) => void;
  declare finishQueueJob: (queueKey: string) => void;
  declare getQueryData: <
    TQueryFnData = unknown,
    TTaggedQueryKey extends QueryKey = QueryKey,
    TInferredQueryFnData = InferDataFromTag<TQueryFnData, TTaggedQueryKey>,
  >(
    queryKey: TTaggedQueryKey,
  ) => TInferredQueryFnData | undefined;
  declare setQueryData: <
    TQueryFnData = unknown,
    TTaggedQueryKey extends QueryKey = QueryKey,
    TInferredQueryFnData = InferDataFromTag<TQueryFnData, TTaggedQueryKey>,
  >(
    queryKey: TTaggedQueryKey,
    data:
      | TInferredQueryFnData
      | ((previous: TInferredQueryFnData | undefined) => TInferredQueryFnData | undefined),
  ) => void;
  declare getQueryState: <
    TQueryFnData = unknown,
    TError = Error,
    TTaggedQueryKey extends QueryKey = QueryKey,
    TInferredQueryFnData = InferDataFromTag<TQueryFnData, TTaggedQueryKey>,
    TInferredError = InferErrorFromTag<TError, TTaggedQueryKey>,
  >(
    queryKey: TTaggedQueryKey,
  ) => QueryState<TInferredQueryFnData, TInferredError> | undefined;
  declare invalidateQueries: (
    filters?: QueryFilters & {
      refetchType?: 'active' | 'inactive' | 'all' | 'none';
    },
    options?: QueryRefetchOptions,
  ) => Promise<void>;
  declare ensureQueryData: <TQueryFnData, TData = TQueryFnData>(
    options: QueryOptions<TQueryFnData, unknown, TData, QueryKey>,
  ) => Promise<TData>;
  declare ensureInfiniteQueryData: <
    TQueryFnData,
    TError = Error,
    TQueryKey extends QueryKey = QueryKey,
    TPageParam = unknown,
  >(
    options: InfiniteQueryOptions<TQueryFnData, TError, TQueryKey, TPageParam>,
  ) => Promise<InfiniteData<TQueryFnData, TPageParam>>;
  declare fetchQuery: <TQueryFnData, TData = TQueryFnData>(
    options: QueryOptions<TQueryFnData, unknown, TData, QueryKey>,
  ) => Promise<TData>;
  declare fetchInfiniteQuery: <
    TQueryFnData,
    TError = Error,
    TQueryKey extends QueryKey = QueryKey,
    TPageParam = unknown,
  >(
    options: InfiniteQueryOptions<TQueryFnData, TError, TQueryKey, TPageParam>,
  ) => Promise<InfiniteData<TQueryFnData, TPageParam>>;
  declare prefetchQuery: <TQueryFnData, TData = TQueryFnData>(
    options: QueryOptions<TQueryFnData, unknown, TData, QueryKey>,
  ) => Promise<void>;
  declare prefetchInfiniteQuery: <
    TQueryFnData,
    TError = Error,
    TQueryKey extends QueryKey = QueryKey,
    TPageParam = unknown,
  >(
    options: InfiniteQueryOptions<TQueryFnData, TError, TQueryKey, TPageParam>,
  ) => Promise<void>;
  declare getQueriesData: <TQueryFnData = unknown>(
    filters: QueryFilters,
  ) => Array<[QueryKey, TQueryFnData | undefined]>;
  declare setQueriesData: <TQueryFnData>(
    filters: QueryFilters,
    updater: Updater<TQueryFnData | undefined, TQueryFnData | undefined>,
    options?: SetDataOptions,
  ) => void;
  declare refetchQueries: (filters?: QueryFilters, options?: QueryRefetchOptions) => Promise<void>;
  declare cancelQueries: (filters?: QueryFilters, options?: CancelOptions) => Promise<void>;
  declare removeQueries: (filters?: QueryFilters) => void;
  declare resetQueries: (filters?: QueryFilters, options?: QueryRefetchOptions) => Promise<void>;
  declare isFetching: (filters?: QueryFilters) => number;
  declare isMutating: (filters?: MutationFilters) => number;
  declare getQueryCache: () => QueryCache;
  declare getMutationCache: () => MutationCache;
  declare resumePausedMutations: () => Promise<unknown>;
  declare clear: () => void;
  declare getDefaultOptions: () => {
    queries: Omit<QueryOptions, 'queryKey'>;
    mutations: MutationOptions;
  };
  declare setDefaultOptions: (options: {
    queries?: Partial<Omit<QueryOptions, 'queryKey'>>;
    mutations?: Partial<MutationOptions>;
  }) => void;
  declare getQueryDefaults: (queryKey: QueryKey) => Partial<QueryDefaultsOptions>;
  declare setQueryDefaults: (queryKey: QueryKey, defaults: Partial<QueryDefaultsOptions>) => void;
  declare getMutationDefaults: (mutationKey?: MutationKey) => Partial<MutationOptions>;
  declare setMutationDefaults: (
    mutationKey: MutationKey,
    defaults: Partial<MutationOptions>,
  ) => void;
  declare mount: () => void;
  declare unmount: () => void;

  constructor(options: QueryClientConfig = {}) {
    Object.assign(this, buildQueryClient(options));
  }
}

export function useQueryClient(queryClient?: QueryClient) {
  const client = queryClient ?? useContext(QueryClientContext);
  if (!client) {
    throw new Error('No QueryClient set, use QueryClientProvider to set one');
  }
  client.mount();
  useCleanup(() => client.unmount());
  return client;
}
