import { isDevelopment } from 'std-env';
import { $, $$, untrack, useEventListener, useMemo, useRoot } from 'voby';
import type {
  CancelOptions,
  FetchStatus,
  QueryCache,
  QueryClient,
  QueryKey,
  QueryOptions,
  QueryRefetchOptions,
  QueryState,
  QueryStatus,
  ResolvedQueryOptions,
} from './types.ts';
import { ensureQueryFn, replaceData, resolveKey, shouldThrowError } from './utils.ts';
import { onlineManager } from './onlineManager.ts';
import { timeoutManager, type ManagedTimerId } from './timeoutManager.ts';
import { focusManager } from './focusManager.ts';

const isBrowser = typeof window !== 'undefined';

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
type QueryStateSnapshot<D = undefined, TError = Error> = {
  data: D;
  dataUpdateCount: number;
  dataUpdatedAt: number;
  error: TError | null;
  errorUpdateCount: number;
  errorUpdatedAt: number;
  isInvalidated: boolean;
  status: QueryStatus;
  fetchStatus: FetchStatus;
  isStale: boolean;
};
type QueryFetchFn = (options: {
  signal: AbortSignal;
  queryKey: QueryKey;
  meta?: Record<string, unknown>;
}) => Promise<unknown>;
type QueryFetchOptions = {
  retryAttempt?: number;
  throwOnError?: boolean;
  force?: boolean;
  fetchFn?: QueryFetchFn;
};
export type Query<
  TQueryFnData = unknown,
  TError = unknown,
  TData = TQueryFnData,
  TQueryKey extends QueryKey = QueryKey,
> = {
  queryHash: string;
  isActive: boolean;
  state: QueryState<TData, TError>;
  cancel: (options?: CancelOptions) => Promise<void>;
  destroy: () => void;
  fetch: (options?: QueryFetchOptions) => Promise<void>;
  refetch: (options?: QueryRefetchOptions) => Promise<void>;
  resolvedOptions: ResolvedQueryOptions<TQueryFnData, TError, TData>;
  instances: number;
  controller: AbortController;
  isFetching: boolean;
  fetchPromise?: Promise<void>;
  revertState?: QueryStateSnapshot<TData, TError>;
  destroyDisposer: () => void;
  stateDisposer: () => void;
  staleDisposer: () => void;
  retryDisposer: () => void;
  isStaleByTime: (staleTime: number | 'static') => boolean;
  addInstance: () => () => void;
  removeInstance: () => void;
  scheduleDestroy: () => void;
  reset: () => void;
  scheduleRetry: (retryAttempt: number, error: TError, fetchFn?: QueryFetchFn) => boolean;
  isCancelled: boolean;
  inactiveCleanup?: () => void;
};

