import { $$, untrack } from 'voby';
import { focusManager } from './focusManager.ts';
import type { Query } from './query.ts';
import type { QueryKey } from './types.ts';
import { timeoutManager, type ManagedTimerId } from './timeoutManager.ts';
import type { ObserverOptions, ResolvedObserverOptions } from './types.ts';
import { isValidTimeout, shallowEqualObjects, timeUntilStale } from './utils.ts';

export type QueryObserverResult = {
  [key: string]: unknown;
};

export class QueryObserver<
  TQueryFnData = unknown,
  TError = unknown,
  TData = TQueryFnData,
  TQueryKey extends QueryKey = QueryKey,
> {
  #query: Query<TQueryFnData, TError, TData, TQueryKey>;
  #resolvedOptions: ResolvedObserverOptions<TQueryFnData, TError, TData, TQueryKey>;
  #listeners: Set<(result: QueryObserverResult) => void> = new Set();
  #staleTimeoutId?: ManagedTimerId;
  #refetchIntervalId?: ManagedTimerId;
  #trackedProps: Set<string> = new Set();
  #lastValues?: Map<string, unknown>;
  constructor(
    query: Query<TQueryFnData, TError, TData, TQueryKey>,
    options: ObserverOptions<TQueryFnData, TError, TData, TQueryKey>,
  ) {
    this.#query = query;
    this.#resolvedOptions = this.#resolveOptions(options);
    this.#lastValues = new Map<string, unknown>();
    untrack(() => {
      for (const key of Object.keys(this.#query.state)) {
        this.#lastValues!.set(key, (this.#query.state as any)[key]());
      }
    });
  }

  get query(): Query<TQueryFnData, TError, TData, TQueryKey> {
    return this.#query;
  }

  get resolvedOptions(): ResolvedObserverOptions<TQueryFnData, TError, TData, TQueryKey> {
    return this.#resolvedOptions;
  }

  #resolveOptions(
    options: ObserverOptions<TQueryFnData, TError, TData, TQueryKey>,
  ): ResolvedObserverOptions<TQueryFnData, TError, TData, TQueryKey> {
    return {
      enabled: $$(options.enabled) ?? true,
      staleTime: options.staleTime ?? 0,
      refetchInterval: options.refetchInterval ?? false,
      refetchIntervalInBackground: options.refetchIntervalInBackground ?? false,
      refetchOnWindowFocus: options.refetchOnWindowFocus ?? true,
      refetchOnReconnect: options.refetchOnReconnect ?? true,
      refetchOnMount: options.refetchOnMount ?? true,
      retryOnMount: options.retryOnMount ?? true,
      throwOnError: options.throwOnError ?? false,
      select: options.select,
      queryFn: options.queryFn,
      structuralSharing: options.structuralSharing,
      placeholderData: options.placeholderData,
      notifyOnChangeProps: options.notifyOnChangeProps,
      subscribed: options.subscribed ?? false,
      suspense: options.suspense ?? false,
    };
  }

  subscribe(listener: (result: QueryObserverResult) => void): () => void {
    this.#listeners.add(listener);

    if (this.#listeners.size === 1) {
      this.#query.addObserver(this);

      const shouldFetchOnSubscribe = untrack(() => {
        if (!this.#resolvedOptions.enabled) return false;
        return this.shouldFetchOnMount();
      });

      this.#updateStaleTimeout();
      this.#updateRefetchInterval();

      if (shouldFetchOnSubscribe) {
        untrack(() => {
          void this.#refetchObserverQuery().catch(() => undefined);
        });
      } else {
        untrack(() => this.#notify());
      }
    }

    return () => {
      this.#listeners.delete(listener);

      if (this.#listeners.size === 0) {
        this.#query.removeObserver(this);
        this.#clearTimers();
      }
    };
  }

  #refetchObserverQuery(): Promise<void> {
    return this.#query.refetch({
      cancelRefetch: this.#query.resolvedOptions.cancelRefetch ?? true,
    });
  }

  // Upstream's #executeFetch: a plain fetch with no cancelRefetch, so an
  // in-flight fetch is deduped (returns the existing promise) instead of
  // being cancelled and restarted (upstream queryObserver.ts:335-352).
  #executeFetch(): Promise<void> {
    return this.#query.fetch();
  }

  refetch(options?: { cancelRefetch?: boolean }): Promise<void> {
    return this.#query.refetch({
      cancelRefetch: options?.cancelRefetch ?? true,
    });
  }

  #clearTimers(): void {
    if (this.#staleTimeoutId !== undefined) {
      timeoutManager.clearTimeout(this.#staleTimeoutId);
      this.#staleTimeoutId = undefined;
    }
    if (this.#refetchIntervalId !== undefined) {
      timeoutManager.clearInterval(this.#refetchIntervalId);
      this.#refetchIntervalId = undefined;
    }
  }

  #notify(): void {
    untrack(() => {
      const currentResult = this.getCurrentResult();

      const shouldNotifyListeners = this.#shouldNotifyListeners(currentResult);

      this.#lastValues = this.#snapshotValues(currentResult);

      if (shouldNotifyListeners) {
        for (const listener of this.#listeners) {
          listener(currentResult);
        }
      }
      if (this.#query.cache.hasListeners()) {
        this.#query.cache.notify({
          type: 'observerResultsUpdated',
          query: this.#query as any,
        });
      }
    });
  }

  trackResult(
    result: QueryObserverResult,
    onPropTracked?: (key: string) => void,
  ): QueryObserverResult {
    return new Proxy(result, {
      get: (target, key) => {
        this.trackProp(key as string);
        onPropTracked?.(key as string);
        if (key === 'promise') {
          this.trackProp('data');
        }
        return Reflect.get(target, key);
      },
    });
  }

  trackProp(key: string): void {
    this.#trackedProps.add(key);
  }

  #resultValue(result: QueryObserverResult, prop: string): unknown {
    const value = result[prop];
    if (prop in this.#query.state && typeof value === 'function') {
      return (value as () => unknown)();
    }
    return value;
  }

  #snapshotValues(result: QueryObserverResult): Map<string, unknown> {
    const values = new Map<string, unknown>();
    for (const key of Object.keys(result)) {
      values.set(key, this.#resultValue(result, key));
    }
    return values;
  }

  #shouldNotifyListeners(currentResult: QueryObserverResult): boolean {
    const notifyOnChangeProps = this.#resolvedOptions.notifyOnChangeProps;

    if (notifyOnChangeProps === 'all' || (!notifyOnChangeProps && this.#trackedProps.size === 0)) {
      return true;
    }

    const props =
      notifyOnChangeProps === 'tracked' || !notifyOnChangeProps
        ? this.#trackedProps
        : notifyOnChangeProps;
    const includedProps = new Set<string>(props);

    if (this.#resolvedOptions.throwOnError) {
      includedProps.add('error');
    }

    const lastValues = this.#lastValues!;
    return Array.from(includedProps).some((prop) => {
      const prev = lastValues.get(prop);
      const cur = this.#resultValue(currentResult, prop);
      return cur !== prev;
    });
  }

  #resolveStaleTime(
    staleTime:
      | number
      | 'static'
      | ((query: Query<TQueryFnData, TError, TData, TQueryKey>) => number | 'static')
      | undefined = this.#resolvedOptions.staleTime,
  ): number | 'static' {
    return typeof staleTime === 'function' ? staleTime(this.#query) : staleTime;
  }

  #updateStaleTimeout(): void {
    untrack(() => {
      if (this.#staleTimeoutId !== undefined) {
        timeoutManager.clearTimeout(this.#staleTimeoutId);
        this.#staleTimeoutId = undefined;
      }

      const staleTime = this.#resolveStaleTime();
      if (this.isStale() || !isValidTimeout(staleTime)) return;

      const time = timeUntilStale(this.#query.state.dataUpdatedAt(), staleTime as number);
      this.#staleTimeoutId = timeoutManager.setTimeout(() => {
        this.#staleTimeoutId = undefined;
        this.#notify();
      }, time + 1);
    });
  }

  #resolveRefetchInterval(
    interval:
      | number
      | false
      | ((query: Query<TQueryFnData, TError, TData, TQueryKey>) => number | false | undefined)
      | undefined = this.#resolvedOptions.refetchInterval,
  ): number | false {
    const resolved = typeof interval === 'function' ? interval(this.#query) : interval;
    return resolved ?? false;
  }

  #shouldLoadOnMount(): boolean {
    if (this.#query.state.data() !== undefined) return false;

    if (this.#query.state.status() === 'error') {
      const retryOnMount = this.#resolvedOptions.retryOnMount;
      const shouldRetryOnMount =
        typeof retryOnMount === 'function' ? retryOnMount(this.#query) : retryOnMount;

      return shouldRetryOnMount !== false;
    }

    return true;
  }

  #updateRefetchInterval(): void {
    untrack(() => {
      if (this.#refetchIntervalId !== undefined) {
        timeoutManager.clearInterval(this.#refetchIntervalId);
        this.#refetchIntervalId = undefined;
      }

      const interval = this.#resolveRefetchInterval();
      if (!interval) return;

      this.#refetchIntervalId = timeoutManager.setTimeout(() => {
        void this.#executeFetch();
        this.#refetchIntervalId = timeoutManager.setInterval(async () => {
          if (this.#resolvedOptions.refetchIntervalInBackground || focusManager.isFocused()) {
            await this.#executeFetch();
          }
        }, interval as number) as any;
      }, interval as number) as any;
    });
  }

  shouldFetchOnMount(): boolean {
    if (this.#shouldLoadOnMount()) return true;

    if (this.#query.state.data() === undefined) return false;

    return this.#shouldFetchOn(this.#resolvedOptions.refetchOnMount);
  }

  shouldFetchOnWindowFocus(): boolean {
    return this.#shouldFetchOn(this.#resolvedOptions.refetchOnWindowFocus);
  }

  shouldFetchOnReconnect(): boolean {
    return this.#shouldFetchOn(this.#resolvedOptions.refetchOnReconnect);
  }

  // Upstream's shouldFetchOn (queryObserver.ts:773-789): a function value is
  // resolved to a boolean and treated like the boolean — only 'always' is
  // unconditional, every other non-false value refetches only if stale. The
  // whole evaluation is gated on enabled !== false && staleTime !== 'static'
  // (the latter suppressing even 'always').
  #shouldFetchOn(
    field:
      | boolean
      | 'always'
      | ((query: Query<TQueryFnData, TError, TData, TQueryKey>) => boolean | 'always'),
  ): boolean {
    if (!this.#resolvedOptions.enabled) return false;
    if (this.#resolveStaleTime() === 'static') return false;

    const value = typeof field === 'function' ? field(this.#query) : field;

    return value === 'always' || (value !== false && this.isStale());
  }

  isEnabled(): boolean {
    return this.#resolvedOptions.enabled;
  }

  // Public resolver so the query can compute isStatic() per observer
  // (upstream query.ts:293-302).
  getResolvedStaleTime(): number | 'static' {
    return this.#resolveStaleTime();
  }

  isStale(): boolean {
    if (!this.#resolvedOptions.enabled) return false;
    const staleTime = this.#resolveStaleTime();
    return this.#query.isStaleByTime(staleTime);
  }

  onQueryUpdate(): void {
    this.#updateStaleTimeout();
    this.#notify();
  }

  isPlaceholderData(): boolean {
    return this.#query.state.isPending() && this.#resolvedOptions.placeholderData !== undefined;
  }

  getCurrentResult() {
    const query = this.#query;
    const state = query.state;
    const options = this.#resolvedOptions;

    const result = {
      ...state,
      isEnabled: options.enabled,
      isStale: this.isStale(),
      isPlaceholderData: this.isPlaceholderData(),
      refetch: query.refetch,
      cancel: query.cancel,
      promise: (): Promise<Awaited<TData>> => {
        const d = state.data();
        if (d !== undefined) return Promise.resolve(d as Awaited<TData>);
        return (query.fetchPromise ?? query.fetch()).then(() => state.data()! as Awaited<TData>);
      },
    };

    return result;
  }

  setOptions(options: ObserverOptions<TQueryFnData, TError, TData, TQueryKey>): void {
    const previousOptions = this.#resolvedOptions;

    // Capture previous resolved values before swapping options (upstream gate:
    // timers must only be re-armed when a relevant option actually changed).
    const previousStaleTime = untrack(() => this.#resolveStaleTime(previousOptions.staleTime));
    const previousRefetchInterval = untrack(() =>
      this.#resolveRefetchInterval(previousOptions.refetchInterval),
    );

    this.#resolvedOptions = this.#resolveOptions(options);

    if (!shallowEqualObjects(previousOptions, this.#resolvedOptions)) {
      this.#query.cache.notify({
        type: 'observerOptionsUpdated',
        query: this.#query as any,
        observer: this,
      });
    }

    const mounted = this.#listeners.size > 0;

    const shouldFetchOnOptionsUpdate = untrack(
      () =>
        mounted &&
        previousOptions.enabled === false &&
        (!this.#resolvedOptions.suspense || this.#query.state.status() !== 'error') &&
        this.#resolvedOptions.enabled !== false &&
        this.#query.isStaleByTime(this.#resolveStaleTime()) &&
        this.#query.state.fetchStatus() !== 'paused',
    );

    const enabledChanged = previousOptions.enabled !== this.#resolvedOptions.enabled;
    const staleTimeChanged = untrack(() => this.#resolveStaleTime()) !== previousStaleTime;
    const refetchIntervalChanged =
      untrack(() => this.#resolveRefetchInterval()) !== previousRefetchInterval;

    // Unmounted observers (and unchanged options) must not re-arm timers:
    // setOptions on a destroyed observer would otherwise keep the query
    // refetching forever after unmount (matches upstream's condition).
    if (mounted && (enabledChanged || staleTimeChanged)) {
      this.#updateStaleTimeout();
    }

    if (mounted && (enabledChanged || refetchIntervalChanged)) {
      this.#updateRefetchInterval();
    }

    if (shouldFetchOnOptionsUpdate) {
      untrack(() => {
        void this.#refetchObserverQuery().catch(() => undefined);
      });
    }

    this.#notify();
  }

  destroy(): void {
    this.#clearTimers();
    this.#listeners.clear();
  }
}
