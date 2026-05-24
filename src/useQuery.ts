import { isDevelopment } from 'std-env';
import {
  $,
  $$,
  type FunctionMaybe,
  type Observable,
  type ObservableMaybe,
  type ObservableReadonly,
  untrack,
  useCleanup,
  useContext,
  useEventListener,
  useMemo,
  useRoot,
} from 'voby';
import { QueryClientContext } from './context';
import type { MutationFilters, MutationKey, MutationObject, MutationOptions } from './useMutation';
import { hashFn, partialMatchKey, replaceEqualDeep } from './utils';

const isBrowser = typeof window !== 'undefined';

// #region Types
export type MutationCache = {
  size: number;
  has: (key: string) => boolean;
  get: (key: string) => MutationObject<any, any, any, any> | undefined;
  set: (
    key: string,
    value: MutationObject<any, any, any, any>,
  ) => Map<string, MutationObject<any, any, any, any>>;
  delete: (key: string) => boolean;
  clear: () => void;
  values: () => IterableIterator<MutationObject<any, any, any, any>>;
  entries: () => IterableIterator<[string, MutationObject<any, any, any, any>]>;
  keys: () => IterableIterator<string>;
  version: Observable<number>;
};
export type CancelOptions = {
  silent?: boolean;
  revert?: boolean;
};
export class CancelledError extends Error {
  revert: boolean;
  silent: boolean;

