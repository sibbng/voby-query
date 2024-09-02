import {
  $,
  type FunctionMaybe,
  type Observable,
  type ObservableMaybe,
  type ObservableReadonly,
  untrack,
  useContext,
  useEffect,
  useEventListener,
  useInterval,
  useMemo,
  useReadonly,
  useRoot,
  useTimeout,
} from 'voby';
import type {
  MutationFilters,
  MutationKey,
  MutationObject,
  MutationOptions,
} from './useMutation';
import { hashFn } from './utils';
import { QueryClientContext } from './context';

// #region Types
export type QueryClient = {
  cache: Map<string, Query<any, any, any, any>>;
  mutationCache: Map<string, MutationObject<any, any, any, any>>;
  jobQueue: Map<string, number[]>;
  startQueueJob: (queueKey: string) => void;
  finishQueueJob: (queueKey: string) => void;
  getQueryData: <T>(queryKey: QueryKey) => T;
  setQueryData: <T>(queryKey: QueryKey, data: (previous: T) => T) => void;
  invalidateQueries: (
    filters: {
      queryKey: QueryKey;
      exact?: boolean;
      refetchType?: 'active' | 'inactive' | 'all' | 'none';
    },
    options?: {
      throwOnError?: boolean;
      cancelRefetch?: boolean;
    },
  ) => Promise<void>;
  ensureQueryData: <T>(options: QueryOptions<T>) => Promise<T>;
  fetchQuery: <T>(options: QueryOptions<T>) => Promise<T>;
  prefetchQuery: <T>(options: QueryOptions<T>) => Promise<void>;
  refetchQueries: (
    filters?: {
      queryKey?: QueryKey;
      type?: 'all' | 'active' | 'inactive';
      exact?: boolean;
      stale?: boolean;
    },
    options?: {
      throwOnError?: boolean;
      cancelRefetch?: boolean;
    },
  ) => Promise<void>;
  cancelQueries: (filters?: {
    queryKey?: QueryKey;
    exact?: boolean;
  }) => Promise<void>;
  removeQueries: (filters?: {
    queryKey?: QueryKey;
    exact?: boolean;
  }) => void;
  resetQueries: (
    filters?: {
      queryKey?: QueryKey;
      exact?: boolean;
    },
    options?: {
      throwOnError?: boolean;
      cancelRefetch?: boolean;
    },
  ) => void;
  isFetching: (filters?: {
    queryKey?: QueryKey;
    exact?: boolean;
  }) => number;
  isMutating: (filters?: MutationFilters) => number;
  getQueryCache: () => Map<string, Query>;
  getMutationCache: () => Map<string, MutationObject>;
  clear: () => void;
  getDefaultOptions: () => {
    queries: Omit<QueryOptions, 'queryKey'>;
    mutations: MutationOptions;
  };
  setDefaultOptions: (options: {
    queries?: Partial<QueryOptions>;
    mutations?: Partial<MutationOptions>;
  }) => void;
  getQueryDefaults: (queryKey: QueryKey) => Partial<QueryOptions>;
  setQueryDefaults: (
    queryKey: QueryKey,
    defaults: Partial<QueryOptions>,
  ) => void;
  getMutationDefaults: (mutationKey?: MutationKey) => Partial<MutationOptions>;
  setMutationDefaults: (
    mutationKey: MutationKey,
    defaults: Partial<MutationOptions>,
  ) => void;
};
export type QueryKey = FunctionMaybe<ObservableMaybe<string | number>[]>;
export type QueryOptions<
  TQueryFnData = unknown,
  TError = unknown,
  TData = TQueryFnData,
  TQueryKey extends QueryKey = QueryKey,
  TInitialData extends TQueryFnData | undefined = undefined,
  R = void,
