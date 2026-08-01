import { isDevelopment, isProduction } from 'std-env';
import { $, $$, untrack, useMemo, useRoot } from 'voby';
import type {
  CancelOptions,
  FetchMeta,
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
import type { QueryObserver as QueryObserverType } from './queryObserver.ts';
import { ensureQueryFn, replaceData, resolveKey, shouldThrowError, skipToken } from './utils.ts';
import { createNetworkPause, type NetworkPause } from './retryer.ts';
import { timeoutManager } from './timeoutManager.ts';
import { createMachine, type MachineInstance } from './machines.ts';

export class CancelledError extends Error {
  revert: boolean;
  silent: boolean;

  constructor({ revert = false, silent = false }: CancelOptions = {}) {
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
  failureCount: number;
  failureReason: TError | null;
  fetchMeta: FetchMeta | null;
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
  throwOnError?: QueryOptions<any, any, any, any>['throwOnError'];
  force?: boolean;
  fetchFn?: QueryFetchFn;
  awaitChain?: boolean;
  meta?: FetchMeta;
};

type FetchState = 'idle' | 'fetching' | 'success' | 'error' | 'retrying' | 'cancelled' | 'paused';
type FetchEvent = 'FETCH' | 'SUCCESS' | 'FAIL' | 'RETRYING' | 'RETRY' | 'CANCEL' | 'PAUSE';

export type Query<
  TQueryFnData = unknown,
  TError = unknown,
  TData = TQueryFnData,
  TQueryKey extends QueryKey = QueryKey,
> = {
  queryHash: string;
  queryKey: unknown[];
  isActive: boolean;
  isStale: () => boolean;
  cache: QueryCache;
  meta: Record<string, unknown> | undefined;
  state: QueryState<TData, TError>;
  cancel: (options?: CancelOptions) => Promise<void>;
  destroy: () => void;
  fetch: (options?: QueryFetchOptions) => Promise<void>;
  refetch: (options?: QueryRefetchOptions) => Promise<void>;
  resolvedOptions: ResolvedQueryOptions<TQueryFnData, TError, TData>;
  instances: number;
  observers: Set<QueryObserverType<TQueryFnData, TError, TData, TQueryKey>>;
  addObserver: (observer: QueryObserverType<TQueryFnData, TError, TData, TQueryKey>) => void;
  removeObserver: (observer: QueryObserverType<TQueryFnData, TError, TData, TQueryKey>) => void;
  controller: AbortController;
  isFetching: boolean;
  fetchPromise?: Promise<void>;
  revertState?: QueryStateSnapshot<TData, TError>;
  destroyDisposer: () => void;
  stateDisposer: () => void;
  staleDisposer: () => void;
  retryDisposer: () => void;
  cancelReject?: (error: CancelledError) => void;
  abortSignalConsumed: boolean;
  isStaleByTime: (staleTime: number | 'static') => boolean;
  isDisabled: () => boolean;
  isStatic: () => boolean;
  addInstance: () => () => void;
  removeInstance: () => void;
  onOnline: () => void;
  onFocus: () => void;
  scheduleDestroy: () => void;
  reset: () => void;
  scheduleRetry: (
    retryAttempt: number,
    error: TError,
    fetchFn?: QueryFetchFn,
    awaitChain?: boolean,
    meta?: FetchMeta,
  ) => boolean;
  isCancelled: boolean;
  fetchMachine: MachineInstance<FetchState, FetchEvent>;
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
  failureCount: state.failureCount(),
  failureReason: state.failureReason(),
  fetchMeta: state.fetchMeta(),
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
  state.failureCount(snapshot.failureCount);
  state.failureReason(snapshot.failureReason);
  state.fetchMeta(snapshot.fetchMeta);
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
  const resolvedOptions = {
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

  if (resolvedOptions.refetchOnReconnect === undefined) {
    resolvedOptions.refetchOnReconnect = resolvedOptions.networkMode !== 'always';
  }

  return resolvedOptions;
};

export const resolveStaleTime = (query: Query<any, any, any, any>): number | 'static' => {
  const staleTime = query.resolvedOptions.staleTime ?? 0;
  return typeof staleTime === 'function' ? staleTime(query) : staleTime;
};

export const scheduleQueryStale = (query: Query<any, any, any, any>) => {
  query.staleDisposer();
  query.staleDisposer = () => {};

  // Compute current staleness
  let isStale: boolean;
  if (query.observers.size > 0) {
    isStale = Array.from(query.observers).some((observer) => observer.isStale());
  } else if (query.state.data() === undefined || query.state.isInvalidated()) {
    isStale = true;
  } else {
    const staleTime = resolveStaleTime(query);
    if (staleTime === 'static' || staleTime === Infinity) {
      isStale = false;
    } else if (staleTime <= 0) {
      isStale = true;
    } else {
      isStale = false;
    }
  }

  query.state.isStale(isStale);

  // Schedule future update if needed (when not permanently stale/not stale)
  if (query.observers.size > 0) {
    // With observers: use the minimum staleTime across all observers
    let minStaleTime: number | 'static' = 'static';
    for (const observer of query.observers) {
      const observerStaleTime = observer.resolvedOptions.staleTime;
      const resolved =
        typeof observerStaleTime === 'function' ? observerStaleTime(query) : observerStaleTime;
      if (resolved === 'static' || resolved === Infinity) continue;
      if (minStaleTime === 'static' || (typeof resolved === 'number' && resolved < minStaleTime)) {
        minStaleTime = resolved;
      }
    }
    if (minStaleTime !== 'static' && typeof minStaleTime === 'number' && minStaleTime > 0) {
      const id = timeoutManager.setTimeout(() => {
        query.state.isStale(true);
      }, minStaleTime);
      query.staleDisposer = () => timeoutManager.clearTimeout(id);
    }
  } else if (!isStale) {
    // Without observers: use query-level staleTime
    const staleTime = resolveStaleTime(query);
    if (staleTime !== 'static' && staleTime !== Infinity && staleTime > 0) {
      const id = timeoutManager.setTimeout(() => {
        query.state.isStale(true);
      }, staleTime);
      query.staleDisposer = () => timeoutManager.clearTimeout(id);
    }
  }
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
  query.state.failureCount(0);
  query.state.failureReason(null);
  query.state.isInvalidated(false);
  query.state.status('success');
  if (scheduleStale) scheduleQueryStale(query);
  for (const observer of query.observers) {
    observer.onQueryUpdate();
  }
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
  // Callers that await the whole retry chain (e.g. fetchQuery) register a
  // waiter here; the chain settles when the final attempt resolves/rejects
  // (flushed from the retry timer or the cancelled state).
  let chainWaiters: Array<{ resolve: () => void; reject: (error: unknown) => void }> = [];
  let retryScheduled = false;
  const resolveChain = () => {
    const waiters = chainWaiters;
    chainWaiters = [];
    waiters.forEach((waiter) => waiter.resolve());
  };
  const rejectChain = (error: unknown) => {
    const waiters = chainWaiters;
    chainWaiters = [];
    waiters.forEach((waiter) => waiter.reject(error));
  };

  let networkPause!: NetworkPause;
  let pausedController: AbortController | undefined;
  let initialState: QueryStateSnapshot<TData, TError> | undefined;

  const query: Query<TQueryFnData, TError, TData, TQueryKey> = {
    queryHash,
    queryKey: resolvedOptions.queryKey,
    isActive: false,
    isStale: () => {
      if (query.observers.size > 0) {
        return Array.from(query.observers).some((observer) => observer.isStale());
      }

      return query.state.data() === undefined || query.state.isInvalidated();
    },
    cache,
    get meta() {
      return query.resolvedOptions.meta;
    },
    resolvedOptions,
    instances: 0,
    observers: new Set(),
    addObserver: (observer) => {
      if (query.observers.has(observer)) return;
      query.observers.add(observer);
      if (query.observers.size === 1) {
        query.destroyDisposer();
      }
      if (!query.isActive) {
        query.isActive = true;
      }
      cache.notify({ type: 'observerAdded', query: query as Query<any, any, any, any>, observer });
    },
    removeObserver: (observer) => {
      if (!query.observers.has(observer)) return;
      query.observers.delete(observer);
      if (query.observers.size === 0) {
        const isInitialPausedFetch =
          query.fetchMachine.getState() === 'paused' && query.state.status() === 'pending';
        if (query.abortSignalConsumed || isInitialPausedFetch) {
          void query.cancel({ revert: true });
        } else {
          query.retryDisposer();
          query.retryDisposer = () => {};
          retryScheduled = false;
        }
        query.isActive = false;
        query.scheduleDestroy();
      }
      cache.notify({
        type: 'observerRemoved',
        query: query as Query<any, any, any, any>,
        observer,
      });
    },
    state: undefined as any,
    controller: new AbortController(),
    isCancelled: false,
    destroyDisposer: () => {},
    stateDisposer: () => {},
    staleDisposer: () => {},
    retryDisposer: () => {},
    cancelReject: undefined,
    abortSignalConsumed: false,
    fetchPromise: undefined,
    revertState: undefined,
    fetchMachine: undefined as any,
    isStaleByTime: (staleTime) => {
      if (query.state.data() === undefined) return true;
      if (staleTime === 'static') return false;
      if (query.state.isInvalidated()) return true;
      return Date.now() - query.state.dataUpdatedAt() >= staleTime;
    },
    // Upstream query.ts:281-302 — used by refetchQueries / invalidate-refetch.
    isDisabled: () => {
      const observers = Array.from(query.observers);
      if (observers.length > 0) {
        return !observers.some((observer) => observer.isEnabled());
      }
      // No observers: disabled if the query never fetched or uses skipToken.
      return (
        (query.resolvedOptions.queryFn as unknown) === skipToken ||
        query.state.dataUpdateCount() + query.state.errorUpdateCount() === 0
      );
    },
    isStatic: () => {
      if (query.observers.size > 0) {
        return Array.from(query.observers).some(
          (observer) => observer.getResolvedStaleTime() === 'static',
        );
      }
      return false;
    },
    addInstance: () => {
      query.destroyDisposer();
      query.isActive = true;
      query.instances++;
      return query.removeInstance;
    },
    removeInstance: () => {
      query.instances--;
      if (query.instances === 0) {
        query.isActive = false;
        query.scheduleDestroy();
      }
    },
    onOnline: () => {
      const observer = [...query.observers].find((o) => o.shouldFetchOnReconnect());
      if (observer) {
        observer.refetch({ cancelRefetch: false });
      }
      networkPause.continue();
    },
    onFocus: () => {
      const observer = [...query.observers].find((o) => o.shouldFetchOnWindowFocus());
      if (observer) {
        observer.refetch({ cancelRefetch: false });
      }
      networkPause.continue();
    },
    cancel: async ({ revert = false, silent = false } = {}) => {
      const currentState = query.fetchMachine.getState();
      if (currentState !== 'fetching' && currentState !== 'retrying' && currentState !== 'paused') {
        return;
      }

      const cancellationError = new CancelledError({ revert, silent });

      query.isCancelled = true;
      query.cancelReject?.(cancellationError);
      query.cancelReject = undefined;
      networkPause.cancel();
      query.controller.abort();
      query.retryDisposer();
      query.retryDisposer = () => {};
      retryScheduled = false;

      if (revert && query.revertState) {
        restoreQueryStateSnapshot(query.state, query.revertState);
      }

      query.fetchMachine.send('CANCEL');
    },
    reset: () => {
      void query.cancel({ revert: false, silent: true });
      query.staleDisposer();
      query.staleDisposer = () => {};
      query.isCancelled = false;

      if (initialState) {
        restoreQueryStateSnapshot(query.state, initialState);
        untrack(() => scheduleQueryStale(query));
      }
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
      awaitChain = false,
      meta,
    } = {}) => {
      const currentState = query.fetchMachine.getState();

      if (currentState === 'fetching') {
        return query.fetchPromise;
      }
      if (currentState === 'paused') {
        return query.fetchPromise;
      }
      if (currentState === 'retrying') {
        if (retryAttempt === 0 && retryScheduled) {
          return new Promise<void>((resolve, reject) => {
            chainWaiters.push({ resolve, reject });
          });
        }
        query.fetchMachine.send('RETRY');
      } else if (force) {
        query.state.failureCount(0);
        query.state.failureReason(null);
        query.fetchMachine.send('FETCH', true);
        cache.notify({
          type: 'updated',
          query: query as Query<any, any, any, any>,
          action: { type: 'fetch' },
        });
      } else {
        if (!query.fetchMachine.can('FETCH')) return;
        query.state.failureCount(0);
        query.state.failureReason(null);
        query.fetchMachine.send('FETCH');
        cache.notify({
          type: 'updated',
          query: query as Query<any, any, any, any>,
          action: { type: 'fetch' },
        });
      }

      query.state.fetchMeta(meta ?? null);

      // Use the queryFn of the first observer with one if the query itself
      // has none (e.g. the query was created via setQueryData or hydration)
      if (fetchFn === undefined && query.resolvedOptions.queryFn === undefined) {
        const observer = Array.from(query.observers).find((o) => o.resolvedOptions.queryFn);
        if (observer) {
          query.resolvedOptions = {
            ...query.resolvedOptions,
            queryFn: observer.resolvedOptions.queryFn,
          } as ResolvedQueryOptions<TQueryFnData, TError, TData>;
        }
      }

      const signal = query.controller.signal;
      let fetchPromise!: Promise<void>;
      let cancellationError: CancelledError | undefined;
      const cancellationPromise = new Promise<never>((_, reject) => {
        query.cancelReject = (error) => {
          cancellationError = error;
          reject(error);
        };
      });

      const handleCancelled = (error: CancelledError): Promise<void> | void => {
        if (error.silent) {
          const nextFetch = query.fetchPromise;
          if (nextFetch && nextFetch !== fetchPromise) return nextFetch;
          return;
        }

        if (error.revert) {
          if (query.state.data() === undefined) throw error;
          return;
        }

        query.state.error(error as unknown as TError);
        query.state.errorUpdatedAt(Date.now());
        query.state.errorUpdateCount((previous) => previous + 1);
        query.state.failureCount((previous) => previous + 1);
        query.state.failureReason(error as unknown as TError);
        query.state.isInvalidated(query.state.data() !== undefined);
        query.state.status('error');
        query.staleDisposer();
        query.staleDisposer = () => {};
        query.state.isStale(true);
        for (const observer of query.observers) {
          observer.onQueryUpdate();
        }
        cache.config.onError?.(error, query as Query<any, any, any, any>);
        cache.config.onSettled?.(query.state.data(), error, query as Query<any, any, any, any>);
        cache.notify({
          type: 'updated',
          query: query as Query<any, any, any, any>,
          action: { type: 'error', error },
        });
        throw error;
      };

      fetchPromise = (async () => {
        try {
          const pause = networkPause.wait(retryAttempt > 0);
          if (pause) await Promise.race([pause, cancellationPromise]);
          if (cancellationError) throw cancellationError;
          if (signal.aborted) return;

          const meta = query.meta;
          query.abortSignalConsumed = false;
          const queryResult = untrack(() =>
            (fetchFn ?? ensureQueryFn(query.resolvedOptions))({
              get signal() {
                query.abortSignalConsumed = true;
                return signal;
              },
              queryKey: query.resolvedOptions.queryKey,
              meta,
            }),
          );
          let result: unknown;
          if (
            queryResult !== null &&
            (typeof queryResult === 'object' || typeof queryResult === 'function') &&
            typeof (queryResult as PromiseLike<unknown>).then === 'function'
          ) {
            result = await Promise.race([queryResult, cancellationPromise]);
          } else {
            result = await queryResult;
          }
          if (cancellationError) throw cancellationError;
          if (signal.aborted) return;

          if (result === undefined) {
            if (!isProduction) {
              console.error(
                `Query data cannot be undefined. Please make sure to return a value other than undefined from your query function. Affected query key: ${queryHash}`,
              );
            }
            throw new Error(`${queryHash} data is undefined`);
          }

          const resultData: unknown = result;
          let newData: TData;
          if (isDevelopment) {
            try {
              newData = replaceData(query.state.data(), resultData, query.resolvedOptions) as TData;
            } catch (error) {
              console.error(
                `Structural sharing requires data to be JSON serializable. To fix this, turn off structuralSharing or return JSON-serializable data from your queryFn. [${queryHash}]: ${String(error)}`,
              );
              throw error;
            }
          } else {
            newData = replaceData(query.state.data(), resultData, query.resolvedOptions) as TData;
          }

          setQuerySuccessData(query, newData, Date.now(), true);
          query.fetchMachine.send('SUCCESS');
          cache.config.onSuccess?.(newData, query as Query<any, any, any, any>);
          cache.config.onSettled?.(newData, null, query as Query<any, any, any, any>);
          cache.notify({
            type: 'updated',
            query: query as Query<any, any, any, any>,
            action: { type: 'success', data: newData },
          });
        } catch (err) {
          const isCancelledError = err instanceof CancelledError;
          if (isCancelledError) {
            return handleCancelled(err);
          }

          if (query.fetchMachine.getState() !== 'fetching' || signal.aborted) return;

          {
            const error = (err instanceof Error ? err : new Error(String(err))) as TError;
            query.state.failureCount((prev) => prev + 1);
            query.state.failureReason(error);

            const willRetry = query.scheduleRetry(
              retryAttempt + 1,
              error,
              fetchFn,
              awaitChain,
              meta,
            );
            query.fetchMachine.send(willRetry ? 'RETRYING' : 'FAIL');

            if (!willRetry) {
              query.state.error(error);
              query.state.errorUpdatedAt(Date.now());
              query.state.errorUpdateCount((previous) => previous + 1);
              query.state.isInvalidated(true);
              query.staleDisposer();
              query.staleDisposer = () => {};
              query.state.isStale(true);
              for (const observer of query.observers) {
                observer.onQueryUpdate();
              }
              const isDefaultThrowOnError = throwOnError === query.resolvedOptions.throwOnError;
              if (shouldThrowError(throwOnError, [error, query])) {
                query.state.status('error');
                if (!isDefaultThrowOnError) {
                  throw error;
                }
              }
              cache.config.onError?.(error as unknown, query as Query<any, any, any, any>);
              cache.config.onSettled?.(
                query.state.data(),
                error as unknown,
                query as Query<any, any, any, any>,
              );
              // the retry chain is done — release any callers awaiting it
              resolveChain();
            } else if (awaitChain) {
              // Keep the fetch promise pending until the whole retry chain
              // settles (flush happens in scheduleRetry / on cancel)
              try {
                await Promise.race([
                  new Promise<void>((resolve, reject) => {
                    chainWaiters.push({ resolve, reject });
                  }),
                  cancellationPromise,
                ]);
              } catch (retryError) {
                if (retryError instanceof CancelledError) {
                  return handleCancelled(retryError);
                }
                throw retryError;
              }
            }

            const action = willRetry
              ? {
                  type: 'failed' as const,
                  failureCount: query.state.failureCount(),
                  error,
                }
              : { type: 'error' as const, error };
            cache.notify({
              type: 'updated',
              query: query as Query<any, any, any, any>,
              action,
            });
          }
        } finally {
          if (query.fetchPromise === fetchPromise) {
            query.fetchPromise = undefined;
            query.revertState = undefined;
            query.cancelReject = undefined;
          }
        }
      })();

      query.fetchPromise = fetchPromise;
      return fetchPromise;
    },
    scheduleRetry: (
      attempt: number,
      error: TError,
      fetchFn?: QueryFetchFn,
      awaitChain?: boolean,
      meta?: FetchMeta,
    ): boolean => {
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
        typeof retryDelay === 'function' ? retryDelay(attempt - 1, error as TError) : retryDelay;
      if (retry === true || typeof retry === 'function' || (retry && attempt <= retry)) {
        retryScheduled = true;
        const id = timeoutManager.setTimeout(async () => {
          retryScheduled = false;
          query.retryDisposer = () => {};
          try {
            await query.fetch({
              retryAttempt: attempt,
              fetchFn,
              force: true,
              awaitChain,
              meta,
            });
            if (!retryScheduled) resolveChain();
          } catch (error) {
            rejectChain(error);
          }
        }, delay ?? 0);
        query.retryDisposer = () => {
          retryScheduled = false;
          timeoutManager.clearTimeout(id);
        };
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
    const dataUpdatedAt = $(
      query.resolvedOptions.initialData !== undefined
        ? (query.resolvedOptions.initialDataUpdatedAt ?? Date.now())
        : 0,
    );
    const error = $<TError | null>(null, { equals: false });
    const errorUpdateCount = $(0);
    const errorUpdatedAt = $(0);
    const failureCount = $(0);
    const failureReason = $<TError | null>(null);
    const fetchMeta = $<FetchMeta | null>(null);
    const isInvalidated = $(false);
    const status = $<QueryStatus>(
      query.resolvedOptions.initialData !== undefined ? 'success' : 'pending',
    );
    const fetchStatus = $<FetchStatus>('idle');
    const isStale = $(query.resolvedOptions.initialData === undefined);

    const fetchMachine = createMachine<FetchState, FetchEvent>({
      initial: 'idle',
      states: {
        idle: {
          onEnter: () => {
            fetchStatus('idle');
            query.isFetching = false;
            query.fetchPromise = undefined;
            query.revertState = undefined;
          },
          transitions: {
            FETCH: {
              target: 'fetching',
              guard: () => query.resolvedOptions.enabled && query.isActive,
            },
          },
        },
        fetching: {
          onEnter: () => {
            fetchStatus('fetching');
            query.isFetching = true;
            query.isCancelled = false;
            query.controller = new AbortController();
            query.revertState = createQueryStateSnapshot(query.state);
          },
          onLeave: () => {
            query.fetchPromise = undefined;
          },
          transitions: {
            SUCCESS: { target: 'success' },
            FAIL: { target: 'error' },
            RETRYING: { target: 'retrying' },
            PAUSE: { target: 'paused' },
            CANCEL: { target: 'cancelled' },
          },
        },
        retrying: {
          onEnter: () => {
            fetchStatus('fetching');
            query.isFetching = true;
          },
          onLeave: () => {
            query.fetchPromise = undefined;
          },
          transitions: {
            RETRY: { target: 'fetching' },
            CANCEL: { target: 'cancelled' },
          },
        },
        paused: {
          onEnter: () => {
            fetchStatus('paused');
            query.isFetching = false;
          },
          onLeave: () => {
            query.fetchPromise = undefined;
          },
          transitions: {
            FETCH: { target: 'fetching' },
            CANCEL: { target: 'cancelled' },
          },
        },
        success: {
          onEnter: () => {
            fetchStatus('idle');
            query.isFetching = false;
            query.revertState = undefined;
          },
          transitions: {
            FETCH: {
              target: 'fetching',
              guard: () => query.resolvedOptions.enabled && query.isActive,
            },
          },
        },
        error: {
          onEnter: () => {
            fetchStatus('idle');
            query.isFetching = false;
            query.revertState = undefined;
          },
          transitions: {
            FETCH: {
              target: 'fetching',
              guard: () => query.resolvedOptions.enabled && query.isActive,
            },
          },
        },
        cancelled: {
          onEnter: () => {
            fetchStatus('idle');
            query.isFetching = false;
            query.fetchPromise = undefined;
            query.revertState = undefined;
            resolveChain();
          },
          transitions: {
            FETCH: {
              target: 'fetching',
              guard: () => query.resolvedOptions.enabled && query.isActive,
            },
            PAUSE: { target: 'paused' },
          },
        },
      },
    });

    query.fetchMachine = fetchMachine;

    networkPause = createNetworkPause(
      () => query.resolvedOptions.networkMode,
      () => {
        if (query.fetchMachine.getState() === 'fetching') {
          pausedController = query.controller;
          query.fetchMachine.send('PAUSE');
          cache.notify({
            type: 'updated',
            query: query as Query<any, any, any, any>,
            action: { type: 'pause' },
          });
        }
      },
      () => {
        if (query.fetchMachine.getState() !== 'paused') return;
        const pendingFetch = query.fetchPromise;
        query.fetchMachine.send('FETCH', true);
        if (pausedController) {
          query.controller = pausedController;
          pausedController = undefined;
        }
        if (query.fetchPromise === undefined && pendingFetch !== undefined) {
          query.fetchPromise = pendingFetch;
        }
        cache.notify({
          type: 'updated',
          query: query as Query<any, any, any, any>,
          action: { type: 'continue' },
        });
      },
    );

    query.state = {
      data,
      dataUpdateCount,
      dataUpdatedAt,
      error,
      errorUpdateCount,
      errorUpdatedAt,
      failureCount,
      failureReason,
      fetchMeta,
      isInvalidated,
      status,
      fetchStatus,
      isFetching: useMemo((): boolean => fetchStatus() === 'fetching'),
      isRefetching: useMemo((): boolean => fetchStatus() === 'fetching' && status() !== 'pending'),
      isFetched: useMemo((): boolean => dataUpdateCount() > 0 || errorUpdateCount() > 0),
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
      isInitialLoading: useMemo(
        (): boolean => status() === 'pending' && fetchStatus() === 'fetching',
      ),
      isEnabled: useMemo((): boolean => query.resolvedOptions.enabled),
    } as QueryState<TData, TError>;
  });

  if (query.resolvedOptions.initialData !== undefined) {
    untrack(() => scheduleQueryStale(query));
  }

  initialState = untrack(() => createQueryStateSnapshot(query.state));

  return query;
};