  constructor({ revert = true, silent = false }: CancelOptions = {}) {
    super('Query was cancelled');
    this.name = 'CancelledError';
    this.revert = revert;
    this.silent = silent;
  }
}
export type QueryClient = {
  cache: Map<string, Query<any, any, any, any>>;
  mutationCache: MutationCache;
  jobQueue: Map<string, number[]>;
  startQueueJob: (queueKey: string) => void;
  finishQueueJob: (queueKey: string) => void;
  getQueryData: <T>(queryKey: QueryKey) => T | undefined;
  setQueryData: <T>(queryKey: QueryKey, data: T | ((previous: T | undefined) => T)) => void;
  invalidateQueries: (
    filters?: QueryFilters & {
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
    filters?: QueryFilters,
    options?: {
      throwOnError?: boolean;
      cancelRefetch?: boolean;
    },
  ) => Promise<void>;
  cancelQueries: (
    filters?: QueryFilters,
    options?: CancelOptions,
  ) => Promise<void>;
  removeQueries: (filters?: QueryFilters) => void;
  resetQueries: (
    filters?: QueryFilters,
    options?: {
      throwOnError?: boolean;
      cancelRefetch?: boolean;
    },
  ) => Promise<void>;
  isFetching: (filters?: QueryFilters) => number;
  isMutating: (filters?: MutationFilters) => number;
  getQueryCache: () => Map<string, Query>;
  getMutationCache: () => MutationCache;
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
  setQueryDefaults: (queryKey: QueryKey, defaults: Partial<QueryOptions>) => void;
  getMutationDefaults: (mutationKey?: MutationKey) => Partial<MutationOptions>;
  setMutationDefaults: (mutationKey: MutationKey, defaults: Partial<MutationOptions>) => void;
};
export type QueryKey = FunctionMaybe<ObservableMaybe<unknown>[]>;
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
  enabled?: FunctionMaybe<boolean>;
  staleTime?: number | 'static' | ((query: Query) => number | 'static');
  refetchInterval?: number;
  gcTime?: number | typeof Infinity;
  throwOnError?: boolean;
  structuralSharing?:
    | boolean
    | ((oldData: TData | undefined, newData: Awaited<TQueryFnData>) => TData);
  select?: (data: TInitialData extends TQueryFnData ? TInitialData : TQueryFnData) => R;
  networkMode?: 'online' | 'always' | 'offlineFirst';
  refetchOnReconnect?: boolean;
  retry?: boolean | number | ((failureCount: number, error: TError) => boolean);
  retryOnMount?: boolean;
  retryDelay?: number | ((retryAttempt: number, error: TError) => number);
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
  isRefetchError: ObservableReadonly<boolean>;
  isFetched: ObservableReadonly<boolean>;
  isFetchedAfterMount: ObservableReadonly<boolean>;
  isPaused: ObservableReadonly<boolean>;
  isPending: ObservableReadonly<boolean>;
  isSuccess: ObservableReadonly<boolean>;
  isError: ObservableReadonly<boolean>;
  isLoading: ObservableReadonly<boolean>;
  isLoadingError: ObservableReadonly<boolean>;
  isPlaceholderData: ObservableReadonly<boolean>;
  isStale: Observable<boolean>;
  isIdle: ObservableReadonly<boolean>;
};
type QueryStateReadonly<D> = {
  [K in keyof Omit<QueryState<D>, 'meta'>]: ObservableReadonly<
    Awaited<ReturnType<QueryState<D>[K]>>
  >;
} & { meta: QueryState<D>['meta'] };
type QueryStateSnapshot<D = undefined> = {
  data: D;
  dataUpdateCount: number;
  dataUpdatedAt: number;
  error: Error | null;
  errorUpdateCount: number;
  errorUpdatedAt: number;
  isInvalidated: boolean;
  status: QueryStatus;
  fetchStatus: FetchStatus;
  isStale: boolean;
};
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
  cancel: (options?: CancelOptions) => Promise<void>;
  destroy: () => void;
  fetch: (options?: {
    retryAttempt?: number;
    throwOnError?: boolean;
    force?: boolean;
  }) => Promise<void>;
  refetch: (options?: { throwOnError?: boolean; cancelRefetch?: boolean }) => Promise<void>;
  resolvedOptions: QueryOptions<TQueryFnData, TError, TData, TQueryKey, TInitialData, R>;
  instances: number;
  controller: AbortController;
  isFetching: boolean;
  fetchPromise?: Promise<void>;
  revertState?: QueryStateSnapshot<TData>;
  destroyDisposer: () => void;
  stateDisposer: () => void;
  staleDisposer: () => void;
  retryDisposer: () => void;
  addInstance: () => () => void;
  removeInstance: () => void;
  scheduleDestroy: () => void;
  reset: () => void;
  scheduleRetry: (retryAttempt: number, error: Error) => void;
  isCancelled: boolean;
  events: EventTarget;
  inactiveCleanup?: () => void;
};
// #region Core
const createQueryCache = (cache?: Map<string, Query<any, any, any, any>>) => {
  return cache ?? new Map<string, Query<any, any, any, any>>();
};
const createMutationCache = (cache?: Map<string, MutationObject<any, any, any, any>>) => {
  const map = cache ?? new Map<string, MutationObject<any, any, any, any>>();
  // Reactive version signal — bumps on structural changes so useMutationState re-evaluates
  const version = $(0);
  const bump = () => version((v) => v + 1);
  return {
    get size() {
      return map.size;
    },
    has: (key: string) => map.has(key),
    get: (key: string) => map.get(key),
    set: (key: string, value: MutationObject<any, any, any, any>) => {
      map.set(key, value);
      bump();
      return map;
    },
    delete: (key: string) => {
      const r = map.delete(key);
      if (r) bump();
      return r;
    },
    clear: () => {
      map.clear();
      bump();
    },
    values: () => map.values(),
    entries: () => map.entries(),
    keys: () => map.keys(),
    [Symbol.iterator]: () => map[Symbol.iterator](),
    version,
  };
};

const createQueryStateSnapshot = <D>(state: QueryState<D>): QueryStateSnapshot<D> => ({
  data: state.data(),
  dataUpdateCount: state.dataUpdateCount(),
  dataUpdatedAt: state.dataUpdatedAt(),
  error: state.error(),
  errorUpdateCount: state.errorUpdateCount(),
  errorUpdatedAt: state.errorUpdatedAt(),
  isInvalidated: state.isInvalidated(),
  status: state.status(),
  fetchStatus: state.fetchStatus(),
  isStale: state.isStale(),
});