> = {
  queryKey: TQueryKey;
  queryFn?: (options: { signal: AbortSignal }) => Promise<TQueryFnData>;
  queryClient?: QueryClient;
  initialData?: TInitialData;
  initialDataUpdatedAt?: number;
  placeholderData?: TData;
  enabled?: boolean;
  staleTime?: number;
  refetchInterval?: number;
  gcTime?: number;
  throwOnError?: boolean;
  select?: (
    data: TInitialData extends TQueryFnData ? TInitialData : TQueryFnData,
  ) => R;
  networkMode?: 'online' | 'always' | 'offlineFirst';
  refetchOnReconnect?: boolean;
  retry?: boolean | number;
  retryOnMount?: boolean;
  retryDelay?: number;
  cancelRefetch?: boolean;
  refetchOnWindowFocus?: boolean | 'always';
  refetchOnMount?:
    | boolean
    | 'always'
    | ((query: Query<any, any, any, any, any, any>) => boolean | 'always');
  queryKeyHashFn?: (queryKey: QueryKey) => string;
};
export type QueryStatus = 'pending' | 'error' | 'success';
export type FetchStatus = 'fetching' | 'paused' | 'idle';
type QueryState<D = undefined> = {
  data: Observable<D>;
  dataUpdateCount: Observable<number>;
  dataUpdatedAt: Observable<number>;
  error: Observable<Error | null>;
  errorUpdateCount: Observable<number>;
  errorUpdatedAt: Observable<number>;
  meta: Observable<null>;
  isInvalidated: Observable<boolean>;
  status: Observable<QueryStatus>;
  fetchStatus: Observable<FetchStatus>;
  isFetching: ObservableReadonly<boolean>;
  isRefetching: ObservableReadonly<boolean>;
  isFetched: ObservableReadonly<boolean>;
  isFetchedAfterMount: ObservableReadonly<boolean>;
  isPaused: ObservableReadonly<boolean>;
  isPending: ObservableReadonly<boolean>;
  isSuccess: ObservableReadonly<boolean>;
  isError: ObservableReadonly<boolean>;
  isLoadingError: ObservableReadonly<boolean>;
  isRefetchError: ObservableReadonly<boolean>;
  isStale: Observable<boolean>;
};
type QueryStateReadonly<D> = {
  [K in keyof Omit<QueryState<D>, 'meta'>]: ObservableReadonly<
    Awaited<ReturnType<QueryState<D>[K]>>
  >;
} & { meta: QueryState<D>['meta'] };
type Query<
  TQueryFnData = unknown,
  TError = unknown,
  TData = TQueryFnData,
  TQueryKey extends QueryKey = QueryKey,
  TInitialData extends TQueryFnData | undefined = undefined,
  R = void,
> = {
  isActive: boolean;
  state: QueryState<TData>;
  cancel: () => Promise<void>;
  destroy: () => void;
  fetch: (retryAttempt?: number, throwOnError?: boolean) => Promise<void>;
  refetch: (options?: {
    throwOnError?: boolean;
    cancelRefetch?: boolean;
  }) => Promise<void>;
  resolvedOptions: QueryOptions<
    TQueryFnData,
    TError,
    TData,
    TQueryKey,
    TInitialData,
    R
  >;
  instances: number;
  controller: AbortController;
  isFetching: boolean;
  destroyDisposer: () => void;
  staleDisposer: () => void;
  addInstance: () => () => void;
  removeInstance: () => void;
  scheduleDestory: () => void;
  reset: () => void;
  scheduleRetry: (retryAttempt: number) => void;
  isCancelled: boolean;
  events: EventTarget;
};
// #region Core
const createQueryCache = (cache?: Map<string, Query<any, any, any, any>>) => {
  return cache ?? new Map<string, Query<any, any, any, any>>();
};
const createMutationCache = (
  cache?: Map<string, MutationObject<any, any, any, any>>,
) => {
  return cache ?? new Map<string, MutationObject<any, any, any, any>>();
};