const createQueryStateSnapshot = <D, TError>(
  state: QueryState<D, TError>,
): QueryStateSnapshot<D, TError> => ({
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

const restoreQueryStateSnapshot = <D, TError>(
  state: QueryState<D, TError>,
  snapshot: QueryStateSnapshot<D, TError>,
) => {
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

export const resolveQueryOptions = <
  TQueryFnData = unknown,
  TError = unknown,
  TData = TQueryFnData,
  TQueryKey extends QueryKey = QueryKey,
>(
  queryClient: QueryClient,
  options: QueryOptions<TQueryFnData, TError, TData, TQueryKey>,
): ResolvedQueryOptions<TQueryFnData, TError, TData> => {
  return {
    ...(queryClient.getDefaultOptions().queries as QueryOptions<
      TQueryFnData,
      TError,
      TData,
      TQueryKey
    >),
    ...(queryClient.getQueryDefaults(options.queryKey) as QueryOptions<
      TQueryFnData,
      TError,
      TData,
      TQueryKey
    >),
    ...options,
    queryClient,
    queryKey: resolveKey(options.queryKey) as unknown[],
    enabled: $$(options.enabled ?? true),
    initialData:
      typeof options.initialData === 'function'
        ? (options.initialData as () => TData | undefined)()
        : options.initialData,
  } as ResolvedQueryOptions<TQueryFnData, TError, TData>;
};

export const resolveStaleTime = (query: Query<any, any, any, any>): number | 'static' => {
  const staleTime = query.resolvedOptions.staleTime ?? 0;
  return typeof staleTime === 'function' ? staleTime(query) : staleTime;
};

const scheduleQueryStale = (query: Query<any, any, any, any>) => {
  query.staleDisposer();
  query.staleDisposer = () => {};

  if (query.state.data() === undefined) {
    query.state.isStale(true);
    return;
  }

  const staleTime = resolveStaleTime(query);
  if (staleTime === 'static' || staleTime === Infinity) {
    query.state.isStale(false);
    return;
  }

  if (staleTime <= 0) {
    query.state.isStale(true);
    return;
  }

  query.state.isStale(false);

  const id = timeoutManager.setTimeout(() => {
    query.state.isStale(true);
  }, staleTime);
  query.staleDisposer = () => timeoutManager.clearTimeout(id);
};

export const setQuerySuccessData = (
  query: Query<any, any, any, any>,
  data: unknown,
  dataUpdatedAt = Date.now(),
  scheduleStale = true,
) => {
  query.state.data(data);
  query.state.dataUpdatedAt(dataUpdatedAt);
  query.state.dataUpdateCount((previous) => previous + 1);
  query.state.error(null);
  query.state.isInvalidated(false);
  query.state.status('success');
  if (scheduleStale) scheduleQueryStale(query);
};

export const createQuery = <
  TQueryFnData = unknown,
  TError = unknown,
  TData = TQueryFnData,
  TQueryKey extends QueryKey = QueryKey,
>({
  cache,
  queryHash,
  resolvedOptions,
}: {
  cache: QueryCache;
  queryHash: string;
  resolvedOptions: ResolvedQueryOptions<TQueryFnData, TError, TData>;
}): Query<TQueryFnData, TError, TData, TQueryKey> => {
  const query: Query<TQueryFnData, TError, TData, TQueryKey> = {
    queryHash,
    isActive: false,
    resolvedOptions,
    instances: 0,
    state: undefined as any,
    controller: new AbortController(),
    isCancelled: false,
    destroyDisposer: () => {},
    stateDisposer: () => {},
    staleDisposer: () => {},
    retryDisposer: () => {},
    fetchPromise: undefined,
    revertState: undefined,
    isStaleByTime: (staleTime) => {
      if (query.state.data() === undefined) return true;
      if (staleTime === 'static' || staleTime === Infinity) return false;
      return Date.now() - query.state.dataUpdatedAt() >= staleTime;
    },
    addInstance: () => {
      query.destroyDisposer();
      query.isActive = true;
      query.instances++;
      untrack(async () => {
        const isOnline = onlineManager.isOnline();
        const networkMode = query.resolvedOptions.networkMode;
        const shouldSkipDueToNetworkMode = networkMode === 'online' && !isOnline;

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
          if (shouldRefetch && !shouldSkipDueToNetworkMode) {
            await query.refetch();
          }
        }
        if (query.state.fetchStatus() !== 'fetching') {
          const shouldBePaused = networkMode === 'online' ? !isOnline : false;
          query.state.fetchStatus(shouldBePaused ? 'paused' : 'idle');
        }
        if (query.instances === 1) {
          const cleanups: (() => void)[] = [];

          if (query.resolvedOptions.refetchInterval) {
            const intervalDelay = query.resolvedOptions.refetchInterval;
            let intervalId: ManagedTimerId;
            const timeoutId = timeoutManager.setTimeout(async () => {
              intervalId = timeoutManager.setInterval(async () => {
                await query.refetch();
              }, intervalDelay);
            }, intervalDelay);
            cleanups.push(() => {
              timeoutManager.clearTimeout(timeoutId);
              timeoutManager.clearInterval(intervalId);
            });
          }
          if (query.resolvedOptions.networkMode === 'online') {
            const unsubOnline = onlineManager.subscribe(async () => {
              if (onlineManager.isOnline()) {
                if (query.resolvedOptions.refetchOnReconnect) {
                  query.state.fetchStatus('fetching');
                  await query.refetch();
                }
              } else {
                await query.cancel({ revert: false, silent: true });
                query.state.fetchStatus('paused');
              }
            });
            cleanups.push(unsubOnline);
          }
          if (query.resolvedOptions.refetchOnWindowFocus) {
            const unsubFocus = focusManager.subscribe(async () => {
              if (
                focusManager.isFocused() &&
                (query.resolvedOptions.refetchOnWindowFocus === 'always' || query.state.isStale())
              ) {
                await query.refetch();
              }
            });
            cleanups.push(unsubFocus);
          }

          query.inactiveCleanup = () => {
            cleanups.forEach((cleanup) => cleanup());
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
    cancel: async ({ revert = true, silent = false } = {}) => {
      const wasFetching = query.isFetching || query.fetchPromise !== undefined;
      const hadPreviousData = query.revertState?.data !== undefined;

      if (wasFetching) {
        query.controller.abort();
      }
      query.isCancelled = wasFetching;
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
      query.state.data(query.resolvedOptions.initialData as TData);
      query.state.dataUpdatedAt(query.resolvedOptions.initialDataUpdatedAt ?? 0);
      query.state.error(null);
      query.state.errorUpdatedAt(0);
      query.state.status('pending');
      query.state.fetchStatus('idle');
      query.state.isInvalidated(false);
      query.state.isStale(false);
    },
    scheduleDestroy: () => {
      if (query.resolvedOptions.gcTime === Infinity) return;
      query.destroyDisposer();
      const id = timeoutManager.setTimeout(() => {
        cache.remove(query as unknown as Query);
      }, query.resolvedOptions.gcTime!);
      query.destroyDisposer = () => timeoutManager.clearTimeout(id);
    },
    destroy: () => {
      void query.cancel({ revert: false, silent: true });
      query.destroyDisposer();
      query.inactiveCleanup?.();
      query.staleDisposer();
      query.retryDisposer();
      query.stateDisposer();
    },
    isFetching: false,
    refetch: async ({
      throwOnError = query.resolvedOptions.throwOnError,
      cancelRefetch = true,
    }: QueryRefetchOptions = {}) => {
      if (cancelRefetch && query.state.data() !== undefined) {
        query.cancel({ revert: false, silent: true });
      }
      return query.fetch({ retryAttempt: 0, throwOnError, force: true });
    },
    fetch: async ({
      retryAttempt = 0,
      throwOnError = query.resolvedOptions.throwOnError,
      force = false,
      fetchFn,
    } = {}) => {
      if (!force && !query.resolvedOptions.enabled) return;
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
      let didFetchSucceed = false;
      let retryScheduled = false;
      fetchPromise = (async () => {
        try {
          query.state.fetchStatus('fetching');
          const meta = query.resolvedOptions.meta;
          const result = await untrack(() =>
            (fetchFn ?? ensureQueryFn(query.resolvedOptions))({
              signal,
              queryKey: query.resolvedOptions.queryKey,
              meta,
            }),
          );
          if (query.isCancelled || signal.aborted) {
            return;
          }

          let newData: TData;
          if (isDevelopment) {
            try {
              newData = replaceData(query.state.data(), result, query.resolvedOptions) as TData;
            } catch (error) {
              console.error(
                `Structural sharing requires data to be JSON serializable. To fix this, turn off structuralSharing or return JSON-serializable data from your queryFn. [${queryHash}]: ${String(error)}`,
              );

              throw error;
            }
          } else {
            newData = replaceData(query.state.data(), result, query.resolvedOptions) as TData;
          }

          setQuerySuccessData(query, newData, Date.now(), false);
          didFetchSucceed = true;
          cache.config.onSuccess?.(newData, query as Query<any, any, any, any>);
          cache.config.onSettled?.(newData, null, query as Query<any, any, any, any>);
          cache.notify({ type: 'updated', query: query as Query<any, any, any, any> });
        } catch (err) {
          const isCancelledError = err instanceof CancelledError;

          if (!signal.aborted && !isCancelledError) {
            const error = (err instanceof Error ? err : new Error(String(err))) as TError;
            query.state.error(error);
            query.state.failureCount((prev) => prev + 1);
            query.state.failureReason(error);
            query.state.errorUpdatedAt(Date.now());
            query.state.errorUpdateCount((previous) => previous + 1);
            query.state.isInvalidated(query.state.data() !== undefined);
            query.staleDisposer();
            query.staleDisposer = () => {};
            query.state.isStale(true);
            // useQuery relies on synchronous throw via Proxy in useMemo.
            // When throwOnError comes from query defaults (isDefaultThrowOnError),
            // we only set status to 'error' and let useQuery throw synchronously.
            // When throwOnError is explicitly passed to refetch()/fetch() (direct API),
            // we also throw to reject the promise for backward compatibility.
            const isDefaultThrowOnError = throwOnError === query.resolvedOptions.throwOnError;
            if (shouldThrowError(throwOnError, [error])) {
              query.state.status('error');
              if (!isDefaultThrowOnError) {
                throw error;
              }
            }
            retryScheduled = query.scheduleRetry(retryAttempt + 1, error, fetchFn);
            cache.config.onError?.(error as unknown, query as Query<any, any, any, any>);
            cache.config.onSettled?.(
              query.state.data(),
              error as unknown,
              query as Query<any, any, any, any>,
            );
            cache.notify({ type: 'updated', query: query as Query<any, any, any, any> });
          } else if (isCancelledError) {
            query.state.error(err as unknown as TError);
            query.state.status('error');
            if (!err.silent) {
              cache.config.onSettled?.(
                query.state.data(),
                err as unknown,
                query as Query<any, any, any, any>,
              );
              cache.notify({ type: 'updated', query: query as Query<any, any, any, any> });
            }
          }
        } finally {
          if (query.fetchPromise === fetchPromise) {
            query.fetchPromise = undefined;
            query.revertState = undefined;

            const shouldSkipFinalize =
              !query.isCancelled && signal.aborted && query.state.fetchStatus() === 'fetching';
            if (!shouldSkipFinalize) {
              if (!retryScheduled) {
                query.isFetching = false;
                if (query.state.fetchStatus() !== 'paused') {
                  query.state.fetchStatus('idle');
                }
              }
              if (didFetchSucceed) scheduleQueryStale(query);
            }
          }
        }
      })();

      query.fetchPromise = fetchPromise;

      return fetchPromise;
    },
    scheduleRetry: (attempt: number, error: TError, fetchFn?: QueryFetchFn): boolean => {
      const { retry, retryDelay } = query.resolvedOptions;
      if (retry === false) {
        query.state.status('error');
        return false;
      }
      if (typeof retry === 'function' && !retry(attempt - 1, error as TError)) {
        query.state.status('error');
        return false;
      }
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
          async () => {
            await query.fetch({ retryAttempt: attempt, fetchFn, force: true });
          },
          { once: true },
        );
        return true;
      }
      if (retry === true || typeof retry === 'function' || (retry && attempt <= retry)) {
        const id = timeoutManager.setTimeout(async () => {
          query.retryDisposer = () => {};
          query.isFetching = false;
          query.fetchPromise = undefined;
          await query.fetch({ retryAttempt: attempt, fetchFn, force: true });
        }, delay ?? 0);
        query.retryDisposer = () => timeoutManager.clearTimeout(id);
        return true;
      }
      query.state.status('error');
      return false;
    },
  };

  useRoot((dispose) => {
    query.stateDisposer = dispose;

    const data = $(query.resolvedOptions.initialData as TData, { equals: false });
    const dataUpdateCount = $(0);
    const dataUpdatedAt = $(query.resolvedOptions.initialDataUpdatedAt ?? 0);
    const error = $<TError | null>(null, { equals: false });
    const errorUpdateCount = $(0);
    const errorUpdatedAt = $(0);
    const failureCount = $(0);
    const failureReason = $<TError | null>(null);
    const meta = $(null);
    const isInvalidated = $(false);
    const status = $<QueryStatus>(
      query.resolvedOptions.initialData !== undefined ? 'success' : 'pending',
    );
    const fetchStatus = $<FetchStatus>('idle');
    const isStale = $(query.resolvedOptions.initialData === undefined);

    query.state = {
      data,
      dataUpdateCount,
      dataUpdatedAt,
      error,
      errorUpdateCount,
      errorUpdatedAt,
      failureCount,
      failureReason,
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
      isError: useMemo((): boolean => error() !== null),
      isLoading: useMemo((): boolean => status() === 'pending' && fetchStatus() === 'fetching'),
      isLoadingError: useMemo((): boolean => error() !== null && dataUpdateCount() === 0),
      isRefetchError: useMemo((): boolean => error() !== null && dataUpdateCount() > 0),
      isPlaceholderData: useMemo(
        (): boolean => status() === 'pending' && !!query.resolvedOptions.placeholderData,
      ),
      isStale,
      isIdle: useMemo((): boolean => fetchStatus() === 'idle' && status() === 'pending'),
    } as QueryState<TData, TError>;
  });

  if (query.resolvedOptions.initialData !== undefined) {
    scheduleQueryStale(query);
  }

  return query;
};