const restoreQueryStateSnapshot = <D>(state: QueryState<D>, snapshot: QueryStateSnapshot<D>) => {
  state.data(snapshot.data);
  state.dataUpdateCount(snapshot.dataUpdateCount);
  state.dataUpdatedAt(snapshot.dataUpdatedAt);
  state.error(snapshot.error);
  state.errorUpdateCount(snapshot.errorUpdateCount);
  state.errorUpdatedAt(snapshot.errorUpdatedAt);
  state.isInvalidated(snapshot.isInvalidated);
  state.status(snapshot.status);
  state.fetchStatus(snapshot.fetchStatus);
  state.isStale(snapshot.isStale);
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
  options: QueryOptions<TQueryFnData, TError, TData, TQueryKey, TInitialData, R>,
): Query<TQueryFnData, TError, TData, TQueryKey, TInitialData, R> => {
  const resolvedOptions: QueryOptions<TQueryFnData, TError, TData, TQueryKey, TInitialData, R> = {
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
  resolvedOptions.enabled = $$(resolvedOptions.enabled);

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
    return query as Query<TQueryFnData, TError, TData, TQueryKey, TInitialData, R>;
  }

  // create custom event
  const events = new EventTarget();

  // #region query
  const query: Query<TQueryFnData, TError, TData, TQueryKey, TInitialData, R> = {
    isActive: false,
    events,
    resolvedOptions,
    instances: 0,
    state: undefined as any, // will be set below
    controller: new AbortController(),
    isCancelled: false,
    destroyDisposer: () => {}, // for GC timer only
    stateDisposer: () => {}, // for state lifetime
    staleDisposer: () => {}, // for stale timer
    retryDisposer: () => {}, // for retry timer
    fetchPromise: undefined,
    revertState: undefined,
    // #region addInstance
    addInstance: () => {
      query.destroyDisposer();
      query.isActive = true;
      query.instances++;
      untrack(() => {
        if (query.resolvedOptions.enabled) {
          const shouldRefetch = (() => {
            const refetchOnMount = query.resolvedOptions.refetchOnMount;
            if (typeof refetchOnMount === 'function') {
              return refetchOnMount(query);
            }
            if (refetchOnMount === 'always') return true;
            if (refetchOnMount === false) return false;
            if (query.state.isStale() || query.state.isPending()) return true;
            return false;
          })();
          if (shouldRefetch) {
            query.fetch();
          }
        }
        if (query.state.fetchStatus() !== 'fetching') {
          query.state.fetchStatus(!isBrowser || window.navigator.onLine ? 'idle' : 'paused');
        }
        if (query.instances === 1) {
          const cleanups: (() => void)[] = [];

          if (query.resolvedOptions.refetchInterval) {
            const intervalDelay = query.resolvedOptions.refetchInterval;
            let intervalId: ReturnType<typeof setInterval>;
            const timeoutId = setTimeout(() => {
              intervalId = setInterval(() => {
                query.fetch();
              }, intervalDelay);
            }, intervalDelay);
            cleanups.push(() => {
              clearTimeout(timeoutId);
              clearInterval(intervalId);
            });
          }
          if (query.resolvedOptions.networkMode === 'online' && isBrowser) {
            const onlineHandler = async () => {
              if (query.resolvedOptions.refetchOnReconnect) {
                query.state.fetchStatus('fetching');
                query.refetch();
              }
            };
            const offlineHandler = async () => {
              await query.cancel({ revert: false, silent: true });
              query.state.fetchStatus('paused');
            };
            window.addEventListener('online', onlineHandler);
            window.addEventListener('offline', offlineHandler);
            cleanups.push(() => {
              window.removeEventListener('online', onlineHandler);
              window.removeEventListener('offline', offlineHandler);
            });
          }
          if (query.resolvedOptions.refetchOnWindowFocus && isBrowser) {
            const focusHandler = () => {
              if (
                document.visibilityState === 'visible' &&
                (query.resolvedOptions.refetchOnWindowFocus === 'always' || query.state.isStale())
              ) {
                query.refetch();
              }
            };
            document.addEventListener('visibilitychange', focusHandler);
            cleanups.push(() => {
              document.removeEventListener('visibilitychange', focusHandler);
            });
          }

          query.inactiveCleanup = () => {
            cleanups.forEach((c) => c());
            query.inactiveCleanup = undefined;
          };
        }
      });
      return query.removeInstance;
    },
    removeInstance: () => {
      query.instances--;
      if (query.instances === 0) {
        query.isActive = false;
        query.inactiveCleanup?.();
        query.scheduleDestroy();
      }
    },
    // #region cancel
    cancel: async ({ revert = true, silent = false } = {}) => {
      const wasFetching = query.isFetching || query.fetchPromise !== undefined;
      const hadPreviousData = query.revertState?.data !== undefined;

      query.controller.abort();
      query.isCancelled = true;
      query.retryDisposer();
      query.retryDisposer = () => {};
      query.isFetching = false;
      query.fetchPromise = undefined;

      if (revert && query.revertState) {
        restoreQueryStateSnapshot(query.state, query.revertState);
      }

      if (query.state.fetchStatus() !== 'paused') {
        query.state.fetchStatus('idle');
      }

      query.revertState = undefined;

      if (wasFetching && revert && !silent && !hadPreviousData) {
        throw new CancelledError({ revert, silent });
      }
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
    scheduleDestroy: () => {
      if (resolvedOptions.gcTime === Infinity) return;
      query.destroyDisposer();
      const id = setTimeout(() => {
        query.destroy();
      }, resolvedOptions.gcTime);
      query.destroyDisposer = () => clearTimeout(id);
    },
    destroy: () => {
      query.cancel({ revert: false, silent: true });
      query.inactiveCleanup?.();
      query.staleDisposer();
      query.retryDisposer();
      query.stateDisposer();
      cache.delete(queryHash);
    },
    isFetching: false,
    refetch: async ({
      throwOnError = resolvedOptions.throwOnError,
      cancelRefetch = resolvedOptions.cancelRefetch,
    } = {}) => {
      if (!query.resolvedOptions.enabled) return;
      if (cancelRefetch) {
        await query.cancel({ revert: false, silent: true });
      }
      return query.fetch({ retryAttempt: 0, throwOnError });
    },
    // #region fetch
    fetch: async ({
      retryAttempt = 0,
      throwOnError = resolvedOptions.throwOnError,
      force = false,
    } = {}) => {
      if (queryHash && !cache.has(queryHash)) {
        cache.set(queryHash, query as Query);
      }
      if (!query.resolvedOptions.enabled) return;
      if (!force && !query.isActive) return;
      if (query.isFetching && !query.isCancelled) {
        return query.fetchPromise!;
      }
      if (query.state.fetchStatus() === 'paused') return;

      query.isFetching = true;
      query.isCancelled = false;
      query.controller = new AbortController();
      const signal = query.controller.signal;
      query.revertState = createQueryStateSnapshot(query.state);
      let fetchPromise!: Promise<void>;
      fetchPromise = (async () => {
        try {
          query.state.fetchStatus('fetching');
          const result = await untrack(() => query.resolvedOptions.queryFn!({ signal }));
          // If query is cancelled before promise resolves, don't update state
          if (query.isCancelled || signal.aborted) {
            return;
          }

          let newData: TData;
          if (typeof resolvedOptions.structuralSharing === 'function') {
            newData = resolvedOptions.structuralSharing(query.state.data(), result) as TData;
          } else if (resolvedOptions.structuralSharing === false) {
            newData = result as TData;
          } else if (isDevelopment) {
            try {
              newData = replaceEqualDeep(query.state.data(), result) as TData;
            } catch (error) {
              console.error(
                `Structural sharing requires data to be JSON serializable. To fix this, turn off structuralSharing or return JSON-serializable data from your queryFn. [${queryHash}]: ${error}`,
              );

              throw error;
            }
          } else {
            newData = replaceEqualDeep(query.state.data(), result) as TData;
          }

          query.state.data(newData);
          query.state.dataUpdatedAt(Date.now());
          query.state.dataUpdateCount((prev) => prev + 1);
          query.state.status('success');
        } catch (err) {
          if (!signal.aborted) {
            const error = err instanceof Error ? err : new Error(String(err));
            query.state.error(error);
            query.state.status('error');
            query.state.errorUpdatedAt(Date.now());
            query.state.errorUpdateCount((prev) => prev + 1);
            if (throwOnError) {
              throw error;
            }
            query.scheduleRetry(retryAttempt + 1, error);
          }
        } finally {
          if (query.fetchPromise !== fetchPromise) {
            return;
          }

          query.fetchPromise = undefined;
          query.revertState = undefined;

          const shouldSkipFinalize =
            !query.isCancelled && signal.aborted && query.state.fetchStatus() === 'fetching';
          if (!shouldSkipFinalize) {
            query.isFetching = false;
            if (query.state.fetchStatus() !== 'paused') {
              query.state.fetchStatus('idle');
            }
            query.staleDisposer();
            query.state.isStale(false);
            const rawStaleTime = query.resolvedOptions.staleTime;
            const staleTime =
              typeof rawStaleTime === 'function' ? rawStaleTime(query as Query) : rawStaleTime;
            if (staleTime === 'static' || staleTime === Infinity) {
              // data never goes stale
            } else if (staleTime === 0) {
              query.state.isStale(true);
            } else {
              const id = setTimeout(() => {
                query.state.isStale(true);
              }, staleTime);
              query.staleDisposer = () => clearTimeout(id);
            }
            events.dispatchEvent(new CustomEvent('fetch:done'));
          }
        }
      })();

      query.fetchPromise = fetchPromise;

      return fetchPromise;
    },
    // #region retry
    scheduleRetry: (attempt: number, error: Error) => {
      const { retry, retryDelay } = query.resolvedOptions;
      if (retry === false) return;
      if (typeof retry === 'function' && !retry(attempt - 1, error as TError)) return;
      const delay =
        typeof retryDelay === 'function' ? retryDelay(attempt, error as TError) : retryDelay;
      if (
        isBrowser &&
        query.resolvedOptions.networkMode === 'online' &&
        query.state.fetchStatus() === 'paused'
      ) {
        useEventListener(
          window,
          'online',
          () => {
            query.fetch({ retryAttempt: attempt });
          },
          { once: true },
        );
        return;
      }
      if (retry === true || typeof retry === 'function' || (retry && attempt <= retry)) {
        const id = setTimeout(() => {
          query.retryDisposer = () => {};
          query.fetch({ retryAttempt: attempt });
        }, delay ?? 0);
        query.retryDisposer = () => clearTimeout(id);
      }
    },
  };

  // Use useRoot to create the query state in a detached reactive scope
  query.stateDisposer = useRoot(() => {
    const data = $(options.initialData as TData, { equals: false });
    const dataUpdateCount = $(0);
    const dataUpdatedAt = $(options.initialDataUpdatedAt ?? 0);
    const error = $<Error | null>(null, { equals: false });
    const errorUpdateCount = $(0);
    const errorUpdatedAt = $(0);
    const meta = $(null);
    const isInvalidated = $(false);
    const status = $<QueryStatus>(options.initialData !== undefined ? 'success' : 'pending');
    const fetchStatus = $<FetchStatus>('idle');
    const isStale = $(false);

    query.state = {
      data,
      dataUpdateCount,
      dataUpdatedAt,
      error,
      errorUpdateCount,
      errorUpdatedAt,
      meta,
      isInvalidated,
      status,
      fetchStatus,
      isFetching: useMemo((): boolean => fetchStatus() === 'fetching'),
      isRefetching: useMemo((): boolean => fetchStatus() === 'fetching' && status() !== 'pending'),
      isFetched: useMemo((): boolean => dataUpdateCount() > 0 || errorUpdateCount() > 0),
      isFetchedAfterMount: useMemo((): boolean => status() !== 'pending'),
      isPaused: useMemo((): boolean => fetchStatus() === 'paused'),
      isPending: useMemo((): boolean => status() === 'pending'),
      isSuccess: useMemo((): boolean => status() === 'success'),
      isError: useMemo((): boolean => status() === 'error'),
      isLoading: useMemo((): boolean => status() === 'pending' && fetchStatus() === 'fetching'),
      isLoadingError: useMemo((): boolean => status() === 'error' && dataUpdateCount() === 0),
      isRefetchError: useMemo((): boolean => status() === 'error' && dataUpdateCount() > 0),
      isPlaceholderData: useMemo(
        (): boolean => options.placeholderData !== undefined && data() === undefined,
      ),
      isStale,
      isIdle: useMemo((): boolean => fetchStatus() === 'idle' && status() === 'pending'),
    } as QueryState<TData>;
    // Return disposer for cleanup
    return () => {
      // No-op for now, but could add cleanup logic if needed
    };
  });

  cache.set(queryHash, query as Query);

  return query;
};

export type QueryFilters = {
  queryKey?: QueryKey;
  exact?: boolean;
  type?: 'all' | 'active' | 'inactive';
  stale?: boolean;
  fetchStatus?: FetchStatus;
  predicate?: (query: Query) => boolean;
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
    cancelRefetch: true,
    refetchOnWindowFocus: true,
    structuralSharing: true,
    refetchOnReconnect: options?.defaultOptions?.queries?.networkMode
      ? options?.defaultOptions?.queries?.networkMode === 'online'
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
  const queryKeyHashFn = queryDefaults.queryKeyHashFn ?? hashFn;
  const cache = createQueryCache(options?.queryCache);
  const mutationCache = createMutationCache(options?.mutationCache);
  const jobQueue = options?.jobQueue ?? new Map();
  const queueBus = new EventTarget();

  const matchesQueryKey = (query: Query, queryKey: QueryKey, exact: boolean) => {
    return exact
      ? queryKeyHashFn(query.resolvedOptions.queryKey) === queryKeyHashFn(queryKey)
      : partialMatchKey(queryKey, query.resolvedOptions.queryKey);
  };

  const matchesQueryFilters = (query: Query, filters?: QueryFilters) => {
    if (!filters) return true;
    const { queryKey, exact = false, type = 'all', stale, fetchStatus, predicate } = filters;

    if (queryKey && !matchesQueryKey(query, queryKey, exact)) return false;
    if (type === 'active' && !query.isActive) return false;
    if (type === 'inactive' && query.isActive) return false;
    if (stale === true && !query.state.isStale()) return false;
    if (stale === false && query.state.isStale()) return false;
    if (fetchStatus && query.state.fetchStatus() !== fetchStatus) return false;
    if (predicate && !predicate(query)) return false;

    return true;
  };

  const matchesMutationFilters = (mutation: MutationObject, filters?: MutationFilters) => {
    if (!filters) return mutation.state.status() === 'pending';

    const { mutationKey, exact = false, status, predicate } = filters;
    if (mutationKey) {
      const currentMutationKey = mutation.resolvedOptions.mutationKey;
      if (!currentMutationKey) return false;
      const keyMatch = exact
        ? hashFn(currentMutationKey) === hashFn(mutationKey)
        : partialMatchKey(mutationKey, currentMutationKey);
      if (!keyMatch) return false;
    }
    if (status && mutation.state.status() !== status) return false;
    if (predicate && !predicate(mutation)) return false;

    return true;
  };

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
  const setQueryData: QueryClient['setQueryData'] = (queryKey, data) => {
    const queryHash = queryKeyHashFn(queryKey);
    let query = cache.get(queryHash);
    if (!query) {
      const resolvedData = typeof data === 'function' ? (data as any)(undefined) : data;
      createQuery(queryClient, {
        queryKey,
        initialData: resolvedData,
        initialDataUpdatedAt: Date.now(),
      });
    } else {
      if (typeof data === 'function') {
        const updater = data as (previous: unknown) => unknown;
        query.state.data((old) => updater(old));
      } else {
        query.state.data(data);
      }
      query.state.dataUpdatedAt(Date.now());
      query.state.status('success');
    }
  };
  // #region invalidateQueries
  const invalidateQueries: QueryClient['invalidateQueries'] = async (
    filters,
    { throwOnError = false, cancelRefetch = true } = {},
  ) => {
    const { refetchType = 'active', ...queryFilters } = filters || {};
    const queriesToInvalidate = Array.from(cache.values()).filter((query) =>
      matchesQueryFilters(query, queryFilters),
    );

    for (const query of queriesToInvalidate) {
      query.state.isStale(true);
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
  // #region refetchQueries
  const refetchQueries = async (
    filters?: QueryFilters,
    options?: {
      throwOnError?: boolean;
      cancelRefetch?: boolean;
    },
  ): Promise<void> => {
    const { throwOnError = false, cancelRefetch = true } = options || {};

    const queriesToRefetch = Array.from(cache.values()).filter((query) => {
      if (!query.resolvedOptions.enabled) return false;
      return matchesQueryFilters(query, filters);
    });

    if (cancelRefetch) {
      await Promise.all(
        queriesToRefetch.map((query) => query.cancel({ revert: false, silent: true })),
      );
    }

    const refetchPromises = queriesToRefetch.map((query) =>
      query.fetch({ throwOnError, force: true }),
    );

    await Promise.all(refetchPromises);
  };
  // #region cancelQueries
  const cancelQueries: QueryClient['cancelQueries'] = async (
    filters,
    { silent = false, revert = true } = {},
  ): Promise<void> => {
    const queriesToCancel = Array.from(cache.values()).filter((query) =>
      matchesQueryFilters(query, filters),
    );

    for (const query of queriesToCancel) {
      await query.cancel({ silent, revert });
    }
  };
  // #region removeQueries
  const removeQueries: QueryClient['removeQueries'] = (filters) => {
    const queriesToRemove = Array.from(cache.entries()).filter(
      ([, query]) => matchesQueryFilters(query, filters),
    );

    for (const [, query] of queriesToRemove) {
      query.destroy();
    }
  };
  const resetQueries: QueryClient['resetQueries'] = async (
    filters,
    options?: {
      throwOnError?: boolean;
      cancelRefetch?: boolean;
    },
  ): Promise<void> => {
    const { throwOnError = false, cancelRefetch = true } = options || {};

    const queriesToReset = Array.from(cache.values()).filter(
      (query) => matchesQueryFilters(query, filters),
    );

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
          existingQuery.fetch({ force: true }).catch(() => {}); // Refetch in background
        }
        return currentData as TData;
      }
    }

    // If query doesn't exist or has no data, fetch it
    const query = createQuery(queryClient, {
      queryKey,
      ...restOptions,
    });
    await query.fetch({ force: true });
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
    const { queryKey, queryFn, ...restOptions } = options;
    const queryHash = queryKeyHashFn(queryKey);
    const existingQuery = cache.get(queryHash);

    if (existingQuery) {
      if (existingQuery.state.isStale()) {
        await existingQuery.fetch({ force: true });
      }
      const currentData = existingQuery.state.data();
      if (currentData !== undefined) {
        return currentData as TData;
      }
    }

    const query = createQuery(queryClient, {
      queryKey,
      queryFn,
      ...restOptions,
    });
    await query.fetch({ force: true });
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
    } catch {
      // Silently catch any errors
    }
  };
  const isFetching = (filters?: QueryFilters): number => {
    const queries = Array.from(cache.values());
    const filteredQueries = queries.filter((query) => matchesQueryFilters(query, filters));
    return filteredQueries.filter((query) => query.state.isFetching()).length;
  };
  const isMutating = (filters?: MutationFilters): number => {
    const mutations = Array.from(mutationCache.values());
    return mutations.filter((mutation) => matchesMutationFilters(mutation, filters)).length;
  };
  const getQueryCache = (): Map<string, Query> => {
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
  D = R extends void ? (TInitialData extends TQueryFnData ? TInitialData : TQueryFnData) : R,
>(
  options: QueryOptions<TQueryFnData, TError, TData, TQueryKey, TInitialData, R>,
): ObservableReadonly<
  QueryStateReadonly<TInitialData extends undefined ? D | undefined : D> & {
    refetch: () => Promise<void>;
    cancel: () => void;
  }
> {
  const queryClient = useQueryClient(options.queryClient);
  const query = useMemo(() => {
    const query = createQuery<TQueryFnData, TError, TData, TQueryKey, TInitialData, R>(
      queryClient,
      options,
    );
    useCleanup(query.addInstance());
    return query;
  });

  // Return a read-only observable function, not a plain object
  return useMemo(() => {
    const state = query().state;
    return {
      ...state,
      data: useMemo(() => {
        const data = state.data();
        if (state.isPending() && options.placeholderData) {
          return options.placeholderData as Awaited<D>;
        }
        if (options.select && data !== undefined) {
          return options.select(data as any) as any;
        }
        return data as Awaited<D>;
      }),
      refetch: query().refetch,
      cancel: query().cancel,
    };
  });
}