// #region createQuery
const createQuery = <
  TQueryFnData = unknown,
  TError = unknown,
  TData = TQueryFnData,
  TQueryKey extends QueryKey = QueryKey,
  TInitialData extends TQueryFnData | undefined = undefined,
  R = void,
>(
  queryClient: QueryClient,
  options: QueryOptions<
    TQueryFnData,
    TError,
    TData,
    TQueryKey,
    TInitialData,
    R
  >,
): Query<TQueryFnData, TError, TData, TQueryKey, TInitialData, R> => {
  const resolvedOptions: QueryOptions<
    TQueryFnData,
    TError,
    TData,
    TQueryKey,
    TInitialData,
    R
  > = {
    queryClient,
    ...(queryClient.getDefaultOptions().queries as QueryOptions<
      TQueryFnData,
      TError,
      TData,
      TQueryKey,
      TInitialData,
      R
    >),
    ...(queryClient.getQueryDefaults(options.queryKey) as QueryOptions<
      TQueryFnData,
      TError,
      TData,
      TQueryKey,
      TInitialData,
      R
    >),
    ...options,
  };

  const cache = queryClient.cache;
  const queryHash = resolvedOptions.queryKeyHashFn!(options.queryKey);

  if (cache.has(queryHash)) {
    const query = cache.get(queryHash) as Query<
      TQueryFnData,
      TError,
      TData,
      TQueryKey,
      TInitialData,
      R
    >;
    query.resolvedOptions = resolvedOptions;
    return query as Query<
      TQueryFnData,
      TError,
      TData,
      TQueryKey,
      TInitialData,
      R
    >;
  }

  // #region state
  const state = {
    data: $(options.initialData as TData, { equals: false }),
    dataUpdateCount: $(options.initialDataUpdatedAt ?? 0),
    dataUpdatedAt: $(Date.now()),
    error: $<Error | null>(null, { equals: false }),
    errorUpdateCount: $(0),
    errorUpdatedAt: $(Date.now()),
    meta: $(null),
    isInvalidated: $(false),
    status: $<QueryStatus>('pending'),
    fetchStatus: $<FetchStatus>('idle'),
    isFetching: useMemo(() => state.fetchStatus() === 'fetching'),
    isRefetching: useMemo(
      () => state.fetchStatus() === 'fetching' && state.status() !== 'pending',
    ),
    isFetched: useMemo(() => state.fetchStatus() === 'idle'),
    isFetchedAfterMount: useMemo(() => state.status() !== 'pending'),
    isPaused: useMemo(() => state.fetchStatus() === 'paused'),
    isPending: useMemo(() => state.status() === 'pending'),
    isSuccess: useMemo(() => state.status() === 'success'),
    isError: useMemo(() => state.status() === 'error'),
    isLoadingError: useMemo(
      () => state.status() === 'error' && state.status() === 'pending',
    ),
    isRefetchError: useMemo(
      () => state.status() === 'error' && state.status() !== 'pending',
    ),
    isStale: $(false),
  } satisfies QueryState<TData>;

  // create custom event
  const events = new EventTarget();

  // #region query
  const query: Query<TQueryFnData, TError, TData, TQueryKey, TInitialData, R> =
    {
      isActive: false,
      events,
      resolvedOptions,
      instances: 0,
      state,
      controller: new AbortController(),
      isCancelled: false,
      destroyDisposer: () => {},
      // #region addInstance
      addInstance: () => {
        query.destroyDisposer();
        query.isActive = true;
        query.instances++;
        untrack(() => {
          if (query.resolvedOptions.enabled) {
            const shouldRefetch = (() => {
              const refetchOnMount = resolvedOptions.refetchOnMount;
              if (typeof refetchOnMount === 'function') {
                return refetchOnMount(query);
              }
              if (refetchOnMount === 'always') return true;
              if (refetchOnMount === false) return false;
              return query.state.isStale() || query.resolvedOptions.enabled;
            })();
            if (shouldRefetch) {
              query.fetch();
            }
          }

          state.fetchStatus(window.navigator.onLine ? 'idle' : 'paused');
          if (resolvedOptions.refetchInterval) {
            useInterval(() => {
              query.fetch();
            }, resolvedOptions.refetchInterval);
          }
          if (resolvedOptions.networkMode === 'online') {
            useEventListener(window, 'online', async () => {
              if (resolvedOptions.refetchOnReconnect) {
                state.fetchStatus('fetching');
                query.refetch();
              }
            });
            useEventListener(window, 'offline', async () => {
              query.cancel();
              state.fetchStatus('paused');
            });
          }
          if (resolvedOptions.refetchOnWindowFocus) {
            useEventListener(document, 'visibilitychange', () => {
              if (document.visibilityState === 'visible' && state.isStale()) {
                query.fetch();
              }
            });
          }
        });
        return query.removeInstance;
      },
      removeInstance: () => {
        query.instances--;

        if (query.instances === 0) {
          query.isActive = false;
          query.scheduleDestory();
        }
      },
      // #region cancel
      cancel: async () => {
        return new Promise((resolve) => {
          query.controller.abort();
          query.isCancelled = true;
          requestAnimationFrame(() => {
            resolve();
          });
        });
      },
      reset: () => {
        query.state.data(options.initialData as TData);
        query.state.dataUpdatedAt(options.initialDataUpdatedAt ?? 0);
        query.state.error(null);
        query.state.errorUpdatedAt(0);
        query.state.status('pending');
        query.state.fetchStatus('idle');
        query.state.isStale(false);
      },
      scheduleDestory: () => {
        useRoot(() => {
          query.destroyDisposer = useTimeout(() => {
            query.destroy();
          }, resolvedOptions.gcTime);
        });
      },
      destroy: () => {
        query.cancel();
        cache.delete(queryHash);
      },
      isFetching: false,
      refetch: async ({
        throwOnError = resolvedOptions.throwOnError,
        cancelRefetch = resolvedOptions.cancelRefetch,
      } = {}) => {
        if (cancelRefetch) {
          await query.cancel();
        }
        return query.fetch(0, throwOnError);
      },
      // #region fetch
      fetch: async (
        retryAttempt = 0,
        throwOnError = resolvedOptions.throwOnError,
      ) => {
        if (!query.isActive) return;
        if (query.isFetching && !query.isCancelled) return;
        if (state.fetchStatus() === 'paused') return;

        query.isFetching = true;
        query.isCancelled = false;
        query.controller = new AbortController();
        const signal = query.controller.signal;
        try {
          state.fetchStatus('fetching');
          const result = await untrack(() =>
            query.resolvedOptions.queryFn!({ signal }),
          );
          // If query is cancelled before promise resolves, don't update state
          if (query.isCancelled || signal.aborted) {
            return;
          }
          state.data(result);
          state.dataUpdatedAt(Date.now());
          state.dataUpdateCount(state.dataUpdateCount() + 1);
          state.status('success');
        } catch (error) {
          if (error instanceof Error && !signal.aborted) {
            state.error(error);
            state.status('error');
            state.errorUpdatedAt(Date.now());
            state.errorUpdateCount(state.errorUpdateCount() + 1);
            if (throwOnError) {
              throw error;
            }
            query.scheduleRetry(retryAttempt + 1);
          }
        } finally {
          if (
            !query.isCancelled &&
            signal.aborted &&
            state.fetchStatus() === 'fetching'
          ) {
            // biome-ignore lint/correctness/noUnsafeFinally: <explanation>
            return;
          }
          query.isFetching = false;
          if (state.fetchStatus() !== 'paused') {
            state.fetchStatus('idle');
          }
          query.staleDisposer();
          state.isStale(false);
          query.staleDisposer = useTimeout(() => {
            state.isStale(true);
          }, resolvedOptions.staleTime);
          events.dispatchEvent(new CustomEvent('fetch:done'));
        }
      },
      staleDisposer: () => {},
      // #region retry
      scheduleRetry: (attempt: number) => {
        const { retry, retryDelay, retryOnMount } = resolvedOptions;
        if (retry === false) return;
        if (
          query.resolvedOptions.networkMode === 'online' &&
          state.fetchStatus() === 'paused'
        ) {
          useEventListener(
            window,
            'online',
            () => {
              query.fetch(attempt);
            },
            { once: true },
          );
          return;
        }
        if (retry === true) {
          useTimeout(() => {
            query.fetch();
          }, retryDelay);
        } else if (retry && attempt < retry) {
          useTimeout(() => {
            query.fetch(attempt);
          }, retryDelay);
        }
      },
    };

  cache.set(queryHash, query as Query);

  return query;
};

