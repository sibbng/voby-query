import { useContext } from 'voby';
import { QueryClientContext } from './context.ts';
import { createMutationCache } from './mutationCache.ts';
import { resolveStaleTime, setQuerySuccessData, type Query } from './query.ts';
import { createQueryCache } from './queryCache.ts';
import type { Mutation } from './mutation.ts';
import type {
  MutationCache,
  MutationFilters,
  MutationKey,
  MutationOptions,
  QueryCache,
  QueryClient,
  QueryFilters,
  QueryKey,
  QueryOptions,
  QueryRefetchOptions,
} from './types.ts';
import { functionalUpdate, hashFn, noop, partialMatchKey } from './utils.ts';

type QueryLike = Query<any, any, any, any>;

export type CreateQueryClientOptions = {
  queryCache?: QueryCache | Map<string, QueryLike>;
  mutationCache?: MutationCache | Map<string, Mutation<any, any, any, any>>;
  jobQueue?: Map<string, number[]>;
  defaultOptions?: {
    queries?: Omit<QueryOptions, 'queryKey'>;
    mutations?: MutationOptions;
  };
};

export const createQueryClient = (options?: CreateQueryClientOptions): QueryClient => {
  const queryDefaults = {
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
    cancelRefetch: false,
    refetchOnWindowFocus: true,
    structuralSharing: true,
    refetchOnReconnect: options?.defaultOptions?.queries?.networkMode
      ? options.defaultOptions.queries.networkMode === 'online'
      : true,
    refetchOnMount: true,
    ...options?.defaultOptions?.queries,
  };
  const mutationDefaults = {
    retry: 0,
    retryDelay: 0,
    gcTime: 5 * 60 * 1000,
    networkMode: 'online' as const,
    throwOnError: false,
    ...options?.defaultOptions?.mutations,
  };
  const getDefaultOptions = () => ({
    queries: queryDefaults,
    mutations: mutationDefaults,
  });

  const setDefaultOptions = (newOptions: {
    queries?: Partial<typeof queryDefaults>;
    mutations?: Partial<typeof mutationDefaults>;
  }) => {
    Object.assign(queryDefaults, newOptions.queries);
    Object.assign(mutationDefaults, newOptions.mutations);
  };

  const queryDefaultsMap = new Map<
    string,
    { queryKey: QueryKey; defaults: Partial<QueryOptions> }
  >();

  const queryKeyHashFn = queryDefaults.queryKeyHashFn ?? hashFn;

  const getQueryDefaults = (queryKey: QueryKey) => {
    const queryHash = queryKeyHashFn(queryKey);
    for (const [key, { queryKey: defaultQueryKey, defaults }] of queryDefaultsMap.entries()) {
      if (queryHash === key || partialMatchKey(defaultQueryKey, queryKey)) {
        return defaults;
      }
    }
    return {};
  };

  const setQueryDefaults = (queryKey: QueryKey, defaults: Partial<QueryOptions>) => {
    const queryHash = queryKeyHashFn(queryKey);
    queryDefaultsMap.set(queryHash, { queryKey, defaults });
  };

  const mutationDefaultsMap = new Map<
    string,
    { mutationKey: MutationKey; defaults: Partial<MutationOptions> }
  >();

  const getMutationDefaults = (mutationKey?: MutationKey) => {
    if (mutationKey) {
      const mutationHash = queryKeyHashFn(mutationKey);
      for (const [
        key,
        { mutationKey: defaultMutationKey, defaults },
      ] of mutationDefaultsMap.entries()) {
        if (mutationHash === key || partialMatchKey(defaultMutationKey, mutationKey)) {
          return defaults;
        }
      }
    }
    return {};
  };

  const setMutationDefaults = (mutationKey: MutationKey, defaults: Partial<MutationOptions>) => {
    const mutationHash = queryKeyHashFn(mutationKey);
    mutationDefaultsMap.set(mutationHash, { mutationKey, defaults });
  };

  const cache = createQueryCache(options?.queryCache) as QueryCache;
  const mutationCache = createMutationCache(options?.mutationCache) as MutationCache;
  const jobQueue = options?.jobQueue ?? new Map<string, number[]>();
  const queueBus = new EventTarget();

  const startQueueJob = async (queueKey: string) => {
    const queue = jobQueue.get(queueKey) ?? [];
    const queueId = Date.now();
    queue.push(queueId);
    jobQueue.set(queueKey, queue);

    if (queue[0] === queueId) return;

    await new Promise((resolve) => {
      const event = () => {
        if (queue[0] === queueId) {
          resolve(undefined);
          queueBus.removeEventListener('queue:updated', event);
        }
      };
      queueBus.addEventListener('queue:updated', event);
    });
  };

  const finishQueueJob = (queueKey: string) => {
    const queue = jobQueue.get(queueKey);
    if (!queue) return;

    queue.shift();
    if (queue.length === 0) {
      jobQueue.delete(queueKey);
    } else {
      queueBus.dispatchEvent(new CustomEvent('queue:updated'));
    }
  };

  const getQueryData: QueryClient['getQueryData'] = <T>(queryKey: QueryKey) => {
    const queryHash = queryKeyHashFn(queryKey);
    return cache.get(queryHash)?.state.data() as T | undefined;
  };

  const setQueryData: QueryClient['setQueryData'] = (queryKey, data) => {
    const queryHash = queryKeyHashFn(queryKey);
    let query = cache.get(queryHash) as QueryLike | undefined;
    const resolvedData = functionalUpdate(data, query?.state.data());

    if (resolvedData === undefined) {
      return;
    }

    if (!query) {
      query = cache.build(queryClient, {
        queryKey,
      });
    }

    setQuerySuccessData(query, resolvedData);
    cache.notify({ type: 'updated', query: query as QueryLike });
  };

  const invalidateQueries: QueryClient['invalidateQueries'] = async (
    filters,
    { throwOnError = false, cancelRefetch = true } = {},
  ) => {
    const { refetchType = 'active', ...queryFilters } = filters || {};
    const queriesToInvalidate = cache.findAll(queryFilters);

    for (const query of queriesToInvalidate) {
      query.state.isInvalidated(true);
      query.state.isStale(true);
      cache.notify({ type: 'updated', query: query as QueryLike });
    }

    if (refetchType === 'none') return;

    const queriesToRefetch = queriesToInvalidate.filter((query) => {
      if (!query.resolvedOptions.enabled) return false;
      if (refetchType === 'active' && !query.isActive) return false;
      if (refetchType === 'inactive' && query.isActive) return false;
      return true;
    });

    if (cancelRefetch) {
      await Promise.all(
        queriesToRefetch.map((query) => query.cancel({ revert: false, silent: true })),
      );
    }

    const refetchPromises = queriesToRefetch.map((query) =>
      query.fetch({ throwOnError, force: true }),
    );

    try {
      await Promise.all(refetchPromises);
    } catch (error) {
      if (throwOnError) {
        throw error;
      }
    }
  };

  const refetchQueries = async (
    filters?: QueryFilters,
    options?: QueryRefetchOptions,
  ): Promise<void> => {
    const { throwOnError = false, cancelRefetch = true } = options || {};

    const queriesToRefetch = cache
      .findAll(filters)
      .filter((query) => Boolean(query.resolvedOptions.enabled));

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

    for (const query of queriesToCancel) {
      await query.cancel({ silent, revert });
    }
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
      cache.notify({ type: 'updated', query: query as QueryLike });
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
    TInitialData extends TQueryFnData | undefined = undefined,
  >(
    options: QueryOptions<TQueryFnData, TError, TData, TQueryKey, TInitialData> & {
      revalidateIfStale?: boolean;
    },
  ): Promise<TData> => {
    const { queryKey, revalidateIfStale = false, ...restOptions } = options;
    const query = cache.build(queryClient, {
      queryKey,
      ...restOptions,
    } as QueryOptions<TQueryFnData, TError, TData, TQueryKey, TInitialData>);
    const currentData = query.state.data();

    if (currentData !== undefined) {
      if (revalidateIfStale && query.state.isStale()) {
        query.fetch({ force: true }).catch(noop);
      }
      return currentData as TData;
    }

    await query.fetch({ force: true });
    return query.state.data() as TData;
  };

  const fetchQuery = async <
    TQueryFnData = unknown,
    TError = unknown,
    TData = TQueryFnData,
    TQueryKey extends QueryKey = QueryKey,
    TInitialData extends TQueryFnData | undefined = undefined,
  >(
    options: QueryOptions<TQueryFnData, TError, TData, TQueryKey, TInitialData>,
  ): Promise<TData> => {
    const query = cache.build(
      queryClient,
      options as QueryOptions<TQueryFnData, TError, TData, TQueryKey, TInitialData>,
    ) as QueryLike;

    // Return fresh cached data if available (TanStack: isStaleByTime check)
    if (query.state.data() !== undefined) {
      const staleTime = resolveStaleTime(query as Query<any, any, any, any, any, any>);
      const isFresh =
        staleTime === 'static' ||
        staleTime === Infinity ||
        Date.now() - query.state.dataUpdatedAt() < staleTime;
      if (isFresh) {
        return query.state.data() as TData;
      }
    }

    // TanStack: fetchQuery doesn't retry by default
    // https://github.com/tannerlinsley/react-query/issues/652
    if (options.retry === undefined) {
      const originalRetry = query.resolvedOptions.retry;
      query.resolvedOptions.retry = false;
      try {
        await query.fetch({ force: true });
      } finally {
        query.resolvedOptions.retry = originalRetry;
      }
      // Propagate error when fetchQuery forced retry=false (TanStack behavior)
      if (query.state.error()) {
        throw query.state.error();
      }
    } else {
      await query.fetch({ force: true });
    }
    return query.state.data() as TData;
  };

  const prefetchQuery = async <
    TQueryFnData = unknown,
    TError = unknown,
    TData = TQueryFnData,
    TQueryKey extends QueryKey = QueryKey,
    TInitialData extends TQueryFnData | undefined = undefined,
  >(
    options: QueryOptions<TQueryFnData, TError, TData, TQueryKey, TInitialData>,
  ): Promise<void> => {
    await fetchQuery(options).catch(noop);
  };

  const isFetching = (filters?: QueryFilters): number => {
    return cache.findAll(filters).filter((query) => query.state.isFetching()).length;
  };

  const isMutating = (filters?: MutationFilters): number => {
    return mutationCache.findAll(filters ?? { status: 'pending' }).length;
  };

  const getQueryCache = (): QueryCache => {
    return cache;
  };

  const getMutationCache = (): MutationCache => {
    return mutationCache;
  };

  const clear = (): void => {
    cache.clear();
    mutationCache.clear();
  };

  const queryClient: QueryClient = {
    setDefaultOptions,
    getDefaultOptions,
    setQueryDefaults,
    getQueryDefaults,
    setMutationDefaults,
    getMutationDefaults,
    isFetching,
    isMutating,
    fetchQuery,
    prefetchQuery,
    removeQueries,
    cancelQueries,
    refetchQueries,
    ensureQueryData,
    getQueryData,
    setQueryData,
    invalidateQueries,
    cache,
    mutationCache,
    getQueryCache,
    getMutationCache,
    clear,
    resetQueries,
    jobQueue,
    startQueueJob,
    finishQueueJob,
  };

  return queryClient;
};

export function useQueryClient(queryClient?: QueryClient) {
  const client = queryClient ?? useContext(QueryClientContext);
  if (!client) {
    throw new Error('No QueryClient set, use QueryClientProvider to set one');
  }
  return client;
}