export type QueryFilters = {
  queryKey?: QueryKey;
  exact?: boolean;
  type?: 'all' | 'active' | 'inactive';
  stale?: boolean;
  fetchStatus?: FetchStatus;
};

type FetchQueryOptions<
  TQueryFnData = unknown,
  TError = unknown,
  TData = TQueryFnData,
  TQueryKey extends QueryKey = QueryKey,
> = Omit<
  QueryOptions<TQueryFnData, TError, TData, TQueryKey>,
  | 'enabled'
  | 'refetchInterval'
  | 'refetchIntervalInBackground'
  | 'refetchOnWindowFocus'
  | 'refetchOnReconnect'
  | 'refetchOnMount'
  | 'throwOnError'
  | 'select'
  | 'suspense'
  | 'placeholderData'
>;
// #region createQueryClient
export const createQueryClient = (options?: {
  queryCache?: Map<string, Query>;
  mutationCache?: Map<string, MutationObject>;
  jobQueue?: Map<string, number[]>;
  defaultOptions?: {
    queries?: Omit<QueryOptions, 'queryKey'>;
    mutations?: MutationOptions;
  };
}): QueryClient => {
  const queryDefaults = options?.defaultOptions?.queries ?? {
    queryKeyHashFn: hashFn,
    enabled: true,
    throwOnError: false,
    gcTime: 1000 * 60 * 5,
    staleTime: 1000 * 60 * 5,
    refetchInterval: 1000 * 60 * 5,
    networkMode: 'online' as const,
    retry: 3,
    retryOnMount: true,
    retryDelay: 1000,
    cancelRefetch: true,
    refetchOnWindowFocus: true,
    refetchOnReconnect: options?.defaultOptions?.queries?.networkMode
      ? options?.defaultOptions?.queries?.networkMode === 'online'
      : true,
    refetchOnMount: true,
  };
  const mutationDefaults = options?.defaultOptions?.mutations ?? {
    retry: 0,
    retryDelay: 0,
    gcTime: 5 * 60 * 1000,
    networkMode: 'online' as const,
    throwOnError: false,
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

  const queryDefaultsMap = new Map<string, Partial<QueryOptions>>();

  const getQueryDefaults = (queryKey: QueryKey) => {
    const queryHash = queryKeyHashFn(queryKey);
    for (const [key, defaults] of queryDefaultsMap.entries()) {
      if (queryHash.startsWith(key)) {
        return defaults;
      }
    }
    return {};
  };

  const setQueryDefaults = (
    queryKey: QueryKey,
    defaults: Partial<QueryOptions>,
  ) => {
    const queryHash = queryKeyHashFn(queryKey);
    queryDefaultsMap.set(queryHash, defaults);
  };

  const mutationDefaultsMap = new Map<string, Partial<MutationOptions>>();

  const getMutationDefaults = (mutationKey?: MutationKey) => {
    if (mutationKey) {
      const mutationHash = queryKeyHashFn(mutationKey);
      for (const [key, defaults] of mutationDefaultsMap.entries()) {
        if (mutationHash.startsWith(key)) {
          return defaults;
        }
      }
    }
    return {};
  };

  const setMutationDefaults = (
    mutationKey: MutationKey,
    defaults: Partial<MutationOptions>,
  ) => {
    const mutationHash = queryKeyHashFn(mutationKey);
    mutationDefaultsMap.set(mutationHash, defaults);
  };
  const queryKeyHashFn = queryDefaults.queryKeyHashFn ?? hashFn;
  const cache = createQueryCache(options?.queryCache);
  const mutationCache = createMutationCache(options?.mutationCache);
  const jobQueue = options?.jobQueue ?? new Map();
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
  const getQueryData = (queryKey: QueryKey) => {
    const queryHash = queryKeyHashFn(queryKey);
    return cache.get(queryHash)?.state.data();
  };
  // #region setQueryData
  const setQueryData = (queryKey: QueryKey, data: any) => {
    const queryHash = queryKeyHashFn(queryKey);
    const query = cache.get(queryHash);
    if (!query) return;
    query.state.data((old) => (typeof data === 'function' ? data(old) : data));
  };
  // #region invalidateQueries
  const invalidateQueries: QueryClient['invalidateQueries'] = async (
    { queryKey, exact = false, refetchType = 'active' },
    { throwOnError = false, cancelRefetch = true } = {},
  ) => {
    const queriesToInvalidate = Array.from(cache.values()).filter((query) => {
      if (queryKey) {
        const currentQueryHash = queryKeyHashFn(query.resolvedOptions.queryKey);
        const filterQueryHash = queryKeyHashFn(queryKey);
        const keyMatch = exact
          ? currentQueryHash === filterQueryHash
          : currentQueryHash.startsWith(filterQueryHash);
        if (!keyMatch) return false;
      }
      return true;
    });

    for (const query of queriesToInvalidate) {
      query.state.isStale(true);
    }

    if (refetchType === 'none') return;

    const queriesToRefetch = queriesToInvalidate.filter((query) => {
      if (refetchType === 'active' && !query.isActive) return false;
      if (refetchType === 'inactive' && query.isActive) return false;
      return true;
    });

    if (cancelRefetch) {
      for (const query of queriesToRefetch) {
        query.cancel();
      }
    }

    const refetchPromises = queriesToRefetch.map((query) =>
      query.fetch(undefined, throwOnError),
    );

    try {
      await Promise.all(refetchPromises);
    } catch (error) {
      if (throwOnError) {
        throw error;
      }
    }
  };
  // #region refetchQueries
  const refetchQueries = async (
    filters?: {
      queryKey?: QueryKey;
      type?: 'all' | 'active' | 'inactive';
      exact?: boolean;
      stale?: boolean;
    },
    options?: {
      throwOnError?: boolean;
      cancelRefetch?: boolean;
    },
  ): Promise<void> => {
    const { queryKey, type = 'all', exact = false, stale } = filters || {};
    const { throwOnError = false, cancelRefetch = true } = options || {};

    const queriesToRefetch = Array.from(cache.values()).filter((query) => {
      if (queryKey) {
        const currentQueryHash = queryKeyHashFn(query.resolvedOptions.queryKey);
        const filterQueryHash = queryKeyHashFn(queryKey);
        const keyMatch = exact
          ? currentQueryHash === filterQueryHash
          : currentQueryHash.startsWith(filterQueryHash);
        if (!keyMatch) return false;
      }

      if (type === 'active' && !query.isActive) return false;
      if (type === 'inactive' && query.isActive) return false;
      if (stale === true && !query.state.isStale()) return false;
      if (stale === false && query.state.isStale()) return false;

      return true;
    });

    const refetchPromises = queriesToRefetch.map((query) =>
      query.fetch(undefined, throwOnError),
    );

    if (cancelRefetch) {
      for (const query of queriesToRefetch) {
        query.cancel();
      }
    }

    await Promise.all(refetchPromises);
  };
  // #region cancelQueries
  const cancelQueries = async (filters?: {
    queryKey?: QueryKey;
    exact?: boolean;
  }): Promise<void> => {
    const { queryKey, exact = false } = filters || {};

    const queriesToCancel = Array.from(cache.values()).filter((query) => {
      if (queryKey) {
        const currentQueryHash = queryKeyHashFn(query.resolvedOptions.queryKey);
        const filterQueryHash = queryKeyHashFn(queryKey);
        const keyMatch = exact
          ? currentQueryHash === filterQueryHash
          : currentQueryHash.startsWith(filterQueryHash);
        if (!keyMatch) return false;
      }
      return true;
    });

    for (const query of queriesToCancel) {
      await query.cancel();
    }
  };
  // #region removeQueries
  const removeQueries = (filters?: {
    queryKey?: QueryKey;
    exact?: boolean;
  }): void => {
    const { queryKey, exact = false } = filters || {};

    const queriesToRemove = Array.from(cache.entries()).filter(
      ([hash, query]) => {
        if (queryKey) {
          const currentQueryHash = queryKeyHashFn(
            query.resolvedOptions.queryKey,
          );
          const filterQueryHash = queryKeyHashFn(queryKey);
          const keyMatch = exact
            ? currentQueryHash === filterQueryHash
            : currentQueryHash.startsWith(filterQueryHash);
          if (!keyMatch) return false;
        }
        return true;
      },
    );

    for (const [hash, query] of queriesToRemove) {
      query.destroy();
      cache.delete(hash);
    }
  };
  const resetQueries = async (
    filters?: {
      queryKey?: QueryKey;
      exact?: boolean;
    },
    options?: {
      throwOnError?: boolean;
      cancelRefetch?: boolean;
    },
  ): Promise<void> => {
    const { queryKey, exact = false } = filters || {};
    const { throwOnError = false, cancelRefetch = true } = options || {};

    const queriesToReset = Array.from(cache.values()).filter((query) => {
      if (queryKey) {
        const currentQueryHash = queryKeyHashFn(query.resolvedOptions.queryKey);
        const filterQueryHash = queryKeyHashFn(queryKey);
        const keyMatch = exact
          ? currentQueryHash === filterQueryHash
          : currentQueryHash.startsWith(filterQueryHash);
        if (!keyMatch) return false;
      }
      return true;
    });

    const resetPromises = queriesToReset.map(async (query) => {
      query.reset();
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
  // #region ensureQueryData
  const ensureQueryData = async <
    TQueryFnData = unknown,
    TError = unknown,
    TData = TQueryFnData,
    TQueryKey extends QueryKey = QueryKey,
  >(
    options: Prettify<
      QueryOptions<TQueryFnData, TError, TData, TQueryKey> & {
        revalidateIfStale?: boolean;
      }
    >,
  ): Promise<TData> => {
    const { queryKey, revalidateIfStale = false, ...restOptions } = options;
    const queryHash = queryKeyHashFn(queryKey);
    const existingQuery = cache.get(queryHash);

    if (existingQuery) {
      const currentData = existingQuery.state.data();
      if (currentData !== undefined) {
        if (revalidateIfStale && existingQuery.state.isStale()) {
          existingQuery.fetch().catch(() => {}); // Refetch in background
        }
        return currentData as TData;
      }
    }

    // If query doesn't exist or has no data, fetch it
    const query = createQuery(queryClient, {
      queryKey,
      ...restOptions,
    });
    await query.fetch();
    return query.state.data() as TData;
  };
  // #region fetchQuery
  const fetchQuery = async <
    TQueryFnData = unknown,
    TError = unknown,
    TData = TQueryFnData,
    TQueryKey extends QueryKey = QueryKey,
  >(
    options: FetchQueryOptions<TQueryFnData, TError, TData, TQueryKey>,
  ): Promise<TData> => {
    const { queryKey, queryFn, staleTime = 0, ...restOptions } = options;
    const queryHash = queryKeyHashFn(queryKey);
    const existingQuery = cache.get(queryHash);

    if (existingQuery) {
      const currentData = existingQuery.state.data();
      if (currentData !== undefined && !existingQuery.state.isStale()) {
        return currentData as TData;
      }
    }

    const query = createQuery(queryClient, {
      queryKey,
      queryFn,
      ...restOptions,
    });

    await query.fetch();
    return query.state.data() as unknown as TData;
  };
  // #region prefetchQuery
  const prefetchQuery = async <
    TQueryFnData = unknown,
    TError = unknown,
    TData = TQueryFnData,
    TQueryKey extends QueryKey = QueryKey,
  >(
    options: FetchQueryOptions<TQueryFnData, TError, TData, TQueryKey>,
  ): Promise<void> => {
    try {
      await fetchQuery(options);
    } catch (error) {
      // Silently catch any errors
    }
  };
  const isFetching = (filters?: QueryFilters): number => {
    const queries = Array.from(cache.values());
    const filteredQueries = filters
      ? queries.filter((query) =>
          Object.entries(filters).every(
            ([key, value]) => query[key as keyof typeof query] === value,
          ),
        )
      : queries;
    return filteredQueries.filter((query) => query.state.isFetching()).length;
  };
  const isMutating = (filters?: MutationFilters): number => {
    const mutations = Array.from(mutationCache.values());
    return mutations.filter((mutation) => {
      if (filters) {
        return Object.entries(filters).every(
          ([key, value]) => mutation[key as keyof typeof mutation] === value,
        );
      }
      return mutation.state.status() === 'pending';
    }).length;
  };
  const getQueryCache = (): Map<string, Query> => {
    return cache;
  };

  const getMutationCache = (): Map<string, MutationObject> => {
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

// #region Hooks
export function useQueryClient(queryClient?: QueryClient) {
  const client = queryClient ?? useContext(QueryClientContext);
  if (!client) {
    throw new Error('No QueryClient set, use QueryClientProvider to set one');
  }
  return client;
}
type Prettify<T> = {
  [K in keyof T]: T[K];
} & {};
export function useQuery<
  TQueryFnData = unknown,
  TError = unknown,
  TData = TQueryFnData,
  TQueryKey extends QueryKey = QueryKey,
  TInitialData extends TQueryFnData | undefined = undefined,
  R = void,
  D = R extends void
    ? TInitialData extends TQueryFnData
      ? TInitialData
      : TQueryFnData
    : R,
>(
  options: QueryOptions<
    TQueryFnData,
    TError,
    TData,
    TQueryKey,
    TInitialData,
    R
  >,
): ObservableReadonly<
  QueryStateReadonly<TInitialData extends undefined ? D | undefined : D> & {
    refetch: () => Promise<void>;
    cancel: () => void;
  }
> {
  const queryClient = useQueryClient(options.queryClient);
  const query = useMemo(() => {
    return createQuery<TQueryFnData, TError, TData, TQueryKey, TInitialData, R>(
      queryClient,
      options,
    );
  });

  useEffect(
    () => {
      query().addInstance();
    },
    { sync: true },
  );

  // @ts-expect-error I don't know what is going on here
  return useMemo(() => {
    const state = Object.fromEntries(
      Object.entries(query().state).map(([key, value]) => [
        key,
        key === 'meta' ? value : useReadonly(value as Observable<any>),
      ]),
    ) as QueryStateReadonly<D>;
    return {
      ...state,
      data: useMemo(() =>
        state.isPending() && typeof options.initialData === 'undefined'
          ? options.placeholderData
          : (query().state.data() && options.select?.(state.data() as any)) ??
            query().state.data(),
      ),
      refetch: query().refetch,
      cancel: query().cancel,
    };
  });
}
